-- =============================================================================
-- Web de la carrera, fase 1 (lo que necesita base de datos):
--
-- 1. Tipos de ítem del rutómetro para avituallamientos y aparcamientos:
--    «Avituallamiento líquido» (refreshment, antes «Punto hidratación», ahora
--    también para MTB), «Avituallamiento sólido y líquido» (aid_station, antes
--    «Avituallamiento», ahora con icono de cubiertos), y nuevos «Avituallamiento con opción sin gluten»
--    (aid_gluten_free) y «Aparcamiento» (parking). Solo cambian las etiquetas:
--    los nombres internos siguen igual y ningún punto cambia de tipo por esto.
-- 2. Gurriana: su rutómetro se alinea con el reglamento 2027 (Pico Piralba,
--    Prao Julio y Cortafuegos son líquidos) y los parkings pasan a
--    «Aparcamiento», para que salgan en «Cómo llegar».
-- 3. Gurriana: ritmos del rutómetro (roadbook_paces, ver src/lib/ritmos.ts).
--    Ritmo del primero = ganador de 2018 sobre los km del rutómetro:
--      GT20 2:02:14 / 20,515 km = 5:57 min/km · GT40 3:44:45 / 38,116 km = 5:54
--    Ritmo de corte = el que cumple todos los cortes oficiales de 2027:
--      GT20: meta en 7 h (20,515 km) = 20:28 min/km; así Cortafuegos cierra a
--            las 15:03, antes del corte de las 15:30.
--      GT40: Bustriguado a las 13:00 (4 h, km 21,1) = 11:22 min/km; así
--            Cortafuegos cierra a las 15:09 y la meta a las 16:13.
-- 4. evento_publico, por sustitución sobre la definición de producción:
--    a) el rutómetro de cada recorrido lleva sus ritmos ('ritmos');
--    b) 'clasificaciones' se fusiona (lo calculado + lo de la web) en vez de
--       que la web lo pise: así «anteriores» no borra el enlace a las de este
--       año.
-- 5. Gurriana: clasificaciones de 2016, 2017 y 2018 (resultados.uno.es).
-- 6. Gurriana: sección «Info práctica» encendida (Cómo llegar y FAQ).
--
-- No toca horas de carrera; termina con la guardia.
-- =============================================================================

-- 1. Tipos de ítem ------------------------------------------------------------
UPDATE public.roadbook_item_types SET label = 'Avituallamiento líquido', race_type = 'both' WHERE name = 'refreshment';
UPDATE public.roadbook_item_types SET label = 'Avituallamiento sólido y líquido', icon = 'Utensils' WHERE name = 'aid_station';

INSERT INTO public.roadbook_item_types (name, label, icon, race_type, is_active, display_order, description)
SELECT v.name, v.label, v.icon, 'both', true, v.orden, v.descr
FROM (VALUES
  ('aid_gluten_free', 'Avituallamiento con opción sin gluten', 'WheatOff', 4, 'Sólido y líquido, con productos sin gluten'),
  ('parking',         'Aparcamiento',                          'SquareParking', 8, 'Aparcamiento para corredores y público: sale en «Cómo llegar» de la web')
) AS v(name, label, icon, orden, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.roadbook_item_types t WHERE t.name = v.name);

-- 2. Rutómetro de Gurriana ----------------------------------------------------
UPDATE public.roadbook_items i
   SET item_type = 'parking',
       item_type_id = (SELECT id FROM public.roadbook_item_types WHERE name = 'parking')
  FROM public.roadbooks r
  JOIN public.race_distances d ON d.id = r.race_distance_id
 WHERE i.roadbook_id = r.id
   AND d.race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND i.item_type = 'poi'
   AND (i.description ILIKE 'parking%' OR i.description ILIKE 'aparcamiento%');

UPDATE public.roadbook_items i
   SET item_type = 'refreshment',
       item_type_id = (SELECT id FROM public.roadbook_item_types WHERE name = 'refreshment')
  FROM public.roadbooks r
  JOIN public.race_distances d ON d.id = r.race_distance_id
 WHERE i.roadbook_id = r.id
   AND d.race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND i.item_type = 'aid_station'
   AND (i.description ILIKE '%piralba%' OR i.description ILIKE '%prao julio%' OR i.description ILIKE '%cortafuego%');

-- 3. Ritmos de Gurriana -------------------------------------------------------
DELETE FROM public.roadbook_paces p
 USING public.roadbooks r, public.race_distances d
 WHERE p.roadbook_id = r.id AND d.id = r.race_distance_id
   AND d.race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND p.pace_order IN (1, 2);

INSERT INTO public.roadbook_paces (roadbook_id, pace_name, pace_order, pace_minutes_per_km)
SELECT r.id, v.nombre, v.orden, v.min_km
FROM public.roadbooks r
JOIN public.race_distances d ON d.id = r.race_distance_id
JOIN (VALUES
  ('GT20', 'Ritmo del primero', 1,  5 + 57/60.0),
  ('GT20', 'Ritmo de corte',    2, 20 + 28/60.0),
  ('GT40', 'Ritmo del primero', 1,  5 + 54/60.0),
  ('GT40', 'Ritmo de corte',    2, 11 + 22/60.0)
) AS v(prueba, nombre, orden, min_km) ON v.prueba = d.name
WHERE d.race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

-- 4. evento_publico por sustitución -------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.sustituir(p_fn regprocedure, p_patron text, p_nuevo text, p_n int)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE d text; n int;
BEGIN
  d := pg_get_functiondef(p_fn);
  SELECT count(*) INTO n FROM regexp_matches(d, p_patron, 'g');
  IF n <> p_n THEN
    RAISE EXCEPTION '%: se esperaban % apariciones y hay %', p_fn, p_n, n;
  END IF;
  EXECUTE regexp_replace(d, p_patron, p_nuevo, 'g');
END $f$;

-- a) ritmos del rutómetro
SELECT pg_temp.sustituir(
  'public.evento_publico(text)',
  $r$'id', r\.id, 'nombre', r\.name, 'descripcion', r\.description,$r$,
  $n$'id', r.id, 'nombre', r.name, 'descripcion', r.description,
                                      'ritmos', (SELECT jsonb_agg(jsonb_build_object(
                                                   'nombre', pc.pace_name, 'minKm', pc.pace_minutes_per_km, 'orden', pc.pace_order)
                                                 ORDER BY pc.pace_order)
                                         FROM roadbook_paces pc WHERE pc.roadbook_id = r.id),$n$,
  1);

-- b) clasificaciones: fuera del «la web pisa»...
SELECT pg_temp.sustituir(
  'public.evento_publico(text)',
  $r$- 'camiseta' - 'sanitario'\)$r$,
  $n$- 'camiseta' - 'sanitario' - 'clasificaciones')$n$,
  1);

-- ...y fusionadas: lo calculado (enlace a /live) + lo de la web (anteriores)
SELECT pg_temp.sustituir(
  'public.evento_publico(text)',
  $r$'infoPractica', NULLIF\(COALESCE\(calculado\.j->'infoPractica', '\{\}'::jsonb\) \|\| \(web\.inf - 'faq'\), '\{\}'::jsonb\)$r$,
  $n$'infoPractica', NULLIF(COALESCE(calculado.j->'infoPractica', '{}'::jsonb) || (web.inf - 'faq'), '{}'::jsonb),
                'clasificaciones', COALESCE(calculado.j->'clasificaciones', '{}'::jsonb)
                                   || CASE WHEN jsonb_typeof(web.c->'clasificaciones') = 'object' THEN web.c->'clasificaciones' ELSE '{}'::jsonb END$n$,
  1);

-- Guardia de horas: obligatoria tras tocar funciones
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- 5. Clasificaciones de años anteriores de Gurriana ---------------------------
UPDATE public.race_web
   SET contenido = jsonb_set(COALESCE(contenido, '{}'::jsonb), '{clasificaciones}',
         COALESCE(CASE WHEN jsonb_typeof(contenido->'clasificaciones') = 'object' THEN contenido->'clasificaciones' END, '{}'::jsonb)
         || jsonb_build_object('anteriores', jsonb_build_array(
              jsonb_build_object('anio', 2018, 'url', 'https://resultados.uno.es/results.aspx?CId=16479&RId=190'),
              jsonb_build_object('anio', 2017, 'url', 'https://resultados.uno.es/results.aspx?CId=16479&RId=126'),
              jsonb_build_object('anio', 2016, 'url', 'https://resultados.uno.es/results.aspx?CId=16479&RId=70'))))
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

-- 6. Gurriana: se enciende «Info práctica» en su portada (Cómo llegar con mapa y FAQ)
UPDATE public.race_web
   SET tema = jsonb_set(tema, '{secciones}',
         (SELECT jsonb_agg(CASE WHEN s->>'id' = 'info' THEN s || '{"activa": true}'::jsonb ELSE s END ORDER BY n)
            FROM jsonb_array_elements(tema->'secciones') WITH ORDINALITY AS e(s, n)))
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND jsonb_typeof(tema->'secciones') = 'array';

-- Comprobaciones ---------------------------------------------------------------
-- Tipos: los cuatro de avituallamiento y aparcamiento
SELECT name, label, icon, race_type FROM public.roadbook_item_types
 WHERE name IN ('refreshment', 'aid_station', 'aid_gluten_free', 'parking') ORDER BY display_order;
-- Gurriana: ritmos y clasificaciones anteriores (en las tablas: evento_publico
-- va justa de tiempo y no se llama aquí; la web lo comprueba al cargar)
SELECT d.name AS prueba, p.pace_name, p.pace_minutes_per_km
  FROM public.roadbook_paces p
  JOIN public.roadbooks r ON r.id = p.roadbook_id
  JOIN public.race_distances d ON d.id = r.race_distance_id
 WHERE d.race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
 ORDER BY d.name, p.pace_order;
SELECT contenido->'clasificaciones' AS clasificaciones FROM public.race_web
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
-- La sustitución quedó hecha: la definición lleva los ritmos y la fusión de clasificaciones
SELECT pg_get_functiondef('public.evento_publico(text)'::regprocedure) LIKE '%roadbook_paces%' AS ritmos_en_funcion,
       pg_get_functiondef('public.evento_publico(text)'::regprocedure) LIKE '%''clasificaciones'', COALESCE(calculado.j%' AS clasificaciones_fusionadas;
SELECT * FROM public.guardia_horas() WHERE nivel = 'FALLO';
