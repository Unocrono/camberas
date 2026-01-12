-- Populate email field from auth.users for existing profiles
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE au.id = p.id
AND (p.email IS NULL OR p.email = '');

-- Update the handle_new_user function to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;
  
  RETURN NEW;
END;
$$;