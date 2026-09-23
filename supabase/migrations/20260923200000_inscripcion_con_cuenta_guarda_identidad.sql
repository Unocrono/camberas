-- ============================================================
-- LA INSCRIPCIÓN HECHA CON CUENTA GUARDA EMAIL Y NOMBRE (23-sep-2026)
--
-- Quien se inscribía con la sesión abierta quedaba en `registrations` sin
-- email ni nombre (RaceDetail.tsx no los escribía y el trigger de snapshot
-- del repo, 20260306195742, nunca se aplicó). Consecuencias medidas en
-- producción:
--  - el comprobante tras pagar no salía: redsys-webhook mandaba email nulo y
--    send-payment-confirmation respondía 400 sin que nadie lo viera;
--  - el aviso de pago a medias tampoco podía llegarle.
--
-- Cuatro piezas:
--  1. RaceDetail.tsx ya escribe email (el de la cuenta), nombre, apellidos,
--     teléfono, DNI y fecha de nacimiento.
--  2. Este trigger completa lo que falte en CUALQUIER alta con user_id, venga
--     de donde venga: email de la cuenta, el resto del perfil. Solo rellena
--     huecos, nunca pisa lo que trae la fila.
--  3. resolver_inscripcion_previa: la búsqueda por email del invitado deja de
--     actuar sobre inscripciones con cuenta (ahora que llevan email).
--  4. El relleno de las filas que ya se quedaron vacías (al final). Se
--     ejecutó a mano el 23-sep a las 22:01 desde otro hilo; volver a
--     lanzarlo no toca nada.
--
-- EL EMAIL ES EL DE LA CUENTA. Hay permisos de lectura y edición POR EMAIL
-- ("Users can view/update own registration by email"): si quien se inscribe
-- a sí mismo pudiera guardar un email ajeno, daría acceso a su inscripción a
-- la cuenta de ese email. Por eso, cuando user_id es quien llama, el email se
-- fuerza al de su cuenta.
--
-- Editor SQL de Lovable: sentencias sueltas, cuerpos con $fn$ (no $$).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rellenar_identidad_inscripcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_email_cuenta text;
  p              profiles%ROWTYPE;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lower(u.email) INTO v_email_cuenta FROM auth.users u WHERE u.id = NEW.user_id;

  IF NEW.user_id = auth.uid() AND v_email_cuenta IS NOT NULL THEN
    NEW.email := v_email_cuenta;
  ELSIF NULLIF(trim(NEW.email), '') IS NULL THEN
    NEW.email := v_email_cuenta;
  END IF;

  SELECT * INTO p FROM profiles WHERE id = NEW.user_id;
  IF FOUND THEN
    NEW.email        := COALESCE(NULLIF(trim(NEW.email), ''), lower(NULLIF(trim(p.email), '')));
    NEW.first_name   := COALESCE(NULLIF(trim(NEW.first_name), ''), NULLIF(trim(p.first_name), ''));
    NEW.last_name    := COALESCE(NULLIF(trim(NEW.last_name), ''), NULLIF(trim(p.last_name), ''));
    NEW.phone        := COALESCE(NULLIF(trim(NEW.phone), ''), NULLIF(trim(p.phone), ''));
    NEW.dni_passport := COALESCE(NULLIF(trim(NEW.dni_passport), ''), NULLIF(trim(p.dni_passport), ''));
    NEW.birth_date   := COALESCE(NEW.birth_date, p.birth_date);
  END IF;

  RETURN NEW;
END;
$fn$;

-- Es una función de trigger: nadie la llama por RPC
REVOKE EXECUTE ON FUNCTION public.rellenar_identidad_inscripcion() FROM anon, authenticated, PUBLIC;

-- "trg_registrations_identidad" va antes que "trigger_asignar_categoria_inscripcion"
-- por orden alfabético: la categoría se calcula ya con la fecha de nacimiento puesta
DROP TRIGGER IF EXISTS trg_registrations_identidad ON public.registrations;
CREATE TRIGGER trg_registrations_identidad
  BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.rellenar_identidad_inscripcion();

-- ─────────────────────────────────────────────────────────────────────────
-- resolver_inscripcion_previa: la búsqueda POR EMAIL (la usa guest-register,
-- que llama cualquiera sin sesión) ya no ACTÚA sobre inscripciones con
-- cuenta. Antes no llegaba a ellas porque no tenían email; ahora sí, y con
-- el email de otro se le podría cancelar una inscripción a medias de otro
-- recorrido o sacar su enlace de pago. Solo cambian el SELECT del mismo
-- recorrido y el UPDATE que cancela: los recuentos siguen viéndolas, así que
-- un invitado con el email de una cuenta ya inscrita recibe "duplicada" y no
-- se crea una segunda inscripción. La cuenta retoma su pago desde su sesión.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolver_inscripcion_previa(
  p_race_id uuid,
  p_race_distance_id uuid,
  p_email text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_misma   registrations%ROWTYPE;
  v_token   uuid;
  v_otras   integer;
  v_pagadas integer;
BEGIN
  -- Con sesión, solo sobre uno mismo
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('verdicto', 'denegado');
  END IF;

  -- Con sesión, el email NO se usa como criterio (se llevaría el token o
  -- cancelaría la inscripción de otro). Por email solo guest-register.
  IF auth.uid() IS NOT NULL THEN
    p_email := NULL;
  END IF;

  IF p_email IS NULL AND p_user_id IS NULL THEN
    RETURN jsonb_build_object('verdicto', 'denegado');
  END IF;

  SELECT count(*) FILTER (WHERE r.payment_status IN ('paid', 'not_required'))
    INTO v_pagadas
  FROM registrations r
  WHERE r.race_id = p_race_id
    AND r.status IS DISTINCT FROM 'cancelled'
    AND ((p_user_id IS NOT NULL AND r.user_id = p_user_id)
         OR (p_email IS NOT NULL AND lower(r.email) = lower(p_email)));

  IF v_pagadas > 0 THEN
    RETURN jsonb_build_object('verdicto', 'duplicada');
  END IF;

  -- ¿Dejó a medias el MISMO recorrido? Por email, solo filas de invitado
  SELECT * INTO v_misma
  FROM registrations r
  WHERE r.race_id = p_race_id
    AND r.race_distance_id = p_race_distance_id
    AND r.status = 'pending'
    AND r.payment_status = 'pending'
    AND r.source = 'gateway'
    AND ((p_user_id IS NOT NULL AND r.user_id = p_user_id)
         OR (p_email IS NOT NULL AND r.user_id IS NULL AND lower(r.email) = lower(p_email)))
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_token := public.token_recuperacion_inscripcion(v_misma.id);
    IF v_token IS NOT NULL THEN
      RETURN jsonb_build_object('verdicto', 'retomar', 'token', v_token);
    END IF;
    RETURN jsonb_build_object('verdicto', 'duplicada');
  END IF;

  -- A medias en OTRO recorrido: se cancela. Por email, solo filas de invitado
  UPDATE registrations r
  SET status = 'cancelled'
  WHERE r.race_id = p_race_id
    AND r.race_distance_id IS DISTINCT FROM p_race_distance_id
    AND r.status = 'pending'
    AND r.payment_status = 'pending'
    AND r.source = 'gateway'
    AND r.team_id IS NULL
    AND ((p_user_id IS NOT NULL AND r.user_id = p_user_id)
         OR (p_email IS NOT NULL AND r.user_id IS NULL AND lower(r.email) = lower(p_email)));

  -- ¿Queda alguna viva por otra vía? Es el duplicado de siempre
  SELECT count(*) INTO v_otras
  FROM registrations r
  WHERE r.race_id = p_race_id
    AND r.status IS DISTINCT FROM 'cancelled'
    AND ((p_user_id IS NOT NULL AND r.user_id = p_user_id)
         OR (p_email IS NOT NULL AND lower(r.email) = lower(p_email)));

  IF v_otras > 0 THEN
    RETURN jsonb_build_object('verdicto', 'duplicada');
  END IF;

  RETURN jsonb_build_object('verdicto', 'libre');
END;
$fn$;

-- Mismos permisos que tenía: la sesión (RaceDetail) y el servidor
-- (guest-register); anon no. CREATE OR REPLACE los conserva, se repiten por
-- si acaso.
REVOKE EXECUTE ON FUNCTION public.resolver_inscripcion_previa(uuid, uuid, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_inscripcion_previa(uuid, uuid, text, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Relleno de las que ya se quedaron vacías. La fila manda; después lo que
-- el corredor tecleó en el formulario (respuestas); por último el perfil. El
-- email, de la cuenta (nunca de una respuesta, por lo dicho arriba).
-- ─────────────────────────────────────────────────────────────────────────
WITH vacias AS (
  SELECT r.id
  FROM registrations r
  WHERE r.user_id IS NOT NULL
    AND (NULLIF(trim(r.email), '') IS NULL
         OR NULLIF(trim(r.first_name), '') IS NULL
         OR NULLIF(trim(r.last_name), '') IS NULL)
),
resp AS (
  SELECT rr.registration_id,
         max(rr.field_value) FILTER (WHERE f.field_name = 'first_name')      AS fn,
         max(rr.field_value) FILTER (WHERE f.field_name = 'last_name')       AS ln,
         max(rr.field_value) FILTER (WHERE f.field_name = 'phone')           AS ph,
         max(rr.field_value) FILTER (WHERE f.field_name = 'document_number') AS dni
  FROM registration_responses rr
  JOIN registration_form_fields f ON f.id = rr.field_id
  WHERE rr.registration_id IN (SELECT id FROM vacias)
  GROUP BY rr.registration_id
),
nuevo AS (
  SELECT r.id,
         COALESCE(NULLIF(trim(r.email), ''), lower(au.email), lower(NULLIF(trim(p.email), '')))       AS email,
         COALESCE(NULLIF(trim(r.first_name), ''), NULLIF(trim(resp.fn), ''), NULLIF(trim(p.first_name), '')) AS first_name,
         COALESCE(NULLIF(trim(r.last_name), ''), NULLIF(trim(resp.ln), ''), NULLIF(trim(p.last_name), ''))   AS last_name,
         COALESCE(NULLIF(trim(r.phone), ''), NULLIF(trim(resp.ph), ''), NULLIF(trim(p.phone), ''))           AS phone,
         COALESCE(NULLIF(trim(r.dni_passport), ''), NULLIF(trim(resp.dni), ''), NULLIF(trim(p.dni_passport), '')) AS dni_passport,
         COALESCE(r.birth_date, p.birth_date)                                                         AS birth_date
  FROM registrations r
  JOIN vacias v          ON v.id = r.id
  LEFT JOIN profiles p   ON p.id = r.user_id
  LEFT JOIN auth.users au ON au.id = r.user_id
  LEFT JOIN resp         ON resp.registration_id = r.id
)
UPDATE registrations r
SET email        = n.email,
    first_name   = n.first_name,
    last_name    = n.last_name,
    phone        = n.phone,
    dni_passport = n.dni_passport,
    birth_date   = n.birth_date
FROM nuevo n
WHERE n.id = r.id;

-- Comprobación: debe devolver 0 (o solo cuentas sin email en ningún sitio)
SELECT count(*) AS inscripciones_con_cuenta_sin_email
FROM registrations
WHERE user_id IS NOT NULL AND NULLIF(trim(email), '') IS NULL;
