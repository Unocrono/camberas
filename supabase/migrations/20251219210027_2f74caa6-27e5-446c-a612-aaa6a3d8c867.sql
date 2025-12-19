
-- Fix calculate_split_times to:
-- 1. Filter out negative times (readings BEFORE wave start)
-- 2. Handle circuit laps correctly - checkpoints with same timing_point but different time windows

CREATE OR REPLACE FUNCTION public.calculate_split_times(p_race_distance_id uuid)
 RETURNS TABLE(registration_id uuid, bib_number integer, checkpoint_id uuid, checkpoint_name text, checkpoint_order integer, lap_number integer, split_time interval, timing_reading_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wave_start timestamptz;
  v_race_id uuid;
BEGIN
  -- Obtener race_id del distance
  SELECT rd.race_id INTO v_race_id
  FROM race_distances rd
  WHERE rd.id = p_race_distance_id;

  -- Obtener hora de salida del wave
  SELECT rw.start_time INTO v_wave_start
  FROM race_waves rw
  WHERE rw.race_distance_id = p_race_distance_id
  LIMIT 1;

  -- Si no hay hora de salida, no podemos calcular
  IF v_wave_start IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH 
  -- Checkpoints del evento con sus timing_points
  checkpoints AS (
    SELECT 
      rc.id as cp_id,
      rc.name as cp_name,
      rc.checkpoint_order as cp_order,
      rc.timing_point_id as cp_timing_point_id,
      rc.distance_km as cp_distance_km,
      rc.min_time as cp_min_time,
      rc.max_time as cp_max_time
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
  -- Todas las lecturas válidas filtradas por:
  -- 1. Tiempo positivo (después de la salida)
  -- 2. min_time/max_time de cada checkpoint
  valid_readings AS (
    SELECT 
      tr.id as tr_reading_id,
      er.reg_id as tr_reg_id,
      tr.bib_number as tr_bib,
      cp.cp_id,
      cp.cp_name,
      cp.cp_order,
      (tr.timing_timestamp - v_wave_start) as tr_elapsed_time,
      ROW_NUMBER() OVER (
        PARTITION BY er.reg_id, cp.cp_id 
        ORDER BY tr.timing_timestamp ASC
      ) as tr_reading_order
    FROM timing_readings tr
    JOIN event_registrations er ON er.reg_bib = tr.bib_number
    JOIN checkpoints cp ON cp.cp_timing_point_id = tr.timing_point_id
    WHERE tr.race_id = v_race_id
      AND tr.status_code IS NULL
      -- CRITICAL: Only include readings AFTER the wave start (positive elapsed time)
      AND tr.timing_timestamp > v_wave_start
      -- Filter by checkpoint time range
      AND (cp.cp_min_time IS NULL OR (tr.timing_timestamp - v_wave_start) >= cp.cp_min_time)
      AND (cp.cp_max_time IS NULL OR (tr.timing_timestamp - v_wave_start) <= cp.cp_max_time)
  ),
  -- Seleccionar solo la primera lectura válida por checkpoint (la más temprana dentro del rango)
  best_reading AS (
    SELECT DISTINCT ON (vr.tr_reg_id, vr.cp_id)
      vr.tr_reg_id,
      vr.tr_bib,
      vr.cp_id,
      vr.cp_name,
      vr.cp_order,
      vr.tr_elapsed_time,
      vr.tr_reading_id
    FROM valid_readings vr
    WHERE vr.tr_reading_order = 1
    ORDER BY vr.tr_reg_id, vr.cp_id, vr.tr_elapsed_time ASC
  )
  SELECT 
    br.tr_reg_id as registration_id,
    br.tr_bib as bib_number,
    br.cp_id as checkpoint_id,
    br.cp_name as checkpoint_name,
    br.cp_order as checkpoint_order,
    1 as lap_number, -- Each checkpoint is unique, lap handled via different checkpoints
    br.tr_elapsed_time as split_time,
    br.tr_reading_id as timing_reading_id
  FROM best_reading br
  ORDER BY br.tr_bib, br.cp_order;
END;
$function$;
