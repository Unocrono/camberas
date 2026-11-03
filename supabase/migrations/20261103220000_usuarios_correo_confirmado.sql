-- Usuarios: el panel enseña si cada cuenta ha confirmado el correo (3-nov-2026).
--
-- get_users_with_emails() es la función que lleva los datos de auth.users al
-- panel de administración (solo admins). Se le añade la fecha de confirmación
-- del correo (auth.users.email_confirmed_at): NULL = la cuenta existe pero no
-- ha pulsado el enlace del correo y Supabase no la deja entrar.
--
-- Cambia el RETURNS, así que es DROP + CREATE. Los clientes que ya la usan
-- (Usuarios, Asignación de cronos) leen user_id y email y no les afecta la
-- columna nueva. Tras el DROP, Postgres da EXECUTE a PUBLIC por defecto:
-- se repiten los REVOKE/GRANT del endurecimiento de julio.

DROP FUNCTION IF EXISTS public.get_users_with_emails();

CREATE FUNCTION public.get_users_with_emails()
RETURNS TABLE(user_id uuid, email text, email_confirmado timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u.email::text, u.email_confirmed_at
    FROM auth.users u
   WHERE has_role(auth.uid(), 'admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_users_with_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_users_with_emails() TO authenticated, service_role;

-- ── Comprobaciones ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_users_with_emails()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no puede listar usuarios';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_users_with_emails()', 'EXECUTE') THEN
    RAISE EXCEPTION 'el panel no podría listar usuarios';
  END IF;
  IF (SELECT count(*) FROM information_schema.routine_privileges
       WHERE specific_schema = 'public' AND routine_name = 'get_users_with_emails' AND grantee = 'PUBLIC') > 0 THEN
    RAISE EXCEPTION 'PUBLIC no puede ejecutar get_users_with_emails';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
