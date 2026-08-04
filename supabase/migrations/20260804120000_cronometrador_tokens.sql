-- ============================================================
-- CRONOMETRADOR POR TOKEN (decisión 4-ago): el puesto de cronometraje
-- deja de necesitar usuario con rol `timer` — cada punto de
-- `timing_points` genera su token de activación (mismo patrón QR que
-- los corredores de camberas-track y las motos de camberas-motos).
-- La identidad es el PUESTO, no la persona.
--
-- OJO: el catálogo de puestos de la app de cronometraje es
-- `timing_points`, NO `race_checkpoints` (los `checkpoint_id` de
-- `timer_assignments` apuntan en realidad a `timing_points.id`).
--
-- Las escrituras del dispositivo NO van por policy de INSERT como en
-- gps_positions: la app necesita también LEER (lista de salida,
-- lecturas del puesto, retiradas) sin usuario, así que todo el
-- tráfico del token pasa por RPCs SECURITY DEFINER que validan el
-- token y acotan el alcance a su carrera y su puesto. Superficie más
-- estrecha que abrir las tablas a anon.
--
-- El rol `timer` y `timer_assignments` siguen vivos: el login por
-- email del cronometrador no se toca mientras dure la transición.
-- ============================================================

-- ── 1) Vínculo puesto → token y firma de lo que escribe el puesto ──────────
ALTER TABLE public.timing_points          ADD COLUMN IF NOT EXISTS token_id uuid;
ALTER TABLE public.timing_readings        ADD COLUMN IF NOT EXISTS token_id uuid;
ALTER TABLE public.race_results_abandons  ADD COLUMN IF NOT EXISTS token_id uuid;

CREATE INDEX IF NOT EXISTS idx_timing_readings_token_ts
  ON public.timing_readings (token_id, timing_timestamp DESC);

-- Idempotencia de los reintentos offline: el mismo dorsal a la misma hora
-- desde el mismo puesto es la misma lectura (lección de los upserts de GPS).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_timing_readings_token_bib_ts
  ON public.timing_readings (token_id, bib_number, timing_timestamp)
  WHERE token_id IS NOT NULL;

-- ── 2) Generar (o regenerar) el token de un puesto ─────────────────────────
--     El "dorsal" es CP + orden (CP1, CP2…) y el nombre el del puesto.
--     Regenerar revoca el anterior: el dispositivo viejo deja de escribir.
CREATE OR REPLACE FUNCTION public.generar_token_cronometrador(
  p_timing_point_id uuid,
  p_distance_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_point timing_points%ROWTYPE;
  v_dist_id uuid;
  v_orden int;
  v_bib text;
  v_token uuid := gen_random_uuid();
  v_token_row_id uuid;
BEGIN
  SELECT * INTO v_point FROM timing_points WHERE id = p_timing_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Punto de cronometraje no encontrado';
  END IF;

  -- Solo admin o el organizador de la carrera
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r
                WHERE r.id = v_point.race_id AND r.organizer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sin permiso para generar tokens de esta carrera';
  END IF;

  -- Evento del token: el indicado > el primero con GPS activo de la carrera.
  -- El puesto cronometra toda la carrera; el evento solo cuelga el token.
  v_dist_id := p_distance_id;
  IF v_dist_id IS NULL THEN
    SELECT d.id INTO v_dist_id FROM race_distances d
     WHERE d.race_id = v_point.race_id
     ORDER BY (d.gps_tracking_enabled IS TRUE) DESC,
              d.display_order NULLS LAST, d.created_at
     LIMIT 1;
  END IF;
  IF v_dist_id IS NULL THEN
    RAISE EXCEPTION 'La carrera no tiene eventos';
  END IF;

  -- Orden del puesto: el suyo o su posición por antigüedad
  v_orden := COALESCE(v_point.point_order, (
    SELECT count(*)::int FROM timing_points t2
     WHERE t2.race_id = v_point.race_id AND t2.created_at <= v_point.created_at
  ));
  v_bib := 'CP' || v_orden;

  -- Retirar el token anterior del puesto, si lo había
  IF v_point.token_id IS NOT NULL THEN
    UPDATE gps_tokens SET active = false WHERE id = v_point.token_id;
  END IF;

  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token)
  VALUES (true, v_bib, v_dist_id, v_point.name, v_token)
  RETURNING id INTO v_token_row_id;

  UPDATE timing_points SET token_id = v_token_row_id WHERE id = p_timing_point_id;

  RETURN jsonb_build_object(
    'token', v_token,
    'bib', v_bib,
    'nombre', v_point.name,
    'distance_id', v_dist_id
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.generar_token_cronometrador(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generar_token_cronometrador(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.generar_token_cronometrador(uuid, uuid) TO authenticated;

-- ── 3) Estado de los tokens de una carrera (panel: QR, enlace, vinculación) ─
CREATE OR REPLACE FUNCTION public.tokens_cronometraje_carrera(p_race_id uuid)
RETURNS TABLE(timing_point_id uuid, nombre text, bib text, token uuid,
              activo boolean, distance_id uuid, device_id text,
              linked_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT tp.id, tp.name, t.bib_number::text, t.token, t.active,
         t.event_id::uuid, t.device_id, t.linked_at
  FROM timing_points tp
  JOIN gps_tokens t ON t.id = tp.token_id
  WHERE tp.race_id = p_race_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r
                  WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    )
$fn$;

REVOKE EXECUTE ON FUNCTION public.tokens_cronometraje_carrera(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tokens_cronometraje_carrera(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.tokens_cronometraje_carrera(uuid) TO authenticated;

-- ── 4) Resolución del token → puesto (interna: la usan las RPCs de la app) ──
CREATE OR REPLACE FUNCTION public.cronometrador_puesto(p_token uuid)
RETURNS TABLE(token_id uuid, timing_point_id uuid, race_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT t.id, tp.id, tp.race_id
  FROM gps_tokens t
  JOIN timing_points tp ON tp.token_id = t.id
  WHERE t.token = p_token AND t.active IS TRUE
$fn$;

-- Nadie la llama desde fuera: solo se ejecuta dentro de las RPCs definer
REVOKE EXECUTE ON FUNCTION public.cronometrador_puesto(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometrador_puesto(uuid) FROM anon, authenticated;

-- ── 5) Contexto del puesto: carrera, puesto y hora de salida ───────────────
CREATE OR REPLACE FUNCTION public.cronometrador_contexto(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
  v_out jsonb;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
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
    )
  ) INTO v_out
  FROM timing_points tp
  JOIN races r ON r.id = tp.race_id
  JOIN gps_tokens t ON t.id = tp.token_id
  WHERE tp.id = v_p.timing_point_id;

  RETURN v_out;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_contexto(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_contexto(uuid) TO anon, authenticated;

-- ── 6) Lista de salida de la carrera del puesto ────────────────────────────
CREATE OR REPLACE FUNCTION public.cronometrador_startlist(p_token uuid)
RETURNS TABLE(bib_number int, first_name text, last_name text,
              event_name text, registration_id uuid, race_distance_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
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

REVOKE EXECUTE ON FUNCTION public.cronometrador_startlist(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_startlist(uuid) TO anon, authenticated;

-- ── 7) Lecturas ya registradas en el puesto ────────────────────────────────
CREATE OR REPLACE FUNCTION public.cronometrador_lecturas(
  p_token uuid,
  p_limit int DEFAULT 100
)
RETURNS TABLE(id uuid, bib_number int, timing_timestamp timestamptz,
              status_code text, notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
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

REVOKE EXECUTE ON FUNCTION public.cronometrador_lecturas(uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_lecturas(uuid, int) TO anon, authenticated;

-- ── 8) Fichar un dorsal ────────────────────────────────────────────────────
--     p_timestamp llega como texto (la app manda hora local sin zona, igual
--     que hacía el INSERT directo de PostgREST) para no cambiar el criterio
--     con el que ya están guardadas todas las lecturas.
CREATE OR REPLACE FUNCTION public.cronometrador_fichar(
  p_token uuid,
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
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
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

REVOKE EXECUTE ON FUNCTION public.cronometrador_fichar(uuid, int, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_fichar(uuid, int, text, text, text) TO anon, authenticated;

-- ── 9) Corregir y borrar lecturas del propio puesto ────────────────────────
CREATE OR REPLACE FUNCTION public.cronometrador_editar_lectura(
  p_token uuid,
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
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
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

REVOKE EXECUTE ON FUNCTION public.cronometrador_editar_lectura(uuid, uuid, int, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_editar_lectura(uuid, uuid, int, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cronometrador_borrar_lectura(
  p_token uuid,
  p_reading_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
  END IF;

  DELETE FROM timing_readings tr
  WHERE tr.id = p_reading_id
    AND tr.timing_point_id = v_p.timing_point_id
    AND tr.race_id = v_p.race_id;

  RETURN FOUND;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_borrar_lectura(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_borrar_lectura(uuid, uuid) TO anon, authenticated;

-- ── 10) Retirados (abandono / no sale / descalificado) ─────────────────────
--      El puesto ve y corrige los de toda la carrera, como hace hoy el
--      cronometrador con login: son pocos y se comparten por radio.
CREATE OR REPLACE FUNCTION public.cronometrador_retiradas(p_token uuid)
RETURNS TABLE(id uuid, bib_number int, abandon_type text, reason text,
              timing_point_id uuid, created_at timestamptz,
              registration_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
  END IF;

  RETURN QUERY
  SELECT a.id, a.bib_number::int, a.abandon_type::text, a.reason::text,
         a.timing_point_id, a.created_at, a.registration_id
  FROM race_results_abandons a
  WHERE a.race_id = v_p.race_id
  ORDER BY a.created_at DESC;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_retiradas(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_retiradas(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cronometrador_retirada(
  p_token uuid,
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
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
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

REVOKE EXECUTE ON FUNCTION public.cronometrador_retirada(uuid, int, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_retirada(uuid, int, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cronometrador_editar_retirada(
  p_token uuid,
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
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
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
  WHERE a.id = p_id AND a.race_id = v_p.race_id;

  RETURN FOUND;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_editar_retirada(uuid, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_editar_retirada(uuid, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cronometrador_borrar_retirada(
  p_token uuid,
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM cronometrador_puesto(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
  END IF;

  DELETE FROM race_results_abandons a
  WHERE a.id = p_id AND a.race_id = v_p.race_id;

  RETURN FOUND;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometrador_borrar_retirada(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometrador_borrar_retirada(uuid, uuid) TO anon, authenticated;
