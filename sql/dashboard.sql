-- =========================================================================
-- Admin Dashboard — Phase 1
--
-- 6 dash_* tables, dice_roll capture trigger, RPCs (log_pings, refresh), RLS.
-- See docs/plans/2026-05-03-admin-dashboard.md for the full plan.
--
-- Applied to project queitmvjucbjoeodsgqk on 2026-05-03 via Supabase MCP
-- as migrations:
--   - dashboard_phase1
--   - dashboard_phase1_security_hardening
--   - dashboard_phase3_overview_rpcs
--   - dashboard_phase3_overview_players_detail
--   - dashboard_phase3_overview_narrators_detail
--   - dashboard_phase3_sessions_avg_ones
--   - dashboard_phase3_buckets_for_closed_sessions
--   - dashboard_phase3_fix_boundary_offbyone
--   - dashboard_phase3_buckets_distinguish_npcs
--   - dashboard_phase3_overview_session_chronicle_id
--   - dashboard_phase3_get_message_conversation
--   - dashboard_phase3_conversation_threads
--   - dashboard_phase3_buckets_by_conversation
--   - dashboard_phase3_overview_characters_detail (v2 — uses chronicle_characters join)
-- This file is the consolidated source of truth.
-- =========================================================================

-- 1. dash_dice_rolls — log de tiradas (poblado por trigger)
create table if not exists public.dash_dice_rolls (
  id                  uuid primary key default gen_random_uuid(),
  notification_id     uuid unique references public.chronicle_notifications(id) on delete set null,
  chronicle_id        uuid not null references public.chronicles(id) on delete cascade,
  player_id           uuid references public.players(id) on delete set null,
  character_sheet_id  uuid,
  character_name      text,
  pool                int,
  difficulty          int,
  results             int[] not null default '{}',
  successes           int not null default 0,
  is_botch            boolean not null default false,
  status              text,
  roll_type           text,
  roll_name           text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists idx_dash_dice_rolls_chronicle_created
  on public.dash_dice_rolls (chronicle_id, created_at desc);
create index if not exists idx_dash_dice_rolls_player_created
  on public.dash_dice_rolls (player_id, created_at desc);
create index if not exists idx_dash_dice_rolls_created
  on public.dash_dice_rolls (created_at desc);

-- 2. dash_user_activity_pings — heartbeats crudos
create table if not exists public.dash_user_activity_pings (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  route         text not null default '',
  chronicle_id  uuid references public.chronicles(id) on delete set null,
  pinged_at     timestamptz not null default now()
);
create index if not exists idx_dash_pings_user_pinged
  on public.dash_user_activity_pings (user_id, pinged_at desc);
create index if not exists idx_dash_pings_pinged
  on public.dash_user_activity_pings (pinged_at desc);
create index if not exists idx_dash_pings_chronicle
  on public.dash_user_activity_pings (chronicle_id)
  where chronicle_id is not null;

-- 3. dash_user_activity_daily — agregado por (user, día, ruta)
create table if not exists public.dash_user_activity_daily (
  user_id        uuid not null references auth.users(id) on delete cascade,
  day            date not null,
  route          text not null default '',
  seconds_active int not null default 0,
  ping_count     int not null default 0,
  primary key (user_id, day, route)
);
create index if not exists idx_dash_daily_day on public.dash_user_activity_daily (day desc);

-- 4. dash_inferred_sessions — partidas inferidas (gap > 8h cierra sesión)
create table if not exists public.dash_inferred_sessions (
  id                uuid primary key default gen_random_uuid(),
  chronicle_id      uuid not null references public.chronicles(id) on delete cascade,
  started_at        timestamptz not null,
  ended_at          timestamptz not null,
  duration_min      int not null,
  participants      uuid[] not null default '{}',
  roll_count        int not null default 0,
  message_count     int not null default 0,
  avg_pool          numeric(5,2),
  avg_successes     numeric(5,2),
  avg_ones          numeric(5,2),
  is_closed         boolean not null default false,
  last_activity_at  timestamptz not null
);
create index if not exists idx_dash_sessions_chronicle_started
  on public.dash_inferred_sessions (chronicle_id, started_at desc);
create index if not exists idx_dash_sessions_open
  on public.dash_inferred_sessions (chronicle_id) where is_closed = false;

-- 5. dash_session_activity_buckets — pulse chart (5 min buckets)
-- Keyed by (session, bucket_start, character_sheet_id, recipient_type, recipient_id)
-- so a single character with multiple conversations in the same bucket gets
-- one row per conversation (stacked separately on the chart). For rolls,
-- recipient_type and recipient_id stay null.
create table if not exists public.dash_session_activity_buckets (
  id                  bigserial primary key,
  session_id          uuid not null references public.dash_inferred_sessions(id) on delete cascade,
  bucket_start        timestamptz not null,
  character_sheet_id  uuid,
  recipient_type      text,
  recipient_id        uuid,
  roll_count          int not null default 0,
  message_count       int not null default 0
);
create unique index if not exists idx_dash_buckets_unique
  on public.dash_session_activity_buckets (
    session_id,
    bucket_start,
    coalesce(character_sheet_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(recipient_type, ''),
    coalesce(recipient_id,   '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists idx_dash_buckets_session
  on public.dash_session_activity_buckets (session_id, bucket_start);

-- 6. dash_snapshot — KPIs estado actual (1 fila)
create table if not exists public.dash_snapshot (
  id           int primary key check (id = 1),
  data         jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);
insert into public.dash_snapshot (id, data, refreshed_at)
values (1, '{}'::jsonb, now())
on conflict (id) do nothing;

-- =========================================================================
-- TRIGGER: capture dice_roll notifications into dash_dice_rolls
-- Defensive: any error inside the function is swallowed so it can never
-- break the originating INSERT into chronicle_notifications.
-- =========================================================================

create or replace function public.dash_capture_dice_roll()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  meta jsonb;
  rolls_array int[];
  succ int;
  is_pifia boolean := false;
  body_text text;
begin
  if new.type <> 'dice_roll' then
    return new;
  end if;

  begin
    meta := coalesce(new.metadata, '{}'::jsonb);
    body_text := coalesce(new.body, meta->>'result', '');

    select coalesce(array_agg(elem::int), '{}'::int[])
      into rolls_array
      from jsonb_array_elements_text(coalesce(meta->'rolls','[]'::jsonb)) as elem;

    if body_text ilike '%pifia%' or coalesce(meta->>'status','') ilike '%botch%' then
      is_pifia := true;
      succ := 0;
    else
      succ := nullif((regexp_match(body_text, '(\d+)\s*[ÉéEe]xito'))[1], '')::int;
      if succ is null then
        succ := 0;
      end if;
    end if;

    insert into public.dash_dice_rolls (
      notification_id, chronicle_id, player_id, character_sheet_id,
      character_name, pool, difficulty, results, successes, is_botch,
      status, roll_type, roll_name, metadata, created_at
    ) values (
      new.id,
      new.chronicle_id,
      new.actor_player_id,
      nullif(meta->>'sheetId','')::uuid,
      meta->>'characterName',
      nullif(meta->>'totalPool','')::int,
      nullif(meta->>'difficulty','')::int,
      coalesce(rolls_array, '{}'::int[]),
      succ,
      is_pifia,
      meta->>'status',
      meta->>'rollType',
      meta->>'rollName',
      meta,
      new.created_at
    )
    on conflict (notification_id) do nothing;
  exception when others then
    raise warning 'dash_capture_dice_roll failed for notif %: %', new.id, sqlerrm;
  end;

  return new;
end;
$fn$;

drop trigger if exists trg_dash_capture_dice_roll on public.chronicle_notifications;
create trigger trg_dash_capture_dice_roll
  after insert on public.chronicle_notifications
  for each row
  when (new.type = 'dice_roll')
  execute function public.dash_capture_dice_roll();

-- Backfill existing dice_roll notifications (the survivors of the auto-prune)
insert into public.dash_dice_rolls (
  notification_id, chronicle_id, player_id, character_sheet_id,
  character_name, pool, difficulty, results, successes, is_botch,
  status, roll_type, roll_name, metadata, created_at
)
select
  n.id,
  n.chronicle_id,
  n.actor_player_id,
  nullif(n.metadata->>'sheetId','')::uuid,
  n.metadata->>'characterName',
  nullif(n.metadata->>'totalPool','')::int,
  nullif(n.metadata->>'difficulty','')::int,
  coalesce(
    (select array_agg(v::int)
       from jsonb_array_elements_text(coalesce(n.metadata->'rolls','[]'::jsonb)) as v),
    '{}'::int[]
  ),
  case
    when coalesce(n.body, n.metadata->>'result','') ilike '%pifia%' then 0
    else coalesce(
      nullif((regexp_match(coalesce(n.body, n.metadata->>'result',''), '(\d+)\s*[ÉéEe]xito'))[1],'')::int,
      0
    )
  end,
  coalesce(n.body, n.metadata->>'result','') ilike '%pifia%',
  n.metadata->>'status',
  n.metadata->>'rollType',
  n.metadata->>'rollName',
  n.metadata,
  n.created_at
from public.chronicle_notifications n
where n.type = 'dice_roll'
on conflict (notification_id) do nothing;

-- =========================================================================
-- RPC: log a batch of pings from the client
-- Called by js/dash-heartbeat.js with a jsonb array:
--   [{ "route": "#chronicle", "chronicle_id": "...", "pinged_at": "ISO" }, ...]
-- =========================================================================

create or replace function public.dash_log_pings(p_pings jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  n int := 0;
begin
  if uid is null then
    return 0;
  end if;
  if jsonb_typeof(coalesce(p_pings,'null'::jsonb)) <> 'array' then
    return 0;
  end if;

  insert into public.dash_user_activity_pings (user_id, route, chronicle_id, pinged_at)
  select
    uid,
    coalesce(p->>'route', ''),
    nullif(p->>'chronicle_id','')::uuid,
    coalesce(nullif(p->>'pinged_at','')::timestamptz, now())
  from jsonb_array_elements(p_pings) as p;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- =========================================================================
-- RPC: refresh dashboard. Admin only.
-- Incremental: closed sessions are immutable, only today's daily activity
-- and open sessions/buckets get recomputed.
-- =========================================================================

create or replace function public.dash_refresh()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_now timestamptz := now();
  v_today date := current_date;
  v_since timestamptz;
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  -- 1. Reaggregate today's user_activity_daily (past days are immutable)
  delete from public.dash_user_activity_daily where day = v_today;

  insert into public.dash_user_activity_daily (user_id, day, route, seconds_active, ping_count)
  with ordered as (
    select user_id, route, pinged_at,
           lag(pinged_at) over (partition by user_id, route order by pinged_at) as prev_at
      from public.dash_user_activity_pings
     where pinged_at >= v_today and pinged_at < v_today + interval '1 day'
  ),
  with_gap as (
    select user_id, route,
      case
        when prev_at is null then 0
        when extract(epoch from (pinged_at - prev_at)) > 120 then 0
        else extract(epoch from (pinged_at - prev_at))::int
      end as gap_seconds
    from ordered
  )
  select user_id, v_today, route,
         coalesce(sum(gap_seconds), 0)::int,
         count(*)::int
    from with_gap
   group by user_id, route;

  -- 2. Recompute sessions since MAX(ended_at) of closed sessions
  select coalesce(max(ended_at), '1970-01-01'::timestamptz)
    into v_since
    from public.dash_inferred_sessions
   where is_closed = true;

  delete from public.dash_inferred_sessions where is_closed = false;

  insert into public.dash_inferred_sessions (
    chronicle_id, started_at, ended_at, duration_min, participants,
    roll_count, message_count, avg_pool, avg_successes, avg_ones,
    is_closed, last_activity_at
  )
  -- Strict `>` so the boundary action (already accounted for in the most
  -- recent closed session) is not re-included as a singleton on each refresh.
  with actions as (
    select chronicle_id, created_at, 'roll'::text as kind,
           player_id, character_sheet_id,
           pool, successes,
           (select count(*) from unnest(results) as v where v = 1)::int as ones_count
      from public.dash_dice_rolls
     where created_at > v_since
    union all
    select cm.chronicle_id, cm.created_at, 'msg'::text,
           cm.created_by_player_id,
           case when cm.sender_type = 'pc' then cm.sender_id else null end,
           null::int, null::int, null::int
      from public.chronicle_messages cm
     where cm.created_at > v_since
  ),
  gapped as (
    select *,
      case
        when lag(created_at) over (partition by chronicle_id order by created_at) is null
          or extract(epoch from (created_at - lag(created_at) over (partition by chronicle_id order by created_at))) > 8*3600
        then 1 else 0
      end as is_new
    from actions
  ),
  seq as (
    select *,
      sum(is_new) over (partition by chronicle_id order by created_at
                        rows between unbounded preceding and current row) as session_seq
    from gapped
  ),
  grouped as (
    select chronicle_id, session_seq,
           min(created_at) as started_at,
           max(created_at) as ended_at,
           coalesce(array_agg(distinct player_id) filter (where player_id is not null), '{}'::uuid[]) as participants,
           (count(*) filter (where kind = 'roll'))::int as roll_count,
           (count(*) filter (where kind = 'msg'))::int as message_count,
           round((avg(pool)       filter (where kind = 'roll'))::numeric, 2) as avg_pool,
           round((avg(successes)  filter (where kind = 'roll'))::numeric, 2) as avg_successes,
           round((avg(ones_count) filter (where kind = 'roll'))::numeric, 2) as avg_ones
      from seq
     group by chronicle_id, session_seq
  )
  select
    g.chronicle_id, g.started_at, g.ended_at,
    greatest(1, ceil(extract(epoch from (g.ended_at - g.started_at)) / 60))::int,
    g.participants,
    g.roll_count, g.message_count, g.avg_pool, g.avg_successes, g.avg_ones,
    g.ended_at < v_now - interval '8 hours',
    g.ended_at
  from grouped g;

  -- 3. Buckets: drop stale ones from open sessions, then fill any session
  -- that doesn't have buckets yet (covers freshly created closed sessions).
  -- Closed sessions with existing buckets are left untouched (immutable).
  delete from public.dash_session_activity_buckets b
  using public.dash_inferred_sessions s
  where b.session_id = s.id and s.is_closed = false;

  insert into public.dash_session_activity_buckets (
    session_id, bucket_start, character_sheet_id,
    recipient_type, recipient_id, roll_count, message_count
  )
  with target_sessions as (
    select s.id, s.chronicle_id, s.started_at, s.ended_at
      from public.dash_inferred_sessions s
     where not exists (
       select 1 from public.dash_session_activity_buckets b where b.session_id = s.id
     )
  ),
  all_actions as (
    select ts.id as session_id,
           date_bin('5 minutes'::interval, dr.created_at, '2000-01-01'::timestamptz) as bucket_start,
           dr.character_sheet_id,
           null::text as recipient_type,
           null::uuid as recipient_id,
           1 as roll_count, 0 as message_count
      from target_sessions ts
      join public.dash_dice_rolls dr
        on dr.chronicle_id = ts.chronicle_id
       and dr.created_at between ts.started_at and ts.ended_at
    union all
    select ts.id,
           date_bin('5 minutes'::interval, cm.created_at, '2000-01-01'::timestamptz),
           case when cm.sender_type = 'pc' then cm.sender_id else null end,
           cm.recipient_type,
           cm.recipient_id,
           0, 1
      from target_sessions ts
      join public.chronicle_messages cm
        on cm.chronicle_id = ts.chronicle_id
       and cm.created_at between ts.started_at and ts.ended_at
  )
  select session_id, bucket_start, character_sheet_id,
         recipient_type, recipient_id,
         sum(roll_count)::int, sum(message_count)::int
    from all_actions
   group by session_id, bucket_start, character_sheet_id, recipient_type, recipient_id;

  -- 4. Snapshot — current-state KPIs
  update public.dash_snapshot
  set data = jsonb_build_object(
    'total_players',           (select count(*) from public.players),
    'total_narrators',         (select count(distinct cp.player_id) from public.chronicle_participants cp where cp.role = 'narrator'),
    'total_characters',        (select count(*) from public.character_sheets),
    'active_chronicles',       (select count(*) from public.chronicles where status = 'active'),
    'rolls_30d',               (select count(*) from public.dash_dice_rolls where created_at > v_now - interval '30 days'),
    'messages_30d',            (select count(*) from public.chronicle_messages where created_at > v_now - interval '30 days'),
    'total_inferred_sessions', (select count(*) from public.dash_inferred_sessions),
    'avg_chars_per_player',    coalesce((select round(avg(c)::numeric, 2) from (
                                  select count(*)::numeric as c from public.character_sheets
                                  where user_id is not null group by user_id
                                ) t), 0),
    'avg_players_per_chronicle', coalesce((select round(avg(c)::numeric, 2) from (
                                  select count(*)::numeric as c from public.chronicle_participants
                                  group by chronicle_id
                                ) t), 0)
  ),
  refreshed_at = v_now
  where id = 1;

  return v_now;
end;
$fn$;

-- =========================================================================
-- RLS — admin-only SELECT on every dash_* table.
-- No INSERT/UPDATE/DELETE policies → only the trigger and SECURITY DEFINER
-- RPCs (running as table owner) write to these tables.
-- =========================================================================

alter table public.dash_dice_rolls               enable row level security;
alter table public.dash_user_activity_pings      enable row level security;
alter table public.dash_user_activity_daily      enable row level security;
alter table public.dash_inferred_sessions        enable row level security;
alter table public.dash_session_activity_buckets enable row level security;
alter table public.dash_snapshot                 enable row level security;

do $do$
declare
  t text;
begin
  for t in select unnest(array[
    'dash_dice_rolls','dash_user_activity_pings','dash_user_activity_daily',
    'dash_inferred_sessions','dash_session_activity_buckets','dash_snapshot'
  ]) loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_current_user_admin())',
      t || '_admin_select', t
    );
  end loop;
end$do$;

-- =========================================================================
-- Grants — only authenticated can call the user-facing RPCs.
-- The trigger function is never called directly: revoke it from everyone
-- public-facing so it doesn't show up as a callable RPC.
-- =========================================================================

revoke all on function public.dash_capture_dice_roll() from public, anon, authenticated;

revoke all on function public.dash_log_pings(jsonb) from public, anon;
revoke all on function public.dash_refresh()        from public, anon;
grant execute on function public.dash_log_pings(jsonb) to authenticated;
grant execute on function public.dash_refresh()        to authenticated;

-- =========================================================================
-- Helper RPCs for the dashboard UI (single-roundtrip data fetchers).
-- Both admin-gated.
-- =========================================================================

create or replace function public.dash_get_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_snapshot record;
  v_now timestamptz := now();
  v_since_7d date := (v_now - interval '7 days')::date;
  v_since_4w date := (v_now - interval '28 days')::date;
  v_top_users jsonb;
  v_chronicles jsonb;
  v_players_detail jsonb;
  v_narrators_detail jsonb;
  v_characters_detail jsonb;
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  select data, refreshed_at into v_snapshot from public.dash_snapshot where id = 1;

  -- Top users by activity in last 7 days, with their most-used route
  select coalesce(jsonb_agg(t order by t.seconds_active desc), '[]'::jsonb)
    into v_top_users
  from (
    select
      d.user_id,
      coalesce(p.name, '—') as player_name,
      sum(d.seconds_active)::int as seconds_active,
      (
        select route
          from public.dash_user_activity_daily d2
         where d2.user_id = d.user_id and d2.day >= v_since_7d
         group by route
         order by sum(seconds_active) desc
         limit 1
      ) as top_route
    from public.dash_user_activity_daily d
    left join public.players p on p.user_id = d.user_id
    where d.day >= v_since_7d
    group by d.user_id, p.name
  ) t;

  -- All chronicles, with their inferred sessions (newest first)
  select coalesce(jsonb_agg(c order by c.last_activity_at desc nulls last), '[]'::jsonb)
    into v_chronicles
  from (
    select
      c.id,
      c.name,
      c.status,
      (select max(s.ended_at) from public.dash_inferred_sessions s where s.chronicle_id = c.id) as last_activity_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',                s.id,
          'chronicle_id',      s.chronicle_id,
          'started_at',        s.started_at,
          'ended_at',          s.ended_at,
          'duration_min',      s.duration_min,
          'roll_count',        s.roll_count,
          'message_count',     s.message_count,
          'avg_pool',          s.avg_pool,
          'avg_successes',     s.avg_successes,
          'avg_ones',          s.avg_ones,
          'is_closed',         s.is_closed,
          'participant_names', (
            select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
              from public.players p
             where p.id = any(s.participants)
          )
        ) order by s.started_at desc)
        from public.dash_inferred_sessions s
        where s.chronicle_id = c.id
      ), '[]'::jsonb) as sessions
    from public.chronicles c
  ) c;

  -- Per-player detail (drill-down for "Jugadores" KPI).
  -- avg_weekly_seconds_4w = avg of weekly activity over last 4 weeks (28 days).
  select coalesce(jsonb_agg(t order by t.name nulls last), '[]'::jsonb)
    into v_players_detail
  from (
    select
      p.id,
      p.name,
      p.email,
      p.joined_at,
      p.is_admin,
      (select count(*)::int from public.character_sheets cs
        where cs.user_id = p.user_id) as character_count,
      (select count(*)::int from public.chronicle_participants cp
        where cp.player_id = p.id) as chronicle_count,
      (select count(*)::int from public.chronicle_participants cp
        where cp.player_id = p.id and cp.role = 'narrator') as narrator_chronicle_count,
      coalesce((
        select round(sum(d.seconds_active)::numeric / 4)
          from public.dash_user_activity_daily d
         where d.user_id = p.user_id and d.day >= v_since_4w
      ), 0)::int as avg_weekly_seconds_4w
    from public.players p
  ) t;

  -- Narrators detail (drill-down for "Narradores" KPI).
  -- Only players who narrate >= 1 chronicle.
  -- total_storage_bytes = sum across the chronicles they narrate.
  select coalesce(jsonb_agg(t order by t.chronicle_count desc, t.name nulls last), '[]'::jsonb)
    into v_narrators_detail
  from (
    select
      p.id,
      p.name,
      p.joined_at,
      count(*)::int as chronicle_count,
      coalesce(jsonb_agg(c.name order by c.name), '[]'::jsonb) as chronicle_names,
      coalesce(sum(coalesce(su.usage_bytes, 0))::bigint, 0) as total_storage_bytes
    from public.chronicle_participants cp
    join public.players p     on p.id = cp.player_id
    join public.chronicles c  on c.id = cp.chronicle_id
    left join public.chronicle_storage_usage su on su.chronicle_id = c.id
    where cp.role = 'narrator'
    group by p.id, p.name, p.joined_at
  ) t;

  -- Per-character detail. Chronicle association via chronicle_characters join.
  -- activity = lifetime rolls + messages from this character.
  select coalesce(jsonb_agg(t order by t.activity desc nulls last, t.name nulls last), '[]'::jsonb)
    into v_characters_detail
  from (
    select
      cs.id,
      coalesce(nullif(cs.data->>'nombre', ''), nullif(cs.name, ''), 'Sin nombre') as name,
      nullif(cs.data->>'clan', '')        as clan,
      nullif(cs.data->>'generacion', '')  as generation,
      coalesce(p.name, '—')               as player_name,
      c.id                                 as chronicle_id,
      c.name                               as chronicle_name,
      cs.created_at,
      (
        coalesce((select count(*) from public.dash_dice_rolls dr
                  where dr.character_sheet_id = cs.id), 0)
        +
        coalesce((select count(*) from public.chronicle_messages cm
                  where cm.sender_type = 'pc' and cm.sender_id = cs.id), 0)
      )::int as activity
    from public.character_sheets cs
    left join public.players p              on p.user_id = cs.user_id
    left join public.chronicle_characters cc on cc.character_sheet_id = cs.id
    left join public.chronicles c           on c.id = cc.chronicle_id
  ) t;

  return jsonb_build_object(
    'snapshot',          coalesce(v_snapshot.data, '{}'::jsonb),
    'refreshed_at',      v_snapshot.refreshed_at,
    'top_users',         v_top_users,
    'chronicles',        v_chronicles,
    'players_detail',    v_players_detail,
    'narrators_detail',  v_narrators_detail,
    'characters_detail', v_characters_detail
  );
end;
$fn$;

create or replace function public.dash_get_session_buckets(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  result jsonb;
  v_chronicle_id uuid;
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  select s.chronicle_id into v_chronicle_id
  from public.dash_inferred_sessions s
  where s.id = p_session_id;

  -- character_name is NULL when there's no matching sheet (NPC messages or
  -- deleted sheets). recipient_* are NULL for rolls. recipient_label is
  -- resolved from phone_groups for groups, or from a sample message for pairs.
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket_start',       b.bucket_start,
    'character_sheet_id', b.character_sheet_id,
    'character_name',     cs.data->>'nombre',
    'recipient_type',     b.recipient_type,
    'recipient_id',       b.recipient_id,
    'recipient_label',
      case
        when b.recipient_type is null then null
        when b.recipient_type = 'group' then (
          select pg.name from public.phone_groups pg where pg.id = b.recipient_id
        )
        else (
          select cm.recipient_label
            from public.chronicle_messages cm
           where cm.chronicle_id   = v_chronicle_id
             and cm.recipient_type = b.recipient_type
             and cm.recipient_id   = b.recipient_id
           order by cm.created_at desc
           limit 1
        )
      end,
    'roll_count',         b.roll_count,
    'message_count',      b.message_count
  ) order by b.bucket_start), '[]'::jsonb)
  into result
  from public.dash_session_activity_buckets b
  left join public.character_sheets cs on cs.id = b.character_sheet_id
  where b.session_id = p_session_id;

  return result;
end;
$fn$;

revoke all on function public.dash_get_overview()             from public, anon;
revoke all on function public.dash_get_session_buckets(uuid)  from public, anon;
grant execute on function public.dash_get_overview()          to authenticated;
grant execute on function public.dash_get_session_buckets(uuid) to authenticated;

-- =========================================================================
-- Returns the full conversation that contains a message in the given bucket
-- from the given actor. Handles both 1:1 (pair) and group conversations.
-- =========================================================================

-- Now driven by an explicit recipient (the chart bar segment uniquely
-- identifies a conversation, so the client passes recipient_type/_id).
create or replace function public.dash_get_message_conversation(
  p_chronicle_id   uuid,
  p_actor_sheet_id uuid,                -- character_sheets.id when actor is PC; null = NPC
  p_recipient_type text,
  p_recipient_id   uuid,
  p_bucket_start   timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_bucket_end   timestamptz := p_bucket_start + interval '5 minutes';
  v_messages     jsonb;
  v_group_name   text;
  v_group_members jsonb;
  v_actor_type   text;
  v_actor_id     uuid;
  v_actor_label  text;
  v_other_label  text;
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  if p_recipient_type = 'group' then
    select pg.name into v_group_name
      from public.phone_groups pg
     where pg.id = p_recipient_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'type',  m.entity_type,
      'id',    m.entity_id,
      'label', m.entity_label
    ) order by m.entity_label), '[]'::jsonb)
    into v_group_members
    from public.phone_group_members m
    where m.group_id = p_recipient_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',              cm.id,
      'sender_type',     cm.sender_type,
      'sender_id',       cm.sender_id,
      'sender_label',    cm.sender_label,
      'recipient_type',  cm.recipient_type,
      'recipient_id',    cm.recipient_id,
      'recipient_label', cm.recipient_label,
      'body',            cm.body,
      'created_at',      cm.created_at
    ) order by cm.created_at), '[]'::jsonb)
    into v_messages
    from public.chronicle_messages cm
    where cm.chronicle_id = p_chronicle_id
      and cm.recipient_type = 'group'
      and cm.recipient_id   = p_recipient_id;

    return jsonb_build_object(
      'kind',          'group',
      'group_name',    coalesce(v_group_name, '—'),
      'group_id',      p_recipient_id,
      'group_members', v_group_members,
      'messages',      v_messages,
      'bucket_start',  p_bucket_start,
      'bucket_end',    v_bucket_end
    );
  end if;

  -- Pair: pull a sample message of the actor → recipient to capture identity & labels
  select cm.sender_type, cm.sender_id, cm.sender_label, cm.recipient_label
    into v_actor_type, v_actor_id, v_actor_label, v_other_label
  from public.chronicle_messages cm
  where cm.chronicle_id = p_chronicle_id
    and cm.recipient_type = p_recipient_type
    and cm.recipient_id   = p_recipient_id
    and (
      (p_actor_sheet_id is not null and cm.sender_type = 'pc' and cm.sender_id = p_actor_sheet_id)
      or
      (p_actor_sheet_id is null     and cm.sender_type = 'npc')
    )
    and cm.created_at >= p_bucket_start
    and cm.created_at <  v_bucket_end
  order by cm.created_at
  limit 1;

  if v_actor_type is null then
    return jsonb_build_object(
      'kind',         'empty',
      'messages',     '[]'::jsonb,
      'bucket_start', p_bucket_start,
      'bucket_end',   v_bucket_end
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              cm.id,
    'sender_type',     cm.sender_type,
    'sender_id',       cm.sender_id,
    'sender_label',    cm.sender_label,
    'recipient_type',  cm.recipient_type,
    'recipient_id',    cm.recipient_id,
    'recipient_label', cm.recipient_label,
    'body',            cm.body,
    'created_at',      cm.created_at
  ) order by cm.created_at), '[]'::jsonb)
  into v_messages
  from public.chronicle_messages cm
  where cm.chronicle_id = p_chronicle_id
    and (
      (cm.sender_type = v_actor_type and cm.sender_id = v_actor_id
       and cm.recipient_type = p_recipient_type and cm.recipient_id = p_recipient_id)
      or
      (cm.sender_type = p_recipient_type and cm.sender_id = p_recipient_id
       and cm.recipient_type = v_actor_type and cm.recipient_id = v_actor_id)
    );

  return jsonb_build_object(
    'kind',         'pair',
    'a_label',      coalesce(v_actor_label, '—'),
    'a_type',       v_actor_type,
    'a_id',         v_actor_id,
    'b_label',      coalesce(v_other_label, '—'),
    'b_type',       p_recipient_type,
    'b_id',         p_recipient_id,
    'messages',     v_messages,
    'bucket_start', p_bucket_start,
    'bucket_end',   v_bucket_end
  );
end;
$fn$;

revoke all on function public.dash_get_message_conversation(uuid, uuid, text, uuid, timestamptz) from public, anon;
grant execute on function public.dash_get_message_conversation(uuid, uuid, text, uuid, timestamptz) to authenticated;
