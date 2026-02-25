-- ============================================================
-- Encounter Bridge: single active encounter + RPCs
-- Run manually in Supabase SQL Editor
-- ============================================================

-- 1. Enforce single active encounter per chronicle
-- Only one encounter can be "in_game" at a time per chronicle.
-- Encounters without chronicle_id are exempt.
create unique index if not exists idx_encounters_one_active_per_chronicle
  on public.encounters (chronicle_id)
  where status = 'in_game' and chronicle_id is not null;


-- 2. RPC: get the active encounter for a chronicle (lightweight)
-- Returns minimal info needed by character sheets to connect.
create or replace function public.get_active_encounter_for_chronicle(
  p_chronicle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc record;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id, name, status, data
    into v_enc
  from public.encounters
  where chronicle_id = p_chronicle_id
    and status = 'in_game'
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_enc.id,
    'name', v_enc.name,
    'status', v_enc.status,
    'round', coalesce((v_enc.data->>'round')::integer, 1),
    'activeInstanceId', v_enc.data->>'activeInstanceId',
    'instances', coalesce(v_enc.data->'instances', '[]'::jsonb)
  );
end;
$$;


-- 3. RPC: add extra action instances (Celerity, etc.)
-- Players call this from their character sheet to inject extra actions
-- into the encounter's initiative order.
-- Clears existing extra actions for this sheet/round before adding new ones
-- so re-activation replaces rather than duplicates.
-- p_count = 0 removes all extra actions (deactivation).
create or replace function public.add_encounter_extra_actions(
  p_encounter_id uuid,
  p_character_sheet_id text,
  p_action_type text,
  p_count integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc record;
  v_data jsonb;
  v_instances jsonb;
  v_instance jsonb;
  v_sheet_id uuid;
  v_owner_user_id uuid;
  v_is_admin boolean;
  v_current_round integer;
  v_min_initiative numeric;
  v_new_instance jsonb;
  v_filtered jsonb;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_count < 0 or p_count > 5 then
    raise exception 'Invalid extra action count (0-5)';
  end if;

  select public.is_current_user_admin() into v_is_admin;

  -- Lock the encounter row for update
  select id, status, data
    into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'Encounter not found';
  end if;

  if v_enc.status <> 'in_game' and not v_is_admin then
    raise exception 'Encounter is not in_game';
  end if;

  v_data := v_enc.data;
  v_instances := coalesce(v_data->'instances', '[]'::jsonb);
  v_current_round := coalesce((v_data->>'round')::integer, 1);

  -- Find the PC instance linked to this character sheet (exclude extra actions)
  select elem into v_instance
  from jsonb_array_elements(v_instances) as elem
  where elem->>'characterSheetId' = p_character_sheet_id
    and coalesce((elem->>'isPC')::boolean, false) = true
    and coalesce((elem->>'isExtraAction')::boolean, false) = false
  limit 1;

  if v_instance is null then
    raise exception 'No PC instance found for this character sheet';
  end if;

  -- Verify ownership (non-admin must own the sheet)
  if not v_is_admin then
    v_sheet_id := p_character_sheet_id::uuid;

    select cs.user_id
      into v_owner_user_id
    from public.character_sheets cs
    where cs.id = v_sheet_id
    limit 1;

    if v_owner_user_id is distinct from auth.uid() then
      raise exception 'Player does not own this character sheet';
    end if;
  end if;

  -- Remove existing extra actions for this sheet in current round
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_filtered
  from jsonb_array_elements(v_instances) as elem
  where NOT (
    elem->>'characterSheetId' = p_character_sheet_id
    and coalesce((elem->>'isExtraAction')::boolean, false) = true
    and coalesce((elem->>'extraActionRound')::integer, 0) = v_current_round
  );

  v_instances := v_filtered;

  -- If count is 0, just remove (deactivation)
  if p_count = 0 then
    v_data := jsonb_set(v_data, '{instances}', v_instances, true);
    update public.encounters set data = v_data where id = p_encounter_id;
    return true;
  end if;

  -- Place extra actions after the lowest initiative
  select min((elem->>'initiative')::numeric)
    into v_min_initiative
  from jsonb_array_elements(v_instances) as elem;

  v_min_initiative := coalesce(v_min_initiative, 0) - 1;

  -- Create extra action instances
  for i in 1..p_count loop
    v_new_instance := jsonb_build_object(
      'id', gen_random_uuid()::text,
      'characterSheetId', p_character_sheet_id,
      'templateId', null,
      'name', (v_instance->>'name') || ' (Celeridad ' || i || ')',
      'code', (v_instance->>'code') || 'C' || i,
      'status', 'active',
      'initiative', v_min_initiative - (i * 0.1),
      'groups', v_instance->'groups',
      'stats', v_instance->'stats',
      'notes', 'Accion extra por Celeridad (Ronda ' || v_current_round || ')',
      'health', v_instance->'health',
      'maxHealth', v_instance->'maxHealth',
      'pcHealth', v_instance->'pcHealth',
      'isPC', true,
      'isExtraAction', true,
      'extraActionType', p_action_type,
      'extraActionRound', v_current_round,
      'extraActionSourceInstanceId', v_instance->>'id',
      'controllerUserId', auth.uid()::text,
      'avatarUrl', v_instance->'avatarUrl',
      'visible', true
    );

    v_instances := v_instances || jsonb_build_array(v_new_instance);
  end loop;

  -- Persist
  v_data := jsonb_set(v_data, '{instances}', v_instances, true);

  update public.encounters
  set data = v_data
  where id = p_encounter_id;

  return true;
end;
$$;
