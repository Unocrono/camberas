-- Añadir campo category_age_reference a races
-- Opciones: 'race_date' (edad el día de la carrera) o 'year_end' (edad a 31/12 del año)
ALTER TABLE public.races 
ADD COLUMN category_age_reference text NOT NULL DEFAULT 'race_date';

-- Crear tabla de categorías por carrera
CREATE TABLE public.race_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid REFERENCES public.races(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  gender text, -- 'M', 'F', NULL para ambos
  min_age integer,
  max_age integer,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(race_id, name)
);

-- Habilitar RLS
ALTER TABLE public.race_categories ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view race categories"
ON public.race_categories FOR SELECT
USING (true);

CREATE POLICY "Admins can manage all race categories"
ON public.race_categories FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage their race categories"
ON public.race_categories FOR ALL
USING (
  has_role(auth.uid(), 'organizer') AND
  EXISTS (
    SELECT 1 FROM races
    WHERE races.id = race_categories.race_id
    AND races.organizer_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_race_categories_updated_at
  BEFORE UPDATE ON public.race_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_categories;

-- Función para calcular categoría según las definidas por la carrera
CREATE OR REPLACE FUNCTION public.get_race_category(
  p_race_id uuid,
  p_birth_date date,
  p_gender text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_race_date date;
  v_age_reference text;
  v_age integer;
  v_gender_normalized text;
  v_category_name text;
BEGIN
  IF p_birth_date IS NULL THEN
    RETURN NULL;
  END IF;

  -- Obtener fecha de carrera y tipo de referencia
  SELECT date, category_age_reference 
  INTO v_race_date, v_age_reference
  FROM races 
  WHERE id = p_race_id;

  IF v_race_date IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calcular edad según referencia
  IF v_age_reference = 'year_end' THEN
    v_age := EXTRACT(YEAR FROM v_race_date) - EXTRACT(YEAR FROM p_birth_date);
  ELSE
    v_age := EXTRACT(YEAR FROM age(v_race_date, p_birth_date));
  END IF;

  -- Normalizar género
  IF p_gender IN ('Masculino', 'M', 'Male') THEN
    v_gender_normalized := 'M';
  ELSIF p_gender IN ('Femenino', 'F', 'Female') THEN
    v_gender_normalized := 'F';
  ELSE
    v_gender_normalized := NULL;
  END IF;

  -- Buscar categoría que coincida
  SELECT rc.name INTO v_category_name
  FROM race_categories rc
  WHERE rc.race_id = p_race_id
    AND (rc.gender IS NULL OR rc.gender = v_gender_normalized)
    AND (rc.min_age IS NULL OR v_age >= rc.min_age)
    AND (rc.max_age IS NULL OR v_age <= rc.max_age)
  ORDER BY 
    -- Priorizar categorías más específicas (con género definido)
    CASE WHEN rc.gender IS NOT NULL THEN 0 ELSE 1 END,
    rc.display_order
  LIMIT 1;

  -- Si no hay categoría definida, usar la función legacy
  IF v_category_name IS NULL THEN
    RETURN get_age_category(p_birth_date, p_gender, v_race_date);
  END IF;

  RETURN v_category_name;
END;
$$;