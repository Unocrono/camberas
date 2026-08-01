-- ============================================================
-- REPETICIÓN para el pipeline de la app (gps_positions).
-- El mapa público ya reproduce tracks del pipeline viejo (gps_tracking);
-- este RPC expone el track completo de un token para que el visionado /
-- rebobinado funcione también con los miembros de una grupetta.
-- Público por diseño, igual que get_live_gps_positions: solo posiciones
-- de participantes en el mapa en vivo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_token_track(p_token_id uuid)
RETURNS TABLE(lat numeric, lng numeric, ts timestamptz, speed numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT gp.lat::numeric, gp.lng::numeric, gp."timestamp"::timestamptz, gp.speed::numeric
  FROM gps_positions gp
  WHERE gp.token_id = p_token_id
  ORDER BY gp."timestamp" ASC;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_token_track(uuid) TO anon, authenticated;
