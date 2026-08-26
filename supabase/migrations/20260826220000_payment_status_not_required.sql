-- URGENTE: ninguna inscripción gratuita se podía crear
--
-- Sintoma: al inscribirse en un recorrido de precio 0, la web devuelve
-- "No se pudo crear la inscripción" y no entra nada. Pasa por todas las vías:
-- la web pública como invitado, la web con cuenta, y el "Añadir invitado" de
-- la app /org.
--
-- Causa, comprobada contra produccion con pg_constraint:
--
--   registrations_payment_status_check
--     CHECK (payment_status IN ('pending','paid','refunded'))
--
-- Falta 'not_required'. Y ese es justo el valor que escribe TODO el codigo
-- cuando una inscripcion no lleva pago: guest-register:279, RaceDetail:684,
-- OrgAddGuest, team-register... 30 apariciones en 17 ficheros. El CHECK viene
-- del esquema original (20251120135244:65) y nunca se amplio cuando se
-- introdujeron las inscripciones gratuitas y las altas manuales.
--
-- Diagnostico por comparacion, para que quede el rastro: la misma llamada a
-- guest-register sobre el mismo formulario, cambiando solo el recorrido:
--
--   Trail  (2 EUR) -> payment_status='pending'      -> success, id devuelto
--   Marcha (0 EUR) -> payment_status='not_required' -> "No se pudo crear"
--
-- La unica diferencia entre los dos caminos es ese valor.
--
-- Por que no ha saltado antes: casi todas las carreras cobran. Solo revienta
-- en recorridos gratuitos y en las altas de invitado, que son minoria — pero
-- cuando revienta, revienta entero y el mensaje no dice por que.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.registrations'::regclass
    AND conname = 'registrations_payment_status_check';

  RAISE NOTICE 'CHECK anterior: %', COALESCE(v_def, '(no habia)');
END
$$;

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_payment_status_check;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'refunded', 'not_required'));

COMMENT ON COLUMN public.registrations.payment_status IS
  'pending | paid | refunded | not_required. not_required es lo que llevan las inscripciones sin pago: gratuitas, invitados y altas de la organizacion.';

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobacion: el CHECK nuevo debe incluir not_required
--
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.registrations'::regclass AND contype = 'c';
--
-- Y despues, la prueba de verdad: inscribirse en un recorrido gratuito desde
-- la web. Tiene que entrar sin error.
-- ─────────────────────────────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.registrations'::regclass
  AND contype = 'c'
ORDER BY conname;
