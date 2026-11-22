"""Live tracking: positions, trails, active fleet, feed pings and corridor map layers."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..core.security import Principal, admin_only, any_role
from ..services import livetrack
from ..services import arrival
from ..services.common import NOW, audit, uid

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


@router.get("/live")
def live(principal: Principal = Depends(any_role)):
    """Every moving vehicle in the viewer's scope, plus a movement trail per trip."""
    scope = None
    if principal["role"] == "transporter":
        scope = principal["id"]
    elif principal["role"] == "sender":
        # a sender only sees the trips carrying their freight
        rows = db.q(
            """select distinct t.id from trips t
               join trip_shipments ts on ts.trip_id = t.id
               join shipments s on s.id = ts.shipment_id
               where s.sender_id = ?""",
            (principal["id"],),
        )
        allow = {r["id"] for r in rows}
        trips = [t for t in livetrack.active_trips() if t["trip_id"] in allow]
        return {
            "scope": "sender", "count": len(trips), "trips": trips,
            "trails": {t["trip_id"]: livetrack.trail_for(t["trip_id"]) for t in trips},
            "server_time": NOW(),
            "note": "Movement is modelled from each trip plan unless a transporter device is reporting.",
        }
    trips = livetrack.active_trips(scope)
    return {
        "scope": principal["role"], "count": len(trips), "trips": trips,
        "trails": {t["trip_id"]: livetrack.trail_for(t["trip_id"]) for t in trips},
        "server_time": NOW(),
        "note": "Movement is modelled from each trip plan unless a transporter device is reporting.",
    }


@router.get("/trips/{trip_id}")
def trip_track(trip_id: str, principal: Principal = Depends(any_role)):
    row = db.one(
        """select t.*, ta.transporter_id from trips t
           left join transport_assignments ta on ta.id = t.assignment_id
           where t.id = ?""",
        (trip_id,),
    )
    if not row:
        raise HTTPException(404, "Trip not found")
    if principal["role"] == "transporter" and row["transporter_id"] != principal["id"]:
        raise HTTPException(403, "Not your trip")
    if principal["role"] == "sender":
        mine = db.one(
            """select 1 as ok from trip_shipments ts join shipments s on s.id = ts.shipment_id
               where ts.trip_id = ? and s.sender_id = ? limit 1""",
            (trip_id, principal["id"]),
        )
        if not mine:
            raise HTTPException(403, "Not your freight")
    pos = livetrack.trip_position(trip_id)
    pos["trail"] = livetrack.trail_for(trip_id)
    pos["pings"] = db.q(
        "select * from gps_pings where trip_id = ? order by recorded_at desc limit 60", (trip_id,)
    )
    # the sender sees the same pickup arrival clock the transporter does
    if row.get("assignment_id"):
        pos["arrival"] = arrival.clock_for(row["assignment_id"])
    return pos


@router.post("/ping")
def ping(body: dict, principal: Principal = Depends(any_role)):
    """Ingest a device fix. This is the seam for a real GPS/telematics provider."""
    trip_id = body.get("trip_id")
    lat, lng = body.get("lat"), body.get("lng")
    if not trip_id or lat is None or lng is None:
        raise HTTPException(400, "trip_id, lat and lng are required")
    trip = db.one("select * from trips where id = ?", (trip_id,))
    if not trip:
        raise HTTPException(404, "Trip not found")
    if principal["role"] == "transporter" and trip["transporter_id"] != principal["id"]:
        raise HTTPException(403, "Not your trip")
    pos = livetrack.record_ping(
        trip_id, float(lat), float(lng),
        heading=body.get("heading"), speed_kmh=body.get("speed_kmh"),
        odometer_km=body.get("odometer_km"), place_label=body.get("place_label"),
        actor=principal["id"],
    )
    audit(principal, "tracking.ping", entity_type="trip", entity_id=trip_id,
          after={"lat": lat, "lng": lng})
    return {"accepted": True, "position": pos}


class SubscribeIn(BaseModel):
    phone: str = Field(min_length=8, max_length=20)
    channel: str = "sms"
    shipment_id: str | None = None
    trip_id: str | None = None


@router.post("/subscribe")
def subscribe(body: SubscribeIn, principal: Principal = Depends(any_role)):
    """SMS/WhatsApp milestone alerts. Records the request; delivery needs a provider key."""
    rec = {"id": uid("SUB"), "phone": body.phone, "channel": body.channel,
           "shipment_id": body.shipment_id, "trip_id": body.trip_id, "created_at": NOW()}
    db.insert("tracking_subscriptions", rec)
    configured = bool(db.one("select id from tracking_subscriptions limit 1")) and False
    return {
        "subscribed": True, "id": rec["id"], "channel": body.channel,
        "delivery": "queued" if configured else "not_configured",
        "note": "Add SMS_PROVIDER_KEY (Twilio / MSG91) on the API to deliver these messages. "
                "The subscription is stored either way so the admin queue shows it.",
    }


@router.get("/active-network")
def active_network(principal: Principal = Depends(admin_only)):
    """Control-tower layer: hubs, mandis, vehicles and live positions on one payload."""
    hubs = db.q("select id, name, district, lat, lng, safety_verified, hub_type from hubs")
    mandis = db.q("select id, name, district, lat, lng, queue_minutes from mandis limit 60")
    villages = db.q("select id, name, district, lat, lng from villages limit 200")
    vehicles = db.q(
        "select id, reg_no, vehicle_class, payload_kg, availability, verified from vehicles limit 200"
    )
    return {
        "hubs": hubs, "mandis": mandis, "villages": villages, "vehicles": vehicles,
        "live": livetrack.active_trips(),
        "coverage": db.scalar("select count(*) from serviceable_areas", default=0),
    }
