-- Migrar start_time de race_distances a race_waves como fuente de verdad
-- Primero asegurarse de que todos los waves tengan el start_time correcto
UPDATE public.race_waves rw
SET start_time = rd.start_time
FROM public.race_distances rd
WHERE rw.race_distance_id = rd.id
  AND rw.start_time IS NULL
  AND rd.start_time IS NOT NULL;

-- Eliminar columna start_time de race_distances
ALTER TABLE public.race_distances DROP COLUMN IF EXISTS start_time;

-- Actualizar el trigger para que no intente copiar start_time (ya no existe)
CREATE OR REPLACE FUNCTION public.auto_create_wave_for_distance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, start_time)
  VALUES (NEW.race_id, NEW.id, NEW.name, NULL);
  RETURN NEW;
END;
$function$;