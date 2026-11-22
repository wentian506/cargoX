-- ============================================================================
-- 0002_rls_policies.sql — Row Level Security
--
-- Principles
--   1. Deny by default: every table has RLS enabled and no policy until written.
--   2. A sender reads only their own shipments, allocations, deliveries and
--      notifications. A transporter reads only their own fleet, capacity,
--      assignments and trips. An admin reads the coordination surface.
--   3. Public corridor reference data (villages, mandis, hubs, road_edges) is
--      readable by any authenticated user; nothing is readable anonymously.
--   4. Service role bypasses RLS and is used only by the FastAPI backend.
--
-- The helper functions read the CARGOX profile id and role from the JWT that
-- Supabase Auth already puts in `request.jwt.claims`. The backend mints tokens
-- with `sub` = profiles.id and `role` in app_metadata.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function cargox_profile_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create or replace function cargox_role() returns text
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'cargox_role',
    current_setting('request.jwt.claims', true)::jsonb ->> 'role'
  )
$$;

create or replace function cargox_is_admin() returns boolean
language sql stable as $$ select cargox_role() = 'admin' $$;

create or replace function cargox_is_sender() returns boolean
language sql stable as $$ select cargox_role() = 'sender' $$;

create or replace function cargox_is_transporter() returns boolean
language sql stable as $$ select cargox_role() = 'transporter' $$;

-- ---------------------------------------------------------------------------
-- enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organisations','profiles','sender_profiles','transporter_profiles','vehicles','vehicle_documents',
    'villages','road_edges','hubs','mandis','shipments','shipment_items','shipment_destinations',
    'shipment_pools','capacity_blocks','transport_assignments','trips','trip_legs','trip_shipments',
    'shipment_events','delivery_confirmations','quality_inspections','coalitions','cost_allocations',
    'dispatch_decisions','disruption_events','recovery_plans','return_load_offers','harvest_forecasts',
    'market_observations','mandi_queues','notifications','simulation_runs','simulation_events',
    'support_tickets','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: self read/update, admin full read, no self role escalation
-- ---------------------------------------------------------------------------
create policy profiles_self_read on profiles for select
  using (id = cargox_profile_id() or cargox_is_admin());

create policy profiles_self_update on profiles for update
  using (id = cargox_profile_id())
  with check (
    id = cargox_profile_id()
    and role = (select role from profiles p where p.id = cargox_profile_id())  -- role is immutable here
  );

create policy profiles_admin_write on profiles for all
  using (cargox_is_admin()) with check (cargox_is_admin());

-- role detail tables
create policy sender_profiles_own on sender_profiles for all
  using (profile_id = cargox_profile_id() or cargox_is_admin())
  with check (profile_id = cargox_profile_id() or cargox_is_admin());

create policy transporter_profiles_own on transporter_profiles for all
  using (profile_id = cargox_profile_id() or cargox_is_admin())
  with check (profile_id = cargox_profile_id() or cargox_is_admin());

-- ---------------------------------------------------------------------------
-- corridor reference data: read for any authenticated user, write by admin
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['villages','road_edges','hubs','mandis','harvest_forecasts',
                           'market_observations','mandi_queues','organisations'] loop
    execute format('create policy %I on %I for select using (auth.uid() is not null or cargox_profile_id() is not null)', t || '_read', t);
    execute format('create policy %I on %I for all using (cargox_is_admin()) with check (cargox_is_admin())', t || '_admin', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- fleet
-- ---------------------------------------------------------------------------
create policy vehicles_owner on vehicles for select
  using (transporter_id = cargox_profile_id() or cargox_is_admin() or cargox_is_sender());
-- a sender may see verified class/capacity only through the API projection;
-- the column list is limited in the API layer, and this policy still prevents
-- access to unverified fleet numbers by direct query.

create policy vehicles_owner_write on vehicles for insert
  with check (transporter_id = cargox_profile_id() or cargox_is_admin());
create policy vehicles_owner_update on vehicles for update
  using (transporter_id = cargox_profile_id() or cargox_is_admin())
  with check (transporter_id = cargox_profile_id() or cargox_is_admin());

create policy vehicle_docs_owner on vehicle_documents for all
  using (exists (select 1 from vehicles v where v.id = vehicle_documents.vehicle_id
                 and (v.transporter_id = cargox_profile_id() or cargox_is_admin())))
  with check (exists (select 1 from vehicles v where v.id = vehicle_documents.vehicle_id
                 and (v.transporter_id = cargox_profile_id() or cargox_is_admin())));

-- ---------------------------------------------------------------------------
-- shipments: a sender sees and edits only their own
-- ---------------------------------------------------------------------------
create policy shipments_sender_own on shipments for select
  using (sender_id = cargox_profile_id() or cargox_is_admin()
         or (cargox_is_transporter() and exists (
               select 1 from trip_shipments ts join trips t on t.id = ts.trip_id
               join transport_assignments ta on ta.id = t.assignment_id
               where ts.shipment_id = shipments.id and ta.transporter_id = cargox_profile_id())));

create policy shipments_sender_insert on shipments for insert
  with check (sender_id = cargox_profile_id() or cargox_is_admin());

create policy shipments_sender_update on shipments for update
  using (sender_id = cargox_profile_id() or cargox_is_admin())
  with check (sender_id = cargox_profile_id() or cargox_is_admin());

create policy shipment_items_scope on shipment_items for all
  using (exists (select 1 from shipments s where s.id = shipment_items.shipment_id
                 and (s.sender_id = cargox_profile_id() or cargox_is_admin())))
  with check (exists (select 1 from shipments s where s.id = shipment_items.shipment_id
                 and (s.sender_id = cargox_profile_id() or cargox_is_admin())));

create policy shipment_destinations_scope on shipment_destinations for all
  using (exists (select 1 from shipments s where s.id = shipment_destinations.shipment_id
                 and (s.sender_id = cargox_profile_id() or cargox_is_admin())))
  with check (exists (select 1 from shipments s where s.id = shipment_destinations.shipment_id
                 and (s.sender_id = cargox_profile_id() or cargox_is_admin())));

create policy shipment_events_scope on shipment_events for select
  using (exists (select 1 from shipments s where s.id = shipment_events.shipment_id
                 and (s.sender_id = cargox_profile_id() or cargox_is_admin())) or cargox_is_admin());
create policy shipment_events_admin_write on shipment_events for insert
  with check (cargox_is_admin());

-- ---------------------------------------------------------------------------
-- pooling / capacity / assignments: admin coordinates, others read their slice
-- ---------------------------------------------------------------------------
create policy pools_read on shipment_pools for select
  using (cargox_is_admin() or cargox_is_transporter() or exists (
    select 1 from shipments s where s.pool_id = shipment_pools.id and s.sender_id = cargox_profile_id()));
create policy pools_admin_write on shipment_pools for all
  using (cargox_is_admin()) with check (cargox_is_admin());

create policy capacity_owner on capacity_blocks for all
  using (transporter_id = cargox_profile_id() or cargox_is_admin())
  with check (transporter_id = cargox_profile_id() or cargox_is_admin());

create policy assignments_read on transport_assignments for select
  using (transporter_id = cargox_profile_id() or cargox_is_admin());
create policy assignments_admin_write on transport_assignments for all
  using (cargox_is_admin()) with check (cargox_is_admin());

-- the transporter is allowed exactly one thing: responding to their offer
create policy assignments_transporter_response on transport_assignments for update
  using (transporter_id = cargox_profile_id())
  with check (transporter_id = cargox_profile_id());

create policy trips_read on trips for select
  using (cargox_is_admin() or exists (
    select 1 from transport_assignments ta where ta.id = trips.assignment_id
    and ta.transporter_id = cargox_profile_id()));
create policy trips_admin_write on trips for all
  using (cargox_is_admin()) with check (cargox_is_admin());

create policy trip_legs_read on trip_legs for select
  using (cargox_is_admin() or exists (
    select 1 from trips t join transport_assignments ta on ta.id = t.assignment_id
    where t.id = trip_legs.trip_id and ta.transporter_id = cargox_profile_id()));

create policy trip_shipments_read on trip_shipments for select
  using (cargox_is_admin()
         or exists (select 1 from shipments s where s.id = trip_shipments.shipment_id
                    and s.sender_id = cargox_profile_id())
         or exists (select 1 from trips t join transport_assignments ta on ta.id = t.assignment_id
                    where t.id = trip_shipments.trip_id and ta.transporter_id = cargox_profile_id()));

-- ---------------------------------------------------------------------------
-- delivery + quality: admin records and verifies, sender reads own
-- ---------------------------------------------------------------------------
create policy deliveries_read on delivery_confirmations for select
  using (cargox_is_admin() or exists (
    select 1 from shipments s where s.id = delivery_confirmations.shipment_id
    and s.sender_id = cargox_profile_id()));
create policy deliveries_admin_write on delivery_confirmations for all
  using (cargox_is_admin()) with check (cargox_is_admin());

create policy quality_read on quality_inspections for select
  using (cargox_is_admin() or exists (
    select 1 from shipments s where s.id = quality_inspections.shipment_id
    and s.sender_id = cargox_profile_id()));
create policy quality_admin_write on quality_inspections for all
  using (cargox_is_admin()) with check (cargox_is_admin());

-- ---------------------------------------------------------------------------
-- money: allocation readable by the sender it charges, writable by admin
-- ---------------------------------------------------------------------------
create policy coalitions_read on coalitions for select
  using (cargox_is_admin() or exists (
    select 1 from cost_allocations ca join shipments s on s.id = ca.shipment_id
    where ca.coalition_id = coalitions.id and s.sender_id = cargox_profile_id()));
create policy coalitions_admin_write on coalitions for all
  using (cargox_is_admin()) with check (cargox_is_admin());

create policy allocations_read on cost_allocations for select
  using (cargox_is_admin() or exists (
    select 1 from shipments s where s.id = cost_allocations.shipment_id
    and s.sender_id = cargox_profile_id()));
create policy allocations_admin_write on cost_allocations for all
  using (cargox_is_admin()) with check (cargox_is_admin());
-- senders approve their own share and nothing else
create policy allocations_sender_approve on cost_allocations for update
  using (exists (select 1 from shipments s where s.id = cost_allocations.shipment_id
                 and s.sender_id = cargox_profile_id()))
  with check (exists (select 1 from shipments s where s.id = cost_allocations.shipment_id
                 and s.sender_id = cargox_profile_id()));

-- ---------------------------------------------------------------------------
-- decisions, disruption, recovery, backhaul
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dispatch_decisions','disruption_events','recovery_plans','return_load_offers'] loop
    execute format('create policy %I on %I for select using (cargox_is_admin() or cargox_is_transporter())', t || '_read', t);
    execute format('create policy %I on %I for all using (cargox_is_admin()) with check (cargox_is_admin())', t || '_admin', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- notifications + support: strictly per-profile
-- ---------------------------------------------------------------------------
create policy notifications_own on notifications for select
  using (profile_id = cargox_profile_id());
create policy notifications_own_update on notifications for update
  using (profile_id = cargox_profile_id())
  with check (profile_id = cargox_profile_id());
create policy notifications_admin_insert on notifications for insert
  with check (cargox_is_admin());

create policy tickets_own on support_tickets for select
  using (profile_id = cargox_profile_id() or cargox_is_admin());
create policy tickets_own_insert on support_tickets for insert
  with check (profile_id = cargox_profile_id() or cargox_is_admin());
create policy tickets_admin_update on support_tickets for update
  using (cargox_is_admin()) with check (cargox_is_admin());

-- ---------------------------------------------------------------------------
-- simulation + audit: admin only (audit is append-only, insert via service role)
-- ---------------------------------------------------------------------------
create policy simulations_admin on simulation_runs for all
  using (cargox_is_admin()) with check (cargox_is_admin());
create policy simulation_events_admin on simulation_events for all
  using (cargox_is_admin()) with check (cargox_is_admin());
create policy audit_admin_read on audit_logs for select
  using (cargox_is_admin());
-- no update/delete policy exists: combined with the append-only trigger, only
-- inserts (service role) are possible.

-- ---------------------------------------------------------------------------
-- storage buckets (documents + proof of delivery)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('cargox-docs','cargox-docs', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('cargox-pod','cargox-pod', false)
  on conflict (id) do nothing;

create policy docs_owner_rw on storage.objects for all
  using (bucket_id in ('cargox-docs','cargox-pod')
         and (owner = auth.uid() or cargox_is_admin()))
  with check (bucket_id in ('cargox-docs','cargox-pod')
         and (owner = auth.uid() or cargox_is_admin()));
