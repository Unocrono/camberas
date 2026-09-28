-- =============================================================================
-- Campos condicionales CON importe.
--
-- ⚠ EJECUTAR SOLO DESPUÉS DE DESPLEGAR estas cinco funciones:
--     guest-register, team-register, validate-coupon,
--     redsys-init-payment, team-init-payment
--   Hasta entonces, el servidor cobra los suplementos sin mirar condiciones y
--   quitar esta regla abriría el agujero que la motivó.
--
-- 20260923120000 prohibió que un campo condicional llevara importe porque
-- el servidor recalculaba el precio con las respuestas guardadas sin saber
-- de condiciones: alguien que manipulara la petición podía colar el valor de
-- un campo oculto con importe negativo. Ahora las cinco funciones calculan
-- con supabase/functions/_shared/suplementos.ts, que solo suma un campo si
-- está a la vista con las respuestas dadas (la misma regla que el
-- formulario, src/lib/fieldConditions.ts). Con eso la regla sobra.
--
-- Caso que lo pide: Gurriana, suplemento de 4 € del seguro de día que solo
-- aparece a quien responde que no está federado.
-- =============================================================================

ALTER TABLE public.registration_form_fields
  DROP CONSTRAINT IF EXISTS form_fields_condicional_sin_importe;

-- Comprobación: la regla ya no existe
SELECT count(*) AS reglas_restantes
  FROM pg_constraint
 WHERE conname = 'form_fields_condicional_sin_importe';
