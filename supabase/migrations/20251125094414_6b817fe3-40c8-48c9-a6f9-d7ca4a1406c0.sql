-- Eliminar las políticas existentes de race_regulations y race_regulation_sections
DROP POLICY IF EXISTS "Organizers can manage their race regulations" ON race_regulations;
DROP POLICY IF EXISTS "Organizers can manage their race regulation sections" ON race_regulation_sections;

-- Recrear las políticas correctamente sin referencias a registrations
CREATE POLICY "Organizers can manage their race regulations" 
ON race_regulations 
FOR ALL 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND 
  EXISTS (
    SELECT 1
    FROM races
    WHERE races.id = race_regulations.race_id 
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Organizers can manage their race regulation sections" 
ON race_regulation_sections 
FOR ALL 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND 
  EXISTS (
    SELECT 1
    FROM race_regulations
    JOIN races ON races.id = race_regulations.race_id
    WHERE race_regulations.id = race_regulation_sections.regulation_id 
    AND races.organizer_id = auth.uid()
  )
);