
-- 1. Modificar FK de race_results para CASCADE en race_distance_id
ALTER TABLE race_results
DROP CONSTRAINT IF EXISTS race_results_race_distance_id_fkey;

ALTER TABLE race_results
ADD CONSTRAINT race_results_race_distance_id_fkey
FOREIGN KEY (race_distance_id) REFERENCES race_distances(id) ON DELETE CASCADE;

-- 2. Modificar FK de timing_readings para CASCADE en race_distance_id
ALTER TABLE timing_readings
DROP CONSTRAINT IF EXISTS timing_readings_race_distance_id_fkey;

ALTER TABLE timing_readings
ADD CONSTRAINT timing_readings_race_distance_id_fkey
FOREIGN KEY (race_distance_id) REFERENCES race_distances(id) ON DELETE CASCADE;

-- 3. Añadir FK con CASCADE a race_checkpoints
ALTER TABLE race_checkpoints
DROP CONSTRAINT IF EXISTS race_checkpoints_race_distance_id_fkey;

ALTER TABLE race_checkpoints
ADD CONSTRAINT race_checkpoints_race_distance_id_fkey
FOREIGN KEY (race_distance_id) REFERENCES race_distances(id) ON DELETE CASCADE;
