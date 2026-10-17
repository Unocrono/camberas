-- =============================================================================
-- Enlace externo de inscripción por recorrido (17-oct-2026)
--
-- Igual que la «URL alternativa de resultados» (20261002100000): cuando la
-- inscripción se hace fuera de Camberas (uno.es, la web del organizador…),
-- el botón «Inscribirme» del recorrido lleva a ese enlace en vez de abrir el
-- formulario. Regla:
--   race_distances.registration_url rellena → el botón manda allí;
--   vacía → formulario de Camberas, como hasta ahora.
-- Los PLAZOS siguen mandando: el botón solo está habilitado dentro del rango
-- de fechas del recorrido (registration_opens/closes), tenga enlace o no.
-- Se teclea en Recorridos («Enlace externo de inscripción»).
--
-- 1. Columna + CHECK (solo http/https y sin «usuario@» delante del dominio).
-- 2. evento_publico, POR SUSTITUCIÓN sobre la definición de producción:
--    cada prueba lleva 'inscripcionUrl' con el enlace de su recorrido (el
--    CTE dist hace SELECT d.*, así que la columna nueva ya viaja).
-- 3. duplicar_carrera: el enlace es de cada edición; la duplicada nace sin él.
-- 4. Entre Viñedos 2026: la inscripción está en uno.es (carrera y marcha) y
--    en la web del organizador (infantil).
-- 5. Guardia de horas.
--
-- Se puede volver a ejecutar: cada sustitución mira antes si ya está hecha.
-- =============================================================================

-- ── 1. La columna ───────────────────────────────────────────────────────────
ALTER TABLE public.race_distances ADD COLUMN IF NOT EXISTS registration_url text;

ALTER TABLE public.race_distances DROP CONSTRAINT IF EXISTS race_distances_registration_url_http;
ALTER TABLE public.race_distances
  ADD CONSTRAINT race_distances_registration_url_http
  CHECK (registration_url IS NULL
         OR (registration_url ~* '^https?://[^[:space:]]+$'
             AND registration_url !~* '^https?://[^/?#]*@'));

COMMENT ON COLUMN public.race_distances.registration_url IS
  'Enlace externo de inscripción del recorrido (uno.es, web del organizador…). Rellena: el botón «Inscribirme» lleva ahí, dentro de los plazos. NULL: formulario de Camberas. Solo http(s).';

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
  -- Cada prueba, con el enlace externo de inscripción de su recorrido
  IF position($m$'inscripcionUrl', d.registration_url$m$ IN pg_get_functiondef(v_evento)) = 0 THEN
    PERFORM pg_temp.sustituir(v_evento,
      $r$'resultadosUrl', d\.results_url,$r$,
      $n$'resultadosUrl', d.results_url, 'inscripcionUrl', d.registration_url,$n$,
      1);
  END IF;

  -- La carrera duplicada nace sin el enlace de la edición anterior
  IF position($m$'registration_url', NULL$m$ IN pg_get_functiondef(v_duplicar)) = 0 THEN
    PERFORM pg_temp.sustituir(v_duplicar,
      $r$'results_url', NULL(\s+)\);$r$,
      $n$'results_url', NULL,\1'registration_url', NULL\1);$n$,
      1);
  END IF;
END $s$;

-- ── 4. Entre Viñedos 2026 ───────────────────────────────────────────────────
-- Carrera y Marcha se inscriben en uno.es (formulario individual; los grupos
-- de 10 tienen el suyo, enlazado desde la misma página). La Infantil, en la
-- web del organizador. Los plazos ya están en los recorridos (hasta el 21-oct).
UPDATE public.race_distances
   SET registration_url = 'https://uno.es/carreras/2026-entre-vinedos/individual-registration'
 WHERE id IN ('1792e56f-be42-49f2-9f78-f30aae1bc31f', '979bd18c-ce4a-4da2-a28e-0a01e85f5b4c');
UPDATE public.race_distances
   SET registration_url = 'https://www.carreraentrevinedos.com'
 WHERE id = '17dd386a-70d7-4a93-a0ac-fae53927daee';

-- ── 5. Guardia de horas ─────────────────────────────────────────────────────
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $g$;

-- ── Comprobación (solo lectura) ─────────────────────────────────────────────
-- Esperado: columna = t · las dos marcas = t · 3 recorridos con enlace · 0 fallos.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'race_distances' AND column_name = 'registration_url') AS columna,
  position('''inscripcionUrl'', d.registration_url' IN pg_get_functiondef('public.evento_publico(text)'::regprocedure)) > 0 AS prueba_con_url,
  position('''registration_url'', NULL' IN pg_get_functiondef('public.duplicar_carrera(uuid, text, date, text, boolean)'::regprocedure)) > 0 AS duplicar_sin_url,
  (SELECT count(*) FROM public.race_distances WHERE race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c' AND registration_url IS NOT NULL) AS entre_vinedos_con_enlace,
  (SELECT count(*) FROM public.guardia_horas() WHERE nivel = 'FALLO') AS fallos_horas;
