# CARGOX — data model

36 tables, all UUID-keyed in Postgres (`text` ids in the SQLite dev twin). This file explains the
shape; the authoritative DDL is `supabase/migrations/0001_core_schema.sql`.

## Groups

### Identity (5)
| Table | Purpose | Key relationships |
|---|---|---|
| `organisations` | external partners: hub operators, mandi boards, warehouses, logistics partners | referenced by `hubs.partner_id`, `profiles.org_id` |
| `profiles` | one row per account, role ∈ {sender, transporter, admin} | `auth_user_id → auth.users` |
| `sender_profiles` | sender-specific attributes (account kind, default village) | 1:1 `profiles` |
| `transporter_profiles` | company, fleet size, verification status, rating | 1:1 `profiles` |
| `vehicles` | fleet; `verified` gates assignment eligibility | N:1 `profiles` |
| `vehicle_documents` | per-document verification records | N:1 `vehicles` |

### Corridor (4)
`villages` (geography point, cluster), `road_edges` (surface, width, monsoon_risk, linestring),
`hubs` (safety_verified required for two-echelon), `mandis` (opening/closing, queue).

### Demand (4)
`shipments`, `shipment_items`, `shipment_destinations` (external buyer/mandi/warehouse records —
**not** roles), `shipment_pools`.

### Supply & execution (6)
`capacity_blocks`, `transport_assignments`, `trips`, `trip_legs`, `trip_shipments`.

### Evidence & money (5)
`shipment_events`, `delivery_confirmations`, `quality_inspections`, `coalitions`, `cost_allocations`.

### Decisioning (4)
`dispatch_decisions`, `disruption_events`, `recovery_plans`, `return_load_offers`.

### Signals (4)
`harvest_forecasts`, `market_observations`, `mandi_queues`, `notifications`.

### Platform (3)
`simulation_runs`, `simulation_events`, `support_tickets`, `audit_logs`.

## Invariants enforced in the database (not just the API)

| Invariant | Where |
|---|---|
| Password-less: auth lives in Supabase; no password column in Postgres schema | `profiles` |
| A sender never pays more than going alone | `cost_allocations.allocation_participation` CHECK |
| Forecast bands are ordered | `harvest_forecasts.forecast_band_ok` CHECK |
| Ready window is coherent | `shipments.shipments_window_ok` CHECK |
| Capacity window is coherent | `capacity_blocks.capacity_window_ok` CHECK |
| Only known statuses exist | CHECK on every `status` column (12 shipment states, 7 trip states, …) |
| Admin accounts cannot be self-created | `profiles_no_public_admin` trigger |
| Audit trail cannot be rewritten | `audit_logs_no_update` trigger + no UPDATE/DELETE policy |
| A transporter is offered one row at a time | `capacity_blocks.payload_kg > 0`, assignments role policy |

## Indexes

Every FK used in a join, plus the filters the API actually issues:

```sql
shipments(sender_id) shipments(status) shipments(commodity) shipments(pool_id)
shipments using gist(pickup_point)
vehicles(transporter_id) vehicles(verified)
capacity_blocks(status)
transport_assignments(transporter_id, status)
trips(status) trips(assignment_id)
shipment_events(shipment_id, created_at desc)
cost_allocations(coalition_id) cost_allocations(shipment_id)
notifications(profile_id, created_at desc)
audit_logs(created_at desc) audit_logs(actor_id) audit_logs(entity_type, entity_id)
market_observations(commodity_id, mandi_id, obs_date desc)
villages using gist(location) mandis using gist(location) road_edges using gist(geometry)
```

## Row Level Security summary

| Scope | Sender | Transporter | Admin |
|---|---|---|---|
| `shipments` | own rows R/W | rows on their assigned trips (R) | all R/W |
| `cost_allocations` | own rows R + approve | — | all R/W |
| `capacity_blocks` | — | own R/W | all R/W |
| `transport_assignments` | sees via shipments | own R + respond | all R/W |
| `delivery_confirmations` | own (R) | — | all R/W |
| `notifications`, `support_tickets` | own | own | queue (admin) |
| corridor reference tables | read | read | read/write |
| `audit_logs` | — | — | read only (append via service role) |

The database mirrors the API's isolation rules on purpose: a handler bug must not be enough to leak
another sender's data.

## Synthetic data policy

* Village coordinates approximate real places; **prices, mandi queues, harvest volumes and vehicle
  costs are synthetic** and stored with a `synthetic` flag where relevant.
* No record is presented as a live measurement. Every API response that carries modelled output
  includes `synthetic: true` and/or a plain-language disclaimer, and the UI renders a
  `SyntheticNote` on those screens.
