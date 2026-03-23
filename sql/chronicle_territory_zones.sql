-- Chronicle Territory Zones
-- Allows narrators to draw and manage territory polygons on the chronicle map

begin;

-- Create the zones table
create table if not exists public.chronicle_territory_zones (
  id uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  created_by_player_id uuid not null references public.players(id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) > 0 and char_length(nombre) <= 160),
  descripcion text not null default '',
  tipo text not null default 'territorio' check (tipo in ('dominio', 'coto_de_caza', 'territorio')),
  estado text not null default 'libre' check (estado in ('disputado', 'controlado', 'libre')),
  regente text,
  color text not null default '#c41e3a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  polygon jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast chronicle lookups
create index if not exists chronicle_territory_zones_chronicle_id_idx
  on public.chronicle_territory_zones(chronicle_id);

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chronicle_territory_zones_updated_at on public.chronicle_territory_zones;
create trigger chronicle_territory_zones_updated_at
  before update on public.chronicle_territory_zones
  for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.chronicle_territory_zones enable row level security;

-- RLS: SELECT - participants can see public zones, narrators can see all
drop policy if exists chronicle_territory_zones_select on public.chronicle_territory_zones;
create policy chronicle_territory_zones_select
on public.chronicle_territory_zones
for select
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and (
    visibility = 'public'
    or exists (
      select 1
      from public.chronicle_participants cp
      inner join public.players p on p.id = cp.player_id
      where cp.chronicle_id = chronicle_territory_zones.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  )
);

-- RLS: INSERT - only narrators
drop policy if exists chronicle_territory_zones_insert on public.chronicle_territory_zones;
create policy chronicle_territory_zones_insert
on public.chronicle_territory_zones
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_territory_zones.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
);

-- RLS: UPDATE - only narrators
drop policy if exists chronicle_territory_zones_update on public.chronicle_territory_zones;
create policy chronicle_territory_zones_update
on public.chronicle_territory_zones
for update
to authenticated
using (
  exists (
    select 1
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_territory_zones.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_territory_zones.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
);

-- RLS: DELETE - only narrators
drop policy if exists chronicle_territory_zones_delete on public.chronicle_territory_zones;
create policy chronicle_territory_zones_delete
on public.chronicle_territory_zones
for delete
to authenticated
using (
  exists (
    select 1
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_territory_zones.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
);

commit;
