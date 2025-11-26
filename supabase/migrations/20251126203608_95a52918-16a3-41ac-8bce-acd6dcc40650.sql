-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;

-- The "Admins can manage all roles" policy already uses has_role() correctly
-- So we just need to make sure it's the only admin policy for ALL operations