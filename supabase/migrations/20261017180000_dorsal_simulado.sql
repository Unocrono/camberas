-- =============================================================================
-- Dorsal simulado en los correos (17-oct-2026)
--
-- El correo «Tu dorsal y QR» enseña, en el bloque [[tarjeta_dorsal]], el
-- dorsal tal como lo llevará el corredor: la plantilla en blanco de la carrera
-- con su número y su nombre, dibujada al vuelo por la edge function
-- dorsal-imagen (GET ?t=<token_inscripcion> → JPG). Sin configuración, la
-- tarjeta verde de siempre.
--
-- 1. races.dorsal_simulado (jsonb): plantilla, fuente, qué texto va debajo
--    (nombre de pila o nick) y dónde van número y nombre. Formato en
--    supabase/functions/dorsal-imagen/index.ts.
-- 2. Entre Viñedos 2026: plantilla del organizador (1181 x 833) y colocación
--    medida sobre su dorsal de muestra (número 2026, nombre Jorge): la caja del
--    número cae al píxel y el nombre a un píxel. Fuente libre Anton (OFL),
--    ensanchada un 15 % (número) y un 23 % (nombre) para igualar el diseño.
--
-- Solo datos y una columna: no toca funciones ni permisos. Idempotente.
-- =============================================================================

ALTER TABLE public.races ADD COLUMN IF NOT EXISTS dorsal_simulado jsonb;

COMMENT ON COLUMN public.races.dorsal_simulado IS
  'Dorsal simulado para los correos (edge function dorsal-imagen): {fondo, fuente?, texto: nombre|nick, numero:{centroX,arriba,alto,ensanche,anchoMax,color}, nombre:{centroX,arriba,alto,ensanche,anchoMax,color}, recorridos?:{<distance_id>:{fondo…}}}. NULL: tarjeta verde.';

UPDATE public.races
   SET dorsal_simulado = '{
     "fondo": "https://camberas.com/fotos/entre-vinedos/dorsal-2026.jpg",
     "fuente": "https://camberas.com/fuentes/Anton-Regular.ttf",
     "texto": "nombre",
     "numero": {"centroX": 567, "arriba": 277, "alto": 272, "ensanche": 1.15, "anchoMax": 1000, "color": "#000000"},
     "nombre": {"centroX": 588, "arriba": 557, "alto": 46, "ensanche": 1.23, "anchoMax": 720, "color": "#000000"}
   }'::jsonb
 WHERE id = '1789e37c-0329-4cf1-ace7-32419c12db6c';

-- Comprobación: la columna y la configuración de Entre Viñedos
SELECT name, dorsal_simulado->>'fondo' AS plantilla, dorsal_simulado->'numero'->>'alto' AS alto_numero
  FROM public.races WHERE id = '1789e37c-0329-4cf1-ace7-32419c12db6c';
