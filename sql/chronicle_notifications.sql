-- Sistema de notificaciones cross-crónicas
-- Cada notificación pertenece a una crónica, pero el centro de notificaciones
-- del usuario muestra TODAS las notificaciones de TODAS sus crónicas.
-- El cursor de lectura es global por jugador (no por crónica).

-- ============================================================
-- 1. Tabla principal de notificaciones
-- ============================================================

create table if not exists public.chronicle_notifications (
  id              uuid primary key default gen_random_uuid(),
  chronicle_id    uuid not null references public.chronicles(id) on delete cascade,
  type            text not null check (type in (
    'dice_roll', 'revelation', 'encounter_status', 'session_start',
    'session_end', 'player_joined', 'system'
  )),
  title           text not null check (char_length(title) <= 200),
  body            text not null default '',
  icon            text null,
  metadata        jsonb not null default '{}',
  actor_player_id uuid null references public.players(id) on delete set null,
  visibility      text not null default 'all' check (visibility in ('all', 'targeted')),
  target_player_ids uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 2. Cursor de lectura — global por jugador
-- ============================================================

create table if not exists public.notification_read_cursors (
  player_id     uuid primary key references public.players(id) on delete cascade,
  last_seen_at  timestamptz not null default now()
);

-- ============================================================
-- 3. Indexes
-- ============================================================

create index if not exists idx_cn_chronicle_created
  on public.chronicle_notifications (chronicle_id, created_at desc);

create index if not exists idx_cn_targeted
  on public.chronicle_notifications using gin (target_player_ids)
  where visibility = 'targeted';

create index if not exists idx_cn_type
  on public.chronicle_notifications (chronicle_id, type, created_at desc);

-- Cross-chronicle query: all notifications newest first
create index if not exists idx_cn_created
  on public.chronicle_notifications (created_at desc);

-- ============================================================
-- 4. RLS — chronicle_notifications
-- ============================================================

alter table public.chronicle_notifications enable row level security;

-- SELECT: participante de la crónica + chequeo de visibilidad
drop policy if exists cn_select on public.chronicle_notifications;
create policy cn_select
on public.chronicle_notifications
for select
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and (
    visibility = 'all'
    or exists (
      select 1 from public.players p
      where p.user_id = auth.uid()
        and (
          p.id = any(chronicle_notifications.target_player_ids)
          or exists (
            select 1 from public.chronicle_participants cp
            where cp.chronicle_id = chronicle_notifications.chronicle_id
              and cp.player_id = p.id
              and cp.role = 'narrator'
          )
          or exists (
            select 1 from public.chronicles c
            where c.id = chronicle_notifications.chronicle_id
              and c.creator_id = p.id
          )
        )
    )
  )
);

-- INSERT: cualquier participante de la crónica
drop policy if exists cn_insert on public.chronicle_notifications;
create policy cn_insert
on public.chronicle_notifications
for insert
to authenticated
with check (
  chronicle_id in (select public.get_my_chronicle_ids())
);

-- DELETE: solo narradores (para cleanup)
drop policy if exists cn_delete on public.chronicle_notifications;
create policy cn_delete
on public.chronicle_notifications
for delete
to authenticated
using (
  exists (
    select 1 from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = chronicle_notifications.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
  or exists (
    select 1 from public.chronicles c
    join public.players p on p.id = c.creator_id
    where c.id = chronicle_notifications.chronicle_id
      and p.user_id = auth.uid()
  )
);

-- ============================================================
-- 5. RLS — notification_read_cursors
-- ============================================================

alter table public.notification_read_cursors enable row level security;

drop policy if exists nrc_select on public.notification_read_cursors;
create policy nrc_select
on public.notification_read_cursors
for select
to authenticated
using (
  player_id in (select p.id from public.players p where p.user_id = auth.uid())
);

drop policy if exists nrc_insert on public.notification_read_cursors;
create policy nrc_insert
on public.notification_read_cursors
for insert
to authenticated
with check (
  player_id in (select p.id from public.players p where p.user_id = auth.uid())
);

drop policy if exists nrc_update on public.notification_read_cursors;
create policy nrc_update
on public.notification_read_cursors
for update
to authenticated
using (
  player_id in (select p.id from public.players p where p.user_id = auth.uid())
);

-- ============================================================
-- 6. RPCs
-- ============================================================

-- Conteo global de notificaciones no leídas (across all chronicles)
create or replace function public.get_unread_notification_count(
  p_player_id uuid
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.chronicle_notifications cn
  where cn.chronicle_id in (
    select cp.chronicle_id
    from public.chronicle_participants cp
    where cp.player_id = p_player_id
    union
    select c.id
    from public.chronicles c
    where c.creator_id = p_player_id
  )
  and cn.created_at > coalesce(
    (select nrc.last_seen_at
     from public.notification_read_cursors nrc
     where nrc.player_id = p_player_id),
    '1970-01-01'::timestamptz
  )
  and (
    cn.visibility = 'all'
    or p_player_id = any(cn.target_player_ids)
    or exists (
      select 1 from public.chronicle_participants cp
      where cp.chronicle_id = cn.chronicle_id
        and cp.player_id = p_player_id
        and cp.role = 'narrator'
    )
    or exists (
      select 1 from public.chronicles c
      where c.id = cn.chronicle_id
        and c.creator_id = p_player_id
    )
  );
$$;

grant execute on function public.get_unread_notification_count(uuid) to authenticated;

-- Cleanup de notificaciones viejas (per chronicle, narrator only)
create or replace function public.cleanup_old_notifications(
  p_chronicle_id uuid,
  p_days int default 30
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  delete from public.chronicle_notifications
  where chronicle_id = p_chronicle_id
    and created_at < now() - (p_days || ' days')::interval;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.cleanup_old_notifications(uuid, int) to authenticated;

-- ============================================================
-- 7. Realtime publication
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chronicle_notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.chronicle_notifications';
  end if;
end
$$;

-- ============================================================
-- 8. Triggers — notificaciones automáticas desde DB
-- ============================================================

-- Encounter status change → notification (solo in_game / archived)
create or replace function public.trg_notify_encounter_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status_label text;
begin
  if OLD.status = NEW.status then
    return NEW;
  end if;

  if NEW.status not in ('in_game', 'archived') then
    return NEW;
  end if;

  if NEW.status = 'in_game' then
    status_label := 'En Juego';
  elsif NEW.status = 'archived' then
    status_label := 'Archivado';
  end if;

  insert into public.chronicle_notifications (
    chronicle_id, type, title, icon, metadata, visibility
  ) values (
    NEW.chronicle_id,
    'encounter_status',
    coalesce(NEW.name, 'Encuentro') || ' — ' || status_label,
    'swords',
    jsonb_build_object('encounterId', NEW.id, 'newStatus', NEW.status),
    'all'
  );

  return NEW;
end;
$$;

drop trigger if exists trg_encounter_status_notification on public.encounters;
create trigger trg_encounter_status_notification
after update of status on public.encounters
for each row execute function public.trg_notify_encounter_status();

-- Revelation delivery → targeted notification per player
create or replace function public.trg_notify_revelation_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rev record;
begin
  select r.chronicle_id, r.title, r.created_by_player_id
  into rev
  from public.revelations r
  where r.id = NEW.revelation_id;

  if not found then
    return NEW;
  end if;

  insert into public.chronicle_notifications (
    chronicle_id, type, title, body, icon, metadata,
    actor_player_id, visibility, target_player_ids
  ) values (
    rev.chronicle_id,
    'revelation',
    rev.title,
    'Nueva revelacion disponible',
    'scroll',
    jsonb_build_object('revelationId', NEW.revelation_id),
    rev.created_by_player_id,
    'targeted',
    array[NEW.player_id]
  );

  return NEW;
end;
$$;

drop trigger if exists trg_revelation_delivery_notification on public.revelation_players;
create trigger trg_revelation_delivery_notification
after insert on public.revelation_players
for each row execute function public.trg_notify_revelation_delivery();

-- Auto-prune: keep only latest 10 dice_roll per chronicle
create or replace function public.trg_prune_dice_roll_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.type <> 'dice_roll' then
    return NEW;
  end if;

  delete from public.chronicle_notifications
  where id in (
    select id from public.chronicle_notifications
    where chronicle_id = NEW.chronicle_id
      and type = 'dice_roll'
    order by created_at desc
    offset 10
  );

  return NEW;
end;
$$;

drop trigger if exists trg_prune_dice_rolls on public.chronicle_notifications;
create trigger trg_prune_dice_rolls
after insert on public.chronicle_notifications
for each row execute function public.trg_prune_dice_roll_notifications();
