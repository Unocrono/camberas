-- ============================================================
-- INTERVALO DE ENVÍO configurable desde el panel Dorsales GPS:
-- crear el dorsal con su intervalo y cambiarlo después sin SQL.
-- (El dispositivo lo recoge al re-escanear su QR.)
-- ============================================================

-- 1. Crear con intervalo opcional
DROP FUNCTION IF EXISTS generar_token_corredor(uuid, text, text);
CREATE OR REPLACE FUNCTION generar_token_corredor(
  p_distance_id uuid, p_bib text, p_nombre text DEFAULT NULL,
  p_intervalo int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_race uuid; v_token uuid := gen_random_uuid(); v_id uuid;
BEGIN
  SELECT race_id INTO v_race FROM race_distances WHERE id = p_distance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento no encontrado'; END IF;
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM races r
                      WHERE r.id = v_race AND r.organizer_id = auth.uid())) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  IF p_intervalo IS NOT NULL AND (p_intervalo < 1 OR p_intervalo > 120) THEN
    RAISE EXCEPTION 'El intervalo debe estar entre 1 y 120 segundos';
  END IF;
  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token,
                          send_interval_seconds)
  VALUES (true, trim(p_bib), p_distance_id,
          COALESCE(nullif(trim(p_nombre), ''), 'Dorsal ' || trim(p_bib)), v_token,
          p_intervalo)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('token_row_id', v_id, 'token', v_token);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION generar_token_corredor(uuid, text, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION generar_token_corredor(uuid, text, text, int) TO authenticated;

-- 2. Cambiar el intervalo de un token existente
CREATE OR REPLACE FUNCTION cambiar_intervalo_token(p_token_row_id uuid, p_intervalo int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_race uuid;
BEGIN
  SELECT d.race_id INTO v_race FROM gps_tokens t
   JOIN race_distances d ON d.id::text = t.event_id::text
   WHERE t.id = p_token_row_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Token no encontrado'; END IF;
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM races r
                      WHERE r.id = v_race AND r.organizer_id = auth.uid())) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  IF p_intervalo IS NOT NULL AND (p_intervalo < 1 OR p_intervalo > 120) THEN
    RAISE EXCEPTION 'El intervalo debe estar entre 1 y 120 segundos';
  END IF;
  UPDATE gps_tokens SET send_interval_seconds = p_intervalo
   WHERE id = p_token_row_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION cambiar_intervalo_token(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION cambiar_intervalo_token(uuid, int) TO authenticated;

-- 3. El listado del panel devuelve el intervalo
DROP FUNCTION IF EXISTS tokens_corredores_carrera(uuid);
CREATE OR REPLACE FUNCTION tokens_corredores_carrera(p_race_id uuid)
RETURNS TABLE(token_row_id uuid, distance_id uuid, evento text, bib text,
              nombre text, token uuid, activo boolean, device_id text,
              intervalo int)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT t.id, d.id, d.name, t.bib_number, t.participant_name,
         t.token, t.active, t.device_id, t.send_interval_seconds
  FROM gps_tokens t
  JOIN race_distances d ON d.id::text = t.event_id::text
  WHERE d.race_id = p_race_id
    AND NOT EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = t.id)
    AND (has_role(auth.uid(), 'admin'::app_role)
         OR EXISTS (SELECT 1 FROM races r
                     WHERE r.id = p_race_id AND r.organizer_id = auth.uid()))
  ORDER BY d.name, t.bib_number::int NULLS LAST
$fn$;
REVOKE EXECUTE ON FUNCTION tokens_corredores_carrera(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION tokens_corredores_carrera(uuid) TO authenticated;
