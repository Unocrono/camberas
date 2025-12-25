-- Add checkpoint element fields to overlay_config
ALTER TABLE overlay_config 
ADD COLUMN IF NOT EXISTS checkpoint_font text DEFAULT 'Roboto Condensed',
ADD COLUMN IF NOT EXISTS checkpoint_size integer DEFAULT 36,
ADD COLUMN IF NOT EXISTS checkpoint_color text DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS checkpoint_bg_color text DEFAULT '#1a1a1a',
ADD COLUMN IF NOT EXISTS checkpoint_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS checkpoint_manual_mode boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS checkpoint_manual_value text,
ADD COLUMN IF NOT EXISTS checkpoint_bg_opacity numeric DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS checkpoint_pos_x numeric DEFAULT 90,
ADD COLUMN IF NOT EXISTS checkpoint_pos_y numeric DEFAULT 85,
ADD COLUMN IF NOT EXISTS checkpoint_scale numeric DEFAULT 1.0;