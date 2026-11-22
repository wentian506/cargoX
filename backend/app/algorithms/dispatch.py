"""DispatchSense — GO / WAIT / SPLIT / CANCEL with an explicit marginal rule.

v1 is a transparent threshold policy, not a claim of global optimality:

    wait_benefit(t) = P(extra compatible cargo arrives) x value_density(INR/kg) x expected_kg
    delay_cost(t)   = holding + quality-loss + missed-mandi-window + vehicle-idle

    GO     when wait_benefit <= delay_cost  OR  hard deadline is near
    WAIT   when a compatible arrival is plausible and risk stays acceptable
    SPLIT  when part of the load is urgent/ready and part can join a later wave
    CANCEL when no feasible trip exists
"""
from __future__ import annotations

from datetime import datetime, timezone

QUALITY_LOSS_PER_HOUR = {"wheat": 0.004, "paddy": 0.004, "maize": 0.006, "potato": 0.022,
                         "tomato": 0.075, "onion": 0.028, "mustard": 0.005, "cotton": 0.003}
MANDI_CLOSING_HOUR = 18  # arrivals after this queue overnight


def _hours_until(deadline_iso: str | None, now: datetime) -> float | None:
    if not deadline_iso:
        return None
    try:
        dl = datetime.fromisoformat(deadline_iso.replace("Z", "+00:00"))
        if dl.tzinfo is None:
            dl = dl.replace(tzinfo=timezone.utc)
        return round((dl - now).total_seconds() / 3600, 2)
    except Exception:
        return None


def decide(
    *,
    pool_kg: float,
    capacity_kg: float,
    expected_arrival_kg: float = 0.0,
    commodity: str = "wheat",
    value_per_kg: float = 22.75,
    ready_ratio: float = 1.0,
    hours_to_deadline: float | None = None,
    urgency: float = 0.5,
    now: datetime | None = None,
    next_checkpoint_minutes: int = 45,
    vehicle_idle_inr_per_hour: float = 180.0,
    wait_step_minutes: int = 30,
) -> dict:
    now = now or datetime.now(timezone.utc)
    utilisation = pool_kg / capacity_kg if capacity_kg else 0.0
    loss_rate = QUALITY_LOSS_PER_HOUR.get(commodity.strip().lower(), 0.008)

    # expected additional cargo usable at the next checkpoint
    p_arrive = 0.55 if expected_arrival_kg > 0 else 0.0
    extra_useful = min(expected_arrival_kg, max(0.0, capacity_kg - pool_kg))
    wait_benefit = round(p_arrive * extra_useful * value_per_kg * 0.18, 2)  # 18% = freight share of value

    wait_hours = wait_step_minutes / 60
    quality_cost = round(pool_kg * value_per_kg * loss_rate * wait_hours, 2)
    idle_cost = round(vehicle_idle_inr_per_hour * wait_hours, 2)
    # probability that waiting pushes arrival past mandi closing / deadline
    deadline_pressure = 0.0
    if hours_to_deadline is not None:
        deadline_pressure = max(0.0, 1 - (hours_to_deadline - wait_hours) / 6)
    window_penalty = round(pool_kg * value_per_kg * 0.06 * deadline_pressure * urgency, 2)
    delay_cost = round(quality_cost + idle_cost + window_penalty, 2)

    net = round(wait_benefit - delay_cost, 2)
    reasons: list[str] = []
    reasons.append(f"Load {pool_kg:,.0f} kg = {utilisation:.0%} of {capacity_kg:,.0f} kg capacity.")
    reasons.append(f"Waiting {wait_step_minutes} min: benefit ₹{wait_benefit:,.0f} vs delay cost ₹{delay_cost:,.0f}.")
    if expected_arrival_kg:
        reasons.append(f"Expected compatible arrivals ≈ {expected_arrival_kg:,.0f} kg (usable {extra_useful:,.0f} kg).")
    if hours_to_deadline is not None:
        reasons.append(f"{hours_to_deadline:.1f} h to hard deadline; deadline pressure {deadline_pressure:.0%}.")

    # --- decision cascade ------------------------------------------------ #
    if capacity_kg <= 0:
        decision = "CANCEL"
        reasons.insert(0, "No vehicle capacity is committed for this corridor.")
    elif ready_ratio < 0.45:
        decision = "SPLIT"
        reasons.insert(0, f"Only {ready_ratio:.0%} of the pool is ready — dispatch the ready share now, hold the rest for the next wave.")
    elif hours_to_deadline is not None and hours_to_deadline <= wait_hours + 0.5:
        decision = "GO"
        reasons.insert(0, "Hard deadline is closer than the next checkpoint — depart now.")
    elif net > max(400, 0.04 * pool_kg * value_per_kg * 0.01) and utilisation < 0.95:
        decision = "WAIT"
        reasons.insert(0, "A compatible arrival is plausible and the expected gain exceeds holding + quality + idle cost.")
    elif utilisation < 0.6 and p_arrive >= 0.5 and (hours_to_deadline is None or hours_to_deadline > 3):
        decision = "WAIT"
        reasons.insert(0, "Low utilisation and acceptable risk — one checkpoint of waiting is justified.")
    elif utilisation >= 0.35:
        decision = "GO"
        reasons.insert(0, "Waiting no longer pays for itself; the expected gain is below the cost of delay.")
    else:
        decision = "SPLIT" if pool_kg > 0 else "CANCEL"
        reasons.insert(0, "Partial load — dispatch what is ready, consolidate the remainder in a later wave.")

    if decision == "SPLIT" and ready_ratio >= 0.45:
        decision = "GO"

    return {
        "decision": decision,
        "wait_benefit": wait_benefit,
        "delay_cost": delay_cost,
        "net_gain_of_waiting": net,
        "utilisation": round(utilisation, 3),
        "quality_cost": quality_cost,
        "idle_cost": idle_cost,
        "window_penalty": window_penalty,
        "deadline_pressure": round(deadline_pressure, 3),
        "next_checkpoint": f"T+{next_checkpoint_minutes} min",
        "reasons": reasons,
        "explanation": " ".join(reasons),
        "policy": "threshold_marginal_benefit_v1",
    }
