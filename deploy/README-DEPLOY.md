# CARGOX — deploy in one sitting

Three services, one hour, no credit card.

| Piece | Host | Folder | Guide |
|---|---|---|---|
| Database (Postgres + PostGIS) | **Supabase** | `deploy/supabase-setup.sql` | §1 |
| API (FastAPI) | **Render** | `backend/` + `deploy/render.yaml` | §2 |
| Web app (Next.js 14) | **Vercel** | `frontend/` + `deploy/vercel.json` | §3 |
| Sign-in | **Google Cloud** | — | §4 |

Full detail, troubleshooting and the complete key table: **`docs/deployment.md`**.
Time budget for the same steps: **`docs/deployment-timer.md`** (a table, not a
widget — the product deliberately has no deployment countdown; its only timer is
the transporter pickup arrival clock).

---

## 1 · Supabase (database) — 8 min

1. New project → region **Mumbai (ap-south-1)** → save the DB password.
2. SQL editor → paste **`deploy/supabase-setup.sql`** → Run (enables `postgis`, `pgcrypto`).
3. Settings → Database → **Session pooler** → copy the URI:

```
postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

The API creates its own tables and seeds reference + demo data on first boot.
Nothing else to run.

## 2 · Render (API) — 8 min + build

1. Push this folder to GitHub.
2. Render → **New → Blueprint** → pick the repo → Render reads `deploy/render.yaml`.
3. Secrets it asks for:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase session-pooler URI |
| `GOOGLE_CLIENT_ID` | from §4 (blank is fine to start) |
| `PUBLIC_WEB_URL` | your Vercel URL (fill after §3) |
| `CARGOX_CORS_ORIGINS` | your Vercel URL |

Verify:

```bash
curl https://cargox-api.onrender.com/api/health
curl https://cargox-api.onrender.com/api/geo/stats   # 36 states · 801 districts · 4335 towns
```

## 3 · Vercel (web) — 7 min + build

1. New Project → import the repo → **Root Directory: `frontend`**.
2. Environment variables:

| Variable | Value |
|---|---|
| `CARGOX_API_URL` | `https://cargox-api.onrender.com` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | from §4 |

3. Deploy, then copy the domain into Render's `PUBLIC_WEB_URL` and
   `CARGOX_CORS_ORIGINS` and redeploy the API.

The browser only calls `/api/backend/*` on your own domain; `next.config.js`
rewrites it to Render. No CORS in the browser, no API URL in client code.

## 4 · Google Cloud (sign-in) — 13 min

1. Create project → **OAuth consent screen** → External → app name `CARGOX`,
   scopes `openid email profile` → **Publish**.
2. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorised JavaScript origins: `http://localhost:3000`, `https://<your-app>.vercel.app`
   - Authorised redirect URIs: `http://localhost:3000/login`, `https://<your-app>.vercel.app/login`
3. Copy the **Client ID** into Render `GOOGLE_CLIENT_ID` **and** Vercel
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (identical values), then redeploy both.

No client secret is used: Google returns a signed ID token and the API verifies
it against Google's public keys (audience, issuer, expiry, verified email).

## 5 · Who gets in — 2 min, three real entry paths

There are **no demo accounts** in this build. Every login is a real identity.

| Role | How to get in | Lands on |
|---|---|---|
| **Admin (owner) — `mehakdeep.s2006@gmail.com`** | Login → **Admin** → **Sign in with Google**, *or* **Email id with password** with the value of `CARGOX_ADMIN_PASSWORD` (default `mehak@2006`) | `/admin` |
| **Sender** | `/register` → fill your details → *Create sender account*, *or* **Sign up with Google** (or Login → Sender → Sign in with Google → confirm the address) | `/sender` |
| **Transporter** | same, choosing Transporter | `/transporter` |
| Another admin | add their Gmail to Render `CARGOX_ADMIN_EMAILS`, redeploy the API, then they sign in with Google | `/admin` |

The owner profile already exists after the first boot (`seed.py`), so Google
sign-in links it and drops you on `/admin`; the password door checks the hash
seeded from `CARGOX_ADMIN_PASSWORD` (set to a generated value in
`render.yaml` — copy it, or rotate it with
`python3 -m app.cli set-admin-password '…'`).
Full detail: `docs/admin-access.md`.

---

## Keys you must add — the short list

Required: `DATABASE_URL`, `CARGOX_SECRET_KEY` (Render generates it),
`CARGOX_ADMIN_PASSWORD` (Render generates it),
`GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `CARGOX_API_URL`,
`PUBLIC_WEB_URL`, `CARGOX_CORS_ORIGINS`.

Optional, each degrades honestly when absent (the UI says "not configured"
instead of pretending): `NEXT_PUBLIC_MAP_TILES` (photo basemap),
`SMS_PROVIDER_KEY` (SMS/WhatsApp alerts), `SUPABASE_URL` /
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (file uploads, auth email),
`BHASHINI_KEY` or `OPENAI_API_KEY` (voice capture), `OPENWEATHER_KEY`
(weather feed), `SENTRY_DSN` (error monitoring).

Full table with "what happens without it": `docs/deployment.md` §5.

---

## Production switches to flip

* `CARGOX_ADMIN_PASSWORD` — `render.yaml` generates one. Read it from the Render
  dashboard (or set your own before the first deploy); the default
  `mehak@2006` is only for local runs.
* `CARGOX_SECRET_KEY` — Render generates it; never reuse the repo default.
* `CARGOX_ADMIN_EMAILS` — keep only the real owner address(es).
* `GET /api/auth/config` must answer `{"demo_mode": false, "demo_accounts": []}` —
  if it ever lists credentials, you are running an older build.

---

## Free tier — does everything fit? (yes)

| Piece | Free plan used | Limit | What CARGOX actually uses |
|---|---|---|---|
| **Frontend** (Next.js 14) | **Vercel Hobby** — ₹0 | 100 GB bandwidth / month, unlimited static requests, 1 concurrent build, 100 GB-h serverless | a static + server-rendered marketing site and 51 screens; no image CDN, no cron, no paid feature |
| **Backend** (FastAPI) | **Render Free web service** — ₹0 | 512 MB RAM, 0.1 CPU, sleeps after 15 min idle, ~750 h/month | one uvicorn worker, ~90 MB RSS idle, OR-Tools plans in <1 s on the seeded corridor |
| **Database** (PostgreSQL) | **Supabase Free** — ₹0 | 500 MB database, 2 GB bandwidth, 5 GB egress, daily backups 7 days | 40 tables + the synthetic register ≈ **6–12 MB**; a year of pilot traffic stays far inside 500 MB |
| **Google sign-in** | Google Identity, free | no cost at any volume | ID-token verification against Google's public keys, no paid API |
| **Maps, forecasts, voice** | bundled / optional | free | the India district basemap ships in the repo; forecasts and the arrival clock are computed locally, not bought |
| **SMS / mail / storage / error logs** | optional add-ons | — | every one degrades honestly when absent (see §5 of `docs/deployment.md`) |

Notes that matter in practice:

* **Render Free sleeps** after 15 min of no traffic → the first request then
  takes ~30 s. Keep the demo warm by opening `/api/health` before you present.
* **Supabase Free pauses** a project after 7 days without activity; any API call
  wakes it. Take the free daily backup, or run `pg_dump` weekly.
* **Vercel Hobby** is for non-commercial use; swap to Pro only if you need
  commercial terms or team seats.
* Nothing in the code requires a paid tier: no background workers, no Redis, no
  paid queue, no paid map or ML API. The OR-Tools solver, the Shapley split, the
  arrival clock and the forecast ribbons all run inside the free web service.

---

## Self-host alternative

```bash
docker compose -f deploy/docker-compose.yml up --build
# web :3000 · api :8000/docs · Postgres+PostGIS :5432
```

Images: `deploy/Dockerfile.backend`, `deploy/Dockerfile.frontend`.
