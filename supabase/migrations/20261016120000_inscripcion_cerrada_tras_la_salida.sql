-- ============================================================
-- INSCRIPCIÓN CERRADA A LA SALIDA DEL RECORRIDO
--
-- El dueño (16-oct): «el botón de inscribirse todavía está activo una vez
-- pasada la fecha y hora de la salida de la carrera; debiera estar
-- desactivado». Peña Prieta (3-oct) seguía ofreciendo «Inscribirme» días
-- después de correrse.
--
-- Regla: un recorrido deja de admitir inscripciones en su fecha de cierre
-- (registration_closes, como hasta ahora) y, como muy tarde, a su SALIDA:
-- la oficial (race_waves.start_time) o, si no tiene, las 23:59 del día de la
-- carrera. Es la que ya cierra las cesiones de dorsal:
-- hora_salida_recorrido(), que devuelve el instante real (alineada el 27-sep
-- en 20260927210000) y se compara con now().
--
-- Las tres funciones que dicen a la web si un recorrido está abierto no
-- miraban la salida (solo el plazo, y «celebrada» desde el día siguiente):
--   · estado_carreras()       listado de carreras e inicio
--   · evento_publico(text)    web propia de la carrera (caché de 90 s)
--   · widget_carrera(text)    widget.js en webs de terceros
-- A las tres se les añade la misma condición justo antes de la de plazas
-- agotadas. La ficha de camberas.com (RaceDetail) aplica la misma regla en el
-- navegador (src/lib/cierreInscripcion.ts).
--
-- Se cambia por SUSTITUCIÓN sobre la definición de producción
-- (pg_get_functiondef), como 20260927210000 y 20261002100000: no se copia
-- ninguna función a mano, y si el texto que se busca no aparece exactamente
-- una vez la migración se para entera sin cambiar nada. Se puede volver a
-- ejecutar: lo que ya tiene la condición no se toca.
--
-- PENDIENTE DE APLICAR en producción (panel de Supabase).
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '2s';

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
  v_listado constant regprocedure := 'public.estado_carreras()';
  v_evento  constant regprocedure := 'public.evento_publico(text)';
  v_widget  constant regprocedure := 'public.widget_carrera(text)';
BEGIN
  -- Listado: antes de «agotada», «cerrada» si ya se dio la salida
  IF position('hora_salida_recorrido(d.id)' IN pg_get_functiondef(v_listado)) = 0 THEN
    PERFORM pg_temp.sustituir(v_listado,
      $p$(WHEN\s+d\.max_participants\s+IS\s+NOT\s+NULL\s+AND\s+public\.plazas_libres\(d\.id\)\s*<=\s*0\s+THEN\s+'agotada')$p$,
      $n$WHEN now() >= public.hora_salida_recorrido(d.id) THEN 'cerrada'
             \1$n$, 1);
  END IF;

  -- Web propia: lo mismo en sus recorridos (el estado de la carrera sale de ellos)
  IF position('hora_salida_recorrido(d.id)' IN pg_get_functiondef(v_evento)) = 0 THEN
    PERFORM pg_temp.sustituir(v_evento,
      $p$(WHEN\s+d\.max_participants\s+IS\s+NOT\s+NULL\s+AND\s+public\.plazas_libres\(d\.id\)\s*<=\s*0\s+THEN\s+'agotada')$p$,
      $n$WHEN now() >= public.hora_salida_recorrido(d.id) THEN 'cerrada'
             \1$n$, 1);
  END IF;

  -- Widget: sus estados son proxima / cerrada / completa / abierta
  IF position('hora_salida_recorrido(d.id)' IN pg_get_functiondef(v_widget)) = 0 THEN
    PERFORM pg_temp.sustituir(v_widget,
      $p$(WHEN\s+d\.max_participants\s+IS\s+NOT\s+NULL\s+AND\s+public\.plazas_libres\(d\.id\)\s*<=\s*0\s+THEN\s+'completa')$p$,
      $n$WHEN now() >= public.hora_salida_recorrido(d.id) THEN 'cerrada'
                              \1$n$, 1);
  END IF;
END $s$;

-- Guardia de horas (CLAUDE.md): ninguna función con horas mal tratadas
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- Que la web propia no enseñe hasta 90 s el estado de antes. No se borra la
-- caché: se da por caducada, así cada carrera conserva su copia de reserva y
-- solo la recalcula quien gana el candado (20261001200500). Al final, para
-- que las filas queden bloqueadas solo lo que dura el COMMIT.
UPDATE public.evento_publico_cache SET generado = '-infinity';

COMMIT;

-- =============================================================================
-- Comprobaciones (después de aplicar)
-- =============================================================================
-- Las tres llevan la condición y siguen abiertas a los invitados (CREATE OR
-- REPLACE conserva los permisos): todo true
SELECT p.proname,
       position('hora_salida_recorrido(d.id)' IN pg_get_functiondef(p.oid)) > 0 AS cierra_a_la_salida,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_puede
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('estado_carreras', 'evento_publico', 'widget_carrera');

-- Carreras de los últimos días y las próximas: con la salida dada, «cerrada»
-- (al día siguiente, «celebrada»)
SELECT r.name, r.date, e.estado
  FROM public.estado_carreras() e JOIN public.races r ON r.id = e.race_id
 WHERE r.date BETWEEN public.hoy_local() - 3 AND public.hoy_local() + 30
 ORDER BY r.date;
