-- =============================================================================
-- resumen_recuperacion_pagos: de los abandonos, cuántos acabaron pagando y
-- cuántos siguen sin pagar (26-oct-2026).
--
-- En la apertura de Monte Tejas la tarjeta «Abandonos» de /org decía 31 y
-- asustaba: la lista de recuperación es un histórico (entra quien lleva más
-- de 30 min sin completar el pago y no sale aunque luego pague) y 24 de esos
-- 31 habían pagado por su cuenta. «Rescatados» solo cuenta lo pagado después
-- del primer aviso, así que tampoco lo decía.
--
-- Dos columnas más, con la misma firma de entrada:
--   pagaron_al_final  abandonos cuya inscripción (o lote) acabó pagada, por
--                     el camino que fuera
--   siguen_sin_pagar  abandonos cuya inscripción sigue pendiente y no está
--                     cancelada (las canceladas ya no son nada que recuperar)
-- CREATE OR REPLACE no puede cambiar las columnas de RETURNS TABLE: DROP y
-- CREATE, y después los mismos permisos que tenía (authenticated; cerrada a
-- anon). Ensayada en seco y APLICADA el 26-oct-2026.
-- =============================================================================

DROP FUNCTION IF EXISTS public.resumen_recuperacion_pagos(uuid);

CREATE FUNCTION public.resumen_recuperacion_pagos(p_race_id uuid)
RETURNS TABLE(detectadas integer, avisadas integer, recuperadas integer, importe_recuperado numeric,
              pagaron_al_final integer, siguen_sin_pagar integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE rp.aviso_1_at IS NOT NULL)::integer,
    count(*) FILTER (
      WHERE rp.aviso_1_at IS NOT NULL AND rp.recuperado_at > rp.aviso_1_at
    )::integer,
    COALESCE(sum(cobro.importe) FILTER (
      WHERE rp.aviso_1_at IS NOT NULL AND rp.recuperado_at > rp.aviso_1_at
    ), 0),
    count(*) FILTER (WHERE estado.pagada)::integer,
    count(*) FILTER (WHERE estado.pendiente)::integer
  FROM recuperacion_pagos rp
  CROSS JOIN LATERAL (
    SELECT CASE rp.tipo
      WHEN 'individual' THEN (
        SELECT COALESCE(sum(pi.amount), 0)
        FROM payment_intents pi
        WHERE pi.registration_id = rp.registration_id
          AND pi.status = 'completed'
          AND pi.completed_at > rp.aviso_1_at
      )
      ELSE (
        SELECT COALESCE(sum(pii.amount), 0)
        FROM payment_intent_items pii
        JOIN payment_intents pi ON pi.id = pii.payment_intent_id
        JOIN registrations r    ON r.id  = pii.registration_id
        WHERE pi.status = 'completed'
          AND pi.completed_at > rp.aviso_1_at
          AND r.team_id = rp.team_id
          AND r.race_distance_id = rp.race_distance_id
      )
    END AS importe
  ) cobro
  CROSS JOIN LATERAL (
    -- Estado final de la inscripción (o del lote de equipo) que se abandonó
    SELECT CASE rp.tipo
      WHEN 'individual' THEN EXISTS (
        SELECT 1 FROM registrations r
        WHERE r.id = rp.registration_id
          AND r.status <> 'cancelled'
          AND r.payment_status IN ('paid', 'not_required'))
      ELSE EXISTS (
        SELECT 1 FROM registrations r
        WHERE r.team_id = rp.team_id AND r.race_distance_id = rp.race_distance_id
          AND r.status <> 'cancelled'
          AND r.payment_status IN ('paid', 'not_required'))
    END AS pagada,
    CASE rp.tipo
      WHEN 'individual' THEN EXISTS (
        SELECT 1 FROM registrations r
        WHERE r.id = rp.registration_id
          AND r.status <> 'cancelled'
          AND r.payment_status = 'pending')
      ELSE EXISTS (
        SELECT 1 FROM registrations r
        WHERE r.team_id = rp.team_id AND r.race_distance_id = rp.race_distance_id
          AND r.status <> 'cancelled'
          AND r.payment_status = 'pending')
    END AS pendiente
  ) estado
  WHERE rp.race_id = p_race_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    );
$fn$;

REVOKE EXECUTE ON FUNCTION public.resumen_recuperacion_pagos(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumen_recuperacion_pagos(uuid) TO authenticated;

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

NOTIFY pgrst, 'reload schema';

-- Comprobación: permisos como antes y, en Monte Tejas, detectadas =
-- pagaron_al_final + siguen_sin_pagar + canceladas
SELECT has_function_privilege('anon', 'public.resumen_recuperacion_pagos(uuid)', 'EXECUTE') AS anon_puede,
       has_function_privilege('authenticated', 'public.resumen_recuperacion_pagos(uuid)', 'EXECUTE') AS authenticated_puede;
