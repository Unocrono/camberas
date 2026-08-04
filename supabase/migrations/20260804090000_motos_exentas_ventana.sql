-- ============================================================
-- DISPOSITIVOS DE ORGANIZACIÓN EXENTOS DE LA VENTANA DE CAPTURA
-- (decisión 4-ago): las motos son material de la organización — se
-- montan y prueban días antes del evento, y el abuso que la ventana
-- previene (un GPS olvidado grabando el viaje de vuelta) es un
-- problema de participantes, no de motos.
-- Los tokens de participante mantienen su ventana intacta.
-- ============================================================

-- 0. La ventana la manda la FECHA DE LA CARRERA + la hora de la oleada.
--    Antes se usaba race_waves.start_time tal cual: si se cambiaba la fecha
--    de la carrera sin tocar la oleada, la ventana se quedaba en el día viejo.
CREATE OR REPLACE FUNCTION gps_capture_window(p_distance_id text,
  OUT t_ini timestamptz, OUT t_fin timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $win$
  SELECT
    COALESCE(s.salida, (r.date::text || ' 00:00')::timestamp AT TIME ZONE 'Europe/Madrid')
      - interval '24 hours',
    CASE WHEN s.salida IS NOT NULL THEN
      s.salida + gps_cutoff_interval(d.cutoff_time, r.group_type) + interval '2 hours'
    ELSE
      -- Sin hora de salida: el día completo del evento
      (r.date::text || ' 23:59')::timestamp AT TIME ZONE 'Europe/Madrid' + interval '2 hours'
    END
  FROM race_distances d
  JOIN races r ON r.id = d.race_id
  LEFT JOIN race_waves w ON w.race_distance_id = d.id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN w.start_time IS NULL THEN NULL
      ELSE (r.date::text || ' ' ||
            to_char(w.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
           )::timestamp AT TIME ZONE 'Europe/Madrid'
    END AS salida
  ) s
  WHERE d.id::text = p_distance_id
$win$;

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
          -- Dispositivo de organización (moto): sin ventana
          EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = t.id)
          -- Token sin evento reconocible: comportamiento anterior
          OR NOT EXISTS (SELECT 1 FROM race_distances d
                          WHERE d.id::text = t.event_id::text)
          -- Participante: solo dentro de la ventana del evento
          OR EXISTS (SELECT 1 FROM gps_capture_window(t.event_id::text) cw
                     WHERE now() BETWEEN cw.t_ini AND cw.t_fin)
        )
    )
  );

-- El mapa en vivo también debe mostrar las motos fuera de ventana
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
  -- Pipeline 2: app camberas-track / camberas-motos (gps_positions).
  -- Participantes: dentro de la ventana. Motos: siempre (últimas 24 h).
  (
    SELECT DISTINCT ON (gp.token_id)
      gp.id, gp.token_id, gp.lat::numeric, gp.lng::numeric,
      gp."timestamp"::timestamptz, gt.bib_number::text,
      COALESCE(gt.participant_name, 'Corredor'), rd.id,
      gp.heading::numeric, gp.speed::numeric, gp.battery::numeric,
      CASE WHEN EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id)
           THEN 'moto' ELSE 'app' END
    FROM gps_positions gp
    JOIN gps_tokens gt ON gt.id = gp.token_id
    JOIN race_distances rd ON rd.id::text = gt.event_id::text
    LEFT JOIN LATERAL gps_capture_window(rd.id::text) cw ON true
    WHERE rd.race_id = p_race_id
      AND (p_distance_id IS NULL OR rd.id = p_distance_id)
      AND (
        EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id)
          AND gp."timestamp"::timestamptz > now() - interval '24 hours'
        OR (now() <= cw.t_fin
            AND gp."timestamp"::timestamptz BETWEEN cw.t_ini AND cw.t_fin)
      )
    ORDER BY gp.token_id, gp."timestamp" DESC
  )
  ORDER BY bib_number NULLS LAST;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_live_gps_positions(uuid, uuid) TO anon, authenticated;
