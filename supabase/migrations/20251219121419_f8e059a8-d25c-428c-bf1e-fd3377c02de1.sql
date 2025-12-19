-- Añadir campo slug a la tabla races
ALTER TABLE public.races
ADD COLUMN slug text UNIQUE;

-- Crear índice para búsquedas rápidas por slug
CREATE INDEX idx_races_slug ON public.races(slug);

-- Función para generar slug automático desde el nombre
CREATE OR REPLACE FUNCTION public.generate_race_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  -- Generar slug base desde el nombre
  base_slug := lower(
    regexp_replace(
      regexp_replace(
        NEW.name,
        '[áàäâ]', 'a', 'gi'
      ),
      '[éèëê]', 'e', 'gi'
    )
  );
  base_slug := regexp_replace(base_slug, '[íìïî]', 'i', 'gi');
  base_slug := regexp_replace(base_slug, '[óòöô]', 'o', 'gi');
  base_slug := regexp_replace(base_slug, '[úùüû]', 'u', 'gi');
  base_slug := regexp_replace(base_slug, '[ñ]', 'n', 'gi');
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'gi');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  
  final_slug := base_slug;
  
  -- Verificar unicidad y añadir sufijo si es necesario
  WHILE EXISTS (SELECT 1 FROM races WHERE slug = final_slug AND id != NEW.id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$;

-- Trigger para generar slug automáticamente al crear/actualizar carrera
CREATE TRIGGER trigger_generate_race_slug
BEFORE INSERT OR UPDATE OF name ON public.races
FOR EACH ROW
WHEN (NEW.slug IS NULL OR NEW.slug = '')
EXECUTE FUNCTION public.generate_race_slug();

-- Actualizar carreras existentes con slugs
UPDATE public.races SET slug = NULL WHERE slug IS NULL;