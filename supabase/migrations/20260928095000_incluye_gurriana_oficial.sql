-- =============================================================================
-- Gurriana: «qué incluye la inscripción» con el texto oficial del reglamento
-- (GT20 y GT40), sustituyendo la lista aproximada del alta.
-- Solo toca race_web.contenido.inscripcion.incluye; no hay tabla para esto
-- (es una de las claves «solo web» del documento «Web propia de carrera»).
-- Idempotente.
-- =============================================================================

UPDATE public.race_web
   SET contenido = jsonb_set(
         contenido,
         '{inscripcion,incluye}',
         '["Bolsa de corredor", "Duchas", "Avituallamientos sólidos y líquidos durante la carrera", "Avituallamiento en meta", "Dorsal", "Comida post carrera", "Uso del dispositivo de seguridad", "Seguro de responsabilidad civil"]'::jsonb
       )
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

-- Comprobación
SELECT contenido->'inscripcion'->'incluye' AS incluye
  FROM public.race_web WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
