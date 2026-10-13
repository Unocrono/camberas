-- ============================================================
-- FUERA LA IMPORTACIÓN DE GPS A LECTURAS DE CRONOMETRAJE (decisión del
-- dueño, 13-oct: «Borramos todas las funciones de importar de GPS»).
--
-- Convertía cada posición de gps_tracking que caía en la geocerca de un punto
-- de control en una lectura (timing_readings, reading_type 'gps_geofence').
-- Nunca llegó a generar ninguna: gps_tracking no la escribe nadie (las apps
-- guardan en gps_positions). Se quitan:
--   · los disparadores de gps_tracking que llamaban a la función edge
--     process-gps-geofence (tres nombres según la migración que los creó);
--   · su función trigger_process_gps_geofence();
--   · en el repo, la función edge, su entrada en config.toml y los botones
--     «Procesar GPS» y «Reimportar GPS» de Lecturas GPS y Lecturas Crono.
--
-- No se toca: gps_tracking ni gps_positions (el seguimiento en vivo sigue),
-- la columna geofence_radius de los puntos de control, ni el valor
-- 'gps_geofence' de reading_type (no hay lecturas con él).
--
-- La función edge ya desplegada hay que borrarla aparte (panel de Supabase →
-- Edge Functions → process-gps-geofence): quitarla del repo no la desmonta.
--
-- PENDIENTE DE APLICAR en producción (panel de Supabase).
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trigger_process_gps_geofence  ON public.gps_tracking;
DROP TRIGGER IF EXISTS gps_tracking_geofence_trigger ON public.gps_tracking;
DROP TRIGGER IF EXISTS on_gps_tracking_insert        ON public.gps_tracking;

-- Sin CASCADE: si quedara otro disparador colgado de ella, que falle y se vea
DROP FUNCTION IF EXISTS public.trigger_process_gps_geofence();

-- Comprobaciones: si algo falla, se deshace todo
DO $$
DECLARE malas text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE pronamespace = 'public'::regnamespace AND proname = 'trigger_process_gps_geofence') THEN
    RAISE EXCEPTION 'Sigue existiendo trigger_process_gps_geofence';
  END IF;

  SELECT string_agg(t.tgname, ', ') INTO malas
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.gps_tracking'::regclass
     AND NOT t.tgisinternal
     AND p.prosrc LIKE '%process-gps-geofence%';
  IF malas IS NOT NULL THEN
    RAISE EXCEPTION 'Quedan disparadores que llaman a process-gps-geofence: %', malas;
  END IF;

  -- Guardia de horas (CLAUDE.md): ningún FALLO
  SELECT string_agg(nombre || ' [' || left(regla, 2) || ']', ', ') INTO malas
    FROM public.guardia_horas() WHERE nivel = 'FALLO';
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Siguen convirtiendo horas: %', malas; END IF;
END $$;

COMMIT;
