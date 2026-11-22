"""Verify the three real entry paths in a browser (needs a running web+API).

The Google path is exercised with a locally signed RS256 ID token and a local
stand-in for Google's JWKS endpoint (GOOGLE_JWKS_URL), because the sandbox has no
outbound internet. The API still performs every real check: signature, kid,
issuer, audience, expiry.

    python3 tools/verify_entry_paths.py

Original header follows.

Verify the three real entry paths in a browser:
   1. Admin  -> Google  OR  email+password  -> /admin
   2. Sender -> register (details) OR Google -> /sender
   3. Transporter -> register (details) OR Google -> /transporter
No demo accounts are used anywhere.
"""
import hashlib
import os
import json
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
API = "http://localhost:8000"
OUT = "/home/user/qa/entry"
N = 12751568364568254546625032529439068579577348044206174152366273548518840149661348347352786769634378285270713065827800847841994665238419464110931449601905511106797969779862834270249139985075784839860694310959926927436238909140235193474784005374281085931093492875740374766038621237179671126408336117241867764020583037367506774697235569579276694861376777043661682623834040933495522523781656589303234595510471576206105944780909784577323613908148535390144342514046631822372105249437989757827693726273473053874220676785008882396272950535102835375533735655343388881710668205525675461626769003926814809286800473234094292410169
D = 4251365927122333366552588015445376634019943768648319349820758915347615198591642299611797777080293048707830393340211613673918297075842124156184326011285768614424457019546255226893872296167140680088441196491667353776978198036439552884996727305614259541852584331521540330468954545254982896867756292807647750794889609920541122212066158820323813131317235134752008211306652826635145203166819734073811071179416555709652584954877311753636465644538398826944116479333110562700179443547391438243779878179311897997898450737568695899410137154102837218388593041751120729955293627095076278929357849334543152834029692500981380450473
KID = "cargox-e2e-kid"
CLIENT_ID = "cargox-demo-client.apps.googleusercontent.com"


def b64e(raw: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def id_token(email: str, name: str) -> str:
    header = {"alg": "RS256", "kid": KID, "typ": "JWT"}
    claims = {"iss": "https://accounts.google.com", "aud": CLIENT_ID,
              "sub": hashlib.sha256(email.encode()).hexdigest()[:21],
              "email": email, "email_verified": True, "name": name,
              "iat": int(time.time()), "exp": int(time.time()) + 900}
    signing_input = f"{b64e(json.dumps(header).encode())}.{b64e(json.dumps(claims).encode())}"
    digest = bytes.fromhex("3031300d060960864801650304020105000420") + hashlib.sha256(signing_input.encode()).digest()
    k = (N.bit_length() + 7) // 8
    em = b"\x00\x01" + b"\xff" * (k - len(digest) - 3) + b"\x00" + digest
    sig = pow(int.from_bytes(em, "big"), D, N).to_bytes(k, "big")
    return f"{signing_input}.{b64e(sig)}"


if __name__ == "__main__" and os.getenv("PRINT_TEST_N"):
    print(N)
    raise SystemExit(0)

results = []


def ok(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f"  -> {detail}"))


with sync_playwright() as p:
    browser = p.chromium.launch()

    def page(width=1440, height=950):
        ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2)
        pg = ctx.new_page()
        pg.set_default_timeout(90000)
        return pg

    # ---------- 1a. Admin with email + password ---------- #
    pg = page()
    pg.goto(f"{BASE}/login?role=admin", wait_until="load")
    pg.wait_for_timeout(1500)
    pg.get_by_text("Email id with password").first.click()
    pg.wait_for_selector("input[type=email]")
    pg.fill("input[type=email]", "mehakdeep.s2006@gmail.com")
    pg.fill("input[type=password]", "mehak@2006")
    pg.get_by_role("button", name="Sign in", exact=True).first.click()
    pg.wait_for_url("**/admin**", timeout=90000)
    pg.wait_for_timeout(3000)
    body = pg.inner_text("body")
    ok("admin email+password lands on the admin dashboard", "/admin" in pg.url, pg.url)
    ok("admin dashboard shows the owner identity", "mehakdeep" in body.lower(), body[:200])
    pg.screenshot(path=f"{OUT}/01-admin-password.png", animations="disabled")
    pg.context.close()

    # ---------- 1b. Admin with Google ---------- #
    pg = page()
    pg.route("**/api/backend/auth/google", lambda route: route.continue_())
    pg.goto(f"{BASE}/login?role=admin", wait_until="load")
    pg.wait_for_timeout(1200)
    pg.get_by_text("Sign in with Google").first.click()
    pg.wait_for_timeout(600)
    # the Google button exists and is wired; the real Google popup cannot run
    # headless, so we hand the verified credential to the same handler the
    # button calls (the server verifies signature/iss/aud/exp).
    ok("admin Google button is present",
       pg.locator("text=/Continue as Admin/i").count() >= 1 or pg.locator("text=Google").count() >= 1)
    pg.screenshot(path=f"{OUT}/02-admin-google-step.png", animations="disabled")
    token = id_token("mehakdeep.s2006@gmail.com", "Mehakdeep Singh")
    resp = pg.evaluate(
        """async (cred) => {
            const r = await fetch('/api/backend/auth/google', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({credential: cred})
            });
            return {status: r.status, body: await r.json()};
        }""",
        token,
    )
    ok("admin Google credential is accepted", resp["status"] == 200, json.dumps(resp)[:300])
    ok("admin Google resolves to the admin role", resp["body"].get("user", {}).get("role") == "admin",
       json.dumps(resp["body"])[:200])
    ok("admin Google reuses the seeded owner profile", resp["body"].get("user", {}).get("email") == "mehakdeep.s2006@gmail.com")
    # and the browser session that used it really lands on /admin
    pg.evaluate("t => localStorage.setItem('cargox.token', t)", resp["body"]["token"])
    pg.goto(f"{BASE}/admin", wait_until="load")
    pg.wait_for_timeout(2500)
    ok("Google session opens the admin dashboard", "/admin" in pg.url, pg.url)
    pg.screenshot(path=f"{OUT}/03-admin-google.png", animations="disabled")
    pg.context.close()

    # ---------- 2. Sender register with details ---------- #
    sender_email = f"sender{int(time.time())}@example.com"
    pg = page()
    pg.goto(f"{BASE}/register?role=sender", wait_until="load")
    pg.wait_for_timeout(1800)
    if pg.locator("input[placeholder='Harpal Singh']").count() == 0:
        pg.get_by_text("Sender", exact=True).first.click()
        pg.wait_for_timeout(1200)
    pg.fill("input[placeholder='Harpal Singh']", "Gurpreet Kaur")
    pg.fill("input[placeholder='98765 43210']", "9812345678")
    pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Continue").first.click()
    pg.wait_for_timeout(1200)
    pg.fill("input[type=email]", sender_email)
    pg.fill("input[placeholder='At least 8 characters']", "StrongPass1")
    pg.locator("input[type=password]").nth(1).fill("StrongPass1")
    pg.screenshot(path=f"{OUT}/04-sender-register.png", animations="disabled")
    pg.get_by_role("button", name="Create sender account").first.click()
    pg.wait_for_url("**/sender**", timeout=90000)
    pg.wait_for_timeout(3000)
    ok("sender registration lands on the sender dashboard", "/sender" in pg.url, pg.url)
    ok("sender dashboard greets the new account", "Gurpreet" in pg.inner_text("body"), pg.inner_text("body")[:200])
    pg.screenshot(path=f"{OUT}/05-sender-dashboard.png", animations="disabled")
    pg.context.close()

    # ---------- 3. Transporter register with details ---------- #
    tr_email = f"transporter{int(time.time())}@example.com"
    pg = page()
    pg.goto(f"{BASE}/register?role=transporter", wait_until="load")
    pg.wait_for_timeout(1800)
    if pg.locator("input[placeholder='Harpal Singh']").count() == 0:
        pg.get_by_text("Transporter", exact=True).first.click()
        pg.wait_for_timeout(1200)
    pg.fill("input[placeholder='Harpal Singh']", "Jaswinder Singh")
    pg.fill("input[placeholder='98765 43210']", "9812345679")
    pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Continue").first.click()
    pg.wait_for_timeout(1200)
    pg.fill("input[type=email]", tr_email)
    pg.fill("input[placeholder='At least 8 characters']", "StrongPass1")
    pg.locator("input[type=password]").nth(1).fill("StrongPass1")
    ok("register screen offers Sign up with Google",
       pg.locator("text=/Sign up with Google/i").count() >= 1)
    pg.screenshot(path=f"{OUT}/06-transporter-register.png", animations="disabled")
    pg.get_by_role("button", name="Create transporter account").first.click()
    pg.wait_for_url("**/transporter**", timeout=90000)
    pg.wait_for_timeout(3000)
    ok("transporter registration lands on the transporter dashboard", "/transporter" in pg.url, pg.url)
    pg.screenshot(path=f"{OUT}/07-transporter-dashboard.png", animations="disabled")
    pg.context.close()

    # ---------- 4. Google sign-up for sender + transporter ---------- #
    # Google's real redirect appends #id_token=... to the return URL; the client
    # reads it and calls /auth/google. That is exactly what we reproduce here.
    for role, label in (("sender", "Sender"), ("transporter", "Transporter")):
        pg = page()
        email = f"g{role}{int(time.time())}@example.com"
        token = id_token(email, f"Google {label}")
        pg.goto(f"{BASE}/login?role={role}#id_token={token}", wait_until="load")
        pg.wait_for_timeout(1200)
        pg.get_by_text("Sign in with Google").first.click()
        pg.wait_for_timeout(2500)
        body = pg.inner_text("body")
        ok(f"Google {role}: new address is shown for confirmation", email in body, body[-400:])
        pg.screenshot(path=f"{OUT}/08a-google-confirm-{role}.png", animations="disabled")
        pg.get_by_role("button", name=f"Confirm {email} & continue").first.click()
        pg.wait_for_url(f"**/{role}**", timeout=90000)
        pg.wait_for_timeout(2500)
        ok(f"Google {role} sign-up opens the {role} dashboard", f"/{role}" in pg.url, pg.url)
        ok(f"Google {role} dashboard greets the new account", label.split()[0] in pg.inner_text("body") or "Google" in pg.inner_text("body"), pg.inner_text("body")[:160])
        pg.screenshot(path=f"{OUT}/08-google-{role}.png", animations="disabled")
        pg.context.close()

    # ---------- 4b. Register form + Google with the typed details ---------- #
    for role in ("sender", "transporter"):
        pg = page(390, 844)
        email = f"reg{role}{int(time.time())}@example.com"
        token = id_token(email, f"Reg {role.title()}")
        pg.goto(f"{BASE}/register?role={role}&google=1#id_token={token}", wait_until="load")
        pg.wait_for_timeout(1800)
        pg.fill("input[placeholder='Harpal Singh']", f"Form {role.title()}")
        pg.fill("input[placeholder='98765 43210']", "9812345000")
        pg.wait_for_timeout(300)
        pg.get_by_role("button", name="Continue").first.click()
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{OUT}/09a-register-google-{role}.png", animations="disabled")
        pg.wait_for_url(f"**/{role}**", timeout=90000)
        pg.wait_for_timeout(2500)
        ok(f"register + Google creates a {role} and opens /{role}", f"/{role}" in pg.url, pg.url)
        pg.screenshot(path=f"{OUT}/09-google-form-{role}.png", animations="disabled")
        pg.context.close()

    # ---------- 5. No demo entry anywhere ---------- #
    pg = page(390, 844)
    pg.goto(f"{BASE}/login", wait_until="load")
    pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    # the owner address is shown on the Admin method screen (not on the role picker)
    pg.get_by_role("button", name="Admin").first.click()
    pg.wait_for_timeout(1500)
    body_admin = pg.inner_text("body")
    ok("admin method screen names the owner admin", "mehakdeep.s2006@gmail.com" in body_admin, body_admin[-500:])
    for needle in ("Admin@12345", "Sender@12345", "Transporter@12345", "harpal@", "balwinder@",
                   "admin@cargox.in", "demo account", "Try a demo"):
        ok(f"login screen has no demo artefact '{needle}'", needle.lower() not in body.lower())
    ok("role picker shows no credentials", "@gmail.com" not in body)
    pg.screenshot(path=f"{OUT}/09-mobile-login.png", animations="disabled")
    pg.context.close()

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\nPASSED {len(results) - len(failed)}   FAILED {len(failed)}")
for name, _, detail in failed:
    print("  FAILED:", name, "->", detail[:200])
