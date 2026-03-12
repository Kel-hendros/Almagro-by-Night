-- =============================================================
-- Character Objects (player-owned items per character/chronicle)
-- Items: weapons, equipment, utilities, consumables
-- =============================================================

begin;

create table if not exists public.character_objects (
  id uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  character_sheet_id uuid not null references public.character_sheets(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0 and char_length(name) <= 120),
  description text not null default '',
  object_type text not null check (object_type in ('arma','equipo','utilidad','consumible')),
  location text not null default '',
  tags text[] not null default '{}',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_character_objects_scope_updated
  on public.character_objects (character_sheet_id, is_archived, updated_at desc);

create index if not exists idx_character_objects_chronicle
  on public.character_objects (chronicle_id);

create index if not exists idx_character_objects_tags
  on public.character_objects using gin (tags);

-- Reuse existing set_updated_at trigger function (created in chronicle_notes.sql)
drop trigger if exists trg_character_objects_updated_at on public.character_objects;
create trigger trg_character_objects_updated_at
before update on public.character_objects
for each row
execute function public.set_updated_at();

alter table public.character_objects enable row level security;

-- SELECT: owner can read own objects in their chronicles
drop policy if exists character_objects_select_own on public.character_objects;
create policy character_objects_select_own
on public.character_objects
for select
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

-- SELECT: narrator can read all objects in their chronicles
drop policy if exists character_objects_select_narrator on public.character_objects;
create policy character_objects_select_narrator
on public.character_objects
for select
to authenticated
using (
  exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = character_objects.chronicle_id
      and p.user_id = auth.uid()
      and cp.role = 'narrator'
  )
);

-- INSERT: owner only
drop policy if exists character_objects_insert_own on public.character_objects;
create policy character_objects_insert_own
on public.character_objects
for insert
to authenticated
with check (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

-- UPDATE: owner only
drop policy if exists character_objects_update_own on public.character_objects;
create policy character_objects_update_own
on public.character_objects
for update
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
)
with check (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

-- DELETE: owner only
drop policy if exists character_objects_delete_own on public.character_objects;
create policy character_objects_delete_own
on public.character_objects
for delete
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

commit;
