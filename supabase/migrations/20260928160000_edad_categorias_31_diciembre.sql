-- =============================================================================
-- Edad para las categorías: norma, a 31 de diciembre del año de la carrera.
--
-- Decisión del dueño (28-sep): las carreras nuevas cuentan la edad a 31 de
-- diciembre (races.category_age_reference = 'year_end', federadas y
-- licencia anual). «El día de la carrera» ('race_date') queda como opción
-- para populares, con un selector en la ficha de la carrera del panel.
--
-- Solo cambia el valor por defecto: las carreras que ya existen se quedan
-- como están. Gurriana va a 'year_end' con 20260928150000 y la Peña Prieta
-- y la San Silvestre 2026 ya lo están.
--
-- CHECK NOT VALID: vale para lo nuevo y no revisa filas antiguas.
-- =============================================================================

ALTER TABLE public.races ALTER COLUMN category_age_reference SET DEFAULT 'year_end';

ALTER TABLE public.races DROP CONSTRAINT IF EXISTS races_category_age_reference_check;
ALTER TABLE public.races
  ADD CONSTRAINT races_category_age_reference_check
  CHECK (category_age_reference IN ('year_end', 'race_date')) NOT VALID;

COMMENT ON COLUMN public.races.category_age_reference IS
  'Cuándo se cuenta la edad para la categoría: year_end = a 31 de diciembre del año de la carrera (norma, federadas); race_date = el día de la carrera (populares). La usan get_race_category, resolver_race_category_id y src/lib/categoryUtils.ts.';

-- Comprobaciones ---------------------------------------------------------------
SELECT column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'races' AND column_name = 'category_age_reference';

-- Carreras futuras con categorías por edad y su criterio (no se cambia ninguna)
SELECT r.name, r.date, r.category_age_reference,
       count(*) FILTER (WHERE rc.min_age IS NOT NULL OR rc.max_age IS NOT NULL) AS categorias_por_edad
  FROM public.races r
  JOIN public.race_categories rc ON rc.race_id = r.id
 WHERE r.date >= public.hoy_local()
 GROUP BY r.id, r.name, r.date, r.category_age_reference
 ORDER BY r.date;
