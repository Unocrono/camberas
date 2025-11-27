-- Add race_distance_id to registration_form_fields
ALTER TABLE public.registration_form_fields 
ADD COLUMN race_distance_id uuid REFERENCES public.race_distances(id) ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX idx_registration_form_fields_distance ON public.registration_form_fields(race_distance_id);

-- Update the seed function to use race_distance_id instead of race_id
CREATE OR REPLACE FUNCTION public.seed_default_registration_fields(p_race_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- This function is deprecated, use seed_default_registration_fields_for_distance instead
  RETURN;
END;
$function$;

-- Create new function for distance-based field seeding
CREATE OR REPLACE FUNCTION public.seed_default_registration_fields_for_distance(p_distance_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only insert if no system fields exist for this distance
  IF NOT EXISTS (SELECT 1 FROM registration_form_fields WHERE race_distance_id = p_distance_id AND is_system_field = true) THEN
    INSERT INTO registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options)
    VALUES
      (p_distance_id, 'first_name', 'Nombre', 'text', 1, true, true, true, NULL),
      (p_distance_id, 'last_name', 'Apellidos', 'text', 2, true, true, true, NULL),
      (p_distance_id, 'email', 'Email', 'email', 3, true, true, true, NULL),
      (p_distance_id, 'document_type', 'Tipo de Documento', 'select', 4, true, true, true, '["DNI", "Pasaporte", "NIE", "TIE"]'::jsonb),
      (p_distance_id, 'document_number', 'Nº de Documento', 'text', 5, true, true, true, NULL),
      (p_distance_id, 'phone', 'Tel. Móvil', 'tel', 6, true, true, true, NULL),
      (p_distance_id, 'gender', 'Género', 'radio', 7, true, true, true, '["Masculino", "Femenino"]'::jsonb),
      (p_distance_id, 'birth_date', 'Fecha de Nacimiento', 'date', 8, true, true, true, NULL),
      (p_distance_id, 'address', 'Domicilio', 'text', 9, false, true, true, NULL),
      (p_distance_id, 'city', 'Localidad', 'text', 10, false, true, true, NULL),
      (p_distance_id, 'province', 'Provincia', 'text', 11, false, true, true, NULL),
      (p_distance_id, 'autonomous_community', 'Com. Autónoma', 'text', 12, false, true, true, NULL),
      (p_distance_id, 'club', 'Club', 'text', 13, false, true, false, NULL),
      (p_distance_id, 'team', 'Equipo', 'text', 14, false, true, false, NULL);
  END IF;
END;
$function$;

-- Update the trigger function to use the new distance-based seeding
CREATE OR REPLACE FUNCTION public.auto_seed_registration_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the new distance-based function
  PERFORM seed_default_registration_fields_for_distance(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update RLS policies to include distance-based access
DROP POLICY IF EXISTS "Organizers can manage their race form fields" ON registration_form_fields;
CREATE POLICY "Organizers can manage their race form fields" 
ON public.registration_form_fields 
FOR ALL 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND (
    (race_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM races WHERE races.id = registration_form_fields.race_id AND races.organizer_id = auth.uid()
    ))
    OR
    (race_distance_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM race_distances 
      JOIN races ON races.id = race_distances.race_id 
      WHERE race_distances.id = registration_form_fields.race_distance_id AND races.organizer_id = auth.uid()
    ))
  )
);