-- Actualizar función seed_default_registration_fields_for_distance
CREATE OR REPLACE FUNCTION public.seed_default_registration_fields_for_distance(p_distance_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only insert if no system fields exist for this distance
  IF NOT EXISTS (SELECT 1 FROM registration_form_fields WHERE race_distance_id = p_distance_id AND is_system_field = true) THEN
    INSERT INTO registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, profile_field)
    VALUES
      (p_distance_id, 'first_name', 'Nombre', 'text', 1, true, true, true, NULL, 'first_name'),
      (p_distance_id, 'last_name', 'Apellidos', 'text', 2, true, true, true, NULL, 'last_name'),
      (p_distance_id, 'email', 'Email', 'email', 3, true, true, true, NULL, 'email'),
      (p_distance_id, 'document_type', 'Tipo de Documento', 'select', 4, true, true, true, '["DNI", "Pasaporte", "NIE", "TIE"]'::jsonb, NULL),
      (p_distance_id, 'document_number', 'Nº de Documento', 'text', 5, true, true, true, NULL, 'dni_passport'),
      (p_distance_id, 'phone', 'Tel. Móvil', 'tel', 6, true, true, true, NULL, 'phone'),
      (p_distance_id, 'gender', 'Género', 'radio', 7, true, true, true, '["Masculino", "Femenino"]'::jsonb, 'gender'),
      (p_distance_id, 'birth_date', 'Fecha de Nacimiento', 'date', 8, true, true, true, NULL, 'birth_date'),
      (p_distance_id, 'tshirt_size', 'Talla de Camiseta', 'radio', 9, true, true, true, '["XS", "S", "M", "L", "XL", "XXL"]'::jsonb, NULL),
      (p_distance_id, 'address', 'Domicilio', 'text', 10, false, true, true, NULL, 'address'),
      (p_distance_id, 'city', 'Localidad', 'text', 11, false, true, true, NULL, 'city'),
      (p_distance_id, 'province', 'Provincia', 'text', 12, false, true, true, NULL, 'province'),
      (p_distance_id, 'autonomous_community', 'Com. Autónoma', 'text', 13, false, true, true, NULL, 'autonomous_community'),
      (p_distance_id, 'country', 'País', 'text', 14, false, true, true, NULL, 'country'),
      (p_distance_id, 'club', 'Club', 'text', 15, false, true, false, NULL, 'club'),
      (p_distance_id, 'team', 'Equipo', 'text', 16, false, true, false, NULL, 'team');
  END IF;
END;
$function$;