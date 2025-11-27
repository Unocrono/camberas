-- Add bib number management fields to race_distances
ALTER TABLE public.race_distances
ADD COLUMN bib_start INTEGER DEFAULT NULL,
ADD COLUMN bib_end INTEGER DEFAULT NULL,
ADD COLUMN next_bib INTEGER DEFAULT NULL;