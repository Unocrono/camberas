-- Añadir campos de escala para cada elemento del overlay
ALTER TABLE public.overlay_config
ADD COLUMN IF NOT EXISTS speed_scale numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS distance_scale numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS gaps_scale numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS clock_scale numeric DEFAULT 1.0;