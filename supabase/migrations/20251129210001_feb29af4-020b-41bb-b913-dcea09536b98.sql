-- Añadir campos de coordenadas GPS a race_checkpoints
ALTER TABLE public.race_checkpoints ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.race_checkpoints ADD COLUMN IF NOT EXISTS longitude numeric;