-- Función auxiliar para calcular la categoría basada en edad y género
CREATE OR REPLACE FUNCTION public.get_age_category(p_birth_date date, p_gender text, p_race_date date)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_age integer;
  v_gender_prefix text;
  v_category text;
BEGIN
  -- Si no hay fecha de nacimiento, retornar categoría desconocida
  IF p_birth_date IS NULL THEN
    RETURN 'Unknown';
  END IF;

  -- Calcular edad a la fecha de la carrera
  v_age := EXTRACT(YEAR FROM age(p_race_date, p_birth_date));

  -- Determinar prefijo de género
  IF p_gender = 'Masculino' OR p_gender = 'M' OR p_gender = 'Male' THEN
    v_gender_prefix := 'M';
  ELSIF p_gender = 'Femenino' OR p_gender = 'F' OR p_gender = 'Female' THEN
    v_gender_prefix := 'F';
  ELSE
    v_gender_prefix := 'X';
  END IF;

  -- Determinar categoría por edad
  IF v_age < 20 THEN
    v_category := 'Junior';
  ELSIF v_age >= 20 AND v_age <= 34 THEN
    v_category := 'Senior';
  ELSIF v_age >= 35 AND v_age <= 44 THEN
    v_category := 'VetA';
  ELSIF v_age >= 45 AND v_age <= 54 THEN
    v_category := 'VetB';
  ELSIF v_age >= 55 AND v_age <= 64 THEN
    v_category := 'VetC';
  ELSE
    v_category := 'VetD';
  END IF;

  RETURN v_gender_prefix || '-' || v_category;
END;
$$;

-- Actualizar la función process_event_results con cálculo completo de posiciones
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
      rr.id,
      ROW_NUMBER() OVER (ORDER BY rr.finish_time ASC) as overall_pos
    FROM race_results rr
    WHERE rr.race_distance_id = p_race_distance_id
      AND rr.status = 'FIN'
  )
  UPDATE race_results rr
  SET overall_position = ranked_overall.overall_pos
  FROM ranked_overall
  WHERE rr.id = ranked_overall.id;

  -- 2. Calcular posiciones por GÉNERO
  WITH ranked_gender AS (
    SELECT 
      rr.id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          CASE 
            WHEN COALESCE(p.gender, reg.guest_first_name) IN ('Masculino', 'M', 'Male') THEN 'M'
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
  UPDATE race_results rr
  SET gender_position = ranked_gender.gender_pos
  FROM ranked_gender
  WHERE rr.id = ranked_gender.id;

  -- 3. Calcular posiciones por CATEGORÍA (edad + género)
  WITH ranked_category AS (
    SELECT 
      rr.id,
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
  UPDATE race_results rr
  SET category_position = ranked_category.category_pos
  FROM ranked_category
  WHERE rr.id = ranked_category.id;

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