-- =====================================================
-- SISTEMA DE CATEGORÍAS POR EVENTO
-- =====================================================

-- 1. Crear tabla de plantillas de categorías
CREATE TABLE IF NOT EXISTS public.category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Crear tabla de items de plantilla
CREATE TABLE IF NOT EXISTS public.category_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.category_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT,
  gender TEXT,
  min_age INTEGER,
  max_age INTEGER,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Añadir nuevos campos a race_categories (ahora event_categories)
ALTER TABLE public.race_categories 
  ADD COLUMN IF NOT EXISTS race_distance_id UUID REFERENCES public.race_distances(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS age_calculation_date DATE;

-- 4. Crear índices
CREATE INDEX IF NOT EXISTS idx_race_categories_distance ON public.race_categories(race_distance_id);
CREATE INDEX IF NOT EXISTS idx_category_template_items_template ON public.category_template_items(template_id);

-- 5. Añadir trigger updated_at a nuevas tablas
CREATE TRIGGER update_category_templates_updated_at
  BEFORE UPDATE ON public.category_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_category_template_items_updated_at
  BEFORE UPDATE ON public.category_template_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. RLS para category_templates
ALTER TABLE public.category_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view category templates"
  ON public.category_templates FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all category templates"
  ON public.category_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage category templates"
  ON public.category_templates FOR ALL
  USING (has_role(auth.uid(), 'organizer'));

-- 7. RLS para category_template_items
ALTER TABLE public.category_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view category template items"
  ON public.category_template_items FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all category template items"
  ON public.category_template_items FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage category template items"
  ON public.category_template_items FOR ALL
  USING (has_role(auth.uid(), 'organizer'));

-- 8. Insertar plantilla por defecto RFEA
INSERT INTO public.category_templates (name, description, is_default)
VALUES ('RFEA Estándar', 'Categorías oficiales de la Real Federación Española de Atletismo', true);

-- 9. Insertar items de la plantilla RFEA
WITH template AS (SELECT id FROM public.category_templates WHERE name = 'RFEA Estándar' LIMIT 1)
INSERT INTO public.category_template_items (template_id, name, short_name, gender, min_age, max_age, display_order)
SELECT template.id, items.name, items.short_name, items.gender, items.min_age, items.max_age, items.display_order
FROM template,
(VALUES
  ('M-Sub18', 'M-S18', 'M', 0, 17, 1),
  ('F-Sub18', 'F-S18', 'F', 0, 17, 2),
  ('M-Sub20', 'M-S20', 'M', 18, 19, 3),
  ('F-Sub20', 'F-S20', 'F', 18, 19, 4),
  ('M-Sub23', 'M-S23', 'M', 20, 22, 5),
  ('F-Sub23', 'F-S23', 'F', 20, 22, 6),
  ('M-Senior', 'M-SEN', 'M', 23, 34, 7),
  ('F-Senior', 'F-SEN', 'F', 23, 34, 8),
  ('M-Vet35', 'M-V35', 'M', 35, 39, 9),
  ('F-Vet35', 'F-V35', 'F', 35, 39, 10),
  ('M-Vet40', 'M-V40', 'M', 40, 44, 11),
  ('F-Vet40', 'F-V40', 'F', 40, 44, 12),
  ('M-Vet45', 'M-V45', 'M', 45, 49, 13),
  ('F-Vet45', 'F-V45', 'F', 45, 49, 14),
  ('M-Vet50', 'M-V50', 'M', 50, 54, 15),
  ('F-Vet50', 'F-V50', 'F', 50, 54, 16),
  ('M-Vet55', 'M-V55', 'M', 55, 59, 17),
  ('F-Vet55', 'F-V55', 'F', 55, 59, 18),
  ('M-Vet60', 'M-V60', 'M', 60, 64, 19),
  ('F-Vet60', 'F-V60', 'F', 60, 64, 20),
  ('M-Vet65', 'M-V65', 'M', 65, 999, 21),
  ('F-Vet65', 'F-V65', 'F', 65, 999, 22)
) AS items(name, short_name, gender, min_age, max_age, display_order);