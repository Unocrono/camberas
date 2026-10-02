-- =============================================================================
-- URL alternativa de resultados por recorrido (2-oct-2026)
--
-- Las fichas de los eventos enlazan «Resultados» / «Clasificaciones» a los
-- resultados de Camberas. Mientras esa parte no esté del todo, las carreras
-- cronometradas fuera (RaceTec) tienen que poder enlazar a su web. Regla:
--   race_distances.results_url rellena → manda ella; vacía → Camberas.
-- Se teclea en Recorridos («URL alternativa de resultados»).
--
-- 1. Columna + CHECK (solo http/https y sin «usuario@» delante del dominio:
--    el valor acaba en un href público).
-- 2. evento_publico (web propia de la carrera), POR SUSTITUCIÓN sobre la
--    definición de producción (norma de la casa: nunca el fichero entero):
--      · cada prueba lleva 'resultadosUrl' con la de su recorrido;
--      · 'clasificaciones.url' es la primera alternativa de sus recorridos
--        (en su orden) y, si no hay ninguna, la de Camberas, como hasta ahora;
--        'tiempoReal' solo es true cuando son los resultados de Camberas;
--      · 'clasificaciones.urlCamberas' es siempre la de Camberas: en una
--        carrera mixta, el recorrido SIN alternativa enlaza ahí y no a la
--        alternativa de otro recorrido.
--    evento_publico_cache (copia de 90 s) no cambia: guarda lo que devuelva.
-- 3. duplicar_carrera: la URL de resultados es de cada edición; la carrera
--    duplicada nace sin ella (la función copia la fila entera del recorrido).
-- 4. Guardia de horas: obligatoria tras tocar funciones. De paso arregla el
--    único FALLO que había (current_date en buscar_inscripcion_consulta).
--
-- Se puede volver a ejecutar: cada sustitución mira antes si ya está hecha.
-- Ensayado en producción el 2-oct dentro de una transacción deshecha: sin URL
-- la respuesta de evento_publico solo gana la clave urlCamberas; con URL,
-- clasificaciones.url es la alternativa, tiempoReal pasa a false y
-- 'anteriores' se conserva.
--
-- No toca permisos ni firmas: las funciones conservan los suyos.
-- =============================================================================

-- ── 1. La columna ───────────────────────────────────────────────────────────
ALTER TABLE public.race_distances ADD COLUMN IF NOT EXISTS results_url text;

ALTER TABLE public.race_distances DROP CONSTRAINT IF EXISTS race_distances_results_url_http;
ALTER TABLE public.race_distances
  ADD CONSTRAINT race_distances_results_url_http
  CHECK (results_url IS NULL
         OR (results_url ~* '^https?://[^[:space:]]+$'
             -- sin «usuario@» delante del dominio (https://camberas.com@otro.sitio/)
             AND results_url !~* '^https?://[^/?#]*@'));

COMMENT ON COLUMN public.race_distances.results_url IS
  'URL alternativa de resultados del recorrido (p. ej. RaceTec). Rellena: los botones de resultados y clasificaciones llevan ahí. NULL: resultados de Camberas. Solo http(s).';

-- ── 2 y 3. Funciones, por sustitución ───────────────────────────────────────
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

DO $s$
DECLARE
  v_evento   constant regprocedure := 'public.evento_publico(text)';
  v_duplicar constant regprocedure := 'public.duplicar_carrera(uuid, text, date, text, boolean)';
BEGIN
  -- Cada prueba, con la URL de resultados de su recorrido
  IF position($m$'resultadosUrl', d.results_url$m$ IN pg_get_functiondef(v_evento)) = 0 THEN
    PERFORM pg_temp.sustituir(v_evento,
      $r$'imagen',(\s+)d\.image_url,$r$,
      $n$'imagen',\1d.image_url, 'resultadosUrl', d.results_url,$n$,
      1);
  END IF;

  -- Clasificaciones de la carrera: la primera alternativa o, si no hay,
  -- Camberas; y urlCamberas, siempre la de Camberas
  IF position('dr.results_url IS NOT NULL' IN pg_get_functiondef(v_evento)) = 0 THEN
    PERFORM pg_temp.sustituir(v_evento,
      $r$'url', 'https://camberas\.com/' \|\| COALESCE\(ra\.slug, ra\.id::text\) \|\| '/live',(\s+)'tiempoReal', true\)$r$,
      $n$'url', COALESCE((SELECT dr.results_url FROM dist dr WHERE dr.results_url IS NOT NULL ORDER BY dr.display_order NULLS LAST, dr.distance_km LIMIT 1), 'https://camberas.com/' || COALESCE(ra.slug, ra.id::text) || '/live'),\1'tiempoReal', NOT EXISTS (SELECT 1 FROM dist dr WHERE dr.results_url IS NOT NULL),\1'urlCamberas', 'https://camberas.com/' || COALESCE(ra.slug, ra.id::text) || '/live')$n$,
      1);
  ELSIF position('urlCamberas' IN pg_get_functiondef(v_evento)) = 0 THEN
    -- Producción ya tenía la primera versión de esta migración (sin urlCamberas)
    PERFORM pg_temp.sustituir(v_evento,
      $r$('tiempoReal', NOT EXISTS \(SELECT 1 FROM dist dr WHERE dr\.results_url IS NOT NULL\))\)$r$,
      $n$\1, 'urlCamberas', 'https://camberas.com/' || COALESCE(ra.slug, ra.id::text) || '/live')$n$,
      1);
  END IF;

  -- La carrera duplicada nace sin la URL de resultados de la edición anterior
  IF position($m$'results_url', NULL$m$ IN pg_get_functiondef(v_duplicar)) = 0 THEN
    PERFORM pg_temp.sustituir(v_duplicar,
      $r$'registration_closes', v_dist\.registration_closes \+ make_interval\(days => v_delta\)(\s+)\);$r$,
      $n$'registration_closes', v_dist.registration_closes + make_interval(days => v_delta),\1  'results_url', NULL\1);$n$,
      1);
  END IF;
END $s$;

-- ── 4. Guardia de horas ─────────────────────────────────────────────────────
-- Había un FALLO de antes (visto el 2-oct, no es de esta migración):
-- buscar_inscripcion_consulta (20260928120000) acota «carreras de los últimos
-- 30 días» con current_date, que es el día de UTC. Lo de siempre:
-- public.hoy_local(). Sin él, la guardia cortaría esta migración.
DO $h$
BEGIN
  IF position('current_date' IN pg_get_functiondef('public.buscar_inscripcion_consulta(uuid,text,text,date)'::regprocedure)) > 0 THEN
    PERFORM pg_temp.sustituir('public.buscar_inscripcion_consulta(uuid,text,text,date)',
                              'current_date - 30', 'public.hoy_local() - 30', 1);
  END IF;
END $h$;

DO $g$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $g$;

-- ── Comprobación (solo lectura) ─────────────────────────────────────────────
-- Esperado: columna = t · las cuatro marcas = t · 0 fallos de horas.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'race_distances' AND column_name = 'results_url') AS columna,
  position('''resultadosUrl'', d.results_url' IN pg_get_functiondef('public.evento_publico(text)'::regprocedure)) > 0 AS prueba_con_url,
  position('FROM dist dr WHERE dr.results_url IS NOT NULL' IN pg_get_functiondef('public.evento_publico(text)'::regprocedure)) > 0 AS clasificaciones_con_alternativa,
  position('''urlCamberas''' IN pg_get_functiondef('public.evento_publico(text)'::regprocedure)) > 0 AS con_url_camberas,
  position('''results_url'', NULL' IN pg_get_functiondef('public.duplicar_carrera(uuid, text, date, text, boolean)'::regprocedure)) > 0 AS duplicar_sin_url,
  (SELECT count(*) FROM public.guardia_horas() WHERE nivel = 'FALLO') AS fallos_horas;
