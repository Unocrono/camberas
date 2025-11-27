-- Add new fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS club text,
ADD COLUMN IF NOT EXISTS team text;

-- Remove emergency contact fields from profiles
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS emergency_contact,
DROP COLUMN IF EXISTS emergency_phone;