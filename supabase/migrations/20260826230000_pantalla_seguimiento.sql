-- Pantalla de seguimiento: el mapa de la carrera en una pantalla de la carpa
--
-- Una pantalla encendida seis horas en una carpa no es una persona con sesión:
-- es un PUESTO. Así que sigue el patrón de la casa, el mismo del cronometrador
-- y de los dorsales GPS (docs/tokens-camberas.md): se genera un token desde el
-- panel, la URL lleva ese token, y el dispositivo que la abre ES esa pantalla.
--
-- Lo que eso resuelve, y una sesión no:
--   · No hay que dejar la contraseña del organizador escrita en un portátil
--     que se queda solo en una carpa.
--   · Se le puede pasar la URL al locutor, al de la ambulancia o a una segunda
--     pantalla en meta sin dar acceso a la gestión de nada.
--   · Se revoca al acabar la carrera, de una en una y sin tocar contraseñas.
--   · Sobrevive a un reinicio: no hay sesión que caduque.
--
-- Lo que la pantalla VE, y el mapa público no: las alertas SOS CON dorsal y
-- nombre. Es una pantalla de organización, no un escaparate. Por eso no vale
-- reutilizar get_race_sos_alerts, que oculta la identidad a quien no gestiona
-- la carrera (ver 20260826180000).

CREATE TABLE IF NOT EXISTS public.pantallas_seguimiento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lo que va en la URL. No es el id: el id se puede listar, esto no.
  token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  race_id      uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  -- Para distinguirlas cuando hay varias: "Carpa", "Meta", "Locutor"
  nombre       text NOT NULL,
  activa       boolean NOT NULL DEFAULT true,
  -- Cuándo se vio por última vez: sirve para saber si la pantalla sigue viva
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pantallas_seguimiento IS
  'Puestos de pantalla para seguir una carrera. La URL lleva el token; no hay login.';

CREATE INDEX IF NOT EXISTS pantallas_seguimiento_race_idx
  ON public.pantallas_seguimiento (race_id);

ALTER TABLE public.pantallas_seguimiento ENABLE ROW LEVEL SECURITY;

-- La tabla no la lee nadie desde el cliente: la pantalla entra por RPC con su
-- token, y el panel por RPC con su sesión. Solo se deja mirar al gestor.
DROP POLICY IF EXISTS "pantallas_lectura_gestor" ON public.pantallas_seguimiento;
CREATE POLICY "pantallas_lectura_gestor"
  ON public.pantallas_seguimiento FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.races r
               WHERE r.id = pantallas_seguimiento.race_id AND r.organizer_id = auth.uid())
  );

-- ═════════════════════════════════════════════════════════════════════════
-- Crear, listar y revocar — desde el panel, con sesión
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generar_token_pantalla(
  p_race_id uuid,
  p_nombre  text DEFAULT 'Pantalla'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_token uuid;
  v_id    uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM races r
                     WHERE r.id = p_race_id AND r.organizer_id = auth.uid())) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera';
  END IF;

  INSERT INTO pantallas_seguimiento (race_id, nombre)
  VALUES (p_race_id, COALESCE(NULLIF(trim(p_nombre), ''), 'Pantalla'))
  RETURNING id, token INTO v_id, v_token;

  RETURN jsonb_build_object('id', v_id, 'token', v_token);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.generar_token_pantalla(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generar_token_pantalla(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pantallas_carrera(p_race_id uuid)
RETURNS TABLE (
  id           uuid,
  token        uuid,
  nombre       text,
  activa       boolean,
  last_seen_at timestamptz,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p.id, p.token, p.nombre, p.activa, p.last_seen_at, p.created_at
  FROM pantallas_seguimiento p
  WHERE p.race_id = p_race_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    )
  ORDER BY p.created_at;
$fn$;

REVOKE EXECUTE ON FUNCTION public.pantallas_carrera(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pantallas_carrera(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revocar_token_pantalla(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
BEGIN
  SELECT race_id INTO v_race FROM pantallas_seguimiento WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pantalla no encontrada'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM races r
                     WHERE r.id = v_race AND r.organizer_id = auth.uid())) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera';
  END IF;

  -- Se desactiva, no se borra: así queda constancia de qué pantallas hubo.
  UPDATE pantallas_seguimiento SET activa = false WHERE id = p_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.revocar_token_pantalla(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revocar_token_pantalla(uuid) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Lo que puede hacer la pantalla, con su token y sin sesión
-- ═════════════════════════════════════════════════════════════════════════

-- Qué carrera es. Además sella last_seen_at, que es como el panel sabe si la
-- pantalla sigue encendida.
CREATE OR REPLACE FUNCTION public.pantalla_contexto(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  p      pantallas_seguimiento%ROWTYPE;
  v_race races%ROWTYPE;
BEGIN
  SELECT * INTO p FROM pantallas_seguimiento WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  IF NOT p.activa THEN
    RETURN jsonb_build_object('estado', 'revocada');
  END IF;

  UPDATE pantallas_seguimiento SET last_seen_at = now() WHERE id = p.id;

  SELECT * INTO v_race FROM races WHERE id = p.race_id;

  RETURN jsonb_build_object(
    'estado',        'ok',
    'pantalla',      p.nombre,
    'race_id',       v_race.id,
    'race_name',     v_race.name,
    'race_slug',     v_race.slug,
    'race_date',     v_race.date,
    'race_location', v_race.location,
    'recorridos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'distance_km', d.distance_km)
                       ORDER BY d.display_order NULLS LAST, d.distance_km DESC)
      FROM race_distances d WHERE d.race_id = v_race.id
    ), '[]'::jsonb)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pantalla_contexto(uuid) TO anon, authenticated, service_role;

-- Las alertas SOS CON identidad. Esto es lo que distingue a la pantalla de
-- organización del mapa público: aquí sí hace falta saber quién es, porque
-- quien la mira es quien tiene que mandar la ayuda.
CREATE OR REPLACE FUNCTION public.pantalla_sos(p_token uuid)
RETURNS TABLE (
  id           uuid,
  lat          numeric,
  lng          numeric,
  triggered_at timestamptz,
  resolved_at  timestamptz,
  bib_number   text,
  runner_name  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
BEGIN
  SELECT race_id INTO v_race
  FROM pantallas_seguimiento
  WHERE token = p_token AND activa IS TRUE;
  IF v_race IS NULL THEN
    RETURN;  -- token invalido o revocado: ni una fila, y sin decir por que
  END IF;

  RETURN QUERY
  SELECT a.id, a.lat::numeric, a.lng::numeric, a.triggered_at, a.resolved_at,
         gt.bib_number::text, COALESCE(gt.participant_name, 'Corredor')
  FROM gps_sos_alerts a
  JOIN gps_tokens gt     ON gt.id = a.token_id
  JOIN race_distances rd ON rd.id::text = gt.event_id::text
  WHERE rd.race_id = v_race
    AND a.triggered_at > now() - interval '24 hours'
  ORDER BY a.triggered_at DESC;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pantalla_sos(uuid) TO anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Comprobacion. Deberia devolver exactamente esto:
--
--   generar_token_pantalla  | f | t
--   pantalla_contexto       | t | t
--   pantalla_sos            | t | t
--   pantallas_carrera       | f | t
--   revocar_token_pantalla  | f | t
-- ═════════════════════════════════════════════════════════════════════════
SELECT p.proname                                                 AS funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('generar_token_pantalla', 'pantallas_carrera',
                    'revocar_token_pantalla', 'pantalla_contexto', 'pantalla_sos')
ORDER BY p.proname;
