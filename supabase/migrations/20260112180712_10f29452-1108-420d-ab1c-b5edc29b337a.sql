-- Update RLS policy for race_distances to allow registered users with gps_tracking_enabled
-- Drop existing policy
DROP POLICY IF EXISTS "Anyone can view visible race distances" ON race_distances;

-- Create new policy that allows:
-- 1. Visible distances from visible races (public)
-- 2. Admin/organizer access
-- 3. Users registered in distances with gps_tracking_enabled (regardless of is_visible)
CREATE POLICY "Anyone can view visible race distances or GPS enabled for registered users" 
ON race_distances 
FOR SELECT 
USING (
  -- Public access: visible distances from visible races
  (is_visible = true AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.is_visible = true
  ))
  -- Admin access
  OR has_role(auth.uid(), 'admin'::app_role)
  -- Organizer access
  OR has_role(auth.uid(), 'organizer'::app_role)
  -- Registered users with GPS enabled (regardless of visibility)
  OR (
    gps_tracking_enabled = true 
    AND EXISTS (
      SELECT 1 FROM registrations 
      WHERE registrations.race_distance_id = race_distances.id 
      AND registrations.user_id = auth.uid()
      AND registrations.status IN ('confirmed', 'pending')
    )
  )
);