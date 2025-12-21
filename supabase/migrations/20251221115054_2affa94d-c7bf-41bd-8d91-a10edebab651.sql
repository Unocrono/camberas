-- Añadir campo race_distance_id a race_motos para asignar recorrido
ALTER TABLE public.race_motos
ADD COLUMN race_distance_id uuid REFERENCES public.race_distances(id) ON DELETE SET NULL;

-- Crear índice para optimizar queries
CREATE INDEX idx_race_motos_distance ON public.race_motos(race_distance_id);