-- Add policy to allow authenticated users to view registrations for GPS tracking purposes
-- This enables all logged-in users to see participants on the live GPS map

CREATE POLICY "Authenticated users can view registrations for GPS tracking"
ON public.registrations
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM race_distances rd
    WHERE rd.id = registrations.race_distance_id
    AND rd.gps_tracking_enabled = true
  )
);