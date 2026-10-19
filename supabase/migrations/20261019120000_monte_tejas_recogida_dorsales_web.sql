-- =============================================================================
-- II Trail Navideño Monte Tejas 2026: la web propia enseña la recogida de
-- dorsales del viernes 11 y el sábado 12 en la tienda KV de Torrelavega.
--
-- El 19-oct el organizador lo añadió al reglamento (sección Recogida de
-- dorsales), pero las tarjetas del día de carrera de la web no leen el
-- reglamento: salen de race_web.contenido (dorsales y programa), que se
-- rellenó el 29-sep con la recogida del domingo solo. Aquí se ponen al día
-- esos dos bloques. El reglamento no se toca.
--
-- Sentencias sueltas e idempotentes, sin bloques DO. APLICADA el 19-oct-2026.
-- =============================================================================

-- 1. Tarjeta Recogida de dorsales: lugar y horarios de los tres días
UPDATE public.race_web
   SET contenido = jsonb_set(contenido, '{dorsales}',
         coalesce(contenido->'dorsales', '{}'::jsonb) || jsonb_build_object(
           'lugar', 'Viernes y sábado en la tienda KV de Torrelavega (C/ Berta Perogordo 10). Domingo en la plaza del Ayuntamiento de San Felices de Buelna, en la zona de salida.',
           'horarios', jsonb_build_array(
             jsonb_build_array('Viernes 11 de diciembre · Tienda KV, Torrelavega', '10:00–13:00 y 17:00–20:00'),
             jsonb_build_array('Sábado 12 de diciembre · Tienda KV, Torrelavega', '10:00–13:00'),
             jsonb_build_array('Domingo 13 de diciembre · Plaza del Ayuntamiento', '08:30–10:00'))))
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND coalesce(contenido->'dorsales'->>'lugar', '') NOT LIKE '%tienda KV%';

-- 2. Programa y horarios: las tres franjas de recogida en la tienda KV, por
--    delante de lo que ya había (la web lo ordena por fecha y hora)
UPDATE public.race_web
   SET contenido = jsonb_set(contenido, '{programa}',
         jsonb_build_array(
           jsonb_build_object('fecha', '2026-12-11', 'hora', '10:00', 'horaFin', '13:00', 'titulo', 'Recogida de dorsales', 'lugar', 'Tienda KV, Torrelavega'),
           jsonb_build_object('fecha', '2026-12-11', 'hora', '17:00', 'horaFin', '20:00', 'titulo', 'Recogida de dorsales', 'lugar', 'Tienda KV, Torrelavega'),
           jsonb_build_object('fecha', '2026-12-12', 'hora', '10:00', 'horaFin', '13:00', 'titulo', 'Recogida de dorsales', 'lugar', 'Tienda KV, Torrelavega'))
         || coalesce(contenido->'programa', '[]'::jsonb))
 WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND NOT coalesce(contenido->'programa', '[]'::jsonb) @> '[{"lugar": "Tienda KV, Torrelavega"}]'::jsonb;

-- Comprobación: los dos bloques como quedan
SELECT jsonb_pretty(contenido->'dorsales') AS dorsales, jsonb_pretty(contenido->'programa') AS programa
  FROM public.race_web WHERE race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c';
