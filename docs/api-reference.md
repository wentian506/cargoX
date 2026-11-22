# CARGOX — API reference

Base URL: `https://<backend>/api` (the frontend calls it through `/api/backend/*`).
Auth: `Authorization: Bearer <JWT>`. Roles: `sender`, `transporter`, `admin`.

Errors are uniform: `{"detail": "..."}` with 400/401/403/404/409/422/429/500.

Pagination: list endpoints accept `page` (1-based) and `page_size`; responses return
`{items, total?, page?, page_size?}`.

---

## Auth — `/api/auth`
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/register` | public | `account_type` must be `sender` or `transporter`; admin/receiver rejected |
| POST | `/login` | public | returns `{token, user}` |
| GET | `/me` | any | current profile |
| PATCH | `/me` | any | name, mobile, state, district, language (role immutable) |
| POST | `/forgot-password` | public | always 200, never reveals whether the address exists |
| POST | `/reset-password` | public | consumes single-use token |
| POST | `/logout` | any | audit entry |
| GET | `/config` | public | roles, modules, feature flags |

## Shipments — `/api/shipments`
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/shipments` | sender | draft or submit → `pending_admin_review` |
| GET | `/shipments` | sender | filters: `status`, `commodity`, `q`, paging |
| GET | `/shipments/{id}` | sender/admin | 404 for other senders |
| PATCH | `/shipments/{id}` | sender | only while draft/pending |
| POST | `/shipments/{id}/cancel` | sender | pre-dispatch only |
| POST | `/shipments/{id}/approve-allocation` | sender | consent for the fair-share proposal |
| POST | `/shipments/{id}/readiness` | sender | `{ready_check: ready|delayed}` |
| GET | `/shipments/{id}/tracking` | sender/admin | 11 checkpoint steps, `live_gps: false` |
| POST | `/shipments/{id}/destinations/recommend` | sender | ValueClock ranking |
| GET | `/shipments/{id}/cost` | sender | freight estimate + saving |

## Fleet & capacity
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/vehicles` | transporter/admin | `status`, paging |
| POST | `/vehicles` | transporter | starts unverified |
| PATCH | `/vehicles/{id}` | transporter | owner only |
| POST | `/vehicles/{id}/verify` | admin | `{verified: bool}` |
| GET/POST | `/capacity` | transporter | publish capacity blocks |
| POST | `/capacity/{id}/withdraw` | transporter | |
| GET | `/transporters` | admin | fleet + assignment counts |
| POST | `/transporters/{id}/verify` | admin | |
| GET | `/transporters/me/performance` | transporter | on-time, utilisation, economics |

## Transporter operations
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/assignments/available` | transporter | released offers |
| POST | `/assignments/{id}/respond` | transporter | `{response: accept|decline}` |
| GET | `/trips/mine` | transporter | trips + shipment detail |
| POST | `/trips/{id}/action` | transporter | `start`, `confirm_loading`, `at_hub`, `confirm_delivery`, `report_delay` |
| GET | `/backhaul/opportunities` | transporter | CrossFlow offers |
| POST | `/backhaul/offers` | transporter | `{offer_id, action: accept|reject}` |

## Admin — `/api/admin` (router-level admin guard)
| Method | Path | Notes |
|---|---|---|
| GET | `/overview` | counts, volume, savings, coverage, alerts, recent shipments |
| GET | `/tower` | villages, hubs, mandis, road edges, vehicles, shipments, trips, disruptions |
| GET | `/senders` · `POST /users/{id}/status` | sender register; suspend/reactivate/verify |
| GET | `/shipments` · `POST /shipments/{id}/review` | review queue (`approve|reject|request_info`) |
| POST | `/pools/auto` · `GET /pools` · `POST /pools/{id}/action` | pooling (`approve|break|split`) |
| POST/GET | `/capacity/match` | match published capacity to demand (`pool_id` optional) |
| GET | `/capacity/match/view` | standing match table for the screen |
| POST | `/plans/generate` | OR-Tools CVRPTW + two-echelon + hub choice |
| POST | `/dispatch/decide` · `POST /dispatch/{id}/approve` | DispatchSense decision + approval |
| POST | `/allocations/compute` · `GET /allocations` | ShapleySplit + participation check |
| POST/GET | `/assignments` · `POST /assignments/{id}/confirm` · `/cancel` | 409 until both consents |
| POST/GET | `/deliveries` | POD + external ack + shortage/damage → `admin_verified` |
| GET | `/trips` | trip monitoring |
| GET | `/audit` | append-only trail |
| GET | `/system` | dialect, table counts, roles, feature flags |
| GET | `/agrocompat/matrix` | admin-namespaced compatibility matrix |

## Intelligence — `/api/*` (`any_role` read, admin write)
| Method | Path | Notes |
|---|---|---|
| GET | `/forecasts/harvestpulse?horizon_days=7\|14\|21\|35` | p10/p50/p90 + naive baseline |
| GET | `/forecasts/clusters` | cluster list |
| POST | `/dispatch/preview` | what-if GO/WAIT without persisting |
| GET | `/dispatch/history` | stored decisions with reasons |
| GET | `/readysync/board` | T-60/T-45 wave verdicts |
| GET | `/hubs` | hubs + constrained k-median selection |
| GET | `/routes/road-access?vehicle_class=&monsoon=` | MonsoonPass gate |
| POST | `/routes/generate` | single-echelon vs two-echelon plan |
| POST | `/valueclock/compare` · `GET /valueclock/retention` | net realisation; retention curve |
| POST | `/agrocompat/check` · `POST|GET /agrocompat/matrix` | compatibility rules |
| GET | `/recovery/scenarios` · `POST /recovery/heal` · `POST /recovery/{id}/approve` | ShadowFleet-Heal |
| GET | `/backhaul/summary` | admin view of return-load decisions |
| GET | `/monsoonpass/status` | warnings by vehicle class |
| POST | `/voice/parse` | transcript → structured draft + questions |

## Simulations — `/api/simulations`
| Method | Path | Notes |
|---|---|---|
| GET | `/scenarios` | 3 scenarios with cluster/vehicle/consignment counts |
| POST | `/run` | `{scenario, seed, params}` → 4 policies, identical scenario and seed |
| GET | `/runs` · `/{id}` · `/{id}/events` | history and replayable event log |

## Platform
| Method | Path | Notes |
|---|---|---|
| GET | `/analytics/sender` · `/analytics/transporter` · `/analytics/admin?days=` | role-scoped aggregates |
| GET | `/analytics/export?kind=shipments\|allocations\|trips` | CSV |
| GET | `/notifications` · `POST /notifications/{id}/read` · `POST /notifications/read-all` | |
| GET/POST | `/support/tickets` · `POST /support/tickets/{id}/resolve` | sender/transporter raise, admin resolves |
| GET | `/corridor` | villages, mandis, hubs for maps |
| GET | `/health` | liveness + dialect + role model |

## Rate limits & headers
* 20 req/min per IP on `/api/auth/*`, 600 req/min elsewhere; exceeding returns `429` with
  `Retry-After`.
* Every response carries `X-RateLimit-Limit`, `X-RateLimit-Window` and `X-CARGOX-Roles:
  sender,transporter,admin`.
