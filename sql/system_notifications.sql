-- Global system notifications.
-- These reuse chronicle_notifications with chronicle_id = null so they appear
-- in the existing notification drawer, unread badge, and realtime channel.

-- Allow global system rows without a chronicle.
alter table public.chronicle_notifications
  alter column chronicle_id drop not null;

alter table public.chronicle_notifications
  drop constraint if exists chronicle_notifications_type_check;

alter table public.chronicle_notifications
  add constraint chronicle_notifications_type_check
  check (type in (
    'dice_roll', 'revelation', 'session_start',
    'session_end', 'player_joined', 'system', 'muestra', 'sms'
  ));

alter table public.chronicle_notifications
  drop constraint if exists chronicle_notifications_system_global_check;

alter table public.chronicle_notifications
  add constraint chronicle_notifications_system_global_check
  check (
    (type = 'system' and chronicle_id is null and visibility = 'all')
    or
    (type <> 'system' and chronicle_id is not null)
  );

create index if not exists idx_cn_system_created
  on public.chronicle_notifications (created_at desc)
  where type = 'system' and chronicle_id is null;

-- SELECT: global system notifications are visible to every authenticated user.
drop policy if exists cn_select on public.chronicle_notifications;
create policy cn_select
on public.chronicle_notifications
for select
to authenticated
using (
  (
    type = 'system'
    and chronicle_id is null
    and visibility = 'all'
  )
  or (
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
  )
);

-- INSERT: chronicle notifications keep their existing participant rule.
-- Global system notifications are admin-only.
drop policy if exists cn_insert on public.chronicle_notifications;
create policy cn_insert
on public.chronicle_notifications
for insert
to authenticated
with check (
  (
    type = 'system'
    and chronicle_id is null
    and visibility = 'all'
    and exists (
      select 1 from public.players p
      where p.user_id = auth.uid()
        and coalesce(p.is_admin, false) = true
    )
  )
  or (
    type <> 'system'
    and chronicle_id in (select public.get_my_chronicle_ids())
  )
);

-- DELETE: global system notifications are admin-only. Chronicle cleanup stays narrator-only.
drop policy if exists cn_delete on public.chronicle_notifications;
create policy cn_delete
on public.chronicle_notifications
for delete
to authenticated
using (
  (
    type = 'system'
    and chronicle_id is null
    and exists (
      select 1 from public.players p
      where p.user_id = auth.uid()
        and coalesce(p.is_admin, false) = true
    )
  )
  or exists (
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

-- Count unread chronicle notifications plus global system notifications.
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
  where cn.created_at > coalesce(
    (select nrc.last_seen_at
     from public.notification_read_cursors nrc
     where nrc.player_id = p_player_id),
    '1970-01-01'::timestamptz
  )
  and (
    (
      cn.type = 'system'
      and cn.chronicle_id is null
      and cn.visibility = 'all'
    )
    or (
      cn.chronicle_id in (
        select cp.chronicle_id
        from public.chronicle_participants cp
        where cp.player_id = p_player_id
        union
        select c.id
        from public.chronicles c
        where c.creator_id = p_player_id
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
      )
    )
  );
$$;

grant execute on function public.get_unread_notification_count(uuid) to authenticated;

-- Admin helper for publishing a global system notification.
create or replace function public.create_system_notification(
  p_title text,
  p_body text,
  p_icon text default 'info'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if not exists (
    select 1
    from public.players p
    where p.user_id = auth.uid()
      and coalesce(p.is_admin, false) = true
  ) then
    raise exception 'Only admins can create system notifications';
  end if;

  insert into public.chronicle_notifications (
    chronicle_id,
    type,
    title,
    body,
    icon,
    metadata,
    actor_player_id,
    visibility,
    target_player_ids
  )
  values (
    null,
    'system',
    left(trim(coalesce(p_title, '')), 200),
    coalesce(p_body, ''),
    nullif(trim(coalesce(p_icon, 'info')), ''),
    jsonb_build_object('scope', 'global'),
    (
      select p.id
      from public.players p
      where p.user_id = auth.uid()
      limit 1
    ),
    'all',
    '{}'::uuid[]
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke all on function public.create_system_notification(text, text, text) from public, anon;
grant execute on function public.create_system_notification(text, text, text) to authenticated;
