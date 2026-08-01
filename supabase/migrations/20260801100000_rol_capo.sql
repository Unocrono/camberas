-- ============================================================
-- Rol CAPO en el sistema de roles
-- Las altas desde /grupetta (metadata is_capo) reciben el rol
-- 'capo' aprobado automáticamente, y aparecen con su chip en la
-- Gestión de Usuarios del panel.
--
-- ⚠️ EJECUTAR EN DOS PASOS SEPARADOS (limitación de Postgres:
-- un valor nuevo de enum no puede usarse en la misma ejecución).
-- ============================================================

-- ── PASO 1 (ejecutar SOLO esta línea primero) ──
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'capo';

-- ── PASO 2 (ejecutar después, en una segunda ejecución) ──

-- El trigger de nuevos usuarios asigna el rol capo cuando el alta
-- viene de Grupetta (mantiene el resto del comportamiento actual)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $fn$
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

  -- Alta de Capo (desde /grupetta): rol aprobado al instante
  IF (NEW.raw_user_meta_data->>'is_capo')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role, status)
    VALUES (NEW.id, 'capo', 'approved');
  END IF;

  RETURN NEW;
END;
$fn$;

-- Reparar los capos ya registrados sin rol (p. ej. test2@uno.es)
INSERT INTO public.user_roles (user_id, role, status)
SELECT u.id, 'capo', 'approved'
FROM auth.users u
WHERE (u.raw_user_meta_data->>'is_capo')::boolean = true
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role = 'capo'
  );
