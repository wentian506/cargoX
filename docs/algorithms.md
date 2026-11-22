# CARGOX — algorithms

All algorithm modules are pure functions in `backend/app/algorithms/`. They take plain dicts and
return plain dicts; they never query the database, which is why they are testable in isolation and
reusable from both the API and the simulation engine.

---

## 1. `geo.py` — distance and travel time

```
haversine(a, b)                        straight-line km
road_km(a, b) = haversine * ROAD_FACTOR (1.24)
travel_minutes(class, km)              class-specific average speed + fixed handling overhead
```
Speeds: tractor-trolley ≈ 18 km/h, pickup ≈ 28, tempo ≈ 32, LCV ≈ 38, truck ≈ 42.
The road factor is a documented constant, not a fitted parameter — a real corridor would calibrate it
against GPS traces (see `docs/deployment.md` upgrades).

## 2. `forecast.py` — HarvestPulse

Produces `p10 / p50 / p90` volume bands per cluster × commodity × horizon from
(a) stored harvest forecasts, (b) cluster area share, (c) a seasonal calendar curve, and
(d) a widening factor with horizon (uncertainty grows with lead time). A **seasonal-naive baseline**
(previous comparable period) is always computed alongside, so accuracy becomes measurable the moment
pilot arrival logs exist. Output is labelled synthetic and the UI shows the baseline next to the band.

## 3. `compat.py` — AgroCompat

Pairwise rules per commodity with three severities:

* **hard** — pooling is refused (ethylene-sensitive produce with ethylene producers, moisture-driven
  mould risk, contamination, odour taint)
* **soft** — pooling allowed with precautions returned to the operator (ventilation, separation,
  stacking limits)
* **none** — no interaction

`check_set([...])` folds pairwise rules into a set verdict `{compatible, blockers[], warnings[],
recommendation}`; `check(a, b)` returns `{compatible, score}` for the matrix view. Verified behaviour:
tomato + potato blocks, wheat + paddy allows.

## 4. `planning.py` — routing, hubs, roads, two-echelon

**`plan_routes(depot, stops, vehicles, horizon_min)`** builds a CVRPTW in OR-Tools:
distance matrix from `road_km`, capacity dimension `payload_kg`, time dimension from
`travel_minutes` + service time, per-stop `ready_min`/`deadline_min` windows. The solver string in the
response starts with `ortools`. If OR-Tools is unavailable, `greedy_routes` produces the same shape
with `solver: greedy_nearest_vehicle`, so the plan endpoint never fails.

**`select_hubs(villages, hubs, k, radius_km)`** — only usable candidates (`safety_verified`) are
considered; score = sum of distances to served villages + heavy penalty for uncovered villages;
returns `{hubs[], coverage, objective, method: "constrained_k_median", assignments[]}`.

**`road_access_check(edges, vehicle_class, monsoon)`** — filters links by surface/width against the
class, and under monsoon applies stored `monsoon_risk`. Returns `blocked[]` with reasons,
`warnings[]` and `passable`. This is what stops a truck being planned onto a 3 m kutcha track.

**`build_two_echelon(pickups, hub, first_mile_vehicle, line_haul_vehicle, destination)`** — first-mile
collection into the hub, line-haul to the mandi, with a transfer window; falls back to `mode: direct`
when no hub qualifies. It never invents an intermediate point.

## 5. `dispatch.py` — DispatchSense

Expected-value rule:

```
benefit(wait) = P(useful arrival) * expected_extra_kg * value_per_kg
cost(wait)    = wait_minutes * delay_cost_per_min  (+ urgency-weighted deadline risk)
GO       if cost >= benefit and load_factor >= threshold
WAIT     if benefit > cost and deadline slack allows
SPLIT    if partial dispatch keeps the deadline and fills a vehicle
CANCEL   if the load cannot be served within the horizon at all
```
Every decision stores: benefit ₹, delay cost ₹, urgency score, and a human-readable reason sentence.
The admin sees the trade-off before approving. It is a transparent rule, not a learned policy.

## 6. `valueclock.py` — destination economics

```
retention(commodity, hours)   lookup curve (0 h = 1.0, decays by commodity)
travel_hours = travel_minutes / 60
hours_to_sale = travel_hours + queue_minutes/60
gross   = price_per_quintal * quintals * retention(hours_to_sale)
delay   = queue_minutes/60 * delay_cost_per_hour * quintals
net     = gross - freight_share - delay
rank    = net desc
```
Returns assumptions with the result (synthetic prices, proxy retention) and flags
`arrival_after_closing`.

## 7. `shapley.py` — ShapleySplit

Exact Shapley values for coalitions up to 8 players (all 2^n subsets), sampling above that. The
characteristic function is the coalition's optimal routing cost (OR-Tools / greedy). Then:

```
allocated_share_i = share_i shifted so that sum(shares) == coalition_cost exactly
participation_check_i = allocated_share_i <= standalone_cost_i
```
Integer rounding is reconciled to the last player so the sum always matches. If any participant would
pay more than going solo, `all_allocations_acceptable` is false and the UI says so rather than hiding
it. Verified behaviour: `allocation_sum_matches_route_cost` and `all_allocations_acceptable` are both
asserted in the test suite.

## 8. `readiness.py` — ReadySync

`checkpoint_state(departure)` → active checkpoint (T-60, T-45), state
(`scheduled | check_in_due | dispatched | no_departure_set`).
`readiness_verdict(shipments)` → ratio of `ready_check == 'ready'`:

| ratio | verdict |
|---|---|
| ≥ 0.85 | `DISPATCH_WAVE` |
| ≥ 0.50 | `DISPATCH_READY_AND_DEFER_REST` |
| < 0.50 | `HOLD_WAVE` |

The unready list comes back with the verdict so the admin can move exactly those consignments to the
next wave. No incentive/penalty mechanism is implemented — that is a stated pilot design question.

## 9. `recovery.py` — ShadowFleet-Heal

1. **Freeze** every commitment not on the affected trip (so an unrelated sender's plan is not
   silently changed).
2. Build affected loads with demand, location and deadline.
3. Ordinal/standby search over available vehicles (capacity, class, road access, distance, cost).
4. Report `feasible | partial | infeasible` with extra cost, total added delay and a
   **plan-stability penalty** (how many commitments would change).
5. Admin approval is required before anything is rewritten.

## 10. `backhaul.py` — CrossFlow-Backhaul

An offer is made only when `incremental_revenue > incremental_cost` (extra km × cost/km + driver time
value), AgroCompat passes for the cargo, and the return leg does not jeopardise the next committed
trip. Rejections are recorded with the blocking reason.

## 11. `simulation/engine.py` — the four-policy comparison

```python
POLICIES = [individual_booking, greedy_matching, standard_consolidation, cargox_integrated]
```

*One* scenario is generated from the seed (`build_scenario`), then all four policies run against the
identical instance. Metrics computed identically for all: `freight_cost`, `cost_per_quintal`,
`vehicle_km`, `km_per_quintal`, `empty_km_share`, `avg_load_factor`, `on_time_rate`, coverage,
vehicles used, and reduction percentages versus `individual_booking`.

**Fair-ruler fix (`_reprice`)**: every policy's trips are re-priced as
*first pickup → remaining pickups → destination mandi* at that vehicle's cost/km. Before this fix the
baselines were priced without the delivery leg and the comparison was flattering to CARGOX. The
response now also reports `cost_gap_vs_best_baseline_pct`, because the gap to the strongest simple
baseline is the number a procurement decision should use.

Reference output (seed 424242, `khanna_wheat_wave`, 22 consignments / 23.7 t):

| policy | trips | cost ₹ | ₹/quintal | load factor | empty-km share |
|---|---|---|---|---|---|
| individual_booking | 22 | 27,250 | 114.98 | 0.215 | 0.528 |
| greedy_matching | 5 | 7,775 | 32.81 | 0.772 | 0.141 |
| standard_consolidation | 6 | 8,867 | 37.41 | 0.566 | 0.207 |
| **cargox_integrated** | 3 | **6,396** | **26.99** | **0.959** | **0.044** |

Headline: −76.5% cost/quintal vs individual booking, **−17.7% vs the best simple baseline**. These are
model outputs, not pilot measurements, and the API says so in `disclaimer`.
