-- ============================================================
-- FILTRO DE PRECISIÓN en el track (caso Quique, 8-ago): al despertar
-- de una congelación del fabricante, el móvil cuela fijos de ANTENA
-- (precisión 400–2.600 m) que dibujan teletransportes de 20+ km en el
-- mapa. La app ya no los guarda (v24G); esto limpia el dibujo de los
-- que ya existen y de cualquier app vieja: el track solo usa fijos
-- con precisión de GPS de verdad (<100 m o sin dato).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_token_track(p_token_id uuid)
RETURNS TABLE(lat numeric, lng numeric, ts timestamptz, speed numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT gp.lat::numeric, gp.lng::numeric, gp."timestamp"::timestamptz, gp.speed::numeric
  FROM gps_positions gp
  WHERE gp.token_id = p_token_id
    AND (gp.accuracy IS NULL OR gp.accuracy <= 100)
  ORDER BY gp."timestamp" ASC;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_token_track(uuid) TO anon, authenticated;
