-- Revelations private storage
-- Uses one private bucket with per-chronicle folders:
-- chronicle/<chronicle_id>/revelations/<file>

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'revelations-private',
  'revelations-private',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id)
do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.revelations_chronicle_id_from_object_name(p_name text)
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

  if p_name !~ '^chronicle/[0-9a-fA-F-]{36}/revelations/.+' then
    return null;
  end if;

  extracted := split_part(p_name, '/', 2);
  return extracted::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.is_narrator_or_chronicle_owner(p_chronicle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.chronicle_participants cp
      join public.players p on p.id = cp.player_id
      where cp.chronicle_id = p_chronicle_id
        and cp.role = 'narrator'
        and p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chronicles c
      join public.players p on p.id = c.creator_id
      where c.id = p_chronicle_id
        and p.user_id = auth.uid()
    );
$$;

grant execute on function public.is_narrator_or_chronicle_owner(uuid) to authenticated;

create or replace function public.can_read_revelations_object(p_object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with target as (
    select public.revelations_chronicle_id_from_object_name(p_object_name) as chronicle_id
  )
  select coalesce(
    exists (
      select 1
      from target t
      where t.chronicle_id is not null
        and (
          public.is_narrator_or_chronicle_owner(t.chronicle_id)
          or exists (
            select 1
            from public.chronicle_participants cp
            join public.players p on p.id = cp.player_id
            where cp.chronicle_id = t.chronicle_id
              and p.user_id = auth.uid()
          )
        )
    ),
    false
  );
$$;

grant execute on function public.can_read_revelations_object(text) to authenticated;

create or replace function public.can_manage_revelations_object(p_object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with target as (
    select public.revelations_chronicle_id_from_object_name(p_object_name) as chronicle_id
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

grant execute on function public.can_manage_revelations_object(text) to authenticated;

create or replace function public.ensure_revelations_storage_bucket()
returns text
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'revelations-private',
    'revelations-private',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
  )
  on conflict (id)
  do update
  set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  return 'revelations-private';
end;
$$;

grant execute on function public.ensure_revelations_storage_bucket() to authenticated;

drop policy if exists "Revelations private upload" on storage.objects;
create policy "Revelations private upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'revelations-private'
  and public.can_manage_revelations_object(name)
);

drop policy if exists "Revelations private update" on storage.objects;
create policy "Revelations private update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'revelations-private'
  and public.can_manage_revelations_object(name)
)
with check (
  bucket_id = 'revelations-private'
  and public.can_manage_revelations_object(name)
);

drop policy if exists "Revelations private delete" on storage.objects;
create policy "Revelations private delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'revelations-private'
  and public.can_manage_revelations_object(name)
);

drop policy if exists "Revelations private read" on storage.objects;
create policy "Revelations private read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'revelations-private'
  and public.can_read_revelations_object(name)
);

commit;
