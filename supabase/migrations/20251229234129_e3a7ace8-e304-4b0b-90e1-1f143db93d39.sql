-- Añadir campo country a profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS country text;

-- Añadir campo email a profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text;

-- Añadir comentarios para documentación
COMMENT ON COLUMN public.profiles.country IS 'País del usuario';
COMMENT ON COLUMN public.profiles.email IS 'Email del usuario (copia de auth.users.email para acceso público)';