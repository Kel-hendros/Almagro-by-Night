-- Un personaje solo puede estar en una crónica a la vez.
-- Si ya está en una, hay que sacarlo primero antes de agregarlo a otra.

-- Limpiar duplicados (mantener el más reciente)
DELETE FROM public.chronicle_characters cc1
WHERE EXISTS (
  SELECT 1 FROM public.chronicle_characters cc2
  WHERE cc2.character_sheet_id = cc1.character_sheet_id
    AND cc2.added_at > cc1.added_at
);

-- Constraint UNIQUE
ALTER TABLE public.chronicle_characters
  DROP CONSTRAINT IF EXISTS unique_character_sheet;
ALTER TABLE public.chronicle_characters
  ADD CONSTRAINT unique_character_sheet UNIQUE (character_sheet_id);
