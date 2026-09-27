-- ============================================================
-- HORA DE SALIDA PREVISTA (race_waves.hora_prevista) JUNTO A LA OFICIAL
-- (start_time) — decisión del dueño, 27-sep:
--
--   · hora_prevista: la salida PLANIFICADA. Se escribe solo en Recorridos
--     (y al crear: asistente, duplicar_carrera, grupettas). La leen el
--     rutómetro y las webs públicas con el texto «Hora de salida prevista».
--   · start_time: la salida OFICIAL. Todo el cronometraje, las ventanas
--     GPS y de cronometraje, las cesiones y los relojes la siguen leyendo,
--     sin cambios.
--   · Al CREAR, la oficial nace como copia de la prevista.
--   · Al cambiar la prevista en Recorridos, el formulario PREGUNTA
--     «¿Esta hora es también la salida oficial?»: solo con un Sí cambia
--     start_time. Ningún trigger copia nada al actualizar. (Si cambia la
--     FECHA, la oficial se mueve de día conservando su hora: lo hace el
--     formulario, porque el cronometraje usa la fecha completa.)
--   · En Cronometraje › Horas de Salida la oficial se edita y la prevista
--     se ve sin poder tocarla.
--
-- Norma de horas: las dos son hora de pared +00, nunca se convierten.
-- Las funciones se cambian sustituyendo solo la expresión exacta sobre su
-- definición de producción, con el número de apariciones comprobado.
-- El ensayo (con ROLLBACK) va aparte: nada de ensayos después del COMMIT.
--
-- APLICADA en producción el 27-sep, tras ensayarla con ROLLBACK (la prueba
-- de duplicar_carrera no pudo completarse: duplicar_carrera YA fallaba antes
-- de este cambio en ADEMCO, Loiu y Peña Prieta, por categorías y controles).
-- Comprobado después: columna creada y legible por anon, 30 olas con
-- prevista = oficial, Peña Prieta igual en la web (09:30/09:00/09:30) y en la
-- ventana GPS, guardia 0 FALLO, trigger race_waves_completar_salidas activo.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
-- race_waves la lee la política de subida de posiciones (vía la ventana
-- GPS): antes abortar que dejar a los móviles en cola detrás de un bloqueo
SET LOCAL lock_timeout = '2s';

-- 1. Columna --------------------------------------------------------------
ALTER TABLE public.race_waves ADD COLUMN IF NOT EXISTS hora_prevista timestamptz;

COMMENT ON COLUMN public.race_waves.hora_prevista IS
  'Salida PREVISTA (planificación, no oficial). Hora de pared +00, nunca se convierte. La escribe Recorridos (y asistente, duplicar_carrera, grupettas). La leen el rutómetro y las webs públicas («Hora de salida prevista").';
COMMENT ON COLUMN public.race_waves.start_time IS
  'Salida OFICIAL (cronometraje). Hora de pared +00, nunca se convierte. Nace como copia de hora_prevista; cambia en Cronometraje › Horas de Salida, en /start o en Recorridos si el organizador lo confirma. La leen todo el cronometraje, las ventanas y los plazos.';

-- 2. Relleno: prevista := oficial en todas las olas (hoy 34: 30 con hora y
--    4 vacías, que siguen vacías). Sin tocar updated_at, que es el único
--    rastro de quién movió una salida por última vez.
ALTER TABLE public.race_waves DISABLE TRIGGER update_race_waves_updated_at;
UPDATE public.race_waves SET hora_prevista = start_time WHERE hora_prevista IS NULL;
ALTER TABLE public.race_waves ENABLE TRIGGER update_race_waves_updated_at;

-- 3. Solo al INSERTAR: la que venga vacía se completa con la otra (una ola
--    nueva con prevista nace con oficial igual, y una creada desde /start o
--    una semilla solo con oficial tiene también prevista). Al actualizar,
--    nada.
CREATE OR REPLACE FUNCTION public.race_waves_completar_salidas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $f$
BEGIN
  IF NEW.start_time IS NULL THEN
    NEW.start_time := NEW.hora_prevista;
  END IF;
  IF NEW.hora_prevista IS NULL THEN
    NEW.hora_prevista := NEW.start_time;
  END IF;
  RETURN NEW;
END;
$f$;
REVOKE EXECUTE ON FUNCTION public.race_waves_completar_salidas() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS race_waves_completar_salidas ON public.race_waves;
CREATE TRIGGER race_waves_completar_salidas
  BEFORE INSERT ON public.race_waves
  FOR EACH ROW EXECUTE FUNCTION public.race_waves_completar_salidas();

-- 4. Funciones que escriben una salida o la enseñan al público -------------
CREATE OR REPLACE FUNCTION pg_temp.sustituir(p_fn regprocedure, p_patron text, p_nuevo text, p_n int DEFAULT 1)
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

-- 4a. crear_grupetta: la hora del capo es un plan y una grupetta no se
--     cronometra: va a las DOS columnas
SELECT pg_temp.sustituir('public.crear_grupetta(text,date,time without time zone,text)',
  $p$start_time = CASE WHEN p_hora IS NULL THEN NULL$p$,
  $n$hora_prevista = CASE WHEN p_hora IS NULL THEN NULL
      ELSE ((p_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'UTC') END,
    start_time = CASE WHEN p_hora IS NULL THEN NULL$n$);

-- 4b. actualizar_grupetta, hora nueva: las dos columnas
SELECT pg_temp.sustituir('public.actualizar_grupetta(uuid,text,date,time without time zone,text,boolean,text,text,numeric,integer)',
  $p$start_time = \(\(v_fecha::text \|\| ' ' \|\| p_hora::text\)::timestamp AT TIME ZONE 'UTC'\)$p$,
  $n$hora_prevista = ((v_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'UTC'),
      start_time = ((v_fecha::text || ' ' || p_hora::text)::timestamp AT TIME ZONE 'UTC')$n$);

-- 4c. actualizar_grupetta, solo cambia la fecha: se mueven las dos, cada
--     una conservando su hora
SELECT pg_temp.sustituir('public.actualizar_grupetta(uuid,text,date,time without time zone,text,boolean,text,text,numeric,integer)',
  $p$UPDATE race_waves w SET\s+start_time = \(\(p_fecha::text$p$,
  $n$UPDATE race_waves w SET
      hora_prevista = ((p_fecha::text || ' ' ||
        to_char(w.hora_prevista AT TIME ZONE 'UTC', 'HH24:MI:SS'))::timestamp AT TIME ZONE 'UTC'),
      start_time = ((p_fecha::text$n$);
SELECT pg_temp.sustituir('public.actualizar_grupetta(uuid,text,date,time without time zone,text,boolean,text,text,numeric,integer)',
  $p$AND w\.start_time IS NOT NULL;$p$,
  $n$AND (w.start_time IS NOT NULL OR w.hora_prevista IS NOT NULL);$n$);

-- 4d. duplicar_carrera: la edición nueva copia el PLAN (nunca la oficial del
--     año pasado: así heredó la Garita 2026 las 10:02:04 y 10:31:55 de 2025),
--     desplazado los mismos días, en las dos columnas. Los días se suman a
--     la hora de pared (AT TIME ZONE 'UTC'), sin depender de la zona de la
--     sesión.
SELECT pg_temp.sustituir('public.duplicar_carrera(uuid,text,date,text,boolean)',
  $p$INSERT INTO public\.race_waves \(race_id, race_distance_id, wave_name, start_time\)[^;]*start_time = EXCLUDED\.start_time;$p$,
  $n$INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, hora_prevista, start_time)
    SELECT v_nuevo, v_id, wave_name,
           ((COALESCE(hora_prevista, start_time) AT TIME ZONE 'UTC') + make_interval(days => v_delta)) AT TIME ZONE 'UTC',
           ((COALESCE(hora_prevista, start_time) AT TIME ZONE 'UTC') + make_interval(days => v_delta)) AT TIME ZONE 'UTC'
    FROM public.race_waves WHERE race_distance_id = v_dist.id
    ON CONFLICT (race_distance_id) DO UPDATE SET wave_name = EXCLUDED.wave_name,
      hora_prevista = EXCLUDED.hora_prevista, start_time = EXCLUDED.start_time;$n$);

-- 4e. evento_publico (webs propias): 'salida' pasa a ser la PREVISTA. La
--     clave se llama igual; en las plantillas cambia solo el texto.
SELECT pg_temp.sustituir('public.evento_publico(text)',
  $p$to_char\(min\(w\.start_time\) AT TIME ZONE 'UTC', 'HH24:MI'\)\s+FROM race_waves w WHERE w\.race_distance_id = d\.id AND w\.start_time IS NOT NULL\) AS salida$p$,
  $n$to_char(min(w.hora_prevista) AT TIME ZONE 'UTC', 'HH24:MI')
              FROM race_waves w WHERE w.race_distance_id = d.id AND w.hora_prevista IS NOT NULL) AS salida$n$);

-- NO se tocan, a propósito (siguen con la OFICIAL): auto_create_wave_for_distance,
-- calculate_split_times, calculate_race_results, generate_split_times,
-- process_event_results, cronometrador_contexto, cronometraje_window,
-- cronometraje_en_ventana, gps_capture_window, get_live_gps_positions,
-- hora_salida_recorrido, cesion_*, mis_grupettas.

-- 4f. La guardia de horas vigila también la columna nueva
SELECT pg_temp.sustituir('public.guardia_horas()',
  $p$start_time\|fecha_limite$p$,
  $n$start_time|hora_prevista|fecha_limite$n$, 2);
SELECT pg_temp.sustituir('public.guardia_horas()',
  $p$\('race_waves','start_time'\),$p$,
  $n$('race_waves','start_time'),('race_waves','hora_prevista'),$n$);

-- 5. Comprobaciones: si algo falla, se deshace todo ------------------------
DO $$
DECLARE n int; malas text;
BEGIN
  -- Relleno completo: ahora mismo prevista = oficial en todas
  SELECT count(*) INTO n FROM public.race_waves WHERE hora_prevista IS DISTINCT FROM start_time;
  IF n <> 0 THEN RAISE EXCEPTION 'Relleno: % olas distintas', n; END IF;

  -- Las cuatro funciones reescritas
  SELECT string_agg(f, ', ') INTO malas
    FROM unnest(ARRAY['public.crear_grupetta(text,date,time without time zone,text)',
                      'public.actualizar_grupetta(uuid,text,date,time without time zone,text,boolean,text,text,numeric,integer)',
                      'public.duplicar_carrera(uuid,text,date,text,boolean)',
                      'public.evento_publico(text)']) AS f
   WHERE pg_get_functiondef(f::regprocedure) NOT LIKE '%hora_prevista%';
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Sin reescribir: %', malas; END IF;

  -- Cronometraje, ventanas y plazos siguen con la OFICIAL: ninguno lee la prevista
  SELECT string_agg(p.proname, ', ') INTO malas
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('calculate_split_times','calculate_race_results','generate_split_times','process_event_results',
                       'calculate_split_positions','cronometrador_contexto','cronometraje_window','cronometraje_en_ventana',
                       'gps_capture_window','get_live_gps_positions','hora_salida_recorrido','cesion_crear','cesion_info',
                       'cesion_aceptar','mis_grupettas')
     AND p.prosrc LIKE '%hora_prevista%';
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Una función de cronometraje o ventana lee hora_prevista: %', malas; END IF;

  -- Guardia de horas (CLAUDE.md): ningún FALLO
  SELECT string_agg(nombre || ' [' || left(regla, 2) || ']', ', ') INTO malas
    FROM public.guardia_horas() WHERE nivel = 'FALLO';
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Siguen convirtiendo horas: %', malas; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
