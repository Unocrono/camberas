-- Create helper function to check if user has moto assignment for a race
CREATE OR REPLACE FUNCTION public.user_has_moto_assignment_for_race(p_race_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM race_motos
    WHERE race_id = p_race_id
    AND user_id = auth.uid()
    AND is_active = true
  );
END;
$$;

-- Update races RLS policy to also allow moto users to see invisible races they're assigned to
DROP POLICY IF EXISTS "Anyone can view visible races or own races" ON races;

CREATE POLICY "Anyone can view visible races or own races" 
ON races FOR SELECT 
USING (
  is_visible = true
  OR public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'organizer') AND organizer_id = auth.uid())
  OR public.user_has_gps_registration_for_race(id)
  OR public.user_has_moto_assignment_for_race(id)
);