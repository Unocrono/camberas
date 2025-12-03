-- Allow organizers to view profiles of users assigned as timers to their races
CREATE POLICY "Organizers can view profiles of assigned timers" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND 
  EXISTS (
    SELECT 1 
    FROM timer_assignments ta
    JOIN races r ON r.id = ta.race_id
    WHERE ta.user_id = profiles.id 
    AND r.organizer_id = auth.uid()
  )
);

-- Allow organizers to view user_roles of users assigned as timers to their races
CREATE POLICY "Organizers can view roles of assigned timers" 
ON public.user_roles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND 
  EXISTS (
    SELECT 1 
    FROM timer_assignments ta
    JOIN races r ON r.id = ta.race_id
    WHERE ta.user_id = user_roles.user_id 
    AND r.organizer_id = auth.uid()
  )
);

-- Also allow organizers to see all timer users (to assign them)
CREATE POLICY "Organizers can view timer user profiles" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND 
  EXISTS (
    SELECT 1 
    FROM user_roles ur
    WHERE ur.user_id = profiles.id 
    AND ur.role = 'timer'
  )
);

-- Allow organizers to see timer roles
CREATE POLICY "Organizers can view timer roles" 
ON public.user_roles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND role = 'timer'
);