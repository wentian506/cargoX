-- ============================================================================
-- 0004_provision_admin.sql — invitation-only admin provisioning
--
-- There is deliberately no public path that creates an admin. An existing
-- operator (service role / SQL console) calls this function with the email of
-- a user who has already accepted a Supabase Auth invitation.
-- ============================================================================

create or replace function cargox_provision_admin(p_email citext, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_auth    uuid;
begin
  select id into v_auth from auth.users where email = p_email;
  if v_auth is null then
    raise exception 'No Supabase Auth user for %. Send an invitation first.', p_email;
  end if;

  perform set_config('cargox.allow_admin', 'on', true);   -- bypass the register guard
  insert into profiles (auth_user_id, email, full_name, role, status, verified_at)
  values (v_auth, p_email, p_full_name, 'admin', 'active', now())
  on conflict (email) do update
    set role = 'admin', status = 'active', verified_at = now()
  returning id into v_profile;
  perform set_config('cargox.allow_admin', 'off', true);

  insert into audit_logs (actor_role, action, entity_type, entity_id, after_state)
  values ('system', 'admin.provision', 'profile', v_profile::text,
          jsonb_build_object('email', p_email, 'method', 'invitation'));

  return v_profile;
end $$;

revoke all on function cargox_provision_admin(citext, text) from public, anon, authenticated;
grant execute on function cargox_provision_admin(citext, text) to service_role;

-- Usage:
--   select cargox_provision_admin('ops@cargox.example', 'CARGOX Control Tower');
