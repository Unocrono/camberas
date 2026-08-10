-- ============================================================
-- INTERVALO DE ENVÍO GPS POR TOKEN (decisión 5-ago, app V25a)
--
-- Cada token puede definir cada cuántos segundos captura y envía
-- posición la app Track. Jerarquía que resuelve link_gps_token:
--   1. gps_tokens.send_interval_seconds (si está puesto)
--   2. papel mototv en el catálogo race_motos → 2 s (grafismo)
--   3. 15 s (el histórico de corredores y organización)
-- Casos de uso: moto de TV a 2 s para el overlay; rally de montaña
-- con coches a 1-2 s (a 15 s un coche recorre medio kilómetro).
-- La app recibe el intervalo AL ESCANEAR EL QR: cambiarlo pide
-- re-escanear (o re-activar) el token en el dispositivo.
-- ============================================================

ALTER TABLE gps_tokens
  ADD COLUMN IF NOT EXISTS send_interval_seconds int
  CHECK (send_interval_seconds BETWEEN 1 AND 120);

-- El tipo de retorno cambia: hay que soltar la función anterior
DROP FUNCTION IF EXISTS public.link_gps_token(text, text, boolean);

CREATE OR REPLACE FUNCTION public.link_gps_token(
  p_token text,
  p_device_id text,
  p_force boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  bib_number text,
  participant_name text,
  event_id text,
  device_id text,
  linked_at timestamptz,
  needs_transfer boolean,
  send_interval_seconds int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  tok record;
  v_interval int;
BEGIN
  SELECT g.* INTO tok
  FROM gps_tokens g
  WHERE g.token = p_token::uuid AND g.active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
  END IF;

  -- Intervalo efectivo: token > papel mototv (2 s) > 15 s
  v_interval := tok.send_interval_seconds;
  IF v_interval IS NULL THEN
    SELECT CASE WHEN m.gps_role = 'mototv' THEN 2 END INTO v_interval
    FROM race_motos m WHERE m.token_id = tok.id LIMIT 1;
  END IF;
  v_interval := COALESCE(v_interval, 15);

  -- Vinculado a otro dispositivo y sin forzar → pedir confirmación
  IF tok.device_id IS NOT NULL AND tok.device_id <> p_device_id AND NOT p_force THEN
    RETURN QUERY SELECT tok.id, tok.bib_number::text, tok.participant_name,
                        tok.event_id::text, tok.device_id, tok.linked_at, true,
                        v_interval;
    RETURN;
  END IF;

  UPDATE gps_tokens g
  SET device_id = p_device_id, linked_at = now()
  WHERE g.id = tok.id;

  RETURN QUERY SELECT tok.id, tok.bib_number::text, tok.participant_name,
                      tok.event_id::text, p_device_id, now(), false,
                      v_interval;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.link_gps_token(text, text, boolean) TO anon, authenticated;
