-- ============================================================
-- BLINDAJE DEL TOKEN DE PUESTO (4-ago, tras el Trail de Loiu)
--
-- El token era una contraseña compartible: bastaba tenerlo para
-- fichar desde cualquier sitio y para siempre. Tres cierres:
--
-- 1. DISPOSITIVO. Todas las RPCs exigen `p_device_id` y solo
--    responden si coincide con el móvil vinculado por
--    `link_gps_token`. Una foto del QR reenviada ya no sirve: para
--    cronometrar desde otro móvil hay que hacer el traspaso, y el
--    panel lo ve (columna Vinculado).
-- 2. VENTANA. Las ESCRITURAS solo se aceptan dentro de la ventana
--    de la carrera (misma que gps_positions, pero abarcando todos
--    sus eventos: de la salida más temprana −24 h al cierre más
--    tardío +2 h). Un QR viejo deja de valer al día siguiente.
--    Las lecturas siguen abiertas: preparar el puesto la víspera
--    debe poder hacerse.
-- 3. RETIRADAS. Ver, todas las de la carrera; corregir o borrar,
--    solo las del propio puesto.
--
-- OJO AL DESPLIEGUE: las firmas cambian (p_device_id es
-- obligatorio). Migración y publicación de la web van juntas — una
-- app antigua contra estas RPCs deja de fichar.
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
CREATE OR REPLACE FUNCTION public.cronometraje_window(
  p_race_id uuid,
  OUT t_ini timestamptz,
  OUT t_fin timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $win$
  SELECT min(w.t_ini), max(w.t_fin)
  FROM race_distances d
  CROSS JOIN LATERAL gps_capture_window(d.id::text) w
  WHERE d.race_id = p_race_id
$win$;

REVOKE EXECUTE ON FUNCTION public.cronometraje_window(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cronometraje_window(uuid) TO anon, authenticated;

-- Comprobación común de las escrituras. Una carrera sin eventos no tiene
-- ventana que aplicar: en ese caso se deja pasar.
CREATE OR REPLACE FUNCTION public.cronometraje_en_ventana(p_race_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT cw.t_ini IS NULL OR now() BETWEEN cw.t_ini AND cw.t_fin
       FROM cronometraje_window(p_race_id) cw),
    true
  )
$fn$;

REVOKE EXECUTE ON FUNCTION public.cronometraje_en_ventana(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometraje_en_ventana(uuid) FROM anon, authenticated;

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
         (a.timing_point_id = v_p.timing_point_id OR a.token_id = v_p.token_id)
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
