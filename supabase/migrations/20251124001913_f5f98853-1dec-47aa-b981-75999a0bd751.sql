-- Update the handle_new_user function to include organizer-specific fields
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
    cif,
    company_address,
    company_phone
  )
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'cif',
    NEW.raw_user_meta_data->>'company_address',
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