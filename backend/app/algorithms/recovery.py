"""ShadowFleet-Heal — proactive recovery after a cancellation or breakdown.

Freeze unaffected assignments, release only affected loads, retrieve precomputed
feasible alternatives, then run a fast local repair (greedy ALNS-style move
evaluation: relocate / swap / add-standby) and report the plan-stability penalty
for changing commitments already communicated to senders.
"""
from __future__ import annotations

import time

from .geo import road_km, travel_minutes


PLAN_CHANGE_PENALTY_INR = 450.0   # cost of breaking a communicated commitment


def heal(
    *,
    depot: tuple[float, float],
    affected: list[dict],        # [{shipment_id, code, lat, lng, demand_kg, deadline_min}]
    frozen: list[dict],          # unaffected but already committed
    standby_vehicles: list[dict],# [{id, class, capacity_kg, cost_per_km, transporter}]
    destination: dict,
    max_local_distance_km: float = 60.0,
) -> dict:
    started = time.perf_counter()
    if not affected:
        return {"status": "no_action", "assignments": [], "frozen": frozen,
                "extra_cost": 0.0, "added_delay_min": 0, "solve_ms": 0}

    total_kg = sum(a.get("demand_kg") or 0 for a in affected)
    ranked = sorted(
        standby_vehicles,
        key=lambda v: (
            -min(1.0, v["capacity_kg"] / max(total_kg, 1)),
            road_km(depot[0], depot[1], depot[0], depot[1]) + v.get("cost_per_km", 20),
        ),
    )
    feasible = [v for v in ranked if v["capacity_kg"] >= total_kg]
    partial = [v for v in ranked if v["capacity_kg"] < total_kg]

    assignments, uncovered = [], list(affected)
    # --- relocate: fit as much as possible into standby capacity -------------- #
    for v in feasible[:1]:
        stops = _order([(a["lat"], a["lng"]) for a in uncovered], depot, destination)
        km = _route_km(depot, stops, destination)
        assignments.append({
            "vehicle_id": v["id"], "vehicle_class": v["class"], "transporter_id": v.get("transporter_id"),
            "shipment_ids": [a["shipment_id"] for a in uncovered],
            "distance_km": round(km, 2),
            "cost": round(km * v.get("cost_per_km", 22), 2),
            "delay_min": travel_minutes(v["class"], km) - min(
                (x.get("deadline_min") or 240) for x in affected),
            "action": "relocate_shipments",
        })
        uncovered = []

    # --- split across standby vehicles ------------------------------------- #
    if uncovered and partial:
        for v in partial:
            if not uncovered:
                break
            cap, take = v["capacity_kg"], []
            for a in list(uncovered):
                if (a.get("demand_kg") or 0) <= cap:
                    take.append(a)
                    cap -= a.get("demand_kg") or 0
                    uncovered.remove(a)
            if take:
                stops = _order([(a["lat"], a["lng"]) for a in take], depot, destination)
                km = _route_km(depot, stops, destination)
                assignments.append({
                    "vehicle_id": v["id"], "vehicle_class": v["class"], "transporter_id": v.get("transporter_id"),
                    "shipment_ids": [a["shipment_id"] for a in take],
                    "distance_km": round(km, 2),
                    "cost": round(km * v.get("cost_per_km", 22), 2),
                    "delay_min": travel_minutes(v["class"], km) - min(
                        (x.get("deadline_min") or 240) for x in take),
                    "action": "split_load",
                })

    # --- local repair: try swapping a far shipment into a nearer standby ---- #
    swapped = 0
    for asg in assignments:
        for v in standby_vehicles:
            if v["id"] in {a["vehicle_id"] for a in assignments}:
                continue
            if v["capacity_kg"] >= asg.get("load_kg", total_kg) and road_km(
                depot[0], depot[1], v.get("lat", depot[0]), v.get("lng", depot[1])
            ) < max_local_distance_km:
                if v.get("cost_per_km", 99) < 18:
                    asg["vehicle_id"], asg["vehicle_class"] = v["id"], v["class"]
                    asg["action"] = "standby_swap"
                    swapped += 1
                    break

    extra_cost = round(sum(a["cost"] for a in assignments), 2)
    added_delay = max([a["delay_min"] for a in assignments], default=0)
    penalty = round(PLAN_CHANGE_PENALTY_INR * len(assignments) + 120 * max(0, added_delay), 2)
    solve_ms = int((time.perf_counter() - started) * 1000)

    return {
        "status": "feasible" if not uncovered else ("partial" if assignments else "infeasible"),
        "assignments": assignments,
        "frozen": frozen,
        "uncovered": [{"shipment_id": a["shipment_id"], "code": a.get("code")} for a in uncovered],
        "extra_cost": extra_cost,
        "added_delay_min": added_delay,
        "plan_stability_penalty": penalty,
        "swaps_applied": swapped,
        "solve_ms": solve_ms,
        "explanation": (
            f"{len(affected)} affected load(s) freed; {len(frozen)} unaffected commitment(s) frozen. "
            f"{len(assignments)} standby vehicle(s) proposed, extra cost ₹{extra_cost:,.0f}, "
            f"max additional delay {added_delay} min, plan-change penalty ₹{penalty:,.0f}."
            if assignments
            else "No feasible standby capacity exists. Recovery is unavailable — the system cannot create a vehicle."
        ),
        "requires_admin_approval": True,
    }


def _order(stops: list[tuple[float, float]], depot, dest) -> list[tuple[float, float]]:
    remaining, cur, out = list(stops), depot, []
    while remaining:
        nxt = min(remaining, key=lambda p: road_km(cur[0], cur[1], p[0], p[1]))
        out.append(nxt)
        remaining.remove(nxt)
        cur = nxt
    return out


def _route_km(depot, stops, dest) -> float:
    total, cur = 0.0, depot
    for s in stops:
        total += road_km(cur[0], cur[1], s[0], s[1])
        cur = s
    total += road_km(cur[0], cur[1], dest["lat"], dest["lng"])
    return round(total, 2)
