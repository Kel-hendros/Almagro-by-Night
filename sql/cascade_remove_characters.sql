-- Cuando se elimina un participante de una crónica,
-- también se eliminan sus personajes de chronicle_characters.

CREATE OR REPLACE FUNCTION public.trg_remove_characters_on_participant_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chronicle_characters cc
  WHERE cc.chronicle_id = OLD.chronicle_id
    AND cc.character_sheet_id IN (
      SELECT cs.id FROM public.character_sheets cs
      JOIN public.players p ON p.user_id = cs.user_id
      WHERE p.id = OLD.player_id
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_remove_characters ON public.chronicle_participants;
CREATE TRIGGER trg_cascade_remove_characters
  AFTER DELETE ON public.chronicle_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_remove_characters_on_participant_delete();
