-- Add policy to allow viewing registrations for public race results
CREATE POLICY "Anyone can view registrations for race results"
ON public.registrations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM race_results rr
    WHERE rr.registration_id = registrations.id
  )
);