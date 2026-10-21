-- Cambio de recorrido de una inscripción, en un solo paso (21-oct-2026).
--
-- El corredor que se apuntó por error a otro recorrido. Hasta hoy se cambiaba
-- el desplegable y nada más: el dorsal se quedaba en el rango del recorrido
-- viejo, el QR GPS en el recorrido viejo, las respuestas del formulario
-- huérfanas (y sumando suplementos) y el dinero sin cuadrar (caso Desafío
-- Sarrio, 20-oct). Decisiones del usuario:
--   - la diferencia se calcula con el precio del recorrido nuevo A LA FECHA
--     DE INSCRIPCIÓN (tramo vigente entonces + suplementos − cupón);
--   - si sale a cobrar: cobrado en mano (se suma a importe_manual) o se perdona;
--   - si sale a devolver: solo el ADMIN devuelve (redsys-devolucion); el
--     organizador la PIDE y queda aquí pendiente para el admin.
--
-- Piezas:
--   cambios_recorrido                      el registro (solo lectura para el panel)
--   cambio_recorrido_calculo(reg, hasta)   interna: comprobaciones y dinero
--   cambio_recorrido_info(reg, hasta)      vista previa para el diálogo
--   cambiar_recorrido(...)                 lo hace todo en una transacción
--   resolver_cambio_recorrido(...)         el admin cierra una devolución pedida
--
-- Horas: created_at es un instante real (UTC) → hora de pared de Madrid con
-- AT TIME ZONE 'Europe/Madrid'; los tramos de precio son hora de pared
-- guardada como +00 → se leen con AT TIME ZONE 'UTC' (regla de la casa).

-- ── 1. El registro ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cambios_recorrido (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id   uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  race_id           uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  desde_distance_id uuid REFERENCES public.race_distances(id) ON DELETE SET NULL,
  hasta_distance_id uuid REFERENCES public.race_distances(id) ON DELETE SET NULL,
  desde_nombre      text,
  hasta_nombre      text,
  dorsal_antes      integer,
  dorsal_despues    integer,
  qr                text CHECK (qr IN ('movido', 'nuevo', 'desactivado', 'sin_qr')),
  tipo_dinero       text CHECK (tipo_dinero IN ('tarjeta', 'mano', 'gratis', 'pendiente', 'externa')),
  pagado            numeric,
  precio_nuevo      numeric,
  diferencia        numeric,
  decision          text NOT NULL CHECK (decision IN (
                      'sin_diferencia', 'sin_cobro', 'pendiente_pago',
                      'cobrado_mano', 'perdonado',
                      'devolucion_pedida', 'devuelto', 'no_se_devuelve')),
  importe_decision  numeric CHECK (importe_decision IS NULL OR importe_decision >= 0),
  devuelto_fuera    boolean NOT NULL DEFAULT false,   -- devuelto sin pasar por devoluciones (efectivo, transferencia)
  nota              text,
  hecho_por         uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resuelto_por      uuid,
  resuelto_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cambios_recorrido_race ON public.cambios_recorrido (race_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cambios_recorrido_pendientes ON public.cambios_recorrido (decision) WHERE decision = 'devolucion_pedida';

ALTER TABLE public.cambios_recorrido ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cambios_recorrido FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.cambios_recorrido TO authenticated;
GRANT ALL ON public.cambios_recorrido TO service_role;
DROP POLICY IF EXISTS "cambios_recorrido_lectura" ON public.cambios_recorrido;
CREATE POLICY "cambios_recorrido_lectura" ON public.cambios_recorrido
  FOR SELECT TO authenticated USING (public.puede_gestionar_carrera(race_id));
-- Sin políticas de escritura: solo las RPC de abajo (SECURITY DEFINER)

-- ── 2. Precio de un recorrido a una hora de pared (tramo o precio base) ─────
CREATE OR REPLACE FUNCTION public.precio_recorrido_en(p_distance_id uuid, p_pared timestamp)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (SELECT p.price FROM race_distance_prices p
      WHERE p.race_distance_id = p_distance_id
        AND (p.start_datetime AT TIME ZONE 'UTC') <= p_pared
        AND (p.end_datetime   AT TIME ZONE 'UTC') >= p_pared
      ORDER BY p.start_datetime DESC
      LIMIT 1),
    (SELECT d.price FROM race_distances d WHERE d.id = p_distance_id),
    0)::numeric;
$fn$;

-- ── 3. Suplementos de los campos de un recorrido con las respuestas de una
--       inscripción emparejadas por field_name (como el formulario) ─────────
CREATE OR REPLACE FUNCTION public.suplemento_en_recorrido(p_registration_id uuid, p_distance_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_valores jsonb;
  v_total   numeric := 0;
  f         record;
  v_val     text;
  v_ctrl    record;
  v_ctrl_val text;
  v_idx     integer;
BEGIN
  -- Valores por field_name, de cualquier recorrido (el último gana)
  SELECT COALESCE(jsonb_object_agg(x.field_name, x.field_value), '{}'::jsonb)
    INTO v_valores
    FROM (SELECT DISTINCT ON (ff.field_name) ff.field_name, rr.field_value
            FROM registration_responses rr
            JOIN registration_form_fields ff ON ff.id = rr.field_id
           WHERE rr.registration_id = p_registration_id
           ORDER BY ff.field_name, (ff.race_distance_id = p_distance_id) DESC, rr.updated_at DESC NULLS LAST) x;

  FOR f IN
    SELECT * FROM registration_form_fields
     WHERE race_distance_id = p_distance_id
       AND field_type <> 'comment'
       AND jsonb_typeof(field_options) = 'object'
       AND (field_options ->> 'fee_enabled') = 'true'
  LOOP
    v_val := v_valores ->> f.field_name;
    CONTINUE WHEN v_val IS NULL OR btrim(v_val) = '';

    -- Condición: solo si el campo que manda tiene el valor pedido
    IF f.depends_on_field_id IS NOT NULL THEN
      SELECT field_name, field_type INTO v_ctrl FROM registration_form_fields WHERE id = f.depends_on_field_id;
      v_ctrl_val := v_valores ->> v_ctrl.field_name;
      IF v_ctrl.field_type = 'checkbox' THEN
        v_ctrl_val := CASE WHEN lower(coalesce(v_ctrl_val, '')) IN ('true', 'on', '1') THEN 'true' ELSE 'false' END;
      END IF;
      CONTINUE WHEN lower(btrim(coalesce(v_ctrl_val, ''))) IS DISTINCT FROM lower(btrim(coalesce(f.depends_on_value, '')));
    END IF;

    IF jsonb_typeof(f.field_options -> 'options') = 'array' AND jsonb_typeof(f.field_options -> 'fees') = 'array' THEN
      SELECT o.i - 1 INTO v_idx
        FROM jsonb_array_elements_text(f.field_options -> 'options') WITH ORDINALITY AS o(v, i)
       WHERE o.v = v_val LIMIT 1;
      IF v_idx IS NOT NULL THEN
        v_total := v_total + COALESCE(NULLIF(f.field_options -> 'fees' ->> v_idx, '')::numeric, 0);
      END IF;
    ELSIF f.field_type = 'number' THEN
      IF v_val ~ '^\s*-?\d+([.,]\d+)?\s*$' THEN
        v_total := v_total + COALESCE((f.field_options ->> 'fee_amount')::numeric, 0) * replace(btrim(v_val), ',', '.')::numeric;
      END IF;
    ELSE
      IF lower(btrim(v_val)) IN ('true', 'on', '1') THEN
        v_total := v_total + COALESCE((f.field_options ->> 'fee_amount')::numeric, 0);
      END IF;
    END IF;
  END LOOP;
  RETURN round(v_total, 2);
END;
$fn$;

-- ── 4. Cálculo común (vista previa y cambio): comprobaciones y dinero ──────
CREATE OR REPLACE FUNCTION public.cambio_recorrido_calculo(p_registration_id uuid, p_hasta uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r          registrations%ROWTYPE;
  v_desde    race_distances%ROWTYPE;
  v_hasta    race_distances%ROWTYPE;
  v_pared    timestamp;
  v_bloqueo  text;
  v_avisos   text[] := '{}';
  v_tipo     text;
  v_tarjeta  numeric := 0;
  v_devuelto numeric := 0;
  v_mano     numeric := 0;
  v_pagado   numeric;
  v_cupon    numeric;
  v_p_nuevo  numeric;
  v_p_viejo  numeric;
  v_dif      numeric;
  v_plazas   integer;
  v_tok      record;
  v_cobros   integer := 0;
  v_tpv_uno  boolean := false;
  v_entregado boolean;
  v_lecturas integer;
  v_sync     boolean := false;
  v_base     numeric;
  v_supuesto boolean := false;
  v_ya_cobrado  numeric := 0;
  v_ya_devuelto numeric := 0;
  v_pendiente   numeric := 0;
  v_anula       numeric := 0;
BEGIN
  SELECT * INTO r FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'bloqueo', 'Inscripción no encontrada'); END IF;
  IF NOT public.puede_gestionar_carrera(r.race_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_desde FROM race_distances WHERE id = r.race_distance_id;
  SELECT * INTO v_hasta FROM race_distances WHERE id = p_hasta;

  -- Lo que impide el cambio
  IF v_hasta.id IS NULL OR v_hasta.race_id IS DISTINCT FROM r.race_id THEN
    v_bloqueo := 'El recorrido elegido no es de esta carrera';
  ELSIF v_hasta.id = r.race_distance_id THEN
    v_bloqueo := 'Ya está inscrito en ese recorrido';
  ELSIF r.status = 'cancelled' OR r.payment_status = 'refunded' THEN
    v_bloqueo := 'La inscripción está anulada o devuelta';
  ELSIF r.team_id IS NOT NULL OR EXISTS (SELECT 1 FROM payment_intent_items WHERE registration_id = r.id) THEN
    v_bloqueo := 'Es de una inscripción de equipo: el equipo entero va en un recorrido';
  ELSIF EXISTS (SELECT 1 FROM race_results WHERE registration_id = r.id) THEN
    v_bloqueo := 'Ya tiene resultados en su recorrido';
  END IF;

  -- Importadas con la sincronización en marcha: la devolvería al recorrido viejo
  IF v_bloqueo IS NULL AND r.external_id IS NOT NULL THEN
    IF r.external_id LIKE 'rts-%' THEN
      SELECT EXISTS (SELECT 1 FROM rockthesport_sync s WHERE s.race_id = r.race_id AND s.enabled) INTO v_sync;
      IF v_sync THEN v_bloqueo := 'Viene de RockTheSport y la sincronización está activa: cámbialo allí'; END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM eventbooking_sync s WHERE s.race_id = r.race_id AND s.enabled) INTO v_sync;
      IF v_sync THEN v_bloqueo := 'Viene de uno.es y la sincronización está activa: cámbialo allí'; END IF;
    END IF;
  END IF;

  -- Dinero
  v_pared := r.created_at AT TIME ZONE 'Europe/Madrid';
  v_cupon := COALESCE(r.coupon_discount, 0);
  v_p_nuevo := greatest(0, public.precio_recorrido_en(p_hasta, v_pared)
                           + public.suplemento_en_recorrido(r.id, p_hasta) - v_cupon);
  v_p_viejo := greatest(0, public.precio_recorrido_en(r.race_distance_id, v_pared)
                           + public.suplemento_en_recorrido(r.id, r.race_distance_id) - v_cupon);

  SELECT COALESCE(sum(pi.amount), 0), count(*), bool_and(pi.secret_ref IS NULL)
    INTO v_tarjeta, v_cobros, v_tpv_uno
    FROM payment_intents pi WHERE pi.registration_id = r.id AND pi.status = 'completed';
  SELECT round(COALESCE(sum(d.importe_cent), 0) / 100.0, 2) INTO v_devuelto
    FROM devoluciones d WHERE d.registration_id = r.id AND d.estado = 'hecha';
  v_mano := COALESCE(r.importe_manual, 0);

  -- Lo que movieron los cambios anteriores (ir y volver tiene que cuadrar):
  -- lo cobrado en mano suma; lo pedido para devolver y lo devuelto fuera de
  -- Camberas resta (lo devuelto por la pasarela ya está en devoluciones)
  SELECT COALESCE(sum(importe_decision) FILTER (WHERE decision = 'cobrado_mano'), 0),
         COALESCE(sum(importe_decision) FILTER (WHERE decision = 'devolucion_pedida'
                                                   OR (decision = 'devuelto' AND devuelto_fuera)), 0),
         COALESCE(sum(importe_decision) FILTER (WHERE decision = 'devolucion_pedida'), 0)
    INTO v_ya_cobrado, v_ya_devuelto, v_pendiente
    FROM cambios_recorrido WHERE registration_id = r.id;

  IF r.payment_status = 'pending' THEN
    v_tipo := 'pendiente';                     -- pagará el precio del recorrido nuevo
  ELSIF v_tarjeta > 0 THEN
    v_tipo := 'tarjeta';                       -- dinero real: cobros − devoluciones + en mano
    v_pagado := v_tarjeta - v_devuelto + v_mano - v_ya_devuelto;
  ELSE
    -- Sin cobro por la pasarela no se sabe lo pagado (1.296 altas «pagadas»
    -- sin importe en oct-2026): se toma lo que valía su recorrido ANTES del
    -- primer cambio (guardado en ese cambio), o lo anotado en mano, o su precio
    v_tipo := CASE WHEN r.external_id IS NOT NULL THEN 'externa'
                   WHEN r.payment_status = 'not_required' THEN 'gratis'
                   ELSE 'mano' END;
    SELECT c.pagado INTO v_base FROM cambios_recorrido c
     WHERE c.registration_id = r.id AND c.pagado IS NOT NULL AND c.tipo_dinero = v_tipo
     ORDER BY c.created_at LIMIT 1;
    IF v_base IS NULL THEN
      IF v_tipo = 'mano' AND r.importe_manual IS NOT NULL THEN
        v_base := r.importe_manual;
      ELSE
        v_base := v_p_viejo;                   -- invitado: cubre su recorrido
        v_supuesto := v_tipo <> 'gratis';
      END IF;
      v_pagado := v_base;
    ELSE
      v_supuesto := v_tipo <> 'gratis' AND COALESCE(r.importe_manual, 0) - v_ya_cobrado <= 0;
      v_pagado := v_base + v_ya_cobrado - v_ya_devuelto;
    END IF;
  END IF;
  IF v_pagado IS NOT NULL THEN
    v_pagado := round(v_pagado, 2);
    v_dif := round(v_p_nuevo - v_pagado, 2);
    IF v_tipo = 'gratis' THEN v_dif := greatest(0, v_dif); END IF;   -- a un invitado no se le devuelve
    -- Vuelve a un recorrido más caro con una devolución pedida sin hacer
    -- (el cambio era un error): primero se anula lo pedido, luego se cobra
    IF v_dif > 0 AND v_pendiente > 0 THEN
      v_anula := least(v_dif, v_pendiente);
      v_dif := v_dif - v_anula;
    END IF;
  END IF;

  -- Avisos (no impiden)
  v_plazas := public.plazas_libres(p_hasta);
  IF v_plazas IS NOT NULL AND v_plazas <= 0 THEN
    v_avisos := array_append(v_avisos, 'El recorrido nuevo está completo: se puede forzar');
  END IF;
  SELECT EXISTS (SELECT 1 FROM entregas_dorsal e WHERE e.registration_id = r.id) INTO v_entregado;
  IF v_entregado THEN
    v_avisos := array_append(v_avisos, 'Ya recogió el dorsal: si se cambia el número, hay que darle el dorsal físico nuevo');
  END IF;
  IF r.bib_number IS NOT NULL THEN
    SELECT count(*) INTO v_lecturas FROM timing_readings t
     WHERE t.race_id = r.race_id AND t.bib_number = r.bib_number;
    IF v_lecturas > 0 THEN
      v_avisos := array_append(v_avisos, ('Su dorsal tiene ' || v_lecturas || ' lecturas de cronometraje'));
    END IF;
  END IF;
  IF r.external_id IS NOT NULL AND NOT v_sync THEN
    v_avisos := array_append(v_avisos, 'Viene de otra plataforma: si hay que devolver o cobrar, se hace allí');
  END IF;

  SELECT t.id, t.device_id IS NOT NULL AS vinculado INTO v_tok
    FROM gps_tokens t
   WHERE t.event_id = r.race_distance_id AND t.active AND r.bib_number IS NOT NULL
     AND t.bib_number = r.bib_number::text
   ORDER BY t.created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'ok', v_bloqueo IS NULL,
    'bloqueo', v_bloqueo,
    'avisos', to_jsonb(v_avisos),
    'nombre', btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')),
    'desde', jsonb_build_object('id', v_desde.id, 'nombre', v_desde.name),
    'hasta', jsonb_build_object('id', v_hasta.id, 'nombre', v_hasta.name,
                                'bib_start', v_hasta.bib_start, 'bib_end', v_hasta.bib_end,
                                'next_bib', v_hasta.next_bib, 'gps', coalesce(v_hasta.gps_tracking_enabled, false)),
    'dorsal', r.bib_number,
    'entregado', v_entregado,
    'plazas_libres', v_plazas,
    'qr', CASE WHEN v_tok.id IS NULL THEN 'sin_qr' WHEN v_tok.vinculado THEN 'vinculado' ELSE 'libre' END,
    'dinero', jsonb_build_object(
      'tipo', v_tipo,
      'pagado', v_pagado,
      'pagado_supuesto', v_supuesto,             -- no consta lo cobrado: se da por pagado su precio
      'precio_viejo', v_p_viejo,
      'precio_nuevo', v_p_nuevo,
      'diferencia', v_dif,
      'cupon', v_cupon,
      'devolucion_pendiente', v_pendiente,       -- pedida al admin y sin hacer
      'anula_devolucion', v_anula,               -- lo que este cambio anula de ella
      -- Se puede devolver por tarjeta desde Camberas: un solo cobro, TPV de UNO
      'devolvible_tarjeta', v_tipo = 'tarjeta' AND v_cobros >= 1 AND coalesce(v_tpv_uno, false) AND (v_tarjeta - v_devuelto) > 0
    )
  );
END;
$fn$;

-- ── 5. Vista previa para el diálogo ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cambio_recorrido_info(p_registration_id uuid, p_hasta uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.cambio_recorrido_calculo(p_registration_id, p_hasta);
$fn$;

-- ── 6. El cambio, todo en una transacción ─────────────────────────────────
--   p_modo_dorsal: 'siguiente' (el siguiente libre del recorrido nuevo),
--                  'mismo', 'manual' (p_dorsal) o 'ninguno'
--   p_decision:    la del dinero (validada contra la diferencia calculada aquí)
CREATE OR REPLACE FUNCTION public.cambiar_recorrido(
  p_registration_id uuid,
  p_hasta uuid,
  p_modo_dorsal text,
  p_dorsal integer DEFAULT NULL,
  p_decision text DEFAULT NULL,
  p_importe numeric DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_forzar_plazas boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r          registrations%ROWTYPE;
  c          jsonb;
  v_dif      numeric;
  v_tipo     text;
  v_decision text;
  v_importe  numeric;
  v_bib      integer;
  v_qr       text := 'sin_qr';
  v_tok      gps_tokens%ROWTYPE;
  v_gps      boolean;
  resp       record;
  v_campo    uuid;
  v_cat      text;
  v_cambio   uuid;
  v_avisos   text[] := '{}';
  v_anula    numeric;
  pend       record;
BEGIN
  SELECT * INTO r FROM registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscripción no encontrada'; END IF;
  c := public.cambio_recorrido_calculo(p_registration_id, p_hasta);   -- comprueba permiso
  IF NOT (c ->> 'ok')::boolean THEN RAISE EXCEPTION '%', c ->> 'bloqueo'; END IF;
  IF (c ->> 'plazas_libres') IS NOT NULL AND (c ->> 'plazas_libres')::int <= 0 AND NOT coalesce(p_forzar_plazas, false) THEN
    RAISE EXCEPTION 'El recorrido nuevo está completo';
  END IF;
  IF p_modo_dorsal NOT IN ('siguiente', 'mismo', 'manual', 'ninguno') THEN
    RAISE EXCEPTION 'Modo de dorsal no válido';
  END IF;
  IF p_modo_dorsal = 'manual' AND (p_dorsal IS NULL OR p_dorsal <= 0) THEN
    RAISE EXCEPTION 'Falta el número de dorsal';
  END IF;

  -- El dinero: la decisión tiene que casar con la diferencia
  v_tipo := c -> 'dinero' ->> 'tipo';
  v_dif  := (c -> 'dinero' ->> 'diferencia')::numeric;
  IF v_tipo = 'pendiente' THEN
    v_decision := 'pendiente_pago';
  ELSIF v_dif IS NULL OR abs(v_dif) < 0.01 THEN
    v_decision := CASE WHEN v_tipo = 'gratis' THEN 'sin_cobro' ELSE 'sin_diferencia' END;
  ELSIF v_dif > 0 THEN
    IF p_decision NOT IN ('cobrado_mano', 'perdonado') THEN
      RAISE EXCEPTION 'Sale a cobrar %: elige «cobrado en mano» o «se perdona»', v_dif;
    END IF;
    v_decision := p_decision;
    IF v_decision = 'cobrado_mano' THEN
      v_importe := coalesce(p_importe, v_dif);
      IF v_importe <= 0 THEN RAISE EXCEPTION 'Pon lo cobrado'; END IF;
    END IF;
  ELSE
    IF v_tipo = 'externa' THEN
      IF p_decision IS DISTINCT FROM 'no_se_devuelve' THEN
        RAISE EXCEPTION 'Pagó en otra plataforma: la devolución, si procede, se hace allí';
      END IF;
    ELSIF p_decision NOT IN ('devolucion_pedida', 'no_se_devuelve') THEN
      RAISE EXCEPTION 'Sale a devolver %: elige «pedir devolución» o «no se devuelve»', -v_dif;
    END IF;
    v_decision := p_decision;
    IF v_decision = 'devolucion_pedida' THEN v_importe := -v_dif; END IF;
  END IF;

  -- 0) Lo que este cambio anula de una devolución pedida y sin hacer
  v_anula := COALESCE((c -> 'dinero' ->> 'anula_devolucion')::numeric, 0);
  FOR pend IN
    SELECT id, importe_decision FROM cambios_recorrido
     WHERE registration_id = r.id AND decision = 'devolucion_pedida'
     ORDER BY created_at DESC
     FOR UPDATE
  LOOP
    EXIT WHEN v_anula <= 0;
    IF pend.importe_decision <= v_anula THEN
      UPDATE cambios_recorrido
         SET decision = 'no_se_devuelve', resuelto_por = auth.uid(), resuelto_at = now(),
             nota = concat_ws(' · ', nota, 'anulada: volvió a un recorrido más caro')
       WHERE id = pend.id;
      v_anula := v_anula - pend.importe_decision;
    ELSE
      UPDATE cambios_recorrido
         SET importe_decision = importe_decision - v_anula,
             nota = concat_ws(' · ', nota, 'rebajada ' || v_anula || ' €: volvió a un recorrido más caro')
       WHERE id = pend.id;
      v_anula := 0;
    END IF;
  END LOOP;

  -- 1) Respuestas: al recorrido nuevo por field_name; sin pareja, fuera. La
  --    de la categoría se rehace al final con la categoría nueva
  FOR resp IN
    SELECT rr.id, ff.field_name
      FROM registration_responses rr
      JOIN registration_form_fields ff ON ff.id = rr.field_id
     WHERE rr.registration_id = r.id
       AND ff.race_distance_id IS DISTINCT FROM p_hasta
  LOOP
    v_campo := NULL;
    IF resp.field_name <> 'category' THEN
      SELECT f.id INTO v_campo FROM registration_form_fields f
       WHERE f.race_distance_id = p_hasta AND f.field_name = resp.field_name AND f.field_type <> 'comment'
       LIMIT 1;
    END IF;
    IF v_campo IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM registration_responses x WHERE x.registration_id = r.id AND x.field_id = v_campo) THEN
      UPDATE registration_responses SET field_id = v_campo WHERE id = resp.id;
    ELSE
      DELETE FROM registration_responses WHERE id = resp.id;
    END IF;
  END LOOP;

  -- 2) El recorrido (el trigger vuelve a calcular la categoría)
  UPDATE registrations
     SET race_distance_id = p_hasta,
         race_category_id = NULL,
         importe_manual = CASE WHEN v_decision = 'cobrado_mano'
                               THEN COALESCE(importe_manual, 0) + v_importe ELSE importe_manual END
   WHERE id = r.id;

  -- 3) El dorsal
  IF p_modo_dorsal = 'siguiente' THEN
    UPDATE registrations SET bib_number = NULL WHERE id = r.id;
    v_bib := public.asignar_dorsal_siguiente(r.id);
    IF v_bib IS NULL THEN
      v_avisos := array_append(v_avisos, 'El recorrido nuevo no tiene rango de dorsales libre: queda sin dorsal');
    END IF;
  ELSIF p_modo_dorsal = 'mismo' THEN
    v_bib := r.bib_number;
  ELSIF p_modo_dorsal = 'manual' THEN
    v_bib := p_dorsal;
    IF EXISTS (SELECT 1 FROM registrations x WHERE x.race_id = r.race_id AND x.bib_number = p_dorsal AND x.id <> r.id) THEN
      RAISE EXCEPTION 'El dorsal % ya lo tiene otro corredor de la carrera', p_dorsal;
    END IF;
    UPDATE registrations SET bib_number = p_dorsal WHERE id = r.id;
  ELSE
    v_bib := NULL;
    UPDATE registrations SET bib_number = NULL WHERE id = r.id;
  END IF;
  IF v_bib IS NOT NULL AND p_modo_dorsal <> 'siguiente'
     AND (c -> 'hasta' ->> 'bib_start') IS NOT NULL
     AND (v_bib < (c -> 'hasta' ->> 'bib_start')::int
          OR ((c -> 'hasta' ->> 'bib_end') IS NOT NULL AND v_bib > (c -> 'hasta' ->> 'bib_end')::int)) THEN
    v_avisos := array_append(v_avisos, ('El dorsal ' || v_bib || ' queda fuera del rango del recorrido nuevo ('
                             || (c -> 'hasta' ->> 'bib_start') || '–' || coalesce(c -> 'hasta' ->> 'bib_end', '…') || ')'));
  END IF;

  -- 4) El QR GPS del dorsal viejo: se mueve (o se rehace si ya estaba en un móvil)
  SELECT coalesce(gps_tracking_enabled, false) INTO v_gps FROM race_distances WHERE id = p_hasta;
  IF r.bib_number IS NOT NULL THEN
    SELECT * INTO v_tok FROM gps_tokens t
     WHERE t.event_id = r.race_distance_id AND t.active AND t.bib_number = r.bib_number::text
     ORDER BY t.created_at DESC LIMIT 1;
    IF v_tok.id IS NOT NULL THEN
      IF v_bib IS NULL OR NOT v_gps THEN
        UPDATE gps_tokens SET active = false WHERE id = v_tok.id;
        v_qr := 'desactivado';
      ELSIF v_tok.device_id IS NULL THEN
        UPDATE gps_tokens SET event_id = p_hasta, bib_number = v_bib::text WHERE id = v_tok.id;
        v_qr := 'movido';
      ELSE
        -- Ya vinculado a un móvil: la app guarda el recorrido viejo y no lo
        -- refresca al re-escanear el mismo QR. Uno nuevo y el viejo apagado
        UPDATE gps_tokens SET active = false WHERE id = v_tok.id;
        INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token, send_interval_seconds, name_tv)
        VALUES (true, v_bib::text, p_hasta, v_tok.participant_name, gen_random_uuid(),
                v_tok.send_interval_seconds, v_tok.name_tv);
        v_qr := 'nuevo';
      END IF;
    END IF;
  END IF;

  -- 5) La respuesta de la categoría, con la categoría nueva
  SELECT rc.name INTO v_cat FROM registrations x JOIN race_categories rc ON rc.id = x.race_category_id WHERE x.id = r.id;
  SELECT f.id INTO v_campo FROM registration_form_fields f
   WHERE f.race_distance_id = p_hasta AND f.field_name = 'category' LIMIT 1;
  IF v_cat IS NOT NULL AND v_campo IS NOT NULL THEN
    INSERT INTO registration_responses (registration_id, field_id, field_value)
    VALUES (r.id, v_campo, v_cat)
    ON CONFLICT (registration_id, field_id) DO UPDATE SET field_value = EXCLUDED.field_value;
  END IF;

  -- 6) El registro
  INSERT INTO cambios_recorrido (registration_id, race_id, desde_distance_id, hasta_distance_id,
                                 desde_nombre, hasta_nombre, dorsal_antes, dorsal_despues, qr,
                                 tipo_dinero, pagado, precio_nuevo, diferencia, decision,
                                 importe_decision, nota, hecho_por)
  VALUES (r.id, r.race_id, r.race_distance_id, p_hasta,
          c -> 'desde' ->> 'nombre', c -> 'hasta' ->> 'nombre', r.bib_number, v_bib, v_qr,
          v_tipo, (c -> 'dinero' ->> 'pagado')::numeric, (c -> 'dinero' ->> 'precio_nuevo')::numeric, v_dif,
          v_decision, v_importe, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  RETURNING id INTO v_cambio;

  RETURN jsonb_build_object(
    'ok', true,
    'cambio_id', v_cambio,
    'dorsal', v_bib,
    'categoria', v_cat,
    'qr', v_qr,
    'decision', v_decision,
    'importe', v_importe,
    'avisos', to_jsonb(v_avisos)
  );
END;
$fn$;

-- ── 7. El admin cierra una devolución pedida ──────────────────────────────
--   p_fuera: devuelto en efectivo o transferencia, sin pasar por devoluciones
CREATE OR REPLACE FUNCTION public.resolver_cambio_recorrido(p_cambio_id uuid, p_decision text, p_importe numeric DEFAULT NULL,
                                                            p_nota text DEFAULT NULL, p_fuera boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_actual text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el admin resuelve las devoluciones' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('devuelto', 'no_se_devuelve') THEN
    RAISE EXCEPTION 'Decisión no válida';
  END IF;
  SELECT decision INTO v_actual FROM cambios_recorrido WHERE id = p_cambio_id FOR UPDATE;
  IF v_actual IS NULL THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  IF v_actual <> 'devolucion_pedida' THEN RAISE EXCEPTION 'Ese cambio no tiene una devolución pendiente'; END IF;
  UPDATE cambios_recorrido
     SET decision = p_decision,
         importe_decision = CASE WHEN p_decision = 'devuelto' THEN coalesce(p_importe, importe_decision) ELSE importe_decision END,
         devuelto_fuera = (p_decision = 'devuelto' AND coalesce(p_fuera, false)),
         nota = CASE WHEN nullif(btrim(coalesce(p_nota, '')), '') IS NULL THEN nota
                     ELSE concat_ws(' · ', nota, btrim(p_nota)) END,
         resuelto_por = auth.uid(),
         resuelto_at = now()
   WHERE id = p_cambio_id;
END;
$fn$;

-- Permisos: solo con sesión (cada función comprueba admin u organizador)
REVOKE ALL ON FUNCTION public.precio_recorrido_en(uuid, timestamp) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suplemento_en_recorrido(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambio_recorrido_calculo(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambio_recorrido_info(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cambiar_recorrido(uuid, uuid, text, integer, text, numeric, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_cambio_recorrido(uuid, text, numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambio_recorrido_info(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_recorrido(uuid, uuid, text, integer, text, numeric, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolver_cambio_recorrido(uuid, text, numeric, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.precio_recorrido_en(uuid, timestamp) TO service_role;
GRANT EXECUTE ON FUNCTION public.suplemento_en_recorrido(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambio_recorrido_calculo(uuid, uuid) TO service_role;
