-- ============================================================
-- VENTANA DE CAPTURA GPS ligada al EVENTO (decisión 3-ago):
--  · Captura: [salida − 24 h, salida + tiempo límite + 2 h]
--    - salida = race_waves.start_time (la oleada del evento)
--    - límite = race_distances.cutoff_time; grupettas SIEMPRE 6 h;
--      carreras sin dato → 12 h
--    - sin hora de salida → el día completo del evento como ventana
--  · Fuera de ventana el servidor NO acepta posiciones (el SOS sí, siempre)
--  · Repetición: participantes visibles 7 días tras el evento
--  · Purga: grupettas a 7 días, resto a 30 — respetando Mis salidas
-- ============================================================

-- 1. Tiempo límite como intervalo (cutoff_time es TEXT libre: se intenta
--    "HH:MM" o número de horas; si no, el defecto por tipo de grupo)
CREATE OR REPLACE FUNCTION gps_cutoff_interval(p_cutoff text, p_group text)
RETURNS interval
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_group = 'grupetta' THEN interval '6 hours'
    WHEN p_cutoff ~ '^\s*\d{1,2}:\d{2}' THEN
      (substring(p_cutoff from '\d{1,2}:\d{2}') || ':00')::interval
    WHEN p_cutoff ~ '^\s*\d+([.,]\d+)?\s*(h|horas?)?\s*$' THEN
      make_interval(mins => round(replace(substring(p_cutoff from '\d+([.,]\d+)?'),
                                          ',', '.')::numeric * 60)::int)
    ELSE interval '12 hours'
  END
$fn$;

-- 2. Ventana de captura de un evento
CREATE OR REPLACE FUNCTION gps_capture_window(p_distance_id text,
  OUT t_ini timestamptz, OUT t_fin timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT
    COALESCE(w.start_time,
             (r.date::text || ' 00:00')::timestamp AT TIME ZONE 'Europe/Madrid')
      - interval '24 hours',
    CASE WHEN w.start_time IS NOT NULL THEN
      w.start_time + gps_cutoff_interval(d.cutoff_time, r.group_type) + interval '2 hours'
    ELSE
      (r.date::text || ' 23:59')::timestamp AT TIME ZONE 'Europe/Madrid' + interval '2 hours'
    END
  FROM race_distances d
  JOIN races r ON r.id = d.race_id
  LEFT JOIN race_waves w ON w.race_distance_id = d.id
  WHERE d.id::text = p_distance_id
$fn$;

-- 3. El servidor solo acepta posiciones dentro de la ventana
--    (tokens sin evento reconocible mantienen el comportamiento anterior)
DROP POLICY IF EXISTS "App inserts gps_positions (token válido)" ON public.gps_positions;
CREATE POLICY "App inserts gps_positions (token válido)"
  ON public.gps_positions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    token_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM gps_tokens t
      WHERE t.id = token_id AND t.active IS TRUE
        AND (
          NOT EXISTS (SELECT 1 FROM race_distances d WHERE d.id::text = t.event_id::text)
          OR EXISTS (SELECT 1 FROM gps_capture_window(t.event_id::text) cw
                     WHERE now() BETWEEN cw.t_ini AND cw.t_fin)
        )
    )
  );

-- 4. El mapa en vivo usa la ventana del evento (antes: 24 h fijas)
CREATE OR REPLACE FUNCTION public.get_live_gps_positions(
  p_race_id uuid,
  p_distance_id uuid DEFAULT NULL
)
RETURNS TABLE(
  gps_id uuid, registration_id uuid, latitude numeric, longitude numeric,
  gps_timestamp timestamptz, bib_number text, runner_name text,
  race_distance_id uuid, heading numeric, speed numeric, battery numeric, source text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  -- Pipeline 1: dispositivos GPS / tracker web (gps_tracking)
  (
    SELECT DISTINCT ON (g.registration_id)
      g.id, g.registration_id, g.latitude, g.longitude, g."timestamp",
      r.bib_number::text,
      COALESCE(
        p.first_name || ' ' || COALESCE(p.last_name, ''),
        r.first_name || ' ' || COALESCE(r.last_name, ''),
        'Corredor'
      ),
      r.race_distance_id, g.heading::numeric, g.speed::numeric,
      g.battery_level::numeric, 'device'::text
    FROM gps_tracking g
    JOIN registrations r ON r.id = g.registration_id
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE g.race_id = p_race_id
      AND (p_distance_id IS NULL OR r.race_distance_id = p_distance_id)
    ORDER BY g.registration_id, g."timestamp" DESC
  )
  UNION ALL
  -- Pipeline 2: app camberas-track — solo dentro de la ventana del evento
  (
    SELECT DISTINCT ON (gp.token_id)
      gp.id, gp.token_id, gp.lat::numeric, gp.lng::numeric,
      gp."timestamp"::timestamptz, gt.bib_number::text,
      COALESCE(gt.participant_name, 'Corredor'), rd.id,
      gp.heading::numeric, gp.speed::numeric, gp.battery::numeric, 'app'::text
    FROM gps_positions gp
    JOIN gps_tokens gt ON gt.id = gp.token_id
    JOIN race_distances rd ON rd.id::text = gt.event_id::text
    JOIN LATERAL gps_capture_window(rd.id::text) cw ON true
    WHERE rd.race_id = p_race_id
      AND (p_distance_id IS NULL OR rd.id = p_distance_id)
      AND now() <= cw.t_fin
      AND gp."timestamp"::timestamptz BETWEEN cw.t_ini AND cw.t_fin
    ORDER BY gp.token_id, gp."timestamp" DESC
  )
  ORDER BY bib_number NULLS LAST;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_live_gps_positions(uuid, uuid) TO anon, authenticated;

-- 5. Panel "finalizado": participantes con track, hasta 7 días tras el evento
--    (misma forma que get_live_gps_positions para que el mapa lo pinte igual)
CREATE OR REPLACE FUNCTION public.get_event_participants_replay(
  p_race_id uuid,
  p_distance_id uuid DEFAULT NULL
)
RETURNS TABLE(
  gps_id uuid, registration_id uuid, latitude numeric, longitude numeric,
  gps_timestamp timestamptz, bib_number text, runner_name text,
  race_distance_id uuid, heading numeric, speed numeric, battery numeric, source text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT DISTINCT ON (gp.token_id)
    gp.id, gp.token_id, gp.lat::numeric, gp.lng::numeric,
    gp."timestamp"::timestamptz, gt.bib_number::text,
    COALESCE(gt.participant_name, 'Corredor'), rd.id,
    gp.heading::numeric, gp.speed::numeric, gp.battery::numeric, 'app'::text
  FROM gps_positions gp
  JOIN gps_tokens gt ON gt.id = gp.token_id
  JOIN race_distances rd ON rd.id::text = gt.event_id::text
  JOIN races r ON r.id = rd.race_id
  WHERE rd.race_id = p_race_id
    AND (p_distance_id IS NULL OR rd.id = p_distance_id)
    AND r.date >= current_date - 7
  ORDER BY gp.token_id, gp."timestamp" DESC
$fn$;

GRANT EXECUTE ON FUNCTION public.get_event_participants_replay(uuid, uuid) TO anon, authenticated;

-- 6. Purga: grupettas a 7 días, resto a 30 — Mis salidas (user_id) se conserva
CREATE OR REPLACE FUNCTION purge_gps_antiguos()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  DELETE FROM gps_positions p
   USING gps_tokens t, race_distances d, races r
   WHERE p.token_id = t.id
     AND d.id::text = t.event_id::text
     AND r.id = d.race_id
     AND t.user_id IS NULL
     AND r.date < current_date - CASE WHEN r.group_type = 'grupetta' THEN 7 ELSE 30 END;

  -- tokens huérfanos de grupetta (sin posiciones y sin dueño): fuera también
  DELETE FROM gps_tokens t
   USING race_distances d, races r
   WHERE d.id::text = t.event_id::text
     AND r.id = d.race_id
     AND r.group_type = 'grupetta'
     AND t.user_id IS NULL
     AND r.date < current_date - 7
     AND NOT EXISTS (SELECT 1 FROM gps_positions p WHERE p.token_id = t.id);
END;
$fn$;

-- Programar la purga diaria si pg_cron está disponible (04:30)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('purge-gps-antiguos', '30 4 * * *',
                          'SELECT public.purge_gps_antiguos()');
  END IF;
END
$do$;
