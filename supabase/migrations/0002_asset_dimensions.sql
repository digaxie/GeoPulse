alter table public.assets
add column if not exists intrinsic_width integer,
add column if not exists intrinsic_height integer;
