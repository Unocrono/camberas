-- Create a function to get organizer requests with user info
CREATE OR REPLACE FUNCTION public.get_organizer_requests()
RETURNS TABLE (
  role_id uuid,
  user_id uuid,
  role app_role,
  status text,
  created_at timestamptz,
  first_name text,
  last_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ur.id as role_id,
    ur.user_id,
    ur.role,
    ur.status,
    ur.created_at,
    p.first_name,
    p.last_name,
    COALESCE(
      (SELECT au.email FROM auth.users au WHERE au.id = ur.user_id),
      ''
    ) as email
  FROM user_roles ur
  LEFT JOIN profiles p ON p.id = ur.user_id
  WHERE ur.role = 'organizer'
  ORDER BY ur.created_at DESC;
END;
$$;