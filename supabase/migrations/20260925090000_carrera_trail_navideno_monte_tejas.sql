-- =============================================================================
-- Carrera: II Trailvideño Monte Tejas (San Felices de Buelna, Cantabria)
-- Alta completa a partir del reglamento de la I edición (21-12-2025):
-- carrera, distancia, precio, salida, categorías, reglamento por secciones,
-- FAQ, política de devolución y la web propia (race_web) con su libro de
-- diseño. Idempotente: se puede volver a ejecutar sin duplicar nada.
--
-- SUPUESTOS pendientes de confirmar con la organización (cambiar aquí o en
-- el panel): fecha 20-12-2026 (domingo, misma semana que la I edición),
-- edición «II», mismos precio (10 €), plazo (1 nov – 15 dic) y cupo (200).
--
-- Requiere aplicadas: 20260924170000_evento_publico_y_web.sql (race_web,
-- race_distances.kind…) y 20260924180000_web_propia_dominios_y_tpv.sql.
--
-- Después: asignar organizer_id / organizer_email en el panel (queda NULL),
-- subir cartel y logo, poner is_visible = true y race_web.activa = true
-- cuando se decida publicar.
-- =============================================================================

DO $seed$
DECLARE
  v_race     uuid := 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
  v_dist     uuid := 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
  v_reg      uuid;
  v_apertura timestamptz := '2026-11-01 20:00:00+01';
  v_cierre   timestamptz := '2026-12-15 23:59:59+01';
BEGIN
  -- ---------------------------------------------------------------- carrera
  INSERT INTO public.races (
    id, name, slug, subtitle, description, race_type, group_type, date, location,
    max_participants, registration_opens, registration_closes,
    is_visible, is_featured, es_demo, show_available_places, utc_offset, category_age_reference
  ) VALUES (
    v_race,
    'II Trailvideño Monte Tejas',
    'trail-navideno-monte-tejas-2026',
    'Trail navideño de 15 km por el Monte Tejas · San Felices de Buelna',
    'Trail navideño de 15 km en semi-autosuficiencia por las sendas y caminos mitológicos del Monte Tejas, en San Felices de Buelna. Con doce duendes escondidos en el recorrido y premio a los mejores disfraces.',
    'trail', 'carrera', '2026-12-20',
    'Plaza del Ayuntamiento, San Felices de Buelna (Cantabria)',
    200, v_apertura, v_cierre,
    false, false, false, false, 60, 'race_date'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
    description = EXCLUDED.description, race_type = EXCLUDED.race_type, date = EXCLUDED.date,
    location = EXCLUDED.location, max_participants = EXCLUDED.max_participants,
    registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes;

  -- -------------------------------------------------------------- distancia
  INSERT INTO public.race_distances (
    id, race_id, name, distance_km, elevation_gain, elevation_loss, price, max_participants,
    cutoff_time, start_location, finish_location, registration_opens, registration_closes,
    is_visible, display_order, bib_start, bib_end, kind, competitive, chip
  ) VALUES (
    v_dist, v_race, 'Trailvideño 15 km', 15, 730, 724, 10, 200,
    '3:30 h', 'Plaza del Ayuntamiento, San Felices de Buelna', 'Plaza del Ayuntamiento, San Felices de Buelna',
    v_apertura, v_cierre, true, 1, 1, 200, 'carrera', true, true
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, distance_km = EXCLUDED.distance_km, elevation_gain = EXCLUDED.elevation_gain,
    elevation_loss = EXCLUDED.elevation_loss, price = EXCLUDED.price, max_participants = EXCLUDED.max_participants,
    cutoff_time = EXCLUDED.cutoff_time, registration_opens = EXCLUDED.registration_opens,
    registration_closes = EXCLUDED.registration_closes, kind = EXCLUDED.kind;

  -- Precio único durante todo el plazo
  IF NOT EXISTS (SELECT 1 FROM public.race_distance_prices WHERE race_distance_id = v_dist) THEN
    INSERT INTO public.race_distance_prices (race_distance_id, price, start_datetime, end_datetime)
    VALUES (v_dist, 10, v_apertura, v_cierre);
  END IF;

  -- Salida única a las 10:30
  IF NOT EXISTS (SELECT 1 FROM public.race_waves WHERE race_distance_id = v_dist) THEN
    INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, start_time)
    VALUES (v_race, v_dist, 'Salida', '10:30');
  END IF;

  -- Categorías: absoluta masculina y femenina (edad mínima 16)
  IF NOT EXISTS (SELECT 1 FROM public.race_categories WHERE race_id = v_race) THEN
    INSERT INTO public.race_categories (race_id, race_distance_id, name, short_name, gender, min_age, max_age, age_dependent, display_order, category_number)
    VALUES
      (v_race, v_dist, 'Absoluta masculina', 'ABS M', 'M', 16, NULL, true, 1, 1),
      (v_race, v_dist, 'Absoluta femenina',  'ABS F', 'F', 16, NULL, true, 2, 2);
  END IF;

  -- Devolución íntegra hasta el 10 de diciembre (10 días antes)
  IF NOT EXISTS (SELECT 1 FROM public.race_cancellation_tiers WHERE race_id = v_race) THEN
    INSERT INTO public.race_cancellation_tiers (race_id, days_before, refund_percent) VALUES (v_race, 10, 100);
  END IF;

  -- Formulario de inscripción por defecto (campos de sistema)
  IF NOT EXISTS (SELECT 1 FROM public.registration_form_fields WHERE race_id = v_race OR race_distance_id = v_dist) THEN
    PERFORM public.seed_default_registration_fields(v_race);
  END IF;

  -- ---------------------------------------------------------- reglamento
  SELECT id INTO v_reg FROM public.race_regulations WHERE race_id = v_race LIMIT 1;
  IF v_reg IS NULL THEN
    INSERT INTO public.race_regulations (race_id, published, version) VALUES (v_race, true, 1) RETURNING id INTO v_reg;
    INSERT INTO public.race_regulation_sections (regulation_id, section_type, title, content, is_required, section_order) VALUES
      (v_reg, 'general_info', 'Organización y tipo de prueba', E'El Club Deportivo Elemental Kilómetro Vertical de Torrelavega y el Grupo de Montaña Tejas4run, en colaboración con el Excmo. Ayuntamiento de San Felices de Buelna, organizan el II Trailvideño Monte Tejas, competición de trail por sendas y caminos del Monte Tejas (San Felices de Buelna, Cantabria).\n\nEs un evento deportivo en régimen de semi-autosuficiencia. Salida y llegada en la plaza del Ayuntamiento de San Felices de Buelna a las 10:30 h del domingo 20 de diciembre de 2026.\n\nEl reglamento puede modificarse hasta días antes de la prueba; cualquier cambio se comunicará a los participantes.', true, 1),
      (v_reg, 'course', 'Recorrido', E'Distancia única de 15 km con 730 m de desnivel positivo y 724 m de negativo. Prácticamente todo el recorrido discurre por sendas y caminos mitológicos del Monte Tejas.\n\nSolo 1,6 km de ida y otros 1,6 km de vuelta transitan por carretera, zonas asfaltadas o zona de pueblo, además de 500 m por el parque de la Lama, a 500 m de la salida y llegada. Estos tramos no están cortados al tráfico: se respetan las normas generales de circulación y las indicaciones de la organización.\n\nMarcaje con cintas y banderines de color naranja a intervalos regulares. Es responsabilidad de cada participante localizar y seguir la señalización, pasar por todos los controles y no atajar. Al terminar se retira todo el material de marcaje.', true, 2),
      (v_reg, 'registration', 'Inscripciones y participación', E'Cupo máximo: 200 corredores. Plazo: desde las 20:00 h del 1 de noviembre hasta las 24:00 h del 15 de diciembre de 2026, o hasta completar dorsales.\n\nPrecio: 10 € (incluye el seguro de accidentes del día de la prueba). La inscripción da derecho a todos los avituallamientos (incluido el de meta), comida al finalizar, sorteos, asistencia sanitaria, bolsa del corredor y dorsal, trofeos y premios y la cobertura de los seguros contratados.\n\nEdad mínima: 16 años cumplidos el día anterior a la prueba. Las inscripciones son personales e intransferibles.\n\nParticipar implica aceptar este reglamento, conocer las características técnicas de la prueba y estar preparado para ellas, y asumir que en plena naturaleza la seguridad depende de la capacidad del corredor para resolver los problemas previsibles.', true, 3),
      (v_reg, 'mandatory_gear', 'Material obligatorio y recomendado', E'Obligatorio:\n• Teléfono móvil operativo con el número de la organización guardado (679 602 812).\n• Vaso o softflask para los avituallamientos (no habrá vasos).\n• Zapatillas de trail.\n\nRecomendado:\n• Mochila de hidratación.\n• Chaqueta membrana (cortavientos o chubasquero) y manta térmica. Con previsión de mal tiempo podrán exigirse como obligatorios.', true, 4),
      (v_reg, 'aid_stations', 'Semi-autosuficiencia y avituallamientos', E'Los avituallamientos se realizan únicamente en las zonas acotadas; no se permite avituallamiento ni asistencia externa en otros lugares salvo casos justificados y aprobados por la organización.\n\nDos puntos de avituallamiento líquido en la zona de concurrencia ida-vuelta (km 5,5 y km 10), más el de meta, que se sitúa fuera de la zona de llegada con alimentos y bebidas.\n\nTodos los corredores llevan chip en el dorsal. La organización puede establecer controles de paso; no pasar por ellos es descalificación.', false, 5),
      (v_reg, 'cutoff_times', 'Horarios y cierre de control', E'Salida: domingo 20 de diciembre de 2026 a las 10:30 h.\nCierre de control: 14:00 h (3 h 30 min desde la salida).\n\nCorredores escoba cierran la carrera. Quien quede detrás continúa bajo su responsabilidad y fuera de clasificación; el cierre le retirará el dorsal o le avisará de que queda descalificado.', true, 6),
      (v_reg, 'bib_collection', 'Recogida de dorsales', E'Domingo 20 de diciembre de 08:30 a 10:00 h en la zona de salida (plaza del Ayuntamiento de San Felices de Buelna).\n\nHay que presentar documento de identidad y, en su caso, tarjeta federativa. Puede recogerlo una tercera persona con foto del DNI del corredor o una autorización con nombre y DNI.\n\nEl dorsal se lleva en la parte delantera del torso, visible en todo momento y por encima de la ropa; nunca en la mochila, una pierna o la espalda. No puede modificarse, esconderse ni doblarse.', false, 7),
      (v_reg, 'medical', 'Seguridad médica y seguros', E'La prueba cuenta con una ambulancia asistencial clase B (soporte vital básico) con médico y técnicos en emergencias sanitarias, operativa desde media hora antes de la salida hasta quince minutos después del cierre, en un punto con acceso rápido a las vías de comunicación.\n\nLos corredores están obligados a socorrer a cualquier participante que lo necesite. El criterio del médico prevalece: puede retirar de la carrera (anulando el dorsal), ordenar la evacuación u ordenar la hospitalización de cualquier corredor. Los traslados los autoriza el médico de la organización y se hacen a centros autorizados por el seguro.\n\nLa prueba está cubierta por los seguros de accidentes y responsabilidad civil de la entidad organizadora.', true, 8),
      (v_reg, 'disqualifications', 'Abandonos y descalificaciones', E'Salvo lesión grave, nunca se abandona fuera de un punto de control: hay que avisar al responsable del puesto. Si se abandona pasado un control, hay que volver a él o continuar hasta el siguiente y comunicar la retirada.\n\nSon motivo de descalificación: atajar o salirse del itinerario marcado, no pasar por los controles, tirar residuos fuera de los lugares habilitados, no socorrer a un accidentado, recibir asistencia fuera de las zonas acotadas, quedar detrás de los corredores escoba y coger más de un duende o cambiarlos de sitio.', true, 9),
      (v_reg, 'classifications', 'Categorías, premios y reclamaciones', E'Categorías (15 km): absoluta masculina y absoluta femenina.\n\nDuendes: doce duendes escondidos semi-visibles por el recorrido. Quien encuentre uno debe llegar a meta con él; solo se puede coger un duende por persona. El premio de cada duende se desvela al darse la salida; su posición solo la conoce la organización.\n\nDisfraces: premio a los tres mejores disfraces; el jurado es la organización.\n\nLa entrega de premios se hace en la zona de meta. Las reclamaciones se presentan al Comité de Carrera como máximo 30 minutos después de publicarse los resultados oficiales.', false, 10),
      (v_reg, 'refund_policy', 'Devoluciones', E'Se admite la devolución íntegra de la inscripción desde el 1 de noviembre hasta el 10 de diciembre incluido. Después de esa fecha solo se admiten cambios de titular.', true, 11),
      (v_reg, 'image_rights', 'Derechos de imagen', E'Los corredores ceden su derecho de imagen durante la prueba y renuncian a cualquier recurso contra la organización por su utilización. La organización puede autorizar a los medios mediante acreditación o licencia y se reserva en exclusiva los derechos de imagen y la explotación audiovisual y periodística de la competición.', true, 12),
      (v_reg, 'responsibility', 'Responsabilidad y modificaciones', E'Los participantes participan de forma voluntaria, bajo su responsabilidad y reuniendo las condiciones físicas y de salud necesarias para una prueba de estas características.\n\nLa organización puede modificar el recorrido o aplazar el evento por condiciones meteorológicas u otra causa mayor. La organización guarda los objetos perdidos durante 15 días.\n\nRealizar la inscripción implica el reconocimiento y la aceptación de este reglamento.', true, 13),
      (v_reg, 'environment', 'Medio ambiente', E'Prueba eco-sostenible. Queda prohibido atajar fuera de los caminos y senderos marcados (erosión del suelo). Se eliminan los materiales plásticos en la medida de lo posible: cada corredor lleva su vaso o bidón.\n\nTodos los residuos se depositan en los puntos de avituallamiento, zonas habilitadas o se portan hasta la meta, donde habrá contenedores. Tirar basura fuera de esas zonas es expulsión inmediata.', false, 14);
  END IF;

  -- ------------------------------------------------------------------- FAQ
  IF NOT EXISTS (SELECT 1 FROM public.race_faqs WHERE race_id = v_race) THEN
    INSERT INTO public.race_faqs (race_id, question, answer, display_order) VALUES
      (v_race, '¿Hay vasos en los avituallamientos?', 'No. Es obligatorio llevar vaso o softflask propio: los avituallamientos no tienen vasos.', 1),
      (v_race, '¿Puedo inscribirme con 16 años?', 'Sí, con 16 años cumplidos el día anterior a la prueba. Los menores necesitan autorización del tutor.', 2),
      (v_race, '¿Puede recoger mi dorsal otra persona?', 'Sí, con una foto de tu DNI o una autorización firmada con tu nombre y DNI, el domingo de 08:30 a 10:00 en la plaza del Ayuntamiento.', 3),
      (v_race, '¿Qué pasa con los duendes?', 'Hay doce escondidos por el recorrido. Si encuentras uno, llévalo hasta meta (solo uno por persona) y sabrás qué premio te corresponde.', 4),
      (v_race, '¿Hasta cuándo puedo pedir la devolución?', 'Hasta el 10 de diciembre incluido se devuelve íntegra. Después solo se admiten cambios de titular.', 5);
  END IF;

  -- ------------------------------------------------------------- web propia
  INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
    v_race, 'gurriana', false,
    '{"colorMarca": "#1B4D2E", "colorAccion": "#C8102E", "colorSecundario": "#C99A2E", "hero": "textura", "cinta": true}'::jsonb,
    $json$
    {
      "nombreCorto": "Trailvideño Monte Tejas",
      "fechaTexto": "Domingo 20 de diciembre de 2026",
      "lugar": {"nombre": "Plaza del Ayuntamiento", "direccion": "Plaza del Ayuntamiento, San Felices de Buelna", "municipio": "San Felices de Buelna", "provincia": "Cantabria", "zona": "Monte Tejas"},
      "organizador": {"nombre": "C.D.E. Kilómetro Vertical de Torrelavega y Grupo de Montaña Tejas4run", "telefono": "679 602 812"},
      "inscripcion": {
        "cierreTexto": "Del 1 de noviembre a las 20:00 al 15 de diciembre, o hasta agotar los 200 dorsales",
        "edadMinima": 16,
        "incluye": ["Dorsal con chip y bolsa del corredor", "Seguro de accidentes del día de la prueba y responsabilidad civil", "Avituallamientos en carrera y en meta", "Comida al finalizar la prueba", "Asistencia sanitaria en carrera y en meta", "Participación en los sorteos", "Opción a trofeos y premios"],
        "nota": "Edad mínima: 16 años cumplidos el día anterior a la prueba.",
        "devolucion": {"hasta": "2026-12-10", "texto": "Devolución íntegra hasta el 10 de diciembre incluido. Después solo se admiten cambios de titular. Las inscripciones son personales e intransferibles."}
      },
      "reglamento": {
        "materialObligatorio": ["Teléfono móvil operativo con el número de la organización guardado (679 602 812)", "Vaso o softflask para los avituallamientos (no habrá vasos)", "Zapatillas de trail"],
        "normasMaterial": "Recomendado: mochila de hidratación, chaqueta membrana (cortavientos o chubasquero) y manta térmica. Con previsión de mal tiempo la organización puede hacerlos obligatorios.",
        "marcaje": ["Recorrido marcado con cintas y banderines de color naranja a intervalos regulares; localizar y seguir la señalización es responsabilidad de cada participante.", "Los tramos por calles no están cortados al tráfico: se cumplen las normas generales de circulación y las indicaciones de la organización.", "Es obligatorio seguir el itinerario marcado y pasar por todos los controles. Atajar es descalificación.", "Corredores escoba cierran la carrera: quien quede detrás sigue bajo su responsabilidad y fuera de clasificación."],
        "normas": ["Carrera en semi-autosuficiencia: solo se admite avituallamiento o asistencia en las zonas acotadas por la organización.", "Cada participante lleva sus residuos hasta la meta o los puntos habilitados. Tirar basura fuera de ellos es descalificación inmediata.", "Prohibido atajar fuera de los caminos y senderos marcados para evitar la erosión del suelo.", "El dorsal va en la parte delantera del torso, siempre visible y por encima de la ropa; no se puede modificar, esconder ni doblar.", "Salvo lesión grave, nunca se abandona fuera de un punto de control: hay que avisar al responsable del puesto.", "Los corredores están obligados a socorrer a cualquier participante que lo necesite.", "El criterio del médico de carrera prevalece: puede retirar, evacuar u hospitalizar a cualquier corredor.", "Objetos perdidos: la organización los guarda 15 días.", "Todos los participantes ceden sus derechos de imagen durante la prueba a la organización.", "La organización puede modificar el recorrido o aplazar la prueba por meteorología o causa mayor."],
        "reclamaciones": "Por escrito al Comité de Carrera, como máximo 30 minutos después de publicarse los resultados oficiales."
      },
      "programa": [
        {"fecha": "2026-12-20", "hora": "08:30", "horaFin": "10:00", "titulo": "Recogida de dorsales", "lugar": "Plaza del Ayuntamiento, San Felices de Buelna"},
        {"fecha": "2026-12-20", "hora": "10:30", "titulo": "Salida Trailvideño 15 km", "lugar": "Plaza del Ayuntamiento"},
        {"fecha": "2026-12-20", "hora": "14:00", "titulo": "Cierre de control"},
        {"fecha": "2026-12-20", "hora": "14:15", "titulo": "Entrega de premios y sorteos", "lugar": "Zona de meta"}
      ],
      "dorsales": {"lugar": "Plaza del Ayuntamiento de San Felices de Buelna (zona de salida)", "horarios": [["Domingo 20 de diciembre", "08:30–10:00"]], "nota": "Imprescindible documento de identidad y, si la tienes, tarjeta federativa. Puede recogerlo otra persona con foto de tu DNI o una autorización con nombre y DNI."},
      "premios": [
        {"categoria": "Duendes", "premio": "12 premios", "texto": "Doce duendes escondidos semi-visibles por el recorrido. Quien encuentre uno lo lleva hasta meta (solo uno por persona). El premio de cada duende se desvela al darse la salida. Coger dos o más, o cambiarlos de sitio, es eliminación."},
        {"categoria": "Disfraces", "premio": "3 premios", "texto": "A los tres mejores disfraces de la prueba; el jurado es la organización."},
        {"categoria": "Absoluta masculina y femenina", "premio": "Trofeos", "texto": "Única categoría en la distancia de 15 km."}
      ],
      "entregaPremios": "En la zona de meta, al terminar la carrera",
      "servicios": [
        {"nombre": "Comida de llegada", "texto": "Para todos los participantes al terminar la prueba.", "icono": "comida"},
        {"nombre": "Avituallamiento de meta", "texto": "Fuera de la zona de meta, con comida y bebida.", "icono": "avituallamiento"},
        {"nombre": "Asistencia sanitaria", "texto": "Ambulancia de soporte vital básico con médico y técnicos desde media hora antes de la salida.", "icono": "sanitario"},
        {"nombre": "Sorteos", "texto": "Todos los inscritos optan a los sorteos.", "icono": "regalo"}
      ],
      "sanitario": {"medios": [["1", "ambulancia SVB con médico"], ["2", "técnicos en emergencias sanitarias"]], "nota": "Operativos desde media hora antes de la salida hasta quince minutos después del cierre. Línea directa con Protección Civil y Policía Local."},
      "medioAmbiente": {"espacio": "Monte Tejas, San Felices de Buelna", "normas": "Prueba eco-sostenible: sin vasos de plástico en los avituallamientos, cubos de basura a la salida de cada uno, prohibido atajar fuera de los caminos. Al terminar se retira todo el marcaje y cualquier residuo.", "adhesion": "Organizada con el Ayuntamiento de San Felices de Buelna para dar a conocer la zona y fomentar el deporte con respeto al medio natural."},
      "contacto": {"telefono": "679 602 812"}
    }
    $json$::jsonb
  )
  ON CONFLICT (race_id) DO UPDATE SET tema = EXCLUDED.tema, contenido = EXCLUDED.contenido;

  -- Patrocinadores / organizadores (sin logo todavía)
  IF NOT EXISTS (SELECT 1 FROM public.race_sponsors WHERE race_id = v_race) THEN
    INSERT INTO public.race_sponsors (race_id, name, level, display_order) VALUES
      (v_race, 'C.D.E. Kilómetro Vertical de Torrelavega', 'organiza', 1),
      (v_race, 'Grupo de Montaña Tejas4run', 'organiza', 2),
      (v_race, 'Ayuntamiento de San Felices de Buelna', 'institucional', 3);
  END IF;
END
$seed$;

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT id, name, slug, date, is_visible, organizer_id FROM public.races WHERE id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
SELECT name, distance_km, elevation_gain, price, max_participants, cutoff_time, kind FROM public.race_distances WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
SELECT count(*) AS secciones_reglamento FROM public.race_regulation_sections s JOIN public.race_regulations r ON r.id = s.regulation_id WHERE r.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
SELECT count(*) AS campos_formulario FROM public.registration_form_fields WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c' OR race_distance_id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
-- La web completa tal como la verá la plantilla (is_visible = false: solo la ve quien la gestiona)
SELECT jsonb_pretty(public.evento_publico('trail-navideno-monte-tejas-2026') - 'reglamento' - 'campos');
