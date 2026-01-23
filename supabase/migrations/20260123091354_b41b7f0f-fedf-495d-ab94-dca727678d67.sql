-- Fix calculate_split_times to work with LOCAL TIME (no UTC conversion)
-- The key is to extract the time components directly without timezone interpretation
-- Since both start_time and timing_timestamp are stored as timestamptz but actually represent local time,
-- we need to treat them consistently

CREATE OR REPLACE FUNCTION public.calculate_split_times(p_race_distance_id uuid)
RETURNS TABLE(
  registration_id uuid, 
  bib_number integer, 
  checkpoint_id uuid, 
  checkpoint_name text, 
  checkpoint_order integer, 
  lap_number integer, 
  split_time interval, 
  timing_reading_id uuid
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_wave_start_raw text;
  v_race_id uuid;
BEGIN
  -- Obtener race_id del distance
  SELECT rd.race_id INTO v_race_id
  FROM race_distances rd
  WHERE rd.id = p_race_distance_id;

  -- Obtener hora de salida del wave como texto RAW (para evitar conversión UTC)
  -- Usamos to_char para extraer los componentes sin interpretación de zona horaria
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
  -- Checkpoints del evento con sus timing_points
  checkpoints AS (
    SELECT 
      rc.id as cp_id,
      rc.name as cp_name,
      rc.checkpoint_order as cp_order,
      rc.timing_point_id as cp_timing_point_id,
      rc.distance_km as cp_distance_km,
      rc.min_time as cp_min_time,
      rc.max_time as cp_max_time,
      rc.checkpoint_type as cp_type
    FROM race_checkpoints rc
    WHERE rc.race_distance_id = p_race_distance_id
      AND rc.timing_point_id IS NOT NULL
    ORDER BY rc.checkpoint_order
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
  -- Convert timing_readings timestamps to local (strip timezone)
  timing_local AS (
    SELECT 
      tr.id as tr_id,
      tr.bib_number as tr_bib,
      tr.timing_point_id as tr_tp_id,
      tr.status_code as tr_status,
      tr.race_id as tr_race_id,
      -- Extract timestamp as local time (strip the +00 suffix, treat as local)
      (tr.timing_timestamp AT TIME ZONE 'UTC')::timestamp without time zone as tr_local_ts
    FROM timing_readings tr
    WHERE tr.race_id = v_race_id
  ),
  -- Para checkpoints START: incluir lecturas antes de la salida (se asignará 00:00:00)
  start_readings AS (
    SELECT 
      tl.tr_id as tr_reading_id,
      er.reg_id as tr_reg_id,
      tl.tr_bib as tr_bib,
      cp.cp_id,
      cp.cp_name,
      cp.cp_order,
      -- Si la lectura es antes del wave_start, asignar 00:00:00
      CASE 
        WHEN tl.tr_local_ts <= (SELECT wave_start_local FROM wave_local) THEN '00:00:00'::interval
        ELSE (tl.tr_local_ts - (SELECT wave_start_local FROM wave_local))
      END as tr_elapsed_time,
      ROW_NUMBER() OVER (
        PARTITION BY er.reg_id, cp.cp_id 
        ORDER BY tl.tr_local_ts ASC
      ) as tr_reading_order
    FROM timing_local tl
    JOIN event_registrations er ON er.reg_bib = tl.tr_bib
    JOIN checkpoints cp ON cp.cp_timing_point_id = tl.tr_tp_id
    WHERE tl.tr_status IS NULL
      AND cp.cp_type = 'START'
      -- Para START: aceptar cualquier lectura (antes o después)
  ),
  -- Para otros checkpoints: mantener la lógica original (solo después del wave_start)
  other_readings AS (
    SELECT 
      tl.tr_id as tr_reading_id,
      er.reg_id as tr_reg_id,
      tl.tr_bib as tr_bib,
      cp.cp_id,
      cp.cp_name,
      cp.cp_order,
      (tl.tr_local_ts - (SELECT wave_start_local FROM wave_local)) as tr_elapsed_time,
      ROW_NUMBER() OVER (
        PARTITION BY er.reg_id, cp.cp_id 
        ORDER BY tl.tr_local_ts ASC
      ) as tr_reading_order
    FROM timing_local tl
    JOIN event_registrations er ON er.reg_bib = tl.tr_bib
    JOIN checkpoints cp ON cp.cp_timing_point_id = tl.tr_tp_id
    WHERE tl.tr_status IS NULL
      AND cp.cp_type != 'START'
      -- CRITICAL: Only include readings AFTER the wave start (positive elapsed time)
      AND tl.tr_local_ts > (SELECT wave_start_local FROM wave_local)
      -- Filter by checkpoint time range
      AND (cp.cp_min_time IS NULL OR (tl.tr_local_ts - (SELECT wave_start_local FROM wave_local)) >= cp.cp_min_time)
      AND (cp.cp_max_time IS NULL OR (tl.tr_local_ts - (SELECT wave_start_local FROM wave_local)) <= cp.cp_max_time)
  ),
  -- Unir ambos tipos de lecturas
  all_valid_readings AS (
    SELECT * FROM start_readings
    UNION ALL
    SELECT * FROM other_readings
  ),
  -- Seleccionar solo la primera lectura válida por checkpoint
  best_reading AS (
    SELECT DISTINCT ON (vr.tr_reg_id, vr.cp_id)
      vr.tr_reg_id,
      vr.tr_bib,
      vr.cp_id,
      vr.cp_name,
      vr.cp_order,
      vr.tr_elapsed_time,
      vr.tr_reading_id
    FROM all_valid_readings vr
    WHERE vr.tr_reading_order = 1
    ORDER BY vr.tr_reg_id, vr.cp_id, vr.tr_elapsed_time ASC
  )
  SELECT 
    br.tr_reg_id as registration_id,
    br.tr_bib as bib_number,
    br.cp_id as checkpoint_id,
    br.cp_name as checkpoint_name,
    br.cp_order as checkpoint_order,
    1 as lap_number,
    br.tr_elapsed_time as split_time,
    br.tr_reading_id as timing_reading_id
  FROM best_reading br
  ORDER BY br.tr_bib, br.cp_order;
END;
$function$;

-- Add comment explaining the local time approach
COMMENT ON FUNCTION public.calculate_split_times(uuid) IS 
'Calculates split times by treating all timestamps as local time (stripping timezone). 
Both wave start_time and timing_readings.timing_timestamp are treated as local time 
to avoid UTC conversion issues. This matches the app architecture where all times 
are stored and displayed as local time.';