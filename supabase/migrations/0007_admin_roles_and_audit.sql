alter table public.profiles
add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
    add constraint profiles_role_check
    check (role in ('user', 'admin'));
  end if;
end;
$$;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  target_user_id uuid,
  target_username text,
  status text not null check (status in ('success', 'denied', 'failed')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_audit_log_created_at_idx
on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
