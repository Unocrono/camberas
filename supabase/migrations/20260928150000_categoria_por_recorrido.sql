-- =============================================================================
-- get_race_category con recorrido: la categoría que ENSEÑA el formulario de
-- inscripción, la misma que guarda el trigger.
--
-- get_race_category(p_race_id, birth, gender) miraba todas las categorías de
-- la carrera, sin recorrido. Los formularios (DynamicRegistrationForm y
-- DynamicEditRegistrationForm) la usan para enseñar la categoría y guardarla
-- como texto en «category». Con recorridos de categorías distintas devolvía
-- la de otro: Peña Prieta, hombre de 45 en Skyrace o Trail → «Marcha»;
-- Desafío Sarrio Marcha → «Absoluta» (del 10K). El trigger sí asigna bien
-- (resolver_race_category_id, por recorrido), así que el corredor veía una
-- categoría y se le guardaba otra. Lo encontró la sesión «Camberas Ideas 2».
--
-- Ahora lleva un cuarto parámetro opcional, p_race_distance_id. Con él solo
-- valen las categorías del recorrido y las generales de la carrera, y gana
-- la del recorrido, como en resolver_race_category_id. Sin él (llamadas
-- antiguas, como la actualización masiva de 20260106200411) todo sigue igual.
--
-- Por sustitución sobre la definición de producción (norma de la sesión de
-- horas): se lee con pg_get_functiondef, se cambian cabecera, filtro y
-- orden con conteo exacto, se borra la firma de 3 y se crea la de 4. Si no
-- se borrara, una llamada con 3 argumentos casaría con las dos y fallaría.
-- Los formularios llaman primero con 4 y, si la función aún tiene 3
-- (PGRST202), repiten con 3: la web se puede publicar antes o después.
--
-- Además, Gurriana cuenta la edad a 31 de diciembre (FEDME, temporada):
-- races.category_age_reference = 'year_end'. Estaba en 'race_date', y un
-- nacido en junio de 1987 salía Absoluta (39 el día de la carrera) en vez
-- de Veteranos A (40 en 2027).
-- =============================================================================

DO $do$
DECLARE
  d text;
  n int;
BEGIN
  d := pg_get_functiondef('public.get_race_category(uuid, date, text)'::regprocedure);

  -- 1. Cabecera: cuarto parámetro con valor por defecto
  SELECT count(*) INTO n FROM regexp_matches(d, 'get_race_category\(p_race_id uuid, p_birth_date date, p_gender text\)', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'cabecera: se esperaba 1 aparición y hay %', n; END IF;
  d := regexp_replace(d, 'get_race_category\(p_race_id uuid, p_birth_date date, p_gender text\)',
                      'get_race_category(p_race_id uuid, p_birth_date date, p_gender text, p_race_distance_id uuid DEFAULT NULL::uuid)');

  -- 2. Filtro: con recorrido, las suyas y las generales de la carrera
  SELECT count(*) INTO n FROM regexp_matches(d, 'WHERE rc\.race_id = p_race_id(\s+)AND', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'filtro: se esperaba 1 aparición y hay %', n; END IF;
  d := regexp_replace(d, 'WHERE rc\.race_id = p_race_id(\s+)AND',
                      'WHERE rc.race_id = p_race_id\1AND (p_race_distance_id IS NULL OR rc.race_distance_id IS NULL OR rc.race_distance_id = p_race_distance_id)\1AND');

  -- 3. Orden: primero la del recorrido (sin recorrido, todas empatan aquí)
  SELECT count(*) INTO n FROM regexp_matches(d, 'CASE WHEN rc\.gender IS NOT NULL THEN 0 ELSE 1 END,', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'orden: se esperaba 1 aparición y hay %', n; END IF;
  d := regexp_replace(d, '(\s+)CASE WHEN rc\.gender IS NOT NULL THEN 0 ELSE 1 END,',
                      '\1CASE WHEN p_race_distance_id IS NOT NULL AND rc.race_distance_id = p_race_distance_id THEN 0 ELSE 1 END,\1CASE WHEN rc.gender IS NOT NULL THEN 0 ELSE 1 END,');

  DROP FUNCTION public.get_race_category(uuid, date, text);
  EXECUTE d;
END
$do$;

-- La usan los formularios públicos (invitados incluidos) y el panel
REVOKE EXECUTE ON FUNCTION public.get_race_category(uuid, date, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_race_category(uuid, date, text, uuid) TO anon, authenticated, service_role;

-- Gurriana: edad a 31 de diciembre, como la FEDME
UPDATE public.races SET category_age_reference = 'year_end'
 WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

-- Guardia de horas: obligatoria tras tocar funciones
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- Comprobaciones ---------------------------------------------------------------
-- Una sola firma, con permiso para anon y authenticated
SELECT p.oid::regprocedure AS firma,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public' AND p.proname = 'get_race_category';

-- Por recorrido frente al trigger: cada fila debe dar la misma categoría en las dos columnas
SELECT r.name AS carrera, d.name AS recorrido, v.edad, v.sexo,
       public.get_race_category(r.id, v.nacimiento, v.sexo, d.id) AS formulario,
       (SELECT rc.name FROM public.race_categories rc
         WHERE rc.id = public.resolver_race_category_id(d.id, v.nacimiento, v.sexo)) AS trigger
  FROM public.races r
  JOIN public.race_distances d ON d.race_id = r.id
  CROSS JOIN (VALUES (30, DATE '1997-06-01', 'F'), (45, DATE '1982-06-01', 'M'), (62, DATE '1965-06-01', 'M')) AS v(edad, nacimiento, sexo)
 WHERE r.slug IN ('gurriana-trail-2027', 'desafio-sarrio')
    OR r.name ILIKE '%peña prieta%'
 ORDER BY r.name, d.name, v.edad;

-- Gurriana a 31 de diciembre: nacido en junio de 1987 → Veteranos A
SELECT public.get_race_category('c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e', DATE '1987-06-01', 'M') AS nacido_1987;
SELECT * FROM public.guardia_horas() WHERE nivel = 'FALLO';
