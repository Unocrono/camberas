-- Add gender_id FK column to registrations table
ALTER TABLE public.registrations 
ADD COLUMN gender_id INTEGER REFERENCES public.genders(gender_id);

-- Add gender_id FK column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN gender_id INTEGER REFERENCES public.genders(gender_id);

-- Create index for faster lookups
CREATE INDEX idx_registrations_gender_id ON public.registrations(gender_id);
CREATE INDEX idx_profiles_gender_id ON public.profiles(gender_id);

-- Migrate existing gender text data to gender_id in registrations
UPDATE public.registrations 
SET gender_id = 1 
WHERE gender IS NOT NULL AND LOWER(gender) IN ('m', 'male', 'masculino', 'hombre', 'h');

UPDATE public.registrations 
SET gender_id = 2 
WHERE gender IS NOT NULL AND LOWER(gender) IN ('f', 'female', 'femenino', 'mujer');

UPDATE public.registrations 
SET gender_id = 3 
WHERE gender IS NOT NULL AND LOWER(gender) IN ('x', 'mixto', 'mixte');

-- Migrate existing gender text data to gender_id in profiles
UPDATE public.profiles 
SET gender_id = 1 
WHERE gender IS NOT NULL AND LOWER(gender) IN ('m', 'male', 'masculino', 'hombre', 'h');

UPDATE public.profiles 
SET gender_id = 2 
WHERE gender IS NOT NULL AND LOWER(gender) IN ('f', 'female', 'femenino', 'mujer');

UPDATE public.profiles 
SET gender_id = 3 
WHERE gender IS NOT NULL AND LOWER(gender) IN ('x', 'mixto', 'mixte');

-- Create a helper function to get gender_id from text
CREATE OR REPLACE FUNCTION public.get_gender_id_from_text(gender_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF gender_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  CASE LOWER(TRIM(gender_text))
    WHEN 'm', 'male', 'masculino', 'hombre', 'h' THEN
      RETURN 1;
    WHEN 'f', 'female', 'femenino', 'mujer' THEN
      RETURN 2;
    WHEN 'x', 'mixto', 'mixte' THEN
      RETURN 3;
    ELSE
      RETURN NULL;
  END CASE;
END;
$$;