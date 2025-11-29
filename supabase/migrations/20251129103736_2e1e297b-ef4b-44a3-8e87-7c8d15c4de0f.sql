-- Add GPS tracking columns to race_distances
ALTER TABLE public.race_distances
ADD COLUMN IF NOT EXISTS gps_tracking_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS gps_update_frequency integer DEFAULT 30;