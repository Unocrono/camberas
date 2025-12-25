-- Add distance calculation columns to moto_gps_tracking
ALTER TABLE moto_gps_tracking 
ADD COLUMN IF NOT EXISTS distance_to_finish numeric,
ADD COLUMN IF NOT EXISTS distance_to_next_checkpoint numeric,
ADD COLUMN IF NOT EXISTS next_checkpoint_name text,
ADD COLUMN IF NOT EXISTS next_checkpoint_id uuid REFERENCES race_checkpoints(id);

-- Add comment for documentation
COMMENT ON COLUMN moto_gps_tracking.distance_to_finish IS 'Distance to finish line in km, calculated by edge function from GPX';
COMMENT ON COLUMN moto_gps_tracking.distance_to_next_checkpoint IS 'Distance to next checkpoint in km, calculated by edge function';
COMMENT ON COLUMN moto_gps_tracking.next_checkpoint_name IS 'Name of the next checkpoint';
COMMENT ON COLUMN moto_gps_tracking.next_checkpoint_id IS 'ID of the next checkpoint';