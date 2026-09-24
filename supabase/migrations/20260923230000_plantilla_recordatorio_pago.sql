-- Recordatorio de pago manual: plantilla de sistema y sus reglas de servidor
--
-- Pedido por el usuario (23-sep-2026): en Inscripciones, seleccionar las que
-- se quedaron a medias en el pago y mandarles un recordatorio. Hasta ahora
-- solo lo mandaba el robot automático (recuperar-pagos), que no se puede
-- dirigir a personas concretas.
--
-- Es una plantilla más de "Enviar email a los seleccionados", con el bloque
-- [[boton_pagar]]: la función reenviar-comprobantes la manda SOLO a
-- inscripciones pendientes de pago por la pasarela, con el enlace de
-- retomar-pago del robot.
--
-- Revisión adversarial (24-sep) antes de aplicarla. De ella salen las piezas
-- de servidor de esta migración:
--
--  1. inscripcion_ya_dentro: la regla "esa persona ya está inscrita por otra
--     fila pagada o gratuita de la misma carrera" (email o DNI, fila, cuenta o
--     perfil), la misma que aplica el robot en avisos_pago_pendientes. Caso
--     real: Inés Lena, Peña Prieta, pendiente en una fila y pagada en otra con
--     el mismo DNI. Sin esta regla el recordatorio le diría "no tienes plaza"
--     y el enlace le dejaría pagar dos veces. Es la misma intención que la del
--     robot, pero el robot aún conserva su copia en línea (con leves
--     diferencias: no mira auth.users ni recorta espacios); unificarlas es
--     cambiar su NOT EXISTS por esta función.
--  2. recuperacion_pago_info la aplica también: un enlace de retomar-pago de
--     alguien que ya está dentro devuelve el estado nuevo 'ya_inscrita' ("ya
--     tienes plaza con otra inscripción; si no eres tú, escribe a la
--     organización") y NO deja pagar. Cierra también el caso del robot: aviso
--     enviado, la persona se reinscribe y paga por otro lado, y días después
--     pulsa el aviso viejo. Y en las individuales el recorrido sale de la
--     inscripción, no de la fila: un cambio de recorrido ya no rompe el enlace.
--  3. preparar_recordatorio_pago: en UNA transacción, antes de enviar, obtiene
--     el enlace (token_recuperacion_inscripcion), comprueba que nadie (robot o
--     manual) haya avisado en las últimas 20 h (el mismo espaciado del robot),
--     da por hechos los avisos automáticos para que el robot no repita, pone
--     la fila en el recorrido actual y comprueba que el enlace abre la página
--     de pago. Devuelve lo necesario para deshacerlo si el email no sale
--     (deshacer_recordatorio_pago, que respeta lo que haya sellado el robot).
--     Un candado por inscripción evita dos recordatorios manuales a la vez, y
--     la columna nueva recordatorio_manual_at deja rastro del envío manual
--     aunque el robot ya hubiera puesto sus dos avisos.
--
-- Requiere 20260923220000_plantillas_email.sql aplicada antes (lo está en
-- producción desde el 23-sep). Se puede ejecutar varias veces.
--
-- Editor SQL de Lovable: sentencias sueltas y cuerpos con $fn$.

-- ─────────────────────────────────────────────────────────────────────────
-- 0. La plantilla, de sistema (mismo texto que la función y el panel)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.plantillas_email
  (clave, nombre, descripcion, asunto, titulo, cuerpo, etiqueta_mensaje, omitir_uno,
   es_sistema, activa, orden, asunto_original, titulo_original, cuerpo_original)
VALUES
  ($t$recordatorio_pago$t$, $t$Recordatorio de pago$t$, $t$Para quien empezó la inscripción y no terminó de pagar: enlace para completar el pago donde lo dejó. Solo a pendientes de pago por la pasarela; tras enviarlo, el aviso automático ya no se repite.$t$, $t$⛰️ ¡Te queda un paso para correr {carrera}!$t$, $t$¡Estás a un paso de la salida!$t$, $t$¡Hola {nombre}!

Empezaste tu inscripción en **{carrera}** y solo falta el pago. Tus datos siguen guardados: en un minuto lo tienes hecho.

[[boton_pagar]]

> Tu plaza no queda reservada hasta que pagues, ¡que no se te escape! El importe es el vigente al pagar: si la carrera tiene tramos de precio, puede haber cambiado.

> ¿Ya lo hiciste o has cambiado de planes? No pasa nada: ignora este correo.

[[mensaje]]

## ¡Nos vemos en la línea de salida!$t$, $t$De la organización$t$, false, true, true, 40, $t$⛰️ ¡Te queda un paso para correr {carrera}!$t$, $t$¡Estás a un paso de la salida!$t$, $t$¡Hola {nombre}!

Empezaste tu inscripción en **{carrera}** y solo falta el pago. Tus datos siguen guardados: en un minuto lo tienes hecho.

[[boton_pagar]]

> Tu plaza no queda reservada hasta que pagues, ¡que no se te escape! El importe es el vigente al pagar: si la carrera tiene tramos de precio, puede haber cambiado.

> ¿Ya lo hiciste o has cambiado de planes? No pasa nada: ignora este correo.

[[mensaje]]

## ¡Nos vemos en la línea de salida!$t$)
ON CONFLICT (clave) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ¿Está esa persona ya dentro de la carrera por OTRA inscripción?
-- ─────────────────────────────────────────────────────────────────────────
-- ¿Parece un documento de verdad? 'N/A', '---' o '00000000' (el relleno
-- de quien no tiene o no sabe) no pueden hacer "coincidir" a dos personas
CREATE OR REPLACE FUNCTION public.es_documento_valido(p_doc text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT p_doc IS NOT NULL
     AND length(p_doc) >= 6
     AND p_doc ~ '[0-9]'
     AND p_doc !~ '^0+$';
$fn$;

REVOKE EXECUTE ON FUNCTION public.es_documento_valido(text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.es_documento_valido(text) TO service_role;

-- Identidad normalizada: email (fila, cuenta, perfil) y documento (el de la
-- fila si es algo; si no, el del perfil), en mayúsculas y sin símbolos.
-- Coincide por DOCUMENTO solo si es un documento válido; por EMAIL, salvo
-- que las dos tengan documentos válidos y distintos (madre e hijo con el
-- email de la familia son dos personas).
CREATE OR REPLACE FUNCTION public.inscripcion_ya_dentro(p_registration_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH yo0 AS (
    SELECT r0.id, r0.race_id,
           lower(COALESCE(NULLIF(trim(r0.email), ''), r0u.email, r0p.email)) AS email,
           NULLIF(upper(regexp_replace(COALESCE(r0.dni_passport, ''), '[^A-Za-z0-9]', '', 'g')), '') AS doc_fila,
           CASE WHEN NULLIF(trim(r0.email), '') IS NULL
                     OR lower(trim(r0.email)) IN (lower(r0u.email), lower(r0p.email))
                THEN NULLIF(upper(regexp_replace(COALESCE(r0p.dni_passport, ''), '[^A-Za-z0-9]', '', 'g')), '')
           END AS doc_perfil
    FROM registrations r0
    LEFT JOIN profiles r0p   ON r0p.id = r0.user_id
    LEFT JOIN auth.users r0u ON r0u.id = r0.user_id
    WHERE r0.id = p_registration_id
  ),
  -- El documento de la fila si es válido; si es relleno ('N/A'), el del
  -- perfil, pero solo si la inscripción es del titular de la cuenta (email de
  -- la fila vacío o igual al de la cuenta): padre e hija desde la misma
  -- cuenta son dos personas
  yo AS (
    SELECT id, race_id, email,
           CASE WHEN public.es_documento_valido(doc_fila) THEN doc_fila
                ELSE COALESCE(doc_perfil, doc_fila) END AS doc
    FROM yo0
  ),
  otras0 AS (
    SELECT lower(COALESCE(NULLIF(trim(h.email), ''), hu.email, hp.email)) AS email,
           NULLIF(upper(regexp_replace(COALESCE(h.dni_passport, ''), '[^A-Za-z0-9]', '', 'g')), '') AS doc_fila,
           CASE WHEN NULLIF(trim(h.email), '') IS NULL
                     OR lower(trim(h.email)) IN (lower(hu.email), lower(hp.email))
                THEN NULLIF(upper(regexp_replace(COALESCE(hp.dni_passport, ''), '[^A-Za-z0-9]', '', 'g')), '')
           END AS doc_perfil
    FROM yo
    JOIN registrations h    ON h.race_id = yo.race_id AND h.id <> yo.id
    LEFT JOIN profiles hp   ON hp.id = h.user_id
    LEFT JOIN auth.users hu ON hu.id = h.user_id
    WHERE h.status IS DISTINCT FROM 'cancelled'
      AND h.payment_status IN ('paid', 'not_required')
  ),
  otras AS (
    SELECT email,
           CASE WHEN public.es_documento_valido(doc_fila) THEN doc_fila
                ELSE COALESCE(doc_perfil, doc_fila) END AS doc
    FROM otras0
  )
  SELECT EXISTS (
    SELECT 1
    FROM yo, otras o
    WHERE (public.es_documento_valido(yo.doc) AND yo.doc = o.doc)
       OR (yo.email IS NOT NULL
           AND yo.email = o.email
           AND NOT (public.es_documento_valido(yo.doc)
                    AND public.es_documento_valido(o.doc)
                    AND yo.doc <> o.doc))
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.inscripcion_ya_dentro(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inscripcion_ya_dentro(uuid) TO service_role;

-- La misma pregunta para un lote (el ensayo del panel manda hasta 50)
CREATE OR REPLACE FUNCTION public.inscripciones_ya_dentro(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT x.id FROM unnest(p_ids) AS x(id) WHERE public.inscripcion_ya_dentro(x.id);
$fn$;

REVOKE EXECUTE ON FUNCTION public.inscripciones_ya_dentro(uuid[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inscripciones_ya_dentro(uuid[]) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. La página de retomar-pago: quien ya está dentro no vuelve a pagar
--    (definición vigente de 20260825120000 + la comprobación nueva)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recuperacion_pago_info(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  rp        recuperacion_pagos%ROWTYPE;
  v_race    races%ROWTYPE;
  v_dist    race_distances%ROWTYPE;
  v_team    teams%ROWTYPE;
  v_ids     uuid[];
  v_pagadas integer;
  v_libres  integer;
  v_estado  text;
  v_dentro  boolean := false;
  v_dist_id uuid;
BEGIN
  SELECT * INTO rp FROM recuperacion_pagos WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  -- En las individuales, el recorrido es el que tenga HOY la inscripción: si
  -- se cambió después del aviso, el enlace sigue funcionando
  IF rp.tipo = 'individual' AND rp.registration_id IS NOT NULL THEN
    SELECT r.race_distance_id INTO v_dist_id FROM registrations r WHERE r.id = rp.registration_id;
  END IF;
  v_dist_id := COALESCE(v_dist_id, rp.race_distance_id);

  SELECT * INTO v_race FROM races           WHERE id = rp.race_id;
  SELECT * INTO v_dist FROM race_distances  WHERE id = v_dist_id;
  IF rp.team_id IS NOT NULL THEN
    SELECT * INTO v_team FROM teams WHERE id = rp.team_id;
  END IF;

  -- Las que siguen sin pagar ahora mismo
  SELECT array_agg(r.id ORDER BY r.created_at)
    INTO v_ids
  FROM registrations r
  WHERE r.payment_status = 'pending'
    AND r.status = 'pending'
    AND r.source = 'gateway'
    AND r.race_distance_id = v_dist_id
    AND (
      (rp.tipo = 'individual' AND r.id = rp.registration_id)
      OR
      (rp.tipo = 'equipo' AND r.team_id = rp.team_id)
    );

  -- Si ya no queda ninguna pendiente hay que distinguir si se pagó o si se
  -- canceló: las dos dejan la lista vacía y no dicen lo mismo
  SELECT count(*) INTO v_pagadas
  FROM registrations r
  WHERE r.race_distance_id = v_dist_id
    AND r.status IS DISTINCT FROM 'cancelled'
    AND r.payment_status IN ('paid', 'not_required')
    AND (
      (rp.tipo = 'individual' AND r.id = rp.registration_id)
      OR
      (rp.tipo = 'equipo' AND r.team_id = rp.team_id)
    );

  -- Ya dentro por otra inscripción pagada o gratuita: no hay nada que pagar
  IF rp.tipo = 'individual' AND rp.registration_id IS NOT NULL THEN
    v_dentro := public.inscripcion_ya_dentro(rp.registration_id);
  END IF;

  v_libres := public.plazas_libres(v_dist_id);

  v_estado := CASE
    WHEN (v_ids IS NULL OR array_length(v_ids, 1) IS NULL)
         AND v_pagadas > 0                               THEN 'pagado'
    WHEN v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN 'cancelado'
    WHEN v_dentro                                        THEN 'ya_inscrita'
    WHEN rp.caduca_at <= now()                           THEN 'caducado'
    WHEN v_race.date < current_date                      THEN 'cerrado'
    WHEN v_dist.registration_closes IS NOT NULL
         AND v_dist.registration_closes <= now()         THEN 'cerrado'
    WHEN v_libres IS NOT NULL
         AND v_libres < array_length(v_ids, 1)           THEN 'completo'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'estado',          v_estado,
    'tipo',            rp.tipo,
    'nombre',          rp.nombre,
    'race_name',       v_race.name,
    'race_slug',       v_race.slug,
    'race_date',       v_race.date,
    'race_location',   v_race.location,
    'distance_name',   v_dist.name,
    'team_name',       v_team.name,
    -- Solo el capitán puede lanzar el cobro del lote (team-init-payment)
    'es_capitan',      (rp.tipo = 'equipo' AND v_team.captain_user_id = auth.uid()),
    'n_corredores',    COALESCE(array_length(v_ids, 1), 0),
    'registration_ids', CASE WHEN v_estado = 'ok' THEN to_jsonb(v_ids) ELSE NULL END
  );
END;
$fn$;

-- La abre quien recibe el email, tenga cuenta o no (como hasta ahora)
REVOKE EXECUTE ON FUNCTION public.recuperacion_pago_info(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recuperacion_pago_info(uuid) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Preparar un recordatorio manual, en una sola transacción y ANTES de
--    enviar: enlace, "¿alguien avisó hace poco?", avisos automáticos dados
--    por hechos y fila en el recorrido actual
-- ─────────────────────────────────────────────────────────────────────────
-- Rastro propio del recordatorio manual: si el robot ya había puesto sus dos
-- avisos, sellarlos no cambia nada y sin esta columna nada impediría mandar
-- el recordatorio manual una y otra vez
ALTER TABLE public.recuperacion_pagos ADD COLUMN IF NOT EXISTS recordatorio_manual_at timestamptz;

CREATE OR REPLACE FUNCTION public.preparar_recordatorio_pago(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg         registrations%ROWTYPE;
  v_token       uuid;
  v_rp          recuperacion_pagos%ROWTYPE;
  v_existia     boolean;
  v_caduca_prev timestamptz;
  v_sello       timestamptz := now();
  v_estado      text;
BEGIN
  -- Un solo recordatorio a la vez por inscripción (dos admins, o un reintento
  -- con el primero aún en marcha). Sin este candado el segundo leía la
  -- caducidad de antes y, al salir por "avisada hace poco", dejaba muerto el
  -- enlace que el primero acababa de mandar.
  PERFORM pg_advisory_xact_lock(hashtextextended('preparar_recordatorio_pago:' || p_registration_id::text, 0));

  SELECT * INTO v_reg FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND OR v_reg.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'sin_enlace');
  END IF;
  IF public.inscripcion_ya_dentro(p_registration_id) THEN
    RETURN jsonb_build_object('estado', 'ya_dentro');
  END IF;

  -- ¿La fila ya existía? Si la crea esta llamada y el email no sale, se borra
  -- (si no, un carrito de hace semanas entraría en la cola del robot). Y su
  -- caducidad: token_recuperacion_inscripcion la alarga 7 días, lo que solo
  -- tiene sentido si el recordatorio sale de verdad.
  SELECT caduca_at INTO v_caduca_prev
  FROM recuperacion_pagos
  WHERE tipo = 'individual' AND registration_id = p_registration_id;
  v_existia := FOUND;

  -- Crea o revive la fila de recuperacion_pagos (null si ya no se puede pagar)
  v_token := public.token_recuperacion_inscripcion(p_registration_id);
  IF v_token IS NULL THEN
    RETURN jsonb_build_object('estado', 'sin_enlace');
  END IF;

  -- Frente a otro envío manual protege el candado de arriba. Frente al robot
  -- queda una ventana de segundos en cada pasada: el robot elige a quién
  -- escribir con una foto sin bloqueo y sella después de enviar (lo cerraría
  -- que el robot reservara la ronda antes de mandar).
  SELECT * INTO v_rp FROM recuperacion_pagos WHERE token = v_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'sin_enlace');
  END IF;

  -- La fila, en el recorrido de ahora: lo primero, porque el enlace que ya
  -- tenga la persona (el del robot) debe seguir funcionando pase lo que pase
  IF v_rp.race_id IS DISTINCT FROM v_reg.race_id
     OR v_rp.race_distance_id IS DISTINCT FROM v_reg.race_distance_id THEN
    UPDATE recuperacion_pagos
    SET race_id = v_reg.race_id, race_distance_id = v_reg.race_distance_id
    WHERE id = v_rp.id;
  END IF;

  -- El enlace tiene que abrir la página de pago, no "caducado", "cerrado" o
  -- "completo" (p. ej. una fila ya recuperada que alguien volvió a poner
  -- pendiente a mano: el token no la revive)
  v_estado := public.recuperacion_pago_info(v_token)->>'estado';
  IF v_estado IS DISTINCT FROM 'ok' THEN
    IF NOT v_existia THEN
      DELETE FROM recuperacion_pagos WHERE id = v_rp.id;
    ELSE
      UPDATE recuperacion_pagos SET caduca_at = COALESCE(v_caduca_prev, caduca_at) WHERE id = v_rp.id;
    END IF;
    RETURN jsonb_build_object('estado', 'sin_enlace', 'estado_enlace', v_estado);
  END IF;

  -- El mismo espaciado que el robot entre sus dos avisos, contando también
  -- los recordatorios manuales
  IF GREATEST(v_rp.aviso_1_at, v_rp.aviso_2_at, v_rp.recordatorio_manual_at) > now() - interval '20 hours' THEN
    IF v_existia THEN
      UPDATE recuperacion_pagos SET caduca_at = COALESCE(v_caduca_prev, caduca_at) WHERE id = v_rp.id;
    END IF;
    RETURN jsonb_build_object('estado', 'avisada_hace_poco');
  END IF;

  -- Tras un recordatorio manual el robot ya no escribe más (mejor perder un
  -- aviso que mandar dos seguidos)
  UPDATE recuperacion_pagos
  SET aviso_1_at             = COALESCE(aviso_1_at, v_sello),
      aviso_2_at             = COALESCE(aviso_2_at, v_sello),
      recordatorio_manual_at = v_sello
  WHERE id = v_rp.id;

  RETURN jsonb_build_object(
    'estado',       'ok',
    'token',        v_token,
    'id',           v_rp.id,
    -- Para deshacerlo si el email no llega a salir (deshacer_recordatorio_pago)
    'sello',        v_sello,
    'aviso_1_prev', v_rp.aviso_1_at,
    'aviso_2_prev', v_rp.aviso_2_at,
    'manual_prev',  v_rp.recordatorio_manual_at,
    'nueva',        NOT v_existia,
    'caduca_prev',  v_caduca_prev,
    'caduca_nueva', v_rp.caduca_at
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.preparar_recordatorio_pago(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.preparar_recordatorio_pago(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Deshacer un recordatorio que no llegó a salir. Solo revierte lo que siga
--    con SU sello (si el robot selló entre medias, lo suyo se respeta), la
--    caducidad solo si nadie la cambió desde entonces, y una fila que creó el
--    propio recordatorio y nadie tocó se borra.
--    (Las firmas de versiones anteriores de esta migración se quitan: con dos
--    sobrecargas, una llamada con menos argumentos sería ambigua.)
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.deshacer_recordatorio_pago(uuid, timestamptz, timestamptz, timestamptz, boolean);
DROP FUNCTION IF EXISTS public.deshacer_recordatorio_pago(uuid, timestamptz, timestamptz, timestamptz, boolean, timestamptz);

CREATE OR REPLACE FUNCTION public.deshacer_recordatorio_pago(
  p_id           uuid,
  p_sello        timestamptz,
  p_prev1        timestamptz,
  p_prev2        timestamptz,
  p_nueva        boolean,
  p_caduca_prev  timestamptz DEFAULT NULL,
  p_caduca_nueva timestamptz DEFAULT NULL,
  p_manual_prev  timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_nueva THEN
    DELETE FROM recuperacion_pagos
    WHERE id = p_id
      AND aviso_1_at IS NOT DISTINCT FROM p_sello
      AND aviso_2_at IS NOT DISTINCT FROM p_sello
      -- si el corredor volvió entre medias, su enlace alargado se respeta
      AND (p_caduca_nueva IS NULL OR caduca_at IS NOT DISTINCT FROM p_caduca_nueva);
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  UPDATE recuperacion_pagos
  SET aviso_1_at             = CASE WHEN aviso_1_at = p_sello THEN p_prev1 ELSE aviso_1_at END,
      aviso_2_at             = CASE WHEN aviso_2_at = p_sello THEN p_prev2 ELSE aviso_2_at END,
      recordatorio_manual_at = CASE WHEN recordatorio_manual_at = p_sello THEN p_manual_prev
                                    ELSE recordatorio_manual_at END,
      caduca_at              = CASE WHEN p_caduca_prev IS NOT NULL
                                     AND (p_caduca_nueva IS NULL OR caduca_at = p_caduca_nueva)
                                    THEN p_caduca_prev ELSE caduca_at END
  WHERE id = p_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.deshacer_recordatorio_pago(uuid, timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deshacer_recordatorio_pago(uuid, timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobación. Debe salir la plantilla recordatorio_pago y estos permisos:
--   deshacer_recordatorio_pago   | f | f
--   es_documento_valido          | f | f
--   inscripcion_ya_dentro        | f | f
--   inscripciones_ya_dentro      | f | f
--   preparar_recordatorio_pago   | f | f
--   recuperacion_pago_info       | t | t
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'plantilla' AS que, clave AS detalle, activa::text AS a, es_sistema::text AS b
FROM public.plantillas_email WHERE clave = 'recordatorio_pago'
UNION ALL
SELECT 'funcion', p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')::text,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('inscripcion_ya_dentro', 'inscripciones_ya_dentro', 'deshacer_recordatorio_pago', 'es_documento_valido',
                    'preparar_recordatorio_pago', 'recuperacion_pago_info')
ORDER BY 1, 2;
