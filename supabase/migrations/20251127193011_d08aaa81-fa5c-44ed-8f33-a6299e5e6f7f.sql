-- Add is_visible column to races table
ALTER TABLE public.races 
ADD COLUMN is_visible boolean NOT NULL DEFAULT true;

-- Add is_visible column to race_distances table
ALTER TABLE public.race_distances 
ADD COLUMN is_visible boolean NOT NULL DEFAULT true;

-- Drop existing "Anyone can view races" policy
DROP POLICY IF EXISTS "Anyone can view races" ON public.races;

-- Create new policy: Public users can only see visible races
CREATE POLICY "Anyone can view visible races" 
ON public.races 
FOR SELECT 
USING (
  is_visible = true 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'organizer'::app_role)
);

-- Drop existing "Anyone can view race distances" policy
DROP POLICY IF EXISTS "Anyone can view race distances" ON public.race_distances;

-- Create new policy: Public users can only see visible distances (and parent race must be visible)
CREATE POLICY "Anyone can view visible race distances" 
ON public.race_distances 
FOR SELECT 
USING (
  (is_visible = true AND EXISTS (
    SELECT 1 FROM races WHERE races.id = race_distances.race_id AND races.is_visible = true
  ))
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'organizer'::app_role)
);