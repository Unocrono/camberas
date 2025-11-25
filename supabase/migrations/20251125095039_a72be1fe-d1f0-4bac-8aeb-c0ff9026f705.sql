-- Agregar política para que organizadores puedan ver perfiles de participantes en sus carreras
CREATE POLICY "Organizers can view profiles of their race participants" 
ON profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND 
  EXISTS (
    SELECT 1
    FROM registrations
    JOIN races ON races.id = registrations.race_id
    WHERE registrations.user_id = profiles.id 
    AND races.organizer_id = auth.uid()
  )
);