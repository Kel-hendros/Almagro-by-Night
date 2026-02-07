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
  p_x integer,
  p_y integer
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

grant execute on function public.move_encounter_token(uuid, text, integer, integer)
to authenticated;

commit;
