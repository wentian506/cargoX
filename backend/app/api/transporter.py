"""Transporter operations: assignments, trip execution, return loads."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db
from ..algorithms import backhaul
from ..core.security import Principal, admin_only, transporter_only
from ..services import arrival
from ..services.common import NOW, audit, event, notify, set_status, uid

router = APIRouter(prefix="/api", tags=["transporters-ops"])


# --------------------------------------------------------------------------- #
# assignments visible to the transporter
# --------------------------------------------------------------------------- #
@router.get("/assignments/available")
def available_assignments(principal: Principal = Depends(transporter_only)):
    """Only Admin-authorised assignments for this transporter are shown."""
    rows = db.q(
        """select ta.*, v.reg_no, v.vehicle_class, v.payload_kg,
                  sp.corridor, sp.total_kg
           from transport_assignments ta
           left join vehicles v on v.id = ta.vehicle_id
           left join shipment_pools sp on sp.id = ta.pool_id
           where ta.transporter_id = ? order by ta.created_at desc""",
        (principal["id"],),
    )
    for r in rows:
        r["shipments"] = db.q(
            """select s.id, s.code, s.commodity, s.quantity_kg, s.pickup_village, s.destination_name,
                      s.pickup_lat, s.pickup_lng, s.dest_lat, s.dest_lng, s.deadline, s.status
               from shipments s join trip_shipments ts on ts.shipment_id = s.id
               join trips t on t.id = ts.trip_id where t.assignment_id = ?""",
            (r["id"],),
        )
        r["sender_approved"] = all(
            bool(db.scalar("select freight_approved from shipments where id = ?", (s["id"],), 0))
            for s in r["shipments"]
        ) if r["shipments"] else False
        # pickup arrival clock: idle until the transporter accepts, then counts down
        r["arrival"] = arrival.clock_for(r["id"])
    return {
        "items": rows,
        "open": [r for r in rows if r["status"] == "proposed"],
        "active": [r for r in rows if r["status"] in ("transporter_accepted", "sender_approved", "confirmed")],
        "completed": [r for r in rows if r["status"] in ("completed", "cancelled", "transporter_rejected")],
    }


class AssignmentResponse(BaseModel):
    action: str  # accept | reject
    reason: str | None = None


@router.post("/assignments/{assignment_id}/respond")
def respond_assignment(assignment_id: str, body: AssignmentResponse,
                       principal: Principal = Depends(transporter_only)):
    a = db.one("select * from transport_assignments where id = ? and transporter_id = ?", (assignment_id, principal["id"]))
    if not a:
        raise HTTPException(404, "Assignment not found for this account")
    if a["status"] not in ("proposed", "transporter_rejected"):
        raise HTTPException(409, f"Assignment is already '{a['status']}'")
    if body.action == "accept":
        members = db.q("""select s.* from shipments s join trip_shipments ts on ts.shipment_id = s.id
                          join trips t on t.id = ts.trip_id where t.assignment_id = ?""", (assignment_id,))
        missing = [m["code"] for m in members if not m["freight_approved"]]
        if missing:
            raise HTTPException(409, "Sender approval is still pending for: " + ", ".join(missing))
        accepted_at = NOW()
        db.execute(
            "update transport_assignments set status = 'transporter_accepted', accepted_at = ?, updated_at = ? where id = ?",
            (accepted_at, accepted_at, assignment_id))
        msg = "Assignment accepted. Admin will confirm dispatch after the readiness check-in."
    else:
        if not body.reason:
            raise HTTPException(400, "A reason is required to reject an assignment")
        db.execute("update transport_assignments set status = 'transporter_rejected', updated_at = ? where id = ?",
                   (NOW(), assignment_id))
        did = uid("DIS")
        db.insert("disruption_events", {"id": did, "trip_id": None, "event_type": "cancellation",
                                        "description": body.reason, "reported_by": principal["id"],
                                        "detected_at": NOW(), "severity": "high"})
        for admin in db.q("select id from profiles where role='admin'"):
            notify(admin["id"], "Transporter rejected an assignment", body.reason, "warning", "/admin/recovery")
        msg = "Assignment rejected. Admin has been notified to run ShadowFleet-Heal."
    audit(principal, f"assignment.{body.action}", entity_type="transport_assignment", entity_id=assignment_id,
          after={"reason": body.reason})
    out = {"status": "accepted" if body.action == "accept" else "rejected", "message": msg}
    if body.action == "accept":
        out["arrival"] = arrival.clock_for(assignment_id)   # the clock starts now
    return out


@router.get("/assignments/{assignment_id}/arrival")
def assignment_arrival(assignment_id: str, principal: Principal = Depends(transporter_only)):
    """The pickup arrival clock for one accepted assignment (single source of truth)."""
    a = db.one("select * from transport_assignments where id = ? and transporter_id = ?",
               (assignment_id, principal["id"]))
    if not a:
        raise HTTPException(404, "Assignment not found for this account")
    clock = arrival.clock_for(assignment_id)
    if not clock:
        raise HTTPException(404, "Assignment not found")
    return clock


# --------------------------------------------------------------------------- #
# trips
# --------------------------------------------------------------------------- #
@router.get("/trips/mine")
def my_trips(principal: Principal = Depends(transporter_only)):
    trips = db.q(
        """select t.*, ta.revenue, ta.distance_km, ta.status as assignment_status, v.reg_no, v.vehicle_class
           from trips t join transport_assignments ta on ta.id = t.assignment_id
           left join vehicles v on v.id = t.vehicle_id
           where ta.transporter_id = ? order by t.created_at desc""",
        (principal["id"],),
    )
    for t in trips:
        t["shipments"] = db.q(
            """select s.id, s.code, s.commodity, s.quantity_kg, s.status, s.pickup_village,
                      s.destination_name, s.pickup_lat, s.pickup_lng
               from shipments s join trip_shipments ts on ts.shipment_id = s.id where ts.trip_id = ?""",
            (t["id"],),
        )
        t["legs"] = db.q("select * from trip_legs where trip_id = ? order by leg_no", (t["id"],))
        t["next_action"] = _next_action(t["status"])
        t["arrival"] = arrival.clock_for(t["assignment_id"]) if t.get("assignment_id") else None
    return {"items": trips}


def _next_action(status: str) -> str:
    return {
        "planned": "start", "loading": "confirm_loading", "in_transit": "confirm_delivery",
        "at_hub": "depart_hub", "out_for_delivery": "confirm_delivery",
        "delivered": "closed", "cancelled": "closed",
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
    t = db.one("""select t.*, ta.transporter_id from trips t
                  left join transport_assignments ta on ta.id = t.assignment_id where t.id = ?""", (trip_id,))
    if not t or t["transporter_id"] != principal["id"]:
        raise HTTPException(404, "Trip not found for this account")
    shipments = db.q("""select s.* from shipments s join trip_shipments ts on ts.shipment_id = s.id
                        where ts.trip_id = ?""", (trip_id,))

    if body.action in ("report_delay", "breakdown"):
        db.execute("update trips set delay_reported = ? where id = ?", (body.note or body.action, trip_id))
        did = uid("DIS")
        db.insert("disruption_events", {
            "id": did, "trip_id": trip_id,
            "event_type": "breakdown" if body.action == "breakdown" else "delay",
            "description": body.note or body.action, "reported_by": principal["id"],
            "detected_at": NOW(), "severity": "high" if body.action == "breakdown" else "medium",
        })
        for admin in db.q("select id from profiles where role='admin'"):
            notify(admin["id"], f"Trip {t['trip_code']}: {body.action.replace('_',' ')}",
                   body.note or "", "warning", "/admin/recovery")
        event(trip_id, body.action, entity_type="trip", actor_id=principal["id"], payload={"note": body.note})
        return {"disruption_id": did, "message": "Reported. Admin can run ShadowFleet-Heal for recovery options."}

    if body.action == "confirm_delivery":
        if not shipments:
            raise HTTPException(409, "This trip has no shipments")
        db.execute("update trips set status = 'delivered', finished_at = ? where id = ?", (NOW(), trip_id))
        for s in shipments:
            db.insert("delivery_confirmations", {
                "id": uid("DEL"), "shipment_id": s["id"], "trip_id": trip_id,
                "delivered_qty_kg": s["quantity_kg"], "pod_ref": f"storage://pod/{trip_id}-{s['code']}.jpg",
                "recorded_by": principal["id"], "status": "recorded", "created_at": NOW(),
            })
            set_status(s, "out_for_delivery" if s["status"] != "delivered" else s["status"],
                       actor=principal, note="Transporter arrived at destination; awaiting Admin verification.")
            event(s["id"], "delivery_reported", actor_id=principal["id"],
                  payload={"pod_ref": f"storage://pod/{trip_id}-{s['code']}.jpg"})
        db.execute("update vehicles set availability = 'available' where id = ?", (t["vehicle_id"],))
        for admin in db.q("select id from profiles where role='admin'"):
            notify(admin["id"], f"Delivery reported for {t['trip_code']}",
                   "Verify POD and external destination acknowledgement to close the shipment.",
                   "action", "/admin/deliveries")
        return {"status": "delivered", "message": "Delivery recorded. Admin must verify POD and destination acknowledgement."}

    t_from, t_to, note = TRIP_TRANSITIONS.get(body.action, (None, None, ""))
    if not t_to:
        raise HTTPException(400, f"Unknown action '{body.action}'")
    if t["status"] != t_from:
        raise HTTPException(409, f"Trip is '{t['status']}' — '{body.action}' requires '{t_from}'")
    db.execute("update trips set status = ?, started_at = coalesce(started_at, ?) where id = ?",
               (t_to, NOW() if body.action == "start" else None, trip_id))
    status_map = {"loading": "ready_for_pickup", "in_transit": "in_transit", "at_hub": "at_transfer_hub",
                  "out_for_delivery": "out_for_delivery"}
    for s in shipments:
        set_status(s, status_map[t_to], actor=principal, note=note)
    event(trip_id, f"trip_{body.action}", entity_type="trip", actor_id=principal["id"], payload={"to": t_to})
    audit(principal, f"trip.{body.action}", entity_type="trip", entity_id=trip_id, after={"status": t_to})
    return {"status": t_to, "message": note}


# --------------------------------------------------------------------------- #
# return loads
# --------------------------------------------------------------------------- #
@router.get("/backhaul/opportunities")
def return_loads(trip_id: str | None = None, principal: Principal = Depends(transporter_only)):
    trips = db.q("""select t.*, v.vehicle_class, v.payload_kg, s.dest_lat, s.dest_lng
                    from trips t left join vehicles v on v.id = t.vehicle_id
                    left join trip_shipments ts on ts.trip_id = t.id
                    left join shipments s on s.id = ts.shipment_id
                    where (t.assignment_id in (select id from transport_assignments where transporter_id = ?))
                    order by t.created_at desc""", (principal["id"],))
    trip = next((x for x in trips if x["id"] == trip_id), trips[0] if trips else None)
    if not trip:
        return {"items": [], "note": "No trips yet — return-load matching needs an executed trip corridor."}
    v = db.one("select * from vehicles where id = ?", (trip["vehicle_id"],))
    outbound = db.one("""select s.commodity from shipments s join trip_shipments ts on ts.shipment_id = s.id
                         where ts.trip_id = ? limit 1""", (trip["id"],))
    opps = backhaul.opportunities(
        trip_end=(trip["dest_lat"] or 30.9, trip["dest_lng"] or 75.85),
        next_committed=(30.8421, 76.1520),
        vehicle_class=v["vehicle_class"] if v else "lcv",
        capacity_kg=int(v["payload_kg"]) if v else 7500,
        outbound_commodity=(outbound or {}).get("commodity", "wheat"),
        cost_per_km=float(v["cost_per_km"]) if v else 22,
    )
    existing = db.q("select * from return_load_offers where transporter_id = ? order by created_at desc",
                    (principal["id"],))
    return {"items": opps, "trip_id": trip["id"], "offers": existing,
            "note": "Return loads are suggestions only. Accept only when revenue beats incremental cost."}


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
    oid = uid("RLO")
    db.insert("return_load_offers", {
        "id": oid, "trip_id": None, "transporter_id": principal["id"], "cargo_type": body.cargo_type,
        "from_name": body.from_name, "to_name": body.to_name,
        "extra_distance_km": body.extra_distance_km, "revenue": body.revenue,
        "time_hours": body.time_hours, "compatible": 1,
        "status": "accepted" if body.accept else "rejected", "created_at": NOW(),
    })
    audit(principal, "backhaul.respond", entity_type="return_load_offer", entity_id=oid,
          after={"accept": body.accept})
    for admin in db.q("select id from profiles where role='admin'"):
        notify(admin["id"], f"Return load {'accepted' if body.accept else 'rejected'}",
               f"{body.cargo_type} · ₹{body.revenue:,.0f}", "info", "/admin/backhaul")
    return {"id": oid, "status": "accepted" if body.accept else "rejected"}
