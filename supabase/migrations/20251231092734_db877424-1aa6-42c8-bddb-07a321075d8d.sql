
-- Función helper para obtener género de un registration
-- Busca primero en profiles, luego en registration_responses
CREATE OR REPLACE FUNCTION public.get_registration_gender(p_registration_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gender text;
  v_race_distance_id uuid;
BEGIN
  -- 1. Intentar obtener de profiles (usuario registrado)
  SELECT p.gender INTO v_gender
  FROM registrations reg
  JOIN profiles p ON p.id = reg.user_id
  WHERE reg.id = p_registration_id;
  
  IF v_gender IS NOT NULL AND v_gender != '' THEN
    RETURN v_gender;
  END IF;
  
  -- 2. Buscar en registration_responses (campo personalizado de género)
  SELECT reg.race_distance_id INTO v_race_distance_id
  FROM registrations reg
  WHERE reg.id = p_registration_id;
  
  SELECT rr.field_value INTO v_gender
  FROM registration_responses rr
  JOIN registration_form_fields rff ON rff.id = rr.field_id
  WHERE rr.registration_id = p_registration_id
    AND rff.profile_field = 'gender'
  LIMIT 1;
  
  RETURN COALESCE(v_gender, 'Unknown');
END;
$$;

-- Actualizar process_event_results para usar la nueva función
CREATE OR REPLACE FUNCTION public.process_event_results(p_race_distance_id uuid)
RETURNS TABLE(processed_count integer, finished_count integer, in_progress_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- 2. Calcular posiciones por GÉNERO (usando get_registration_gender)
  WITH ranked_gender AS (
    SELECT 
      rr.id as result_id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          CASE 
            WHEN get_registration_gender(reg.id) IN ('Masculino', 'M', 'Male', 'male') THEN 'M'
            WHEN get_registration_gender(reg.id) IN ('Femenino', 'F', 'Female', 'female') THEN 'F'
            ELSE 'X'
          END
        ORDER BY rr.finish_time ASC
      ) as gender_pos
    FROM race_results rr
    JOIN registrations reg ON reg.id = rr.registration_id
    WHERE rr.race_distance_id = p_race_distance_id
      AND rr.status = 'FIN'
  )
  UPDATE race_results
  SET gender_position = rg.gender_pos
  FROM ranked_gender rg
  WHERE race_results.id = rg.result_id;

  -- 3. Calcular posiciones por CATEGORÍA usando get_race_category con género de registration_responses
  WITH ranked_category AS (
    SELECT 
      rr.id as result_id,
      get_race_category(
        v_race_id,
        COALESCE(p.birth_date, reg.guest_birth_date),
        get_registration_gender(reg.id)
      ) as category,
      ROW_NUMBER() OVER (
        PARTITION BY get_race_category(
          v_race_id,
          COALESCE(p.birth_date, reg.guest_birth_date),
          get_registration_gender(reg.id)
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
$$;

-- Actualizar calculate_split_positions para usar la nueva función
CREATE OR REPLACE FUNCTION public.calculate_split_positions(p_race_distance_id uuid)
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_race_id uuid;
  v_race_date date;
  v_updated integer := 0;
BEGIN
  -- Obtener race_id y fecha de la carrera
  SELECT rd.race_id, r.date INTO v_race_id, v_race_date
  FROM race_distances rd
  JOIN races r ON r.id = rd.race_id
  WHERE rd.id = p_race_distance_id;

  -- 1. Calcular posición GENERAL por checkpoint
  WITH ranked_overall AS (
    SELECT 
      st.id as split_id,
      st.checkpoint_order,
      st.lap_number,
      ROW_NUMBER() OVER (
        PARTITION BY st.checkpoint_order, st.lap_number
        ORDER BY st.split_time ASC
      ) as overall_pos
    FROM split_times st
    JOIN race_results rr ON rr.id = st.race_result_id
    WHERE rr.race_distance_id = p_race_distance_id
  )
  UPDATE split_times
  SET overall_position = ro.overall_pos
  FROM ranked_overall ro
  WHERE split_times.id = ro.split_id;

  -- 2. Calcular posición por GÉNERO (usando get_registration_gender)
  WITH ranked_gender AS (
    SELECT 
      st.id as split_id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          st.checkpoint_order, 
          st.lap_number,
          CASE 
            WHEN get_registration_gender(reg.id) IN ('Masculino', 'M', 'Male', 'male') THEN 'M'
            WHEN get_registration_gender(reg.id) IN ('Femenino', 'F', 'Female', 'female') THEN 'F'
            ELSE 'X'
          END
        ORDER BY st.split_time ASC
      ) as gender_pos
    FROM split_times st
    JOIN race_results rr ON rr.id = st.race_result_id
    JOIN registrations reg ON reg.id = rr.registration_id
    WHERE rr.race_distance_id = p_race_distance_id
  )
  UPDATE split_times
  SET gender_position = rg.gender_pos
  FROM ranked_gender rg
  WHERE split_times.id = rg.split_id;

  -- 3. Calcular posición por CATEGORÍA usando get_race_category con género de registration_responses
  WITH ranked_category AS (
    SELECT 
      st.id as split_id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          st.checkpoint_order,
          st.lap_number,
          get_race_category(
            v_race_id,
            COALESCE(p.birth_date, reg.guest_birth_date),
            get_registration_gender(reg.id)
          )
        ORDER BY st.split_time ASC
      ) as category_pos
    FROM split_times st
    JOIN race_results rr ON rr.id = st.race_result_id
    JOIN registrations reg ON reg.id = rr.registration_id
    LEFT JOIN profiles p ON p.id = reg.user_id
    WHERE rr.race_distance_id = p_race_distance_id
  )
  UPDATE split_times
  SET category_position = rc.category_pos
  FROM ranked_category rc
  WHERE split_times.id = rc.split_id;

  -- 4. Calcular PACE (ritmo min/km)
  UPDATE split_times st
  SET pace = (
    CASE 
      WHEN st.distance_km > 0 THEN
        LPAD(
          (EXTRACT(EPOCH FROM st.split_time) / 60 / st.distance_km)::integer::text,
          2, '0'
        ) || ':' ||
        LPAD(
          (((EXTRACT(EPOCH FROM st.split_time) / 60 / st.distance_km) - 
            (EXTRACT(EPOCH FROM st.split_time) / 60 / st.distance_km)::integer) * 60)::integer::text,
          2, '0'
        )
      ELSE NULL
    END
  )
  FROM race_results rr
  WHERE rr.id = st.race_result_id
    AND rr.race_distance_id = p_race_distance_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN QUERY SELECT v_updated;
END;
$$;
