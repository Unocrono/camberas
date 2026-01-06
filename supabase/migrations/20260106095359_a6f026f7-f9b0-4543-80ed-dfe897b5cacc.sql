-- Add age_dependent column to race_categories
ALTER TABLE public.race_categories 
ADD COLUMN IF NOT EXISTS age_dependent boolean DEFAULT false;

-- Add age_dependent column to category_template_items
ALTER TABLE public.category_template_items 
ADD COLUMN IF NOT EXISTS age_dependent boolean DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN public.race_categories.age_dependent IS 'When true, category is calculated based on runner age at race date';
COMMENT ON COLUMN public.category_template_items.age_dependent IS 'When true, category is calculated based on runner age at race date';