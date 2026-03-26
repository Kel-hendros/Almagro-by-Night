-- Grupos de chat para el telefono in-game.
-- Permite a jugadores y narrador crear grupos con nombre y participantes.

-- ============================================================
-- 1. Tabla: phone_groups
-- ============================================================

create table if not exists public.phone_groups (
  id                   uuid primary key default gen_random_uuid(),
  chronicle_id         uuid not null references public.chronicles(id) on delete cascade,
  name                 text not null check (char_length(trim(name)) > 0 and char_length(name) <= 120),
  created_by_player_id uuid not null references public.players(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists idx_phone_groups_chronicle
  on public.phone_groups (chronicle_id);

alter table public.phone_groups enable row level security;

create policy pg_select on public.phone_groups
  for select to authenticated
  using (chronicle_id in (select public.get_my_chronicle_ids()));

create policy pg_insert on public.phone_groups
  for insert to authenticated
  with check (chronicle_id in (select public.get_my_chronicle_ids()));

create policy pg_update on public.phone_groups
  for update to authenticated
  using (chronicle_id in (select public.get_my_chronicle_ids()));

create policy pg_delete on public.phone_groups
  for delete to authenticated
  using (
    exists (
      select 1 from public.chronicle_participants cp
      join public.players p on p.id = cp.player_id
      where cp.chronicle_id = phone_groups.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Tabla: phone_group_members
-- ============================================================

create table if not exists public.phone_group_members (
  group_id    uuid not null references public.phone_groups(id) on delete cascade,
  entity_type text not null check (entity_type in ('pc', 'npc')),
  entity_id   uuid not null,
  entity_label text not null default '',
  last_read_at timestamptz not null default now(),
  primary key (group_id, entity_type, entity_id)
);

create index if not exists idx_pgm_entity
  on public.phone_group_members (entity_type, entity_id);

alter table public.phone_group_members enable row level security;

create policy pgm_select on public.phone_group_members
  for select to authenticated
  using (
    group_id in (
      select id from public.phone_groups
      where chronicle_id in (select public.get_my_chronicle_ids())
    )
  );

create policy pgm_insert on public.phone_group_members
  for insert to authenticated
  with check (
    group_id in (
      select id from public.phone_groups
      where chronicle_id in (select public.get_my_chronicle_ids())
    )
  );

create policy pgm_update on public.phone_group_members
  for update to authenticated
  using (
    group_id in (
      select id from public.phone_groups
      where chronicle_id in (select public.get_my_chronicle_ids())
    )
  );

create policy pgm_delete on public.phone_group_members
  for delete to authenticated
  using (
    group_id in (
      select id from public.phone_groups
      where chronicle_id in (select public.get_my_chronicle_ids())
    )
  );

-- ============================================================
-- 3. Extender chronicle_messages para grupos
-- ============================================================

-- Permitir 'group' como recipient_type
ALTER TABLE public.chronicle_messages
  DROP CONSTRAINT IF EXISTS chronicle_messages_recipient_type_check;
ALTER TABLE public.chronicle_messages
  ADD CONSTRAINT chronicle_messages_recipient_type_check
  CHECK (recipient_type in ('pc', 'npc', 'group'));

-- Index para mensajes de grupo
create index if not exists idx_cm_group
  on public.chronicle_messages (recipient_type, recipient_id, created_at desc)
  where recipient_type = 'group';

-- Extender RLS SELECT para incluir mensajes de grupo donde soy miembro
DROP POLICY IF EXISTS cm_select ON public.chronicle_messages;
CREATE POLICY cm_select ON public.chronicle_messages
  FOR SELECT TO authenticated
  USING (
    chronicle_id IN (SELECT public.get_my_chronicle_ids())
    AND (
      -- narrador ve todo
      EXISTS (
        SELECT 1 FROM public.chronicle_participants cp
        JOIN public.players p ON p.id = cp.player_id
        WHERE cp.chronicle_id = chronicle_messages.chronicle_id
          AND cp.role = 'narrator'
          AND p.user_id = auth.uid()
      )
      OR
      -- jugador ve mensajes 1:1 de/para su PC
      (sender_type = 'pc' AND sender_id IN (SELECT public.get_my_character_sheet_ids()))
      OR
      (recipient_type = 'pc' AND recipient_id IN (SELECT public.get_my_character_sheet_ids()))
      OR
      -- jugador ve mensajes de grupos donde es miembro
      (recipient_type = 'group' AND recipient_id IN (
        SELECT pgm.group_id FROM public.phone_group_members pgm
        WHERE pgm.entity_type = 'pc'
          AND pgm.entity_id IN (SELECT public.get_my_character_sheet_ids())
      ))
    )
  );

-- ============================================================
-- 4. RPC: create_phone_group
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_phone_group(
  p_chronicle_id         uuid,
  p_name                 text,
  p_members              jsonb,
  p_created_by_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  m jsonb;
BEGIN
  INSERT INTO public.phone_groups (chronicle_id, name, created_by_player_id)
  VALUES (p_chronicle_id, p_name, p_created_by_player_id)
  RETURNING id INTO v_group_id;

  FOR m IN SELECT * FROM jsonb_array_elements(p_members)
  LOOP
    INSERT INTO public.phone_group_members (group_id, entity_type, entity_id, entity_label)
    VALUES (v_group_id, m->>'type', (m->>'id')::uuid, m->>'label');
  END LOOP;

  RETURN jsonb_build_object('id', v_group_id);
END;
$$;

-- ============================================================
-- 5. RPC: send_group_message
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_group_message(
  p_chronicle_id         uuid,
  p_group_id             uuid,
  p_group_name           text,
  p_sender_type          text,
  p_sender_id            uuid,
  p_sender_label         text,
  p_body                 text,
  p_created_by_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  msg_id uuid;
  m      record;
  t_ids  uuid[];
  v_player_id uuid;
BEGIN
  -- Insert message with recipient_type = 'group'
  INSERT INTO public.chronicle_messages (
    chronicle_id, sender_type, sender_id, sender_label,
    recipient_type, recipient_id, recipient_label,
    body, created_by_player_id
  ) VALUES (
    p_chronicle_id, p_sender_type, p_sender_id, p_sender_label,
    'group', p_group_id, p_group_name,
    p_body, p_created_by_player_id
  ) RETURNING id INTO msg_id;

  -- Notify all PC members except the sender
  FOR m IN
    SELECT pgm.entity_type, pgm.entity_id
    FROM public.phone_group_members pgm
    WHERE pgm.group_id = p_group_id
      AND pgm.entity_type = 'pc'
      AND NOT (pgm.entity_type = p_sender_type AND pgm.entity_id = p_sender_id)
  LOOP
    -- Resolve player_id for the PC
    SELECT p.id INTO v_player_id
    FROM public.players p
    JOIN public.character_sheets cs ON cs.user_id = p.user_id
    WHERE cs.id = m.entity_id
    LIMIT 1;

    IF v_player_id IS NOT NULL THEN
      t_ids := array[v_player_id];
      INSERT INTO public.chronicle_notifications (
        chronicle_id, type, title, body, icon, metadata,
        actor_player_id, visibility, target_player_ids
      ) VALUES (
        p_chronicle_id, 'sms',
        p_group_name || ' - ' || p_sender_label,
        left(p_body, 100), 'smartphone',
        jsonb_build_object(
          'messageId', msg_id,
          'senderType', p_sender_type,
          'senderId', p_sender_id,
          'senderLabel', p_sender_label,
          'groupId', p_group_id,
          'groupName', p_group_name
        ),
        p_created_by_player_id, 'targeted', t_ids
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'messageId', msg_id);
END;
$$;

-- ============================================================
-- 6. RPC: get_phone_group_conversations
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_phone_group_conversations(
  p_chronicle_id uuid,
  p_entity_type  text,
  p_entity_id    uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH my_groups AS (
    SELECT pg.id, pg.name
    FROM public.phone_groups pg
    JOIN public.phone_group_members pgm ON pgm.group_id = pg.id
    WHERE pg.chronicle_id = p_chronicle_id
      AND pgm.entity_type = p_entity_type
      AND pgm.entity_id = p_entity_id
  ),
  enriched AS (
    SELECT
      g.id AS group_id,
      g.name AS group_name,
      (
        SELECT m.body FROM public.chronicle_messages m
        WHERE m.recipient_type = 'group' AND m.recipient_id = g.id
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_body,
      (
        SELECT m.created_at FROM public.chronicle_messages m
        WHERE m.recipient_type = 'group' AND m.recipient_id = g.id
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_at,
      (
        SELECT count(*)::int FROM public.chronicle_messages m
        WHERE m.recipient_type = 'group' AND m.recipient_id = g.id
          AND m.created_at > (
            SELECT pgm.last_read_at FROM public.phone_group_members pgm
            WHERE pgm.group_id = g.id
              AND pgm.entity_type = p_entity_type
              AND pgm.entity_id = p_entity_id
          )
      ) AS unread_count
    FROM my_groups g
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'groupId', group_id,
      'groupName', group_name,
      'lastMessageBody', last_body,
      'lastMessageAt', last_at,
      'unreadCount', unread_count
    ) ORDER BY last_at DESC NULLS LAST
  ), '[]'::jsonb)
  FROM enriched;
$$;

-- ============================================================
-- 7. Helper: mark group read
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_group_read(
  p_group_id    uuid,
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE public.phone_group_members
  SET last_read_at = now()
  WHERE group_id = p_group_id
    AND entity_type = p_entity_type
    AND entity_id = p_entity_id;
$$;
