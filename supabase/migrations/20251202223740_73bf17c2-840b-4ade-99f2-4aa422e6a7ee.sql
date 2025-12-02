-- 1. Crear tabla timing_points (lugares físicos de cronometraje)
CREATE TABLE public.timing_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para búsquedas por carrera
CREATE INDEX idx_timing_points_race_id ON public.timing_points(race_id);

-- RLS para timing_points
ALTER TABLE public.timing_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view timing points"
ON public.timing_points FOR SELECT
USING (true);

CREATE POLICY "Admins can manage all timing points"
ON public.timing_points FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage their race timing points"
ON public.timing_points FOR ALL
USING (
  has_role(auth.uid(), 'organizer') AND
  EXISTS (
    SELECT 1 FROM races
    WHERE races.id = timing_points.race_id
    AND races.organizer_id = auth.uid()
  )
);

-- 2. Añadir timing_point_id a race_checkpoints
ALTER TABLE public.race_checkpoints
ADD COLUMN timing_point_id UUID REFERENCES public.timing_points(id) ON DELETE SET NULL;

-- 3. Añadir timing_point_id a timing_readings (reemplazará checkpoint_id)
ALTER TABLE public.timing_readings
ADD COLUMN timing_point_id UUID REFERENCES public.timing_points(id) ON DELETE SET NULL;

-- Índice para timing_readings por timing_point
CREATE INDEX idx_timing_readings_timing_point ON public.timing_readings(timing_point_id, timing_timestamp);

-- 4. Eliminar la tabla checkpoint_distance_assignments (ya no es necesaria)
DROP TABLE IF EXISTS public.checkpoint_distance_assignments;

-- 5. Trigger para updated_at en timing_points
CREATE TRIGGER update_timing_points_updated_at
BEFORE UPDATE ON public.timing_points
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();