begin;

drop policy if exists "Enable insert for authenticated users only" on public.games;
drop policy if exists "Allow insert own games" on public.games;

create policy games_insert_creator_only
on public.games
for insert
to authenticated
with check (
  creator_id in (
    select p.id
    from public.players p
    where p.user_id = (select auth.uid())
  )
);

drop policy if exists allow_insert_participants on public.game_participants;

create policy game_participants_insert_creator_only
on public.game_participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.games g
    join public.players p on p.id = g.creator_id
    where g.id = game_participants.game_id
      and p.user_id = (select auth.uid())
  )
  and coalesce(game_participants.is_admin, false) = false
);

drop policy if exists insert_game_factions on public.game_factions;
drop policy if exists update_game_factions on public.game_factions;
drop policy if exists delete_game_factions on public.game_factions;

create policy game_factions_insert_creator_only
on public.game_factions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.games g
    join public.players p on p.id = g.creator_id
    where g.id = game_factions.game_id
      and p.user_id = (select auth.uid())
  )
);

create policy game_factions_update_creator_only
on public.game_factions
for update
to authenticated
using (
  exists (
    select 1
    from public.games g
    join public.players p on p.id = g.creator_id
    where g.id = game_factions.game_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.games g
    join public.players p on p.id = g.creator_id
    where g.id = game_factions.game_id
      and p.user_id = (select auth.uid())
  )
);

create policy game_factions_delete_creator_only
on public.game_factions
for delete
to authenticated
using (
  exists (
    select 1
    from public.games g
    join public.players p on p.id = g.creator_id
    where g.id = game_factions.game_id
      and p.user_id = (select auth.uid())
  )
);

commit;
