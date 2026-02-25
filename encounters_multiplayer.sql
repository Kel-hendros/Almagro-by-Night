-- Encounters multiplayer hardening
-- 1) Status normalization and constraints
-- 2) RLS policies for role-based visibility/edit
-- 3) RPC for controlled token movement by players

begin;

-- Normalize legacy statuses
update public.encounters
set status = 'in_game'
where status = 'active';

-- Ensure status default and validity
alter table public.encounters
  alter column status set default 'wip';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'encounters_status_allowed'
      and conrelid = 'public.encounters'::regclass
  ) then
    alter table public.encounters
      add constraint encounters_status_allowed
      check (status in ('wip', 'ready', 'in_game', 'archived'));
  end if;
end $$;

create index if not exists idx_encounters_status_created_at
  on public.encounters (status, created_at desc);

-- Helper: current user admin?
create or replace function public.is_current_user_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select p.is_admin
    into v_is_admin
  from public.players p
  where p.user_id = auth.uid()
  limit 1;

  return coalesce(v_is_admin, false);
end;
$$;

grant execute on function public.is_current_user_admin() to authenticated;

-- RLS for encounters
alter table public.encounters enable row level security;

drop policy if exists encounters_select_policy on public.encounters;
create policy encounters_select_policy
on public.encounters
for select
to authenticated
using (
  public.is_current_user_admin()
  or status = 'in_game'
);

drop policy if exists encounters_insert_admin_only on public.encounters;
create policy encounters_insert_admin_only
on public.encounters
for insert
to authenticated
with check (public.is_current_user_admin());

drop policy if exists encounters_update_admin_only on public.encounters;
create policy encounters_update_admin_only
on public.encounters
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists encounters_delete_admin_only on public.encounters;
create policy encounters_delete_admin_only
on public.encounters
for delete
to authenticated
using (public.is_current_user_admin());

-- RPC: controlled token movement
create or replace function public.move_encounter_token(
  p_encounter_id uuid,
  p_token_id text,
  p_x double precision,
  p_y double precision
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc record;
  v_data jsonb;
  v_tokens jsonb;
  v_instances jsonb;
  v_token_idx integer;
  v_token jsonb;
  v_instance jsonb;
  v_instance_id text;
  v_sheet_id uuid;
  v_owner_user_id uuid;
  v_controller_user_id text;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select public.is_current_user_admin() into v_is_admin;

  select id, status, data
    into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'Encounter not found';
  end if;

  if v_enc.data is null then
    raise exception 'Encounter has no data';
  end if;

  if not v_is_admin and v_enc.status <> 'in_game' then
    raise exception 'Encounter is not in_game';
  end if;

  v_data := v_enc.data;
  v_tokens := coalesce(v_data->'tokens', '[]'::jsonb);
  v_instances := coalesce(v_data->'instances', '[]'::jsonb);

  select t.ord::int - 1, t.elem
    into v_token_idx, v_token
  from jsonb_array_elements(v_tokens) with ordinality as t(elem, ord)
  where t.elem->>'id' = p_token_id
  limit 1;

  if v_token is null then
    raise exception 'Token not found in encounter';
  end if;

  if not v_is_admin then
    v_instance_id := v_token->>'instanceId';

    select i.elem
      into v_instance
    from jsonb_array_elements(v_instances) as i(elem)
    where i.elem->>'id' = v_instance_id
    limit 1;

    if v_instance is null then
      raise exception 'Token instance not found';
    end if;

    v_controller_user_id := nullif(v_instance->>'controllerUserId', '');
    if v_controller_user_id is not null and v_controller_user_id = auth.uid()::text then
      -- Summoned or controlled token explicitly assigned to this user.
      null;
    else
      if coalesce((v_instance->>'isPC')::boolean, false) is not true then
        raise exception 'Only PC tokens can be moved by players';
      end if;

      if coalesce(v_instance->>'characterSheetId', '') = '' then
        raise exception 'PC instance has no characterSheetId';
      end if;

      v_sheet_id := (v_instance->>'characterSheetId')::uuid;

      select cs.user_id
        into v_owner_user_id
      from public.character_sheets cs
      where cs.id = v_sheet_id
      limit 1;

      if v_owner_user_id is distinct from auth.uid() then
        raise exception 'Player does not own this PC token';
      end if;
    end if;
  end if;

  v_token := jsonb_set(v_token, '{x}', to_jsonb(p_x), true);
  v_token := jsonb_set(v_token, '{y}', to_jsonb(p_y), true);
  v_tokens := jsonb_set(v_tokens, array[v_token_idx::text], v_token, true);
  v_data := jsonb_set(v_data, '{tokens}', v_tokens, true);

  update public.encounters
  set data = v_data
  where id = p_encounter_id;

  return true;
end;
$$;

grant execute on function public.move_encounter_token(uuid, text, double precision, double precision)
to authenticated;

create or replace function public.unsummon_encounter_instance(
  p_encounter_id uuid,
  p_instance_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc record;
  v_data jsonb;
  v_tokens jsonb;
  v_instances jsonb;
  v_instance jsonb;
  v_active_instance_id text;
  v_controller_user_id text;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select public.is_current_user_admin() into v_is_admin;

  select id, status, data
    into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'Encounter not found';
  end if;

  if v_enc.data is null then
    raise exception 'Encounter has no data';
  end if;

  if not v_is_admin and v_enc.status <> 'in_game' then
    raise exception 'Encounter is not in_game';
  end if;

  v_data := v_enc.data;
  v_instances := coalesce(v_data->'instances', '[]'::jsonb);
  v_tokens := coalesce(v_data->'tokens', '[]'::jsonb);

  select i.elem
    into v_instance
  from jsonb_array_elements(v_instances) as i(elem)
  where i.elem->>'id' = p_instance_id
  limit 1;

  if v_instance is null then
    raise exception 'Instance not found in encounter';
  end if;

  if coalesce((v_instance->>'isSummon')::boolean, false) is not true then
    raise exception 'Instance is not a summon';
  end if;

  if not v_is_admin then
    v_controller_user_id := nullif(v_instance->>'controllerUserId', '');
    if v_controller_user_id is null or v_controller_user_id <> auth.uid()::text then
      raise exception 'Player does not control this summon';
    end if;
  end if;

  v_instances := coalesce(
    (
      select jsonb_agg(elem)
      from jsonb_array_elements(v_instances) as i(elem)
      where i.elem->>'id' <> p_instance_id
    ),
    '[]'::jsonb
  );

  v_tokens := coalesce(
    (
      select jsonb_agg(elem)
      from jsonb_array_elements(v_tokens) as t(elem)
      where t.elem->>'instanceId' <> p_instance_id
    ),
    '[]'::jsonb
  );

  v_data := jsonb_set(v_data, '{instances}', v_instances, true);
  v_data := jsonb_set(v_data, '{tokens}', v_tokens, true);

  v_active_instance_id := nullif(v_data->>'activeInstanceId', '');
  if v_active_instance_id = p_instance_id then
    v_data := jsonb_set(v_data, '{activeInstanceId}', 'null'::jsonb, true);
  end if;

  update public.encounters
  set data = v_data
  where id = p_encounter_id;

  return true;
end;
$$;

grant execute on function public.unsummon_encounter_instance(uuid, text)
to authenticated;

create or replace function public.patch_encounter_instance_state(
  p_encounter_id uuid,
  p_instance_id text,
  p_conditions jsonb default null,
  p_effects jsonb default null
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
  v_sheet_instances jsonb;
  v_instance jsonb;
  v_instance_idx integer;
  v_sheet_id text;
  v_owner_user_id uuid;
  v_controller_user_id text;
  v_is_admin boolean;
  v_sheet_owner_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select public.is_current_user_admin() into v_is_admin;

  select id, status, data
    into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'Encounter not found';
  end if;

  if v_enc.data is null then
    raise exception 'Encounter has no data';
  end if;

  v_data := v_enc.data;
  v_instances := coalesce(v_data->'instances', '[]'::jsonb);
  v_sheet_instances := coalesce(v_data->'sheetInstances', '{}'::jsonb);

  select i.ord::int - 1, i.elem
    into v_instance_idx, v_instance
  from jsonb_array_elements(v_instances) with ordinality as i(elem, ord)
  where i.elem->>'id' = p_instance_id
  limit 1;

  if v_instance is null then
    raise exception 'Instance not found in encounter';
  end if;

  if not v_is_admin then
    v_controller_user_id := nullif(v_instance->>'controllerUserId', '');
    if v_controller_user_id is not null and v_controller_user_id = auth.uid()::text then
      null;
    else
      if coalesce((v_instance->>'isPC')::boolean, false) is not true then
        raise exception 'Only owned PC instances can be patched by players';
      end if;

      v_sheet_id := coalesce(
        nullif(v_instance->>'characterSheetId', ''),
        nullif(v_instance->>'sheetId', '')
      );
      if v_sheet_id is null then
        raise exception 'PC instance has no sheet id';
      end if;

      select cs.user_id
        into v_owner_user_id
      from public.character_sheets cs
      where cs.id = v_sheet_id::uuid
      limit 1;

      v_sheet_owner_user_id := nullif(v_sheet_instances->v_sheet_id->>'ownerUserId', '')::uuid;
      v_owner_user_id := coalesce(v_owner_user_id, v_sheet_owner_user_id);

      if v_owner_user_id is distinct from auth.uid() then
        raise exception 'Player does not own this PC instance';
      end if;
    end if;
  end if;

  if p_conditions is not null then
    v_instance := jsonb_set(v_instance, '{conditions}', p_conditions, true);
  end if;
  if p_effects is not null then
    v_instance := jsonb_set(v_instance, '{effects}', p_effects, true);
  end if;

  v_instances := jsonb_set(v_instances, array[v_instance_idx::text], v_instance, true);
  v_data := jsonb_set(v_data, '{instances}', v_instances, true);

  update public.encounters
  set data = v_data
  where id = p_encounter_id;

  return true;
end;
$$;

grant execute on function public.patch_encounter_instance_state(uuid, text, jsonb, jsonb)
to authenticated;

-- RPC: send_encounter_ping — any authenticated user can ping on an in_game encounter
create or replace function public.send_encounter_ping(
  p_encounter_id uuid,
  p_x double precision,
  p_y double precision,
  p_player text,
  p_ts double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc record;
  v_data jsonb;
  v_is_admin boolean;
  v_ts double precision;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select public.is_current_user_admin() into v_is_admin;

  select id, status, data
    into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'Encounter not found';
  end if;

  if not v_is_admin and v_enc.status <> 'in_game' then
    raise exception 'Encounter is not in_game';
  end if;

  v_ts := coalesce(p_ts, extract(epoch from now()) * 1000);

  v_data := coalesce(v_enc.data, '{}'::jsonb);
  v_data := jsonb_set(v_data, '{ping}', jsonb_build_object(
    'x', p_x,
    'y', p_y,
    'ts', v_ts,
    'player', p_player
  ), true);

  update public.encounters
  set data = v_data
  where id = p_encounter_id;

  return true;
end;
$$;

grant execute on function public.send_encounter_ping(uuid, double precision, double precision, text, double precision)
to authenticated;

commit;
