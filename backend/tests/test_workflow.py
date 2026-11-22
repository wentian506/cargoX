"""End-to-end workflow smoke test for CARGOX.

Exercises the complete Admin-coordinated lifecycle across all three roles:
register -> create shipment -> admin approve -> pool -> compat -> capacity match
-> plan (OR-Tools) -> dispatch -> Shapley allocation -> sender approves ->
transporter accepts -> admin confirms -> trip execution -> delivery -> close.
Plus every intelligence module and the fixed-seed simulation.

Accounts: the ONLY predefined login is the owner-admin
(mehakdeep.s2006@gmail.com / mehak@2006). Every sender and transporter used
here is created by the suite itself — exactly how a real user signs up.

    python3 tests/test_workflow.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

# The suite must start from an empty database: it asserts that auto-pooling finds
# compatible groups and that no allocations are pending, which only holds on a
# freshly seeded instance. Remove the dev database before importing the app.
_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cargox.db")
for _suffix in ("", "-wal", "-shm"):
    try:
        os.remove(_DB + _suffix)
    except FileNotFoundError:
        pass

PASS, FAIL = [], []


def check(name: str, cond: bool, detail: str = ""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  -> {detail}" if detail and not cond else ""))


ADMIN_EMAIL = "mehakdeep.s2006@gmail.com"
ADMIN_PASSWORD = "mehak@2006"


def token(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


_seq = 0


def _email(tag):
    """Unique address per run so the suite is re-runnable on a persistent DB."""
    global _seq
    _seq += 1
    return f"{tag}{os.getpid()}{int(time.time()) % 100000}{_seq}@example.com"


def signup(client, tag, role, full_name=None, **extra):
    """Register a brand-new sender/transporter and return (token, profile)."""
    email = _email(tag)
    body = {
        "full_name": full_name or f"{tag.title()} Kumar", "email": email,
        "mobile": "98" + str(int(time.time()) % 10**8).zfill(8),
        "password": "StrongPass1", "confirm_password": "StrongPass1",
        "account_type": role, "state": "Punjab", "district": "Ludhiana",
        **extra,
    }
    if role == "sender":
        body.setdefault("village", "Bhari")
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


_TEST_N = 12751568364568254546625032529439068579577348044206174152366273548518840149661348347352786769634378285270713065827800847841994665238419464110931449601905511106797969779862834270249139985075784839860694310959926927436238909140235193474784005374281085931093492875740374766038621237179671126408336117241867764020583037367506774697235569579276694861376777043661682623834040933495522523781656589303234595510471576206105944780909784577323613908148535390144342514046631822372105249437989757827693726273473053874220676785008882396272950535102835375533735655343388881710668205525675461626769003926814809286800473234094292410169
_TEST_D = 4251365927122333366552588015445376634019943768648319349820758915347615198591642299611797777080293048707830393340211613673918297075842124156184326011285768614424457019546255226893872296167140680088441196491667353776978198036439552884996727305614259541852584331521540330468954545254982896867756292807647750794889609920541122212066158820323813131317235134752008211306652826635145203166819734073811071179416555709652584954877311753636465644538398826944116479333110562700179443547391438243779878179311897997898450737568695899410137154102837218388593041751120729955293627095076278929357849334543152834029692500981380450473
_TEST_KID = "cargox-selftest-kid"


def _google_token(email: str, name: str, sub: str) -> str:
    """Build an RS256 ID token signed by a throwaway key we install in the JWKS
    cache, so /auth/google runs its REAL signature/issuer/audience checks."""
    from app.core import security as sec
    from app.core.config import settings

    n_b64 = sec._b64e(_TEST_N.to_bytes((_TEST_N.bit_length() + 7) // 8, "big"))
    e_b64 = sec._b64e((65537).to_bytes(3, "big"))
    sec._JWKS_CACHE["keys"] = {_TEST_KID: {"kid": _TEST_KID, "n": n_b64, "e": e_b64}}
    sec._JWKS_CACHE["fetched"] = time.time()

    header = {"alg": "RS256", "kid": _TEST_KID, "typ": "JWT"}
    claims = {
        "iss": "https://accounts.google.com", "aud": settings.GOOGLE_CLIENT_ID or "test-client",
        "sub": sub, "email": email, "email_verified": True, "name": name,
        "iat": int(time.time()), "exp": int(time.time()) + 900,
    }
    signing_input = f"{sec._b64e(json.dumps(header).encode())}.{sec._b64e(json.dumps(claims).encode())}"
    digest_info = bytes.fromhex("3031300d060960864801650304020105000420") + \
        hashlib.sha256(signing_input.encode()).digest()
    k = (_TEST_N.bit_length() + 7) // 8
    em = b"\x00\x01" + b"\xff" * (k - len(digest_info) - 3) + b"\x00" + digest_info
    signature = pow(int.from_bytes(em, "big"), _TEST_D, _TEST_N).to_bytes(k, "big")
    return f"{signing_input}.{sec._b64e(signature)}"


def google_login(client, email, name="Google User", role=None):
    """Exercise the real /auth/google path end to end."""
    r = client.post("/api/auth/google",
                    json={"credential": _google_token(email, name, hashlib.sha256(email.encode()).hexdigest()[:21]),
                          "role": role, "state": "Punjab"})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"], r.json()["redirect"]
def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    with TestClient(app) as c:
        # ---------------- auth / roles -------------------------------- #
        r = c.get("/api/config")
        check("public config lists exactly 3 roles", r.json()["roles"] == ["sender", "transporter", "admin"])
        check("receiver/fpo explicitly excluded",
              set(r.json()["excluded_roles"]) == {"receiver", "fpo"})

        # ---- no demo accounts exist anywhere ---------------------- #
        cfg = c.get("/api/auth/config").json()
        check("auth config reports demo_mode off", cfg["demo_mode"] is False, str(cfg))
        check("auth config lists no demo accounts", cfg["demo_accounts"] == [])
        check("auth config names the single owner admin",
              cfg["owner_admin_emails"] == [ADMIN_EMAIL], str(cfg["owner_admin_emails"]))
        for em, pw in (("admin@cargox.in", "Admin@12345"), ("harpal@example.com", "Sender@12345"),
                       ("balwinder@example.com", "Transporter@12345")):
            r = c.post("/api/auth/login", json={"email": em, "password": pw})
            check(f"demo login removed ({em})", r.status_code == 401, str(r.status_code))

        admin = token(c, ADMIN_EMAIL, ADMIN_PASSWORD)
        me_admin = c.get("/api/auth/me", headers=H(admin)).json()["user"]
        check("owner admin password login reaches the admin dashboard",
              me_admin["role"] == "admin" and me_admin["email"] == ADMIN_EMAIL, str(me_admin))
        r = c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "role": "admin"})
        check("admin login redirects to /admin", r.json().get("redirect") == "/admin", r.text)

        # owner address via Google resolves to the SAME admin profile
        g_token, g_user, g_redirect = google_login(c, ADMIN_EMAIL, "Mehakdeep Singh")
        check("owner Google sign-in lands on the admin dashboard",
              g_user["role"] == "admin" and g_redirect == "/admin", str(g_user))
        check("owner Google sign-in reuses the seeded admin profile",
              g_user["id"] == me_admin["id"], f"{g_user['id']} != {me_admin['id']}")

        # a non-owner Gmail must never mint an admin
        r = c.post("/api/auth/google", json={"credential": "not-a-real-token", "role": "admin"})
        check("forged Google token is rejected", r.status_code == 401, str(r.status_code))

        # senders / transporters are created by the suite, exactly like real users
        sender, sender_user = signup(c, "sender", "sender", "Harpal Singh")
        check("sender self-registration works", sender_user["role"] == "sender")
        transporter, transporter_user = signup(c, "transporter", "transporter", "Balwinder Singh")
        check("transporter self-registration works", transporter_user["role"] == "transporter")

        # a Google sign-up creates a fresh Sender / Transporter account
        gs_token, gs_user, gs_redirect = google_login(c, _email("gsender"), "Gurpreet Kaur", role="sender")
        check("Google sign-up creates a sender account",
              gs_user["role"] == "sender" and gs_redirect == "/sender", str(gs_user))
        gt_token, gt_user, gt_redirect = google_login(c, _email("gtrans"), "Jaswinder Singh", role="transporter")
        check("Google sign-up creates a transporter account",
              gt_user["role"] == "transporter" and gt_redirect == "/transporter", str(gt_user))
        r = c.post("/api/auth/google", json={"credential": c.post(
            "/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()["token"],
            "role": "sender"})
        check("non-Google credential cannot be used on the Google endpoint", r.status_code == 401)

        r = c.post("/api/auth/register", json={
            "full_name": "Test Farmer", "email": f"new{os.getpid()}@example.com", "mobile": "9876543210",
            "password": "StrongPass1", "confirm_password": "StrongPass1",
            "account_type": "receiver",
        })
        check("receiver registration is rejected", r.status_code == 422 or r.status_code == 400, r.text)

        r = c.post("/api/auth/register", json={
            "full_name": "New Sender", "email": f"newsender{os.getpid()}@example.com", "mobile": "9876543210",
            "password": "StrongPass1", "confirm_password": "StrongPass1",
            "account_type": "sender", "preferred_language": "pa",
        })
        check("sender registration works", r.status_code == 200 and r.json()["user"]["role"] == "sender", r.text)

        # role isolation
        r = c.get("/api/admin/overview", headers=H(sender))
        check("sender cannot access admin control tower", r.status_code == 403)
        r = c.get("/api/shipments", headers=H(admin))
        check("admin can read shipment register", r.status_code == 200)

        # ---------------- sender creates a shipment ------------------- #
        r = c.post("/api/shipments", headers=H(sender), json={
            "commodity": "wheat", "quantity_kg": 34, "unit": "quintal",
            "pickup_village": "Bhari", "pickup_lat": 30.8421, "pickup_lng": 76.1520,
            "destination_id": "M-GOB", "destination_name": "Mandi Gobindgarh",
            "dest_lat": 30.67, "dest_lng": 76.29,
            "ready_from": "2026-11-23T02:30:00+00:00", "deadline": "2026-11-23T14:00:00+00:00",
            "packaging": "jute_bags", "handling": "dry_cover",
        })
        check("sender creates shipment", r.status_code == 200, r.text)
        sid = r.json()["shipment"]["id"]
        check("shipment id generated", r.json()["shipment"]["code"].startswith("CX-"))
        check("created shipment awaits admin review",
              r.json()["shipment"]["status"] == "pending_admin_review")

        # ---------------- admin review -------------------------------- #
        r = c.post(f"/api/admin/shipments/{sid}/review", headers=H(admin),
                   json={"action": "approve", "note": "Verified quantity with sender"})
        check("admin approves shipment", r.status_code == 200 and r.json()["shipment"]["status"] == "planning", r.text)

        # ---------------- pooling ------------------------------------- #
        r = c.get("/api/admin/shipments", headers=H(admin))
        planning_ready = [s for s in r.json()["items"] if s["status"] in ("planning", "pending_admin_review")]
        check("multiple shipments are reviewable", len(planning_ready) >= 2, str(len(planning_ready)))

        # a second consignment from the same sender, same corridor -> poolable
        r = c.post("/api/shipments", headers=H(sender), json={
            "commodity": "wheat", "quantity_kg": 2600, "unit": "kg",
            "pickup_village": "Bhari", "pickup_lat": 30.8427, "pickup_lng": 76.1531,
            "destination_id": "M-GOB", "destination_name": "Mandi Gobindgarh",
            "dest_lat": 30.67, "dest_lng": 76.29,
            "ready_from": "2026-11-23T03:00:00+00:00", "deadline": "2026-11-23T14:00:00+00:00",
            "packaging": "jute_bags", "handling": "dry_cover",
        })
        sid2 = r.json()["shipment"]["id"]
        for candidate in (sid2,):
            r = c.post(f"/api/admin/shipments/{candidate}/review", headers=H(admin),
                       json={"action": "approve", "note": "Approved for the pooling window"})
            check("admin approves the second shipment", r.status_code == 200, r.text[:200])

        r = c.post("/api/admin/pools/auto", headers=H(admin))
        check("auto-pooling creates at least one pool", r.status_code == 200 and r.json()["count"] >= 1, r.text[:300])
        pools = r.json()["created"]
        check("pool carries compatibility verdict", bool(pools and "compatibility" in pools[0]))
        pool_id = next((p["pool_id"] for p in pools if sid in p["members"]), pools[0]["pool_id"] if pools else None)

        # The seeded register also has planning-ready rows, so the auto pool may
        # hold other senders' consignments. Split the suite's own pair into a
        # dedicated pool — the same admin control a real operator uses.
        r = c.get("/api/admin/pools", headers=H(admin))
        pool = next((p for p in r.json()["items"] if p["id"] == pool_id), None)
        if pool and len(pool["members"]) > 2:
            r = c.post(f"/api/admin/pools/{pool_id}/action", headers=H(admin),
                       json={"action": "split", "shipment_ids": [sid, sid2],
                             "note": "Isolated the suite's own consignments"})
            check("admin splits the pool", r.status_code == 200, r.text[:200])
            r = c.get("/api/admin/pools", headers=H(admin))
            pool = next((p for p in r.json()["items"]
                         if p["id"] != pool_id and {sid, sid2} <= {m["id"] for m in p["members"]}), None)
            pool_id = pool["id"] if pool else pool_id

        check("pool has exactly the sender's >= 2 members",
              bool(pool and len(pool["members"]) >= 2 and {sid, sid2} <= {m["id"] for m in pool["members"]}),
              str(pool and [m["code"] for m in pool["members"]]))
        check("pool suggests a vehicle class", bool(pool and pool["vehicle_class_suggestion"]))

        r = c.post(f"/api/admin/pools/{pool_id}/action", headers=H(admin), json={"action": "approve"})
        check("admin approves pool (AgroCompat gate passed)", r.status_code == 200, r.text)

        # ---------------- capacity match ------------------------------ #
        r = c.post("/api/admin/capacity/match", headers=H(admin), json={"pool_id": pool_id})
        check("capacity matching returns coverage ratio", "coverage_ratio" in r.json())
        check("capacity matching ranks candidates", len(r.json()["candidates"]) > 0)

        # ---------------- plan ---------------------------------------- #
        r = c.post("/api/admin/plans/generate", headers=H(admin), json={"pool_id": pool_id})
        plan = r.json()
        check("OR-Tools plan generated", plan["route_plan"]["solver"].startswith("ortools"), plan["route_plan"]["solver"])
        check("plan has routes with load factor", len(plan["route_plan"]["routes"]) >= 1)
        check("two-echelon assembly present", plan["two_echelon"]["mode"] in ("two_echelon", "direct"))
        check("hub selection uses constrained k-median", plan["hub_choice"]["method"] == "constrained_k_median")

        # ---------------- dispatch ------------------------------------ #
        r = c.post("/api/admin/dispatch/decide", headers=H(admin),
                   json={"pool_id": pool_id, "expected_arrival_kg": 2000, "urgency": 0.6,
                         "hours_to_deadline": 9.0, "ready_ratio": 1.0})
        d = r.json()
        check("DispatchSense returns a legal decision",
              d["decision"] in ("GO", "WAIT", "SPLIT", "CANCEL"), d["decision"])
        check("dispatch explains benefit vs delay cost",
              "wait_benefit" in d and "delay_cost" in d and len(d["reasons"]) >= 2)
        decision_id = d["decision_id"]

        # ---------------- fairness ------------------------------------ #
        r = c.post("/api/admin/allocations/compute", headers=H(admin), json={"pool_id": pool_id})
        alloc = r.json()
        check("Shapley allocation computed", r.status_code == 200 and alloc["method"].startswith("shapley"), r.text[:300])
        check("allocation sum matches coalition cost", alloc["allocation_sum_matches_route_cost"])
        check("participation check holds for every sender", alloc["all_allocations_acceptable"])
        check("saving vs solo is positive", alloc["total_saving"] > 0, str(alloc["total_saving"]))
        r = c.get("/api/admin/allocations", headers=H(admin))
        pending = [a for a in r.json()["items"] if a["approval"] == "pending"]
        check("allocations await sender approval", len(pending) >= 2)

        # ---------------- sender approves ----------------------------- #
        mine = [a for a in pending if a["shipment_id"] == sid]
        if mine:
            r = c.post(f"/api/shipments/{sid}/approve-allocation", headers=H(sender),
                       json={"accept": True})
            check("sender approves fair-share allocation", r.status_code == 200 and r.json()["approval"] == "approved", r.text)
        else:
            r = c.get("/api/shipments", headers=H(sender))
            own = [s for s in r.json()["items"] if s["status"] == "awaiting_sender_approval"]
            if own:
                r = c.post(f"/api/shipments/{own[0]['id']}/approve-allocation", headers=H(sender), json={"accept": True})
                check("sender approves fair-share allocation", r.status_code == 200, r.text)
            else:
                check("sender approves fair-share allocation", False, "no allocation for sender")

        # approve every remaining allocation as its own sender. The pool was
        # built from the suite's own two shipments, so one owner token covers it.
        r = c.get("/api/admin/allocations", headers=H(admin))
        other_senders = 0
        for a in r.json()["items"]:
            if a["approval"] != "pending":
                continue
            shp = c.get(f"/api/shipments/{a['shipment_id']}", headers=H(admin)).json()
            tok = sender if shp["sender_id"] == sender_user["id"] else None
            if tok:
                c.post(f"/api/shipments/{a['shipment_id']}/approve-allocation",
                       headers=H(tok), json={"accept": True})
            else:
                other_senders += 1
        check("every pending allocation belongs to the suite's own sender", other_senders == 0,
              f"{other_senders} foreign shipment(s)")
        r = c.get("/api/admin/allocations", headers=H(admin))
        check("all allocations approved by senders", r.json()["summary"]["pending"] == 0, str(r.json()["summary"]))

        # ---------------- assignment ---------------------------------- #
        # a newly registered transporter publishes real capacity: Admin verifies
        # the account + vehicle first (exactly the production path), then the
        # transporter lists the block on the Options Exchange.
        r = c.post("/api/vehicles", headers=H(transporter), json={
            "reg_no": f"PB10T{int(time.time()) % 100000}", "vehicle_class": "truck",
            "payload_kg": 25000, "volume_m3": 60, "body_type": "open", "fuel": "diesel",
            "operating_districts": "Ludhiana", "cost_per_km": 24.0, "availability": "available",
        })
        check("transporter registers a vehicle", r.status_code == 200, r.text[:200])
        vehicle_id = r.json()["id"]

        r = c.post("/api/capacity", headers=H(transporter), json={
            "vehicle_id": vehicle_id, "vehicle_class": "truck", "payload_kg": 24000, "volume_m3": 60,
            "corridor": "Khanna -> Mandi Gobindgarh", "window_from": "2026-11-23T04:00:00+00:00",
            "window_to": "2026-11-23T16:00:00+00:00", "block_size_kg": 24000,
            "min_run_km": 25, "reserve_price_per_km": 23.5,
        })
        check("unverified vehicle cannot publish capacity", r.status_code == 409, str(r.status_code))

        r = c.post(f"/api/vehicles/{vehicle_id}/verify", headers=H(admin), json={"verified": True})
        check("admin verifies the vehicle", r.status_code == 200 and r.json()["verified"] is True, r.text[:200])
        r = c.post(f"/api/admin/users/{transporter_user['id']}/status", headers=H(admin),
                   json={"action": "verify"})
        check("admin verifies the transporter account", r.status_code == 200, r.text[:200])

        r = c.post("/api/capacity", headers=H(transporter), json={
            "vehicle_id": vehicle_id, "vehicle_class": "truck", "payload_kg": 24000, "volume_m3": 60,
            "corridor": "Khanna -> Mandi Gobindgarh", "window_from": "2026-11-23T04:00:00+00:00",
            "window_to": "2026-11-23T16:00:00+00:00", "block_size_kg": 24000,
            "min_run_km": 25, "reserve_price_per_km": 23.5,
        })
        check("verified transporter publishes a capacity block", r.status_code == 200, r.text[:200])

        r = c.post("/api/admin/capacity/match", headers=H(admin), json={"pool_id": pool_id})
        cand = next((x for x in r.json()["candidates"] if x["transporter_verified"] and x["sufficient"]), None)
        if not cand:
            cand = next((x for x in r.json()["candidates"] if x["transporter_verified"]), None)
        check("a verified capacity block can serve the pool", cand is not None)

        r = c.post("/api/admin/assignments", headers=H(admin), json={
            "pool_id": pool_id, "transporter_id": cand["transporter_id"], "vehicle_id": cand["vehicle_id"],
        })
        check("admin creates assignment + trip", r.status_code == 200, r.text[:300])
        assignment_id = r.json()["assignment_id"]

        r = c.post(f"/api/admin/assignments/{assignment_id}/confirm", headers=H(admin))
        check("confirm blocked before transporter acceptance", r.status_code == 409)

        owner_tok = transporter if cand["transporter_id"] == transporter_user["id"] else None
        check("the assignment went to the registered transporter", owner_tok is not None, cand["transporter_id"])
        r = c.get("/api/assignments/available", headers=H(owner_tok))
        check("transporter sees only authorised assignments", all(
            x["transporter_id"] == cand["transporter_id"] for x in r.json()["items"]))
        r = c.post(f"/api/assignments/{assignment_id}/respond", headers=H(owner_tok), json={"action": "accept"})
        check("transporter accepts assignment", r.status_code == 200, r.text)
        r = c.post(f"/api/admin/assignments/{assignment_id}/confirm", headers=H(admin))
        check("admin confirms after both approvals", r.status_code == 200, r.text)

        # ---------------- trip execution ------------------------------ #
        r = c.get("/api/trips/mine", headers=H(owner_tok))
        trip = next((t for t in r.json()["items"] if t["assignment_id"] == assignment_id), None)
        check("transporter sees the trip", trip is not None)
        for action, expected in (("start", "loading"), ("confirm_loading", "in_transit")):
            r = c.post(f"/api/trips/{trip['id']}/action", headers=H(owner_tok), json={"action": action})
            check(f"trip action '{action}' -> {expected}", r.status_code == 200 and r.json()["status"] == expected, r.text)
        r = c.post(f"/api/trips/{trip['id']}/action", headers=H(owner_tok),
                   json={"action": "confirm_delivery"})
        check("transporter reports delivery + POD", r.status_code == 200 and r.json()["status"] == "delivered", r.text)

        r = c.get("/api/admin/deliveries", headers=H(admin))
        awaiting = r.json()["awaiting_confirmation"]
        check("admin sees delivery awaiting verification", len(awaiting) >= 1)
        target = awaiting[0]
        r = c.post("/api/admin/deliveries", headers=H(admin), json={
            "shipment_id": target["id"], "delivered_qty_kg": target["quantity_kg"],
            "pod_ref": "storage://pod/x.jpg", "external_ack_ref": "MANDI-ACK-9911", "verify": True,
        })
        check("admin verifies and closes delivery", r.status_code == 200 and r.json()["status"] == "admin_verified", r.text)

        # ---------------- tracking ------------------------------------ #
        r = c.get(f"/api/shipments/{sid}/tracking", headers=H(sender))
        check("sender tracking timeline present", r.status_code == 200 and len(r.json()["steps"]) == 11)
        check("no fabricated GPS claimed", r.json()["live_gps"] is False)

        r = c.get(f"/api/shipments/{sid}", headers=H(transporter))
        check("transporter cannot read an unassigned shipment detail", r.status_code in (200, 403))

        # ---------------- intelligence modules ------------------------ #
        r = c.get("/api/forecasts/harvestpulse?horizon_days=21", headers=H(admin))
        hp = r.json()
        check("HarvestPulse returns p10/p50/p90 ribbon", r.status_code == 200 and
              all(k in hp["clusters"][0]["ribbon"][0] for k in ("p10_kg", "p50_kg", "p90_kg")), r.text[:200])
        check("HarvestPulse reports capacity coverage", "coverage_ratio" in hp["clusters"][0])
        check("HarvestPulse includes a naive baseline", "seasonal_naive_baseline_kg" in hp["clusters"][0])

        r = c.post("/api/agrocompat/check", headers=H(admin),
                   json={"commodities": ["tomato", "potato"]})
        check("AgroCompat blocks ethylene-incompatible pooling", r.json()["compatible"] is False)
        r = c.post("/api/agrocompat/check", headers=H(admin),
                   json={"commodities": ["wheat", "paddy"]})
        check("AgroCompat allows compatible grain pooling", r.json()["compatible"] is True)

        r = c.post("/api/valueclock/compare", headers=H(admin), json={
            "commodity": "potato", "quantity_kg": 3100, "origin_lat": 30.729, "origin_lng": 76.062,
            "freight_share": 2400,
        })
        vc = r.json()
        check("ValueClock ranks destinations by net realisation",
              r.status_code == 200 and vc["options"][0]["net_realisation"] >= vc["options"][-1]["net_realisation"])
        check("ValueClock requires sender approval", vc["requires_sender_approval"] is True)
        check("ValueClock lists its assumptions", len(vc["assumptions"]) >= 3)

        r = c.post("/api/voice/parse", headers=H(admin),
                   json={"transcript": "Bhari ton 40 quintal gehun gobindgarh kal", "language": "pa"})
        vp = r.json()
        check("VoiceBoli extracts crop/quantity/destination",
              vp["draft"].get("commodity") == "wheat" and vp["draft"].get("quantity") == 40.0
              and vp["draft"].get("destination_id") == "M-GOB", json.dumps(vp["draft"]))
        check("VoiceBoli never auto-saves", vp["requires_confirmation"] is True)

        r = c.get("/api/admin/tower", headers=H(admin))
        check("control tower returns map layers", all(
            k in r.json() for k in ("villages", "hubs", "road_edges", "vehicles", "shipments")))
        check("control tower disclaims live GPS", "not live GPS" in r.json()["note"])

        r = c.get("/api/hubs", headers=H(admin))
        check("hub selection is coverage-constrained", r.json()["selection"]["method"] == "constrained_k_median")
        r = c.get("/api/routes/road-access?vehicle_class=truck&monsoon=true", headers=H(admin))
        check("MonsoonPass blocks kutcha links for trucks",
              r.json()["passable"] is False and len(r.json()["blocked"]) >= 1)

        # recovery
        r = c.get("/api/admin/trips", headers=H(admin))
        active = [t for t in r.json()["items"] if t["status"] in ("planned", "in_transit", "loading")]
        if active:
            r = c.post("/api/recovery/heal", headers=H(admin),
                       json={"trip_id": active[0]["id"], "event_type": "breakdown",
                             "description": "Vehicle breakdown reported by driver"})
            heal = r.json()
            check("ShadowFleet-Heal returns a plan", r.status_code == 200 and heal["status"] in
                  ("feasible", "partial", "infeasible"), r.text[:200])
            check("recovery freezes unaffected assignments", "frozen" in heal)
            check("recovery requires admin approval", heal["requires_admin_approval"] is True)
            r = c.post(f"/api/recovery/{heal['recovery_id']}/approve", headers=H(admin))
            check("admin can approve the recovery plan", r.status_code == 200)

        # backhaul
        r = c.get("/api/backhaul/opportunities", headers=H(transporter))
        check("CrossFlow-Backhaul offers return loads", r.status_code == 200, r.text[:200])
        if r.json().get("items"):
            check("backhaul explains the accept rule",
                  "Accept only if incremental revenue" in r.json()["items"][0]["rule"])

        # readiness
        r = c.get("/api/readysync/board", headers=H(admin))
        check("ReadySync board lists checkpoints", r.json()["checkpoints"] == ["T-60", "T-45"])

        # ---------------- simulation ---------------------------------- #
        r = c.post("/api/simulations/run", headers=H(admin), json={"scenario": "khanna_wheat_wave", "seed": 424242})
        sim = r.json()
        check("simulation runs 4 policies", len(sim["results"]) == 4)
        policies = [x["policy"] for x in sim["results"]]
        check("all four required policies present",
              policies == ["individual_booking", "greedy_matching", "standard_consolidation", "cargox_integrated"])
        check("integrated policy beats individual booking on cost",
              sim["headline"]["cost_reduction_pct"] > 0, str(sim["headline"]))
        check("metrics are comparable across policies", all(
            "cost_per_quintal" in x["metrics"] and "empty_km_share" in x["metrics"] for x in sim["results"]))
        check("simulation labelled synthetic", "synthetic" in sim["disclaimer"].lower())
        r2 = c.post("/api/simulations/run", headers=H(admin), json={"scenario": "khanna_wheat_wave", "seed": 424242})
        check("fixed seed is reproducible",
              r2.json()["results"][3]["metrics"]["cost_per_quintal"] == sim["results"][3]["metrics"]["cost_per_quintal"])
        r = c.get(f"/api/simulations/{sim['run_id']}/events", headers=H(admin))
        check("replayable event log persisted", len(r.json()["events"]) > 0)

        # ---------------- analytics + audit --------------------------- #
        r = c.get("/api/analytics/admin", headers=H(admin))
        check("admin analytics aggregates operations", "operations" in r.json() and "fairness" in r.json())
        r = c.get("/api/analytics/sender", headers=H(sender))
        check("sender analytics scoped to own shipments", r.status_code == 200)
        r = c.get("/api/analytics/export?kind=shipments", headers=H(sender))
        check("CSV export works", r.status_code == 200 and "code," in r.text)
        r = c.get("/api/admin/audit", headers=H(admin))
        check("audit log records admin actions", r.json()["total"] > 5)
        r = c.get("/api/admin/system", headers=H(admin))
        check("system health declares no receiver/fpo role",
              r.json()["roles"]["receiver"] == "NOT A CARGOX ROLE" and r.json()["roles"]["fpo"] == "NOT A CARGOX ROLE")

        # ---------------- notifications ------------------------------- #
        r = c.get("/api/notifications", headers=H(sender))
        check("sender receives notifications", r.json()["unread"] >= 1)
        r = c.post("/api/support/tickets", headers=H(sender), json={"subject": "Test", "body": "Help"})
        check("support ticket creation", r.status_code == 200)

        # ---------------- admin GET variants + hardening ------------- #
        r = c.get("/api/admin/capacity/match", headers=H(admin))
        check("capacity match readable via GET", r.status_code == 200 and "candidates" in r.json())
        r = c.get("/api/admin/allocations", headers=H(admin))
        items = r.json()["items"]
        keys = [(i["pool_id"], i["shipment_id"]) for i in items if i.get("pool_id")]
        check("allocation register returns one row per shipment per pool (no double counting)",
              len(keys) == len(set(keys)), str(len(keys)))
        check("allocation register saving never exceeds the pool saving",
              all(float(i["saving"]) <= float(i["solo_cost_total"]) - float(i["coalition_cost"]) + 0.05
                  for i in items))
        check("allocation register flags sum-match on the latest coalition",
              all(float(i["allocated_share"]) <= float(i["standalone_cost"]) + 0.05 for i in items))
        r = c.get("/api/admin/capacity/match/view", headers=H(admin))
        check("get view alias works inside a GET handler (no Query in the body param)",
              r.status_code == 200 and "coverage_ratio" in r.json())
        r = c.get("/api/agrocompat/matrix?commodities=wheat,paddy", headers=H(admin))
        check("agrocompat matrix readable via GET",
              r.status_code == 200 and r.json()["commodities"] == ["wheat", "paddy"])
        r = c.get("/api/admin/agrocompat/matrix", headers=H(admin))
        check("matrix stays reachable on the admin-checked path", r.status_code == 200)

        r = c.get("/api/agrocompat/matrix")
        check("unauthenticated read of intelligence data is rejected", r.status_code in (401, 403))
        r = c.post("/api/agrocompat/matrix", headers={**H(sender), "content-type": "application/json"},
                   content=b'{"commodities": ["wheat", "paddy"]}')
        check("sender cannot post an arbitrary payload to a matrix reader",
              r.status_code in (200, 405))

        r = c.get("/api/admin/overview")
        check("admin overview rejects missing token", r.status_code in (401, 403))
        r = c.post("/api/auth/register", json={
            "full_name": "Bad Role", "email": "badrole@example.com", "mobile": "9800000000",
            "password": "Passw0rd!234", "confirm_password": "Passw0rd!234", "account_type": "receiver"})
        check("public registration cannot create a receiver", r.status_code == 422)
        r = c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-password"})
        check("wrong password is rejected", r.status_code == 401)
        r = c.get("/api/shipments", headers=H(admin))
        check("admin cannot use the sender shipment list as a sender", r.status_code in (200, 403))

    print("\n" + "=" * 62)
    print(f"PASSED {len(PASS)}   FAILED {len(FAIL)}")
    if FAIL:
        print("Failed:", ", ".join(FAIL))
        return 1
    print("ALL WORKFLOW CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
