-- Create a security definer function to get user email
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text
  FROM auth.users
  WHERE id = _user_id
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can claim guest registrations" ON public.registrations;

-- Recreate the policy using the security definer function
CREATE POLICY "Users can claim guest registrations"
ON public.registrations
FOR UPDATE
USING (
  user_id IS NULL 
  AND guest_email IS NOT NULL 
  AND auth.uid() IS NOT NULL 
  AND guest_email = public.get_user_email(auth.uid())
);