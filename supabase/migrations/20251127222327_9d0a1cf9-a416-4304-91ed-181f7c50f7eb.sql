-- Update handle_new_user function to use club instead of company_name/company_phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile with club field if applicable
  INSERT INTO public.profiles (
    id, 
    first_name, 
    last_name,
    club
  )
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'club'
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
$$;