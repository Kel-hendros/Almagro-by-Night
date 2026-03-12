-- Add is_favorite column to character_objects
alter table public.character_objects
  add column if not exists is_favorite boolean not null default false;

-- Replace the scope index to include is_favorite for sort priority
drop index if exists idx_character_objects_scope_updated;
create index idx_character_objects_scope_updated
  on public.character_objects (character_sheet_id, is_archived, is_favorite desc, updated_at desc);
