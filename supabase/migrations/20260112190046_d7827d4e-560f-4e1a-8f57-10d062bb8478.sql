
-- Create helper function FIRST to check if user has a GPS registration for a specific race
CREATE OR REPLACE FUNCTION public.user_has_gps_registration_for_race(race_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM registrations r
    JOIN race_distances rd ON rd.id = r.race_distance_id
    WHERE r.race_id = race_uuid
      AND rd.gps_tracking_enabled = true
      AND r.status IN ('confirmed', 'pending')
      AND (
        r.user_id = auth.uid() 
        OR (r.user_id IS NULL AND LOWER(r.email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid())))
      )
  );
$$;

-- Now update the policy to include users with GPS registrations
DROP POLICY IF EXISTS "Anyone can view visible races or own races" ON public.races;

CREATE POLICY "Anyone can view visible races or own races" 
ON public.races 
FOR SELECT 
USING (
  (is_visible = true) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR (has_role(auth.uid(), 'organizer'::app_role) AND (organizer_id = auth.uid()))
  OR user_has_gps_registration_for_race(id)
);
