# CARGOX — testing & verification

## 0. QA harness in the repo

| Script | What it does |
|---|---|
| `backend/tests/test_workflow.py` | the 119-assertion API suite (also creates its own accounts) |
| `tools/verify_entry_paths.py` | browser check of the three real entry paths: admin by Google **and** password, sender/transporter by registration **and** Google → correct dashboard. Uses a locally signed ID token + `tools/jwks_standin.py` where Google is unreachable |
| `tools/verify_routes.py` | 38 routes × desktop 1440×950 + phone 390×844, asserting 0 overflow, 0 crashes, 0 console errors, 0 countdown text, 0 demo credentials |
| `tools/seed_live_clock.py` | drives one consignment through the live API to leave the pickup arrival clock running (for screenshots / a demo) |

## 1. Backend workflow suite

```bash
cd backend
rm -f cargox.db*                 # the SQLite twin is disposable
python3 tests/test_workflow.py
```

```
PASSED 119   FAILED 0
ALL WORKFLOW CHECKS PASSED
```

The 119 assertions run in workflow order against a real FastAPI `TestClient` over a freshly seeded
database. The suite creates its own accounts — it registers the sender and transporter it uses, and
it signs the owner admin in with `mehakdeep.s2006@gmail.com` / `mehak@2006`; nothing depends on a
demo login existing. Categories:

| Area | Examples of what is asserted |
|---|---|
| Roles | exactly three roles; `receiver`/`fpo` reported as `NOT A CARGOX ROLE`; register with `account_type=receiver` → 422; admin cannot be self-registered |
| Auth | login, `/me`, role-guard 403 on `/api/admin/overview`, wrong password 401, missing token rejected |
| No demo accounts | `/auth/config` → `demo_mode:false`, `demo_accounts:[]`; `admin@cargox.in`, `harpal@…`, `balwinder@…` all rejected with 401 |
| Google sign-in | a real RS256 ID token (throwaway key installed in the JWKS cache) signs the owner in as Admin on `/admin`; new Google identities create Sender / Transporter accounts; a forged token is 401 |
| Shipment lifecycle | create → `pending_admin_review`; admin approve → `planning`; 12 statuses respected |
| Pooling | `pools/auto` returns `{count, created[]}` with `compatibility`; AgroCompat blocks tomato+potato, allows wheat+paddy |
| Capacity | `capacity/match` returns `coverage_ratio` + ranked verified candidates |
| Planning | `plans/generate` returns `route_plan.solver` starting with `ortools`, `two_echelon.mode`, `hub_choice.method == constrained_k_median` |
| Dispatch | decision ∈ {GO, WAIT, SPLIT, CANCEL} with `wait_benefit`, `delay_cost`, `reasons` |
| Fairness | `allocations/compute` → `method: shapley*`, `allocation_sum_matches_route_cost`, `all_allocations_acceptable` |
| Consent | assignment confirm **409** until transporter `respond accept` **and** sender `approve-allocation` |
| Execution | `start → loading`, `confirm_loading → in_transit`, `confirm_delivery → delivered` |
| Delivery | `POST /admin/deliveries` → `admin_verified` |
| Tracking | 11 steps, `live_gps: false` |
| Analytics & export | admin/sender/transporter aggregates; CSV for shipments, allocations, trips |
| Notifications | sender receives rows; support ticket creation and resolution |
| Simulation | 4 policies in order; fixed seed reproduces `cost_per_quintal`; replayable event log; labelled synthetic |
| Audit | admin actions recorded; append-only |
| Hardening | `GET /admin/capacity/match/view` works inside a GET handler; `agrocompat/matrix` GET + query form; unauthenticated intelligence read rejected; admin cannot use the sender shipment list |

## 2. Frontend verification (this build)

Performed with a headless Chromium against the running dev servers:

* **Route crawl, all three roles** — 12 sender + 11 transporter + 28 admin routes loaded; every
  `/api/backend/*` call observed returned 2xx/3xx; no unhandled runtime errors (the only console
  noise comes from Recharts' upstream `defaultProps` deprecation warning).
* **Type check** — `npx tsc --noEmit` clean.
* **Production build** — `npx next build` → 57 routes, compiled and type-checked.
* **Responsive** — sidebar collapses to a drawer below `lg`, tables scroll horizontally, modals are
  width-capped at 92vw; verified at 1440×950, 834×1112 and 390×844 viewports.
* **Empty and error states** — every queue renders `EmptyState`; every read renders `ErrorNote` with
  a retry; every write shows a toast and disables its button while in flight.

### Manual smoke script (3 minutes)

1. Sign in as **sender** → create a consignment (or use VoiceBoli: *"Bhari ton 40 quintal gehun
   gobindgarh kal"*) → it lands in `pending_admin_review`.
2. Sign in as **admin** → Shipments: approve it → Pools: auto-pool → Plan & route: generate →
   DispatchSense: decide → ShapleySplit: compute → Assignments: assign.
3. Sign in as the **sender** again → Freight & fair share: approve the proposed share. Confirm the
   amount shown matches the Shapley output and is not higher than the solo cost.
4. Sign in as **transporter** → Available assignments: accept → Trips: start, confirm loading.
5. Back to **admin** → Trip monitoring: watch the status move → Delivery verification: record POD →
   the shipment becomes `delivered`.
6. Try to break it: as transporter, open `/admin` (redirected); as sender, open another sender's
   shipment id (404).

## 3. Known gaps (declared, not hidden)

| Gap | Why it exists | What would close it |
|---|---|---|
| No automated browser test in the repo | Playwright adds ~130 MB of browser binaries to the deliverable | add `qa/` as a devDependency + CI job |
| Forecast accuracy unmeasured | no pilot arrival logs yet | baseline is already stored with each forecast |
| Road risk is static | no IMD integration | scheduled ingestion into `road_edges.monsoon_risk` |
| Single-instance rate limiter | in-process token bucket | Redis-backed limiter |
| No payment path | needs a regulated partner | out of scope by design |
