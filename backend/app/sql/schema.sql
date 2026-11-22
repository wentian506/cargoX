-- ===========================================================================
--  CARGOX core schema  (single source of truth)
--  Placeholders expanded by app/schema.py:
--    {{GEO:lat_col:lng_col}}  -> PostGIS generated geometry column (pg only)
--  Timestamps are ISO-8601 text so the identical DDL runs on SQLite and
--  Postgres.  RLS policies live in ../../supabase/migrations/.
--  NO receiver / FPO account tables exist by design.
-- ===========================================================================

create table if not exists organisations (
  id text primary key,
  name text not null,
  kind text not null default 'business',      -- business grouping only, not a login role
  created_at text not null
);

create table if not exists profiles (
  id text primary key,
  email text not null unique,
  mobile text,
  password_hash text,
  role text not null check (role in ('sender','transporter','admin')),
  full_name text not null,
  state text,
  district text,
  language text default 'en',
  org_id text references organisations(id),
  status text not null default 'active' check (status in ('active','pending','suspended')),
  verified_at text,
  last_login_at text,
  created_at text not null
);
create index if not exists ix_profiles_role on profiles(role, status);

create table if not exists sender_profiles (
  profile_id text primary key references profiles(id) on delete cascade,
  account_kind text default 'individual',    -- individual | farmer | shipper | business
  village text,
  created_at text not null
);

create table if not exists transporter_profiles (
  profile_id text primary key references profiles(id) on delete cascade,
  company_name text,
  fleet_size integer default 0,
  verification_status text not null default 'pending',  -- pending | verified | rejected
  rating real default 0,
  created_at text not null
);

create table if not exists vehicles (
  id text primary key,
  transporter_id text not null references profiles(id) on delete cascade,
  reg_no text not null unique,
  vehicle_class text not null,                -- tractor_trolley | pickup | tempo | lcv | truck
  payload_kg integer not null,
  volume_m3 real not null,
  body_type text,
  fuel text default 'diesel',
  operating_districts text,
  availability text not null default 'available',  -- available | on_trip | maintenance
  cost_per_km real not null default 18,
  verified boolean not null default false,
  verified_at text,
  created_at text not null
);
create index if not exists ix_vehicles_transporter on vehicles(transporter_id);

create table if not exists vehicle_documents (
  id text primary key,
  vehicle_id text not null references vehicles(id) on delete cascade,
  doc_type text not null,                     -- rc | insurance | permit | fitness
  doc_ref text,
  verified boolean not null default false,
  uploaded_at text not null
);

create table if not exists villages (
  id text primary key,
  name text not null,
  district text not null,
  state text not null default 'Punjab',
  lat real not null,
  lng real not null,
  cluster_id text,
  road_verified_at text,
  {{GEO:lat:lng}}
);

create table if not exists road_edges (
  id text primary key,
  from_node text not null,
  to_node text not null,
  distance_km real not null,
  surface text default 'paved',               -- paved | gravel | kutcha
  width_m real default 6,
  vehicle_class_access text default 'pickup,tempo,lcv,truck',
  monsoon_risk real default 0.15,
  verified_at text
);
create index if not exists ix_road_edges_nodes on road_edges(from_node, to_node);

create table if not exists hubs (
  id text primary key,
  name text not null,
  district text,
  hub_type text default 'candidate',          -- approved | candidate
  lat real not null,
  lng real not null,
  safety_verified boolean not null default false,
  partner_id text references organisations(id),
  operating_window text default '06:00-20:00',
  capacity_kg integer default 20000,
  {{GEO:lat:lng}}
);

create table if not exists mandis (
  id text primary key,
  name text not null,
  district text not null,
  lat real not null,
  lng real not null,
  queue_minutes integer default 45,
  {{GEO:lat:lng}}
);

create table if not exists shipments (
  id text primary key,
  code text not null unique,
  sender_id text not null references profiles(id) on delete cascade,
  commodity text not null,
  quantity_kg real not null,
  unit text default 'quintal',
  pickup_village text,
  pickup_district text,
  pickup_lat real not null,
  pickup_lng real not null,
  destination_id text references mandis(id),
  destination_name text,
  dest_lat real,
  dest_lng real,
  ready_from text,
  ready_to text,
  deadline text,
  packaging text,
  handling text,
  temperature text,
  special_instructions text,
  attachments text,                            -- JSON array (storage refs)
  status text not null default 'draft',
  pool_id text,
  coalition_id text,
  freight_estimate real default 0,
  freight_approved boolean not null default false,
  direction text default 'outbound',           -- outbound | return
  is_synthetic boolean not null default true,
  created_at text not null,
  updated_at text not null,
  {{GEO:pickup_lat:pickup_lng}}
);
create index if not exists ix_shipments_sender on shipments(sender_id, status);
create index if not exists ix_shipments_status on shipments(status);

create table if not exists shipment_items (
  id text primary key,
  shipment_id text not null references shipments(id) on delete cascade,
  commodity text not null,
  quantity_kg real not null,
  packaging text,
  handling text
);

create table if not exists shipment_destinations (
  id text primary key,
  shipment_id text not null references shipments(id) on delete cascade,
  name text not null,
  kind text default 'mandi',                   -- mandi | warehouse | buyer
  lat real, lng real,
  expected_price real,
  queue_minutes integer,
  preference_rank integer default 1
);

create table if not exists shipment_pools (
  id text primary key,
  corridor text,
  status text not null default 'proposed',     -- proposed | approved | dispatched | closed
  total_kg real default 0,
  compatible boolean default true,
  notes text,
  created_at text not null
);

create table if not exists capacity_blocks (
  id text primary key,
  transporter_id text not null references profiles(id) on delete cascade,
  vehicle_id text references vehicles(id) on delete set null,
  vehicle_class text not null,
  payload_kg integer not null,
  volume_m3 real not null,
  corridor text,
  window_from text, window_to text,
  block_size_kg integer,
  min_run_km real default 0,
  reserve_price_per_km real,
  cancellation_terms text,
  status text not null default 'published',    -- published | reserved | exercised | withdrawn
  created_at text not null
);
create index if not exists ix_capacity_status on capacity_blocks(status, vehicle_class);

create table if not exists transport_assignments (
  id text primary key,
  pool_id text references shipment_pools(id) on delete set null,
  transporter_id text not null references profiles(id) on delete cascade,
  vehicle_id text references vehicles(id) on delete set null,
  status text not null default 'proposed',
      -- proposed | transporter_accepted | transporter_rejected | sender_pending |
      -- sender_approved | confirmed | cancelled
  revenue real default 0,
  distance_km real default 0,
  ready_check text default 'pending',
  created_at text not null, updated_at text not null
);

create table if not exists trips (
  id text primary key,
  assignment_id text references transport_assignments(id) on delete cascade,
  trip_code text unique,
  status text not null default 'planned',
      -- planned | loading | in_transit | at_hub | out_for_delivery | delivered | cancelled
  vehicle_id text references vehicles(id) on delete set null,
  driver_name text,
  started_at text, finished_at text,
  delay_reported text,
  created_at text not null
);

create table if not exists trip_legs (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  leg_no integer not null,
  leg_type text not null,                      -- first_mile | line_haul | last_mile
  from_name text, to_name text,
  from_lat real, from_lng real, to_lat real, to_lng real,
  distance_km real, eta_minutes integer,
  status text default 'planned',               -- planned | active | done
  load_kg real default 0
);

create table if not exists trip_shipments (
  trip_id text not null references trips(id) on delete cascade,
  shipment_id text not null references shipments(id) on delete cascade,
  primary key (trip_id, shipment_id)
);

create table if not exists shipment_events (
  id text primary key,
  entity_type text not null default 'shipment',
  entity_id text not null,
  event_type text not null,
  actor_id text,
  payload text,
  seed_id text,
  created_at text not null
);
create index if not exists ix_events_entity on shipment_events(entity_id, created_at);

create table if not exists delivery_confirmations (
  id text primary key,
  shipment_id text not null references shipments(id) on delete cascade,
  trip_id text references trips(id) on delete set null,
  delivered_qty_kg real,
  pod_ref text,
  external_ack_ref text,                       -- mandi/buyer acknowledgement handled by Admin
  shortage_note text,
  damage_note text,
  recorded_by text,
  verified_by text,
  status text default 'recorded',              -- recorded | admin_verified | closed
  created_at text not null
);

create table if not exists quality_inspections (
  id text primary key,
  shipment_id text not null references shipments(id) on delete cascade,
  inspection_type text default 'arrival',
  retention_factor real,
  moisture text, notes text,
  inspector text, created_at text not null
);

create table if not exists coalitions (
  id text primary key,
  pool_id text references shipment_pools(id) on delete set null,
  coalition_cost real,
  solo_cost_total real,
  method text default 'shapley_exact',
  participation_ok boolean default true,
  created_at text not null
);

create table if not exists cost_allocations (
  id text primary key,
  coalition_id text not null references coalitions(id) on delete cascade,
  shipment_id text not null references shipments(id) on delete cascade,
  standalone_cost real not null,
  allocated_share real not null,
  detour_km real default 0,
  saving real default 0,
  participation_check boolean default true,
  approval text default 'pending',             -- pending | approved | rejected
  method text default 'shapley',
  created_at text not null
);
create index if not exists ix_alloc_shipment on cost_allocations(shipment_id);

create table if not exists dispatch_decisions (
  id text primary key,
  pool_id text references shipment_pools(id) on delete cascade,
  decision text not null,                      -- GO | WAIT | SPLIT | CANCEL
  expected_wait_benefit real default 0,
  delay_cost real default 0,
  urgency_score real default 0,
  reason text,
  next_checkpoint text,
  approved_by text,
  created_at text not null
);

create table if not exists disruption_events (
  id text primary key,
  trip_id text references trips(id) on delete cascade,
  event_type text not null,                    -- breakdown | cancellation | weather | hub_closed
  description text,
  reported_by text,
  detected_at text not null,
  severity text default 'medium'
);

create table if not exists recovery_plans (
  id text primary key,
  disruption_id text not null references disruption_events(id) on delete cascade,
  status text not null default 'proposed',     -- proposed | approved | rejected | infeasible
  strategy text,
  extra_cost real default 0,
  added_delay_min text,
  affected_count integer default 0,
  frozen_count integer default 0,
  solve_ms integer default 0,
  alternatives text,
  approved_by text,
  created_at text not null
);

create table if not exists return_load_offers (
  id text primary key,
  trip_id text references trips(id) on delete cascade,
  transporter_id text not null references profiles(id) on delete cascade,
  cargo_type text not null,
  from_name text, to_name text,
  extra_distance_km real, revenue real,
  time_hours real,
  compatible boolean default true,
  status text default 'offered',               -- offered | accepted | rejected
  created_at text not null
);

create table if not exists harvest_forecasts (
  id text primary key,
  cluster_id text not null,
  crop_id text not null,
  forecast_date text not null,
  horizon_days integer default 7,
  p10_kg real, p50_kg real, p90_kg real,
  vehicle_class_demand text,
  method text default 'rule_phenology_v1',
  confidence real default 0.6,
  is_synthetic boolean default true,
  created_at text not null
);

create table if not exists market_observations (
  id text primary key,
  commodity_id text not null,
  mandi_id text references mandis(id) on delete cascade,
  obs_date text not null,
  price_min real, price_mode real, price_max real,
  arrivals_kg real,
  source text default 'synthetic',
  created_at text not null
);

create table if not exists mandi_queues (
  id text primary key,
  mandi_id text not null references mandis(id) on delete cascade,
  observed_at text not null,
  queue_minutes integer,
  source text default 'user_entered',          -- user_entered | simulated
  created_at text not null
);

create table if not exists notifications (
  id text primary key,
  profile_id text not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  kind text default 'info',                    -- info | action | warning | success
  link text,
  read_at text,
  created_at text not null
);
create index if not exists ix_notifications_profile on notifications(profile_id, read_at);

create table if not exists simulation_runs (
  id text primary key,
  scenario_name text not null,
  seed integer not null,
  policy_config text,
  metrics text,
  created_by text,
  created_at text not null
);

create table if not exists simulation_events (
  id text primary key,
  run_id text not null references simulation_runs(id) on delete cascade,
  seq integer not null,
  sim_time text,
  entity_type text, entity_id text,
  event_type text not null,
  payload text
);
create index if not exists ix_sim_events_run on simulation_events(run_id, seq);

create table if not exists support_tickets (
  id text primary key,
  profile_id text not null references profiles(id) on delete cascade,
  subject text not null,
  body text,
  role text,
  status text not null default 'open',         -- open | in_progress | resolved
  resolution text,
  created_at text not null,
  updated_at text not null
);

create table if not exists audit_logs (
  id text primary key,
  actor_id text,
  actor_role text,
  action text not null,
  entity_type text, entity_id text,
  before_state text, after_state text,
  ip text,
  created_at text not null
);
create index if not exists ix_audit_entity on audit_logs(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- v1.1 — all-India geography, custom cargo, live tracking
-- ---------------------------------------------------------------------------
create table if not exists gps_pings (
  id text primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  lat real not null,
  lng real not null,
  heading real,
  speed_kmh real,
  odometer_km real,
  place_label text,
  source text default 'device',                -- device | manual | import
  actor_id text,
  recorded_at text not null,
  {{GEO:lat:lng}}
);
create index if not exists ix_gps_trip on gps_pings(trip_id, recorded_at);

create table if not exists serviceable_areas (
  id text primary key,
  state text not null,
  district text not null,
  active boolean not null default true,
  network_note text,
  created_at text not null
);
create unique index if not exists ux_area on serviceable_areas(state, district);

create table if not exists tracking_subscriptions (
  id text primary key,
  phone text not null,
  channel text not null default 'sms',          -- sms | whatsapp (delivery needs a provider key)
  shipment_id uuid references shipments(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  created_at text not null
);

create table if not exists saved_places (
  id text primary key,
  profile_id text not null references profiles(id) on delete cascade,
  label text not null,
  name text not null,
  state text,
  district text,
  lat real, lng real,
  kind text default 'village',                  -- village | hub | mandi | buyer
  created_at text not null
);
create index if not exists ix_saved_profile on saved_places(profile_id);

-- free-text sender requirement (multi-item cargo + "what else is in the load")
alter table shipments add column requirements text;
alter table profiles add column auth_provider text;
alter table profiles add column avatar_url text;
alter table profiles add column google_sub text;
alter table shipments add column pickup_state text;
alter table shipments add column drop_state text;
alter table shipments add column drop_district text;

-- ---------------------------------------------------------------------------
-- incremental columns (applied one-by-one; failures are ignored when present)
-- ---------------------------------------------------------------------------
alter table transport_assignments add column accepted_at text;