begin;

update public.chronicle_territory_pois
set kind = case
  when kind = 'resource' then 'hq'
  when kind = 'event' then 'interest'
  else kind
end
where kind in ('resource', 'event');

update public.chronicle_territory_pois
set visibility = case
  when visibility = 'all' then 'public'
  when visibility = 'narrator' then 'private'
  else visibility
end
where visibility in ('all', 'narrator');

alter table public.chronicle_territory_pois
  alter column visibility set default 'public';

alter table public.chronicle_territory_pois
  drop constraint if exists chronicle_territory_pois_kind_check;

alter table public.chronicle_territory_pois
  drop constraint if exists chronicle_territory_pois_visibility_check;

alter table public.chronicle_territory_pois
  add constraint chronicle_territory_pois_kind_check
    check (kind in ('interest', 'haven', 'threat', 'ally', 'hq'));

alter table public.chronicle_territory_pois
  add constraint chronicle_territory_pois_visibility_check
    check (visibility in ('public', 'private'));

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

commit;
