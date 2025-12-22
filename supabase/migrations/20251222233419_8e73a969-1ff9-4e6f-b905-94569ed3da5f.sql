-- Añadir columnas para el reloj de carrera en overlay_config
ALTER TABLE public.overlay_config
ADD COLUMN IF NOT EXISTS clock_font text DEFAULT 'Bebas Neue',
ADD COLUMN IF NOT EXISTS clock_size integer DEFAULT 72,
ADD COLUMN IF NOT EXISTS clock_color text DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS clock_bg_color text DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS clock_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS clock_bg_opacity numeric DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS clock_pos_x numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS clock_pos_y numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS active_wave_ids jsonb DEFAULT '[]'::jsonb;