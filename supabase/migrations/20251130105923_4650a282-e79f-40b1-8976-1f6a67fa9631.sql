-- Add race_type column to roadbook_item_types
ALTER TABLE public.roadbook_item_types 
ADD COLUMN race_type text NOT NULL DEFAULT 'both';

-- Add check constraint for valid race types
ALTER TABLE public.roadbook_item_types 
ADD CONSTRAINT roadbook_item_types_race_type_check 
CHECK (race_type IN ('trail', 'mtb', 'both'));

-- Update existing types with appropriate race_type
UPDATE public.roadbook_item_types SET race_type = 'both' WHERE name IN ('start', 'checkpoint', 'finish', 'aid_station', 'poi');
UPDATE public.roadbook_item_types SET race_type = 'trail' WHERE name = 'refreshment';
UPDATE public.roadbook_item_types SET race_type = 'mtb' WHERE name = 'technical';

-- Insert additional types
INSERT INTO public.roadbook_item_types (name, label, icon, description, display_order, race_type) VALUES
('downhill', 'Descenso', 'Mountain', 'Tramo de descenso', 10, 'mtb'),
('uphill', 'Subida', 'Mountain', 'Tramo de subida pronunciada', 11, 'mtb'),
('bike_wash', 'Lavado Bikes', 'Droplet', 'Punto de lavado de bicicletas', 12, 'mtb'),
('medical', 'Punto Médico', 'AlertTriangle', 'Asistencia médica', 13, 'both')
ON CONFLICT (name) DO NOTHING;