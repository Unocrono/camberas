-- =============================================================================
-- evento_publico: 'camiseta' y 'sanitario' siempre objeto (o ausentes)
--
-- En el merge final, `web.cam || jsonb_strip_nulls(COALESCE(calculado.j->'camiseta', '{}'))`
-- recibía un JSON null (no un NULL de SQL) cuando la carrera no tiene campo
-- de talla o puestos sanitarios: jsonb_build_object guarda la clave con null
-- y COALESCE no la toca. `objeto || 'null'` en jsonb devuelve un ARRAY
-- [objeto, null], y la web no lo entiende. Igual con 'sanitario'.
--
-- Sustitución exacta sobre la definición de producción (patrón de
-- 20260927210000): no se reaplica el fichero entero. No toca horas.
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
  'public.evento_publico(text)',
  $r$NULLIF\(web\.cam \|\| jsonb_strip_nulls\(COALESCE\(calculado\.j->'camiseta', '\{\}'::jsonb\)\), '\{\}'::jsonb\)$r$,
  $n$NULLIF(web.cam || CASE WHEN jsonb_typeof(calculado.j->'camiseta') = 'object' THEN jsonb_strip_nulls(calculado.j->'camiseta') ELSE '{}'::jsonb END, '{}'::jsonb)$n$,
  1);

SELECT pg_temp.sustituir(
  'public.evento_publico(text)',
  $r$NULLIF\(web\.san \|\| jsonb_strip_nulls\(COALESCE\(calculado\.j->'sanitario', '\{\}'::jsonb\)\), '\{\}'::jsonb\)$r$,
  $n$NULLIF(web.san || CASE WHEN jsonb_typeof(calculado.j->'sanitario') = 'object' THEN jsonb_strip_nulls(calculado.j->'sanitario') ELSE '{}'::jsonb END, '{}'::jsonb)$n$,
  1);

-- Guardia de horas: obligatoria tras tocar funciones
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- Comprobaciones: objeto o ausente, nunca array
SELECT slug, jsonb_typeof(e->'camiseta') AS camiseta, jsonb_typeof(e->'sanitario') AS sanitario
  FROM (SELECT r.slug, public.evento_publico(r.slug) AS e FROM public.races r WHERE r.is_visible ORDER BY r.date DESC LIMIT 8) s;
SELECT * FROM public.guardia_horas() WHERE nivel = 'FALLO';
