-- List chronicle storage as domain objects, not raw files.
-- Deletion is handled by Edge Functions because Storage objects must be
-- removed through the Storage API.

begin;

create or replace function public.list_chronicle_storage_items(p_chronicle_id uuid)
returns table (
  item_id text,
  item_type text,
  label text,
  uploaded_at timestamptz,
  size_bytes bigint,
  can_delete boolean,
  block_reason text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if p_chronicle_id is null then
    return query
    select
      null::text,
      'error'::text,
      'Crónica requerida'::text,
      null::timestamptz,
      0::bigint,
      false,
      'chronicle_id_required'::text,
      '{}'::jsonb;
    return;
  end if;

  if not public.is_narrator_or_chronicle_owner(p_chronicle_id) then
    return query
    select
      null::text,
      'error'::text,
      'Sin permisos'::text,
      null::timestamptz,
      0::bigint,
      false,
      'not_authorized'::text,
      '{}'::jsonb;
    return;
  end if;

  return query
  with chronicle_row as (
    select c.id, c.name, c.creator_id, c.banner_url
      from public.chronicles c
     where c.id = p_chronicle_id
  ),
  narrator_players as (
    select cr.creator_id as player_id
      from chronicle_row cr
    union
    select cp.player_id
      from public.chronicle_participants cp
     where cp.chronicle_id = p_chronicle_id
       and cp.role = 'narrator'
  ),
  narrator_users as (
    select p.id as player_id, p.user_id
      from public.players p
      join narrator_players np on np.player_id = p.id
     where p.user_id is not null
  ),
  banner_paths as (
    select
      substring(cr.banner_url from '/chronicle-banners/(.*)$') as object_path
      from chronicle_row cr
     where nullif(cr.banner_url, '') is not null
  ),
  banner_items as (
    select
      bp.object_path::text as item_id,
      'banner'::text as item_type,
      'Banner de crónica'::text as label,
      o.created_at as uploaded_at,
      public.storage_object_size_bytes(o.metadata) as size_bytes,
      true as can_delete,
      null::text as block_reason,
      jsonb_build_object(
        'bucket', 'chronicle-banners',
        'path', bp.object_path
      ) as metadata
      from banner_paths bp
      join storage.objects o
        on o.bucket_id = 'chronicle-banners'
       and o.name = bp.object_path
      join narrator_users nu on nu.user_id = o.owner
     where nullif(bp.object_path, '') is not null
  ),
  encounter_paths as (
    select e.id as encounter_id, eb.image_path as object_path
      from public.encounters e
      join public.encounter_backgrounds eb on eb.encounter_id = e.id
     where e.chronicle_id = p_chronicle_id
       and eb.owner_user_id in (select nu.user_id from narrator_users nu)
    union
    select e.id as encounter_id, e.data #>> '{map,backgroundPath}' as object_path
      from public.encounters e
     where e.chronicle_id = p_chronicle_id
       and e.user_id in (select nu.user_id from narrator_users nu)
       and nullif(e.data #>> '{map,backgroundPath}', '') is not null
  ),
  encounter_items as (
    select
      e.id::text as item_id,
      'encounter'::text as item_type,
      coalesce(nullif(e.name, ''), 'Encuentro')::text as label,
      coalesce(max(o.created_at), e.created_at) as uploaded_at,
      coalesce(sum(public.storage_object_size_bytes(o.metadata)), 0)::bigint as size_bytes,
      e.status = 'archived' as can_delete,
      case
        when e.status = 'archived' then null::text
        else 'Archivar primero'
      end as block_reason,
      jsonb_build_object(
        'status', e.status,
        'storage_paths', coalesce(
          jsonb_agg(distinct ep.object_path) filter (where ep.object_path is not null),
          '[]'::jsonb
        )
      ) as metadata
      from public.encounters e
      join encounter_paths ep on ep.encounter_id = e.id
      left join storage.objects o
        on o.bucket_id = 'encounter-backgrounds'
       and o.name = ep.object_path
     where e.chronicle_id = p_chronicle_id
       and e.user_id in (select nu.user_id from narrator_users nu)
     group by e.id, e.name, e.status, e.created_at
    having coalesce(sum(public.storage_object_size_bytes(o.metadata)), 0) > 0
  ),
  asset_items as (
    select
      a.id::text as item_id,
      'asset'::text as item_type,
      coalesce(nullif(a.name, ''), 'Asset')::text as label,
      coalesce(o.created_at, a.created_at) as uploaded_at,
      coalesce(public.storage_object_size_bytes(o.metadata), 0)::bigint as size_bytes,
      not exists (
        select 1
          from public.encounters e
         where e.chronicle_id = p_chronicle_id
           and (
             exists (
               select 1
                 from jsonb_array_elements(coalesce(e.data->'designTokens', '[]'::jsonb)) dt
                where dt->>'assetId' = a.id::text
             )
             or exists (
               select 1
                 from jsonb_array_elements(coalesce(e.data->'props', '[]'::jsonb)) pr
                where pr->>'assetId' = a.id::text
             )
           )
      ) as can_delete,
      case
        when exists (
          select 1
            from public.encounters e
           where e.chronicle_id = p_chronicle_id
             and (
               exists (
                 select 1
                   from jsonb_array_elements(coalesce(e.data->'designTokens', '[]'::jsonb)) dt
                  where dt->>'assetId' = a.id::text
               )
               or exists (
                 select 1
                   from jsonb_array_elements(coalesce(e.data->'props', '[]'::jsonb)) pr
                  where pr->>'assetId' = a.id::text
               )
             )
        ) then 'En uso'
        else null::text
      end as block_reason,
      jsonb_build_object(
        'bucket', 'encounter-assets',
        'path', a.image_path,
        'category', coalesce(a.category, 'decor')
      ) as metadata
      from public.encounter_design_assets a
      left join storage.objects o
        on o.bucket_id = 'encounter-assets'
       and o.name = a.image_path
     where a.chronicle_id = p_chronicle_id
       and a.owner_user_id in (select nu.user_id from narrator_users nu)
       and coalesce(public.storage_object_size_bytes(o.metadata), 0) > 0
  ),
  revelation_items as (
    select
      r.id::text as item_id,
      'revelation'::text as item_type,
      coalesce(nullif(r.title, ''), 'Revelación')::text as label,
      coalesce(o.created_at, r.created_at) as uploaded_at,
      coalesce(public.storage_object_size_bytes(o.metadata), 0)::bigint as size_bytes,
      true as can_delete,
      null::text as block_reason,
      jsonb_build_object(
        'bucket', 'revelations-private',
        'path', replace(r.image_url, 'abn-private://revelations-private/', '')
      ) as metadata
      from public.revelations r
      join narrator_users nu on nu.player_id = r.created_by_player_id
      left join storage.objects o
        on o.bucket_id = 'revelations-private'
       and o.name = replace(r.image_url, 'abn-private://revelations-private/', '')
     where r.chronicle_id = p_chronicle_id
       and r.image_url like 'abn-private://revelations-private/chronicle/%'
       and coalesce(public.storage_object_size_bytes(o.metadata), 0) > 0
  ),
  muestra_items as (
    select
      n.id::text as item_id,
      'muestra'::text as item_type,
      coalesce(nullif(n.body, ''), 'Muestra')::text as label,
      coalesce(o.created_at, n.created_at) as uploaded_at,
      coalesce(public.storage_object_size_bytes(o.metadata), 0)::bigint as size_bytes,
      true as can_delete,
      null::text as block_reason,
      jsonb_build_object(
        'bucket', 'revelations-private',
        'path', replace(n.metadata->>'imageRef', 'abn-private://revelations-private/', ''),
        'created_at', n.created_at
      ) as metadata
      from public.chronicle_notifications n
      left join storage.objects o
        on o.bucket_id = 'revelations-private'
       and o.name = replace(n.metadata->>'imageRef', 'abn-private://revelations-private/', '')
     where n.chronicle_id = p_chronicle_id
       and n.type = 'muestra'
       and coalesce((n.metadata->>'deleted')::boolean, false) is not true
       and (n.metadata->>'imageRef') like 'abn-private://revelations-private/chronicle/%'
       and coalesce(public.storage_object_size_bytes(o.metadata), 0) > 0
  )
  select * from banner_items
  union all
  select * from encounter_items
  union all
  select * from asset_items
  union all
  select * from revelation_items
  union all
  select * from muestra_items
  order by uploaded_at desc nulls last, label asc;
end;
$$;

revoke execute on function public.list_chronicle_storage_items(uuid) from public;
revoke execute on function public.list_chronicle_storage_items(uuid) from anon;
grant execute on function public.list_chronicle_storage_items(uuid) to authenticated;

commit;
