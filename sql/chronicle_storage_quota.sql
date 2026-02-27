-- Chronicle scoped storage paths + quota helpers
-- Standard path: chronicle/<chronicle_id>/<module>/...

begin;

create table if not exists public.account_storage_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'custom')),
  max_chronicle_storage_bytes bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_account_storage_plans on public.account_storage_plans;
create trigger trg_touch_account_storage_plans
before update on public.account_storage_plans
for each row execute function public.touch_updated_at();

alter table public.account_storage_plans enable row level security;

drop policy if exists account_storage_plans_select_self on public.account_storage_plans;
create policy account_storage_plans_select_self
on public.account_storage_plans
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists account_storage_plans_mutate_admin_only on public.account_storage_plans;
create policy account_storage_plans_mutate_admin_only
on public.account_storage_plans
for all
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.user_id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.user_id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
);

create or replace function public.chronicle_id_from_storage_object_name(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  extracted text;
begin
  if p_name is null then
    return null;
  end if;

  if p_name !~ '^chronicle/[0-9a-fA-F-]{36}/.+' then
    return null;
  end if;

  extracted := split_part(p_name, '/', 2);
  return extracted::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.legacy_chronicle_id_prefix_from_storage_object_name(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  extracted text;
begin
  if p_name is null then
    return null;
  end if;

  if p_name !~ '^[0-9a-fA-F-]{36}/.+' then
    return null;
  end if;

  extracted := split_part(p_name, '/', 1);
  return extracted::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.storage_object_size_bytes(p_metadata jsonb)
returns bigint
language sql
immutable
as $$
  select coalesce(
    nullif(p_metadata->>'size', '')::bigint,
    nullif(p_metadata->>'contentLength', '')::bigint,
    0
  );
$$;

create or replace function public.is_chronicle_participant(p_chronicle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chronicle_participants cp
    join public.players p on p.id = cp.player_id
    where cp.chronicle_id = p_chronicle_id
      and p.user_id = auth.uid()
  );
$$;

grant execute on function public.is_chronicle_participant(uuid) to authenticated;

create or replace function public.get_chronicle_storage_usage_bytes(p_chronicle_id uuid)
returns bigint
language sql
security definer
set search_path = public, storage
stable
as $$
  select coalesce(sum(public.storage_object_size_bytes(o.metadata)), 0)::bigint
  from storage.objects o
  where o.name like ('chronicle/' || p_chronicle_id::text || '/%');
$$;

grant execute on function public.get_chronicle_storage_usage_bytes(uuid) to authenticated;

create or replace function public.get_chronicle_storage_limit_bytes(p_chronicle_id uuid)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  with owner_player as (
    select p.id as player_id, p.user_id, coalesce(p.is_admin, false) as is_admin
    from public.chronicles c
    join public.players p on p.id = c.creator_id
    where c.id = p_chronicle_id
    limit 1
  )
  select case
    when (select op.is_admin from owner_player op) = true then null::bigint
    else 52428800::bigint -- 50 MB for non-admin chronicles
  end;
$$;

grant execute on function public.get_chronicle_storage_limit_bytes(uuid) to authenticated;

create or replace function public.check_chronicle_storage_quota(
  p_chronicle_id uuid,
  p_incoming_bytes bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage bigint;
  v_limit bigint;
  v_remaining bigint;
  v_allowed boolean;
begin
  if p_chronicle_id is null then
    return jsonb_build_object(
      'allowed', false,
      'error', 'chronicle_id_required'
    );
  end if;

  if not public.is_chronicle_participant(p_chronicle_id)
     and not public.is_narrator_or_chronicle_owner(p_chronicle_id) then
    return jsonb_build_object(
      'allowed', false,
      'error', 'not_authorized'
    );
  end if;

  v_usage := public.get_chronicle_storage_usage_bytes(p_chronicle_id);
  v_limit := public.get_chronicle_storage_limit_bytes(p_chronicle_id);
  if v_limit is null then
    v_remaining := null;
    v_allowed := true;
  else
    v_remaining := greatest(v_limit - v_usage, 0);
    v_allowed := (v_usage + greatest(coalesce(p_incoming_bytes, 0), 0)) <= v_limit;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'usage_bytes', v_usage,
    'limit_bytes', v_limit,
    'remaining_bytes', v_remaining,
    'incoming_bytes', greatest(coalesce(p_incoming_bytes, 0), 0)
  );
end;
$$;

grant execute on function public.check_chronicle_storage_quota(uuid, bigint) to authenticated;

create or replace function public.can_access_chronicle_scoped_object(p_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with target as (
    select public.chronicle_id_from_storage_object_name(p_name) as chronicle_id
  )
  select coalesce(
    exists (
      select 1
      from target t
      where t.chronicle_id is not null
        and (
          public.is_chronicle_participant(t.chronicle_id)
          or public.is_narrator_or_chronicle_owner(t.chronicle_id)
        )
    ),
    false
  );
$$;

grant execute on function public.can_access_chronicle_scoped_object(text) to authenticated;

create or replace function public.can_manage_chronicle_scoped_object(p_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with target as (
    select public.chronicle_id_from_storage_object_name(p_name) as chronicle_id
  )
  select coalesce(
    exists (
      select 1
      from target t
      where t.chronicle_id is not null
        and public.is_narrator_or_chronicle_owner(t.chronicle_id)
    ),
    false
  );
$$;

grant execute on function public.can_manage_chronicle_scoped_object(text) to authenticated;

create or replace function public.can_access_legacy_banner_object(p_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with target as (
    select public.legacy_chronicle_id_prefix_from_storage_object_name(p_name) as chronicle_id
  )
  select coalesce(
    exists (
      select 1
      from target t
      where t.chronicle_id is not null
        and public.is_narrator_or_chronicle_owner(t.chronicle_id)
    ),
    false
  );
$$;

grant execute on function public.can_access_legacy_banner_object(text) to authenticated;

alter table public.encounter_design_assets
  add column if not exists chronicle_id uuid references public.chronicles(id) on delete cascade;

update public.encounter_design_assets
set chronicle_id = public.chronicle_id_from_storage_object_name(image_path)
where chronicle_id is null
  and image_path like 'chronicle/%';

create index if not exists idx_encounter_design_assets_chronicle
  on public.encounter_design_assets (chronicle_id, created_at desc);

drop policy if exists encounter_design_assets_select on public.encounter_design_assets;
create policy encounter_design_assets_select
on public.encounter_design_assets
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or (
    chronicle_id is not null
    and chronicle_id in (select public.get_my_chronicle_ids())
  )
  or is_shared = true
);

drop policy if exists encounter_design_assets_insert on public.encounter_design_assets;
create policy encounter_design_assets_insert
on public.encounter_design_assets
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and chronicle_id is not null
  and chronicle_id in (select public.get_my_chronicle_ids())
);

drop policy if exists encounter_design_assets_update on public.encounter_design_assets;
create policy encounter_design_assets_update
on public.encounter_design_assets
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    chronicle_id is null
    or chronicle_id in (select public.get_my_chronicle_ids())
  )
)
with check (
  owner_user_id = auth.uid()
  and (
    chronicle_id is null
    or chronicle_id in (select public.get_my_chronicle_ids())
  )
);

drop policy if exists encounter_design_assets_delete on public.encounter_design_assets;
create policy encounter_design_assets_delete
on public.encounter_design_assets
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    chronicle_id is null
    or chronicle_id in (select public.get_my_chronicle_ids())
  )
);

-- Chronicle banners: narrator/owner only, scoped path

drop policy if exists "Authenticated users can upload chronicle banners" on storage.objects;
create policy "Authenticated users can upload chronicle banners"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chronicle-banners'
  and (
    public.can_manage_chronicle_scoped_object(name)
    or public.can_access_legacy_banner_object(name)
  )
);

drop policy if exists "Authenticated users can update chronicle banners" on storage.objects;
create policy "Authenticated users can update chronicle banners"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chronicle-banners'
  and (
    public.can_manage_chronicle_scoped_object(name)
    or public.can_access_legacy_banner_object(name)
  )
)
with check (
  bucket_id = 'chronicle-banners'
  and (
    public.can_manage_chronicle_scoped_object(name)
    or public.can_access_legacy_banner_object(name)
  )
);

drop policy if exists "Authenticated users can delete chronicle banners" on storage.objects;
create policy "Authenticated users can delete chronicle banners"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chronicle-banners'
  and (
    public.can_manage_chronicle_scoped_object(name)
    or public.can_access_legacy_banner_object(name)
  )
);

-- Encounter backgrounds: chronicle participant scoped path

drop policy if exists "Authenticated users can upload encounter backgrounds" on storage.objects;
create policy "Authenticated users can upload encounter backgrounds"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'encounter-backgrounds'
  and public.can_access_chronicle_scoped_object(name)
);

drop policy if exists "Authenticated users can update encounter backgrounds" on storage.objects;
create policy "Authenticated users can update encounter backgrounds"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'encounter-backgrounds'
  and public.can_access_chronicle_scoped_object(name)
)
with check (
  bucket_id = 'encounter-backgrounds'
  and public.can_access_chronicle_scoped_object(name)
);

drop policy if exists "Authenticated users can delete encounter backgrounds" on storage.objects;
create policy "Authenticated users can delete encounter backgrounds"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'encounter-backgrounds'
  and public.can_access_chronicle_scoped_object(name)
);

-- Encounter assets: chronicle scoped path or legacy owner path

drop policy if exists "Authenticated users can upload encounter assets" on storage.objects;
create policy "Authenticated users can upload encounter assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'encounter-assets'
  and (
    public.can_access_chronicle_scoped_object(name)
    or (
      name like ('user/' || auth.uid()::text || '/%')
      and owner = auth.uid()
    )
  )
);

drop policy if exists "Authenticated users can update encounter assets" on storage.objects;
create policy "Authenticated users can update encounter assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'encounter-assets'
  and (
    public.can_access_chronicle_scoped_object(name)
    or (
      name like ('user/' || auth.uid()::text || '/%')
      and owner = auth.uid()
    )
  )
)
with check (
  bucket_id = 'encounter-assets'
  and (
    public.can_access_chronicle_scoped_object(name)
    or (
      name like ('user/' || auth.uid()::text || '/%')
      and owner = auth.uid()
    )
  )
);

drop policy if exists "Authenticated users can delete encounter assets" on storage.objects;
create policy "Authenticated users can delete encounter assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'encounter-assets'
  and (
    public.can_access_chronicle_scoped_object(name)
    or (
      name like ('user/' || auth.uid()::text || '/%')
      and owner = auth.uid()
    )
  )
);

create or replace view public.chronicle_storage_usage as
select
  c.id as chronicle_id,
  c.name as chronicle_name,
  public.get_chronicle_storage_usage_bytes(c.id) as usage_bytes,
  public.get_chronicle_storage_limit_bytes(c.id) as limit_bytes,
  case
    when public.get_chronicle_storage_limit_bytes(c.id) is null then null::bigint
    else greatest(
      public.get_chronicle_storage_limit_bytes(c.id) - public.get_chronicle_storage_usage_bytes(c.id),
      0
    )
  end as remaining_bytes
from public.chronicles c;

grant select on public.chronicle_storage_usage to authenticated;

commit;
