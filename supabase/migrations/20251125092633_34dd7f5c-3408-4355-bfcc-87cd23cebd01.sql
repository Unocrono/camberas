-- Drop all policies that depend on roadbooks.race_id
DROP POLICY IF EXISTS "Organizers can manage schedules for their roadbooks" ON public.roadbook_schedules;
DROP POLICY IF EXISTS "Organizers can manage paces for their roadbooks" ON public.roadbook_paces;
DROP POLICY IF EXISTS "Organizers can manage items for their roadbooks" ON public.roadbook_items;
DROP POLICY IF EXISTS "Organizers can create roadbooks for their races" ON public.roadbooks;
DROP POLICY IF EXISTS "Organizers can update their race roadbooks" ON public.roadbooks;
DROP POLICY IF EXISTS "Organizers can delete their race roadbooks" ON public.roadbooks;

-- Now we can safely modify the roadbooks table
ALTER TABLE public.roadbooks DROP CONSTRAINT roadbooks_race_id_fkey;
ALTER TABLE public.roadbooks DROP COLUMN race_id;
ALTER TABLE public.roadbooks ADD COLUMN race_distance_id UUID NOT NULL REFERENCES public.race_distances(id) ON DELETE CASCADE;

-- Create new policies for roadbooks with race_distance_id
CREATE POLICY "Organizers can create roadbooks for their distances"
ON public.roadbooks
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM race_distances
    JOIN races ON races.id = race_distances.race_id
    WHERE race_distances.id = roadbooks.race_distance_id 
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Organizers can update their distance roadbooks"
ON public.roadbooks
FOR UPDATE
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM race_distances
    JOIN races ON races.id = race_distances.race_id
    WHERE race_distances.id = roadbooks.race_distance_id 
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Organizers can delete their distance roadbooks"
ON public.roadbooks
FOR DELETE
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM race_distances
    JOIN races ON races.id = race_distances.race_id
    WHERE race_distances.id = roadbooks.race_distance_id 
    AND races.organizer_id = auth.uid()
  )
);

-- Recreate policies for roadbook_items
CREATE POLICY "Organizers can manage items for their roadbooks"
ON public.roadbook_items
FOR ALL
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM roadbooks
    JOIN race_distances ON race_distances.id = roadbooks.race_distance_id
    JOIN races ON races.id = race_distances.race_id
    WHERE roadbooks.id = roadbook_items.roadbook_id 
    AND races.organizer_id = auth.uid()
  )
);

-- Recreate policies for roadbook_paces
CREATE POLICY "Organizers can manage paces for their roadbooks"
ON public.roadbook_paces
FOR ALL
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM roadbooks
    JOIN race_distances ON race_distances.id = roadbooks.race_distance_id
    JOIN races ON races.id = race_distances.race_id
    WHERE roadbooks.id = roadbook_paces.roadbook_id 
    AND races.organizer_id = auth.uid()
  )
);

-- Recreate policies for roadbook_schedules
CREATE POLICY "Organizers can manage schedules for their roadbooks"
ON public.roadbook_schedules
FOR ALL
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM roadbook_items
    JOIN roadbooks ON roadbooks.id = roadbook_items.roadbook_id
    JOIN race_distances ON race_distances.id = roadbooks.race_distance_id
    JOIN races ON races.id = race_distances.race_id
    WHERE roadbook_items.id = roadbook_schedules.roadbook_item_id 
    AND races.organizer_id = auth.uid()
  )
);