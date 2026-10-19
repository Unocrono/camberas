-- =============================================================================
-- II Trail Navideño Monte Tejas 2026: las inscripciones abren el 24 de
-- octubre a las 20:00, no el 1 de noviembre (organizador, 19-oct-2026).
--
-- El recorrido ya tenía la apertura nueva (puesta desde Recorridos), pero la
-- carrera seguía con la vieja, y de esa sale la cuenta atrás de la portada de
-- la web propia (evento_publico.inscripcion.apertura). Se ponen al día:
--   1. races.registration_opens (hora de pared, literal +00, como manda la
--      norma de horas del CLAUDE.md)
--   2. el tramo de precio que empezaba con la apertura vieja (14 euros, no
--      cambia el precio, solo desde cuándo vale)
--   3. el texto del plazo en la web propia (inscripcion.cierreTexto)
--   4. el reglamento: el plazo de inscripción y el inicio de las devoluciones
--
-- Sentencias sueltas e idempotentes, sin bloques DO. No toca funciones.
-- Ensayada en seco y APLICADA el 19-oct-2026.
-- =============================================================================

-- 1. Apertura de la carrera
UPDATE public.races
   SET registration_opens = '2026-10-24 20:00:00+00'
 WHERE id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND registration_opens IS DISTINCT FROM '2026-10-24 20:00:00+00';

-- 2. Tramo de precio que empezaba el 1 de noviembre a las 20:00
UPDATE public.race_distance_prices
   SET start_datetime = '2026-10-24 20:00:00+00'
 WHERE race_distance_id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d'
   AND start_datetime = '2026-11-01 20:00:00+00';

-- 3. Texto del plazo en la web propia
UPDATE public.race_web
   SET contenido = jsonb_set(contenido, '{inscripcion,cierreTexto}',
         to_jsonb(replace(contenido->'inscripcion'->>'cierreTexto', 'Del 1 de noviembre a las 20:00', 'Del 24 de octubre a las 20:00')))
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND contenido->'inscripcion'->>'cierreTexto' LIKE 'Del 1 de noviembre a las 20:00%';

-- 4. Reglamento: plazo de inscripción y devoluciones
UPDATE public.race_regulation_sections s
   SET content = replace(s.content, 'desde las 20:00 h del 1 de noviembre', 'desde las 20:00 h del 24 de octubre')
  FROM public.race_regulations g
 WHERE g.id = s.regulation_id AND g.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND s.section_type = 'registration' AND s.content LIKE '%desde las 20:00 h del 1 de noviembre%';

UPDATE public.race_regulation_sections s
   SET content = replace(s.content, 'desde el 1 de noviembre hasta', 'desde el 24 de octubre hasta')
  FROM public.race_regulations g
 WHERE g.id = s.regulation_id AND g.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND s.section_type = 'refund_policy' AND s.content LIKE '%desde el 1 de noviembre hasta%';

-- Comprobación (una fila): las dos aperturas, el tramo y los tres textos
SELECT r.registration_opens AS apertura_carrera,
       d.registration_opens AS apertura_recorrido,
       (SELECT string_agg(p.start_datetime::text || ' a ' || p.end_datetime::text || ' = ' || p.price, ' | ')
          FROM public.race_distance_prices p WHERE p.race_distance_id = d.id) AS tramos,
       (SELECT w.contenido->'inscripcion'->>'cierreTexto' FROM public.race_web w WHERE w.race_id = r.id) AS texto_web,
       (SELECT substring(s.content from 'Plazo: [^.]*') FROM public.race_regulation_sections s
          JOIN public.race_regulations g ON g.id = s.regulation_id
         WHERE g.race_id = r.id AND s.section_type = 'registration') AS reglamento_plazo,
       (SELECT s.content FROM public.race_regulation_sections s
          JOIN public.race_regulations g ON g.id = s.regulation_id
         WHERE g.race_id = r.id AND s.section_type = 'refund_policy') AS reglamento_devoluciones
  FROM public.races r JOIN public.race_distances d ON d.race_id = r.id
 WHERE r.id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
