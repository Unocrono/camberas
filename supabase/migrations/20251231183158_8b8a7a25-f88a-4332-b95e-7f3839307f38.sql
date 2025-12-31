-- Drop the problematic policy causing infinite recursion
DROP POLICY IF EXISTS "Anyone can view registrations for race results" ON public.registrations;

-- Create a simple policy that allows public read access for confirmed registrations
-- This avoids the circular dependency with race_results
CREATE POLICY "Anyone can view confirmed registrations"
ON public.registrations
FOR SELECT
USING (status = 'confirmed');