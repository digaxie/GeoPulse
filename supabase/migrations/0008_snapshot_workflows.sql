do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scenarios'
      and column_name = 'owner_id'
  ) then
    raise exception '0004_scenario_ownership.sql must run before 0008_snapshot_workflows.sql';
  end if;
end;
$$;

create or replace function public.create_scenario_snapshot(scenario_id_input uuid)
returns table (
  id uuid,
  scenario_id uuid,
  revision integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  current_scenario public.scenarios%rowtype;
  inserted_snapshot public.scenario_snapshots%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select *
  into current_scenario
  from public.scenarios
  where public.scenarios.id = scenario_id_input
  for update;

  if not found then
    raise exception 'Scenario not found.';
  end if;

  if current_scenario.owner_id is distinct from caller_id then
    raise exception 'Scenario owner mismatch.';
  end if;

  if current_scenario.lock_holder_id is distinct from caller_id
    or current_scenario.lock_expires_at is null
    or current_scenario.lock_expires_at <= timezone('utc', now()) then
    raise exception 'Active editor lock required.';
  end if;

  insert into public.scenario_snapshots (scenario_id, revision, document_json)
  values (
    current_scenario.id,
    current_scenario.revision,
    current_scenario.document_json
  )
  returning *
  into inserted_snapshot;

  return query
  select
    inserted_snapshot.id,
    inserted_snapshot.scenario_id,
    inserted_snapshot.revision,
    inserted_snapshot.created_at;
end;
$$;

create or replace function public.restore_scenario_snapshot(snapshot_id_input uuid)
returns table (
  id uuid,
  title text,
  viewer_slug text,
  document_json jsonb,
  updated_at timestamptz,
  revision integer,
  lock_holder_id uuid,
  lock_holder_username text,
  lock_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  snapshot_record public.scenario_snapshots%rowtype;
  current_scenario public.scenarios%rowtype;
  next_revision integer;
  next_document jsonb;
begin
  if caller_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select *
  into snapshot_record
  from public.scenario_snapshots
  where public.scenario_snapshots.id = snapshot_id_input;

  if not found then
    raise exception 'Snapshot not found.';
  end if;

  select *
  into current_scenario
  from public.scenarios
  where public.scenarios.id = snapshot_record.scenario_id
  for update;

  if not found then
    raise exception 'Scenario not found.';
  end if;

  if current_scenario.owner_id is distinct from caller_id then
    raise exception 'Scenario owner mismatch.';
  end if;

  if current_scenario.lock_holder_id is distinct from caller_id
    or current_scenario.lock_expires_at is null
    or current_scenario.lock_expires_at <= timezone('utc', now()) then
    raise exception 'Active editor lock required.';
  end if;

  next_revision := current_scenario.revision + 1;
  next_document := jsonb_set(snapshot_record.document_json, '{revision}', to_jsonb(next_revision), true);

  return query
  update public.scenarios
  set document_json = next_document,
      revision = next_revision
  where public.scenarios.id = current_scenario.id
  returning
    public.scenarios.id,
    public.scenarios.title,
    public.scenarios.viewer_slug,
    public.scenarios.document_json,
    public.scenarios.updated_at,
    public.scenarios.revision,
    public.scenarios.lock_holder_id,
    public.scenarios.lock_holder_username,
    public.scenarios.lock_expires_at;
end;
$$;

revoke all on function public.create_scenario_snapshot(uuid) from public;
revoke all on function public.create_scenario_snapshot(uuid) from anon;
revoke all on function public.create_scenario_snapshot(uuid) from authenticated;
grant execute on function public.create_scenario_snapshot(uuid) to authenticated;

revoke all on function public.restore_scenario_snapshot(uuid) from public;
revoke all on function public.restore_scenario_snapshot(uuid) from anon;
revoke all on function public.restore_scenario_snapshot(uuid) from authenticated;
grant execute on function public.restore_scenario_snapshot(uuid) to authenticated;
