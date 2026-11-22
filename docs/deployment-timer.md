# Deployment runbook — time budget

**Hands-on time** — what you actually do (below). ≈ **62 minutes** end to end.

> There is **no deployment countdown anywhere in the product**, by design: the
> only timer in CARGOX is the transporter **pickup arrival clock** (see
> `docs/deployment.md` §9). This page is a planner you can copy into a calendar.

---

## Hands-on schedule

| # | Step | Active work | Waiting | Cumulative |
|---|---|---|---|---|
| 1 | Supabase project + extensions | 6 min | 2 min (provisioning) | 8 min |
| 2 | Copy pooler URI, save the password | 2 min | — | 10 min |
| 3 | Push the repo to GitHub | 3 min | — | 13 min |
| 4 | Render blueprint + secrets | 4 min | 4 min (first build) | 21 min |
| 5 | Verify `/api/health`, `/api/geo/stats` | 2 min | — | 23 min |
| 6 | Vercel import + env vars | 4 min | 3 min (build) | 30 min |
| 7 | Google Cloud project + consent screen | 8 min | 1 min | 39 min |
| 8 | OAuth client, redirect URIs, client id | 4 min | — | 43 min |
| 9 | Paste the id into Render + Vercel, redeploy | 3 min | 5 min (two builds) | 51 min |
| 10 | Fix CORS / `PUBLIC_WEB_URL` to the real domain | 2 min | 2 min | 55 min |
| 11 | Walk all three roles end to end, screenshot | 6 min | — | 61 min |
| 12 | Set `CARGOX_ADMIN_PASSWORD`, confirm no demo logins | 3 min | 1 min | 65 min |

Realistic wall-clock with re-deploys and one small mistake: **75–90 minutes**.
The very first Render + Vercel builds are the two long waits (4–6 min each).

---

## What “done” looks like

```bash
curl https://<api>/api/health      # {"status":"ok","db":"postgres"}
curl https://<api>/api/auth/config # {"google_oauth":true,"demo_mode":false,"demo_accounts":[]}
curl https://<api>/api/geo/stats   # 36 states · 801 districts · 4335 towns
```

- `/login` → pick **Sender / Transporter / Admin** → Google **or** email → lands on
  that role’s workspace. Admin is only `mehakdeep.s2006@gmail.com`; senders and
  transporters create their own accounts (no demo logins exist).
- Map on `/admin`, `/sender`, `/transporter` shows the corridor with district borders,
  a scale bar, lat/long graticule, and any vehicle in transit labelled
  **recorded** or **modelled**.
- A new shipment can be created from **any state/district/town**, with **custom item
  names** and a free-text requirement.

---

## Removed on purpose: the deployment countdown

Earlier builds showed a deployment countdown widget on `/admin/system`. It has
been **removed from the whole product** at the product owner's request — nothing
in the app counts down a deployment any more.

`GET /api/meta/deployment` still answers, but only with documentation pointers:

```json
{"guide": "docs/deployment.md", "timer_doc": "docs/deployment-timer.md", "countdown_in_product": false}
```

The **only** timer in CARGOX is the transporter **pickup arrival clock**:

* starts the moment a transporter accepts an assignment (`accepted_at`),
* counts down to the exact pickup point the sender named (pinned coordinate, or
  the village/town in the shipment details),
* is priced from the assignment's first leg at the vehicle's village-road speed,
* turns red and counts up if the vehicle is late,
* is visible to the transporter (assignments + trips) and to the sender (shipment
  details + tracking) — see `docs/deployment.md` §9.
