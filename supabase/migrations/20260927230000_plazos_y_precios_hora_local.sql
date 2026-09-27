-- ============================================================
-- PLAZOS, PRECIOS Y «HOY» A HORA LOCAL (27-sep) — norma de CLAUDE.md:
-- las horas de carrera son hora de pared (llegan +00 pero no son UTC);
-- solo el GPS y now() son instantes reales.
--
-- Quedaban funciones que comparaban now() (instante) con aperturas,
-- cierres y tramos de precio (hora de pared): todo llegaba 2 h tarde en
-- verano (1 h en invierno). Y current_date es el día UTC: de 00:00 a
-- 02:00 aún es ayer. Dos ayudantes, gemelos de la web (timezoneUtils):
--   public.ahora_pared()  = ahoraParedMs(): «ahora» en hora de pared +00
--   public.hoy_local()    = hoyLocal(): la fecha de hoy en Madrid
--
-- Datos: Gurriana 2027 y Monte Tejas se sembraron con literales +01/+02
-- (instantes reales). Hoy abren bien POR ACCIDENTE (dos errores que se
-- anulan). Se corrigen EN LA MISMA TRANSACCIÓN que los lectores.
--
-- Mismo método que 20260927210000: sustitución sobre la definición de
-- producción con el número exacto de apariciones comprobado. Ensayado el
-- recuento contra producción el 27-sep (todas las cuentas cuadran) y la
-- guardia sobre el resultado simulado da 0 fallos.
--
-- Va junto con (mismo día, antes del 30-sep 22:00 UTC = 1-oct 00:00
-- Madrid, cuando Loiu cambia de tramo): RaceDetail.tsx, TeamRegister.tsx,
-- CesionPolicyManagement.tsx y las 5 funciones edge de cobro.
--
-- ESTADO (27-sep, 22:30): ENSAYADA entera con ROLLBACK (22 sustituciones
-- cuadran, Gurriana abre 20:00, guardia 0 FALLO). NO APLICADA: se aplica en
-- la misma hora que el Publish de la web, y antes del 1-oct 18:00 UTC.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '2s';

-- 1. Ayudantes -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ahora_pared()
RETURNS timestamptz LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT (now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC' $$;
COMMENT ON FUNCTION public.ahora_pared() IS
  'Ahora como hora de pared de Madrid escrita +00. Se compara TAL CUAL con registration_opens/closes, start_datetime/end_datetime, start_time, fecha_limite. Gemela de ahoraParedMs() en la web.';

CREATE OR REPLACE FUNCTION public.hoy_local()
RETURNS date LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT (now() AT TIME ZONE 'Europe/Madrid')::date $$;
COMMENT ON FUNCTION public.hoy_local() IS
  'Fecha de hoy en Madrid (current_date es la de UTC). Gemela de hoyLocal() en la web.';

GRANT EXECUTE ON FUNCTION public.ahora_pared(), public.hoy_local() TO anon, authenticated, service_role;

-- 2. Sustitución exacta sobre la definición de producción ------------
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

-- Patrones
--  S1  now() <op> <col de pared>      -> public.ahora_pared() <op> <col>
--  S2  <cierre> <op> now()            -> <cierre> <op> public.ahora_pared()
--  S3  current_date                   -> public.hoy_local()
CREATE TEMP TABLE _p(id text PRIMARY KEY, patron text, nuevo text) ON COMMIT DROP;
INSERT INTO _p VALUES
 ('S1', $p$now\(\)(\s*(<=|>=|<|>|BETWEEN)\s*(COALESCE\(\s*)?\w+\.(registration_opens|registration_closes|start_datetime)\M)$p$,
        $n$public.ahora_pared()\1$n$),
 ('S2', $p$(\w+\.registration_closes\s*(<=|>=|<|>)\s*)now\(\)$p$,
        $n$\1public.ahora_pared()$n$),
 ('S3', $p$\m(current_date|CURRENT_DATE)\M$p$,
        $n$public.hoy_local()$n$),
 -- «hoy» del panel del organizador: el día de Madrid, como instante
 ('S4', $p$date_trunc\('day', now\(\)\)$p$,
        $n$(public.hoy_local()::timestamp AT TIME ZONE 'Europe/Madrid')$n$),
 -- caduca_at es instante real: el cierre (pared) o el día de carrera se sitúan en Madrid
 ('S5a', $p$COALESCE\(d\.registration_closes, ra\.date::timestamptz\)$p$,
         $n$(COALESCE(d.registration_closes AT TIME ZONE 'UTC', ra.date::timestamp) AT TIME ZONE 'Europe/Madrid')$n$),
 ('S5b', $p$COALESCE\(max\(d\.registration_closes\), max\(ra\.date\)::timestamptz\)$p$,
         $n$(COALESCE(max(d.registration_closes) AT TIME ZONE 'UTC', max(ra.date)::timestamp) AT TIME ZONE 'Europe/Madrid')$n$),
 ('S6', $p$COALESCE\(v_cierra, v_fecha::timestamptz\)$p$,
        $n$(COALESCE(v_cierra AT TIME ZONE 'UTC', v_fecha::timestamp) AT TIME ZONE 'Europe/Madrid')$n$),
 -- cesiones: fecha_limite pasa a hora de pared (la web deja de convertirla) y
 -- se compara con hora_salida_recorrido, que ya devuelve un instante real
 ('S7', $p$COALESCE\(v_cfg\.fecha_limite, 'infinity'::timestamptz\)$p$,
        $n$COALESCE((v_cfg.fecha_limite AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Madrid', 'infinity'::timestamptz)$n$);

-- Una sentencia por sustitución (como en 20260927210000): cada una lee la
-- definición que dejó la anterior
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT v.f, p.patron, p.nuevo, v.n
  FROM (VALUES
   ('public.estado_carreras()',                               'S1', 4),
   ('public.estado_carreras()',                               'S3', 2),
   ('public.widget_carrera(text)',                            'S1', 3),
   ('public.widget_carrera(text)',                            'S3', 1),
   ('public.evento_publico(text)',                            'S1', 4),  -- precio_vigente, estado x2, periodos.vigente
   ('public.evento_publico(text)',                            'S3', 2),  -- NO toca cupones (valid_until > now()) ni 'generado'
   ('public.avisos_pago_pendientes()',                        'S2', 1),
   ('public.avisos_pago_pendientes()',                        'S3', 1),
   ('public.registrar_pagos_a_medias(integer)',               'S2', 2),
   ('public.registrar_pagos_a_medias(integer)',               'S3', 2),
   ('public.registrar_pagos_a_medias(integer)',               'S5a', 1),
   ('public.registrar_pagos_a_medias(integer)',               'S5b', 1),
   ('public.recuperacion_pago_info(uuid)',                    'S2', 1),
   ('public.recuperacion_pago_info(uuid)',                    'S3', 1),
   ('public.token_recuperacion_inscripcion(uuid)',            'S6', 1),
   ('public.get_organizer_race_summary(uuid)',                'S4', 2),
   ('public.cesion_crear(uuid)',                              'S7', 1),
   ('public.unirse_grupetta(text,text,boolean,boolean)',      'S3', 1),
   ('public.mis_grupettas()',                                 'S3', 1),
   ('public.get_event_participants_replay(uuid,uuid)',        'S3', 1),
   ('public.purge_gps_antiguos()',                            'S3', 2),
   ('public.crear_grupetta(text,date,time without time zone,text)', 'S3', 3)  -- incluye DEFAULT CURRENT_DATE
  ) AS v(f, id, n)
  JOIN _p p USING (id)
  ORDER BY v.f, v.id
  LOOP
    PERFORM pg_temp.sustituir(s.f::regprocedure, s.patron, s.nuevo, s.n);
  END LOOP;
END $$;

-- 3. Datos sembrados como instante real -> hora de pared -------------
--    Solo las filas y valores exactos de las dos siembras; cada UPDATE
--    comprueba cuántas filas toca. NO se tocan los 23:59 / 00:01 de los
--    tramos de Gurriana: se volvieron a guardar desde el panel (26-sep)
--    y ya son hora de pared.
DO $$
DECLARE n int;
BEGIN
  UPDATE public.races
     SET registration_opens  = (registration_opens  AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC',
         registration_closes = (registration_closes AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
   WHERE (id, registration_opens, registration_closes) IN (
     ('c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'::uuid, '2026-10-01 18:00:00+00'::timestamptz, '2027-02-14 23:00:00+00'::timestamptz),
     ('a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'::uuid, '2026-11-01 19:00:00+00'::timestamptz, '2026-12-07 22:59:59+00'::timestamptz));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'races: se esperaban 2 filas y hay %', n; END IF;

  UPDATE public.race_distances
     SET registration_opens  = (registration_opens  AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC',
         registration_closes = (registration_closes AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
   WHERE (id, registration_opens, registration_closes) IN (
     ('d4b0f6e3-8c2a-4f7b-8e1d-4a5b6c7d8e9f'::uuid, '2026-10-01 18:00:00+00'::timestamptz, '2027-02-14 23:00:00+00'::timestamptz),
     ('e5c1a7f4-9d3b-4a8c-9f2e-5b6c7d8e9fa0'::uuid, '2026-10-01 18:00:00+00'::timestamptz, '2027-02-14 23:00:00+00'::timestamptz),
     ('b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d'::uuid, '2026-11-01 19:00:00+00'::timestamptz, '2026-12-07 22:59:59+00'::timestamptz));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'race_distances: se esperaban 3 filas y hay %', n; END IF;

  -- Gurriana: solo el inicio del primer tramo (18:00 -> 20:00)
  UPDATE public.race_distance_prices
     SET start_datetime = (start_datetime AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
   WHERE id IN ('90c5f6a4-adfa-43f8-b864-2bf1e0853aef', 'b278a894-55e3-4936-bdd7-c96a4830279d')
     AND start_datetime = '2026-10-01 18:00:00+00';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'precios Gurriana: se esperaban 2 filas y hay %', n; END IF;

  -- Monte Tejas: inicio y fin (19:00 -> 20:00, 22:59:59 -> 23:59:59)
  UPDATE public.race_distance_prices
     SET start_datetime = (start_datetime AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC',
         end_datetime   = (end_datetime   AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
   WHERE id = 'c6ed6e31-82f7-4477-ab61-09b04cb4e7d6'
     AND start_datetime = '2026-11-01 19:00:00+00' AND end_datetime = '2026-12-07 22:59:59+00';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'precio Monte Tejas: se esperaba 1 fila y hay %', n; END IF;
END $$;

-- 4. La guardia vive en la base: SELECT * FROM public.guardia_horas();
--    (la llaman esta migración, las siguientes que toquen funciones y la
--    comprobación antes de cada carrera: scripts/guardia-horas.sql)
CREATE OR REPLACE FUNCTION public.guardia_horas()
RETURNS TABLE(nivel text, clase text, nombre text, regla text, trozo text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_catalog
AS $g$
WITH k AS (SELECT
  -- columnas de hora de pared (si los cupones pasan a hora de pared, añadir valid_from|valid_until)
  '(registration_opens|registration_closes|start_datetime|end_datetime|start_time|fecha_limite|timing_timestamp|youtube_video_start_time)'::text AS rc,
  -- el reloj real
  '(now\(\)|current_timestamp|clock_timestamp\(\)|statement_timestamp\(\)|transaction_timestamp\(\))'::text AS ck),
reglas(regla, patron) AS (
  SELECT 'a: hora de carrera convertida con Europe/Madrid (leer con AT TIME ZONE ''UTC'')',
         rc || '\)?\s+AT TIME ZONE\s+''Europe/Madrid''' FROM k
  UNION ALL
  SELECT 'b: reloj real comparado con hora de pared (usar public.ahora_pared())',
         ck || '\s*(<=|>=|<>|!=|<|>|=|BETWEEN)\s*((COALESCE|LEAST|GREATEST|min|max)\s*\(\s*)?[\w.]*' || rc || '\M(?!\)?\s*AT TIME ZONE)' FROM k
  UNION ALL
  SELECT 'b: hora de pared comparada con reloj real (usar public.ahora_pared())',
         '[\w.]*' || rc || '\M\)?\s*(<=|>=|<>|!=|<|>|=)\s*' || ck FROM k
  UNION ALL
  SELECT 'c: fecha de carrera pasada a instante UTC (usar fecha::timestamp AT TIME ZONE ''Europe/Madrid'')',
         '\m(\w+\.)?(date|\w*fecha\w*)\)?\s*::\s*(timestamptz|timestamp with time zone)\M'
  UNION ALL
  SELECT 'd: dia u hora de la sesion UTC (usar public.hoy_local() / public.ahora_pared())',
         '\m(current_date|current_time|localtime|localtimestamp)\M|now\(\)\s*::\s*date\M|date_trunc\(\s*''day''\s*,\s*' || ck || '\s*\)' FROM k
),
objetos(clase, nombre, def) AS (
  SELECT 'funcion', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p') AND p.proname <> 'guardia_horas'
  UNION ALL SELECT 'politica', tablename || '.' || policyname, coalesce(qual,'') || ' ' || coalesce(with_check,'')
    FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'vista', viewname::text, definition FROM pg_views WHERE schemaname = 'public'
  UNION ALL SELECT 'vista', matviewname::text, definition FROM pg_matviews WHERE schemaname = 'public'
  UNION ALL SELECT 'cron', jobname, command FROM cron.job
),
fallos AS (
  SELECT 'FALLO'::text nivel, o.clase, o.nombre, r.regla,
         (SELECT string_agg(m[1], ' | ') FROM regexp_matches(o.def, '(' || r.patron || ')', 'gi') m) AS trozo
    FROM objetos o CROSS JOIN reglas r
   WHERE o.def ~* r.patron
  UNION ALL
  -- un valor por defecto con reloj en una columna de hora de pared
  SELECT 'FALLO', 'default', c.relname || '.' || a.attname, 'c: DEFAULT con reloj real en hora de pared',
         pg_get_expr(d.adbin, d.adrelid)
    FROM pg_attrdef d
    JOIN pg_class c ON c.oid = d.adrelid AND c.relnamespace = 'public'::regnamespace
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE (c.relname::text, a.attname::text) IN (('races','registration_opens'),('races','registration_closes'),
          ('race_distances','registration_opens'),('race_distances','registration_closes'),
          ('race_distance_prices','start_datetime'),('race_distance_prices','end_datetime'),
          ('race_waves','start_time'),('race_cesion_config','fecha_limite'),
          ('timing_readings','timing_timestamp'),('race_checkpoints','youtube_video_start_time'))
     AND pg_get_expr(d.adbin, d.adrelid) ~* '(now\(\)|current_|clock_timestamp|localtime)'
),
revisar_funciones AS (
  -- funcion NUEVA que cruza horas de carrera con el reloj: revisarla a mano y añadirla a la lista
  SELECT 'REVISAR'::text nivel, 'funcion'::text clase, p.oid::regprocedure::text nombre,
         'funcion nueva que cruza horas de carrera con el reloj'::text regla, NULL::text trozo
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p')
     AND pg_get_functiondef(p.oid) ~* '(registration_opens|registration_closes|start_datetime|end_datetime|start_time|fecha_limite|timing_timestamp|youtube_video_start_time|\m(ra|r|v_race|races)\.date\M|hora_salida_recorrido|gps_capture_window|cronometraje_window)'
     AND pg_get_functiondef(p.oid) ~* '(now\(\)|current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date|ahora_pared|hoy_local|AT TIME ZONE)'
     AND p.proname NOT IN ('guardia_horas','ahora_pared','hoy_local','actualizar_grupetta','avisos_pago_pendientes','calculate_race_results','calculate_split_times',
       'cesion_aceptar','cesion_crear','cesion_ejecutar','cesion_info','crear_grupetta','cronometrador_editar_lectura',
       'cronometraje_en_ventana','cronometraje_window','devolucion_info','duplicar_carrera','estado_carreras','evento_publico',
       'get_event_participants_replay','get_live_gps_positions','gps_capture_window','hora_salida_recorrido','mis_grupettas',
       'pantalla_contexto','process_event_results','purge_gps_antiguos','recogida_contexto','recuperacion_pago_info',
       'registrar_pagos_a_medias','token_recuperacion_inscripcion','unirse_grupetta','widget_carrera')
),
ventanas AS (
  SELECT 'races' t, r.id, r.name n, 'registration_opens' col, r.registration_opens x FROM races r
  UNION ALL SELECT 'races', r.id, r.name, 'registration_closes', r.registration_closes FROM races r
  UNION ALL SELECT 'race_distances', d.id, r.name || ' / ' || d.name, 'registration_opens', d.registration_opens FROM race_distances d JOIN races r ON r.id = d.race_id
  UNION ALL SELECT 'race_distances', d.id, r.name || ' / ' || d.name, 'registration_closes', d.registration_closes FROM race_distances d JOIN races r ON r.id = d.race_id
  UNION ALL SELECT 'race_distance_prices', p.id, r.name || ' / ' || d.name, 'start_datetime', p.start_datetime FROM race_distance_prices p JOIN race_distances d ON d.id = p.race_distance_id JOIN races r ON r.id = d.race_id
  UNION ALL SELECT 'race_distance_prices', p.id, r.name || ' / ' || d.name, 'end_datetime', p.end_datetime FROM race_distance_prices p JOIN race_distances d ON d.id = p.race_distance_id JOIN races r ON r.id = d.race_id
  UNION ALL SELECT 'race_cesion_config', c.race_id, r.name, 'fecha_limite', c.fecha_limite FROM race_cesion_config c JOIN races r ON r.id = c.race_id
),
revisar_datos AS (
  -- plazos futuros con pinta de instante guardado (23:59 -> 21:59/22:59, 00:00 -> 22:00/23:00)
  SELECT 'REVISAR'::text, 'dato'::text, t || '.' || col || ' ' || id::text,
         'plazo con pinta de instante convertido: ' || n, to_char(x AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
    FROM ventanas
   WHERE x > now() - interval '1 day'
     AND ((to_char(x AT TIME ZONE 'UTC', 'MI') = '59' AND to_char(x AT TIME ZONE 'UTC', 'HH24') <> '23')
       OR (to_char(x AT TIME ZONE 'UTC', 'MI:SS') = '00:00' AND to_char(x AT TIME ZONE 'UTC', 'HH24') IN ('01','02','03','22','23')))
)
SELECT * FROM fallos
UNION ALL SELECT * FROM revisar_funciones
UNION ALL SELECT * FROM revisar_datos
ORDER BY 1, 2, 3
$g$;
COMMENT ON FUNCTION public.guardia_horas() IS 'Guardia de la norma de horas (CLAUDE.md). FALLO debe dar 0 filas; REVISAR se mira a mano. Solo lectura.';
REVOKE EXECUTE ON FUNCTION public.guardia_horas() FROM anon, authenticated, PUBLIC;

-- 5. Guardia: ningún FALLO en funciones, políticas, vistas, cron ni defaults
DO $$
DECLARE malas text;
BEGIN
  SELECT string_agg(nombre || ' [' || left(regla, 2) || ']', ', ') INTO malas
    FROM public.guardia_horas() WHERE nivel = 'FALLO';
  IF malas IS NOT NULL THEN
    RAISE EXCEPTION 'Siguen convirtiendo horas: %', malas;
  END IF;
END $$;

COMMIT;
