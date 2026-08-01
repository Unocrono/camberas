-- ============================================================
-- FIX: el trigger auto_create_wave_for_distance ya crea la oleada
-- al insertar el evento (race_waves.race_distance_id es UNIQUE).
-- crear_grupetta no debe INSERTAR otra wave: basta con ACTUALIZAR
-- la que el trigger acaba de crear. Lo mismo en actualizar_grupetta.
-- ============================================================

CREATE OR REPLACE FUNCTION crear_grupetta(
  p_nombre text,
  p_fecha date DEFAULT current_date,
  p_hora time DEFAULT NULL,
  p_lugar text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_code text;
  v_race_id uuid;
  v_dist_id uuid;
  v_slug text;
  v_intentos int := 0;
  v_capo uuid := auth.uid();
  v_activas int;
BEGIN
  IF v_capo IS NULL THEN
    RAISE EXCEPTION 'Necesitas una cuenta de Capo para crear una grupetta';
  END IF;
  IF length(trim(p_nombre)) < 3 THEN
    RAISE EXCEPTION 'El nombre debe tener al menos 3 caracteres';
  END IF;
  IF p_fecha < current_date THEN
    RAISE EXCEPTION 'La fecha de salida no puede ser pasada';
  END IF;

  SELECT count(*) INTO v_activas FROM races
   WHERE organizer_id = v_capo
     AND group_type = 'grupetta'
     AND date >= current_date - 1;
  IF v_activas >= 3 THEN
    RAISE EXCEPTION 'Máximo 3 grupettas activas por capo';
  END IF;

  LOOP
    v_code := upper(substr(regexp_replace(
      md5(random()::text || clock_timestamp()::text), '[01oil]', '', 'gi'), 1, 6));
    EXIT WHEN length(v_code) = 6
      AND NOT EXISTS (SELECT 1 FROM races WHERE join_code = v_code);
    v_intentos := v_intentos + 1;
    IF v_intentos > 10 THEN RAISE EXCEPTION 'No se pudo generar código'; END IF;
  END LOOP;

  v_slug := 'grupetta-' || lower(v_code);

  INSERT INTO races (name, date, location, race_type, group_type, is_visible,
                     gps_tracking_enabled, gps_update_frequency, join_code, slug,
                     description, max_participants, organizer_id)
  VALUES (left(trim(p_nombre), 60), p_fecha,
          COALESCE(nullif(trim(p_lugar), ''), 'Por concretar'),
          'mtb', 'grupetta', false,
          true, 15, v_code, v_slug,
          'Grupetta', 20, v_capo)
  RETURNING id INTO v_race_id;

  INSERT INTO race_distances (race_id, name, distance_km, price, max_participants,
                              gps_tracking_enabled, gps_update_frequency, is_visible)
  VALUES (v_race_id, 'Ruta', 0, 0, 20, true, 15, true)
  RETURNING id INTO v_dist_id;

  -- El trigger auto_create_wave_for_distance ya creó la oleada:
  -- solo hay que ponerle nombre y hora
  UPDATE race_waves SET
    wave_name = 'Salida',
    start_time = CASE WHEN p_hora IS NULL THEN NULL
      ELSE ((p_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'Europe/Madrid') END
  WHERE race_distance_id = v_dist_id;

  RETURN jsonb_build_object(
    'race_id', v_race_id,
    'distance_id', v_dist_id,
    'join_code', v_code,
    'slug', v_slug
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION actualizar_grupetta(
  p_race_id uuid,
  p_nombre text DEFAULT NULL,
  p_fecha date DEFAULT NULL,
  p_hora time DEFAULT NULL,
  p_lugar text DEFAULT NULL,
  p_publicada boolean DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_gpx_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
  v_fecha date;
BEGIN
  SELECT organizer_id INTO v_owner FROM races
   WHERE id = p_race_id AND group_type = 'grupetta';
  IF NOT FOUND OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta grupetta no es tuya';
  END IF;

  UPDATE races SET
    name = COALESCE(nullif(trim(p_nombre), ''), name),
    date = COALESCE(p_fecha, date),
    location = COALESCE(nullif(trim(p_lugar), ''), location),
    is_visible = COALESCE(p_publicada, is_visible),
    image_url = COALESCE(p_imagen_url, image_url)
  WHERE id = p_race_id;

  IF p_gpx_url IS NOT NULL THEN
    UPDATE race_distances SET gpx_file_url = p_gpx_url WHERE race_id = p_race_id;
  END IF;

  SELECT date INTO v_fecha FROM races WHERE id = p_race_id;

  IF p_hora IS NOT NULL THEN
    UPDATE race_waves SET
      wave_name = 'Salida',
      start_time = ((v_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'Europe/Madrid')
    WHERE race_id = p_race_id;
  ELSIF p_fecha IS NOT NULL THEN
    -- cambia la fecha sin hora nueva: arrastrar la hora existente al nuevo día
    UPDATE race_waves w SET
      start_time = ((p_fecha::text || ' ' ||
        to_char(w.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI'))::timestamp
        AT TIME ZONE 'Europe/Madrid')
    WHERE w.race_id = p_race_id
      AND w.start_time IS NOT NULL;
  END IF;
END;
$fn$;
