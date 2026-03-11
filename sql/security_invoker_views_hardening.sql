begin;

create or replace view public.players_public
with (security_invoker=on) as
select
  p.id,
  p.name
from public.players p;

grant select on public.players_public to authenticated;

create or replace view public.lieutenants_positions
with (security_invoker=on) as
select
  l.id,
  l.name,
  l.description,
  l.image_url,
  l.faction_id,
  f.name as faction_name,
  f.faction_color,
  l.current_zone_id,
  z.name as current_zone_name,
  l.phys_power,
  l.soc_power,
  l.ment_power,
  l.last_deployed_night
from public.lieutenants l
join public.factions f on f.id = l.faction_id
left join public.zones z on z.id = l.current_zone_id
where l.active = true;

grant select on public.lieutenants_positions to authenticated;

create or replace view public.night_actions_view
with (security_invoker=on) as
with base as (
  select
    al.id as action_log_id,
    al.created_at as real_timestamp,
    al.night_date,
    al.player_id,
    al.action_id,
    al.action_attempt,
    al.action_result,
    p.name as player_name,
    p.character_name,
    gp.faction_id,
    f.name as faction_name,
    f.faction_color,
    a.name as action_name,
    (al.action_attempt ->> 'zone_id')::uuid as zone_id
  from public.actions_log al
  join public.players p on p.id = al.player_id
  join public.game_participants gp on gp.player_id = al.player_id
  join public.factions f on f.id = gp.faction_id
  join public.actions a on a.id = al.action_id
)
select
  b.action_log_id,
  b.night_date,
  b.real_timestamp,
  b.player_id,
  b.player_name,
  b.character_name,
  b.faction_id,
  b.faction_name,
  b.faction_color,
  b.action_id,
  b.action_name,
  b.zone_id,
  z.name as zone_name,
  b.action_attempt,
  b.action_result,
  case
    when (b.action_result ->> 'type') = 'INFLUENCE_GAIN' then 'Influencia ganada: ' || coalesce(b.action_result ->> 'value', '0')
    else 'Resultado desconocido'
  end as result_text
from base b
left join public.zones z on z.id = b.zone_id
where (b.action_attempt ->> 'type') is distinct from 'LIEUTENANT_DEPLOY'
order by b.real_timestamp desc;

grant select on public.night_actions_view to authenticated;

create or replace view public.zone_status_view
with (security_invoker=on) as
with base as (
  select
    g.id as game_id,
    z.id as zone_id,
    z.name as zone_name,
    z.influence_goal,
    z.capture_threshold,
    f.id as faction_id,
    f.name as faction_name,
    f.faction_color
  from public.games g
  join public.territories t on t.id = g.territory_id
  join public.zones z on z.territory_id = t.id
  join public.factions f on f.id = any(array[
    '5f76c894-1d09-4669-992d-62d0233f6a77'::uuid,
    '76d0589b-c582-44dd-8497-0189a09f773b'::uuid
  ])
),
ledger_sum as (
  select
    zil.game_id,
    zil.zone_id,
    zil.faction_id,
    sum(zil.delta) as influence
  from public.zone_influence_ledger zil
  group by zil.game_id, zil.zone_id, zil.faction_id
),
state as (
  select
    b.game_id,
    b.zone_id,
    b.zone_name,
    b.influence_goal,
    b.capture_threshold,
    b.faction_id,
    b.faction_name,
    b.faction_color,
    coalesce(ls.influence, 0::bigint) as influence
  from base b
  left join ledger_sum ls
    on ls.game_id = b.game_id
   and ls.zone_id = b.zone_id
   and ls.faction_id = b.faction_id
),
pivot as (
  select
    s.game_id,
    s.zone_id,
    s.zone_name,
    s.influence_goal,
    s.capture_threshold,
    max(case when s.faction_name = 'La Cuadrilla' then s.influence end) as influence_cuadrilla,
    max(case when s.faction_name = 'La Banda de Loquillo' then s.influence end) as influence_loquillo,
    max(case when s.faction_name = 'La Cuadrilla' then s.faction_color end) as cuadrilla_color,
    max(case when s.faction_name = 'La Banda de Loquillo' then s.faction_color end) as loquillo_color
  from state s
  group by s.game_id, s.zone_id, s.zone_name, s.influence_goal, s.capture_threshold
)
select
  game_id,
  zone_id,
  zone_name,
  influence_goal,
  capture_threshold,
  influence_cuadrilla,
  influence_loquillo,
  influence_goal - (influence_cuadrilla + influence_loquillo) as neutral,
  case
    when influence_cuadrilla = 0 and influence_loquillo = 0 then 'NEUTRAL'
    when influence_cuadrilla >= capture_threshold and influence_cuadrilla > influence_loquillo then 'CONTROLLED'
    when influence_loquillo >= capture_threshold and influence_loquillo > influence_cuadrilla then 'CONTROLLED'
    else 'DISPUTED'
  end as control_state,
  case
    when influence_cuadrilla >= capture_threshold and influence_cuadrilla > influence_loquillo then 'La Cuadrilla'
    when influence_loquillo >= capture_threshold and influence_loquillo > influence_cuadrilla then 'La Banda de Loquillo'
    else null
  end as controlling_faction,
  case
    when influence_cuadrilla >= capture_threshold and influence_cuadrilla > influence_loquillo then cuadrilla_color
    when influence_loquillo >= capture_threshold and influence_loquillo > influence_cuadrilla then loquillo_color
    else null
  end as controlling_color,
  case
    when influence_cuadrilla >= capture_threshold and influence_cuadrilla > influence_loquillo then '5f76c894-1d09-4669-992d-62d0233f6a77'::uuid
    when influence_loquillo >= capture_threshold and influence_loquillo > influence_cuadrilla then '76d0589b-c582-44dd-8497-0189a09f773b'::uuid
    else null::uuid
  end as controlling_faction_id
from pivot;

grant select on public.zone_status_view to authenticated;

create or replace view public.territory_status_view
with (security_invoker=on) as
with zone_data as (
  select
    zs.game_id,
    z.territory_id,
    zs.zone_id,
    zs.zone_name,
    zs.influence_goal,
    zs.capture_threshold,
    zs.influence_cuadrilla,
    zs.influence_loquillo,
    zs.neutral,
    zs.control_state,
    zs.controlling_faction
  from public.zone_status_view zs
  join public.zones z on z.id = zs.zone_id
),
agg as (
  select
    zd.game_id,
    zd.territory_id,
    count(*) as total_zones,
    sum(zd.influence_goal) as total_influence_goal,
    sum(zd.influence_cuadrilla) as total_cuadrilla_points,
    sum(zd.influence_loquillo) as total_loquillo_points,
    count(*) filter (where zd.controlling_faction = 'La Cuadrilla') as cuadrilla_zones,
    count(*) filter (where zd.controlling_faction = 'La Banda de Loquillo') as loquillo_zones
  from zone_data zd
  group by zd.game_id, zd.territory_id
),
decided as (
  select
    a.game_id,
    a.territory_id,
    a.total_zones,
    a.total_influence_goal,
    a.total_cuadrilla_points,
    a.total_loquillo_points,
    a.cuadrilla_zones,
    a.loquillo_zones,
    a.total_influence_goal::numeric - (a.total_cuadrilla_points + a.total_loquillo_points) as neutral_points,
    case
      when a.cuadrilla_zones::numeric > (a.total_zones::numeric / 2.0) then 'La Cuadrilla'
      when a.loquillo_zones::numeric > (a.total_zones::numeric / 2.0) then 'La Banda de Loquillo'
      else null
    end as controlling_faction,
    case
      when a.total_cuadrilla_points = 0::numeric and a.total_loquillo_points = 0::numeric then 'NEUTRAL'
      when a.cuadrilla_zones::numeric > (a.total_zones::numeric / 2.0) then 'CONTROLLED'
      when a.loquillo_zones::numeric > (a.total_zones::numeric / 2.0) then 'CONTROLLED'
      else 'DISPUTED'
    end as control_state
  from agg a
),
with_color as (
  select
    d.game_id,
    d.territory_id,
    d.total_zones,
    d.total_influence_goal,
    d.total_cuadrilla_points,
    d.total_loquillo_points,
    d.cuadrilla_zones,
    d.loquillo_zones,
    d.neutral_points,
    d.controlling_faction,
    d.control_state,
    f.faction_color as controlling_color
  from decided d
  left join public.factions f on f.name = d.controlling_faction
)
select
  wc.game_id,
  wc.territory_id,
  t.name as territory_name,
  wc.total_zones,
  wc.cuadrilla_zones,
  wc.loquillo_zones,
  wc.total_influence_goal,
  wc.total_cuadrilla_points,
  wc.total_loquillo_points,
  wc.neutral_points,
  wc.control_state,
  wc.controlling_faction,
  wc.controlling_color
from with_color wc
join public.territories t on t.id = wc.territory_id;

grant select on public.territory_status_view to authenticated;

create or replace view public.chronicle_storage_usage
with (security_invoker=on) as
select
  c.id as chronicle_id,
  c.name as chronicle_name,
  public.get_chronicle_storage_usage_bytes(c.id) as usage_bytes,
  public.get_chronicle_storage_limit_bytes(c.id) as limit_bytes,
  case
    when public.get_chronicle_storage_limit_bytes(c.id) is null then null::bigint
    else greatest(
      public.get_chronicle_storage_limit_bytes(c.id) - public.get_chronicle_storage_usage_bytes(c.id),
      0
    )
  end as remaining_bytes
from public.chronicles c;

grant select on public.chronicle_storage_usage to authenticated;

commit;
