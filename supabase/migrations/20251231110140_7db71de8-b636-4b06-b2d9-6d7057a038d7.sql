
-- Actualizar get_race_category para reconocer también 'male' y 'female' en minúsculas
CREATE OR REPLACE FUNCTION public.get_race_category(p_race_id uuid, p_birth_date date, p_gender text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Normalizar género (ahora incluye minúsculas)
  IF p_gender IN ('Masculino', 'M', 'Male', 'male') THEN
    v_gender_normalized := 'M';
  ELSIF p_gender IN ('Femenino', 'F', 'Female', 'female') THEN
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
$function$;

-- Actualizar get_age_category también para reconocer minúsculas
CREATE OR REPLACE FUNCTION public.get_age_category(p_birth_date date, p_gender text, p_race_date date)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_age integer;
  v_gender_prefix text;
  v_category text;
BEGIN
  IF p_birth_date IS NULL THEN
    RETURN 'Unknown';
  END IF;

  v_age := EXTRACT(YEAR FROM age(p_race_date, p_birth_date));

  -- Normalizar género (ahora incluye minúsculas)
  IF p_gender IN ('Masculino', 'M', 'Male', 'male') THEN
    v_gender_prefix := 'M';
  ELSIF p_gender IN ('Femenino', 'F', 'Female', 'female') THEN
    v_gender_prefix := 'F';
  ELSE
    v_gender_prefix := 'X';
  END IF;

  IF v_age < 20 THEN
    v_category := 'Junior';
  ELSIF v_age >= 20 AND v_age <= 34 THEN
    v_category := 'Senior';
  ELSIF v_age >= 35 AND v_age <= 44 THEN
    v_category := 'VetA';
  ELSIF v_age >= 45 AND v_age <= 54 THEN
    v_category := 'VetB';
  ELSIF v_age >= 55 AND v_age <= 64 THEN
    v_category := 'VetC';
  ELSE
    v_category := 'VetD';
  END IF;

  RETURN v_gender_prefix || '-' || v_category;
END;
$function$;
