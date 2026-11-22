# CARGOX — comparison against GRAMFLOW AI – FORWARD

The guide for this problem brief sets CARGOX against a reference capability set. This table maps
every claimed capability to what is actually implemented in this repository, so the comparison can be
checked rather than believed.

Legend: ✅ implemented and exercised by the workflow suite · 🟡 implemented with a stated limit ·
⚪ deliberately absent (out of MVP scope, labelled in the product)

| # | Capability | CARGOX | Where |
|---|---|---|---|
| 1 | Three-role model (sender / transporter / admin) | ✅ | `supabase/migrations/0001`, `app/api/auth.py`, three `(role)` route groups |
| 2 | Public registration for senders & transporters | ✅ | `/register` |
| 3 | Admin provisioning by invitation only | ✅ | `0004_provision_admin.sql` + `profiles_no_public_admin` trigger |
| 4 | No receiver / FPO roles | ✅ | enum + `/api/config` reports them as `NOT A CARGOX ROLE` |
| 5 | Shipment creation with full field set + drafts | ✅ | `/sender/create` |
| 6 | Voice entry in Punjabi/Hindi/English | 🟡 grammar extraction over a transcript; ASR pluggable | `POST /api/voice/parse` |
| 7 | Admin review gate before planning | ✅ | `POST /admin/shipments/{id}/review` |
| 8 | Commodity compatibility before pooling | ✅ | AgroCompat, 28 rules |
| 9 | Pooling with hard blockers first | ✅ | `POST /admin/pools/auto` |
| 10 | Capacity exchange with published reserve prices | ✅ | `capacity_blocks`, `/transporter/capacity` |
| 11 | Vehicle verification gating assignment | ✅ | `POST /vehicles/{id}/verify` |
| 12 | OR-Tools route planning with time windows | ✅ | `planning.plan_routes` |
| 13 | Greedy fallback when OR-Tools is absent | ✅ | `greedy_routes` |
| 14 | Two-echelon relay + hub selection (k-median) | ✅ | `build_two_echelon`, `select_hubs` |
| 15 | GO / WAIT / SPLIT / CANCEL with rupee trade-off | ✅ | DispatchSense |
| 16 | Fair cost split (Shapley) with participation check | ✅ | ShapleySplit |
| 17 | Sender approves its own freight share | ✅ | `approve-allocation` |
| 18 | Transporter accepts/declines work | ✅ | `POST /assignments/{id}/respond` |
| 19 | Confirmation blocked until both consents | ✅ | 409 path, asserted |
| 20 | Readiness check-ins at T-60 / T-45 | ✅ | ReadySync |
| 21 | Disruption recovery with frozen commitments | ✅ | ShadowFleet-Heal |
| 22 | Return-load matching with an accept rule | ✅ | CrossFlow-Backhaul |
| 23 | Destination net-realisation advisor | ✅ | ValueClock |
| 24 | Harvest demand forecast with p10/p50/p90 | ✅ bands + naive baseline | HarvestPulse |
| 25 | Seasonal road access by vehicle class | 🟡 stored risk attribute, no live IMD | MonsoonPass |
| 26 | Digital twin map of the corridor | ✅ SVG twin, no tiles needed | `/admin/tower` |
| 27 | Policy simulator, 4 baselines, fixed seed | ✅ with a fair shared cost ruler | `/admin/simulator` |
| 28 | Role-specific analytics + CSV export | ✅ CSV; PDF via browser print | `/sender/analytics`, `/admin/analytics` |
| 29 | 30+ normalised tables with RLS | ✅ 36 tables | `0001`, `0002` |
| 30 | JWT auth, role guards, rate limiting, audit trail | ✅ | `core/security.py`, `main.py`, `audit_logs` |
| 31 | Delivery verification by admin (POD, shortage, damage) | ✅ | `POST /admin/deliveries` |
| 32 | Notifications per role | ✅ | `notifications` table + bell + panel |
| 33 | Support tickets | ✅ | `/api/support/tickets` |
| 34 | Honest labelling of synthetic data | ✅ | `SyntheticNote` on every modelled screen, `synthetic` flags in payloads |
| 35 | Live GPS tracking | ⚪ checkpoints only, `live_gps: false` in the API | — |
| 36 | Payments / credit / insurance | ⚪ fictional ledger only | — |
| 37 | Live mandi price feed | ⚪ synthetic observations, flagged | — |
| 38 | Commission / take rate | ⚪ none charged anywhere | — |

## Where CARGOX deliberately differs from a "maximal" pitch

1. **No fourth role.** A receiver account would be the fastest way to look complete and the fastest
   way to break the coordination story: the admin verifies delivery and the mandi is an external
   destination. Adding a receiver role would mean an unverified party could mutate shipment state.
2. **No invented statistics.** The landing page, the guides and every dashboard avoid "X% savings
   achieved" claims. The only numbers shown are either (a) recorded platform actions or (b) clearly
   labelled model outputs with the seed that produced them.
3. **The weak baseline is not the headline.** The simulator shows the −76.5% gap versus individual
   booking *and* the −17.7% gap versus the best simple baseline, because the first number alone would
   misrepresent what coordination buys.
4. **Recovery can say "infeasible".** A platform that always produces a rescue plan is a platform
   that fabricates capacity.
5. **MonsoonPass refuses to guess.** Without a weather feed it uses stored risk and asks for physical
   verification instead of pretending to know today's road state.
