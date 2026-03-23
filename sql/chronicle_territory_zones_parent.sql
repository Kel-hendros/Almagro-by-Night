-- Add parent_id column to chronicle_territory_zones for hierarchical grouping
-- Allows zones to be grouped under other zones (e.g., districts within a city domain)

BEGIN;

-- Add parent_id column (nullable, self-referential)
ALTER TABLE public.chronicle_territory_zones
ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.chronicle_territory_zones(id) ON DELETE CASCADE;

-- Index for efficient hierarchy queries
CREATE INDEX IF NOT EXISTS chronicle_territory_zones_parent_id_idx
  ON public.chronicle_territory_zones(parent_id);

COMMIT;
