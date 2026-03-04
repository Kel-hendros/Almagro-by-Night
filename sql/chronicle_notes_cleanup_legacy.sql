-- =============================================================
-- Chronicle Notes cleanup: remove legacy traces
-- Applied: 2026-03-04
-- =============================================================

begin;

-- Remove legacy notes payload from character sheet JSON
update public.character_sheets
set data = data - 'notes'
where coalesce(data, '{}'::jsonb) ? 'notes';

-- Remove legacy migration trace columns in chronicle_notes
-- (kept temporarily during first migration for idempotent import)
drop index if exists public.uq_chronicle_notes_source;

alter table public.chronicle_notes
  drop column if exists source_table,
  drop column if exists source_pk,
  drop column if exists metadata;

commit;
