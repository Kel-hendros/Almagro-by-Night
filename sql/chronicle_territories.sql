-- =============================================================
-- Chronicle Territories
-- Narrative map configuration + shared POIs per chronicle
-- Applied: 2026-03-17
-- =============================================================

begin;

create table if not exists public.chronicle_territories (
  chronicle_id uuid primary key references public.chronicles(id) on delete cascade,
  center_label text not null default 'Buenos Aires',
  center_lat double precision not null default -34.6037,
  center_lng double precision not null default -58.3816,
  zoom double precision not null default 11,
  created_by uuid not null references public.players(id),
  updated_by uuid not null references public.players(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chronicle_territory_pois (
  id uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  created_by_player_id uuid not null references public.players(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 160),
  description text not null default '',
  kind text not null default 'interest'
    check (kind in ('interest', 'haven', 'threat', 'ally', 'hq')),
  visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  lat double precision not null,
  lng double precision not null,
  linked_document_type text,
  linked_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chronicle_territory_pois_scope
  on public.chronicle_territory_pois (chronicle_id, updated_at desc);

create index if not exists idx_chronicle_territory_pois_creator
  on public.chronicle_territory_pois (created_by_player_id, chronicle_id);

drop trigger if exists trg_chronicle_territories_updated_at on public.chronicle_territories;
create trigger trg_chronicle_territories_updated_at
before update on public.chronicle_territories
for each row
execute function public.set_updated_at();

drop trigger if exists trg_chronicle_territory_pois_updated_at on public.chronicle_territory_pois;
create trigger trg_chronicle_territory_pois_updated_at
before update on public.chronicle_territory_pois
for each row
execute function public.set_updated_at();

alter table public.chronicle_territories enable row level security;
alter table public.chronicle_territory_pois enable row level security;

drop policy if exists chronicle_territories_select_participant on public.chronicle_territories;
create policy chronicle_territories_select_participant
on public.chronicle_territories
for select
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
);

drop policy if exists chronicle_territories_insert_narrator on public.chronicle_territories;
create policy chronicle_territories_insert_narrator
on public.chronicle_territories
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_territories.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
      and chronicle_territories.created_by = p.id
      and chronicle_territories.updated_by = p.id
  )
);

drop policy if exists chronicle_territories_update_narrator on public.chronicle_territories;
create policy chronicle_territories_update_narrator
on public.chronicle_territories
for update
to authenticated
using (
  exists (
    select 1
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_territories.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_territories.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
      and chronicle_territories.updated_by = p.id
  )
);

drop policy if exists chronicle_territory_pois_select_visible on public.chronicle_territory_pois;
create policy chronicle_territory_pois_select_visible
on public.chronicle_territory_pois
for select
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and (
    visibility = 'public'
    or created_by_player_id in (
      select p.id
      from public.players p
      where p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chronicle_participants cp
      inner join public.players p on p.id = cp.player_id
      where cp.chronicle_id = chronicle_territory_pois.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  )
);

drop policy if exists chronicle_territory_pois_insert_participant on public.chronicle_territory_pois;
create policy chronicle_territory_pois_insert_participant
on public.chronicle_territory_pois
for insert
to authenticated
with check (
  chronicle_id in (select public.get_my_chronicle_ids())
  and created_by_player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

drop policy if exists chronicle_territory_pois_update_owner_or_narrator on public.chronicle_territory_pois;
create policy chronicle_territory_pois_update_owner_or_narrator
on public.chronicle_territory_pois
for update
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and (
    created_by_player_id in (
      select p.id
      from public.players p
      where p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chronicle_participants cp
      inner join public.players p on p.id = cp.player_id
      where cp.chronicle_id = chronicle_territory_pois.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  )
)
with check (
  chronicle_id in (select public.get_my_chronicle_ids())
  and (
    created_by_player_id in (
      select p.id
      from public.players p
      where p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chronicle_participants cp
      inner join public.players p on p.id = cp.player_id
      where cp.chronicle_id = chronicle_territory_pois.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  )
);

drop policy if exists chronicle_territory_pois_delete_owner_or_narrator on public.chronicle_territory_pois;
create policy chronicle_territory_pois_delete_owner_or_narrator
on public.chronicle_territory_pois
for delete
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and (
    created_by_player_id in (
      select p.id
      from public.players p
      where p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chronicle_participants cp
      inner join public.players p on p.id = cp.player_id
      where cp.chronicle_id = chronicle_territory_pois.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  )
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      execute 'alter publication supabase_realtime add table public.chronicle_territories';
    exception
      when duplicate_object then null;
    end;

    begin
      execute 'alter publication supabase_realtime add table public.chronicle_territory_pois';
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

commit;
