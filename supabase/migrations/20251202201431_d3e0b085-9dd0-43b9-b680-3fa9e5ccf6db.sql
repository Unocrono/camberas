-- Añadir lap_number a split_times (calculado durante el procesamiento)
ALTER TABLE public.split_times
ADD COLUMN lap_number integer DEFAULT 1;

-- Añadir checkpoint_type a race_checkpoints
ALTER TABLE public.race_checkpoints
ADD COLUMN checkpoint_type text NOT NULL DEFAULT 'STANDARD';

-- Añadir constraint para validar los tipos permitidos
ALTER TABLE public.race_checkpoints
ADD CONSTRAINT checkpoint_type_check CHECK (checkpoint_type IN ('START', 'FINISH', 'STANDARD'));

-- Actualizar checkpoints existentes basándose en el nombre
UPDATE public.race_checkpoints
SET checkpoint_type = 'START'
WHERE LOWER(name) LIKE '%salida%' OR checkpoint_order = 1;

UPDATE public.race_checkpoints
SET checkpoint_type = 'FINISH'
WHERE LOWER(name) LIKE '%meta%' OR LOWER(name) LIKE '%llegada%';

-- Añadir comentarios descriptivos
COMMENT ON COLUMN public.race_checkpoints.checkpoint_type IS 'Tipo de checkpoint: START (salida), FINISH (meta), STANDARD (punto intermedio)';
COMMENT ON COLUMN public.split_times.lap_number IS 'Número de vuelta calculado automáticamente durante el procesamiento de lecturas';