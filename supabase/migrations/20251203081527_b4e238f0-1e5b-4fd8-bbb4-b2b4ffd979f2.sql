-- Tabla de catálogo de estados de resultados de carrera
CREATE TABLE public.race_results_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order integer NOT NULL,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  can_change_at_split boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para ordenación
CREATE INDEX idx_race_results_status_sort_order ON public.race_results_status(sort_order);

-- Habilitar RLS
ALTER TABLE public.race_results_status ENABLE ROW LEVEL SECURITY;

-- Política: Cualquiera puede ver los estados
CREATE POLICY "Anyone can view race results status"
ON public.race_results_status
FOR SELECT
USING (true);

-- Política: Solo admins pueden gestionar estados
CREATE POLICY "Admins can manage race results status"
ON public.race_results_status
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insertar datos iniciales
INSERT INTO public.race_results_status (sort_order, code, name, can_change_at_split, description) VALUES
(1, 'FIN', 'Finalizado', true, 'Corredor que tiene tiempo en el punto de cronometraje del tipo FINISH'),
(2, 'STD', 'En Carrera', true, 'Corredor que tiene tiempo en el punto de cronometraje del tipo START'),
(3, 'DNF', 'Abandono', false, 'Corredor abandona durante la carrera, saldrá al final del listado de resultados de ese evento como DNF'),
(4, 'DNS', 'No sale', false, 'Corredor abandona antes de la carrera, saldrá al final del listado de resultados de ese evento como DNS'),
(5, 'DSQ', 'Descalificado', false, 'Corredor descalificado, saldrá al final del listado de resultados de ese evento como DSQ'),
(6, 'CUT', 'Fuera de Control', false, 'Corredor que no ha cumplido con el control horario del evento, saldrá al final del listado de resultados de ese evento como CUT'),
(7, 'INS', 'Inscrito', false, 'Corredor inscrito en el evento, por defecto todos antes de empezar el evento');

-- Trigger para updated_at
CREATE TRIGGER update_race_results_status_updated_at
BEFORE UPDATE ON public.race_results_status
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();