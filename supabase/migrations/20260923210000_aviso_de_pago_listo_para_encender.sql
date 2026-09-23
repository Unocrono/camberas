-- ============================================================
-- AVISO DE PAGO A MEDIAS: arreglos antes de encender el robot (23-sep-2026)
--
-- El robot recuperar-pagos nunca se programó (no hay job en cron.job). Antes
-- de encenderlo (cron.sql, aparte) se corrige lo que haría que escribiera
-- mal o a quien no debe:
--
--  1. token_recuperacion_inscripcion (la fila que se crea cuando el corredor
--     vuelve y reintenta) guardaba email '' para las inscripciones hechas con
--     cuenta, y nada lo reparaba: el robot mandaría a '' una y otra vez.
--     Ahora toma el email de la cuenta o del perfil, y el nombre del perfil.
--  2. Las filas que ya se guardaron con email '' se rellenan.
--  3. avisos_pago_pendientes perdió en la reescritura del 1-sep el filtro de
--     carreras demo (las de las tiendas): vuelve. Y no devuelve filas sin email.
--  4. El segundo aviso se contaba desde el abandono: una fila detectada tarde
--     recibía los dos avisos con una hora de diferencia. Ahora, además, deja
--     al menos 20 h desde el primero.
--  5. clave_cron_valida: el robot comprueba su clave contra la guardada en el
--     Vault de la base de datos, así la clave no sale nunca de ella (ni hay
--     que copiarla a los secretos de Lovable).
--
-- Editor SQL de Lovable: sentencias sueltas, cuerpos con $fn$ (no $$).
-- ============================================================

-- 1 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.token_recuperacion_inscripcion(p_registration_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg    registrations%ROWTYPE;
  v_cierra timestamptz;
  v_fecha  date;
  v_token  uuid;
  v_caduca timestamptz;
  v_email  text;
  v_nombre text;
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

  -- Email: el de la fila; si no hay (inscripción con cuenta), el de la
  -- cuenta y después el del perfil. Nombre: la fila y después el perfil.
  v_email := NULLIF(trim(v_reg.email), '');
  v_nombre := NULLIF(trim(v_reg.first_name), '');
  IF v_reg.user_id IS NOT NULL AND (v_email IS NULL OR v_nombre IS NULL) THEN
    SELECT COALESCE(v_email, lower(u.email), lower(NULLIF(trim(p.email), ''))),
           COALESCE(v_nombre, NULLIF(trim(p.first_name), ''))
      INTO v_email, v_nombre
    FROM (SELECT 1) x
    LEFT JOIN auth.users u ON u.id = v_reg.user_id
    LEFT JOIN profiles p   ON p.id = v_reg.user_id;
  END IF;

  INSERT INTO recuperacion_pagos (
    tipo, race_id, race_distance_id, registration_id, email, nombre,
    abandonada_at, caduca_at
  )
  VALUES (
    'individual', v_reg.race_id, v_reg.race_distance_id, v_reg.id,
    COALESCE(v_email, ''), v_nombre,
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
$fn$;

-- 2 ─────────────────────────────────────────────────────────────────────────
UPDATE recuperacion_pagos rp
SET email  = COALESCE(NULLIF(trim(r.email), ''), lower(u.email), lower(NULLIF(trim(p.email), '')), ''),
    nombre = COALESCE(NULLIF(trim(rp.nombre), ''), NULLIF(trim(r.first_name), ''), NULLIF(trim(p.first_name), ''))
FROM registrations r
LEFT JOIN auth.users u ON u.id = r.user_id
LEFT JOIN profiles p   ON p.id = r.user_id
WHERE rp.tipo = 'individual'
  AND r.id = rp.registration_id
  AND NULLIF(trim(rp.email), '') IS NULL;

-- 3 y 4 ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.avisos_pago_pendientes()
RETURNS TABLE (
  id uuid, token uuid, ronda integer, tipo text, email text, nombre text,
  race_name text, race_slug text, race_date date, race_location text,
  distance_name text, team_name text, n_corredores integer, importe numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    AND vivas.n > 0
    AND NOT ra.es_demo
    AND NULLIF(trim(rp.email), '') IS NOT NULL
    -- Ya dentro por otra fila de la carrera (email o DNI, fila o perfil): no
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
    AND COALESCE(public.plazas_libres(rp.race_distance_id), vivas.n) >= vivas.n
    AND (
      (rp.aviso_1_at IS NULL AND now() >= rp.abandonada_at + interval '2 hours')
      OR
      (rp.aviso_1_at IS NOT NULL AND rp.aviso_2_at IS NULL
       AND now() >= GREATEST(rp.abandonada_at + interval '24 hours',
                             rp.aviso_1_at + interval '20 hours'))
    )
  ORDER BY rp.abandonada_at;
$fn$;

-- Devuelve correos: solo el robot (service_role). Ver CLAUDE.md, ya se filtró
-- una vez a anon.
REVOKE EXECUTE ON FUNCTION public.avisos_pago_pendientes() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.avisos_pago_pendientes() TO service_role;

-- 5 ─────────────────────────────────────────────────────────────────────────
-- ¿Es esta la clave del robot? Compara con el secreto del Vault del mismo
-- nombre. Solo la llama la función del robot con la clave de servicio.
CREATE OR REPLACE FUNCTION public.clave_cron_valida(p_nombre text, p_clave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(p_clave, '') <> ''
     AND EXISTS (
       SELECT 1 FROM vault.decrypted_secrets s
       WHERE s.name = p_nombre AND s.decrypted_secret = p_clave
     );
$fn$;

REVOKE EXECUTE ON FUNCTION public.clave_cron_valida(text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.clave_cron_valida(text, text) TO service_role;

-- La clave del robot: aleatoria, creada aquí y guardada en el Vault. No se
-- escribe en ningún sitio más: el cron la lee del Vault al llamar.
SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'recuperar_pagos_cron_key',
  'Cabecera x-cron-key del robot recuperar-pagos (pg_cron)'
)
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'recuperar_pagos_cron_key');

-- Comprobación: las dos funciones con correos o claves, cerradas a anon
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('avisos_pago_pendientes', 'clave_cron_valida');
