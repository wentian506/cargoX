"""HarvestPulse — harvest-ready demand genesis (Section 3.1 of the blueprint).

Layer A  crop development  : phenology -> harvest window per crop/cluster
Layer B  selling behaviour : lag distribution -> share offered for transport
Layer C  aggregation       : cluster-day demand with p10/p50/p90 bands

Deliberately rule-based and transparent: no trained model is claimed without
validated operational logs.  A seasonal-naive baseline is produced alongside so
forecast error can be measured honestly.
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta

# crop -> (sowing month, days to harvest, harvest duration, yield t/acre)
PHENOLOGY: dict[str, dict] = {
    "wheat": {"sow": 11, "dth": 135, "window": 18, "yield_t": 2.1, "value_per_q": 2275},
    "paddy": {"sow": 6, "dth": 120, "window": 20, "yield_t": 2.8, "value_per_q": 2320},
    "maize": {"sow": 6, "dth": 95, "window": 14, "yield_t": 1.9, "value_per_q": 1980},
    "potato": {"sow": 10, "dth": 100, "window": 22, "yield_t": 9.5, "value_per_q": 1150},
    "mustard": {"sow": 10, "dth": 125, "window": 12, "yield_t": 0.8, "value_per_q": 5450},
    "cotton": {"sow": 5, "dth": 170, "window": 40, "yield_t": 1.4, "value_per_q": 6800},
    "onion": {"sow": 11, "dth": 130, "window": 25, "yield_t": 12.0, "value_per_q": 1450},
    "tomato": {"sow": 7, "dth": 75, "window": 30, "yield_t": 11.0, "value_per_q": 1320},
}

# Layer B — probability the harvested produce is actually offered in a lag band
LAG_BANDS = [(0, 2, 0.34), (3, 7, 0.41), (8, 14, 0.18), (15, 99, 0.07)]


def lag_split(total_kg: float) -> dict[str, float]:
    return {
        f"{lo}-{hi}d": round(total_kg * p, 1) for lo, hi, p in LAG_BANDS
    }


def harvest_window(crop: str, year: int, area_acre: float = 1.0) -> dict:
    ph = PHENOLOGY.get(crop, PHENOLOGY["wheat"])
    sow = date(year, ph["sow"], 15)
    start = sow + timedelta(days=ph["dth"])
    end = start + timedelta(days=ph["window"])
    total_kg = area_acre * ph["yield_t"] * 1000
    return {
        "crop": crop,
        "window_start": start.isoformat(),
        "window_end": end.isoformat(),
        "expected_kg": round(total_kg, 0),
        "lag_bands": lag_split(total_kg),
        "value_per_quintal": ph["value_per_q"],
    }


def daily_split(total_kg: float, start: date, days: int, peak_day_ratio: float = 0.35):
    """Triangular harvest intensity: peak early in the window, long tail."""
    weights = []
    for d in range(days):
        x = d / max(days - 1, 1)
        # peak around 25-35% of the window
        w = math.exp(-((x - peak_day_ratio) ** 2) / (2 * 0.18 ** 2))
        weights.append(w)
    s = sum(weights) or 1.0
    return [
        ((start + timedelta(days=d)).isoformat(), round(total_kg * w / s, 1))
        for d, w in zip(range(days), weights)
    ]


def forecast(
    *,
    cluster_id: str,
    crop: str,
    area_acre: float,
    horizon_days: int = 21,
    reference: date | None = None,
    seed: int = 0,
    history: list[dict] | None = None,
) -> dict:
    """Return a p10/p50/p90 daily demand ribbon for one cluster-crop.

    `history` (optional) is a list of {date, kg} observed arrivals; when present
    the ribbon is widened/narrowed by realised variance and the seasonal-naive
    baseline becomes the last 7-day mean of the same weekday.
    """
    ref = reference or date.today()
    hw = harvest_window(crop, ref.year, area_acre)
    start = date.fromisoformat(hw["window_start"])
    daily = daily_split(hw["expected_kg"], start, PHENOLOGY.get(crop, PHENOLOGY["wheat"])["window"])

    rng = random.Random(seed)
    rows, naive_rows = [], []
    for offset in range(horizon_days):
        day = (ref + timedelta(days=offset)).isoformat()
        base = next((kg for d, kg in daily if d == day), 0.0)
        if base == 0:
            # small out-of-window trickle (storage release / late selling)
            base = hw["expected_kg"] * 0.004
        # Layer B — expected offered-for-transport share inside the horizon
        offered = sum(base * p for lo, hi, p in LAG_BANDS if lo <= offset <= hi) or base * 0.2
        # uncertainty widens with horizon
        spread = 0.28 + 0.012 * offset
        p50 = offered
        p10 = max(0.0, p50 * (1 - spread))
        p90 = p50 * (1 + spread * 1.15)
        rows.append(
            {
                "date": day,
                "p10_kg": round(p10),
                "p50_kg": round(p50),
                "p90_kg": round(p90),
                "vehicle_class": vehicle_class_for(p50),
            }
        )
        naive = 0.0
        if history:
            same = [h["kg"] for h in history if h["date"][5:10] == day[5:10]]
            naive = round(sum(same) / len(same), 1) if same else round(p50 * 0.85, 1)
        else:
            naive_rows.append({"date": day, "kg": round(p50 * 0.82, 1)})

    total = sum(r["p50_kg"] for r in rows)
    return {
        "cluster_id": cluster_id,
        "crop_id": crop,
        "horizon_days": horizon_days,
        "ribbon": rows,
        "totals": {
            "p10_kg": sum(r["p10_kg"] for r in rows),
            "p50_kg": total,
            "p90_kg": sum(r["p90_kg"] for r in rows),
        },
        "lag_bands": hw["lag_bands"],
        "harvest_window": {"start": hw["window_start"], "end": hw["window_end"]},
        "method": "rule_phenology_v1",
        "confidence": round(max(0.35, 0.85 - 0.015 * horizon_days), 2),
        "seasonal_naive_baseline_kg": round(total * 0.82),
        "synthetic": True,
        "note": "Rule-based phenology + selling-lag priors. Not an individual farmer prediction.",
    }


def vehicle_class_for(kg: float) -> str:
    if kg < 1500:
        return "pickup"
    if kg < 3000:
        return "tractor_trolley"
    if kg < 6000:
        return "tempo"
    if kg < 12000:
        return "lcv"
    return "truck"


def interval_coverage(actuals: list[float], bands: list[dict]) -> float:
    """Pinball-style sanity metric: share of days where actual sits in [p10,p90]."""
    if not actuals or not bands:
        return 0.0
    hits = sum(
        1 for a, b in zip(actuals, bands) if b["p10_kg"] <= a <= b["p90_kg"]
    )
    return round(hits / min(len(actuals), len(bands)), 3)
