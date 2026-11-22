# CARGOX

**Smarter Rural Logistics. Stronger Connections.**

A rural freight coordination platform for Punjab's village-to-mandi corridor, built for
**Hackathon Problem 5.3**, benchmarked against GRAMFLOW AI – FORWARD.

Three roles only — **Sender**, **Transporter**, **Admin** — and one coordinated flow between them.
Every pool, assignment, fair-share split, reassignment and delivery verification is coordinated by an
admin and consented to by the parties it affects.

```
cargox/
├── frontend/     Next.js 14 + TypeScript + Tailwind (51 screens, 3 role areas + public site)
├── backend/      FastAPI + Python algorithms + fixed-seed simulation + 119-assertion test suite
├── supabase/     PostgreSQL + PostGIS DDL, RLS policies, reference seed, admin provisioning
└── docs/         architecture · workflow · api · data model · algorithms · testing · deployment
```

---

## Quick start

```bash
# 1. backend  (SQLite, no services required)
cd backend
pip install fastapi uvicorn "pydantic[email]" ortools numpy pandas
uvicorn app.main:app --host 0.0.0.0 --port 8000
python3 tests/test_workflow.py          # PASSED 119  FAILED 0

# 2. frontend (separate shell)
cd frontend
npm install
npm run dev                             # http://localhost:3000
```

The frontend proxies `/api/backend/*` to the API server-side (`CARGOX_API_URL`), so there is no CORS
surface and no API origin in the browser.

### Accounts — there are no demo logins

| Role | How you get in | Lands on |
|---|---|---|
| **Admin (owner)** | `mehakdeep.s2006@gmail.com` — **Sign in with Google**, *or* **Email id with password** with `mehak@2006` | `/admin` |
| **Sender** | self-register at `/register` with your details, or **Sign up with Google** (or Login → Sender → Sign in with Google → confirm the address) | `/sender` |
| **Transporter** | same: `/register` details or **Sign up with Google** | `/transporter` |

Every one of the old demo senders/transporters/admins and their published
passwords is **gone** — removed from the seed, the API, the UI and these docs.
`GET /api/auth/config` reports `demo_mode: false` and `demo_accounts: []`.

Admin is never self-registered: the owner address comes from
`CARGOX_ADMIN_EMAILS` (default `mehakdeep.s2006@gmail.com`) and the password from
`CARGOX_ADMIN_PASSWORD` (default `mehak@2006` — **change it before a public
launch**, see below). Full detail: [`docs/admin-access.md`](docs/admin-access.md).

```bash
# rotate the owner password on a deployment (Google sign-in is unaffected)
cd backend && python3 -m app.cli set-admin-password 'a-long-new-password'
python3 -m app.cli profiles          # who exists, and whether they can log in
```

---

## What it actually does

A consignment moves through 22 recorded steps. The short version:

```
sender creates (draft → pending_admin_review)
  → admin reviews, pools compatible loads, matches verified capacity
  → admin plans the route (OR-Tools CVRPTW, two-echelon via a safety-verified hub)
  → DispatchSense says GO / WAIT / SPLIT / CANCEL with the rupee trade-off
  → ShapleySplit computes each sender's fair share and proves nobody pays more than going alone
  → sender approves its share, transporter accepts the work, admin confirms
        (confirmation returns 409 unless BOTH consents exist)
  → readiness check-ins at T-60/T-45 → trip execution → admin verifies POD → delivered
```

### The modules, and what they honestly are

| Module | What it does | Limit stated in the product |
|---|---|---|
| HarvestPulse | 7–35 day volume bands (p10/p50/p90) per cluster | demand-side model, naive baseline kept for comparison |
| DispatchSense | GO/WAIT/SPLIT/CANCEL with ₹ benefit vs ₹ delay cost | transparent rule, not a learned policy |
| ReadySync | T-60/T-45 wave verdicts | no incentive/penalty mechanism |
| GramTwin-2E | first-mile + line-haul with hub selection (k-median) | only safety-verified hubs; else direct |
| ValueClock | net realisation per mandi after queue, retention, freight | synthetic prices, proxy retention curve |
| AgroCompat | hard blockers + soft precautions for pooling | broad priors, needs agronomy validation |
| ShapleySplit | marginal-contribution fair share + participation check | exact ≤8 players, sampling above |
| ShadowFleet-Heal | freeze/repair on disruption, admin approves | can answer "infeasible" |
| CrossFlow-Backhaul | return loads when incremental revenue clears cost | never jeopardises the next committed trip |
| MonsoonPass | road access by vehicle class | stored risk, **no live weather feed** |
| VoiceBoli | spoken Punjabi/Hindi/English → structured draft | ASR pluggable, always requires confirmation |

**Digital twin simulator** — one scenario, one seed, four policies (individual booking, greedy
matching, standard consolidation, integrated CARGOX), all priced with the same trip definition:

| policy | ₹/quintal | load factor | empty-km |
|---|---|---|---|
| individual booking | 114.98 | 0.215 | 52.8% |
| greedy matching | 32.81 | 0.772 | 14.1% |
| standard consolidation | 37.41 | 0.566 | 20.7% |
| **integrated CARGOX** | **26.99** | **0.959** | **4.4%** |

Model output, not a pilot measurement. The UI shows the gap to the weakest baseline *and* the gap to
the best simple baseline (−17.7%), because the first number alone overstates the benefit.

---


## Honest scope

Deliberately **not** in this build, and labelled as such in the UI: live GPS (trips advance by operator
checkpoints), real payments/credit/insurance (fictional ledger), live mandi price feeds (synthetic
observations, flagged), IMD weather (stored road risk), receiver/FPO accounts (destinations are
external records), and any platform commission (none charged).

## Docs

| File | Contents |
|---|---|
| `docs/architecture.md` | topology, module map, security model, module honesty table |
| `docs/workflow.md` | the 22 steps, guards, status machine, consent matrix |
| `docs/api-reference.md` | every endpoint with role and notes |
| `docs/data-model.md` | 36 tables, invariants, indexes, RLS summary |
| `docs/algorithms.md` | formulas, parameters, the fair-ruler fix, reference numbers |
| `docs/testing.md` | what the 119 assertions cover, browser verification, known gaps |
| `docs/deployment.md` | Supabase → Render → Vercel, env vars, free-tier limits, post-deploy checklist |
| `docs/admin-access.md` | the only admin, plus how senders/transporters create their own accounts |
| `docs/comparison.md` | capability-by-capability table vs the reference platform |
| `docs/env.example.md` | all environment variables in one place |

## Design system

The interface is built on one visual language, documented so it can be extended without drift:

| Surface | Treatment |
|---|---|
| **Marketing site** (`/`) | Dark cinematic hero on a photographic corridor image, floating pill navigation, yellow accent type, three auto-rotating value slides |
| **Auth** (`/login`, `/register`, `/reset`) | Foggy-bridge photograph under a glass card: pill inputs, white primary button, invitation copy on the left |
| **Workspaces** (sender / transporter / admin) | Rounded near-black rail with a yellow active pill, white search field with ⌘K, white content panel on a soft grey shell, KPI strip with sparklines, yellow bar charts, calendar + upcoming column |

**Logo.** The supplied "pitched C" mark is rebuilt as inline SVG (`components/Logo.tsx` → `PitchMark`) and inlined
into every surface with a `tone` switch for light and dark backgrounds. No raster dependency, so it stays crisp in
print, favicon and app contexts.

**Colour tokens** (`tailwind.config.js`): `rail #151515`, `accent #FFD60A`, `accent-50 #FFFBEB`, `shell #EDEDED`,
`ink #171717`, `ink-muted #7A7A7A`, `line #E8E8E8`, `soft #F5F5F5`, `night #0A1016` (marketing). Charts
(`components/charts.tsx`) and the map (`components/MapView.tsx`) use the same yellow/near-black ramp.

**Type.** Poppins (300–700) via `next/font`, self-hosted at build time — no runtime CDN request.

**Dashboard primitives** (`components/dashboard.tsx`): `DashCard`, `Sparkline`, `BarSeries` (hand-built, single-series
or stacked, with hover tooltip and per-bar tint), `Segmented`, `ChartLegend`, `MonthStrip`, `Rows`, `Gauge`.
Every figure on the three overview screens comes from a real API response — no invented metrics.
