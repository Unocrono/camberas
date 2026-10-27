-- Lecturas GPS para las pruebas de mesa (camberas-track/scripts/check-gps.js)
-- tras el cierre del GPS (27-oct-2026): gps_positions ya no se lee con la
-- clave anónima y get_event_participants_replay quedó sin permisos.
--
-- Se dan solo a quien tiene el token de una pantalla de seguimiento ACTIVA de
-- la carrera (pantallas_seguimiento), igual que monitor_gps y
-- pantalla_posiciones. Solo añade; no toca nada de lo que hay.

-- Dorsales de la carrera de la pantalla con lecturas en los últimos 7 días
CREATE OR REPLACE FUNCTION public.dorsales_pantalla(p_token uuid)
RETURNS TABLE(token_id uuid, bib_number text, participant_name text, movil text, ultima timestamptz, lecturas_7d bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.bib_number, t.participant_name, left(t.device_id, 8), x.ultima, x.n
  FROM pantallas_seguimiento p
  JOIN race_distances d ON d.race_id = p.race_id
  JOIN gps_tokens t ON t.event_id = d.id
  CROSS JOIN LATERAL (
    SELECT max(gp."timestamp") AS ultima, count(*) AS n
    FROM gps_positions gp
    WHERE gp.token_id = t.id AND gp."timestamp" > now() - interval '7 days'
  ) x
  WHERE p.token = p_token AND p.activa IS TRUE AND x.n > 0
  ORDER BY t.bib_number, t.id;
$$;

-- Todas las lecturas de un dorsal (o de todos) desde p_desde (24 h por
-- defecto), ordenadas: el script las pagina con Range de 1000 en 1000.
CREATE OR REPLACE FUNCTION public.lecturas_pantalla(
  p_token uuid,
  p_token_id uuid DEFAULT NULL,
  p_dorsales text[] DEFAULT NULL,
  p_desde timestamptz DEFAULT NULL,
  p_hasta timestamptz DEFAULT NULL
)
RETURNS TABLE(token_id uuid, bib_number text, "timestamp" timestamptz, created_at timestamptz, uploaded_at timestamptz,
              accuracy double precision, battery integer, speed double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.bib_number, gp."timestamp", gp.created_at, gp.uploaded_at, gp.accuracy, gp.battery, gp.speed
  FROM pantallas_seguimiento p
  JOIN race_distances d ON d.race_id = p.race_id
  JOIN gps_tokens t ON t.event_id = d.id
       AND (p_token_id IS NULL OR t.id = p_token_id)
       AND (p_dorsales IS NULL OR t.bib_number = ANY(p_dorsales))
  JOIN gps_positions gp ON gp.token_id = t.id
  WHERE p.token = p_token AND p.activa IS TRUE
    AND gp."timestamp" >= coalesce(p_desde, now() - interval '24 hours')
    AND (p_hasta IS NULL OR gp."timestamp" < p_hasta)
  ORDER BY t.bib_number, t.id, gp."timestamp";
$$;

REVOKE EXECUTE ON FUNCTION public.dorsales_pantalla(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lecturas_pantalla(uuid, uuid, text[], timestamptz, timestamptz) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dorsales_pantalla(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lecturas_pantalla(uuid, uuid, text[], timestamptz, timestamptz) TO anon, authenticated;

-- ── Comprobaciones ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (has_function_privilege('anon', 'public.dorsales_pantalla(uuid)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.lecturas_pantalla(uuid, uuid, text[], timestamptz, timestamptz)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'el comparador no puede llamar a las funciones';
  END IF;
  IF has_column_privilege('anon', 'public.gps_positions', 'lat', 'SELECT') THEN
    RAISE EXCEPTION 'el cierre de la fase 2 se ha abierto';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
