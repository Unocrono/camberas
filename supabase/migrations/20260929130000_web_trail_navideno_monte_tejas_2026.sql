-- =============================================================================
-- II Trail Navideño Monte Tejas 2026: datos del cartel, plantilla Navidad
-- Monte Tejas y rutómetro del GPX. Web propia DESACTIVADA
-- (camberas.com/trail-navideno-monte-tejas-2026).
--
-- SENTENCIAS SUELTAS, sin bloques DO ni cuerpos con dólares, y sin punto y
-- coma ni comillas en los comentarios: el editor SQL parte el texto por
-- sentencias y cortaba el bloque DO por la mitad (unterminated dollar-quoted
-- string, 29-sep). Cada sentencia es idempotente: se puede volver a ejecutar
-- entera.
--
-- 1. Datos del cartel de 2026, que corrigen lo trasladado de la I edición.
--    16 km (antes 15), 860 m D+ (antes 730) y 20 gnomos (antes 12). El GPX
--    de 2026 mide 16,65 km y unos 860 m D+, así que cuadra. El nombre ya se
--    cambió en el panel a II Trail Navideño Monte Tejas y aquí se alinean la
--    distancia, la web, el reglamento y la FAQ, que seguían con Trailvideño.
--    Tramos de asfalto y cierre (14:00) siguen siendo del reglamento de 2025
--    hasta que llegue el de 2026.
-- 2. Plantilla nueva Navidad Monte Tejas (navidad-monte-tejas, ver
--    src/plantillas/registro.ts). La estructura de Gurriana con el libro de
--    diseño del cartel (marca 0F2A1B, acción E0201F, secundario 2E7D32,
--    Oswald y Montserrat), cinta de bastón de caramelo y abetos al pie de la
--    portada. Se amplía el CHECK de race_web.plantilla y la web pasa a ella
--    con el tema vacío, así manda el libro de la plantilla. Lo que se toque
--    en el panel (Web propia, Diseño) se guarda encima.
-- 3. Contenido. Premios con el gancho del cartel, relato del recorrido
--    sacado del GPX, clasificaciones de 2025 (Sportmaniacs) y el cartel en
--    documentos. Fuera las sobras de la siembra: la edad salía dos veces y
--    contradiciéndose, Adheridos al delante de un texto que no es adhesión y
--    la entrega de premios repetida con la fila de las 14:15.
-- 4. Rutómetro con los km y coordenadas del GPX (16,65 km, circular, techo
--    de 482 m en el km 7,8). Avituallamientos en el cruce por el que se pasa
--    dos veces (km 5,5 y 12,1), donde estaban en 2025, PROVISIONALES hasta el
--    reglamento. Solo se crea si la distancia no tiene rutómetro. Los ritmos
--    del primero y del último van aparte, con los tiempos de 2025.
--
-- El GPX subido al panel el 29-sep es una RUTA (rtept) y los lectores de
-- Camberas solo leen tracks (trkpt). Hay que sustituirlo en el panel por la
-- versión track (public/gpx/trail-navideno-monte-tejas-2026.gpx, mismos
-- puntos) para que la web pinte perfil, mapa y vuelo 3D.
--
-- No toca funciones ni horas de carrera.
-- Requiere 20260925090000 (la carrera) y 20260928140000 (tipos del rutómetro).
-- Después, cuando se decida publicar, is_visible = true y activar la web en
-- Web propia, Publicar. Hasta entonces se ve con ?previa=1 (quien la gestiona).
-- =============================================================================

-- 2. Plantilla nueva en el CHECK (la lista es el registro del cliente)
ALTER TABLE public.race_web DROP CONSTRAINT IF EXISTS race_web_plantilla_check;
ALTER TABLE public.race_web ADD CONSTRAINT race_web_plantilla_check
  CHECK (plantilla IN ('gurriana', 'navidad-monte-tejas'));

-- 1. Carrera, distancia y meta de cronometraje (a la distancia del GPX, el
-- cartel redondea a 16)
UPDATE public.races SET
  subtitle    = 'Trail navideño de 16 km por el Monte Tejas · San Felices de Buelna',
  description = 'La carrera más festiva del año en San Felices de Buelna: 16 km de puro trail y 860 m de desnivel por las sendas del Monte Tejas. Veinte gnomos escondidos con premio, premios a los mejores disfraces (también de grupo) y música y ambiente en salida y meta. Ven disfrazado.'
WHERE id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';

UPDATE public.race_distances SET
  name = 'Trail Navideño 16 km', distance_km = 16, elevation_gain = 860, elevation_loss = 860
WHERE id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';

UPDATE public.race_checkpoints SET distance_km = 16.65
WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c' AND checkpoint_type = 'FINISH';

-- 1. Reglamento y FAQ
UPDATE public.race_regulation_sections s
   SET content = replace(s.content, 'II Trailvideño Monte Tejas', 'II Trail Navideño Monte Tejas')
  FROM public.race_regulations g
 WHERE g.id = s.regulation_id AND g.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND s.section_type = 'general_info';

UPDATE public.race_regulation_sections s
   SET content = replace(s.content,
         'Distancia única de 15 km con 730 m de desnivel positivo y 724 m de negativo.',
         'Distancia única de 16 km con 860 m de desnivel positivo, circular: se sale y se llega en la plaza del Ayuntamiento.')
  FROM public.race_regulations g
 WHERE g.id = s.regulation_id AND g.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND s.section_type = 'course';

UPDATE public.race_regulation_sections s
   SET content = replace(replace(s.content, 'Categorías (15 km)', 'Categorías (16 km)'), 'Gnomos: doce gnomos', 'Gnomos: veinte gnomos')
  FROM public.race_regulations g
 WHERE g.id = s.regulation_id AND g.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND s.section_type = 'classifications';

UPDATE public.race_faqs
   SET answer = replace(answer, 'Hay doce escondidos', 'Hay veinte escondidos')
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c' AND question = '¿Qué pasa con los gnomos?';

-- 2 y 3. Web propia: plantilla nueva con tema vacío y contenido. Solo las
-- claves que cambian, fundidas sobre lo que ya hay, y fuera las sobras
UPDATE public.race_web SET
  plantilla = 'navidad-monte-tejas',
  tema = '{}'::jsonb,
  contenido = ((COALESCE(contenido, '{}'::jsonb) || '{
    "nombreCorto": "Trail Navideño Monte Tejas",
    "premios": [
      {"categoria": "Gnomos", "premio": "20 gnomos con premio", "texto": "Escondidos por el monte, medio a la vista. Si encuentras uno, llévalo hasta meta: solo uno por persona. Qué premio tiene cada gnomo se desvela al dar la salida. Coger dos o más, o cambiarlos de sitio, es eliminación."},
      {"categoria": "Disfraces individuales", "premio": "3 mejores disfraces", "texto": "Premio para los tres mejores. El jurado es la organización."},
      {"categoria": "Disfraz grupal", "premio": "Mejor disfraz de grupo", "texto": "Venid en cuadrilla con una temática común: hay premio para el mejor grupo."},
      {"categoria": "Absoluta masculina y femenina", "premio": "Trofeos", "texto": "Para los primeros de la general masculina y femenina."}
    ],
    "programa": [
      {"fecha": "2026-12-13", "hora": "08:30", "horaFin": "10:00", "titulo": "Recogida de dorsales", "lugar": "Plaza del Ayuntamiento, San Felices de Buelna"},
      {"fecha": "2026-12-13", "hora": "14:00", "titulo": "Cierre de control"},
      {"fecha": "2026-12-13", "hora": "14:15", "titulo": "Entrega de premios y sorteos", "lugar": "Zona de meta"}
    ],
    "servicios": [
      {"nombre": "Ambiente de fiesta", "texto": "Música y animación en salida y meta. Ven disfrazado: hay premio individual y de grupo."},
      {"nombre": "Comida de llegada", "texto": "Para todos los participantes al terminar la prueba."},
      {"nombre": "Avituallamiento de meta", "texto": "Fuera de la zona de meta, con comida y bebida."},
      {"nombre": "Sorteos", "texto": "Todos los inscritos entran en los sorteos."},
      {"nombre": "Asistencia sanitaria", "texto": "Ambulancia de soporte vital básico con médico y técnicos desde media hora antes de la salida."}
    ],
    "pruebas": [
      {"id": "b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d",
       "descripcion": "16 km de puro trail y 860 m de desnivel por las sendas del Monte Tejas. Sales y llegas en la plaza del Ayuntamiento de San Felices de Buelna y, por el camino, hay veinte gnomos escondidos con premio.",
       "relato": "Sales de la plaza del Ayuntamiento y los primeros kilómetros, por el pueblo y el parque de la Lama, son para calentar: un repecho hasta los 180 m y poco más. Son los mismos que harás al revés para volver a meta.\nEn el km 2,3 empieza el monte de verdad: primera subida hasta los 370 m del km 4,2 y bajada hasta el cruce del km 5,5, la zona de avituallamiento. Por ese mismo cruce volverás a pasar en el km 12.\nLuego viene lo gordo: casi 300 m de desnivel en 2,4 km hasta el techo de la carrera, 482 m en el km 7,8. Desde arriba casi todo es bajar, con dos repechos para que no te duermas (km 10,7 y km 13,3), hasta enganchar el camino de ida y entrar en la plaza por donde saliste.\nY mira bien a los lados: hay veinte gnomos escondidos.",
       "marcaje": "Cintas y banderines naranjas",
       "color": "#E0201F"}
    ],
    "edicionesAnteriores": [
      {"anio": 2025, "url": "https://sportmaniacs.com/es/races/trail-navidentildeo-monte-tejas/6947ee3b-d118-426c-ab10-40ffac1f1ba4/results#rankings"}
    ],
    "seo": {
      "titulo": "II Trail Navideño Monte Tejas · 13 de diciembre · San Felices de Buelna",
      "descripcion": "16 km de trail navideño por el Monte Tejas, con 20 gnomos con premio y premios a los mejores disfraces. Domingo 13 de diciembre de 2026, 10:30 h, plaza del Ayuntamiento de San Felices de Buelna."
    }
  }'::jsonb) #- '{inscripcion,edadMinima}' #- '{medioAmbiente,adhesion}') - 'entregaPremios'
WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';

-- 3. El cartel, como documento del pie, si está subido
UPDATE public.race_web w
   SET contenido = w.contenido || jsonb_build_object('documentos',
         jsonb_build_array(jsonb_build_object('nombre', 'Cartel 2026', 'url', r.poster_url)))
  FROM public.races r
 WHERE w.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c' AND r.id = w.race_id AND r.poster_url IS NOT NULL;

-- 4. Rutómetro del GPX, solo si la distancia no tiene ninguno (rutómetro e
-- items en una sola sentencia)
WITH nuevo AS (
  INSERT INTO public.roadbooks (race_distance_id, name, description)
  SELECT 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d', 'Rutómetro Trail Navideño 16 km',
         'Km y coordenadas del GPX de 2026 (16,65 km medidos). Avituallamientos provisionales hasta el reglamento de 2026.'
  WHERE NOT EXISTS (SELECT 1 FROM public.roadbooks WHERE race_distance_id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d')
  RETURNING id
)
INSERT INTO public.roadbook_items
  (roadbook_id, item_order, item_type, item_type_id, description, km_total, km_partial, km_remaining,
   latitude, longitude, altitude, is_checkpoint, is_highlighted, notes)
SELECT nuevo.id, v.orden, v.tipo, t.id, v.descr, v.km, v.parcial, round(16.65 - v.km, 2),
       v.lat, v.lon, v.alt, false, true, v.nota
FROM nuevo
CROSS JOIN (VALUES
  (1, 'start',       'Salida · plaza del Ayuntamiento',          0.00,  0.00, 43.274942, -4.050007, 111, NULL),
  (2, 'refreshment', 'Avituallamiento líquido · cruce (ida)',    5.50,  5.50, 43.253482, -4.025467, 196, 'Provisional: el cruce por el que se pasa dos veces, donde estaba en 2025. Lleva tu vaso: no hay vasos.'),
  (3, 'poi',         'Techo del recorrido · 482 m',              7.80,  2.30, 43.239797, -4.025482, 482, 'Final de la subida más larga: casi 300 m de desnivel desde el km 5,5.'),
  (4, 'refreshment', 'Avituallamiento líquido · cruce (vuelta)', 12.10, 4.30, 43.253630, -4.025292, 188, 'Provisional: el cruce por el que se pasa dos veces, donde estaba en 2025. Lleva tu vaso: no hay vasos.'),
  (5, 'finish',      'Meta · plaza del Ayuntamiento',            16.65, 4.55, 43.274467, -4.050287, 112, NULL),
  (6, 'aid_station', 'Avituallamiento de meta',                  16.65, 0.00, 43.274467, -4.050287, 112, 'Fuera de la zona de meta, con comida y bebida.')
) AS v(orden, tipo, descr, km, parcial, lat, lon, alt, nota)
LEFT JOIN public.roadbook_item_types t ON t.name = v.tipo;

-- =============================================================================
-- Comprobación (una fila): plantilla, distancia, restos de Trailvideño o
-- 15 km (0 y false) y puntos del rutómetro (6)
-- =============================================================================
SELECT w.plantilla, w.tema,
       d.name AS distancia, d.distance_km,
       (SELECT count(*) FROM public.race_regulation_sections s JOIN public.race_regulations g ON g.id = s.regulation_id
         WHERE g.race_id = w.race_id AND (s.content ILIKE '%trailvide%' OR s.content LIKE '%15 km%')) AS restos_reglamento,
       (w.contenido::text ILIKE '%trailvide%' OR w.contenido::text LIKE '%15 km%') AS restos_web,
       (SELECT count(*) FROM public.roadbook_items i JOIN public.roadbooks r ON r.id = i.roadbook_id
         WHERE r.race_distance_id = d.id) AS puntos_rutometro
  FROM public.race_web w
  JOIN public.race_distances d ON d.race_id = w.race_id
 WHERE w.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
