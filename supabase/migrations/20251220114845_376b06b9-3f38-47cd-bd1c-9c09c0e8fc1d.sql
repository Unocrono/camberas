-- Update generate_split_times to populate checkpoint_id
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

    -- Upsert split_time with checkpoint_id
    INSERT INTO split_times (
      race_result_id,
      checkpoint_id,
      checkpoint_name,
      checkpoint_order,
      distance_km,
      split_time,
      lap_number
    )
    SELECT 
      v_race_result_id,
      r.checkpoint_id,
      r.checkpoint_name,
      r.checkpoint_order,
      rc.distance_km,
      r.split_time,
      1
    FROM race_checkpoints rc
    WHERE rc.id = r.checkpoint_id
    ON CONFLICT (race_result_id, checkpoint_order, lap_number) 
    DO UPDATE SET 
      split_time = EXCLUDED.split_time,
      checkpoint_id = EXCLUDED.checkpoint_id,
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