-- ============================================================
-- DISTANCIA Y DESNIVEL DE LA GRUPETTA calculados del GPX:
-- al subir la ruta, la web calcula km y desnivel y los guarda en los
-- campos nativos (race_distances.distance_km / elevation_gain), con lo
-- que el mapa público deja de decir "0 km" sin pedirle nada al capo.
-- ============================================================

-- 1. actualizar_grupetta acepta distancia y desnivel
DROP FUNCTION IF EXISTS actualizar_grupetta(uuid, text, date, time, text, boolean, text, text);

CREATE OR REPLACE FUNCTION actualizar_grupetta(
  p_race_id uuid,
  p_nombre text DEFAULT NULL,
  p_fecha date DEFAULT NULL,
  p_hora time DEFAULT NULL,
  p_lugar text DEFAULT NULL,
  p_publicada boolean DEFAULT NULL,
  p_imagen_url text DEFAULT NULL,
  p_gpx_url text DEFAULT NULL,
  p_distancia_km numeric DEFAULT NULL,
  p_desnivel int DEFAULT NULL
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
    UPDATE race_distances SET
      gpx_file_url = p_gpx_url,
      distance_km = COALESCE(p_distancia_km, distance_km),
      elevation_gain = COALESCE(p_desnivel, elevation_gain)
    WHERE race_id = p_race_id;
  END IF;

  SELECT date INTO v_fecha FROM races WHERE id = p_race_id;

  IF p_hora IS NOT NULL THEN
    UPDATE race_waves SET
      wave_name = 'Salida',
      start_time = ((v_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'Europe/Madrid')
    WHERE race_id = p_race_id;
  ELSIF p_fecha IS NOT NULL THEN
    UPDATE race_waves w SET
      start_time = ((p_fecha::text || ' ' ||
        to_char(w.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI'))::timestamp
        AT TIME ZONE 'Europe/Madrid')
    WHERE w.race_id = p_race_id
      AND w.start_time IS NOT NULL;
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION actualizar_grupetta(uuid, text, date, time, text, boolean, text, text, numeric, int) FROM anon;
GRANT EXECUTE ON FUNCTION actualizar_grupetta(uuid, text, date, time, text, boolean, text, text, numeric, int) TO authenticated;

-- 2. mis_grupettas devuelve también distancia y desnivel
DROP FUNCTION IF EXISTS mis_grupettas();

CREATE OR REPLACE FUNCTION mis_grupettas()
RETURNS TABLE(
  race_id uuid, distance_id uuid, nombre text, join_code text, slug text,
  fecha date, hora text, lugar text, publicada boolean, imagen text, gpx text,
  distancia numeric, desnivel int, miembros bigint, inscritos jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT r.id, d.id, r.name, r.join_code, r.slug, r.date,
         to_char(w.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
         r.location, r.is_visible, r.image_url, d.gpx_file_url,
         d.distance_km, d.elevation_gain,
         (SELECT count(*) FROM gps_tokens t WHERE t.event_id = d.id),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'dorsal', t.bib_number, 'nombre', t.participant_name)
                 ORDER BY t.bib_number::int), '[]'::jsonb)
            FROM gps_tokens t WHERE t.event_id = d.id)
  FROM races r
  JOIN race_distances d ON d.race_id = r.id
  LEFT JOIN race_waves w ON w.race_id = r.id
  WHERE r.organizer_id = auth.uid()
    AND r.group_type = 'grupetta'
    AND r.date >= current_date - 7
  ORDER BY r.date, r.created_at;
$fn$;

REVOKE EXECUTE ON FUNCTION mis_grupettas() FROM anon;
GRANT EXECUTE ON FUNCTION mis_grupettas() TO authenticated;
