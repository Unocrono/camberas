-- Carrera destacada: se prioriza en el hero de la portada
ALTER TABLE public.races
ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
