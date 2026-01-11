-- Drop the incorrect unique constraint
ALTER TABLE race_categories DROP CONSTRAINT IF EXISTS race_categories_race_id_name_key;

-- Add the correct unique constraint that allows same category name across different events
ALTER TABLE race_categories ADD CONSTRAINT race_categories_race_distance_name_key UNIQUE (race_id, race_distance_id, name);