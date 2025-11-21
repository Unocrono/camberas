-- Add organizer_id column to races table
ALTER TABLE public.races 
ADD COLUMN organizer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_races_organizer_id ON public.races(organizer_id);

-- Update RLS policies for races table
DROP POLICY IF EXISTS "Admins can manage races" ON public.races;
DROP POLICY IF EXISTS "Anyone can view races" ON public.races;

CREATE POLICY "Anyone can view races"
  ON public.races
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all races"
  ON public.races
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can create races"
  ON public.races
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'organizer') AND auth.uid() = organizer_id);

CREATE POLICY "Organizers can update their own races"
  ON public.races
  FOR UPDATE
  USING (has_role(auth.uid(), 'organizer') AND auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete their own races"
  ON public.races
  FOR DELETE
  USING (has_role(auth.uid(), 'organizer') AND auth.uid() = organizer_id);

-- Update RLS policies for race_distances
DROP POLICY IF EXISTS "Admins can manage race distances" ON public.race_distances;
DROP POLICY IF EXISTS "Anyone can view race distances" ON public.race_distances;

CREATE POLICY "Anyone can view race distances"
  ON public.race_distances
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all race distances"
  ON public.race_distances
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage their race distances"
  ON public.race_distances
  FOR ALL
  USING (
    has_role(auth.uid(), 'organizer') AND 
    EXISTS (
      SELECT 1 FROM public.races 
      WHERE races.id = race_distances.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Update RLS policies for race_checkpoints
DROP POLICY IF EXISTS "Admins can manage race checkpoints" ON public.race_checkpoints;
DROP POLICY IF EXISTS "Anyone can view race checkpoints" ON public.race_checkpoints;

CREATE POLICY "Anyone can view race checkpoints"
  ON public.race_checkpoints
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all race checkpoints"
  ON public.race_checkpoints
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage their race checkpoints"
  ON public.race_checkpoints
  FOR ALL
  USING (
    has_role(auth.uid(), 'organizer') AND 
    EXISTS (
      SELECT 1 FROM public.races 
      WHERE races.id = race_checkpoints.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Update RLS policies for registrations (organizers need to see registrations for their races)
DROP POLICY IF EXISTS "Admins can view all registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admins can manage all registrations" ON public.registrations;

CREATE POLICY "Admins can manage all registrations"
  ON public.registrations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can view registrations for their races"
  ON public.registrations
  FOR SELECT
  USING (
    has_role(auth.uid(), 'organizer') AND 
    EXISTS (
      SELECT 1 FROM public.races 
      WHERE races.id = registrations.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can update registrations for their races"
  ON public.registrations
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'organizer') AND 
    EXISTS (
      SELECT 1 FROM public.races 
      WHERE races.id = registrations.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Update RLS policies for race_results
DROP POLICY IF EXISTS "Admins can manage race results" ON public.race_results;
DROP POLICY IF EXISTS "Anyone can view race results" ON public.race_results;

CREATE POLICY "Anyone can view race results"
  ON public.race_results
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all race results"
  ON public.race_results
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage results for their races"
  ON public.race_results
  FOR ALL
  USING (
    has_role(auth.uid(), 'organizer') AND 
    EXISTS (
      SELECT 1 FROM public.registrations 
      JOIN public.races ON races.id = registrations.race_id
      WHERE registrations.id = race_results.registration_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Update RLS policies for split_times
DROP POLICY IF EXISTS "Admins can manage split times" ON public.split_times;
DROP POLICY IF EXISTS "Anyone can view split times" ON public.split_times;

CREATE POLICY "Anyone can view split times"
  ON public.split_times
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all split times"
  ON public.split_times
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage split times for their races"
  ON public.split_times
  FOR ALL
  USING (
    has_role(auth.uid(), 'organizer') AND 
    EXISTS (
      SELECT 1 FROM public.race_results
      JOIN public.registrations ON registrations.id = race_results.registration_id
      JOIN public.races ON races.id = registrations.race_id
      WHERE race_results.id = split_times.race_result_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Update RLS policies for gps_tracking
DROP POLICY IF EXISTS "Admins can manage all GPS data" ON public.gps_tracking;

CREATE POLICY "Admins can manage all GPS data"
  ON public.gps_tracking
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can view GPS data for their races"
  ON public.gps_tracking
  FOR SELECT
  USING (
    has_role(auth.uid(), 'organizer') AND 
    EXISTS (
      SELECT 1 FROM public.races 
      WHERE races.id = gps_tracking.race_id 
      AND races.organizer_id = auth.uid()
    )
  );