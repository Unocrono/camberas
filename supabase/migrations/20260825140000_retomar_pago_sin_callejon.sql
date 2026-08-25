-- Que una inscripción a medias deje de ser un callejón sin salida
--
-- El control de duplicados miraba solo el email (o el usuario) y la carrera,
-- sin mirar el estado: una inscripción pendiente y sin pagar bloqueaba para
-- siempre a esa persona en esa carrera, aunque la plaza llevara horas libre.
-- El invitado se quedaba con "Este email ya tiene una inscripción para esta
-- carrera" y sin ninguna puerta. En el camino con cuenta era peor todavía,
-- porque el .maybeSingle() reventaba en cuanto había más de una fila.
--
-- La regla vive aquí, en una sola función, porque los dos caminos
-- (guest-register y RaceDetail) tienen que decidir exactamente lo mismo.

-- ─────────────────────────────────────────────────────────────────────────
-- Token del enlace para retomar el pago de una inscripción suelta a medias.
-- Lo crea al momento si no existía: no hay que esperar al robot horario.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.token_recuperacion_inscripcion(p_registration_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg    registrations%ROWTYPE;
  v_cierra timestamptz;
  v_fecha  date;
  v_token  uuid;
BEGIN
  SELECT * INTO v_reg FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Solo tiene sentido para lo que de verdad quedó a medias en la pasarela
  IF v_reg.payment_status <> 'pending'
     OR v_reg.status <> 'pending'
     OR v_reg.source <> 'gateway' THEN
    RETURN NULL;
  END IF;

  -- Los lotes de equipo tienen su propia fila, por equipo y recorrido:
  -- aquí solo se atienden las sueltas
  IF v_reg.team_id IS NOT NULL THEN
    SELECT token INTO v_token
    FROM recuperacion_pagos
    WHERE tipo = 'equipo'
      AND team_id = v_reg.team_id
      AND race_distance_id = v_reg.race_distance_id;
    RETURN v_token;
  END IF;

  SELECT token INTO v_token
  FROM recuperacion_pagos
  WHERE tipo = 'individual' AND registration_id = p_registration_id;
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  SELECT d.registration_closes, ra.date
    INTO v_cierra, v_fecha
  FROM race_distances d
  JOIN races ra ON ra.id = d.race_id
  WHERE d.id = v_reg.race_distance_id;

  INSERT INTO recuperacion_pagos (
    tipo, race_id, race_distance_id, registration_id, email, nombre,
    abandonada_at, caduca_at
  )
  VALUES (
    'individual', v_reg.race_id, v_reg.race_distance_id, v_reg.id,
    COALESCE(v_reg.email, ''), v_reg.first_name,
    v_reg.created_at,
    LEAST(v_reg.created_at + interval '7 days', COALESCE(v_cierra, v_fecha::timestamptz))
  )
  ON CONFLICT DO NOTHING
  RETURNING token INTO v_token;

  -- Si otra llamada se adelantó, el INSERT no devuelve nada: se lee la suya
  IF v_token IS NULL THEN
    SELECT token INTO v_token
    FROM recuperacion_pagos
    WHERE tipo = 'individual' AND registration_id = p_registration_id;
  END IF;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.token_recuperacion_inscripcion(uuid) IS
  'Token del enlace para retomar el pago de una inscripción suelta a medias. La crea si no existía.';

-- Solo servidor: con un id de inscripción suelto se podría mirar la ficha de
-- un tercero, así que quien decide es resolver_inscripcion_previa
REVOKE EXECUTE ON FUNCTION public.token_recuperacion_inscripcion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.token_recuperacion_inscripcion(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- ¿Puede esta persona inscribirse en esta carrera?
--
-- Devuelve uno de tres veredictos:
--   libre      — adelante
--   duplicada  — ya está dentro (o pendiente por una vía sin pasarela)
--   retomar    — empezó y no pagó el MISMO recorrido: se le da el enlace
--
-- Efecto lateral deliberado: si lo que dejó a medias era OTRO recorrido de
-- la misma carrera, se cancela. No retiene plaza ni dinero, y quien cambia
-- de idea tiene derecho a cambiarse sin pedir permiso a nadie.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolver_inscripcion_previa(
  p_race_id          uuid,
  p_race_distance_id uuid,
  p_email            text DEFAULT NULL,
  p_user_id          uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_misma   registrations%ROWTYPE;
  v_token   uuid;
  v_otras   integer;
  v_pagadas integer;
BEGIN
  -- Con sesión, solo sobre uno mismo. Sin sesión solo llega service_role,
  -- porque anon no tiene EXECUTE.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('verdicto', 'denegado');
  END IF;

  -- Con sesión, el email NO se usa como criterio. Si no, cualquiera podría
  -- pasar su propio p_user_id y el email de otro, y llevarse su token de
  -- recuperación — o cancelarle la inscripción a medias con el UPDATE de
  -- más abajo. Buscar por email queda para guest-register (service role).
  IF auth.uid() IS NOT NULL THEN
    p_email := NULL;
  END IF;

  IF p_email IS NULL AND p_user_id IS NULL THEN
    RETURN jsonb_build_object('verdicto', 'denegado');
  END IF;

  -- Las suyas en esta carrera que siguen vivas (una cancelada no bloquea:
  -- si se dio de baja y quiere volver, que vuelva)
  SELECT count(*) FILTER (
           WHERE r.payment_status IN ('paid', 'not_required')
         )
    INTO v_pagadas
  FROM registrations r
  WHERE r.race_id = p_race_id
    AND r.status IS DISTINCT FROM 'cancelled'
    AND (
      (p_user_id IS NOT NULL AND r.user_id = p_user_id)
      OR
      (p_email IS NOT NULL AND lower(r.email) = lower(p_email))
    );

  -- Ya está dentro de verdad
  IF v_pagadas > 0 THEN
    RETURN jsonb_build_object('verdicto', 'duplicada');
  END IF;

  -- ¿Dejó a medias el MISMO recorrido? Entonces no es un duplicado, es un
  -- pago sin terminar
  SELECT * INTO v_misma
  FROM registrations r
  WHERE r.race_id = p_race_id
    AND r.race_distance_id = p_race_distance_id
    AND r.status = 'pending'
    AND r.payment_status = 'pending'
    AND r.source = 'gateway'
    AND (
      (p_user_id IS NOT NULL AND r.user_id = p_user_id)
      OR
      (p_email IS NOT NULL AND lower(r.email) = lower(p_email))
    )
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_token := public.token_recuperacion_inscripcion(v_misma.id);
    IF v_token IS NOT NULL THEN
      RETURN jsonb_build_object('verdicto', 'retomar', 'token', v_token);
    END IF;
    -- Sin token no hay puerta que ofrecer: mejor el aviso de siempre
    RETURN jsonb_build_object('verdicto', 'duplicada');
  END IF;

  -- Lo que dejó a medias era OTRO recorrido: se cancela y sigue su camino.
  -- No retenía plaza (la reserva de checkout dura 30 min) ni dinero.
  UPDATE registrations r
  SET status = 'cancelled'
  WHERE r.race_id = p_race_id
    AND r.race_distance_id IS DISTINCT FROM p_race_distance_id
    AND r.status = 'pending'
    AND r.payment_status = 'pending'
    AND r.source = 'gateway'
    AND r.team_id IS NULL          -- los lotes de equipo no se tocan aquí
    AND (
      (p_user_id IS NOT NULL AND r.user_id = p_user_id)
      OR
      (p_email IS NOT NULL AND lower(r.email) = lower(p_email))
    );

  -- ¿Queda alguna viva por otra vía (alta manual, importación)? Ahí no hay
  -- pasarela que retomar: es el duplicado de siempre
  SELECT count(*) INTO v_otras
  FROM registrations r
  WHERE r.race_id = p_race_id
    AND r.status IS DISTINCT FROM 'cancelled'
    AND (
      (p_user_id IS NOT NULL AND r.user_id = p_user_id)
      OR
      (p_email IS NOT NULL AND lower(r.email) = lower(p_email))
    );

  IF v_otras > 0 THEN
    RETURN jsonb_build_object('verdicto', 'duplicada');
  END IF;

  RETURN jsonb_build_object('verdicto', 'libre');
END;
$$;

COMMENT ON FUNCTION public.resolver_inscripcion_previa(uuid, uuid, text, uuid) IS
  'Veredicto sobre inscripciones previas: libre, duplicada o retomar (con token).';

-- Sin REVOKE, el GRANT implícito a PUBLIC dejaría entrar a anon, que aquí
-- llega con auth.uid() NULL: podría preguntar por cualquier email y cancelar
-- inscripciones ajenas con el UPDATE de arriba.
REVOKE EXECUTE ON FUNCTION public.resolver_inscripcion_previa(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_inscripcion_previa(uuid, uuid, text, uuid)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Cerrar las funciones de robot de la migración anterior
--
-- CREATE FUNCTION concede EXECUTE a PUBLIC por defecto, y `anon` está dentro
-- de PUBLIC. Sin esto, cualquiera con la clave anónima (que va en el propio
-- navegador) podría llamar a avisos_pago_pendientes() y llevarse la lista de
-- correos de quien dejó una inscripción a medias, o silenciar los avisos con
-- marcar_aviso_pago(). Son funciones de servidor: solo service_role.
--
-- Va aquí y no en la migración anterior para que valga igual si aquella ya
-- se había aplicado. Ejecutarlo dos veces no hace daño.
--
-- OJO con el patrón: REVOKE FROM PUBLIC sin un GRANT explícito detrás deja
-- fuera también a authenticated. Cada REVOKE de abajo lleva el suyo.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.avisos_pago_pendientes() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.avisos_pago_pendientes() TO service_role;

REVOKE EXECUTE ON FUNCTION public.marcar_aviso_pago(uuid, integer, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.marcar_aviso_pago(uuid, integer, numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cerrar_recuperaciones_pagadas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cerrar_recuperaciones_pagadas() TO service_role;

-- El resumen del organizador ya filtra por rol dentro, pero no hay motivo
-- para que anon pueda ni preguntarlo
REVOKE EXECUTE ON FUNCTION public.resumen_recuperacion_pagos(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resumen_recuperacion_pagos(uuid) TO authenticated;

-- Estas dos SÍ son públicas a propósito: plazas_libres no dice nada que no
-- esté ya en la ficha de la carrera, y recuperacion_pago_info es la que abre
-- quien recibe el correo, tenga cuenta o no
GRANT EXECUTE ON FUNCTION public.plazas_libres(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recuperacion_pago_info(uuid) TO anon, authenticated;
