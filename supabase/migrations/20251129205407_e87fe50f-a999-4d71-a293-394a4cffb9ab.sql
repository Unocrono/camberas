-- Añadir campo lugar a race_checkpoints
ALTER TABLE public.race_checkpoints ADD COLUMN IF NOT EXISTS lugar text;

-- Cambiar la relación de race_id a race_distance_id
ALTER TABLE public.race_checkpoints ADD COLUMN IF NOT EXISTS race_distance_id uuid;

-- Crear función para auto-crear checkpoints cuando se crea una distancia
CREATE OR REPLACE FUNCTION public.auto_create_distance_checkpoints()
RETURNS TRIGGER AS $$
BEGIN
  -- Crear checkpoint de Salida
  INSERT INTO public.race_checkpoints (race_id, race_distance_id, name, lugar, distance_km, checkpoint_order)
  VALUES (NEW.race_id, NEW.id, 'Salida', NULL, 0, 1);
  
  -- Crear checkpoint de Meta
  INSERT INTO public.race_checkpoints (race_id, race_distance_id, name, lugar, distance_km, checkpoint_order)
  VALUES (NEW.race_id, NEW.id, 'Meta', NULL, NEW.distance_km, 10);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Crear trigger para auto-crear checkpoints
DROP TRIGGER IF EXISTS create_distance_checkpoints ON public.race_distances;
CREATE TRIGGER create_distance_checkpoints
AFTER INSERT ON public.race_distances
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_distance_checkpoints();

-- Actualizar políticas RLS para incluir race_distance_id
DROP POLICY IF EXISTS "Organizers can manage their race checkpoints" ON public.race_checkpoints;
CREATE POLICY "Organizers can manage their race checkpoints" 
ON public.race_checkpoints 
FOR ALL 
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND (
    EXISTS (SELECT 1 FROM races WHERE races.id = race_checkpoints.race_id AND races.organizer_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM race_distances rd
      JOIN races r ON r.id = rd.race_id
      WHERE rd.id = race_checkpoints.race_distance_id AND r.organizer_id = auth.uid()
    )
  )
);