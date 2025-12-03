-- Tabla race_waves: 1 wave por distancia (1:1)
CREATE TABLE public.race_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  race_distance_id uuid NOT NULL UNIQUE REFERENCES public.race_distances(id) ON DELETE CASCADE,
  wave_name text NOT NULL,
  start_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para optimizar consultas
CREATE INDEX idx_race_waves_race_id ON public.race_waves(race_id);
CREATE INDEX idx_race_waves_distance_id ON public.race_waves(race_distance_id);

-- Trigger para updated_at
CREATE TRIGGER update_race_waves_updated_at
  BEFORE UPDATE ON public.race_waves
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Función para crear wave automáticamente al crear distancia
CREATE OR REPLACE FUNCTION public.auto_create_wave_for_distance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.race_waves (race_id, race_distance_id, wave_name)
  VALUES (NEW.race_id, NEW.id, NEW.name);
  RETURN NEW;
END;
$$;

-- Trigger para crear wave automáticamente
CREATE TRIGGER auto_create_wave_after_distance
  AFTER INSERT ON public.race_distances
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wave_for_distance();

-- Habilitar RLS
ALTER TABLE public.race_waves ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view race waves"
  ON public.race_waves FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all race waves"
  ON public.race_waves FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race waves"
  ON public.race_waves FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM races
      WHERE races.id = race_waves.race_id
      AND races.organizer_id = auth.uid()
    )
  );

-- Crear waves para distancias existentes que no tengan wave
INSERT INTO public.race_waves (race_id, race_distance_id, wave_name)
SELECT rd.race_id, rd.id, rd.name
FROM public.race_distances rd
WHERE NOT EXISTS (
  SELECT 1 FROM public.race_waves rw WHERE rw.race_distance_id = rd.id
);