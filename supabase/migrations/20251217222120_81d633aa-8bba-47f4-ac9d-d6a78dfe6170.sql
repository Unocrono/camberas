-- Corregir función calculate_race_results - asegurar que todas las columnas estén calificadas
CREATE OR REPLACE FUNCTION public.calculate_race_results(p_race_distance_id uuid)
 RETURNS TABLE(registration_id uuid, bib_number integer, finish_time interval, finish_checkpoint_id uuid, finish_checkpoint_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      tr.registration_id as reg_id,
      tr.bib_number as bib,
      cp.checkpoint_id as cp_id,
      cp.checkpoint_name as cp_name,
      cp.checkpoint_type as cp_type,
      cp.priority as cp_priority,
      tr.timing_timestamp,
      (tr.timing_timestamp - ws.start_time) as elapsed_time
    FROM timing_readings tr
    JOIN registrations reg ON reg.id = tr.registration_id
    JOIN checkpoints cp ON cp.timing_point_id = tr.timing_point_id
    CROSS JOIN wave_start ws
    WHERE reg.race_distance_id = p_race_distance_id
      AND tr.status_code IS NULL
      AND ws.start_time IS NOT NULL
    ORDER BY tr.registration_id, cp.checkpoint_id, tr.timing_timestamp ASC
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

-- Corregir función process_event_results - calificar todas las referencias
CREATE OR REPLACE FUNCTION public.process_event_results(p_race_distance_id uuid)
 RETURNS TABLE(processed_count integer, finished_count integer, in_progress_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_race_id uuid;
  v_race_date date;
  v_processed integer := 0;
  v_finished integer := 0;
  v_in_progress integer := 0;
  r record;
  v_finish_checkpoint_id uuid;
BEGIN
  -- Obtener race_id y fecha de la carrera
  SELECT rd.race_id, races.date INTO v_race_id, v_race_date
  FROM race_distances rd
  JOIN races ON races.id = rd.race_id
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
    DECLARE
      v_status text;
    BEGIN
      IF r.finish_checkpoint_id = v_finish_checkpoint_id THEN
        v_status := 'FIN';
        v_finished := v_finished + 1;
      ELSE
        v_status := 'STD';
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

  -- 1. Calcular posiciones GENERALES para los que terminaron (status = 'FIN')
  WITH ranked_overall AS (
    SELECT 
      rr.id as result_id,
      ROW_NUMBER() OVER (ORDER BY rr.finish_time ASC) as overall_pos
    FROM race_results rr
    WHERE rr.race_distance_id = p_race_distance_id
      AND rr.status = 'FIN'
  )
  UPDATE race_results
  SET overall_position = ro.overall_pos
  FROM ranked_overall ro
  WHERE race_results.id = ro.result_id;

  -- 2. Calcular posiciones por GÉNERO
  WITH ranked_gender AS (
    SELECT 
      rr.id as result_id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          CASE 
            WHEN COALESCE(p.gender, '') IN ('Masculino', 'M', 'Male') THEN 'M'
            WHEN COALESCE(p.gender, '') IN ('Femenino', 'F', 'Female') THEN 'F'
            ELSE 'X'
          END
        ORDER BY rr.finish_time ASC
      ) as gender_pos
    FROM race_results rr
    JOIN registrations reg ON reg.id = rr.registration_id
    LEFT JOIN profiles p ON p.id = reg.user_id
    WHERE rr.race_distance_id = p_race_distance_id
      AND rr.status = 'FIN'
  )
  UPDATE race_results
  SET gender_position = rg.gender_pos
  FROM ranked_gender rg
  WHERE race_results.id = rg.result_id;

  -- 3. Calcular posiciones por CATEGORÍA (edad + género)
  WITH ranked_category AS (
    SELECT 
      rr.id as result_id,
      get_age_category(
        COALESCE(p.birth_date, reg.guest_birth_date),
        COALESCE(p.gender, 'Unknown'),
        v_race_date
      ) as category,
      ROW_NUMBER() OVER (
        PARTITION BY get_age_category(
          COALESCE(p.birth_date, reg.guest_birth_date),
          COALESCE(p.gender, 'Unknown'),
          v_race_date
        )
        ORDER BY rr.finish_time ASC
      ) as category_pos
    FROM race_results rr
    JOIN registrations reg ON reg.id = rr.registration_id
    LEFT JOIN profiles p ON p.id = reg.user_id
    WHERE rr.race_distance_id = p_race_distance_id
      AND rr.status = 'FIN'
  )
  UPDATE race_results
  SET category_position = rc.category_pos
  FROM ranked_category rc
  WHERE race_results.id = rc.result_id;

  -- Limpiar posiciones para los que no terminaron
  UPDATE race_results
  SET 
    overall_position = NULL,
    gender_position = NULL,
    category_position = NULL
  WHERE race_distance_id = p_race_distance_id
    AND status != 'FIN';

  RETURN QUERY SELECT v_processed, v_finished, v_in_progress;
END;
$function$;