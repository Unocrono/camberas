-- Fix calculate_race_results to work with LOCAL TIME (no UTC conversion)
-- Apply the same approach as calculate_split_times: treat all timestamps as local time

CREATE OR REPLACE FUNCTION public.calculate_race_results(p_race_distance_id uuid)
RETURNS TABLE(
  registration_id uuid, 
  bib_number integer, 
  finish_time interval, 
  finish_checkpoint_id uuid, 
  finish_checkpoint_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_race_id uuid;
  v_wave_start_raw text;
BEGIN
  -- Obtener race_id del distance
  SELECT rd.race_id INTO v_race_id
  FROM race_distances rd
  WHERE rd.id = p_race_distance_id;

  -- Obtener hora de salida del wave como texto RAW (para evitar conversión UTC)
  SELECT to_char(rw.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') 
  INTO v_wave_start_raw
  FROM race_waves rw
  WHERE rw.race_distance_id = p_race_distance_id
  LIMIT 1;

  -- Si no hay hora de salida, no podemos calcular
  IF v_wave_start_raw IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH 
  -- Parse wave start time as local timestamp (no timezone)
  wave_local AS (
    SELECT v_wave_start_raw::timestamp without time zone as wave_start_local
  ),
  -- Inscripciones del evento
  event_registrations AS (
    SELECT 
      reg.id as reg_id,
      reg.bib_number as reg_bib
    FROM registrations reg
    WHERE reg.race_distance_id = p_race_distance_id
      AND reg.bib_number IS NOT NULL
  ),
  -- Obtener checkpoints del evento ordenados por distance_km DESC (meta primero)
  checkpoints AS (
    SELECT 
      rc.id as checkpoint_id,
      rc.name as checkpoint_name,
      rc.checkpoint_type,
      rc.timing_point_id,
      rc.distance_km,
      ROW_NUMBER() OVER (ORDER BY rc.distance_km DESC) as priority
    FROM race_checkpoints rc
    WHERE rc.race_distance_id = p_race_distance_id
      AND rc.timing_point_id IS NOT NULL
  ),
  -- Convert timing_readings timestamps to local (strip timezone)
  timing_local AS (
    SELECT 
      tr.id as tr_id,
      tr.bib_number as tr_bib,
      tr.timing_point_id as tr_tp_id,
      tr.status_code as tr_status,
      -- Extract timestamp as local time (strip the +00 suffix, treat as local)
      (tr.timing_timestamp AT TIME ZONE 'UTC')::timestamp without time zone as tr_local_ts
    FROM timing_readings tr
    WHERE tr.race_id = v_race_id
  ),
  -- Obtener la mejor lectura por registro y checkpoint (primera lectura válida)
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
    ORDER BY er.reg_id, cp.checkpoint_id, tl.tr_local_ts ASC
  ),
  -- Obtener el mejor resultado por participante (checkpoint con mayor prioridad = más cercano a meta)
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

-- Add comment explaining the local time approach
COMMENT ON FUNCTION public.calculate_race_results(uuid) IS 
'Calculates race results by treating all timestamps as local time (stripping timezone). 
Both wave start_time and timing_readings.timing_timestamp are treated as local time 
to avoid UTC conversion issues. This matches the app architecture where all times 
are stored and displayed as local time.';