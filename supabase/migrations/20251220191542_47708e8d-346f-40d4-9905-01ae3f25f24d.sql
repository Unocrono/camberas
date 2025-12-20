-- Crear tabla race_motos para vehículos de seguimiento en carrera
CREATE TABLE public.race_motos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#FF5722',
  description text,
  user_id uuid REFERENCES public.profiles(id),
  moto_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(race_id, moto_order)
);

-- Habilitar RLS
ALTER TABLE public.race_motos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view race motos"
  ON public.race_motos FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all race motos"
  ON public.race_motos FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race motos"
  ON public.race_motos FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND 
    EXISTS (
      SELECT 1 FROM races 
      WHERE races.id = race_motos.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Índices
CREATE INDEX idx_race_motos_race_id ON public.race_motos(race_id);
CREATE INDEX idx_race_motos_user_id ON public.race_motos(user_id);

-- Trigger para updated_at usando la función existente handle_updated_at
CREATE TRIGGER update_race_motos_updated_at
  BEFORE UPDATE ON public.race_motos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_motos;