"""CrossFlow-Backhaul — return-load matching.

Accept an offer only when the incremental revenue beats the incremental cost and
the extra distance/time cannot jeopardise the next committed trip.
"""
from __future__ import annotations

from .compat import check as compat_check
from .geo import road_km, travel_minutes

RETAIL_BACKHAUL_CARGO = [
    {"cargo_type": "fertiliser", "label": "Fertiliser bags", "inr_per_tonne_km": 3.4},
    {"cargo_type": "seed", "label": "Certified seed", "inr_per_tonne_km": 3.1},
    {"cargo_type": "cement", "label": "Cement bags", "inr_per_tonne_km": 2.6},
    {"cargo_type": "packaging", "label": "Packaging / crates", "inr_per_tonne_km": 3.9},
    {"cargo_type": "fmcg", "label": "FMCG retail stock", "inr_per_tonne_km": 4.2},
]


def opportunities(
    *,
    trip_end: tuple[float, float],
    next_committed: tuple[float, float] | None,
    vehicle_class: str,
    capacity_kg: int,
    outbound_commodity: str,
    available_window_hours: float = 6.0,
    cost_per_km: float = 20.0,
    driver_cost_per_hour: float = 140.0,
    max_extra_km: float = 55.0,
) -> list[dict]:
    out = []
    for cargo in RETAIL_BACKHAUL_CARGO:
        compat = compat_check(outbound_commodity, cargo["cargo_type"])
        for lane_km in (18, 27, 41):
            # pretend the retail pickup sits lane_km back along the return corridor
            load_kg = min(capacity_kg * 0.55, capacity_kg)
            extra_km = round(lane_km * 2 * 0.35, 1)
            if extra_km > max_extra_km:
                continue
            tonnes = load_kg / 1000
            revenue = round(tonnes * lane_km * cargo["inr_per_tonne_km"] * 1.35, 0)
            extra_cost = round(extra_km * cost_per_km + travel_minutes(vehicle_class, extra_km) / 60 * driver_cost_per_hour, 0)
            net = revenue - extra_cost
            risky = False
            if next_committed:
                gap = road_km(trip_end[0], trip_end[1], next_committed[0], next_committed[1])
                need_h = (extra_km + gap) / max(20, 42) + 1.0
                risky = need_h > available_window_hours
            out.append({
                "cargo_type": cargo["cargo_type"],
                "label": cargo["label"],
                "lane_km": lane_km,
                "extra_distance_km": extra_km,
                "load_kg": load_kg,
                "revenue": revenue,
                "extra_cost": extra_cost,
                "net_gain": round(net),
                "time_hours": round(travel_minutes(vehicle_class, extra_km) / 60 + 0.6, 2),
                "compatible": compat["compatible"],
                "compatibility_notes": compat["hard"] + compat["soft"],
                "jeopardises_next_trip": risky,
                "recommend": bool(net > 0 and compat["compatible"] and not risky),
                "rule": "Accept only if incremental revenue > incremental cost and next committed trip is safe.",
            })
    out.sort(key=lambda o: (o["recommend"], o["net_gain"]), reverse=True)
    return out[:6]
