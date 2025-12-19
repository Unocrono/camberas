-- Simplificar calculate_split_times: eliminar lógica de lap_number
-- Ahora usamos múltiples checkpoints con el mismo timing_point y rangos de tiempo diferenciados

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
  -- Todas las lecturas válidas filtradas por min_time/max_time de cada checkpoint
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
      -- Filtrar por rango de tiempo del checkpoint
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
    1 as lap_number, -- Siempre 1, ya que cada checkpoint representa un paso único
    br.tr_elapsed_time as split_time,
    br.tr_reading_id as timing_reading_id
  FROM best_reading br
  ORDER BY br.tr_bib, br.cp_order;
END;
$function$;

-- Simplificar también generate_split_times para que no use lap_number complejo
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

    -- Upsert split_time (ahora lap_number siempre es 1)
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
      1 -- Siempre 1
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