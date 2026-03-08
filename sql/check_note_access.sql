-- ============================================================
-- RPC: check_note_access
-- Determines what access level the current user has for a given
-- note and returns the appropriate data.
--
-- Returns JSONB:
--   { access: 'owner' | 'narrator' | 'denied',
--     reason?: string,           -- only when denied
--     note?: {...},              -- note data
--     owner_name?: string,       -- only for narrator
--     player_id?: uuid,
--     chronicle_id?: uuid }
-- ============================================================

create or replace function public.check_note_access(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid;
  v_player_id      uuid;
  v_note_id        uuid;
  v_chronicle_id   uuid;
  v_note_player_id uuid;
  v_title          text;
  v_body           text;
  v_tags           text[];
  v_is_archived    boolean;
  v_created_at     timestamptz;
  v_updated_at     timestamptz;
  v_role           text;
  v_is_creator     boolean;
  v_owner_name     text;
  v_caller_participates boolean;
  v_owner_participates boolean;
begin
  -- 1. Auth check
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('access', 'denied', 'reason', 'not_authenticated');
  end if;

  -- 2. Resolve player_id
  select id into v_player_id
    from public.players
   where user_id = v_user_id
   limit 1;

  if v_player_id is null then
    return jsonb_build_object('access', 'denied', 'reason', 'no_player_profile');
  end if;

  -- 3. Fetch the note
  select n.id, n.chronicle_id, n.player_id, n.title, n.body_markdown,
         n.tags, n.is_archived, n.created_at, n.updated_at
    into v_note_id, v_chronicle_id, v_note_player_id, v_title, v_body,
         v_tags, v_is_archived, v_created_at, v_updated_at
    from public.chronicle_notes n
   where n.id = p_note_id;

  if v_note_id is null then
    return jsonb_build_object('access', 'denied', 'reason', 'not_found');
  end if;

  select exists(
    select 1
      from public.chronicle_participants cp
     where cp.chronicle_id = v_chronicle_id
       and cp.player_id = v_player_id
  )
    into v_caller_participates;

  select exists(
    select 1
      from public.chronicle_participants cp
     where cp.chronicle_id = v_chronicle_id
       and cp.player_id = v_note_player_id
  )
    into v_owner_participates;

  -- 4. Check: is the caller the owner and still participating in the chronicle?
  if v_note_player_id = v_player_id and v_caller_participates then
    return jsonb_build_object(
      'access',       'owner',
      'note',         jsonb_build_object(
        'id',           v_note_id,
        'chronicle_id', v_chronicle_id,
        'player_id',    v_note_player_id,
        'title',        v_title,
        'body_markdown', v_body,
        'tags',         to_jsonb(coalesce(v_tags, '{}'::text[])),
        'is_archived',  v_is_archived,
        'created_at',   v_created_at,
        'updated_at',   v_updated_at
      ),
      'player_id',    v_player_id,
      'chronicle_id', v_chronicle_id
    );
  end if;

  -- 5. Determine role in chronicle
  select cp.role into v_role
    from public.chronicle_participants cp
   where cp.chronicle_id = v_chronicle_id
     and cp.player_id = v_player_id;

  -- Check if chronicle creator (implicit narrator)
  v_is_creator := false;
  if v_role is distinct from 'narrator' then
    select true into v_is_creator
      from public.chronicles c
     where c.id = v_chronicle_id
       and c.creator_id = v_player_id;
    if v_is_creator then
      v_role := 'narrator';
    end if;
  end if;

  -- 5A. NARRATOR: read-only view + owner info, only for current participants
  if v_role = 'narrator' and v_owner_participates then
    select coalesce(p.name, 'Jugador') into v_owner_name
      from public.players p
     where p.id = v_note_player_id;

    return jsonb_build_object(
      'access',       'narrator',
      'note',         jsonb_build_object(
        'id',           v_note_id,
        'chronicle_id', v_chronicle_id,
        'player_id',    v_note_player_id,
        'title',        v_title,
        'body_markdown', v_body,
        'tags',         to_jsonb(coalesce(v_tags, '{}'::text[])),
        'is_archived',  v_is_archived,
        'created_at',   v_created_at,
        'updated_at',   v_updated_at
      ),
      'owner_name',   v_owner_name,
      'player_id',    v_player_id,
      'chronicle_id', v_chronicle_id
    );
  end if;

  -- 5B. Player (not owner, not narrator) or owner outside the chronicle → denied
  if v_role = 'player' or (v_note_player_id = v_player_id and not v_caller_participates) then
    return jsonb_build_object('access', 'denied', 'reason', 'not_owner');
  end if;

  -- 5C. Not a chronicle participant
  return jsonb_build_object('access', 'denied', 'reason', 'not_participant');
end;
$$;

grant execute on function public.check_note_access(uuid) to authenticated;
