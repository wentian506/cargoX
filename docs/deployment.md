# CARGOX — Deployment Guide

Frontend on **Vercel**, API on **Render**, database on **Supabase**, sign-in with
**Google Cloud**. Every step below is copy-pasteable and lists the exact value to
paste where. Nothing in this guide requires a paid plan.

> **Time to a live site:** about 55–70 minutes of clicking, of which ~12 minutes
> is waiting for builds. The step-by-step time budget is in
> [`docs/deployment-timer.md`](deployment-timer.md). (There is no countdown widget
> in the product — the only timer in CARGOX is the transporter pickup arrival clock.)

```
Browser ──► Vercel (Next.js 14)  ──/api/backend/*──►  Render (FastAPI)  ──►  Supabase (Postgres/PostGIS)
                     │                                     │
                     └──────── Google Identity ────────────┘   (ID token verified server-side)
```

---

## 0. What you need before starting

| Item | Where | Cost |
|---|---|---|
| GitHub account + this repo pushed | github.com | free |
| Vercel account (Hobby) | vercel.com | free |
| Render account | render.com | free tier available |
| Supabase account | supabase.com | free tier available |
| Google Cloud project | console.cloud.google.com | free |

Local sanity check first (both should pass before you deploy):

```bash
cd backend && python3 tests/test_workflow.py        # 94 assertions
cd frontend && npx tsc --noEmit && npm run build
```

---

## 1. Database — Supabase

1. **New project** → name `cargox`, region **Mumbai (ap-south-1)**, set a strong DB password. Save it.
2. **Database → Extensions** → enable **postgis** and **pgcrypto**.
   *(Or run `deploy/supabase-setup.sql` in the SQL editor — it does the same and adds a health view.)*
3. **Project Settings → Database → Connection string → URI**, choose **Session pooler** and copy:

```
postgresql://postgres.<project-ref>:<DB-PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

4. Nothing else. The API creates its own tables on first boot (`python -m app.db_bootstrap`,
   which Render runs automatically) and seeds the reference register once.

**What lands in the database:** 40 tables, 4 hubs, 5 mandis, 12 villages, 7 vehicles,
1 owner admin, six **data-owner** profiles that cannot log in (the synthetic register
needs parties), a worked coalition (CX-3101 + CX-3102) and three trips (one delivered,
two in transit). All operational rows are flagged `is_synthetic = true`; the only
login that ships with the code is the owner admin.

---

## 2. API — Render

**Blueprint route (recommended)**

1. Push the repo to GitHub.
2. Render → **New → Blueprint** → select the repo. Render reads `deploy/render.yaml`
   (copy it to the repo root if you prefer auto-detection).
3. Fill the secrets it asks for:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Supabase URI from step 1.3 |
| `GOOGLE_CLIENT_ID` | from step 4 (leave blank to ship without Google) |
| `PUBLIC_WEB_URL` | `https://<your-app>.vercel.app` (fill after step 3) |
| `CARGOX_CORS_ORIGINS` | `https://<your-app>.vercel.app` |

Render generates `CARGOX_SECRET_KEY` itself. There are **no demo logins** in the
codebase at all — the only predefined account is the owner admin
(`CARGOX_ADMIN_EMAILS` + `CARGOX_ADMIN_PASSWORD`); senders and transporters
create their own accounts.

**Manual route:** New → Web Service → Root directory `backend` →
Build `pip install -r requirements.txt` →
Start `python -m app.db_bootstrap && uvicorn app.main:app --host 0.0.0.0 --port $PORT` →
Health check path `/api/health`.

Verify:

```bash
curl https://cargox-api.onrender.com/api/health
# {"status":"ok","version":"1.0.0","db":"postgres","synthetic_data":true}

curl https://cargox-api.onrender.com/api/geo/stats
# {"states":36,"union_territories":8,"districts":801,"towns":4335, ...}
```

Free-plan note: the service sleeps after 15 min of inactivity; the first request
afterwards takes ~30 s. Upgrade to Starter to keep it warm.

---

## 3. Web — Vercel

1. **Add New → Project** → import the repo → **Root Directory: `frontend`**.
2. Framework preset **Next.js** is detected automatically (build `npm run build`).
3. **Environment Variables** (Production + Preview):

| Key | Value |
|---|---|
| `CARGOX_API_URL` | `https://cargox-api.onrender.com` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | from step 4 (must match the API value) |

4. Deploy. Then copy the domain (`https://cargox-xxxx.vercel.app`) back into Render's
   `PUBLIC_WEB_URL` and `CARGOX_CORS_ORIGINS`, and redeploy the API.

**How the two talk:** the browser only ever calls `/api/backend/*` on the Vercel domain.
`next.config.js` rewrites that to `CARGOX_API_URL/api/*`. No CORS hop in the browser,
no API URL baked into client code. `deploy/vercel.json` documents the same rewrite if
you prefer to keep routing in the dashboard.

---

## 4. Google sign-in — Google Cloud Console

1. **console.cloud.google.com** → create project `cargox` (or pick an existing one).
2. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - App name `CARGOX`, support email yours, developer contact yours
   - Scopes: `openid`, `email`, `profile` (nothing else)
   - **Publish app** so anyone can use it (or stay in *Testing* and add test users)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `CARGOX web`
   - **Authorised JavaScript origins**
     ```
     http://localhost:3000
     https://<your-app>.vercel.app
     ```
   - **Authorised redirect URIs**
     ```
     http://localhost:3000/login
     https://<your-app>.vercel.app/login
     ```
4. Copy the **Client ID** (`…apps.googleusercontent.com`). It is a public identifier,
   not a secret. Paste it in **two** places:
   - Render → `GOOGLE_CLIENT_ID`
   - Vercel → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
5. No client *secret* is needed: the app uses the **ID-token (implicit) flow** —
   Google returns a signed JWT, and the API verifies it against Google's public keys
   (`aud`, `iss`, `exp`, `email_verified`). Keep `GOOGLE_CLIENT_ID` identical on both
   sides or the audience check will reject the token.

Redeploy both services after saving. The login screen flips from
“Google sign-in is not configured” to a live **Continue with Google** button
automatically — the flag comes from `GET /api/auth/config`.

### Who can enter each dashboard

| Role | Route in | Lands on |
|---|---|---|
| **Admin (owner) — `mehakdeep.s2006@gmail.com`** | **Sign in with Google** — *or* **Email id with password** with `mehak@2006` (`CARGOX_ADMIN_PASSWORD`) | `/admin` |
| **Sender** | `/register` with their own details, *or* **Sign up with Google** on `/register`, *or* `/login` → Sender → Sign in with Google → confirm the address | `/sender` |
| **Transporter** | identical, choosing Transporter | `/transporter` |
| Any other admin | Invited: the owner adds the address to `CARGOX_ADMIN_EMAILS` (comma separated) and redeploys the API | `/admin` |

The Admin profile is created by the seeder on first boot from
`CARGOX_ADMIN_EMAILS`; Google sign-in links `profiles.google_sub` to that same
profile, and the password door verifies the bcrypt hash seeded from
`CARGOX_ADMIN_PASSWORD`. **Change that password before a public launch:**

```bash
# Render shell / local
cd backend && python3 -m app.cli set-admin-password 'a-long-new-password'
```

Nothing else has a predefined login. The seeded `register.party*@cargox.invalid`
rows are *data owners* for the synthetic register (`password_hash` is NULL), so
they can never sign in, and the old published demo accounts
(`admin@cargox.in`, `harpal@…`, `balwinder@…`) return `401` because they no
longer exist.

**Change the owner later** without touching code:

```bash
# Render → Environment
CARGOX_ADMIN_EMAILS=mehakdeep.s2006@gmail.com,second.admin@gmail.com
```

**First Google sign-in:** an unknown Google address is refused with
`new_account_needs_role` until the person picks **Sender** or **Transporter**;
the account is then created and Google-linked. **Admin is never self-created** —
unless the address is already in `CARGOX_ADMIN_EMAILS`, in which case the
seeder owns that profile and sign-in returns an Admin session. To promote an
existing account manually:

```sql
-- Supabase SQL editor
update profiles set role = 'admin' where email = 'you@example.com';
```

`GET /api/auth/config` publishes `owner_admin_emails`, which is what the login
screen uses to tell people who the owner admin is.

---

## 5. API keys and services — the complete list

Only the first five are required. Everything else is optional and honestly
reported as *not configured* in the UI when absent.

| # | Variable | Service | Needed for | Where to get it | Without it |
|---|---|---|---|---|---|
| 1 | `DATABASE_URL` | Supabase | persistence | Supabase → Settings → Database → URI | API falls back to a local SQLite file |
| 2 | `CARGOX_SECRET_KEY` | self | signing JWTs | generate 64 random chars | Render generates one; tokens reset if it changes |
| 3 | `GOOGLE_CLIENT_ID` | Google Cloud | Google sign-in | Credentials → OAuth client | button shows the setup hint, email login still works |
| 4 | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Cloud | Google sign-in (browser) | same value as #3 | same as above |
| 5 | `CARGOX_API_URL` | Render | Vercel → API rewrite | your Render URL | `/api/backend/*` 502s |
| 6 | `PUBLIC_WEB_URL` + `CARGOX_CORS_ORIGINS` | self | links + CORS | your Vercel URL | email links and direct API calls from the browser fail |
| 7 | `NEXT_PUBLIC_MAP_TILES` | any XYZ tile host (MapTiler, Mapbox, OSM) | photographic basemap | provider dashboard → tile URL with `{z}/{x}/{y}` | bundled offline India district basemap is used (fully usable map: pan, zoom, pin, live markers) |
| 8 | `SMS_PROVIDER_KEY` (Twilio / MSG91) | SMS | WhatsApp/SMS milestone alerts | provider console | `/api/tracking/subscribe` stores the subscription and reports `delivery: not_configured` |
| 9 | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Storage uploads (POD photos, RC/insurance docs), Supabase Auth email delivery | Supabase → Settings → API | attachment fields accept references only; password reset returns a token only in the API response (no mailer needed) |
| 10 | `BHASHINI_KEY` or `OPENAI_API_KEY` (Whisper) | Bhashini / OpenAI | live voice capture for VoiceBoli | provider console | VoiceBoli accepts a typed transcript and extracts the same draft |
| 11 | `OPENWEATHER_KEY` | OpenWeather | weather feed for MonsoonPass | provider console | monsoon risk stays a seeded model output (labelled synthetic) |
| 12 | `SENTRY_DSN` | Sentry | error monitoring | Sentry project settings | errors only reach Render logs |

**Realtime / live tracking:** works out of the box with no key. `/api/tracking/*`
computes a position per trip from its plan and clock, and labels it `modelled`.
As soon as a transporter device posts `/api/tracking/ping`, the same endpoint
reports `recorded`. Wire a GPS/telematics provider by having it POST that endpoint
with a bearer token — no schema change, no extra key.

---

## 6. Production checklist

- [ ] `CARGOX_SECRET_KEY` is a fresh 64-char value, not the repo default
- [ ] `CARGOX_ADMIN_PASSWORD` changed from the default (`python3 -m app.cli set-admin-password '…'`)
- [ ] `CARGOX_ADMIN_EMAILS` lists only the real owner address(es)
- [ ] `GET /api/auth/config` → `{"demo_mode": false, "demo_accounts": []}`
- [ ] Supabase: enable **PITR / daily backups**, set the DB password to a strong value
- [ ] Render: health check `/api/health`, auto-deploy on the `main` branch
- [ ] Vercel: production domain added, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set for *all* environments
- [ ] Google Cloud: redirect URIs contain the **exact** production domain (no trailing slash)
- [ ] `curl https://<api>/api/geo/stats` → 36 states / 801 districts
- [ ] Sign in as each of the three roles and walk one shipment end to end
- [ ] `GET /api/auth/config` → `{"google_oauth": true, "demo_mode": false}`

---

## 7. Container / self-host alternative

```bash
# full stack: Postgres+PostGIS, API, web
docker compose -f deploy/docker-compose.yml up --build
# web http://localhost:3000 · api http://localhost:8000/docs
```

Images: `deploy/Dockerfile.backend`, `deploy/Dockerfile.frontend`.
Any host that runs a container works (Fly.io, Railway, ECS, a VPS).

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `502` on `/api/backend/*` | `CARGOX_API_URL` wrong or API asleep | check the URL in Vercel; wake Render, redeploy if changed |
| `401 Missing bearer token` on every page | `CARGOX_SECRET_KEY` changed after a token was issued | sign out and in again |
| Google button says “not configured” | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` empty (it is read at build time) | set it and **redeploy** Vercel, not just restart |
| `Google sign-in … could not be verified` | API `GOOGLE_CLIENT_ID` ≠ web client id, or origin not authorised | make both values identical; add the exact origin |
| `new_account_needs_role` | first Google sign-in without picking a role | pick Sender/Transporter on the login screen |
| Map is blank | no tiles configured **and** geometry file missing | the bundled `lib/geo/india-districts.json` must ship with the build |
| `psycopg.OperationalError` | Supabase URL used with the direct (5432) port behind a pooler | use the **Session pooler** URI on port `6543` |
| Plan generation slower than usual | OR-Tools missing → greedy fallback | `pip install ortools` (already in `requirements.txt`) |
| Render free plan: first request slow | instance asleep | upgrade the plan or ping `/api/health` every 10 min |

---

## 9. The one timer in the product — pickup arrival clock

There is no deployment timer anywhere in the app. The single clock is the
**transporter pickup arrival clock**:

| | |
|---|---|
| Starts | when the transporter accepts an assignment (`transport_assignments.accepted_at`) |
| Ends | at the pickup point named in the shipment — the pinned coordinate the sender dropped, or the village/town in the details |
| Duration | first leg distance at the vehicle's village-road speed (tractor trolley 18 km/h → 32-ft 34 km/h), +10% road factor, minimum 9 min |
| Turns red | 5 minutes past the promised time, then counts **up** as overdue |
| Where it shows | transporter → `/transporter/assignments`, `/transporter/trips` · sender → `/sender/<shipment>`, `/sender/tracking` |
| API | `GET /api/assignments/{id}/arrival` · also embedded as `arrival` in `/assignments/available`, `/trips/mine`, `/shipments/{id}` and `/tracking/trips/{trip_id}` |
| Needs a key | no |

Example payload:

```json
{
  "assignment_id": "ASG-004", "phase": "accepted",
  "accepted_at": "2026-11-22T08:54:00+00:00", "arrive_at": "2026-11-22T10:24:00+00:00",
  "eta_minutes": 90, "remaining_minutes": 26.3, "remaining_seconds": 1579, "late": false,
  "drive_km": 24.6, "speed_kmh": 18.0,
  "pickup": {"label": "Bhari", "lat": 30.8421, "lng": 76.152,
             "source": "pinned coordinate chosen by the sender"}
}
```

---

## 10. Phones, tablets and laptops

The UI is laid out for 320 px phones up to 1500 px laptops:

* the sidebar becomes a slide-in drawer under `lg` (1024 px), opened by the ☰ button;
* cards stack in one column; wide tables scroll **inside their own card** (the
  page itself never scrolls sideways — `html, body { overflow-x: hidden }` plus a
  `minmax(0,1fr)` grid guard so a 640 px table cannot stretch the document);
* the page title wraps instead of truncating, tab pills stay on one line, and the
  arrival clock switches to a 2×2 stat grid on phones;
* maps, charts and the live tracker are fluid — they take the card width and keep
  their aspect from `height` props.

Verified at 320×568, 360×780, 390×844 and 768×1024 across the public pages and
all three dashboards with an automated horizontal-overflow check (`qa/mobile`).
