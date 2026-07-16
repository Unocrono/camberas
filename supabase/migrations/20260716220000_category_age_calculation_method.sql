-- Método de cálculo de edad en las plantillas de categorías.
-- Las plantillas son reutilizables entre carreras, así que guardan un método
-- (no una fecha fija) que se resuelve a fecha concreta al aplicar la plantilla:
--   'race_date' → la edad se calcula el día de la carrera
--   'season'    → la edad se calcula a 31 de diciembre del año de la carrera
ALTER TABLE public.category_template_items
ADD COLUMN IF NOT EXISTS age_calculation_method text NOT NULL DEFAULT 'race_date';

-- Restringir a los valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'category_template_items_age_calc_method_check'
  ) THEN
    ALTER TABLE public.category_template_items
    ADD CONSTRAINT category_template_items_age_calc_method_check
    CHECK (age_calculation_method IN ('race_date', 'season'));
  END IF;
END $$;
