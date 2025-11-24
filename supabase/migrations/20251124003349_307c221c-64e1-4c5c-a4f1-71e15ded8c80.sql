-- Eliminar columnas CIF y dirección de empresa de la tabla profiles
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS cif,
DROP COLUMN IF EXISTS company_address;

-- Actualizar la función handle_new_user para reflejar los cambios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Insert profile with organizer fields if applicable
  INSERT INTO public.profiles (
    id, 
    first_name, 
    last_name,
    company_name,
    company_phone
  )
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'company_phone'
  );
  
  -- Insert role based on metadata
  IF (NEW.raw_user_meta_data->>'is_organizer')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'organizer');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$function$;