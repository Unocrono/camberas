-- =============================================================================
-- Sync EventBooking (uno.es): varios eventos por carrera, campo de recorrido
-- configurable y equipos del Group Billing. Configuración de Entre Viñedos.
--
-- Hasta ahora eventbooking_sync tenía UN evento por carrera (event_id) y el
-- recorrido salía siempre del campo «Modalidad» (ADEMCO). Entre Viñedos
-- reparte sus inscritos en tres eventos de EventBooking:
--   1061  carrera y marcha, con el campo «Recorrido»
--   1062  carrera infantil (un solo recorrido, sin campo)
--   1060  inscripción por equipos (Group Billing): se importan los miembros
--         uno a uno con el nombre del equipo; el representante NO se importa
--
-- 1) Columna eventos (jsonb): lista de eventos con su configuración. Si está
--    vacía, el sync sigue con event_id + distance_map como siempre (ADEMCO).
--    Cada elemento:
--      event_id      número del evento en EventBooking (obligatorio)
--      campo         título del campo personalizado con el recorrido
--                    («Modalidad» por defecto)
--      distance_map  valor del campo → race_distance_id (claves normalizadas)
--      distance_id   recorrido por defecto si el campo falta o está vacío
--      grupos        true: Group Billing (saltar representante, poner equipo)
--      una_vez       true: evento ya cerrado; se importa UNA vez desde el botón
--                    «Sincronizar EventBooking» y el robot (cron) no lo pide.
--                    Al hacerlo el sync anota `hecho` (fecha); para repetir la
--                    importación, quitar `hecho` de ese elemento.
-- 2) Entre Viñedos: su fila, numerando POR RECORRIDO (numerar_por_carrera =
--    false) con los rangos 11-1000 carrera, 1001-2000 marcha, 2001-2500
--    infantil, que es lo que pide la organización.
--
-- La edge function eventbooking-sync se despliega aparte (Lovable). El PHP de
-- uno.es (camberas-sync.php) debe devolver por inscrito también group_id e
-- is_group_billing; sin ellos el sync avisa y trata a todos como individuales.
-- Idempotente.
-- =============================================================================

-- 1) Varios eventos por carrera
ALTER TABLE public.eventbooking_sync ADD COLUMN IF NOT EXISTS eventos jsonb;

COMMENT ON COLUMN public.eventbooking_sync.eventos IS
  'Lista de eventos de EventBooking que alimentan la carrera: [{event_id, campo, distance_map, distance_id, grupos}]. NULL: se usa event_id + distance_map (un solo evento, campo «Modalidad»).';

-- 2) Entre Viñedos 2026
INSERT INTO public.eventbooking_sync (race_id, event_id, distance_map, enabled, numerar_por_carrera, eventos)
VALUES (
  '1789e37c-0329-4cf1-ace7-32419c12db6c',
  1061,
  '{}'::jsonb,
  true,
  false,
  '[
    {"event_id": 1061, "campo": "Recorrido",
     "distance_map": {
       "Carrera": "1792e56f-be42-49f2-9f78-f30aae1bc31f", "Carrera 11K": "1792e56f-be42-49f2-9f78-f30aae1bc31f",
       "Carrera Entre Viñedos": "1792e56f-be42-49f2-9f78-f30aae1bc31f", "Correr": "1792e56f-be42-49f2-9f78-f30aae1bc31f",
       "Marcha": "979bd18c-ce4a-4da2-a28e-0a01e85f5b4c", "Marcha Entre Viñedos": "979bd18c-ce4a-4da2-a28e-0a01e85f5b4c",
       "Andar": "979bd18c-ce4a-4da2-a28e-0a01e85f5b4c"
     }},
    {"event_id": 1062, "distance_id": "17dd386a-70d7-4a93-a0ac-fae53927daee"},
    {"event_id": 1060, "campo": "Recorrido", "grupos": true, "una_vez": true,
     "distance_id": "1792e56f-be42-49f2-9f78-f30aae1bc31f",
     "distance_map": {
       "Carrera": "1792e56f-be42-49f2-9f78-f30aae1bc31f", "Carrera 11K": "1792e56f-be42-49f2-9f78-f30aae1bc31f",
       "Carrera Entre Viñedos": "1792e56f-be42-49f2-9f78-f30aae1bc31f", "Correr": "1792e56f-be42-49f2-9f78-f30aae1bc31f",
       "Marcha": "979bd18c-ce4a-4da2-a28e-0a01e85f5b4c", "Marcha Entre Viñedos": "979bd18c-ce4a-4da2-a28e-0a01e85f5b4c",
       "Andar": "979bd18c-ce4a-4da2-a28e-0a01e85f5b4c"
     }}
  ]'::jsonb
)
ON CONFLICT (race_id) DO UPDATE SET
  event_id = EXCLUDED.event_id, distance_map = EXCLUDED.distance_map, enabled = EXCLUDED.enabled,
  numerar_por_carrera = EXCLUDED.numerar_por_carrera, eventos = EXCLUDED.eventos;

-- Dorsales por recorrido: carrera desde el 11, marcha desde el 1001,
-- infantil desde el 2001 (assign_next_bib reparte con next_bib dentro del rango)
UPDATE public.race_distances SET bib_start = 11,   bib_end = 1000, next_bib = GREATEST(COALESCE(next_bib, 11), 11)
 WHERE id = '1792e56f-be42-49f2-9f78-f30aae1bc31f';
UPDATE public.race_distances SET bib_start = 1001, bib_end = 2000, next_bib = GREATEST(COALESCE(next_bib, 1001), 1001)
 WHERE id = '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c';
UPDATE public.race_distances SET bib_start = 2001, bib_end = 2500, next_bib = GREATEST(COALESCE(next_bib, 2001), 2001)
 WHERE id = '17dd386a-70d7-4a93-a0ac-fae53927daee';

-- Comprobación: la fila con 3 eventos y los tres rangos
SELECT s.event_id, s.enabled, s.numerar_por_carrera, jsonb_array_length(s.eventos) AS eventos,
       (SELECT string_agg(d.name || ' ' || d.bib_start || '-' || d.bib_end || ' (siguiente ' || d.next_bib || ')', '; ' ORDER BY d.display_order)
          FROM public.race_distances d WHERE d.race_id = s.race_id) AS dorsales
  FROM public.eventbooking_sync s WHERE s.race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c';
