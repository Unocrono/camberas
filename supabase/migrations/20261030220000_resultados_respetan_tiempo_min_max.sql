-- ============================================================
-- EL TIEMPO FINAL RESPETA EL TIEMPO MÍNIMO Y MÁXIMO DEL CONTROL.
-- Entre Viñedos, 30-oct: Meta de Carrera con mínimo 00:35:00 y máximo
-- 02:00:00, y «Procesar Tiempos y Resultados» seguía dando la primera
-- lectura de Meta, aunque fuese de antes de la salida.
--
-- calculate_split_times (los parciales) ya filtraba: para los controles que
-- no son de salida, solo lecturas después de la salida de la ola y dentro de
-- [min_time, max_time]. calculate_race_results (el tiempo final y el control
-- más avanzado de cada corredor) no filtraba nada. Ahora aplica la misma
-- regla; la salida (START) sigue aceptando cualquier lectura, como antes.
--
-- Horas: la salida se lee tal cual (to_char ... AT TIME ZONE 'UTC') y las
-- lecturas igual: hora de pared contra hora de pared (norma de CLAUDE.md).
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.calculate_race_results(p_race_distance_id uuid)
 RETURNS TABLE(registration_id uuid, bib_number integer, finish_time interval, finish_checkpoint_id uuid, finish_checkpoint_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_race_id uuid;
  v_wave_start_raw text;
BEGIN
  SELECT rd.race_id INTO v_race_id
  FROM race_distances rd
  WHERE rd.id = p_race_distance_id;

  -- Hora de salida de la ola tal cual (hora de pared)
  SELECT to_char(rw.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
  INTO v_wave_start_raw
  FROM race_waves rw
  WHERE rw.race_distance_id = p_race_distance_id
  LIMIT 1;

  IF v_wave_start_raw IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  wave_local AS (
    SELECT v_wave_start_raw::timestamp without time zone as wave_start_local
  ),
  event_registrations AS (
    SELECT
      reg.id as reg_id,
      reg.bib_number as reg_bib
    FROM registrations reg
    WHERE reg.race_distance_id = p_race_distance_id
      AND reg.bib_number IS NOT NULL
  ),
  -- Controles del evento, meta primero (más km = más prioridad)
  checkpoints AS (
    SELECT
      rc.id as checkpoint_id,
      rc.name as checkpoint_name,
      rc.checkpoint_type,
      rc.timing_point_id,
      rc.distance_km,
      rc.min_time,
      rc.max_time,
      ROW_NUMBER() OVER (ORDER BY rc.distance_km DESC) as priority
    FROM race_checkpoints rc
    WHERE rc.race_distance_id = p_race_distance_id
      AND rc.timing_point_id IS NOT NULL
  ),
  timing_local AS (
    SELECT
      tr.id as tr_id,
      tr.bib_number as tr_bib,
      tr.timing_point_id as tr_tp_id,
      tr.status_code as tr_status,
      (tr.timing_timestamp AT TIME ZONE 'UTC')::timestamp without time zone as tr_local_ts
    FROM timing_readings tr
    WHERE tr.race_id = v_race_id
  ),
  -- Primera lectura válida por corredor y control. Fuera de la salida, como
  -- en calculate_split_times: después de la salida y dentro de min/max.
  best_readings AS (
    SELECT DISTINCT ON (er.reg_id, cp.checkpoint_id)
      er.reg_id,
      er.reg_bib as bib,
      cp.checkpoint_id as cp_id,
      cp.checkpoint_name as cp_name,
      cp.checkpoint_type as cp_type,
      cp.priority as cp_priority,
      tl.tr_local_ts,
      (tl.tr_local_ts - wl.wave_start_local) as elapsed_time
    FROM timing_local tl
    JOIN event_registrations er ON er.reg_bib = tl.tr_bib
    JOIN checkpoints cp ON cp.timing_point_id = tl.tr_tp_id
    CROSS JOIN wave_local wl
    WHERE tl.tr_status IS NULL
      AND (
        cp.checkpoint_type = 'START'
        OR (
          tl.tr_local_ts > wl.wave_start_local
          AND (cp.min_time IS NULL OR (tl.tr_local_ts - wl.wave_start_local) >= cp.min_time)
          AND (cp.max_time IS NULL OR (tl.tr_local_ts - wl.wave_start_local) <= cp.max_time)
        )
      )
    ORDER BY er.reg_id, cp.checkpoint_id, tl.tr_local_ts ASC
  ),
  -- El control más avanzado de cada corredor
  best_result AS (
    SELECT DISTINCT ON (br.reg_id)
      br.reg_id,
      br.bib,
      br.elapsed_time as finish_time,
      br.cp_id as finish_checkpoint_id,
      br.cp_name as finish_checkpoint_name
    FROM best_readings br
    ORDER BY br.reg_id, br.cp_priority ASC
  )
  SELECT
    br.reg_id as registration_id,
    br.bib as bib_number,
    br.finish_time,
    br.finish_checkpoint_id,
    br.finish_checkpoint_name
  FROM best_result br
  ORDER BY br.finish_time ASC NULLS LAST;
END;
$function$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

COMMIT;
