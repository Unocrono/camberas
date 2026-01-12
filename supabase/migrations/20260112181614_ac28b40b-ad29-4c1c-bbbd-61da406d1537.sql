-- Create helper function to check GPS registration without triggering RLS recursion
CREATE OR REPLACE FUNCTION user_has_gps_registration(distance_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM registrations 
    WHERE registrations.race_distance_id = distance_id 
    AND registrations.user_id = auth.uid()
    AND registrations.status IN ('confirmed', 'pending')
  );
$$;

-- Update RLS policy to use the helper function
DROP POLICY IF EXISTS "View race distances with proper access control" ON race_distances;

CREATE POLICY "View race distances with proper access control" 
ON race_distances 
FOR SELECT 
USING (
  -- Public access: visible distances from visible races
  (is_visible = true AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.is_visible = true
  ))
  -- Admin access
  OR has_role(auth.uid(), 'admin'::app_role)
  -- Organizer access: only their own races
  OR (has_role(auth.uid(), 'organizer'::app_role) AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.organizer_id = auth.uid()
  ))
  -- Registered users with GPS enabled (using helper function to avoid recursion)
  OR (gps_tracking_enabled = true AND user_has_gps_registration(id))
);