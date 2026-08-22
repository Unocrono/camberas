-- ============================================================
-- MOTIVO DEL SOS (decisión 7-ago): tras enviar la alerta, el
-- participante puede decir QUÉ le pasa. Cambia por completo la
-- respuesta de la organización: "pinchazo, reparando" no moviliza
-- a nadie; "me torcí el tobillo" sí. Y la falsa alarma evita un
-- rescate innecesario.
--
-- El envío del SOS NO cambia: sale primero, el detalle va después.
-- ============================================================

ALTER TABLE gps_sos_alerts
  ADD COLUMN IF NOT EXISTS false_alarm boolean NOT NULL DEFAULT false;

-- Añadir motivo a la ÚLTIMA alerta sin resolver del token. No hace falta
-- el id de la alerta: así el detalle funciona aunque la app no pueda leer
-- la fila que acaba de insertar (RLS de escritura ciega).
CREATE OR REPLACE FUNCTION detallar_sos(
  p_token_id uuid,
  p_motivo text DEFAULT NULL,
  p_falsa boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  -- El token debe existir y estar activo (misma credencial que el resto)
  IF NOT EXISTS (SELECT 1 FROM gps_tokens WHERE id = p_token_id AND active IS TRUE) THEN
    RAISE EXCEPTION 'Token no válido';
  END IF;

  SELECT id INTO v_id
    FROM gps_sos_alerts
   WHERE token_id = p_token_id
     AND resolved_at IS NULL
   ORDER BY triggered_at DESC NULLS LAST
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN false;  -- no hay alerta viva que detallar
  END IF;

  UPDATE gps_sos_alerts
     SET notes = COALESCE(nullif(trim(p_motivo), ''), notes),
         false_alarm = COALESCE(p_falsa, false),
         -- Una falsa alarma se cierra sola: la organización la ve marcada
         resolved_at = CASE WHEN COALESCE(p_falsa, false) THEN now() ELSE resolved_at END
   WHERE id = v_id;

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION detallar_sos(uuid, text, boolean) TO anon, authenticated;
