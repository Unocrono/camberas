-- Add race_type column to races table
ALTER TABLE public.races 
ADD COLUMN race_type text NOT NULL DEFAULT 'trail';

-- Add a check constraint for valid race types
ALTER TABLE public.races 
ADD CONSTRAINT races_race_type_check 
CHECK (race_type IN ('trail', 'mtb'));