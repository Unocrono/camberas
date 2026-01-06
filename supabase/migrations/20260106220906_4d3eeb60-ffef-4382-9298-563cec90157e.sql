-- Fix search_path for assign_category_number function
CREATE OR REPLACE FUNCTION public.assign_category_number()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(category_number), 0) + 1 INTO NEW.category_number
  FROM public.race_categories
  WHERE race_distance_id = NEW.race_distance_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Fix search_path for create_default_category function  
CREATE OR REPLACE FUNCTION public.create_default_category()
RETURNS TRIGGER AS $$
BEGIN
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
$$ LANGUAGE plpgsql SET search_path = public;