-- ============================================================
-- FICHA DE LA GRUPETTA — el Capo gestiona su salida como un evento:
-- fecha y hora, punto de encuentro, GPX, imagen y estado
-- Borrador → Publicada (solo se puede unir la gente a las publicadas).
-- La caducidad pasa a contar desde la FECHA DE SALIDA (se puede montar
-- el jueves la salida del domingo).
-- ============================================================

-- La firma antigua debe desaparecer para no crear ambigüedad de sobrecarga
DROP FUNCTION IF EXISTS crear_grupetta(text);

-- 1. Crear con ficha (nace en BORRADOR; el Capo la publica al completarla)
CREATE OR REPLACE FUNCTION crear_grupetta(
  p_nombre text,
  p_fecha date DEFAULT current_date,
  p_hora_punto text DEFAULT NULL
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
  VALUES (left(trim(p_nombre), 60), p_fecha, 'Grupetta', 'mtb', 'grupetta', false,
          true, 15, v_code, v_slug,
          COALESCE(nullif(trim(p_hora_punto), ''), 'Grupetta'), 20, v_capo)
  RETURNING id INTO v_race_id;

  INSERT INTO race_distances (race_id, name, distance_km, price, max_participants,
                              gps_tracking_enabled, gps_update_frequency, is_visible)
  VALUES (v_race_id, 'Ruta', 0, 0, 20, true, 15, true)
  RETURNING id INTO v_dist_id;

  RETURN jsonb_build_object(
    'race_id', v_race_id,
    'distance_id', v_dist_id,
    'join_code', v_code,
    'slug', v_slug
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION crear_grupetta(text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION crear_grupetta(text, date, text) TO authenticated;

-- 2. Unirse: solo a grupettas PUBLICADAS y no caducadas (día de salida + 1),
--    y con el DESCARGO DE RESPONSABILIDAD aceptado expresamente
DROP FUNCTION IF EXISTS unirse_grupetta(text, text);

CREATE OR REPLACE FUNCTION unirse_grupetta(p_code text, p_nombre text, p_acepta boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_race races%ROWTYPE;
  v_dist_id uuid;
  v_count int;
  v_bib int;
  v_token uuid := gen_random_uuid();
BEGIN
  IF NOT COALESCE(p_acepta, false) THEN
    RAISE EXCEPTION 'Debes aceptar el descargo de responsabilidad para unirte';
  END IF;
  IF length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'Dinos tu nombre (mínimo 2 caracteres)';
  END IF;

  SELECT * INTO v_race FROM races
   WHERE join_code = upper(trim(p_code))
     AND group_type = 'grupetta';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código no válido';
  END IF;
  IF NOT v_race.is_visible THEN
    RAISE EXCEPTION 'El capo aún no ha publicado esta grupetta';
  END IF;
  IF v_race.date < current_date - 1 THEN
    RAISE EXCEPTION 'Esta grupetta ya ha pasado';
  END IF;

  SELECT id INTO v_dist_id FROM race_distances
   WHERE race_id = v_race.id ORDER BY created_at LIMIT 1;

  SELECT count(*) INTO v_count FROM gps_tokens WHERE event_id = v_dist_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Grupo completo (máximo 20 participantes)';
  END IF;

  v_bib := v_count + 1;
  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token)
  VALUES (true, v_bib::text, v_dist_id, left(trim(p_nombre), 40), v_token);

  RETURN jsonb_build_object(
    'token', v_token,
    'bib', v_bib,
    'nombre_grupo', v_race.name,
    'slug', v_race.slug
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION unirse_grupetta(text, text, boolean) TO anon, authenticated;

-- 3. Mis grupettas (las del capo, vivas o recientes)
CREATE OR REPLACE FUNCTION mis_grupettas()
RETURNS TABLE(
  race_id uuid, distance_id uuid, nombre text, join_code text, slug text,
  fecha date, hora_punto text, publicada boolean, imagen text, gpx text,
  miembros bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT r.id, d.id, r.name, r.join_code, r.slug, r.date,
         r.description, r.is_visible, r.image_url, d.gpx_file_url,
         (SELECT count(*) FROM gps_tokens t WHERE t.event_id = d.id)
  FROM races r
  JOIN race_distances d ON d.race_id = r.id
  WHERE r.organizer_id = auth.uid()
    AND r.group_type = 'grupetta'
    AND r.date >= current_date - 7
  ORDER BY r.date, r.created_at;
$fn$;

REVOKE EXECUTE ON FUNCTION mis_grupettas() FROM anon;
GRANT EXECUTE ON FUNCTION mis_grupettas() TO authenticated;

-- 4. Actualizar la ficha (solo su capo)
CREATE OR REPLACE FUNCTION actualizar_grupetta(
  p_race_id uuid,
  p_nombre text DEFAULT NULL,
  p_fecha date DEFAULT NULL,
  p_hora_punto text DEFAULT NULL,
  p_publicada boolean DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_gpx_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  SELECT organizer_id INTO v_owner FROM races
   WHERE id = p_race_id AND group_type = 'grupetta';
  IF NOT FOUND OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta grupetta no es tuya';
  END IF;

  UPDATE races SET
    name = COALESCE(nullif(trim(p_nombre), ''), name),
    date = COALESCE(p_fecha, date),
    description = COALESCE(nullif(trim(p_hora_punto), ''), description),
    is_visible = COALESCE(p_publicada, is_visible),
    image_url = COALESCE(p_imagen_url, image_url)
  WHERE id = p_race_id;

  IF p_gpx_url IS NOT NULL THEN
    UPDATE race_distances SET gpx_file_url = p_gpx_url WHERE race_id = p_race_id;
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION actualizar_grupetta(uuid, text, date, text, boolean, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION actualizar_grupetta(uuid, text, date, text, boolean, text, text) TO authenticated;

-- 5. Los capos pueden subir su GPX e imagen a los buckets existentes
--    (solo dentro de la carpeta grupetta/)
DROP POLICY IF EXISTS "capo sube gpx grupetta" ON storage.objects;
CREATE POLICY "capo sube gpx grupetta" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'race-gpx' AND (storage.foldername(name))[1] = 'grupetta');

DROP POLICY IF EXISTS "capo actualiza gpx grupetta" ON storage.objects;
CREATE POLICY "capo actualiza gpx grupetta" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'race-gpx' AND (storage.foldername(name))[1] = 'grupetta');

DROP POLICY IF EXISTS "capo sube imagen grupetta" ON storage.objects;
CREATE POLICY "capo sube imagen grupetta" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'race-images' AND (storage.foldername(name))[1] = 'grupetta');

DROP POLICY IF EXISTS "capo actualiza imagen grupetta" ON storage.objects;
CREATE POLICY "capo actualiza imagen grupetta" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'race-images' AND (storage.foldername(name))[1] = 'grupetta');
