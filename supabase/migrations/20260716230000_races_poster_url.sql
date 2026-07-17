-- Cartel vertical (2:3) de la carrera.
-- El admin ya permitía subirlo, pero la columna no existía y la subida
-- se perdía. Es la imagen protagonista del nuevo diseño: llena el hero
-- de la landing y la mitad superior de cada card de carrera.
ALTER TABLE public.races
ADD COLUMN IF NOT EXISTS poster_url text;
