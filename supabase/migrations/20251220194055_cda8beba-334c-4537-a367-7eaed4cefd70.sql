-- Add name_tv column to race_motos table for TV display name
ALTER TABLE public.race_motos 
ADD COLUMN name_tv text;