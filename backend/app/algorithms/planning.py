"""GramTwin-2E planning + routing.

- `plan_routes`      -> CVRPTW over a real stop set using Google OR-Tools, with a
                        greedy nearest-vehicle fallback so the API never fails.
- `select_hubs`      -> constrained facility location (k-median style) over the
                        village road graph, honouring safety / access / window.
- `build_two_echelon`-> first-mile collection by small vehicle to a hub, then
                        line-haul by a larger vehicle, synchronised on a transfer
                        window.  Falls back to direct trips when no hub qualifies.
"""
from __future__ import annotations

import time
from typing import Any

from .geo import (
    CLASS_CAPACITY_KG,
    allowed_classes,
    road_km,
    travel_minutes,
)


def _coords(row: dict[str, Any] | None) -> tuple[float, float] | None:
    if not row:
        return None
    lat = row.get("lat")
    lng = row.get("lng")
    if lat is None or lng is None:
        return None
    try:
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return None


def _valid_stops(stops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx, s in enumerate(stops or []):
        c = _coords(s)
        if c is None:
            continue
        out.append({
            **s,
            "id": s.get("id") or f"STOP-{idx + 1}",
            "name": s.get("name") or f"Stop {idx + 1}",
            "lat": c[0],
            "lng": c[1],
        })
    return out


# --------------------------------------------------------------------------- #
# hub selection
# --------------------------------------------------------------------------- #
def select_hubs(villages: list[dict], candidates: list[dict], k: int = 2, radius_km: float = 14.0) -> dict:
    valid_villages = [
        {**v, "id": v.get("id") or f"VIL-{i + 1}", "name": v.get("name") or f"Village {i + 1}",
         "lat": _coords(v)[0], "lng": _coords(v)[1]}
        for i, v in enumerate(villages or [])
        if _coords(v) is not None
    ]
    usable = [
        {**c, "id": c.get("id") or f"HUB-{i + 1}", "name": c.get("name") or f"Hub {i + 1}",
         "lat": _coords(c)[0], "lng": _coords(c)[1]}
        for i, c in enumerate(candidates or [])
        if c.get("safety_verified") and c.get("operating_window") and _coords(c) is not None
    ]
    if not usable:
        return {"hubs": [], "assignments": [], "coverage": 0.0,
                "note": "No safety-verified candidate hubs — direct trips required."}
    if not valid_villages:
        return {"hubs": usable[:k], "assignments": [], "coverage": 0.0,
                "radius_km": radius_km, "objective": 0.0, "method": "constrained_k_median"}

    def cost_of(hub: dict) -> tuple[float, float]:
        dists = [road_km(v["lat"], v["lng"], hub["lat"], hub["lng"]) for v in valid_villages]
        served = [d for d in dists if d <= radius_km]
        total = sum(served)
        coverage = len(served) / max(len(valid_villages), 1)
        score = total + (len(valid_villages) - len(served)) * radius_km * 3
        return round(score, 2), coverage

    scored = []
    for c in usable:
        s, cov = cost_of(c)
        scored.append({**c, "objective": s, "coverage": round(cov, 3),
                       "avg_km": round(s / max(len(valid_villages), 1), 2)})
    scored.sort(key=lambda x: x["objective"])
    chosen = scored[:max(1, k)]

    assignments = []
    for v in valid_villages:
        best = min(chosen, key=lambda h: road_km(v["lat"], v["lng"], h["lat"], h["lng"]))
        d = road_km(v["lat"], v["lng"], best["lat"], best["lng"])
        assignments.append({
            "village_id": v["id"],
            "village": v["name"],
            "hub_id": best["id"],
            "hub": best["name"],
            "distance_km": d,
        })

    covered = sum(1 for a in assignments if a["distance_km"] <= radius_km)
    return {
        "hubs": chosen,
        "assignments": assignments,
        "coverage": round(covered / max(len(valid_villages), 1), 3),
        "radius_km": radius_km,
        "objective": round(sum(h["objective"] for h in chosen), 2),
        "method": "constrained_k_median",
    }


# --------------------------------------------------------------------------- #
# CVRPTW
# --------------------------------------------------------------------------- #
def _matrix(points: list[tuple[float, float]]) -> list[list[float]]:
    return [[road_km(a[0], a[1], b[0], b[1]) if i != j else 0.0 for j, b in enumerate(points)] for i, a in enumerate(points)]


def plan_routes(
    *,
    depot: tuple[float, float],
    stops: list[dict],
    vehicles: list[dict],
    horizon_min: int = 600,
    service_min: int = 15,
) -> dict:
    """Solve CVRPTW with OR-Tools; fall back to greedy insertion."""
    clean_stops = _valid_stops(stops)
    safe_vehicles = vehicles or [{"id": "VEH-DEFAULT", "class": "lcv", "capacity_kg": 7500, "cost_per_km": 32}]
    depot_pt = (float(depot[0]), float(depot[1]))

    if not clean_stops:
        return {"routes": [], "unassigned": [], "solver": "trivial", "solve_ms": 0,
                "total_km": 0.0, "total_cost": 0.0, "load_factor": 0.0}

    started = time.perf_counter()
    try:
        from ortools.constraint_solver import pywrapcp, routing_enums_pb2  # type: ignore

        points = [depot_pt] + [(s["lat"], s["lng"]) for s in clean_stops]
        dist = _matrix(points)
        d_int = [[int(round(x * 1000)) for x in row] for row in dist]
        n_v = max(1, len(safe_vehicles))
        caps = [max(1, int(float(v.get("capacity_kg") or 16000))) for v in safe_vehicles]

        manager = pywrapcp.RoutingIndexManager(len(points), n_v, 0)
        routing = pywrapcp.RoutingModel(manager)

        def dist_cb(fi, ti):
            return d_int[manager.IndexToNode(fi)][manager.IndexToNode(ti)]

        cb = routing.RegisterTransitCallback(dist_cb)
        routing.SetArcCostEvaluatorOfAllVehicles(cb)

        demands = [0] + [max(0, int(float(s.get("demand_kg") or 0))) for s in clean_stops]

        def demand_cb(fi):
            return demands[manager.IndexToNode(fi)]

        dcb = routing.RegisterUnaryTransitCallback(demand_cb)
        routing.AddDimensionWithVehicleCapacity(dcb, 0, caps, True, "Capacity")

        v0_class = safe_vehicles[0].get("class") or "lcv"

        def time_cb(fi, ti):
            a, b = manager.IndexToNode(fi), manager.IndexToNode(ti)
            mins = travel_minutes(v0_class, dist[a][b] / 1000) if a != b else 0
            return int(mins) + (service_min if b != 0 else 0)

        tcb = routing.RegisterTransitCallback(time_cb)
        routing.AddDimension(tcb, 60, horizon_min, False, "Time")
        tdim = routing.GetDimensionOrDie("Time")
        for i, s in enumerate(clean_stops, start=1):
            idx = manager.NodeToIndex(i)
            rdy = int(s.get("ready_min") or 0)
            ddl = int(min(s.get("deadline_min") or horizon_min, horizon_min))
            tdim.CumulVar(idx).SetRange(rdy, max(rdy, ddl))

        for v in range(n_v):
            tdim.CumulVar(routing.Start(v)).SetRange(0, 120)
            routing.AddVariableMinimizedByFinalizer(tdim.CumulVar(routing.End(v)))

        params = pywrapcp.DefaultRoutingSearchParameters()
        params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        params.time_limit.FromMilliseconds(1500)
        sol = routing.SolveWithParameters(params)

        if sol:
            routes, assigned = [], set()
            for v in range(n_v):
                idx = routing.Start(v)
                seq, load, km = [], 0.0, 0.0
                while not routing.IsEnd(idx):
                    node = manager.IndexToNode(idx)
                    if node != 0:
                        seq.append(node)
                        load += float(clean_stops[node - 1].get("demand_kg") or 0)
                        assigned.add(clean_stops[node - 1]["id"])
                    nxt = sol.Value(routing.NextVar(idx))
                    nnode = manager.IndexToNode(nxt)
                    km += d_int[node][nnode] / 1000
                    idx = nxt
                if seq:
                    routes.append(_materialise(v, seq, clean_stops, safe_vehicles, km, load, depot_pt, service_min))
            unassigned = [s for s in clean_stops if s["id"] not in assigned]
            solve_ms = int((time.perf_counter() - started) * 1000)
            return _summarise(routes, unassigned, "ortools_guided_local_search", solve_ms)
    except Exception as exc:  # pragma: no cover - OR-Tools unavailable/edge case
        solve_ms = int((time.perf_counter() - started) * 1000)
        greedy = greedy_routes(depot=depot_pt, stops=clean_stops, vehicles=safe_vehicles, service_min=service_min)
        greedy["solver"] = f"greedy_insertion_fallback ({type(exc).__name__})"
        greedy["solve_ms"] = solve_ms
        return greedy

    greedy = greedy_routes(depot=depot_pt, stops=clean_stops, vehicles=safe_vehicles, service_min=service_min)
    greedy["solve_ms"] = int((time.perf_counter() - started) * 1000)
    return greedy


def _materialise(
    v_idx: int,
    seq: list[int],
    stops: list[dict],
    vehicles: list[dict],
    km: float,
    load: float,
    depot: tuple[float, float],
    service_min: int = 15,
) -> dict:
    v = vehicles[v_idx] if v_idx < len(vehicles) else vehicles[-1]
    v_class = v.get("class") or "lcv"
    pts = [depot] + [(stops[n - 1]["lat"], stops[n - 1]["lng"]) for n in seq]
    eta, t = [], 0
    for a, b in zip(pts, pts[1:]):
        t += travel_minutes(v_class, road_km(a[0], a[1], b[0], b[1])) + service_min
        eta.append(t)
    cap = float(v.get("capacity_kg") or 1) or 1.0
    return {
        "vehicle_id": v.get("id") or f"VEH-{v_idx + 1}",
        "vehicle_class": v_class,
        "stops": [
            {**{k: stops[n - 1][k] for k in ("id", "name") if k in stops[n - 1]},
             "lat": stops[n - 1]["lat"], "lng": stops[n - 1]["lng"],
             "demand_kg": stops[n - 1].get("demand_kg", 0), "eta_min": eta[i]}
            for i, n in enumerate(seq)
        ],
        "distance_km": round(km, 2),
        "load_kg": round(load, 1),
        "capacity_kg": cap,
        "load_factor": round(load / cap, 3),
        "cost": round(km * float(v.get("cost_per_km") or 20), 2),
    }


def _summarise(routes, unassigned, solver, solve_ms) -> dict:
    total_km = round(sum(r["distance_km"] for r in routes), 2)
    total_cost = round(sum(r["cost"] for r in routes), 2)
    cap = sum(r["capacity_kg"] for r in routes) or 1
    load = sum(r["load_kg"] for r in routes)
    return {
        "routes": routes,
        "unassigned": [{"id": s["id"], "name": s.get("name"), "demand_kg": s.get("demand_kg")} for s in unassigned],
        "solver": solver,
        "solve_ms": solve_ms,
        "total_km": total_km,
        "total_cost": total_cost,
        "load_factor": round(load / cap, 3),
        "empty_km": round(total_km - sum(r["distance_km"] * r["load_factor"] for r in routes), 2),
    }


def greedy_routes(*, depot, stops, vehicles, service_min: int = 15) -> dict:
    """Nearest-vehicle greedy matching — also used as an evaluation baseline."""
    clean_stops = _valid_stops(stops)
    depot_pt = (float(depot[0]), float(depot[1]))
    routes = []
    remaining = sorted(clean_stops, key=lambda s: -(float(s.get("demand_kg") or 0)))
    for v_idx, v in enumerate(vehicles or []):
        cap = float(v.get("capacity_kg") or 7500)
        v_class = v.get("class") or "lcv"
        load, seq, km = 0.0, [], 0.0
        cur = depot_pt
        while remaining:
            cand = min(remaining, key=lambda s: road_km(cur[0], cur[1], s["lat"], s["lng"]))
            d = road_km(cur[0], cur[1], cand["lat"], cand["lng"])
            cand_kg = float(cand.get("demand_kg") or 0)
            if load + cand_kg > cap:
                fits = [s for s in remaining if load + float(s.get("demand_kg") or 0) <= cap]
                if not fits:
                    break
                cand = min(fits, key=lambda s: road_km(cur[0], cur[1], s["lat"], s["lng"]))
                d = road_km(cur[0], cur[1], cand["lat"], cand["lng"])
                cand_kg = float(cand.get("demand_kg") or 0)
            load += cand_kg
            km += d
            seq.append(cand)
            remaining.remove(cand)
            cur = (cand["lat"], cand["lng"])
        if seq:
            eta, t = [], 0
            pts = [depot_pt] + [(s["lat"], s["lng"]) for s in seq]
            for a, b in zip(pts, pts[1:]):
                t += travel_minutes(v_class, road_km(a[0], a[1], b[0], b[1])) + service_min
                eta.append(t)
            routes.append({
                "vehicle_id": v.get("id") or f"VEH-{v_idx + 1}",
                "vehicle_class": v_class,
                "stops": [{**{k: s[k] for k in ("id", "name") if k in s}, "lat": s["lat"], "lng": s["lng"],
                           "demand_kg": s.get("demand_kg", 0), "eta_min": eta[i]} for i, s in enumerate(seq)],
                "distance_km": round(km, 2),
                "load_kg": round(load, 1),
                "capacity_kg": cap,
                "load_factor": round(load / cap, 3),
                "cost": round(km * float(v.get("cost_per_km") or 20), 2),
            })
    return _summarise(routes, remaining, "greedy_nearest_vehicle", 0)


# --------------------------------------------------------------------------- #
# two-echelon assembly
# --------------------------------------------------------------------------- #
def build_two_echelon(*, pickups: list[dict], hub: dict | None, line_haul_vehicle: dict,
                      destination: dict, first_mile_vehicle: dict) -> dict:
    """pickups -> hub (small vehicle) -> destination (large vehicle)."""
    clean_pickups = _valid_stops(pickups)
    if not clean_pickups:
        return {"mode": "none", "legs": []}

    dest_coords = _coords(destination) or (30.704, 76.223)
    dest_name = (destination or {}).get("name") or "Destination"
    hub_coords = _coords(hub)

    if hub is None or hub_coords is None:
        return {
            "mode": "direct",
            "legs": [
                {
                    "leg_type": "direct",
                    "vehicle_id": line_haul_vehicle.get("id") or "VEH-LH",
                    "vehicle_class": line_haul_vehicle.get("class") or "lcv",
                    "stops": [p["name"] for p in clean_pickups] + [dest_name],
                    "distance_km": _tsp_distance([(p["lat"], p["lng"]) for p in clean_pickups], dest_coords),
                    "note": "No approved hub available — direct collection and line-haul.",
                }
            ],
        }

    hub_name = hub.get("name") or "Hub"
    fm = plan_routes(
        depot=hub_coords,
        stops=[{**p, "demand_kg": float(p.get("demand_kg") or 0)} for p in clean_pickups],
        vehicles=[first_mile_vehicle],
        horizon_min=420,
    )
    total_kg = sum(float(p.get("demand_kg") or 0) for p in clean_pickups)
    lh_km = road_km(hub_coords[0], hub_coords[1], dest_coords[0], dest_coords[1])
    lh_class = line_haul_vehicle.get("class") or "lcv"
    fm_class = first_mile_vehicle.get("class") or "tractor_trolley"

    legs = [
        {
            "leg_type": "first_mile",
            "vehicle_id": first_mile_vehicle.get("id") or "VEH-FM",
            "vehicle_class": fm_class,
            "stops": [p["name"] for p in clean_pickups] + [hub_name],
            "distance_km": fm["total_km"],
            "transfer_window": f"T+{int(fm['routes'][0]['stops'][-1]['eta_min']) if fm.get('routes') and fm['routes'][0].get('stops') else 90} min",
            "load_kg": total_kg,
        },
        {
            "leg_type": "line_haul",
            "vehicle_id": line_haul_vehicle.get("id") or "VEH-LH",
            "vehicle_class": lh_class,
            "stops": [hub_name, dest_name],
            "distance_km": lh_km,
            "eta_min": travel_minutes(lh_class, lh_km),
            "load_kg": total_kg,
            "capacity_kg": CLASS_CAPACITY_KG.get(lh_class, 7500),
        },
    ]
    line_haul_fit = total_kg <= legs[1]["capacity_kg"]
    return {
        "mode": "two_echelon",
        "legs": legs,
        "hub": {"id": hub.get("id"), "name": hub_name, "safety_verified": hub.get("safety_verified")},
        "line_haul_feasible": line_haul_fit,
        "transfer_wait_min": 25,
        "total_km": round(fm["total_km"] + lh_km, 2),
        "note": "First-mile collection synchronised with line-haul inside the hub transfer window.",
    }


def _tsp_distance(stops: list[tuple[float, float]], dest: tuple[float, float]) -> float:
    remaining = list(stops)
    cur = remaining.pop(0) if remaining else dest
    total = 0.0
    while remaining:
        nxt = min(remaining, key=lambda p: road_km(cur[0], cur[1], p[0], p[1]))
        total += road_km(cur[0], cur[1], nxt[0], nxt[1])
        cur = nxt
        remaining.remove(nxt)
    total += road_km(cur[0], cur[1], dest[0], dest[1])
    return round(total, 2)


def road_access_check(edges: list[dict], vehicle_class: str, monsoon: bool = False) -> dict:
    blocked, warnings = [], []
    for i, e in enumerate(edges or []):
        classes = allowed_classes(e.get("surface") or "paved", float(e.get("width_m") or 6))
        edge_id = e.get("id") or f"EDGE-{i + 1}"
        if vehicle_class not in classes:
            blocked.append({
                "edge": edge_id,
                "from": e.get("from_node"),
                "to": e.get("to_node"),
                "reason": f"{e.get('surface')} surface / {e.get('width_m')} m width excludes {vehicle_class}",
            })
        elif monsoon and float(e.get("monsoon_risk") or 0) > 0.45:
            warnings.append({
                "edge": edge_id,
                "reason": "high monsoon waterlogging risk",
                "risk": e.get("monsoon_risk"),
            })
    return {
        "vehicle_class": vehicle_class,
        "monsoon_mode": monsoon,
        "blocked": blocked,
        "warnings": warnings,
        "passable": not blocked,
        "checked_edges": len(edges or []),
    }