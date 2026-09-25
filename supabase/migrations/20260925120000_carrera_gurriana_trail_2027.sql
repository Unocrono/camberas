-- =============================================================================
-- Carrera: V Gurriana Trail 2027 (Carrejo, Cabezón de la Sal, Cantabria)
-- Alta completa para abrir inscripciones en Camberas el 1 de octubre de 2026
-- a las 20:00 con la web propia en camberas.com/gurriana-trail-2027.
-- Datos: src/data/race.json de la web de Lovable (libro de diseño v2).
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
--
-- Precios: el precio base de cada distancia es el de federado (GT20 28 €,
-- GT40 40 €); el no federado paga 4 € más de seguro de día, que es un campo
-- del formulario con importe (field_options.fee_enabled) y no otra tarifa.
-- Devolución: hasta el cierre con 10 € de gastos. race_cancellation_tiers
-- solo sabe de porcentajes, así que no se crea tramo automático: queda como
-- texto en la web y se gestiona a mano.
--
-- Nace VISIBLE y con la web ACTIVA para que el 1 de octubre ya esté todo en
-- su sitio; hasta esa fecha la web dice «Inscripciones próximamente» porque
-- manda registration_opens. Falta: organizer_id (asignar en el panel), logo
-- y cartel (subir desde «Web propia»).
--
-- Requiere aplicadas: 20260924170000_evento_publico_y_web.sql y
-- 20260924180000_web_propia_dominios_y_tpv.sql.
-- =============================================================================

DO $seed$
DECLARE
  v_race     uuid := 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
  v_gt20     uuid := 'd4b0f6e3-8c2a-4f7b-8e1d-4a5b6c7d8e9f';
  v_gt40     uuid := 'e5c1a7f4-9d3b-4a8c-9f2e-5b6c7d8e9fa0';
  v_reg      uuid;
  v_apertura timestamptz := '2026-10-01 20:00:00+02';
  v_cierre   timestamptz := '2027-02-15 00:00:00+01';
  v_dist     uuid;
BEGIN
  -- ---------------------------------------------------------------- carrera
  INSERT INTO public.races (
    id, name, slug, subtitle, description, race_type, group_type, date, location,
    max_participants, registration_opens, registration_closes,
    is_visible, is_featured, es_demo, show_available_places, utc_offset, category_age_reference,
    organizer_email, official_website_url
  ) VALUES (
    v_race,
    'V Gurriana Trail 2027',
    'gurriana-trail-2027',
    'GT20 y GT40 por la Sierra del Escudo de Cabuérniga · Carrejo, Cabezón de la Sal',
    'Sierra del Escudo de Cabuérniga. Sendas, bosques y campo a través por Cabezón de la Sal, Ruente, Cabuérniga y Valdáliga. Dos recorridos: GT20 (20,1 km, +1.290 m) y GT40 (37,2 km, +2.335 m). Calendario oficial FCDME 2027.',
    'trail', 'carrera', '2027-03-14',
    'Plaza de la Braña, Carrejo · Cabezón de la Sal (Cantabria)',
    600, v_apertura, v_cierre,
    true, false, false, false, 60, 'race_date',
    'labarutrail@gmail.com', 'https://gurrianatrail.com'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
    description = EXCLUDED.description, race_type = EXCLUDED.race_type, date = EXCLUDED.date,
    location = EXCLUDED.location, max_participants = EXCLUDED.max_participants,
    registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
    organizer_email = EXCLUDED.organizer_email;

  -- ------------------------------------------------------------- distancias
  INSERT INTO public.race_distances (
    id, race_id, name, distance_km, elevation_gain, elevation_loss, alt_max, alt_min, price,
    cutoff_time, start_location, finish_location, registration_opens, registration_closes,
    is_visible, display_order, bib_start, bib_end, kind, competitive, chip
  ) VALUES
    (v_gt20, v_race, 'GT20', 20.1, 1290, 1290, 839, 141, 28, '7 h',
     'Plaza de la Braña, Carrejo', 'Plaza de la Braña, Carrejo', v_apertura, v_cierre,
     true, 1, 1, 400, 'carrera', true, true),
    (v_gt40, v_race, 'GT40', 37.2, 2335, 2335, 903, 89, 40, '8 h',
     'Plaza de la Braña, Carrejo', 'Plaza de la Braña, Carrejo', v_apertura, v_cierre,
     true, 2, 401, 800, 'carrera', true, true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, distance_km = EXCLUDED.distance_km, elevation_gain = EXCLUDED.elevation_gain,
    elevation_loss = EXCLUDED.elevation_loss, alt_max = EXCLUDED.alt_max, alt_min = EXCLUDED.alt_min,
    price = EXCLUDED.price, cutoff_time = EXCLUDED.cutoff_time,
    registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes;

  -- Precio único (federado) durante todo el plazo
  IF NOT EXISTS (SELECT 1 FROM public.race_distance_prices WHERE race_distance_id IN (v_gt20, v_gt40)) THEN
    INSERT INTO public.race_distance_prices (race_distance_id, price, start_datetime, end_datetime) VALUES
      (v_gt20, 28, v_apertura, v_cierre),
      (v_gt40, 40, v_apertura, v_cierre);
  END IF;

  -- Salidas
  IF NOT EXISTS (SELECT 1 FROM public.race_waves WHERE race_id = v_race) THEN
    INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, start_time) VALUES
      (v_race, v_gt40, 'Salida GT40', '09:00'),
      (v_race, v_gt20, 'Salida GT20', '10:00');
  END IF;

  -- Categorías (ambas distancias, masculino y femenino)
  IF NOT EXISTS (SELECT 1 FROM public.race_categories WHERE race_id = v_race) THEN
    INSERT INTO public.race_categories (race_id, race_distance_id, name, short_name, gender, min_age, max_age, age_dependent, display_order, category_number) VALUES
      (v_race, NULL, 'Absoluta masculina',    'ABS M',  'M', 18, 39,   true, 1, 1),
      (v_race, NULL, 'Absoluta femenina',     'ABS F',  'F', 18, 39,   true, 2, 2),
      (v_race, NULL, 'Veteranos A masculino', 'VET A M','M', 40, 49,   true, 3, 3),
      (v_race, NULL, 'Veteranas A femenino',  'VET A F','F', 40, 49,   true, 4, 4),
      (v_race, NULL, 'Veteranos B masculino', 'VET B M','M', 50, 59,   true, 5, 5),
      (v_race, NULL, 'Veteranas B femenino',  'VET B F','F', 50, 59,   true, 6, 6),
      (v_race, NULL, 'Veteranos C masculino', 'VET C M','M', 60, NULL, true, 7, 7),
      (v_race, NULL, 'Veteranas C femenino',  'VET C F','F', 60, NULL, true, 8, 8);
  END IF;

  -- Formulario: campos de sistema (los siembra el trigger al insertar la
  -- distancia; la llamada es idempotente) + campos propios de la Gurriana
  FOREACH v_dist IN ARRAY ARRAY[v_gt20, v_gt40] LOOP
    PERFORM public.seed_default_registration_fields_for_distance(v_dist);
    IF NOT EXISTS (SELECT 1 FROM public.registration_form_fields WHERE race_distance_id = v_dist AND field_name = 'federado') THEN
      INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options) VALUES
        (v_dist, 'federado', '¿Estás federado (FCDME/FEDME) con licencia en vigor?', 'radio', 20, true, false, true,
         '{"options": ["Sí, tengo licencia en vigor", "No: seguro de día (+4 €)"], "fee_enabled": true, "fees": [0, 4]}'::jsonb),
        (v_dist, 'licencia', 'Número de licencia (si estás federado)', 'text', 21, false, false, true, NULL),
        (v_dist, 'talla_camiseta', 'Talla de camiseta (solo inscritos antes del 15 de enero)', 'select', 22, true, false, true,
         '["XS", "S", "M", "L", "XL", "XXL"]'::jsonb);
    END IF;
  END LOOP;

  -- ------------------------------------------------------------- reglamento
  SELECT id INTO v_reg FROM public.race_regulations WHERE race_id = v_race LIMIT 1;
  IF v_reg IS NULL THEN
    INSERT INTO public.race_regulations (race_id, published, version) VALUES (v_race, true, 1) RETURNING id INTO v_reg;
    INSERT INTO public.race_regulation_sections (regulation_id, section_type, title, content, is_required, section_order) VALUES
      (v_reg, 'general_info', 'Organización', E'El Club Deportivo Elemental Lábaru Trail organiza la V Gurriana Trail el domingo 14 de marzo de 2027, con salida y llegada en la Plaza de la Braña de Carrejo (Cabezón de la Sal). Prueba incluida en el calendario oficial de la FCDME 2027, por la Sierra del Escudo de Cabuérniga y los municipios de Cabezón de la Sal, Ruente, Cabuérniga y Valdáliga.', true, 1),
      (v_reg, 'course', 'Recorridos y marcaje', E'GT20: 20,1 km, +1.290 m / -1.290 m, altitud entre 141 y 839 m, salida a las 10:00 h, tiempo límite 7 h. Marcaje verde.\nGT40: 37,2 km, +2.335 m / -2.335 m, altitud entre 89 y 903 m, salida a las 09:00 h, tiempo límite 8 h. Marcaje rojo.\n\nMarcaje con cinta y banderines naranjas, indicador kilométrico cada 5 km y color propio por prueba. Los cruces de carretera no están cortados: se cruza solo por los pasos habilitados. Equipo escoba: quien sea superado queda retirado de la carrera.', true, 2),
      (v_reg, 'registration', 'Inscripciones', E'Apertura el 1 de octubre de 2026 a las 20:00 h y cierre el 15 de febrero de 2027 o al completar los 600 dorsales. Edad mínima: 18 años.\n\nPrecios: GT20 28 € federados y 32 € no federados; GT40 40 € federados y 44 € no federados. Los 4 € de diferencia son el seguro de accidentes de día de quien no tiene licencia.\n\nIncluye dorsal con chip, bolsa del corredor, avituallamientos, comida post carrera, duchas y seguro de accidentes y responsabilidad civil. Camiseta conmemorativa solo para inscritos antes del 15 de enero. No hay inscripciones el día de la carrera.', true, 3),
      (v_reg, 'mandatory_gear', 'Material obligatorio', E'• Chaqueta cortavientos.\n• Manta térmica de emergencia.\n• Teléfono móvil con batería y encendido.\n• Vaso o softflask.\n• Zapatillas específicas de trail running.\n\nBastones solo si se llevan desde la salida y hasta la meta. Auriculares prohibidos. La organización puede añadir material con 48 h de aviso según la meteorología.', true, 4),
      (v_reg, 'aid_stations', 'Avituallamientos', E'GT20: El Palo (km 4, líquido), La Pedraje (km 9, completo), Cortafuegos (km 15, líquido, corte 15:30) y Meta.\nGT40: El Palo (km 4, líquido), La Pedraje (km 9, completo), Prao Julio (km 15, líquido), Bustriguado (km 21, completo, corte 13:00), La Pedraje (km 26, completo), Cortafuegos (km 32, líquido, corte 15:30) y Meta.\n\nSin vasos desechables: cada corredor lleva su vaso o softflask. Opciones sin gluten en todos los puntos.', false, 5),
      (v_reg, 'cutoff_times', 'Horarios y cortes', E'Salida GT40 a las 09:00 h y GT20 a las 10:00 h desde la Plaza de la Braña. Cortes: Bustriguado 13:00 h (GT40) y Cortafuegos 15:30 h (ambas). Tiempo límite: 7 h en GT20 y 8 h en GT40. Entrega de premios a las 16:00 h.', true, 6),
      (v_reg, 'bib_collection', 'Recogida de dorsales', E'Plaza de la Braña, Carrejo. Sábado 13 de marzo de 10:00 a 12:00 y de 17:00 a 20:00 h; domingo 14 de 07:00 a 08:30 h.\n\nImprescindible DNI y licencia federativa del año en curso si te inscribiste como federado. Otra persona puede recogerlo con tu DNI. Sin licencia: suplemento de 4 €.', false, 7),
      (v_reg, 'medical', 'Dispositivo sanitario y seguros', E'Un médico de carrera, cinco técnicos de emergencias, dos ambulancias de soporte vital básico con DESA y una ambulancia 4x4. Ambulancias en salida/meta y Bustriguado; unidad 4x4 en La Pedraje. La prueba cuenta con seguro de accidentes y de responsabilidad civil.', true, 8),
      (v_reg, 'classifications', 'Categorías, premios y reclamaciones', E'Categorías masculinas y femeninas en ambas distancias: Absoluta (18 a 39), Veteranos A (40 a 49), Veteranos B (50 a 59) y Veteranos C (60 o más). Entrega de premios a las 16:00 h.\n\nReclamaciones por escrito ante el Comité de Carrera en los 30 minutos posteriores a la publicación de las clasificaciones, con fianza de 60 €.', false, 9),
      (v_reg, 'refund_policy', 'Devoluciones y cambios', E'Inscripciones personales e intransferibles. Cambios de distancia, de titularidad y devoluciones por lesión justificada hasta el cierre de inscripciones, con 10 € de gastos de gestión.', true, 10),
      (v_reg, 'environment', 'Medio ambiente', E'La prueba discurre por el LIC Sierra del Escudo de Cabuérniga (brezales, bosques aluviales, hayedos y robledales; caracol de Quimper, ciervo volante, lagarto verdinegro, murciélago ratonero y soldanela villosa). Cubos de basura 100 m antes y después de cada avituallamiento: tirar un residuo fuera de ellos es descalificación inmediata. La organización se adhiere al Documento de Buenas Prácticas Ambientales de la FEDME y EUROPARC-España.', false, 11),
      (v_reg, 'responsibility', 'Responsabilidad', E'Los participantes conocen las características de la prueba y participan bajo su responsabilidad, en condiciones físicas adecuadas. La organización puede modificar recorridos, horarios o material obligatorio por seguridad o meteorología, y comunicará los cambios a los inscritos. La inscripción supone la aceptación de este reglamento.', true, 12);
  END IF;

  -- ------------------------------------------------------------------- FAQ
  IF NOT EXISTS (SELECT 1 FROM public.race_faqs WHERE race_id = v_race) THEN
    INSERT INTO public.race_faqs (race_id, question, answer, display_order) VALUES
      (v_race, '¿Qué diferencia hay entre federado y no federado?', 'El precio base es para quien tiene licencia FCDME/FEDME en vigor. Sin licencia se añaden 4 € de seguro de accidentes de día. Al recoger el dorsal se comprueba la licencia.', 1),
      (v_race, '¿Hasta cuándo tengo camiseta?', 'La camiseta conmemorativa es para los inscritos antes del 15 de enero de 2027.', 2),
      (v_race, '¿Puedo cambiar de GT20 a GT40 o ceder mi dorsal?', 'Sí, hasta el cierre de inscripciones (15 de febrero), con 10 € de gastos de gestión. Las devoluciones solo por lesión justificada, en el mismo plazo.', 3),
      (v_race, '¿Se pueden usar bastones?', 'Sí, pero solo si se llevan desde la salida hasta la meta. Los auriculares están prohibidos.', 4),
      (v_race, '¿Hay opciones sin gluten?', 'Sí, en todos los avituallamientos. Recuerda llevar tu vaso o softflask: no hay vasos desechables.', 5);
  END IF;

  -- ------------------------------------------------------------- web propia
  INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
    v_race, 'gurriana', true,
    '{"colorMarca": "#3F6A12", "colorAccion": "#8BC34A", "colorSecundario": "#1E6FB5", "hero": "textura", "cinta": true}'::jsonb,
    $json$
    {
      "nombreCorto": "Gurriana Trail",
      "descripcion": "Sierra del Escudo de Cabuérniga. Sendas, bosques y campo a través por Cabezón de la Sal, Ruente, Cabuérniga y Valdáliga.",
      "fechaTexto": "Domingo 14 de marzo de 2027",
      "federacion": "Calendario oficial FCDME 2027",
      "lugar": {"nombre": "Plaza de la Braña", "direccion": "Plaza de la Braña, Carrejo", "municipio": "Cabezón de la Sal", "provincia": "Cantabria", "zona": "Sierra del Escudo de Cabuérniga", "municipios": ["Cabezón de la Sal", "Ruente", "Cabuérniga", "Valdáliga"]},
      "organizador": {"nombre": "Club Deportivo Elemental Lábaru Trail", "email": "labarutrail@gmail.com"},
      "inscripcion": {
        "cierreTexto": "15 de febrero de 2027 o al completar los 600 dorsales",
        "edadMinima": 18,
        "incluye": ["Dorsal con chip", "Bolsa del corredor", "Avituallamientos", "Comida post carrera", "Duchas", "Seguro de accidentes y RC"],
        "nota": "Precio para federados; sin licencia en vigor se añaden 4 € de seguro de día. No hay inscripciones el día de la carrera.",
        "devolucion": {"hasta": "2027-02-15", "gastos": 10, "texto": "Inscripciones personales e intransferibles. Cambios de distancia, titularidad y devoluciones por lesión justificada hasta el cierre, con 10 € de gastos de gestión."}
      },
      "reglamento": {
        "materialObligatorio": ["Chaqueta cortavientos", "Manta térmica de emergencia", "Teléfono móvil con batería y encendido", "Vaso o softflask", "Zapatillas específicas de trail running"],
        "normasMaterial": "Bastones solo si se llevan desde la salida y hasta la meta. Auriculares prohibidos. Material adicional posible con 48 h de aviso según meteorología.",
        "marcaje": ["Marcaje con cinta y banderines naranjas, indicador kilométrico cada 5 km y color propio por prueba.", "Los cruces de carretera no están cortados: cruza solo por los pasos habilitados.", "Equipo escoba: quien sea superado queda retirado de la carrera."],
        "normas": ["Sin vasos desechables: lleva tu propio vaso o softflask. Opciones sin gluten en todos los puntos."],
        "reclamaciones": "Por escrito ante el Comité de Carrera en los 30 minutos posteriores a la publicación de clasificaciones. Fianza de 60 €."
      },
      "programa": [
        {"fecha": "2027-03-13", "hora": "10:00", "horaFin": "12:00", "titulo": "Recogida de dorsales", "lugar": "Plaza de la Braña, Carrejo"},
        {"fecha": "2027-03-13", "hora": "17:00", "horaFin": "20:00", "titulo": "Recogida de dorsales", "lugar": "Plaza de la Braña, Carrejo"},
        {"fecha": "2027-03-14", "hora": "07:00", "horaFin": "08:30", "titulo": "Recogida de dorsales", "lugar": "Plaza de la Braña, Carrejo"},
        {"fecha": "2027-03-14", "hora": "09:00", "titulo": "Salida GT40"},
        {"fecha": "2027-03-14", "hora": "10:00", "titulo": "Salida GT20"},
        {"fecha": "2027-03-14", "hora": "16:00", "titulo": "Entrega de premios"}
      ],
      "dorsales": {"lugar": "Plaza de la Braña, Carrejo", "horarios": [["Sábado 13 de marzo", "10:00–12:00 y 17:00–20:00"], ["Domingo 14 de marzo", "07:00–08:30"]], "nota": "Imprescindible DNI y licencia federativa del año en curso si te inscribiste como federado. Otra persona puede recogerlo con tu DNI. Sin licencia: suplemento de 4 €."},
      "entregaPremios": "16:00",
      "camiseta": {"incluida": true, "hasta": "2027-01-15", "texto": "Camiseta conmemorativa solo para inscritos antes del 15 de enero."},
      "sanitario": {"medios": [["1", "médico de carrera"], ["5", "técnicos de emergencias"], ["2", "ambulancias SVB con DESA"], ["1", "ambulancia 4x4"]], "nota": "Ambulancias en salida/meta y Bustriguado; unidad 4x4 en La Pedraje."},
      "medioAmbiente": {"espacio": "LIC Sierra del Escudo de Cabuérniga", "habitats": "brezales, bosques aluviales, hayedos y robledales", "especies": "caracol de Quimper, ciervo volante, lagarto verdinegro, murciélago ratonero y soldanela villosa", "normas": "Cubos de basura 100 m antes y después de cada avituallamiento. Tirar un residuo fuera de ellos es descalificación inmediata.", "adhesion": "Documento de Buenas Prácticas Ambientales FEDME y EUROPARC-España"},
      "contacto": {"email": "labarutrail@gmail.com", "emailDatos": "lagurrianatrail@gmail.com", "redes": {"facebook": "https://www.facebook.com/gurrianatrail"}}
    }
    $json$::jsonb
  )
  ON CONFLICT (race_id) DO UPDATE SET tema = EXCLUDED.tema, contenido = EXCLUDED.contenido;

  -- Organiza y apoyos (sin logos todavía)
  IF NOT EXISTS (SELECT 1 FROM public.race_sponsors WHERE race_id = v_race) THEN
    INSERT INTO public.race_sponsors (race_id, name, level, display_order) VALUES
      (v_race, 'Club Deportivo Elemental Lábaru Trail', 'organiza', 1),
      (v_race, 'Ayuntamiento de Cabezón de la Sal', 'institucional', 2),
      (v_race, 'Ayuntamiento de Ruente', 'institucional', 3),
      (v_race, 'Ayuntamiento de Cabuérniga', 'institucional', 4),
      (v_race, 'Ayuntamiento de Valdáliga', 'institucional', 5),
      (v_race, 'Junta Vecinal Carrejo–Santibáñez', 'institucional', 6),
      (v_race, 'FCDME', 'institucional', 7);
  END IF;
END
$seed$;

-- =============================================================================
-- Comprobaciones (ejecutar sin texto seleccionado, o una a una)
-- =============================================================================
SELECT id, name, slug, date, is_visible, registration_opens, organizer_id FROM public.races WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
SELECT name, distance_km, elevation_gain, price, cutoff_time, bib_start, bib_end FROM public.race_distances WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e' ORDER BY display_order;
SELECT race_distance_id, count(*) AS campos, count(*) FILTER (WHERE (field_options->>'fee_enabled')::boolean) AS con_importe FROM public.registration_form_fields WHERE race_distance_id IN ('d4b0f6e3-8c2a-4f7b-8e1d-4a5b6c7d8e9f', 'e5c1a7f4-9d3b-4a8c-9f2e-5b6c7d8e9fa0') GROUP BY race_distance_id;
SELECT count(*) AS categorias FROM public.race_categories WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
SELECT jsonb_pretty(public.evento_publico('gurriana-trail-2027') - 'reglamento' - 'campos' - 'faq');
