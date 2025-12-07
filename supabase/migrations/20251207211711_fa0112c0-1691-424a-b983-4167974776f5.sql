-- Add start_time column to race_distances (same format as race_waves.start_time)
ALTER TABLE public.race_distances 
ADD COLUMN start_time timestamp with time zone;

-- Update the trigger function to use the start_time from the distance
CREATE OR REPLACE FUNCTION public.auto_create_wave_for_distance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, start_time)
  VALUES (NEW.race_id, NEW.id, NEW.name, NEW.start_time);
  RETURN NEW;
END;
$function$;