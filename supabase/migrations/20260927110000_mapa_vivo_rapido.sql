-- ============================================================
-- MAPA EN VIVO: DE MILES DE CÁLCULOS A UNO POR RECORRIDO (27-sep)
--
-- Se cayó en plena marcha ADEMCO: 36 móviles emitiendo desde las 8:00 y
-- get_live_gps_positions empezó a devolver "statement timeout" (500). La
-- consulta calculaba la ventana de captura con un LATERAL POR CADA FILA de
-- gps_positions de la carrera — miles de llamadas — y luego hacía DISTINCT
-- ON sobre todas ellas. Cada espectador la lanza cada 15 s.
--
-- Ahora: la ventana se calcula UNA vez por recorrido (3 en ADEMCO), y de
-- cada dorsal se lee SOLO su última posición válida con el índice único
-- (token_id, timestamp) — una búsqueda por dorsal, no un barrido.
-- Mismas columnas, mismo resultado.
-- ============================================================

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
  -- Pipeline 1: dispositivos GPS / tracker web (gps_tracking), sin cambios
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
  -- Pipeline 2: app Camberas Track — una búsqueda indexada por dorsal
  (
    WITH dorsales AS (
      SELECT gt.id AS token_id,
             gt.bib_number,
             gt.participant_name,
             rd.id AS dist_id,
             COALESCE(gt.es_organizacion, false) AS es_org,
             EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id) AS es_moto,
             cw.t_ini, cw.t_fin
      FROM race_distances rd
      JOIN gps_tokens gt ON gt.event_id = rd.id
      LEFT JOIN LATERAL gps_capture_window(rd.id::text) cw ON true   -- 1 por recorrido
      WHERE rd.race_id = p_race_id
        AND (p_distance_id IS NULL OR rd.id = p_distance_id)
    )
    SELECT ult.id, d.token_id, ult.lat::numeric, ult.lng::numeric,
           ult."timestamp"::timestamptz, d.bib_number::text,
           COALESCE(d.participant_name, 'Corredor'), d.dist_id,
           ult.heading::numeric, ult.speed::numeric, ult.battery::numeric,
           CASE WHEN d.es_moto THEN 'moto'
                WHEN d.es_org  THEN 'organizacion'
                ELSE 'app' END
    FROM dorsales d
    JOIN LATERAL (
      SELECT gp.*
        FROM gps_positions gp
       WHERE gp.token_id = d.token_id
         AND (
           ((d.es_org OR d.es_moto)
              AND gp."timestamp"::timestamptz > now() - interval '24 hours')
           OR (now() <= d.t_fin
              AND gp."timestamp"::timestamptz BETWEEN d.t_ini AND d.t_fin)
         )
       ORDER BY gp."timestamp" DESC
       LIMIT 1
    ) ult ON true
  )
  ORDER BY bib_number NULLS LAST;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_live_gps_positions(uuid, uuid) TO anon, authenticated;

SELECT 'mapa rapido ok' AS resultado;
