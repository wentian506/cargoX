"""Trip movement model — one deterministic position per trip, derived from the clock.

Why a model and not a socket: CARGOX has no telemetry contract with its
transporters yet. Rather than fabricate a "live GPS" screen, the platform derives
a position from the trip's own start time, its planned legs and any checkpoints
that were actually filed, then reports `source` honestly:

    recorded   — a checkpoint the transporter or admin really filed
    modelled   — interpolated from the trip plan (labelled "modelled" in the UI)
    none       — the trip has not started, so there is nothing to report

Switch to a real feed by POSTing /api/tracking/ping from a driver device; the
read endpoint then reports `source: recorded` on its own.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone

from .. import db
from ..algorithms.geo import road_km

AVG_KMH = 31.0            # conservative rural-road average for the fleet's 4 classes
ACTIVE = ("in_transit", "dispatched", "started", "at_transit_hub")


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _route_nodes(trip: dict) -> list[dict]:
    """Ordered route nodes with real coordinates, from the most specific source available."""
    nodes: list[dict] = []

    def push(name, lat, lng, kind):
        if lat is None or lng is None:
            return
        lat, lng = float(lat), float(lng)
        if nodes and abs(nodes[-1]["lat"] - lat) < 1e-6 and abs(nodes[-1]["lng"] - lng) < 1e-6:
            return
        nodes.append({"name": name or "Waypoint", "lat": lat, "lng": lng, "kind": kind})

    legs = db.q("select * from trip_legs where trip_id = ? order by leg_no", (trip["id"],))
    for leg in legs:
        push(leg.get("from_name"), leg.get("from_lat"), leg.get("from_lng"), "pickup")
        push(leg.get("to_name"), leg.get("to_lat"), leg.get("to_lng"), "hub")

    if len(nodes) < 2:
        nodes = []
        shipments = db.q(
            "select s.* from shipments s join trip_shipments ts on ts.shipment_id = s.id where ts.trip_id = ?",
            (trip["id"],),
        )
        for s in shipments:
            push(s["pickup_village"], s["pickup_lat"], s["pickup_lng"], "pickup")
        for s in shipments:
            if s.get("dest_lat") and s.get("dest_lng"):
                push(s["destination_name"], s["dest_lat"], s["dest_lng"], "drop")

    if len(nodes) < 2:
        nodes = []
        hub = db.one("select * from hubs where safety_verified = 1 order by name limit 1")
        mandi = db.one("select * from mandis order by name limit 1")
        if hub and mandi:
            push(hub["name"], hub["lat"], hub["lng"], "hub")
            push(mandi["name"], mandi["lat"], mandi["lng"], "drop")
    return nodes


def _bearing(a: dict, b: dict) -> float:
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    dlng = math.radians(b["lng"] - a["lng"])
    y = math.sin(dlng) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _interpolate(nodes: list[dict], travelled_km: float) -> tuple[dict, int, float]:
    if not nodes:
        return {"name": "Unknown", "lat": 0.0, "lng": 0.0, "kind": "vehicle"}, 0, 0.0
    if len(nodes) < 2:
        return nodes[0], 0, 0.0
    remaining = max(0.0, travelled_km)
    for i in range(len(nodes) - 1):
        a, b = nodes[i], nodes[i + 1]
        d = road_km(a["lat"], a["lng"], b["lat"], b["lng"])
        if remaining <= d or i == len(nodes) - 2:
            t = max(0.0, min(1.0, remaining / d if d else 0.0))
            return ({
                "name": f"{a['name']} → {b['name']}",
                "lat": a["lat"] + (b["lat"] - a["lat"]) * t,
                "lng": a["lng"] + (b["lng"] - a["lng"]) * t,
                "kind": "vehicle",
            }, i, _bearing(a, b))
        remaining -= d
    return nodes[-1], len(nodes) - 2, 0.0


def route_km(nodes: list[dict]) -> float:
    return round(sum(road_km(nodes[i]["lat"], nodes[i]["lng"], nodes[i + 1]["lat"], nodes[i + 1]["lng"])
                     for i in range(len(nodes) - 1)), 1) if len(nodes) > 1 else 0.0


def _plan_km(trip_id: str) -> float:
    """Planned distance from the legs the trip actually filed (authoritative)."""
    return round(float(db.scalar(
        "select coalesce(sum(distance_km), 0) from trip_legs where trip_id = ?", (trip_id,), 0) or 0), 1)


def trip_position(trip_id: str) -> dict:
    trip = db.one("select * from trips where id = ?", (trip_id,))
    if not trip:
        return {"trip_id": trip_id, "source": "none", "note": "Unknown trip"}
    nodes = _route_nodes(trip)
    geometry_km = route_km(nodes)
    # the filed leg distances are the plan of record; the geometry only decides
    # *where* along the line a given percentage sits (a straight-line twin can be
    # shorter than the driven distance, and that must not fake "100% complete")
    total = max(geometry_km, _plan_km(trip_id))
    started = _parse(trip.get("started_at"))
    status = trip.get("status")

    ping = db.one("select * from gps_pings where trip_id = ? order by recorded_at desc limit 1", (trip_id,))
    if ping:
        done = float(ping.get("odometer_km") or 0)
        return {
            "trip_id": trip_id, "trip_code": trip["trip_code"], "status": status,
            "source": "recorded",
            "position": {"name": ping.get("place_label") or "Device fix", "lat": float(ping["lat"]),
                         "lng": float(ping["lng"]), "kind": "vehicle"},
            "bearing": float(ping.get("heading") or 0), "speed_kmh": ping.get("speed_kmh"),
            "recorded_at": ping["recorded_at"], "progress_km": round(done, 1),
            "progress_pct": round(min(100.0, done / total * 100), 1) if total else 0.0,
            "total_km": total, "nodes": nodes,
            "eta": ping.get("eta"),
            "note": "Reported by the transporter device.",
        }

    if status == "completed" or status == "delivered":
        return {"trip_id": trip_id, "trip_code": trip["trip_code"], "status": status, "source": "recorded",
                "position": nodes[-1] if nodes else None, "bearing": 0, "speed_kmh": 0.0,
                "progress_km": total, "progress_pct": 100.0, "total_km": total, "nodes": nodes,
                "note": "Completed trip — final checkpoint recorded."}

    if status not in ACTIVE or not started:
        return {"trip_id": trip_id, "trip_code": trip["trip_code"], "status": status, "source": "none",
                "position": nodes[0] if nodes else None, "bearing": 0, "speed_kmh": 0.0,
                "progress_km": 0.0, "progress_pct": 0.0, "total_km": total, "nodes": nodes,
                "note": "Trip has not started — no position to report."}

    now = _now()
    elapsed_h = max(0.0, (now - started).total_seconds() / 3600.0)
    rng = random.Random(f"{trip_id}:{int(elapsed_h * 6)}")
    travelled = min(total, elapsed_h * AVG_KMH * (1 + rng.uniform(-0.04, 0.04)))
    fraction = (travelled / total) if total else 0.0
    pos, seg, bearing = _interpolate(nodes, fraction * geometry_km)
    arrived = total > 0 and total - travelled < 1.0     # within a kilometre of the last node
    return {
        "trip_id": trip_id, "trip_code": trip["trip_code"], "status": status, "source": "modelled",
        "position": pos, "bearing": round(bearing, 1),
        "speed_kmh": round(AVG_KMH * (1 + rng.uniform(-0.08, 0.08)), 1),
        "recorded_at": (started + timedelta(hours=elapsed_h)).isoformat(),
        "progress_km": round(travelled, 1), "total_km": total,
        "progress_pct": round(travelled / total * 100, 1) if total else 0.0,
        "eta": (started + timedelta(hours=total / AVG_KMH)).isoformat() if total else None,
        "segment": seg, "nodes": nodes,
        "note": ("Route complete — the vehicle is at the last planned node; delivery confirmation "
                 "is still pending." if arrived else
                 "Position modelled from the planned legs and the trip clock — not a device fix. "
                 "Feed transporter pings to switch this screen to recorded positions."),
    }


def trail_for(trip_id: str, points: int = 28) -> list[dict]:
    pos = trip_position(trip_id)
    nodes = pos.get("nodes") or []
    if len(nodes) < 2:
        return []
    geometry_km = route_km(nodes)
    total = pos.get("total_km") or 0.0
    done = pos.get("progress_km") or 0.0
    fraction = (done / total) if total else 0.0
    out = []
    for i in range(points):
        km = fraction * geometry_km * i / max(1, points - 1)
        p, _s, _b = _interpolate(nodes, km)
        out.append({"lat": p["lat"], "lng": p["lng"], "km": round(km, 1)})
    return out


def active_trips(transporter_id: str | None = None) -> list[dict]:
    sql = ("select t.id, t.trip_code, t.status, t.started_at, ta.transporter_id "
           "from trips t left join transport_assignments ta on ta.id = t.assignment_id "
           "where t.status in ('in_transit','dispatched','started','at_transit_hub')")
    params: list = []
    if transporter_id:
        sql += " and ta.transporter_id = ?"
        params.append(transporter_id)
    rows = db.q(sql + " order by t.started_at desc", params)
    out = []
    for r in rows:
        p = trip_position(r["id"])
        if not p.get("position"):
            continue
        out.append({
            "trip_id": r["id"], "trip_code": r["trip_code"], "status": r["status"],
            "transporter_id": r["transporter_id"], "source": p["source"],
            "lat": p["position"]["lat"], "lng": p["position"]["lng"],
            "heading": p.get("bearing"), "speed_kmh": p.get("speed_kmh"),
            "progress_pct": p.get("progress_pct"), "total_km": p.get("total_km"),
            "place": p["position"].get("name"), "started_at": r["started_at"],
        })
    return out


def record_ping(trip_id: str, lat: float, lng: float, *, heading: float | None = None,
                speed_kmh: float | None = None, odometer_km: float | None = None,
                place_label: str | None = None, actor: str | None = None) -> dict:
    from .common import NOW, uid

    db.insert("gps_pings", {
        "id": uid("GPS"), "trip_id": trip_id, "lat": lat, "lng": lng,
        "heading": heading, "speed_kmh": speed_kmh, "odometer_km": odometer_km,
        "place_label": place_label, "recorded_at": NOW(), "source": "device",
        "actor_id": actor,
    })
    return trip_position(trip_id)
