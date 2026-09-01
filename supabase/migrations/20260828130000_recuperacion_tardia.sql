-- Recuperación tardía: que los carritos viejos también puedan recibir su aviso
--
-- Lo destapó la Peña Prieta Skyrace: media docena de inscripciones de JULIO en
-- Pendiente/Pendiente, origen pasarela. Gente que relleno el formulario
-- entero, llego a "Continuar al pago" y se quedo ahi. Nadie les escribio nunca
-- —el email de confirmacion solo lo manda el webhook cuando el pago entra— y
-- lo mas probable es que se crean inscritos.
--
-- El robot de recuperacion existe justo para esto, pero a estas filas se les
-- escapaba por DOS sitios:
--
--  1. La ventana de deteccion (48 h por defecto) es un parametro y se puede
--     abrir a proposito: eso ya estaba previsto.
--  2. La caducidad del enlace se calculaba como creacion + 7 dias. Para un
--     carrito de julio eso es el pasado: el enlace NACIA MUERTO. Y peor aun
--     en token_recuperacion_inscripcion: quien volvia a intentar inscribirse
--     con su email era redirigido a "retomar el pago"... a un enlace caducado
--     de nacimiento, cuyo mensaje le decia "inscribete de nuevo", que le
--     devolvia al mismo enlace muerto. Un carrusel sin salida.
--
-- LA REGLA NUEVA, una sola para todo: un enlace de recuperacion vive al menos
-- 7 dias desde que se crea o se vuelve a pedir, y nunca mas alla del cierre de
-- inscripciones. En la operacion normal (deteccion una hora despues del
-- abandono) esto no cambia nada; en una pasada tardia deliberada, el enlace
-- nace vivo.
--
-- Y un guarda nuevo que tambien sale de la foto de Pena Prieta: hay quien
-- abandono el pago y SE VOLVIO A INSCRIBIR por otro lado (mismo nombre, otra
-- fila, esta pagada). A esa persona no hay que escribirle "te falta pagar":
-- ya esta dentro. Se detecta por email o por DNI normalizado contra las
-- inscripciones pagadas de la misma carrera.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. La deteccion
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
  SELECT 'individual', c.race_id, c.race_distance_id, c.id, c.email, c.first_name,
         c.created_at, c.caduca_at
  FROM (
    SELECT r.id, r.race_id, r.race_distance_id, r.email, r.first_name, r.created_at,
           -- Vivo al menos 7 dias desde la deteccion, nunca mas alla del
           -- cierre. El GREATEST es lo que permite la recuperacion tardia:
           -- sin el, un carrito de hace un mes recibia un enlace ya caducado.
           LEAST(
             GREATEST(r.created_at + interval '7 days', now() + interval '7 days'),
             COALESCE(d.registration_closes, ra.date::timestamptz)
           ) AS caduca_at
    FROM registrations r
    JOIN race_distances d ON d.id = r.race_distance_id
    JOIN races ra          ON ra.id = r.race_id
    WHERE r.payment_status = 'pending'
      AND r.status = 'pending'
      AND r.source = 'gateway'          -- nunca 'manual' ni 'external'
      AND r.team_id IS NULL
      AND r.email IS NOT NULL
      AND NOT ra.es_demo                -- las de prueba, fuera
      AND r.created_at < now() - interval '30 minutes'
      AND r.created_at > now() - make_interval(hours => p_ventana_horas)
      AND ra.date >= current_date
      AND (d.registration_closes IS NULL OR d.registration_closes > now())
      -- Si esa persona YA esta dentro por otra fila (se reinscribio y pago,
      -- que es lo que hacia la gente cuando el duplicado le cerraba el paso),
      -- no se le escribe "te falta pagar": mentiria. Se la reconoce por email
      -- o por DNI normalizado.
      AND NOT EXISTS (
        SELECT 1 FROM registrations h
        WHERE h.race_id = r.race_id
          AND h.id <> r.id
          AND h.status IS DISTINCT FROM 'cancelled'
          AND h.payment_status IN ('paid', 'not_required')
          AND (
            lower(h.email) = lower(r.email)
            OR (
              COALESCE(r.dni_passport, '') <> ''
              AND upper(regexp_replace(COALESCE(h.dni_passport, ''), '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(r.dni_passport, '[^A-Za-z0-9]', '', 'g'))
            )
          )
      )
  ) c
  WHERE c.caduca_at > now()
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_individuales = ROW_COUNT;

  -- Lotes de equipo: paga el capitán, así que el aviso va a su perfil
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

-- La regla de la casa: revocar por nombre de rol, no de PUBLIC
REVOKE EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. El enlace bajo demanda (quien vuelve a intentar inscribirse)
--
-- Antes: caduca = creacion + 7 dias, y si la fila ya existia se devolvia el
-- token viejo tal cual, muerto o vivo. El resultado con un carrito antiguo
-- era el carrusel: "retomar el pago" -> enlace caducado -> "inscribete de
-- nuevo" -> "retomar el pago" -> ...
--
-- Ahora: si la persona esta volviendo AHORA, el enlace se crea (o se revive)
-- con al menos 7 dias de vida. Y si el plazo de la carrera ya no da ni para
-- eso, se devuelve NULL: resolver_inscripcion_previa entonces responde
-- "duplicada" y la persona recibe el aviso de siempre en vez de una puerta
-- pintada en la pared.
-- ═════════════════════════════════════════════════════════════════════════
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
  v_caduca timestamptz;
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

  SELECT d.registration_closes, ra.date
    INTO v_cierra, v_fecha
  FROM race_distances d
  JOIN races ra ON ra.id = d.race_id
  WHERE d.id = v_reg.race_distance_id;

  v_caduca := LEAST(
    GREATEST(v_reg.created_at + interval '7 days', now() + interval '7 days'),
    COALESCE(v_cierra, v_fecha::timestamptz)
  );

  -- Si ni con la prorroga sale un enlace vivo (inscripciones cerradas o
  -- carrera pasada), no hay puerta que ofrecer: NULL, y quien llama ensena
  -- el aviso de duplicado de siempre.
  IF v_caduca <= now() THEN
    RETURN NULL;
  END IF;

  SELECT token INTO v_token
  FROM recuperacion_pagos
  WHERE tipo = 'individual' AND registration_id = p_registration_id;
  IF v_token IS NOT NULL THEN
    -- Revivir el enlace existente si estaba caducado: la persona esta
    -- volviendo ahora mismo, el enlace tiene que estar vivo ahora mismo
    UPDATE recuperacion_pagos
    SET caduca_at = GREATEST(caduca_at, v_caduca)
    WHERE tipo = 'individual'
      AND registration_id = p_registration_id
      AND recuperado_at IS NULL;
    RETURN v_token;
  END IF;

  INSERT INTO recuperacion_pagos (
    tipo, race_id, race_distance_id, registration_id, email, nombre,
    abandonada_at, caduca_at
  )
  VALUES (
    'individual', v_reg.race_id, v_reg.race_distance_id, v_reg.id,
    COALESCE(v_reg.email, ''), v_reg.first_name,
    v_reg.created_at, v_caduca
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

REVOKE EXECUTE ON FUNCTION public.token_recuperacion_inscripcion(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.token_recuperacion_inscripcion(uuid) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Comprobacion de permisos (deben quedar como estaban: solo robot)
-- ═════════════════════════════════════════════════════════════════════════
SELECT p.proname                                                 AS funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('registrar_pagos_a_medias', 'token_recuperacion_inscripcion')
ORDER BY p.proname;
