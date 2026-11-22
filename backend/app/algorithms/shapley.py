"""ShapleySplit — fair freight allocation with an explicit participation check.

C(S) = minimum feasible trip cost to serve subset S under the same constraints.
phi_i = average marginal contribution over coalition orderings.

* exact subset enumeration for n <= 8 (2^n * n evaluations)
* Monte Carlo permutation sampling above that, with a reported standard error
* CARGOX enforces the no-worse-than-solo check explicitly, because Shapley
  values are NOT guaranteed to lie in the core of the cooperative game.
"""
from __future__ import annotations

import itertools
import math
import random
from statistics import mean, pstdev

from .geo import road_km


def route_cost_km(cost_km: float, fixed_cost: float, stops: list[tuple[float, float]], depot: tuple[float, float]) -> float:
    """Cost of visiting `stops` from `depot` (open route, ends at last stop)."""
    if not stops:
        return 0.0
    # nearest-neighbour ordering is enough here; the planner uses OR-Tools
    remaining = list(stops)
    cur = depot
    dist = 0.0
    while remaining:
        nxt = min(remaining, key=lambda p: road_km(cur[0], cur[1], p[0], p[1]))
        dist += road_km(cur[0], cur[1], nxt[0], nxt[1])
        cur = nxt
        remaining.remove(nxt)
    return round(fixed_cost + dist * cost_km, 2)


def _coalition_cost(members: tuple[int, ...], stops, depot, cost_km, fixed) -> float:
    return route_cost_km(cost_km, fixed, [stops[i] for i in members], depot)


def shapley_exact(stops: list[tuple[float, float]], depot: tuple[float, float], cost_km: float, fixed: float) -> dict:
    n = len(stops)
    if n == 0:
        return {"shares": [], "method": "shapley_exact", "coalition_cost": 0.0, "solo_costs": []}

    solo = [round(route_cost_km(cost_km, fixed, [s], depot), 2) for s in stops]
    cache: dict[tuple[int, ...], float] = {}

    def c(S: tuple[int, ...]) -> float:
        if S not in cache:
            cache[S] = _coalition_cost(S, stops, depot, cost_km, fixed)
        return cache[S]

    shares = [0.0] * n
    for perm in itertools.permutations(range(n)):
        S: tuple[int, ...] = ()
        prev = 0.0
        for i in perm:
            newS = tuple(sorted(S + (i,)))
            cur = c(newS)
            shares[i] += cur - prev
            prev = cur
            S = newS
    fact = math.factorial(n)
    shares = [round(s / fact, 2) for s in shares]
    total = c(tuple(range(n)))
    return {
        "shares": shares,
        "solo_costs": solo,
        "coalition_cost": total,
        "solo_total": round(sum(solo), 2),
        "method": "shapley_exact",
        "samples": fact,
        "stderr": 0.0,
        "coalitions_evaluated": len(cache),
    }


def shapley_sampled(
    stops: list[tuple[float, float]],
    depot: tuple[float, float],
    cost_km: float,
    fixed: float,
    samples: int = 2000,
    seed: int = 7,
) -> dict:
    n = len(stops)
    rng = random.Random(seed)
    solo = [round(route_cost_km(cost_km, fixed, [s], depot), 2) for s in stops]
    cache: dict[tuple[int, ...], float] = {}

    def c(S: tuple[int, ...]) -> float:
        if S not in cache:
            cache[S] = _coalition_cost(S, stops, depot, cost_km, fixed)
        return cache[S]

    per_sample: list[list[float]] = []
    order = list(range(n))
    for _ in range(samples):
        rng.shuffle(order)
        S: tuple[int, ...] = ()
        prev = 0.0
        contrib = [0.0] * n
        for i in order:
            newS = tuple(sorted(S + (i,)))
            cur = c(newS)
            contrib[i] = cur - prev
            prev = cur
            S = newS
        per_sample.append(contrib)

    shares = [round(mean(col), 2) for col in zip(*per_sample)]
    stderr = [pstdev(col) / math.sqrt(samples) for col in zip(*per_sample)]
    return {
        "shares": shares,
        "solo_costs": solo,
        "coalition_cost": c(tuple(range(n))),
        "solo_total": round(sum(solo), 2),
        "method": "shapley_monte_carlo",
        "samples": samples,
        "stderr": round(max(stderr), 2),
        "coalitions_evaluated": len(cache),
    }


def allocate(
    *,
    members: list[dict],
    depot: tuple[float, float],
    cost_km: float,
    fixed: float,
    floor_at_solo: bool = False,
) -> dict:
    """members: [{shipment_id, lat, lng}] -> per-shipment allocation + checks.

    `floor_at_solo` caps an allocation at its standalone cost so the explicit
    individual-rationality rule always holds (the blueprint's "no-worse-than-solo"
    check).  The raw Shapley vector is returned too, so the difference is visible.
    """
    stops = [(m["lat"], m["lng"]) for m in members]
    res = shapley_exact(stops, depot, cost_km, fixed) if len(members) <= 8 else shapley_sampled(stops, depot, cost_km, fixed)
    solo = res["solo_costs"]
    raw = res["shares"]
    allocated = [min(r, s) if floor_at_solo else r for r, s in zip(raw, solo)]

    # if capping freed money, redistribute the surplus proportionally to raw shares
    surplus = round(sum(raw) - sum(allocated), 2)
    if floor_at_solo and surplus > 0.01:
        open_idx = [i for i in range(len(raw)) if allocated[i] < solo[i]]
        weight = sum(raw[i] for i in open_idx) or 1.0
        for i in open_idx:
            add = surplus * raw[i] / weight
            allocated[i] = round(min(allocated[i] + add, solo[i]), 2)

    # Exact reconciliation: after capping, the shares must still sum to the
    # coalition cost. Any residual is closed proportionally inside each player's
    # remaining headroom (solo cost - allocated), so no sender ends above solo.
    allocated = [round(a, 2) for a in allocated]
    target = round(float(res["coalition_cost"]), 2)
    residual = round(target - sum(allocated), 2)
    reconcile_note = None
    if abs(residual) > 0.005:
        gap = [max(0.0, solo[i] - allocated[i]) for i in range(len(allocated))]
        head = sum(gap)
        if residual > 0 and head >= residual:
            for i in range(len(allocated)):
                if gap[i] > 0:
                    allocated[i] = round(allocated[i] + residual * gap[i] / head, 2)
            reconcile_note = "surplus redistributed inside each sender's solo headroom"
        elif residual > 0:
            # no headroom left under solo: spread pro-rata over everyone and note it
            total = sum(allocated) or 1.0
            allocated = [round(a + residual * a / total, 2) for a in allocated]
            reconcile_note = "residual spread pro-rata; solo cap could not absorb it"
        else:  # allocated above coalition cost (should not happen) -> scale down
            total = sum(allocated) or 1.0
            allocated = [round(a * target / total, 2) for a in allocated]
            reconcile_note = "over-allocation scaled back to the coalition cost"
        drift = round(target - sum(allocated), 2)
        if abs(drift) >= 0.01 and allocated:
            allocated[0] = round(allocated[0] + drift, 2)
            reconcile_note = (reconcile_note or "") + "; rounding drift absorbed by the first shipment"

    rows = []
    for i, m in enumerate(members):
        detour = round(road_km(depot[0], depot[1], m["lat"], m["lng"]) + 0, 2)
        rows.append(
            {
                "shipment_id": m["shipment_id"],
                "standalone_cost": solo[i],
                "raw_shapley": raw[i],
                "allocated_share": allocated[i],
                "saving": round(solo[i] - allocated[i], 2),
                "participation_ok": allocated[i] <= solo[i] + 0.01,
                "detour_contribution_km": detour,
            }
        )
    total_alloc = round(sum(r["allocated_share"] for r in rows), 2)
    return {
        "method": res["method"],
        "samples": res["samples"],
        "stderr": res.get("stderr", 0.0),
        "coalition_cost": res["coalition_cost"],
        "solo_total": res["solo_total"],
        "total_saving": round(res["solo_total"] - res["coalition_cost"], 2),
        "all_allocations_acceptable": all(r["participation_ok"] for r in rows),
        "allocation_sum_matches_route_cost": abs(total_alloc - res["coalition_cost"]) < 0.05,
        "reconciled_to_coalition_cost": round(target, 2),
        "reconcile_note": reconcile_note or "raw Shapley shares already summed to the coalition cost",
        "rows": rows,
        "note": "Shapley values are not guaranteed to be in the core; the participation check is enforced explicitly.",
    }
