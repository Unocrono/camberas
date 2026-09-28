-- Gurriana (GT20 y GT40): «Número de licencia» dependía de que «¿Estás
-- federado?» valiera «Sí, tengo licencia en vigor», pero las opciones se
-- renombraron a «Si: Licencia de 2027» / «No, Licencia de día». Ningún valor
-- casaba y el campo no aparecía nunca. Se apunta la condición a la opción nueva.
UPDATE public.registration_form_fields
   SET depends_on_value = 'Si: Licencia de 2027'
 WHERE field_name = 'licencia'
   AND race_distance_id IN ('d4b0f6e3-8c2a-4f7b-8e1d-4a5b6c7d8e9f', 'e5c1a7f4-9d3b-4a8c-9f2e-5b6c7d8e9fa0')
   AND depends_on_value = 'Sí, tengo licencia en vigor';

-- Comprobación: las dos condiciones casan con una opción de «federado»
SELECT f.race_distance_id, f.field_name, f.depends_on_value,
       f.depends_on_value = ANY (ARRAY(SELECT jsonb_array_elements_text(c.field_options->'options'))) AS casa
  FROM public.registration_form_fields f
  JOIN public.registration_form_fields c ON c.id = f.depends_on_field_id
 WHERE f.field_name = 'licencia'
   AND f.race_distance_id IN ('d4b0f6e3-8c2a-4f7b-8e1d-4a5b6c7d8e9f', 'e5c1a7f4-9d3b-4a8c-9f2e-5b6c7d8e9fa0');
