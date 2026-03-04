-- =============================================================
-- Chronicle Notes (player-scoped notes per chronicle)
-- Canonical schema + migration from character_sheets.data.notes
-- Applied: 2026-03-04
-- =============================================================

begin;

create table if not exists public.chronicle_notes (
  id uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 160),
  body_markdown text not null default '',
  tags text[] not null default '{}',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chronicle_notes_scope_updated
  on public.chronicle_notes (chronicle_id, player_id, is_archived, updated_at desc);

create index if not exists idx_chronicle_notes_tags
  on public.chronicle_notes using gin (tags);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chronicle_notes_updated_at on public.chronicle_notes;
create trigger trg_chronicle_notes_updated_at
before update on public.chronicle_notes
for each row
execute function public.set_updated_at();

alter table public.chronicle_notes enable row level security;

drop policy if exists chronicle_notes_select_own on public.chronicle_notes;
create policy chronicle_notes_select_own
on public.chronicle_notes
for select
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

drop policy if exists chronicle_notes_insert_own on public.chronicle_notes;
create policy chronicle_notes_insert_own
on public.chronicle_notes
for insert
to authenticated
with check (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

drop policy if exists chronicle_notes_update_own on public.chronicle_notes;
create policy chronicle_notes_update_own
on public.chronicle_notes
for update
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
)
with check (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

drop policy if exists chronicle_notes_delete_own on public.chronicle_notes;
create policy chronicle_notes_delete_own
on public.chronicle_notes
for delete
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
  and player_id in (
    select p.id
    from public.players p
    where p.user_id = auth.uid()
  )
);

with legacy_notes as (
  select
    cc.chronicle_id,
    p.id as player_id,
    coalesce(nullif(trim(note_elem->>'title'), ''), 'Sin titulo') as title,
    coalesce(note_elem->>'body', '') as body_markdown,
    case
      when jsonb_typeof(note_elem->'tags') = 'array' then coalesce((
        select array_agg(trim(t.tag))
        from jsonb_array_elements_text(note_elem->'tags') as t(tag)
        where trim(t.tag) <> ''
      ), '{}'::text[])
      else '{}'::text[]
    end as tags,
    coalesce((note_elem->>'archived')::boolean, false) as is_archived,
    case
      when coalesce(note_elem->>'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (note_elem->>'createdAt')::timestamptz
      else cs.created_at
    end as created_at,
    case
      when coalesce(note_elem->>'updatedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (note_elem->>'updatedAt')::timestamptz
      when coalesce(note_elem->>'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (note_elem->>'createdAt')::timestamptz
      else cs.updated_at
    end as updated_at
  from public.character_sheets cs
  join public.chronicle_characters cc on cc.character_sheet_id = cs.id
  join lateral (
    select p1.id
    from public.players p1
    where p1.user_id = cs.user_id
    order by p1.joined_at asc
    limit 1
  ) p on true
  cross join lateral jsonb_array_elements(coalesce(cs.data->'notes', '[]'::jsonb)) as note_elem
)
insert into public.chronicle_notes (
  chronicle_id,
  player_id,
  title,
  body_markdown,
  tags,
  is_archived,
  created_at,
  updated_at
)
select
  ln.chronicle_id,
  ln.player_id,
  ln.title,
  ln.body_markdown,
  ln.tags,
  ln.is_archived,
  ln.created_at,
  ln.updated_at
from legacy_notes ln
where not exists (
  select 1
  from public.chronicle_notes cn
  where cn.chronicle_id = ln.chronicle_id
    and cn.player_id = ln.player_id
    and cn.title = ln.title
    and cn.body_markdown = ln.body_markdown
    and cn.tags = ln.tags
    and cn.is_archived = ln.is_archived
    and cn.created_at = ln.created_at
);

-- Remove legacy notes payload from character sheet JSON
update public.character_sheets
set data = data - 'notes'
where coalesce(data, '{}'::jsonb) ? 'notes';

commit;
