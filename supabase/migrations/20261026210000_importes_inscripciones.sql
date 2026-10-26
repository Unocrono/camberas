-- =============================================================================
-- importes_inscripciones: cuánto se ha cobrado de cada inscripción, para la
-- columna «Importe» de Gestión de Inscripciones (26-oct-2026).
--
-- La columna «Pago» solo dice si está pagada. Con la del importe se ve lo
-- cobrado y se nota un doble cobro como el del dorsal 43 de Monte Tejas
-- (dos cobros de 14 euros el 26-oct). payment_intents y devoluciones solo
-- los lee el admin (RLS), así que el organizador lo recibe por aquí.
--
-- Devuelve UN jsonb (no filas: PostgREST corta en 1.000) con una entrada por
-- inscripción que tenga algo que contar:
--   c  cobrado por la pasarela (cobros completados, también la parte de
--      cada inscripción en un lote de equipo, payment_intent_items)
--   n  número de cobros completados
--   d  devuelto (devoluciones hechas, por Redsys o apuntadas a mano)
--   m  cobrado a mano (registrations.importe_manual)
-- Sin p_race_id, todas las carreras que el usuario puede gestionar.
-- Entra el admin o quien gestiona la carrera (puede_gestionar_carrera).
--
-- SECURITY DEFINER: lee tablas cerradas por RLS, pero solo devuelve lo de las
-- carreras que el usuario gestiona. Cerrada a anon. No toca horas.
-- Ensayada en seco y APLICADA el 26-oct-2026.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.importes_inscripciones(p_race_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH ins AS (
    SELECT r.id, r.importe_manual
      FROM registrations r
     WHERE (p_race_id IS NULL OR r.race_id = p_race_id)
       AND auth.uid() IS NOT NULL
       AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.puede_gestionar_carrera(r.race_id))
  ),
  cobros AS (
    SELECT p.registration_id AS id, p.amount
      FROM payment_intents p JOIN ins ON ins.id = p.registration_id
     WHERE p.status = 'completed'
    UNION ALL
    -- Lote de equipo: un cobro con registration_id NULL y el reparto en items
    SELECT it.registration_id, it.amount
      FROM payment_intent_items it
      JOIN payment_intents p ON p.id = it.payment_intent_id
      JOIN ins ON ins.id = it.registration_id
     WHERE p.status = 'completed'
  ),
  cobrado AS (
    SELECT c.id, sum(c.amount) AS total, count(*) AS cobros FROM cobros c GROUP BY c.id
  ),
  devuelto AS (
    SELECT dv.registration_id AS id, round(sum(dv.importe_cent) / 100.0, 2) AS total
      FROM devoluciones dv JOIN ins ON ins.id = dv.registration_id
     WHERE dv.estado = 'hecha'
     GROUP BY dv.registration_id
  )
  SELECT COALESCE(jsonb_object_agg(i.id, jsonb_strip_nulls(jsonb_build_object(
           'c', co.total, 'n', co.cobros, 'd', de.total, 'm', i.importe_manual))), '{}'::jsonb)
    FROM ins i
    LEFT JOIN cobrado co ON co.id = i.id
    LEFT JOIN devuelto de ON de.id = i.id
   WHERE co.id IS NOT NULL OR de.id IS NOT NULL OR i.importe_manual IS NOT NULL;
$fn$;

REVOKE EXECUTE ON FUNCTION public.importes_inscripciones(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.importes_inscripciones(uuid) TO authenticated;

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

NOTIFY pgrst, 'reload schema';

-- Comprobación: anon no entra, authenticated sí
SELECT has_function_privilege('anon', 'public.importes_inscripciones(uuid)', 'EXECUTE') AS anon_puede,
       has_function_privilege('authenticated', 'public.importes_inscripciones(uuid)', 'EXECUTE') AS authenticated_puede;
