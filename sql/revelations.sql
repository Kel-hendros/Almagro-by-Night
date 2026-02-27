-- Archivo de Revelaciones (cross-system)
-- Narradores de una crónica gestionan revelaciones.
-- Jugadores ven en su archivo solo las revelaciones asociadas a ellos.

create table if not exists public.revelations (
  id uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 120),
  body_markdown text not null default '',
  image_url text null,
  created_by_player_id uuid not null references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revelation_players (
  id uuid primary key default gen_random_uuid(),
  revelation_id uuid not null references public.revelations(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  associated_at timestamptz not null default now(),
  unique (revelation_id, player_id)
);

create index if not exists idx_revelations_chronicle_created
  on public.revelations (chronicle_id, created_at desc);

create index if not exists idx_revelation_players_player
  on public.revelation_players (player_id, associated_at desc);

create index if not exists idx_revelation_players_revelation
  on public.revelation_players (revelation_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_revelations on public.revelations;
create trigger trg_touch_revelations
before update on public.revelations
for each row execute function public.touch_updated_at();

alter table public.revelations enable row level security;
alter table public.revelation_players enable row level security;

drop policy if exists revelations_select on public.revelations;
create policy revelations_select
on public.revelations
for select
to authenticated
using (
  -- Narradores de la crónica pueden ver todas
  exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = revelations.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  -- Creador de la crónica también puede ver todas
  or exists (
    select 1
    from public.chronicles c
    join public.players p on p.id = c.creator_id
    where c.id = revelations.chronicle_id
      and p.user_id = auth.uid()
  )
  -- Jugadores asociados pueden ver solo las suyas
  or exists (
    select 1
    from public.revelation_players rp
    join public.players p on p.id = rp.player_id
    where rp.revelation_id = revelations.id
      and p.user_id = auth.uid()
  )
);

drop policy if exists revelations_insert on public.revelations;
create policy revelations_insert
on public.revelations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = revelations.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
      and cp.player_id = revelations.created_by_player_id
  )
  or exists (
    select 1
    from public.chronicles c
    join public.players p on p.id = c.creator_id
    where c.id = revelations.chronicle_id
      and p.user_id = auth.uid()
      and c.creator_id = revelations.created_by_player_id
  )
);

drop policy if exists revelations_update on public.revelations;
create policy revelations_update
on public.revelations
for update
to authenticated
using (
  exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = revelations.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.chronicles c
    join public.players p on p.id = c.creator_id
    where c.id = revelations.chronicle_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = revelations.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.chronicles c
    join public.players p on p.id = c.creator_id
    where c.id = revelations.chronicle_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists revelations_delete on public.revelations;
create policy revelations_delete
on public.revelations
for delete
to authenticated
using (
  exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = revelations.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.chronicles c
    join public.players p on p.id = c.creator_id
    where c.id = revelations.chronicle_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists revelation_players_select on public.revelation_players;
create policy revelation_players_select
on public.revelation_players
for select
to authenticated
using (
  -- Narradores de la crónica ven asociaciones
  exists (
    select 1
    from public.revelations r
    join public.chronicle_participants cp on cp.chronicle_id = r.chronicle_id
    join public.players p on p.id = cp.player_id
    where r.id = revelation_players.revelation_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  -- Creador de la crónica también ve asociaciones
  or exists (
    select 1
    from public.revelations r
    join public.chronicles c on c.id = r.chronicle_id
    join public.players p on p.id = c.creator_id
    where r.id = revelation_players.revelation_id
      and p.user_id = auth.uid()
  )
  -- Jugador ve sus asociaciones
  or exists (
    select 1
    from public.players p
    where p.id = revelation_players.player_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists revelation_players_insert on public.revelation_players;
create policy revelation_players_insert
on public.revelation_players
for insert
to authenticated
with check (
  exists (
    select 1
    from public.revelations r
    join public.chronicle_participants cp on cp.chronicle_id = r.chronicle_id
    join public.players p on p.id = cp.player_id
    where r.id = revelation_players.revelation_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.revelations r
    join public.chronicles c on c.id = r.chronicle_id
    join public.players p on p.id = c.creator_id
    where r.id = revelation_players.revelation_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists revelation_players_delete on public.revelation_players;
create policy revelation_players_delete
on public.revelation_players
for delete
to authenticated
using (
  exists (
    select 1
    from public.revelations r
    join public.chronicle_participants cp on cp.chronicle_id = r.chronicle_id
    join public.players p on p.id = cp.player_id
    where r.id = revelation_players.revelation_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.revelations r
    join public.chronicles c on c.id = r.chronicle_id
    join public.players p on p.id = c.creator_id
    where r.id = revelation_players.revelation_id
      and p.user_id = auth.uid()
  )
);
