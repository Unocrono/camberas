-- Recogida de dorsales: la mesa es un PUESTO con token, no una persona
--
-- Decisión del 5-ago-2026: la entrega de dorsales NO va en el panel del
-- organizador — es la herramienta del personal de la mesa. Sigue el patrón
-- de la casa (docs/tokens-camberas.md), el mismo del cronometrador y de las
-- pantallas de seguimiento: el panel genera un token por mesa ("Carpa",
-- "Mesa 21K"), la URL /recogida/<token> se abre en la tablet del puesto, y
-- ese dispositivo ES esa mesa. Sin login, revocable al acabar.
--
-- Decisiones de diseño (22-sep-2026, con el usuario):
--  · Solo se entrega a inscripciones PAGADAS (paid o not_required). A la
--    pendiente la mesa le dice "pendiente de pago" y no deja entregar.
--  · Puede recoger OTRA persona anotando quién (nombre/DNI del recogedor):
--    uno del club recoge para varios, y queda escrito.
--  · Con escáner desde el primer día: cada inscripción lleva un token
--    (registrations.token_inscripcion) cuya URL /mi-dorsal/<token> es una
--    página del corredor con su QR en grande. El email de pago confirmado
--    llevará el enlace; en la mesa se escanea ese QR desde el móvil del
--    corredor. El QR lleva URL, no el UUID pelado — regla de la casa.
--
-- Identidad como siempre desde el dorsal 33: la fila primero, el perfil
-- después (las inscripciones con cuenta no llevan datos en la fila).

-- ═════════════════════════════════════════════════════════════════════════
-- 1. El token del corredor: uno por inscripción, desde ya
-- ═════════════════════════════════════════════════════════════════════════
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS token_inscripcion uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS registrations_token_inscripcion_uk
  ON public.registrations (token_inscripcion);

COMMENT ON COLUMN public.registrations.token_inscripcion IS
  'Token de la página /mi-dorsal del corredor (QR de recogida). No es el id: el id se puede listar, esto no.';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Las mesas de recogida (calcadas a pantallas_seguimiento)
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mesas_recogida (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  race_id      uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  activa       boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mesas_recogida IS
  'Puestos de entrega de dorsales. La URL lleva el token; no hay login.';

CREATE INDEX IF NOT EXISTS mesas_recogida_race_idx ON public.mesas_recogida (race_id);

ALTER TABLE public.mesas_recogida ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mesas_recogida_lectura_gestor" ON public.mesas_recogida;
CREATE POLICY "mesas_recogida_lectura_gestor"
  ON public.mesas_recogida FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.races r
               WHERE r.id = mesas_recogida.race_id AND r.organizer_id = auth.uid())
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Las entregas: una fila por dorsal entregado
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.entregas_dorsal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id         uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  -- UNIQUE: un dorsal se entrega una vez. Deshacer = borrar la fila.
  registration_id uuid NOT NULL UNIQUE REFERENCES public.registrations(id) ON DELETE CASCADE,
  mesa_id         uuid REFERENCES public.mesas_recogida(id) ON DELETE SET NULL,
  -- Si recoge otra persona en nombre del corredor: quién (nombre/DNI)
  recogido_por    text,
  entregado_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.entregas_dorsal IS
  'Dorsales entregados: qué inscripción, en qué mesa, cuándo y quién recogió.';

CREATE INDEX IF NOT EXISTS entregas_dorsal_race_idx ON public.entregas_dorsal (race_id);

ALTER TABLE public.entregas_dorsal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entregas_dorsal_lectura_gestor" ON public.entregas_dorsal;
CREATE POLICY "entregas_dorsal_lectura_gestor"
  ON public.entregas_dorsal FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.races r
               WHERE r.id = entregas_dorsal.race_id AND r.organizer_id = auth.uid())
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Crear, listar y revocar mesas — desde el panel, con sesión
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generar_token_mesa_recogida(
  p_race_id uuid,
  p_nombre  text DEFAULT 'Mesa'
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

  INSERT INTO mesas_recogida (race_id, nombre)
  VALUES (p_race_id, COALESCE(NULLIF(trim(p_nombre), ''), 'Mesa'))
  RETURNING id, token INTO v_id, v_token;

  RETURN jsonb_build_object('id', v_id, 'token', v_token);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.generar_token_mesa_recogida(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generar_token_mesa_recogida(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mesas_recogida_carrera(p_race_id uuid)
RETURNS TABLE (
  id           uuid,
  token        uuid,
  nombre       text,
  activa       boolean,
  last_seen_at timestamptz,
  created_at   timestamptz,
  entregados   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT m.id, m.token, m.nombre, m.activa, m.last_seen_at, m.created_at,
         (SELECT count(*)::integer FROM entregas_dorsal e WHERE e.mesa_id = m.id)
  FROM mesas_recogida m
  WHERE m.race_id = p_race_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    )
  ORDER BY m.created_at;
$fn$;

REVOKE EXECUTE ON FUNCTION public.mesas_recogida_carrera(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mesas_recogida_carrera(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revocar_token_mesa_recogida(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
BEGIN
  SELECT race_id INTO v_race FROM mesas_recogida WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa no encontrada'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM races r
                     WHERE r.id = v_race AND r.organizer_id = auth.uid())) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera';
  END IF;

  -- Se desactiva, no se borra: sus entregas son historial
  UPDATE mesas_recogida SET activa = false WHERE id = p_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.revocar_token_mesa_recogida(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revocar_token_mesa_recogida(uuid) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Lo que puede hacer la mesa, con su token y sin sesión
-- ═════════════════════════════════════════════════════════════════════════

-- Qué carrera es y cómo va la entrega. Sella last_seen_at (latido).
CREATE OR REPLACE FUNCTION public.recogida_contexto(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m      mesas_recogida%ROWTYPE;
  v_race races%ROWTYPE;
BEGIN
  SELECT * INTO m FROM mesas_recogida WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  IF NOT m.activa THEN
    RETURN jsonb_build_object('estado', 'revocada');
  END IF;

  UPDATE mesas_recogida SET last_seen_at = now() WHERE id = m.id;

  SELECT * INTO v_race FROM races WHERE id = m.race_id;

  RETURN jsonb_build_object(
    'estado',    'ok',
    'mesa',      m.nombre,
    'race_id',   v_race.id,
    'race_name', v_race.name,
    'race_date', v_race.date,
    -- Por recorrido: cuántos dorsales entregables hay y cuántos van entregados
    'resumen', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'recorrido', x.nombre, 'total', x.total, 'entregados', x.entregados)
             ORDER BY x.orden NULLS LAST, x.nombre)
      FROM (
        SELECT d.name AS nombre, d.display_order AS orden,
               count(r.id) FILTER (
                 WHERE r.status IS DISTINCT FROM 'cancelled'
                   AND r.payment_status IN ('paid', 'not_required')
               ) AS total,
               count(e.id) AS entregados
        FROM race_distances d
        LEFT JOIN registrations r ON r.race_distance_id = d.id
        LEFT JOIN entregas_dorsal e ON e.registration_id = r.id
        WHERE d.race_id = v_race.id
        GROUP BY d.name, d.display_order
      ) x
    ), '[]'::jsonb)
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.recogida_contexto(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recogida_contexto(uuid) TO anon, authenticated, service_role;

-- Buscar corredor: por dorsal, nombre, apellidos o DNI. Devuelve lo que la
-- mesa necesita para entregar y NADA más: ni email, ni teléfono, y el DNI
-- solo su final, para cotejar contra el documento físico.
CREATE OR REPLACE FUNCTION public.recogida_buscar(p_token uuid, p_texto text)
RETURNS TABLE (
  registration_id uuid,
  nombre          text,
  apellidos       text,
  dorsal          integer,
  recorrido       text,
  talla           text,
  dni_final       text,
  pago            text,
  edad_carrera    integer,
  entregado_at    timestamptz,
  entregado_mesa  text,
  recogido_por    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
  v_fecha date;
  v_txt  text := trim(COALESCE(p_texto, ''));
BEGIN
  SELECT m.race_id, ra.date INTO v_race, v_fecha
  FROM mesas_recogida m JOIN races ra ON ra.id = m.race_id
  WHERE m.token = p_token AND m.activa IS TRUE;
  IF v_race IS NULL OR v_txt = '' THEN
    RETURN;  -- token inválido/revocado o búsqueda vacía: ni una fila
  END IF;

  RETURN QUERY
  SELECT r.id,
         COALESCE(NULLIF(r.first_name, ''), pr.first_name, '')          AS nombre,
         COALESCE(NULLIF(r.last_name, ''),  pr.last_name,  '')          AS apellidos,
         r.bib_number                                                    AS dorsal,
         d.name                                                          AS recorrido,
         r.tshirt_size                                                   AS talla,
         right(regexp_replace(COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport, ''),
                              '[^A-Za-z0-9]', '', 'g'), 5)               AS dni_final,
         r.payment_status                                                AS pago,
         CASE WHEN COALESCE(r.birth_date, pr.birth_date) IS NOT NULL
              THEN EXTRACT(YEAR FROM age(v_fecha, COALESCE(r.birth_date, pr.birth_date)))::integer
         END                                                             AS edad_carrera,
         e.entregado_at,
         me.nombre                                                       AS entregado_mesa,
         e.recogido_por
  FROM registrations r
  JOIN race_distances d   ON d.id = r.race_distance_id
  LEFT JOIN profiles pr   ON pr.id = r.user_id
  LEFT JOIN entregas_dorsal e ON e.registration_id = r.id
  LEFT JOIN mesas_recogida me ON me.id = e.mesa_id
  WHERE r.race_id = v_race
    AND r.status IS DISTINCT FROM 'cancelled'
    AND (
      r.bib_number::text = v_txt
      OR COALESCE(NULLIF(r.first_name, ''), pr.first_name, '') ILIKE '%' || v_txt || '%'
      OR COALESCE(NULLIF(r.last_name, ''),  pr.last_name,  '') ILIKE '%' || v_txt || '%'
      OR upper(regexp_replace(COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport, ''), '[^A-Za-z0-9]', '', 'g'))
         LIKE '%' || upper(regexp_replace(v_txt, '[^A-Za-z0-9]', '', 'g')) || '%'
    )
  ORDER BY r.bib_number NULLS LAST,
           COALESCE(NULLIF(r.last_name, ''), pr.last_name, '')
  LIMIT 20;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.recogida_buscar(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recogida_buscar(uuid, text) TO anon, authenticated, service_role;

-- El escáner: el QR del corredor lleva la URL /mi-dorsal/<token_inscripcion>;
-- la mesa manda ese token y recibe la misma ficha que en la búsqueda
CREATE OR REPLACE FUNCTION public.recogida_por_qr(p_token uuid, p_token_inscripcion uuid)
RETURNS TABLE (
  registration_id uuid,
  nombre          text,
  apellidos       text,
  dorsal          integer,
  recorrido       text,
  talla           text,
  dni_final       text,
  pago            text,
  edad_carrera    integer,
  entregado_at    timestamptz,
  entregado_mesa  text,
  recogido_por    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
  v_fecha date;
BEGIN
  SELECT m.race_id, ra.date INTO v_race, v_fecha
  FROM mesas_recogida m JOIN races ra ON ra.id = m.race_id
  WHERE m.token = p_token AND m.activa IS TRUE;
  IF v_race IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id,
         COALESCE(NULLIF(r.first_name, ''), pr.first_name, ''),
         COALESCE(NULLIF(r.last_name, ''),  pr.last_name,  ''),
         r.bib_number,
         d.name,
         r.tshirt_size,
         right(regexp_replace(COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport, ''),
                              '[^A-Za-z0-9]', '', 'g'), 5),
         r.payment_status,
         CASE WHEN COALESCE(r.birth_date, pr.birth_date) IS NOT NULL
              THEN EXTRACT(YEAR FROM age(v_fecha, COALESCE(r.birth_date, pr.birth_date)))::integer
         END,
         e.entregado_at,
         me.nombre,
         e.recogido_por
  FROM registrations r
  JOIN race_distances d   ON d.id = r.race_distance_id
  LEFT JOIN profiles pr   ON pr.id = r.user_id
  LEFT JOIN entregas_dorsal e ON e.registration_id = r.id
  LEFT JOIN mesas_recogida me ON me.id = e.mesa_id
  WHERE r.token_inscripcion = p_token_inscripcion
    AND r.race_id = v_race            -- un QR de otra carrera no abre ficha aquí
    AND r.status IS DISTINCT FROM 'cancelled';
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.recogida_por_qr(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recogida_por_qr(uuid, uuid) TO anon, authenticated, service_role;

-- Entregar. Las reglas duras se comprueban AQUÍ, no en el cliente:
-- solo pagadas (paid/not_required), no canceladas, y una sola vez.
CREATE OR REPLACE FUNCTION public.recogida_entregar(
  p_token           uuid,
  p_registration_id uuid,
  p_recogido_por    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m     mesas_recogida%ROWTYPE;
  v_reg registrations%ROWTYPE;
BEGIN
  SELECT * INTO m FROM mesas_recogida WHERE token = p_token AND activa IS TRUE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'mesa_revocada');
  END IF;

  SELECT * INTO v_reg FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND OR v_reg.race_id <> m.race_id THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  IF v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object('estado', 'cancelada');
  END IF;
  IF v_reg.payment_status NOT IN ('paid', 'not_required') THEN
    RETURN jsonb_build_object('estado', 'pendiente_pago');
  END IF;

  INSERT INTO entregas_dorsal (race_id, registration_id, mesa_id, recogido_por)
  VALUES (m.race_id, v_reg.id, m.id, NULLIF(trim(COALESCE(p_recogido_por, '')), ''))
  ON CONFLICT (registration_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Ya estaba entregado: se dice cuándo y dónde
    RETURN (
      SELECT jsonb_build_object(
        'estado', 'ya_entregada',
        'entregado_at', e.entregado_at,
        'mesa', me.nombre,
        'recogido_por', e.recogido_por)
      FROM entregas_dorsal e
      LEFT JOIN mesas_recogida me ON me.id = e.mesa_id
      WHERE e.registration_id = v_reg.id
    );
  END IF;

  RETURN jsonb_build_object('estado', 'ok', 'dorsal', v_reg.bib_number);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.recogida_entregar(uuid, uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recogida_entregar(uuid, uuid, text) TO anon, authenticated, service_role;

-- Deshacer: en una mesa con cola se pulsa mal. Cualquier mesa activa de la
-- misma carrera puede deshacer (el error se descubre en otra mesa a veces).
CREATE OR REPLACE FUNCTION public.recogida_deshacer(p_token uuid, p_registration_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
  v_n    integer;
BEGIN
  SELECT race_id INTO v_race FROM mesas_recogida
  WHERE token = p_token AND activa IS TRUE;
  IF v_race IS NULL THEN RETURN false; END IF;

  DELETE FROM entregas_dorsal
  WHERE registration_id = p_registration_id AND race_id = v_race;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.recogida_deshacer(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recogida_deshacer(uuid, uuid) TO anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. La página del corredor: /mi-dorsal/<token>. Lo justo para la ficha y
--    el QR; ni email, ni DNI, ni teléfono.
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mi_dorsal_info(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg  registrations%ROWTYPE;
  v_race races%ROWTYPE;
  v_dist race_distances%ROWTYPE;
  v_nombre text;
  v_ent  entregas_dorsal%ROWTYPE;
BEGIN
  SELECT * INTO v_reg FROM registrations WHERE token_inscripcion = p_token;
  IF NOT FOUND OR v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_race FROM races          WHERE id = v_reg.race_id;
  SELECT * INTO v_dist FROM race_distances WHERE id = v_reg.race_distance_id;

  SELECT COALESCE(NULLIF(v_reg.first_name, ''), p.first_name, 'Corredor')
    INTO v_nombre
  FROM (SELECT 1) unused
  LEFT JOIN profiles p ON p.id = v_reg.user_id;

  SELECT * INTO v_ent FROM entregas_dorsal WHERE registration_id = v_reg.id;

  RETURN jsonb_build_object(
    'estado',        CASE WHEN v_reg.payment_status IN ('paid', 'not_required')
                          THEN 'ok' ELSE 'pendiente_pago' END,
    'nombre',        v_nombre,
    'dorsal',        v_reg.bib_number,
    'race_name',     v_race.name,
    'race_date',     v_race.date,
    'race_location', v_race.location,
    'recorrido',     v_dist.name,
    'entregado',     v_ent.id IS NOT NULL,
    'entregado_at',  v_ent.entregado_at
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.mi_dorsal_info(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mi_dorsal_info(uuid) TO anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Comprobacion. Debe devolver exactamente:
--
--   generar_token_mesa_recogida | f | t
--   mesas_recogida_carrera      | f | t
--   mi_dorsal_info              | t | t
--   recogida_buscar             | t | t
--   recogida_contexto           | t | t
--   recogida_deshacer           | t | t
--   recogida_entregar           | t | t
--   recogida_por_qr             | t | t
--   revocar_token_mesa_recogida | f | t
-- ═════════════════════════════════════════════════════════════════════════
SELECT p.proname                                                 AS funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('generar_token_mesa_recogida', 'mesas_recogida_carrera',
                    'revocar_token_mesa_recogida', 'recogida_contexto',
                    'recogida_buscar', 'recogida_por_qr', 'recogida_entregar',
                    'recogida_deshacer', 'mi_dorsal_info')
ORDER BY p.proname;
