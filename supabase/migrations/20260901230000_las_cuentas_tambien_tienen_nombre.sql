-- Las inscripciones con cuenta llevan la identidad en el perfil — y media casa no lo sabía
--
-- Lo destapó el dorsal 33 de la Peña Prieta: una inscripción pagada por
-- pasarela que en la app del organizador salía SIN nombre. No le faltaba el
-- nombre: era una inscripción CON CUENTA. En ese flujo (RaceDetail.tsx:617)
-- la fila de registrations se crea sin nombre, sin email y sin DNI: la
-- identidad es user_id y los datos viven en profiles. El panel de admin lo
-- sabe y junta las dos fuentes; todo lo demás leía la fila a pelo:
--
--  1. get_organizer_race_summary pintaba el nombre vacío en /org.
--  2. El guarda de "ya pagó por otra fila" del robot de recuperación compara
--     email y DNI DE LA FILA: una fila pagada con cuenta era invisible para
--     él. Con el 33 el robot tuvo suerte (el carrito de julio de esa persona
--     tenía la caducidad vencida y no se le avisó), pero fue suerte, no
--     diseño: en la siguiente carrera le habría escrito "te falta pagar" a
--     alguien que ya corre.
--  3. Un carrito abandonado CON cuenta ni siquiera se podía avisar: la
--     detección exige email en la fila, y ahí está vacío.
--
-- Regla que deja esta migración: donde importe la identidad de una
-- inscripción se mira la fila Y el perfil, en ese orden (COALESCE). El
-- perfil nunca pisa lo que la fila ya diga.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. La detección de pagos a medias, con las cuentas visibles en los dos
--    lados: el carrito con cuenta ahora se puede avisar (email del perfil),
--    y la fila pagada con cuenta ahora cuenta como "ya está dentro".
--    (El resto de la lógica es la de 20260828130000, sin cambios.)
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.registrar_pagos_a_medias(p_ventana_horas integer DEFAULT 48)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_individuales integer := 0;
  v_equipos      integer := 0;
BEGIN
  -- Inscripciones sueltas
  INSERT INTO recuperacion_pagos (
    tipo, race_id, race_distance_id, registration_id, email, nombre, abandonada_at, caduca_at
  )
  SELECT 'individual', c.race_id, c.race_distance_id, c.id, c.email, c.nombre,
         c.created_at, c.caduca_at
  FROM (
    SELECT r.id, r.race_id, r.race_distance_id, r.created_at,
           -- Identidad: la fila primero, el perfil después
           COALESCE(NULLIF(r.email, ''), pr.email)           AS email,
           COALESCE(NULLIF(r.first_name, ''), pr.first_name) AS nombre,
           -- Vivo al menos 7 dias desde la deteccion, nunca mas alla del
           -- cierre (la regla de la recuperacion tardia, 20260828130000)
           LEAST(
             GREATEST(r.created_at + interval '7 days', now() + interval '7 days'),
             COALESCE(d.registration_closes, ra.date::timestamptz)
           ) AS caduca_at
    FROM registrations r
    JOIN race_distances d  ON d.id  = r.race_distance_id
    JOIN races ra          ON ra.id = r.race_id
    LEFT JOIN profiles pr  ON pr.id = r.user_id
    WHERE r.payment_status = 'pending'
      AND r.status = 'pending'
      AND r.source = 'gateway'          -- nunca 'manual' ni 'external'
      AND r.team_id IS NULL
      AND COALESCE(NULLIF(r.email, ''), pr.email) IS NOT NULL
      AND NOT ra.es_demo                -- las de prueba, fuera
      AND r.created_at < now() - interval '30 minutes'
      AND r.created_at > now() - make_interval(hours => p_ventana_horas)
      AND ra.date >= current_date
      AND (d.registration_closes IS NULL OR d.registration_closes > now())
      -- Si esa persona YA esta dentro por otra fila, no se le escribe "te
      -- falta pagar": mentiria. Se la reconoce por email o por DNI, mirando
      -- fila Y perfil en los dos lados (una inscripcion con cuenta no lleva
      -- ni email ni DNI en la fila).
      AND NOT EXISTS (
        SELECT 1
        FROM registrations h
        LEFT JOIN profiles hp ON hp.id = h.user_id
        WHERE h.race_id = r.race_id
          AND h.id <> r.id
          AND h.status IS DISTINCT FROM 'cancelled'
          AND h.payment_status IN ('paid', 'not_required')
          AND (
            lower(COALESCE(NULLIF(h.email, ''), hp.email))
              = lower(COALESCE(NULLIF(r.email, ''), pr.email))
            OR (
              COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport, '') <> ''
              AND upper(regexp_replace(COALESCE(NULLIF(h.dni_passport, ''), hp.dni_passport, ''), '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport), '[^A-Za-z0-9]', '', 'g'))
            )
          )
      )
  ) c
  WHERE c.caduca_at > now()
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_individuales = ROW_COUNT;

  -- Lotes de equipo: paga el capitán, así que el aviso va a su perfil
  -- (este lado ya miraba profiles; queda igual)
  INSERT INTO recuperacion_pagos (
    tipo, race_id, race_distance_id, team_id, email, nombre, abandonada_at, caduca_at
  )
  SELECT 'equipo', l.race_id, l.race_distance_id, l.team_id, p.email,
         COALESCE(p.first_name, t.name), l.abandonada_at, l.caduca_at
  FROM (
    SELECT r.team_id, r.race_distance_id, r.race_id,
           min(r.created_at) AS abandonada_at,
           LEAST(
             GREATEST(min(r.created_at) + interval '7 days', now() + interval '7 days'),
             COALESCE(max(d.registration_closes), max(ra.date)::timestamptz)
           ) AS caduca_at
    FROM registrations r
    JOIN race_distances d ON d.id = r.race_distance_id
    JOIN races ra          ON ra.id = r.race_id
    WHERE r.payment_status = 'pending'
      AND r.status = 'pending'
      AND r.source = 'gateway'
      AND r.team_id IS NOT NULL
      AND NOT ra.es_demo                -- las de prueba, fuera
      AND r.created_at < now() - interval '30 minutes'
      AND r.created_at > now() - make_interval(hours => p_ventana_horas)
      AND ra.date >= current_date
      AND (d.registration_closes IS NULL OR d.registration_closes > now())
    GROUP BY r.team_id, r.race_distance_id, r.race_id
  ) l
  JOIN teams t    ON t.id = l.team_id
  JOIN profiles p ON p.id = t.captain_user_id
  WHERE p.email IS NOT NULL
    AND l.caduca_at > now()
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_equipos = ROW_COUNT;

  RETURN v_individuales + v_equipos;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Los avisos: el mismo guarda, tambien aqui. La deteccion solo protege
--    el momento del alta; si la persona paga POR OTRA FILA entre el aviso 1
--    y el aviso 2 (o su alta es anterior al guarda), el aviso 2 saldria
--    igualmente. Ahora se comprueba en el momento de enviar, que es donde
--    de verdad importa.
--    (El resto es la funcion de 20260825120000, sin cambios.)
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.avisos_pago_pendientes()
RETURNS TABLE (
  id             uuid,
  token          uuid,
  ronda          integer,
  tipo           text,
  email          text,
  nombre         text,
  race_name      text,
  race_slug      text,
  race_date      date,
  race_location  text,
  distance_name  text,
  team_name      text,
  n_corredores   integer,
  importe        numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rp.id,
    rp.token,
    (CASE WHEN rp.aviso_1_at IS NULL THEN 1 ELSE 2 END)::integer AS ronda,
    rp.tipo,
    rp.email,
    rp.nombre,
    ra.name,
    ra.slug,
    ra.date,
    ra.location,
    d.name,
    t.name,
    vivas.n,
    CASE rp.tipo
      WHEN 'individual' THEN (
        SELECT pi.amount FROM payment_intents pi
        WHERE pi.registration_id = rp.registration_id
        ORDER BY pi.created_at DESC LIMIT 1
      )
      ELSE (
        SELECT pi.amount FROM payment_intents pi
        WHERE pi.registration_id IS NULL
          AND EXISTS (
            SELECT 1 FROM payment_intent_items pii
            JOIN registrations r ON r.id = pii.registration_id
            WHERE pii.payment_intent_id = pi.id
              AND r.team_id = rp.team_id
              AND r.race_distance_id = rp.race_distance_id
          )
        ORDER BY pi.created_at DESC LIMIT 1
      )
    END
  FROM recuperacion_pagos rp
  JOIN races ra          ON ra.id = rp.race_id
  JOIN race_distances d  ON d.id  = rp.race_distance_id
  LEFT JOIN teams t      ON t.id  = rp.team_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n
    FROM registrations r
    WHERE r.payment_status = 'pending'
      AND r.status = 'pending'
      AND r.source = 'gateway'
      AND r.race_distance_id = rp.race_distance_id
      AND (
        (rp.tipo = 'individual' AND r.id = rp.registration_id)
        OR
        (rp.tipo = 'equipo' AND r.team_id = rp.team_id)
      )
  ) vivas
  WHERE rp.recuperado_at IS NULL
    AND rp.caduca_at > now()
    AND vivas.n > 0                                    -- sigue sin pagar
    -- ...esta fila. Pero si esa persona ya esta dentro POR OTRA fila de la
    -- misma carrera, "te falta pagar" seria mentira: ni aviso 1 ni aviso 2.
    -- Se mira fila Y perfil, porque las inscripciones con cuenta no llevan
    -- email ni DNI en la fila (el dorsal 33 de Pena Prieta).
    AND NOT EXISTS (
      SELECT 1
      FROM registrations r0
      LEFT JOIN profiles r0p ON r0p.id = r0.user_id
      JOIN registrations h   ON h.race_id = r0.race_id AND h.id <> r0.id
      LEFT JOIN profiles hp  ON hp.id = h.user_id
      WHERE rp.tipo = 'individual'
        AND r0.id = rp.registration_id
        AND h.status IS DISTINCT FROM 'cancelled'
        AND h.payment_status IN ('paid', 'not_required')
        AND (
          lower(COALESCE(NULLIF(h.email, ''), hp.email))
            = lower(COALESCE(NULLIF(r0.email, ''), r0p.email, rp.email))
          OR (
            COALESCE(NULLIF(r0.dni_passport, ''), r0p.dni_passport, '') <> ''
            AND upper(regexp_replace(COALESCE(NULLIF(h.dni_passport, ''), hp.dni_passport, ''), '[^A-Za-z0-9]', '', 'g'))
              = upper(regexp_replace(COALESCE(NULLIF(r0.dni_passport, ''), r0p.dni_passport), '[^A-Za-z0-9]', '', 'g'))
          )
        )
    )
    AND ra.date >= current_date
    AND (d.registration_closes IS NULL OR d.registration_closes > now())
    -- Que quepan: sin tope de plazas, o con sitio para todo el lote
    AND COALESCE(public.plazas_libres(rp.race_distance_id), vivas.n) >= vivas.n
    AND (
      (rp.aviso_1_at IS NULL AND now() >= rp.abandonada_at + interval '2 hours')
      OR
      (rp.aviso_1_at IS NOT NULL AND rp.aviso_2_at IS NULL
       AND now() >= rp.abandonada_at + interval '24 hours')
    )
  ORDER BY rp.abandonada_at;
$$;

REVOKE EXECUTE ON FUNCTION public.avisos_pago_pendientes() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.avisos_pago_pendientes() TO service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. El resumen del organizador: el nombre sale de la fila o, si la fila no
--    lo tiene (inscripcion con cuenta), del perfil. Igual que hace el panel
--    de admin. (El resto es la funcion de 20260826210000, sin cambios.)
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_organizer_race_summary(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_ok  boolean;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM races r
    WHERE r.id = p_race_id
      AND (r.organizer_id = v_uid OR public.has_role(v_uid, 'admin'::app_role))
  ) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'Sin permiso sobre esta carrera'; END IF;

  WITH reg AS (
    SELECT g.*,
      COALESCE(
        (SELECT pi.amount FROM payment_intents pi
          WHERE pi.registration_id = g.id AND pi.status = 'completed'
          ORDER BY pi.completed_at DESC NULLS LAST LIMIT 1),
        (SELECT pii.amount FROM payment_intent_items pii
           JOIN payment_intents pi ON pi.id = pii.payment_intent_id
          WHERE pii.registration_id = g.id AND pi.status = 'completed'
          ORDER BY pi.completed_at DESC NULLS LAST LIMIT 1)
      ) AS amt,
      COALESCE(
        (SELECT pi.completed_at FROM payment_intents pi
          WHERE pi.registration_id = g.id AND pi.status = 'completed'
          ORDER BY pi.completed_at DESC NULLS LAST LIMIT 1),
        (SELECT pi.completed_at FROM payment_intents pi
           JOIN payment_intent_items pii ON pii.payment_intent_id = pi.id
          WHERE pii.registration_id = g.id AND pi.status = 'completed'
          ORDER BY pi.completed_at DESC NULLS LAST LIMIT 1)
      ) AS pat
    FROM registrations g
    WHERE g.race_id = p_race_id
      AND g.status <> 'cancelled'
      AND g.payment_status IN ('paid', 'not_required')
  )
  SELECT jsonb_build_object(
    'total_registrations', (SELECT count(*) FROM reg),
    'paid_registrations',  (SELECT count(*) FROM reg WHERE payment_status = 'paid'),
    'pending_registrations', (SELECT count(*) FROM registrations g
                              WHERE g.race_id = p_race_id
                                AND g.status <> 'cancelled'
                                AND g.payment_status NOT IN ('paid', 'not_required')),
    'revenue_total',  (SELECT COALESCE(sum(amt), 0) FROM reg),
    'revenue_manual', (SELECT COALESCE(sum(importe_manual), 0) FROM reg),
    'registrations_today', (SELECT count(*) FROM reg WHERE created_at >= date_trunc('day', now())),
    'revenue_today', (SELECT COALESCE(sum(amt), 0) FROM reg WHERE pat >= date_trunc('day', now())),
    'by_distance', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'distance_id', d.id, 'name', d.name, 'distance_km', d.distance_km,
        'max_participants', d.max_participants,
        'count',   (SELECT count(*) FROM reg WHERE race_distance_id = d.id),
        'paid',    (SELECT count(*) FROM reg WHERE race_distance_id = d.id AND payment_status = 'paid'),
        'revenue', (SELECT COALESCE(sum(amt), 0) FROM reg WHERE race_distance_id = d.id)
      ) ORDER BY d.distance_km DESC NULLS LAST), '[]'::jsonb)
      FROM race_distances d WHERE d.race_id = p_race_id),
    'by_source', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source', src, 'count', cnt, 'paid', pd,
        'revenue', rev, 'revenue_manual', revm) ORDER BY src), '[]'::jsonb)
      FROM (
        SELECT COALESCE(source, 'manual') src,
               count(*) cnt,
               count(*) FILTER (WHERE payment_status = 'paid') pd,
               COALESCE(sum(amt), 0) rev,
               COALESCE(sum(importe_manual), 0) revm
        FROM reg GROUP BY COALESCE(source, 'manual')
      ) s),
    'last_registrations', (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
        -- La fila primero, el perfil despues: una inscripcion con cuenta no
        -- lleva el nombre en la fila (RaceDetail.tsx:617)
        SELECT COALESCE(NULLIF(r.first_name, ''), pr.first_name) AS first_name,
               COALESCE(NULLIF(r.last_name,  ''), pr.last_name)  AS last_name,
               r.created_at, r.payment_status, r.bib_number,
               r.source, d.name AS distance_name,
               COALESCE(r.amt, r.importe_manual) AS amount
        FROM reg r
        JOIN race_distances d ON d.id = r.race_distance_id
        LEFT JOIN profiles pr ON pr.id = r.user_id
        ORDER BY r.created_at DESC LIMIT 15) x)
  ) INTO v_res;

  RETURN v_res;
END;
$fn$;

COMMENT ON FUNCTION public.get_organizer_race_summary(uuid) IS
  'Resumen de una carrera para su organizador. revenue_total es SOLO pasarela; lo cobrado a mano va en revenue_manual. Los nombres salen de la fila o, si no, del perfil.';

REVOKE EXECUTE ON FUNCTION public.get_organizer_race_summary(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_organizer_race_summary(uuid) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Comprobacion. Debe devolver exactamente:
--
--   avisos_pago_pendientes     | f | f
--   get_organizer_race_summary | f | t
--   registrar_pagos_a_medias   | f | f
-- ═════════════════════════════════════════════════════════════════════════
SELECT p.proname                                                 AS funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('registrar_pagos_a_medias', 'avisos_pago_pendientes',
                    'get_organizer_race_summary')
ORDER BY p.proname;
