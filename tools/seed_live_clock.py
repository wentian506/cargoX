"""Seed a live pickup arrival clock against a running API (for screenshots/QA).

    python3 tools/seed_live_clock.py     # prints the accounts it created

Drive one full consignment through the live API with fresh, real accounts and
leave the transporter having ACCEPTED the assignment — so the pickup arrival
clock (the only timer in the product) is live for the screenshots."""
import json
import time

import requests

API = "http://localhost:8000/api"
ADMIN = ("mehakdeep.s2006@gmail.com", "mehak@2006")
STAMP = int(time.time())
SENDER = (f"clock.sender{STAMP}@example.com", "StrongPass1")
TRANS = (f"clock.trans{STAMP}@example.com", "StrongPass1")


def post(path, token=None, **body):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.post(API + path, headers=h, json=body, timeout=60)
    return r


def get(path, token):
    return requests.get(API + path, headers={"Authorization": f"Bearer {token}"}, timeout=60)


def login(email, pw):
    r = post("/auth/login", email=email, password=pw)
    r.raise_for_status()
    return r.json()["token"]


def signup(email, role, name, **extra):
    r = post("/auth/register", full_name=name, email=email, mobile="9812345611",
             password="StrongPass1", confirm_password="StrongPass1",
             account_type=role, state="Punjab", district="Ludhiana", **extra)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


admin = login(*ADMIN)
s_tok, s_user = signup(SENDER[0], "sender", "Gurpreet Kaur", village="Bhari")
t_tok, t_user = signup(TRANS[0], "transporter", "Jaswinder Singh")
print("accounts ready:", s_user["email"], "/", t_user["email"])

# transporter registers a vehicle, admin verifies it, then capacity is published
r = post("/vehicles", t_tok, reg_no=f"PB10C{STAMP % 100000}", vehicle_class="truck",
         payload_kg=25000, volume_m3=60, body_type="open", fuel="diesel",
         operating_districts="Ludhiana", cost_per_km=24.0, availability="available")
r.raise_for_status()
vehicle_id = r.json()["id"]
post(f"/vehicles/{vehicle_id}/verify", admin, verified=True).raise_for_status()
post(f"/admin/users/{t_user['id']}/status", admin, action="verify").raise_for_status()
r = post("/capacity", t_tok, vehicle_id=vehicle_id, vehicle_class="truck", payload_kg=24000,
         volume_m3=60, corridor="Khanna -> Mandi Gobindgarh",
         window_from="2026-11-23T04:00:00+00:00", window_to="2026-11-23T16:00:00+00:00",
         block_size_kg=24000, min_run_km=25, reserve_price_per_km=23.5)
r.raise_for_status()
print("capacity block:", r.json()["id"])

# two consignments from the same farm gate, same corridor
sids = []
for kg, lat, lng in ((4800, 30.8421, 76.1520), (2600, 30.8424, 76.1526)):
    r = post("/shipments", s_tok, commodity="wheat", quantity_kg=kg, unit="kg",
             pickup_village="Bhari", pickup_lat=lat, pickup_lng=lng,
             destination_id="M-GOB", destination_name="Mandi Gobindgarh",
             dest_lat=30.67, dest_lng=76.29,
             ready_from="2026-11-23T02:30:00+00:00", deadline="2026-11-23T14:00:00+00:00",
             packaging="jute_bags", handling="dry_cover")
    r.raise_for_status()
    sids.append(r.json()["shipment"]["id"])
    post(f"/admin/shipments/{sids[-1]}/review", admin, action="approve", note="Approved for planning").raise_for_status()
print("shipments:", sids)

r = post("/admin/pools/auto", admin)
pools = r.json()["created"]
pool_id = next((p["pool_id"] for p in pools if sids[0] in p["members"]), pools[0]["pool_id"])
pool = next(p for p in get("/admin/pools", admin).json()["items"] if p["id"] == pool_id)
if len(pool["members"]) > 2:
    post(f"/admin/pools/{pool_id}/action", admin, action="split", shipment_ids=sids).raise_for_status()
    pool = next(p for p in get("/admin/pools", admin).json()["items"]
                if p["id"] != pool_id and set(sids) <= {m["id"] for m in p["members"]})
    pool_id = pool["id"]
post(f"/admin/pools/{pool_id}/action", admin, action="approve").raise_for_status()
post("/admin/capacity/match", admin, pool_id=pool_id).raise_for_status()
post("/admin/allocations/compute", admin, pool_id=pool_id).raise_for_status()
for a in get("/admin/allocations", admin).json()["items"]:
    if a["approval"] == "pending" and a["shipment_id"] in sids:
        post(f"/shipments/{a['shipment_id']}/approve-allocation", s_tok, accept=True).raise_for_status()
cand = next(c for c in post("/admin/capacity/match", admin, pool_id=pool_id).json()["candidates"]
            if c["transporter_id"] == t_user["id"])
r = post("/admin/assignments", admin, pool_id=pool_id, transporter_id=t_user["id"],
         vehicle_id=cand["vehicle_id"])
r.raise_for_status()
assignment_id = r.json()["assignment_id"]
r = post(f"/assignments/{assignment_id}/respond", t_tok, action="accept")
r.raise_for_status()
post(f"/admin/assignments/{assignment_id}/confirm", admin).raise_for_status()
arrival = get(f"/assignments/{assignment_id}/arrival", t_tok).json()
print("assignment:", assignment_id, "accepted")
print("ARRIVAL CLOCK:", json.dumps(arrival)[:400])
print("CREDS", json.dumps({"sender": SENDER, "transporter": TRANS, "shipment": sids[0]}))
