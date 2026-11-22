-- ============================================================================
-- 0001_core_schema.sql — CARGOX logical schema (PostgreSQL 15 + PostGIS)
--
-- This is the production-target schema. The FastAPI backend also runs on
-- SQLite for offline development; `backend/app/sql/schema.sql` is the
-- dialect-neutral twin of this file and must stay in sync with it.
--
-- 32 core tables + 4 supporting catalog tables. UUID primary keys, explicit
-- foreign keys, CHECK constraints on enumerations, and indexes on every
-- column used by a filter or join in the API layer.
--
-- Reference: docs/data-model.md
-- ============================================================================

create extension if not exists "postgis";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. organisations — external partners (FPO yards, mandi boards, cold stores).
--    NOT a platform account type. No login, no role, no dashboard.
-- ---------------------------------------------------------------------------
create table if not exists organisations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kind           text not null check (kind in ('hub_partner','mandi_board','warehouse','logistics_partner')),
  district       text,
  state          text default 'Punjab',
  contact_email  text,
  contact_mobile text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. profiles — the single account table for the three CARGOX roles.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,                      -- supabase auth.users(id)
  email         citext not null unique,
  mobile        text,
  full_name     text not null,
  role          text not null check (role in ('sender','transporter','admin')),
  status        text not null default 'active' check (status in ('active','suspended','deleted')),
  language      text not null default 'en' check (language in ('en','hi','pa')),
  state         text,
  district      text,
  org_id        uuid references organisations(id) on delete set null,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists profiles_role_idx on profiles(role);
create index if not exists profiles_status_idx on profiles(status);

-- Admin accounts are provisioned, never self-registered. Enforced by the
-- registration function below rather than by a constraint, because a
-- constraint on role would also block the seed/migration path.
create or replace function cargox_block_public_admin()
returns trigger language plpgsql as $$
begin
  if new.role = 'admin' and coalesce(current_setting('cargox.allow_admin', true), 'off') <> 'on' then
    raise exception 'Admin accounts are provisioned by invitation only';
  end if;
  return new;
end $$;
drop trigger if exists profiles_no_public_admin on profiles;
create trigger profiles_no_public_admin before insert on profiles
  for each row execute function cargox_block_public_admin();

-- ---------------------------------------------------------------------------
-- 3–4. role detail tables
-- ---------------------------------------------------------------------------
create table if not exists sender_profiles (
  profile_id   uuid primary key references profiles(id) on delete cascade,
  account_kind text not null default 'individual' check (account_kind in ('individual','farmer','trader','cooperative')),
  village      text,
  default_pickup geography(point, 4326),
  created_at   timestamptz not null default now()
);

create table if not exists transporter_profiles (
  profile_id          uuid primary key references profiles(id) on delete cascade,
  company_name        text,
  fleet_size          int not null default 0 check (fleet_size >= 0),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  rating              numeric(3,2) check (rating >= 0 and rating <= 5),
  operating_districts text[],
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. vehicles — must be verified by an admin before assignment
-- ---------------------------------------------------------------------------
create table if not exists vehicles (
  id             uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references profiles(id) on delete cascade,
  reg_no         text not null unique,
  vehicle_class  text not null check (vehicle_class in ('pickup','tractor_trolley','tempo','lcv','truck')),
  payload_kg     numeric(10,2) not null check (payload_kg > 0),
  volume_m3      numeric(8,2),
  body_type      text check (body_type in ('open','closed','reefer','flatbed','tanker')),
  fuel           text check (fuel in ('diesel','cng','electric')),
  operating_districts text[],
  availability   text not null default 'available' check (availability in ('available','assigned','maintenance','inactive')),
  cost_per_km    numeric(8,2) not null check (cost_per_km >= 0),
  verified       boolean not null default false,
  verified_by    uuid references profiles(id) on delete set null,
  verified_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists vehicles_transporter_idx on vehicles(transporter_id);
create index if not exists vehicles_verified_idx on vehicles(verified);

-- 6. vehicle_documents — Storage references, verified per document
create table if not exists vehicle_documents (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  kind        text not null check (kind in ('rc','insurance','permit','fitness','puc','other')),
  storage_ref text not null,
  verified    boolean not null default false,
  verified_at timestamptz,
  expires_on  date,
  created_at  timestamptz not null default now()
);
create index if not exists vehicle_documents_vehicle_idx on vehicle_documents(vehicle_id);

-- ---------------------------------------------------------------------------
-- 7–10. corridor geography
-- ---------------------------------------------------------------------------
create table if not exists villages (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,
  name       text not null,
  district   text not null,
  cluster_id text,
  location   geography(point, 4326) not null,
  population int,
  created_at timestamptz not null default now()
);
create index if not exists villages_location_gix on villages using gist(location);
create index if not exists villages_cluster_idx on villages(cluster_id);

create table if not exists road_edges (
  id            uuid primary key default gen_random_uuid(),
  from_node     uuid not null,
  to_node       uuid not null,
  surface       text not null check (surface in ('pucca','kutcha','mixed','highway')),
  width_m       numeric(5,2),
  length_km     numeric(8,2) not null check (length_km > 0),
  geometry      geography(linestring, 4326) not null,
  monsoon_risk  numeric(3,2) not null default 0 check (monsoon_risk between 0 and 1),
  created_at    timestamptz not null default now()
);
create index if not exists road_edges_surface_idx on road_edges(surface);
create index if not exists road_edges_geom_gix on road_edges using gist(geometry);

create table if not exists hubs (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  hub_type          text not null check (hub_type in ('approved','candidate','rejected')),
  district          text not null,
  location          geography(point, 4326) not null,
  partner_id        uuid references organisations(id) on delete set null,
  operating_window  text,
  capacity_kg       numeric(10,2),
  safety_verified   boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists hubs_safety_idx on hubs(safety_verified);

create table if not exists mandis (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  district       text not null,
  location       geography(point, 4326) not null,
  opening_time   time,
  closing_time   time,
  queue_minutes  int default 0 check (queue_minutes >= 0),
  created_at     timestamptz not null default now()
);
create index if not exists mandis_location_gix on mandis using gist(location);

-- ---------------------------------------------------------------------------
-- 11–14. shipments and pooling
-- ---------------------------------------------------------------------------
create table if not exists shipments (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  sender_id         uuid not null references profiles(id) on delete restrict,
  commodity         text not null,
  quantity_kg       numeric(10,2) not null check (quantity_kg > 0),
  packaging         text,
  handling          text,
  temperature       text check (temperature in ('ambient','cool','frozen')),
  pickup_village_id uuid references villages(id) on delete set null,
  pickup_point      geography(point, 4326) not null,
  destination_id    uuid references mandis(id) on delete set null,
  destination_name  text not null,
  destination_point geography(point, 4326) not null,
  ready_from        timestamptz not null,
  ready_to          timestamptz not null,
  deadline          timestamptz,
  special_instructions text,
  status            text not null default 'draft' check (status in (
                      'draft','pending_admin_review','planning','matched','awaiting_sender_approval',
                      'confirmed','ready_for_pickup','in_transit','at_transfer_hub','out_for_delivery',
                      'delivered','cancelled')),
  estimated_freight numeric(10,2),
  estimated_saving  numeric(10,2),
  pool_id           uuid,
  reviewed_by       uuid references profiles(id) on delete set null,
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint shipments_window_ok check (ready_to >= ready_from)
);
create index if not exists shipments_sender_idx on shipments(sender_id);
create index if not exists shipments_status_idx on shipments(status);
create index if not exists shipments_pool_idx on shipments(pool_id);
create index if not exists shipments_commodity_idx on shipments(commodity);
create index if not exists shipments_pickup_gix on shipments using gist(pickup_point);

create table if not exists shipment_items (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  description text,
  quantity_kg numeric(10,2) not null check (quantity_kg > 0),
  bags        int,
  created_at  timestamptz not null default now()
);
create index if not exists shipment_items_shipment_idx on shipment_items(shipment_id);

-- External destinations (mandi, buyer, warehouse) are records here — not roles.
create table if not exists shipment_destinations (
  id             uuid primary key default gen_random_uuid(),
  shipment_id    uuid not null references shipments(id) on delete cascade,
  kind           text not null check (kind in ('mandi','buyer','warehouse','processor')),
  name           text not null,
  contact_person text,
  contact_mobile text,
  location       geography(point, 4326),
  external_ref   text,
  created_at     timestamptz not null default now()
);
create index if not exists shipment_destinations_shipment_idx on shipment_destinations(shipment_id);

create table if not exists shipment_pools (
  id           uuid primary key default gen_random_uuid(),
  corridor     text not null,
  status       text not null default 'proposed' check (status in ('proposed','approved','broken','split','dispatched','completed')),
  total_kg     numeric(10,2) not null default 0,
  compatible   boolean not null default true,
  blockers     jsonb not null default '[]'::jsonb,
  notes        text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists shipment_pools_status_idx on shipment_pools(status);
alter table shipments add constraint shipments_pool_fk
  foreign key (pool_id) references shipment_pools(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 15–18. capacity, assignments, trips
-- ---------------------------------------------------------------------------
create table if not exists capacity_blocks (
  id                  uuid primary key default gen_random_uuid(),
  transporter_id      uuid not null references profiles(id) on delete cascade,
  vehicle_id          uuid references vehicles(id) on delete set null,
  available_from      timestamptz not null,
  available_to        timestamptz not null,
  origin_district     text,
  destination_district text,
  payload_kg          numeric(10,2) not null check (payload_kg > 0),
  vehicle_class       text,
  reserve_price_per_km numeric(8,2) not null check (reserve_price_per_km >= 0),
  status              text not null default 'published' check (status in ('published','withdrawn','expired','booked')),
  created_at          timestamptz not null default now(),
  constraint capacity_window_ok check (available_to >= available_from)
);
create index if not exists capacity_blocks_status_idx on capacity_blocks(status);

create table if not exists transport_assignments (
  id              uuid primary key default gen_random_uuid(),
  pool_id         uuid references shipment_pools(id) on delete set null,
  transporter_id  uuid not null references profiles(id) on delete restrict,
  vehicle_id      uuid not null references vehicles(id) on delete restrict,
  status          text not null default 'proposed' check (status in (
                    'proposed','accepted_by_transporter','confirmed','in_execution','completed','cancelled','declined')),
  sender_approved boolean not null default false,
  sender_approved_at timestamptz,
  admin_confirmed boolean not null default false,
  ready_check     text check (ready_check in ('ready','delayed','unknown')),
  revenue         numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists assignments_transporter_idx on transport_assignments(transporter_id);
create index if not exists assignments_status_idx on transport_assignments(status);

create table if not exists trips (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references transport_assignments(id) on delete cascade,
  trip_code      text not null unique,
  vehicle_id     uuid not null references vehicles(id) on delete restrict,
  driver_name    text,
  status         text not null default 'planned' check (status in (
                   'planned','loading','in_transit','at_hub','out_for_delivery','delivered','cancelled')),
  started_at     timestamptz,
  finished_at    timestamptz,
  distance_km    numeric(10,2),
  delay_reported text,
  created_at     timestamptz not null default now()
);
create index if not exists trips_status_idx on trips(status);
create index if not exists trips_assignment_idx on trips(assignment_id);

create table if not exists trip_legs (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references trips(id) on delete cascade,
  leg_type         text not null check (leg_type in ('first_mile','line_haul','direct','last_mile')),
  from_name        text not null,
  to_name          text not null,
  distance_km      numeric(10,2),
  transfer_window  text,
  vehicle_class    text,
  eta_at           timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists trip_legs_trip_idx on trip_legs(trip_id);

create table if not exists trip_shipments (
  trip_id     uuid not null references trips(id) on delete cascade,
  shipment_id uuid not null references shipments(id) on delete cascade,
  primary key (trip_id, shipment_id)
);

-- ---------------------------------------------------------------------------
-- 19–23. event trail, delivery, quality, money
-- ---------------------------------------------------------------------------
create table if not exists shipment_events (
  id           uuid primary key default gen_random_uuid(),
  shipment_id  uuid not null references shipments(id) on delete cascade,
  event_type   text not null,
  description  text,
  actor_id     uuid references profiles(id) on delete set null,
  actor_role   text,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists shipment_events_shipment_idx on shipment_events(shipment_id, created_at desc);

create table if not exists delivery_confirmations (
  id               uuid primary key default gen_random_uuid(),
  shipment_id      uuid not null references shipments(id) on delete cascade,
  trip_id          uuid references trips(id) on delete set null,
  delivered_qty_kg numeric(10,2) not null check (delivered_qty_kg >= 0),
  pod_ref          text,
  external_ack_ref text,
  shortage_note    text,
  damage_note      text,
  recorded_by      uuid references profiles(id) on delete set null,
  verified_by      uuid references profiles(id) on delete set null,
  status           text not null default 'pending_admin_verification'
                     check (status in ('pending_admin_verification','admin_verified','disputed')),
  created_at       timestamptz not null default now()
);
create index if not exists delivery_confirmations_shipment_idx on delivery_confirmations(shipment_id);

create table if not exists quality_inspections (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  inspected_by uuid references profiles(id) on delete set null,
  moisture_pct numeric(5,2),
  grade       text,
  deductions  numeric(10,2),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists quality_inspections_shipment_idx on quality_inspections(shipment_id);

create table if not exists coalitions (
  id          uuid primary key default gen_random_uuid(),
  pool_id     uuid not null references shipment_pools(id) on delete cascade,
  method      text not null default 'shapley_exact',
  coalition_cost numeric(10,2) not null,
  solo_cost_total numeric(10,2) not null,
  saving      numeric(10,2) not null,
  created_at  timestamptz not null default now()
);
create index if not exists coalitions_pool_idx on coalitions(pool_id);

create table if not exists cost_allocations (
  id              uuid primary key default gen_random_uuid(),
  coalition_id    uuid not null references coalitions(id) on delete cascade,
  shipment_id     uuid not null references shipments(id) on delete cascade,
  standalone_cost numeric(10,2) not null,
  allocated_share numeric(10,2) not null check (allocated_share >= 0),
  detour_km       numeric(8,2),
  saving          numeric(10,2) not null,
  participation_check boolean not null default true,
  approval        text not null default 'pending' check (approval in ('pending','approved','rejected')),
  method          text not null default 'shapley_exact',
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  -- a sender never pays more than going alone
  constraint allocation_participation check (allocated_share <= standalone_cost + 0.01)
);
create index if not exists cost_allocations_coalition_idx on cost_allocations(coalition_id);
create index if not exists cost_allocations_shipment_idx on cost_allocations(shipment_id);

-- ---------------------------------------------------------------------------
-- 24–26. decisions and disruption
-- ---------------------------------------------------------------------------
create table if not exists dispatch_decisions (
  id                    uuid primary key default gen_random_uuid(),
  pool_id               uuid references shipment_pools(id) on delete set null,
  decision              text not null check (decision in ('GO','WAIT','SPLIT','CANCEL')),
  expected_wait_benefit numeric(10,2),
  delay_cost            numeric(10,2),
  urgency_score         numeric(4,3),
  reason                text not null,
  approved_by           uuid references profiles(id) on delete set null,
  approved_at           timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists dispatch_decisions_pool_idx on dispatch_decisions(pool_id);

create table if not exists disruption_events (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid references trips(id) on delete set null,
  event_type   text not null check (event_type in ('breakdown','weather','road_closure','delay','cancellation','other')),
  description  text not null,
  severity     text not null default 'medium' check (severity in ('low','medium','high')),
  reported_by  text,
  detected_at  timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists disruption_events_trip_idx on disruption_events(trip_id);

create table if not exists recovery_plans (
  id               uuid primary key default gen_random_uuid(),
  disruption_id    uuid references disruption_events(id) on delete set null,
  trip_id          uuid references trips(id) on delete set null,
  status           text not null check (status in ('feasible','partial','infeasible','approved','rejected')),
  assignments      jsonb not null default '[]'::jsonb,
  frozen           jsonb not null default '[]'::jsonb,
  extra_cost       numeric(10,2),
  explanation      text,
  approved_by      uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists recovery_plans_trip_idx on recovery_plans(trip_id);

create table if not exists return_load_offers (
  id               uuid primary key default gen_random_uuid(),
  transporter_id   uuid not null references profiles(id) on delete cascade,
  vehicle_id       uuid references vehicles(id) on delete set null,
  trip_id          uuid references trips(id) on delete set null,
  from_name        text not null,
  to_name          text not null,
  cargo_type       text,
  extra_distance_km numeric(8,2),
  revenue          numeric(10,2),
  time_hours       numeric(6,2),
  status           text not null default 'offered' check (status in ('offered','accepted','rejected','expired')),
  created_at       timestamptz not null default now()
);
create index if not exists return_load_offers_transporter_idx on return_load_offers(transporter_id);

-- ---------------------------------------------------------------------------
-- 27–30. forecast / market / notifications / simulation
-- ---------------------------------------------------------------------------
create table if not exists harvest_forecasts (
  id           uuid primary key default gen_random_uuid(),
  cluster_id   text not null,
  commodity    text not null,
  horizon_days int not null check (horizon_days between 1 and 60),
  p10_kg       numeric(12,2) not null,
  p50_kg       numeric(12,2) not null,
  p90_kg       numeric(12,2) not null,
  baseline_kg  numeric(12,2),
  method       text not null,
  issued_at    timestamptz not null default now(),
  constraint forecast_band_ok check (p10_kg <= p50_kg and p50_kg <= p90_kg)
);
create index if not exists harvest_forecasts_cluster_idx on harvest_forecasts(cluster_id, issued_at desc);

create table if not exists market_observations (
  id           uuid primary key default gen_random_uuid(),
  commodity_id text not null,
  mandi_id     uuid references mandis(id) on delete cascade,
  obs_date     date not null,
  price_mode   numeric(10,2) not null,
  arrivals_kg  numeric(12,2),
  synthetic    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists market_observations_lookup_idx on market_observations(commodity_id, mandi_id, obs_date desc);

create table if not exists mandi_queues (
  id            uuid primary key default gen_random_uuid(),
  mandi_id      uuid not null references mandis(id) on delete cascade,
  queue_minutes int not null check (queue_minutes >= 0),
  observed_at   timestamptz not null default now()
);
create index if not exists mandi_queues_mandi_idx on mandi_queues(mandi_id, observed_at desc);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title      text not null,
  body       text,
  kind       text not null default 'info' check (kind in ('info','success','warning','action')),
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_idx on notifications(profile_id, created_at desc);

create table if not exists simulation_runs (
  id            uuid primary key default gen_random_uuid(),
  scenario_name text not null,
  seed          bigint not null,
  policy_config jsonb not null,
  metrics       jsonb not null,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists simulation_runs_created_idx on simulation_runs(created_at desc);

create table if not exists simulation_events (
  id      bigserial primary key,
  run_id  uuid not null references simulation_runs(id) on delete cascade,
  seq     int not null,
  kind    text not null,
  payload jsonb not null default '{}'::jsonb,
  unique (run_id, seq)
);

-- ---------------------------------------------------------------------------
-- 33–34. support and audit
-- ---------------------------------------------------------------------------
create table if not exists support_tickets (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role       text not null,
  subject    text not null,
  body       text not null,
  status     text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on support_tickets(status);

create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references profiles(id) on delete set null,
  actor_role   text,
  action       text not null,
  entity_type  text,
  entity_id    text,
  before_state jsonb,
  after_state  jsonb,
  ip           inet,
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on audit_logs(actor_id);
create index if not exists audit_logs_entity_idx on audit_logs(entity_type, entity_id);

-- audit_logs is append-only
create or replace function cargox_audit_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
drop trigger if exists audit_logs_no_update on audit_logs;
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function cargox_audit_append_only();
