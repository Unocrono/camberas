-- =============================================================================
-- Entre Viñedos 2026: fuera el campo «Talla de camiseta» duplicado.
--
-- El alta (20261017120000) añadió a la Carrera y a la Marcha un campo propio
-- 'talla_camiseta', pero el formulario ya trae el de sistema 'tshirt_size'
-- («Talla de Camiseta»), que es el que se guarda en registrations.tshirt_size
-- y el que rellena el sync de EventBooking. El duplicado salía dos veces en el
-- formulario y como columna vacía en Inscripciones. No tiene respuestas
-- (comprobado el 17-oct: 0), así que se borra sin perder nada.
-- Idempotente.
-- =============================================================================
DELETE FROM public.registration_form_fields
 WHERE field_name = 'talla_camiseta'
   AND race_distance_id IN ('1792e56f-be42-49f2-9f78-f30aae1bc31f', '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c')
   AND NOT EXISTS (SELECT 1 FROM public.registration_responses rr WHERE rr.field_id = registration_form_fields.id);

-- Comprobación: 0 campos 'talla_camiseta' en Entre Viñedos
SELECT count(*) AS talla_duplicada
  FROM public.registration_form_fields f JOIN public.race_distances d ON d.id = f.race_distance_id
 WHERE d.race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c' AND f.field_name = 'talla_camiseta';
