-- Registro de accesos de los usuarios (28-oct-2026).
--
-- Hasta hoy Camberas no guardaba quién entra ni cuándo: Supabase solo conserva
-- auth.users.last_sign_in_at (el último inicio de sesión) y las sesiones vivas
-- de auth.sessions, que desaparecen al cerrar sesión. Esta migración guarda
-- una fila por sesión (= un inicio de sesión) que no se borra:
--
--   * inicio            cuándo entró (auth.sessions.created_at)
--   * ultima_actividad  la última vez que la sesión refrescó su token, que es
--                       lo que hace el navegador al abrir Camberas o mientras
--                       está abierto (updated_at / refreshed_at)
--   * user_agent, ip    con qué y desde dónde entró
--
-- La rellenan dos triggers sobre auth.sessions (alta y refresco). El trigger
-- NO puede tumbar un inicio de sesión: todo va en un bloque que se traga el
-- error y deja un WARNING en el log de Postgres.
--
-- Lectura: solo admins, por las funciones ultimos_accesos() y
-- accesos_usuario(uuid). La tabla no tiene permisos de cliente.
--
-- Horas: son instantes reales (now() del servidor), no horas de carrera.
-- refreshed_at es timestamp SIN zona escrito en UTC: se lee AT TIME ZONE 'UTC'.

-- ── 1. Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accesos_usuarios (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id       uuid UNIQUE,
  inicio           timestamptz NOT NULL,
  ultima_actividad timestamptz NOT NULL,
  user_agent       text,
  ip               inet,
  -- 'sesion': visto en auth.sessions; 'historico': solo se sabe el último
  -- inicio de sesión anterior a este registro (auth.users.last_sign_in_at)
  origen           text NOT NULL DEFAULT 'sesion' CHECK (origen IN ('sesion', 'historico'))
);

COMMENT ON TABLE public.accesos_usuarios IS
  'Una fila por inicio de sesión (auth.sessions), no se borra al cerrar sesión. La rellenan los triggers registrar_acceso_* sobre auth.sessions. Solo lectura de admins vía ultimos_accesos() y accesos_usuario(uuid).';

CREATE INDEX IF NOT EXISTS accesos_usuarios_user_inicio_idx
  ON public.accesos_usuarios (user_id, inicio DESC);

ALTER TABLE public.accesos_usuarios ENABLE ROW LEVEL SECURITY;
-- Sin políticas y sin permisos: ni anon ni authenticated la tocan directamente
REVOKE ALL ON public.accesos_usuarios FROM PUBLIC, anon, authenticated;

-- ── 2. Trigger sobre auth.sessions ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_acceso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
      (session_id, user_id, inicio, ultima_actividad, user_agent, ip, origen)
    VALUES
      (NEW.id, NEW.user_id, v_inicio,
       greatest(v_inicio, NEW.updated_at, NEW.refreshed_at AT TIME ZONE 'UTC'),
       left(NEW.user_agent, 500), NEW.ip, 'sesion')
    ON CONFLICT (session_id) DO UPDATE
      SET ultima_actividad = EXCLUDED.ultima_actividad
      WHERE a.ultima_actividad < EXCLUDED.ultima_actividad;
  EXCEPTION WHEN OTHERS THEN
    -- Nunca romper el inicio de sesión por el registro
    RAISE WARNING 'registrar_acceso (sesion %): % %', NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_acceso() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrar_acceso_alta ON auth.sessions;
CREATE TRIGGER registrar_acceso_alta
  AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.registrar_acceso();

DROP TRIGGER IF EXISTS registrar_acceso_refresco ON auth.sessions;
CREATE TRIGGER registrar_acceso_refresco
  AFTER UPDATE ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.registrar_acceso();

-- ── 3. Lo que ya había ──────────────────────────────────────────────────────
-- 3a. Las sesiones vivas
INSERT INTO public.accesos_usuarios
  (session_id, user_id, inicio, ultima_actividad, user_agent, ip, origen)
SELECT s.id, s.user_id, coalesce(s.created_at, now()),
       greatest(coalesce(s.created_at, now()), s.updated_at, s.refreshed_at AT TIME ZONE 'UTC'),
       left(s.user_agent, 500), s.ip, 'sesion'
  FROM auth.sessions s
ON CONFLICT (session_id) DO NOTHING;

-- 3b. El último inicio de sesión de quien ya no tiene esa sesión viva
--     (cerró sesión): sin dispositivo ni IP, marcado como histórico
INSERT INTO public.accesos_usuarios
  (session_id, user_id, inicio, ultima_actividad, origen)
SELECT NULL, u.id, u.last_sign_in_at, u.last_sign_in_at, 'historico'
  FROM auth.users u
 WHERE u.last_sign_in_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.accesos_usuarios a
                    WHERE a.user_id = u.id
                      AND abs(extract(epoch FROM a.inicio - u.last_sign_in_at)) < 60)
   AND NOT EXISTS (SELECT 1 FROM public.accesos_usuarios a
                    WHERE a.user_id = u.id AND a.origen = 'historico');

-- ── 4. Lectura para el panel (solo admins) ──────────────────────────────────
-- Último acceso de cada usuario. Toma el mayor de: el registro, las sesiones
-- vivas y last_sign_in_at, para que la columna no mienta aunque el trigger
-- hubiera fallado alguna vez.
CREATE OR REPLACE FUNCTION public.ultimos_accesos()
RETURNS TABLE(user_id uuid, ultimo_acceso timestamptz, accesos integer, sesiones_abiertas integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id,
         greatest(r.ultima, v.ultima, u.last_sign_in_at),
         coalesce(r.n, 0)::integer,
         coalesce(v.n, 0)::integer
    FROM auth.users u
    LEFT JOIN LATERAL (
      SELECT max(a.ultima_actividad) AS ultima, count(*) AS n
        FROM public.accesos_usuarios a
       WHERE a.user_id = u.id
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT max(greatest(s.created_at, s.updated_at, s.refreshed_at AT TIME ZONE 'UTC')) AS ultima,
             count(*) AS n
        FROM auth.sessions s
       WHERE s.user_id = u.id
    ) v ON true
   WHERE public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- Historial de un usuario, del más reciente al más antiguo.
CREATE OR REPLACE FUNCTION public.accesos_usuario(p_user_id uuid, p_limite integer DEFAULT 100)
RETURNS TABLE(inicio timestamptz, ultima_actividad timestamptz, user_agent text, ip text, abierta boolean, origen text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.inicio,
         greatest(a.ultima_actividad, s.actividad),
         a.user_agent,
         host(a.ip),
         s.id IS NOT NULL,
         a.origen
    FROM public.accesos_usuarios a
    LEFT JOIN LATERAL (
      SELECT x.id, greatest(x.updated_at, x.refreshed_at AT TIME ZONE 'UTC') AS actividad
        FROM auth.sessions x
       WHERE x.id = a.session_id
    ) s ON true
   WHERE a.user_id = p_user_id
     AND public.has_role(auth.uid(), 'admin'::public.app_role)
   ORDER BY a.inicio DESC
   LIMIT least(greatest(coalesce(p_limite, 100), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.ultimos_accesos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accesos_usuario(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ultimos_accesos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accesos_usuario(uuid, integer) TO authenticated;

-- ── 5. Comprobaciones ───────────────────────────────────────────────────────
DO $$
DECLARE
  n_sesiones integer;
  n_registro integer;
BEGIN
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'auth.sessions'::regclass
         AND tgname IN ('registrar_acceso_alta', 'registrar_acceso_refresco')) <> 2 THEN
    RAISE EXCEPTION 'faltan los triggers de auth.sessions';
  END IF;
  -- Que no aten columnas de auth.sessions (UPDATE OF / WHEN)
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'auth.sessions'::regclass
                AND tgname LIKE 'registrar_acceso%'
                AND (cardinality(tgattr::int2[]) > 0 OR tgqual IS NOT NULL)) THEN
    RAISE EXCEPTION 'los triggers de accesos no pueden depender de columnas de auth.sessions';
  END IF;
  SELECT count(*) INTO n_sesiones FROM auth.sessions;
  SELECT count(*) INTO n_registro FROM public.accesos_usuarios a
   WHERE EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = a.session_id);
  IF n_registro <> n_sesiones THEN
    RAISE EXCEPTION 'sesiones vivas sin registrar: % de %', n_sesiones - n_registro, n_sesiones;
  END IF;
  IF has_table_privilege('anon', 'public.accesos_usuarios', 'SELECT')
     OR has_table_privilege('authenticated', 'public.accesos_usuarios', 'SELECT') THEN
    RAISE EXCEPTION 'el registro de accesos no puede leerse desde el cliente';
  END IF;
  IF has_function_privilege('anon', 'public.ultimos_accesos()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accesos_usuario(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no puede pedir accesos';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
