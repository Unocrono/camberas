-- Función para obtener posiciones GPS con información básica del corredor para visualización pública
CREATE OR REPLACE FUNCTION get_live_gps_positions(p_race_id uuid, p_distance_id uuid DEFAULT NULL)
RETURNS TABLE (
  gps_id uuid,
  registration_id uuid,
  latitude numeric,
  longitude numeric,
  gps_timestamp timestamptz,
  bib_number integer,
  runner_name text,
  race_distance_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH latest_positions AS (
    SELECT DISTINCT ON (g.registration_id)
      g.id as gps_id,
      g.registration_id,
      g.latitude,
      g.longitude,
      g.timestamp as gps_timestamp,
      r.bib_number,
      r.race_distance_id,
      COALESCE(
        p.first_name || ' ' || COALESCE(p.last_name, ''),
        r.guest_first_name || ' ' || COALESCE(r.guest_last_name, ''),
        'Corredor'
      ) as runner_name
    FROM gps_tracking g
    JOIN registrations r ON r.id = g.registration_id
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE g.race_id = p_race_id
      AND (p_distance_id IS NULL OR r.race_distance_id = p_distance_id)
    ORDER BY g.registration_id, g.timestamp DESC
  )
  SELECT 
    lp.gps_id,
    lp.registration_id,
    lp.latitude,
    lp.longitude,
    lp.gps_timestamp,
    lp.bib_number,
    lp.runner_name,
    lp.race_distance_id
  FROM latest_positions lp
  ORDER BY lp.bib_number NULLS LAST, lp.gps_timestamp DESC;
END;
$$;