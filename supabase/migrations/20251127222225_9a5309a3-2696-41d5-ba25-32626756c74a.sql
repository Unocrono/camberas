-- Remove company fields from profiles (using club instead)
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS company_name,
DROP COLUMN IF EXISTS company_phone;