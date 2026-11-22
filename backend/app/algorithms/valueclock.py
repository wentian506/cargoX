"""ValueClock + ThermoDecay + MandiQueue-Twin.

Net realisation for a destination:
    expected_price x quantity x quality_retention - freight_share - delay/queue cost

Retention uses a published-handling-style lookup curve; it is a proxy, not a
spoilage prediction, and it always carries explicit assumptions.
"""
from __future__ import annotations

from .geo import road_km, travel_minutes

# baseline percent quality retained after 24 h at ambient rural handling
RETENTION_24H = {
    "wheat": 0.998, "paddy": 0.997, "maize": 0.995, "mustard": 0.997, "cotton": 0.999,
    "potato": 0.965, "onion": 0.955, "tomato": 0.86, "banana": 0.88,
}
# extra loss per additional 8 h
RETENTION_8H_DECAY = {
    "wheat": 0.0005, "paddy": 0.0006, "maize": 0.001, "mustard": 0.0005, "cotton": 0.0003,
    "potato": 0.010, "onion": 0.014, "tomato": 0.055, "banana": 0.045,
}


def retention(commodity: str, hours: float, temperature_c: float | None = None) -> float:
    c = commodity.strip().lower()
    base = RETENTION_24H.get(c, 0.98)
    decay = RETENTION_8H_DECAY.get(c, 0.002)
    r = base - decay * max(0.0, (hours - 24) / 8)
    if temperature_c is not None and temperature_c > 30 and c in ("tomato", "banana", "potato", "onion"):
        r -= 0.02 * ((temperature_c - 30) / 5)
    return round(max(0.4, min(1.0, r)), 4)


def evaluate_destinations(
    *,
    commodity: str,
    quantity_kg: float,
    origin: tuple[float, float],
    destinations: list[dict],
    freight_share: float,
    vehicle_class: str = "lcv",
    ready_at_hour: int = 6,
) -> dict:
    """destinations: [{id, name, lat, lng, price_per_quintal, queue_minutes, confidence}]"""
    out = []
    for d in destinations:
        dist = road_km(origin[0], origin[1], d["lat"], d["lng"])
        travel_h = travel_minutes(vehicle_class, dist) / 60
        queue_h = float(d.get("queue_minutes") or 45) / 60
        waiting_h = 1.2 + queue_h  # arrival processing + weighbridge queue
        hours = travel_h + waiting_h
        ret = retention(commodity, hours)
        price_q = float(d.get("price_per_quintal") or 0)
        q_q = quantity_kg / 100.0
        gross = price_q * q_q * ret
        queue_cost = q_q * price_q * (1 - retention(commodity, 24 + queue_h)) * 0.6
        delay_cost = round(queue_cost + queue_h * 220, 2)
        net = round(gross - freight_share - delay_cost, 2)
        out.append(
            {
                "destination_id": d.get("id"),
                "name": d["name"],
                "distance_km": dist,
                "travel_hours": round(travel_h, 2),
                "queue_minutes": int(d.get("queue_minutes") or 45),
                "hours_to_sale": round(hours, 2),
                "retention": ret,
                "price_per_quintal": price_q,
                "gross_value": round(gross, 2),
                "freight_share": round(freight_share, 2),
                "delay_queue_cost": delay_cost,
                "net_realisation": net,
                "per_quintal_net": round(net / max(q_q, 0.01), 2),
                "confidence": d.get("confidence", 0.6),
                "arrival_after_closing": (ready_at_hour + hours) > 18,
            }
        )
    out.sort(key=lambda r: r["net_realisation"], reverse=True)
    for i, r in enumerate(out):
        r["rank"] = i + 1
    best = out[0] if out else None
    alt = out[1] if len(out) > 1 else None
    return {
        "commodity": commodity,
        "quantity_kg": quantity_kg,
        "options": out,
        "recommended": best["destination_id"] if best else None,
        "uplift_vs_next": round((best["net_realisation"] - alt["net_realisation"]), 2) if best and alt else 0.0,
        "requires_sender_approval": True,
        "assumptions": [
            "Retention uses a published-handling lookup curve, not a spoilage model.",
            "Prices are indicative mandi observations with stated confidence.",
            "Freight share is the sender's allocated cost from ShapleySplit.",
            "The system never redirects produce without explicit sender approval.",
        ],
    }
