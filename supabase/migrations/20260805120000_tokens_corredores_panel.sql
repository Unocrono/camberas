-- ============================================================
-- HERRAMIENTA DE DORSALES GPS (tokens de corredor) EN EL PANEL:
-- listar, crear y revocar tokens de un evento, con su QR.
-- Hasta hoy se creaban por SQL a mano — fin de esa era.
-- ============================================================

CREATE OR REPLACE FUNCTION tokens_corredores_carrera(p_race_id uuid)
RETURNS TABLE(token_row_id uuid, distance_id uuid, evento text, bib text,
              nombre text, token uuid, activo boolean, device_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT t.id, d.id, d.name, t.bib_number, t.participant_name,
         t.token, t.active, t.device_id
  FROM gps_tokens t
  JOIN race_distances d ON d.id::text = t.event_id::text
  WHERE d.race_id = p_race_id
    AND NOT EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = t.id)
    AND (has_role(auth.uid(), 'admin'::app_role)
         OR EXISTS (SELECT 1 FROM races r
                     WHERE r.id = p_race_id AND r.organizer_id = auth.uid()))
  ORDER BY d.name, t.bib_number::int NULLS LAST
$fn$;

CREATE OR REPLACE FUNCTION generar_token_corredor(
  p_distance_id uuid, p_bib text, p_nombre text DEFAULT NULL)
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
  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token)
  VALUES (true, trim(p_bib), p_distance_id,
          COALESCE(nullif(trim(p_nombre), ''), 'Dorsal ' || trim(p_bib)), v_token)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('token_row_id', v_id, 'token', v_token);
END;
$fn$;

CREATE OR REPLACE FUNCTION revocar_token_corredor(p_token_row_id uuid)
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
  UPDATE gps_tokens SET active = NOT active WHERE id = p_token_row_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION tokens_corredores_carrera(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION generar_token_corredor(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION revocar_token_corredor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION tokens_corredores_carrera(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION generar_token_corredor(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION revocar_token_corredor(uuid) TO authenticated;

-- Entrada de menú del panel de admin
INSERT INTO menu_items (menu_type, title, icon, view, item_order, group_label)
SELECT 'admin', 'Dorsales GPS (QR)', 'QrCode', 'gps-tokens',
       COALESCE((SELECT max(item_order) FROM menu_items WHERE menu_type='admin'), 0) + 1,
       (SELECT group_label FROM menu_items WHERE view = 'motos' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE view = 'gps-tokens');
