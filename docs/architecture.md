# CARGOX — architecture

> Smarter Rural Logistics. Stronger Connections.
> Hackathon build for **Problem 5.3 — Rural Freight Coordination**, benchmarked against GRAMFLOW AI – FORWARD.

This document explains how the system is put together, what each module is allowed to claim, and
where the honest limits are. It is written for the next engineer, not for a pitch deck.

---

## 1. What CARGOX is

A coordination platform for village-to-mandi freight in Punjab, with **exactly three roles**:

| Role | Sees | Does |
|---|---|---|
| **Sender** | own consignments, own freight shares, own tracking | creates shipments, checks readiness, approves fair-share proposals |
| **Transporter** | own fleet, own published capacity, own assignments/trips | registers vehicles, publishes capacity, accepts/declines work, executes trips |
| **Admin** | the whole coordination surface | reviews, pools, matches, plans, dispatches, allocates, assigns, verifies delivery |

Mandi boards, buyers, processors and warehouses are **external shipment destinations** recorded as
records in `shipment_destinations` / `mandis`. They are never account types. There is no Receiver
role and no FPO role — an FPO appears only as an organisation that owns a hub.

Every step that moves a consignment is **admin-coordinated and consent-checked**:

```
sender creates → admin reviews (pending_admin_review)
              → admin pools            (planning → matched)
              → admin allocates fair share (awaiting_sender_approval)
              → sender approves share  + transporter accepts (confirmed)
              → ready check → ready_for_pickup → in_transit
              → at_transfer_hub → out_for_delivery
              → admin verifies POD → delivered
```

`POST /api/admin/assignments/{id}/confirm` returns **409** until both the transporter has accepted
and the sender has approved the allocation. That is the product's core promise, and it is a test.

---

## 2. Runtime topology

```
┌───────────────────────────────────────────────────────────────────────┐
│ Browser                                                               │
│  Next.js 14 App Router (client components + server layout)            │
└───────────────┬───────────────────────────────────────────────────────┘
                │  same-origin fetch to /api/backend/*
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Next.js server                                                        │
│  rewrite /api/backend/:path* → CARGOX_API_URL/api/:path*              │
└───────────────┬───────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ FastAPI (uvicorn)                                                     │
│  app/api/{auth,shipments,vehicles,admin,transporter,                  │
│           intelligence,simulations,misc}.py                           │
│  app/algorithms/*  ← pure functions, no I/O                           │
│  app/simulation/engine.py ← fixed-seed policy comparison              │
└───────────────┬───────────────────────────────────────────────────────┘
                │  SQLite (dev)  /  Postgres + PostGIS (prod, Supabase)
                ▼
        backend/cargox.db  /  supabase/migrations/*.sql
```

Why the proxy: the browser never learns the API origin, so there is no CORS surface in production
and the API can stay on a private network. `next.config.js`:

```js
async rewrites() {
  return [{ source: "/api/backend/:path*",
            destination: `${process.env.CARGOX_API_URL || "http://127.0.0.1:8000"}/api/:path*` }];
}
```

### Data layer duality

* **SQLite** — zero-dependency local run. `backend/app/sql/schema.sql` is regenerated on boot;
  `backend/cargox.db` is disposable.
* **PostgreSQL/PostGIS** — `supabase/migrations/0001_core_schema.sql`. UUID PKs, `geography`
  columns, CHECK constraints, indexes, RLS in `0002`.
* `app/db.py` is the only file that knows which dialect is in use (`?` → `%s` rewriting, `jdump`
  helpers). Algorithms never touch the database.

---

## 3. Backend module map

| File | Responsibility |
|---|---|
| `core/config.py` | environment-driven settings, rate limits, synthetic label |
| `core/security.py` | password hashing (PBKDF2), JWT mint/verify, `Principal`, `admin_only`, `any_role`, role guards |
| `db.py` | dialect-agnostic query layer, `insert`, `execute`, `scalar`, `jdump/jload` |
| `schema.py` + `sql/schema.sql` | table creation and indexes |
| `seed.py` | synthetic corridor register + the owner admin + a fully worked shipment lifecycle (no demo logins) |
| `algorithms/geo.py` | haversine, road factor, `road_km`, travel time by vehicle class |
| `algorithms/forecast.py` | HarvestPulse bands (p10/p50/p90) + seasonal-naive baseline |
| `algorithms/compat.py` | AgroCompat hard/soft commodity rules, `check_set` |
| `algorithms/planning.py` | OR-Tools CVRPTW (`plan_routes`), `greedy_routes` fallback, `select_hubs` (constrained k-median), `build_two_echelon`, `road_access_check` |
| `algorithms/dispatch.py` | DispatchSense GO/WAIT/SPLIT/CANCEL with rupee trade-off |
| `algorithms/valueclock.py` | retention curve + net realisation ranking |
| `algorithms/shapley.py` | exact Shapley for small coalitions, sampling above 8 players, participation check |
| `algorithms/readiness.py` | T-60/T-45 checkpoint state and wave verdict |
| `algorithms/recovery.py` | ShadowFleet-Heal: freeze/repair/standby search |
| `algorithms/backhaul.py` | CrossFlow incremental-revenue test |
| `simulation/engine.py` | 3 scenarios × 4 policies, one shared metric definition, fixed seed |
| `api/*` | HTTP surface, role guards, pagination, filtering, audit + notification side-effects |

### Route groups

| Prefix | File | Guard |
|---|---|---|
| `/api/auth` | `auth.py` | public: register/login/forgot/reset · user: me, patch me, logout |
| `/api/shipments` | `shipments.py` | sender (admin may inspect) |
| `/api/vehicles`, `/api/capacity`, `/api/transporters` | `vehicles.py` | transporter write · admin verify |
| `/api/admin/*` | `admin.py` | admin only (router-level dependency) |
| `/api/assignments`, `/api/trips`, `/api/backhaul` | `transporter.py` | transporter |
| `/api/forecasts`, `/api/dispatch`, `/api/readysync`, `/api/hubs`, `/api/routes`, `/api/valueclock`, `/api/agrocompat`, `/api/recovery`, `/api/backhaul/summary`, `/api/monsoonpass`, `/api/voice` | `intelligence.py` | `any_role`, admin for mutations |
| `/api/simulations/*` | `simulations.py` | `any_role` (write: admin in prod) |
| `/api/analytics`, `/api/notifications`, `/api/support`, `/api/corridor`, `/api/config`, `/api/health` | `misc.py` | role-scoped |

Cross-cutting: every mutating admin/transporter action writes to `audit_logs` and emits a
`notifications` row through `services/common.py`. A token-bucket rate limiter in `main.py` returns
**429 + Retry-After** (20/min on auth paths, 600/min elsewhere, per client IP).

---

## 4. The intelligence modules, honestly described

Each module's output is a **decision aid**, and each one states its own limits in the UI and the API
payload.

| Module | Input | Output | Honest limit |
|---|---|---|---|
| **HarvestPulse** | cluster, commodity, horizon 7/14/21/35 | p10/p50/p90 volume band + seasonal-naive baseline | Demand-side bands, not yield prediction. Needs arrival-log validation. |
| **DispatchSense** | pool kg, capacity, expected arrivals, urgency, hours to deadline | GO / WAIT / SPLIT / CANCEL + ₹ benefit vs ₹ delay cost + reasons | Deterministic expected-value rule, not a learned policy. |
| **ReadySync** | ready windows, check-in state | wave verdict (dispatch / dispatch-and-defer / hold) at T-60 and T-45 | No incentive or penalty mechanism — deliberately out of MVP. |
| **GramTwin-2E** | villages, safe hubs, vehicle classes | single-echelon vs two-echelon plan, transfer window | Only safety-verified hubs qualify; else direct fallback. |
| **ValueClock** | commodity, qty, origin, freight share | ranked net realisation per mandi with retention + queue cost | Retention is a published-handling-style lookup, prices synthetic. |
| **AgroCompat** | commodity set | hard blockers + soft precautions | Broad priors; needs agronomy validation. |
| **ShapleySplit** | coalition cost, standalone costs | per-sender share + participation check | Integer cost rounding is reconciled; >8 players uses sampling. |
| **ShadowFleet-Heal** | trip + disruption | freeze unaffected, repair affected, standby alternatives | Admin must approve; "infeasible" is a valid answer. |
| **CrossFlow-Backhaul** | pending trips, return demand | return-load offers with extra km/revenue/time | Offered only when incremental revenue clears incremental cost. |
| **MonsoonPass** | road_edges + vehicle class | passable/blocked + physical-verify warnings | Stored risk attribute, **no live IMD feed**. |
| **VoiceBoli** | transcript (en/hi/pa) | structured draft + clarification questions | Grammar extraction over text; ASR layer is pluggable. |

### Simulation (Digital Twin)

`POST /api/simulations/run {scenario, seed, params}` replays **one scenario and one seed** under four
policies:

1. `individual_booking` — one vehicle per consignment (weakest comparator)
2. `greedy_matching` — nearest-vehicle packing
3. `standard_consolidation` — compatible loads pooled, no forecast/rule/recovery
4. `cargox_integrated` — pooling → capacity → CVRPTW → DispatchSense gate → Shapley → recovery

All four are priced with the **same trip definition** (`_reprice`): first pickup → remaining
pickups → destination mandi. This was a deliberate fix: before it, baselines were priced without the
final delivery leg and every comparison was flattering. The response reports both the gap to the
weakest baseline *and* `cost_gap_vs_best_baseline_pct`, because the weak baseline should never be
the headline.

Scenario keys: `khanna_wheat_wave`, `payal_mixed_perishable`, `sahnewal_tight_capacity`.

---

## 5. Frontend structure

```
frontend/
  app/
    page.tsx                     public landing
    about|how-it-works|services|contact|forgot-password/
    (auth)/login, register
    (sender)/sender/*            12 screens
    (transporter)/transporter/*  11 screens
    (admin)/admin/*              28 screens
    globals.css                  design tokens + component classes
  components/
    ui.tsx          Card, Stat, Table, Badge, Modal, Toast, Tabs, Progress, EmptyState, …
    charts.tsx      ForecastRibbon, BarsChart, Donut, PolicyCompare, RadarScore, LineTrend
    MapView.tsx     dependency-free SVG corridor map (no tiles, works offline)
    AppShell.tsx    sidebar + topbar + notification bell
    NotificationsPanel.tsx  shared by all three roles
    PublicShell.tsx public header/footer
  lib/
    api.ts       typed fetch client via /api/backend, ApiError, CSV raw fetch, formatters
    session.tsx  SessionProvider, useSession, useGuard(role), homeFor(role)
    hooks.ts     useApi, useDebounced, commodity list
    nav.ts       the three sidebar definitions
```

Design tokens (`tailwind.config.js`), two registers sharing one accent:

| Token | Value | Used for |
|---|---|---|
| `rail` | `#151515` | workspace navigation rail (rounded, near-black) |
| `accent` | `#FFD60A` | active nav pill, primary buttons, charts, emphasis |
| `accent-50` / `accent-100` | `#FFFBEB` / `#FFF4BF` | notices, soft chart tint |
| `shell` / `panel` | `#EDEDED` / `#FFFFFF` | workspace shell and content panel |
| `ink` / `ink-muted` / `ink-faint` | `#171717` / `#7A7A7A` / `#A5A5A5` | type ramp |
| `line` / `soft` | `#E8E8E8` / `#F5F5F5` | hairlines, table rows, subtle fills |
| `night` / `night-800` / `night-line` | `#0A1016` / `#111A22` / `#22303C` | marketing + auth surfaces |

Type is Poppins (300–700) loaded with `next/font`, so it is self-hosted at build time and needs no CDN at
runtime. The brand mark is inline SVG (`PitchMark`), never a raster asset.

**MapView** is a plain SVG projection, not Leaflet. Reason: the app preview sandbox has no network
access, so tile servers and CDN assets cannot load. Leaflet is documented as the deployment-time
upgrade (`docs/deployment.md`), and the component already accepts `points`/`edges`/`onSelect` props
so swapping the renderer does not change any page.

---

## 6. Security model

* **Auth** — email + password (PBKDF2-SHA256, 120k iterations), JWT (HS256, 24 h) carrying
  `sub` and `role`. Password reset issues a single-use, 1-hour token. Supabase Auth (Google OAuth,
  email verification, optional MFA) replaces the local issuer in production; the FastAPI guards read
  the same JWT shape.
* **Authorisation** — `admin_only`, `any_role`, and per-route role checks. Admin routes are guarded
  at router level (`dependencies=[Depends(admin_only)]`), so a new admin endpoint is protected by
  default. Role cannot be escalated through `PATCH /api/auth/me`.
* **Data isolation** — every sender query is filtered by `sender_id = principal.id`; every
  transporter query by `transporter_id`. RLS policies in `0002_rls_policies.sql` enforce the same
  rules at the database, so a bug in a handler cannot leak another sender's rows.
* **Audit** — `audit_logs` is append-only (trigger blocks UPDATE/DELETE) and records actor, role,
  action, entity, before/after state and IP.
* **Rate limiting** — 20 req/min on auth paths, 600 req/min elsewhere, per client IP, with
  `Retry-After`; disabled with `CARGOX_RATE_LIMIT=0` for load tests.
* **Secrets** — all via environment (`CARGOX_SECRET_KEY`, `DATABASE_URL`, `SUPABASE_*`), never
  committed. `docs/deployment.md` lists every variable.

---

## 7. Testing

`backend/tests/test_workflow.py` — **94 assertions**, no external services:

```bash
cd backend && python3 tests/test_workflow.py     # PASSED 119  FAILED 0
```

It walks the entire workflow in order (auth → roles → shipment → review → pool → capacity → plan →
dispatch → allocation → sender approval → transporter accept → trip actions → delivery → analytics →
simulation → audit → hardening) and asserts the negative cases too: a receiver cannot register, a
non-admin gets 403 on `/api/admin/overview`, confirmation is blocked until both consents exist, the
public registration endpoint cannot create an admin, and unauthenticated intelligence reads fail.

Browser verification is scripted with Playwright (`qa/` in the build workspace, not shipped): all 51
routes were loaded under each of the three roles and every `/api/backend/*` call observed returned
2xx/3xx.
