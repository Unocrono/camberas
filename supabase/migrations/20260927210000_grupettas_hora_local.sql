-- ============================================================
-- GRUPETTAS Y SALIDAS, A HORA LOCAL (27-sep) — norma de CLAUDE.md:
-- las horas de carrera son hora de pared (llegan +00 pero no son UTC);
-- solo el GPS y now() son instantes reales.
--
-- Tras 20260927200000 (gps_capture_window lee la salida tal cual), quedaban
-- tres sitios que seguían convirtiendo:
--   · grupettas: crear_grupetta y actualizar_grupetta GUARDABAN la salida
--     como instante real (09:00 de Madrid → 07:00+00) y mis_grupettas la
--     volvía a convertir para enseñarla. Con la ventana ya corregida, la
--     captura de una grupetta se abría y cerraba 2 h antes.
--   · evento_publico enseñaba la salida de las webs propias 2 h tarde.
--   · hora_salida_recorrido devolvía la hora de pared y las cesiones de
--     dorsal la comparaban con now(): se cerraban 2 h tarde.
--
-- Las funciones se corrigen sustituyendo SOLO la expresión mala sobre su
-- definición de producción (pg_get_functiondef), con comprobación de que
-- cambia exactamente una aparición: nada se copia a mano.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '2s';

-- 1. Datos: las olas de grupetta guardadas como instante real pasan a hora
--    de pared (07:00+00, que era las 09:00 de Madrid → 09:00+00)
DO $$
DECLARE n int;
BEGIN
  UPDATE public.race_waves w
     SET start_time = (w.start_time AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
    FROM public.races r
   WHERE r.id = w.race_id AND r.group_type = 'grupetta' AND w.start_time IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Olas de grupetta pasadas a hora local: %', n;
END $$;

-- 2. Funciones: una sustitución exacta por función
CREATE OR REPLACE FUNCTION pg_temp.sustituir(p_fn regprocedure, p_patron text, p_nuevo text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE d text; n int;
BEGIN
  d := pg_get_functiondef(p_fn);
  SELECT count(*) INTO n FROM regexp_matches(d, p_patron, 'g');
  IF n <> 1 THEN
    RAISE EXCEPTION '%: se esperaba 1 aparición de la expresión y hay %', p_fn, n;
  END IF;
  EXECUTE regexp_replace(d, p_patron, p_nuevo);
END $f$;

-- crear_grupetta: la hora tecleada se guarda tal cual
SELECT pg_temp.sustituir('public.crear_grupetta(text,date,time without time zone,text)',
  $p$\(\(p_fecha::text \|\| ' ' \|\| p_hora::text\)::timestamp AT TIME ZONE 'Europe/Madrid'\)$p$,
  $n$((p_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'UTC')$n$);

-- actualizar_grupetta: al cambiar la hora…
SELECT pg_temp.sustituir('public.actualizar_grupetta(uuid,text,date,time without time zone,text,boolean,text,text,numeric,integer)',
  $p$\(\(v_fecha::text \|\| ' ' \|\| p_hora::text\)::timestamp AT TIME ZONE 'Europe/Madrid'\)$p$,
  $n$((v_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'UTC')$n$);
-- …y al cambiar solo la fecha, conservando la hora tal cual
SELECT pg_temp.sustituir('public.actualizar_grupetta(uuid,text,date,time without time zone,text,boolean,text,text,numeric,integer)',
  $p$to_char\(w\.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI'\)\)::timestamp\s+AT TIME ZONE 'Europe/Madrid'\)$p$,
  $n$to_char(w.start_time AT TIME ZONE 'UTC', 'HH24:MI:SS'))::timestamp AT TIME ZONE 'UTC')$n$);

-- mis_grupettas: la hora se enseña tal cual
SELECT pg_temp.sustituir('public.mis_grupettas()',
  $p$to_char\(w\.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI'\)$p$,
  $n$to_char(w.start_time AT TIME ZONE 'UTC', 'HH24:MI')$n$);

-- evento_publico (webs propias): la salida se enseña tal cual
SELECT pg_temp.sustituir((SELECT p.oid::regprocedure FROM pg_proc p
                            WHERE p.proname = 'evento_publico' AND p.pronamespace = 'public'::regnamespace),
  $p$to_char\(min\(w\.start_time\) AT TIME ZONE 'Europe/Madrid', 'HH24:MI'\)$p$,
  $n$to_char(min(w.start_time) AT TIME ZONE 'UTC', 'HH24:MI')$n$);

-- hora_salida_recorrido: la comparan con now() (cesiones), así que devuelve
-- el instante real de la salida: hora de pared situada en Madrid
SELECT pg_temp.sustituir('public.hora_salida_recorrido(uuid)',
  $p$COALESCE\(\s*w\.start_time,$p$,
  $n$COALESCE(
           (w.start_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Madrid',$n$);

-- 3. Guardia: ninguna función convierte ya una salida con Europe/Madrid
DO $$
DECLARE malas text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO malas
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND pg_get_functiondef(p.oid) ~* $r$start_time\)?\s+AT TIME ZONE\s+'Europe/Madrid'$r$;
  IF malas IS NOT NULL THEN
    RAISE EXCEPTION 'Siguen convirtiendo la hora de salida: %', malas;
  END IF;
END $$;

COMMIT;
