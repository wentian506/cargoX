"""Geospatial primitives: distances, road graph, vehicle-class access,
monsoon adjustments.  PostGIS is used in production; these functions are the
algorithmic twin so results are identical on the SQLite demo.
"""
from __future__ import annotations

import math
from functools import lru_cache

from ..core.config import settings


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def road_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Straight-line distance adjusted for rural road detours."""
    return round(haversine_km(lat1, lon1, lat2, lon2) * settings.ROAD_FACTOR, 3)


VEHICLE_CLASSES = ["tractor_trolley", "pickup", "tempo", "lcv", "truck"]

CLASS_CAPACITY_KG = {
    "tractor_trolley": 2500,
    "pickup": 1200,
    "tempo": 3500,
    "lcv": 7500,
    "truck": 16000,
}

CLASS_SPEED_KMPH = {
    "tractor_trolley": 22,
    "pickup": 38,
    "tempo": 40,
    "lcv": 44,
    "truck": 42,
}

# vehicles that can use a given road surface / class access string
SURFACE_CLASS_ACCESS = {
    "paved": ["tractor_trolley", "pickup", "tempo", "lcv", "truck"],
    "gravel": ["tractor_trolley", "pickup", "tempo", "lcv"],
    "kutcha": ["tractor_trolley", "pickup"],
}


def allowed_classes(surface: str, width_m: float) -> list[str]:
    classes = SURFACE_CLASS_ACCESS.get(surface, ["tractor_trolley"])
    if width_m < 3.5:
        classes = [c for c in classes if c in ("tractor_trolley", "pickup")]
    elif width_m < 5:
        classes = [c for c in classes if c != "truck"]
    return classes


def edge_distance(edge: dict, monsoon: bool = False) -> float:
    """Distance charged for traversing a road edge in the current weather state."""
    base = float(edge["distance_km"])
    if not monsoon:
        return base
    risk = float(edge.get("monsoon_risk") or 0)
    access = allowed_classes(
        edge.get("surface") or "paved", float(edge.get("width_m") or 6)
    )
    # if large vehicles cannot use the link they must detour around it
    penalty = 1.0 + risk * (settings.MONSOON_FACTOR - 1.0)
    if len(access) < 4:
        penalty += 0.25
    return round(base * penalty, 3)


def corridor_label(district_a: str | None, district_b: str | None) -> str:
    a = (district_a or "unknown").strip().lower()
    b = (district_b or "unknown").strip().lower()
    return f"{a}->{b}"


def nearest(items: list[dict], lat: float, lon: float, *, key_lat="lat", key_lng="lng"):
    best, best_d = None, float("inf")
    for it in items:
        d = haversine_km(lat, lon, float(it[key_lat]), float(it[key_lng]))
        if d < best_d:
            best, best_d = it, d
    return best, round(best_d, 2)


def cluster_of(lat: float, lng: float, villages: list[dict]) -> str | None:
    v, _ = nearest(villages, lat, lng)
    return v.get("cluster_id") if v else None


@lru_cache(maxsize=4096)
def _service_minutes(klass: str, distance_km: float) -> float:
    speed = CLASS_SPEED_KMPH.get(klass, 35)
    return round(distance_km / speed * 60, 1)


def travel_minutes(klass: str, distance_km: float, monsoon: bool = False) -> int:
    speed_penalty = 1.28 if monsoon else 1.0
    return int(round(_service_minutes(klass, distance_km) * speed_penalty + 12))  # +12 min loading


def route_distance(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for (la1, lo1), (la2, lo2) in zip(points, points[1:]):
        total += road_km(la1, lo1, la2, lo2)
    return round(total, 3)
