-- Create function to get users with emails (admin only)
CREATE OR REPLACE FUNCTION public.get_users_with_emails()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to call this function
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;
  
  RETURN QUERY
  SELECT au.id as user_id, au.email::text as email
  FROM auth.users au;
END;
$$;