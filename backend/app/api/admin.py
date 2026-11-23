"""Admin control tower: review, pooling, planning, dispatch, allocation,
assignment, delivery coordination, monitoring, audits."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import db
from ..algorithms import compat, dispatch, planning, shapley
from ..algorithms.geo import CLASS_CAPACITY_KG, road_km
from ..core.config import settings
from ..core.security import Principal, admin_only
from ..services.common import (
    ACTIVE_STATUSES,
    NOW,
    audit,
    event,
    get_shipment,
    notify,
    paginate,
    set_status,
    shipment_view,
    uid,
)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_only)])


def _is_postgres() -> bool:
    return (db.dialect() or "").lower() in ("postgres", "postgresql")


def _verified_true_sql() -> str:
    return "verified is true" if _is_postgres() else "verified = 1"


def _verified_false_sql() -> str:
    return "coalesce(verified, false) is false" if _is_postgres() else "coalesce(verified, 0) = 0"


# --------------------------------------------------------------------------- #
# admin-aliased intelligence readers
#
# The admin namespace mirrors the read-only intelligence endpoints so the whole
# control tower can be served under one role-guarded prefix. They are thin
# aliases over the same functions and are hand-written on purpose: an admin-role
# dependency plus a handler that personally calls Depends(admin_only) would
# otherwise be evaluated twice, and a router-level guard already covers them.
# --------------------------------------------------------------------------- #
@router.get("/agrocompat/matrix")
def admin_agrocompat_matrix(commodities: str | None = Query("wheat,paddy,potato,onion,tomato")):
    from .intelligence import agrocompat_matrix

    return agrocompat_matrix(commodities=commodities, principal={"id": "router-guarded", "role": "admin"})


@router.get("/capacity/match/view")
def admin_capacity_match_view():
    # explicit payload=None: match_capacity's default would be parsed as a
    # request-body model on a GET and fail with a 422
    return match_capacity(payload=None, pool_id=None)


# --------------------------------------------------------------------------- #
# overview
# --------------------------------------------------------------------------- #
@router.get("/overview")
def overview():
    def c(sql, params=()):
        return db.scalar(sql, params, 0) or 0

    senders = c("select count(*) from profiles where role='sender'")
    transporters = c("select count(*) from profiles where role='transporter'")
    total_shipments = c("select count(*) from shipments")
    pending = c("select count(*) from shipments where status='pending_admin_review'")
    active = c(f"select count(*) from shipments where status in ({','.join('?'*len(ACTIVE_STATUSES))})", ACTIVE_STATUSES)
    delivered = c("select count(*) from shipments where status='delivered'")
    vehicles_total = c("select count(*) from vehicles")
    vehicles_available = c("select count(*) from vehicles where availability='available'")
    vehicles_verified = c(f"select count(*) from vehicles where {_verified_true_sql()}")
    assigned = c("select count(*) from transport_assignments where status in ('confirmed','sender_approved')")
    delayed = c("select count(*) from trips where delay_reported is not null and status <> 'delivered'")
    volume = db.scalar("select coalesce(sum(quantity_kg),0) from shipments where status <> 'cancelled'", default=0)
    savings = db.scalar("select coalesce(sum(saving),0) from cost_allocations where approval = 'approved'", default=0)
    committed_capacity = db.scalar(
        "select coalesce(sum(block_size_kg),0) from capacity_blocks where status in ('published','reserved')", default=0)
    pool_demand = db.scalar(
        "select coalesce(sum(quantity_kg),0) from shipments where status in ('pending_admin_review','planning','matched')",
        default=0)

    recent = db.q("select * from shipments order by created_at desc limit 6")
    return {
        "counts": {
            "senders": senders, "transporters": transporters, "total_shipments": total_shipments,
            "pending_review": pending, "active_shipments": active, "delivered": delivered,
            "vehicles_total": vehicles_total, "vehicles_available": vehicles_available,
            "vehicles_verified": vehicles_verified, "assigned_vehicles": assigned,
            "delayed_shipments": delayed,
        },
        "volume_kg": volume,
        "freight_savings": round(float(savings), 2),
        "capacity_coverage_ratio": round(float(committed_capacity) / float(pool_demand), 2) if pool_demand else 0.0,
        "committed_capacity_kg": committed_capacity,
        "uncovered_demand_kg": max(0, float(pool_demand) - float(committed_capacity)),
        "recent_shipments": [shipment_view(r) for r in recent],
        "alerts": _alerts(),
        "synthetic": True,
    }


def _alerts() -> list[dict]:
    out = []
    pending = db.q("select id, code, commodity, quantity_kg from shipments where status='pending_admin_review'")
    if pending:
        out.append({"kind": "action", "title": f"{len(pending)} shipment(s) awaiting review",
                    "body": ", ".join(p["code"] for p in pending[:4]), "link": "/admin/shipments"})
    unverified = db.q(f"select id, reg_no from vehicles where {_verified_false_sql()}")
    if unverified:
        out.append({"kind": "warning", "title": f"{len(unverified)} vehicle(s) unverified",
                    "body": "Assignments are blocked until documents are verified.", "link": "/admin/vehicles"})
    low = db.q("""select s.code from shipments s where s.status='awaiting_sender_approval'""")
    if low:
        out.append({"kind": "info", "title": f"{len(low)} allocation(s) awaiting sender approval",
                    "body": "Senders must approve their fair-share proposal.", "link": "/admin/allocations"})
    return out


# --------------------------------------------------------------------------- #
# sender / transporter management
# --------------------------------------------------------------------------- #
@router.get("/senders")
def list_senders(q: str | None = Query(None)):
    sql = """select p.id, p.full_name, p.email, p.mobile, p.state, p.district, p.status, p.created_at,
                    sp.account_kind, sp.village,
                    (select count(*) from shipments s where s.sender_id = p.id) as shipments,
                    (select coalesce(sum(s.quantity_kg),0) from shipments s where s.sender_id = p.id) as volume_kg,
                    (select coalesce(sum(s.freight_estimate),0) from shipments s where s.sender_id = p.id and s.status='delivered') as spend
             from profiles p left join sender_profiles sp on sp.profile_id = p.id
             where p.role = 'sender'"""
    params: list = []
    if q:
        sql += " and (lower(p.full_name) like ? or lower(p.email) like ?)"
        params += [f"%{q.lower()}%"] * 2
    sql += " order by p.created_at desc"
    rows = db.q(sql, params)
    return {"items": rows, "total": len(rows)}


class StatusIn(BaseModel):
    action: str = Field(pattern="^(suspend|reactivate|verify)$")
    reason: str | None = None


@router.post("/users/{profile_id}/status")
def set_user_status(profile_id: str, body: StatusIn, principal: Principal = Depends(admin_only)):
    row = db.one("select * from profiles where id = ?", (profile_id,))
    if not row:
        raise HTTPException(404, "Account not found")
    if row["role"] == "admin":
        raise HTTPException(403, "Administrator accounts cannot be modified here")
    new_status = {"suspend": "suspended", "reactivate": "active", "verify": "active"}[body.action]
    db.execute("update profiles set status = ?, verified_at = ? where id = ?",
               (new_status, NOW() if body.action == "verify" else row["verified_at"], profile_id))
    if row["role"] == "transporter" and body.action == "verify":
        db.execute("update transporter_profiles set verification_status = 'verified' where profile_id = ?", (profile_id,))
    audit(principal, f"user.{body.action}", entity_type="profile", entity_id=profile_id,
          before={"status": row["status"]}, after={"status": new_status, "reason": body.reason})
    notify(profile_id, f"Account {body.action}d by Admin", body.reason or "", "warning" if body.action == "suspend" else "success")
    return {"status": new_status}


# --------------------------------------------------------------------------- #
# shipment review
# --------------------------------------------------------------------------- #
@router.get("/shipments")
def admin_shipments(status: str | None = Query(None), q: str | None = Query(None),
                    commodity: str | None = Query(None), page: int = 1, page_size: int = 50):
    sql = """select s.*, p.full_name as sender_name from shipments s
             join profiles p on p.id = s.sender_id where 1=1"""
    params: list = []
    if status and status != "all":
        sql += " and s.status = ?"
        params.append(status)
    if commodity and commodity != "all":
        sql += " and s.commodity = ?"
        params.append(commodity)
    if q:
        sql += " and (lower(s.code) like ? or lower(p.full_name) like ? or lower(s.pickup_village) like ?)"
        params += [f"%{q.lower()}%"] * 3
    sql += " order by s.created_at desc"
    rows = db.q(sql, params)
    items = []
    for r in rows:
        v = shipment_view(r)
        v["sender_name"] = r["sender_name"]
        items.append(v)
    return paginate(items, page, page_size)


class ReviewIn(BaseModel):
    action: str = Field(pattern="^(approve|reject|request_info)$")
    note: str | None = None
    edits: dict | None = None


@router.post("/shipments/{shipment_id}/review")
def review_shipment(shipment_id: str, body: ReviewIn, principal: Principal = Depends(admin_only)):
    row = get_shipment(shipment_id)
    if not row:
        raise HTTPException(404, "Shipment not found")
    if row["status"] not in ("pending_admin_review", "draft"):
        raise HTTPException(409, f"Shipment is already in '{row['status']}'")
    if body.action == "approve":
        if body.edits:
            allowed = {k: v for k, v in body.edits.items()
                       if k in ("quantity_kg", "commodity", "destination_name", "dest_lat", "dest_lng",
                                "deadline", "packaging", "handling", "special_instructions")}
            if allowed:
                sets = ", ".join(f"{k} = ?" for k in allowed)
                db.execute(f"update shipments set {sets}, updated_at = ? where id = ?",
                           list(allowed.values()) + [NOW(), shipment_id])
                audit(principal, "shipment.admin_edit", entity_type="shipment", entity_id=shipment_id,
                      before=shipment_view(row), after=allowed)
        set_status(row, "planning", actor=principal, note=body.note or "Approved for planning.")
        message = "Shipment approved and moved to planning."
    elif body.action == "reject":
        set_status(row, "cancelled", actor=principal, note=body.note or "Rejected by Admin.")
        message = "Shipment rejected."
    else:
        event(shipment_id, "info_requested", actor_id=principal["id"], payload={"note": body.note})
        notify(row["sender_id"], f"More information needed for {row['code']}", body.note or "", "action",
               f"/sender/shipments")
        message = "Information requested from sender."
    return {"message": message, "shipment": shipment_view(get_shipment(shipment_id))}


# --------------------------------------------------------------------------- #
# shipment pool + compatibility
# --------------------------------------------------------------------------- #
@router.post("/pools/auto")
def auto_pool(principal: Principal = Depends(admin_only)):
    """Group planning-ready shipments by destination corridor + compatibility."""
    rows = db.q("select * from shipments where status in ('planning','pending_admin_review') and pool_id is null")
    created = []
    consumed: set[str] = set()
    for a in rows:
        if a["id"] in consumed:
            continue
        group = [a]
        for b in rows:
            if b["id"] in consumed or b["id"] == a["id"]:
                continue
            if b["destination_id"] and b["destination_id"] == a["destination_id"]:
                if compat.check_set([g["commodity"] for g in group] + [b["commodity"]])["compatible"]:
                    if road_km(a["pickup_lat"], a["pickup_lng"], b["pickup_lat"], b["pickup_lng"]) <= 18:
                        group.append(b)
        if len(group) < 2:
            continue
        pid = uid("POOL")
        compat_res = compat.check_set([g["commodity"] for g in group])
        corridor = f"{a['pickup_district'] or 'rural'}->{a['destination_name'] or 'mandi'}"
        db.insert("shipment_pools", {
            "id": pid, "corridor": corridor, "status": "proposed",
            "total_kg": sum(g["quantity_kg"] for g in group),
            "compatible": 1 if compat_res["compatible"] else 0,
            "notes": "; ".join(compat_res["warnings"])[:400] or None,
            "created_at": NOW(),
        })
        for g in group:
            db.execute("update shipments set pool_id = ?, updated_at = ? where id = ?", (pid, NOW(), g["id"]))
            consumed.add(g["id"])
            event(g["id"], "pooled", actor_id=principal["id"], payload={"pool_id": pid})
        created.append({"pool_id": pid, "corridor": corridor, "members": [g["code"] for g in group],
                        "total_kg": sum(g["quantity_kg"] for g in group), "compatibility": compat_res})
        audit(principal, "pool.create", entity_type="shipment_pool", entity_id=pid,
              after={"members": [g["id"] for g in group]})
    return {"created": created, "count": len(created),
            "message": "Pools proposed from destination corridor, pickup proximity and commodity compatibility."
            if created else "No compatible groups found — approvals may still be pending."}


@router.get("/pools")
def list_pools():
    pools = db.q("select * from shipment_pools order by created_at desc")
    for p in pools:
        members = db.q("select * from shipments where pool_id = ?", (p["id"],))
        p["members"] = [shipment_view(m) for m in members]
        p["compatibility"] = compat.check_set([m["commodity"] for m in members]) if members else None
        p["total_kg"] = sum(float(m["quantity_kg"]) for m in members)
        p["vehicle_class_suggestion"] = _suggest_class(p["total_kg"])
    return {"items": pools}


def _suggest_class(kg: float) -> str:
    for klass in ("pickup", "tractor_trolley", "tempo", "lcv", "truck"):
        if kg <= CLASS_CAPACITY_KG[klass] * 0.92:
            return klass
    return "truck"


class PoolActionIn(BaseModel):
    action: str = Field(pattern="^(approve|split|reject)$")
    shipment_ids: list[str] | None = None
    note: str | None = None


@router.post("/pools/{pool_id}/action")
def pool_action(pool_id: str, body: PoolActionIn, principal: Principal = Depends(admin_only)):
    pool = db.one("select * from shipment_pools where id = ?", (pool_id,))
    if not pool:
        raise HTTPException(404, "Pool not found")
    if body.action == "approve":
        compat_res = compat.check_set([
            s["commodity"] for s in db.q("select * from shipments where pool_id = ?", (pool_id,))
        ])
        if not compat_res["compatible"]:
            raise HTTPException(409, f"AgroCompat blocks this pool: {compat_res['blockers'][0]['hard']}")
        db.execute("update shipment_pools set status = 'approved' where id = ?", (pool_id,))
        for s in db.q("select * from shipments where pool_id = ?", (pool_id,)):
            set_status(s, "matched", actor=principal, note="Pool approved.")
    elif body.action == "split":
        ids = body.shipment_ids or []
        if len(ids) < 1:
            raise HTTPException(400, "shipment_ids required to split a pool")
        nid = uid("POOL")
        db.insert("shipment_pools", {"id": nid, "corridor": pool["corridor"], "status": "proposed",
                                     "total_kg": 0, "compatible": 1, "notes": body.note, "created_at": NOW()})
        for sid in ids:
            db.execute("update shipments set pool_id = ? where id = ?", (nid, sid))
        for p in (pool_id, nid):
            tot = db.scalar("select coalesce(sum(quantity_kg),0) from shipments where pool_id = ?", (p,), 0)
            db.execute("update shipment_pools set total_kg = ? where id = ?", (tot, p))
    else:
        db.execute("update shipment_pools set status = 'rejected' where id = ?", (pool_id,))
        db.execute("update shipments set pool_id = null where pool_id = ?", (pool_id,))
    audit(principal, f"pool.{body.action}", entity_type="shipment_pool", entity_id=pool_id)
    return {"ok": True, "action": body.action}


# --------------------------------------------------------------------------- #
# capacity matching
# --------------------------------------------------------------------------- #
@router.post("/capacity/match")
@router.get("/capacity/match")
def match_capacity(payload: dict | None = None, pool_id: str | None = None):
    # GET is supported so the screen can render the standing match table without
    # needing a write; POST re-runs the match for a specific pool.
    payload = payload or ({"pool_id": pool_id} if pool_id else None)
    pool_id = (payload or {}).get("pool_id")
    sql = """select cb.*, v.reg_no, p.full_name as transporter_name, tp.verification_status
             from capacity_blocks cb join profiles p on p.id = cb.transporter_id
             left join vehicles v on v.id = cb.vehicle_id
             left join transporter_profiles tp on tp.profile_id = cb.transporter_id
             where cb.status = 'published'"""
    blocks = db.q(sql)
    demand_kg = 0.0
    if pool_id:
        demand_kg = float(db.scalar("select coalesce(sum(quantity_kg),0) from shipments where pool_id = ?", (pool_id,), 0))
    else:
        demand_kg = float(db.scalar(
            "select coalesce(sum(quantity_kg),0) from shipments where status in ('planning','matched','pending_admin_review')",
            default=0))
    scored = []
    for b in blocks:
        fit = min(1.0, float(b["payload_kg"]) / demand_kg) if demand_kg else 0.0
        verified = (b["verification_status"] or "") == "verified"
        scored.append({**b, "fit_ratio": round(fit, 3),
                       "sufficient": float(b["payload_kg"]) >= demand_kg,
                       "transporter_verified": verified,
                       "rank_score": round(fit * (1.2 if verified else 0.9), 3)})
    scored.sort(key=lambda x: (-x["rank_score"], x["reserve_price_per_km"] or 0))
    committed = sum(float(b["payload_kg"]) for b in blocks)
    return {
        "demand_kg": round(demand_kg, 1),
        "committed_capacity_kg": round(committed, 1),
        "coverage_ratio": round(committed / demand_kg, 2) if demand_kg else 0.0,
        "uncovered_kg": round(max(0.0, demand_kg - committed), 1),
        "candidates": scored,
        "gap_note": "Coverage below 1.0 means standby capacity or a second wave is required."
        if demand_kg and committed < demand_kg else "Committed capacity covers current demand.",
    }


# --------------------------------------------------------------------------- #
# planning: OR-Tools CVRPTW + two-echelon
# --------------------------------------------------------------------------- #
@router.post("/plans/generate")
def generate_plan(payload: dict):
    pool_id = payload.get("pool_id")
    members = db.q("select * from shipments where pool_id = ?", (pool_id,)) if pool_id else \
        db.q("select * from shipments where status in ('planning','matched')")
    if not members:
        raise HTTPException(409, "No shipments to plan")
    dest_row = next((m for m in members if m["dest_lat"]), None)
    destination = {
        "name": (dest_row or members[0])["destination_name"] or "Mandi",
        "lat": (dest_row or members[0])["dest_lat"] or 30.704,
        "lng": (dest_row or members[0])["dest_lng"] or 76.223,
    }
    depot = destination
    stops = [{
        "id": m["id"], "name": m["pickup_village"], "lat": m["pickup_lat"], "lng": m["pickup_lng"],
        "demand_kg": m["quantity_kg"], "ready_min": 0, "deadline_min": 480,
    } for m in members]

    vehicles = db.q(f"""select v.*, cb.payload_kg as block_kg, cb.reserve_price_per_km
                        from vehicles v left join capacity_blocks cb on cb.vehicle_id = v.id and cb.status='published'
                        where v.{_verified_true_sql()}""")
    veh_payload = [
        {"id": v["id"], "class": v["vehicle_class"],
         "capacity_kg": v["block_kg"] or v["payload_kg"],
         "cost_per_km": v["reserve_price_per_km"] or v["cost_per_km"]}
        for v in vehicles
    ] or [{"id": "IMPLIED-LCV", "class": "lcv", "capacity_kg": 7500, "cost_per_km": 30}]

    route_plan = planning.plan_routes(depot=(depot["lat"], depot["lng"]), stops=stops,
                                      vehicles=veh_payload, horizon_min=600)

    hubs = db.q("select * from hubs")
    villages = db.q("select * from villages")
    hub_choice = planning.select_hubs(villages, hubs, k=1)
    hub = hub_choice["hubs"][0] if hub_choice["hubs"] else None

    small = next((v for v in veh_payload if v["class"] in ("pickup", "tractor_trolley")), veh_payload[0])
    large = next((v for v in veh_payload if v["class"] in ("lcv", "truck")), veh_payload[-1])
    two_echelon = planning.build_two_echelon(
        pickups=[{"name": m["pickup_village"], "lat": m["pickup_lat"], "lng": m["pickup_lng"],
                  "demand_kg": m["quantity_kg"]} for m in members],
        hub=hub if (hub_choice["coverage"] or 0) > 0.5 else None,
        line_haul_vehicle=large, first_mile_vehicle=small, destination=destination,
    )
    compat_res = compat.check_set([m["commodity"] for m in members])
    total_kg = sum(float(m["quantity_kg"]) for m in members)

    plan = {
        "pool_id": pool_id,
        "total_kg": total_kg,
        "stop_count": len(stops),
        "route_plan": route_plan,
        "two_echelon": two_echelon,
        "hub_choice": {k: v for k, v in hub_choice.items() if k != "assignments"},
        "compatibility": compat_res,
        "suggested_vehicle_class": _suggest_class(total_kg),
        "generate_note": "CVRPTW solved on road-adjusted distances; two-echelon used when an approved hub covers the cluster.",
    }
    audit({"id": "system", "role": "admin"}, "plan.generate", entity_type="shipment_pool",
          entity_id=pool_id or "adhoc", after={"total_kg": total_kg})
    return plan


# --------------------------------------------------------------------------- #
# dispatch decision
# --------------------------------------------------------------------------- #
class DispatchIn(BaseModel):
    pool_id: str | None = None
    capacity_kg: float | None = None
    expected_arrival_kg: float = 0
    urgency: float = 0.5
    hours_to_deadline: float | None = None
    ready_ratio: float = 1.0


@router.post("/dispatch/decide")
def decide_dispatch(body: DispatchIn, principal: Principal = Depends(admin_only)):
    if body.pool_id:
        members = db.q("select * from shipments where pool_id = ?", (body.pool_id,))
    else:
        members = db.q("select * from shipments where status in ('planning','matched')")
    if not members:
        raise HTTPException(409, "No shipments in scope")
    pool_kg = sum(float(m["quantity_kg"]) for m in members)
    commodity = members[0]["commodity"]
    price = db.one("select price_mode from market_observations where commodity_id = ? order by obs_date desc limit 1",
                   (commodity,))
    value_per_kg = (float(price["price_mode"]) / 100) if price else 22.0
    capacity = body.capacity_kg or float(db.scalar(
        "select coalesce(sum(block_size_kg),0) from capacity_blocks where status='published'", default=0)) or pool_kg

    ready = {m["id"]: (m["status"] != "planning") for m in members}
    ready_ratio = body.ready_ratio if body.ready_ratio is not None else sum(ready.values()) / max(len(members), 1)

    result = dispatch.decide(
        pool_kg=pool_kg, capacity_kg=capacity, expected_arrival_kg=body.expected_arrival_kg,
        commodity=commodity, value_per_kg=value_per_kg, ready_ratio=ready_ratio,
        hours_to_deadline=body.hours_to_deadline, urgency=body.urgency,
    )
    did = uid("DD")
    db.insert("dispatch_decisions", {
        "id": did, "pool_id": body.pool_id, "decision": result["decision"],
        "expected_wait_benefit": result["wait_benefit"], "delay_cost": result["delay_cost"],
        "urgency_score": body.urgency, "reason": result["explanation"],
        "next_checkpoint": result["next_checkpoint"], "approved_by": None, "created_at": NOW(),
    })
    for m in members:
        event(m["id"], "dispatch_recommendation", actor_id=principal["id"],
              payload={"decision": result["decision"], "pool_id": body.pool_id})
    return {"decision_id": did, "pool_kg": pool_kg, "capacity_kg": capacity, **result}


@router.post("/dispatch/{decision_id}/approve")
def approve_dispatch(decision_id: str, principal: Principal = Depends(admin_only)):
    d = db.one("select * from dispatch_decisions where id = ?", (decision_id,))
    if not d:
        raise HTTPException(404, "Decision not found")
    db.execute("update dispatch_decisions set approved_by = ? where id = ?", (principal["id"], decision_id))
    if d["decision"] == "GO" and d["pool_id"]:
        db.execute("update shipment_pools set status = 'dispatched' where id = ?", (d["pool_id"],))
        for s in db.q("select * from shipments where pool_id = ?", (d["pool_id"],)):
            set_status(s, "confirmed", actor=principal, note="DispatchSense GO approved by Admin.")
    audit(principal, "dispatch.approve", entity_type="dispatch_decision", entity_id=decision_id,
          after={"decision": d["decision"]})
    return {"approved": True, "decision": d["decision"]}


# --------------------------------------------------------------------------- #
# ShapleySplit allocation
# --------------------------------------------------------------------------- #
@router.post("/allocations/compute")
def compute_allocations(payload: dict, principal: Principal = Depends(admin_only)):
    pool_id = payload.get("pool_id")
    members = db.q("select * from shipments where pool_id = ?", (pool_id,)) if pool_id else \
        db.q("select * from shipments where status in ('planning','matched')")
    if len(members) < 2:
        raise HTTPException(409, "At least two consignments are needed for a coalition")

    dest_row = next((m for m in members if m["dest_lat"]), members[0])
    depot = (dest_row["dest_lat"] or 30.704, dest_row["dest_lng"] or 76.223)
    commodity = members[0]["commodity"]
    vehicle_class = payload.get("vehicle_class") or _suggest_class(sum(float(m["quantity_kg"]) for m in members))
    cost_km = float(payload.get("cost_per_km") or db.scalar(
        "select coalesce(avg(reserve_price_per_km), 28) from capacity_blocks where status='published'", default=28))
    fixed = float(payload.get("fixed_cost") or 350)

    result = shapley.allocate(
        members=[{"shipment_id": m["id"], "lat": m["pickup_lat"], "lng": m["pickup_lng"]} for m in members],
        depot=depot, cost_km=cost_km, fixed=fixed, floor_at_solo=True,
    )
    cid = uid("COAL")
    db.execute("delete from cost_allocations where coalition_id in (select id from coalitions where pool_id = ?)", (pool_id,)) if pool_id else None
    db.insert("coalitions", {
        "id": cid, "pool_id": pool_id, "coalition_cost": result["coalition_cost"],
        "solo_cost_total": result["solo_total"], "method": result["method"],
        "participation_ok": 1 if result["all_allocations_acceptable"] else 0, "created_at": NOW(),
    })
    for row in result["rows"]:
        db.insert("cost_allocations", {
            "id": uid("ALLOC"), "coalition_id": cid, "shipment_id": row["shipment_id"],
            "standalone_cost": row["standalone_cost"], "allocated_share": row["allocated_share"],
            "detour_km": row["detour_contribution_km"], "saving": row["saving"],
            "participation_check": 1 if row["participation_ok"] else 0,
            "approval": "pending", "method": result["method"], "created_at": NOW(),
        })
        db.execute("update shipments set coalition_id = ?, freight_estimate = ?, status = ?, updated_at = ? where id = ?",
                   (cid, row["allocated_share"], "awaiting_sender_approval", NOW(), row["shipment_id"]))
        shp = get_shipment(row["shipment_id"])
        event(row["shipment_id"], "allocation_proposed", actor_id=principal["id"],
              payload={"allocated_share": row["allocated_share"], "saving": row["saving"]})
        notify(shp["sender_id"], f"Fair-share proposal for {shp['code']}",
               f"Your allocated share is ₹{row['allocated_share']:,.0f} (saving ₹{row['saving']:,.0f}). Please approve.",
               "action", f"/sender/shipments/{shp['id']}")
    audit(principal, "allocation.compute", entity_type="coalition", entity_id=cid,
          after={"method": result["method"], "members": [m["id"] for m in members]})
    return {"coalition_id": cid, **result, "cost_per_km": cost_km, "fixed_cost": fixed, "vehicle_class": vehicle_class}


@router.get("/allocations")
def list_allocations():
    # One row per shipment per coalition. Earlier coalitions for the same pool are
    # superseded when a pool is re-computed, so only the latest coalition per pool
    # is returned — otherwise savings are double counted in the totals.
    rows = db.q("""select ca.*, s.code, s.commodity, s.quantity_kg, s.status as shipment_status,
                          c.method, c.coalition_cost, c.solo_cost_total, c.pool_id
                   from cost_allocations ca
                   join shipments s on s.id = ca.shipment_id
                   join coalitions c on c.id = ca.coalition_id
                   where c.id in (
                       select id from coalitions c2
                       where c2.pool_id is null
                          or c2.created_at = (select max(c3.created_at) from coalitions c3
                                              where c3.pool_id = c2.pool_id))
                   order by ca.created_at desc""")
    return {"items": rows,
            "summary": {
                "total_allocated": round(sum(float(r["allocated_share"]) for r in rows), 2),
                "total_saving": round(sum(float(r["saving"]) for r in rows), 2),
                "pending": sum(1 for r in rows if r["approval"] == "pending"),
                "approved": sum(1 for r in rows if r["approval"] == "approved"),
                "rejected": sum(1 for r in rows if r["approval"] == "rejected"),
            }}


# --------------------------------------------------------------------------- #
# assignment + trips
# --------------------------------------------------------------------------- #
class AssignIn(BaseModel):
    pool_id: str
    transporter_id: str
    vehicle_id: str
    revenue: float | None = None


@router.post("/assignments")
def create_assignment(body: AssignIn, principal: Principal = Depends(admin_only)):
    v = db.one("select * from vehicles where id = ? and transporter_id = ?", (body.vehicle_id, body.transporter_id))
    if not v:
        raise HTTPException(404, "Vehicle/transporter mismatch")
    if not v["verified"]:
        raise HTTPException(409, "Vehicle must be verified before assignment")
    members = db.q("select * from shipments where pool_id = ?", (body.pool_id,))
    if not members:
        raise HTTPException(404, "Pool has no shipments")
    total_kg = sum(float(m["quantity_kg"]) for m in members)
    if total_kg > float(v["payload_kg"]):
        raise HTTPException(409, f"Pool load {total_kg:,.0f} kg exceeds vehicle payload {v['payload_kg']:,} kg")

    pending = [m for m in members if not m["coalition_id"]]
    if pending:
        raise HTTPException(409, "Compute the fair-share allocation before assigning a vehicle")

    dest = next((m for m in members if m["dest_lat"]), members[0])
    km = sum(road_km(m["pickup_lat"], m["pickup_lng"], dest["dest_lat"] or 30.7, dest["dest_lng"] or 76.2) for m in members)
    revenue = body.revenue or round(km * float(v["cost_per_km"]), 2)
    aid = uid("ASG")
    db.insert("transport_assignments", {
        "id": aid, "pool_id": body.pool_id, "transporter_id": body.transporter_id,
        "vehicle_id": body.vehicle_id, "status": "proposed", "revenue": revenue,
        "distance_km": round(km, 2), "ready_check": "pending",
        "created_at": NOW(), "updated_at": NOW(),
    })
    tid = uid("TRIP")
    db.insert("trips", {"id": tid, "assignment_id": aid, "trip_code": f"CX-TRIP-{tid[-4:].upper()}",
                        "status": "planned", "vehicle_id": body.vehicle_id, "created_at": NOW()})
    for m in members:
        db.insert("trip_shipments", {"trip_id": tid, "shipment_id": m["id"]})
        event(m["id"], "assignment_proposed", actor_id=principal["id"],
              payload={"transporter_id": body.transporter_id, "vehicle": v["reg_no"]})
        notify(m["sender_id"], f"Transport proposed for {m['code']}",
               f"{v['reg_no']} ({v['vehicle_class']}) · awaiting your approval and transporter acceptance.",
               "info", f"/sender/shipments/{m['id']}")
    notify(body.transporter_id, "New assignment offer",
           f"{len(members)} consignment(s) on pool {body.pool_id} · ₹{revenue:,.0f}", "action", "/transporter/assignments")
    db.execute("update capacity_blocks set status = 'reserved' where vehicle_id = ? and status = 'published'", (body.vehicle_id,))
    db.execute("update vehicles set availability = 'assigned' where id = ?", (body.vehicle_id,))
    audit(principal, "assignment.create", entity_type="transport_assignment", entity_id=aid,
          after={"pool_id": body.pool_id, "vehicle": body.vehicle_id, "revenue": revenue})
    return {"assignment_id": aid, "trip_id": tid, "revenue": revenue, "distance_km": round(km, 2),
            "message": "Assignment proposed. Awaiting sender approval and transporter acceptance."}


@router.get("/assignments")
def list_assignments():
    rows = db.q("""select ta.*, p.full_name as transporter_name, v.reg_no, v.vehicle_class,
                          sp.corridor, sp.total_kg,
                          (select count(*) from trip_shipments ts where ts.trip_id in
                             (select id from trips where assignment_id = ta.id)) as shipments,
                          (select count(*) from cost_allocations ca join shipments s on s.id = ca.shipment_id
                             where s.pool_id = ta.pool_id and ca.approval = 'approved') as sender_approvals
                   from transport_assignments ta
                   left join profiles p on p.id = ta.transporter_id
                   left join vehicles v on v.id = ta.vehicle_id
                   left join shipment_pools sp on sp.id = ta.pool_id
                   order by ta.created_at desc""")
    return {"items": rows}


@router.post("/assignments/{assignment_id}/confirm")
def confirm_assignment(assignment_id: str, principal: Principal = Depends(admin_only)):
    a = db.one("select * from transport_assignments where id = ?", (assignment_id,))
    if not a:
        raise HTTPException(404, "Assignment not found")
    if a["status"] not in ("transporter_accepted", "sender_approved"):
        raise HTTPException(409, f"Assignment is '{a['status']}' — both sender approval and transporter acceptance are required")
    members = db.q("select s.* from shipments s join trip_shipments ts on ts.shipment_id = s.id "
                   "join trips t on t.id = ts.trip_id where t.assignment_id = ?", (assignment_id,))
    unapproved = [m for m in members if not m["freight_approved"]]
    if unapproved:
        raise HTTPException(409, "Sender approval is still missing for: " + ", ".join(m["code"] for m in unapproved))
    db.execute("update transport_assignments set status = 'confirmed', updated_at = ? where id = ?", (NOW(), assignment_id))
    for m in members:
        set_status(m, "confirmed", actor=principal, note="Admin confirmed the assignment.")
    audit(principal, "assignment.confirm", entity_type="transport_assignment", entity_id=assignment_id)
    return {"status": "confirmed"}


@router.post("/assignments/{assignment_id}/cancel")
def cancel_assignment(assignment_id: str, payload: dict, principal: Principal = Depends(admin_only)):
    a = db.one("select * from transport_assignments where id = ?", (assignment_id,))
    if not a:
        raise HTTPException(404, "Assignment not found")
    db.execute("update transport_assignments set status = 'cancelled', updated_at = ? where id = ?", (NOW(), assignment_id))
    db.execute("update vehicles set availability = 'available' where id = ?", (a["vehicle_id"],))
    db.execute("update capacity_blocks set status = 'published' where vehicle_id = ? and status='reserved'", (a["vehicle_id"],))
    disruption = uid("DIS")
    db.insert("disruption_events", {
        "id": disruption, "trip_id": None, "event_type": payload.get("event_type", "cancellation"),
        "description": payload.get("reason", "Assignment cancelled by Admin"),
        "reported_by": principal["id"], "detected_at": NOW(), "severity": "high",
    })
    audit(principal, "assignment.cancel", entity_type="transport_assignment", entity_id=assignment_id,
          after={"reason": payload.get("reason")})
    return {"status": "cancelled", "disruption_id": disruption,
            "next": "Run ShadowFleet-Heal to generate recovery options for the affected loads."}


# --------------------------------------------------------------------------- #
# delivery coordination
# --------------------------------------------------------------------------- #
class DeliveryIn(BaseModel):
    shipment_id: str
    delivered_qty_kg: float | None = None
    pod_ref: str | None = None
    external_ack_ref: str | None = None
    shortage_note: str | None = None
    damage_note: str | None = None
    verify: bool = False


@router.post("/deliveries")
def record_delivery(body: DeliveryIn, principal: Principal = Depends(admin_only)):
    s = get_shipment(body.shipment_id)
    if not s:
        raise HTTPException(404, "Shipment not found")
    did = uid("DEL")
    db.insert("delivery_confirmations", {
        "id": did, "shipment_id": s["id"], "trip_id": None,
        "delivered_qty_kg": body.delivered_qty_kg, "pod_ref": body.pod_ref,
        "external_ack_ref": body.external_ack_ref, "shortage_note": body.shortage_note,
        "damage_note": body.damage_note, "recorded_by": principal["id"],
        "verified_by": principal["id"] if body.verify else None,
        "status": "admin_verified" if body.verify else "recorded", "created_at": NOW(),
    })
    if body.verify:
        set_status(s, "delivered", actor=principal, note="Delivery verified by Admin.")
    event(s["id"], "delivery_recorded", actor_id=principal["id"],
          payload={"delivered_qty_kg": body.delivered_qty_kg, "verified": body.verify})
    audit(principal, "delivery.record", entity_type="shipment", entity_id=s["id"],
          after={"verified": body.verify})
    return {"id": did, "status": "admin_verified" if body.verify else "recorded"}


@router.get("/deliveries")
def list_deliveries():
    rows = db.q("""select dc.*, s.code, s.commodity, s.quantity_kg, s.destination_name, s.status as shipment_status
                   from delivery_confirmations dc join shipments s on s.id = dc.shipment_id
                   order by dc.created_at desc""")
    pending = db.q("""select s.id, s.code, s.commodity, s.quantity_kg, s.destination_name, s.status
                      from shipments s where s.status in ('in_transit','at_transfer_hub','out_for_delivery')
                      and s.id not in (select shipment_id from delivery_confirmations)""")
    return {"items": rows, "awaiting_confirmation": pending}


# --------------------------------------------------------------------------- #
# monitoring: trips, vehicles, audit, support
# --------------------------------------------------------------------------- #
@router.get("/trips")
def list_trips():
    trips = db.q("""select t.*, ta.revenue, ta.distance_km, v.reg_no, v.vehicle_class,
                           p.full_name as transporter_name, ta.status as assignment_status
                    from trips t left join transport_assignments ta on ta.id = t.assignment_id
                    left join vehicles v on v.id = t.vehicle_id
                    left join profiles p on p.id = ta.transporter_id
                    order by t.created_at desc""")
    for t in trips:
        t["shipments"] = db.q("""select s.id, s.code, s.commodity, s.quantity_kg, s.status, s.destination_name,
                                        s.pickup_village, s.pickup_lat, s.pickup_lng
                                 from shipments s join trip_shipments ts on ts.shipment_id = s.id
                                 where ts.trip_id = ?""", (t["id"],))
        t["legs"] = db.q("select * from trip_legs where trip_id = ? order by leg_no", (t["id"],))
    return {"items": trips}


@router.get("/tower")
def control_tower():
    """Everything the digital-twin map needs in one payload."""
    shipments = db.q("select * from shipments where status not in ('cancelled')")
    return {
        "villages": db.q("select * from villages"),
        "hubs": db.q("select * from hubs"),
        "mandis": db.q("select * from mandis"),
        "road_edges": db.q("select * from road_edges"),
        "vehicles": db.q("select v.*, p.full_name as transporter_name from vehicles v join profiles p on p.id = v.transporter_id"),
        "shipments": [shipment_view(s) for s in shipments],
        "trips": db.q("""select t.*, ta.transporter_id, v.reg_no from trips t
                         left join transport_assignments ta on ta.id = t.assignment_id
                         left join vehicles v on v.id = t.vehicle_id"""),
        "disruptions": db.q("select * from disruption_events order by detected_at desc limit 10"),
        "monsoon_mode": bool(db.scalar("select count(*) from road_edges where monsoon_risk > 0.45", default=0)),
        "note": "Map shows operational checkpoints and planned routes — not live GPS.",
    }


@router.get("/audit")
def audit_logs(page: int = 1, page_size: int = 50, entity_type: str | None = Query(None)):
    sql = "select * from audit_logs"
    params: list = []
    if entity_type:
        sql += " where entity_type = ?"
        params.append(entity_type)
    sql += " order by created_at desc limit 500"
    return paginate(db.q(sql, params), page, page_size)


@router.get("/system")
def system_health():
    return {
        "db_dialect": db.dialect(),
        "tables": {
            t: db.scalar(f"select count(*) from {t}", default=0)
            for t in ("profiles", "shipments", "vehicles", "capacity_blocks", "transport_assignments",
                      "trips", "cost_allocations", "simulation_runs", "audit_logs")
        },
        "roles": {"sender": "active", "transporter": "active", "admin": "active",
                  "receiver": "NOT A CARGOX ROLE", "fpo": "NOT A CARGOX ROLE"},
        "feature_flags": {
            "google_oauth": bool(settings.GOOGLE_CLIENT_ID),
            "voice_asr": "typed transcript (see /api/voice/parse)",
            "live_gps": "modelled from trip plans; recorded once a device posts /api/tracking/ping",
            "map_basemap": "bundled India district geometry (+ optional raster tiles)",
            "coverage": "36 states/UTs · 801 districts · 4,335 towns",
            "payments": "fictional credit ledger only",
        },
        "data_policy": "All operational demo data is synthetic and labelled as such.",
    }