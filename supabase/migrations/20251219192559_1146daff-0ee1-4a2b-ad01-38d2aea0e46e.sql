-- Añadir columnas de clasificación y ritmo a split_times
ALTER TABLE split_times 
ADD COLUMN IF NOT EXISTS overall_position integer,
ADD COLUMN IF NOT EXISTS gender_position integer,
ADD COLUMN IF NOT EXISTS category_position integer,
ADD COLUMN IF NOT EXISTS pace text;

-- Añadir índice para mejorar consultas de clasificación por checkpoint
CREATE INDEX IF NOT EXISTS idx_split_times_checkpoint_order_time 
ON split_times(checkpoint_order, split_time);

-- Crear constraint único para evitar duplicados (si no existe)
-- Primero verificar si ya existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'split_times_result_checkpoint_lap_unique'
  ) THEN
    ALTER TABLE split_times 
    ADD CONSTRAINT split_times_result_checkpoint_lap_unique 
    UNIQUE (race_result_id, checkpoint_order, lap_number);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Crear función para calcular posiciones en split_times
CREATE OR REPLACE FUNCTION public.calculate_split_positions(p_race_distance_id uuid)
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_race_date date;
  v_updated integer := 0;
BEGIN
  -- Obtener fecha de la carrera
  SELECT r.date INTO v_race_date
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

  -- 2. Calcular posición por GÉNERO
  WITH ranked_gender AS (
    SELECT 
      st.id as split_id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          st.checkpoint_order, 
          st.lap_number,
          CASE 
            WHEN COALESCE(p.gender, '') IN ('Masculino', 'M', 'Male') THEN 'M'
            WHEN COALESCE(p.gender, '') IN ('Femenino', 'F', 'Female') THEN 'F'
            ELSE 'X'
          END
        ORDER BY st.split_time ASC
      ) as gender_pos
    FROM split_times st
    JOIN race_results rr ON rr.id = st.race_result_id
    JOIN registrations reg ON reg.id = rr.registration_id
    LEFT JOIN profiles p ON p.id = reg.user_id
    WHERE rr.race_distance_id = p_race_distance_id
  )
  UPDATE split_times
  SET gender_position = rg.gender_pos
  FROM ranked_gender rg
  WHERE split_times.id = rg.split_id;

  -- 3. Calcular posición por CATEGORÍA
  WITH ranked_category AS (
    SELECT 
      st.id as split_id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          st.checkpoint_order,
          st.lap_number,
          get_age_category(
            COALESCE(p.birth_date, reg.guest_birth_date),
            COALESCE(p.gender, 'Unknown'),
            v_race_date
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
        -- Convertir interval a minutos y dividir por km
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
$function$;

-- Modificar generate_split_times para que llame a calculate_split_positions
CREATE OR REPLACE FUNCTION public.generate_split_times(p_race_distance_id uuid)
RETURNS TABLE(inserted_count integer, updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
  v_updated integer := 0;
  v_is_insert integer;
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
      checkpoint_name = EXCLUDED.checkpoint_name,
      distance_km = EXCLUDED.distance_km,
      updated_at = now()
    RETURNING (xmax = 0)::int INTO v_is_insert;
    
    IF v_is_insert = 1 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- Calcular posiciones y pace después de generar todos los splits
  PERFORM calculate_split_positions(p_race_distance_id);

  RETURN QUERY SELECT v_inserted, v_updated;
END;
$function$;