-- Muestras efimeras del narrador
-- Extiende chronicle_notifications con tipo 'muestra'.
-- Mantiene solo las ultimas 5 muestras por cronica (auto-prune).

-- ============================================================
-- 1. Extender CHECK constraint para aceptar 'muestra'
-- ============================================================

ALTER TABLE public.chronicle_notifications
  DROP CONSTRAINT IF EXISTS chronicle_notifications_type_check;

ALTER TABLE public.chronicle_notifications
  ADD CONSTRAINT chronicle_notifications_type_check
  CHECK (type IN (
    'dice_roll', 'revelation', 'session_start',
    'session_end', 'player_joined', 'system', 'muestra'
  ));

-- ============================================================
-- 2. Trigger: mantener solo las ultimas 5 muestras por cronica
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_prune_muestra_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type <> 'muestra' THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.chronicle_notifications
  WHERE id IN (
    SELECT id FROM public.chronicle_notifications
    WHERE chronicle_id = NEW.chronicle_id
      AND type = 'muestra'
    ORDER BY created_at DESC
    OFFSET 5
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_muestras ON public.chronicle_notifications;
CREATE TRIGGER trg_prune_muestras
  AFTER INSERT ON public.chronicle_notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_prune_muestra_notifications();
