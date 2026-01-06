-- 1. Añadir columna race_category_id (FK) a registrations
ALTER TABLE public.registrations
ADD COLUMN race_category_id UUID REFERENCES public.race_categories(id) ON DELETE SET NULL;

-- 2. Crear índice para optimizar búsquedas por categoría
CREATE INDEX idx_registrations_race_category_id ON public.registrations(race_category_id);

-- 3. Migrar datos existentes: buscar categorías por nombre y evento
UPDATE public.registrations r
SET race_category_id = (
  SELECT rc.id
  FROM public.race_categories rc
  WHERE rc.race_distance_id = r.race_distance_id
    AND (
      rc.name = r.category 
      OR rc.short_name = r.category
    )
  LIMIT 1
)
WHERE r.category IS NOT NULL 
  AND r.category != ''
  AND r.race_category_id IS NULL;

-- 4. Para registros sin match, asignar categoría UNICA del evento
UPDATE public.registrations r
SET race_category_id = (
  SELECT rc.id
  FROM public.race_categories rc
  WHERE rc.race_distance_id = r.race_distance_id
    AND rc.name = 'UNICA'
  LIMIT 1
)
WHERE r.race_category_id IS NULL
  AND r.race_distance_id IS NOT NULL;

-- 5. Comentario: El campo 'category' (texto) se mantiene temporalmente para compatibilidad
-- Se puede eliminar en una migración futura una vez verificado que todo funciona