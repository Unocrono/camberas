-- ============================================================
-- GALLOS EN EL GRAFISMO (20-ago): un corredor con opciones pasa al
-- streaming activándole un nombre corto de TV, igual que las motos.
--
-- La regla de la casa queda unificada: name_tv define quién sale en
-- el grafismo. Motos: race_motos.name_tv (M1-M3). Corredores:
-- gps_tokens.name_tv ("R.PEREZ", "LIDER F"...). Sin name_tv, el
-- dispositivo emite igual pero los overlays no lo pintan.
-- ============================================================

ALTER TABLE gps_tokens
  ADD COLUMN IF NOT EXISTS name_tv text;

COMMENT ON COLUMN gps_tokens.name_tv IS
  'Nombre corto para el grafismo de TV. Si es NULL, el corredor no sale '
  'en el streaming (regla unificada con race_motos.name_tv). Un gallo '
  'suele llevar ademas send_interval_seconds = 5.';

-- El panel lo lee y lo edita
DROP FUNCTION IF EXISTS tokens_corredores_carrera(uuid);
CREATE OR REPLACE FUNCTION tokens_corredores_carrera(p_race_id uuid)
RETURNS TABLE(
  token_row_id uuid, distance_id uuid, evento text, bib text,
  nombre text, token uuid, activo boolean, device_id text,
  intervalo int, name_tv text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT t.id, d.id, d.name, t.bib_number, t.participant_name,
         t.token, t.active, t.device_id, t.send_interval_seconds, t.name_tv
  FROM gps_tokens t
  JOIN race_distances d ON d.id::text = t.event_id::text
  WHERE d.race_id = p_race_id
  ORDER BY d.name, t.bib_number;
$fn$;

REVOKE EXECUTE ON FUNCTION tokens_corredores_carrera(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION tokens_corredores_carrera(uuid) TO authenticated;

-- Activar/cambiar/quitar el nombre de TV de un dorsal (y de paso su
-- intervalo de gallo, que suele ir de la mano)
CREATE OR REPLACE FUNCTION marcar_gallo(
  p_token_row_id uuid,
  p_name_tv text DEFAULT NULL,
  p_intervalo int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  UPDATE gps_tokens
     SET name_tv = nullif(trim(COALESCE(p_name_tv, '')), ''),
         send_interval_seconds = CASE
           WHEN p_intervalo IS NOT NULL THEN least(120, greatest(1, p_intervalo))
           ELSE send_interval_seconds
         END
   WHERE id = p_token_row_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION marcar_gallo(uuid, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION marcar_gallo(uuid, text, int) TO authenticated;
