"""Transporter operations: assignments, trip execution, return loads."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db
from ..algorithms import backhaul
from ..core.security import Principal, transporter_only
from ..services import arrival
from ..services.common import NOW, audit, event, notify, set_status, uid

router = APIRouter(prefix="/api", tags=["transporters-ops"])


def _tid(principal: Principal) -> str:
    return str(principal["id"])


def _is_postgres() -> bool:
    return (db.dialect() or "").lower() in ("postgres", "postgresql")


def _approved_true_sql(alias: str = "s") -> str:
    col = f"{alias}.freight_approved" if alias else "freight_approved"
    return f"coalesce({col}, false) is true" if _is_postgres() else f"coalesce({col}, 0) = 1"


# --------------------------------------------------------------------------- #
# assignments visible to the transporter
# --------------------------------------------------------------------------- #
@router.get("/assignments/available")
def available_assignments(principal: Principal = Depends(transporter_only)):
    """Only Admin-authorised assignments for this transporter are shown."""
    tid = _tid(principal)
    rows = db.q(
        """select ta.*, v.reg_no, v.vehicle_class, v.payload_kg,
                  sp.corridor, sp.total_kg
           from transport_assignments ta
           left join vehicles v on v.id = ta.vehicle_id
           left join shipment_pools sp on sp.id = ta.pool_id
           where ta.transporter_id = ? order by ta.created_at desc""",
        (tid,),
    )
    for r in rows:
        aid = str(r["id"])
        r["id"] = aid
        r["shipments"] = db.q(
            """select s.id, s.code, s.commodity, s.quantity_kg, s.pickup_village, s.destination_name,
                      s.pickup_lat, s.pickup_lng, s.dest_lat, s.dest_lng, s.deadline, s.status
               from shipments s join trip_shipments ts on ts.shipment_id = s.id
               join trips t on t.id = ts.trip_id where t.assignment_id = ?""",
            (aid,),
        )
        r["sender_approved"] = (
            all(
                bool(db.scalar(f"select {_approved_true_sql('')} from shipments where id = ?", (str(s["id"]),), False))
                for s in r["shipments"]
            )
            if r["shipments"]
            else False
        )
        r["arrival"] = arrival.clock_for(aid)
    return {
        "items": rows,
        "open": [r for r in rows if r.get("status") == "proposed"],
        "active": [r for r in rows if r.get("status") in ("transporter_accepted", "sender_approved", "confirmed")],
        "completed": [r for r in rows if r.get("status") in ("completed", "cancelled", "transporter_rejected")],
    }


class AssignmentResponse(BaseModel):
    action: str  # accept | reject
    reason: str | None = None


@router.post("/assignments/{assignment_id}/respond")
def respond_assignment(
    assignment_id: str,
    body: AssignmentResponse,
    principal: Principal = Depends(transporter_only),
):
    tid = _tid(principal)
    aid = str(assignment_id)
    a = db.one("select * from transport_assignments where id = ? and transporter_id = ?", (aid, tid))
    if not a:
        raise HTTPException(404, "Assignment not found for this account")
    if a.get("status") not in ("proposed", "transporter_rejected"):
        raise HTTPException(409, f"Assignment is already '{a.get('status')}'")
    if body.action == "accept":
        members = db.q(
            """select s.* from shipments s join trip_shipments ts on ts.shipment_id = s.id
               join trips t on t.id = ts.trip_id where t.assignment_id = ?""",
            (aid,),
        )
        missing = [m["code"] for m in members if not m.get("freight_approved")]
        if missing:
            raise HTTPException(409, "Sender approval is still pending for: " + ", ".join(missing))
        accepted_at = NOW()
        db.execute(
            "update transport_assignments set status = 'transporter_accepted', accepted_at = ?, updated_at = ? where id = ?",
            (accepted_at, accepted_at, aid),
        )
        msg = "Assignment accepted. Admin will confirm dispatch after the readiness check-in."
    elif body.action == "reject":
        if not body.reason:
            raise HTTPException(400, "A reason is required to reject an assignment")
        db.execute(
            "update transport_assignments set status = 'transporter_rejected', updated_at = ? where id = ?",
            (NOW(), aid),
        )
        did = uid("DIS")
        db.insert(
            "disruption_events",
            {
                "id": did,
                "trip_id": None,
                "event_type": "cancellation",
                "description": body.reason,
                "reported_by": tid,
                "detected_at": NOW(),
                "severity": "high",
            },
        )
        for admin in db.q("select id from profiles where role='admin'"):
            notify(str(admin["id"]), "Transporter rejected an assignment", body.reason, "warning", "/admin/recovery")
        msg = "Assignment rejected. Admin has been notified to run ShadowFleet-Heal."
    else:
        raise HTTPException(400, "action must be 'accept' or 'reject'")
    audit(
        principal,
        f"assignment.{body.action}",
        entity_type="transport_assignment",
        entity_id=aid,
        after={"reason": body.reason},
    )
    out = {"status": "accepted" if body.action == "accept" else "rejected", "message": msg}
    if body.action == "accept":
        out["arrival"] = arrival.clock_for(aid)
    return out


@router.get("/assignments/{assignment_id}/arrival")
def assignment_arrival(assignment_id: str, principal: Principal = Depends(transporter_only)):
    """The pickup arrival clock for one accepted assignment (single source of truth)."""
    tid = _tid(principal)
    aid = str(assignment_id)
    a = db.one("select * from transport_assignments where id = ? and transporter_id = ?", (aid, tid))
    if not a:
        raise HTTPException(404, "Assignment not found for this account")
    clock = arrival.clock_for(aid)
    if not clock:
        raise HTTPException(404, "Assignment not found")
    return clock


# --------------------------------------------------------------------------- #
# trips
# --------------------------------------------------------------------------- #
@router.get("/trips/mine")
def my_trips(principal: Principal = Depends(transporter_only)):
    tid = _tid(principal)
    trips = db.q(
        """select t.*, ta.revenue, ta.distance_km, ta.status as assignment_status, v.reg_no, v.vehicle_class
           from trips t join transport_assignments ta on ta.id = t.assignment_id
           left join vehicles v on v.id = t.vehicle_id
           where ta.transporter_id = ? order by t.created_at desc""",
        (tid,),
    )
    for t in trips:
        trip_id = str(t["id"])
        t["id"] = trip_id
        t["shipments"] = db.q(
            """select s.id, s.code, s.commodity, s.quantity_kg, s.status, s.pickup_village,
                      s.destination_name, s.pickup_lat, s.pickup_lng
               from shipments s join trip_shipments ts on ts.shipment_id = s.id where ts.trip_id = ?""",
            (trip_id,),
        )
        t["legs"] = db.q("select * from trip_legs where trip_id = ? order by leg_no", (trip_id,))
        t["next_action"] = _next_action(t.get("status") or "planned")
        t["arrival"] = arrival.clock_for(str(t["assignment_id"])) if t.get("assignment_id") else None
    return {"items": trips}


def _next_action(status: str) -> str:
    return {
        "planned": "start",
        "loading": "confirm_loading",
        "in_transit": "confirm_delivery",
        "at_hub": "depart_hub",
        "out_for_delivery": "confirm_delivery",
        "delivered": "closed",
        "cancelled": "closed",
    }.get(status, "start")


class TripActionIn(BaseModel):
    action: str
    note: str | None = None
    leg_no: int | None = None


TRIP_TRANSITIONS = {
    "start": ("planned", "loading", "Trip started — loading in progress."),
    "confirm_loading": ("loading", "in_transit", "Loading confirmed, vehicle departed."),
    "arrive_hub": ("in_transit", "at_hub", "Arrived at the transfer hub."),
    "depart_hub": ("at_hub", "out_for_delivery", "Departed hub for final delivery."),
    "report_delay": (None, None, ""),
    "breakdown": (None, None, ""),
}


@router.post("/trips/{trip_id}/action")
def trip_action(trip_id: str, body: TripActionIn, principal: Principal = Depends(transporter_only)):
    tid = _tid(principal)
    trip_key = str(trip_id)
    t = db.one(
        """select t.*, ta.transporter_id from trips t
           left join transport_assignments ta on ta.id = t.assignment_id where t.id = ?""",
        (trip_key,),
    )
    if not t or str(t.get("transporter_id") or "") != tid:
        raise HTTPException(404, "Trip not found for this account")
    shipments = db.q(
        """select s.* from shipments s join trip_shipments ts on ts.shipment_id = s.id
           where ts.trip_id = ?""",
        (trip_key,),
    )

    if body.action in ("report_delay", "breakdown"):
        db.execute("update trips set delay_reported = ? where id = ?", (body.note or body.action, trip_key))
        did = uid("DIS")
        db.insert(
            "disruption_events",
            {
                "id": did,
                "trip_id": trip_key,
                "event_type": "breakdown" if body.action == "breakdown" else "delay",
                "description": body.note or body.action,
                "reported_by": tid,
                "detected_at": NOW(),
                "severity": "high" if body.action == "breakdown" else "medium",
            },
        )
        for admin in db.q("select id from profiles where role='admin'"):
            notify(
                str(admin["id"]),
                f"Trip {t.get('trip_code') or trip_key}: {body.action.replace('_', ' ')}",
                body.note or "",
                "warning",
                "/admin/recovery",
            )
        event(trip_key, body.action, entity_type="trip", actor_id=tid, payload={"note": body.note})
        return {"disruption_id": did, "message": "Reported. Admin can run ShadowFleet-Heal for recovery options."}

    if body.action == "confirm_delivery":
        if not shipments:
            raise HTTPException(409, "This trip has no shipments")
        db.execute("update trips set status = 'delivered', finished_at = ? where id = ?", (NOW(), trip_key))
        for s in shipments:
            sid = str(s["id"])
            db.insert(
                "delivery_confirmations",
                {
                    "id": uid("DEL"),
                    "shipment_id": sid,
                    "trip_id": trip_key,
                    "delivered_qty_kg": s.get("quantity_kg"),
                    "pod_ref": f"storage://pod/{trip_key}-{s.get('code') or sid}.jpg",
                    "recorded_by": tid,
                    "status": "recorded",
                    "created_at": NOW(),
                },
            )
            set_status(
                s,
                "out_for_delivery" if s.get("status") != "delivered" else s["status"],
                actor=principal,
                note="Transporter arrived at destination; awaiting Admin verification.",
            )
            event(
                sid,
                "delivery_reported",
                actor_id=tid,
                payload={"pod_ref": f"storage://pod/{trip_key}-{s.get('code') or sid}.jpg"},
            )
        if t.get("vehicle_id"):
            db.execute("update vehicles set availability = 'available' where id = ?", (str(t["vehicle_id"]),))
        for admin in db.q("select id from profiles where role='admin'"):
            notify(
                str(admin["id"]),
                f"Delivery reported for {t.get('trip_code') or trip_key}",
                "Verify POD and external destination acknowledgement to close the shipment.",
                "action",
                "/admin/deliveries",
            )
        return {"status": "delivered", "message": "Delivery recorded. Admin must verify POD and destination acknowledgement."}

    t_from, t_to, note = TRIP_TRANSITIONS.get(body.action, (None, None, ""))
    if not t_to:
        raise HTTPException(400, f"Unknown action '{body.action}'")
    if t.get("status") != t_from:
        raise HTTPException(409, f"Trip is '{t.get('status')}' — '{body.action}' requires '{t_from}'")
    db.execute(
        "update trips set status = ?, started_at = coalesce(started_at, ?) where id = ?",
        (t_to, NOW() if body.action == "start" else None, trip_key),
    )
    status_map = {
        "loading": "ready_for_pickup",
        "in_transit": "in_transit",
        "at_hub": "at_transfer_hub",
        "out_for_delivery": "out_for_delivery",
    }
    for s in shipments:
        set_status(s, status_map[t_to], actor=principal, note=note)
    event(trip_key, f"trip_{body.action}", entity_type="trip", actor_id=tid, payload={"to": t_to})
    audit(principal, f"trip.{body.action}", entity_type="trip", entity_id=trip_key, after={"status": t_to})
    return {"status": t_to, "message": note}


# --------------------------------------------------------------------------- #
# return loads
# --------------------------------------------------------------------------- #
@router.get("/backhaul/opportunities")
def return_loads(trip_id: str | None = None, principal: Principal = Depends(transporter_only)):
    tid = _tid(principal)
    trips = db.q(
        """select t.*, v.vehicle_class, v.payload_kg, v.cost_per_km, s.dest_lat, s.dest_lng
           from trips t
           join transport_assignments ta on ta.id = t.assignment_id
           left join vehicles v on v.id = t.vehicle_id
           left join trip_shipments ts on ts.trip_id = t.id
           left join shipments s on s.id = ts.shipment_id
           where ta.transporter_id = ?
           order by t.created_at desc""",
        (tid,),
    )
    trip = next((x for x in trips if str(x["id"]) == str(trip_id or "")), trips[0] if trips else None)
    existing = db.q("select * from return_load_offers where transporter_id = ? order by created_at desc", (tid,))
    if not trip:
        return {
            "items": [],
            "offers": existing,
            "note": "No trips yet — return-load matching needs an executed trip corridor.",
        }
    actual_trip_id = str(trip["id"])
    v = db.one("select * from vehicles where id = ?", (str(trip["vehicle_id"]),)) if trip.get("vehicle_id") else None
    outbound = db.one(
        """select s.commodity from shipments s join trip_shipments ts on ts.shipment_id = s.id
           where ts.trip_id = ? limit 1""",
        (actual_trip_id,),
    )
    opps = backhaul.opportunities(
        trip_end=(float(trip.get("dest_lat") or 30.9), float(trip.get("dest_lng") or 75.85)),
        next_committed=(30.8421, 76.1520),
        vehicle_class=(v.get("vehicle_class") if v else None) or trip.get("vehicle_class") or "lcv",
        capacity_kg=int((v.get("payload_kg") if v else None) or trip.get("payload_kg") or 7500),
        outbound_commodity=(outbound or {}).get("commodity") or "wheat",
        cost_per_km=float((v.get("cost_per_km") if v else None) or trip.get("cost_per_km") or 22),
    )
    return {
        "items": opps,
        "trip_id": actual_trip_id,
        "offers": existing,
        "note": "Return loads are suggestions only. Accept only when revenue beats incremental cost.",
    }


class OfferIn(BaseModel):
    cargo_type: str
    from_name: str = "Return corridor"
    to_name: str = "Ludhiana"
    extra_distance_km: float
    revenue: float
    time_hours: float = 1.0
    accept: bool = True


@router.post("/backhaul/offers")
def respond_offer(body: OfferIn, principal: Principal = Depends(transporter_only)):
    tid = _tid(principal)
    oid = uid("RLO")
    db.insert(
        "return_load_offers",
        {
            "id": oid,
            "trip_id": None,
            "transporter_id": tid,
            "cargo_type": body.cargo_type,
            "from_name": body.from_name,
            "to_name": body.to_name,
            "extra_distance_km": body.extra_distance_km,
            "revenue": body.revenue,
            "time_hours": body.time_hours,
            "compatible": 1,
            "status": "accepted" if body.accept else "rejected",
            "created_at": NOW(),
        },
    )
    audit(
        principal,
        "backhaul.respond",
        entity_type="return_load_offer",
        entity_id=oid,
        after={"accept": body.accept},
    )
    for admin in db.q("select id from profiles where role='admin'"):
        notify(
            str(admin["id"]),
            f"Return load {'accepted' if body.accept else 'rejected'}",
            f"{body.cargo_type} · ₹{body.revenue:,.0f}",
            "info",
            "/admin/backhaul",
        )
    return {"id": oid, "status": "accepted" if body.accept else "rejected"}