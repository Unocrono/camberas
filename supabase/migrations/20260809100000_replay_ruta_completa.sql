-- ============================================================
-- EL REPLAY SE COMÍA EL FINAL DE LAS RUTAS LARGAS (9-ago).
--
-- get_token_track devuelve las posiciones ordenadas por hora, y PostgREST
-- corta en 1.000 filas: en una ruta de 1.846 puntos se veían las 1.000
-- PRIMERAS y desaparecía la última hora y media. Con cadencia de 15 s,
-- cualquier salida de más de 4 h queda cortada — o sea, casi todas.
--
-- Solución: si hay más de 1.000, se REPARTEN por toda la ruta (se toma
-- 1 de cada N) conservando siempre la primera y la última. El dibujo es
-- idéntico a ojo y el recorrido llega hasta el final.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_token_track(p_token_id uuid)
RETURNS TABLE(lat numeric, lng numeric, ts timestamptz, speed numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_total int;
  v_paso  int;
BEGIN
  SELECT count(*) INTO v_total
    FROM gps_positions gp
   WHERE gp.token_id = p_token_id
     AND (gp.accuracy IS NULL OR gp.accuracy <= 100);

  -- 1 de cada N para no pasar de ~1.000 puntos
  v_paso := GREATEST(1, ceil(v_total::numeric / 1000)::int);

  RETURN QUERY
  WITH numeradas AS (
    SELECT gp.lat::numeric AS lat, gp.lng::numeric AS lng,
           gp."timestamp"::timestamptz AS ts, gp.speed::numeric AS speed,
           row_number() OVER (ORDER BY gp."timestamp") AS n
      FROM gps_positions gp
     WHERE gp.token_id = p_token_id
       AND (gp.accuracy IS NULL OR gp.accuracy <= 100)
  )
  SELECT d.lat, d.lng, d.ts, d.speed
    FROM numeradas d
   WHERE d.n % v_paso = 0        -- reparto uniforme
      OR d.n = 1                 -- salida
      OR d.n = v_total           -- llegada: la que se perdía
   ORDER BY d.ts ASC;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_token_track(uuid) TO anon, authenticated;
