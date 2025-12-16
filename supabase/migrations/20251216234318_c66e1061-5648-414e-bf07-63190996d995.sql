-- Eliminar la constraint antigua
ALTER TABLE public.race_checkpoints DROP CONSTRAINT IF EXISTS checkpoint_type_check;