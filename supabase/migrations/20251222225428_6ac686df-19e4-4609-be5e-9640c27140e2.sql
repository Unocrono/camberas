-- Add new fields for overlay positioning, sizing and transparency per indicator
ALTER TABLE overlay_config 
ADD COLUMN IF NOT EXISTS speed_bg_opacity numeric DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS speed_pos_x numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS speed_pos_y numeric DEFAULT 90,
ADD COLUMN IF NOT EXISTS speed_display_type text DEFAULT 'speed',
ADD COLUMN IF NOT EXISTS distance_bg_opacity numeric DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS distance_pos_x numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS distance_pos_y numeric DEFAULT 90,
ADD COLUMN IF NOT EXISTS gaps_bg_opacity numeric DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS gaps_pos_x numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS gaps_pos_y numeric DEFAULT 90;

COMMENT ON COLUMN overlay_config.speed_display_type IS 'speed or pace (min/km)';
COMMENT ON COLUMN overlay_config.speed_bg_opacity IS 'Background opacity 0-1';
COMMENT ON COLUMN overlay_config.speed_pos_x IS 'Horizontal position percentage 0-100';
COMMENT ON COLUMN overlay_config.speed_pos_y IS 'Vertical position percentage 0-100';