-- Actualizar el trigger para usar los checkpoint_type correctos
CREATE OR REPLACE FUNCTION public.auto_create_distance_checkpoints()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Crear checkpoint de Salida con tipo START
  INSERT INTO public.race_checkpoints (race_id, race_distance_id, name, lugar, distance_km, checkpoint_order, checkpoint_type)
  VALUES (NEW.race_id, NEW.id, 'Salida', NULL, 0, 1, 'START');
  
  -- Crear checkpoint de Meta con tipo FINISH
  INSERT INTO public.race_checkpoints (race_id, race_distance_id, name, lugar, distance_km, checkpoint_order, checkpoint_type)
  VALUES (NEW.race_id, NEW.id, 'Meta', NULL, NEW.distance_km, 10, 'FINISH');
  
  RETURN NEW;
END;
$function$;

-- También actualizar el default de la columna para que sea un valor válido
ALTER TABLE public.race_checkpoints ALTER COLUMN checkpoint_type SET DEFAULT 'CONTROL';