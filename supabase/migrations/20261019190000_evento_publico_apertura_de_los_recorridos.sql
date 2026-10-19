-- =============================================================================
-- evento_publico: la apertura y el cierre de inscripciones de la web salen de
-- los recorridos (19-oct-2026).
--
-- La portada de la web propia (cuenta atrás «Abren las inscripciones en» y la
-- cifra de apertura) y la sección de inscripción leían races.registration_opens
-- y registration_closes, que el panel no deja editar: los plazos se teclean en
-- Recorridos (race_distances). En Monte Tejas el recorrido abría el 24-oct y la
-- portada contaba hasta el 1-nov. Ahora
--   apertura = la primera apertura de los recorridos visibles
--   cierre   = el último cierre de los recorridos visibles
-- y, si ningún recorrido tiene fecha, la de la carrera, como hasta hoy. Es la
-- regla que ya usa estado_carreras (la del recorrido y, si no, la de la
-- carrera), y la ficha y el cobro ya leen las del recorrido.
--
-- Por sustitución sobre la definición de producción (pg_temp.sustituir, como
-- 20261017140000). Se puede volver a ejecutar: mira antes si ya está hecha.
-- Horas: los plazos se devuelven tal cual (hora de pared), sin convertir.
-- Lleva bloques DO: se aplica con la consulta de Lovable, no con el editor SQL.
-- Ensayada en seco y APLICADA el 19-oct-2026.
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

DO $s$
DECLARE
  v_evento constant regprocedure := 'public.evento_publico(text)';
BEGIN
  IF position('min(COALESCE(dist.registration_opens' IN pg_get_functiondef(v_evento)) = 0 THEN
    PERFORM pg_temp.sustituir(v_evento,
      $r$'apertura',(\s+)ra\.registration_opens,$r$,
      $n$'apertura',\1COALESCE((SELECT min(COALESCE(dist.registration_opens, ra.registration_opens)) FROM dist), ra.registration_opens),$n$,
      1);
    PERFORM pg_temp.sustituir(v_evento,
      $r$'cierre',(\s+)ra\.registration_closes,$r$,
      $n$'cierre',\1COALESCE((SELECT max(COALESCE(dist.registration_closes, ra.registration_closes)) FROM dist), ra.registration_closes),$n$,
      1);
  END IF;
END $s$;

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- Comprobación: Monte Tejas abre el 24-oct a las 20:00 y cierra el 7-dic
SELECT public.evento_publico('trail-navideno-monte-tejas-2026')->'inscripcion'->>'apertura' AS apertura,
       public.evento_publico('trail-navideno-monte-tejas-2026')->'inscripcion'->>'cierre' AS cierre;
