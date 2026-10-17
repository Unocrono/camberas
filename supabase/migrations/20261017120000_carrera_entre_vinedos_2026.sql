-- =============================================================================
-- Carrera: XIX Carrera Entre Viñedos 2026 · Memorial José Antonio Aguado
-- (Cenicero, La Rioja). Organiza el Club Maratón Rioja; cronometra UNO Crono.
-- Alta completa con el criterio de Gurriana/Picota: carrera, tres pruebas
-- (11K, Marcha por el mismo recorrido e Infantil), precios por tramos,
-- salidas, categorías máster por quinquenios, formulario con «local de
-- Cenicero», reglamento por secciones, FAQ, rutómetro, web propia y
-- organizador.
-- Datos: cartel de la XIX edición (salidas 11:00, 10:00 y 10:15), reglamento
-- del organizador (17-oct), formularios de uno.es (precios y plazos, 22-sep) y
-- el GPX de la edición de 2021 (public/gpx/entre-vinedos-2026.gpx, Wikiloc,
-- 10,9 km medidos).
--
-- SENTENCIAS SUELTAS, sin bloques DO (el editor SQL los parte). Todas son
-- idempotentes: se puede volver a ejecutar entera.
--
-- Supuestos a confirmar con el organizador:
--   · la inscripción se hace en carreraentrevinedos.com (uno.es), no en
--     Camberas: los plazos y tramos se cargan igual para la ficha y los
--     inscritos entran por importación;
--   · rangos de dorsal: 1-1500 carrera, 1501-2000 marcha, 2001-2500 infantil;
--   · la Marcha lleva chip (misma inscripción y precio que la carrera) y no
--     clasifica; la Infantil se queda con la categoría UNICA hasta tener los
--     años de nacimiento de alevín, infantil y cadete;
--   · el extra de la infantil «con camiseta y bollo (+7 €)» y los grupos de
--     10 (130/160 €) no se modelan: van en el texto de la web;
--   · el GPX es el de 2021: si el trazado ha cambiado, sustituir el fichero.
-- Nace OCULTA (is_visible = false) con la web activa: se ve con ?previa=1
-- desde el panel. Cuando se quiera publicar, is_visible = true.
-- El cartel y la portada van en 20261017130000; falta el logo (logo_url).
-- Requiere 20260928140000 (tipos de ítem del rutómetro).
-- =============================================================================

-- ------------------------------------------------------------------ carrera
INSERT INTO public.races (
  id, name, slug, subtitle, description, race_type, group_type, date, location,
  max_participants, registration_opens, registration_closes,
  is_visible, is_featured, es_demo, show_available_places, utc_offset, category_age_reference,
  organizer_email, official_website_url, logo_url
) VALUES (
  '1789e37c-0329-4cf1-ace7-32419c12db6c',
  'XIX Carrera Entre Viñedos 2026',
  'entre-vinedos-2026',
  'Memorial José Antonio Aguado · 11K, Marcha y Carrera Infantil · Cenicero (La Rioja)',
  'Decimonovena edición de la carrera popular de Cenicero entre los viñedos de Rioja Alta: 11 km llanos y rápidos con salida y meta en la Casa de Cultura, frente a la iglesia. Marcha no competitiva por el mismo recorrido y Carrera Infantil. Domingo 25 de octubre de 2026. Organiza el Club Maratón Rioja con el patrocinio del Ayuntamiento de Cenicero.',
  'popular', 'carrera', '2026-10-25',
  'Casa de Cultura, Cenicero (La Rioja)',
  2000, '2026-05-25 00:00:00+00', '2026-10-21 23:59:00+00',
  false, false, false, false, 60, 'race_date',
  NULL, 'https://www.carreraentrevinedos.com', NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description, race_type = EXCLUDED.race_type, date = EXCLUDED.date,
  location = EXCLUDED.location, max_participants = EXCLUDED.max_participants,
  registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
  category_age_reference = EXCLUDED.category_age_reference, official_website_url = EXCLUDED.official_website_url;

-- --------------------------------------------------------------- distancias
-- 11K y Marcha comparten GPX (10,91 km medidos, 47 m D+, de 406 a 437 m).
INSERT INTO public.race_distances (
  id, race_id, name, distance_km, elevation_gain, elevation_loss, alt_max, alt_min, price,
  cutoff_time, start_location, finish_location, registration_opens, registration_closes,
  is_visible, display_order, bib_start, bib_end, kind, competitive, chip, gpx_file_url
) VALUES
  ('1792e56f-be42-49f2-9f78-f30aae1bc31f', '1789e37c-0329-4cf1-ace7-32419c12db6c',
   'Carrera Entre Viñedos 11K', 11, 47, 37, 437, 406, 20, '1:30 h',
   'Casa de Cultura, Cenicero', 'Casa de Cultura, Cenicero',
   '2026-05-25 00:00:00+00', '2026-10-21 23:59:00+00',
   true, 1, 1, 1500, 'carrera', true, true, 'https://camberas.com/gpx/entre-vinedos-2026.gpx'),
  ('979bd18c-ce4a-4da2-a28e-0a01e85f5b4c', '1789e37c-0329-4cf1-ace7-32419c12db6c',
   'Marcha Entre Viñedos', 11, 47, 37, 437, 406, 20, NULL,
   'Casa de Cultura, Cenicero', 'Casa de Cultura, Cenicero',
   '2026-05-25 00:00:00+00', '2026-10-21 23:59:00+00',
   true, 2, 1501, 2000, 'marcha', false, true, 'https://camberas.com/gpx/entre-vinedos-2026.gpx'),
  ('17dd386a-70d7-4a93-a0ac-fae53927daee', '1789e37c-0329-4cf1-ace7-32419c12db6c',
   'Carrera Infantil Entre Viñedos', 1.8, NULL, NULL, NULL, NULL, 5, NULL,
   'Casa de Cultura, Cenicero', 'Casa de Cultura, Cenicero',
   '2026-05-25 00:00:00+00', '2026-10-21 23:59:00+00',
   true, 3, 2001, 2500, 'infantil', true, true, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, distance_km = EXCLUDED.distance_km, elevation_gain = EXCLUDED.elevation_gain,
  elevation_loss = EXCLUDED.elevation_loss, alt_max = EXCLUDED.alt_max, alt_min = EXCLUDED.alt_min,
  price = EXCLUDED.price, cutoff_time = EXCLUDED.cutoff_time, kind = EXCLUDED.kind, competitive = EXCLUDED.competitive,
  chip = EXCLUDED.chip, registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
  gpx_file_url = EXCLUDED.gpx_file_url;

-- Precios por tramos (hora de pared +00): 15 € hasta el 31 de mayo, 18 € hasta
-- el 1 de octubre y 20 € hasta el cierre del 21 de octubre. La inscripción
-- presencial del sábado 24 (25 €) no es un tramo online: va en la web.
DELETE FROM public.race_distance_prices
 WHERE race_distance_id IN ('1792e56f-be42-49f2-9f78-f30aae1bc31f', '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c');
INSERT INTO public.race_distance_prices (race_distance_id, price, start_datetime, end_datetime) VALUES
  ('1792e56f-be42-49f2-9f78-f30aae1bc31f', 15, '2026-05-25 00:00:00+00', '2026-05-31 23:59:59+00'),
  ('1792e56f-be42-49f2-9f78-f30aae1bc31f', 18, '2026-06-01 00:00:00+00', '2026-10-01 23:59:59+00'),
  ('1792e56f-be42-49f2-9f78-f30aae1bc31f', 20, '2026-10-02 00:00:00+00', '2026-10-21 23:59:00+00'),
  ('979bd18c-ce4a-4da2-a28e-0a01e85f5b4c', 15, '2026-05-25 00:00:00+00', '2026-05-31 23:59:59+00'),
  ('979bd18c-ce4a-4da2-a28e-0a01e85f5b4c', 18, '2026-06-01 00:00:00+00', '2026-10-01 23:59:59+00'),
  ('979bd18c-ce4a-4da2-a28e-0a01e85f5b4c', 20, '2026-10-02 00:00:00+00', '2026-10-21 23:59:00+00');

-- Salidas del cartel: Marcha 10:00, Infantil 10:15, Carrera 11:00.
-- Prevista y oficial iguales al nacer (hora de pared +00).
INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, hora_prevista, start_time) VALUES
  ('1789e37c-0329-4cf1-ace7-32419c12db6c', '1792e56f-be42-49f2-9f78-f30aae1bc31f', 'Salida Carrera 11K',  '2026-10-25 11:00:00+00', '2026-10-25 11:00:00+00'),
  ('1789e37c-0329-4cf1-ace7-32419c12db6c', '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c', 'Salida Marcha',       '2026-10-25 10:00:00+00', '2026-10-25 10:00:00+00'),
  ('1789e37c-0329-4cf1-ace7-32419c12db6c', '17dd386a-70d7-4a93-a0ac-fae53927daee', 'Salida Infantil',     '2026-10-25 10:15:00+00', '2026-10-25 10:15:00+00')
ON CONFLICT (race_distance_id) DO UPDATE SET
  wave_name = EXCLUDED.wave_name, hora_prevista = EXCLUDED.hora_prevista, start_time = EXCLUDED.start_time;

-- Meta de cronometraje a la distancia del GPX (el perfil y el mapa salen de él)
UPDATE public.race_checkpoints SET distance_km = 10.91
 WHERE race_distance_id IN ('1792e56f-be42-49f2-9f78-f30aae1bc31f', '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c')
   AND checkpoint_type = 'FINISH';

-- --------------------------------------------------------------- categorías
-- Carrera 11K: Senior (hasta 34) y máster por quinquenios (35-39 … 65+), sin
-- sexo (Camberas antepone M-/F-: el M35/F35 del reglamento). Edad EL DÍA DE LA
-- CARRERA, como dice el reglamento (race_date, 25-10-2026). La UNICA que
-- siembra el trigger sobra en la carrera; en Marcha (no competitiva) e
-- Infantil (faltan los años de alevín/infantil/cadete) se queda.
DELETE FROM public.race_categories
 WHERE race_distance_id = '1792e56f-be42-49f2-9f78-f30aae1bc31f' AND name = 'UNICA';
INSERT INTO public.race_categories (race_id, race_distance_id, name, short_name, gender, min_age, max_age, age_dependent, age_calculation_date, display_order, category_number)
SELECT '1789e37c-0329-4cf1-ace7-32419c12db6c', '1792e56f-be42-49f2-9f78-f30aae1bc31f', v.name, v.short, NULL, v.min_age, v.max_age, true, DATE '2026-10-25', v.orden, v.orden
FROM (VALUES
  ('Senior',    'SEN', NULL::int, 34,        1),
  ('Máster 35', 'M35', 35,        39,        2),
  ('Máster 40', 'M40', 40,        44,        3),
  ('Máster 45', 'M45', 45,        49,        4),
  ('Máster 50', 'M50', 50,        54,        5),
  ('Máster 55', 'M55', 55,        59,        6),
  ('Máster 60', 'M60', 60,        64,        7),
  ('Máster 65', 'M65', 65,        NULL::int, 8)
) AS v(name, short, min_age, max_age, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.race_categories
                   WHERE race_distance_id = '1792e56f-be42-49f2-9f78-f30aae1bc31f' AND name = v.name);

-- --------------------------------------------------------------- formulario
SELECT public.seed_default_registration_fields_for_distance('1792e56f-be42-49f2-9f78-f30aae1bc31f');
SELECT public.seed_default_registration_fields_for_distance('979bd18c-ce4a-4da2-a28e-0a01e85f5b4c');
SELECT public.seed_default_registration_fields_for_distance('17dd386a-70d7-4a93-a0ac-fae53927daee');

-- Carrera y Marcha: local de Cenicero (trofeos a locales) y talla de camiseta
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT d.id, 'local_cenicero', '¿Estás empadronado/a o resides en Cenicero?', 'radio', 20, true, false, true,
       '["No", "Sí"]'::jsonb, 'Hay trofeos para los corredores locales. Solo cuenta si lo indicas al inscribirte.'
  FROM public.race_distances d
 WHERE d.id IN ('1792e56f-be42-49f2-9f78-f30aae1bc31f', '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c')
   AND NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.field_name = 'local_cenicero');

INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT d.id, 'talla_camiseta', 'Talla de camiseta', 'select', 21, true, false, true,
       '["S", "M", "L", "XL", "XXL", "No quiero camiseta"]'::jsonb, NULL
  FROM public.race_distances d
 WHERE d.id IN ('1792e56f-be42-49f2-9f78-f30aae1bc31f', '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c')
   AND NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.field_name = 'talla_camiseta');

-- Infantil: tutor que autoriza
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT '17dd386a-70d7-4a93-a0ac-fae53927daee', 'tutor', 'Nombre y DNI del padre, madre o tutor/a que autoriza', 'text', 20, true, false, true,
       NULL, 'La inscripción de un menor la hace y la firma un adulto responsable.'
WHERE NOT EXISTS (SELECT 1 FROM public.registration_form_fields
                   WHERE race_distance_id = '17dd386a-70d7-4a93-a0ac-fae53927daee' AND field_name = 'tutor');

-- --------------------------------------------------------------- reglamento
INSERT INTO public.race_regulations (id, race_id, published, version)
SELECT 'd10e578b-3309-4dd7-a2e1-ddc7ce123a7a', '1789e37c-0329-4cf1-ace7-32419c12db6c', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.race_regulations WHERE race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c');

INSERT INTO public.race_regulation_sections (regulation_id, section_type, title, content, is_required, section_order)
SELECT g.id, v.tipo, v.titulo, v.texto, v.req, v.orden
  FROM public.race_regulations g
  CROSS JOIN (VALUES
  ('general_info', 'Fecha, lugar y organización', E'El Club Maratón Rioja organiza la decimonovena edición de la Carrera Entre Viñedos, Memorial José Antonio Aguado, que se disputa el domingo 25 de octubre de 2026 en Cenicero (La Rioja), con el patrocinio del Ayuntamiento de Cenicero.\n\nLa salida de la carrera se da a las 11:00 h desde la Casa de Cultura de Cenicero, frente a la iglesia. La Marcha Entre Viñedos sale a las 10:00 h por el mismo recorrido y la Carrera Infantil a las 10:15 h.\n\nLa competición se cronometra mediante sistema electrónico. La organización pondrá medios para controlar el paso de los participantes.', true, 1),
  ('course', 'Recorrido', E'Carrera de 11 km entre los viñedos de Cenicero, prácticamente llana, con salida y meta en la Casa de Cultura. La Marcha recorre el mismo trazado. La Carrera Infantil se disputa sobre 1,8 km.\n\nLa organización se reserva el derecho a cambiar el recorrido y el horario de la prueba.', true, 2),
  ('registration', 'Inscripciones', E'La inscripción se formaliza rellenando el formulario de participación de la página web de la carrera (www.carreraentrevinedos.com). Plazos y cuotas, en el apartado CARRERA > INFORMACIÓN de la web: 15 € hasta el 31 de mayo, 18 € hasta el 1 de octubre y 20 € hasta el 21 de octubre; inscripción presencial el sábado 24 de octubre a 25 €. Grupos de 10 personas en un solo pago (130 € hasta el 31 de mayo, 160 € hasta el 1 de octubre). Carrera Infantil: 5 € con dorsal y chip, 12 € con camiseta y bollo.\n\nEl plazo se cierra antes si se cubre el cupo máximo de 2.000 corredores inscritos. Solo cuando la organización tenga constancia de que el pago se ha realizado se considera a un atleta inscrito en la carrera.\n\nEstá prohibido correr con el dorsal de otra persona.', true, 3),
  ('aid_stations', 'Avituallamiento', E'Los participantes recibirán avituallamiento durante la prueba. La organización decide, según su propio criterio, los puntos de avituallamiento y el alimento que se entrega en ellos.', false, 4),
  ('cutoff_times', 'Horarios y tiempo máximo', E'Salidas desde la Casa de Cultura de Cenicero: Marcha Entre Viñedos a las 10:00 h, Carrera Infantil a las 10:15 h y Carrera Entre Viñedos a las 11:00 h.\n\nEl tiempo máximo previsto para completar el recorrido es de 1 hora y 30 minutos.\n\nLos participantes deben atender las normas de circulación en caso de encontrarse con vehículos o caminantes durante el desarrollo de la carrera.', true, 5),
  ('classifications', 'Categorías y trofeos', E'Habrá trofeos para los tres primeros clasificados en la línea de meta, masculinos y femeninos, y por categorías en senior, máster y locales, tanto masculinos como femeninos.\n\nCategorías máster: de 35 a 39 (F35 y M35), de 40 a 44 (F40 y M40), de 45 a 49 (F45 y M45), de 50 a 54 (F50 y M50), de 55 a 59 (F55 y M55), de 60 a 64 (F60 y M60) y de 65 en adelante (F65 y M65). Todas las edades se consideran el día de la carrera.\n\nSe consideran corredores locales quienes estén empadronados o sean residentes en Cenicero y así lo hagan constar en el momento de su inscripción.\n\nHabrá además dos trofeos para cada uno de los clubes que más corredores inscriba, de la Comunidad y de fuera de ella, sin contar el club organizador.', false, 6),
  ('refund_policy', 'Devoluciones y cambios de inscripción', E'La organización se reserva el derecho a cancelar la celebración de la carrera. En tal caso devolverá a los inscritos las tasas de inscripción. Este supuesto es el único por el que se devuelve la tasa: por ningún otro motivo se efectuará devolución alguna.\n\nSi un corredor inscrito no puede participar por lesión de última hora o cualquier otra causa, puede cambiar su inscripción por la de otra persona enviando un correo a la organización antes del 19 de octubre a las 23:59 h con todos los datos precisos. En ningún caso se efectúa el cambio pasada esa fecha, y bajo ningún concepto se devuelve el importe de la inscripción.', true, 7),
  ('medical', 'Seguros', E'El riesgo de responsabilidad civil de la organización de la prueba está cubierto por una póliza de seguro contratada por el Club Maratón Rioja. Los participantes tienen, además, un seguro de accidentes nominal contratado por la organización.', true, 8),
  ('disqualifications', 'Comportamiento', E'Como cualquier ciudadano, los participantes deben tener un comportamiento cívico durante el desarrollo de la prueba: tratar respetuosamente a las personas con las que se crucen y no arrojar al suelo restos de comida ni ningún tipo de basura. Cada participante es responsable de las faltas que pueda cometer. La organización se reserva el derecho de emprender acciones contra los participantes cuyo comportamiento pueda dañar su imagen.\n\nEstá prohibido correr con el dorsal de otra persona.', true, 9),
  ('custom', 'Comunicaciones', E'Los medios que la organización utiliza para informar sobre aspectos logísticos de la prueba y notificar los cambios o anulaciones que pudieran producirse son el sitio web de la carrera (www.carreraentrevinedos.com) y la dirección de correo electrónico que los inscritos hayan comunicado en su boletín de inscripción. La organización no se responsabiliza de los problemas que los inscritos puedan tener para acceder a estos medios.', false, 10),
  ('responsibility', 'Responsabilidad y aceptación', E'La organización declina la responsabilidad por daños, perjuicios o lesiones que cada participante pueda ocasionar, a sí mismo o a otra persona, incluso en el caso de que terceras personas causen daño al participante.\n\nTodos los participantes, por el hecho de tomar parte en la carrera, aceptan este reglamento.', true, 11)
  ) AS v(tipo, titulo, texto, req, orden)
 WHERE g.race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c'
   AND NOT EXISTS (SELECT 1 FROM public.race_regulation_sections s WHERE s.regulation_id = g.id AND s.section_type = v.tipo);

-- ---------------------------------------------------------------------- FAQ
INSERT INTO public.race_faqs (race_id, question, answer, display_order)
SELECT '1789e37c-0329-4cf1-ace7-32419c12db6c', v.p, v.r, v.o
FROM (VALUES
  ('¿A qué hora sale cada prueba?', 'La Marcha a las 10:00, la Carrera Infantil a las 10:15 y la Carrera de 11 km a las 11:00, todas desde la Casa de Cultura de Cenicero, frente a la iglesia.', 1),
  ('¿Puedo apuntarme el mismo fin de semana?', 'Sí: inscripción presencial el sábado 24 de octubre a 25 €. Online se cierra el 21 de octubre a las 23:59, o antes si se llega a los 2.000 inscritos.', 2),
  ('¿Qué es la categoría de locales?', 'Hay trofeos para los corredores empadronados o residentes en Cenicero, masculinos y femeninos. Solo cuenta si lo indicas al inscribirte.', 3),
  ('¿Cómo se calculan las categorías máster?', 'Por la edad que tengas el día de la carrera: Senior hasta 34 años y máster de 35 a 39, 40 a 44, 45 a 49, 50 a 54, 55 a 59, 60 a 64 y 65 en adelante.', 4),
  ('No puedo correr, ¿me devuelven el dinero?', 'No. Solo se devuelve la cuota si la organización cancela la carrera. Hasta el 19 de octubre a las 23:59 puedes ceder tu inscripción a otra persona enviando un correo a la organización con todos los datos.', 5),
  ('¿Hay premio para los clubes?', 'Sí: dos trofeos para el club que más corredores inscriba de La Rioja y otros dos para el de fuera de la Comunidad, sin contar al Club Maratón Rioja.', 6)
) AS v(p, r, o)
WHERE NOT EXISTS (SELECT 1 FROM public.race_faqs WHERE race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c');

-- --------------------------------------------------------------- rutómetro
-- Puntos sobre el GPX de 2021 (10,91 km): salida, kilómetros, el punto más
-- alejado del pueblo, el más bajo y la meta. El reglamento no fija
-- avituallamientos ni puntos de paso.
INSERT INTO public.roadbooks (id, race_distance_id, name, description)
SELECT 'f3afa7d0-f7de-42a7-8382-436fe032192c', '1792e56f-be42-49f2-9f78-f30aae1bc31f', 'Rutómetro Carrera 11K',
       'Vuelta entre los viñedos de Cenicero hacia el este y regreso por el norte del pueblo. Km sobre el GPX de 2021 (10,9 km medidos).'
WHERE NOT EXISTS (SELECT 1 FROM public.roadbooks WHERE race_distance_id = '1792e56f-be42-49f2-9f78-f30aae1bc31f');

INSERT INTO public.roadbook_items
  (roadbook_id, item_order, item_type, item_type_id, description, km_total, km_partial, km_remaining,
   latitude, longitude, altitude, is_checkpoint, is_highlighted, notes, via)
SELECT 'f3afa7d0-f7de-42a7-8382-436fe032192c', v.orden, v.tipo, t.id, v.descr, v.km, v.parcial, round(10.91 - v.km, 2),
       v.lat, v.lon, v.alt, false, v.dest, v.nota, v.via
FROM (VALUES
  (1,  'start',  'Salida · Casa de Cultura de Cenicero',  0.00, 0.00, 42.481117, -2.641467, 425, true,  'Frente a la iglesia. Hacia el este, entre viñedos.', 'Pueblo'),
  (2,  'poi',    'Km 2',                                  2.00, 2.00, 42.487760, -2.623945, 422, false, NULL, 'Camino entre viñedos'),
  (3,  'poi',    'Km 4 · punto más alejado del pueblo',   4.00, 2.00, 42.496944, -2.606847, 425, true,  'Giro de vuelta hacia Cenicero.', 'Camino entre viñedos'),
  (4,  'poi',    'Km 6',                                  6.00, 2.00, 42.490573, -2.614592, 425, false, NULL, 'Camino entre viñedos'),
  (5,  'poi',    'Km 8',                                  8.00, 2.00, 42.483520, -2.636500, 429, false, 'Se vuelve a entrar al pueblo.', 'Pueblo'),
  (6,  'poi',    'Km 9,5 · punto más bajo (406 m)',       9.51, 1.51, 42.482858, -2.642055, 406, false, 'Último kilómetro y medio en ligera subida hasta la meta.', 'Pueblo'),
  (7,  'finish', 'Meta · Casa de Cultura de Cenicero',   10.91, 1.40, 42.481312, -2.642302, 436, true,  'Tiempo máximo 1 h 30 min.', 'Pueblo')
) AS v(orden, tipo, descr, km, parcial, lat, lon, alt, dest, nota, via)
LEFT JOIN public.roadbook_item_types t ON t.name = v.tipo
WHERE NOT EXISTS (SELECT 1 FROM public.roadbook_items WHERE roadbook_id = 'f3afa7d0-f7de-42a7-8382-436fe032192c');

-- --------------------------------------------------------------- web propia
-- Libro de diseño medido en el cartel: morado del título 7A1F5F, rosa E2457C
-- y verde lima de la marcha B7C72C. Sin cartel ni logo todavía: portada de color.
INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
  '1789e37c-0329-4cf1-ace7-32419c12db6c', 'gurriana', true,
  '{"colorMarca": "#7A1F5F", "colorAccion": "#E2457C", "colorSecundario": "#B7C72C", "hero": "color", "cinta": true, "cuentaAtras": true}'::jsonb,
  '{
    "nombreCorto": "Entre Viñedos",
    "fechaTexto": "Domingo 25 de octubre de 2026",
    "lugar": {"nombre": "Casa de Cultura de Cenicero", "direccion": "Casa de Cultura, frente a la iglesia · Cenicero", "municipio": "Cenicero", "provincia": "La Rioja", "zona": "Viñedos de Rioja Alta", "municipios": ["Cenicero"]},
    "organizador": {"nombre": "Club Maratón Rioja", "web": "https://www.carreraentrevinedos.com"},
    "inscripcion": {
      "cierreTexto": "21 de octubre online (o al llegar a 2.000 inscritos) · presencial el sábado 24 de octubre",
      "incluye": ["Dorsal con chip", "Camiseta conmemorativa", "Seguro de accidentes nominal", "Avituallamiento"],
      "nota": "Inscripción en www.carreraentrevinedos.com. Grupos de 10 personas en un solo pago: 130 € hasta el 31 de mayo y 160 € hasta el 1 de octubre. Carrera Infantil: 5 € con dorsal y chip, 12 € con camiseta y bollo. Está prohibido correr con el dorsal de otra persona.",
      "devolucion": {"texto": "Solo se devuelve la cuota si la organización cancela la carrera. Hasta el 19 de octubre a las 23:59 se puede ceder la inscripción a otra persona por correo a la organización."}
    },
    "reglamento": {
      "normas": ["Dorsal personal e intransferible: prohibido correr con el de otra persona.", "Se atienden las normas de circulación si aparecen vehículos o caminantes.", "Comportamiento cívico: nada de basura al suelo y respeto a las personas con las que se cruce."]
    },
    "programa": [
      {"fecha": "2026-10-24", "titulo": "Inscripción presencial (25 €)", "lugar": "Cenicero"},
      {"fecha": "2026-10-25", "hora": "10:00", "titulo": "Salida Marcha Entre Viñedos", "lugar": "Casa de Cultura"},
      {"fecha": "2026-10-25", "hora": "10:15", "titulo": "Salida Carrera Infantil", "lugar": "Casa de Cultura"},
      {"fecha": "2026-10-25", "hora": "11:00", "titulo": "Salida Carrera Entre Viñedos 11K", "lugar": "Casa de Cultura"}
    ],
    "premios": [
      {"pruebas": ["1792e56f-be42-49f2-9f78-f30aae1bc31f"], "categoria": "General masculina y femenina", "premio": "Tres primeros puestos en meta"},
      {"pruebas": ["1792e56f-be42-49f2-9f78-f30aae1bc31f"], "categoria": "Senior y máster (35, 40, 45, 50, 55, 60 y 65), masculino y femenino", "premio": "Trofeos por categoría", "texto": "Edad el día de la carrera."},
      {"pruebas": ["1792e56f-be42-49f2-9f78-f30aae1bc31f"], "categoria": "Locales de Cenicero", "premio": "Trofeos masculino y femenino", "texto": "Empadronados o residentes que lo indiquen al inscribirse."},
      {"pruebas": ["1792e56f-be42-49f2-9f78-f30aae1bc31f"], "categoria": "Clubes", "premio": "Dos trofeos al club con más inscritos de La Rioja y dos al de fuera", "texto": "Sin contar al Club Maratón Rioja."}
    ],
    "servicios": [
      {"nombre": "Cronometraje con chip", "texto": "Sistema electrónico en todas las pruebas."},
      {"nombre": "Avituallamiento", "texto": "Durante la prueba y en meta, a criterio de la organización."},
      {"nombre": "Seguro", "texto": "Responsabilidad civil del Club Maratón Rioja y seguro de accidentes nominal para cada participante."}
    ],
    "pruebas": [
      {"id": "1792e56f-be42-49f2-9f78-f30aae1bc31f", "color": "#7A1F5F",
       "descripcion": "11 km llanos y rápidos entre los viñedos de Cenicero, con salida y meta en la Casa de Cultura. Tiempo máximo 1 h 30 min.",
       "relato": "Se sale de la Casa de Cultura, frente a la iglesia, hacia el este por los caminos de concentración entre viñedos. El recorrido se aleja del pueblo hasta el km 4, donde gira y vuelve por el norte. Es prácticamente llano: apenas 47 m de desnivel positivo entre los 406 y los 437 m. Se entra de nuevo en Cenicero hacia el km 8 y el último kilómetro y medio sube suave hasta la meta en la Casa de Cultura.",
       "terreno": [["Pueblo", "2 km"], ["Caminos entre viñedos", "9 km"]]},
      {"id": "979bd18c-ce4a-4da2-a28e-0a01e85f5b4c", "color": "#B7C72C",
       "descripcion": "Marcha no competitiva por el mismo recorrido de 11 km de la carrera. Sale a las 10:00, una hora antes que los corredores."},
      {"id": "17dd386a-70d7-4a93-a0ac-fae53927daee", "color": "#E2457C",
       "descripcion": "Carrera infantil de 1,8 km para alevines, infantiles y cadetes. Sale a las 10:15 desde la Casa de Cultura."}
    ],
    "seo": {"titulo": "XIX Carrera Entre Viñedos 2026 · 25 de octubre · Cenicero", "descripcion": "Carrera popular de 11 km entre los viñedos de Cenicero (La Rioja), marcha por el mismo recorrido y carrera infantil. Domingo 25 de octubre de 2026 desde la Casa de Cultura. Memorial José Antonio Aguado."}
  }'::jsonb
)
ON CONFLICT (race_id) DO UPDATE SET plantilla = EXCLUDED.plantilla, tema = EXCLUDED.tema, contenido = EXCLUDED.contenido;

-- Organiza y patrocina
INSERT INTO public.race_sponsors (race_id, name, level, website, display_order)
SELECT '1789e37c-0329-4cf1-ace7-32419c12db6c', v.nombre, v.nivel, v.web, v.orden
FROM (VALUES
  ('Club Maratón Rioja',      'organiza',  'https://www.carreraentrevinedos.com', 1),
  ('Ayuntamiento de Cenicero', 'principal', NULL, 2)
) AS v(nombre, nivel, web, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.race_sponsors WHERE race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c');

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT name, slug, date, is_visible, registration_opens, registration_closes FROM public.races WHERE id = '1789e37c-0329-4cf1-ace7-32419c12db6c';
SELECT d.name, d.distance_km, d.kind, d.competitive, d.chip, d.bib_start, d.bib_end,
       (SELECT count(*) FROM public.race_distance_prices p WHERE p.race_distance_id = d.id) AS tramos,
       (SELECT count(*) FROM public.race_categories c WHERE c.race_distance_id = d.id) AS categorias,
       (SELECT count(*) FROM public.registration_form_fields f WHERE f.race_distance_id = d.id) AS campos,
       (SELECT count(*) FROM public.roadbook_items i JOIN public.roadbooks r ON r.id = i.roadbook_id WHERE r.race_distance_id = d.id) AS puntos_rutometro,
       (SELECT to_char(w.hora_prevista AT TIME ZONE 'UTC', 'HH24:MI') FROM public.race_waves w WHERE w.race_distance_id = d.id) AS salida
  FROM public.race_distances d WHERE d.race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c' ORDER BY d.display_order;
-- Categorías: 30 años → Senior; 42 → Máster 40; 70 → Máster 65 (edad el 25-10-2026)
SELECT public.get_race_category('1789e37c-0329-4cf1-ace7-32419c12db6c', DATE '1996-06-01', 'M', '1792e56f-be42-49f2-9f78-f30aae1bc31f') AS a30,
       public.get_race_category('1789e37c-0329-4cf1-ace7-32419c12db6c', DATE '1984-06-01', 'F', '1792e56f-be42-49f2-9f78-f30aae1bc31f') AS a42,
       public.get_race_category('1789e37c-0329-4cf1-ace7-32419c12db6c', DATE '1956-06-01', 'M', '1792e56f-be42-49f2-9f78-f30aae1bc31f') AS a70;
SELECT count(*) AS secciones FROM public.race_regulation_sections WHERE regulation_id = 'd10e578b-3309-4dd7-a2e1-ddc7ce123a7a';
