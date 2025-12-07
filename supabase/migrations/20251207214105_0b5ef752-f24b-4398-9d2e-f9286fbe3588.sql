-- 1. Actualizar race_distance_id en race_results existentes basándose en registrations
UPDATE race_results rr
SET race_distance_id = r.race_distance_id
FROM registrations r
WHERE rr.registration_id = r.id
  AND rr.race_distance_id IS NULL;

-- 2. Hacer race_distance_id NOT NULL (ahora que todos tienen valor)
ALTER TABLE race_results 
ALTER COLUMN race_distance_id SET NOT NULL;

-- 3. Crear función para calcular resultados desde timing_readings
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
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Obtener la hora de salida del evento (wave)
  wave_start AS (
    SELECT rw.start_time
    FROM race_waves rw
    WHERE rw.race_distance_id = p_race_distance_id
    LIMIT 1
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
  -- Obtener la mejor lectura por registro y checkpoint (primera lectura válida)
  best_readings AS (
    SELECT DISTINCT ON (tr.registration_id, cp.checkpoint_id)
      tr.registration_id,
      tr.bib_number,
      cp.checkpoint_id,
      cp.checkpoint_name,
      cp.checkpoint_type,
      cp.priority,
      tr.timing_timestamp,
      (tr.timing_timestamp - ws.start_time) as elapsed_time
    FROM timing_readings tr
    JOIN registrations reg ON reg.id = tr.registration_id
    JOIN checkpoints cp ON cp.timing_point_id = tr.timing_point_id
    CROSS JOIN wave_start ws
    WHERE reg.race_distance_id = p_race_distance_id
      AND tr.status_code IS NULL -- Solo lecturas normales, no estados
      AND ws.start_time IS NOT NULL
    ORDER BY tr.registration_id, cp.checkpoint_id, tr.timing_timestamp ASC
  ),
  -- Obtener el mejor resultado por participante (checkpoint con mayor prioridad = más cercano a meta)
  best_result AS (
    SELECT DISTINCT ON (br.registration_id)
      br.registration_id,
      br.bib_number,
      br.elapsed_time as finish_time,
      br.checkpoint_id as finish_checkpoint_id,
      br.checkpoint_name as finish_checkpoint_name
    FROM best_readings br
    ORDER BY br.registration_id, br.priority ASC
  )
  SELECT 
    br.registration_id,
    br.bib_number,
    br.finish_time,
    br.finish_checkpoint_id,
    br.finish_checkpoint_name
  FROM best_result br
  ORDER BY br.finish_time ASC NULLS LAST;
END;
$$;

-- 4. Crear función para procesar y guardar resultados de un evento
CREATE OR REPLACE FUNCTION public.process_event_results(p_race_distance_id uuid)
RETURNS TABLE(
  processed_count integer,
  finished_count integer,
  in_progress_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_race_id uuid;
  v_processed integer := 0;
  v_finished integer := 0;
  v_in_progress integer := 0;
  r record;
  v_finish_checkpoint_id uuid;
BEGIN
  -- Obtener race_id del evento
  SELECT rd.race_id INTO v_race_id
  FROM race_distances rd
  WHERE rd.id = p_race_distance_id;

  -- Obtener checkpoint de META
  SELECT rc.id INTO v_finish_checkpoint_id
  FROM race_checkpoints rc
  WHERE rc.race_distance_id = p_race_distance_id
    AND rc.checkpoint_type = 'FINISH'
  LIMIT 1;

  -- Procesar cada resultado calculado
  FOR r IN SELECT * FROM calculate_race_results(p_race_distance_id)
  LOOP
    -- Determinar status basado en si llegó a meta
    DECLARE
      v_status text;
    BEGIN
      IF r.finish_checkpoint_id = v_finish_checkpoint_id THEN
        v_status := 'FIN';
        v_finished := v_finished + 1;
      ELSE
        v_status := 'STD'; -- En carrera (no llegó a meta)
        v_in_progress := v_in_progress + 1;
      END IF;

      -- Upsert del resultado
      INSERT INTO race_results (registration_id, race_distance_id, finish_time, status)
      VALUES (r.registration_id, p_race_distance_id, r.finish_time, v_status)
      ON CONFLICT (registration_id) 
      DO UPDATE SET 
        finish_time = EXCLUDED.finish_time,
        status = EXCLUDED.status,
        race_distance_id = EXCLUDED.race_distance_id,
        updated_at = now();

      v_processed := v_processed + 1;
    END;
  END LOOP;

  -- Calcular posiciones para los que terminaron (status = 'FIN')
  WITH ranked AS (
    SELECT 
      rr.id,
      ROW_NUMBER() OVER (ORDER BY rr.finish_time ASC) as overall_pos
    FROM race_results rr
    WHERE rr.race_distance_id = p_race_distance_id
      AND rr.status = 'FIN'
  )
  UPDATE race_results rr
  SET overall_position = ranked.overall_pos
  FROM ranked
  WHERE rr.id = ranked.id;

  -- Calcular posiciones por género
  WITH ranked_gender AS (
    SELECT 
      rr.id,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(p.gender, 'Unknown')
        ORDER BY rr.finish_time ASC
      ) as gender_pos
    FROM race_results rr
    JOIN registrations reg ON reg.id = rr.registration_id
    LEFT JOIN profiles p ON p.id = reg.user_id
    WHERE rr.race_distance_id = p_race_distance_id
      AND rr.status = 'FIN'
  )
  UPDATE race_results rr
  SET gender_position = ranked_gender.gender_pos
  FROM ranked_gender
  WHERE rr.id = ranked_gender.id;

  RETURN QUERY SELECT v_processed, v_finished, v_in_progress;
END;
$$;

-- 5. Añadir índices para optimizar las consultas
CREATE INDEX IF NOT EXISTS idx_timing_readings_timing_point 
ON timing_readings(timing_point_id, timing_timestamp);

CREATE INDEX IF NOT EXISTS idx_race_results_distance_status 
ON race_results(race_distance_id, status, finish_time);

CREATE INDEX IF NOT EXISTS idx_race_checkpoints_distance_type 
ON race_checkpoints(race_distance_id, checkpoint_type);