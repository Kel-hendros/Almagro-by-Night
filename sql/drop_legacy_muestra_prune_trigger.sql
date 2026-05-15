-- The legacy trg_prune_muestras trigger pruned chronicle_notifications rows
-- after each muestra insert (cap=5), but it never removed the underlying
-- storage objects. That left orphan blobs in revelations-private.
--
-- Pruning is now handled by the enforce-muestra-cap Edge Function, which
-- removes the storage object as well. This drop removes the legacy trigger
-- so the two systems don't fight.

drop trigger if exists trg_prune_muestras on public.chronicle_notifications;
drop function if exists public.trg_prune_muestra_notifications();
