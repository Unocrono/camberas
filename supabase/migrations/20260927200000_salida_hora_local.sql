-- ============================================================
-- LA HORA DE SALIDA ES HORA LOCAL (27-sep, tras la marcha ADEMCO)
--
-- race_waves.start_time guarda la hora de pared tal cual la escribe el
-- organizador, sin zona: "09:30" llega a la base como 09:30+00. Así la
-- escriben todos los formularios (DistanceManagement, WavesManagement,
-- RaceWizard, el control de salida useStartControlSync) y así la lee el
-- cronometraje (TimingApp.tsx: "es hora local, llega con +00, pero no es UTC").
--
-- gps_capture_window era la única pieza que la trataba como UTC y la pasaba
-- a hora de España: la salida de las 09:30 de ADEMCO se convertía en las
-- 11:30, y la ventana de captura cerraba 2 h tarde en verano (1 h en
-- invierno). Consecuencia: la parada automática de la app llegaba 2 h
-- después del corte y los móviles seguían enviando.
--
-- Arreglo: leer la hora de la ola AT TIME ZONE 'UTC' (la hora tal como se
-- guardó). El resto de la función es idéntico a 20260927180000.
-- Medido antes de aplicar: cambian las 28 ventanas con hora de salida (todas
-- las que tienen ola con hora), ninguna estaba abierta y ninguna cambia de
-- abierta a cerrada en el momento de aplicar. La primera carrera afectada es
-- la II Peña Prieta Skyrace del 03/10.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;

CREATE OR REPLACE FUNCTION public.gps_capture_window(p_distance_id text,
  OUT t_ini timestamptz, OUT t_fin timestamptz)
RETURNS record
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT
    CASE WHEN r.slug LIKE 'demo-%' THEN '-infinity'::timestamptz
      ELSE COALESCE(s.salida,
             (r.date::text || ' 00:00')::timestamp AT TIME ZONE 'Europe/Madrid')
           - interval '24 hours' END,
    CASE WHEN r.slug LIKE 'demo-%' THEN 'infinity'::timestamptz
      WHEN s.salida IS NOT NULL THEN
        s.salida + gps_cutoff_interval(d.cutoff_time, r.group_type) + interval '2 hours'
      ELSE
        (r.date::text || ' 23:59')::timestamp AT TIME ZONE 'Europe/Madrid' + interval '2 hours'
    END
  FROM race_distances d
  JOIN races r ON r.id = d.race_id
  LEFT JOIN race_waves w ON w.race_distance_id = d.id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN w.start_time IS NULL THEN NULL
      -- La hora de la ola es hora de pared guardada sin zona (llega +00):
      -- se lee tal cual (UTC) y se sitúa en Madrid el día de la carrera
      ELSE (r.date::text || ' ' ||
            to_char(w.start_time AT TIME ZONE 'UTC', 'HH24:MI')
           )::timestamp AT TIME ZONE 'Europe/Madrid'
    END AS salida
  ) s
  WHERE d.id = CASE
      WHEN p_distance_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN p_distance_id::uuid
    END
$function$;

COMMIT;
