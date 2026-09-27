-- =============================================================================
-- Asignación de categoría: entre las que cuadran por edad y sexo, gana la de
-- rango de edad más estrecho (la más específica); a igual rango, el orden.
--
-- Modelo FEDME: «Absoluta desde 18 años» como primera categoría y
-- subcategorías Veteranos A/B/C. Con «la primera que cuadre», Absoluta se
-- llevaba a todos; con el rango más estrecho, un corredor de 45 cae en
-- Veteranos A (40-49, rango 9) antes que en Absoluta (18-999). La web hace
-- lo mismo en src/lib/categoryUtils.ts (calculateCategoryByAge).
--
-- Sustitución exacta sobre las definiciones de producción (patrón de
-- 20260927210000): get_race_category (inscripción) y resolver_race_category_id
-- (cesión de dorsal). get_age_category no lee race_categories: no se toca.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.sustituir(p_fn regprocedure, p_patron text, p_nuevo text, p_n int)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE d text; n int;
BEGIN
  d := pg_get_functiondef(p_fn);
  SELECT count(*) INTO n FROM regexp_matches(d, p_patron, 'g');
  IF n <> p_n THEN
    RAISE EXCEPTION '%: se esperaban % apariciones y hay %', p_fn, p_n, n;
  END IF;
  EXECUTE regexp_replace(d, p_patron, p_nuevo, 'g');
END $f$;

SELECT pg_temp.sustituir(
  'public.get_race_category(uuid, date, text)',
  $r$CASE WHEN rc\.gender IS NOT NULL THEN 0 ELSE 1 END,(\s*)rc\.display_order$r$,
  $n$CASE WHEN rc.gender IS NOT NULL THEN 0 ELSE 1 END,\1-- rango de edad más estrecho primero (Absoluta 18+ solo si no cuadra otra)\1(COALESCE(rc.max_age, 999) - COALESCE(rc.min_age, 0)),\1rc.display_order$n$,
  1);

SELECT pg_temp.sustituir(
  'public.resolver_race_category_id(uuid, date, text)',
  $r$CASE WHEN rc\.gender IS NOT NULL THEN 0 ELSE 1 END,(\s*)rc\.display_order$r$,
  $n$CASE WHEN rc.gender IS NOT NULL THEN 0 ELSE 1 END,\1-- rango de edad más estrecho primero (Absoluta 18+ solo si no cuadra otra)\1(COALESCE(rc.max_age, 999) - COALESCE(rc.min_age, 0)),\1rc.display_order$n$,
  1);

-- Guardia de horas: obligatoria tras tocar funciones
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- Comprobación con Gurriana (tras 20260928085000): 45 años → Veteranos A; 30 → Absoluta; 62 → Veteranos C
SELECT public.get_race_category('c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e', DATE '1982-06-01', 'M') AS hombre_45,
       public.get_race_category('c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e', DATE '1997-06-01', 'F') AS mujer_30,
       public.get_race_category('c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e', DATE '1965-06-01', 'M') AS hombre_62;
SELECT * FROM public.guardia_horas() WHERE nivel = 'FALLO';
