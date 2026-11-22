"""ReadySync — T-60 / T-45 readiness check-ins and wave management."""
from __future__ import annotations

from datetime import datetime, timezone

CHECKPOINTS = [60, 45]


def checkpoint_state(departure_iso: str | None, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    if not departure_iso:
        return {"minutes_to_departure": None, "active_checkpoint": None, "state": "no_departure_set"}
    try:
        dep = datetime.fromisoformat(departure_iso.replace("Z", "+00:00"))
        if dep.tzinfo is None:
            dep = dep.replace(tzinfo=timezone.utc)
    except Exception:
        return {"minutes_to_departure": None, "active_checkpoint": None, "state": "invalid_departure"}
    mins = (dep - now).total_seconds() / 60
    active = None
    for cp in CHECKPOINTS:
        if 0 <= mins <= cp:
            active = cp
            break
    return {
        "minutes_to_departure": round(mins, 1),
        "active_checkpoint": active,
        "checkpoints": [f"T-{c}" for c in CHECKPOINTS],
        "state": "check_in_due" if active else ("dispatched" if mins < 0 else "scheduled"),
    }


def readiness_verdict(shipments: list[dict]) -> dict:
    """shipments: [{id, code, ready_check}] -> wave decision."""
    total = len(shipments)
    ready = [s for s in shipments if s.get("ready_check") == "ready"]
    delayed = [s for s in shipments if s.get("ready_check") == "delayed"]
    unknown = [s for s in shipments if s.get("ready_check") not in ("ready", "delayed")]
    ratio = round(len(ready) / total, 3) if total else 0.0
    if ratio >= 0.85:
        action = "DISPATCH_WAVE"
        note = "Wave is ready. Proceed to dispatch approval."
    elif ratio >= 0.5:
        action = "DISPATCH_READY_AND_DEFER_REST"
        note = "Dispatch the ready share now; move unready consignments to the next wave."
    else:
        action = "HOLD_WAVE"
        note = "Too few ready consignments — hold the wave or re-plan capacity."
    return {
        "total": total,
        "ready": len(ready),
        "delayed": len(delayed),
        "awaiting_check_in": len(unknown),
        "readiness_ratio": ratio,
        "action": action,
        "note": note,
        "deferred": [{"id": s["id"], "code": s.get("code")} for s in (delayed + unknown)],
        "penalty_policy": "Any incentive / rebate for unready loads is a pilot design question, not part of the MVP.",
    }
