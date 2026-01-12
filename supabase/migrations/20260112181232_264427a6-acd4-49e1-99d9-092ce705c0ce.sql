-- Fix RLS for races: Organizers should only see visible races OR their own races
DROP POLICY IF EXISTS "Anyone can view visible races" ON races;

CREATE POLICY "Anyone can view visible races or own races" 
ON races 
FOR SELECT 
USING (
  -- Public access: visible races
  is_visible = true
  -- Admin access: all races
  OR has_role(auth.uid(), 'admin'::app_role)
  -- Organizer access: only their own races (regardless of visibility)
  OR (has_role(auth.uid(), 'organizer'::app_role) AND organizer_id = auth.uid())
);

-- Fix RLS for race_distances: Organizers should only see distances from visible races OR their own races
DROP POLICY IF EXISTS "Anyone can view visible race distances or GPS enabled for registered users" ON race_distances;

CREATE POLICY "View race distances with proper access control" 
ON race_distances 
FOR SELECT 
USING (
  -- Public access: visible distances from visible races
  (is_visible = true AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.is_visible = true
  ))
  -- Admin access: all distances
  OR has_role(auth.uid(), 'admin'::app_role)
  -- Organizer access: only distances from their own races
  OR (has_role(auth.uid(), 'organizer'::app_role) AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.organizer_id = auth.uid()
  ))
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