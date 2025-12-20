-- 1. Crear tabla de asignaciones de moto (similar a timer_assignments)
CREATE TABLE IF NOT EXISTS public.moto_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  moto_id uuid REFERENCES race_motos(id) ON DELETE SET NULL,
  notes text,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id),
  UNIQUE(user_id, race_id, moto_id)
);

-- 2. Habilitar RLS
ALTER TABLE public.moto_assignments ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS
CREATE POLICY "Admins can manage all moto assignments"
ON public.moto_assignments FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage moto assignments for their races"
ON public.moto_assignments FOR ALL
USING (
  has_role(auth.uid(), 'organizer') AND 
  EXISTS (
    SELECT 1 FROM races 
    WHERE races.id = moto_assignments.race_id 
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view moto assignments"
ON public.moto_assignments FOR SELECT
USING (true);

-- 4. Función para verificar si un usuario es operador de moto para una carrera
CREATE OR REPLACE FUNCTION public.is_moto_for_race(_user_id uuid, _race_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.moto_assignments
    WHERE user_id = _user_id
      AND race_id = _race_id
  )
$$;

-- 5. Actualizar políticas de moto_gps_tracking para usar el nuevo rol
DROP POLICY IF EXISTS "Moto users can insert their GPS data" ON public.moto_gps_tracking;

CREATE POLICY "Moto users can insert their GPS data"
ON public.moto_gps_tracking FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'moto') AND
  EXISTS (
    SELECT 1 FROM race_motos
    WHERE race_motos.id = moto_gps_tracking.moto_id
    AND race_motos.user_id = auth.uid()
  )
);

-- 6. Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_moto_assignments_race ON public.moto_assignments(race_id);
CREATE INDEX IF NOT EXISTS idx_moto_assignments_user ON public.moto_assignments(user_id);