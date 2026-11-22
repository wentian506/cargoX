# CARGOX — the 22-step coordinated workflow

Every step below exists in the codebase, writes to the database, and is exercised by
`backend/tests/test_workflow.py`. The "guard" column is the rule that prevents the step from being
skipped — that is what makes this a coordinated platform rather than a form collection.

| # | Step | Actor | Endpoint / screen | Guard |
|---|---|---|---|---|
| 1 | Register as sender or transporter | Public | `POST /api/auth/register` | `account_type` constrained to `sender|transporter`; admin is not in the enum |
| 2 | Veirfy email / sign in | User | `POST /api/auth/login` | JWT carries `sub` + `role`; suspended accounts refused |
| 3 | Register a vehicle | Transporter | `/transporter/vehicles/add` → `POST /api/vehicles` | starts `verified=false` |
| 4 | Verify vehicle documents | Admin | `/admin/vehicles` → `POST /api/vehicles/{id}/verify` | unverified vehicles are never offered as capacity |
| 5 | Publish capacity block | Transporter | `/transporter/capacity` → `POST /api/capacity` | window and reserve price validated |
| 6 | Create a consignment | Sender | `/sender/create` → `POST /api/shipments` | lands in `pending_admin_review`; drafts allowed |
| 7 | Voice draft (optional) | Sender | `/sender/voice` → `POST /api/voice/parse` | `requires_confirmation: true` — never auto-submits |
| 8 | Admin review | Admin | `/admin/shipments` → `POST /api/admin/shipments/{id}/review` | approve → `planning`; reject/request-info keeps it out of planning |
| 9 | Auto-pool compatible loads | Admin | `/admin/pools` → `POST /api/admin/pools/auto` | AgroCompat hard blockers prevent the pool entirely |
| 10 | Approve / break / split pool | Admin | `POST /api/admin/pools/{id}/action` | writes `shipment_pools.status` + audit |
| 11 | Match published capacity | Admin | `/admin/capacity` → `POST /api/admin/capacity/match` | only `published` blocks; verified transporters ranked higher |
| 12 | Generate route plan | Admin | `/admin/planning` → `POST /api/admin/plans/generate` | OR-Tools CVRPTW with time windows; greedy fallback |
| 13 | Two-echelon decision | Admin | same endpoint | only safety-verified hubs qualify, else direct |
| 14 | Dispatch decision | Admin | `/admin/dispatch` → `POST /api/admin/dispatch/decide` | GO/WAIT/SPLIT/CANCEL with ₹ benefit vs ₹ delay cost stored |
| 15 | Compute fair allocation | Admin | `/admin/allocations` → `POST /api/admin/allocations/compute` | Shapley shares + participation check (nobody pays more than solo) |
| 16 | Sender approves its share | Sender | `/sender/costs` → `POST /api/shipments/{id}/approve-allocation` | `cost_allocations.approval` per shipment |
| 17 | Create the assignment | Admin | `POST /api/admin/assignments` | status `proposed` |
| 18 | Transporter accepts work | Transporter | `/transporter/assignments` → `POST /api/assignments/{id}/respond` | decline is allowed; nothing is forced |
| 19 | Admin confirms assignment | Admin | `POST /api/admin/assignments/{id}/confirm` | **409 until both consents exist** |
| 20 | Readiness check-ins | Sender / Admin | `POST /api/shipments/{id}/readiness`, `GET /api/readysync/board` | T-60 / T-45; unready load moves to the next wave |
| 21 | Execute trip | Transporter | `/transporter/trips` → `POST /api/trips/{id}/action` | `start` → loading, `confirm_loading` → in_transit, `confirm_delivery` → delivered |
| 22 | Verify delivery | Admin | `/admin/deliveries` → `POST /api/admin/deliveries` | POD + external ack + shortage/damage → `admin_verified`, only then `delivered` |

## Disruption path (inside the same workflow)

```
disruption reported → ShadowFleet-Heal proposes (freeze unaffected, repair affected)
                    → admin approval  → new assignment → back into step 19
```

`POST /api/recovery/heal` returns `feasible | partial | infeasible`. When it is infeasible it says
so; the platform does not invent a vehicle.

## Shipment status machine

```
draft
  └→ pending_admin_review
        ├→ planning ──→ matched ──→ awaiting_sender_approval ──→ confirmed
        │                                                            ├→ ready_for_pickup
        │                                                            ├→ in_transit
        │                                                            ├→ at_transfer_hub
        │                                                            ├→ out_for_delivery
        │                                                            └→ delivered
        └→ cancelled (any pre-dispatch state)
```

Twelve states, and no endpoint can jump from `matched` to `delivered`: the trip actions are the only
writers of the movement states, and delivery requires an admin-verified `delivery_confirmations` row.

## Consent matrix

| Transition | Needs | Enforced by |
|---|---|---|
| `awaiting_sender_approval → confirmed` | sender approves allocation | `cost_allocations.approval = 'approved'` |
| assignment `proposed → confirmed` | transporter accepted **and** sender approved **and** admin confirmed | 409 in `confirm_assignment` |
| `out_for_delivery → delivered` | admin-verified delivery record | `delivery_confirmations.status = 'admin_verified'` |
| any reassignment | admin approval of a recovery plan | `recovery_plans.status = 'approved'` |
