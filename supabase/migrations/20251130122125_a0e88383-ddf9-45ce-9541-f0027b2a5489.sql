-- Add is_checkpoint boolean field to roadbook_items
ALTER TABLE public.roadbook_items 
ADD COLUMN is_checkpoint boolean NOT NULL DEFAULT false;