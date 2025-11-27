-- Make user_id nullable for guest registrations
ALTER TABLE public.registrations ALTER COLUMN user_id DROP NOT NULL;

-- Add guest email for unregistered users
ALTER TABLE public.registrations ADD COLUMN guest_email text;
ALTER TABLE public.registrations ADD COLUMN guest_first_name text;
ALTER TABLE public.registrations ADD COLUMN guest_last_name text;
ALTER TABLE public.registrations ADD COLUMN guest_phone text;
ALTER TABLE public.registrations ADD COLUMN guest_dni_passport text;
ALTER TABLE public.registrations ADD COLUMN guest_birth_date date;
ALTER TABLE public.registrations ADD COLUMN guest_emergency_contact text;
ALTER TABLE public.registrations ADD COLUMN guest_emergency_phone text;

-- Add constraint: either user_id or guest_email must be present
ALTER TABLE public.registrations ADD CONSTRAINT registrations_user_or_guest 
CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

-- Update RLS policies to allow guest registrations
DROP POLICY IF EXISTS "Users can create their own registrations" ON public.registrations;

CREATE POLICY "Users can create registrations" 
ON public.registrations 
FOR INSERT 
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (user_id IS NULL AND guest_email IS NOT NULL)
);

-- Allow guests to view their registration by email (will need edge function for this)
-- For now, only authenticated users can view their own registrations

-- Policy for claiming guest registrations
CREATE POLICY "Users can claim guest registrations" 
ON public.registrations 
FOR UPDATE 
USING (
  user_id IS NULL AND 
  guest_email IS NOT NULL AND 
  auth.uid() IS NOT NULL AND
  guest_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);