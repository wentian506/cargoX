"""AgroCompat — commodity compatibility rules for pooling.

Hard incompatibilities block consolidation; soft ones only warn.  Rules are
expressed as broad priors from published handling guidance (ICAR/FAO style),
never as exact biological predictions.
"""
from __future__ import annotations

PROFILES: dict[str, dict] = {
    "wheat":    {"ethylene_emit": 0.0, "ethylene_sensitive": 0.2, "moisture": "dry", "odour": 0.1, "crush": 0.1, "temp": "ambient", "stack": "bag_stack"},
    "paddy":    {"ethylene_emit": 0.0, "ethylene_sensitive": 0.3, "moisture": "dry", "odour": 0.1, "crush": 0.1, "temp": "ambient", "stack": "bag_stack"},
    "maize":    {"ethylene_emit": 0.1, "ethylene_sensitive": 0.3, "moisture": "dry", "odour": 0.2, "crush": 0.2, "temp": "ambient", "stack": "bag_stack"},
    "mustard":  {"ethylene_emit": 0.1, "ethylene_sensitive": 0.3, "moisture": "dry", "odour": 0.6, "crush": 0.2, "temp": "ambient", "stack": "bag_stack"},
    "cotton":   {"ethylene_emit": 0.0, "ethylene_sensitive": 0.2, "moisture": "dry", "odour": 0.2, "crush": 0.1, "temp": "ambient", "stack": "bale"},
    "potato":   {"ethylene_emit": 0.7, "ethylene_sensitive": 0.4, "moisture": "moderate", "odour": 0.5, "crush": 0.7, "temp": "cool_vented", "stack": "crate"},
    "onion":    {"ethylene_emit": 0.5, "ethylene_sensitive": 0.4, "moisture": "moderate", "odour": 0.8, "crush": 0.7, "temp": "cool_vented", "stack": "mesh_bag"},
    "tomato":   {"ethylene_emit": 0.9, "ethylene_sensitive": 0.9, "moisture": "high", "odour": 0.3, "crush": 0.95, "temp": "cool_vented", "stack": "crate"},
    "banana":   {"ethylene_emit": 0.9, "ethylene_sensitive": 0.6, "moisture": "moderate", "odour": 0.3, "crush": 0.9, "temp": "cool_vented", "stack": "crate"},
    "fertiliser": {"ethylene_emit": 0.0, "ethylene_sensitive": 0.0, "moisture": "dry", "odour": 0.3, "crush": 0.0, "temp": "ambient", "stack": "bag_stack", "chemical": True},
    "cement":   {"ethylene_emit": 0.0, "ethylene_sensitive": 0.0, "moisture": "dry", "odour": 0.1, "crush": 0.0, "temp": "ambient", "stack": "bag_stack", "dust": True},
    "seed":     {"ethylene_emit": 0.0, "ethylene_sensitive": 0.2, "moisture": "dry", "odour": 0.1, "crush": 0.1, "temp": "ambient", "stack": "bag_stack"},
    "onion_flakes": {"ethylene_emit": 0.4, "ethylene_sensitive": 0.3, "moisture": "dry", "odour": 0.7, "crush": 0.2, "temp": "ambient", "stack": "bag_stack"},
}


def _p(commodity: str) -> dict:
    key = commodity.strip().lower().replace(" ", "_")
    return PROFILES.get(key, PROFILES["wheat"])


def check(a: str, b: str) -> dict:
    """Partial compatibility verdict for one pair of commodities."""
    if a.strip().lower() == b.strip().lower():
        return {"pair": [a, b], "compatible": True, "hard": [], "soft": [], "score": 1.0}

    pa, pb = _p(a), _p(b)
    hard: list[str] = []
    soft: list[str] = []

    # --- hard rules ------------------------------------------------------- #
    if pa.get("chemical") and pb.get("moisture") in ("high", "moderate"):
        hard.append("agro-chemical residue risk with fresh produce")
    if pb.get("chemical") and pa.get("moisture") in ("high", "moderate"):
        hard.append("agro-chemical residue risk with fresh produce")
    if pa.get("dust") and pb.get("moisture") in ("high", "moderate"):
        hard.append("cement dust contamination of fresh produce")
    if pb.get("dust") and pa.get("moisture") in ("high", "moderate"):
        hard.append("cement dust contamination of fresh produce")
    if pa["ethylene_emit"] >= 0.6 and pb["ethylene_sensitive"] >= 0.6:
        hard.append("ethylene producer with ethylene-sensitive cargo")
    if pb["ethylene_emit"] >= 0.6 and pa["ethylene_sensitive"] >= 0.6:
        hard.append("ethylene producer with ethylene-sensitive cargo")
    if pa["temp"] != pb["temp"] and "ambient" not in (pa["temp"], pb["temp"]):
        hard.append("incompatible temperature regimes")
    if pa["moisture"] == "dry" and pb["moisture"] in ("high",):
        hard.append("dry grain spoilage risk from high-moisture cargo")
    if pb["moisture"] == "dry" and pa["moisture"] in ("high",):
        hard.append("dry grain spoilage risk from high-moisture cargo")

    # --- soft rules ------------------------------------------------------- #
    if max(pa["odour"], pb["odour"]) >= 0.6 and min(pa["crush"], pb["crush"]) >= 0:
        if pa["odour"] >= 0.6 and pb["crush"] >= 0.2 or pb["odour"] >= 0.6 and pa["crush"] >= 0.2:
            soft.append("odour taint risk — separate with liner/sheet")
    if pa["crush"] >= 0.6 or pb["crush"] >= 0.6:
        if pa["stack"] != pb["stack"]:
            soft.append("crush / stacking mismatch — crate layer required")
    if pa["moisture"] != pb["moisture"]:
        soft.append("moisture mismatch — verify ventilation and tarping")

    score = 1.0 - 0.9 * len(hard) - 0.15 * len(soft)
    return {
        "pair": [a, b],
        "compatible": len(hard) == 0,
        "hard": hard,
        "soft": soft,
        "score": round(max(0.0, min(1.0, score)), 2),
    }


def check_set(commodities: list[str]) -> dict:
    uniq = sorted({c.strip().lower() for c in commodities})
    pairs = []
    for i in range(len(uniq)):
        for j in range(i + 1, len(uniq)):
            pairs.append(check(uniq[i], uniq[j]))
    blockers = [p for p in pairs if not p["compatible"]]
    warnings = [w for p in pairs for w in p["soft"]]
    return {
        "commodities": uniq,
        "compatible": not blockers,
        "blockers": blockers,
        "warnings": sorted(set(warnings)),
        "recommendation": (
            "Pooling allowed. Apply listed handling precautions."
            if not blockers
            else "Hard incompatibility — split these consignments into separate vehicles."
        ),
    }
