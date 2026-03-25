-- Tzeva Adom alert ve system message geçmişi (24 saat)
create table if not exists tzevaadom_events (
  id bigserial primary key,
  event_type text not null check (event_type in ('ALERT', 'SYSTEM_MESSAGE')),
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_tzevaadom_events_received_at
  on tzevaadom_events (received_at desc);

-- Herkes okuyabilir (public veri), sadece service_role yazabilir
alter table tzevaadom_events enable row level security;

create policy "Herkes tzevaadom eventlerini okuyabilir"
  on tzevaadom_events for select
  using (true);

-- 24 saatten eski kayıtları temizleyen fonksiyon
create or replace function prune_old_tzevaadom_events()
returns void
language sql
security definer
as $$
  delete from tzevaadom_events
  where received_at < now() - interval '24 hours';
$$;
