"""CARGOX intelligence modules exposed as first-class API resources."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import db
from ..algorithms import compat, dispatch, forecast, planning, readiness, recovery, valueclock
from ..core.security import Principal, admin_only, any_role
from ..services.common import NOW, audit, uid

router = APIRouter(prefix="/api", tags=["intelligence"])


def _safe_q(query: str, params: tuple[Any, ...] | list[Any] | None = None) -> list[dict]:
    try:
        return db.q(query, params)
    except Exception:
        return []


def _safe_one(query: str, params: tuple[Any, ...] | list[Any] | None = None) -> dict | None:
    try:
        return db.one(query, params)
    except Exception:
        return None


def _safe_scalar(query: str, params: tuple[Any, ...] | list[Any] | None = None, default: Any = 0) -> Any:
    try:
        return db.scalar(query, params, default=default)
    except Exception:
        return default


# --------------------------------------------------------------------------- #
# HarvestPulse
# --------------------------------------------------------------------------- #
@router.get("/forecasts/harvestpulse")
def harvestpulse(cluster_id: str | None = Query(None), horizon_days: int = Query(21, ge=7, le=45),
                 principal: Principal = Depends(admin_only)):
    clusters = _safe_q("select distinct cluster_id from villages where cluster_id is not null")
    db_forecasts = _safe_q("select * from harvest_forecasts order by forecast_date")
    out = []
    for c in clusters:
        cid = c.get("cluster_id")
        if not cid or (cluster_id and cid != cluster_id):
            continue
        history = [{"date": f["forecast_date"], "kg": f["p50_kg"]} for f in db_forecasts if f.get("cluster_id") == cid]
        matched = [f for f in db_forecasts if f.get("cluster_id") == cid]
        crop = (matched[0].get("crop_id") if matched else None) or "wheat"
        acres = max(60.0, sum(float(h.get("kg") or 0) for h in history) / 380) if history else 200
        try:
            result = forecast.forecast(
                cluster_id=cid,
                crop=crop,
                area_acre=acres,
                horizon_days=horizon_days,
                history=history or None,
            )
            demand = float((result.get("totals") or {}).get("p50_kg") or 0)
        except Exception:
            demand = 0.0
            result = {"cluster_id": cid, "crop": crop, "totals": {"p50_kg": demand}}
        commit = float(_safe_scalar(
            """select coalesce(sum(cb.block_size_kg),0) from capacity_blocks cb
               join vehicles v on v.id = cb.vehicle_id
               join profiles p on p.id = v.transporter_id
               where cb.status in ('published','reserved') and lower(cb.corridor) like ?""",
            (f"%{str(cid).lower().replace('c-', '')}%",),
            0,
        ) or 0)
        result["committed_capacity_kg"] = commit
        result["coverage_ratio"] = round(commit / demand, 2) if demand else 0.0
        result["gap_kg"] = max(0.0, round(demand - commit, 1))
        out.append(result)
    return {
        "clusters": out,
        "method_note": "Layer A phenology + Layer B selling-lag priors + Layer C aggregation. "
                        "Seasonal-naive baseline included so error can be measured honestly.",
        "synthetic": True,
    }


@router.get("/forecasts/clusters")
def clusters():
    rows = _safe_q("""select v.cluster_id, count(*) as villages, min(v.name) as example,
                          string_agg(distinct v.district, ', ') as districts
                   from villages v where v.cluster_id is not null group by v.cluster_id""")
    if not rows:
        rows = _safe_q("""select v.cluster_id, count(*) as villages, min(v.name) as example,
                             group_concat(distinct v.district) as districts
                      from villages v where v.cluster_id is not null group by v.cluster_id""")
    return {"items": rows}


# --------------------------------------------------------------------------- #
# DispatchSense
# --------------------------------------------------------------------------- #
class DispatchPreview(BaseModel):
    pool_kg: float
    capacity_kg: float
    expected_arrival_kg: float = 0
    commodity: str = "wheat"
    value_per_kg: float = 22.75
    ready_ratio: float = 1.0
    hours_to_deadline: float | None = 8
    urgency: float = 0.5
    wait_step_minutes: int = 30


@router.post("/dispatch/preview")
def dispatch_preview(body: DispatchPreview, principal: Principal = Depends(any_role)):
    return dispatch.decide(
        pool_kg=body.pool_kg, capacity_kg=body.capacity_kg,
        expected_arrival_kg=body.expected_arrival_kg, commodity=body.commodity,
        value_per_kg=body.value_per_kg, ready_ratio=body.ready_ratio,
        hours_to_deadline=body.hours_to_deadline, urgency=body.urgency,
        wait_step_minutes=body.wait_step_minutes,
    )


@router.get("/dispatch/history")
def dispatch_history(principal: Principal = Depends(admin_only)):
    rows = _safe_q("""select d.*, sp.corridor from dispatch_decisions d
                        left join shipment_pools sp on sp.id = d.pool_id
                        order by d.created_at desc limit 50""")
    return {"items": rows,
            "note": "Every recommendation stores the benefit, the delay cost and the reason used."}


# --------------------------------------------------------------------------- #
# ReadySync
# --------------------------------------------------------------------------- #
@router.get("/readysync/board")
def readysync_board(principal: Principal = Depends(admin_only)):
    rows = _safe_q("""select t.id as trip_id, t.trip_code, t.status as trip_status, t.created_at,
                           v.reg_no, p.full_name as transporter_name
                    from trips t left join vehicles v on v.id = t.vehicle_id
                    left join transport_assignments ta on ta.id = t.assignment_id
                    left join profiles p on p.id = ta.transporter_id
                    where t.status in ('planned','loading') order by t.created_at desc""")
    for t in rows:
        ships = _safe_q("""select s.id, s.code, s.ready_from, s.status,
                                (select ready_check from transport_assignments ta2 where ta2.id =
                                   (select assignment_id from trips where id = ?)) as ready_check
                         from shipments s join trip_shipments ts on ts.shipment_id = s.id where ts.trip_id = ?""",
                      (t["trip_id"], t["trip_id"]))
        t["shipments"] = ships
        departure = max([s["ready_from"] for s in ships if s.get("ready_from")] or [None], default=None)
        try:
            t["checkpoint"] = readiness.checkpoint_state(departure)
        except Exception:
            t["checkpoint"] = None
        try:
            t["verdict"] = readiness.readiness_verdict(ships)
        except Exception:
            t["verdict"] = "pending"
    return {"items": rows,
            "checkpoints": ["T-60", "T-45"],
            "policy_note": "Unready loads move to the next wave instead of holding every co-shipper."}


# --------------------------------------------------------------------------- #
# GramTwin-2E + hubs + road access
# --------------------------------------------------------------------------- #
@router.get("/hubs")
def list_hubs(principal: Principal = Depends(any_role)):
    hubs = _safe_q("select * from hubs")
    villages = _safe_q("select * from villages")
    try:
        choice = planning.select_hubs(villages, hubs, k=2, radius_km=14) if hubs else {"hubs": [], "assignments": []}
    except Exception:
        choice = {"hubs": hubs[:2], "assignments": []}
    return {
        "items": hubs,
        "selection": choice,
        "note": "Constrained k-median over the village graph; safety verification is required.",
    }


@router.get("/routes/road-access")
def road_access(vehicle_class: str = "truck", monsoon: bool = False,
                principal: Principal = Depends(any_role)):
    edges = _safe_q("select * from road_edges")
    try:
        return planning.road_access_check(edges, vehicle_class, monsoon)
    except Exception:
        return {"vehicle_class": vehicle_class, "monsoon": monsoon, "edges": edges, "blocked_edges": []}


@router.post("/routes/generate")
def generate_routes(payload: dict, principal: Principal = Depends(admin_only)):
    villages = _safe_q("select * from villages")
    hubs = _safe_q("select * from hubs")
    mandis = _safe_q("select * from mandis")

    dest = None
    dest_id = payload.get("destination_id") or "M-KHN"
    for m in mandis:
        if str(m.get("id")) == str(dest_id):
            dest = m
            break
    if not dest and mandis:
        dest = mandis[0]
    if not dest:
        dest = {"id": dest_id, "name": "Khanna Mandi", "lat": 30.704, "lng": 76.223}

    stop_ids = payload.get("village_ids") or [v.get("id") for v in villages[:5] if v.get("id")]
    village_by_id = {str(v.get("id")): v for v in villages if v.get("id") is not None}
    stops = []
    for vid in stop_ids:
        v = village_by_id.get(str(vid)) or _safe_one("select * from villages where id = ?", (vid,))
        if v and v.get("lat") is not None and v.get("lng") is not None:
            stops.append({
                "id": v.get("id"),
                "name": v.get("name"),
                "lat": float(v["lat"]),
                "lng": float(v["lng"]),
                "demand_kg": float(payload.get("demand_kg", 1800)),
                "ready_min": 0,
                "deadline_min": 480,
            })

    vehicles = [
        {"id": "VEH-01", "class": "tractor_trolley", "capacity_kg": 2500, "cost_per_km": 24},
        {"id": "VEH-03", "class": "lcv", "capacity_kg": 7500, "cost_per_km": 32},
    ]
    depot_lat = float(dest.get("lat") if dest.get("lat") is not None else 30.704)
    depot_lng = float(dest.get("lng") if dest.get("lng") is not None else 76.223)

    try:
        plan = planning.plan_routes(depot=(depot_lat, depot_lng), stops=stops, vehicles=vehicles)
    except Exception:
        plan = {"routes": [], "unassigned": stops}

    try:
        hub_choice = planning.select_hubs(villages, hubs, k=1) if hubs else {"hubs": [], "assignments": []}
    except Exception:
        hub_choice = {"hubs": hubs[:1], "assignments": []}

    selected_hub = hub_choice["hubs"][0] if hub_choice.get("hubs") else (hubs[0] if hubs else None)
    try:
        two_echelon = planning.build_two_echelon(
            pickups=stops,
            hub=selected_hub,
            line_haul_vehicle=vehicles[1],
            first_mile_vehicle=vehicles[0],
            destination=dest,
        )
    except Exception:
        two_echelon = {"hub": selected_hub, "first_mile": [], "line_haul": [], "destination": dest}

    return {"single_echelon": plan, "two_echelon": two_echelon, "hub_choice": hub_choice}


# --------------------------------------------------------------------------- #
# ValueClock
# --------------------------------------------------------------------------- #
class ValueClockIn(BaseModel):
    commodity: str
    quantity_kg: float
    origin_lat: float
    origin_lng: float
    freight_share: float = 0
    vehicle_class: str = "lcv"
    destination_ids: list[str] = Field(default_factory=list)


@router.post("/valueclock/compare")
def valueclock_compare(body: ValueClockIn, principal: Principal = Depends(any_role)):
    mandis = _safe_q("select * from mandis") if not body.destination_ids else \
        _safe_q(f"select * from mandis where id in ({','.join('?'*len(body.destination_ids))})", body.destination_ids)
    options = []
    for m in mandis:
        price = _safe_one("select price_mode from market_observations where commodity_id = ? and mandi_id = ? "
                         "order by obs_date desc limit 1", (body.commodity, m["id"]))
        mq = _safe_one("select queue_minutes from mandi_queues where mandi_id = ? order by observed_at desc limit 1", (m["id"],))
        options.append({"id": m["id"], "name": m["name"], "lat": m.get("lat"), "lng": m.get("lng"),
                        "price_per_quintal": price.get("price_mode") if price else None,
                        "queue_minutes": mq.get("queue_minutes") if mq else m.get("queue_minutes"),
                        "confidence": 0.62 if price else 0.3})
    return valueclock.evaluate_destinations(
        commodity=body.commodity, quantity_kg=body.quantity_kg,
        origin=(body.origin_lat, body.origin_lng), destinations=options,
        freight_share=body.freight_share, vehicle_class=body.vehicle_class,
    )


@router.get("/valueclock/retention")
def retention_curve(commodity: str = "potato", principal: Principal = Depends(any_role)):
    return {"commodity": commodity,
            "curve": [{"hours": h, "retention": valueclock.retention(commodity, h)} for h in range(0, 73, 6)],
            "note": "Published-handling-style lookup. A proxy for urgency, not a spoilage prediction."}


# --------------------------------------------------------------------------- #
# AgroCompat
# --------------------------------------------------------------------------- #
@router.post("/agrocompat/check")
def agrocompat(payload: dict, principal: Principal = Depends(any_role)):
    commodities = payload.get("commodities") or []
    if len(commodities) < 2:
        raise HTTPException(400, "Provide at least two commodities")
    return compat.check_set(commodities)


@router.post("/agrocompat/matrix")
@router.get("/agrocompat/matrix")
def agrocompat_matrix(payload: dict | None = None, commodities: str | None = Query(None),
                      principal: Principal = Depends(any_role)):
    payload = payload or {}
    if commodities:
        payload = {**payload, "commodities": [c.strip() for c in commodities.split(",") if c.strip()]}
    items = payload.get("commodities") or ["wheat", "paddy", "potato", "onion", "tomato", "fertiliser"]
    matrix = []
    for a in items:
        row = []
        for b in items:
            r = compat.check(a, b)
            row.append({"pair": [a, b], "compatible": r["compatible"], "score": r["score"]})
        matrix.append({"commodity": a, "cells": row})
    return {"commodities": items, "matrix": matrix}


# --------------------------------------------------------------------------- #
# ShadowFleet-Heal
# --------------------------------------------------------------------------- #
@router.get("/recovery/scenarios")
def recovery_scenarios(principal: Principal = Depends(admin_only)):
    trips = _safe_q("""select t.*, v.reg_no, v.vehicle_class, ta.transporter_id, ta.revenue
                       from trips t left join vehicles v on v.id = t.vehicle_id
                       left join transport_assignments ta on ta.id = t.assignment_id
                       where t.status in ('planned','loading','in_transit','at_hub','out_for_delivery')""")
    disruptions = _safe_q("select * from disruption_events order by detected_at desc limit 20")
    return {"trips_at_risk": trips, "recent_disruptions": disruptions,
            "plans": _safe_q("select * from recovery_plans order by created_at desc limit 20")}


class HealIn(BaseModel):
    trip_id: str | None = None
    disruption_id: str | None = None
    event_type: str = "breakdown"
    description: str | None = None


@router.post("/recovery/heal")
def run_heal(body: HealIn, principal: Principal = Depends(admin_only)):
    trip = _safe_one("select * from trips where id = ?", (body.trip_id,)) if body.trip_id else None
    affected, frozen = [], []
    if trip:
        ships = _safe_q("""select s.* from shipments s join trip_shipments ts on ts.shipment_id = s.id
                           where ts.trip_id = ?""", (trip["id"],))
        affected = [{"shipment_id": s["id"], "code": s["code"], "lat": s["pickup_lat"], "lng": s["pickup_lng"],
                     "demand_kg": s["quantity_kg"], "deadline_min": 300} for s in ships]
        others = _safe_q("""select s.id, s.code from shipments s join trip_shipments ts on ts.shipment_id = s.id
                            join trips t on t.id = ts.trip_id where t.id <> ? and t.status in
                            ('planned','loading','in_transit')""", (trip["id"],))
        frozen = [{"shipment_id": o["id"], "code": o["code"], "frozen": True} for o in others]
    if not affected:
        raise HTTPException(409, "Select a trip with active shipments to recover")

    standby = _safe_q("""select v.*, p.full_name as transporter from vehicles v
                         join profiles p on p.id = v.transporter_id
                         where v.availability in ('available','assigned') and v.id <> ?""",
                      (trip["vehicle_id"] if trip else "",))
    standby_vehicles = [{"id": v["id"], "class": v["vehicle_class"], "capacity_kg": v["payload_kg"],
                         "cost_per_km": v["cost_per_km"], "transporter_id": v["transporter_id"],
                         "transporter": v["transporter"], "lat": 30.84, "lng": 76.15} for v in standby]
    dest = {"name": "Khanna Mandi", "lat": 30.704, "lng": 76.223}
    result = recovery.heal(depot=(30.8421, 76.1520), affected=affected, frozen=frozen,
                           standby_vehicles=standby_vehicles, destination=dest)

    did = body.disruption_id or uid("DIS")
    if not body.disruption_id:
        db.insert("disruption_events", {"id": did, "trip_id": body.trip_id, "event_type": body.event_type,
                                        "description": body.description or "Reported via control tower",
                                        "reported_by": principal["id"], "detected_at": NOW(), "severity": "high"})
    pid = uid("REC")
    db.insert("recovery_plans", {
        "id": pid, "disruption_id": did,
        "status": "proposed" if result["status"] == "feasible" else result["status"],
        "strategy": "freeze_unaffected + relocate_affected + local_repair",
        "extra_cost": result["extra_cost"], "added_delay_min": str(result["added_delay_min"]),
        "affected_count": len(affected), "frozen_count": len(frozen),
        "solve_ms": result["solve_ms"], "alternatives": db.jdump(result["assignments"]),
        "approved_by": None, "created_at": NOW(),
    })
    audit(principal, "recovery.heal", entity_type="trip", entity_id=body.trip_id or "adhoc",
          after={"status": result["status"], "extra_cost": result["extra_cost"]})
    return {"recovery_id": pid, "disruption_id": did, **result}


@router.post("/recovery/{recovery_id}/approve")
def approve_recovery(recovery_id: str, principal: Principal = Depends(admin_only)):
    r = _safe_one("select * from recovery_plans where id = ?", (recovery_id,))
    if not r:
        raise HTTPException(404, "Recovery plan not found")
    db.execute("update recovery_plans set status = 'approved', approved_by = ? where id = ?",
               (principal["id"], recovery_id))
    audit(principal, "recovery.approve", entity_type="recovery_plan", entity_id=recovery_id)
    return {"status": "approved", "note": "Reassignment is applied only after this approval — no silent reassignment."}


# --------------------------------------------------------------------------- #
# CrossFlow-Backhaul
# --------------------------------------------------------------------------- #
@router.get("/backhaul/summary")
def backhaul_summary(principal: Principal = Depends(admin_only)):
    offers = _safe_q("""select r.*, p.full_name as transporter from return_load_offers r
                        join profiles p on p.id = r.transporter_id order by r.created_at desc""")
    return {
        "items": offers,
        "accepted": sum(1 for o in offers if o.get("status") == "accepted"),
        "extra_revenue": round(sum(float(o.get("revenue") or 0) for o in offers if o.get("status") == "accepted"), 2),
        "note": "Return loads are added only when incremental revenue clears incremental cost.",
    }


# --------------------------------------------------------------------------- #
# MonsoonPass
# --------------------------------------------------------------------------- #
@router.get("/monsoonpass/status")
def monsoon_status(principal: Principal = Depends(any_role)):
    edges = _safe_q("select * from road_edges order by monsoon_risk desc")
    risky = [e for e in edges if float(e.get("monsoon_risk") or 0) > 0.45]
    classes = {}
    for c in ("tractor_trolley", "pickup", "tempo", "lcv", "truck"):
        try:
            classes[c] = planning.road_access_check(edges, c, monsoon=True)
        except Exception:
            classes[c] = {"vehicle_class": c, "monsoon": True, "blocked_edges": []}
    return {
        "active_warnings": [
            {"edge": e.get("id"), "from": e.get("from_node"), "to": e.get("to_node"), "risk": e.get("monsoon_risk"),
             "surface": e.get("surface"), "width_m": e.get("width_m"),
             "action": "Verify physically before dispatch; use conservative road-access defaults."}
            for e in risky
        ],
        "by_vehicle_class": classes,
        "weather_source": "No live IMD feed connected in this deployment — risk is a stored road attribute.",
        "synthetic": True,
    }


# --------------------------------------------------------------------------- #
# VoiceBoli
# --------------------------------------------------------------------------- #
@router.post("/voice/parse")
def voice_parse(payload: dict, principal: Principal = Depends(any_role)):
    text = (payload.get("transcript") or "").strip()
    if not text:
        raise HTTPException(400, "transcript is required")
    lang = payload.get("language", "pa")
    draft, questions = _extract(text)
    return {
        "transcript": text,
        "language": lang,
        "draft": draft,
        "clarification_questions": questions,
        "requires_confirmation": True,
        "asr": payload.get("asr", "transcript_supplied_by_client"),
        "workflow": ["capture speech", "transcribe", "extract fields", "show draft",
                     "ask for confirmation", "save shipment"],
        "note": "Nothing is saved until the sender confirms the draft.",
    }


_UNITS = {"quintal": 100, "क्विंटल": 100, "ਕੁਇੰਟਲ": 100, "ton": 1000, "टन": 1000, "ਟਨ": 1000, "kg": 1, "किलो": 1, "ਕਿਲੋ": 1}
_CROPS = {"wheat": ["wheat", "gehun", "गेहूं", "ਕਣਕ"], "paddy": ["paddy", "dhan", "धान", "ਝੋਨਾ"],
          "potato": ["potato", "aalu", "आलू", "ਆਲੂ"], "onion": ["onion", "pyaz", "प्याज", "ਪਿਆਜ਼"],
          "mustard": ["mustard", "sarson", "सरसों", "ਸਰੋਂ"], "maize": ["maize", "makka", "मक्का", "ਮੱਕੀ"]}
_MANDIS = {"M-GOB": ["gobindgarh", "गोबिंदगढ़", "ਗੋਬਿੰਦਗੜ੍ਹ"], "M-KHN": ["khanna", "खन्ना", "ਖੰਨਾ"],
           "M-LDH": ["ludhiana", "लुधियाना", "ਲੁਧਿਆਣਾ"], "M-JAG": ["jagraon", "जगराओं", "ਜਗਰਾਓ"],
           "M-RAI": ["raikot", "रायकोट", "ਰਾਏਕੋਟ"]}


def _extract(text: str):
    low = text.lower()
    draft: dict = {}
    questions: list[str] = []
    for crop, words in _CROPS.items():
        if any(w in low for w in words):
            draft["commodity"] = crop
            break
    if "commodity" not in draft:
        questions.append("Which crop or commodity is this shipment for?")

    import re

    m = re.search(r"(\d+(?:\.\d+)?)\s*(quintal|ton|kg|क्विंटल|टन|किलो|ਕੁਇੰਟਲ|ਟਨ|ਕਿਲੋ)", low)
    if m:
        unit = m.group(2)
        draft["quantity"] = float(m.group(1))
        draft["unit"] = "tonne" if unit in ("ton", "टन", "ਟਨ") else ("kg" if unit in ("kg", "किलो", "ਕਿਲੋ") else "quintal")
        draft["quantity_kg"] = draft["quantity"] * _UNITS.get(unit, 100)
    else:
        questions.append("How much produce, and in which unit (quintal / tonne / kg)?")

    for mid, words in _MANDIS.items():
        if any(w in low for w in words):
            mandi = _safe_one("select * from mandis where id = ?", (mid,))
            draft["destination_id"] = mid
            draft["destination_name"] = mandi["name"] if mandi else mid
            draft["dest_lat"] = mandi["lat"] if mandi else None
            draft["dest_lng"] = mandi["lng"] if mandi else None
            break
    if "destination_id" not in draft:
        questions.append("Which mandi or destination should this go to?")

    villages = _safe_q("select * from villages")
    for v in villages:
        if v["name"].lower() in low:
            draft["pickup_village"] = v["name"]
            draft["pickup_lat"] = v["lat"]
            draft["pickup_lng"] = v["lng"]
            draft["pickup_district"] = v["district"]
            break
    if "pickup_village" not in draft:
        questions.append("Which village should the vehicle collect from?")

    daymap = {"today": 0, "tomorrow": 1, "कल": 1, "ਕੱਲ੍ਹ": 1, "आज": 0, "ਅੱਜ": 0}
    for word, off in daymap.items():
        if word in low:
            draft["ready_offset_days"] = off
            break
    return draft, questions