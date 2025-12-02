-- Crear tabla de asignación checkpoint-evento (many-to-many)
CREATE TABLE public.checkpoint_distance_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id uuid NOT NULL REFERENCES public.race_checkpoints(id) ON DELETE CASCADE,
  race_distance_id uuid NOT NULL REFERENCES public.race_distances(id) ON DELETE CASCADE,
  checkpoint_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(checkpoint_id, race_distance_id)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_cda_checkpoint ON public.checkpoint_distance_assignments(checkpoint_id);
CREATE INDEX idx_cda_distance ON public.checkpoint_distance_assignments(race_distance_id);
CREATE INDEX idx_cda_order ON public.checkpoint_distance_assignments(race_distance_id, checkpoint_order);

-- Habilitar RLS
ALTER TABLE public.checkpoint_distance_assignments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view checkpoint assignments"
ON public.checkpoint_distance_assignments
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage all checkpoint assignments"
ON public.checkpoint_distance_assignments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage checkpoint assignments for their races"
ON public.checkpoint_distance_assignments
FOR ALL
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND
  EXISTS (
    SELECT 1 FROM race_checkpoints rc
    JOIN races r ON r.id = rc.race_id
    WHERE rc.id = checkpoint_distance_assignments.checkpoint_id
    AND r.organizer_id = auth.uid()
  )
);

-- Migrar datos existentes: crear asignaciones desde race_checkpoints.race_distance_id
INSERT INTO public.checkpoint_distance_assignments (checkpoint_id, race_distance_id, checkpoint_order)
SELECT 
  rc.id as checkpoint_id,
  rc.race_distance_id,
  rc.checkpoint_order
FROM public.race_checkpoints rc
WHERE rc.race_distance_id IS NOT NULL
ON CONFLICT (checkpoint_id, race_distance_id) DO NOTHING;