-- Add utc_offset field to races table
-- This stores the offset in minutes (e.g., +60 for CET, +120 for CEST)
-- Positive values mean local time is AHEAD of UTC

ALTER TABLE public.races 
ADD COLUMN IF NOT EXISTS utc_offset integer DEFAULT 60;

-- Add comment explaining the field
COMMENT ON COLUMN public.races.utc_offset IS 'UTC offset in minutes for the race location. Positive = local time ahead of UTC. E.g., 60 for CET (winter), 120 for CEST (summer). Used to convert GPS UTC times to local race time.';