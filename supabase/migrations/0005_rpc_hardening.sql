do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scenarios'
      and column_name = 'owner_id'
  ) then
    raise exception '0004_scenario_ownership.sql must run before 0005_rpc_hardening.sql';
  end if;
end;
$$;

create or replace function public.claim_editor_lock(
  scenario_id uuid,
  holder_id uuid,
  holder_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  current_lock record;
  next_expiry timestamptz := timezone('utc', now()) + interval '60 seconds';
begin
  if caller_id is null then
    raise exception 'Authenticated session required.';
  end if;

  if holder_id is distinct from caller_id then
    raise exception 'Lock holder mismatch.';
  end if;

  select owner_id, lock_holder_id, lock_holder_username, lock_expires_at
  into current_lock
  from public.scenarios
  where id = scenario_id
  for update;

  if not found then
    raise exception 'Scenario not found.';
  end if;

  if current_lock.owner_id is distinct from caller_id then
    raise exception 'Scenario owner mismatch.';
  end if;

  if current_lock.lock_holder_id is not null
    and current_lock.lock_holder_id <> holder_id
    and current_lock.lock_expires_at > timezone('utc', now()) then
    raise exception 'Editor kilidi baska bir kullanicida.';
  end if;

  update public.scenarios
  set lock_holder_id = holder_id,
      lock_holder_username = holder_username,
      lock_expires_at = next_expiry
  where id = scenario_id;

  return jsonb_build_object(
    'holderId', holder_id,
    'holderUsername', holder_username,
    'expiresAt', next_expiry
  );
end;
$$;

create or replace function public.release_editor_lock(
  scenario_id uuid,
  holder_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  current_record record;
begin
  if caller_id is null then
    raise exception 'Authenticated session required.';
  end if;

  if holder_id is distinct from caller_id then
    raise exception 'Lock holder mismatch.';
  end if;

  select owner_id, lock_holder_id
  into current_record
  from public.scenarios
  where id = scenario_id
  for update;

  if not found then
    raise exception 'Scenario not found.';
  end if;

  if current_record.owner_id is distinct from caller_id then
    raise exception 'Scenario owner mismatch.';
  end if;

  update public.scenarios
  set lock_holder_id = null,
      lock_holder_username = null,
      lock_expires_at = null
  where id = scenario_id
    and lock_holder_id = holder_id;
end;
$$;

create or replace function public.rotate_viewer_slug(scenario_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  current_record record;
  next_slug text := substr(md5(gen_random_uuid()::text), 1, 10);
begin
  if caller_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select owner_id
  into current_record
  from public.scenarios
  where id = scenario_id
  for update;

  if not found then
    raise exception 'Scenario not found.';
  end if;

  if current_record.owner_id is distinct from caller_id then
    raise exception 'Scenario owner mismatch.';
  end if;

  update public.scenarios
  set viewer_slug = next_slug
  where id = scenario_id;

  return next_slug;
end;
$$;

revoke all on function public.lookup_login_email(text) from public;
revoke all on function public.lookup_login_email(text) from anon;
revoke all on function public.lookup_login_email(text) from authenticated;
grant execute on function public.lookup_login_email(text) to service_role;

revoke all on function public.claim_editor_lock(uuid, uuid, text) from public;
revoke all on function public.claim_editor_lock(uuid, uuid, text) from anon;
revoke all on function public.claim_editor_lock(uuid, uuid, text) from authenticated;
grant execute on function public.claim_editor_lock(uuid, uuid, text) to authenticated;

revoke all on function public.release_editor_lock(uuid, uuid) from public;
revoke all on function public.release_editor_lock(uuid, uuid) from anon;
revoke all on function public.release_editor_lock(uuid, uuid) from authenticated;
grant execute on function public.release_editor_lock(uuid, uuid) to authenticated;

revoke all on function public.rotate_viewer_slug(uuid) from public;
revoke all on function public.rotate_viewer_slug(uuid) from anon;
revoke all on function public.rotate_viewer_slug(uuid) from authenticated;
grant execute on function public.rotate_viewer_slug(uuid) to authenticated;
