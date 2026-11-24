"""Sender-facing shipment lifecycle + shared detail/tracking endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import db
from ..algorithms import valueclock
from ..algorithms.geo import road_km
from ..core.security import Principal, admin_only, any_role, sender_only
from ..services import arrival
from ..services.common import (
    NOW,
    STATUS_LABELS,
    audit,
    event,
    get_shipment,
    notify,
    paginate,
    set_status,
    shipment_view,
    uid,
)

router = APIRouter(prefix="/api", tags=["shipments"])

EDITABLE_STATUSES = ("draft", "pending_admin_review")


class ItemIn(BaseModel):
    """A cargo line. `commodity` may be anything — the catalogue only suggests."""
    commodity: str = Field(min_length=1, max_length=80)
    quantity_kg: float = Field(gt=0)
    unit: str = "quintal"
    packaging: str | None = "jute_bags"
    handling: str | None = "dry_cover"
    note: str | None = None


class ShipmentIn(BaseModel):
    commodity: str = Field(min_length=2, max_length=80)
    quantity_kg: float = Field(gt=0)
    unit: str = "quintal"
    pickup_village: str
    pickup_point: str | None = None
    pickup_state: str | None = None
    pickup_district: str | None = None
    pickup_lat: float
    pickup_lng: float
    drop_state: str | None = None
    drop_district: str | None = None
    destination_id: str | None = None
    destination_name: str | None = None
    destination_point: str | None = None
    dest_lat: float | None = None
    dest_lng: float | None = None
    destination_options: list[dict] = Field(default_factory=list)
    ready_from: str | None = None
    ready_to: str | None = None
    deadline: str | None = None
    packaging: str | None = "jute_bags"
    handling: str | None = "dry_cover"
    temperature: str | None = "ambient"
    special_instructions: str | None = ""
    attachments: list[dict] = Field(default_factory=list)
    items: list[ItemIn] = Field(default_factory=list)          # multi-item consignments
    requirements: str | None = None                            # free-text sender requirement
    as_draft: bool = False


def _estimate_freight(quantity_kg: float, pickup: tuple[float, float], dest: tuple[float, float] | None) -> float:
    if not dest:
        return round(quantity_kg / 100 * 180, 0)
    km = road_km(pickup[0], pickup[1], dest[0], dest[1])
    # indicative: distance component + handling, expressed per quintal
    quintals = max(quantity_kg / 100, 0.01)
    return round(km * 21 + quintals * 42, 0)


def _resolve_destination(body: ShipmentIn) -> tuple[str | None, str | None, float | None, float | None]:
    if body.destination_id:
        m = db.one("select * from mandis where id = ?", (body.destination_id,))
        if m:
            return m["id"], m["name"], m.get("lat"), m.get("lng")
    return body.destination_id, body.destination_name, body.dest_lat, body.dest_lng


def _format_pickup_point(body: ShipmentIn) -> str:
    if body.pickup_point and body.pickup_point.strip():
        return body.pickup_point.strip()
    parts = [p.strip() for p in (body.pickup_village, body.pickup_district, body.pickup_state) if p and p.strip()]
    return ", ".join(parts) if parts else "Pickup point"


def _wkt_point(lat: float | None, lng: float | None, fallback: tuple[float, float] = (25.5941, 85.1376)) -> str:
    use_lat = float(lat) if lat is not None else fallback[0]
    use_lng = float(lng) if lng is not None else fallback[1]
    return f"SRID=4326;POINT({use_lng} {use_lat})"


def _format_destination_point(body: ShipmentIn, dlat: float | None, dlng: float | None) -> str:
    if body.destination_point and body.destination_point.strip():
        return body.destination_point.strip()
    if dlat is not None and dlng is not None:
        return _wkt_point(dlat, dlng)
    return _wkt_point(body.pickup_lat, body.pickup_lng)


def _lookup_shipment_id(row: dict | None, fallback: str) -> str:
    if row and row.get("id"):
        return str(row["id"])
    return fallback


@router.post("/shipments")
def create_shipment(body: ShipmentIn, principal: Principal = Depends(sender_only)):
    did, dname, dlat, dlng = _resolve_destination(body)
    qty = body.quantity_kg
    if body.unit == "tonne":
        qty = body.quantity_kg * 1000
    elif body.unit == "kg":
        qty = body.quantity_kg
    elif body.unit == "quintal":
        qty = body.quantity_kg * 100

    count = db.scalar("select count(*) from shipments", default=0)
    sid = f"SHP-{2000 + int(count) + 1}"
    code = f"CX-{3000 + int(count) + 1}"
    now = NOW()
    status = "draft" if body.as_draft else "pending_admin_review"
    dest = (dlat, dlng) if dlat and dlng else None
    estimate = _estimate_freight(qty, (body.pickup_lat, body.pickup_lng), dest)
    pickup_point_val = _format_pickup_point(body)
    destination_point_val = _format_destination_point(body, dlat, dlng)

    inserted = db.insert("shipments", {
        "id": sid,
        "code": code,
        "sender_id": principal["id"],
        "commodity": body.commodity.strip().lower(),
        "quantity_kg": qty,
        "unit": body.unit,
        "pickup_village": body.pickup_village,
        "pickup_point": pickup_point_val,
        "pickup_district": body.pickup_district,
        "pickup_lat": body.pickup_lat,
        "pickup_lng": body.pickup_lng,
        "pickup_state": body.pickup_state,
        "drop_state": body.drop_state,
        "drop_district": body.drop_district,
        "destination_id": did,
        "destination_name": dname,
        "destination_point": destination_point_val,
        "dest_lat": dlat,
        "dest_lng": dlng,
        "ready_from": body.ready_from,
        "ready_to": body.ready_to,
        "deadline": body.deadline,
        "packaging": body.packaging,
        "handling": body.handling,
        "temperature": body.temperature,
        "special_instructions": body.special_instructions,
        "attachments": db.jdump(body.attachments),
        "requirements": (body.requirements or "").strip()[:600] or None,
        "status": status,
        "freight_estimate": estimate,
        "freight_approved": False,
        "direction": "outbound",
        "is_synthetic": True,
        "created_at": now,
        "updated_at": now,
    })

    created_row = get_shipment(code) or inserted
    real_sid = _lookup_shipment_id(created_row, sid)

    if not body.items:
        try:
            db.insert("shipment_items", {
                "id": uid("ITM"),
                "shipment_id": real_sid,
                "commodity": body.commodity,
                "quantity_kg": qty,
                "packaging": body.packaging,
                "handling": body.handling,
            })
        except Exception:
            pass
    for it in body.items:
        grams = it.quantity_kg * (1000 if it.unit == "tonne" else 100 if it.unit == "quintal" else 1)
        label = it.commodity.strip()
        if it.note:
            label = f"{label} — {it.note.strip()}"
        try:
            db.insert("shipment_items", {
                "id": uid("ITM"),
                "shipment_id": real_sid,
                "commodity": label[:120],
                "quantity_kg": grams,
                "packaging": it.packaging or body.packaging,
                "handling": it.handling or body.handling,
            })
        except Exception:
            pass

    if dname:
        try:
            db.insert("shipment_destinations", {
                "id": uid("DST"),
                "shipment_id": real_sid,
                "name": dname,
                "kind": "mandi",
                "lat": dlat,
                "lng": dlng,
                "expected_price": None,
                "queue_minutes": 45,
                "preference_rank": 1,
            })
        except Exception:
            pass

    for i, opt in enumerate(body.destination_options[:4], start=2):
        try:
            db.insert("shipment_destinations", {
                "id": uid("DST"),
                "shipment_id": real_sid,
                "name": opt.get("name", "Alternative"),
                "kind": "mandi",
                "lat": opt.get("lat"),
                "lng": opt.get("lng"),
                "expected_price": opt.get("expected_price"),
                "queue_minutes": 45,
                "preference_rank": i,
            })
        except Exception:
            pass

    try:
        event(real_sid, "shipment_created", actor_id=principal["id"],
              payload={"status": status, "quantity_kg": qty, "commodity": body.commodity})
    except Exception:
        pass

    try:
        audit(principal, "shipment.create", entity_type="shipment", entity_id=real_sid, after={"status": status})
    except Exception:
        pass

    if status == "pending_admin_review":
        try:
            for admin in db.q("select id from profiles where role = 'admin'"):
                notify(
                    admin["id"],
                    f"New shipment {code} in review",
                    f"{body.commodity} · {qty:,.0f} kg from {pickup_point_val}",
                    "action",
                    link="/admin/shipments",
                )
        except Exception:
            pass

    return {
        "shipment": shipment_view(get_shipment(code) or created_row),
        "message": f"Shipment {code} created and sent for admin verification.",
    }


@router.get("/shipments")
def list_shipments(
    principal: Principal = Depends(any_role),
    status: str | None = Query(None),
    q: str | None = Query(None),
    page: int = 1,
    page_size: int = 25,
):
    sql = "select * from shipments where 1=1"
    params: list = []
    if principal["role"] == "sender":
        sql += " and sender_id = ?"
        params.append(principal["id"])
    elif principal["role"] == "transporter":
        sql += (" and id in (select ts.shipment_id from trip_shipments ts join trips t on t.id = ts.trip_id "
                "join transport_assignments ta on ta.id = t.assignment_id where ta.transporter_id = ?)")
        params.append(principal["id"])
    if status and status != "all":
        sql += " and status = ?"
        params.append(status)
    if q:
        sql += " and (lower(code) like ? or lower(commodity) like ? or lower(pickup_village) like ?)"
        params += [f"%{q.lower()}%"] * 3
    sql += " order by created_at desc"
    rows = db.q(sql, params)
    return paginate([shipment_view(r) for r in rows], page, page_size)


@router.get("/shipments/{shipment_id}")
def get_one(shipment_id: str, principal: Principal = Depends(any_role)):
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if principal["role"] == "sender" and row["sender_id"] != principal["id"]:
        raise HTTPException(403, "You can only access your own shipments")
    view = shipment_view(row, include_events=True)
    assignment = db.one(
        """select ta.*, v.reg_no, v.vehicle_class, v.payload_kg from transport_assignments ta
           left join vehicles v on v.id = ta.vehicle_id
           where ta.id in
             (select t.assignment_id from trips t join trip_shipments ts on ts.trip_id = t.id where ts.shipment_id = ?)
           order by case when ta.transporter_id = ? then 0 else 1 end
           limit 1""",
        (row["id"], principal["id"]),
    )
    view["assignment"] = assignment
    view["arrival"] = arrival.clock_for(assignment["id"]) if assignment else None
    return view


@router.patch("/shipments/{shipment_id}")
def update_shipment(shipment_id: str, body: ShipmentIn, principal: Principal = Depends(sender_only)):
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if row["sender_id"] != principal["id"]:
        raise HTTPException(403, "Not your shipment")
    if row["status"] not in EDITABLE_STATUSES:
        raise HTTPException(409, f"Shipment can no longer be edited in status '{row['status']}'")
    before = shipment_view(row)
    qty = body.quantity_kg * (100 if body.unit == "quintal" else 1000 if body.unit == "tonne" else 1)
    pickup_point_val = _format_pickup_point(body)
    destination_point_val = _format_destination_point(body, body.dest_lat, body.dest_lng)
    db.execute(
        """update shipments set commodity = ?, quantity_kg = ?, pickup_village = ?, pickup_point = ?,
           pickup_lat = ?, pickup_lng = ?, destination_name = ?, destination_point = ?, dest_lat = ?, dest_lng = ?,
           ready_from = ?, ready_to = ?, deadline = ?, packaging = ?, handling = ?, temperature = ?,
           special_instructions = ?, status = ?, updated_at = ? where id = ?""",
        (
            body.commodity, qty, body.pickup_village, pickup_point_val, body.pickup_lat,
            body.pickup_lng, body.destination_name, destination_point_val, body.dest_lat, body.dest_lng,
            body.ready_from, body.ready_to, body.deadline, body.packaging, body.handling, body.temperature,
            body.special_instructions,
            "pending_admin_review" if row["status"] == "draft" else row["status"],
            NOW(), row["id"],
        ),
    )
    event(row["id"], "shipment_updated", actor_id=principal["id"], payload={"fields": "core"})
    audit(principal, "shipment.update", entity_type="shipment", entity_id=row["id"], before=before)
    return shipment_view(get_shipment(row["code"]) or get_shipment(row["id"]))


@router.post("/shipments/{shipment_id}/cancel")
def cancel_shipment(shipment_id: str, payload: dict | None = None, principal: Principal = Depends(sender_only)):
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if row["sender_id"] != principal["id"]:
        raise HTTPException(403, "Not your shipment")
    if row["status"] in ("in_transit", "at_transfer_hub", "out_for_delivery", "delivered", "cancelled"):
        raise HTTPException(409, "A shipment already in execution cannot be cancelled here — contact Admin.")
    before = row["status"]
    db.execute("update shipments set status = 'cancelled', updated_at = ? where id = ?", (NOW(), row["id"]))
    event(row["id"], "shipment_cancelled", actor_id=principal["id"], payload={"reason": (payload or {}).get("reason")})
    audit(principal, "shipment.cancel", entity_type="shipment", entity_id=row["id"],
          before={"status": before}, after={"status": "cancelled"})
    for admin in db.q("select id from profiles where role = 'admin'"):
        notify(admin["id"], f"{row['code']} cancelled by sender", (payload or {}).get("reason") or "", "warning", "/admin/shipments")
    return shipment_view(get_shipment(row["code"]) or get_shipment(row["id"]))


@router.post("/shipments/{shipment_id}/approve-allocation")
def approve_allocation(shipment_id: str, payload: dict, principal: Principal = Depends(sender_only)):
    """Sender approves or rejects the freight allocation proposed by Admin."""
    accept = bool(payload.get("accept"))
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if row["sender_id"] != principal["id"]:
        raise HTTPException(403, "Not your shipment")
    alloc = db.one("select * from cost_allocations where shipment_id = ? order by created_at desc limit 1", (row["id"],))
    if not alloc:
        raise HTTPException(409, "No allocation proposal exists for this shipment yet")
    if not accept and payload.get("reason") is None:
        raise HTTPException(400, "A reason is required when rejecting an allocation")
    db.execute("update cost_allocations set approval = ? where id = ?", ("approved" if accept else "rejected", alloc["id"]))
    db.execute("update shipments set freight_estimate = ?, freight_approved = ?, updated_at = ? where id = ?",
               (alloc["allocated_share"], 1 if accept else 0, NOW(), row["id"]))
    event(row["id"], "allocation_" + ("approved" if accept else "rejected"), actor_id=principal["id"],
          payload={"allocated_share": alloc["allocated_share"], "reason": payload.get("reason")})
    audit(principal, "allocation.respond", entity_type="shipment", entity_id=row["id"],
          after={"approval": "approved" if accept else "rejected"})
    for admin in db.q("select id from profiles where role = 'admin'"):
        notify(admin["id"], f"{row['code']} allocation {'approved' if accept else 'rejected'}",
               f"₹{alloc['allocated_share']:,.0f} · {row['commodity']}", "action" if not accept else "success",
               "/admin/shipments")
    return {"approval": "approved" if accept else "rejected",
            "shipment": shipment_view(get_shipment(row["code"]) or get_shipment(row["id"])),
            "message": "Allocation approved. Admin can now confirm the assignment." if accept
            else "Allocation rejected. Admin will re-plan this load."}


@router.post("/shipments/{shipment_id}/readiness")
def readiness_checkin(shipment_id: str, payload: dict, principal: Principal = Depends(sender_only)):
    """ReadySync: sender confirms packed/ready status at T-60 or T-45."""
    row = get_shipment(shipment_id)
    if not row or row["sender_id"] != principal["id"]:
        raise HTTPException(404, "Shipment not found for this account")
    state = payload.get("state")
    if state not in ("ready", "delayed"):
        raise HTTPException(400, "state must be 'ready' or 'delayed'")
    event(row["id"], "readiness_confirmed", actor_id=principal["id"],
          payload={"state": state, "confirmed_kg": payload.get("confirmed_kg"), "note": payload.get("note")})
    asg = db.one(
        """select ta.* from transport_assignments ta join trips t on t.assignment_id = ta.id
           join trip_shipments ts on ts.trip_id = t.id where ts.shipment_id = ? limit 1""",
        (row["id"],),
    )
    if asg:
        db.execute("update transport_assignments set ready_check = ?, updated_at = ? where id = ?",
                   (state, NOW(), asg["id"]))
    if state == "ready" and row["status"] in ("confirmed",):
        set_status(row, "ready_for_pickup", actor=principal, note="Sender confirmed readiness at check-in.")
    for admin in db.q("select id from profiles where role = 'admin'"):
        notify(admin["id"], f"{row['code']} readiness: {state}", payload.get("note") or "", "info", "/admin/readysync")
    return {"recorded": True, "state": state}


@router.get("/shipments/{shipment_id}/tracking")
def tracking(shipment_id: str, principal: Principal = Depends(any_role)):
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if principal["role"] == "sender" and row["sender_id"] != principal["id"]:
        raise HTTPException(403, "Not your shipment")
    events = db.q("select * from shipment_events where entity_id = ? order by created_at asc", (row["id"],))
    trip = db.one("select t.* from trips t join trip_shipments ts on ts.trip_id = t.id where ts.shipment_id = ? limit 1", (row["id"],))
    legs = db.q("select * from trip_legs where trip_id = ? order by leg_no", (trip["id"],)) if trip else []
    order = ["draft", "pending_admin_review", "planning", "matched", "awaiting_sender_approval",
             "confirmed", "ready_for_pickup", "in_transit", "at_transfer_hub", "out_for_delivery", "delivered"]
    current = order.index(row["status"]) if row["status"] in order else 0
    return {
        "shipment": shipment_view(row),
        "steps": [{"key": s, "label": STATUS_LABELS[s], "done": i <= current, "current": i == current}
                  for i, s in enumerate(order)],
        "trip": {
            "id": trip["id"], "code": trip["trip_code"], "status": trip["status"], "driver": trip["driver_name"],
            "started_at": trip["started_at"], "legs": legs,
        } if trip else None,
        "events": [{**e, "payload": db.jload(e["payload"], {})} for e in events],
        "live_gps": False,
        "gps_note": "No live GPS feed is connected. Positions are last-reported operational checkpoints, never fabricated.",
    }


@router.post("/shipments/{shipment_id}/destinations/recommend")
def recommend_destinations(shipment_id: str, principal: Principal = Depends(any_role)):
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if principal["role"] == "sender" and row["sender_id"] != principal["id"]:
        raise HTTPException(403, "Not your shipment")
    mandis = db.q("select * from mandis")
    options = []
    for m in mandis:
        price = db.one(
            "select * from market_observations where commodity_id = ? and mandi_id = ? order by obs_date desc limit 1",
            (row["commodity"], m["id"]),
        )
        q = db.one("select * from mandi_queues where mandi_id = ? order by observed_at desc limit 1", (m["id"],))
        options.append({
            "id": m["id"], "name": m["name"], "lat": m["lat"], "lng": m["lng"],
            "price_per_quintal": price["price_mode"] if price else None,
            "queue_minutes": q["queue_minutes"] if q else m["queue_minutes"],
            "confidence": 0.62 if price else 0.3,
            "price_source": "synthetic market observation" if price else "no observation",
        })
    alloc = db.one("select * from cost_allocations where shipment_id = ? order by created_at desc limit 1", (row["id"],))
    freight = alloc["allocated_share"] if alloc else row["freight_estimate"]
    result = valueclock.evaluate_destinations(
        commodity=row["commodity"], quantity_kg=float(row["quantity_kg"]),
        origin=(row["pickup_lat"], row["pickup_lng"]), destinations=options,
        freight_share=float(freight or 0),
    )
    return result


@router.get("/shipments/{shipment_id}/cost")
def cost_breakdown(shipment_id: str, principal: Principal = Depends(any_role)):
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if principal["role"] == "sender" and row["sender_id"] != principal["id"]:
        raise HTTPException(403, "Not your shipment")
    alloc = db.one("select * from cost_allocations where shipment_id = ? order by created_at desc limit 1", (row["id"],))
    coalition = db.one("select * from coalitions where id = ?", (alloc["coalition_id"],)) if alloc else None
    peers = db.q(
        """select ca.*, s.code, s.commodity, s.quantity_kg from cost_allocations ca
           join shipments s on s.id = ca.shipment_id where ca.coalition_id = ? and ca.shipment_id <> ?""",
        (alloc["coalition_id"], row["id"]),
    ) if alloc else []
    return {
        "shipment": {"code": row["code"], "quantity_kg": row["quantity_kg"], "commodity": row["commodity"]},
        "allocation": alloc,
        "coalition": coalition,
        "coalition_members": peers,
        "explanation": [
            "Standalone cost = what this sender would pay travelling alone.",
            "Coalition cost = the pooled trip cost actually charged.",
            "Your share is your average marginal contribution to every coalition ordering (Shapley value).",
            "The participation check guarantees your share is never above your standalone cost.",
        ],
    }