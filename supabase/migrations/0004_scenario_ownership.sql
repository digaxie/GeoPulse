-- Senaryo sahipliği: sadece sahibi görsün ve düzenlesin

-- owner_id kolonu ekle
alter table public.scenarios
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Mevcut senaryolara sahip ata (ilk authenticated kullanıcıyı ata, yoksa null kalır)
-- Not: Production'da mevcut senaryoların sahipliğini manuel atayın

-- Eski geniş write politikasını kaldır
drop policy if exists "scenarios_write_authenticated" on public.scenarios;

-- Eski public view politikasını kaldır (yeniden tanımlayacağız)
drop policy if exists "scenarios_public_view" on public.scenarios;

-- Yeni politikalar: sadece sahibi görsün ve düzenlesin
create policy "scenarios_select_own"
on public.scenarios
for select
to authenticated
using (auth.uid() = owner_id);

create policy "scenarios_insert_own"
on public.scenarios
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "scenarios_update_own"
on public.scenarios
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "scenarios_delete_own"
on public.scenarios
for delete
to authenticated
using (auth.uid() = owner_id);

-- Public viewer erişimi korunuyor (viewer_slug ile okuma)
create policy "scenarios_public_view"
on public.scenarios
for select
to anon
using (viewer_slug is not null);

-- Snapshot politikasını senaryo sahipliğine bağla
drop policy if exists "snapshots_authenticated" on public.scenario_snapshots;

create policy "snapshots_select_own"
on public.scenario_snapshots
for select
to authenticated
using (
  exists (
    select 1 from public.scenarios
    where scenarios.id = scenario_snapshots.scenario_id
      and scenarios.owner_id = auth.uid()
  )
);

create policy "snapshots_write_own"
on public.scenario_snapshots
for insert
to authenticated
with check (
  exists (
    select 1 from public.scenarios
    where scenarios.id = scenario_snapshots.scenario_id
      and scenarios.owner_id = auth.uid()
  )
);
