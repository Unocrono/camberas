-- Crear la nueva constraint con CONTROL en lugar de STANDARD
ALTER TABLE public.race_checkpoints 
ADD CONSTRAINT checkpoint_type_check 
CHECK (checkpoint_type = ANY (ARRAY['START'::text, 'FINISH'::text, 'CONTROL'::text]));