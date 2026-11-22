-- ===========================================================================
-- CARGOX — Supabase one-shot setup
--   1. Supabase dashboard -> SQL Editor -> paste -> Run.
--   2. Copy the pooler connection string into Render's DATABASE_URL.
--   3. Render runs `python -m app.db_bootstrap` on boot, which creates the
--      runtime tables and seeds reference + demo data.
-- ===========================================================================
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- Runtime tables are created by the API itself (backend/app/sql/schema.sql) so
-- that the Postgres and SQLite schemas can never drift. Keep these two switches
-- on so the API can read/write them through the service role:
alter default privileges in schema public grant all on tables to postgres;

-- A read-only role for BI / dashboards (optional but recommended):
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cargox_readonly') then
    create role cargox_readonly nologin;
  end if;
end $$;
grant usage on schema public to cargox_readonly;
alter default privileges in schema public grant select on tables to cargox_readonly;

-- Health check used by Render + uptime monitors:
create or replace view cargox_health as
select now() as checked_at, current_database() as database;
