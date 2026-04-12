create table if not exists public.hub_module_configs (
  id text primary key,
  control_state text not null default 'enabled',
  title text not null,
  description text not null default '',
  cta_label text not null,
  secondary_cta_label text not null default '',
  badge text not null default '',
  helper_text text not null default '',
  warning_text text not null default '',
  status_label text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hub_module_configs_control_state_check
    check (control_state in ('enabled', 'disabled', 'hidden'))
);

drop trigger if exists hub_module_configs_set_updated_at on public.hub_module_configs;
create trigger hub_module_configs_set_updated_at
before update on public.hub_module_configs
for each row execute function public.set_updated_at();

alter table public.hub_module_configs enable row level security;

drop policy if exists "hub_module_configs_select_authenticated" on public.hub_module_configs;
create policy "hub_module_configs_select_authenticated"
on public.hub_module_configs
for select
to authenticated
using (true);

drop policy if exists "hub_module_configs_insert_admin" on public.hub_module_configs;
create policy "hub_module_configs_insert_admin"
on public.hub_module_configs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.role = 'admin'
  )
);

drop policy if exists "hub_module_configs_update_admin" on public.hub_module_configs;
create policy "hub_module_configs_update_admin"
on public.hub_module_configs
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.role = 'admin'
  )
);
