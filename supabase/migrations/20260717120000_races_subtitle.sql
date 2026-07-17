-- Subtítulo de la carrera (ej: "VIII Memorial Manuel Pérez Nestar",
-- "Camberas APP"). Se muestra bajo el título en listado, destacado y
-- página de la carrera.
ALTER TABLE public.races
ADD COLUMN IF NOT EXISTS subtitle text;
