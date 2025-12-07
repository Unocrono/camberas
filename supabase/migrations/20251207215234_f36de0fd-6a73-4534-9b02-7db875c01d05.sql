-- Corregir search_path en get_age_category
CREATE OR REPLACE FUNCTION public.get_age_category(p_birth_date date, p_gender text, p_race_date date)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_age integer;
  v_gender_prefix text;
  v_category text;
BEGIN
  IF p_birth_date IS NULL THEN
    RETURN 'Unknown';
  END IF;

  v_age := EXTRACT(YEAR FROM age(p_race_date, p_birth_date));

  IF p_gender = 'Masculino' OR p_gender = 'M' OR p_gender = 'Male' THEN
    v_gender_prefix := 'M';
  ELSIF p_gender = 'Femenino' OR p_gender = 'F' OR p_gender = 'Female' THEN
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
$$;