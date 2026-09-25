-- Devoluciones de cobros Redsys desde el panel (solo admin)
--
-- Hasta ahora devolver era 100 % manual (portal Canales de Redsys) y Camberas
-- no guardaba rastro. Con esto:
--  · devoluciones: una fila por cada devolución pedida a Redsys, o por cada
--    una hecha fuera (en Canales) que se registra para que cuadre el tope.
--  · El dinero lo mueve la Edge Function redsys-devolucion (TransactionType 3
--    sobre el pedido original). La base de datos reserva, comprueba el tope y
--    apunta el resultado; nunca habla con Redsys.
--
-- Lo que impide devolver de más:
--  · El id de la fila lo genera el panel al abrir el diálogo: repetir la
--    misma petición (doble clic, reintento de red) devuelve la fila que ya
--    existe y no se vuelve a llamar a Redsys.
--  · Una sola devolución en curso ('pendiente' o 'dudosa') por cobro: índice
--    único parcial.
--  · Tope = lo firmado en el cobro (DS_MERCHANT_AMOUNT, en céntimos) menos lo
--    hecho y lo que está en curso, con el cobro bloqueado mientras se mira.
--  · 'dudosa' = no se sabe si Redsys la hizo (sin respuesta, firma que no
--    cuadra...). Nunca se reintenta sola: el admin mira Canales y la resuelve.
--
-- v1: cobros individuales con el TPV de UNO (secret_ref NULL). Los lotes de
-- equipo y los TPV propios quedan fuera; hoy no hay ninguno cobrado.
--
-- Editor SQL de Lovable: sentencias sueltas y cuerpos con $fn$.

CREATE TABLE IF NOT EXISTS public.devoluciones (
  id                    uuid PRIMARY KEY,
  payment_intent_id     uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
  -- Sin FK a propósito: si se borra la inscripción, la devolución sigue como
  -- historia del cobro. Además, una segunda FK hacia registrations daría a
  -- PostgREST otro camino payment_intents ↔ registrations y podría romper el
  -- embed registrations(*) que usa redsys-webhook.
  registration_id       uuid,
  order_number          text NOT NULL,
  importe_cent          integer NOT NULL CHECK (importe_cent > 0),
  origen                text NOT NULL DEFAULT 'redsys' CHECK (origen IN ('redsys', 'externa')),
  estado                text NOT NULL CHECK (estado IN ('pendiente', 'hecha', 'rechazada', 'dudosa')),
  motivo                text,
  cancelar              boolean NOT NULL DEFAULT true,
  notificar             boolean NOT NULL DEFAULT true,
  ds_response           text,
  ds_authorisation_code text,
  error_code            text,
  respuesta             jsonb,
  aviso_enviado_at      timestamptz,
  solicitada_por        uuid,
  resuelta_por          uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  resuelta_at           timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS devoluciones_una_en_curso
  ON public.devoluciones (payment_intent_id)
  WHERE estado IN ('pendiente', 'dudosa');

CREATE INDEX IF NOT EXISTS devoluciones_por_inscripcion
  ON public.devoluciones (registration_id);

ALTER TABLE public.devoluciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Devoluciones: lectura del admin" ON public.devoluciones;
CREATE POLICY "Devoluciones: lectura del admin"
  ON public.devoluciones FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Solo el servidor escribe: ni siquiera el admin puede insertar una fila
-- 'hecha' sin que se mueva dinero, ni borrar una reserva en curso
REVOKE ALL ON public.devoluciones FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.devoluciones TO authenticated;
GRANT ALL ON public.devoluciones TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Resolver: apunta el resultado y, si se hizo, deja la inscripción cuadrada
-- ─────────────────────────────────────────────────────────────────────────
-- pendiente → hecha | rechazada | dudosa   (respuesta de Redsys)
-- dudosa    → hecha | rechazada            (el admin tras mirar Canales)
-- hecha y rechazada son finales.
CREATE OR REPLACE FUNCTION public.devolucion_resolver(
  p_id          uuid,
  p_estado      text,
  p_ds_response text DEFAULT NULL,
  p_auth        text DEFAULT NULL,
  p_error_code  text DEFAULT NULL,
  p_respuesta   jsonb DEFAULT NULL,
  p_usuario     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_d  devoluciones%ROWTYPE;
BEGIN
  IF p_estado NOT IN ('hecha', 'rechazada', 'dudosa') THEN
    RAISE EXCEPTION 'Estado de devolución no válido: %', p_estado;
  END IF;

  SELECT * INTO v_d FROM devoluciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  IF v_d.estado IN ('hecha', 'rechazada')
     OR (v_d.estado = 'dudosa' AND p_estado = 'dudosa') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_resuelta', 'estado', v_d.estado);
  END IF;

  UPDATE devoluciones
  SET estado                = p_estado,
      ds_response           = COALESCE(p_ds_response, ds_response),
      ds_authorisation_code = COALESCE(p_auth, ds_authorisation_code),
      error_code            = COALESCE(p_error_code, error_code),
      -- Se acumula: una resolución a mano no borra lo que contestó Redsys
      respuesta             = CASE WHEN p_respuesta IS NULL THEN respuesta
                                   ELSE COALESCE(respuesta, '{}'::jsonb) || p_respuesta END,
      resuelta_por          = CASE WHEN p_estado = 'dudosa' THEN resuelta_por ELSE p_usuario END,
      resuelta_at           = CASE WHEN p_estado = 'dudosa' THEN resuelta_at ELSE now() END
  WHERE id = p_id;

  -- La inscripción solo cambia cuando el dinero ha salido de verdad, y solo
  -- si se pidió anularla. Sin anular (cortesía, cobro duplicado...) sigue
  -- 'paid': 'refunded' con la inscripción viva la dejaría sin plaza, sin
  -- recogida de dorsal y como pendiente de pago. Lo devuelto queda aquí.
  IF p_estado = 'hecha' AND v_d.registration_id IS NOT NULL AND v_d.cancelar THEN
    UPDATE registrations
    SET status = 'cancelled', payment_status = 'refunded'
    WHERE id = v_d.registration_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'estado', p_estado);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────
-- Reservar: comprueba el tope y deja la fila 'pendiente' ANTES de llamar a
-- Redsys. Con origen 'externa' (hecha en Canales) la da por hecha al momento.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.devolucion_reservar(
  p_id                uuid,
  p_payment_intent_id uuid,
  p_registration_id   uuid,
  p_importe_cent      integer,
  p_origen            text,
  p_motivo            text,
  p_cancelar          boolean,
  p_notificar         boolean,
  p_usuario           uuid,
  -- Lo devuelto + en curso que enseñaba el panel al confirmar: si ha cambiado
  -- (otra pestaña, otro admin, una respuesta que no llegó) no se sigue
  p_comprometido_visto integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pi           payment_intents%ROWTYPE;
  v_d            devoluciones%ROWTYPE;
  v_cobrado      integer;
  v_comprometido integer;
BEGIN
  IF p_origen NOT IN ('redsys', 'externa') THEN
    RAISE EXCEPTION 'Origen de devolución no válido: %', p_origen;
  END IF;

  -- El cobro bloqueado: dos reservas a la vez sobre el mismo pedido se turnan
  SELECT * INTO v_pi FROM payment_intents WHERE id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cobro_no_existe');
  END IF;

  -- Misma petición repetida (doble clic, reintento): la fila que ya hay
  SELECT * INTO v_d FROM devoluciones WHERE id = p_id;
  IF FOUND THEN
    IF v_d.payment_intent_id <> p_payment_intent_id OR v_d.importe_cent <> p_importe_cent THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'id_reutilizado');
    END IF;
    RETURN jsonb_build_object('ok', true, 'repetida', true, 'id', v_d.id, 'estado', v_d.estado,
                              'importe_cent', v_d.importe_cent, 'error_code', v_d.error_code,
                              'ds_response', v_d.ds_response);
  END IF;

  IF v_pi.status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cobro_no_completado');
  END IF;
  -- v1: solo cobros individuales de esa inscripción, no lotes de equipo
  IF EXISTS (SELECT 1 FROM payment_intent_items WHERE payment_intent_id = p_payment_intent_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lote_equipo');
  END IF;
  IF p_registration_id IS NULL OR v_pi.registration_id IS DISTINCT FROM p_registration_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cobro_de_otra_inscripcion');
  END IF;
  IF v_pi.secret_ref IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tpv_propio');
  END IF;

  -- Una 'pendiente' de hace más de 10 minutos es que la función murió a medias:
  -- no se sabe si Redsys la hizo
  UPDATE devoluciones
  SET estado = 'dudosa', error_code = COALESCE(error_code, 'CAMBERAS_SIN_RESPUESTA')
  WHERE payment_intent_id = p_payment_intent_id
    AND estado = 'pendiente'
    AND created_at < now() - interval '10 minutes';

  IF EXISTS (SELECT 1 FROM devoluciones
             WHERE payment_intent_id = p_payment_intent_id
               AND estado IN ('pendiente', 'dudosa')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'en_curso');
  END IF;

  v_cobrado := COALESCE((v_pi.merchant_params->>'DS_MERCHANT_AMOUNT')::integer,
                        round(v_pi.amount * 100)::integer);
  SELECT COALESCE(sum(importe_cent), 0) INTO v_comprometido
  FROM devoluciones
  WHERE payment_intent_id = p_payment_intent_id
    AND estado IN ('hecha', 'pendiente', 'dudosa');

  IF p_comprometido_visto IS NOT NULL AND p_comprometido_visto <> v_comprometido THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cambio_desde_que_abriste',
                              'comprometido_cent', v_comprometido);
  END IF;

  IF p_importe_cent IS NULL OR p_importe_cent < 1
     OR p_importe_cent > v_cobrado - v_comprometido THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'supera_disponible',
                              'disponible_cent', GREATEST(v_cobrado - v_comprometido, 0));
  END IF;

  INSERT INTO devoluciones (id, payment_intent_id, registration_id, order_number, importe_cent,
                            origen, estado, motivo, cancelar, notificar, solicitada_por)
  VALUES (p_id, p_payment_intent_id, p_registration_id, v_pi.order_number, p_importe_cent,
          p_origen, 'pendiente', NULLIF(trim(p_motivo), ''), COALESCE(p_cancelar, true),
          COALESCE(p_notificar, true), p_usuario);

  IF p_origen = 'externa' THEN
    PERFORM devolucion_resolver(p_id, 'hecha', NULL, NULL, NULL,
                                jsonb_build_object('externa', true), p_usuario);
    RETURN jsonb_build_object('ok', true, 'id', p_id, 'estado', 'hecha', 'importe_cent', p_importe_cent);
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'id',           p_id,
    'estado',       'pendiente',
    'importe_cent', p_importe_cent,
    'order_number', v_pi.order_number,
    'fuc',          COALESCE(v_pi.merchant_params->>'DS_MERCHANT_MERCHANTCODE', v_pi.merchant_code),
    'terminal',     COALESCE(v_pi.merchant_params->>'DS_MERCHANT_TERMINAL', '1'),
    'cobrado_cent', v_cobrado
  );
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────
-- Info para el diálogo del panel (solo admin): cobros, lo devuelto, lo que
-- queda, la política de la carrera y el historial
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
  -- canceló el corredor)
  v_dias := v_reg.fecha_carrera - current_date;
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

-- Permisos: cerrar de las tres formas y abrir solo a quien toca
REVOKE EXECUTE ON FUNCTION public.devolucion_resolver(uuid, text, text, text, text, jsonb, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.devolucion_resolver(uuid, text, text, text, text, jsonb, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.devolucion_reservar(uuid, uuid, uuid, integer, text, text, boolean, boolean, uuid, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.devolucion_reservar(uuid, uuid, uuid, integer, text, text, boolean, boolean, uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.devolucion_info(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.devolucion_info(uuid) TO authenticated, service_role;

-- Comprobación (esperado: anon f en las tres; authenticated t solo en info)
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('devolucion_resolver', 'devolucion_reservar', 'devolucion_info')
ORDER BY p.proname;
