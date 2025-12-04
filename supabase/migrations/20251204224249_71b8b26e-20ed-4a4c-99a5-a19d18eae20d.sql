-- Add geofence_radius column to race_checkpoints for GPS auto-timing
ALTER TABLE public.race_checkpoints 
ADD COLUMN IF NOT EXISTS geofence_radius integer DEFAULT 50;

-- Add comment explaining the column
COMMENT ON COLUMN public.race_checkpoints.geofence_radius IS 'Radio en metros para detección GPS automática de paso por checkpoint';

-- Add 'gps_auto' as valid reading_type (informational, text column accepts any value)