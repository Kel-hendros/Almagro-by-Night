-- =============================================================
-- Character Contacts (player-owned NPCs/contacts per character)
-- Types: mortal, animal, sobrenatural, otro
-- Includes mini character sheet stats (NPC template structure)
-- and Vínculo de Sangre (Blood Bond) tracking
-- =============================================================

begin;

create table if not exists public.character_contacts (
  id uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  character_sheet_id uuid not null references public.character_sheets(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0 and char_length(name) <= 120),
  description text not null default '',
  contact_type text not null check (contact_type in ('mortal','animal','sobrenatural','otro')),
  vinculo_sangre smallint not null default 0 check (vinculo_sangre >= 0 and vinculo_sangre <= 3),
  domitor text not null default '',
  stats jsonb not null default '{}',
  tags text[] not null default '{}',
  avatar_url text default null,
  is_archived boolean not null default false,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_character_contacts_scope_updated
  on public.character_contacts (character_sheet_id, is_archived, is_favorite desc, updated_at desc);

create index if not exists idx_character_contacts_chronicle
  on public.character_contacts (chronicle_id);

create index if not exists idx_character_contacts_tags
  on public.character_contacts using gin (tags);

-- Reuse existing set_updated_at trigger function (created in chronicle_notes.sql)
drop trigger if exists trg_character_contacts_updated_at on public.character_contacts;
create trigger trg_character_contacts_updated_at
before update on public.character_contacts
for each row
execute function public.set_updated_at();

alter table public.character_contacts enable row level security;

-- SELECT: owner can read own contacts in their chronicles
drop policy if exists character_contacts_select_own on public.character_contacts;
create policy character_contacts_select_own
on public.character_contacts
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

-- SELECT: narrator can read all contacts in their chronicles
drop policy if exists character_contacts_select_narrator on public.character_contacts;
create policy character_contacts_select_narrator
on public.character_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = character_contacts.chronicle_id
      and p.user_id = auth.uid()
      and cp.role = 'narrator'
  )
);

-- INSERT: owner only
drop policy if exists character_contacts_insert_own on public.character_contacts;
create policy character_contacts_insert_own
on public.character_contacts
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
drop policy if exists character_contacts_update_own on public.character_contacts;
create policy character_contacts_update_own
on public.character_contacts
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
drop policy if exists character_contacts_delete_own on public.character_contacts;
create policy character_contacts_delete_own
on public.character_contacts
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
