-- Migración 2: Crear tablas y políticas de cronometraje

-- 1. Crear tabla timing_readings para lecturas raw de cronometraje
CREATE TABLE public.timing_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES public.registrations(id),
  race_id uuid REFERENCES public.races(id) NOT NULL,
  race_distance_id uuid REFERENCES public.race_distances(id),
  checkpoint_id uuid REFERENCES public.race_checkpoints(id),
  bib_number integer NOT NULL,
  chip_code text,
  timing_timestamp timestamptz NOT NULL,
  reader_device_id text,
  operator_user_id uuid REFERENCES public.profiles(id),
  reading_timestamp timestamptz DEFAULT now(),
  reading_type text DEFAULT 'automatic' CHECK (reading_type IN ('automatic', 'manual', 'status_change')),
  lap_number integer DEFAULT 1,
  is_processed boolean DEFAULT false,
  status_code text CHECK (status_code IS NULL OR status_code IN ('dnf', 'dns', 'dsq', 'withdrawn')),
  notes text,
  antenna_no integer,
  rssi integer,
  reader_no integer,
  ultra_id integer,
  is_rewind boolean DEFAULT false,
  log_id integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Crear tabla timer_assignments para asignar cronometradores
CREATE TABLE public.timer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  race_id uuid REFERENCES public.races(id) NOT NULL,
  checkpoint_id uuid REFERENCES public.race_checkpoints(id),
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES public.profiles(id),
  notes text,
  UNIQUE(user_id, race_id, checkpoint_id)
);

-- 3. Índices para timing_readings
CREATE INDEX idx_timing_readings_race ON public.timing_readings(race_id);
CREATE INDEX idx_timing_readings_checkpoint ON public.timing_readings(checkpoint_id, timing_timestamp);
CREATE INDEX idx_timing_readings_bib ON public.timing_readings(bib_number, race_id);
CREATE INDEX idx_timing_readings_processed ON public.timing_readings(is_processed, race_id);
CREATE INDEX idx_timing_readings_distance ON public.timing_readings(race_distance_id);

-- 4. Índices para timer_assignments
CREATE INDEX idx_timer_assignments_user ON public.timer_assignments(user_id);
CREATE INDEX idx_timer_assignments_race ON public.timer_assignments(race_id);

-- 5. Habilitar RLS
ALTER TABLE public.timing_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_assignments ENABLE ROW LEVEL SECURITY;

-- 6. Función helper para verificar si usuario es timer de una carrera
CREATE OR REPLACE FUNCTION public.is_timer_for_race(_user_id uuid, _race_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.timer_assignments
    WHERE user_id = _user_id
      AND race_id = _race_id
  )
$$;

-- 7. Políticas RLS para timing_readings
CREATE POLICY "Admins can manage all timing readings"
ON public.timing_readings FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage timing readings for their races"
ON public.timing_readings FOR ALL
USING (
  has_role(auth.uid(), 'organizer') AND
  EXISTS (
    SELECT 1 FROM public.races
    WHERE races.id = timing_readings.race_id
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Timers can insert readings for assigned races"
ON public.timing_readings FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'timer') AND
  is_timer_for_race(auth.uid(), race_id)
);

CREATE POLICY "Timers can view readings for assigned races"
ON public.timing_readings FOR SELECT
USING (
  has_role(auth.uid(), 'timer') AND
  is_timer_for_race(auth.uid(), race_id)
);

CREATE POLICY "Anyone can view timing readings"
ON public.timing_readings FOR SELECT
USING (true);

-- 8. Políticas RLS para timer_assignments
CREATE POLICY "Admins can manage all timer assignments"
ON public.timer_assignments FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage timer assignments for their races"
ON public.timer_assignments FOR ALL
USING (
  has_role(auth.uid(), 'organizer') AND
  EXISTS (
    SELECT 1 FROM public.races
    WHERE races.id = timer_assignments.race_id
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Timers can view their own assignments"
ON public.timer_assignments FOR SELECT
USING (auth.uid() = user_id);

-- 9. Trigger para updated_at en timing_readings
CREATE TRIGGER update_timing_readings_updated_at
BEFORE UPDATE ON public.timing_readings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 10. Habilitar realtime para timing_readings
ALTER PUBLICATION supabase_realtime ADD TABLE public.timing_readings;