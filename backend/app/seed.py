"""Idempotent seed for the Ludhiana–Khanna–Mandi Gobindgarh corridor.

Real place names, synthetic operational data.  Every synthetic row is flagged
(`is_synthetic`) so the UI can label it honestly.
"""
from __future__ import annotations

import math
import uuid
from datetime import date, datetime, timedelta, timezone

from . import db
from .core.security import hash_password

_BOOT = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
NOW = _BOOT
LIVE = datetime.now(timezone.utc)   # live rows anchor here so the register always looks "in progress"
# `_BOOT` anchors trip clocks to the hour the seed ran; the live position is
# derived from the *current* time at read time, so a server left running for a day
# still shows vehicles mid-route instead of arrived everywhere.


def uid(prefix: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{prefix}_{uuid.uuid4().hex[:12]}"))


def _uuid_id(val: str | None) -> str | None:
    if val is None:
        return None
    s = str(val)
    try:
        return str(uuid.UUID(s))
    except (ValueError, TypeError):
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, s))


def iso(d: datetime | date | None = None) -> str:
    if d is None:
        return NOW.isoformat()
    if not isinstance(d, datetime) and isinstance(d, date):
        # plain date -> midnight UTC; datetimes must keep their time component
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc).isoformat()
    return d.isoformat()


VILLAGES = [
    ("V-KHN-01", "Bhari", "Ludhiana", 30.8421, 76.1520, "C-KHN"),
    ("V-KHN-02", "Isewal", "Ludhiana", 30.8244, 76.1810, "C-KHN"),
    ("V-KHN-03", "Libra", "Ludhiana", 30.8630, 76.1290, "C-KHN"),
    ("V-KHN-04", "Rohno Kalan", "Ludhiana", 30.8090, 76.1610, "C-KHN"),
    ("V-KHN-05", "Aloona Tola", "Ludhiana", 30.8795, 76.1980, "C-KHN"),
    ("V-PAY-01", "Payal", "Ludhiana", 30.7290, 76.0620, "C-PAY"),
    ("V-PAY-02", "Ghulal", "Ludhiana", 30.7460, 76.0910, "C-PAY"),
    ("V-PAY-03", "Jodhan", "Ludhiana", 30.7705, 76.0510, "C-PAY"),
    ("V-PAY-04", "Dakha", "Ludhiana", 30.7860, 75.9980, "C-PAY"),
    ("V-MLG-01", "Sahnewal", "Ludhiana", 30.8420, 75.9520, "C-MLG"),
    ("V-MLG-02", "Kohara", "Ludhiana", 30.8740, 75.9240, "C-MLG"),
    ("V-MLG-03", "Mangat", "Ludhiana", 30.8080, 75.9860, "C-MLG"),
]

HUBS = [
    ("H-KHN-01", "Khanna Rural Hub (FPO yard)", "Ludhiana", "approved", 30.7060, 76.2160, True, "06:00-20:00", 24000),
    ("H-KHN-02", "Isewal Roadside Transfer Shed", "Ludhiana", "candidate", 30.8210, 76.1740, False, "07:00-18:00", 9000),
    ("H-PAY-01", "Payal Cooperative Yard", "Ludhiana", "candidate", 30.7350, 76.0700, True, "06:00-19:00", 16000),
    ("H-MLG-01", "Sahnewal Cold Store Dock", "Ludhiana", "approved", 30.8400, 75.9540, True, "05:00-22:00", 30000),
]

MANDIS = [
    ("M-GOB", "Mandi Gobindgarh", "Fatehgarh Sahib", 30.6700, 76.2900, 55),
    ("M-KHN", "Khanna Mandi", "Ludhiana", 30.7040, 76.2230, 40),
    ("M-LDH", "Ludhiana Grain Market", "Ludhiana", 30.9120, 75.8480, 95),
    ("M-JAG", "Jagraon Mandi", "Ludhiana", 30.7870, 75.4740, 35),
    ("M-RAI", "Raikot Mandi", "Ludhiana", 30.6480, 75.6080, 30),
]

MARKET_PRICES = {
    "wheat": {"M-GOB": (2230, 2285, 2350), "M-KHN": (2210, 2270, 2330), "M-LDH": (2200, 2255, 2310),
              "M-JAG": (2180, 2240, 2300), "M-RAI": (2170, 2230, 2290)},
    "paddy": {"M-GOB": (2280, 2330, 2400), "M-KHN": (2270, 2320, 2385), "M-LDH": (2255, 2305, 2370),
              "M-JAG": (2240, 2290, 2355), "M-RAI": (2230, 2280, 2340)},
    "potato": {"M-GOB": (1050, 1180, 1320), "M-KHN": (1000, 1120, 1260), "M-LDH": (1080, 1230, 1410),
               "M-JAG": (960, 1080, 1200), "M-RAI": (930, 1040, 1150)},
    "onion": {"M-GOB": (1320, 1460, 1610), "M-KHN": (1280, 1410, 1560), "M-LDH": (1380, 1520, 1690),
              "M-JAG": (1240, 1360, 1500), "M-RAI": (1200, 1320, 1450)},
    "mustard": {"M-GOB": (5380, 5480, 5590), "M-KHN": (5340, 5440, 5550), "M-LDH": (5400, 5510, 5620),
                "M-JAG": (5300, 5400, 5510), "M-RAI": (5280, 5370, 5480)},
    "maize": {"M-GOB": (1930, 1990, 2060), "M-KHN": (1900, 1960, 2030), "M-LDH": (1950, 2020, 2090),
              "M-JAG": (1880, 1940, 2000), "M-RAI": (1860, 1920, 1980)},
}

CROP_CLUSTERS = [
    ("C-KHN", "wheat", 620), ("C-PAY", "wheat", 480), ("C-MLG", "potato", 210),
    ("C-KHN", "paddy", 350), ("C-PAY", "mustard", 190), ("C-MLG", "onion", 140),
]


ADMIN_ID = _uuid_id("USR-OWNER") or "USR-OWNER"


def run() -> dict:
    if db.scalar("select count(*) from profiles", default=0):
        return {"status": "already_seeded"}

    now = iso()
    orgs = [
        ("ORG-CARGOX", "CARGOX Operations", "business"),
        ("ORG-FPO-KHN", "Khanna Farmer Producer Group", "business"),
        ("ORG-RETAIL-PAY", "Payal Agri Retail", "business"),
    ]
    for o in orgs:
        db.insert("organisations", {"id": _uuid_id(o[0]), "name": o[1], "kind": o[2], "created_at": now})

    from .core.config import settings as _settings
    global ADMIN_ID
    for i, email in enumerate(_settings.ADMIN_EMAILS, start=1):
        if db.scalar("select count(*) from profiles where lower(email) = ?", (email,), 0):
            continue
        raw_pid = "USR-OWNER" if i == 1 else f"USR-OWNER-{i}"
        pid = _uuid_id(raw_pid)
        if i == 1 and pid:
            ADMIN_ID = pid
        db.insert("profiles", {
            "id": pid, "email": email, "mobile": None,
            "password_hash": hash_password(_settings.ADMIN_PASSWORD, 20000),
            "role": "admin", "full_name": _settings.ADMIN_NAME,
            "state": "Punjab", "district": "Ludhiana", "language": "en",
            "org_id": _uuid_id("ORG-CARGOX"), "status": "active", "verified_at": now,
            "created_at": now, "auth_provider": "google",
        })

    for pid, email, role, name, state, district in [
        ("USR-SND-01", "register.party1@cargox.invalid", "sender", "Bhari Farmer Group", "Punjab", "Ludhiana"),
        ("USR-SND-02", "register.party2@cargox.invalid", "sender", "Isewal Farmer Group", "Punjab", "Ludhiana"),
        ("USR-SND-03", "register.party3@cargox.invalid", "sender", "Sahnewal Shippers", "Punjab", "Ludhiana"),
        ("USR-TRN-01", "register.party4@cargox.invalid", "transporter", "Khanna Fleet Cooperative", "Punjab", "Ludhiana"),
        ("USR-TRN-02", "register.party5@cargox.invalid", "transporter", "Payal Rural Transport", "Punjab", "Fatehgarh Sahib"),
        ("USR-TRN-03", "register.party6@cargox.invalid", "transporter", "Sahnewal Tempo Service", "Punjab", "Ludhiana"),
    ]:
        db.insert("profiles", {
            "id": _uuid_id(pid), "email": email, "mobile": None, "password_hash": None,
            "role": role, "full_name": name, "state": state, "district": district,
            "language": "en", "org_id": None, "status": "active",
            "verified_at": now, "created_at": now,
        })

    for pid, kind, village in [
        ("USR-SND-01", "farmer", "Bhari"), ("USR-SND-02", "farmer", "Isewal"),
        ("USR-SND-03", "shipper", "Sahnewal"),
    ]:
        db.insert("sender_profiles", {
            "profile_id": _uuid_id(pid), "account_kind": kind,
            "village": village, "created_at": now,
        })

    for pid, company, fleet, ver in [
        ("USR-TRN-01", "Khanna Fleet Cooperative", 3, "verified"),
        ("USR-TRN-02", "Payal Rural Transport", 3, "verified"),
        ("USR-TRN-03", "Sahnewal Tempo Service", 2, "pending"),
    ]:
        db.insert("transporter_profiles", {
            "profile_id": _uuid_id(pid), "company_name": company, "fleet_size": fleet,
            "verification_status": ver, "rating": 4.4, "created_at": now,
        })

    vehicles = [
        ("VEH-01", "USR-TRN-01", "PB10AB1234", "tractor_trolley", 2500, 9.0, 24.0, True),
        ("VEH-02", "USR-TRN-01", "PB10CD5678", "pickup", 1200, 4.5, 15.0, True),
        ("VEH-03", "USR-TRN-01", "PB10EF9012", "lcv", 7500, 22.0, 32.0, True),
        ("VEH-04", "USR-TRN-02", "PB23GH3456", "truck", 16000, 45.0, 46.0, True),
        ("VEH-05", "USR-TRN-02", "PB23IJ7890", "tempo", 3500, 13.0, 26.0, True),
        ("VEH-06", "USR-TRN-02", "PB23KL2345", "lcv", 7500, 22.0, 31.0, False),
        ("VEH-07", "USR-TRN-03", "PB10MN6789", "tempo", 3500, 13.0, 25.0, False),
    ]
    for vid, tid, reg, klass, payload, vol, cpk, verified in vehicles:
        db.insert("vehicles", {
            "id": _uuid_id(vid), "transporter_id": _uuid_id(tid), "reg_no": reg,
            "vehicle_class": klass, "payload_kg": payload, "volume_m3": vol,
            "body_type": "open", "fuel": "diesel",
            "operating_districts": "Ludhiana,Fatehgarh Sahib", "availability": "available",
            "cost_per_km": cpk, "verified": verified, "verified_at": now if verified else None,
            "created_at": now,
        })
        db.insert("vehicle_documents", {
            "id": uid("DOC"), "vehicle_id": _uuid_id(vid), "doc_type": "rc",
            "doc_ref": f"storage://vehicle-docs/{vid}-rc.pdf",
            "verified": verified, "uploaded_at": now,
        })

    for vid, name, district, lat, lng, cluster in VILLAGES:
        db.insert("villages", {
            "id": _uuid_id(vid), "name": name, "district": district, "state": "Punjab",
            "lat": lat, "lng": lng, "cluster_id": cluster,
            "road_verified_at": iso(NOW - timedelta(days=95)),
        })

    for hid, name, district, htype, lat, lng, safe, window, cap in HUBS:
        db.insert("hubs", {
            "id": _uuid_id(hid), "name": name, "district": district, "hub_type": htype,
            "lat": lat, "lng": lng, "safety_verified": safe,
            "partner_id": _uuid_id("ORG-FPO-KHN") if safe else None,
            "operating_window": window, "capacity_kg": cap,
        })

    for mid, name, district, lat, lng, q in MANDIS:
        db.insert("mandis", {
            "id": _uuid_id(mid), "name": name, "district": district,
            "lat": lat, "lng": lng, "queue_minutes": q,
        })

    edges = []
    def edge(a, b, surface, width, risk):
        edges.append((f"RE-{len(edges)+1:03d}", a, b, surface, width, risk))

    edge("V-KHN-01", "H-KHN-01", "paved", 6.0, 0.12)
    edge("V-KHN-02", "V-KHN-01", "gravel", 4.5, 0.35)
    edge("V-KHN-03", "V-KHN-01", "kutcha", 3.2, 0.62)
    edge("V-KHN-04", "H-KHN-02", "gravel", 4.0, 0.48)
    edge("V-KHN-05", "V-KHN-02", "paved", 5.5, 0.18)
    edge("V-PAY-01", "H-PAY-01", "paved", 6.5, 0.14)
    edge("V-PAY-02", "V-PAY-01", "gravel", 4.2, 0.40)
    edge("V-PAY-03", "H-PAY-01", "paved", 5.0, 0.22)
    edge("V-PAY-04", "V-PAY-03", "kutcha", 3.0, 0.68)
    edge("V-MLG-01", "H-MLG-01", "paved", 7.0, 0.10)
    edge("V-MLG-02", "V-MLG-01", "gravel", 4.8, 0.30)
    edge("V-MLG-03", "H-MLG-01", "paved", 6.0, 0.16)
    edge("H-KHN-01", "M-KHN", "paved", 8.0, 0.08)
    edge("H-KHN-01", "M-GOB", "paved", 8.0, 0.08)
    edge("H-PAY-01", "M-JAG", "paved", 7.0, 0.12)
    edge("M-KHN", "M-LDH", "paved", 9.0, 0.06)
    edge("H-MLG-01", "M-LDH", "paved", 9.0, 0.06)
    edge("M-JAG", "M-RAI", "gravel", 4.6, 0.34)
    for eid, a, b, surface, width, risk in edges:
        db.insert("road_edges", {
            "id": _uuid_id(eid), "from_node": a, "to_node": b,
            "distance_km": round(_dist(a, b), 2), "surface": surface,
            "width_m": width, "monsoon_risk": risk,
            "vehicle_class_access": (
                "tractor_trolley,pickup"
                + (",tempo,lcv,truck" if width >= 5 and surface == "paved"
                   else (",tempo,lcv" if surface == "gravel" else ""))
            ),
            "verified_at": iso(NOW - timedelta(days=95)),
        })

    for commodity, mandi_prices in MARKET_PRICES.items():
        for mid, (mn, mode, mx) in mandi_prices.items():
            for d in range(10):
                day = NOW.date() - timedelta(days=d)
                drift = 1 + 0.004 * math.sin(d + hash(commodity) % 7)
                db.insert("market_observations", {
                    "id": uid("MKT"), "commodity_id": commodity, "mandi_id": _uuid_id(mid),
                    "obs_date": day.isoformat(),
                    "price_min": round(mn * drift, 0), "price_mode": round(mode * drift, 0),
                    "price_max": round(mx * drift, 0),
                    "arrivals_kg": 120000 + (hash((commodity, mid, d)) % 90000),
                    "source": "synthetic", "created_at": now,
                })

    for mid, name, district, lat, lng, q in MANDIS:
        db.insert("mandi_queues", {
            "id": uid("MQ"), "mandi_id": _uuid_id(mid), "observed_at": now,
            "queue_minutes": q, "source": "simulated", "created_at": now,
        })

    blocks = [
        ("CAP-001", "USR-TRN-01", "VEH-01", "tractor_trolley", 2500, 9.0, "ludhiana->fatehgarh sahib", 3, 1200, 22),
        ("CAP-002", "USR-TRN-01", "VEH-03", "lcv", 7500, 22.0, "ludhiana->fatehgarh sahib", 3, 2500, 31),
        ("CAP-003", "USR-TRN-02", "VEH-04", "truck", 16000, 45.0, "ludhiana->fatehgarh sahib", 3, 5000, 44),
        ("CAP-004", "USR-TRN-02", "VEH-05", "tempo", 3500, 13.0, "ludhiana->ludhiana", 1, 1500, 25),
        ("CAP-005", "USR-TRN-03", "VEH-07", "tempo", 3500, 13.0, "ludhiana->ludhiana", 1, 1500, 24),
    ]
    for cid, tid, vid, klass, payload, vol, corridor, days, size, price in blocks:
        db.insert("capacity_blocks", {
            "id": _uuid_id(cid), "transporter_id": _uuid_id(tid),
            "vehicle_id": _uuid_id(vid), "vehicle_class": klass,
            "payload_kg": payload, "volume_m3": vol, "corridor": corridor,
            "window_from": iso(NOW), "window_to": iso(NOW + timedelta(days=days)),
            "block_size_kg": size, "min_run_km": 25, "reserve_price_per_km": price,
            "cancellation_terms": "Free withdrawal before T-24h; otherwise 8% standby fee (fictional credit).",
            "status": "published", "created_at": now,
        })

    demo_shipments = [
        ("USR-SND-01", "wheat", 4800, "V-KHN-01", "Bhari", 30.8421, 76.1520, "M-GOB", "Mandi Gobindgarh", 30.67, 76.29, "pending_admin_review"),
        ("USR-SND-02", "wheat", 3200, "V-KHN-02", "Isewal", 30.8244, 76.1810, "M-GOB", "Mandi Gobindgarh", 30.67, 76.29, "pending_admin_review"),
        ("USR-SND-03", "wheat", 2600, "V-KHN-03", "Libra", 30.8630, 76.1290, "M-KHN", "Khanna Mandi", 30.704, 76.223, "pending_admin_review"),
        ("USR-SND-01", "paddy", 5400, "V-KHN-01", "Bhari", 30.8421, 76.1520, "M-GOB", "Mandi Gobindgarh", 30.67, 76.29, "matched"),
        ("USR-SND-02", "potato", 3100, "V-PAY-01", "Payal", 30.7290, 76.0620, "M-LDH", "Ludhiana Grain Market", 30.912, 75.848, "in_transit"),
        ("USR-SND-03", "onion", 2200, "V-MLG-01", "Sahnewal", 30.8420, 75.9520, "M-LDH", "Ludhiana Grain Market", 30.912, 75.848, "delivered"),
        ("USR-SND-01", "mustard", 1500, "V-PAY-02", "Ghulal", 30.7460, 76.0910, "M-JAG", "Jagraon Mandi", 30.787, 75.474, "planning"),
        ("USR-SND-02", "maize", 2800, "V-KHN-04", "Rohno Kalan", 30.8090, 76.1610, "M-KHN", "Khanna Mandi", 30.704, 76.223, "awaiting_sender_approval"),
    ]
    for i, (snd, crop, kg, vid, vname, lat, lng, dm, dname, dlat, dlng, status) in enumerate(demo_shipments):
        sid = _uuid_id(f"SHP-{1001 + i}")
        ready = NOW + timedelta(hours=6 + i)
        db.insert("shipments", {
            "id": sid, "code": f"CX-{2600 + i}", "sender_id": _uuid_id(snd), "commodity": crop,
            "quantity_kg": kg, "unit": "quintal", "pickup_village": vname,
            "pickup_district": "Ludhiana", "pickup_lat": lat, "pickup_lng": lng,
            "destination_id": _uuid_id(dm), "destination_name": dname,
            "dest_lat": dlat, "dest_lng": dlng,
            "ready_from": iso(ready), "ready_to": iso(ready + timedelta(hours=4)),
            "deadline": iso(ready + timedelta(hours=14)),
            "packaging": "jute_bags" if crop in ("wheat", "paddy", "maize") else "crates",
            "handling": "dry_cover" if crop in ("wheat", "paddy", "maize", "mustard") else "ventilated",
            "temperature": "ambient", "special_instructions": "",
            "attachments": "[]", "status": status, "freight_estimate": round(kg / 100 * 210, 0),
            "freight_approved": status in ("confirmed", "in_transit", "delivered"),
            "direction": "outbound", "is_synthetic": True,
            "created_at": iso(NOW - timedelta(days=2, hours=i)), "updated_at": now,
        })
        db.insert("shipment_items", {
            "id": uid("ITM"), "shipment_id": sid, "commodity": crop,
            "quantity_kg": kg, "packaging": "jute_bags", "handling": "dry_cover",
        })
        db.insert("shipment_destinations", {
            "id": uid("DST"), "shipment_id": sid, "name": dname,
            "kind": "mandi", "lat": dlat, "lng": dlng,
            "expected_price": MARKET_PRICES.get(crop, MARKET_PRICES["wheat"])[dm][1],
            "queue_minutes": 45, "preference_rank": 1,
        })

    from .algorithms import shapley as _shapley

    POOL_ID = _uuid_id("POOL-DEMO-01")
    COAL_ID = _uuid_id("COAL-DEMO-01")
    demo_coalition = [
        ("SHP-3001", "CX-3101", "USR-SND-01", 3400, "V-KHN-01", "Bhari", 30.8421, 76.1520),
        ("SHP-3002", "CX-3102", "USR-SND-02", 2100, "V-KHN-02", "Isewal", 30.8244, 76.1810),
    ]
    for raw_sid, code, snd, kg, vid, vname, lat, lng in demo_coalition:
        sid = _uuid_id(raw_sid)
        ready = NOW + timedelta(hours=3)
        db.insert("shipments", {
            "id": sid, "code": code, "sender_id": _uuid_id(snd), "commodity": "wheat",
            "quantity_kg": kg, "unit": "quintal", "pickup_village": vname,
            "pickup_district": "Ludhiana", "pickup_lat": lat, "pickup_lng": lng,
            "destination_id": _uuid_id("M-GOB"), "destination_name": "Mandi Gobindgarh",
            "dest_lat": 30.67, "dest_lng": 76.29,
            "ready_from": iso(ready), "ready_to": iso(ready + timedelta(hours=4)),
            "deadline": iso(ready + timedelta(hours=12)),
            "packaging": "jute_bags", "handling": "dry_cover", "temperature": "ambient",
            "special_instructions": "", "attachments": "[]", "status": "confirmed",
            "direction": "outbound", "is_synthetic": True, "pool_id": POOL_ID,
            "created_at": iso(NOW - timedelta(days=1, hours=6)), "updated_at": now,
        })
        db.insert("shipment_items", {
            "id": uid("ITM"), "shipment_id": sid, "commodity": "wheat",
            "quantity_kg": kg, "packaging": "jute_bags", "handling": "dry_cover",
        })
        db.insert("shipment_destinations", {
            "id": uid("DST"), "shipment_id": sid,
            "name": "Mandi Gobindgarh", "kind": "mandi",
            "lat": 30.67, "lng": 76.29,
            "expected_price": MARKET_PRICES["wheat"]["M-GOB"][1],
            "queue_minutes": 55, "preference_rank": 1,
        })

    db.insert("shipment_pools", {
        "id": POOL_ID, "corridor": "Khanna cluster -> Mandi Gobindgarh", "status": "approved",
        "total_kg": 5500.0, "compatible": 1,
        "notes": "Seeded demonstration coalition: Bhari and Isewal wheat consignments, same corridor and window.",
        "created_at": iso(NOW - timedelta(days=1, hours=5)),
    })
    _alloc = _shapley.allocate(
        members=[{"shipment_id": "SHP-3001", "lat": 30.8421, "lng": 76.1520},
                 {"shipment_id": "SHP-3002", "lat": 30.8244, "lng": 76.1810}],
        depot=(30.67, 76.29), cost_km=26.0, fixed=350, floor_at_solo=True,
    )
    db.insert("coalitions", {
        "id": COAL_ID, "pool_id": POOL_ID, "coalition_cost": _alloc["coalition_cost"],
        "solo_cost_total": _alloc["solo_total"], "method": _alloc["method"],
        "participation_ok": 1 if _alloc["all_allocations_acceptable"] else 0,
        "created_at": iso(NOW - timedelta(days=1, hours=4)),
    })
    for row in _alloc["rows"]:
        alloc_sid = _uuid_id(row["shipment_id"])
        db.insert("cost_allocations", {
            "id": uid("ALLOC"), "coalition_id": COAL_ID, "shipment_id": alloc_sid,
            "standalone_cost": row["standalone_cost"], "allocated_share": row["allocated_share"],
            "detour_km": row["detour_contribution_km"], "saving": row["saving"],
            "participation_check": 1 if row["participation_ok"] else 0,
            "approval": "approved", "method": _alloc["method"],
            "created_at": iso(NOW - timedelta(days=1, hours=4)),
        })
        db.execute(
            "update shipments set coalition_id = ?, freight_estimate = ?, freight_approved = 1 where id = ?",
            (COAL_ID, row["allocated_share"], alloc_sid),
        )

    db.insert("transport_assignments", {
        "id": _uuid_id("ASG-001"), "pool_id": None,
        "transporter_id": _uuid_id("USR-TRN-02"), "vehicle_id": _uuid_id("VEH-05"),
        "status": "confirmed", "revenue": 4100, "distance_km": 38.4, "ready_check": "ready",
        "accepted_at": (LIVE - timedelta(minutes=55)).isoformat(),
        "created_at": iso(NOW - timedelta(days=1)), "updated_at": now,
    })
    db.insert("trips", {
        "id": _uuid_id("TRIP-001"), "assignment_id": _uuid_id("ASG-001"),
        "trip_code": "CX-TRIP-4411", "status": "in_transit",
        "vehicle_id": _uuid_id("VEH-05"), "driver_name": "Sukhwinder Singh",
        "started_at": (LIVE - timedelta(minutes=40)).isoformat(),
        "created_at": iso(NOW - timedelta(hours=2)),
    })
    db.insert("trip_legs", {
        "id": uid("LEG"), "trip_id": _uuid_id("TRIP-001"), "leg_no": 1, "leg_type": "first_mile",
        "from_name": "Payal", "to_name": "Payal Cooperative Yard",
        "from_lat": 30.729, "from_lng": 76.062, "to_lat": 30.735, "to_lng": 76.07,
        "distance_km": 4.2, "eta_minutes": 25, "status": "done", "load_kg": 3100,
    })
    db.insert("trip_legs", {
        "id": uid("LEG"), "trip_id": _uuid_id("TRIP-001"), "leg_no": 2, "leg_type": "line_haul",
        "from_name": "Payal Cooperative Yard", "to_name": "Ludhiana Grain Market",
        "from_lat": 30.735, "from_lng": 76.07, "to_lat": 30.912, "to_lng": 75.848,
        "distance_km": 34.2, "eta_minutes": 68, "status": "active", "load_kg": 3100,
    })
    for sid in ("SHP-1005", "SHP-3001", "SHP-3002"):
        db.insert("trip_shipments", {
            "trip_id": _uuid_id("TRIP-001"), "shipment_id": _uuid_id(sid),
        })

    db.insert("transport_assignments", {
        "id": _uuid_id("ASG-002"), "pool_id": POOL_ID,
        "transporter_id": _uuid_id("USR-TRN-01"), "vehicle_id": _uuid_id("VEH-03"),
        "status": "completed", "revenue": 3980, "distance_km": 61.2, "ready_check": "ready",
        "accepted_at": iso(NOW - timedelta(days=2, hours=5)),
        "created_at": iso(NOW - timedelta(days=2, hours=4)), "updated_at": now,
    })
    db.insert("trips", {
        "id": _uuid_id("TRIP-002"), "assignment_id": _uuid_id("ASG-002"),
        "trip_code": "CX-TRIP-7788", "status": "delivered",
        "vehicle_id": _uuid_id("VEH-03"), "driver_name": "Sukhwinder Singh",
        "started_at": iso(NOW - timedelta(days=2, hours=3)),
        "finished_at": iso(NOW - timedelta(days=2)),
        "created_at": iso(NOW - timedelta(days=2, hours=4)),
    })
    for leg_no, leg_type, frm, to, flat, flng, tlat, tlng, km, eta, status in [
        (1, "first_mile", "Bhari", "Khanna Rural Hub (FPO yard)", 30.8421, 76.1520, 30.706, 76.216, 18.4, 42, "done"),
        (2, "line_haul", "Khanna Rural Hub (FPO yard)", "Mandi Gobindgarh", 30.706, 76.216, 30.67, 76.29, 42.8, 95, "done"),
    ]:
        db.insert("trip_legs", {
            "id": uid("LEG"), "trip_id": _uuid_id("TRIP-002"), "leg_no": leg_no, "leg_type": leg_type,
            "from_name": frm, "to_name": to, "from_lat": flat, "from_lng": flng,
            "to_lat": tlat, "to_lng": tlng, "distance_km": km, "eta_minutes": eta,
            "status": status, "load_kg": 5500,
        })
    for sid in ("SHP-3001", "SHP-3002"):
        db.insert("trip_shipments", {
            "trip_id": _uuid_id("TRIP-002"), "shipment_id": _uuid_id(sid),
        })

    db.insert("transport_assignments", {
        "id": _uuid_id("ASG-003"), "pool_id": POOL_ID,
        "transporter_id": _uuid_id("USR-TRN-01"), "vehicle_id": _uuid_id("VEH-03"),
        "status": "confirmed", "revenue": 2210, "distance_km": 51.6, "ready_check": "ready",
        "accepted_at": (LIVE - timedelta(minutes=45)).isoformat(),
        "created_at": iso(NOW - timedelta(hours=4)), "updated_at": now,
    })
    db.insert("trips", {
        "id": _uuid_id("TRIP-003"), "assignment_id": _uuid_id("ASG-003"),
        "trip_code": "CX-TRIP-9032", "status": "in_transit",
        "vehicle_id": _uuid_id("VEH-03"), "driver_name": "Sukhwinder Singh",
        "started_at": (LIVE - timedelta(minutes=28)).isoformat(),
        "created_at": iso(NOW - timedelta(hours=2)),
    })
    for leg_no, leg_type, frm, to, flat, flng, tlat, tlng, km, eta, status in [
        (1, "first_mile", "Isewal", "Isewal Roadside Transfer Shed", 30.8244, 76.1810, 30.821, 76.174, 3.1, 14, "done"),
        (2, "line_haul", "Isewal Roadside Transfer Shed", "Khanna Mandi", 30.821, 76.174, 30.704, 76.223, 48.5, 96, "active"),
    ]:
        db.insert("trip_legs", {
            "id": uid("LEG"), "trip_id": _uuid_id("TRIP-003"), "leg_no": leg_no, "leg_type": leg_type,
            "from_name": frm, "to_name": to, "from_lat": flat, "from_lng": flng,
            "to_lat": tlat, "to_lng": tlng, "distance_km": km, "eta_minutes": eta,
            "status": status, "load_kg": 2100,
        })
    db.insert("trip_shipments", {
        "trip_id": _uuid_id("TRIP-003"), "shipment_id": _uuid_id("SHP-3002"),
    })

    db.insert("transport_assignments", {
        "id": _uuid_id("ASG-004"), "pool_id": POOL_ID,
        "transporter_id": _uuid_id("USR-TRN-01"), "vehicle_id": _uuid_id("VEH-01"),
        "status": "transporter_accepted", "revenue": 1840, "distance_km": 24.6, "ready_check": "pending",
        "accepted_at": (LIVE - timedelta(minutes=6)).isoformat(),
        "created_at": iso(NOW - timedelta(hours=3)), "updated_at": now,
    })
    db.insert("trips", {
        "id": _uuid_id("TRIP-004"), "assignment_id": _uuid_id("ASG-004"),
        "trip_code": "CX-TRIP-5510", "status": "planned",
        "vehicle_id": _uuid_id("VEH-01"), "driver_name": "Sukhwinder Singh",
        "created_at": iso(NOW - timedelta(hours=1)),
    })
    db.insert("trip_legs", {
        "id": uid("LEG"), "trip_id": _uuid_id("TRIP-004"), "leg_no": 1, "leg_type": "first_mile",
        "from_name": "Bhari", "to_name": "Bhari Cooperative Yard",
        "from_lat": 30.8421, "from_lng": 76.1520, "to_lat": 30.846, "to_lng": 76.159,
        "distance_km": 24.6, "eta_minutes": 90, "status": "planned", "load_kg": 1000,
    })
    db.insert("trip_shipments", {
        "trip_id": _uuid_id("TRIP-004"), "shipment_id": _uuid_id("SHP-3001"),
    })

    for sid in ("SHP-1001", "SHP-1004", "SHP-1005", "SHP-1006"):
        db.insert("shipment_events", {
            "id": uid("EVT"), "entity_type": "shipment", "entity_id": _uuid_id(sid),
            "event_type": "status_snapshot", "actor_id": ADMIN_ID,
            "payload": db.jdump({"status": "seeded"}), "seed_id": "demo",
            "created_at": now,
        })

    for pid, title, body in [
        (ADMIN_ID, "3 shipments await review", "Bhari, Isewal and Libra wheat consignments need approval."),
        (_uuid_id("USR-SND-01"), "Shipment CX-2600 submitted", "Your wheat consignment is in Admin review."),
        (_uuid_id("USR-TRN-02"), "New assignment available", "Tempo PB23IJ7890 has a matching Ludhiana corridor load."),
    ]:
        db.insert("notifications", {
            "id": uid("NTF"), "profile_id": pid, "title": title, "body": body,
            "kind": "action", "read_at": None, "created_at": now,
        })

    today = date.today()
    for cluster, crop, acres in CROP_CLUSTERS:
        for off in range(0, 21, 7):
            db.insert("harvest_forecasts", {
                "id": uid("FC"), "cluster_id": cluster, "crop_id": crop,
                "forecast_date": (today + timedelta(days=off)).isoformat(),
                "horizon_days": 7,
                "p10_kg": round(acres * 380 * 0.8), "p50_kg": round(acres * 380),
                "p90_kg": round(acres * 380 * 1.25),
                "vehicle_class_demand": "lcv", "method": "rule_phenology_v1",
                "confidence": 0.72, "is_synthetic": True, "created_at": now,
            })

    db.insert("support_tickets", {
        "id": _uuid_id("TKT-1001"), "profile_id": _uuid_id("USR-SND-02"), "role": "sender",
        "subject": "Pickup window conflict for tomato", "body": "Can the pickup be moved to 6am?",
        "status": "open", "created_at": now, "updated_at": now,
    })

    return {"status": "seeded", "villages": len(VILLAGES), "vehicles": len(vehicles),
            "shipments": len(demo_shipments)}


_NODE_POS = {v[0]: (v[3], v[4]) for v in VILLAGES}
_NODE_POS.update({h[0]: (h[4], h[5]) for h in HUBS})
_NODE_POS.update({m[0]: (m[3], m[4]) for m in MANDIS})


def _dist(a: str, b: str) -> float:
    from .algorithms.geo import road_km

    la, lo = _NODE_POS[a]
    lb, lob = _NODE_POS[b]
    return road_km(la, lo, lb, lob)