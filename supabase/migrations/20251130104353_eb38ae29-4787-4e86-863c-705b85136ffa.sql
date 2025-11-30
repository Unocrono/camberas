-- Create roadbook_item_types table for managing checkpoint types
CREATE TABLE public.roadbook_item_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  icon text NOT NULL DEFAULT 'MapPin',
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.roadbook_item_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view active roadbook item types"
ON public.roadbook_item_types
FOR SELECT
USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage roadbook item types"
ON public.roadbook_item_types
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default item types
INSERT INTO public.roadbook_item_types (name, label, icon, description, display_order) VALUES
('start', 'Salida', 'Flag', 'Punto de salida de la carrera', 1),
('checkpoint', 'Punto de Control', 'MapPin', 'Punto de control intermedio', 2),
('aid_station', 'Avituallamiento', 'Droplet', 'Punto de avituallamiento con agua y comida', 3),
('refreshment', 'Refresco', 'GlassWater', 'Punto de refresco solo con agua', 4),
('technical', 'Zona Técnica', 'AlertTriangle', 'Zona técnica o peligrosa', 5),
('poi', 'Punto de Interés', 'Camera', 'Punto de interés turístico o paisajístico', 6),
('finish', 'Meta', 'Trophy', 'Punto de llegada de la carrera', 7);

-- Add foreign key column to roadbook_items (nullable first for existing data)
ALTER TABLE public.roadbook_items 
ADD COLUMN item_type_id uuid REFERENCES public.roadbook_item_types(id);

-- Update existing roadbook_items to reference the new types
UPDATE public.roadbook_items ri
SET item_type_id = rit.id
FROM public.roadbook_item_types rit
WHERE ri.item_type = rit.name;

-- Create trigger for updated_at
CREATE TRIGGER update_roadbook_item_types_updated_at
BEFORE UPDATE ON public.roadbook_item_types
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();