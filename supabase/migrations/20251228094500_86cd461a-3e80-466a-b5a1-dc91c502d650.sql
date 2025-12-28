-- Add columns for route map overlay config
ALTER TABLE public.overlay_config
ADD COLUMN IF NOT EXISTS route_map_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS route_map_line_color text DEFAULT '#FF0000',
ADD COLUMN IF NOT EXISTS route_map_line_width integer DEFAULT 4,
ADD COLUMN IF NOT EXISTS route_map_moto_label_size integer DEFAULT 16,
ADD COLUMN IF NOT EXISTS route_map_moto_label_color text DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS route_map_moto_label_bg_color text DEFAULT '#000000',

-- Add columns for elevation overlay config
ADD COLUMN IF NOT EXISTS elevation_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS elevation_line_color text DEFAULT '#00FF00',
ADD COLUMN IF NOT EXISTS elevation_fill_opacity numeric DEFAULT 0.3,
ADD COLUMN IF NOT EXISTS elevation_moto_marker_size integer DEFAULT 10,

-- Add column for multiple moto selection (for map/elevation overlays)
ADD COLUMN IF NOT EXISTS map_overlay_moto_ids jsonb DEFAULT '[]'::jsonb,

-- Add column for selected distance (shared between overlays)
ADD COLUMN IF NOT EXISTS selected_distance_id uuid REFERENCES race_distances(id) ON DELETE SET NULL;