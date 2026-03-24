drop policy if exists "assets_public_view" on public.assets;
drop policy if exists "assets_select_own" on public.assets;

create policy "assets_select_own"
on public.assets
for select
to authenticated
using (auth.uid() = owner_id);

create or replace function public.get_legacy_viewer_assets(viewer_slug_input text)
returns table (
  id uuid,
  kind text,
  label text,
  source_type text,
  storage_path text,
  thumbnail_path text,
  tags text[],
  default_size integer,
  default_rotation double precision,
  intrinsic_width integer,
  intrinsic_height integer,
  scope text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with target_scenario as (
    select document_json
    from public.scenarios
    where viewer_slug = viewer_slug_input
    limit 1
  ),
  legacy_asset_refs as (
    select distinct (element ->> 'assetId')::uuid as asset_id
    from target_scenario
    cross join lateral jsonb_array_elements(coalesce(document_json -> 'elements', '[]'::jsonb)) as element
    where element ->> 'kind' = 'asset'
      and not (element ? 'assetSnapshot')
      and coalesce(element ->> 'assetId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
  select
    assets.id,
    assets.kind,
    assets.label,
    assets.source_type,
    assets.storage_path,
    assets.thumbnail_path,
    assets.tags,
    assets.default_size,
    assets.default_rotation,
    assets.intrinsic_width,
    assets.intrinsic_height,
    assets.scope,
    assets.created_at
  from public.assets
  join legacy_asset_refs on legacy_asset_refs.asset_id = assets.id
  where assets.source_type = 'upload';
$$;

revoke all on function public.get_legacy_viewer_assets(text) from public;
revoke all on function public.get_legacy_viewer_assets(text) from anon;
revoke all on function public.get_legacy_viewer_assets(text) from authenticated;
grant execute on function public.get_legacy_viewer_assets(text) to anon;
grant execute on function public.get_legacy_viewer_assets(text) to authenticated;
