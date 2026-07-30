-- Reglamento Loiu 500 Trail 2026 (1 nov 2026)
-- Volcado del documento oficial bilingüe "REGLAMENTO – ARAUDIA"
-- (se importa la versión en castellano).
-- Idempotente: si la carrera ya tiene secciones de reglamento, no hace nada.
DO $$
DECLARE
  v_race_id uuid := 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a';
  v_reg_id uuid;
BEGIN
  SELECT id INTO v_reg_id FROM race_regulations WHERE race_id = v_race_id LIMIT 1;
  IF v_reg_id IS NULL THEN
    INSERT INTO race_regulations (race_id, published, version)
    VALUES (v_race_id, false, 1)
    RETURNING id INTO v_reg_id;
  END IF;

  IF EXISTS (SELECT 1 FROM race_regulation_sections WHERE regulation_id = v_reg_id) THEN
    RAISE NOTICE 'El reglamento ya tiene secciones; no se inserta nada.';
    RETURN;
  END IF;

  INSERT INTO race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required) VALUES
  (v_reg_id, 'general_info', 'Información General',
E'El Ayuntamiento de Loiu, con la colaboración de diversas empresas, organiza la tercera edición del evento deportivo Loiu 500 Trail.\n\nLa prueba se celebrará el 1 de noviembre en las modalidades de ANDAR y CORRER, sobre un circuito de 12.000 metros de recorrido. La dificultad es moderada, con una altitud máxima de 290 metros y un desnivel de 339 metros, tanto positivo como negativo.\n\nTiempo máximo para la realización de la prueba:\n• Modalidad CORRER: DOS HORAS Y MEDIA.\n• Modalidad ANDAR: TRES HORAS Y MEDIA.\n\nLa modalidad de ANDAR no es competitiva: quienes se apunten a andar deben hacerlo al ritmo que deseen pero sin correr (en cuyo caso deben apuntarse a la modalidad de correr). Aunque no es competitiva, se realiza la clasificación con el dorsal y el chip.', 1, true),

  (v_reg_id, 'classifications', 'Modalidad de Correr y Premios',
E'La modalidad de CORRER es competitiva y se premiará con diversos regalos a los diez primeros y diez primeras de las clasificaciones absolutas.\n\nEn ningún caso existirán premios en metálico.\n\nLos regalos a los 10 primeros/as se entregarán según vayan llegando, a fin de evitar esperas que propicien enfriamientos innecesarios. Se tratará de hacer, como mínimo, las fotos de los podios.', 2, false),

  (v_reg_id, 'registration', 'Inscripción',
E'Las inscripciones se podrán realizar a través de las plataformas de inscripción www.rockthesport.com y www.uno.es.\n\nPrecio de la inscripción:\n• Junio y julio: 12 €.\n• Agosto: 13 €.\n• Septiembre: 14 €.\n• Octubre: 15 €.\n\nLa inscripción incluye:\n• Seguro de Responsabilidad Civil de la Organización.\n• Seguro de Accidentes.\n• Dorsal.\n• Chip.\n• Camiseta oficial.\n• Sorteo de regalos en ambas modalidades, que se podrá comprobar en la llegada con el dorsal correspondiente.\n• Avituallamiento de carrera.\n• Avituallamiento de llegada.\n• Txoripan de llegada.\n• Vestuario.\n• Guardarropa.\n• Clasificaciones instantáneas, tanto de andar como de correr, en www.uno.es.\n• Fotografías y vídeos de la prueba en Facebook, página Loiu 500 Trail.\n\nTanto en la modalidad de andar como en la de correr se deberá portar el dorsal oficial de la prueba con su chip correspondiente, que determinarán el tiempo oficial y las referencias para futuras ocasiones en las que se participe.', 3, true),

  (v_reg_id, 'registration', 'Inscripciones Gratuitas para Empadronados en Loiu',
E'El patrocinio del Ayuntamiento de Loiu propicia la reserva de 100 inscripciones gratuitas para las personas empadronadas en el municipio, para las cien primeras por riguroso orden de inscripción.\n\nDeberán inscribirse por las plataformas de manera normal, pagar el importe de la inscripción (señalando como población Loiu) y, una vez corroborada su participación/asistencia el día de la prueba, remitir copia del empadronamiento o documento similar. La devolución del importe se realizará en la semana posterior a la Loiu 500 Trail.\n\nSe avisará al alcanzar el cupo de 100 personas con una nota en la sección de NOTICIAS de las dos plataformas, y se creará una lista de espera por si alguien no se presentara el día de la prueba.\n\nEl cupo de 100 dorsales gratuitos se reparte entre las dos modalidades (marcha de 12 km y marcha txiki): pueden ser 50 y 50, 40 y 60, etc., siempre en función del orden cronológico de inscripción (día y hora).', 4, false),

  (v_reg_id, 'bib_collection', 'Recogida de Dorsales y Chips',
E'Las inscripciones se podrán realizar hasta el 29 de octubre a través de las plataformas.\n\nLos días 29 y 30 de octubre se podrán recoger la camiseta, el dorsal y el chip de manera personal, o enviando a alguien, en Decathlon Bilbao (calle Villerías 10), donde estará instalada la secretaría.\n• Horario de recogida: de 10:00 a 14:00 y de 16:00 a 20:00 h.\n\nEl sábado 31 de octubre, víspera de la prueba, no se entregarán dorsales.\n\nEl día de la prueba (1 de noviembre) se podrán recoger dorsales y chip hasta media hora antes de la salida de la modalidad de andar (prevista a las 9:30 h). La secretaría estará instalada en la zona de salida y llegada, en la Plaza de los Jubilados. Se aconseja retirar durante la semana previa, o enviar a alguien a recogerlo, para evitar retrasos y colas innecesarias.', 5, false),

  (v_reg_id, 'cutoff_times', 'Horarios de Salida',
E'Salidas (1 de noviembre):\n• 9:30 h — Korrika / Correr: 12 km.\n• 9:40 h — Ibili / Andar: 12 km.\n• 9:45 h — Martxa Txiki: 5 km.', 6, true),

  (v_reg_id, 'txiki_march', 'Marcha Txiki (5 km)',
E'La Loiu 500 Trail, además de la prueba de 12 kilómetros, acogerá una marcha txiki de 5 kilómetros de recorrido, exclusivamente para la modalidad de andar y destinada a niños, acompañantes y otras personas con menor capacidad física para realizar los 12 kilómetros.\n\nLa salida y la llegada, al igual que la marcha de 12 kilómetros, estarán instaladas en la Plaza de los Jubilados.\n\nLas inscripciones se podrán realizar a través de www.rockthesport.com y www.uno.es.\n\nPrecio:\n• Hasta el 30 de septiembre: 8 €.\n• A partir del 1 de octubre (si quedaran dorsales y chip): 10 €.\n\nEl precio de la inscripción incluye los mismos derechos que el punto de Inscripción de la prueba de 12 kilómetros, salvo la modalidad de correr, que no existe en la marcha txiki.', 7, false),

  (v_reg_id, 'shirt_sizes', 'Tallas de Camiseta',
E'La organización no garantiza las tallas de camisetas para las inscripciones que se realicen más tarde, cercanas al día de la prueba.', 8, false),

  (v_reg_id, 'responsibility', 'Responsabilidad y Participación',
E'Las personas que traten de participar sin dorsal podrán ser retiradas por el personal de la organización; y si causaran algún percance a algún participante con dorsal oficial, puede ser constitutivo de delito.\n\nLos y las participantes asumen que están en las condiciones físicas mínimas para realizar la prueba. La organización no se hará responsable de las lesiones de aquellas personas que participen con problemas físicos previos y se arriesguen a agravar sus dolencias o lesiones.\n\nLa organización se reserva el derecho de modificar el presente reglamento en función de cualquier necesidad logística, jurídica y de salud.', 9, true),

  (v_reg_id, 'data_protection', 'Fotografías y Derechos de Imagen',
E'Las fotografías de los participantes, además de ser publicadas en Facebook (página Loiu 500 Trail) para que se puedan descargar de manera gratuita, podrán ser utilizadas para realizar carteles publicitarios en ediciones futuras.\n\nSi alguien no desea alguna de estas publicaciones, deberá manifestarlo por escrito a la organización.', 10, true);

  RAISE NOTICE 'Reglamento de Loiu 500 Trail creado con 10 secciones (sin publicar — revísalo y publícalo desde el admin).';
END $$;
