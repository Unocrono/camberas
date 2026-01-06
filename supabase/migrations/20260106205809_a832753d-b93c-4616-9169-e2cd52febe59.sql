-- Crear función SECURITY DEFINER para obtener el email del usuario actual
-- Esto permite verificar el email sin acceder directamente a auth.users
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text
  FROM auth.users
  WHERE id = auth.uid()
$$;

-- Recrear las políticas RLS que acceden a auth.users usando la nueva función

-- 1. Eliminar políticas que acceden a auth.users
DROP POLICY IF EXISTS "Users can claim guest registrations" ON public.registrations;
DROP POLICY IF EXISTS "Users can update own registration by email" ON public.registrations;
DROP POLICY IF EXISTS "Users can view own registration by email" ON public.registrations;

-- 2. Recrear las políticas usando la función security definer
CREATE POLICY "Users can claim guest registrations"
ON public.registrations
FOR UPDATE
USING (
  email = public.get_current_user_email()
  AND user_id IS NULL
);

CREATE POLICY "Users can update own registration by email"
ON public.registrations
FOR UPDATE
USING (
  email = public.get_current_user_email()
);

CREATE POLICY "Users can view own registration by email"
ON public.registrations
FOR SELECT
USING (
  email = public.get_current_user_email()
);