-- Add point_order column to timing_points
ALTER TABLE public.timing_points 
ADD COLUMN point_order integer DEFAULT 0;

-- Update existing rows with sequential order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY race_id ORDER BY name) as rn
  FROM public.timing_points
)
UPDATE public.timing_points tp
SET point_order = n.rn
FROM numbered n
WHERE tp.id = n.id;