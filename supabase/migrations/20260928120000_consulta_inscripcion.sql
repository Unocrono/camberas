-- Consulta de inscripción: el corredor se busca con su documento y demuestra
-- que es él con el email de la inscripción o, si no lo recuerda, con su fecha
-- de nacimiento. Puede pedirse una copia por email. Dos puertas:
--   - la ficha / web / widget de UNA carrera (busca solo en esa)
--   - camberas.com/mi-inscripcion (busca en todas las carreras visibles de
--     hace un mes en adelante: el corredor no tiene que buscar la carrera)
--
-- La lista de inscritos NO se publica. Esto solo lo usa la edge function
-- consultar-inscripcion (clave de servicio), que es la que decide qué se
-- enseña; nada de aquí es accesible con la clave pública.
--
-- 1. consultas_inscripcion: intentos (búsquedas y envíos). Sin datos en
--    claro: documento, email e IP van como huella (sha256).
-- 2. documento_consulta(): la forma canónica del documento.
-- 3. buscar_inscripcion_consulta(): la búsqueda.
-- 4. reservar_consulta_inscripcion(): el límite de intentos, ATÓMICO. Se
--    reserva el intento (con cerrojo) ANTES de buscar o de enviar: contar y
--    anotar por separado dejaba pasar ráfagas de peticiones simultáneas.
--
-- Se puede aplicar sobre la versión anterior (27-28 sep, sin búsqueda en
-- todas las carreras): la tabla se amplía y la función se rehace.

-- ── 1. Intentos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consultas_inscripcion (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NULL: búsqueda en todas las carreras (camberas.com/mi-inscripcion)
  race_id         uuid REFERENCES public.races(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('busqueda', 'envio')),
  -- Huellas: documento canónico, email tecleado (si se buscó por email) e IP
  clave_dni       text NOT NULL,
  clave_dato      text,
  clave_ip        text,
  -- Búsqueda: false hasta que encuentra (una en curso cuenta como fallo)
  acierto         boolean NOT NULL DEFAULT false,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Sobre la versión anterior
ALTER TABLE public.consultas_inscripcion ALTER COLUMN race_id DROP NOT NULL;
ALTER TABLE public.consultas_inscripcion ADD COLUMN IF NOT EXISTS clave_dato text;

COMMENT ON TABLE public.consultas_inscripcion IS
  'Intentos de la consulta de inscripción pública (función consultar-inscripcion): límite de fallos por documento, email e IP y de copias por inscripción. Se purga sola a los 7 días.';

CREATE INDEX IF NOT EXISTS consultas_inscripcion_dni_idx
  ON public.consultas_inscripcion (clave_dni, created_at DESC);
CREATE INDEX IF NOT EXISTS consultas_inscripcion_dato_idx
  ON public.consultas_inscripcion (clave_dato, created_at DESC) WHERE clave_dato IS NOT NULL;
CREATE INDEX IF NOT EXISTS consultas_inscripcion_ip_idx
  ON public.consultas_inscripcion (clave_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS consultas_inscripcion_reg_idx
  ON public.consultas_inscripcion (registration_id, created_at DESC)
  WHERE registration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS consultas_inscripcion_fecha_idx
  ON public.consultas_inscripcion (created_at);

-- Solo la clave de servicio: RLS activa y ninguna política
ALTER TABLE public.consultas_inscripcion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consultas_inscripcion FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.consultas_inscripcion TO service_role;

-- ── 2. Documento canónico ───────────────────────────────────────────────────
-- Mayúsculas, solo letras y cifras, sin ceros delante y sin la letra de
-- control del DNI/NIE: 09.064.452-z = 9064452Z = 9064452. La letra es la
-- suma de control del número, así que quitarla no junta a dos personas; y
-- hay inscripciones guardadas sin ella. Pasaportes y demás, tal cual.
-- La edge function aplica la misma regla a la huella del límite.
CREATE OR REPLACE FUNCTION public.documento_consulta(p_doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT regexp_replace(
           ltrim(regexp_replace(upper(coalesce(p_doc, '')), '[^A-Z0-9]', '', 'g'), '0'),
           '^([XYZ]?[0-9]{6,8})[A-Z]$', '\1');
$fn$;

REVOKE EXECUTE ON FUNCTION public.documento_consulta(text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.documento_consulta(text) TO service_role;

-- ── 3. La búsqueda ──────────────────────────────────────────────────────────
-- Documento canónico + email (el de la inscripción, el de la cuenta o el del
-- perfil) o fecha de nacimiento. Un documento de menos de 5 caracteres no
-- busca nada.
--
-- p_race_id NULL: todas las carreras visibles con fecha de hace 30 días en
-- adelante. Con carrera: solo esa, si es visible, sea de la fecha que sea.
--
-- Devuelve TODAS las filas de esa persona (también intentos de pago
-- abandonados y canceladas): qué se enseña lo decide la función.
-- email_destino es a donde iría la copia, en el mismo orden que usa
-- reenviar-comprobantes: el de la inscripción, el de la cuenta, el del perfil.
-- ya_dentro: el intento pendiente de pago de alguien que ya está dentro de la
-- carrera por otra fila (la regla del robot y del panel, inscripcion_ya_dentro),
-- aunque esa otra fila tenga otro email y no haya salido en la búsqueda.
DROP FUNCTION IF EXISTS public.buscar_inscripcion_consulta(uuid, text, text, date);
CREATE FUNCTION public.buscar_inscripcion_consulta(
  p_race_id    uuid,
  p_dni        text,
  p_email      text,
  p_nacimiento date
)
RETURNS TABLE (
  id               uuid,
  race_id          uuid,
  carrera          text,
  fecha            date,
  slug             text,
  race_distance_id uuid,
  recorrido        text,
  first_name       text,
  last_name        text,
  bib_number       integer,
  status           text,
  payment_status   text,
  source           text,
  team_id          uuid,
  email_destino    text,
  ya_dentro        boolean,
  created_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH q AS (
    SELECT public.documento_consulta(p_dni) AS dni,
           lower(nullif(trim(coalesce(p_email, '')), '')) AS email
  )
  SELECT r.id,
         ra.id,
         ra.name,
         ra.date,
         ra.slug,
         r.race_distance_id,
         d.name,
         coalesce(nullif(trim(r.first_name), ''), nullif(trim(p.first_name), '')),
         coalesce(nullif(trim(r.last_name), ''), nullif(trim(p.last_name), '')),
         r.bib_number,
         r.status,
         r.payment_status,
         r.source,
         r.team_id,
         lower(coalesce(nullif(trim(r.email), ''), nullif(trim(u.email::text), ''), nullif(trim(p.email), ''))),
         CASE WHEN r.status = 'pending' AND r.payment_status = 'pending'
              THEN public.inscripcion_ya_dentro(r.id) ELSE false END,
         r.created_at
  FROM q
  JOIN public.races ra
    ON ra.is_visible
   AND (ra.id = p_race_id OR (p_race_id IS NULL AND ra.date >= current_date - 30))
  JOIN public.registrations r ON r.race_id = ra.id
  JOIN public.race_distances d ON d.id = r.race_distance_id
  LEFT JOIN public.profiles p ON p.id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE length(q.dni) >= 5
    AND public.documento_consulta(coalesce(nullif(trim(r.dni_passport), ''), p.dni_passport)) = q.dni
    AND (
      (q.email IS NOT NULL
        AND q.email IN (lower(trim(r.email)), lower(trim(p.email)), lower(trim(u.email::text))))
      OR (p_nacimiento IS NOT NULL AND coalesce(r.birth_date, p.birth_date) = p_nacimiento)
    )
  ORDER BY ra.date, r.created_at;
$fn$;

COMMENT ON FUNCTION public.buscar_inscripcion_consulta(uuid, text, text, date) IS
  'Consulta de inscripción pública: filas de una persona por documento + (email o fecha de nacimiento), en una carrera o (race NULL) en las visibles desde hace 30 días. Solo service_role; la llama consultar-inscripcion.';

REVOKE EXECUTE ON FUNCTION public.buscar_inscripcion_consulta(uuid, text, text, date) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.buscar_inscripcion_consulta(uuid, text, text, date) TO service_role;

-- ── 4. El límite, atómico ───────────────────────────────────────────────────
-- Reserva el intento y devuelve su id, o NULL si pasa del límite. Con los
-- cerrojos (siempre en el mismo orden: documento, email, IP), dos peticiones
-- simultáneas no pueden leer el mismo recuento: la segunda espera y ya ve la
-- fila de la primera.
--   búsqueda: 5 fallos/hora por documento (en todas las carreras), 10 por
--             email tecleado, 30 por IP. La reserva cuenta como fallo hasta
--             que la función la marca como acierto.
--   envío:    3 copias al día por inscripción, y 20 por minuto en total (el
--             límite de Resend es de unas 2 por segundo y lo comparten los
--             comprobantes de pago). Si el envío no sale, la función borra
--             la reserva.
CREATE OR REPLACE FUNCTION public.reservar_consulta_inscripcion(
  p_tipo            text,
  p_race_id         uuid,
  p_clave_dni       text,
  p_clave_dato      text,
  p_clave_ip        text,
  p_registration_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id bigint;
BEGIN
  IF p_tipo = 'busqueda' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('consulta:dni:' || p_clave_dni, 0));
    IF p_clave_dato IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('consulta:dato:' || p_clave_dato, 0));
    END IF;
    IF p_clave_ip IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('consulta:ip:' || p_clave_ip, 0));
    END IF;

    IF (SELECT count(*) FROM consultas_inscripcion
         WHERE clave_dni = p_clave_dni AND tipo = 'busqueda' AND NOT acierto
           AND created_at > now() - interval '1 hour') >= 5
       OR (p_clave_dato IS NOT NULL AND (SELECT count(*) FROM consultas_inscripcion
         WHERE clave_dato = p_clave_dato AND tipo = 'busqueda' AND NOT acierto
           AND created_at > now() - interval '1 hour') >= 10)
       OR (p_clave_ip IS NOT NULL AND (SELECT count(*) FROM consultas_inscripcion
         WHERE clave_ip = p_clave_ip AND tipo = 'busqueda' AND NOT acierto
           AND created_at > now() - interval '1 hour') >= 30)
    THEN
      RETURN NULL;
    END IF;

    INSERT INTO consultas_inscripcion (race_id, tipo, clave_dni, clave_dato, clave_ip, acierto)
    VALUES (p_race_id, 'busqueda', p_clave_dni, p_clave_dato, p_clave_ip, false)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF p_tipo = 'envio' AND p_registration_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('consulta:envio', 0));
    IF (SELECT count(*) FROM consultas_inscripcion
         WHERE registration_id = p_registration_id AND tipo = 'envio'
           AND created_at > now() - interval '24 hours') >= 3
       OR (SELECT count(*) FROM consultas_inscripcion
         WHERE tipo = 'envio' AND created_at > now() - interval '1 minute') >= 20
    THEN
      RETURN NULL;
    END IF;

    INSERT INTO consultas_inscripcion (race_id, tipo, clave_dni, clave_dato, clave_ip, acierto, registration_id)
    VALUES (p_race_id, 'envio', p_clave_dni, p_clave_dato, p_clave_ip, true, p_registration_id)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  RAISE EXCEPTION 'reservar_consulta_inscripcion: tipo no válido (%)', p_tipo;
END;
$fn$;

COMMENT ON FUNCTION public.reservar_consulta_inscripcion(text, uuid, text, text, text, uuid) IS
  'Límite atómico de la consulta de inscripción: reserva el intento (búsqueda o envío) con cerrojo y devuelve su id, o NULL si pasa del límite. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.reservar_consulta_inscripcion(text, uuid, text, text, text, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reservar_consulta_inscripcion(text, uuid, text, text, text, uuid) TO service_role;

-- Comprobación (debe salir: RLS true y 0 políticas; las tres funciones solo
-- service_role: anon false, service_role true)
SELECT 'tabla' AS que, 'consultas_inscripcion' AS nombre,
       (SELECT relrowsecurity FROM pg_class WHERE relname = 'consultas_inscripcion')::text AS anon_o_rls,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'consultas_inscripcion')::text AS service_o_politicas
UNION ALL
SELECT 'funcion', f,
       has_function_privilege('anon', f, 'EXECUTE')::text,
       has_function_privilege('service_role', f, 'EXECUTE')::text
FROM unnest(ARRAY[
  'public.documento_consulta(text)',
  'public.buscar_inscripcion_consulta(uuid, text, text, date)',
  'public.reservar_consulta_inscripcion(text, uuid, text, text, text, uuid)'
]) AS f;
