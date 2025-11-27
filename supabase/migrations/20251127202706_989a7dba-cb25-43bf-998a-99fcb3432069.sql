-- Add columns to registration_form_fields for system fields and visibility
ALTER TABLE public.registration_form_fields 
ADD COLUMN IF NOT EXISTS is_system_field boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

-- Create function to seed default system fields for a race
CREATE OR REPLACE FUNCTION public.seed_default_registration_fields(p_race_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only insert if no system fields exist for this race
  IF NOT EXISTS (SELECT 1 FROM registration_form_fields WHERE race_id = p_race_id AND is_system_field = true) THEN
    INSERT INTO registration_form_fields (race_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options)
    VALUES
      (p_race_id, 'first_name', 'Nombre', 'text', 1, true, true, true, NULL),
      (p_race_id, 'last_name', 'Apellidos', 'text', 2, true, true, true, NULL),
      (p_race_id, 'email', 'Email', 'email', 3, true, true, true, NULL),
      (p_race_id, 'document_type', 'Tipo de Documento', 'select', 4, true, true, true, '["DNI", "Pasaporte", "NIE", "TIE"]'::jsonb),
      (p_race_id, 'document_number', 'Nº de Documento', 'text', 5, true, true, true, NULL),
      (p_race_id, 'phone', 'Tel. Móvil', 'tel', 6, true, true, true, NULL),
      (p_race_id, 'gender', 'Género', 'radio', 7, true, true, true, '["Masculino", "Femenino"]'::jsonb),
      (p_race_id, 'birth_date', 'Fecha de Nacimiento', 'date', 8, true, true, true, NULL),
      (p_race_id, 'address', 'Domicilio', 'text', 9, false, true, true, NULL),
      (p_race_id, 'city', 'Localidad', 'text', 10, false, true, true, NULL),
      (p_race_id, 'province', 'Provincia', 'text', 11, false, true, true, NULL),
      (p_race_id, 'autonomous_community', 'Com. Autónoma', 'text', 12, false, true, true, NULL),
      (p_race_id, 'club', 'Club', 'text', 13, false, true, false, NULL),
      (p_race_id, 'team', 'Equipo', 'text', 14, false, true, false, NULL);
  END IF;
END;
$$;