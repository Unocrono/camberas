-- Create helper function to check if user has moto assignment for a race distance
CREATE OR REPLACE FUNCTION user_has_moto_assignment_for_distance(distance_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM race_motos rm
    WHERE (
      -- Moto directly assigned to user
      rm.user_id = auth.uid()
      -- Or moto assigned via moto_assignments
      OR EXISTS (
        SELECT 1 FROM moto_assignments ma
        WHERE ma.moto_id = rm.id AND ma.user_id = auth.uid()
      )
    )
    -- Match by distance_id OR by race_id (for motos without specific distance)
    AND (
      rm.race_distance_id = distance_id
      OR rm.race_id = (SELECT race_id FROM race_distances WHERE id = distance_id)
    )
  );
END;
$$;

-- Drop and recreate the race_distances SELECT policy to include moto users
DROP POLICY IF EXISTS "View race distances with proper access control" ON race_distances;

CREATE POLICY "View race distances with proper access control"
ON race_distances
FOR SELECT
USING (
  -- Public races with visible distances
  (is_visible = true AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.is_visible = true
  ))
  -- Admins can see all
  OR has_role(auth.uid(), 'admin'::app_role)
  -- Organizers can see their own races
  OR (has_role(auth.uid(), 'organizer'::app_role) AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.organizer_id = auth.uid()
  ))
  -- GPS-enabled distances for registered participants
  OR (gps_tracking_enabled = true AND user_has_gps_registration(id))
  -- Moto users can see distances for their assigned races
  OR user_has_moto_assignment_for_distance(id)
);