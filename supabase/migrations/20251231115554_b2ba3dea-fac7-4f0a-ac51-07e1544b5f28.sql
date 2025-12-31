-- Add display_order column to race_distances
ALTER TABLE public.race_distances
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Update existing records to have sequential order based on distance_km
WITH ordered_distances AS (
  SELECT id, race_id, ROW_NUMBER() OVER (PARTITION BY race_id ORDER BY distance_km DESC) as new_order
  FROM race_distances
)
UPDATE race_distances rd
SET display_order = od.new_order
FROM ordered_distances od
WHERE rd.id = od.id;