-- Add category_number field to race_categories (autoincremental per event)
ALTER TABLE public.race_categories 
ADD COLUMN IF NOT EXISTS category_number INTEGER;

-- Create function to auto-assign category_number per event
CREATE OR REPLACE FUNCTION public.assign_category_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the next category_number for this event
  SELECT COALESCE(MAX(category_number), 0) + 1 INTO NEW.category_number
  FROM public.race_categories
  WHERE race_distance_id = NEW.race_distance_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto category_number
DROP TRIGGER IF EXISTS trigger_assign_category_number ON public.race_categories;
CREATE TRIGGER trigger_assign_category_number
BEFORE INSERT ON public.race_categories
FOR EACH ROW
WHEN (NEW.category_number IS NULL)
EXECUTE FUNCTION public.assign_category_number();

-- Create function to auto-create "UNICA" category when a race_distance is created
CREATE OR REPLACE FUNCTION public.create_default_category()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create if no categories exist for this distance
  IF NOT EXISTS (SELECT 1 FROM public.race_categories WHERE race_distance_id = NEW.id) THEN
    INSERT INTO public.race_categories (
      race_id,
      race_distance_id,
      name,
      short_name,
      age_dependent,
      display_order
    ) VALUES (
      NEW.race_id,
      NEW.id,
      'UNICA',
      'UNICA',
      false,
      1
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to create default category when race_distance is created
DROP TRIGGER IF EXISTS trigger_create_default_category ON public.race_distances;
CREATE TRIGGER trigger_create_default_category
AFTER INSERT ON public.race_distances
FOR EACH ROW
EXECUTE FUNCTION public.create_default_category();

-- Backfill category_number for existing categories
WITH numbered_categories AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY race_distance_id ORDER BY display_order, created_at) as num
  FROM public.race_categories
  WHERE category_number IS NULL
)
UPDATE public.race_categories rc
SET category_number = nc.num
FROM numbered_categories nc
WHERE rc.id = nc.id;

-- Create "UNICA" category for existing race_distances that don't have any categories
-- Use ON CONFLICT to avoid duplicates
INSERT INTO public.race_categories (race_id, race_distance_id, name, short_name, age_dependent, display_order)
SELECT rd.race_id, rd.id, 'UNICA', 'UNICA', false, 1
FROM public.race_distances rd
WHERE NOT EXISTS (
  SELECT 1 FROM public.race_categories rc WHERE rc.race_distance_id = rd.id
)
ON CONFLICT DO NOTHING;