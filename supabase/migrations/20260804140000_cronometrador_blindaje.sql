-- ============================================================
-- /timing: CRONOMETRAJE POR QR — BLINDAJE DEL PUESTO
-- Para ejecutar a mano en producción. Es la migración
-- supabase/migrations/20260804140000_cronometrador_blindaje.sql
-- (4-ago, nunca aplicada) con la revisión del 26-sep.
--
-- QUÉ ARREGLA
-- /timing vuelve a funcionar. Desde el 4-ago la web llama a las RPC
-- cronometrador_* con p_device_id, pero en la base siguen las firmas
-- de 20260804120000_cronometrador_tokens.sql, sin ese parámetro, y
-- PostgREST no encuentra la función: el puesto no carga ni ficha.
--
-- LA WEB YA ESTÁ PUBLICADA con el cliente que espera estas firmas:
-- camberas.com manda p_device_id en las 10 llamadas (comprobado el
-- 26-sep en el bundle publicado). No hay que publicar nada.
--
-- QUÉ CAMBIA PARA LOS CRONOMETRADORES
-- · El puesto queda atado al móvil que lo vincula. Al abrir el
--   enlace del QR (…/timing?t=…) la web vincula ese móvil sola.
--   Desde otro móvil sale «Puesto en otro móvil»: «Cronometrar
--   aquí» se lleva el puesto y el anterior deja de poder fichar.
--   Una foto del QR reenviada ya no basta para fichar a escondidas.
-- · Cada navegador cuenta como un móvil (en iPhone, Safari y la app
--   instalada son dos distintos): usar siempre el mismo.
-- · Fichar, corregir lecturas y retiradas solo entra en la ventana
--   de la carrera, en hora local: de la salida más temprana −24 h al
--   cierre más tardío +2 h. Ver la lista de salida y las lecturas se
--   puede siempre (preparar el puesto la víspera).
-- · Retiradas: se ven todas las de la carrera; solo se corrigen o
--   borran las del propio puesto.
-- · El único puesto con QR hoy (Loiu 500 Trail 2026 → START) tiene
--   que volver a abrir el enlace de su QR. El QR sigue valiendo.
--
-- CAMBIOS RESPECTO AL FICHERO DEL REPO
-- · La ventana se calcula en HORA LOCAL tal cual y se compara con la
--   hora local de Madrid. Ya no sale de gps_capture_window, que pasa
--   la hora de la oleada dos veces por Europe/Madrid (ventana 1-2 h
--   tarde; con salidas >= 22:00 en verano / >= 23:00 en invierno,
--   la ventana entera caería antes de la salida).
-- · Tiempo límite que gps_cutoff_interval no sabe leer («7 h»,
--   «8 h»: la Gurriana 2027) → 12 h, lo mismo que sin tiempo límite.
--   Sin esto la ventana de la Gurriana quedaría sin cierre.
-- · cronometraje_window se cierra a anon, authenticated y PUBLIC:
--   solo la usan funciones definer.
-- · es_de_este_puesto nunca sale NULL (la web enseñaba editar y
--   borrar en retiradas ajenas metidas sin token).
--
-- CÓMO EJECUTARLO
-- Pegar el fichero ENTERO en el editor SQL del panel y ejecutarlo
-- de una vez. Mandado como un solo lote, Postgres lo hace todo o
-- nada: si una sentencia falla, no se aplica ninguna y /timing sigue
-- como estaba. La última consulta es la comprobación: 13 filas,
-- todas con ok = true. Si hay error, ejecutar solo esa consulta para
-- ver el estado. Se puede repetir sin daño.
-- ============================================================

-- ── 1) Token + dispositivo: la resolución del puesto ───────────────────────
DROP FUNCTION IF EXISTS public.cronometrador_puesto(uuid);

CREATE OR REPLACE FUNCTION public.cronometrador_puesto(
  p_token uuid,
  p_device_id text
)
RETURNS TABLE(token_id uuid, timing_point_id uuid, race_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT t.id, tp.id, tp.race_id
  FROM gps_tokens t
  JOIN timing_points tp ON tp.token_id = t.id
  WHERE t.token = p_token
    AND t.active IS TRUE
    AND t.device_id IS NOT NULL
    AND t.device_id = p_device_id
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_puesto(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometrador_puesto(uuid, text) FROM anon, authenticated;

-- ── 2) Ventana de cronometraje de la carrera ───────────────────────────────
--     Une las ventanas de todos los eventos: el puesto cronometra la carrera
--     entera, no solo el evento del que cuelga su token.
--     Mismas reglas que la ventana GPS (salida −24 h … salida + tiempo límite
--     + 2 h; sin oleada, el día entero; carreras demo-* siempre abiertas),
--     pero en HORA LOCAL tal cual: la fecha la manda races.date y la hora,
--     race_waves.start_time leída sin convertir (el +00 no es UTC).
--     t_ini / t_fin salen también como hora local con +00.
--     Si gps_cutoff_interval no sabe leer el tiempo límite (devuelve NULL con
--     «7 h», «8 h»…), se toman 12 h, como cuando no hay tiempo límite: si no,
--     max() ignora ese evento y la ventana cierra antes, o queda sin cierre.
CREATE OR REPLACE FUNCTION public.cronometraje_window(
  p_race_id uuid,
  OUT t_ini timestamptz,
  OUT t_fin timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT
    CASE WHEN r.slug LIKE 'demo-%' THEN '-infinity'::timestamptz
      ELSE min(COALESCE(s.salida, r.date::timestamp AT TIME ZONE 'UTC'))
           - interval '24 hours'
    END,
    CASE WHEN r.slug LIKE 'demo-%' THEN 'infinity'::timestamptz
      ELSE max(CASE WHEN s.salida IS NOT NULL
                 THEN s.salida + COALESCE(gps_cutoff_interval(d.cutoff_time, r.group_type),
                                          interval '12 hours')
                 ELSE (r.date + time '23:59') AT TIME ZONE 'UTC'
               END)
           + interval '2 hours'
    END
  FROM races r
  JOIN race_distances d ON d.race_id = r.id
  LEFT JOIN race_waves w ON w.race_distance_id = d.id
  CROSS JOIN LATERAL (
    SELECT (r.date + (w.start_time AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC' AS salida
  ) s
  WHERE r.id = p_race_id
  GROUP BY r.id
$fn$;

-- Interna: la llaman cronometraje_en_ventana y cronometrador_contexto (definer)
REVOKE EXECUTE ON FUNCTION public.cronometraje_window(uuid) FROM anon, authenticated, PUBLIC;

-- Comprobación común de las escrituras. Una carrera sin eventos no tiene
-- ventana que aplicar: en ese caso se deja pasar.
-- «Ahora» en hora local de Madrid, para compararlo con horas locales.
CREATE OR REPLACE FUNCTION public.cronometraje_en_ventana(p_race_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT cw.t_ini IS NULL
            OR ((now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC')
               BETWEEN cw.t_ini AND cw.t_fin
       FROM cronometraje_window(p_race_id) cw),
    true
  )
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometraje_en_ventana(uuid) FROM anon, authenticated, PUBLIC;

-- ── 3) Lecturas del puesto (contexto, lista de salida, fichajes) ───────────
DROP FUNCTION IF EXISTS public.cronometrador_contexto(uuid);

CREATE OR REPLACE FUNCTION public.cronometrador_contexto(
  p_token uuid,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
  v_out jsonb;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  SELECT jsonb_build_object(
    'race', jsonb_build_object('id', r.id, 'name', r.name, 'date', r.date),
    'punto', jsonb_build_object('id', tp.id, 'name', tp.name,
                                'notes', tp.notes, 'point_order', tp.point_order),
    'bib', t.bib_number::text,
    'distance_id', t.event_id::text,
    'device_id', t.device_id,
    'start_time', (
      SELECT w.start_time FROM race_waves w
       WHERE w.race_id = r.id AND w.start_time IS NOT NULL
       ORDER BY w.start_time LIMIT 1
    ),
    'ventana', (
      SELECT jsonb_build_object('ini', cw.t_ini, 'fin', cw.t_fin)
        FROM cronometraje_window(r.id) cw
    )
  ) INTO v_out
  FROM timing_points tp
  JOIN races r ON r.id = tp.race_id
  JOIN gps_tokens t ON t.id = tp.token_id
  WHERE tp.id = v_p.timing_point_id;

  RETURN v_out;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_contexto(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_contexto(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.cronometrador_startlist(uuid);

CREATE OR REPLACE FUNCTION public.cronometrador_startlist(
  p_token uuid,
  p_device_id text
)
RETURNS TABLE(bib_number int, first_name text, last_name text,
              event_name text, registration_id uuid, race_distance_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  RETURN QUERY
  SELECT reg.bib_number::int,
         COALESCE(reg.first_name, '')::text,
         COALESCE(reg.last_name, '')::text,
         COALESCE(d.name, '')::text,
         reg.id,
         reg.race_distance_id
  FROM registrations reg
  LEFT JOIN race_distances d ON d.id = reg.race_distance_id
  WHERE reg.race_id = v_p.race_id
    AND reg.bib_number IS NOT NULL
  ORDER BY reg.bib_number;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_startlist(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_startlist(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.cronometrador_lecturas(uuid, int);

CREATE OR REPLACE FUNCTION public.cronometrador_lecturas(
  p_token uuid,
  p_device_id text,
  p_limit int DEFAULT 100
)
RETURNS TABLE(id uuid, bib_number int, timing_timestamp timestamptz,
              status_code text, notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  RETURN QUERY
  SELECT tr.id, tr.bib_number::int, tr.timing_timestamp,
         tr.status_code::text, tr.notes::text
  FROM timing_readings tr
  WHERE tr.race_id = v_p.race_id
    AND tr.timing_point_id = v_p.timing_point_id
  ORDER BY tr.timing_timestamp DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_lecturas(uuid, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_lecturas(uuid, text, int) TO anon, authenticated;

-- ── 4) Escrituras: dispositivo vinculado + ventana de la carrera ───────────
DROP FUNCTION IF EXISTS public.cronometrador_fichar(uuid, int, text, text, text);

CREATE OR REPLACE FUNCTION public.cronometrador_fichar(
  p_token uuid,
  p_device_id text,
  p_bib int,
  p_timestamp text,
  p_status_code text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
  v_reg record;
  v_ts timestamptz := p_timestamp::timestamptz;
  v_id uuid;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  IF NOT cronometraje_en_ventana(v_p.race_id) THEN
    RAISE EXCEPTION 'Fuera de la ventana de cronometraje de la carrera (revisa la fecha de la carrera y la hora de salida)';
  END IF;

  -- El dorsal puede no estar en la lista (dorsal fantasma): se ficha igual
  SELECT reg.id, reg.race_distance_id INTO v_reg
  FROM registrations reg
  WHERE reg.race_id = v_p.race_id AND reg.bib_number = p_bib
  LIMIT 1;

  INSERT INTO timing_readings (
    race_id, timing_point_id, token_id, bib_number,
    timing_timestamp, reading_timestamp, reading_type,
    status_code, notes, registration_id, race_distance_id
  )
  VALUES (
    v_p.race_id, v_p.timing_point_id, v_p.token_id, p_bib,
    v_ts, v_ts,
    CASE WHEN p_status_code IS NULL THEN 'manual' ELSE 'status_change' END,
    p_status_code, p_notes, v_reg.id, v_reg.race_distance_id
  )
  ON CONFLICT (token_id, bib_number, timing_timestamp)
    WHERE token_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_id;

  -- Reintento offline de una lectura ya guardada: devolvemos la que hay
  IF v_id IS NULL THEN
    SELECT tr.id INTO v_id FROM timing_readings tr
     WHERE tr.token_id = v_p.token_id
       AND tr.bib_number = p_bib
       AND tr.timing_timestamp = v_ts
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_fichar(uuid, text, int, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_fichar(uuid, text, int, text, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.cronometrador_editar_lectura(uuid, uuid, int, text);

CREATE OR REPLACE FUNCTION public.cronometrador_editar_lectura(
  p_token uuid,
  p_device_id text,
  p_reading_id uuid,
  p_bib int,
  p_timestamp text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
  v_reg record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  IF NOT cronometraje_en_ventana(v_p.race_id) THEN
    RAISE EXCEPTION 'Fuera de la ventana de cronometraje de la carrera';
  END IF;

  SELECT reg.id, reg.race_distance_id INTO v_reg
  FROM registrations reg
  WHERE reg.race_id = v_p.race_id AND reg.bib_number = p_bib
  LIMIT 1;

  UPDATE timing_readings tr
  SET bib_number = p_bib,
      timing_timestamp = p_timestamp::timestamptz,
      reading_timestamp = p_timestamp::timestamptz,
      registration_id = v_reg.id,
      race_distance_id = v_reg.race_distance_id,
      updated_at = now()
  WHERE tr.id = p_reading_id
    AND tr.timing_point_id = v_p.timing_point_id
    AND tr.race_id = v_p.race_id;

  RETURN FOUND;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_editar_lectura(uuid, text, uuid, int, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_editar_lectura(uuid, text, uuid, int, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.cronometrador_borrar_lectura(uuid, uuid);

CREATE OR REPLACE FUNCTION public.cronometrador_borrar_lectura(
  p_token uuid,
  p_device_id text,
  p_reading_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  IF NOT cronometraje_en_ventana(v_p.race_id) THEN
    RAISE EXCEPTION 'Fuera de la ventana de cronometraje de la carrera';
  END IF;

  DELETE FROM timing_readings tr
  WHERE tr.id = p_reading_id
    AND tr.timing_point_id = v_p.timing_point_id
    AND tr.race_id = v_p.race_id;

  RETURN FOUND;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_borrar_lectura(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_borrar_lectura(uuid, text, uuid) TO anon, authenticated;

-- ── 5) Retiradas: ver las de la carrera, tocar solo las del propio puesto ──
DROP FUNCTION IF EXISTS public.cronometrador_retiradas(uuid);

CREATE OR REPLACE FUNCTION public.cronometrador_retiradas(
  p_token uuid,
  p_device_id text
)
RETURNS TABLE(id uuid, bib_number int, abandon_type text, reason text,
              timing_point_id uuid, created_at timestamptz,
              registration_id uuid, es_de_este_puesto boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  RETURN QUERY
  SELECT a.id, a.bib_number::int, a.abandon_type::text, a.reason::text,
         a.timing_point_id, a.created_at, a.registration_id,
         -- Nunca NULL: una retirada de otro punto metida sin token (token_id
         -- NULL) daría false OR NULL = NULL, y la web solo oculta con === false
         COALESCE(a.timing_point_id = v_p.timing_point_id
                  OR a.token_id = v_p.token_id, false)
  FROM race_results_abandons a
  WHERE a.race_id = v_p.race_id
  ORDER BY a.created_at DESC;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_retiradas(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_retiradas(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.cronometrador_retirada(uuid, int, text, text);

CREATE OR REPLACE FUNCTION public.cronometrador_retirada(
  p_token uuid,
  p_device_id text,
  p_bib int,
  p_tipo text,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
  v_reg record;
  v_id uuid;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  IF NOT cronometraje_en_ventana(v_p.race_id) THEN
    RAISE EXCEPTION 'Fuera de la ventana de cronometraje de la carrera';
  END IF;

  IF p_tipo NOT IN ('ABANDONO', 'NO_SALE', 'DESCALIFICADO', 'EN_CARRERA') THEN
    RAISE EXCEPTION 'Tipo de retirada no válido';
  END IF;

  IF length(coalesce(trim(p_motivo), '')) < 10 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 10 caracteres';
  END IF;

  -- Aquí el dorsal sí tiene que existir: la retirada cuelga de la inscripción
  SELECT reg.id, reg.race_distance_id INTO v_reg
  FROM registrations reg
  WHERE reg.race_id = v_p.race_id AND reg.bib_number = p_bib
  LIMIT 1;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'Dorsal % no encontrado en la carrera', p_bib;
  END IF;

  INSERT INTO race_results_abandons (
    race_id, registration_id, race_distance_id, bib_number,
    abandon_type, timing_point_id, reason, token_id
  )
  VALUES (
    v_p.race_id, v_reg.id, v_reg.race_distance_id, p_bib,
    p_tipo, v_p.timing_point_id, trim(p_motivo), v_p.token_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_retirada(uuid, text, int, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_retirada(uuid, text, int, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.cronometrador_editar_retirada(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.cronometrador_editar_retirada(
  p_token uuid,
  p_device_id text,
  p_id uuid,
  p_tipo text,
  p_motivo text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  IF NOT cronometraje_en_ventana(v_p.race_id) THEN
    RAISE EXCEPTION 'Fuera de la ventana de cronometraje de la carrera';
  END IF;

  IF p_tipo NOT IN ('ABANDONO', 'NO_SALE', 'DESCALIFICADO', 'EN_CARRERA') THEN
    RAISE EXCEPTION 'Tipo de retirada no válido';
  END IF;

  IF length(coalesce(trim(p_motivo), '')) < 10 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 10 caracteres';
  END IF;

  UPDATE race_results_abandons a
  SET abandon_type = p_tipo,
      reason = trim(p_motivo),
      updated_at = now()
  WHERE a.id = p_id
    AND a.race_id = v_p.race_id
    AND (a.timing_point_id = v_p.timing_point_id OR a.token_id = v_p.token_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa retirada es de otro puesto: solo puede corregirla quien la registró';
  END IF;

  RETURN true;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_editar_retirada(uuid, text, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_editar_retirada(uuid, text, uuid, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.cronometrador_borrar_retirada(uuid, uuid);

CREATE OR REPLACE FUNCTION public.cronometrador_borrar_retirada(
  p_token uuid,
  p_device_id text,
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token, p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puesto no vinculado a este dispositivo';
  END IF;

  IF NOT cronometraje_en_ventana(v_p.race_id) THEN
    RAISE EXCEPTION 'Fuera de la ventana de cronometraje de la carrera';
  END IF;

  DELETE FROM race_results_abandons a
  WHERE a.id = p_id
    AND a.race_id = v_p.race_id
    AND (a.timing_point_id = v_p.timing_point_id OR a.token_id = v_p.token_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa retirada es de otro puesto: solo puede borrarla quien la registró';
  END IF;

  RETURN true;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_borrar_retirada(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_borrar_retirada(uuid, text, uuid) TO anon, authenticated;

-- PostgREST recarga el esquema solo (pgrst_ddl_watch), pero por si acaso:
NOTIFY pgrst, 'reload schema';

-- ── Comprobación (solo lectura) ───────────────────────────────────────────
-- Esperado: 13 filas y todas con ok = true.
-- · Las 10 RPC del puesto, con p_device_id: anon y authenticated sí, PUBLIC no.
-- · cronometrador_puesto (con p_device_id), cronometraje_window y
--   cronometraje_en_ventana: ni anon, ni authenticated, ni PUBLIC.
-- · Si sale una fila de más con ok = false y sin p_device_id, sobrevive una
--   firma vieja; si sale una fila sin args, falta la función.
WITH esperado(funcion, abierta) AS (
  VALUES
    ('cronometrador_contexto', true),
    ('cronometrador_startlist', true),
    ('cronometrador_lecturas', true),
    ('cronometrador_fichar', true),
    ('cronometrador_editar_lectura', true),
    ('cronometrador_borrar_lectura', true),
    ('cronometrador_retiradas', true),
    ('cronometrador_retirada', true),
    ('cronometrador_editar_retirada', true),
    ('cronometrador_borrar_retirada', true),
    ('cronometrador_puesto', false),
    ('cronometraje_window', false),
    ('cronometraje_en_ventana', false)
),
f AS (
  SELECT p.proname,
         pg_get_function_identity_arguments(p.oid)                 AS args,
         has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
         -- PUBLIC es el grantee 0; proacl NULL = permisos por defecto (con PUBLIC)
         EXISTS (SELECT 1
                   FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')  AS public
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
)
SELECT e.funcion, f.args, f.anon, f.authenticated, f.public,
       CASE WHEN e.abierta THEN 'anon y authenticated: sí · PUBLIC: no'
            ELSE 'anon, authenticated y PUBLIC: no' END AS esperado,
       COALESCE(
         (e.funcion LIKE 'cronometraje%' OR f.args LIKE '%p_device_id text%')
         AND f.anon = e.abierta
         AND f.authenticated = e.abierta
         AND NOT f.public,
         false) AS ok
FROM esperado e
LEFT JOIN f ON f.proname = e.funcion
ORDER BY e.abierta DESC, e.funcion, f.args;

-- Aparte, si se quiere: la ventana de Loiu (hora local) debe dar
-- t_ini = 2026-10-31 09:30:00+00 y t_fin = 2026-11-01 19:40:00+00.
-- SELECT * FROM cronometraje_window('f5f7ed25-dc74-4a2d-8be9-5f6fb023307a');
