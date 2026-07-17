-- ============================================================================
-- Camberas Track (app móvil) ↔ mapa público — pipeline unificado y seguro
--
-- Contexto: el hardening del 15-16 jul revocó el acceso anon que usaba la app
-- camberas-track (INSERT en gps_positions/gps_sos_alerts, UPDATE en gps_tokens)
-- y el EXECUTE público de get_live_gps_positions (mapa público roto).
--
-- Esta migración restaura la funcionalidad SIN reabrir escrituras libres:
--  - La vinculación pasa por RPCs (link/unlink) autenticados por el token UUID.
--  - Los INSERT de la app exigen un token existente y activo (RLS).
--  - El mapa público vuelve a funcionar y ve AMBOS pipelines
--    (gps_tracking de dispositivos/web + gps_positions de la app).
--
-- Convención: gps_tokens.event_id = race_distances.id
-- ============================================================================

-- ── 1) Columnas nuevas en gps_positions (payload ampliado de la app) ────────
ALTER TABLE public.gps_positions
  ADD COLUMN IF NOT EXISTS bib_number text,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS heading real;

CREATE INDEX IF NOT EXISTS idx_gps_positions_token_ts
  ON public.gps_positions (token_id, "timestamp" DESC);

-- ── 2) Vinculación de dorsal vía RPC (sustituye el UPDATE directo de la app) ─
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
  needs_transfer boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  tok record;
BEGIN
  SELECT g.* INTO tok
  FROM gps_tokens g
  WHERE g.token = p_token AND g.active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token no válido o inactivo';
  END IF;

  -- Vinculado a otro dispositivo y sin forzar → pedir confirmación
  IF tok.device_id IS NOT NULL AND tok.device_id <> p_device_id AND NOT p_force THEN
    RETURN QUERY SELECT tok.id, tok.bib_number::text, tok.participant_name,
                        tok.event_id::text, tok.device_id, tok.linked_at, true;
    RETURN;
  END IF;

  UPDATE gps_tokens g
  SET device_id = p_device_id, linked_at = now()
  WHERE g.id = tok.id;

  RETURN QUERY SELECT tok.id, tok.bib_number::text, tok.participant_name,
                      tok.event_id::text, p_device_id, now(), false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.unlink_gps_token(
  p_token_id uuid,
  p_device_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  UPDATE gps_tokens g
  SET device_id = NULL, linked_at = NULL
  WHERE g.id = p_token_id AND g.device_id = p_device_id;
  RETURN FOUND;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.link_gps_token(text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_gps_token(uuid, text) TO anon, authenticated;

-- ── 3) INSERT de la app: permitido solo con token existente y activo ────────
-- El token UUID actúa como credencial (solo lo conoce el corredor vinculado).
DROP POLICY IF EXISTS "App inserts gps_positions (token válido)" ON public.gps_positions;
CREATE POLICY "App inserts gps_positions (token válido)"
  ON public.gps_positions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    token_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM gps_tokens t WHERE t.id = token_id AND t.active IS TRUE)
  );
GRANT INSERT ON public.gps_positions TO anon, authenticated;

DROP POLICY IF EXISTS "App inserts gps_sos_alerts (token válido)" ON public.gps_sos_alerts;
CREATE POLICY "App inserts gps_sos_alerts (token válido)"
  ON public.gps_sos_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    token_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM gps_tokens t WHERE t.id = token_id AND t.active IS TRUE)
  );
GRANT INSERT ON public.gps_sos_alerts TO anon, authenticated;

-- ── 4) Mapa público: RPC unificado (gps_tracking ∪ gps_positions) ───────────
DROP FUNCTION IF EXISTS public.get_live_gps_positions(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_live_gps_positions(
  p_race_id uuid,
  p_distance_id uuid DEFAULT NULL
)
RETURNS TABLE(
  gps_id uuid,
  registration_id uuid,
  latitude numeric,
  longitude numeric,
  gps_timestamp timestamptz,
  bib_number text,
  runner_name text,
  race_distance_id uuid,
  heading numeric,
  speed numeric,
  battery numeric,
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  -- Pipeline 1: dispositivos GPS / tracker web (gps_tracking)
  (
    SELECT DISTINCT ON (g.registration_id)
      g.id,
      g.registration_id,
      g.latitude,
      g.longitude,
      g."timestamp",
      r.bib_number::text,
      COALESCE(
        p.first_name || ' ' || COALESCE(p.last_name, ''),
        r.first_name || ' ' || COALESCE(r.last_name, ''),
        'Corredor'
      ),
      r.race_distance_id,
      g.heading::numeric,
      g.speed::numeric,
      g.battery_level::numeric,
      'device'::text
    FROM gps_tracking g
    JOIN registrations r ON r.id = g.registration_id
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE g.race_id = p_race_id
      AND (p_distance_id IS NULL OR r.race_distance_id = p_distance_id)
    ORDER BY g.registration_id, g."timestamp" DESC
  )
  UNION ALL
  -- Pipeline 2: app camberas-track (gps_positions, token = corredor)
  (
    SELECT DISTINCT ON (gp.token_id)
      gp.id,
      gp.token_id,
      gp.lat::numeric,
      gp.lng::numeric,
      gp."timestamp"::timestamptz,
      gt.bib_number::text,
      COALESCE(gt.participant_name, 'Corredor'),
      rd.id,
      gp.heading::numeric,
      gp.speed::numeric,
      gp.battery::numeric,
      'app'::text
    FROM gps_positions gp
    JOIN gps_tokens gt ON gt.id = gp.token_id
    JOIN race_distances rd ON rd.id::text = gt.event_id::text
    WHERE rd.race_id = p_race_id
      AND (p_distance_id IS NULL OR rd.id = p_distance_id)
      AND gp."timestamp"::timestamptz > now() - interval '24 hours'
    ORDER BY gp.token_id, gp."timestamp" DESC
  )
  ORDER BY bib_number NULLS LAST;
END;
$fn$;

-- El mapa es público por diseño: restaurar EXECUTE para visitantes anónimos.
-- (Solo expone posición, dorsal y nombre — datos de carrera en vivo.)
GRANT EXECUTE ON FUNCTION public.get_live_gps_positions(uuid, uuid) TO anon, authenticated;

-- ── 5) Alertas SOS para el mapa (solo datos operativos, últimas 24 h) ───────
CREATE OR REPLACE FUNCTION public.get_race_sos_alerts(p_race_id uuid)
RETURNS TABLE(
  id uuid,
  lat numeric,
  lng numeric,
  triggered_at timestamptz,
  resolved_at timestamptz,
  bib_number text,
  runner_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT a.id, a.lat::numeric, a.lng::numeric, a.triggered_at, a.resolved_at,
         gt.bib_number::text, COALESCE(gt.participant_name, 'Corredor')
  FROM gps_sos_alerts a
  JOIN gps_tokens gt ON gt.id = a.token_id
  JOIN race_distances rd ON rd.id::text = gt.event_id::text
  WHERE rd.race_id = p_race_id
    AND a.triggered_at > now() - interval '24 hours'
  ORDER BY a.triggered_at DESC;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_race_sos_alerts(uuid) TO anon, authenticated;

-- ── 6) Realtime para el mapa público ────────────────────────────────────────
DO $fn$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_positions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $fn$;

DO $fn$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_sos_alerts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $fn$;
