-- Crear tabla overlay_config para configuración de overlays
CREATE TABLE public.overlay_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid REFERENCES races(id) ON DELETE CASCADE,
  delay_seconds integer NOT NULL DEFAULT 0,
  layout text NOT NULL DEFAULT 'horizontal',
  
  -- Estilos de velocidad
  speed_font text NOT NULL DEFAULT 'Bebas Neue',
  speed_size integer NOT NULL DEFAULT 72,
  speed_color text NOT NULL DEFAULT '#FFFFFF',
  speed_bg_color text NOT NULL DEFAULT '#000000',
  speed_visible boolean NOT NULL DEFAULT true,
  speed_manual_mode boolean NOT NULL DEFAULT false,
  speed_manual_value text,
  
  -- Estilos de distancia
  distance_font text NOT NULL DEFAULT 'Roboto Condensed',
  distance_size integer NOT NULL DEFAULT 48,
  distance_color text NOT NULL DEFAULT '#FFFFFF',
  distance_bg_color text NOT NULL DEFAULT '#1a1a1a',
  distance_visible boolean NOT NULL DEFAULT true,
  distance_manual_mode boolean NOT NULL DEFAULT false,
  distance_manual_value text,
  
  -- Estilos de gaps
  gaps_font text NOT NULL DEFAULT 'Barlow Semi Condensed',
  gaps_size integer NOT NULL DEFAULT 36,
  gaps_color text NOT NULL DEFAULT '#00FF00',
  gaps_bg_color text NOT NULL DEFAULT '#000000',
  gaps_visible boolean NOT NULL DEFAULT true,
  gaps_manual_mode boolean NOT NULL DEFAULT false,
  gaps_manual_value text,
  
  -- Moto seleccionada para overlay single
  selected_moto_id uuid REFERENCES race_motos(id) ON DELETE SET NULL,
  compare_moto_id uuid REFERENCES race_motos(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_layout CHECK (layout IN ('horizontal', 'vertical', 'square'))
);

-- Habilitar RLS
ALTER TABLE public.overlay_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view overlay config"
  ON public.overlay_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all overlay config"
  ON public.overlay_config FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race overlay config"
  ON public.overlay_config FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND 
    EXISTS (
      SELECT 1 FROM races 
      WHERE races.id = overlay_config.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.overlay_config;

-- Trigger para updated_at (usando función existente)
CREATE TRIGGER update_overlay_config_updated_at
  BEFORE UPDATE ON public.overlay_config
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();