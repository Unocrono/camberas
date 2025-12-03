-- Crear tabla race_results_abandons para gestionar retirados/abandonos
CREATE TABLE public.race_results_abandons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES public.registrations(id) ON DELETE CASCADE NOT NULL,
  race_id uuid REFERENCES public.races(id) ON DELETE CASCADE NOT NULL,
  race_distance_id uuid REFERENCES public.race_distances(id) ON DELETE SET NULL,
  bib_number integer NOT NULL,
  abandon_type text NOT NULL CHECK (abandon_type IN ('ABANDONO', 'NO_SALE', 'DESCALIFICADO', 'EN_CARRERA')),
  timing_point_id uuid REFERENCES public.timing_points(id) ON DELETE SET NULL,
  reason text NOT NULL,
  operator_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_race_results_abandons_race ON public.race_results_abandons(race_id);
CREATE INDEX idx_race_results_abandons_registration ON public.race_results_abandons(registration_id);
CREATE INDEX idx_race_results_abandons_bib ON public.race_results_abandons(bib_number, race_id);

-- Habilitar RLS
ALTER TABLE public.race_results_abandons ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view abandons" 
ON public.race_results_abandons 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage all abandons" 
ON public.race_results_abandons 
FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage abandons for their races" 
ON public.race_results_abandons 
FOR ALL 
USING (
  has_role(auth.uid(), 'organizer') AND 
  EXISTS (
    SELECT 1 FROM races 
    WHERE races.id = race_results_abandons.race_id 
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Timers can insert abandons for assigned races" 
ON public.race_results_abandons 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'timer') AND 
  is_timer_for_race(auth.uid(), race_id)
);

-- Trigger para updated_at
CREATE TRIGGER update_race_results_abandons_updated_at
BEFORE UPDATE ON public.race_results_abandons
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();