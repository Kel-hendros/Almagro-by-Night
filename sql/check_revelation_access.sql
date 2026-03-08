-- ============================================================
-- RPC: check_revelation_access
-- Determines what access level the current user has for a given
-- revelation and returns the appropriate data.
--
-- Returns JSONB:
--   { access: 'narrator' | 'player' | 'denied',
--     reason?: string,           -- only when denied
--     revelation?: {...},        -- revelation data
--     deliveries?: [{...}],      -- only for narrator
--     player_id?: uuid,
--     chronicle_id?: uuid }
-- ============================================================

create or replace function public.check_revelation_access(p_revelation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_player_id   uuid;
  v_rev_id      uuid;
  v_chronicle_id uuid;
  v_title       text;
  v_body        text;
  v_image_url   text;
  v_tags        text[];
  v_created_by  uuid;
  v_created_at  timestamptz;
  v_role        text;
  v_is_creator  boolean;
  v_deliveries  jsonb;
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

  -- 3. Fetch the revelation
  select r.id, r.chronicle_id, r.title, r.body_markdown,
         r.image_url, r.tags, r.created_by_player_id, r.created_at
    into v_rev_id, v_chronicle_id, v_title, v_body,
         v_image_url, v_tags, v_created_by, v_created_at
    from public.revelations r
   where r.id = p_revelation_id;

  if v_rev_id is null then
    return jsonb_build_object('access', 'denied', 'reason', 'not_found');
  end if;

  -- 4. Determine role in chronicle
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

  -- 5A. NARRATOR: full data + deliveries
  if v_role = 'narrator' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id',                   rp.id,
        'recipient_player_id',  rp.player_id,
        'delivered_at',         rp.associated_at,
        'status',               'associated',
        'recipient', jsonb_build_object(
          'id',                 p.id,
          'name',               coalesce(p.name, 'Jugador'),
          'character_name',     coalesce(
                                  (select coalesce(cs2.name, 'Personaje')
                                     from public.chronicle_characters cc2
                                     join public.character_sheets cs2
                                       on cs2.id = cc2.character_sheet_id
                                    where cc2.chronicle_id = v_chronicle_id
                                      and cs2.user_id = p.user_id
                                    limit 1),
                                  p.name,
                                  'Personaje'
                                ),
          'character_sheet_id', (select cc3.character_sheet_id
                                   from public.chronicle_characters cc3
                                   join public.character_sheets cs3
                                     on cs3.id = cc3.character_sheet_id
                                  where cc3.chronicle_id = v_chronicle_id
                                    and cs3.user_id = p.user_id
                                  limit 1),
          'avatar_url',         coalesce(
                                  (select coalesce(
                                            cs4.data->>'avatarThumbUrl',
                                            cs4.avatar_url,
                                            cs4.data->>'avatar_url',
                                            '')
                                     from public.chronicle_characters cc4
                                     join public.character_sheets cs4
                                       on cs4.id = cc4.character_sheet_id
                                    where cc4.chronicle_id = v_chronicle_id
                                      and cs4.user_id = p.user_id
                                    limit 1),
                                  '')
        )
      ) order by rp.associated_at
    ), '[]'::jsonb)
    into v_deliveries
    from public.revelation_players rp
    join public.players p on p.id = rp.player_id
   where rp.revelation_id = p_revelation_id;

    return jsonb_build_object(
      'access',       'narrator',
      'revelation',   jsonb_build_object(
        'id',                   v_rev_id,
        'chronicle_id',         v_chronicle_id,
        'title',                v_title,
        'body_markdown',        v_body,
        'image_url',            v_image_url,
        'tags',                 to_jsonb(coalesce(v_tags, '{}'::text[])),
        'created_by_player_id', v_created_by,
        'created_at',           v_created_at
      ),
      'deliveries',   v_deliveries,
      'player_id',    v_player_id,
      'chronicle_id', v_chronicle_id
    );
  end if;

  -- 5B. PLAYER: check revelation_players
  if v_role = 'player' then
    if exists (
      select 1
        from public.revelation_players rp
       where rp.revelation_id = p_revelation_id
         and rp.player_id = v_player_id
    ) then
      return jsonb_build_object(
        'access',       'player',
        'revelation',   jsonb_build_object(
          'id',             v_rev_id,
          'chronicle_id',   v_chronicle_id,
          'title',          v_title,
          'body_markdown',  v_body,
          'image_url',      v_image_url,
          'tags',           to_jsonb(coalesce(v_tags, '{}'::text[])),
          'created_at',     v_created_at
        ),
        'player_id',    v_player_id,
        'chronicle_id', v_chronicle_id
      );
    end if;

    -- Player in chronicle but not in revelation_players
    return jsonb_build_object('access', 'denied', 'reason', 'not_revealed');
  end if;

  -- 5C. Not a chronicle participant
  return jsonb_build_object('access', 'denied', 'reason', 'not_participant');
end;
$$;

grant execute on function public.check_revelation_access(uuid) to authenticated;
