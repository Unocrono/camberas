-- Eliminar el constraint único incorrecto
ALTER TABLE public.race_checkpoints 
DROP CONSTRAINT IF EXISTS race_checkpoints_race_id_checkpoint_order_key;

-- Crear el constraint correcto sobre race_distance_id y checkpoint_order
ALTER TABLE public.race_checkpoints 
ADD CONSTRAINT race_checkpoints_distance_checkpoint_order_key 
UNIQUE (race_distance_id, checkpoint_order);