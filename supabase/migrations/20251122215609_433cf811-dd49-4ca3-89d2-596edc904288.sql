-- Add start and finish location fields to race_distances
ALTER TABLE race_distances 
ADD COLUMN start_location TEXT,
ADD COLUMN finish_location TEXT;