-- =============================================================================
-- APLICADA el 20-oct-2026 con la consulta de Lovable, tras el ensayo en seco.
-- Carrera: XII Desafío BTT Las Brañas y el Mar 2027 (Luarca, Valdés,
-- Asturias). Organizan la Asociación Cultural de Ocio y Tiempo Libre La
-- Fuente y el Club Ciclista Las Brañas y el Mar; cronometra UNO Crono.
-- Alta completa con el criterio de Entre Viñedos/Picota: carrera, dos
-- recorridos (BTT y e-Bike por el mismo trazado), salidas, formulario con la
-- licencia de un día, reglamento por secciones, FAQ, rutómetro, web propia,
-- patrocinadores, documentación y organizador (asoc.lafuente@gmail.com, que
-- ya tenía usuario con rol organizer).
-- Datos: reglamento 2027 del organizador y cartel (20-oct), GPX de la
-- edición de 2025 (Wikiloc, 48,97 km medidos, unos 1.700 m D+),
-- servido en public/gpx/desafio-branas-y-el-mar-2027.gpx.
--
-- Precio: 25 € con licencia RFEC (el promotor lo subió el 20-oct: el PDF del
-- reglamento dice 15 €). Sin licencia se suma la licencia de un día de la
-- Federación de Ciclismo del Principado de Asturias, 15 € (también del
-- promotor, 20-oct): 40 € en total. Va como suplemento del campo
-- licencia_federativa, que el cobro recalcula en servidor.
--
-- SENTENCIAS SUELTAS, sin bloques DO. Todas son idempotentes: se puede volver
-- a ejecutar entera.
--
-- Supuestos a confirmar con el organizador:
--   · marcha cicloturista: no competitiva, con chip y sin podios (el
--     reglamento no da premios ni categorías);
--   · la e-Bike es un recorrido aparte por su salida a las 10:10, con el
--     mismo precio y la misma licencia;
--   · dorsales 1-300 BTT y 301-400 e-Bike; el cupo de 300 es de la carrera;
--   · el reglamento dice XI en el art. 1 y XII en el título y el pie: se usa
--     XII (la de 2026 fue la XI);
--   · el GPX es el de 2025: si cambia el trazado, se sustituye el fichero;
--   · avituallamientos: el reglamento remite al plano y aún no hay puntos.
-- Nace OCULTA (is_visible = false) con la web activa: se ve con ?previa=1
-- desde el panel. Cuando se quiera publicar, is_visible = true.
-- Ficheros: public/fotos/branas-y-el-mar/{cartel-2027.jpg,portada-cartel.webp}.
-- =============================================================================

-- ------------------------------------------------------------------ carrera
INSERT INTO public.races (
  id, name, slug, subtitle, description, race_type, group_type, date, location,
  max_participants, registration_opens, registration_closes,
  is_visible, is_featured, es_demo, show_available_places, utc_offset, category_age_reference,
  organizer_id, organizer_email, official_website_url, logo_url, poster_url, cover_image_url
) VALUES (
  '12610715-5fa2-4b2f-a6af-e4174348f06b',
  'XII Desafío BTT Las Brañas y el Mar 2027',
  'desafio-branas-y-el-mar-2027',
  'Marcha BTT de 49 km entre las brañas y el mar · Luarca (Asturias)',
  'Duodécima edición del Desafío BTT Las Brañas y el Mar: 49 km y unos 1.700 m de desnivel positivo que suben desde el puerto de Luarca a las brañas vaqueiras del concejo de Valdés y vuelven al mar. Salida y meta en la Plaza Alfonso X el Sabio el domingo 14 de marzo de 2027 a las 10:00; las bicicletas eléctricas salen a las 10:10. Organizan la Asociación Cultural La Fuente y el Club Ciclista Las Brañas y el Mar, con la autorización de la Federación de Ciclismo del Principado de Asturias.',
  'mtb', 'carrera', '2027-03-14',
  'Plaza Alfonso X el Sabio, Luarca (Valdés, Asturias)',
  300, '2027-01-04 00:00:00+00', '2027-03-11 23:59:00+00',
  false, false, false, true, 60, 'year_end',
  'b7f1827e-e636-4c17-95d1-e750d0877dca', 'asoc.lafuente@gmail.com', NULL, NULL,
  'https://camberas.com/fotos/branas-y-el-mar/cartel-2027.jpg',
  'https://camberas.com/fotos/branas-y-el-mar/portada-cartel.webp'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description, race_type = EXCLUDED.race_type, date = EXCLUDED.date,
  location = EXCLUDED.location, max_participants = EXCLUDED.max_participants,
  registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
  category_age_reference = EXCLUDED.category_age_reference, organizer_id = EXCLUDED.organizer_id,
  organizer_email = EXCLUDED.organizer_email, poster_url = EXCLUDED.poster_url,
  cover_image_url = EXCLUDED.cover_image_url;

-- --------------------------------------------------------------- recorridos
-- Mismo GPX para los dos: 48,97 km, 1.702 m D+ y D-, de 3 a 486 m.
-- Cierre de control a las 15:00: 5 h desde la salida de las 10:00.
INSERT INTO public.race_distances (
  id, race_id, name, distance_km, elevation_gain, elevation_loss, alt_max, alt_min, price,
  cutoff_time, start_location, finish_location, registration_opens, registration_closes,
  is_visible, display_order, bib_start, bib_end, kind, competitive, chip, gpx_file_url
) VALUES
  ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '12610715-5fa2-4b2f-a6af-e4174348f06b',
   'Desafío BTT 49 km', 49, 1700, 1700, 486, 3, 25, '5:00 h',
   'Plaza Alfonso X el Sabio, Luarca', 'Plaza Alfonso X el Sabio, Luarca',
   '2027-01-04 00:00:00+00', '2027-03-11 23:59:00+00',
   true, 1, 1, 300, 'marcha', false, true, 'https://camberas.com/gpx/desafio-branas-y-el-mar-2027.gpx'),
  ('1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567', '12610715-5fa2-4b2f-a6af-e4174348f06b',
   'Desafío e-Bike 49 km', 49, 1700, 1700, 486, 3, 25, '4:50 h',
   'Plaza Alfonso X el Sabio, Luarca', 'Plaza Alfonso X el Sabio, Luarca',
   '2027-01-04 00:00:00+00', '2027-03-11 23:59:00+00',
   true, 2, 301, 400, 'marcha', false, true, 'https://camberas.com/gpx/desafio-branas-y-el-mar-2027.gpx')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, distance_km = EXCLUDED.distance_km, elevation_gain = EXCLUDED.elevation_gain,
  elevation_loss = EXCLUDED.elevation_loss, alt_max = EXCLUDED.alt_max, alt_min = EXCLUDED.alt_min,
  price = EXCLUDED.price, cutoff_time = EXCLUDED.cutoff_time, kind = EXCLUDED.kind, competitive = EXCLUDED.competitive,
  chip = EXCLUDED.chip, registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
  bib_start = EXCLUDED.bib_start, bib_end = EXCLUDED.bib_end, gpx_file_url = EXCLUDED.gpx_file_url;

-- Precio único: 25 € del 4 de enero al cierre (hora de pared +00). Mismo
-- importe que el precio base, para que ficha, cobro y web digan lo mismo.
DELETE FROM public.race_distance_prices
 WHERE race_distance_id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567');
INSERT INTO public.race_distance_prices (race_distance_id, price, start_datetime, end_datetime) VALUES
  ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', 25, '2027-01-04 00:00:00+00', '2027-03-11 23:59:00+00'),
  ('1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567', 25, '2027-01-04 00:00:00+00', '2027-03-11 23:59:00+00');

-- Salidas del reglamento: BTT 10:00 y eléctricas 10 minutos más tarde.
-- Prevista y oficial iguales al nacer (hora de pared +00).
INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, hora_prevista, start_time) VALUES
  ('12610715-5fa2-4b2f-a6af-e4174348f06b', '11e076d4-a224-4da1-b50f-3b6cb8032bb5', 'Salida BTT',    '2027-03-14 10:00:00+00', '2027-03-14 10:00:00+00'),
  ('12610715-5fa2-4b2f-a6af-e4174348f06b', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567', 'Salida e-Bike', '2027-03-14 10:10:00+00', '2027-03-14 10:10:00+00')
ON CONFLICT (race_distance_id) DO UPDATE SET
  wave_name = EXCLUDED.wave_name, hora_prevista = EXCLUDED.hora_prevista, start_time = EXCLUDED.start_time;

-- Salida y meta de cronometraje (las crea el disparador) en la plaza
UPDATE public.race_checkpoints SET distance_km = 48.97, lugar = 'Plaza Alfonso X el Sabio', latitude = 43.543857, longitude = -6.535675
 WHERE race_distance_id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567')
   AND checkpoint_type = 'FINISH';
UPDATE public.race_checkpoints SET distance_km = 0, lugar = 'Plaza Alfonso X el Sabio', latitude = 43.543828, longitude = -6.535611
 WHERE race_distance_id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567')
   AND checkpoint_type = 'START';

-- Categorías: la UNICA que siembra el disparador. Marcha sin podios; la edad
-- es la de la licencia, a 31 de diciembre (year_end).

-- --------------------------------------------------------------- formulario
SELECT public.seed_default_registration_fields_for_distance('11e076d4-a224-4da1-b50f-3b6cb8032bb5');
SELECT public.seed_default_registration_fields_for_distance('1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567');

-- Sin camiseta en el reglamento: la talla se oculta. El club sí se pide.
UPDATE public.registration_form_fields SET is_visible = false, is_required = false
 WHERE race_distance_id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567')
   AND field_name = 'tshirt_size';
UPDATE public.registration_form_fields SET is_visible = true
 WHERE race_distance_id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567')
   AND field_name = 'club';

-- Licencia: con RFEC 0 €, sin ella licencia de un día +15 €
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT d.id, 'licencia_federativa', '¿Tienes licencia federativa de ciclismo (RFEC) en vigor?', 'radio', 20, true, false, true,
       '{"options": ["Sí, tengo licencia RFEC", "No, necesito la licencia de un día"], "fee_enabled": true, "fees": [0, 15]}'::jsonb,
       'Sin licencia se expide una licencia de un día de la Federación de Ciclismo del Principado de Asturias (15 €). Al recoger el dorsal hay que presentar la licencia, si se tiene, y el DNI.'
  FROM public.race_distances d
 WHERE d.id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567')
   AND NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.field_name = 'licencia_federativa');

UPDATE public.registration_form_fields
   SET field_options = '{"options": ["Sí, tengo licencia RFEC", "No, necesito la licencia de un día"], "fee_enabled": true, "fees": [0, 15]}'::jsonb
 WHERE race_distance_id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567')
   AND field_name = 'licencia_federativa';

-- Número de licencia, solo si se tiene
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text, depends_on_field_id, depends_on_value)
SELECT l.race_distance_id, 'numero_licencia', 'Número de licencia federativa', 'text', 21, true, false, true,
       NULL, 'Tal como figura en la licencia.', l.id, 'Sí, tengo licencia RFEC'
  FROM public.registration_form_fields l
 WHERE l.race_distance_id IN ('11e076d4-a224-4da1-b50f-3b6cb8032bb5', '1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567')
   AND l.field_name = 'licencia_federativa'
   AND NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = l.race_distance_id AND f.field_name = 'numero_licencia');

-- --------------------------------------------------------------- reglamento
INSERT INTO public.race_regulations (id, race_id, published, version)
SELECT '2f5cdab9-88b0-467e-95e6-aebe5586384f', '12610715-5fa2-4b2f-a6af-e4174348f06b', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.race_regulations WHERE race_id = '12610715-5fa2-4b2f-a6af-e4174348f06b');

INSERT INTO public.race_regulation_sections (regulation_id, section_type, title, content, is_required, section_order)
SELECT g.id, v.tipo, v.titulo, v.texto, v.req, v.orden
  FROM public.race_regulations g
  CROSS JOIN (VALUES
  ('general_info', 'Fecha, lugar y organización', E'La Asociación Cultural de Ocio y Tiempo Libre La Fuente y el Club Ciclista Las Brañas y el Mar organizan el XII Desafío BTT Las Brañas y el Mar el domingo 14 de marzo de 2027 en Luarca (Asturias). La prueba cuenta con la autorización de la Federación de Ciclismo del Principado de Asturias y de la Real Federación Española de Ciclismo.\n\nLa salida se da el domingo 14 de marzo a las 10:00 h en la Plaza Alfonso X el Sabio de Luarca, donde está también la meta. Las bicicletas eléctricas toman la salida 10 minutos más tarde, a las 10:10 h.', true, 1),
  ('course', 'Recorrido', E'Unos 49 km con cerca de 1.700 m de desnivel positivo por los caminos y pistas del concejo de Valdés, entre las brañas y el mar, con salida y llegada en Luarca.\n\nEl itinerario está abierto permanentemente al tráfico peatonal y a todo tipo de vehículos, por lo que los participantes deben respetar en todo momento las normas de circulación vial. Quien las incumpla será excluido de la prueba.\n\nLa organización se reserva el derecho de realizar reagrupamientos si lo estima oportuno, de desviar a los participantes por salidas y escapes alternativos cuando no se cumplan los horarios previstos y de modificar todo lo relativo al itinerario, avituallamientos y horarios para garantizar un óptimo desarrollo de la prueba.', true, 2),
  ('registration', 'Inscripciones', E'Las inscripciones se abren el 4 de enero de 2027 y se cierran el 11 de marzo a las 23:59 h, o antes si la organización lo estima oportuno en función del número de inscritos. El límite es de 300 participantes, por riguroso orden de inscripción.\n\nSolo se aceptan inscripciones pagadas: no existe la preinscripción con pago al recoger el dorsal. El pago se hace por Internet con tarjeta a través de la pasarela de pago segura de la organización.\n\nLa inscripción cuesta 25 € para deportistas federados (RFEC). Para los no federados se suma la licencia de un día de la Federación de Ciclismo del Principado de Asturias, 15 €: 40 € en total.\n\nCon el pago, la inscripción es definitiva. Las inscripciones son estrictamente personales: no las puede usar ninguna otra persona que no sea la inscrita.', true, 3),
  ('custom', 'Participantes y licencias', E'El Desafío está abierto a todos los cicloturistas mayores de 18 años con licencia federativa en vigor, y de 17 años con licencia junior en vigor.\n\nQuien no tenga licencia federativa expide una licencia de un día, aportando fotocopia del DNI y pagando el precio que establece la Federación.', true, 4),
  ('custom', 'Recogida de dorsales', E'Los dorsales se recogen en el stand de la zona de salida y meta, en la Plaza Alfonso X el Sabio:\n\n• sábado 13 de marzo, de 19:00 a 21:00 h;\n• domingo 14 de marzo, de 8:30 a 9:45 h.\n\nAl retirar el dorsal es imprescindible presentar la licencia, si se tiene, y el DNI para verificar la identidad.\n\nEl dorsal debe ir siempre en un sitio visible para que el personal de la organización pueda comprobarlo en cualquier momento.', true, 5),
  ('mandatory_gear', 'Material obligatorio', E'El uso del casco protector es totalmente obligatorio, sin excepción alguna. Quien no lo lleve en algún momento, por breve que sea, será descalificado y excluido de la prueba.\n\n• Casco protector, puesto y abrochado durante toda la prueba\n• Dorsal en un sitio visible', true, 6),
  ('aid_stations', 'Avituallamientos', E'A lo largo del recorrido hay varios avituallamientos líquidos y sólidos, situados en los puntos marcados en el plano de la prueba.', false, 7),
  ('cutoff_times', 'Horarios y cierre de control', E'Salida a las 10:00 h (bicicletas eléctricas a las 10:10 h) desde la Plaza Alfonso X el Sabio de Luarca. El cierre de control es el domingo 14 de marzo a las 15:00 h.\n\nTodo participante está obligado a cumplir el Código de Circulación y a seguir las indicaciones de los agentes de la autoridad y del personal habilitado de la organización.', true, 8),
  ('medical', 'Estado de salud', E'El participante inscrito declara no padecer lesión ni enfermedad que contraindique su participación, se da por informado del esfuerzo físico que la prueba requiere y acepta los riesgos y situaciones que se pudieran derivar de su participación, liberando de toda responsabilidad a los organizadores.\n\nLa organización puede retirar de la prueba a todo participante que, a juicio de los sanitarios, no se encuentre en condiciones físicas de continuar.', true, 9),
  ('disqualifications', 'Descalificaciones', E'Es motivo de descalificación no cumplir cualquiera de las normas de este reglamento, no llevar el casco, saltarse el recorrido previsto, ensuciar o degradar el itinerario arrojando desperdicios y no respetar la señalización ni al personal de seguridad de la prueba.', true, 10),
  ('refund_policy', 'Devoluciones', E'Con el pago la inscripción es definitiva: si no se puede participar, no se devuelve el importe.\n\nLa organización no asume ninguna responsabilidad si el evento se suspende o aplaza por causas de fuerza mayor.', true, 11),
  ('responsibility', 'Responsabilidad y aceptación', E'La organización no se hace responsable de las deudas o gastos que el participante pudiera contraer durante la prueba.\n\nEl mero hecho de inscribirse en el XII Desafío BTT Las Brañas y el Mar supone la aceptación de todos y cada uno de los artículos de este reglamento.', true, 12)
  ) AS v(tipo, titulo, texto, req, orden)
 WHERE g.race_id = '12610715-5fa2-4b2f-a6af-e4174348f06b'
   AND NOT EXISTS (SELECT 1 FROM public.race_regulation_sections s WHERE s.regulation_id = g.id AND s.title = v.titulo);

-- ---------------------------------------------------------------------- FAQ
INSERT INTO public.race_faqs (race_id, question, answer, display_order)
SELECT '12610715-5fa2-4b2f-a6af-e4174348f06b', v.p, v.r, v.o
FROM (VALUES
  ('¿Cuánto cuesta la inscripción?', '25 € con licencia federativa de ciclismo (RFEC) en vigor. Sin licencia se suma la licencia de un día de la Federación de Ciclismo del Principado de Asturias, 15 €: 40 € en total. Se paga con tarjeta al inscribirse.', 1),
  ('¿Hasta cuándo me puedo inscribir?', 'Del 4 de enero al 11 de marzo de 2027 a las 23:59, o antes si se llega a los 300 participantes. No hay inscripción ni pago el día de la prueba.', 2),
  ('¿Pueden participar las bicicletas eléctricas?', 'Sí, por el mismo recorrido. Se inscriben en el Desafío e-Bike y salen a las 10:10, diez minutos después que las bicicletas convencionales.', 3),
  ('¿Qué edad hay que tener?', '18 años con licencia federativa o licencia de un día, o 17 años con licencia junior en vigor.', 4),
  ('¿Dónde y cuándo recojo el dorsal?', 'En el stand de salida y meta, en la Plaza Alfonso X el Sabio de Luarca: el sábado 13 de marzo de 19:00 a 21:00 y el domingo 14 de 8:30 a 9:45. Lleva el DNI y la licencia, si la tienes.', 5),
  ('No puedo ir, ¿me devuelven el dinero?', 'No. Con el pago la inscripción es definitiva y es personal: no la puede usar otra persona.', 6),
  ('¿Hay que llevar casco?', 'Sí, siempre y abrochado. Quitárselo en cualquier momento, por breve que sea, supone la descalificación.', 7)
) AS v(p, r, o)
WHERE NOT EXISTS (SELECT 1 FROM public.race_faqs WHERE race_id = '12610715-5fa2-4b2f-a6af-e4174348f06b');

-- --------------------------------------------------------------- rutómetro
-- Puntos sobre el GPX de 2025 (48,97 km): salida, las seis subidas con su
-- alto y su fondo de valle (desniveles de más de 80 m) y la meta. Sin
-- avituallamientos todavía: el reglamento remite al plano. Solo en el
-- recorrido BTT (la e-Bike es el mismo trazado).
INSERT INTO public.roadbooks (id, race_distance_id, name, description)
SELECT 'af00b2fd-6802-4f72-ae00-e38b496e04ac', '11e076d4-a224-4da1-b50f-3b6cb8032bb5', 'Rutómetro Desafío BTT',
       'Seis subidas desde el nivel del mar hasta las brañas de Valdés, con vuelta a Luarca. Km sobre el GPX de 2025 (48,97 km medidos).'
WHERE NOT EXISTS (SELECT 1 FROM public.roadbooks WHERE race_distance_id = '11e076d4-a224-4da1-b50f-3b6cb8032bb5');

INSERT INTO public.roadbook_items
  (roadbook_id, item_order, item_type, item_type_id, description, km_total, km_partial, km_remaining,
   latitude, longitude, altitude, is_checkpoint, is_highlighted, notes, via, origen)
SELECT 'af00b2fd-6802-4f72-ae00-e38b496e04ac', v.orden, v.tipo, t.id, v.descr, v.km, v.parcial, round(48.97 - v.km, 2),
       v.lat, v.lon, v.alt, false, v.dest, v.nota, v.via, 'panel'
FROM (VALUES
  (1,  'start',  'Salida · Plaza Alfonso X el Sabio, Luarca', 0.00,  0.00,  43.543828, -6.535611,   4, true,  'Salida a las 10:00, e-Bike a las 10:10.', 'Luarca'),
  (2,  'uphill', 'Alto de la primera subida (448 m)',         10.34, 10.34, 43.480392, -6.534572, 448, true,  'Primera subida: del mar a 448 m en 10 km.', 'Pista'),
  (3,  'poi',    'Fondo de valle (224 m)',                    11.99, 1.65,  43.479684, -6.544822, 224, false, NULL, 'Pista'),
  (4,  'uphill', 'Alto de la segunda subida (363 m)',         14.13, 2.14,  43.478201, -6.551295, 363, false, NULL, 'Pista'),
  (5,  'poi',    'Fondo de valle (156 m)',                    17.30, 3.17,  43.494987, -6.549601, 156, false, NULL, 'Pista'),
  (6,  'uphill', 'Alto de la tercera subida (251 m)',         19.40, 2.10,  43.487557, -6.559991, 251, false, NULL, 'Pista'),
  (7,  'poi',    'Fondo de valle (96 m)',                     21.66, 2.26,  43.496342, -6.568101,  96, false, 'Punto más bajo del interior: empieza la subida más larga.', 'Pista'),
  (8,  'uphill', 'Alto de la cuarta subida (417 m)',          25.40, 3.74,  43.479743, -6.598223, 417, false, NULL, 'Pista'),
  (9,  'poi',    'Fondo de valle (201 m)',                    26.82, 1.42,  43.484650, -6.606154, 201, false, NULL, 'Pista'),
  (10, 'uphill', 'Alto de la quinta subida (439 m)',          29.12, 2.30,  43.495185, -6.606872, 439, false, NULL, 'Pista'),
  (11, 'poi',    'Fondo de valle (175 m)',                    32.03, 2.91,  43.502909, -6.589274, 175, false, NULL, 'Pista'),
  (12, 'uphill', 'Techo de la prueba (486 m)',                37.44, 5.41,  43.513817, -6.593185, 486, true,  'Última subida. Desde aquí, 11,5 km de bajada hacia el mar.', 'Pista'),
  (13, 'finish', 'Meta · Plaza Alfonso X el Sabio, Luarca',   48.97, 11.53, 43.543857, -6.535675,   4, true,  'Cierre de control a las 15:00.', 'Luarca')
) AS v(orden, tipo, descr, km, parcial, lat, lon, alt, dest, nota, via)
LEFT JOIN public.roadbook_item_types t ON t.name = v.tipo
WHERE NOT EXISTS (SELECT 1 FROM public.roadbook_items WHERE roadbook_id = 'af00b2fd-6802-4f72-ae00-e38b496e04ac');

-- --------------------------------------------------------------- web propia
-- Libro de diseño medido en el cartel: azul de «BTT» 0C558A como marca, verde
-- del logo 8DC63F en el botón (texto oscuro) y verde de «DESAFÍO» 23914A.
-- Pasa avisosContraste. Portada: la foto de los ciclistas del cartel.
INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
  '12610715-5fa2-4b2f-a6af-e4174348f06b', 'gurriana', true,
  '{"colorMarca": "#0C558A", "colorAccion": "#8DC63F", "colorSecundario": "#23914A", "hero": "foto", "heroPosicion": "center 30%", "cinta": true, "cuentaAtras": true}'::jsonb,
  '{
    "nombreCorto": "Las Brañas y el Mar",
    "fechaTexto": "Domingo 14 de marzo de 2027",
    "federacion": "Federación de Ciclismo del Principado de Asturias",
    "lugar": {"nombre": "Plaza Alfonso X el Sabio", "direccion": "Plaza Alfonso X el Sabio · Luarca", "municipio": "Luarca", "provincia": "Asturias", "zona": "Concejo de Valdés", "municipios": ["Valdés"]},
    "organizador": {"nombre": "Asociación Cultural La Fuente y Club Ciclista Las Brañas y el Mar", "email": "asoc.lafuente@gmail.com"},
    "inscripcion": {
      "cierreTexto": "11 de marzo a las 23:59, o al llegar a 300 participantes",
      "edadMinima": 17,
      "incluye": ["Dorsal con chip", "Avituallamientos líquidos y sólidos", "Cronometraje"],
      "nota": "25 € con licencia federativa RFEC en vigor. Sin licencia se suma la licencia de un día de la Federación de Ciclismo del Principado de Asturias (15 €): 40 € en total. Solo inscripciones pagadas con tarjeta: no hay pago al recoger el dorsal. Mayores de 18 años, o de 17 con licencia junior.",
      "devolucion": {"texto": "Con el pago la inscripción es definitiva y personal: si no se puede participar, no se devuelve el importe."}
    },
    "reglamento": {
      "normas": ["Casco puesto y abrochado durante toda la prueba: quitárselo supone la descalificación.", "Recorrido abierto al tráfico: se cumple el Código de Circulación y las indicaciones de agentes y organización.", "Dorsal siempre visible.", "Nada de desperdicios en el itinerario."]
    },
    "programa": [
      {"fecha": "2027-03-13", "hora": "19:00", "horaFin": "21:00", "titulo": "Recogida de dorsales", "lugar": "Stand de salida y meta"},
      {"fecha": "2027-03-14", "hora": "08:30", "horaFin": "09:45", "titulo": "Recogida de dorsales", "lugar": "Stand de salida y meta"},
      {"fecha": "2027-03-14", "hora": "10:00", "titulo": "Salida Desafío BTT", "lugar": "Plaza Alfonso X el Sabio"},
      {"fecha": "2027-03-14", "hora": "10:10", "titulo": "Salida Desafío e-Bike", "lugar": "Plaza Alfonso X el Sabio"},
      {"fecha": "2027-03-14", "hora": "15:00", "titulo": "Cierre de control", "lugar": "Meta"}
    ],
    "dorsales": {
      "lugar": "Stand en la zona de salida y meta, Plaza Alfonso X el Sabio (Luarca)",
      "horarios": [["Sábado 13 de marzo", "19:00 a 21:00"], ["Domingo 14 de marzo", "8:30 a 9:45"]],
      "nota": "Imprescindible el DNI y la licencia federativa, si se tiene."
    },
    "servicios": [
      {"nombre": "Cronometraje con chip", "texto": "Tiempos de todos los participantes."},
      {"nombre": "Avituallamientos", "texto": "Varios puntos líquidos y sólidos a lo largo del recorrido."},
      {"nombre": "Licencia de un día", "texto": "Para quien no está federado, se tramita con la inscripción (15 €)."}
    ],
    "pruebas": [
      {"id": "11e076d4-a224-4da1-b50f-3b6cb8032bb5", "color": "#0C558A",
       "descripcion": "49 km y unos 1.700 m de desnivel positivo del mar a las brañas de Valdés y vuelta a Luarca. Salida a las 10:00, cierre de control a las 15:00.",
       "relato": "Se sale de la Plaza Alfonso X el Sabio, junto al puerto de Luarca, y la primera subida lleva del nivel del mar a 448 m en diez kilómetros. Siguen cinco subidas más por pistas y caminos entre prados y brañas, con bajadas a fondos de valle de hasta 96 m. El techo de la prueba, 486 m, llega en el km 37; desde allí quedan once kilómetros y medio de bajada hacia el mar hasta la meta en la misma plaza.",
       "terreno": [["Subidas", "6"], ["Altitud máxima", "486 m"]]},
      {"id": "1f19e2c1-de4a-4fb9-a9ce-fa8b64e2a567", "color": "#23914A",
       "descripcion": "El mismo recorrido de 49 km para bicicletas eléctricas. Salen a las 10:10, diez minutos después de las convencionales."}
    ],
    "documentos": [{"nombre": "Cartel 2027", "url": "https://camberas.com/fotos/branas-y-el-mar/cartel-2027.jpg"}],
    "seo": {"titulo": "XII Desafío BTT Las Brañas y el Mar 2027 · 14 de marzo · Luarca", "descripcion": "Marcha BTT de 49 km y 1.700 m de desnivel entre las brañas de Valdés y el mar, con salida y meta en Luarca (Asturias). Domingo 14 de marzo de 2027 a las 10:00; e-Bike a las 10:10."}
  }'::jsonb
)
ON CONFLICT (race_id) DO UPDATE SET plantilla = EXCLUDED.plantilla, tema = EXCLUDED.tema, contenido = EXCLUDED.contenido;

-- Organizan y colaboran (logos pendientes)
INSERT INTO public.race_sponsors (race_id, name, level, website, display_order)
SELECT '12610715-5fa2-4b2f-a6af-e4174348f06b', v.nombre, v.nivel, NULL, v.orden
FROM (VALUES
  ('Asociación Cultural de Ocio y Tiempo Libre La Fuente', 'organiza',      1),
  ('Club Ciclista Las Brañas y el Mar',                    'organiza',      2),
  ('Ayuntamiento de Valdés',                               'institucional', 3),
  ('Luarca, Villa Europea del Deporte',                    'institucional', 4)
) AS v(nombre, nivel, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.race_sponsors WHERE race_id = '12610715-5fa2-4b2f-a6af-e4174348f06b');

-- ------------------------------------------------------------ documentación
-- Checklist estándar de seed_requisitos_documentales (pide auth.uid() y no
-- corre desde la consulta), con los textos de Asturias y plazos en días.
INSERT INTO public.race_document_requirements (race_id, category, title, description, days_before_race, is_required, display_order)
SELECT '12610715-5fa2-4b2f-a6af-e4174348f06b', v.category, v.title, v.description, v.days, v.req, v.ord
FROM (VALUES
  ('permiso_municipal',   'Permiso del Ayuntamiento de Valdés', 'Autorización municipal para el recorrido, la salida y la meta en la Plaza Alfonso X el Sabio. Si el trazado cruza otro concejo, un documento por ayuntamiento.', 90, true, 1),
  ('juegos_espectaculos', 'Autorización de espectáculos (Principado de Asturias)', 'Solo si la prueba discurre por más de un concejo.', 90, false, 2),
  ('medioambiental',      'Autorización medioambiental', 'Si el recorrido cruza espacios protegidos o montes de utilidad pública. Tramitación lenta: empezar pronto.', 90, false, 3),
  ('etraza_dgt',          'Autorización de tráfico (ETRAZA / DGT)', 'Solicitud en la sede electrónica de la DGT con memoria, recorrido y horarios: el itinerario está abierto al tráfico.', 60, true, 4),
  ('federacion',          'Permiso federativo', 'Autorización de la Federación de Ciclismo del Principado de Asturias y de la RFEC, y alta de las licencias de un día.', 60, true, 5),
  ('seguro_rc',           'Póliza de Responsabilidad Civil', 'Póliza y recibo en vigor que cubra la fecha de la prueba.', 45, true, 6),
  ('seguro_accidentes',   'Póliza de accidentes de participantes', 'Licencia federativa o licencia de un día para todos los inscritos.', 45, true, 7),
  ('plan_seguridad',      'Plan de seguridad y emergencias', 'Dispositivo sanitario, evacuación, comunicaciones y coordinación con el 112.', 30, true, 8),
  ('proteccion_datos',    'Protección de datos y consentimientos', 'Cláusulas RGPD de la inscripción y cesión de imagen.', 30, true, 9)
) AS v(category, title, description, days, req, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.race_document_requirements x WHERE x.race_id = '12610715-5fa2-4b2f-a6af-e4174348f06b' AND x.category = v.category);

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT name, slug, date, is_visible, organizer_id, registration_opens, registration_closes FROM public.races WHERE id = '12610715-5fa2-4b2f-a6af-e4174348f06b';
SELECT d.name, d.distance_km, d.price, d.kind, d.competitive, d.chip, d.bib_start, d.bib_end,
       (SELECT count(*) FROM public.race_distance_prices p WHERE p.race_distance_id = d.id) AS tramos,
       (SELECT count(*) FROM public.race_categories c WHERE c.race_distance_id = d.id) AS categorias,
       (SELECT count(*) FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.is_visible) AS campos,
       (SELECT count(*) FROM public.race_checkpoints k WHERE k.race_distance_id = d.id) AS controles,
       (SELECT to_char(w.hora_prevista AT TIME ZONE 'UTC', 'HH24:MI') FROM public.race_waves w WHERE w.race_distance_id = d.id) AS salida
  FROM public.race_distances d WHERE d.race_id = '12610715-5fa2-4b2f-a6af-e4174348f06b' ORDER BY d.display_order;
SELECT count(*) AS secciones FROM public.race_regulation_sections WHERE regulation_id = '2f5cdab9-88b0-467e-95e6-aebe5586384f';
SELECT * FROM public.guardia_horas() WHERE nivel = 'FALLO';
