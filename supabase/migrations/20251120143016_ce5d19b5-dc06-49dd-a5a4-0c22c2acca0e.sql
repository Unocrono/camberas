-- Modify profiles table to split full_name and add new fields
ALTER TABLE public.profiles 
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name TEXT,
  ADD COLUMN dni_passport TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN province TEXT,
  ADD COLUMN autonomous_community TEXT;

-- Migrate existing full_name data to first_name (optional, for existing records)
UPDATE public.profiles 
SET first_name = full_name 
WHERE full_name IS NOT NULL AND first_name IS NULL;

-- Drop the old full_name column
ALTER TABLE public.profiles DROP COLUMN full_name;