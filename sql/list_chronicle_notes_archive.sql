-- ============================================================
-- RPC: list_chronicle_notes_archive
-- Returns notes for the current chronicle archive.
--
-- Narrator:
-- - sees notes from players currently participating in the chronicle
--
-- Player:
-- - sees only their own notes in that chronicle
-- ============================================================

create or replace function public.list_chronicle_notes_archive(p_chronicle_id uuid)
returns table (
  id uuid,
  chronicle_id uuid,
  player_id uuid,
  player_name text,
  title text,
  body_markdown text,
  tags text[],
  is_archived boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_player_id uuid;
  v_role text;
  v_is_creator boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return;
  end if;

  select p.id
    into v_player_id
    from public.players p
   where p.user_id = v_user_id
   limit 1;

  if v_player_id is null then
    return;
  end if;

  select cp.role
    into v_role
    from public.chronicle_participants cp
   where cp.chronicle_id = p_chronicle_id
     and cp.player_id = v_player_id
   limit 1;

  if v_role is distinct from 'narrator' then
    select exists(
      select 1
        from public.chronicles c
       where c.id = p_chronicle_id
         and c.creator_id = v_player_id
    )
      into v_is_creator;

    if v_is_creator then
      v_role := 'narrator';
    end if;
  end if;

  if v_role = 'narrator' then
    return query
    select
      n.id,
      n.chronicle_id,
      n.player_id,
      coalesce(p.name, 'Jugador') as player_name,
      n.title,
      n.body_markdown,
      coalesce(n.tags, '{}'::text[]) as tags,
      n.is_archived,
      n.created_at,
      n.updated_at
    from public.chronicle_notes n
    inner join public.chronicle_participants cp
      on cp.chronicle_id = n.chronicle_id
     and cp.player_id = n.player_id
    left join public.players p
      on p.id = n.player_id
    where n.chronicle_id = p_chronicle_id
    order by n.updated_at desc, n.created_at desc;
    return;
  end if;

  if v_role = 'player' then
    return query
    select
      n.id,
      n.chronicle_id,
      n.player_id,
      coalesce(p.name, 'Jugador') as player_name,
      n.title,
      n.body_markdown,
      coalesce(n.tags, '{}'::text[]) as tags,
      n.is_archived,
      n.created_at,
      n.updated_at
    from public.chronicle_notes n
    left join public.players p
      on p.id = n.player_id
    where n.chronicle_id = p_chronicle_id
      and n.player_id = v_player_id
    order by n.updated_at desc, n.created_at desc;
    return;
  end if;

  return;
end;
$$;

grant execute on function public.list_chronicle_notes_archive(uuid) to authenticated;
