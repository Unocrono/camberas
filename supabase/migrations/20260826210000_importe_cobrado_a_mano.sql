-- Que se sepa de dónde viene el dinero, y que no se pierda por el camino
--
-- Lo levantó el usuario al dar de alta a alguien a mano: si le cobras 30 € en
-- la carpa y marcas la inscripción como pagada, esos 30 € NO aparecen en
-- ninguna cifra. Y no hay dónde anotarlos: registrations no tiene ninguna
-- columna de importe (solo coupon_discount y team_discount).
--
-- El motivo es que get_organizer_race_summary saca la recaudación
-- exclusivamente de payment_intents:
--
--   (select pi.amount from payment_intents pi
--     where pi.registration_id = g.id and pi.status='completed' limit 1) as amt
--
-- Un alta manual no crea ningún payment_intent, así que amt es NULL y suma 0.
-- El panel acaba diciendo "Alta manual · 1 inscripción · 1 pagada · 0 €", que
-- no parece una decisión: parece un fallo.
--
-- DECISIÓN TOMADA: el dinero cobrado fuera de la pasarela se registra y se
-- muestra, pero APARTE. La cifra de "Recaudación" sigue siendo la de la
-- pasarela, que es la única que Camberas puede verificar y sobre la que
-- factura comisión; mezclarla con dinero declarado la vuelve inservible para
-- eso, que es su trabajo principal.
--
-- Y ya que se toca la función, se arreglan dos cosas más de la misma familia
-- —dinero que existe y no se ve— que salieron en la revisión de la cesión:
--
--  1. Los LOTES DE EQUIPO no contaban. En un lote, payment_intents.
--     registration_id es NULL y los importes viven en payment_intent_items
--     (ver team-init-payment). O sea que toda inscripción de equipo aportaba
--     0 € a la recaudación, aunque estuviera cobrada de verdad por la pasarela.
--     Esto no es un matiz: es recaudación real que el organizador no veía.
--  2. El `limit 1` iba SIN `order by`, así que con más de un intent completado
--     —un reintento, una cesión— cogía uno cualquiera. Ahora coge el último.

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS importe_manual numeric
    CHECK (importe_manual IS NULL OR importe_manual >= 0);

COMMENT ON COLUMN public.registrations.importe_manual IS
  'Importe cobrado FUERA de la pasarela (en mano, transferencia) en un alta manual. No suma a la recaudación de pasarela: se muestra aparte.';

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
      -- Lo cobrado por la PASARELA. Dos formas de cobrar y las dos cuentan:
      -- el cargo suelto (payment_intents.registration_id) y la parte que le
      -- toca dentro de un lote de equipo (payment_intent_items).
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
    -- Cobrado fuera de la pasarela. Va en su propia cifra a proposito: no se
    -- suma a revenue_total ni se resta, se ensena al lado.
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
        SELECT r.first_name, r.last_name, r.created_at, r.payment_status, r.bib_number,
               r.source, d.name AS distance_name,
               COALESCE(r.amt, r.importe_manual) AS amount
        FROM reg r JOIN race_distances d ON d.id = r.race_distance_id
        ORDER BY r.created_at DESC LIMIT 15) x)
  ) INTO v_res;

  RETURN v_res;
END;
$fn$;

COMMENT ON FUNCTION public.get_organizer_race_summary(uuid) IS
  'Resumen de una carrera para su organizador. revenue_total es SOLO pasarela (cargo suelto + parte del lote de equipo); lo cobrado a mano va en revenue_manual.';

REVOKE EXECUTE ON FUNCTION public.get_organizer_race_summary(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_organizer_race_summary(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobacion: en una carrera con inscripciones de equipo pagadas,
-- revenue_total tiene que subir respecto a antes de esta migracion. Si no
-- sube, es que esa carrera no tiene lotes de equipo cobrados.
--   SELECT get_organizer_race_summary('<race_id>');
-- ─────────────────────────────────────────────────────────────────────────
