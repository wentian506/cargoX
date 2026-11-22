"""Full regression sweep: builds its own accounts (no demo logins), then checks
every route on desktop + phone for overflow / crashes / console errors /
countdown text / demo credentials.

    python3 tools/verify_routes.py
"""
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
ADMIN = ("mehakdeep.s2006@gmail.com", "mehak@2006")
NEW_SENDER = (f"shot.sender{int(time.time())}@example.com", "StrongPass1")
NEW_TRANS = (f"shot.trans{int(time.time())}@example.com", "StrongPass1")

PAGES = {
    "sender": ["/sender", "/sender/create", "/sender/shipments", "/sender/tracking", "/sender/costs"],
    "transporter": ["/transporter", "/transporter/assignments", "/transporter/trips", "/transporter/vehicles"],
    "admin": ["/admin", "/admin/trips", "/admin/pools", "/admin/system", "/admin/shipments",
              "/admin/allocations", "/admin/vehicles", "/admin/senders", "/admin/support",
              "/admin/analytics", "/admin/tower", "/admin/capacity", "/admin/dispatch",
              "/admin/deliveries", "/admin/notifications", "/admin/settings", "/admin/transporters",
              "/admin/harvestpulse", "/admin/valueclock", "/admin/agrocompat", "/admin/readysync",
              "/admin/planning", "/admin/simulator", "/admin/grantwin", "/admin/backhaul", "/admin/monsoonpass",
              "/admin/recovery", "/admin/assignments"],
}

results = []


def tail(pg, n=1):
    return pg.inner_text("body")[-300 * n:]


def signup(pg, email, role, name):
    pg.goto(f"{BASE}/register?role={role}", wait_until="load")
    pg.wait_for_timeout(1500)
    pg.fill("input[placeholder='Harpal Singh']", name)
    pg.fill("input[placeholder='98765 43210']", "9812345677")
    pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Continue").first.click()
    pg.wait_for_timeout(1200)
    pg.fill("input[type=email]", email)
    pg.fill("input[placeholder='At least 8 characters']", "StrongPass1")
    pg.locator("input[type=password]").nth(1).fill("StrongPass1")
    pg.get_by_role("button", name=f"Create {role} account").first.click()
    pg.wait_for_url(f"**/{role}**", timeout=90000)
    pg.wait_for_timeout(2500)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # --- create the two accounts the screenshots will use ------------------ #
    ctx = browser.new_context(viewport={"width": 1440, "height": 950})
    pg = ctx.new_page()
    pg.set_default_timeout(90000)
    signup(pg, NEW_SENDER[0], "sender", "Gurpreet Kaur")
    results.append(("new sender account created", "/sender" in pg.url, pg.url))
    ctx.close()

    ctx = browser.new_context(viewport={"width": 1440, "height": 950})
    pg = ctx.new_page()
    pg.set_default_timeout(90000)
    signup(pg, NEW_TRANS[0], "transporter", "Jaswinder Singh")
    results.append(("new transporter account created", "/transporter" in pg.url, pg.url))
    ctx.close()

    # --- route sweep ------------------------------------------------------- #
    for vw, vh, label in ((1440, 950, "desktop"), (390, 844, "phone")):
        for role, paths in PAGES.items():
            ctx = browser.new_context(viewport={"width": vw, "height": vh},
                                      is_mobile=vw < 800, has_touch=vw < 800)
            pg = ctx.new_page()
            pg.set_default_timeout(90000)
            errs, bad = [], []
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            pg.on("response", lambda r: bad.append(f"{r.status} {r.url[:70]}") if r.status >= 400 else None)
            if role == "admin":
                pg.goto(f"{BASE}/login?role=admin", wait_until="load")
                pg.wait_for_timeout(1200)
                pg.get_by_text("Email id with password").first.click()
                pg.wait_for_selector("input[type=email]")
                pg.fill("input[type=email]", ADMIN[0])
                pg.fill("input[type=password]", ADMIN[1])
            elif role == "sender":
                pg.goto(f"{BASE}/login?role=sender", wait_until="load")
                pg.wait_for_timeout(1200)
                pg.get_by_text("Email id with password").first.click()
                pg.wait_for_selector("input[type=email]")
                pg.fill("input[type=email]", NEW_SENDER[0])
                pg.fill("input[type=password]", NEW_SENDER[1])
            else:
                pg.goto(f"{BASE}/login?role=transporter", wait_until="load")
                pg.wait_for_timeout(1200)
                pg.get_by_text("Email id with password").first.click()
                pg.wait_for_selector("input[type=email]")
                pg.fill("input[type=email]", NEW_TRANS[0])
                pg.fill("input[type=password]", NEW_TRANS[1])
            pg.get_by_role("button", name="Sign in", exact=True).first.click()
            pg.wait_for_timeout(3500)
            for path in paths:
                errs.clear(); bad.clear()
                pg.goto(BASE + path, wait_until="load")
                pg.wait_for_timeout(2000)
                m = pg.evaluate("()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})")
                body = pg.inner_text("body")
                ce = [e[:70] for e in errs if "defaultProps" not in e]
                flags = []
                if m["sw"] > m["cw"] + 2:
                    flags.append(f"OVERFLOW {m['sw']}>{m['cw']}")
                if "Application error" in body or "Internal Server Error" in body:
                    flags.append("CRASH")
                if "countdown" in body.lower():
                    flags.append("COUNTDOWN")
                if any(x in body for x in ("Admin@12345", "Sender@12345", "harpal@example")):
                    flags.append("DEMO-CRED")
                ok = not flags and not ce and not bad
                results.append((f"{label} {role} {path}", ok, str(flags) + str(ce[:1]) + str(bad[:1])))
                print(f"{'OK  ' if ok else 'FAIL'} {label:8s} {role:11s} {path:24s} "
                      f"{'' if ok else str(flags)+str(ce[:1])+str(bad[:1])}")
            ctx.close()

    browser.close()

passed = sum(1 for r in results if r[1])
print(f"\n{passed}/{len(results)} route+flow checks passed")
for name, ok, detail in results:
    if not ok:
        print("  FAILED:", name, detail[:200])
