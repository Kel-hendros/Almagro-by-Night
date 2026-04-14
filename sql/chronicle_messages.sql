-- Telefono In-Game: mensajeria entre personajes (PCs) y NPCs
-- Dos tablas: phone_identities (NPCs del narrador) y chronicle_messages (mensajes).
-- RPCs: get_phone_conversations (listado), send_chronicle_message (fan-out atomico).

-- ============================================================
-- 0. Helper: IDs de character_sheets del usuario autenticado
-- ============================================================

create or replace function public.get_my_character_sheet_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select cs.id
  from public.character_sheets cs
  where cs.user_id = auth.uid();
$$;

-- ============================================================
-- 1. Tabla: phone_identities (entidades NPC para mensajeria)
-- ============================================================

create table if not exists public.phone_identities (
  id                   uuid primary key default gen_random_uuid(),
  chronicle_id         uuid not null references public.chronicles(id) on delete cascade,
  name                 text not null check (char_length(trim(name)) > 0 and char_length(name) <= 120),
  phone_number         text not null default '',
  character_contact_id uuid null references public.character_contacts(id) on delete set null,
  created_by_player_id uuid not null references public.players(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists idx_phone_identities_chronicle
  on public.phone_identities (chronicle_id);

create index if not exists idx_phone_identities_contact
  on public.phone_identities (character_contact_id)
  where character_contact_id is not null;

-- RLS
alter table public.phone_identities enable row level security;

-- SELECT: cualquier participante de la cronica
create policy phone_id_select on public.phone_identities
  for select to authenticated
  using (chronicle_id in (select public.get_my_chronicle_ids()));

-- INSERT: solo narrador
create policy phone_id_insert on public.phone_identities
  for insert to authenticated
  with check (
    chronicle_id in (select public.get_my_chronicle_ids())
    and exists (
      select 1 from public.chronicle_participants cp
      join public.players p on p.id = cp.player_id
      where cp.chronicle_id = phone_identities.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  );

-- UPDATE: solo narrador
create policy phone_id_update on public.phone_identities
  for update to authenticated
  using (
    exists (
      select 1 from public.chronicle_participants cp
      join public.players p on p.id = cp.player_id
      where cp.chronicle_id = phone_identities.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  );

-- DELETE: solo narrador
create policy phone_id_delete on public.phone_identities
  for delete to authenticated
  using (
    exists (
      select 1 from public.chronicle_participants cp
      join public.players p on p.id = cp.player_id
      where cp.chronicle_id = phone_identities.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Tabla: chronicle_messages
-- ============================================================

create table if not exists public.chronicle_messages (
  id                   uuid primary key default gen_random_uuid(),
  chronicle_id         uuid not null references public.chronicles(id) on delete cascade,
  sender_type          text not null check (sender_type in ('pc', 'npc')),
  sender_id            uuid not null,
  sender_label         text not null default '',
  recipient_type       text not null check (recipient_type in ('pc', 'npc')),
  recipient_id         uuid not null,
  recipient_label      text not null default '',
  body                 text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  is_read              boolean not null default false,
  created_by_player_id uuid not null references public.players(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- Indexes
create index if not exists idx_cm_chronicle_created
  on public.chronicle_messages (chronicle_id, created_at desc);

create index if not exists idx_cm_sender
  on public.chronicle_messages (chronicle_id, sender_type, sender_id, created_at desc);

create index if not exists idx_cm_recipient
  on public.chronicle_messages (chronicle_id, recipient_type, recipient_id, created_at desc);

create index if not exists idx_cm_unread
  on public.chronicle_messages (recipient_type, recipient_id, is_read)
  where is_read = false;

-- RLS
alter table public.chronicle_messages enable row level security;

-- SELECT: narrador ve todo, jugador ve mensajes donde su PC es sender o recipient
create policy cm_select on public.chronicle_messages
  for select to authenticated
  using (
    chronicle_id in (select public.get_my_chronicle_ids())
    and (
      -- narrador ve todo en su cronica
      exists (
        select 1 from public.chronicle_participants cp
        join public.players p on p.id = cp.player_id
        where cp.chronicle_id = chronicle_messages.chronicle_id
          and cp.role = 'narrator'
          and p.user_id = auth.uid()
      )
      or
      -- jugador ve mensajes de/para su PC
      (sender_type = 'pc' and sender_id in (select public.get_my_character_sheet_ids()))
      or
      (recipient_type = 'pc' and recipient_id in (select public.get_my_character_sheet_ids()))
    )
  );

-- INSERT: participante de cronica (RPC maneja validacion fina)
create policy cm_insert on public.chronicle_messages
  for insert to authenticated
  with check (
    chronicle_id in (select public.get_my_chronicle_ids())
  );

-- UPDATE: solo is_read, por recipient o narrador
create policy cm_update on public.chronicle_messages
  for update to authenticated
  using (
    chronicle_id in (select public.get_my_chronicle_ids())
    and (
      (recipient_type = 'pc' and recipient_id in (select public.get_my_character_sheet_ids()))
      or exists (
        select 1 from public.chronicle_participants cp
        join public.players p on p.id = cp.player_id
        where cp.chronicle_id = chronicle_messages.chronicle_id
          and cp.role = 'narrator'
          and p.user_id = auth.uid()
      )
    )
  )
  with check (true);

-- DELETE: solo narrador
create policy cm_delete on public.chronicle_messages
  for delete to authenticated
  using (
    exists (
      select 1 from public.chronicle_participants cp
      join public.players p on p.id = cp.player_id
      where cp.chronicle_id = chronicle_messages.chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. Realtime publication
-- ============================================================

alter publication supabase_realtime add table public.chronicle_messages;

-- ============================================================
-- 4. Extender CHECK constraint de notifications para 'sms'
-- ============================================================

ALTER TABLE public.chronicle_notifications
  DROP CONSTRAINT IF EXISTS chronicle_notifications_type_check;

ALTER TABLE public.chronicle_notifications
  ADD CONSTRAINT chronicle_notifications_type_check
  CHECK (type IN (
    'dice_roll', 'revelation', 'session_start',
    'session_end', 'player_joined', 'system', 'muestra', 'sms'
  ));

-- ============================================================
-- 5. RPC: get_phone_conversations
--    Retorna conversaciones para una entidad (PC o narrador).
-- ============================================================

create or replace function public.get_phone_conversations(
  p_chronicle_id uuid,
  p_entity_type  text,
  p_entity_id    uuid
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with my_messages as (
    select *
    from public.chronicle_messages
    where chronicle_id = p_chronicle_id
      and recipient_type <> 'group'
      and (
        (sender_type = p_entity_type and sender_id = p_entity_id)
        or (recipient_type = p_entity_type and recipient_id = p_entity_id)
      )
  ),
  conversations as (
    select
      case
        when sender_type = p_entity_type and sender_id = p_entity_id
          then recipient_type else sender_type
      end as cp_type,
      case
        when sender_type = p_entity_type and sender_id = p_entity_id
          then recipient_id else sender_id
      end as cp_id,
      case
        when sender_type = p_entity_type and sender_id = p_entity_id
          then recipient_label else sender_label
      end as cp_label,
      max(created_at) as last_at
    from my_messages
    group by 1, 2, 3
  ),
  enriched as (
    select
      c.cp_type,
      c.cp_id,
      c.cp_label,
      c.last_at,
      (
        select m.body from my_messages m
        where (
          (m.sender_type = c.cp_type and m.sender_id = c.cp_id)
          or (m.recipient_type = c.cp_type and m.recipient_id = c.cp_id)
        )
        order by m.created_at desc limit 1
      ) as last_body,
      (
        select count(*)::int from my_messages m
        where m.sender_type = c.cp_type
          and m.sender_id = c.cp_id
          and m.recipient_type = p_entity_type
          and m.recipient_id = p_entity_id
          and m.is_read = false
      ) as unread
    from conversations c
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'counterpartyType', cp_type,
      'counterpartyId',   cp_id,
      'counterpartyLabel', cp_label,
      'lastMessageBody',  last_body,
      'lastMessageAt',    last_at,
      'unreadCount',      unread
    ) order by last_at desc
  ), '[]'::jsonb)
  from enriched;
$$;

-- ============================================================
-- 6. RPC: get_phone_conversations_narrator
--    Narrador ve TODAS las conversaciones de la cronica.
-- ============================================================

create or replace function public.get_phone_conversations_narrator(
  p_chronicle_id uuid
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with pairs as (
    select
      least(sender_type || ':' || sender_id, recipient_type || ':' || recipient_id) as pair_a,
      greatest(sender_type || ':' || sender_id, recipient_type || ':' || recipient_id) as pair_b,
      sender_type, sender_id, sender_label,
      recipient_type, recipient_id, recipient_label,
      created_at,
      body,
      row_number() over (
        partition by
          least(sender_type || ':' || sender_id, recipient_type || ':' || recipient_id),
          greatest(sender_type || ':' || sender_id, recipient_type || ':' || recipient_id)
        order by created_at desc
      ) as rn
    from public.chronicle_messages
    where chronicle_id = p_chronicle_id
      and recipient_type <> 'group'
  ),
  latest as (
    select * from pairs where rn = 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'senderType',      sender_type,
      'senderId',        sender_id,
      'senderLabel',     sender_label,
      'recipientType',   recipient_type,
      'recipientId',     recipient_id,
      'recipientLabel',  recipient_label,
      'lastMessageBody', body,
      'lastMessageAt',   created_at
    ) order by created_at desc
  ), '[]'::jsonb)
  from latest;
$$;

-- ============================================================
-- 7. RPC: send_chronicle_message (fan-out atomico)
--    Inserta N mensajes + N notificaciones targeted.
-- ============================================================

create or replace function public.send_chronicle_message(
  p_chronicle_id         uuid,
  p_sender_type          text,
  p_sender_id            uuid,
  p_sender_label         text,
  p_recipients           jsonb,
  p_body                 text,
  p_created_by_player_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r           jsonb;
  msg_id      uuid;
  t_ids       uuid[];
  narrator_id uuid;
begin
  for r in select * from jsonb_array_elements(p_recipients)
  loop
    -- Insert message
    insert into public.chronicle_messages (
      chronicle_id, sender_type, sender_id, sender_label,
      recipient_type, recipient_id, recipient_label,
      body, created_by_player_id
    ) values (
      p_chronicle_id, p_sender_type, p_sender_id, p_sender_label,
      r->>'type', (r->>'id')::uuid, r->>'label',
      p_body, p_created_by_player_id
    ) returning id into msg_id;

    -- Resolve target player for the notification
    if (r->>'playerId') is not null then
      -- Recipient is a PC — notify their player directly
      t_ids := array[(r->>'playerId')::uuid];
    else
      -- Recipient is an NPC — notify the narrator (chronicle creator)
      select creator_id into narrator_id
        from public.chronicles
        where id = p_chronicle_id;
      if narrator_id is not null and narrator_id <> p_created_by_player_id then
        t_ids := array[narrator_id];
      else
        t_ids := null;
      end if;
    end if;

    -- Push targeted notification
    if t_ids is not null then
      insert into public.chronicle_notifications (
        chronicle_id, type, title, body, icon, metadata,
        actor_player_id, visibility, target_player_ids
      ) values (
        p_chronicle_id,
        'sms',
        p_sender_label,
        left(p_body, 100),
        'smartphone',
        jsonb_build_object(
          'messageId',   msg_id,
          'senderType',  p_sender_type,
          'senderId',    p_sender_id,
          'senderLabel', p_sender_label
        ),
        p_created_by_player_id,
        'targeted',
        t_ids
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- 8. RPC: get_phone_unread_count
-- ============================================================

create or replace function public.get_phone_unread_count(
  p_entity_type text,
  p_entity_id   uuid
)
returns int
language sql stable security invoker set search_path = public
as $$
  select count(*)::int
  from public.chronicle_messages
  where recipient_type = p_entity_type
    and recipient_id = p_entity_id
    and is_read = false;
$$;
