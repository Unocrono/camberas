-- =============================================================================
-- Web propia de Desafío Sarrio 2026 (camberas.com/desafio-sarrio), DESACTIVADA.
-- Textos de desafiosarrio.com (portada, Marcha, Trail 10, Trail 24, El club);
-- precios, salidas, límites, GPX e imágenes ya están en Camberas.
-- contenido.pruebas lleva el uuid de cada race_distance: evento_publico funde
-- descripción, relato y avituallamientos con lo calculado (20260925170000).
-- Requiere: 20260924170000, 20260924180000 y 20260925170000.
-- Generado por scratchpad/generar_seed_sarrio.py a partir del fixture.
-- =============================================================================

DO $seed$
DECLARE
  v_race uuid;
BEGIN
  SELECT id INTO v_race FROM public.races WHERE slug = 'desafio-sarrio';
  IF v_race IS NULL THEN
    RAISE NOTICE 'No existe la carrera con slug desafio-sarrio';
    RETURN;
  END IF;

  INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
    v_race, 'gurriana', false,
    '{"colorMarca": "#3A4A2B", "colorAccion": "#B5121B", "colorSecundario": "#8C7B4F", "hero": "foto", "cinta": true}'::jsonb,
    $json$
{
  "nombreCorto": "Desafío Sarrio",
  "descripcion": "Vive la experiencia de un evento deportivo en un campo de maniobras militar. Marcha, 10K y Desafío de 22 km entre los viñedos de Marqués de Vargas y Marqués de Murrieta y La Rad de Varea, a unos minutos de Logroño, con Sierra Cantabria de telón de fondo.",
  "fechaTexto": "Domingo 29 de noviembre de 2026",
  "lugar": {
    "nombre": "Campo de Maniobras de La Rad",
    "municipio": "Logroño",
    "provincia": "La Rioja",
    "zona": "La Rad de Varea · viñedos de Logroño"
  },
  "organizador": {
    "nombre": "Club Sarrio · Batallón de Helicópteros de Maniobra nº III",
    "email": "info@desafiosarrio.com",
    "web": "https://desafiosarrio.com"
  },
  "inscripcion": {
    "cierreTexto": "Hasta el 25 de noviembre; precio reducido hasta el 18 de octubre",
    "incluye": [
      "Dorsal con chip",
      "Avituallamientos en recorrido y en meta",
      "Seguro de accidentes y responsabilidad civil"
    ]
  },
  "reglamento": {
    "url": "https://desafiosarrio7925.live-website.com/wp-content/uploads/2025/01/CONDICIONES-DESAFIO-SARRIO-DEFINITIVAS.docx-3-2.pdf"
  },
  "programa": [
    {
      "fecha": "2026-11-29",
      "hora": "10:30",
      "titulo": "Salida Desafío 22 km",
      "lugar": "Campo de Maniobras de La Rad"
    },
    {
      "fecha": "2026-11-29",
      "hora": "10:31",
      "titulo": "Salida Marcha 8,5 km"
    },
    {
      "fecha": "2026-11-29",
      "hora": "11:30",
      "titulo": "Salida 10K"
    }
  ],
  "presentacion": {
    "titulo": "¡Acepta el Desafío!",
    "texto": "El helicóptero militar NH-90 «Sarrio» es un moderno helicóptero polivalente diseñado para cumplir con los estándares más altos de la OTAN. Da nombre al club y a la carrera: un evento deportivo dentro de un campo de maniobras militar, abierto a todos."
  },
  "club": {
    "nombre": "Club Sarrio",
    "lema": "Fuertes, compañeros, justos",
    "texto": "El club nace en 2017 y está formado por personas que han estado o están destinadas en el Batallón de Helicópteros de Maniobra nº III con inquietudes por el deporte en cualquiera de sus formas, con el objetivo de acercarse a la sociedad que les rodea para que conozca de primera mano el trabajo de los militares destinados en su región y los valores de las personas que integran el Ejército de Tierra.",
    "valores": [
      "Honor",
      "Disciplina",
      "Valor",
      "Espíritu de sacrificio",
      "Compañerismo",
      "Espíritu de servicio"
    ]
  },
  "contacto": {
    "email": "info@desafiosarrio.com",
    "emailClub": "clubsarrioiii@gmail.com",
    "redes": {
      "instagram": "https://www.instagram.com/clubsarrio/"
    }
  },
  "pruebas": [
    {
      "id": "ae90ffc5-4b6c-485f-9fd4-05f175ab8a52",
      "distanciaTexto": "22 km",
      "descripcion": "Un trail ideal para conocer los viñedos de Logroño y La Rad de Varea, con tres avituallamientos durante el recorrido y otro en meta.",
      "relato": "El inicio en el Campo de Maniobras de La Rad nos llevará rápidamente hacia abajo, buscando los caminos vitícolas de Logroño. Avanzaremos entre las hileras de vides de Marqués de Vargas y Marqués de Murrieta, disfrutando de un firme cómodo para ir cogiendo ritmo. Comenzará entonces una subida tendida atravesando el campo de maniobras hasta desviarnos a un sube y baja divertido con vistas a Sierra Cantabria al norte y, en día despejado, al San Lorenzo, las peñas de Viguera y la entrada del cañón del Leza; allí está el primer avituallamiento (km 6). Recorrido perimetral por el sur del campo de maniobras, con una bajada trepidante y una subida progresiva hasta el segundo avituallamiento en el antiguo Campo de Tiro (km 11,5). Seguiremos con el sube y baja hasta las cercanías del ecoparque, circundando un pinar hasta el tercer avituallamiento (km 17). Una preciosa bajada por una vaguada con vistas al valle del Ebro, la última subida para enganchar con el 10K y la marcha, y el kilómetro final juntos. Recta de meta, sonrisa para la foto y avituallamiento final. Una prueba pensada para disfrutar cada kilómetro, gestionar tus fuerzas y vivir la montaña con una sonrisa.",
      "avituallamientos": [
        {
          "km": 6,
          "nombre": "Mirador de Sierra Cantabria",
          "tipo": "liquido"
        },
        {
          "km": 11.5,
          "nombre": "Antiguo Campo de Tiro",
          "tipo": "completo"
        },
        {
          "km": 17,
          "nombre": "Pinar del ecoparque",
          "tipo": "liquido"
        },
        {
          "km": 22,
          "nombre": "Meta",
          "tipo": "completo"
        }
      ]
    },
    {
      "id": "c32d7ede-3513-4ff1-a06c-4105af260915",
      "distanciaTexto": "10 km",
      "descripcion": "Un pequeño trail con poca dificultad para descubrir la modalidad, ideal para conocer los viñedos de Logroño y La Rad de Varea, con un avituallamiento durante el recorrido y otro en meta.",
      "relato": "La aventura arranca con fuerza en el Campo de Maniobras de La Rad: una bajada trepidante nos lleva al corazón de la tradición vitivinícola, flanqueados por los viñedos de Marqués de Vargas, rozando casi la bodega, para enlazar con las tierras de Marqués de Murrieta. Tras los viñedos, una subida tendida y muy llevadera nos adentra de nuevo en el campo de maniobras, donde empieza la zona más juguetona de la prueba: un sube y baja divertido con Sierra Cantabria a la izquierda y, si el cielo lo permite, el San Lorenzo, las Peñas de Viguera y la entrada al Cañón del Leza a la derecha. Avituallamiento en el antiguo Campo de Tiro (km 6,5) para recargar y coger impulso. Continuamos con ese sube y baja técnico pero amable circundando La Rad, y un último esfuerzo hasta la recta de meta, la foto y el avituallamiento final.",
      "avituallamientos": [
        {
          "km": 6.5,
          "nombre": "Antiguo Campo de Tiro",
          "tipo": "completo"
        },
        {
          "km": 10,
          "nombre": "Meta",
          "tipo": "completo"
        }
      ]
    },
    {
      "id": "ab355329-bda4-4514-a920-a8b672a35553",
      "distanciaTexto": "8,5 km",
      "descripcion": "Una marcha senderista para caminar entre viñedos, descubrir rincones escondidos en La Rad de Varea y disfrutar de las vistas de algunas de las bodegas más emblemáticas de Rioja. Avituallamiento a mitad de camino y en meta.",
      "relato": "No hace falta ir muy lejos para encontrar un paisaje distinto. A solo unos minutos de Logroño nos espera un recorrido que combina caminos cómodos, viñedos y unas vistas que sorprenden incluso a quienes conocen bien la zona. Saldremos desde el Campo de Maniobras de La Rad y descenderemos hacia los viñedos de Marqués de Vargas; desde allí enlazaremos caminos entre cepas, cerca de bodegas que forman parte de la historia del vino de Rioja como Marqués de Vargas y Marqués de Murrieta. El camino nos llevará de nuevo hacia la parte alta con una subida suave y constante. En el antiguo Campo de Tiro nos espera el avituallamiento (km 5,5). Seguiremos atravesando el campo de maniobras con Sierra Cantabria de telón de fondo, bajando el ritmo y compartiendo la experiencia, hasta la meta y el avituallamiento final.",
      "avituallamientos": [
        {
          "km": 5.5,
          "nombre": "Antiguo Campo de Tiro",
          "tipo": "completo"
        },
        {
          "km": 8.5,
          "nombre": "Meta",
          "tipo": "completo"
        }
      ]
    }
  ]
}
    $json$::jsonb
  )
  ON CONFLICT (race_id) DO UPDATE SET contenido = EXCLUDED.contenido, tema = EXCLUDED.tema;

  IF NOT EXISTS (SELECT 1 FROM public.race_sponsors WHERE race_id = v_race) THEN
    INSERT INTO public.race_sponsors (race_id, name, level, logo_url, website, display_order) VALUES
      (v_race, 'Club Sarrio', 'organiza', NULL, 'https://desafiosarrio.com', 1),
      (v_race, 'Batallón de Helicópteros de Maniobra nº III', 'institucional', 'https://desafiosarrio.com/wp-content/uploads/2024/04/helicopteros-1-e1712906010251.png', NULL, 2),
      (v_race, 'Circuito de Carreras', 'colaborador', 'https://desafiosarrio.com/wp-content/uploads/2026/09/LOGO-Circuito-de-Carrera-horizontal-generico.jpg', NULL, 3),
      (v_race, 'Ardem', 'colaborador', 'https://desafiosarrio.com/wp-content/uploads/2026/09/ardem-alargado-1.jpg', NULL, 4);
  END IF;
END
$seed$;

-- Comprobación: las pruebas deben traer descripcion y avituallamientos de la web
SELECT p->>'nombre' AS prueba, p->>'salida' AS salida, left(p->>'descripcion', 60) AS descripcion, jsonb_array_length(COALESCE(p->'avituallamientos', '[]'::jsonb)) AS avituallamientos
  FROM jsonb_array_elements(public.evento_publico('desafio-sarrio')->'pruebas') p;
