-- =============================================================================
-- II Trail Navideño Monte Tejas 2026: datos del cartel y web propia
-- (camberas.com/trail-navideno-monte-tejas-2026), DESACTIVADA.
--
-- 1. Datos del cartel de 2026, que corrige lo trasladado de la I edición:
--    16 km (antes 15), 860 m D+ (antes 730; circular, así que el D− es el
--    mismo) y 20 gnomos (antes 12). El nombre ya se cambió en el panel a
--    «II Trail Navideño Monte Tejas»; aquí se alinean la distancia, la web,
--    el reglamento y la FAQ, que seguían diciendo «Trailvideño».
--    Lo demás (avituallamientos km 5,5 y 10, tramos de asfalto, cierre 14:00)
--    sigue siendo del reglamento de 2025 hasta que llegue el de 2026.
-- 2. Web propia como la de Gurriana (plantilla 'gurriana'), pero con los
--    colores del cartel y el tono de una carrera popular y de fiesta:
--      marca      #0F2A1B  verde casi negro del faldón del cartel
--      acción     #E0201F  rojo de «NAVIDEÑO»
--      secundario #2E7D32  verde de las cintas «FECHA / HORA / SALIDA»
--    Pasan los tres avisos de contraste del panel (texto sobre marca 15,4;
--    texto del botón 4,8; botón sobre marca 3,2). Sin «cinta de meta»: es el
--    arcoíris del logo de Gurriana. Premios (gnomos y disfraces) justo
--    después de los recorridos, que es lo que vende esta carrera.
--    Clasificaciones de 2025 (Sportmaniacs) en edicionesAnteriores.
-- 3. Rutómetro base para que la web pueda dar horas de paso: salida,
--    avituallamientos líquidos de la zona ida-vuelta (km de 2025,
--    PROVISIONALES), meta y avituallamiento de meta. Los ritmos del primero y
--    del último (roadbook_paces 1 y 2) van aparte, con los tiempos de 2025.
--
-- No toca funciones ni horas de carrera. Idempotente.
-- Requiere: 20260925090000 (la carrera) y 20260928140000 (tipos del rutómetro).
-- Después: poner is_visible = true y activar la web en Web propia › Publicar
-- cuando se decida; hasta entonces se ve con ?previa=1 (quien la gestiona).
-- =============================================================================

DO $seed$
DECLARE
  v_race uuid := 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
  v_dist uuid := 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
  v_reg  uuid;
  v_rb   uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.races WHERE id = v_race) THEN
    RAISE NOTICE 'No existe la carrera II Trail Navideño Monte Tejas (%)', v_race;
    RETURN;
  END IF;

  -- ---------------------------------------------------------------- carrera
  UPDATE public.races SET
    subtitle    = 'Trail navideño de 16 km por el Monte Tejas · San Felices de Buelna',
    description = 'La carrera más festiva del año en San Felices de Buelna: 16 km de puro trail y 860 m de desnivel por las sendas del Monte Tejas. Veinte gnomos escondidos con premio, premios a los mejores disfraces (también de grupo) y música y ambiente en salida y meta. Ven disfrazado.'
  WHERE id = v_race;

  -- -------------------------------------------------------------- distancia
  UPDATE public.race_distances SET
    name = 'Trail Navideño 16 km', distance_km = 16, elevation_gain = 860, elevation_loss = 860
  WHERE id = v_dist;

  UPDATE public.race_checkpoints SET distance_km = 16
  WHERE race_id = v_race AND checkpoint_type = 'FINISH';

  -- ------------------------------------------------------------- reglamento
  SELECT id INTO v_reg FROM public.race_regulations WHERE race_id = v_race LIMIT 1;
  IF v_reg IS NOT NULL THEN
    UPDATE public.race_regulation_sections
       SET content = replace(content, 'II Trailvideño Monte Tejas', 'II Trail Navideño Monte Tejas')
     WHERE regulation_id = v_reg AND section_type = 'general_info';
    UPDATE public.race_regulation_sections
       SET content = replace(content,
             'Distancia única de 15 km con 730 m de desnivel positivo y 724 m de negativo.',
             'Distancia única de 16 km con 860 m de desnivel positivo, circular: se sale y se llega en la plaza del Ayuntamiento.')
     WHERE regulation_id = v_reg AND section_type = 'course';
    UPDATE public.race_regulation_sections
       SET content = replace(replace(content,
             'Categorías (15 km)', 'Categorías (16 km)'),
             'Gnomos: doce gnomos', 'Gnomos: veinte gnomos')
     WHERE regulation_id = v_reg AND section_type = 'classifications';
  END IF;

  -- ------------------------------------------------------------------- FAQ
  UPDATE public.race_faqs
     SET answer = replace(answer, 'Hay doce escondidos', 'Hay veinte escondidos')
   WHERE race_id = v_race AND question = '¿Qué pasa con los gnomos?';

  -- ------------------------------------------------------------- web propia
  -- Tema completo (como lo guarda el panel). Contenido: solo las claves que
  -- cambian, fundidas sobre lo que ya hay.
  UPDATE public.race_web SET
    tema = $tema$
    {
      "colorMarca": "#0F2A1B",
      "colorAccion": "#E0201F",
      "colorSecundario": "#2E7D32",
      "fuenteDisplay": "Oswald",
      "fuenteTexto": "Montserrat",
      "radio": "20",
      "hero": "textura",
      "heroPosicion": "center 50%",
      "cinta": false,
      "cuentaAtras": true,
      "secciones": [
        {"id": "hero", "activa": true},
        {"id": "cifras", "activa": true},
        {"id": "cinta", "activa": false},
        {"id": "recorridos", "activa": true},
        {"id": "servicios", "activa": true},
        {"id": "inscripcion", "activa": true},
        {"id": "dia", "activa": true},
        {"id": "reglamento", "activa": true},
        {"id": "info", "activa": true},
        {"id": "medioambiente", "activa": true},
        {"id": "patrocinadores", "activa": true},
        {"id": "beneficiario", "activa": false},
        {"id": "premios", "activa": false},
        {"id": "camiseta", "activa": false}
      ]
    }
    $tema$::jsonb,
    contenido = COALESCE(contenido, '{}'::jsonb) || $json$
    {
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
        {"id": "b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d", "descripcion": "16 km de puro trail y 860 m de desnivel por las sendas del Monte Tejas. Sales y llegas en la plaza del Ayuntamiento de San Felices de Buelna y, por el camino, hay veinte gnomos escondidos con premio.", "marcaje": "Cintas y banderines naranjas", "color": "#E0201F"}
      ],
      "edicionesAnteriores": [
        {"anio": 2025, "url": "https://sportmaniacs.com/es/races/trail-navidentildeo-monte-tejas/6947ee3b-d118-426c-ab10-40ffac1f1ba4/results#rankings"}
      ],
      "seo": {
        "titulo": "II Trail Navideño Monte Tejas · 13 de diciembre · San Felices de Buelna",
        "descripcion": "16 km de trail navideño por el Monte Tejas, con 20 gnomos con premio y premios a los mejores disfraces. Domingo 13 de diciembre de 2026, 10:30 h, plaza del Ayuntamiento de San Felices de Buelna."
      }
    }
    $json$::jsonb
  WHERE race_id = v_race;

  -- Sobra de la siembra: la edad salía dos veces y contradiciéndose (la
  -- plantilla escribe «cumplidos el día de la prueba» con edadMinima; el
  -- reglamento dice el día anterior, que es la nota); «Adheridos al» delante
  -- de un texto que no es una adhesión; y la entrega de premios repetida con
  -- la fila de las 14:15 del programa
  UPDATE public.race_web
     SET contenido = ((contenido #- '{inscripcion,edadMinima}') #- '{medioAmbiente,adhesion}') - 'entregaPremios'
   WHERE race_id = v_race;

  -- El cartel, como documento del pie, si está subido
  UPDATE public.race_web w
     SET contenido = w.contenido || jsonb_build_object('documentos',
           jsonb_build_array(jsonb_build_object('nombre', 'Cartel 2026', 'url', r.poster_url)))
    FROM public.races r
   WHERE w.race_id = v_race AND r.id = v_race AND r.poster_url IS NOT NULL;

  -- --------------------------------------------------------------- rutómetro
  SELECT id INTO v_rb FROM public.roadbooks WHERE race_distance_id = v_dist ORDER BY created_at LIMIT 1;
  IF v_rb IS NULL THEN
    INSERT INTO public.roadbooks (race_distance_id, name, description)
    VALUES (v_dist, 'Rutómetro Trail Navideño 16 km',
            'Provisional: los avituallamientos están en los km del reglamento de 2025 hasta tener el reglamento y el GPX de 2026.')
    RETURNING id INTO v_rb;

    INSERT INTO public.roadbook_items
      (roadbook_id, item_order, item_type, item_type_id, description, km_total, km_partial, km_remaining, is_checkpoint, is_highlighted, notes)
    SELECT v_rb, v.orden, v.tipo, t.id, v.descr, v.km, v.parcial, 16 - v.km, false, true, v.nota
    FROM (VALUES
      (1, 'start',       'Salida · plaza del Ayuntamiento',                0.0,  0.0, NULL),
      (2, 'refreshment', 'Avituallamiento líquido · zona ida-vuelta (ida)', 5.5,  5.5, 'Km provisional (reglamento 2025). Lleva tu vaso: no hay vasos.'),
      (3, 'refreshment', 'Avituallamiento líquido · zona ida-vuelta (vuelta)', 10.0, 4.5, 'Km provisional (reglamento 2025). Lleva tu vaso: no hay vasos.'),
      (4, 'finish',      'Meta · plaza del Ayuntamiento',                  16.0, 6.0, NULL),
      (5, 'aid_station', 'Avituallamiento de meta',                        16.0, 0.0, 'Fuera de la zona de meta, con comida y bebida.')
    ) AS v(orden, tipo, descr, km, parcial, nota)
    LEFT JOIN public.roadbook_item_types t ON t.name = v.tipo;
  END IF;
END
$seed$;

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT name, distance_km, elevation_gain, elevation_loss FROM public.race_distances WHERE id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
-- Ningún texto de la carrera debería decir ya «Trailvideño» ni «15 km» (0 filas)
SELECT 'reglamento' AS donde, s.section_type FROM public.race_regulation_sections s
  JOIN public.race_regulations g ON g.id = s.regulation_id
 WHERE g.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c' AND (s.content ILIKE '%trailvide%' OR s.content LIKE '%15 km%')
UNION ALL
SELECT 'web', 'contenido' FROM public.race_web
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c' AND (contenido::text ILIKE '%trailvide%' OR contenido::text LIKE '%15 km%');
SELECT tema->>'colorMarca' AS marca, tema->>'colorAccion' AS accion, tema->>'fuenteDisplay' AS display, activa FROM public.race_web
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
SELECT i.item_order, i.item_type, i.description, i.km_total FROM public.roadbook_items i
  JOIN public.roadbooks r ON r.id = i.roadbook_id
 WHERE r.race_distance_id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d' ORDER BY i.item_order;
