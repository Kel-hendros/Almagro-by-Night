-- Encounter assets
-- 1) Reusable design assets library (with tags for filtering/search)
-- 2) Optional encounter background metadata table
-- 3) RLS policies scoped to owner/shared visibility

begin;

insert into storage.buckets (id, name, public)
values ('encounter-assets', 'encounter-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('encounter-backgrounds', 'encounter-backgrounds', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload encounter assets" on storage.objects;
create policy "Authenticated users can upload encounter assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'encounter-assets');

drop policy if exists "Authenticated users can update encounter assets" on storage.objects;
create policy "Authenticated users can update encounter assets"
on storage.objects for update to authenticated
using (bucket_id = 'encounter-assets');

drop policy if exists "Authenticated users can delete encounter assets" on storage.objects;
create policy "Authenticated users can delete encounter assets"
on storage.objects for delete to authenticated
using (bucket_id = 'encounter-assets');

drop policy if exists "Public read for encounter assets" on storage.objects;
create policy "Public read for encounter assets"
on storage.objects for select to public
using (bucket_id = 'encounter-assets');

drop policy if exists "Authenticated users can upload encounter backgrounds" on storage.objects;
create policy "Authenticated users can upload encounter backgrounds"
on storage.objects for insert to authenticated
with check (bucket_id = 'encounter-backgrounds');

drop policy if exists "Authenticated users can update encounter backgrounds" on storage.objects;
create policy "Authenticated users can update encounter backgrounds"
on storage.objects for update to authenticated
using (bucket_id = 'encounter-backgrounds');

drop policy if exists "Authenticated users can delete encounter backgrounds" on storage.objects;
create policy "Authenticated users can delete encounter backgrounds"
on storage.objects for delete to authenticated
using (bucket_id = 'encounter-backgrounds');

drop policy if exists "Public read for encounter backgrounds" on storage.objects;
create policy "Public read for encounter backgrounds"
on storage.objects for select to public
using (bucket_id = 'encounter-backgrounds');

create table if not exists public.encounter_design_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_path text not null,
  tags text[] not null default '{}'::text[],
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_encounter_design_assets_owner
  on public.encounter_design_assets (owner_user_id, created_at desc);

create index if not exists idx_encounter_design_assets_tags_gin
  on public.encounter_design_assets using gin (tags);

create index if not exists idx_encounter_design_assets_name_lower
  on public.encounter_design_assets (lower(name));

create table if not exists public.encounter_backgrounds (
  encounter_id uuid primary key references public.encounters(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_encounter_backgrounds_owner
  on public.encounter_backgrounds (owner_user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_encounter_design_assets on public.encounter_design_assets;
create trigger trg_touch_encounter_design_assets
before update on public.encounter_design_assets
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_encounter_backgrounds on public.encounter_backgrounds;
create trigger trg_touch_encounter_backgrounds
before update on public.encounter_backgrounds
for each row execute function public.touch_updated_at();

alter table public.encounter_design_assets enable row level security;
alter table public.encounter_backgrounds enable row level security;

drop policy if exists encounter_design_assets_select on public.encounter_design_assets;
create policy encounter_design_assets_select
on public.encounter_design_assets
for select
to authenticated
using (owner_user_id = auth.uid() or is_shared = true);

drop policy if exists encounter_design_assets_insert on public.encounter_design_assets;
create policy encounter_design_assets_insert
on public.encounter_design_assets
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists encounter_design_assets_update on public.encounter_design_assets;
create policy encounter_design_assets_update
on public.encounter_design_assets
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists encounter_design_assets_delete on public.encounter_design_assets;
create policy encounter_design_assets_delete
on public.encounter_design_assets
for delete
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists encounter_backgrounds_select on public.encounter_backgrounds;
create policy encounter_backgrounds_select
on public.encounter_backgrounds
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or encounter_id in (
    select e.id
    from public.encounters e
    where e.chronicle_id in (select public.get_my_chronicle_ids())
  )
);

drop policy if exists encounter_backgrounds_insert on public.encounter_backgrounds;
create policy encounter_backgrounds_insert
on public.encounter_backgrounds
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists encounter_backgrounds_update on public.encounter_backgrounds;
create policy encounter_backgrounds_update
on public.encounter_backgrounds
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists encounter_backgrounds_delete on public.encounter_backgrounds;
create policy encounter_backgrounds_delete
on public.encounter_backgrounds
for delete
to authenticated
using (owner_user_id = auth.uid());

commit;
