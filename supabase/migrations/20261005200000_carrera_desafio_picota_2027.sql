-- =============================================================================
-- Carrera: I Desafío Picota 2027 (Liencres, Piélagos, Cantabria)
-- Alta completa con el criterio de Gurriana: carrera, dos pruebas con GPX,
-- precios por tramos, salidas, categorías, formulario, reglamento por
-- secciones, FAQ, rutómetros, web propia y organizador.
-- Datos: Reglamento I DESAFÍO PICOTA 2027 (PDF del organizador, 5-oct) y los
-- dos GPX (public/gpx/desafio-picota-2027-{trail,andarines}.gpx).
--
-- SENTENCIAS SUELTAS, sin bloques DO (el editor SQL los parte). Todas son
-- idempotentes: se puede volver a ejecutar entera.
--
-- Supuestos a confirmar con el organizador (no están en el reglamento):
--   · apertura de inscripciones 2 de noviembre de 2026 a las 20:00 y cierre
--     22 de abril de 2027 a las 23:59 (el reglamento solo da el cambio de
--     precio del 24 de marzo);
--   · email y teléfono de contacto (no figuran);
--   · distancia del trail: el título dice 12 km, la descripción suma 13,1 km
--     y el GPX mide 14,1 km (el tramo final por la CA-231 son 1,8 km en el
--     GPX y 0,7 en el reglamento). Se deja 13,1 km, el del reglamento.
-- Nace OCULTA (is_visible = false) con la web activa: se ve con ?previa=1
-- desde el panel. Cuando el organizador confirme, is_visible = true.
-- Requiere 20260928140000 (tipos de ítem del rutómetro).
-- =============================================================================

-- ------------------------------------------------------------------ carrera
INSERT INTO public.races (
  id, name, slug, subtitle, description, race_type, group_type, date, location,
  max_participants, registration_opens, registration_closes,
  is_visible, is_featured, es_demo, show_available_places, utc_offset, category_age_reference,
  organizer_email, official_website_url, logo_url
) VALUES (
  '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d',
  'I Desafío Picota 2027',
  'desafio-picota-2027',
  'Speed trail de 13 km y marcha de 7 km por Costa Quebrada, los Pinares y el Monte Picota · Liencres',
  'Un speed trail rápido y vistoso desde la Plaza de la Cruz de Liencres: el sendero costero de Costa Quebrada, los Pinares de Liencres y la subida al Monte Picota por el Monte Tolío. Dos pruebas: Trail de 13 km y Andarines de 7 km, más carreras infantiles. Sábado 24 de abril de 2027.',
  'trail', 'carrera', '2027-04-24',
  'Plaza de la Cruz, Liencres · Piélagos (Cantabria)',
  440, '2026-11-02 20:00:00+00', '2027-04-22 23:59:00+00',
  false, false, false, false, 60, 'year_end',
  NULL, NULL, 'https://camberas.com/logos/desafio-picota.webp'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description, race_type = EXCLUDED.race_type, date = EXCLUDED.date,
  location = EXCLUDED.location, max_participants = EXCLUDED.max_participants,
  registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
  category_age_reference = EXCLUDED.category_age_reference, logo_url = EXCLUDED.logo_url;

-- --------------------------------------------------------------- distancias
INSERT INTO public.race_distances (
  id, race_id, name, distance_km, elevation_gain, elevation_loss, alt_max, alt_min, price,
  cutoff_time, start_location, finish_location, registration_opens, registration_closes,
  is_visible, display_order, bib_start, bib_end, kind, competitive, chip, gpx_file_url
) VALUES
  ('7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d',
   'Trail 13K', 13.1, 437, 435, 233, 8, 20, NULL,
   'Plaza de la Cruz, Liencres', 'Plaza de la Cruz, Liencres',
   '2026-11-02 20:00:00+00', '2027-04-22 23:59:00+00',
   true, 1, 1, 320, 'carrera', true, true, 'https://camberas.com/gpx/desafio-picota-2027-trail.gpx'),
  ('8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e', '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d',
   'Andarines 7K', 7.1, 291, 289, 235, 54, 15, NULL,
   'Plaza de la Cruz, Liencres', 'Plaza de la Cruz, Liencres',
   '2026-11-02 20:00:00+00', '2027-04-22 23:59:00+00',
   true, 2, 401, 520, 'marcha', false, true, 'https://camberas.com/gpx/desafio-picota-2027-andarines.gpx')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, distance_km = EXCLUDED.distance_km, elevation_gain = EXCLUDED.elevation_gain,
  elevation_loss = EXCLUDED.elevation_loss, alt_max = EXCLUDED.alt_max, alt_min = EXCLUDED.alt_min,
  price = EXCLUDED.price, kind = EXCLUDED.kind, competitive = EXCLUDED.competitive,
  registration_opens = EXCLUDED.registration_opens, registration_closes = EXCLUDED.registration_closes,
  gpx_file_url = EXCLUDED.gpx_file_url;

-- Precios por tramos: hasta el 24 de marzo y desde el 25 (hora de pared +00)
DELETE FROM public.race_distance_prices
 WHERE race_distance_id IN ('7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', '8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e');
INSERT INTO public.race_distance_prices (race_distance_id, price, start_datetime, end_datetime) VALUES
  ('7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', 20, '2026-11-02 20:00:00+00', '2027-03-24 23:59:59+00'),
  ('7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', 25, '2027-03-25 00:00:00+00', '2027-04-22 23:59:00+00'),
  ('8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e', 15, '2026-11-02 20:00:00+00', '2027-03-24 23:59:59+00'),
  ('8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e', 20, '2027-03-25 00:00:00+00', '2027-04-22 23:59:00+00');

-- Salidas: prevista y oficial iguales al nacer (hora de pared +00)
INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, hora_prevista, start_time) VALUES
  ('9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', 'Salida Trail 13K',     '2027-04-24 10:00:00+00', '2027-04-24 10:00:00+00'),
  ('9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', '8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e', 'Salida Andarines 7K', '2027-04-24 10:05:00+00', '2027-04-24 10:05:00+00')
ON CONFLICT (race_distance_id) DO UPDATE SET
  wave_name = EXCLUDED.wave_name, hora_prevista = EXCLUDED.hora_prevista, start_time = EXCLUDED.start_time;

-- Meta de cronometraje a la distancia del GPX (el perfil y el mapa salen de él)
UPDATE public.race_checkpoints SET distance_km = 14.11
 WHERE race_distance_id = '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d' AND checkpoint_type = 'FINISH';
UPDATE public.race_checkpoints SET distance_km = 7.06
 WHERE race_distance_id = '8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e' AND checkpoint_type = 'FINISH';

-- --------------------------------------------------------------- categorías
-- Trail: Sub 21, Absoluta y Veteranos (+45), sin sexo (la inscripción pone
-- M-/F-), edad a 31 de diciembre de 2027. Con la regla del rango más
-- estrecho, un corredor de 20 años cae en Sub 21 y uno de 50 en Veteranos.
-- La UNICA que siembra el trigger sobra en el trail; en Andarines se queda
-- (marcha no competitiva).
DELETE FROM public.race_categories
 WHERE race_distance_id = '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d' AND name = 'UNICA';
INSERT INTO public.race_categories (race_id, race_distance_id, name, short_name, gender, min_age, max_age, age_dependent, age_calculation_date, display_order, category_number)
SELECT '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', v.name, v.short, NULL, v.min_age, v.max_age, true, DATE '2027-12-31', v.orden, v.orden
FROM (VALUES
  ('Sub 21',    'SUB21', NULL::int, 21,        1),
  ('Absoluta',  'ABS',   NULL::int, NULL::int, 2),
  ('Veteranos', 'VET',   45,        NULL::int, 3)
) AS v(name, short, min_age, max_age, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.race_categories
                   WHERE race_distance_id = '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d' AND name = v.name);

-- --------------------------------------------------------------- formulario
SELECT public.seed_default_registration_fields_for_distance('7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d');
SELECT public.seed_default_registration_fields_for_distance('8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e');

-- Trail: empadronamiento en Piélagos (premio Mejor de Piélagos)
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', 'empadronado_pielagos', '¿Estás empadronado/a en Piélagos?', 'radio', 20, true, false, true,
       '["Sí", "No"]'::jsonb, 'Hay premio al mejor y a la mejor de Piélagos. Se comprobará al entregarlo.'
WHERE NOT EXISTS (SELECT 1 FROM public.registration_form_fields
                   WHERE race_distance_id = '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d' AND field_name = 'empadronado_pielagos');

-- Andarines: animales de compañía
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT '8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e', 'animal', '¿Vienes con animal de compañía?', 'radio', 20, true, false, true,
       '["No", "Sí, atado y sin molestar"]'::jsonb, 'Solo en la marcha, siempre atado. En el trail no se permite.'
WHERE NOT EXISTS (SELECT 1 FROM public.registration_form_fields
                   WHERE race_distance_id = '8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e' AND field_name = 'animal');

-- Las dos: menores acompañados
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, help_text)
SELECT d.id, 'menor', '¿Eres menor de edad?', 'radio', 21, true, false, true,
       '["No", "Sí, participo acompañado/a de un adulto responsable"]'::jsonb,
       'Los menores participan con un adulto que se responsabiliza y firma la autorización al recoger el dorsal.'
  FROM public.race_distances d
 WHERE d.race_id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d'
   AND NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.field_name = 'menor');

-- --------------------------------------------------------------- reglamento
INSERT INTO public.race_regulations (id, race_id, published, version)
SELECT 'c5d6e7f8-9a0b-4c1d-8e2f-3a4b5c6d7e8f', '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.race_regulations WHERE race_id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d');

INSERT INTO public.race_regulation_sections (regulation_id, section_type, title, content, is_required, section_order)
SELECT g.id, v.tipo, v.titulo, v.texto, v.req, v.orden
  FROM public.race_regulations g
  CROSS JOIN (VALUES
  ('general_info', 'Fecha, lugar y organización', E'El I Desafío Picota se celebra el sábado 24 de abril de 2027 en Liencres (Piélagos, Cantabria). Organiza Carlos Castañeda Calvo. Salida y llegada en la plaza central de Liencres, la Plaza de la Cruz.\n\nCarreras infantiles a las 09:00 h (horario aproximado, a criterio de la organización), Trail 13K a las 10:00 h y Andarines 7K a las 10:05 h.', true, 1),
  ('course', 'Recorridos', E'TRAIL 13K. Sale de la Plaza de la Cruz hacia el norte, a la playa de Somocuevas. En el km 1,8 empieza el sendero de Costa Quebrada, que termina en el km 4,1 pasando por la playa del Madero y la playa de Pedruquíos, siempre por el sendero costero. Del km 4,1 al 6,8 cruza los Pinares de Liencres, con avituallamiento de sólidos y líquidos en el km 6,15 (aparcamiento de Los Pinares). Del km 6,8 al 7,5 va por carretera secundaria hasta la CA-231, y por ella hasta el km 7,7, donde empieza el desvío a la ruta del Monte Tolío. En el km 8,4, en la bifurcación, se toma el camino de la izquierda y se sube por el sendero de montaña hasta el Monte Picota (km 9,5). Se baja 10 m por el mismo sendero hasta una bifurcación y se sigue por la derecha (km 9,6), por la pista forestal asfaltada hasta el km 10,1 y por el sendero de montaña de la izquierda hasta el Monte Tolío (km 10,8). Se continúa por el mismo sendero hasta el km 12,4, donde se incorpora a la CA-231 dirección Santander hasta la Plaza de la Cruz.\n\nANDARINES 7K. Hasta el km 0,5 por la carretera secundaria del barrio de Las Reigadas, dirección oeste, hasta una bifurcación; por la cambera marcada hasta el km 1,4, y por la CA-231 hasta el km 1,65, donde empieza el desvío al Monte Tolío. En el km 2,35, en la bifurcación, camino de la izquierda y sendero de montaña hasta el Monte Picota (km 3,5). Se baja 10 m hasta la bifurcación y se sigue por la derecha (km 3,6), por la pista forestal asfaltada hasta el km 4,1 y por el sendero de la izquierda hasta el Monte Tolío (km 4,8). Se continúa por el mismo sendero hasta el km 6,4 y por la CA-231 dirección Santander hasta la Plaza de la Cruz.\n\nSeñalización con carteles, banderines y cintas de balizamiento bien visibles, colocados los días anteriores. En las zonas boscosas el balizamiento es reversible, sin dañar el medio. El participante tiene la obligación de conocer el recorrido antes del día de la prueba.', true, 2),
  ('registration', 'Participación e inscripciones', E'Pueden participar los mayores de 18 años. Los menores pueden participar en la marcha y en el trail acompañados de un adulto que se responsabilice de ellos, con autorización firmada previa. Las carreras infantiles (de 3 a 16 años) se inscriben en el arco de salida minutos antes de empezar; se divide a los participantes por edades y no son competitivas.\n\nDorsales: 320 en el Trail y 120 en Andarines. Cuotas: Trail 20 € hasta el 24 de marzo y 25 € después; Andarines 15 € hasta el 24 de marzo y 20 € después. La inscripción incluye seguro de accidentes del día, bolsa del corredor y todos los servicios de la organización. Solo pueden participar las personas correctamente inscritas, un dorsal por participante, siempre visible. Está prohibido correr sin camiseta ni pantalón.\n\nEn la marcha se puede participar con animales, atados y sin molestar; en el trail está prohibido. Quien incumpla puede ser expulsado y el dueño responde de cualquier incidente.', true, 3),
  ('aid_stations', 'Avituallamientos', E'Trail 13K: dos avituallamientos de líquidos y sólidos, en el km 6,15 (aparcamiento de Los Pinares) y en meta.\nAndarines 7K: un avituallamiento de líquidos y sólidos en la salida y llegada.\n\nSolo para participantes con dorsal y gratuitos. Por responsabilidad ecológica se ruega llevar un recipiente reutilizable para evitar residuos plásticos.', false, 4),
  ('cutoff_times', 'Horarios y tiempos de paso', E'Salidas desde la Plaza de la Cruz: carreras infantiles 09:00 h (aproximado), Trail 13K 10:00 h y Andarines 7K 10:05 h. La salida queda condicionada a las pautas que marque la organización.\n\nLa organización puede retirar de la prueba a quien no cumpla los tiempos de los controles de cronometraje, no complete el recorrido marcado, no lleve el dorsal visible, desatienda las indicaciones o tenga una actitud antideportiva. Quien sea descalificado entrega el dorsal en el control más cercano y abandona la prueba; si decide continuar, lo hace bajo su responsabilidad.', true, 5),
  ('bib_collection', 'Entrega de dorsales', E'En el arco de salida, Plaza de la Cruz:\n• Viernes 23 de abril de 2027, de 17:00 a 20:00 h.\n• Sábado 24 de abril, día de la prueba, de 07:00 a 09:45 h.', false, 6),
  ('medical', 'Asistencia sanitaria', E'Atención médica con una ambulancia y dos auxiliares presentes en el trail. Vehículos todoterreno para auxiliar en primer momento a un accidentado en el recorrido; tras la valoración del médico, traslado en ambulancia al centro de salud de Liencres o, si hace falta, al hospital que corresponda según la póliza. La organización facilitará un teléfono de asistencia para emergencias.\n\nLos participantes están obligados a auxiliar a los accidentados que necesiten ayuda y a informar de cualquier percance en los controles o avituallamientos.', true, 7),
  ('classifications', 'Categorías y reconocimientos', E'TRAIL 13K, masculino y femenino:\n• Absoluta: primer, segundo y tercer puesto.\n• Sub 21: primer, segundo y tercer puesto. Son sub 21 quienes como máximo cumplan 21 años el 31 de diciembre de 2027.\n• Veteranos (+45): primer, segundo y tercer puesto. Son veteranos quienes tengan cumplidos 45 años el 31 de diciembre de 2027.\n• Mejor de Piélagos: primer puesto.\nLa edad para los premios es la que se tenga a 31 de diciembre de 2027.\n\nANDARINES 7K: marcha a pie, únicamente caminando y no competitiva, supervisada por la organización. Carácter lúdico: actividad física, respeto por la naturaleza y vida saludable en compañía. No hay reconocimientos por puestos ni tiempos.', false, 8),
  ('refund_policy', 'Devoluciones', E'Las inscripciones son definitivas: si no se puede participar no se devuelve el importe. Son personales e intransferibles. Quien se accidente con el dorsal de otra persona, o sin dorsal, se expone a pagar los costes de desplazamiento y hospitalización y a una denuncia por el uso de las ambulancias y médicos de la prueba.\n\nSi la prueba se suspende por causas ajenas a la organización (meteorología u otras) se valorará la devolución. Si se suspende por falta de permisos, prohibición de la autoridad o restricciones de tráfico, se devuelve el 100 % a cada inscrito. La organización no asume responsabilidad si el evento se suspende o aplaza por fuerza mayor, y no se devuelve la inscripción por causa del tiempo meteorológico.', true, 9),
  ('environment', 'Medio ambiente', E'La carrera discurre en su mayor parte por parajes de excepcional belleza natural: es obligación de todos preservarlos y no tirar nada fuera de las zonas de avituallamiento. Habrá contenedores hasta 100 m después de cada puesto; incumplirlo es motivo de descalificación.\n\nTras el último participante, un grupo de cierre retira balizas, cintas, carteles y vallas y limpia las zonas de paso.', false, 10),
  ('disqualifications', 'Penalizaciones', E'Se penaliza de forma estricta a quien: no respete el código de circulación; corra dentro de la marcha; no respete las consignas de seguridad de las fuerzas del orden o de la organización; no pase por el control de salida; ensucie o degrade el itinerario; lleve vehículo de apoyo propio; impida el normal desarrollo de la prueba; dañe el entorno natural; ataje, abandone el recorrido delimitado o no pase por algún control; participe con el dorsal de otra persona; se inscriba con datos falsos; se comporte de forma antideportiva o irrespetuosa; engañe a otros participantes sobre el recorrido; sea responsable negligente de un accidente; muestre síntomas de malestar físico que puedan agravarse; sea remolcado o acompañado por vehículos a motor; o cualquier otro motivo que se considere sancionable.\n\nLas medidas: expulsión de la prueba, inclusión en la lista de expulsados que se publica, prohibición de participar en futuras ediciones y las sanciones de las autoridades competentes.', false, 11),
  ('image_rights', 'Derecho a la imagen', E'Aceptar este reglamento supone autorizar a la organización, sea cual sea la edad del participante, a grabar total o parcialmente su participación y a usar su imagen en la promoción y difusión de la prueba por cualquier medio (radio, prensa, vídeo, foto, internet, carteles…), cediendo los derechos de explotación comercial y publicitaria sin compensación económica.', false, 12),
  ('responsibility', 'Responsabilidad, seguridad y aceptación', E'Al inscribirse, cada participante declara estar en forma física y psíquica óptima y asume el riesgo de la práctica deportiva. La organización no responde de los daños, perjuicios o lesiones del participante ni de los que cause a terceros, ni de gastos, deudas, averías de material o extravíos. La organización cuenta con seguro de responsabilidad civil y seguro de accidente deportivo para cada participante.\n\nLa prueba discurre en algunos tramos por vías públicas abiertas al tráfico: el participante se compromete a cumplir las normas de circulación, a extremar la precaución en cruces, tramos peligrosos y descensos, y acepta la presencia de vehículos ajenos a la organización.\n\nLa organización puede desviar la carrera por un recorrido alternativo, modificar lo que considere necesario por seguridad y suspender la prueba por meteorología o fuerza mayor, previo acuerdo del comité organizador. Inscribirse supone aceptar íntegramente este reglamento; en caso de duda prevalece lo que disponga la organización.', true, 13)
  ) AS v(tipo, titulo, texto, req, orden)
 WHERE g.race_id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d'
   AND NOT EXISTS (SELECT 1 FROM public.race_regulation_sections s WHERE s.regulation_id = g.id AND s.section_type = v.tipo);

-- ---------------------------------------------------------------------- FAQ
INSERT INTO public.race_faqs (race_id, question, answer, display_order)
SELECT '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', v.p, v.r, v.o
FROM (VALUES
  ('¿Puedo ir con mi perro?', 'En Andarines sí, siempre atado y sin molestar al resto. En el Trail no se permite participar con animales.', 1),
  ('¿Pueden participar menores?', 'Sí, en las dos pruebas, acompañados de un adulto que se responsabilice de ellos y con una autorización firmada que se entrega al recoger el dorsal. Marca la casilla de menor al inscribirte.', 2),
  ('¿Cómo se apuntan los niños a las carreras infantiles?', 'En el arco de salida, minutos antes de empezar, hacia las 09:00. Son para niños y niñas de 3 a 16 años, por edades, y no son competitivas.', 3),
  ('¿Qué es el premio Mejor de Piélagos?', 'Un reconocimiento al primer hombre y a la primera mujer empadronados en Piélagos que lleguen a meta en el Trail. Indícalo al inscribirte; se comprobará al entregarlo.', 4),
  ('¿Hay vasos en los avituallamientos?', 'Se ruega llevar un recipiente reutilizable para evitar residuos plásticos. Los avituallamientos son solo para participantes con dorsal.', 5),
  ('¿Puedo recuperar el dinero si no puedo ir?', 'No: las inscripciones son definitivas, personales e intransferibles. Solo se devuelve si la organización suspende la prueba por causas ajenas, y al 100 % si es por falta de permisos o restricciones de tráfico.', 6)
) AS v(p, r, o)
WHERE NOT EXISTS (SELECT 1 FROM public.race_faqs WHERE race_id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d');

-- --------------------------------------------------------------- rutómetros
-- Km del reglamento sobre las coordenadas del GPX. En el trail, los puntos del
-- bucle de montaña (desvío, bifurcaciones, Picota, Tolío, CA-231) caen en el
-- GPX casi al metro de lo que dice el reglamento; la meta va a los 14,11 km
-- del GPX (el reglamento dice 13,1).
INSERT INTO public.roadbooks (id, race_distance_id, name, description)
SELECT 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a', '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d', 'Rutómetro Trail 13K',
       'Costa Quebrada, Pinares de Liencres y subida al Monte Picota por el Monte Tolío. Km del reglamento sobre el GPX (14,1 km medidos).'
WHERE NOT EXISTS (SELECT 1 FROM public.roadbooks WHERE race_distance_id = '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d');

INSERT INTO public.roadbook_items
  (roadbook_id, item_order, item_type, item_type_id, description, km_total, km_partial, km_remaining,
   latitude, longitude, altitude, is_checkpoint, is_highlighted, notes, via)
SELECT 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a', v.orden, v.tipo, t.id, v.descr, v.km, v.parcial, round(14.11 - v.km, 2),
       v.lat, v.lon, v.alt, false, true, v.nota, v.via
FROM (VALUES
  (1,  'start',       'Salida · Plaza de la Cruz',                     0.00, 0.00, 43.460808, -3.927984,  69, 'Hacia el norte, a la playa de Somocuevas.', 'Pueblo'),
  (2,  'poi',         'Inicio del sendero de Costa Quebrada',          1.78, 1.78, 43.468392, -3.944545,  40, 'Playa del Madero y playa de Pedruquíos, siempre por el sendero costero.', 'Sendero costero'),
  (3,  'poi',         'Fin del sendero costero · Pinares de Liencres', 4.10, 2.32, 43.452818, -3.958380,  31, NULL, 'Pinares'),
  (4,  'aid_station', 'Avituallamiento · aparcamiento de Los Pinares', 6.15, 2.05, 43.448822, -3.946081,  84, 'Sólidos y líquidos. Lleva tu recipiente reutilizable.', 'Pinares'),
  (5,  'poi',         'Fin de los Pinares · carretera secundaria',     6.80, 0.65, 43.453689, -3.943369,  70, 'Tramo abierto al tráfico: respeta las normas de circulación.', 'Carretera'),
  (6,  'poi',         'Carretera CA-231',                              7.54, 0.74, 43.453769, -3.939050,  90, 'Abierta al tráfico.', 'Carretera'),
  (7,  'poi',         'Desvío a la ruta del Monte Tolío',              7.69, 0.15, 43.453594, -3.939589,  90, NULL, 'Camino'),
  (8,  'poi',         'Bifurcación: camino de la izquierda',           8.38, 0.69, 43.448515, -3.943172, 143, 'Empieza el sendero de montaña.', 'Senda de montaña'),
  (9,  'poi',         'Monte Picota · 233 m',                          9.52, 1.14, 43.440089, -3.944622, 233, 'Techo del recorrido. Se baja 10 m por el mismo sendero hasta la bifurcación.', 'Senda de montaña'),
  (10, 'poi',         'Bifurcación: camino de la derecha',             9.62, 0.10, 43.440470, -3.944735, 224, 'Pista forestal asfaltada.', 'Pista asfaltada'),
  (11, 'poi',         'Sendero de montaña de la izquierda',           10.14, 0.52, 43.442263, -3.941700, 148, NULL, 'Senda de montaña'),
  (12, 'poi',         'Monte Tolío',                                  10.84, 0.70, 43.447083, -3.941744, 225, NULL, 'Senda de montaña'),
  (13, 'poi',         'Incorporación a la CA-231 dirección Santander',12.39, 1.55, 43.456582, -3.932272,  89, 'Abierta al tráfico, hasta la Plaza de la Cruz.', 'Carretera'),
  (14, 'finish',      'Meta · Plaza de la Cruz',                      14.11, 1.72, 43.460769, -3.927949,  69, 'Avituallamiento de sólidos y líquidos en meta.', 'Pueblo')
) AS v(orden, tipo, descr, km, parcial, lat, lon, alt, nota, via)
LEFT JOIN public.roadbook_item_types t ON t.name = v.tipo
WHERE NOT EXISTS (SELECT 1 FROM public.roadbook_items WHERE roadbook_id = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a');

INSERT INTO public.roadbooks (id, race_distance_id, name, description)
SELECT 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b', '8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e', 'Rutómetro Andarines 7K',
       'Las Reigadas, Monte Tolío y Monte Picota. Km del reglamento sobre el GPX (7,06 km medidos).'
WHERE NOT EXISTS (SELECT 1 FROM public.roadbooks WHERE race_distance_id = '8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e');

INSERT INTO public.roadbook_items
  (roadbook_id, item_order, item_type, item_type_id, description, km_total, km_partial, km_remaining,
   latitude, longitude, altitude, is_checkpoint, is_highlighted, notes, via)
SELECT 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b', v.orden, v.tipo, t.id, v.descr, v.km, v.parcial, round(7.06 - v.km, 2),
       v.lat, v.lon, v.alt, false, true, v.nota, v.via
FROM (VALUES
  (1,  'start',       'Salida · Plaza de la Cruz',                     0.00, 0.00, 43.460902, -3.928147,  68, 'Avituallamiento de sólidos y líquidos en salida y llegada.', 'Carretera'),
  (2,  'poi',         'Bifurcación en Las Reigadas · cambera',         0.52, 0.52, 43.459418, -3.933147,  60, 'Por la cambera marcada.', 'Cambera'),
  (3,  'poi',         'Carretera CA-231',                              1.38, 0.86, 43.454541, -3.936481,  88, 'Abierta al tráfico.', 'Carretera'),
  (4,  'poi',         'Desvío a la ruta del Monte Tolío',              1.65, 0.27, 43.453594, -3.939589,  90, NULL, 'Camino'),
  (5,  'poi',         'Bifurcación: camino de la izquierda',           2.35, 0.70, 43.448515, -3.943172, 150, 'Empieza el sendero de montaña.', 'Senda de montaña'),
  (6,  'poi',         'Monte Picota · 235 m',                          3.49, 1.14, 43.440089, -3.944622, 233, 'Techo del recorrido. Se baja 10 m hasta la bifurcación.', 'Senda de montaña'),
  (7,  'poi',         'Bifurcación: camino de la derecha',             3.59, 0.10, 43.440470, -3.944735, 224, 'Pista forestal asfaltada.', 'Pista asfaltada'),
  (8,  'poi',         'Sendero de montaña de la izquierda',            4.09, 0.50, 43.442263, -3.941700, 148, NULL, 'Senda de montaña'),
  (9,  'poi',         'Monte Tolío',                                   4.80, 0.71, 43.447083, -3.941744, 225, NULL, 'Senda de montaña'),
  (10, 'poi',         'Incorporación a la CA-231 dirección Santander', 6.39, 1.59, 43.456582, -3.932272,  89, 'Abierta al tráfico, hasta la Plaza de la Cruz.', 'Carretera'),
  (11, 'finish',      'Meta · Plaza de la Cruz',                       7.06, 0.67, 43.460905, -3.928150,  68, 'Avituallamiento de sólidos y líquidos en meta.', 'Carretera')
) AS v(orden, tipo, descr, km, parcial, lat, lon, alt, nota, via)
LEFT JOIN public.roadbook_item_types t ON t.name = v.tipo
WHERE NOT EXISTS (SELECT 1 FROM public.roadbook_items WHERE roadbook_id = 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b');

-- --------------------------------------------------------------- web propia
-- Libro de diseño medido en el logo: granate 601010, rosa D06070, verde
-- azulado 408080. Sin cartel: portada con el logo como textura.
INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
  '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', 'gurriana', true,
  '{"colorMarca": "#601010", "colorAccion": "#D06070", "colorSecundario": "#408080", "hero": "textura", "cinta": true, "cuentaAtras": true}'::jsonb,
  '{
    "nombreCorto": "Desafío Picota",
    "fechaTexto": "Sábado 24 de abril de 2027",
    "lugar": {"nombre": "Plaza de la Cruz", "direccion": "Plaza de la Cruz, Liencres", "municipio": "Piélagos", "provincia": "Cantabria", "zona": "Costa Quebrada, Pinares de Liencres y Monte Picota", "municipios": ["Piélagos"]},
    "organizador": {"nombre": "Carlos Castañeda Calvo"},
    "inscripcion": {
      "cierreTexto": "22 de abril de 2027 o al completar los dorsales: 320 en el Trail y 120 en Andarines",
      "incluye": ["Dorsal con chip", "Bolsa del corredor", "Seguro de accidentes del día", "Avituallamientos", "Servicios de la organización"],
      "nota": "Precio hasta el 24 de marzo; desde el 25 de marzo, 5 € más. Los menores participan acompañados de un adulto responsable, con autorización firmada.",
      "devolucion": {"texto": "Las inscripciones son definitivas, personales e intransferibles: no se devuelven. Solo si la organización suspende la prueba por causas ajenas se valora la devolución, y al 100 % si es por falta de permisos o restricciones de tráfico."}
    },
    "reglamento": {
      "marcaje": ["Carteles indicadores, banderines y cintas de balizamiento bien visibles, colocados los días anteriores.", "En las zonas boscosas el balizamiento es reversible y no daña el medio natural.", "Algunos tramos van por carretera abierta al tráfico: se respetan las normas de circulación."],
      "normas": ["Dorsal siempre visible. Prohibido correr sin camiseta ni pantalón.", "Trail: no se permite participar con animales. Andarines: sí, atados y sin molestar.", "Andarines es una marcha a pie: no se puede correr."]
    },
    "programa": [
      {"fecha": "2027-04-23", "hora": "17:00", "horaFin": "20:00", "titulo": "Recogida de dorsales", "lugar": "Arco de salida, Plaza de la Cruz"},
      {"fecha": "2027-04-24", "hora": "07:00", "horaFin": "09:45", "titulo": "Recogida de dorsales", "lugar": "Arco de salida, Plaza de la Cruz"},
      {"fecha": "2027-04-24", "hora": "09:00", "titulo": "Carreras infantiles (inscripción en el arco de salida)", "lugar": "Plaza de la Cruz"},
      {"fecha": "2027-04-24", "hora": "10:00", "titulo": "Salida Trail 13K"},
      {"fecha": "2027-04-24", "hora": "10:05", "titulo": "Salida Andarines 7K"}
    ],
    "dorsales": {"lugar": "Arco de salida, Plaza de la Cruz", "horarios": [["Viernes 23 de abril", "17:00–20:00"], ["Sábado 24 de abril", "07:00–09:45"]], "nota": "Los menores entregan la autorización firmada por el adulto responsable."},
    "premios": [
      {"pruebas": ["7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d"], "categoria": "Absoluta masculina y femenina", "premio": "Tres primeros puestos"},
      {"pruebas": ["7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d"], "categoria": "Sub 21 masculino y femenino", "premio": "Tres primeros puestos", "texto": "Quienes como máximo cumplan 21 años el 31 de diciembre de 2027."},
      {"pruebas": ["7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d"], "categoria": "Veteranos +45 masculino y femenino", "premio": "Tres primeros puestos", "texto": "Quienes tengan 45 años cumplidos el 31 de diciembre de 2027."},
      {"pruebas": ["7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d"], "categoria": "Mejor de Piélagos", "premio": "Primer hombre y primera mujer empadronados en Piélagos"}
    ],
    "servicios": [
      {"nombre": "Carreras infantiles", "texto": "De 3 a 16 años, por edades y no competitivas. Inscripción en el arco de salida minutos antes de las 09:00."},
      {"nombre": "Avituallamiento de meta", "texto": "Sólidos y líquidos para los participantes con dorsal."},
      {"nombre": "Tablón de anuncios", "texto": "El día del evento: tiempos, posiciones, reglamento y colaboraciones."}
    ],
    "sanitario": {"medios": [["1", "ambulancia"], ["2", "auxiliares sanitarios"]], "nota": "Vehículos todoterreno para el primer auxilio en el recorrido y traslado al centro de salud de Liencres. Habrá un teléfono de asistencia para emergencias."},
    "medioAmbiente": {"espacio": "Costa Quebrada y Pinares de Liencres", "normas": "Contenedores hasta 100 m después de cada avituallamiento. Tirar residuos fuera es descalificación. Balizamiento reversible y grupo de cierre que recoge y limpia tras el último participante."},
    "pruebas": [
      {"id": "7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d", "color": "#601010",
       "descripcion": "Speed trail de 13 km con 437 m de desnivel: el sendero de Costa Quebrada, los Pinares de Liencres y la subida al Monte Picota por el Monte Tolío. Salida y meta en la Plaza de la Cruz.",
       "relato": "Sales de la Plaza de la Cruz hacia el norte, a la playa de Somocuevas. En el km 1,8 empieza el sendero de Costa Quebrada: playa del Madero, playa de Pedruquíos y acantilados hasta el km 4,1. Luego los Pinares de Liencres, con el avituallamiento del km 6,15 en el aparcamiento.\nDel km 6,8 al 7,7 un tramo de carretera, abierta al tráfico, hasta el desvío al Monte Tolío. En la bifurcación del km 8,4 coges la izquierda y empieza la subida: 1,1 km de senda hasta el Monte Picota, el techo de la carrera a 233 m. Bajas 10 m, derecha en la bifurcación, pista asfaltada hasta el km 10,1 y otra vez senda por la izquierda hasta el Monte Tolío.\nDesde ahí todo es bajar por el sendero hasta la CA-231 en el km 12,4 y, por ella, de vuelta a la Plaza de la Cruz.",
       "terreno": [["Pueblo y playa", "1,8 km"], ["Sendero costero", "2,3 km"], ["Pinares", "2,7 km"], ["Carretera", "1,6 km"], ["Senda de montaña", "4,1 km"], ["Pista asfaltada", "0,5 km"]],
       "marcaje": "Carteles, banderines y cintas"},
      {"id": "8b3c0d5e-6f7a-4b2c-8d9e-4f5a6b7c8d9e", "color": "#408080",
       "descripcion": "Marcha a pie de 7 km, no competitiva, hasta el Monte Picota y el Monte Tolío. Para caminar, con animales atados si quieres, y con menores acompañados.",
       "relato": "Desde la Plaza de la Cruz, carretera del barrio de Las Reigadas hacia el oeste hasta la bifurcación del km 0,5, y por la cambera marcada hasta la CA-231. En el km 1,65 empieza el desvío al Monte Tolío; en la bifurcación del km 2,35 se coge la izquierda y la senda sube hasta el Monte Picota, en el km 3,5, a 235 m.\nSe baja 10 m, derecha en la bifurcación, pista asfaltada hasta el km 4,1 y senda por la izquierda hasta el Monte Tolío en el km 4,8. El mismo sendero baja hasta la CA-231 en el km 6,4 y, por ella, de vuelta a la plaza.",
       "terreno": [["Carretera y cambera", "1,65 km"], ["Senda de montaña", "4 km"], ["Pista asfaltada", "0,5 km"], ["Carretera", "0,7 km"]],
       "marcaje": "Carteles, banderines y cintas"}
    ],
    "seo": {"titulo": "I Desafío Picota 2027 · 24 de abril · Liencres", "descripcion": "Speed trail de 13 km por Costa Quebrada, los Pinares y el Monte Picota, y marcha de 7 km. Sábado 24 de abril de 2027 desde la Plaza de la Cruz de Liencres (Piélagos)."}
  }'::jsonb
)
ON CONFLICT (race_id) DO UPDATE SET plantilla = EXCLUDED.plantilla, tema = EXCLUDED.tema, contenido = EXCLUDED.contenido;

-- Organiza
INSERT INTO public.race_sponsors (race_id, name, level, display_order)
SELECT '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', 'Carlos Castañeda Calvo', 'organiza', 1
WHERE NOT EXISTS (SELECT 1 FROM public.race_sponsors WHERE race_id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d');

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT name, slug, date, is_visible, registration_opens, registration_closes FROM public.races WHERE id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d';
SELECT d.name, d.distance_km, d.elevation_gain, d.kind, d.competitive, d.bib_start, d.bib_end,
       (SELECT count(*) FROM public.race_distance_prices p WHERE p.race_distance_id = d.id) AS tramos,
       (SELECT count(*) FROM public.race_categories c WHERE c.race_distance_id = d.id) AS categorias,
       (SELECT count(*) FROM public.registration_form_fields f WHERE f.race_distance_id = d.id) AS campos,
       (SELECT count(*) FROM public.roadbook_items i JOIN public.roadbooks r ON r.id = i.roadbook_id WHERE r.race_distance_id = d.id) AS puntos_rutometro,
       (SELECT to_char(w.hora_prevista AT TIME ZONE 'UTC', 'HH24:MI') FROM public.race_waves w WHERE w.race_distance_id = d.id) AS salida
  FROM public.race_distances d WHERE d.race_id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d' ORDER BY d.display_order;
SELECT name, min_age, max_age FROM public.race_categories WHERE race_id = '9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d' ORDER BY race_distance_id, display_order;
-- Categorías: 20 años → Sub 21; 30 → Absoluta; 50 → Veteranos
SELECT public.get_race_category('9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', DATE '2007-06-01', 'M', '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d') AS a20,
       public.get_race_category('9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', DATE '1997-06-01', 'F', '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d') AS a30,
       public.get_race_category('9d4e7b2a-1c3f-4a6e-8b5d-2f7a9c1e4b6d', DATE '1977-06-01', 'M', '7a2b9c4d-5e6f-4a1b-9c8d-3e4f5a6b7c8d') AS a50;
SELECT count(*) AS secciones FROM public.race_regulation_sections WHERE regulation_id = 'c5d6e7f8-9a0b-4c1d-8e2f-3a4b5c6d7e8f';
