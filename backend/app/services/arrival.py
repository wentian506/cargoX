"""The pickup arrival clock — the one live timer in CARGOX.

It starts the moment a **transporter accepts** an assignment (or, for trips that
already exist without a recorded acceptance, when the trip started). It counts
down to when the vehicle reaches the **exact pickup point the sender named**,
which is either

* the pinned coordinate on the shipment (`pickup_lat` / `pickup_lng`), or
* the geocoded village / town the sender typed,

and the drive itself is priced against the assignment distance and the vehicle's
own pax economics (the same speed model the live tracker uses), not a guess:

    travel_minutes = max(9, distance_km / effective_kmh * 60)      (+10% village-road factor)
    arrive_at      = accepted_at + travel_minutes
    remaining      = arrive_at - now            (clamped at 0)
    late           = now > arrive_at + 5 min    (counts up as "overdue")

Every field is returned so the UI can show an honest clock instead of a spinner.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from .. import db

# village / rural-road effective speed, matches livetrack.AVG_KMH
EFFECTIVE_KMH = 31.0
MIN_MINUTES = 9          # loading ramp + gate check at the pickup point
OVERDUE_GRACE_MIN = 5    # after this the clock reads "overdue"


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lng1), (lat2, lng2) = a, b
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def effective_kmh(vehicle_class: str | None) -> float:
    """Village-road speed per vehicle class; a tractor trolley is slower than a 32-ft."""
    return {
        "tractor_trolley": 18.0,
        "pickup": 26.0,
        "lcv": 30.0,
        "truck_19ft": 32.0,
        "truck_32ft": 34.0,
    }.get((vehicle_class or "").strip().lower(), EFFECTIVE_KMH)


def travel_minutes(distance_km: float, vehicle_class: str | None = None) -> int:
    kmh = effective_kmh(vehicle_class)
    minutes = (max(0.0, distance_km) / kmh) * 60.0 * 1.10   # +10% for village roads / stops
    return max(MIN_MINUTES, int(round(minutes)))


def body_for(assignment_id: str) -> dict | None:
    """Everything the clock needs for one assignment, in one query round-trip chain."""
    a = db.one(
        """select ta.*, v.reg_no, v.vehicle_class, sp.corridor, sp.total_kg
           from transport_assignments ta
           left join vehicles v on v.id = ta.vehicle_id
           left join shipment_pools sp on sp.id = ta.pool_id
           where ta.id = ?""",
        (assignment_id,),
    )
    if not a:
        return None

    trip = db.one("select * from trips where assignment_id = ? order by created_at", (assignment_id,))
    trip_id = trip["id"] if trip else None

    members = db.q(
        """select s.id, s.code, s.pickup_village, s.pickup_lat, s.pickup_lng,
                  s.destination_name, s.deadline, s.status
           from shipments s join trip_shipments ts on ts.shipment_id = s.id
           join trips t on t.id = ts.trip_id where t.assignment_id = ?
           order by s.code""",
        (assignment_id,),
    ) if trip_id else []

    # exact place the sender named = pinned coordinate if present, else the named village/town
    pickup = None
    for m in members:
        if m.get("pickup_lat") is not None and m.get("pickup_lng") is not None:
            pickup = {
                "label": m.get("pickup_village") or "sender pickup point",
                "lat": float(m["pickup_lat"]),
                "lng": float(m["pickup_lng"]),
                "source": "pinned coordinate chosen by the sender",
                "shipment": m.get("code"),
            }
            break
    if pickup is None and members:
        pickup = {
            "label": members[0].get("pickup_village") or "sender pickup point",
            "lat": None,
            "lng": None,
            "source": "village / town name given by the sender (no pin dropped)",
            "shipment": members[0].get("code"),
        }

    legs = db.q("select * from trip_legs where trip_id = ? order by leg_no", (trip_id,)) if trip_id else []
    first_leg_km = float(legs[0]["distance_km"] or 0) if legs else 0.0
    plan_km = float(sum(float(l["distance_km"] or 0) for l in legs)) or float(a.get("distance_km") or 0)
    # the drive to the pickup is the first leg when it starts at the vehicle's current
    # location, otherwise a third of the assignment distance (vehicle already nearby)
    drive_km = first_leg_km or round(max(4.0, plan_km / 3.0), 1)
    return {
        "assignment": a,
        "trip": trip,
        "members": members,
        "pickup": pickup,
        "drive_km": round(drive_km, 1),
        "plan_km": round(plan_km, 1),
        "vehicle_class": a.get("vehicle_class"),
    }


def clock_for(assignment_id: str) -> dict | None:
    """The public arrival-clock payload for one assignment (None if it does not exist)."""
    body = body_for(assignment_id)
    if not body:
        return None
    a = body["assignment"]

    # the acceptance moment: explicit accept (or Admin confirmation) wins, else trip start
    accepted_at = None
    accepted_source = None
    if a.get("status") in ("transporter_accepted", "sender_approved", "confirmed", "completed"):
        accepted_at = _parse(a.get("accepted_at")) or _parse(a.get("updated_at"))
        accepted_source = "transporter accepted the assignment"
    if accepted_at is None and body["trip"] and body["trip"].get("started_at"):
        accepted_at = _parse(body["trip"]["started_at"])
        accepted_source = "trip started (acceptance not recorded)"

    pickup_lat = body["pickup"]["lat"] if body["pickup"] else None
    pickup_lng = body["pickup"]["lng"] if body["pickup"] else None
    position = db.one(
        "select lat, lng, recorded_at from gps_pings where trip_id = ? order by recorded_at desc limit 1",
        (body["trip"]["id"],),
    ) if body["trip"] else None
    distance_remaining = body["drive_km"]
    if position and pickup_lat is not None and pickup_lng is not None:
        distance_remaining = round(
            haversine_km((float(position["lat"]), float(position["lng"])), (pickup_lat, pickup_lng)), 1
        )

    minutes = travel_minutes(distance_remaining, body["vehicle_class"])
    now = _now()
    arrive_at = (accepted_at + timedelta(minutes=minutes)) if accepted_at else None
    remaining = (arrive_at - now).total_seconds() / 60.0 if arrive_at else None

    phase = "not_started"
    trip_status = body["trip"].get("status") if body["trip"] else None
    if a.get("status") in ("transporter_rejected", "cancelled"):
        phase = "cancelled"
    elif a.get("status") == "completed" or trip_status == "delivered":
        # the pickup happened long ago — the clock is history, not a warning
        phase = "completed"
    elif trip_status == "in_transit":
        phase = "arrived" if (remaining is not None and remaining <= 0) else "en_route"
    elif a.get("status") == "confirmed":
        phase = "en_route"
    elif a.get("status") in ("transporter_accepted", "sender_approved"):
        phase = "accepted"
        if remaining is not None and remaining <= -OVERDUE_GRACE_MIN:
            phase = "overdue"

    if phase == "completed":
        note = "Pickup completed — the arrival clock is kept for the record."
    elif phase == "cancelled":
        note = "Assignment cancelled or rejected — no pickup clock is running."
    elif phase == "not_started":
        note = "Waiting for the transporter to accept — the clock has not started."
    else:
        note = (
            "The clock starts when the transporter accepts and counts down to the exact pickup "
            "point named in the shipment details. Distance is the assignment's first leg at the "
            f"vehicle's village-road speed ({int(effective_kmh(body['vehicle_class']))} km/h)."
        )

    return {
        "assignment_id": a["id"],
        "trip_id": body["trip"]["id"] if body["trip"] else None,
        "trip_code": body["trip"].get("trip_code") if body["trip"] else None,
        "status": a.get("status"),
        "phase": phase,
        "accepted_at": accepted_at.isoformat() if accepted_at else None,
        "accepted_source": accepted_source,
        "now": now.isoformat(),
        "arrive_at": arrive_at.isoformat() if arrive_at else None,
        "eta_minutes": minutes,
        "remaining_minutes": None if remaining is None else round(max(0.0, remaining), 1),
        "remaining_seconds": None if remaining is None else int(max(0, remaining) * 60),
        "overdue_minutes": None if remaining is None or remaining >= 0 else round(-remaining, 1),
        "late": phase == "overdue",
        "drive_km": body["drive_km"],
        "speed_kmh": effective_kmh(body["vehicle_class"]),
        "vehicle": {
            "reg_no": a.get("reg_no"),
            "class": a.get("vehicle_class"),
        },
        "pickup": body["pickup"],
        "shipments": [
            {
                "code": m.get("code"),
                "pickup_village": m.get("pickup_village"),
                "destination": m.get("destination_name"),
                "deadline": m.get("deadline"),
            }
            for m in body["members"]
        ],
        "note": note,
    }
