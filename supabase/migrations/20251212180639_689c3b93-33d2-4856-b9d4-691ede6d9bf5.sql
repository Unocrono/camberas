-- Añadir campos de tiempo a race_checkpoints para validación de lecturas
ALTER TABLE public.race_checkpoints
ADD COLUMN IF NOT EXISTS min_time interval DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_time interval DEFAULT NULL,
ADD COLUMN IF NOT EXISTS min_lap_time interval DEFAULT NULL,
ADD COLUMN IF NOT EXISTS expected_laps integer DEFAULT 1;

-- Comentarios explicativos
COMMENT ON COLUMN public.race_checkpoints.min_time IS 'Tiempo mínimo desde la salida para considerar una lectura válida';
COMMENT ON COLUMN public.race_checkpoints.max_time IS 'Tiempo máximo desde la salida para considerar una lectura válida (cutoff)';
COMMENT ON COLUMN public.race_checkpoints.min_lap_time IS 'Tiempo mínimo entre vueltas para circuitos con múltiples laps';
COMMENT ON COLUMN public.race_checkpoints.expected_laps IS 'Número de vueltas esperadas en este punto de control (1 = paso único)';

-- Función para calcular split_times desde timing_readings
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
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      rc.id as checkpoint_id,
      rc.name as checkpoint_name,
      rc.checkpoint_order,
      rc.timing_point_id,
      rc.distance_km,
      rc.min_time,
      rc.max_time,
      rc.min_lap_time,
      rc.expected_laps
    FROM race_checkpoints rc
    WHERE rc.race_distance_id = p_race_distance_id
      AND rc.timing_point_id IS NOT NULL
    ORDER BY rc.checkpoint_order
  ),
  -- Todas las lecturas válidas ordenadas por tiempo
  valid_readings AS (
    SELECT 
      tr.id as reading_id,
      tr.registration_id,
      tr.bib_number,
      tr.timing_point_id,
      tr.timing_timestamp,
      (tr.timing_timestamp - v_wave_start) as elapsed_time,
      cp.checkpoint_id,
      cp.checkpoint_name,
      cp.checkpoint_order,
      cp.min_time,
      cp.max_time,
      cp.min_lap_time,
      cp.expected_laps,
      ROW_NUMBER() OVER (
        PARTITION BY tr.registration_id, cp.checkpoint_id 
        ORDER BY tr.timing_timestamp ASC
      ) as reading_order
    FROM timing_readings tr
    JOIN registrations reg ON reg.id = tr.registration_id
    JOIN checkpoints cp ON cp.timing_point_id = tr.timing_point_id
    WHERE reg.race_distance_id = p_race_distance_id
      AND tr.status_code IS NULL -- Solo lecturas normales
      -- Filtrar por tiempo mínimo si está definido
      AND (cp.min_time IS NULL OR (tr.timing_timestamp - v_wave_start) >= cp.min_time)
      -- Filtrar por tiempo máximo si está definido
      AND (cp.max_time IS NULL OR (tr.timing_timestamp - v_wave_start) <= cp.max_time)
  ),
  -- Asignar número de vuelta basado en min_lap_time
  readings_with_laps AS (
    SELECT 
      vr.*,
      CASE 
        WHEN vr.expected_laps = 1 THEN 1
        WHEN vr.reading_order = 1 THEN 1
        WHEN vr.min_lap_time IS NULL THEN vr.reading_order::integer
        ELSE (
          -- Calcular lap basado en tiempo mínimo por vuelta
          LEAST(
            vr.reading_order::integer,
            vr.expected_laps
          )
        )
      END as calculated_lap
    FROM valid_readings vr
  ),
  -- Seleccionar la primera lectura válida por cada lap
  best_per_lap AS (
    SELECT DISTINCT ON (registration_id, checkpoint_id, calculated_lap)
      registration_id,
      bib_number,
      checkpoint_id,
      checkpoint_name,
      checkpoint_order,
      calculated_lap as lap_number,
      elapsed_time as split_time,
      reading_id as timing_reading_id
    FROM readings_with_laps
    WHERE calculated_lap <= expected_laps
    ORDER BY registration_id, checkpoint_id, calculated_lap, elapsed_time ASC
  )
  SELECT 
    bpl.registration_id,
    bpl.bib_number,
    bpl.checkpoint_id,
    bpl.checkpoint_name,
    bpl.checkpoint_order,
    bpl.lap_number,
    bpl.split_time,
    bpl.timing_reading_id
  FROM best_per_lap bpl
  ORDER BY bpl.bib_number, bpl.checkpoint_order, bpl.lap_number;
END;
$$;

-- Función para generar y guardar split_times
CREATE OR REPLACE FUNCTION public.generate_split_times(p_race_distance_id uuid)
RETURNS TABLE(
  inserted_count integer,
  updated_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated integer := 0;
  r record;
  v_race_result_id uuid;
BEGIN
  -- Procesar cada split calculado
  FOR r IN SELECT * FROM calculate_split_times(p_race_distance_id)
  LOOP
    -- Obtener o crear race_result
    SELECT id INTO v_race_result_id
    FROM race_results
    WHERE registration_id = r.registration_id;

    IF v_race_result_id IS NULL THEN
      INSERT INTO race_results (registration_id, race_distance_id, finish_time, status)
      VALUES (r.registration_id, p_race_distance_id, '00:00:00'::interval, 'STD')
      RETURNING id INTO v_race_result_id;
    END IF;

    -- Upsert split_time
    INSERT INTO split_times (
      race_result_id,
      checkpoint_name,
      checkpoint_order,
      distance_km,
      split_time,
      lap_number
    )
    SELECT 
      v_race_result_id,
      r.checkpoint_name,
      r.checkpoint_order,
      rc.distance_km,
      r.split_time,
      r.lap_number
    FROM race_checkpoints rc
    WHERE rc.id = r.checkpoint_id
    ON CONFLICT (race_result_id, checkpoint_order, lap_number) 
    DO UPDATE SET 
      split_time = EXCLUDED.split_time,
      updated_at = now()
    RETURNING (xmax = 0)::int INTO v_inserted;
    
    IF v_inserted = 1 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$;

-- Añadir constraint único para split_times (checkpoint + lap por resultado)
ALTER TABLE public.split_times
DROP CONSTRAINT IF EXISTS split_times_unique_checkpoint_lap;

ALTER TABLE public.split_times
ADD CONSTRAINT split_times_unique_checkpoint_lap 
UNIQUE (race_result_id, checkpoint_order, lap_number);