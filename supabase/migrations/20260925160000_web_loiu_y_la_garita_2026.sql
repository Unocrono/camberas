-- =============================================================================
-- Webs propias de Loiu 500 Trail 2026 y de La Garita 2026
--  1. Loiu ya existe en Camberas: solo se le pone race_web (DESACTIVADA) con
--     los textos de docs/eventos/eventos/loiu-500-trail-2026.json.
--  2. La Garita 2026 se crea duplicando la edición 2025 («Subida a la Garita -
--     San Silvestre Corraliega», 31-12-2025) con duplicar_carrera(): recorridos,
--     precios, formulario, categorías… desplazados un año. Después se le pone
--     la race_web del fixture (DESACTIVADA) y queda OCULTA hasta revisarla.
-- Requiere: 20260924170000, 20260924180000 y 20260925150000 (duplicar_carrera).
-- Idempotente: si La Garita 2026 ya existe (por slug), no la vuelve a crear.
-- Generado por scratchpad/generar_seed_webs.py a partir de los fixtures.
-- =============================================================================

DO $seed$
DECLARE
  v_loiu   uuid;
  v_g25    uuid;
  v_g26    uuid;
BEGIN
  -- ------------------------------------------------------------------ Loiu
  SELECT id INTO v_loiu FROM public.races WHERE slug = 'loiu-500-trail-2026';
  IF v_loiu IS NULL THEN
    RAISE NOTICE 'Loiu 500 Trail 2026 no existe (slug loiu-500-trail-2026): no se crea su web';
  ELSE
    INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
      v_loiu, 'gurriana', false,
      '{"colorMarca": "#1E4D8C", "colorAccion": "#F2A900", "colorSecundario": "#2E7D32", "hero": "textura", "cinta": true}'::jsonb,
      $json$
{
  "nombreCorto": "Loiu 500 Trail",
  "descripcion": "Circuito de 12 km por Loiu en las modalidades de correr y andar, con Marcha Txiki de 5 km para niños y acompañantes. Dificultad moderada: altitud máxima 290 m, desnivel de 339 m.",
  "fechaTexto": "Domingo 1 de noviembre de 2026",
  "lugar": {
    "nombre": "Plaza de los Jubilados (Erretiratuen Plaza)",
    "municipio": "Loiu",
    "provincia": "Bizkaia"
  },
  "organizador": {
    "nombre": "Ayuntamiento de Loiu y colaboradores"
  },
  "inscripcion": {
    "cierreTexto": "Online hasta el 31 de octubre; talla de camiseta garantizada hasta el 30 de septiembre",
    "incluye": [
      "Seguro de responsabilidad civil y de accidentes",
      "Dorsal numerado con chip RFID",
      "Camiseta oficial (talla garantizada hasta el 30 de septiembre)",
      "Avituallamiento en carrera y en meta",
      "Txoripan de llegada",
      "Vestuario y guardarropa",
      "Sorteo de regalos",
      "Clasificaciones instantáneas",
      "Fotos y vídeos en la página de Facebook del evento"
    ]
  },
  "reglamento": {
    "url": "https://uno.es/media/com_eventbooking/ReglamentoLoiu2026.pdf",
    "normas": [
      "La modalidad Andar no es competitiva; si un participante corre, debe estar inscrito en Correr.",
      "No existe premio en metálico en ninguna categoría ni modalidad."
    ]
  },
  "programa": [
    {
      "fecha": "2026-10-29",
      "hora": "10:00",
      "horaFin": "14:00",
      "titulo": "Recogida de dorsales",
      "lugar": "Decathlon Bilbao, C/ Villerías 10"
    },
    {
      "fecha": "2026-10-29",
      "hora": "16:00",
      "horaFin": "20:00",
      "titulo": "Recogida de dorsales",
      "lugar": "Decathlon Bilbao, C/ Villerías 10"
    },
    {
      "fecha": "2026-10-30",
      "hora": "10:00",
      "horaFin": "14:00",
      "titulo": "Recogida de dorsales",
      "lugar": "Decathlon Bilbao, C/ Villerías 10"
    },
    {
      "fecha": "2026-10-30",
      "hora": "16:00",
      "horaFin": "20:00",
      "titulo": "Recogida de dorsales",
      "lugar": "Decathlon Bilbao, C/ Villerías 10"
    },
    {
      "fecha": "2026-11-01",
      "hora": "09:00",
      "titulo": "Recogida de dorsales hasta 30 min antes de la salida",
      "lugar": "Secretaría en Plaza de los Jubilados"
    },
    {
      "fecha": "2026-11-01",
      "hora": "09:30",
      "titulo": "Salida Correr 12 km"
    },
    {
      "fecha": "2026-11-01",
      "hora": "09:40",
      "titulo": "Salida Andar 12 km"
    },
    {
      "fecha": "2026-11-01",
      "hora": "09:45",
      "titulo": "Salida Marcha Txiki 5 km"
    }
  ],
  "dorsales": {
    "lugar": "Decathlon Bilbao (C/ Villerías 10) y secretaría en Plaza de los Jubilados",
    "horarios": [
      [
        "Jueves 29 y viernes 30 de octubre",
        "10:00–14:00 y 16:00–20:00 en Decathlon Bilbao"
      ],
      [
        "Domingo 1 de noviembre",
        "Hasta las 09:00 en la Plaza de los Jubilados"
      ]
    ],
    "nota": "El sábado 31 de octubre no hay entrega de dorsales."
  },
  "premios": [
    {
      "pruebas": [
        "KORRIKA"
      ],
      "premio": "Regalos en especie",
      "texto": "Top 10 masculino y top 10 femenino de la clasificación absoluta. Se entregan al cruzar la meta."
    },
    {
      "pruebas": [
        "KORRIKA",
        "IBILI",
        "TXIKI"
      ],
      "premio": "Sorteo de regalos",
      "texto": "Verificable en llegada con el dorsal."
    }
  ],
  "servicios": [
    {
      "nombre": "Cronometraje electrónico con chip"
    },
    {
      "nombre": "Avituallamientos líquidos y sólidos"
    },
    {
      "nombre": "Servicio médico en carrera y meta"
    },
    {
      "nombre": "Seguro de accidentes incluido"
    },
    {
      "nombre": "Camiseta técnica para todos los participantes"
    },
    {
      "nombre": "Txoripan de llegada"
    },
    {
      "nombre": "Vestuario y guardarropa"
    }
  ],
  "camiseta": {
    "incluida": true,
    "hasta": "2026-09-30",
    "tallas": [
      "8 infantil",
      "16 infantil",
      "S",
      "M",
      "L",
      "XL",
      "XXL"
    ],
    "texto": "Talla garantizada para inscritos hasta el 30 de septiembre."
  },
  "contacto": {
    "email": "2026@uno.es"
  }
}
      $json$::jsonb
    )
    ON CONFLICT (race_id) DO UPDATE SET contenido = EXCLUDED.contenido, tema = EXCLUDED.tema;
  END IF;

  -- ------------------------------------------------------------- La Garita
  SELECT id INTO v_g26 FROM public.races WHERE slug = 'san-silvestre-corraliega-la-garita-2026';
  IF v_g26 IS NULL THEN
    SELECT id INTO v_g25 FROM public.races
     WHERE name ILIKE '%garita%' AND date = '2025-12-31'
     ORDER BY created_at DESC LIMIT 1;
    IF v_g25 IS NULL THEN
      RAISE EXCEPTION 'No se encuentra La Garita 2025 (name ILIKE ''%%garita%%'' AND date = 2025-12-31): no se crea la edición 2026';
    ELSE
      v_g26 := public.duplicar_carrera(
        v_g25,
        'Subida a la Garita - San Silvestre Corraliega 2026',
        '2026-12-31',
        'san-silvestre-corraliega-la-garita-2026',
        true
      );
    END IF;
  END IF;

  IF v_g26 IS NOT NULL THEN
    INSERT INTO public.race_web (race_id, plantilla, activa, tema, contenido) VALUES (
      v_g26, 'gurriana', false,
      '{"colorMarca": "#7A1F1F", "colorAccion": "#F0B323", "colorSecundario": "#2F5D3A", "hero": "textura", "cinta": true}'::jsonb,
      $json$
{
  "nombreCorto": "Subida a La Garita",
  "descripcion": "La carrera discurre por el monte Orza hasta el pico La Garita. El centro neurálgico es la Plaza de la Constitución de Los Corrales de Buelna. Trail de 5,5 km con 691 m de desnivel positivo y meta en el pico; marcha a pie de 15,37 km. Se permite participar con animales de compañía, siempre con correa y bajo responsabilidad del dueño.",
  "fechaTexto": "Jueves 31 de diciembre de 2026",
  "lugar": {
    "nombre": "Plaza de la Constitución",
    "municipio": "Los Corrales de Buelna",
    "provincia": "Cantabria",
    "zona": "Monte Orza · Pico La Garita (699 m)"
  },
  "organizador": {
    "nombre": "San Silvestre Corraliega · Los Corrales de Buelna"
  },
  "inscripcion": {
    "cierreTexto": "Online hasta el 28 de diciembre; el día de la prueba solo en casos puntuales"
  },
  "reglamento": {
    "url": "https://uno.es/media/com_eventbooking/Reglamento%20La%20Garita%202025.pdf",
    "materialObligatorio": [],
    "normasMaterial": "Material recomendado: móvil con saldo y batería, cortavientos, depósito de agua de al menos 0,5 l, calzado y ropa adecuados, silbato, gorra. Se autoriza el uso de bastones.",
    "normas": [
      "Avituallamientos con líquido, fruta, chocolate, panceta y huevos en el km 3 y el km 8. Se espera el turno y los residuos se dejan en la papelera.",
      "Descalificación por salirse del itinerario balizado, no llevar el dorsal o recortarlo, cambiar balizas, tirar basura, abandonar material propio, no prestar auxilio o no atender a la organización.",
      "Quien se retire o tenga problemas debe comunicarlo al control más próximo.",
      "Animales de compañía permitidos, con correa y bajo responsabilidad exclusiva del dueño."
    ]
  },
  "programa": [
    {
      "fecha": "2026-12-30",
      "titulo": "Recogida de dorsales (preferente)",
      "lugar": "Los Corrales de Buelna"
    },
    {
      "fecha": "2026-12-31",
      "hora": "09:30",
      "titulo": "Recogida de dorsales hasta 30 min antes de la salida"
    },
    {
      "fecha": "2026-12-31",
      "hora": "10:00",
      "titulo": "Salida de la marcha a pie"
    },
    {
      "fecha": "2026-12-31",
      "hora": "10:30",
      "titulo": "Salida del trail"
    },
    {
      "fecha": "2026-12-31",
      "titulo": "Fiesta popular en meta con avituallamiento para todos"
    }
  ],
  "dorsales": {
    "lugar": "Los Corrales de Buelna",
    "horarios": [
      [
        "30 de diciembre",
        "Preferente"
      ],
      [
        "31 de diciembre",
        "Hasta 30 min antes de la salida"
      ]
    ],
    "nota": "Recoge el dorsal el día 30 para no retrasar la salida."
  },
  "premios": [
    {
      "pruebas": [
        "TRAIL"
      ],
      "premio": "Jamón al ganador y premios a los 5 primeros",
      "texto": "Clasificación del trail."
    },
    {
      "pruebas": [
        "MARCHA"
      ],
      "premio": "Premios especiales",
      "texto": "Al andarín más joven, al más veterano y al último en llegar."
    }
  ],
  "contacto": {
    "email": "2026@uno.es"
  }
}
      $json$::jsonb
    )
    ON CONFLICT (race_id) DO UPDATE SET contenido = EXCLUDED.contenido, tema = EXCLUDED.tema;
  END IF;
END
$seed$;

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT r.slug, r.name, r.date, r.is_visible, w.activa, jsonb_typeof(w.contenido) AS contenido
  FROM public.races r LEFT JOIN public.race_web w ON w.race_id = r.id
 WHERE r.slug IN ('loiu-500-trail-2026', 'san-silvestre-corraliega-la-garita-2026');
SELECT name, distance_km, price, registration_opens, registration_closes, bib_start, next_bib
  FROM public.race_distances WHERE race_id = (SELECT id FROM public.races WHERE slug = 'san-silvestre-corraliega-la-garita-2026') ORDER BY display_order;
SELECT jsonb_pretty(public.evento_publico('san-silvestre-corraliega-la-garita-2026') - 'reglamento' - 'campos' - 'faq');
