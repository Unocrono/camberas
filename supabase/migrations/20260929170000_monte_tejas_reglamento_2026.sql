-- =============================================================================
-- II Trail Navideño Monte Tejas 2026: lo que trae el reglamento oficial de
-- 2026 (PDF del organizador, 29-sep) sobre lo que ya había en Camberas
-- (20260929130000), y la portada con foto.
--
-- SENTENCIAS SUELTAS, sin bloques DO ni cuerpos con dólares (el editor SQL
-- los parte). Todas se pueden volver a ejecutar.
--
-- 1. Recorrido: desnivel negativo 840 m (reglamento) y altitudes del GPX de
--    2026 (mínima 110 m, máxima 482 m).
-- 2. Categoría: el reglamento solo tiene Absoluta (masculina y femenina)
--    desde 16 años. La UNICA sembrada pasa a llamarse Absoluta.
-- 3. Reglamento por secciones: material obligatorio con gorro navideño y
--    crampones, y el segundo avituallamiento en el km 12 (el texto decía 10;
--    el rutómetro ya lo tiene en el 12,1).
-- 4. Ritmos del rutómetro: primero 5:03 min/km (ganador de 2025, 1:15:53 en
--    15 km, Sportmaniacs) y corte 12:37 min/km (cierre de control a las 14:00,
--    3 h 30 min para los 16,65 km del GPX).
-- 5. Portada con la foto del cartel (corredores disfrazados en el arroyo),
--    public/fotos/monte-tejas/portada.webp.
--
-- NO se tocan precio, cierre de inscripciones ni plazo de devoluciones: el
-- PDF dice 14 €, cierre el 1 de diciembre a las 24:00 y devoluciones hasta
-- el 1 de diciembre, y Camberas tiene 13 €, cierre el 7 de diciembre y
-- devoluciones hasta el 2 (del mensaje del organizador). Al final van
-- comentadas para aplicarlas si el organizador lo confirma.
-- =============================================================================

-- 1. Recorrido
UPDATE public.race_distances
   SET elevation_loss = 840, alt_min = 110, alt_max = 482
 WHERE id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';

-- 2. Categoría Absoluta desde 16 años
UPDATE public.race_categories
   SET name = 'Absoluta', short_name = 'ABS', min_age = 16
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c' AND name = 'UNICA';

-- 3. Reglamento por secciones
UPDATE public.race_regulation_sections
   SET content = replace(content, E'• Zapatillas de trail.\n', E'• Zapatillas de trail.\n• Gorro navideño.\n• Crampones.\n')
 WHERE regulation_id = '847ca536-150b-4741-ad95-e9d4c65824f2'
   AND section_type = 'mandatory_gear'
   AND content NOT LIKE '%Gorro navideño%';

UPDATE public.race_regulation_sections
   SET content = replace(content, 'km 5,5 y km 10', 'km 5,5 y km 12')
 WHERE regulation_id = '847ca536-150b-4741-ad95-e9d4c65824f2'
   AND section_type = 'aid_stations';

UPDATE public.race_regulation_sections
   SET content = replace(content, '16 km con 860 m de desnivel positivo,', '16 km con 860 m de desnivel positivo y 840 m de negativo,')
 WHERE regulation_id = '847ca536-150b-4741-ad95-e9d4c65824f2'
   AND section_type = 'course';

-- 4. Ritmos del rutómetro
DELETE FROM public.roadbook_paces
 WHERE roadbook_id = 'ce1532c8-b80c-4cbd-b811-4a4f759983a8' AND pace_order IN (1, 2);

INSERT INTO public.roadbook_paces (roadbook_id, pace_name, pace_order, pace_minutes_per_km)
VALUES ('ce1532c8-b80c-4cbd-b811-4a4f759983a8', 'Ritmo del primero', 1, 5 + 3/60.0),
       ('ce1532c8-b80c-4cbd-b811-4a4f759983a8', 'Ritmo de corte',    2, 12 + 37/60.0);

-- 5. Portada con foto
UPDATE public.races
   SET cover_image_url = 'https://camberas.com/fotos/monte-tejas/portada.webp'
 WHERE id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';

UPDATE public.race_web
   SET tema = COALESCE(tema, '{}'::jsonb) || '{"hero": "foto", "heroPosicion": "center 40%"}'::jsonb
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';

-- Solo si el organizador confirma los datos del PDF (hoy NO se aplican):
-- UPDATE public.race_distance_prices SET price = 14 WHERE race_distance_id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
-- UPDATE public.race_distances SET price = 14, registration_closes = '2026-12-01T23:59:00+00' WHERE id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
-- UPDATE public.races SET registration_closes = '2026-12-01T23:59:00+00' WHERE id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';

-- Comprobaciones
SELECT name, distance_km, elevation_gain, elevation_loss, alt_min, alt_max, cutoff_time
  FROM public.race_distances WHERE id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
SELECT name, min_age, gender FROM public.race_categories WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
SELECT pace_name, pace_minutes_per_km FROM public.roadbook_paces WHERE roadbook_id = 'ce1532c8-b80c-4cbd-b811-4a4f759983a8' ORDER BY pace_order;
SELECT section_type, left(content, 120) FROM public.race_regulation_sections
 WHERE regulation_id = '847ca536-150b-4741-ad95-e9d4c65824f2' AND section_type IN ('mandatory_gear', 'aid_stations', 'course');
