-- Chronicles system migration
-- 1) Create chronicles and chronicle_participants tables
-- 2) Add chronicle_id FK to existing tables
-- 3) RLS policies
-- 4) RPCs for invite code system
-- 5) Data migration from existing game

begin;

-- ============================================================
-- 1. Core tables
-- ============================================================

create table if not exists public.chronicles (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  invite_code text not null unique,
  creator_id uuid not null references public.players(id),
  created_at timestamptz default now()
);

create table if not exists public.chronicle_participants (
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role text not null default 'player'
    check (role in ('narrator', 'player')),
  joined_at timestamptz default now(),
  primary key (chronicle_id, player_id)
);

-- ============================================================
-- 2. Add chronicle_id to existing tables
-- ============================================================

alter table public.character_sheets
  add column if not exists chronicle_id uuid references public.chronicles(id);

alter table public.encounters
  add column if not exists chronicle_id uuid references public.chronicles(id);

alter table public.games
  add column if not exists chronicle_id uuid references public.chronicles(id);

-- Indexes for filtering
create index if not exists idx_character_sheets_chronicle
  on public.character_sheets (chronicle_id);

create index if not exists idx_encounters_chronicle
  on public.encounters (chronicle_id);

create index if not exists idx_games_chronicle
  on public.games (chronicle_id);

create index if not exists idx_chronicles_invite_code
  on public.chronicles (invite_code);

-- ============================================================
-- 3. Helper: generate invite code
-- ============================================================

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- ============================================================
-- 4. RPC: join chronicle by invite code
-- ============================================================

create or replace function public.join_chronicle_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chronicle record;
  v_player_id uuid;
  v_existing record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Resolve player
  select id into v_player_id
  from public.players
  where user_id = auth.uid()
  limit 1;

  if v_player_id is null then
    raise exception 'Player record not found';
  end if;

  -- Find chronicle by code
  select id, name, status into v_chronicle
  from public.chronicles
  where invite_code = upper(trim(p_code))
  limit 1;

  if v_chronicle.id is null then
    raise exception 'Invalid invite code';
  end if;

  if v_chronicle.status <> 'active' then
    raise exception 'Chronicle is not active';
  end if;

  -- Check if already a participant
  select chronicle_id into v_existing
  from public.chronicle_participants
  where chronicle_id = v_chronicle.id
    and player_id = v_player_id
  limit 1;

  if v_existing.chronicle_id is not null then
    return jsonb_build_object(
      'chronicle_id', v_chronicle.id,
      'name', v_chronicle.name,
      'already_member', true
    );
  end if;

  -- Join as player
  insert into public.chronicle_participants (chronicle_id, player_id, role)
  values (v_chronicle.id, v_player_id, 'player');

  return jsonb_build_object(
    'chronicle_id', v_chronicle.id,
    'name', v_chronicle.name,
    'already_member', false
  );
end;
$$;

grant execute on function public.join_chronicle_by_code(text) to authenticated;

-- ============================================================
-- 5. RLS for chronicles
-- ============================================================

alter table public.chronicles enable row level security;

-- Anyone authenticated can see chronicles they participate in
drop policy if exists chronicles_select_participant on public.chronicles;
create policy chronicles_select_participant
on public.chronicles
for select
to authenticated
using (
  id in (
    select cp.chronicle_id
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where p.user_id = auth.uid()
  )
  or creator_id in (
    select p.id from public.players p where p.user_id = auth.uid()
  )
);

-- Any authenticated user can create a chronicle
drop policy if exists chronicles_insert_authenticated on public.chronicles;
create policy chronicles_insert_authenticated
on public.chronicles
for insert
to authenticated
with check (true);

-- Only creator can update
drop policy if exists chronicles_update_creator on public.chronicles;
create policy chronicles_update_creator
on public.chronicles
for update
to authenticated
using (
  creator_id in (
    select p.id from public.players p where p.user_id = auth.uid()
  )
);

-- Only creator can delete
drop policy if exists chronicles_delete_creator on public.chronicles;
create policy chronicles_delete_creator
on public.chronicles
for delete
to authenticated
using (
  creator_id in (
    select p.id from public.players p where p.user_id = auth.uid()
  )
);

-- ============================================================
-- 6. RLS for chronicle_participants
-- ============================================================

alter table public.chronicle_participants enable row level security;

-- Participants can see other participants of their chronicles
drop policy if exists cp_select_participant on public.chronicle_participants;
create policy cp_select_participant
on public.chronicle_participants
for select
to authenticated
using (
  chronicle_id in (
    select cp2.chronicle_id
    from public.chronicle_participants cp2
    inner join public.players p on p.id = cp2.player_id
    where p.user_id = auth.uid()
  )
);

-- Insert is handled via RPC (join_chronicle_by_code) or direct for narrator
drop policy if exists cp_insert_authenticated on public.chronicle_participants;
create policy cp_insert_authenticated
on public.chronicle_participants
for insert
to authenticated
with check (true);

-- Only narrator can remove participants
drop policy if exists cp_delete_narrator on public.chronicle_participants;
create policy cp_delete_narrator
on public.chronicle_participants
for delete
to authenticated
using (
  chronicle_id in (
    select c.id
    from public.chronicles c
    where c.creator_id in (
      select p.id from public.players p where p.user_id = auth.uid()
    )
  )
);

-- ============================================================
-- 7. Data migration: create chronicle from existing game
-- ============================================================

do $$
declare
  v_game record;
  v_code text;
  v_chronicle_id uuid;
  v_participant record;
begin
  -- Get the first game (same logic as SingleGameStore)
  select g.id, g.name, g.creator_id
    into v_game
  from public.games g
  order by g.created_at asc
  limit 1;

  if v_game.id is null then
    raise notice 'No existing game found, skipping migration';
    return;
  end if;

  -- Check if a chronicle already exists for this game
  if exists (select 1 from public.games where id = v_game.id and chronicle_id is not null) then
    raise notice 'Game already has a chronicle, skipping migration';
    return;
  end if;

  -- Generate unique invite code
  loop
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.chronicles where invite_code = v_code);
  end loop;

  -- Create chronicle
  insert into public.chronicles (name, creator_id, invite_code)
  values (v_game.name, v_game.creator_id, v_code)
  returning id into v_chronicle_id;

  -- Add creator as narrator
  insert into public.chronicle_participants (chronicle_id, player_id, role)
  values (v_chronicle_id, v_game.creator_id, 'narrator')
  on conflict do nothing;

  -- Migrate game_participants to chronicle_participants
  for v_participant in
    select gp.player_id
    from public.game_participants gp
    where gp.game_id = v_game.id
      and gp.player_id <> v_game.creator_id
  loop
    insert into public.chronicle_participants (chronicle_id, player_id, role)
    values (v_chronicle_id, v_participant.player_id, 'player')
    on conflict do nothing;
  end loop;

  -- Link existing game to chronicle
  update public.games
  set chronicle_id = v_chronicle_id
  where id = v_game.id;

  -- Link existing character_sheets to chronicle (for all participants)
  update public.character_sheets cs
  set chronicle_id = v_chronicle_id
  where cs.user_id in (
    select p.user_id
    from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = v_chronicle_id
  )
  and cs.chronicle_id is null;

  -- Link existing encounters to chronicle
  update public.encounters
  set chronicle_id = v_chronicle_id
  where chronicle_id is null;

  raise notice 'Migration complete: chronicle % created for game %', v_chronicle_id, v_game.id;
end;
$$;

commit;
