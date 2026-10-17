-- =============================================================================
-- Dorsal simulado por RECORRIDO (17-oct-2026)
--
-- La plantilla del dorsal se sube en Recorridos › Dorsales, con su vista previa
-- (DorsalSimuladoEditor). Cada recorrido guarda la suya en
-- race_distances.dorsal_simulado, con el mismo formato que
-- races.dorsal_simulado (20261017180000), que queda como respaldo para la
-- carrera entera. La edge function dorsal-imagen usa la del recorrido y, si no
-- tiene, la de la carrera.
--
-- Entre Viñedos 2026: su configuración pasa a sus tres recorridos (mismo
-- diseño en carrera, marcha e infantil), para que se vea y se edite desde el
-- panel. La de la carrera se queda como estaba.
--
-- duplicar_carrera copia la fila entera del recorrido: la edición siguiente
-- nace con la plantilla anterior, que el organizador cambia en el panel.
--
-- Solo una columna y datos: no toca funciones ni permisos. Idempotente.
-- =============================================================================

ALTER TABLE public.race_distances ADD COLUMN IF NOT EXISTS dorsal_simulado jsonb;

COMMENT ON COLUMN public.race_distances.dorsal_simulado IS
  'Dorsal simulado del recorrido para los correos (edge function dorsal-imagen), se edita en Recorridos › Dorsales: {fondo, fuente?, texto: nombre|nick|ninguno, numero:{centroX,arriba,alto,ensanche,anchoMax,color}, nombre:{…}}. NULL: la de la carrera (races.dorsal_simulado) o la tarjeta verde.';

UPDATE public.race_distances d
   SET dorsal_simulado = r.dorsal_simulado - 'recorridos'
  FROM public.races r
 WHERE r.id = d.race_id
   AND r.id = '1789e37c-0329-4cf1-ace7-32419c12db6c'
   AND r.dorsal_simulado IS NOT NULL
   AND d.dorsal_simulado IS NULL;

-- Comprobación: los tres recorridos de Entre Viñedos con su plantilla
SELECT name, dorsal_simulado->>'fondo' AS plantilla, dorsal_simulado->>'texto' AS texto
  FROM public.race_distances
 WHERE race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c'
 ORDER BY display_order;
