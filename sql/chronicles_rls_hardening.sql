begin;

drop policy if exists chronicles_insert_authenticated on public.chronicles;
create policy chronicles_insert_authenticated
on public.chronicles
for insert
to authenticated
with check (
  creator_id in (
    select p.id
    from public.players p
    where p.user_id = (select auth.uid())
  )
);

drop policy if exists cp_insert_authenticated on public.chronicle_participants;
create policy cp_insert_authenticated
on public.chronicle_participants
for insert
to authenticated
with check (
  role = 'narrator'
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = (select auth.uid())
  )
  and chronicle_id in (
    select c.id
    from public.chronicles c
    where c.creator_id in (
      select p.id
      from public.players p
      where p.user_id = (select auth.uid())
    )
  )
);

commit;
