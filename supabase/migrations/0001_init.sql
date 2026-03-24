create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Yeni Senaryo',
  viewer_slug text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  document_json jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  lock_holder_id uuid,
  lock_holder_username text,
  lock_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  scenario_id uuid references public.scenarios(id) on delete cascade,
  kind text not null,
  label text not null,
  source_type text not null default 'upload',
  storage_path text not null,
  thumbnail_path text not null,
  tags text[] not null default '{}',
  default_size integer not null default 48,
  default_rotation double precision not null default 0,
  scope text not null default 'global',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenario_snapshots (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  revision integer not null,
  document_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create trigger scenarios_set_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.scenarios enable row level security;
alter table public.assets enable row level security;
alter table public.scenario_snapshots enable row level security;

create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "scenarios_public_view"
on public.scenarios
for select
to anon, authenticated
using (viewer_slug is not null);

create policy "scenarios_write_authenticated"
on public.scenarios
for all
to authenticated
using (true)
with check (true);

create policy "assets_public_view"
on public.assets
for select
to anon, authenticated
using (true);

create policy "assets_write_authenticated"
on public.assets
for insert
to authenticated
with check (auth.uid() = owner_id or owner_id is null);

create policy "assets_update_authenticated"
on public.assets
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "snapshots_authenticated"
on public.scenario_snapshots
for all
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('symbols', 'symbols', true)
on conflict (id) do nothing;

create policy "symbols_public_read"
on storage.objects
for select
to public
using (bucket_id = 'symbols');

create policy "symbols_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'symbols');

create or replace function public.lookup_login_email(login_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(login_username)
  limit 1;
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
  current_lock record;
  next_expiry timestamptz := timezone('utc', now()) + interval '60 seconds';
begin
  select lock_holder_id, lock_holder_username, lock_expires_at
  into current_lock
  from public.scenarios
  where id = scenario_id
  for update;

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
begin
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
  next_slug text := substr(md5(gen_random_uuid()::text), 1, 10);
begin
  update public.scenarios
  set viewer_slug = next_slug
  where id = scenario_id;

  return next_slug;
end;
$$;
