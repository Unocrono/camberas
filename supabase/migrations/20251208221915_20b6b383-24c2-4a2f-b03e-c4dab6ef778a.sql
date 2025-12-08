-- Drop the existing constraint and recreate with gps_geofence included
ALTER TABLE public.timing_readings 
DROP CONSTRAINT timing_readings_reading_type_check;

ALTER TABLE public.timing_readings 
ADD CONSTRAINT timing_readings_reading_type_check 
CHECK (reading_type = ANY (ARRAY['automatic'::text, 'manual'::text, 'status_change'::text, 'gps_geofence'::text]));