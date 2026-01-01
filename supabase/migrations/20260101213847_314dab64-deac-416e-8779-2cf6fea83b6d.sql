-- Add youtube_enabled column to control visibility in classifications
ALTER TABLE public.race_checkpoints 
ADD COLUMN youtube_enabled boolean DEFAULT false;