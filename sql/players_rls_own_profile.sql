-- players RLS:
-- - SELECT: own row OR players who share at least one chronicle with me
-- - UPDATE: only own row
-- Safe to run multiple times.

alter table if exists public.players enable row level security;

drop policy if exists players_select_own on public.players;
drop policy if exists players_select_self_or_shared_chronicle on public.players;
create policy players_select_self_or_shared_chronicle
  on public.players
  for select
  using (
    user_id = auth.uid()
    or id in (
      select cp.player_id
      from public.chronicle_participants cp
      where cp.chronicle_id in (select public.get_my_chronicle_ids())
    )
  );

drop policy if exists players_update_own on public.players;
create policy players_update_own
  on public.players
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
