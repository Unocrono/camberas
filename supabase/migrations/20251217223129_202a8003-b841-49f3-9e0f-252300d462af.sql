-- 1. Eliminar el CHECK constraint obsoleto (los valores se validan con el FK a race_results_status)
ALTER TABLE race_results DROP CONSTRAINT IF EXISTS race_results_status_check;

-- 2. Corregir calculate_split_times - calificar todas las columnas
CREATE OR REPLACE FUNCTION public.calculate_split_times(p_race_distance_id uuid)
 RETURNS TABLE(registration_id uuid, bib_number integer, checkpoint_id uuid, checkpoint_name text, checkpoint_order integer, lap_number integer, split_time interval, timing_reading_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wave_start timestamptz;
BEGIN
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
      rc.max_time as cp_max_time,
      rc.min_lap_time as cp_min_lap_time,
      rc.expected_laps as cp_expected_laps
    FROM race_checkpoints rc
    WHERE rc.race_distance_id = p_race_distance_id
      AND rc.timing_point_id IS NOT NULL
    ORDER BY rc.checkpoint_order
  ),
  -- Todas las lecturas válidas ordenadas por tiempo
  valid_readings AS (
    SELECT 
      tr.id as tr_reading_id,
      tr.registration_id as tr_reg_id,
      tr.bib_number as tr_bib,
      tr.timing_point_id as tr_timing_point_id,
      tr.timing_timestamp as tr_timestamp,
      (tr.timing_timestamp - v_wave_start) as tr_elapsed_time,
      cp.cp_id,
      cp.cp_name,
      cp.cp_order,
      cp.cp_min_time,
      cp.cp_max_time,
      cp.cp_min_lap_time,
      cp.cp_expected_laps,
      ROW_NUMBER() OVER (
        PARTITION BY tr.registration_id, cp.cp_id 
        ORDER BY tr.timing_timestamp ASC
      ) as tr_reading_order
    FROM timing_readings tr
    JOIN registrations reg ON reg.id = tr.registration_id
    JOIN checkpoints cp ON cp.cp_timing_point_id = tr.timing_point_id
    WHERE reg.race_distance_id = p_race_distance_id
      AND tr.status_code IS NULL
      AND (cp.cp_min_time IS NULL OR (tr.timing_timestamp - v_wave_start) >= cp.cp_min_time)
      AND (cp.cp_max_time IS NULL OR (tr.timing_timestamp - v_wave_start) <= cp.cp_max_time)
  ),
  -- Asignar número de vuelta basado en min_lap_time
  readings_with_laps AS (
    SELECT 
      vr.tr_reading_id,
      vr.tr_reg_id,
      vr.tr_bib,
      vr.tr_elapsed_time,
      vr.cp_id,
      vr.cp_name,
      vr.cp_order,
      vr.cp_expected_laps,
      vr.tr_reading_order,
      CASE 
        WHEN vr.cp_expected_laps = 1 THEN 1
        WHEN vr.tr_reading_order = 1 THEN 1
        WHEN vr.cp_min_lap_time IS NULL THEN vr.tr_reading_order::integer
        ELSE LEAST(vr.tr_reading_order::integer, vr.cp_expected_laps)
      END as calculated_lap
    FROM valid_readings vr
  ),
  -- Seleccionar la primera lectura válida por cada lap
  best_per_lap AS (
    SELECT DISTINCT ON (rwl.tr_reg_id, rwl.cp_id, rwl.calculated_lap)
      rwl.tr_reg_id,
      rwl.tr_bib,
      rwl.cp_id,
      rwl.cp_name,
      rwl.cp_order,
      rwl.calculated_lap,
      rwl.tr_elapsed_time,
      rwl.tr_reading_id
    FROM readings_with_laps rwl
    WHERE rwl.calculated_lap <= rwl.cp_expected_laps
    ORDER BY rwl.tr_reg_id, rwl.cp_id, rwl.calculated_lap, rwl.tr_elapsed_time ASC
  )
  SELECT 
    bpl.tr_reg_id as registration_id,
    bpl.tr_bib as bib_number,
    bpl.cp_id as checkpoint_id,
    bpl.cp_name as checkpoint_name,
    bpl.cp_order as checkpoint_order,
    bpl.calculated_lap as lap_number,
    bpl.tr_elapsed_time as split_time,
    bpl.tr_reading_id as timing_reading_id
  FROM best_per_lap bpl
  ORDER BY bpl.tr_bib, bpl.cp_order, bpl.calculated_lap;
END;
$function$;