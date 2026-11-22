"""Geography for all of India: states, districts, towns, search and nominatim-free reverse lookup.

The dataset ships with the repo (`app/data/india_geo.json`, from OSM via the
dr5hn/countries-states-cities-database export, ODbL) so the pickers work with no
external geocoding service — important for rural areas where Nominatim coverage
is thin and for offline demos.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/geo", tags=["geo"])

DATA = Path(__file__).resolve().parents[1] / "data" / "india_geo.json"


@lru_cache(maxsize=1)
def _data() -> dict:
    with open(DATA, "r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _index() -> list[dict]:
    out: list[dict] = []
    for s in _data()["states"]:
        for t in s["towns"]:
            out.append({"name": t["name"], "lat": t["lat"], "lng": t["lng"],
                        "district": t["district"], "state": s["name"], "kind": "town"})
        for d in s["districts"]:
            out.append({"name": f"{d} (district)", "district": d, "state": s["name"],
                        "lat": s["lat"], "lng": s["lng"], "kind": "district"})
    return out


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    R = 6371.0
    dlat = math.radians(b[0] - a[0])
    dlng = math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


@router.get("/states")
def states():
    """Every state and union territory, with a district count — the whole of India."""
    return {
        "country": "India",
        "count": len(_data()["states"]),
        "states": [
            {"name": s["name"], "slug": s["slug"], "type": s["type"],
             "lat": s["lat"], "lng": s["lng"], "district_count": len(s["districts"])}
            for s in _data()["states"]
        ],
        "source": _data()["source"],
    }


@router.get("/districts")
def districts(state: str | None = Query(default=None)):
    states_ = _data()["states"]
    if state:
        s = next((x for x in states_ if x["name"].lower() == state.lower() or x["slug"] == state.lower()), None)
        if not s:
            raise HTTPException(404, f"Unknown state '{state}'")
        return {"state": s["name"], "count": len(s["districts"]), "districts": s["districts"]}
    return {"count": sum(len(s["districts"]) for s in states_) // 1, "total": sum(len(s["districts"]) for s in states_)}


@router.get("/towns")
def towns(state: str | None = Query(default=None), district: str | None = Query(default=None),
          limit: int = Query(default=500, le=2000)):
    pool = _index()
    if state:
        pool = [p for p in pool if p["state"].lower() == state.lower()]
    if district:
        pool = [p for p in pool if (p["district"] or "").lower() == district.lower()]
    return {"count": len(pool), "towns": pool[:limit]}


@router.get("/search")
def search(q: str = Query(min_length=2, max_length=64), limit: int = Query(default=12, le=50)):
    """Prefix-first place search across 4,300 towns, 800 districts and live hubs."""
    needle = q.strip().lower()
    starts, contains = [], []
    for p in _index():
        n = p["name"].lower()
        if n.startswith(needle):
            starts.append(p)
        elif needle in n or needle in (p["district"] or "").lower() or needle in p["state"].lower():
            contains.append(p)
        if len(starts) >= limit:
            break
    seen, out = set(), []
    for p in starts + contains:
        key = (p["name"], p["state"])
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
        if len(out) >= limit:
            break
    return {"query": q, "count": len(out), "results": out}


@router.get("/reverse")
def reverse(lat: float, lng: float):
    """Nearest town/district to a coordinate — used when a pin is placed on the map."""
    best, bd = None, float("inf")
    for p in _index():
        if p["kind"] != "town":
            continue
        d = haversine_km((lat, lng), (p["lat"], p["lng"]))
        if d < bd:
            bd, best = d, p
    if not best:
        raise HTTPException(404, "No reference point found")
    return {"lat": lat, "lng": lng, "town": best["name"], "district": best["district"],
            "state": best["state"], "distance_km": round(bd, 1)}


@router.get("/stats")
def stats():
    d = _data()
    return {"states": len(d["states"]),
            "union_territories": sum(1 for s in d["states"] if "territor" in s["type"]),
            "districts": sum(len(s["districts"]) for s in d["states"]),
            "towns": sum(len(s["towns"]) for s in d["states"]),
            "note": "Names and coordinates are public reference data; CARGOX operations are synthetic."}
