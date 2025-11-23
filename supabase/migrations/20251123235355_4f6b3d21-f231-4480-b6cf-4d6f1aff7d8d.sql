-- Step 1: Add approval status column for organizer role
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- Step 2: Add constraint after column exists
ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_status_check;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

-- Step 3: Update existing organizer records to be approved by default
UPDATE public.user_roles 
SET status = 'approved' 
WHERE role = 'organizer';

-- Step 4: Update the has_role function to check for approved status
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (role != 'organizer' OR status = 'approved')
  )
$$;

-- Step 5: Create a new function to get organizer approval status
CREATE OR REPLACE FUNCTION public.get_organizer_status(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT status
  FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'organizer'
  LIMIT 1
$$;

-- Step 6: Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;

-- Step 7: Add RLS policy for admins to view all user roles  
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  )
);

-- Step 8: Add RLS policy for admins to update user roles status
CREATE POLICY "Admins can update user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  )
);