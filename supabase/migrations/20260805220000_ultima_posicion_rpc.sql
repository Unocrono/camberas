-- ============================================================
-- ÚLTIMA POSICIÓN POR TOKEN, RESUELTA EN EL SERVIDOR (5-ago)
--
-- El mapa en vivo traía TODAS las posiciones del evento y se
-- quedaba con la última de cada token en el cliente. Con los
-- intervalos cortos de la V23 (moto TV / rally a 1-2 s) eso son
-- cientos de miles de filas por descarga. Este RPC devuelve solo
-- la última de cada token activo (DISTINCT ON), dé igual cuántas
-- haya debajo. El índice hace que el plan sea por token, no por
-- barrido.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_gps_positions_token_ts
  ON public.gps_positions (token_id, "timestamp" DESC);

CREATE OR REPLACE FUNCTION public.get_latest_gps_positions(
  p_event_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  token_id uuid,
  lat double precision,
  lng double precision,
  speed double precision,
  altitude double precision,
  battery double precision,
  "timestamp" timestamptz,
  bib_number text,
  participant_name text,
  event_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT DISTINCT ON (p.token_id)
    p.token_id,
    p.lat::double precision, p.lng::double precision,
    p.speed::double precision, p.altitude::double precision,
    p.battery::double precision,
    p."timestamp",
    g.bib_number::text,
    g.participant_name,
    g.event_id::text
  FROM gps_positions p
  JOIN gps_tokens g ON g.id = p.token_id
  WHERE g.active IS TRUE
    AND (p_event_ids IS NULL OR g.event_id::uuid = ANY(p_event_ids))
  ORDER BY p.token_id, p."timestamp" DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_latest_gps_positions(uuid[]) TO anon, authenticated;
