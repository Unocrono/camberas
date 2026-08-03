-- ============================================================
-- MOTOS POR TOKEN (decisión 3-ago): las motos dejan de necesitar
-- usuario motero — cada MOTO de race_motos genera su token de
-- activación (mismo patrón QR que los corredores de camberas-track)
-- y emitirá a gps_positions por la tubería común, con ventana de
-- captura, mapa en vivo y repetición incluidos.
-- race_motos sigue siendo el catálogo de control.
-- ============================================================

-- 1. Vínculo moto → token
ALTER TABLE race_motos ADD COLUMN IF NOT EXISTS token_id uuid;

-- 2. Generar (o regenerar) el token de una moto
--    El "dorsal" es M + orden (M1, M2…) y el nombre el de la moto.
--    El token cuelga del evento indicado o, por defecto, del primero
--    con GPS activo de la carrera.
CREATE OR REPLACE FUNCTION generar_token_moto(
  p_race_moto_id uuid,
  p_distance_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_moto race_motos%ROWTYPE;
  v_dist_id uuid;
  v_token uuid := gen_random_uuid();
  v_token_row_id uuid;
BEGIN
  SELECT * INTO v_moto FROM race_motos WHERE id = p_race_moto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moto no encontrada';
  END IF;

  -- Solo admin o el organizador de la carrera
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r
                WHERE r.id = v_moto.race_id AND r.organizer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sin permiso para generar tokens de esta carrera';
  END IF;

  -- Evento del token: el indicado > el evento de la moto > el primero con GPS
  v_dist_id := COALESCE(p_distance_id, v_moto.race_distance_id);
  IF v_dist_id IS NULL THEN
    SELECT d.id INTO v_dist_id FROM race_distances d
     WHERE d.race_id = v_moto.race_id
     ORDER BY (d.gps_tracking_enabled IS TRUE) DESC,
              d.display_order NULLS LAST, d.created_at
     LIMIT 1;
  END IF;
  IF v_dist_id IS NULL THEN
    RAISE EXCEPTION 'La carrera no tiene eventos';
  END IF;

  -- Retirar el token anterior de la moto, si lo había
  IF v_moto.token_id IS NOT NULL THEN
    UPDATE gps_tokens SET active = false WHERE id = v_moto.token_id;
  END IF;

  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token)
  VALUES (true, 'M' || v_moto.moto_order, v_dist_id, v_moto.name, v_token)
  RETURNING id INTO v_token_row_id;

  UPDATE race_motos SET token_id = v_token_row_id WHERE id = p_race_moto_id;

  RETURN jsonb_build_object(
    'token', v_token,
    'bib', 'M' || v_moto.moto_order,
    'nombre', v_moto.name,
    'distance_id', v_dist_id
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION generar_token_moto(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION generar_token_moto(uuid, uuid) TO authenticated;

-- 3. Consultar el token vigente de las motos de una carrera (para el panel:
--    mostrar QR/enlace y estado sin exponer gps_tokens directamente)
CREATE OR REPLACE FUNCTION tokens_motos_carrera(p_race_id uuid)
RETURNS TABLE(race_moto_id uuid, nombre text, bib text, token uuid,
              activo boolean, distance_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT m.id, m.name, t.bib_number, t.token, t.active, t.event_id::uuid
  FROM race_motos m
  JOIN gps_tokens t ON t.id = m.token_id
  WHERE m.race_id = p_race_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r
                  WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    )
$fn$;

REVOKE EXECUTE ON FUNCTION tokens_motos_carrera(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION tokens_motos_carrera(uuid) TO authenticated;
