-- Separar Team y Club en la ficha de atletas.
-- Hasta ahora el importador guardaba "Team, y si esta vacio, Club" en la
-- misma columna team, y el startlist por equipos agrupaba por esa mezcla:
-- corredores sin equipo real acababan agrupados por su club (Bajo Pas,
-- 10-sep-2026). Con club separado, el startlist agrupa SOLO por Team y el
-- club queda para mostrarlo debajo del nombre cuando no hay equipo.
ALTER TABLE public.racetec_athletes ADD COLUMN IF NOT EXISTS club text;
