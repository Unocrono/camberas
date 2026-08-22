-- ============================================================
-- HORA DEL PASO POR SPLIT (LB.aspx -> TimeOfDay)
--
-- LB.aspx devuelve, por corredor, el split por el que va (SplitName: V1,
-- V2, Finish…) y la hora a la que pasó (TimeOfDay). Esa hora era el único
-- dato temporal por corredor que no estábamos guardando: `updated_at` es
-- el del lote y empata para todas las filas, así que el overlay "último
-- corredor" devolvía uno cualquiera del último bloque en vez del último
-- en pasar de verdad.
--
-- Con esta columna se puede resolver, en carreras de varias vueltas,
-- "último paso por meta": filtrar last_split = <split de meta> y ordenar
-- por split_tod descendente.
-- ============================================================

ALTER TABLE public.racetec_leaderboard ADD COLUMN IF NOT EXISTS split_tod text;
ALTER TABLE public.racetec_results     ADD COLUMN IF NOT EXISTS split_tod text;

-- SplitId: el orden oficial de los puntos de cronometraje. Se guarda porque
-- ordenar por el NOMBRE del split coloca V10 antes que V2 en cuanto la
-- carrera pasa de nueve vueltas, y porque no todos los splits son vueltas
-- (avituallamientos, altos…). El nombre queda como etiqueta para pantalla.
ALTER TABLE public.racetec_leaderboard ADD COLUMN IF NOT EXISTS split_id integer;
ALTER TABLE public.racetec_results     ADD COLUMN IF NOT EXISTS split_id integer;
