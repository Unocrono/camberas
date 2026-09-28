-- =============================================================================
-- get_race_category: sin categoría genérica cuando la carrera tiene las suyas.
--
-- En Gurriana, una corredora nacida en 2020 veía «F-Junior», que no es una
-- categoría de la carrera. Cuando ninguna categoría de la carrera encajaba,
-- la función caía en get_age_category (una tabla genérica de edades: Junior,
-- Senior, Veterano…). Ahora ese respaldo solo se usa si la carrera no tiene
-- ninguna categoría definida; si las tiene y ninguna encaja, devuelve NULL y
-- el formulario lo dice («tu edad no encaja en ninguna categoría»). Es lo
-- mismo que ya hace el trigger (resolver_race_category_id, sin respaldo).
--
-- Por sustitución sobre la definición de producción, valga la firma de 3
-- parámetros o la de 4 (20260928150000): se ejecuta antes o después.
-- =============================================================================

DO $do$
DECLARE
  f regprocedure;
  d text;
  n int;
BEGIN
  SELECT p.oid::regprocedure INTO f
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'get_race_category';
  d := pg_get_functiondef(f);

  IF d LIKE '%respaldo genérico solo sin categorías%' THEN
    RAISE NOTICE 'get_race_category ya estaba corregida';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM regexp_matches(d, 'IF v_category_name IS NULL THEN', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'get_race_category: se esperaba 1 aparición del respaldo y hay %', n; END IF;

  d := regexp_replace(d, 'IF v_category_name IS NULL THEN',
         'IF v_category_name IS NULL
     -- respaldo genérico solo sin categorías propias en la carrera
     AND NOT EXISTS (SELECT 1 FROM race_categories x WHERE x.race_id = p_race_id) THEN');
  EXECUTE d;
END
$do$;

-- Guardia de horas: obligatoria tras tocar funciones
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- Comprobaciones ---------------------------------------------------------------
-- Gurriana: nacida en 2020 → NULL (antes «Junior»); 30 años → Absoluta
SELECT public.get_race_category('c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e', DATE '2020-01-01', 'F') AS nacida_2020,
       public.get_race_category('c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e', DATE '1997-06-01', 'F') AS mujer_30;
-- Los permisos siguen igual (anon y authenticated)
SELECT p.oid::regprocedure AS firma,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public' AND p.proname = 'get_race_category';
