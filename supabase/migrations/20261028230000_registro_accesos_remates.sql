-- Remates del registro de accesos tras la revisión (28-oct-2026, sobre
-- 20261028210000_registro_accesos.sql, ya aplicada).
--
-- 1. Tope de espera en el trigger. Una espera de bloqueo no es un error, así
--    que el EXCEPTION no protegía a los inicios de sesión si alguien bloqueaba
--    accesos_usuarios (un ALTER TABLE, por ejemplo): GoTrue se quedaba
--    esperando. Con lock_timeout la espera se corta a los 200 ms con un error
--    (55P03) que el EXCEPTION sí atrapa, y el login sigue sin registro.
--    Cualquier cambio futuro de esta tabla: SET LOCAL lock_timeout corto antes.
--
-- 2. Dos IP con un significado cada una. GoTrue reescribe auth.sessions.ip en
--    cada refresco, así que:
--      * ip         la IP desde la que se inició la sesión (NULL si no se sabe)
--      * ip_ultima  la última IP con la que se usó la sesión
--    Las 119 filas que se rellenaron al aplicar el registro (ids 1-119)
--    llevaban la IP del último refresco, no la del inicio: pasan a ip_ultima y
--    su ip queda en NULL. Su user_agent también es el del último refresco
--    (casi siempre el mismo navegador).
--
-- 3. Precisión de la actividad: supabase-js renueva el token cuando le queda
--    poco (cada hora, más o menos, con Camberas abierto, y en cuanto se abre si
--    ya caducó). ultima_actividad puede ir hasta una hora por detrás.

SET LOCAL lock_timeout = '2s';

ALTER TABLE public.accesos_usuarios ADD COLUMN IF NOT EXISTS ip_ultima inet;

COMMENT ON COLUMN public.accesos_usuarios.ip IS
  'IP desde la que se inició la sesión. NULL si no se sabe (filas rellenadas al crear el registro).';
COMMENT ON COLUMN public.accesos_usuarios.ip_ultima IS
  'Última IP con la que se usó la sesión (GoTrue la reescribe en cada refresco).';
COMMENT ON COLUMN public.accesos_usuarios.ultima_actividad IS
  'Último refresco del token de la sesión: puede ir hasta una hora por detrás del uso real.';

-- Filas del relleno: la IP que se guardó era la del último refresco
UPDATE public.accesos_usuarios
   SET ip_ultima = ip, ip = NULL
 WHERE origen = 'sesion'
   AND id <= 119
   AND ip_ultima IS NULL;

-- Las demás (las que ya haya creado el trigger): de momento, la de inicio
UPDATE public.accesos_usuarios
   SET ip_ultima = ip
 WHERE ip_ultima IS NULL AND ip IS NOT NULL AND id > 119;

-- Y la más fresca, la de la sesión viva
UPDATE public.accesos_usuarios a
   SET ip_ultima = s.ip
  FROM auth.sessions s
 WHERE s.id = a.session_id
   AND s.ip IS NOT NULL
   AND a.ip_ultima IS DISTINCT FROM s.ip;

CREATE OR REPLACE FUNCTION public.registrar_acceso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '200ms'
AS $$
DECLARE
  v_inicio timestamptz;
BEGIN
  BEGIN
    -- Solo cuentan los refrescos: otros cambios de la sesión no son actividad.
    -- (La comprobación va aquí y no en un WHEN / UPDATE OF del trigger para no
    -- atar columnas de auth.sessions: Supabase no podría cambiarlas en sus
    -- actualizaciones de Auth.)
    -- (IF anidado: en un alta OLD no existe y no se debe ni mirar)
    IF TG_OP = 'UPDATE' THEN
      IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
         AND NEW.refreshed_at IS NOT DISTINCT FROM OLD.refreshed_at THEN
        RETURN NULL;
      END IF;
    END IF;
    v_inicio := coalesce(NEW.created_at, now());
    INSERT INTO public.accesos_usuarios AS a
      (session_id, user_id, inicio, ultima_actividad, user_agent, ip, ip_ultima, origen)
    VALUES
      (NEW.id, NEW.user_id, v_inicio,
       greatest(v_inicio, NEW.updated_at, NEW.refreshed_at AT TIME ZONE 'UTC'),
       left(NEW.user_agent, 500),
       -- en un refresco de una sesión sin fila, la IP de inicio no se sabe
       CASE WHEN TG_OP = 'INSERT' THEN NEW.ip END,
       NEW.ip,
       'sesion')
    ON CONFLICT (session_id) DO UPDATE
      SET ultima_actividad = EXCLUDED.ultima_actividad,
          ip_ultima = coalesce(EXCLUDED.ip_ultima, a.ip_ultima)
      WHERE a.ultima_actividad < EXCLUDED.ultima_actividad;
  EXCEPTION WHEN OTHERS THEN
    -- Nunca romper el inicio de sesión por el registro (los bloqueos llegan
    -- aquí como 55P03 gracias al lock_timeout de la función)
    RAISE WARNING 'registrar_acceso (sesion %): % %', NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_acceso() FROM PUBLIC, anon, authenticated;

-- El historial devuelve también la última IP (cambia el RETURNS: DROP + CREATE)
DROP FUNCTION IF EXISTS public.accesos_usuario(uuid, integer);
CREATE FUNCTION public.accesos_usuario(p_user_id uuid, p_limite integer DEFAULT 100)
RETURNS TABLE(inicio timestamptz, ultima_actividad timestamptz, user_agent text, ip text, ip_ultima text, abierta boolean, origen text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.inicio,
         greatest(a.ultima_actividad, s.actividad),
         a.user_agent,
         host(a.ip),
         host(coalesce(s.ip, a.ip_ultima)),
         s.id IS NOT NULL,
         a.origen
    FROM public.accesos_usuarios a
    LEFT JOIN LATERAL (
      SELECT x.id, x.ip, greatest(x.updated_at, x.refreshed_at AT TIME ZONE 'UTC') AS actividad
        FROM auth.sessions x
       WHERE x.id = a.session_id
    ) s ON true
   WHERE a.user_id = p_user_id
     AND public.has_role(auth.uid(), 'admin'::public.app_role)
   ORDER BY a.inicio DESC
   LIMIT least(greatest(coalesce(p_limite, 100), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.accesos_usuario(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accesos_usuario(uuid, integer) TO authenticated;

-- ── Comprobaciones ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                  WHERE oid = 'public.registrar_acceso()'::regprocedure
                    AND 'lock_timeout=200ms' = ANY (proconfig)) THEN
    RAISE EXCEPTION 'registrar_acceso sin lock_timeout';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accesos_usuarios WHERE id <= 119 AND origen = 'sesion' AND ip IS NOT NULL) THEN
    RAISE EXCEPTION 'quedan filas del relleno con IP de inicio';
  END IF;
  IF has_function_privilege('anon', 'public.accesos_usuario(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no puede pedir accesos';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.accesos_usuario(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'el panel no podría pedir el historial';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
