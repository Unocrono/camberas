-- Eliminar TODAS las políticas que usan guest_email
DROP POLICY IF EXISTS "Users can view own registration by email" ON public.registrations;
DROP POLICY IF EXISTS "Users can update own registration by email" ON public.registrations;
DROP POLICY IF EXISTS "Users can create registrations" ON public.registrations;
DROP POLICY IF EXISTS "Users can claim guest registrations" ON public.registrations;

-- Eliminar campos guest_* antiguos
ALTER TABLE public.registrations
DROP COLUMN IF EXISTS guest_first_name,
DROP COLUMN IF EXISTS guest_last_name,
DROP COLUMN IF EXISTS guest_email,
DROP COLUMN IF EXISTS guest_phone,
DROP COLUMN IF EXISTS guest_dni_passport,
DROP COLUMN IF EXISTS guest_birth_date;

-- Recrear políticas RLS usando el nuevo campo email
CREATE POLICY "Users can view own registration by email" 
ON public.registrations 
FOR SELECT 
USING (
  email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())
);

CREATE POLICY "Users can update own registration by email" 
ON public.registrations 
FOR UPDATE 
USING (
  email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())
);

CREATE POLICY "Users can create registrations" 
ON public.registrations 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can claim guest registrations" 
ON public.registrations 
FOR UPDATE 
USING (
  email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())
  AND user_id IS NULL
);