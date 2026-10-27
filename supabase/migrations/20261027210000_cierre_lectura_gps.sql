-- ============================================================
-- CIERRE DE LA LECTURA DIRECTA DEL GPS — FASE 2 de 2 (27-oct-2026)
--
-- Requisito: camberas.com sirve ya la web de la fase 1 (20261027200000):
-- mapa_publico, recorrido_publico, pantalla_posiciones, posiciones_motos,
-- get_latest_gps_positions y recorrido_privado. La web vieja leía las
-- tablas a pelo y con esto se queda sin datos.
--
-- 1. gps_positions deja de leerse con la clave anónima. OJO: no basta con
--    quitar la política de lectura. La app sube con INSERT … ON CONFLICT
--    (token_id, "timestamp") DO NOTHING y el ON CONFLICT exige que la fila
--    nueva pase una política SELECT: sin ninguna, TODAS las subidas fallan
--    con 42501 (ensayado). La política nueva solo deja pasar la fila que se
--    está subiendo (created_at = now() de la propia transacción) y anon solo
--    conserva las dos columnas del arbitraje.
-- 2. El móvil vinculado es la llave. Con gps_positions cerrada el device_id
--    deja de ser visible y pasa a valer de contraseña: una posición o un SOS
--    solo entran con el device_id del token. Compatible con la app 1.1.2:
--    82.363 posiciones de 30 días, todas con device_id y 0 discrepancias.
--    El SOS de la 1.1.2 no lo manda: se acepta sin él hasta la 1.1.3.
-- 3. gps_tokens: anon conserva lo que necesita la comprobación de la subida
--    (id, active, es_organizacion, event_id); pierde nombre y dorsal. El
--    organizador lee los de sus carreras (el admin ya tenía su política).
-- 4. detallar_sos ya no se fía del id público: sin el device_id solo deja
--    una nota «[sin verificar]» y el aviso sigue abierto.
-- 5. get_live_gps_positions solo para quien gestiona la carrera; fuera de
--    anon las RPC que daban recorridos por id y la repetición con batería.
-- ============================================================

-- ── 2. La llave: el móvil vinculado ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gps_dispositivo_ok(p_token_id uuid, p_device_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
  SELECT EXISTS (SELECT 1 FROM gps_tokens WHERE id = p_token_id AND device_id = p_device_id)
$f$;

-- Las políticas se evalúan con los permisos de quien sube: anon necesita EXECUTE
REVOKE EXECUTE ON FUNCTION public.gps_dispositivo_ok(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.gps_dispositivo_ok(uuid, text) TO anon, authenticated;

-- ── 1. gps_positions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read gps_positions" ON public.gps_positions;
DROP POLICY IF EXISTS "Solo la fila que se esta subiendo" ON public.gps_positions;
CREATE POLICY "Solo la fila que se esta subiendo" ON public.gps_positions
  FOR SELECT TO anon, authenticated
  USING (created_at >= now());

DROP POLICY IF EXISTS "Posicion solo desde el movil vinculado" ON public.gps_positions;
CREATE POLICY "Posicion solo desde el movil vinculado" ON public.gps_positions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.gps_dispositivo_ok(token_id, device_id));

REVOKE SELECT ON public.gps_positions FROM anon;
GRANT SELECT (token_id, "timestamp") ON public.gps_positions TO anon;

-- ── 3. gps_tokens ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read gps_tokens rows" ON public.gps_tokens;
DROP POLICY IF EXISTS "La subida comprueba el token" ON public.gps_tokens;
CREATE POLICY "La subida comprueba el token" ON public.gps_tokens
  FOR SELECT TO anon
  USING (true);
REVOKE SELECT (participant_name, bib_number, linked_at, created_at) ON public.gps_tokens FROM anon;

DROP POLICY IF EXISTS "Organizador lee los tokens de sus carreras" ON public.gps_tokens;
CREATE POLICY "Organizador lee los tokens de sus carreras" ON public.gps_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM race_distances d JOIN races r ON r.id = d.race_id
                  WHERE d.id = gps_tokens.event_id AND r.organizer_id = auth.uid()));

-- ── 2b. SOS: con device_id, el del token; sin él (app 1.1.2), se acepta ──────
ALTER TABLE public.gps_sos_alerts ADD COLUMN IF NOT EXISTS device_id text;
DROP POLICY IF EXISTS "SOS solo desde el movil vinculado" ON public.gps_sos_alerts;
CREATE POLICY "SOS solo desde el movil vinculado" ON public.gps_sos_alerts
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (device_id IS NULL OR public.gps_dispositivo_ok(token_id, device_id));

-- ── 4. detallar_sos ──────────────────────────────────────────────────────────
-- Cambia la firma (p_device_id): se borra la de tres argumentos para que el
-- API no tenga dos candidatas. La app 1.1.2 llama con tres y cae en esta.
DROP FUNCTION IF EXISTS public.detallar_sos(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.detallar_sos(p_token_id uuid, p_motivo text DEFAULT NULL,
                                               p_falsa boolean DEFAULT false, p_device_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_id uuid;
  v_nota text := left(nullif(trim(p_motivo), ''), 300);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gps_tokens WHERE id = p_token_id AND active IS TRUE) THEN
    RAISE EXCEPTION 'Token no válido';
  END IF;
  SELECT id INTO v_id FROM gps_sos_alerts
   WHERE token_id = p_token_id AND resolved_at IS NULL
   ORDER BY triggered_at DESC NULLS LAST LIMIT 1;
  IF v_id IS NULL THEN RETURN false; END IF;

  IF p_device_id IS NOT NULL AND gps_dispositivo_ok(p_token_id, p_device_id) THEN
    -- El móvil vinculado: puede explicar el aviso y cerrarlo como falsa alarma
    UPDATE gps_sos_alerts
       SET notes = COALESCE(v_nota, notes),
           false_alarm = COALESCE(p_falsa, false),
           resolved_at = CASE WHEN COALESCE(p_falsa, false) THEN now() ELSE resolved_at END
     WHERE id = v_id;
  ELSE
    -- Sin el móvil (app 1.1.2, o cualquiera que sepa el id del token): solo
    -- una nota marcada, y el aviso sigue abierto para la organización
    UPDATE gps_sos_alerts
       SET notes = left(concat_ws(' · ', notes, '[sin verificar] '
                   || COALESCE(v_nota, CASE WHEN p_falsa THEN 'el móvil dice que fue una falsa alarma' END)), 2000)
     WHERE id = v_id AND (v_nota IS NOT NULL OR COALESCE(p_falsa, false));
  END IF;
  RETURN true;
END
$f$;

REVOKE EXECUTE ON FUNCTION public.detallar_sos(uuid, text, boolean, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.detallar_sos(uuid, text, boolean, text) TO anon, authenticated;

-- ── 5. get_live_gps_positions: solo quien gestiona la carrera ────────────────
-- Por sustitución sobre la versión viva (CLAUDE.md). El público usa
-- mapa_publico; la carpa, pantalla_posiciones; motos y panel, el resto.
DO $$
DECLARE
  v_def text; v_pat text; v_n int;
  v_viejo text := $v$BEGIN
  RETURN QUERY$v$;
  v_nuevo text := $n$BEGIN
  -- Nombre completo y batería: solo para quien gestiona la carrera
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())) THEN
    RETURN;
  END IF;
  RETURN QUERY$n$;
BEGIN
  v_def := pg_get_functiondef('public.get_live_gps_positions(uuid, uuid)'::regprocedure);
  v_pat := regexp_replace(regexp_replace(v_viejo, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'get_live_gps_positions: el trozo aparece % veces (esperado 1)', v_n;
  END IF;
  EXECUTE regexp_replace(v_def, v_pat, replace(v_nuevo, '\', '\\'));
END $$;

REVOKE EXECUTE ON FUNCTION public.get_live_gps_positions(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_gps_positions(uuid, uuid) TO authenticated;

-- Recorridos por id del token y la repetición con batería: ya no los usa nadie
REVOKE EXECUTE ON FUNCTION public.get_event_participants_replay(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_token_track(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_token_track_full(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_registration_track_full(uuid, uuid) FROM anon, authenticated, PUBLIC;

-- gps_tracking (la tubería vieja, vacía) era legible por cualquiera
DROP POLICY IF EXISTS "Anyone can view GPS tracking data" ON public.gps_tracking;

-- ── Comprobaciones ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_live_gps_positions(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_event_participants_replay(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_token_track(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_token_track_full(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_registration_track_full(uuid, uuid)', 'EXECUTE')
     OR has_column_privilege('anon', 'public.gps_positions', 'lat', 'SELECT')
     OR has_column_privilege('anon', 'public.gps_positions', 'device_id', 'SELECT')
     OR has_column_privilege('anon', 'public.gps_tokens', 'participant_name', 'SELECT')
     OR has_column_privilege('anon', 'public.gps_tokens', 'device_id', 'SELECT') THEN
    RAISE EXCEPTION 'algo sigue abierto a anon';
  END IF;
  IF NOT (has_function_privilege('anon', 'public.detallar_sos(uuid, text, boolean, text)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.gps_dispositivo_ok(uuid, text)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.unlink_gps_token(uuid, text)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.link_gps_token(text, text, boolean)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.get_live_gps_positions(uuid, uuid)', 'EXECUTE')
          AND has_column_privilege('anon', 'public.gps_tokens', 'active', 'SELECT')
          AND has_column_privilege('anon', 'public.gps_positions', 'timestamp', 'SELECT')) THEN
    RAISE EXCEPTION 'falta un permiso que necesitan la app o el panel';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
