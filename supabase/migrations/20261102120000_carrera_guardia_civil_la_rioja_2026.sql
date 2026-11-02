-- =============================================================================
-- Carrera: II Carrera Solidaria Guardia Civil La Rioja 2026 · a favor de la
-- esclerosis múltiple (Haro, La Rioja). Organiza la 10ª Zona de la Guardia
-- Civil; los fondos van a ARDEM (Asociación Riojana de Esclerosis Múltiple).
-- Alta completa con el criterio de Entre Viñedos (20261017120000): carrera,
-- cuatro pruebas (6K, Caminata 6K, 1K y 500 m), precios, salidas, categorías,
-- formulario, reglamento por secciones, FAQ, web propia, cartel y portada,
-- patrocinadores y enlace externo de inscripción.
-- Datos: reglamento (Anexo II) y certificado de seguro (Anexo III) del
-- organizador, cartel de la II edición y la ficha de Rockthesport
-- (precios, plazos y horarios, consultada el 2-nov-2026).
--
-- SENTENCIAS SUELTAS, sin bloques DO (el editor SQL los parte). Todas son
-- idempotentes: se puede volver a ejecutar entera.
--
-- Supuestos a confirmar con el organizador:
--   · la inscripción se hace en Rockthesport, no en Camberas: los plazos y
--     precios se cargan igual para la ficha y los inscritos entran por
--     importación (registration_url en cada recorrido);
--   · inscripciones CERRADAS: el cierre se adelanta al 1-nov-2026 23:59 en la
--     carrera, en los cuatro recorridos y en sus tramos de precio (Rockthesport
--     anunciaba el 8 de noviembre);
--   · rangos de dorsal, los de 2025: 1-1000 carrera, 1001-2000 caminata,
--     2001-2300 1K y 2301-2600 500 m;
--   · solo el 6K lleva chip y clasifica; 1K y 500 m son infantiles con
--     medalla para todos, sin clasificación; la caminata no compite;
--   · el dorsal solidario (5, 10, 20, 50 € o donación libre) y la camiseta
--     solidaria (10 €) no dan derecho a participar: no son recorridos, van
--     en el texto de la web;
--   · las tallas de camiseta son las de 2025;
--   · no hay GPX ni rutómetro todavía.
-- Nace OCULTA (is_visible = false) con la web activa: se ve con ?previa=1
-- desde el panel. Cuando se quiera publicar, is_visible = true.
-- Ficheros: public/fotos/guardia-civil-la-rioja/{cartel-2026.jpg,portada-cartel.webp}.
-- Falta el logo (logo_url).
-- =============================================================================

-- ------------------------------------------------------------------ carrera
INSERT INTO public.races (
  id, name, slug, subtitle, description, race_type, group_type, date, location,
  max_participants, registration_opens, registration_closes,
  is_visible, is_featured, es_demo, show_available_places, utc_offset, category_age_reference,
  organizer_email, official_website_url, logo_url, poster_url, cover_image_url
) VALUES (
  '182defd5-bb44-4f9d-951a-6876472a8f8c',
  'II Carrera Solidaria Guardia Civil La Rioja 2026',
  'guardia-civil-la-rioja-2026',
  'A favor de la esclerosis múltiple · 6K, Caminata y carreras infantiles · Haro (La Rioja)',
  'Segunda edición de la carrera solidaria de la 10ª Zona de la Guardia Civil de La Rioja, este año en Haro y a favor de ARDEM, la Asociación Riojana de Esclerosis Múltiple. Carrera de 6 km con chip, Caminata de 6 km para todas las edades y carreras infantiles de 500 m y 1 km. Domingo 15 de noviembre de 2026 desde el polideportivo El Mazo. Hinchables y talleres, degustaciones, ambiente musical y exhibición de medios de la Guardia Civil.',
  'popular', 'carrera', '2026-11-15',
  'Aparcamiento del polideportivo El Mazo, Haro (La Rioja)',
  1000, '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00',
  false, false, false, false, 60, 'race_date',
  'lo-zon-carrerapopular@guardiacivil.org', 'https://www.rockthesport.com/es/evento/ii-carrera-guardia-civil-la-rioja', NULL,
  'https://camberas.com/fotos/guardia-civil-la-rioja/cartel-2026.jpg',
  'https://camberas.com/fotos/guardia-civil-la-rioja/portada-cartel.webp'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description, race_type = EXCLUDED.race_type, date = EXCLUDED.date,
  location = EXCLUDED.location, max_participants = EXCLUDED.max_participants,
  registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
  category_age_reference = EXCLUDED.category_age_reference, organizer_email = EXCLUDED.organizer_email,
  official_website_url = EXCLUDED.official_website_url,
  poster_url = EXCLUDED.poster_url, cover_image_url = EXCLUDED.cover_image_url;

-- --------------------------------------------------------------- distancias
-- Tope conjunto de 1.000 dorsales (races.max_participants); por recorrido sin tope.
INSERT INTO public.race_distances (
  id, race_id, name, distance_km, price, cutoff_time, start_location, finish_location,
  registration_opens, registration_closes, is_visible, display_order, bib_start, bib_end,
  kind, competitive, chip, registration_url
) VALUES
  ('b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e', '182defd5-bb44-4f9d-951a-6876472a8f8c',
   'Carrera 6K', 6, 10, '1:00 h',
   'Polideportivo El Mazo, Haro', 'Polideportivo El Mazo, Haro',
   '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00',
   true, 1, 1, 1000, 'carrera', true, true, 'https://www.rockthesport.com/es/evento/ii-carrera-guardia-civil-la-rioja'),
  ('7a1f8685-2cfa-44fd-afc6-cff6e53fb0ad', '182defd5-bb44-4f9d-951a-6876472a8f8c',
   'Caminata 6K', 6, 10, '1:00 h',
   'Polideportivo El Mazo, Haro', 'Polideportivo El Mazo, Haro',
   '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00',
   true, 2, 1001, 2000, 'marcha', false, false, 'https://www.rockthesport.com/es/evento/ii-carrera-guardia-civil-la-rioja'),
  ('745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb', '182defd5-bb44-4f9d-951a-6876472a8f8c',
   'Carrera 1K', 1, 8, NULL,
   'Polideportivo El Mazo, Haro', 'Polideportivo El Mazo, Haro',
   '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00',
   true, 3, 2001, 2300, 'infantil', false, false, 'https://www.rockthesport.com/es/evento/ii-carrera-guardia-civil-la-rioja'),
  ('f9beba65-ddf5-4480-b991-488338dff264', '182defd5-bb44-4f9d-951a-6876472a8f8c',
   'Carrera 500 m', 0.5, 8, NULL,
   'Polideportivo El Mazo, Haro', 'Polideportivo El Mazo, Haro',
   '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00',
   true, 4, 2301, 2600, 'infantil', false, false, 'https://www.rockthesport.com/es/evento/ii-carrera-guardia-civil-la-rioja')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, distance_km = EXCLUDED.distance_km, price = EXCLUDED.price,
  cutoff_time = EXCLUDED.cutoff_time, kind = EXCLUDED.kind, competitive = EXCLUDED.competitive,
  chip = EXCLUDED.chip, registration_opens = EXCLUDED.registration_opens,
  registration_closes = EXCLUDED.registration_closes, registration_url = EXCLUDED.registration_url;

-- Precio único hasta el cierre (hora de pared +00): 10 € 6K y Caminata, 8 € 1K y 500 m.
DELETE FROM public.race_distance_prices
 WHERE race_distance_id IN ('b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e', '7a1f8685-2cfa-44fd-afc6-cff6e53fb0ad',
                            '745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb', 'f9beba65-ddf5-4480-b991-488338dff264');
INSERT INTO public.race_distance_prices (race_distance_id, price, start_datetime, end_datetime) VALUES
  ('b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e', 10, '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00'),
  ('7a1f8685-2cfa-44fd-afc6-cff6e53fb0ad', 10, '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00'),
  ('745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb',  8, '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00'),
  ('f9beba65-ddf5-4480-b991-488338dff264',  8, '2026-09-18 00:00:00+00', '2026-11-01 23:59:00+00');

-- Salidas del reglamento y Rockthesport: 500 m 11:00, 1K 11:15, 6K 12:00 y
-- Caminata tras la carrera (12:01). Prevista y oficial iguales al nacer.
INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, hora_prevista, start_time) VALUES
  ('182defd5-bb44-4f9d-951a-6876472a8f8c', 'f9beba65-ddf5-4480-b991-488338dff264', 'Salida 500 m',      '2026-11-15 11:00:00+00', '2026-11-15 11:00:00+00'),
  ('182defd5-bb44-4f9d-951a-6876472a8f8c', '745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb', 'Salida 1K',         '2026-11-15 11:15:00+00', '2026-11-15 11:15:00+00'),
  ('182defd5-bb44-4f9d-951a-6876472a8f8c', 'b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e', 'Salida Carrera 6K', '2026-11-15 12:00:00+00', '2026-11-15 12:00:00+00'),
  ('182defd5-bb44-4f9d-951a-6876472a8f8c', '7a1f8685-2cfa-44fd-afc6-cff6e53fb0ad', 'Salida Caminata',   '2026-11-15 12:01:00+00', '2026-11-15 12:01:00+00')
ON CONFLICT (race_distance_id) DO UPDATE SET
  wave_name = EXCLUDED.wave_name, hora_prevista = EXCLUDED.hora_prevista, start_time = EXCLUDED.start_time;

-- --------------------------------------------------------------- categorías
-- El reglamento solo premia la general masculina y femenina del 6K (más el
-- trofeo honorífico FCSE, que sale del campo del formulario): la UNICA que
-- siembra el trigger basta en todos los recorridos (Camberas antepone M-/F-).

-- --------------------------------------------------------------- formulario
SELECT public.seed_default_registration_fields_for_distance('b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e');
SELECT public.seed_default_registration_fields_for_distance('7a1f8685-2cfa-44fd-afc6-cff6e53fb0ad');
SELECT public.seed_default_registration_fields_for_distance('745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb');
SELECT public.seed_default_registration_fields_for_distance('f9beba65-ddf5-4480-b991-488338dff264');

-- 6K: miembro de las FCSE (trofeo honorífico)
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT 'b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e', 'fcse', '¿Eres miembro de las Fuerzas y Cuerpos de Seguridad del Estado?', 'radio', 20, true, false, true,
       '["No", "Sí"]'::jsonb, 'Hay trofeo honorífico para el primer clasificado masculino y femenino de las FCSE.'
WHERE NOT EXISTS (SELECT 1 FROM public.registration_form_fields
                   WHERE race_distance_id = 'b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e' AND field_name = 'fcse');

-- Todas: talla de camiseta (incluida en las cuatro pruebas)
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT d.id, 'talla_camiseta', 'Talla de camiseta', 'select', 21, true, false, true,
       '["4 años", "6 años", "8 años", "10 años", "12 años", "14 años", "XS", "S", "M", "L", "XL", "XXL"]'::jsonb, NULL
  FROM public.race_distances d
 WHERE d.race_id = '182defd5-bb44-4f9d-951a-6876472a8f8c'
   AND NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.field_name = 'talla_camiseta');

-- Infantiles: tutor que autoriza
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT d.id, 'tutor', 'Nombre y DNI del padre, madre o tutor/a que autoriza', 'text', 20, true, false, true,
       NULL, 'La inscripción de un menor la hace y la firma un adulto responsable.'
  FROM public.race_distances d
 WHERE d.id IN ('745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb', 'f9beba65-ddf5-4480-b991-488338dff264')
   AND NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.field_name = 'tutor');

-- --------------------------------------------------------------- reglamento
INSERT INTO public.race_regulations (id, race_id, published, version)
SELECT '0124718b-63be-4b6f-a1a0-4684ad106beb', '182defd5-bb44-4f9d-951a-6876472a8f8c', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.race_regulations WHERE race_id = '182defd5-bb44-4f9d-951a-6876472a8f8c');

INSERT INTO public.race_regulation_sections (regulation_id, section_type, title, content, is_required, section_order)
SELECT g.id, v.tipo, v.titulo, v.texto, v.req, v.orden
  FROM public.race_regulations g
  CROSS JOIN (VALUES
  ('general_info', 'Presentación', E'El domingo 15 de noviembre de 2026, la 10ª Zona de la Guardia Civil organiza la II Carrera Solidaria de la Guardia Civil de La Rioja, que se disputa en la localidad de Haro.\n\nEl fin de esta prueba es recaudar fondos para la asociación ARDEM Rioja, asociación sin ánimo de lucro cuya misión es la defensa de los derechos de las personas con patologías relacionadas con la esclerosis múltiple y sus familias, y la gestión de servicios especializados para promover y mejorar la calidad de vida de esas personas y su entorno.', true, 1),
  ('course', 'Pruebas y horarios', E'- Prueba de 500 metros: a las 11:00 h.\n- Prueba de 1.000 metros: a las 11:15 h.\n- Prueba de 6 km: a las 12:00 h.\n- Caminata de 6 km: tras la salida de la prueba de 6 km.\n\nLa inscripción en la Carrera 6K, la Carrera 1K, la Carrera 500 m y la Caminata incluye el derecho de participación activa en la prueba, la camiseta oficial del evento y la bolsa del corredor con obsequios de las empresas colaboradoras.', true, 2),
  ('custom', 'Dorsales solidarios', E'La adquisición de cualquiera de los dorsales solidarios no da derecho a participación activa ni incluye camiseta conmemorativa ni bolsa del corredor. Quienes deseen colaborar adquiriendo la camiseta oficial pueden seleccionarla de forma complementaria mediante la tarifa independiente «Camiseta solidaria», por un importe de 10 € por unidad.', false, 3),
  ('classifications', 'Categorías de competición y premios', E'- Prueba de 500 metros: nacidos entre 2018 y 2023.\n- Prueba de 1.000 metros: nacidos entre 2014 y 2017.\n- Prueba de 6 km: nacidos en 2013 o antes.\n- Caminata de 6 km: todas las edades.\n\nLa inscripción por edades depende del año de nacimiento, independientemente de que el participante haya cumplido ya los años o no.\n\nEn las carreras infantiles, todos los participantes reciben medalla conmemorativa.\n\nEn la prueba de 6 km reciben trofeo los tres primeros clasificados en categoría masculina y femenina.\n\nAdemás, recibe trofeo honorífico el primer clasificado en categoría masculina y femenina que sea miembro de las FCSE. Si el mismo corredor consigue premio en ambas categorías, solo se le otorga en una de ellas, a su elección, y el trofeo descartado pasa al siguiente clasificado de la categoría desierta.', true, 4),
  ('cutoff_times', 'Desarrollo de la prueba', E'Cada participante debe llevar siempre visible durante la prueba el dorsal entregado por la organización. En la modalidad de 6 km los dorsales llevan chip de cronometraje.\n\nLa hora máxima de finalización de cualquiera de las pruebas son las 13:00 h.\n\nCada corredor es responsable de seguir el recorrido marcado, y no respetarlo es causa de descalificación. Los participantes deben seguir en todo momento las instrucciones del personal de la organización.\n\nEn caso de abandono, el corredor debe indicarlo al personal de la organización más cercano, si es posible, o a otro participante, que estará obligado a ayudarle si fuera necesario para notificar lo sucedido a cualquier miembro de la organización o servicio de socorro. El competidor asume toda la responsabilidad desde que abandona voluntariamente la prueba o es descalificado.\n\nEn caso de malas condiciones meteorológicas, por razones de seguridad u otras causas de fuerza mayor, la organización podrá interrumpir las pruebas, modificar el recorrido o variar los límites horarios.', true, 5),
  ('medical', 'Seguridad y seguros', E'La organización contrata un seguro de accidentes y de responsabilidad civil para todos los participantes.\n\nLa organización garantiza la seguridad de los participantes disponiendo las medidas y el personal necesarios, con vehículos oficiales de la organización y de seguridad debidamente identificados y una ambulancia en un punto estratégico del recorrido.\n\nEl recorrido está cerrado al tráfico en todo momento, atendiendo a las indicaciones de los responsables de la organización y, en concreto, del responsable de seguridad vial.\n\nLos participantes corren bajo su responsabilidad. Es responsabilidad de cada participante o de su tutor que esté en condiciones físicas aceptables para la prueba. El personal médico puede retirar el dorsal a cualquier corredor cuando considere que su salud está en peligro.', true, 6),
  ('registration', 'Inscripción, pago y dorsales', E'La inscripción se realiza online en www.rockthesport.com/es/evento/ii-carrera-guardia-civil-la-rioja hasta el 1 de noviembre inclusive. Las inscripciones están cerradas.\n\nPrecios: Carrera 6K y Caminata, 10 €; Carrera 1K y Carrera 500 m, 8 €; camiseta solidaria, 10 €; dorsal solidario de 5, 10, 20 o 50 €, o donación libre.\n\nLos dorsales se entregan el mismo día del evento, en el horario que comunique la organización. La organización podrá habilitar puntos y fechas de recogida previos, que se comunicarán a los inscritos por correo electrónico; si no los hay, la recogida será solo el día de la prueba en la zona delimitada para ello.', true, 7),
  ('environment', 'Concienciación medioambiental', E'La organización quiere que el evento discurra de la forma más respetuosa posible con el medio ambiente. Todos los participantes deben mantener limpio el entorno y usar los contenedores habilitados, sin arrojar residuos fuera de ellos.', false, 8),
  ('responsibility', 'Responsabilidad, imagen y protección de datos', E'Los participantes eximen a la organización de las reclamaciones o demandas basadas en acciones u omisiones de los participantes o de terceros que actúen en su favor, así como de los daños que puedan sufrir ellos o sus materiales.\n\nAl inscribirse, la persona participante (o su padre, madre, tutor o representante legal, en el caso de menores) autoriza a la organización a captar fotografías y grabaciones durante el evento y cede de forma no exclusiva y gratuita su uso en medios de comunicación, redes sociales, la web oficial y soportes promocionales de esta edición y de las futuras.\n\nResponsable del tratamiento de datos: Guardia Civil de La Rioja. Los datos se usan solo para la gestión del evento (participantes, seguros, clasificaciones, premios y difusión de resultados e imágenes) y no se ceden a terceros salvo obligación legal o gestión directa del evento (cronometraje, seguros, autoridades). Los derechos de acceso, rectificación, supresión, oposición, portabilidad y limitación se ejercen por escrito en lo-zon-carrerapopular@guardiacivil.org o en la 10ª Zona de la Guardia Civil, C/ Duques de Nájera 147, 26005 Logroño.\n\nLa participación en el evento implica la aceptación de este reglamento y de la política de protección de datos.', true, 9)
  ) AS v(tipo, titulo, texto, req, orden)
 WHERE g.race_id = '182defd5-bb44-4f9d-951a-6876472a8f8c'
   AND NOT EXISTS (SELECT 1 FROM public.race_regulation_sections s WHERE s.regulation_id = g.id AND s.section_type = v.tipo);

-- ---------------------------------------------------------------------- FAQ
INSERT INTO public.race_faqs (race_id, question, answer, display_order)
SELECT '182defd5-bb44-4f9d-951a-6876472a8f8c', v.p, v.r, v.o
FROM (VALUES
  ('¿A qué hora sale cada prueba?', 'El 500 m a las 11:00, el 1K a las 11:15, la Carrera 6K a las 12:00 y la Caminata justo después, todas desde el polideportivo El Mazo de Haro. Todas las pruebas terminan antes de las 13:00.', 1),
  ('¿En qué prueba puede correr mi hijo o hija?', 'Depende del año de nacimiento, no de los años cumplidos: 500 m para nacidos entre 2018 y 2023, 1K para nacidos entre 2014 y 2017 y Carrera 6K desde los nacidos en 2013. La Caminata es para todas las edades.', 2),
  ('¿Qué es el dorsal solidario?', 'Un donativo para ARDEM de 5, 10, 20 o 50 € (o la cantidad que quieras) para quien no puede participar. No da derecho a correr ni incluye camiseta ni bolsa; la camiseta oficial se puede comprar aparte como «Camiseta solidaria» por 10 €.', 3),
  ('¿Todavía me puedo inscribir?', 'No: las inscripciones se cerraron el 1 de noviembre.', 4),
  ('¿Dónde recojo el dorsal?', 'El mismo día de la prueba en la zona habilitada. Si la organización abre puntos de recogida previos, lo avisará por correo a los inscritos.', 5),
  ('¿Hay premios?', 'Medalla para todos en las carreras infantiles; trofeo para los tres primeros, masculino y femenino, de la Carrera 6K, y trofeo honorífico para el primer hombre y la primera mujer de las FCSE.', 6)
) AS v(p, r, o)
WHERE NOT EXISTS (SELECT 1 FROM public.race_faqs WHERE race_id = '182defd5-bb44-4f9d-951a-6876472a8f8c');

-- --------------------------------------------------------------- web propia
-- Libro de diseño medido en el cartel: verde Guardia Civil 1F5130 del título,
-- naranja E8541E de la camiseta del corredor y amarillo otoño F2A626.
INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
  '182defd5-bb44-4f9d-951a-6876472a8f8c', 'gurriana', true,
  '{"colorMarca": "#1F5130", "colorAccion": "#E8541E", "colorSecundario": "#F2A626", "hero": "foto", "heroPosicion": "center 20%", "cinta": true, "cuentaAtras": true}'::jsonb,
  '{
    "nombreCorto": "Carrera Solidaria Guardia Civil",
    "fechaTexto": "Domingo 15 de noviembre de 2026",
    "lugar": {"nombre": "Polideportivo El Mazo", "direccion": "Aparcamiento del polideportivo El Mazo · Haro", "municipio": "Haro", "provincia": "La Rioja", "zona": "Rioja Alta", "municipios": ["Haro"]},
    "organizador": {"nombre": "Guardia Civil · 10ª Zona de La Rioja", "email": "lo-zon-carrerapopular@guardiacivil.org", "telefono": "941 22 99 00 (ext. 1010317)", "direccion": "C/ Duques de Nájera 147, 26005 Logroño"},
    "beneficiario": {"nombre": "ARDEM · Asociación Riojana de Esclerosis Múltiple", "texto": "Todo lo recaudado va a ARDEM Rioja, asociación sin ánimo de lucro que defiende los derechos de las personas con patologías relacionadas con la esclerosis múltiple y sus familias, y gestiona servicios especializados para mejorar su calidad de vida y la de su entorno."},
    "inscripcion": {
      "cierreTexto": "Inscripciones cerradas desde el 1 de noviembre de 2026",
      "incluye": ["Camiseta oficial del evento", "Bolsa del corredor con obsequios de los colaboradores", "Dorsal con chip en la Carrera 6K", "Medalla en las carreras infantiles", "Seguro de accidentes y responsabilidad civil"],
      "nota": "Inscripción en Rockthesport. ¿No puedes participar pero quieres colaborar? Dorsal solidario de 5, 10, 20 o 50 € o donación libre (no da derecho a participar ni incluye camiseta ni bolsa) y Camiseta solidaria por 10 €. La prueba se elige por año de nacimiento."
    },
    "reglamento": {
      "normas": ["Dorsal siempre visible durante la prueba.", "Todas las pruebas terminan antes de las 13:00.", "Hay que seguir el recorrido marcado y las indicaciones de la organización.", "Nada de residuos fuera de los contenedores habilitados."]
    },
    "programa": [
      {"fecha": "2026-11-15", "hora": "11:00", "titulo": "Salida Carrera 500 m (nacidos 2018-2023)", "lugar": "Polideportivo El Mazo"},
      {"fecha": "2026-11-15", "hora": "11:15", "titulo": "Salida Carrera 1K (nacidos 2014-2017)", "lugar": "Polideportivo El Mazo"},
      {"fecha": "2026-11-15", "hora": "12:00", "titulo": "Salida Carrera 6K", "lugar": "Polideportivo El Mazo"},
      {"fecha": "2026-11-15", "hora": "12:01", "titulo": "Salida Caminata 6K", "lugar": "Polideportivo El Mazo"},
      {"fecha": "2026-11-15", "hora": "13:00", "titulo": "Cierre de todas las pruebas", "lugar": "Polideportivo El Mazo"}
    ],
    "dorsales": {"lugar": "Polideportivo El Mazo, Haro", "nota": "El mismo día de la prueba en la zona habilitada. Si se abren puntos de recogida previos se avisará por correo a los inscritos."},
    "premios": [
      {"pruebas": ["745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb", "f9beba65-ddf5-4480-b991-488338dff264"], "categoria": "Todos los participantes", "premio": "Medalla conmemorativa"},
      {"pruebas": ["b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e"], "categoria": "General masculina y femenina", "premio": "Trofeo a los tres primeros"},
      {"pruebas": ["b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e"], "categoria": "FCSE", "premio": "Trofeo honorífico", "texto": "Primer clasificado masculino y femenino de las Fuerzas y Cuerpos de Seguridad del Estado. No acumulable: quien gane en ambas elige uno y el otro pasa al siguiente."}
    ],
    "servicios": [
      {"nombre": "Hinchables y talleres", "texto": "Animación infantil durante toda la mañana.", "icono": "child"},
      {"nombre": "Degustaciones", "texto": "Degustaciones solidarias.", "icono": "utensils"},
      {"nombre": "Ambiente musical", "texto": "Música en salida y meta.", "icono": "music"},
      {"nombre": "Exhibición de medios", "texto": "Vehículos y medios de la Guardia Civil.", "icono": "newspaper"},
      {"nombre": "Bolsa del corredor", "texto": "Con obsequios de las empresas colaboradoras.", "icono": "gift"},
      {"nombre": "Cronometraje con chip", "texto": "En la Carrera 6K.", "icono": "stopwatch"}
    ],
    "camiseta": {"incluida": true, "tallas": ["4 años", "6 años", "8 años", "10 años", "12 años", "14 años", "XS", "S", "M", "L", "XL", "XXL"], "texto": "Camiseta oficial incluida en las cuatro pruebas. También a la venta como «Camiseta solidaria» por 10 €."},
    "contacto": {"email": "lo-zon-carrerapopular@guardiacivil.org", "telefono": "941 22 99 00 (ext. 1010317)", "direccion": "C/ Duques de Nájera 147, 26005 Logroño", "redes": {"instagram": "https://www.instagram.com/gc_carrera_popular_la_rioja"}},
    "documentos": [{"nombre": "Cartel 2026", "url": "https://camberas.com/fotos/guardia-civil-la-rioja/cartel-2026.jpg"}],
    "pruebas": [
      {"id": "b43ac1de-e7bc-46e6-b48c-fd197a4f1e0e", "color": "#1F5130", "descripcion": "6 km con dorsal de chip para nacidos en 2013 o antes. Trofeo a los tres primeros masculinos y femeninos y trofeo honorífico FCSE."},
      {"id": "7a1f8685-2cfa-44fd-afc6-cff6e53fb0ad", "color": "#F2A626", "descripcion": "Caminata solidaria de 6 km para todas las edades. Sale justo después de la Carrera 6K."},
      {"id": "745ff9f7-71c2-4ecd-87a3-0f65e4ab56bb", "color": "#E8541E", "descripcion": "Carrera infantil de 1 km para nacidos entre 2014 y 2017. Medalla para todos."},
      {"id": "f9beba65-ddf5-4480-b991-488338dff264", "color": "#E8541E", "descripcion": "Carrera infantil de 500 m para nacidos entre 2018 y 2023. Medalla para todos."}
    ],
    "seo": {"titulo": "II Carrera Solidaria Guardia Civil La Rioja 2026 · 15 de noviembre · Haro", "descripcion": "Carrera solidaria de 6 km, caminata y carreras infantiles en Haro a favor de ARDEM, la Asociación Riojana de Esclerosis Múltiple. Domingo 15 de noviembre de 2026. Organiza la Guardia Civil de La Rioja."}
  }'::jsonb
)
ON CONFLICT (race_id) DO UPDATE SET plantilla = EXCLUDED.plantilla, tema = EXCLUDED.tema, contenido = EXCLUDED.contenido;

-- Organiza, institucional, beneficiario y colaboradores del cartel (sin logos todavía)
INSERT INTO public.race_sponsors (race_id, name, level, website, display_order)
SELECT '182defd5-bb44-4f9d-951a-6876472a8f8c', v.nombre, v.nivel, v.web, v.orden
FROM (VALUES
  ('Guardia Civil · Zona de La Rioja', 'organiza', 'https://www.guardiacivil.es', 1),
  ('Ayuntamiento de Haro', 'institucional', NULL, 2),
  ('ARDEM · Asociación Riojana de Esclerosis Múltiple', 'beneficiario', NULL, 3),
  ('Naturhouse', 'principal', NULL, 4),
  ('Kraft Heinz', 'colaborador', NULL, 10), ('Fotoadictos La Rioja', 'colaborador', 'https://www.fotoadictoslarioja.com/', 11),
  ('Genergy', 'colaborador', 'https://genergy.es/', 12), ('Asider', 'colaborador', NULL, 13),
  ('Fundación Guardia Civil', 'colaborador', NULL, 14), ('Crown Sport Nutrition', 'colaborador', NULL, 15),
  ('EPC Groupe', 'colaborador', NULL, 16), ('Coca-Cola', 'colaborador', NULL, 17),
  ('Cruz Roja Española', 'colaborador', NULL, 18), ('La Rioja Cuida', 'colaborador', NULL, 19),
  ('Peras de Rincón de Soto', 'colaborador', NULL, 20), ('Harinera Riojana', 'colaborador', NULL, 21),
  ('Nogués Talleres', 'colaborador', NULL, 22), ('UNIR', 'colaborador', 'https://www.unir.net', 23),
  ('Gurpegui', 'colaborador', NULL, 24), ('Fiora', 'colaborador', NULL, 25),
  ('Peñaclara', 'colaborador', NULL, 26), ('Sensa Pack', 'colaborador', NULL, 27),
  ('Sulema', 'colaborador', NULL, 28), ('Renault Auto Urbión', 'colaborador', NULL, 29),
  ('Grupo Alse', 'colaborador', NULL, 30), ('Habecu', 'colaborador', NULL, 31),
  ('Carnicería Bartolomé', 'colaborador', NULL, 32), ('Martínez Lacuesta', 'colaborador', NULL, 33),
  ('Centro Tecnológico del Champiñón', 'colaborador', NULL, 34), ('AEGC', 'colaborador', NULL, 35),
  ('Centro de Fisioterapia Haro', 'colaborador', NULL, 36), ('León Foodtruck', 'colaborador', NULL, 37),
  ('Finca Allende', 'colaborador', NULL, 38), ('Caravant Norte', 'colaborador', NULL, 39),
  ('RECIRSA', 'colaborador', NULL, 40), ('Ocisa', 'colaborador', NULL, 41),
  ('Agrícola Obrino', 'colaborador', NULL, 42), ('Dinastía Vivanco', 'colaborador', NULL, 43),
  ('La Cofradía del Renegado', 'colaborador', NULL, 44), ('Serpicar', 'colaborador', NULL, 45),
  ('Electricidad Montoya', 'colaborador', NULL, 46), ('Martínez Somalo', 'colaborador', NULL, 47),
  ('La Vieja Bodega', 'colaborador', NULL, 48), ('Expo-hogar', 'colaborador', NULL, 49),
  ('Bodegas Lecea', 'colaborador', NULL, 50), ('Segurmicex', 'colaborador', NULL, 51),
  ('Autocentro Unisa', 'colaborador', NULL, 52), ('BigMat', 'colaborador', NULL, 53),
  ('El Ábside Rioja', 'colaborador', NULL, 54), ('Baqué', 'colaborador', NULL, 55),
  ('Argo', 'colaborador', NULL, 56), ('Circuito de Navarra', 'colaborador', NULL, 57),
  ('Pastelería Visan', 'colaborador', NULL, 58), ('Cupani', 'colaborador', NULL, 59),
  ('Calle Activa', 'colaborador', NULL, 60), ('Juper', 'colaborador', NULL, 61),
  ('Bodegas Roda', 'colaborador', NULL, 62), ('Urbina', 'colaborador', NULL, 63),
  ('Señorío de Líbano', 'colaborador', NULL, 64)
) AS v(nombre, nivel, web, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.race_sponsors WHERE race_id = '182defd5-bb44-4f9d-951a-6876472a8f8c');

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT name, slug, date, is_visible, registration_opens, registration_closes FROM public.races WHERE id = '182defd5-bb44-4f9d-951a-6876472a8f8c';
SELECT d.name, d.distance_km, d.kind, d.competitive, d.chip, d.bib_start, d.bib_end, d.price,
       (SELECT count(*) FROM public.race_distance_prices p WHERE p.race_distance_id = d.id) AS tramos,
       (SELECT count(*) FROM public.race_categories c WHERE c.race_distance_id = d.id) AS categorias,
       (SELECT count(*) FROM public.registration_form_fields f WHERE f.race_distance_id = d.id) AS campos,
       (SELECT to_char(w.hora_prevista AT TIME ZONE 'UTC', 'HH24:MI') FROM public.race_waves w WHERE w.race_distance_id = d.id) AS salida
  FROM public.race_distances d WHERE d.race_id = '182defd5-bb44-4f9d-951a-6876472a8f8c' ORDER BY d.display_order;
SELECT count(*) AS secciones FROM public.race_regulation_sections WHERE regulation_id = '0124718b-63be-4b6f-a1a0-4684ad106beb';
SELECT count(*) AS patrocinadores FROM public.race_sponsors WHERE race_id = '182defd5-bb44-4f9d-951a-6876472a8f8c';
