-- Traza propia de la app Camberas Track (1.1.3) — fase 3 del cierre del GPS.
--
-- Desde la fase 2 (20261027210000) la clave anónima no lee gps_positions, y la
-- app 1.1.2 dejó de bajar su propia traza al reabrirse. Esta función se la
-- devuelve SOLO al móvil vinculado: la llave es el device_id, que nadie más
-- puede leer (es la misma llave con la que se aceptan sus posiciones y su SOS).
--
-- Las 1.000 posiciones más recientes, como pedía la app antes del cierre.
-- Solo añade; no cambia nada de lo que hay.

CREATE OR REPLACE FUNCTION public.mi_recorrido(p_token_id uuid, p_device_id text)
RETURNS TABLE(lat double precision, lng double precision, ts timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.lat, r.lng, r.ts
  FROM (
    SELECT p.lat, p.lng, p."timestamp" AS ts
    FROM gps_positions p
    WHERE p.token_id = p_token_id
      AND EXISTS (SELECT 1 FROM gps_tokens t WHERE t.id = p_token_id AND t.device_id = p_device_id)
    ORDER BY p."timestamp" DESC
    LIMIT 1000
  ) r
  ORDER BY r.ts;
$$;

REVOKE EXECUTE ON FUNCTION public.mi_recorrido(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_recorrido(uuid, text) TO anon, authenticated;

-- ── Comprobaciones ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (has_function_privilege('anon', 'public.mi_recorrido(uuid, text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.mi_recorrido(uuid, text)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'la app no puede llamar a mi_recorrido';
  END IF;
  IF has_column_privilege('anon', 'public.gps_positions', 'lat', 'SELECT')
     OR has_column_privilege('anon', 'public.gps_tokens', 'device_id', 'SELECT') THEN
    RAISE EXCEPTION 'el cierre de la fase 2 se ha abierto';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
