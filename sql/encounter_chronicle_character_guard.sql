-- Ensure encounter PCs always belong to the encounter chronicle.
-- 1) Prune existing invalid PCs/tokens/effects from encounter JSON data
-- 2) Reject future encounter writes that try to include PCs outside the chronicle
-- 3) Auto-prune encounters when a character is removed from chronicle_characters

begin;

create or replace function public.prune_encounter_invalid_pcs(
  p_data jsonb,
  p_chronicle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instances jsonb := case
    when jsonb_typeof(p_data->'instances') = 'array' then p_data->'instances'
    else '[]'::jsonb
  end;
  v_tokens jsonb := case
    when jsonb_typeof(p_data->'tokens') = 'array' then p_data->'tokens'
    else '[]'::jsonb
  end;
  v_map_effects jsonb := case
    when jsonb_typeof(p_data->'mapEffects') = 'array' then p_data->'mapEffects'
    else '[]'::jsonb
  end;
  v_removed_instance_ids text[];
  v_removed_token_ids text[];
  v_next_instances jsonb;
  v_next_tokens jsonb;
  v_next_map_effects jsonb;
  v_next_viewers jsonb;
begin
  if p_data is null or p_chronicle_id is null then
    return p_data;
  end if;

  select coalesce(array_agg(inst.elem->>'id'), '{}'::text[])
    into v_removed_instance_ids
  from jsonb_array_elements(v_instances) as inst(elem)
  where lower(coalesce(inst.elem->>'isPC', 'false')) = 'true'
    and (
      nullif(inst.elem->>'characterSheetId', '') is null
      or not exists (
        select 1
        from public.chronicle_characters cc
        where cc.chronicle_id = p_chronicle_id
          and cc.character_sheet_id::text = inst.elem->>'characterSheetId'
      )
    );

  if coalesce(array_length(v_removed_instance_ids, 1), 0) = 0 then
    return p_data;
  end if;

  select coalesce(jsonb_agg(inst.elem), '[]'::jsonb)
    into v_next_instances
  from jsonb_array_elements(v_instances) as inst(elem)
  where not (inst.elem->>'id' = any(v_removed_instance_ids));

  select coalesce(array_agg(tok.elem->>'id'), '{}'::text[])
    into v_removed_token_ids
  from jsonb_array_elements(v_tokens) as tok(elem)
  where tok.elem->>'instanceId' = any(v_removed_instance_ids);

  select coalesce(jsonb_agg(tok.elem), '[]'::jsonb)
    into v_next_tokens
  from jsonb_array_elements(v_tokens) as tok(elem)
  where not (tok.elem->>'instanceId' = any(v_removed_instance_ids));

  select coalesce(jsonb_agg(effect.elem), '[]'::jsonb)
    into v_next_map_effects
  from jsonb_array_elements(v_map_effects) as effect(elem)
  where not (
    coalesce(effect.elem->>'sourceInstanceId', '') = any(v_removed_instance_ids)
    or coalesce(effect.elem->>'sourceTokenId', '') = any(v_removed_token_ids)
  );

  p_data := jsonb_set(p_data, '{instances}', v_next_instances, true);
  p_data := jsonb_set(p_data, '{tokens}', v_next_tokens, true);
  p_data := jsonb_set(p_data, '{mapEffects}', v_next_map_effects, true);

  if coalesce(p_data->>'activeInstanceId', '') = any(v_removed_instance_ids) then
    p_data := jsonb_set(p_data, '{activeInstanceId}', 'null'::jsonb, true);
  end if;

  if jsonb_typeof(p_data->'fog') = 'object' then
    if jsonb_typeof(p_data->'fog'->'viewerInstanceIds') = 'array' then
      select coalesce(jsonb_agg(to_jsonb(viewer.viewer_id)), '[]'::jsonb)
        into v_next_viewers
      from jsonb_array_elements_text(p_data->'fog'->'viewerInstanceIds') as viewer(viewer_id)
      where not (viewer.viewer_id = any(v_removed_instance_ids));

      p_data := jsonb_set(p_data, '{fog,viewerInstanceIds}', v_next_viewers, true);
    end if;

    if coalesce(p_data->'fog'->>'impersonateInstanceId', '') = any(v_removed_instance_ids) then
      p_data := jsonb_set(p_data, '{fog,impersonateInstanceId}', 'null'::jsonb, true);
    end if;
  end if;

  return p_data;
end;
$$;

update public.encounters
set data = public.prune_encounter_invalid_pcs(data, chronicle_id)
where chronicle_id is not null
  and data is not null;

create or replace function public.trg_validate_encounter_pc_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invalid_sheet_ids text[];
begin
  if new.chronicle_id is null or new.data is null then
    return new;
  end if;

  select coalesce(
           array_agg(coalesce(nullif(inst.elem->>'characterSheetId', ''), '[missing]')),
           '{}'::text[]
         )
    into v_invalid_sheet_ids
  from jsonb_array_elements(
         case
           when jsonb_typeof(new.data->'instances') = 'array' then new.data->'instances'
           else '[]'::jsonb
         end
       ) as inst(elem)
  where lower(coalesce(inst.elem->>'isPC', 'false')) = 'true'
    and (
      nullif(inst.elem->>'characterSheetId', '') is null
      or not exists (
        select 1
        from public.chronicle_characters cc
        where cc.chronicle_id = new.chronicle_id
          and cc.character_sheet_id::text = inst.elem->>'characterSheetId'
      )
    );

  if coalesce(array_length(v_invalid_sheet_ids, 1), 0) > 0 then
    raise exception 'Encounter contains character sheets outside its chronicle'
      using detail = 'Invalid character_sheet_id values: ' || array_to_string(v_invalid_sheet_ids, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_encounter_pc_membership on public.encounters;
create trigger trg_validate_encounter_pc_membership
before insert or update of chronicle_id, data on public.encounters
for each row
execute function public.trg_validate_encounter_pc_membership();

create or replace function public.trg_prune_encounters_on_chronicle_character_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.encounters e
  set data = public.prune_encounter_invalid_pcs(e.data, e.chronicle_id)
  where e.chronicle_id = old.chronicle_id
    and e.data is not null
    and exists (
      select 1
      from jsonb_array_elements(
             case
               when jsonb_typeof(e.data->'instances') = 'array' then e.data->'instances'
               else '[]'::jsonb
             end
           ) as inst(elem)
      where lower(coalesce(inst.elem->>'isPC', 'false')) = 'true'
        and inst.elem->>'characterSheetId' = old.character_sheet_id::text
    );

  return old;
end;
$$;

drop trigger if exists trg_prune_encounters_on_chronicle_character_delete on public.chronicle_characters;
create trigger trg_prune_encounters_on_chronicle_character_delete
after delete on public.chronicle_characters
for each row
execute function public.trg_prune_encounters_on_chronicle_character_delete();

commit;
