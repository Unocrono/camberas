-- Devoluciones Redsys: ajustes tras la revisión (26-sep-2026)
--
-- Parte de lo que hay en PRODUCCIÓN (pg_get_functiondef del 26-sep), no de
-- las migraciones: 20260925213000_devoluciones_redsys.sql ya está aplicada y
-- no se toca. CREATE OR REPLACE conserva los permisos que ya tiene cada
-- función; la comprobación del final lo confirma.
--
--  1. devolucion_info: los días hasta la carrera se cuentan con la fecha de
--     Madrid, no con current_date (UTC). Entre las 00:00 y la 01:00/02:00 de
--     Madrid contaba un día de más y podía proponer un tramo de la política
--     más generoso del que toca.
--  2. get_organizer_race_summary: la recaudación es NETA de devoluciones
--     hechas. Suma todos los cobros completados de la inscripción (antes solo
--     el último) y les resta lo devuelto de esos cobros. Así una devolución
--     sin anular (cortesía, cobro duplicado) deja de contar como ingreso.
--     Las inscripciones anuladas siguen fuera, como hasta ahora, aunque se
--     les devolviera solo una parte (eso lo decide el dueño: ver nota abajo).
--     Hoy no cambia ninguna cifra: 0 devoluciones y 0 inscripciones con más
--     de un cobro completado.
--  3. recogida_contexto: «entregados» cuenta solo las inscripciones que
--     también cuentan en «total». Una anulada (por devolución o a mano)
--     después de recoger el dorsal dejaba la mesa en «81 de 80».
--  4. registrations: no se puede borrar una inscripción con una devolución
--     sin confirmar ('pendiente' o 'dudosa'). Se quedaba invisible y sin forma
--     de resolverla desde el panel.
--  5. payment_intents: un cobro 'completed' ya no puede pasar a otro estado.
--     El redsys-webhook anterior a 87db6a9 trata el aviso de una devolución
--     (Ds_TransactionType 3, Ds_Response 0900) como un cobro fallido y pasa
--     el cobro a 'failed': desaparecía del diálogo de devoluciones y de la
--     recaudación. Así no depende del orden de despliegue.
--  6. registrations: nadie salvo el admin o el organizador de la carrera
--     (ni webhook, ni cron, ni el propio corredor) puede volver a dar por
--     pagada una inscripción 'refunded' de la que ya se devolvió dinero. El
--     webhook antiguo lo hacía con un aviso de éxito repetido.
--
-- APLICAR ANTES DE DESPLEGAR redsys-devolucion (las secciones 5 y 6 son la
-- red por si redsys-webhook de main no está desplegado todavía).
--
-- Editor SQL de Lovable: sentencias sueltas y cuerpos con $fn$.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. devolucion_info: fecha de Madrid
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.devolucion_info(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg      record;
  v_dias     integer;
  v_pct      integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede ver o hacer devoluciones'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.id, r.status, r.payment_status, r.source, r.race_id,
         COALESCE(NULLIF(trim(r.first_name), ''), p.first_name) AS nombre,
         COALESCE(NULLIF(trim(r.last_name), ''), p.last_name)   AS apellidos,
         COALESCE(NULLIF(trim(r.email), ''), p.email)           AS email,
         ra.name AS carrera, ra.date AS fecha_carrera
    INTO v_reg
  FROM registrations r
  JOIN races ra ON ra.id = r.race_id
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.id = p_registration_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  -- Tramo de la política que tocaría HOY (orientativo: no se sabe cuándo
  -- canceló el corredor). Hoy es la fecha de Madrid, como diasHasta() en la
  -- web del corredor: la sesión va en UTC
  v_dias := v_reg.fecha_carrera - (now() AT TIME ZONE 'Europe/Madrid')::date;
  SELECT refund_percent INTO v_pct
  FROM race_cancellation_tiers
  WHERE race_id = v_reg.race_id AND days_before <= v_dias
  ORDER BY days_before DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'inscripcion', jsonb_build_object(
      'id', v_reg.id, 'nombre', trim(concat_ws(' ', v_reg.nombre, v_reg.apellidos)),
      'email', v_reg.email, 'status', v_reg.status, 'payment_status', v_reg.payment_status,
      'source', v_reg.source, 'carrera', v_reg.carrera, 'fecha_carrera', v_reg.fecha_carrera),
    'cedida', EXISTS (SELECT 1 FROM cesiones_dorsal c
                      WHERE c.registration_id = p_registration_id AND c.estado = 'completada'),
    -- Pagada dentro de un lote de equipo YA cobrado (esas se devuelven a mano)
    'equipo', EXISTS (SELECT 1 FROM payment_intent_items i
                      JOIN payment_intents pi ON pi.id = i.payment_intent_id
                      WHERE i.registration_id = p_registration_id AND pi.status = 'completed'),
    'politica', jsonb_build_object(
      'dias_hasta_carrera', v_dias,
      'tiene_tramos', EXISTS (SELECT 1 FROM race_cancellation_tiers t WHERE t.race_id = v_reg.race_id),
      'porcentaje', v_pct),
    'cobros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'payment_intent_id', x.id,
        'order_number',      x.order_number,
        'fecha',             x.completed_at,
        'titular',           x.merchant_params->>'DS_MERCHANT_TITULAR',
        'fuc',               x.merchant_params->>'DS_MERCHANT_MERCHANTCODE',
        'cobrado_cent',      x.cobrado,
        'devuelto_cent',     x.hecho,
        'en_curso_cent',     x.en_curso,
        'disponible_cent',   GREATEST(x.cobrado - x.hecho - x.en_curso, 0),
        'soportado',         x.secret_ref IS NULL,
        'motivo_no',         CASE WHEN x.secret_ref IS NOT NULL
                                  THEN 'Cobrado con el TPV propio del organizador: se devuelve desde su banco' END
      ) ORDER BY x.completed_at)
      FROM (
        SELECT pi.*,
               COALESCE((pi.merchant_params->>'DS_MERCHANT_AMOUNT')::integer,
                        round(pi.amount * 100)::integer) AS cobrado,
               COALESCE((SELECT sum(d.importe_cent) FROM devoluciones d
                          WHERE d.payment_intent_id = pi.id AND d.estado = 'hecha'), 0) AS hecho,
               COALESCE((SELECT sum(d.importe_cent) FROM devoluciones d
                          WHERE d.payment_intent_id = pi.id AND d.estado IN ('pendiente', 'dudosa')), 0) AS en_curso
        FROM payment_intents pi
        WHERE pi.registration_id = p_registration_id AND pi.status = 'completed'
      ) x), '[]'::jsonb),
    'devoluciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'payment_intent_id', d.payment_intent_id, 'order_number', d.order_number,
        'importe_cent', d.importe_cent, 'origen', d.origen, 'estado', d.estado,
        -- una 'pendiente' con más de 10 minutos ya no va a contestar
        'atascada', d.estado = 'pendiente' AND d.created_at < now() - interval '10 minutes',
        'motivo', d.motivo, 'cancelar', d.cancelar, 'notificar', d.notificar,
        'ds_response', d.ds_response, 'ds_authorisation_code', d.ds_authorisation_code,
        'error_code', d.error_code, 'created_at', d.created_at, 'resuelta_at', d.resuelta_at,
        'aviso_enviado_at', d.aviso_enviado_at
      ) ORDER BY d.created_at DESC)
      FROM devoluciones d WHERE d.registration_id = p_registration_id), '[]'::jsonb)
  );
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. get_organizer_race_summary: recaudación neta de devoluciones
-- ─────────────────────────────────────────────────────────────────────────
-- Solo cambia 'amt' (el importe de cada inscripción viva):
--   antes: pi.amount del ÚLTIMO cobro completado
--   ahora: suma de TODOS sus cobros completados menos lo devuelto ('hecha')
--          de esos cobros. Sin cobro individual, el importe de su lote de
--          equipo, como antes (los lotes aún no se devuelven desde Camberas).
-- Se resta por inscripción y no del último cobro: con un cobro duplicado, da
-- igual cuál de los dos se devuelva.
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
        -- Todos los cobros completados de la inscripción, netos de lo devuelto
        -- (importe_cent en céntimos, amount en euros: 100.0, no 100)
        (SELECT round(sum(pi.amount
                          - COALESCE((SELECT sum(d.importe_cent) FROM devoluciones d
                                       WHERE d.payment_intent_id = pi.id AND d.estado = 'hecha'), 0) / 100.0), 2)
           FROM payment_intents pi
          WHERE pi.registration_id = g.id AND pi.status = 'completed'),
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
  'Resumen de una carrera para su organizador. revenue_total es SOLO pasarela y NETO de devoluciones hechas (todos los cobros completados menos lo devuelto); lo cobrado a mano va en revenue_manual. Las inscripciones anuladas no cuentan, tampoco lo que se retuvo de ellas. Los nombres salen de la fila o, si no, del perfil.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. recogida_contexto: «entregados» con la misma condición que «total»
-- ─────────────────────────────────────────────────────────────────────────
-- La fila de entregas_dorsal NO se borra al anular: es el rastro de que el
-- dorsal físico salió de la mesa. Solo deja de contar en el marcador.
CREATE OR REPLACE FUNCTION public.recogida_contexto(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m      mesas_recogida%ROWTYPE;
  v_race races%ROWTYPE;
  v_num  integer;
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

  -- Orden de alta dentro de la carrera (desempate por id si coinciden)
  SELECT count(*) INTO v_num
  FROM mesas_recogida m2
  WHERE m2.race_id = m.race_id
    AND (m2.created_at, m2.id) <= (m.created_at, m.id);

  RETURN jsonb_build_object(
    'estado',      'ok',
    'mesa',        m.nombre,
    'mesa_numero', v_num,
    'race_id',     v_race.id,
    'race_name',   v_race.name,
    'race_date',   v_race.date,
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
               -- Misma condición que total: una anulada después de recoger
               -- no cuenta en ninguno de los dos
               count(e.id) FILTER (
                 WHERE r.status IS DISTINCT FROM 'cancelled'
                   AND r.payment_status IN ('paid', 'not_required')
               ) AS entregados
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

-- ─────────────────────────────────────────────────────────────────────────
-- 4. No borrar una inscripción con una devolución sin confirmar
-- ─────────────────────────────────────────────────────────────────────────
-- devoluciones.registration_id no tiene FK a propósito (la devolución sigue
-- como historia del cobro), pero una 'pendiente' o 'dudosa' todavía hay que
-- resolverla desde el diálogo de la inscripción: sin ella no hay forma.
-- SECURITY DEFINER: tiene que ver las devoluciones aunque quien borra no las
-- pueda leer (RLS solo de lectura para el admin).
CREATE OR REPLACE FUNCTION public.registrations_no_borrar_con_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM devoluciones d
             WHERE d.registration_id = OLD.id
               AND d.estado IN ('pendiente', 'dudosa')) THEN
    RAISE EXCEPTION 'La inscripción tiene una devolución sin confirmar: resuélvela (botón Devolver) antes de borrarla'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$fn$;

-- No es una RPC: nadie la llama directamente
REVOKE EXECUTE ON FUNCTION public.registrations_no_borrar_con_devolucion() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_registrations_no_borrar_con_devolucion ON public.registrations;
CREATE TRIGGER trg_registrations_no_borrar_con_devolucion
  BEFORE DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_no_borrar_con_devolucion();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Un cobro completado no deja de estarlo
-- ─────────────────────────────────────────────────────────────────────────
-- Una devolución no cambia el cobro: se apunta en devoluciones y el cobro
-- sigue 'completed' con su Ds_Response 0000 (devolucion_resolver no toca
-- payment_intents). Hoy (26-sep) ninguna función SQL actualiza
-- payment_intents, y el único que cambia su estado es redsys-webhook, que
-- desde 87db6a9 ya no saca un cobro de 'completed'. Esto frena al webhook
-- anterior, que con el aviso de la devolución (tipo 3, 0900) lo pasaba a
-- 'failed': el UPDATE entero falla (tampoco cambia completed_at ni
-- auth_code), el webhook lo apunta en su log y sigue; con un aviso no-0000
-- no hace nada más.
--
-- Corregir a mano un cobro mal apuntado (desde el editor SQL), en UNA sola
-- sentencia para que el permiso no salga de ella:
--   DO $x$ BEGIN
--     PERFORM set_config('camberas.permitir_descompletar_cobro', 'on', true);
--     UPDATE payment_intents SET status = '...' WHERE id = '...';
--   END $x$;
CREATE OR REPLACE FUNCTION public.payment_intents_no_descompletar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF COALESCE(current_setting('camberas.permitir_descompletar_cobro', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El cobro % ya está completado y no puede pasar a «%». Una devolución se apunta en devoluciones, no en el cobro',
    OLD.order_number, NEW.status
    USING ERRCODE = '23514';
END;
$fn$;

-- No es una RPC: nadie la llama directamente
REVOKE EXECUTE ON FUNCTION public.payment_intents_no_descompletar() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_payment_intents_no_descompletar ON public.payment_intents;
CREATE TRIGGER trg_payment_intents_no_descompletar
  BEFORE UPDATE OF status ON public.payment_intents
  FOR EACH ROW
  WHEN (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.payment_intents_no_descompletar();

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Una inscripción devuelta no vuelve a 'paid' sola
-- ─────────────────────────────────────────────────────────────────────────
-- Frena a todo el que no gestiona la carrera (Edge Functions con
-- service_role, cron, editor SQL y también el propio corredor, que por el
-- agujero de autoedición de registrations puede escribir su payment_status)
-- y solo si de esa inscripción ya se devolvió dinero ('hecha'). No alcanza:
--   · al admin ni al organizador de la carrera desde el panel
--     (puede_gestionar_carrera), que pueden volver a marcarla pagada;
--   · a eventbooking-sync (source 'external'): esas inscripciones no tienen
--     cobro en Camberas, así que tampoco devoluciones.
-- redsys-webhook de main ya se salta las 'refunded' (87db6a9): esto es para
-- el webhook anterior, que con un aviso de éxito repetido la confirmaba otra
-- vez. OJO: ese webhook viejo manda igualmente el correo de pago confirmado
-- y el push al organizador; eso solo lo quita desplegar el de main.
--
-- Corregir a mano desde el editor SQL: mismo DO con
-- set_config('camberas.permitir_repagar_devuelta', 'on', true).
--
-- SECURITY DEFINER: tiene que leer devoluciones (RLS solo de lectura para
-- el admin). auth.uid() lee la petición, no el rol, así que sigue sirviendo.
CREATE OR REPLACE FUNCTION public.registrations_no_repagar_devuelta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT COALESCE(public.puede_gestionar_carrera(OLD.race_id), false)
     AND COALESCE(current_setting('camberas.permitir_repagar_devuelta', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM devoluciones d
                 WHERE d.registration_id = OLD.id AND d.estado = 'hecha') THEN
    RAISE EXCEPTION 'La inscripción % está devuelta: solo el admin o el organizador pueden volver a darla por pagada',
      OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

-- No es una RPC: nadie la llama directamente
REVOKE EXECUTE ON FUNCTION public.registrations_no_repagar_devuelta() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_registrations_no_repagar_devuelta ON public.registrations;
CREATE TRIGGER trg_registrations_no_repagar_devuelta
  BEFORE UPDATE OF payment_status ON public.registrations
  FOR EACH ROW
  WHEN (OLD.payment_status = 'refunded' AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.registrations_no_repagar_devuelta();

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobación. Esperado:
--   devolucion_info                         anon f · authenticated t · service_role t
--   get_organizer_race_summary              anon f · authenticated t · service_role t
--   payment_intents_no_descompletar         anon f · authenticated f
--   recogida_contexto                       anon t · authenticated t · service_role t (la usa la mesa sin login)
--   registrations_no_borrar_con_devolucion  anon f · authenticated f
--   registrations_no_repagar_devuelta       anon f · authenticated f
-- Y los tres triggers, con tgenabled = 'O'.
-- ─────────────────────────────────────────────────────────────────────────
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('devolucion_info', 'get_organizer_race_summary', 'recogida_contexto',
                    'registrations_no_borrar_con_devolucion', 'payment_intents_no_descompletar',
                    'registrations_no_repagar_devuelta')
ORDER BY p.proname;

SELECT tgrelid::regclass AS tabla, tgname, tgenabled FROM pg_trigger
WHERE tgname IN ('trg_registrations_no_borrar_con_devolucion',
                 'trg_payment_intents_no_descompletar',
                 'trg_registrations_no_repagar_devuelta')
ORDER BY tgname;

-- ─────────────────────────────────────────────────────────────────────────
-- Tras la PRIMERA devolución real (la prueba de 1 €): el cobro sigue igual.
-- En los logs de redsys-webhook debe salir «Aviso de operación tipo 3 (0900)
-- del pedido …: no toca el cobro». Si sale «Error updating payment intent: El
-- cobro … ya está completado», el webhook desplegado es el ANTIGUO: la BD lo
-- ha frenado, pero hay que desplegar el de main. Cambiar el pedido:
--   SELECT pi.order_number, pi.status, pi.response_code, pi.auth_code,
--          pi.completed_at, pi.updated_at, d.estado, d.ds_response, d.created_at
--   FROM payment_intents pi JOIN devoluciones d ON d.payment_intent_id = pi.id
--   WHERE pi.order_number = '<pedido>';
-- Esperado: status 'completed', response_code '0000', y el mismo auth_code
-- y completed_at que antes de devolver (updated_at anterior a la devolución).
-- ─────────────────────────────────────────────────────────────────────────
