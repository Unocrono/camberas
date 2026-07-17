-- La talla de camiseta se captura como campo personalizado del formulario
-- (registration_form_fields.field_name = 'tshirt_size') y sus respuestas van
-- a registration_responses — la columna registrations.tshirt_size quedaba
-- vacía y el widget "Tallas de Camiseta" del panel no veía nada.
--
-- A partir de ahora guest-register y RaceDetail copian la talla a la columna
-- al inscribirse; esto rellena las inscripciones ya existentes.
UPDATE public.registrations r
SET tshirt_size = rr.field_value
FROM public.registration_responses rr
JOIN public.registration_form_fields f ON f.id = rr.field_id
WHERE rr.registration_id = r.id
  AND f.field_name = 'tshirt_size'
  AND rr.field_value IS NOT NULL
  AND rr.field_value <> ''
  AND (r.tshirt_size IS NULL OR r.tshirt_size = '');
