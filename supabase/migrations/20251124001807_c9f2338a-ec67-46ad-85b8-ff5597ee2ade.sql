-- Add organizer-specific fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS cif text,
ADD COLUMN IF NOT EXISTS company_address text,
ADD COLUMN IF NOT EXISTS company_phone text;

-- Add unique constraint for CIF to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cif_unique 
ON public.profiles(cif) 
WHERE cif IS NOT NULL;