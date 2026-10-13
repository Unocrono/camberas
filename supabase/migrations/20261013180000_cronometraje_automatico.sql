-- ============================================================
-- CRONOMETRAJE AUTOMÁTICO: Camberas cronometra sola, con vueltas y con
-- tiempo chip (petición del dueño, 11/13-oct: «vamos a empezar a
-- automatizarlo todo»).
--
-- Hasta hoy nada era automático: las clasificaciones solo se calculaban
-- cuando alguien pulsaba «Procesar Tiempos y Resultados». Y el cálculo:
--   · tomaba en cada punto la PRIMERA lectura de su alfombra dentro de su
--     ventana, sin saber que la V2 va después de la V1 (Virgen de la
--     Esperanza: 153 de 233 corredores con la misma lectura en V1 y V2);
--   · grababa siempre vuelta 1;
--   · machacaba las correcciones a mano (tiempo y estado) en cada recálculo;
--   · no leía las retiradas que apunta el cronometrador en /timing;
--   · no tenía tiempo chip;
--   · y sacaba el sexo de un texto que en 137 llegados era «Unknown»
--     (gender_id sí lo tenía).
--
-- Lo nuevo:
--   1. MOTOR (motor_pasos + motor_cronometraje): asigna los pasos POR ORDEN.
--      Cada punto de control toma el primer paso por su alfombra posterior al
--      punto anterior; dos lecturas de la misma alfombra a menos del «tiempo
--      mínimo de vuelta» (min_lap_time, 1 minuto si está vacío) son el mismo
--      paso. Las ventanas min_time/max_time siguen valiendo, también en meta.
--      Contrastado en solo lectura contra producción: reproduce 925 de 927
--      llegadas publicadas (las 2 distintas son las correcciones a mano del
--      podio de Andarines, que aquí pasan a tiempo_manual) y arregla las
--      vueltas de la Virgen.
--   2. TIEMPO OFICIAL Y TIEMPO CHIP: finish_time sigue siendo el oficial
--      (pistola: meta − race_waves.start_time). tiempo_chip = meta − última
--      lectura en la alfombra de salida (o la pistola, si cruzó antes).
--      race_distances.clasificar_por ('oficial' | 'chip') decide con cuál se
--      clasifica; por defecto, el oficial.
--   3. CORRECCIONES QUE SOBREVIVEN: race_results.tiempo_manual, estado_manual
--      y penalizacion las pone el cronometrador y el motor nunca las toca.
--      Las retiradas de /timing (race_results_abandons) pasan a DNF/DNS/DSQ.
--   4. AUTOMÁTICO: cada cambio (lecturas, retiradas, salida, puntos, dorsal,
--      correcciones) deja una marca en cronometraje_marcas; pg_cron, cada 15
--      segundos, recalcula los recorridos marcados (cronometrar_pendientes).
--      Solo en recorridos con cronometraje_recorridos.automatico; las
--      carreras ya pasadas quedan en manual para no tocar lo publicado.
--   5. SEGURO DE SALIDA: si la hora oficial no cuadra con las lecturas (la
--      alfombra de salida a más de 15 minutos, o la mayoría de lecturas antes
--      de la salida), el motor NO escribe y deja el aviso. Es lo que les pasa
--      hoy a la Garita (+1 h) y a la Virgen (+1 día y 2 h): un «Procesar» ya
--      no puede estropear sus clasificaciones.
--   6. AVISOS para revisar: llegadas con pasos sin leer, dorsales repetidos,
--      lecturas de dorsales no inscritos, retirados con paso por meta.
--
-- Horas: todas de pared (+00, CLAUDE.md). Las lecturas y la salida se leen
-- con AT TIME ZONE 'UTC' y nunca se convierten. Las marcas son instantes
-- reales (now()) y solo se comparan entre sí.
--
-- Para pararlo todo: SELECT cron.unschedule('cronometraje-automatico');
-- Por recorrido: el interruptor «Automático» de Resultados
-- (cronometraje_automatico).
--
-- PENDIENTE DE APLICAR en producción (panel de Supabase). Ensayada en una
-- copia local del esquema (PostgreSQL 16) con datos de prueba.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
-- timing_readings la escriben los móviles de /timing: antes abortar que
-- dejarlos en cola detrás de un bloqueo
SET LOCAL lock_timeout = '5s';

-- 1. Columnas nuevas ---------------------------------------------------------
ALTER TABLE public.race_results
  ADD COLUMN IF NOT EXISTS tiempo_calculado interval,
  ADD COLUMN IF NOT EXISTS tiempo_chip      interval,
  ADD COLUMN IF NOT EXISTS tiempo_manual    interval,
  ADD COLUMN IF NOT EXISTS penalizacion     interval,
  ADD COLUMN IF NOT EXISTS estado_manual    text REFERENCES public.race_results_status(code);

COMMENT ON COLUMN public.race_results.finish_time IS
  'Tiempo OFICIAL que se publica: (tiempo_manual o tiempo_calculado) + penalizacion. Lo escribe el motor de cronometraje.';
COMMENT ON COLUMN public.race_results.tiempo_calculado IS
  'Tiempo de pistola que sale de las lecturas (meta − salida oficial; si no ha llegado, último paso). Lo escribe el motor.';
COMMENT ON COLUMN public.race_results.tiempo_chip IS
  'Tiempo chip (neto): meta − última lectura en la alfombra de salida. Lo escribe el motor; vacío si hay tiempo_manual.';
COMMENT ON COLUMN public.race_results.tiempo_manual IS
  'Corrección del cronometrador: sustituye al tiempo calculado. El motor no la toca nunca.';
COMMENT ON COLUMN public.race_results.penalizacion IS
  'Sanción de tiempo que se suma al oficial (y al chip) de los que terminan. El motor no la toca nunca.';
COMMENT ON COLUMN public.race_results.estado_manual IS
  'Estado decidido por el cronometrador (DNF, DNS, DSQ, CUT…): manda sobre el calculado. El motor no lo toca nunca.';

ALTER TABLE public.race_distances
  ADD COLUMN IF NOT EXISTS clasificar_por text NOT NULL DEFAULT 'oficial';
DO $$ BEGIN
  ALTER TABLE public.race_distances
    ADD CONSTRAINT race_distances_clasificar_por_check CHECK (clasificar_por IN ('oficial', 'chip'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN public.race_distances.clasificar_por IS
  'Con qué tiempo se ordena la clasificación: oficial (pistola) o chip (neto).';

-- 2. Estado del cronometraje por recorrido y cola de marcas ------------------
CREATE TABLE IF NOT EXISTS public.cronometraje_recorridos (
  race_distance_id uuid PRIMARY KEY REFERENCES public.race_distances(id) ON DELETE CASCADE,
  automatico   boolean NOT NULL DEFAULT true,
  calculado_at timestamptz,
  duracion_ms  integer,
  resumen      jsonb,
  avisos       jsonb NOT NULL DEFAULT '[]'::jsonb,
  error        text,
  error_at     timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cronometraje_recorridos IS
  'Estado del cronometraje automático de cada recorrido: interruptor, último cálculo, avisos y error. Lo escribe el motor.';

-- Solo se inserta y se borra (nunca se actualiza): así los móviles que fichan
-- no esperan a que termine un cálculo.
CREATE TABLE IF NOT EXISTS public.cronometraje_marcas (
  id               bigserial PRIMARY KEY,
  race_distance_id uuid NOT NULL REFERENCES public.race_distances(id) ON DELETE CASCADE,
  marcado_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  motivo           text
);
CREATE INDEX IF NOT EXISTS idx_cronometraje_marcas_recorrido
  ON public.cronometraje_marcas (race_distance_id, marcado_at);

ALTER TABLE public.cronometraje_recorridos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronometraje_marcas     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin y organizador ven el cronometraje de sus recorridos" ON public.cronometraje_recorridos;
CREATE POLICY "Admin y organizador ven el cronometraje de sus recorridos" ON public.cronometraje_recorridos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR EXISTS (SELECT 1 FROM public.race_distances d JOIN public.races r ON r.id = d.race_id
                     WHERE d.id = cronometraje_recorridos.race_distance_id AND r.organizer_id = auth.uid()));

REVOKE ALL ON public.cronometraje_recorridos FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.cronometraje_recorridos TO authenticated;
GRANT ALL ON public.cronometraje_recorridos TO service_role;
REVOKE ALL ON public.cronometraje_marcas FROM anon, authenticated, PUBLIC;
REVOKE ALL ON SEQUENCE public.cronometraje_marcas_id_seq FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.cronometraje_marcas TO service_role;

-- El panel se entera de cada cálculo por realtime (una fila por recorrido)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                    AND tablename = 'cronometraje_recorridos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cronometraje_recorridos;
  END IF;
END $$;

-- 3. El motor: pasos por orden ------------------------------------------------
-- Para buscar el siguiente paso de cada corredor de un salto (58.600 lecturas
-- hoy: el índice se crea en menos de un segundo)
CREATE INDEX IF NOT EXISTS idx_timing_readings_pasos
  ON public.timing_readings (race_id, bib_number, timing_point_id, timing_timestamp);

-- Un paso asignado: qué corredor, por qué punto de control y a qué hora (de
-- pared). La salida (START) es la salida chip: la última lectura en su
-- alfombra entre una hora antes y su max_time (5 min si está vacío) después
-- de la salida oficial, y nunca antes de la oficial.
DO $$ BEGIN
  CREATE TYPE public.motor_paso AS (
    registration_id   uuid,
    bib_number        integer,
    checkpoint_id     uuid,
    paso              timestamp,
    timing_reading_id uuid
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.motor_pasos(p_race_distance_id uuid, p_salida timestamp)
RETURNS SETOF public.motor_paso
LANGUAGE sql
STABLE
SET search_path = public
AS $motor$
WITH RECURSIVE
d AS (
  SELECT rd.race_id FROM race_distances rd WHERE rd.id = p_race_distance_id
),
-- La salida: el primer START con alfombra
salida_cp AS (
  SELECT rc.id, rc.timing_point_id, rc.max_time
    FROM race_checkpoints rc
   WHERE rc.race_distance_id = p_race_distance_id
     AND rc.checkpoint_type = 'START' AND rc.timing_point_id IS NOT NULL
   ORDER BY rc.checkpoint_order
   LIMIT 1
),
-- El resto de puntos, en su orden: la secuencia que recorre cada corredor
cps AS (
  SELECT rc.id, rc.timing_point_id AS tp, rc.min_time, rc.max_time,
         coalesce(rc.min_lap_time, interval '1 minute') AS hueco,
         row_number() OVER (ORDER BY rc.checkpoint_order, rc.id) AS k
    FROM race_checkpoints rc
   WHERE rc.race_distance_id = p_race_distance_id
     AND rc.timing_point_id IS NOT NULL
     AND rc.checkpoint_type IS DISTINCT FROM 'START'
),
regs AS (
  SELECT reg.id, reg.bib_number
    FROM registrations reg
   WHERE reg.race_distance_id = p_race_distance_id
     AND reg.bib_number IS NOT NULL
     AND reg.status IS DISTINCT FROM 'cancelled'
),
-- Lecturas válidas de esos dorsales. Las que vienen apuntadas contra un
-- punto de control (parciales a mano, geocerca GPS) solo valen para ese
-- punto; si no traen alfombra, cuentan en la del punto.
lect AS (
  SELECT tr.id, tr.bib_number,
         coalesce(tr.timing_point_id, rcx.timing_point_id) AS tp,
         tr.checkpoint_id AS fijado,
         (tr.timing_timestamp AT TIME ZONE 'UTC') AS t
    FROM timing_readings tr
    LEFT JOIN race_checkpoints rcx ON rcx.id = tr.checkpoint_id AND tr.timing_point_id IS NULL
   WHERE tr.race_id = (SELECT race_id FROM d)
     AND tr.status_code IS NULL
     AND tr.timing_timestamp IS NOT NULL
     AND tr.bib_number IN (SELECT bib_number FROM regs)
),
chip AS (
  SELECT r.id AS registration_id, r.bib_number,
         greatest(p_salida, max(l.t)) AS paso,
         (array_agg(l.id ORDER BY l.t DESC, l.id))[1] AS timing_reading_id
    FROM regs r
    JOIN salida_cp s ON true
    JOIN lect l ON l.bib_number = r.bib_number AND l.tp = s.timing_point_id
               AND (l.fijado IS NULL OR l.fijado = s.id)
   WHERE l.t >= p_salida - interval '1 hour'
     AND l.t <= p_salida + coalesce(s.max_time, interval '5 minutes')
   GROUP BY r.id, r.bib_number
),
-- Por cada corredor se recorre la secuencia: cada punto toma el primer paso
-- por su alfombra posterior al último paso asignado (con el hueco de vuelta
-- si es la misma alfombra) y dentro de su ventana. Si un punto no tiene
-- paso, se salta y la secuencia sigue desde el último asignado.
asig AS (
  SELECT r.id AS registration_id, r.bib_number, 0::bigint AS k,
         coalesce(c.paso, p_salida) AS t_prev,
         (SELECT timing_point_id FROM salida_cp) AS tp_prev,
         NULL::uuid AS checkpoint_id, NULL::timestamp AS paso, NULL::uuid AS timing_reading_id
    FROM regs r
    LEFT JOIN chip c ON c.registration_id = r.id
  UNION ALL
  SELECT a.registration_id, a.bib_number, cp.k,
         coalesce(x.t, a.t_prev),
         CASE WHEN x.t IS NULL THEN a.tp_prev ELSE cp.tp END,
         cp.id, x.t, x.id
    FROM asig a
    JOIN cps cp ON cp.k = a.k + 1
    -- Directo a la tabla (índice idx_timing_readings_pasos) en vez de a
    -- «lect»: cada búsqueda es un salto de índice. Mismas condiciones que
    -- «lect»; las horas se comparan como +00, que es como están guardadas.
    LEFT JOIN LATERAL (
      SELECT (tr.timing_timestamp AT TIME ZONE 'UTC') AS t, tr.id
        FROM timing_readings tr
       WHERE tr.race_id = (SELECT race_id FROM d)
         AND tr.bib_number = a.bib_number
         AND tr.status_code IS NULL
         AND (tr.timing_point_id = cp.tp OR (tr.timing_point_id IS NULL AND tr.checkpoint_id = cp.id))
         AND (tr.checkpoint_id IS NULL OR tr.checkpoint_id = cp.id)
         AND tr.timing_timestamp > ((a.t_prev + CASE WHEN a.tp_prev = cp.tp THEN cp.hueco ELSE interval '0' END) AT TIME ZONE 'UTC')
         AND (cp.min_time IS NULL OR tr.timing_timestamp >= ((p_salida + cp.min_time) AT TIME ZONE 'UTC'))
         AND (cp.max_time IS NULL OR tr.timing_timestamp <= ((p_salida + cp.max_time) AT TIME ZONE 'UTC'))
       ORDER BY tr.timing_timestamp, tr.id
       LIMIT 1
    ) x ON true
)
SELECT c.registration_id, c.bib_number, (SELECT id FROM salida_cp), c.paso, c.timing_reading_id
  FROM chip c
UNION ALL
SELECT a.registration_id, a.bib_number, a.checkpoint_id, a.paso, a.timing_reading_id
  FROM asig a
 WHERE a.k > 0 AND a.paso IS NOT NULL
$motor$;

-- ¿La salida oficial cuadra con las lecturas? Devuelve el motivo si no.
CREATE OR REPLACE FUNCTION public.motor_salida_desfasada(p_race_distance_id uuid, p_salida timestamp)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_race       uuid;
  v_clasif     text;
  v_tp         uuid;
  v_ventana    interval;
  v_compartida boolean;
  v_n          integer;
  v_mediana    timestamp;
  v_antes      integer;
  v_despues    integer;
BEGIN
  SELECT rd.race_id, rd.clasificar_por INTO v_race, v_clasif
    FROM race_distances rd WHERE rd.id = p_race_distance_id;

  SELECT rc.timing_point_id, coalesce(rc.max_time, interval '5 minutes') INTO v_tp, v_ventana
    FROM race_checkpoints rc
   WHERE rc.race_distance_id = p_race_distance_id
     AND rc.checkpoint_type = 'START' AND rc.timing_point_id IS NOT NULL
   ORDER BY rc.checkpoint_order LIMIT 1;

  -- ¿La alfombra de salida es también la de vueltas o meta (circuito)?
  v_compartida := v_tp IS NOT NULL AND EXISTS (
    SELECT 1 FROM race_checkpoints rc
     WHERE rc.race_distance_id = p_race_distance_id
       AND rc.timing_point_id = v_tp AND rc.checkpoint_type IS DISTINCT FROM 'START');

  -- a) La alfombra de salida: la última lectura de cada dorsal cerca de la
  --    salida tiene que estar a menos de 15 minutos de la hora oficial.
  --    · Si la alfombra es solo de salida, se mira hasta 3 h después: detecta
  --      también una salida dada tarde y no apuntada.
  --    · Si es la de un circuito, solo hasta el fin de la ventana de salida
  --      (si no, las vueltas parecerían salidas tardías).
  --    · Clasificando por chip la salida de cada uno puede ser más tarde: allí
  --      solo se mira que no estén antes.
  IF v_tp IS NOT NULL THEN
    SELECT count(*), percentile_disc(0.5) WITHIN GROUP (ORDER BY ultima)
      INTO v_n, v_mediana
      FROM (SELECT max(tr.timing_timestamp AT TIME ZONE 'UTC') AS ultima
              FROM timing_readings tr
              JOIN registrations reg ON reg.race_id = tr.race_id AND reg.bib_number = tr.bib_number
             WHERE tr.race_id = v_race
               AND reg.race_distance_id = p_race_distance_id
               AND tr.timing_point_id = v_tp
               AND tr.status_code IS NULL
               AND (tr.timing_timestamp AT TIME ZONE 'UTC')
                   BETWEEN p_salida - interval '3 hours'
                       AND p_salida + CASE WHEN v_compartida THEN v_ventana ELSE interval '3 hours' END
             GROUP BY tr.bib_number) u;
    IF v_n >= 10 AND (v_mediana < p_salida - interval '15 minutes'
                      OR (v_clasif = 'oficial' AND NOT v_compartida
                          AND v_mediana > p_salida + interval '15 minutes')) THEN
      RETURN format('La salida oficial (%s) no cuadra con la alfombra de salida: la mitad de los corredores la pisó por última vez a las %s. Revisa Horas de Salida.',
                    to_char(p_salida, 'DD/MM HH24:MI:SS'), to_char(v_mediana, 'DD/MM HH24:MI:SS'));
    END IF;
  END IF;

  -- b) Las alfombras de control y meta (la de salida solo si es también de
  --    vueltas o meta): si la mayoría de lecturas son de más de 15 minutos
  --    antes de la salida, la hora oficial está mal (o el día). El margen deja
  --    fuera el corral, que en un circuito se lee en la misma alfombra.
  SELECT count(*) FILTER (WHERE (tr.timing_timestamp AT TIME ZONE 'UTC') < p_salida - interval '15 minutes'),
         count(*) FILTER (WHERE (tr.timing_timestamp AT TIME ZONE 'UTC') >= p_salida)
    INTO v_antes, v_despues
    FROM timing_readings tr
    JOIN registrations reg ON reg.race_id = tr.race_id AND reg.bib_number = tr.bib_number
   WHERE tr.race_id = v_race
     AND reg.race_distance_id = p_race_distance_id
     AND tr.status_code IS NULL
     AND EXISTS (SELECT 1 FROM race_checkpoints rc
                  WHERE rc.race_distance_id = p_race_distance_id
                    AND rc.timing_point_id = tr.timing_point_id
                    AND rc.checkpoint_type IS DISTINCT FROM 'START');
  IF v_antes > 50 AND v_antes > v_despues THEN
    RETURN format('La salida oficial (%s) no cuadra con las lecturas: %s lecturas de control y meta son de antes de la salida y solo %s de después. Revisa Horas de Salida.',
                  to_char(p_salida, 'DD/MM HH24:MI:SS'), v_antes, v_despues);
  END IF;

  RETURN NULL;
END
$fn$;

-- El cálculo completo de un recorrido: pasos, parciales, clasificación,
-- posiciones y avisos. Idempotente; solo escribe las filas que cambian.
CREATE OR REPLACE FUNCTION public.motor_cronometraje(p_race_distance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inicio    timestamptz := clock_timestamp();
  v_race      uuid;
  v_clasif    text;
  v_salida    timestamp;
  v_desfase   text;
  v_pasos     public.motor_paso[];
  v_avisos    jsonb := '[]'::jsonb;
  v_lista     jsonb;
  v_n         integer;
  v_resumen   jsonb;
BEGIN
  -- Un cálculo a la vez por recorrido (el automático y el botón del panel)
  PERFORM pg_advisory_xact_lock(hashtext('cronometraje:' || p_race_distance_id::text));

  SELECT rd.race_id, rd.clasificar_por INTO v_race, v_clasif
    FROM race_distances rd WHERE rd.id = p_race_distance_id;
  IF v_race IS NULL THEN
    RAISE EXCEPTION 'El recorrido % no existe', p_race_distance_id;
  END IF;

  -- La salida OFICIAL (start_time), leída tal cual: hora de pared
  SELECT min(w.start_time AT TIME ZONE 'UTC') INTO v_salida
    FROM race_waves w WHERE w.race_distance_id = p_race_distance_id;

  IF v_salida IS NULL THEN
    v_desfase := 'El recorrido no tiene hora de salida oficial. Ponla en Horas de Salida.';
  ELSE
    v_desfase := motor_salida_desfasada(p_race_distance_id, v_salida);
  END IF;

  IF v_desfase IS NOT NULL THEN
    INSERT INTO cronometraje_recorridos AS c (race_distance_id, error, error_at, updated_at)
    VALUES (p_race_distance_id, v_desfase, now(), now())
    ON CONFLICT (race_distance_id) DO UPDATE
      SET error = EXCLUDED.error, error_at = EXCLUDED.error_at, updated_at = EXCLUDED.updated_at;
    RETURN jsonb_build_object('ok', false, 'error', v_desfase);
  END IF;

  SELECT coalesce(array_agg(p), '{}') INTO v_pasos FROM motor_pasos(p_race_distance_id, v_salida) p;

  -- Lo que hay que escribir de cada corredor --------------------------------
  CREATE TEMP TABLE IF NOT EXISTS _motor_calc (
    registration_id uuid PRIMARY KEY, bib_number integer, sexo text, categoria uuid,
    estado text, finish_time interval, tiempo_calculado interval, tiempo_chip interval,
    tiempo_ranking interval, overall_position integer, gender_position integer, category_position integer
  ) ON COMMIT DROP;
  TRUNCATE _motor_calc;

  WITH puntos AS (
    SELECT rc.id, rc.checkpoint_type FROM race_checkpoints rc WHERE rc.race_distance_id = p_race_distance_id
  ),
  por_corredor AS (
    SELECT p.registration_id,
           max(p.paso) FILTER (WHERE pt.checkpoint_type = 'FINISH') AS t_meta,
           max(p.paso) FILTER (WHERE pt.checkpoint_type = 'START')  AS t_chip,
           max(p.paso) FILTER (WHERE pt.checkpoint_type IS DISTINCT FROM 'START') AS t_ultimo
      FROM unnest(v_pasos) p JOIN puntos pt ON pt.id = p.checkpoint_id
     GROUP BY p.registration_id
  ),
  -- La última retirada de cada corredor manda; «EN_CARRERA» la anula
  retiradas AS (
    SELECT DISTINCT ON (a.registration_id) a.registration_id,
           CASE a.abandon_type WHEN 'ABANDONO' THEN 'DNF' WHEN 'NO_SALE' THEN 'DNS'
                               WHEN 'DESCALIFICADO' THEN 'DSQ' END AS estado
      FROM race_results_abandons a
     WHERE a.race_id = v_race
     ORDER BY a.registration_id, a.created_at DESC, a.id DESC
  ),
  previos AS (
    SELECT rr.registration_id, rr.tiempo_manual, rr.estado_manual, rr.penalizacion,
           (rr.photo_url IS NOT NULL OR rr.notes IS NOT NULL) AS con_datos
      FROM race_results rr
  ),
  -- Quién tiene fila: el que tiene pasos, el retirado, y el que ya tenía
  -- correcciones, foto o notas
  universo AS (
    SELECT reg.id, reg.bib_number, reg.gender_id, reg.race_category_id,
           pc.t_meta, pc.t_chip, pc.t_ultimo, re.estado AS estado_retirada,
           pv.tiempo_manual, pv.estado_manual, pv.penalizacion
      FROM registrations reg
      LEFT JOIN por_corredor pc ON pc.registration_id = reg.id
      LEFT JOIN retiradas re ON re.registration_id = reg.id
      LEFT JOIN previos pv ON pv.registration_id = reg.id
     WHERE reg.race_distance_id = p_race_distance_id
       AND reg.status IS DISTINCT FROM 'cancelled'
       AND (pc.registration_id IS NOT NULL OR re.estado IS NOT NULL
            OR pv.tiempo_manual IS NOT NULL OR pv.estado_manual IS NOT NULL
            OR pv.penalizacion IS NOT NULL OR pv.con_datos)
  ),
  calc AS (
    SELECT u.*,
           CASE WHEN u.t_meta IS NOT NULL THEN u.t_meta - v_salida
                WHEN u.t_ultimo IS NOT NULL THEN u.t_ultimo - v_salida
                ELSE interval '0' END AS t_calc,
           coalesce(u.estado_manual, u.estado_retirada,
                    CASE WHEN u.t_meta IS NOT NULL OR u.tiempo_manual IS NOT NULL THEN 'FIN'
                         WHEN u.t_ultimo IS NOT NULL OR u.t_chip IS NOT NULL THEN 'STD'
                         ELSE 'INS' END) AS estado
      FROM universo u
  )
  INSERT INTO _motor_calc (registration_id, bib_number, sexo, categoria, estado,
                           finish_time, tiempo_calculado, tiempo_chip)
  SELECT c.id, c.bib_number,
         CASE c.gender_id WHEN 1 THEN 'M' WHEN 2 THEN 'F'
              ELSE CASE WHEN get_registration_gender(c.id) IN ('Masculino', 'M', 'Male', 'male') THEN 'M'
                        WHEN get_registration_gender(c.id) IN ('Femenino', 'F', 'Female', 'female') THEN 'F'
                        ELSE 'X' END END,
         c.race_category_id,
         c.estado,
         coalesce(c.tiempo_manual, c.t_calc)
           + CASE WHEN c.estado = 'FIN' THEN coalesce(c.penalizacion, interval '0') ELSE interval '0' END,
         c.t_calc,
         CASE WHEN c.tiempo_manual IS NULL AND c.t_meta IS NOT NULL AND c.t_chip IS NOT NULL
              THEN (c.t_meta - c.t_chip)
                   + CASE WHEN c.estado = 'FIN' THEN coalesce(c.penalizacion, interval '0') ELSE interval '0' END
         END
    FROM calc c;

  -- Posiciones: solo los que terminan, por el tiempo con que clasifica el recorrido
  UPDATE _motor_calc SET tiempo_ranking = CASE WHEN v_clasif = 'chip' THEN coalesce(tiempo_chip, finish_time)
                                               ELSE finish_time END;
  WITH r AS (
    SELECT registration_id,
           row_number() OVER (ORDER BY tiempo_ranking, bib_number) AS g,
           row_number() OVER (PARTITION BY sexo ORDER BY tiempo_ranking, bib_number) AS s,
           row_number() OVER (PARTITION BY coalesce(categoria, '00000000-0000-0000-0000-000000000000'::uuid)
                              ORDER BY tiempo_ranking, bib_number) AS cat
      FROM _motor_calc WHERE estado = 'FIN'
  )
  UPDATE _motor_calc m SET overall_position = r.g, gender_position = r.s, category_position = r.cat
    FROM r WHERE r.registration_id = m.registration_id;

  -- Escribir la clasificación (sin tocar correcciones, foto ni notas) -------
  INSERT INTO race_results AS rr (registration_id, race_distance_id, finish_time, status,
                                  tiempo_calculado, tiempo_chip,
                                  overall_position, gender_position, category_position)
  SELECT m.registration_id, p_race_distance_id, m.finish_time, m.estado,
         m.tiempo_calculado, m.tiempo_chip,
         m.overall_position, m.gender_position, m.category_position
    FROM _motor_calc m
  ON CONFLICT (registration_id) DO UPDATE SET
    race_distance_id  = EXCLUDED.race_distance_id,
    finish_time       = EXCLUDED.finish_time,
    status            = EXCLUDED.status,
    tiempo_calculado  = EXCLUDED.tiempo_calculado,
    tiempo_chip       = EXCLUDED.tiempo_chip,
    overall_position  = EXCLUDED.overall_position,
    gender_position   = EXCLUDED.gender_position,
    category_position = EXCLUDED.category_position
  WHERE (rr.race_distance_id, rr.finish_time, rr.status, rr.tiempo_calculado, rr.tiempo_chip,
         rr.overall_position, rr.gender_position, rr.category_position)
        IS DISTINCT FROM
        (EXCLUDED.race_distance_id, EXCLUDED.finish_time, EXCLUDED.status, EXCLUDED.tiempo_calculado,
         EXCLUDED.tiempo_chip, EXCLUDED.overall_position, EXCLUDED.gender_position, EXCLUDED.category_position);

  -- Filas de este recorrido que ya no salen del cálculo:
  --   · si la inscripción se ha cambiado de recorrido, la fila se va con ella
  --     (y se marca ese recorrido);
  --   · si no tiene nada del cronometrador, se borra (sus parciales, en cascada);
  --   · si tiene algo (inscripción cancelada con foto, por ejemplo), se queda sin posición.
  INSERT INTO cronometraje_marcas (race_distance_id, motivo)
  SELECT DISTINCT reg.race_distance_id, 'cambio de recorrido'
    FROM race_results rr JOIN registrations reg ON reg.id = rr.registration_id
   WHERE rr.race_distance_id = p_race_distance_id
     AND reg.race_distance_id IS DISTINCT FROM p_race_distance_id
     AND reg.race_distance_id IS NOT NULL;
  UPDATE race_results rr SET race_distance_id = reg.race_distance_id
    FROM registrations reg
   WHERE reg.id = rr.registration_id
     AND rr.race_distance_id = p_race_distance_id
     AND reg.race_distance_id IS DISTINCT FROM p_race_distance_id
     AND reg.race_distance_id IS NOT NULL;
  DELETE FROM race_results rr
   WHERE rr.race_distance_id = p_race_distance_id
     AND NOT EXISTS (SELECT 1 FROM _motor_calc m WHERE m.registration_id = rr.registration_id)
     AND rr.tiempo_manual IS NULL AND rr.estado_manual IS NULL AND rr.penalizacion IS NULL
     AND rr.photo_url IS NULL AND rr.notes IS NULL;
  UPDATE race_results rr SET overall_position = NULL, gender_position = NULL, category_position = NULL
   WHERE rr.race_distance_id = p_race_distance_id
     AND NOT EXISTS (SELECT 1 FROM _motor_calc m WHERE m.registration_id = rr.registration_id)
     AND (rr.overall_position IS NOT NULL OR rr.gender_position IS NOT NULL OR rr.category_position IS NOT NULL);

  -- Parciales: uno por paso asignado. La vuelta es el número de paso por esa
  -- alfombra dentro del recorrido (como el «LAP» de Puntos de Control).
  CREATE TEMP TABLE IF NOT EXISTS _motor_parciales (
    race_result_id uuid, checkpoint_id uuid, checkpoint_name text, checkpoint_order integer,
    distance_km numeric, split_time interval, lap_number integer, bib_number integer,
    sexo text, categoria uuid, PRIMARY KEY (race_result_id, checkpoint_order, lap_number)
  ) ON COMMIT DROP;
  TRUNCATE _motor_parciales;

  INSERT INTO _motor_parciales
  SELECT rr.id, c.id, c.name, c.checkpoint_order, c.distance_km, p.paso - v_salida, c.vuelta,
         m.bib_number, m.sexo, m.categoria
    FROM unnest(v_pasos) p
    JOIN (SELECT rc.*, row_number() OVER (PARTITION BY rc.timing_point_id ORDER BY rc.checkpoint_order)::integer AS vuelta
            FROM race_checkpoints rc WHERE rc.race_distance_id = p_race_distance_id) c ON c.id = p.checkpoint_id
    JOIN race_results rr ON rr.registration_id = p.registration_id
    JOIN _motor_calc m ON m.registration_id = p.registration_id;

  DELETE FROM split_times st
   USING race_results rr
   WHERE st.race_result_id = rr.id
     AND rr.race_distance_id = p_race_distance_id
     AND NOT EXISTS (SELECT 1 FROM _motor_parciales n
                      WHERE n.race_result_id = st.race_result_id
                        AND n.checkpoint_order = st.checkpoint_order
                        AND n.lap_number = st.lap_number);

  -- Posiciones y ritmo en cada punto (todos los que han pasado, por tiempo de paso)
  WITH r AS (
    SELECT n.*,
           row_number() OVER (PARTITION BY n.checkpoint_order, n.lap_number ORDER BY n.split_time, n.bib_number) AS g,
           row_number() OVER (PARTITION BY n.checkpoint_order, n.lap_number, n.sexo ORDER BY n.split_time, n.bib_number) AS s,
           row_number() OVER (PARTITION BY n.checkpoint_order, n.lap_number,
                                           coalesce(n.categoria, '00000000-0000-0000-0000-000000000000'::uuid)
                              ORDER BY n.split_time, n.bib_number) AS cat,
           CASE WHEN n.distance_km > 0 THEN
             lpad(floor(extract(epoch FROM n.split_time) / 60 / n.distance_km)::integer::text, 2, '0') || ':' ||
             lpad(floor(mod((extract(epoch FROM n.split_time) / n.distance_km)::numeric, 60))::integer::text, 2, '0')
           END AS ritmo
      FROM _motor_parciales n
  )
  INSERT INTO split_times AS st (race_result_id, checkpoint_id, checkpoint_name, checkpoint_order, distance_km,
                                 split_time, lap_number, overall_position, gender_position, category_position, pace)
  SELECT r.race_result_id, r.checkpoint_id, r.checkpoint_name, r.checkpoint_order, r.distance_km,
         r.split_time, r.lap_number, r.g, r.s, r.cat, r.ritmo
    FROM r
  ON CONFLICT (race_result_id, checkpoint_order, lap_number) DO UPDATE SET
    checkpoint_id     = EXCLUDED.checkpoint_id,
    checkpoint_name   = EXCLUDED.checkpoint_name,
    distance_km       = EXCLUDED.distance_km,
    split_time        = EXCLUDED.split_time,
    overall_position  = EXCLUDED.overall_position,
    gender_position   = EXCLUDED.gender_position,
    category_position = EXCLUDED.category_position,
    pace              = EXCLUDED.pace
  WHERE (st.checkpoint_id, st.checkpoint_name, st.distance_km, st.split_time,
         st.overall_position, st.gender_position, st.category_position, st.pace)
        IS DISTINCT FROM
        (EXCLUDED.checkpoint_id, EXCLUDED.checkpoint_name, EXCLUDED.distance_km, EXCLUDED.split_time,
         EXCLUDED.overall_position, EXCLUDED.gender_position, EXCLUDED.category_position, EXCLUDED.pace);

  -- Avisos para revisar ------------------------------------------------------
  -- Llegados con puntos sin paso (lectura perdida o atajo)
  SELECT count(*), jsonb_agg(x.texto ORDER BY x.bib) FILTER (WHERE x.rn <= 50) INTO v_n, v_lista
    FROM (SELECT m.bib_number AS bib, row_number() OVER (ORDER BY m.bib_number) AS rn,
                 m.bib_number || ': ' || string_agg(rc.name, ', ' ORDER BY rc.checkpoint_order) AS texto
            FROM _motor_calc m
            JOIN race_checkpoints rc ON rc.race_distance_id = p_race_distance_id
                                    AND rc.timing_point_id IS NOT NULL
                                    AND rc.checkpoint_type = 'CONTROL'
           WHERE m.estado = 'FIN'
             AND m.tiempo_calculado IS NOT NULL
             AND EXISTS (SELECT 1 FROM unnest(v_pasos) f JOIN race_checkpoints fc ON fc.id = f.checkpoint_id
                          WHERE f.registration_id = m.registration_id AND fc.checkpoint_type = 'FINISH')
             AND NOT EXISTS (SELECT 1 FROM unnest(v_pasos) p
                              WHERE p.registration_id = m.registration_id AND p.checkpoint_id = rc.id)
           GROUP BY m.bib_number) x;
  IF v_n > 0 THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'meta_sin_paso', 'n', v_n,
      'texto', v_n || ' llegados con algún control sin paso (lectura perdida o atajo)', 'dorsales', v_lista);
  END IF;

  -- Dorsales repetidos en la carrera
  SELECT count(*), jsonb_agg(bib_number ORDER BY bib_number) INTO v_n, v_lista
    FROM (SELECT reg.bib_number FROM registrations reg
           WHERE reg.race_id = v_race AND reg.bib_number IS NOT NULL AND reg.status IS DISTINCT FROM 'cancelled'
           GROUP BY reg.bib_number HAVING count(*) > 1
              AND bool_or(reg.race_distance_id = p_race_distance_id)) x;
  IF v_n > 0 THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'dorsal_repetido', 'n', v_n,
      'texto', v_n || ' dorsales asignados a más de una inscripción', 'dorsales', v_lista);
  END IF;

  -- Lecturas en las alfombras de este recorrido de dorsales sin inscripción
  SELECT count(*), jsonb_agg(bib_number ORDER BY bib_number) FILTER (WHERE rn <= 50) INTO v_n, v_lista
    FROM (SELECT tr.bib_number, row_number() OVER (ORDER BY tr.bib_number) AS rn
            FROM timing_readings tr
           WHERE tr.race_id = v_race AND tr.bib_number IS NOT NULL AND tr.status_code IS NULL
             AND tr.timing_point_id IN (SELECT rc.timing_point_id FROM race_checkpoints rc
                                         WHERE rc.race_distance_id = p_race_distance_id)
             AND NOT EXISTS (SELECT 1 FROM registrations reg
                              WHERE reg.race_id = v_race AND reg.bib_number = tr.bib_number
                                AND reg.status IS DISTINCT FROM 'cancelled')
           GROUP BY tr.bib_number) x;
  IF v_n > 0 THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'dorsal_sin_inscripcion', 'n', v_n,
      'texto', v_n || ' dorsales leídos que no están inscritos en la carrera', 'dorsales', v_lista);
  END IF;

  -- Retirados o no salidos que tienen paso por meta
  SELECT count(*), jsonb_agg(m.bib_number ORDER BY m.bib_number) INTO v_n, v_lista
    FROM _motor_calc m
   WHERE m.estado IN ('DNF', 'DNS')
     AND EXISTS (SELECT 1 FROM unnest(v_pasos) f JOIN race_checkpoints fc ON fc.id = f.checkpoint_id
                  WHERE f.registration_id = m.registration_id AND fc.checkpoint_type = 'FINISH');
  IF v_n > 0 THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'retirado_con_meta', 'n', v_n,
      'texto', v_n || ' retirados o no salidos con paso por meta', 'dorsales', v_lista);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM race_checkpoints rc WHERE rc.race_distance_id = p_race_distance_id
                    AND rc.checkpoint_type = 'FINISH' AND rc.timing_point_id IS NOT NULL) THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'sin_meta', 'n', 1,
      'texto', 'El recorrido no tiene META con alfombra en Puntos de Control: nadie puede terminar');
  END IF;

  SELECT jsonb_build_object(
           'ok', true,
           'salida', to_char(v_salida, 'YYYY-MM-DD HH24:MI:SS.MS'),
           'clasificar_por', v_clasif,
           'corredores', count(*),
           'finalizados', count(*) FILTER (WHERE estado = 'FIN'),
           'en_carrera', count(*) FILTER (WHERE estado = 'STD'),
           'retirados', count(*) FILTER (WHERE estado IN ('DNF', 'DNS', 'DSQ', 'CUT')),
           'parciales', (SELECT count(*) FROM _motor_parciales),
           'avisos', jsonb_array_length(v_avisos),
           'ms', (extract(epoch FROM clock_timestamp() - v_inicio) * 1000)::integer)
    INTO v_resumen
    FROM _motor_calc;

  INSERT INTO cronometraje_recorridos AS c (race_distance_id, calculado_at, duracion_ms, resumen, avisos,
                                            error, error_at, updated_at)
  VALUES (p_race_distance_id, now(), (v_resumen->>'ms')::integer, v_resumen, v_avisos, NULL, NULL, now())
  ON CONFLICT (race_distance_id) DO UPDATE SET
    calculado_at = EXCLUDED.calculado_at, duracion_ms = EXCLUDED.duracion_ms, resumen = EXCLUDED.resumen,
    avisos = EXCLUDED.avisos, error = NULL, error_at = NULL, updated_at = EXCLUDED.updated_at;

  DROP TABLE IF EXISTS _motor_calc;
  DROP TABLE IF EXISTS _motor_parciales;
  RETURN v_resumen;
END
$fn$;

-- 4. Lo que llama el panel -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.puede_cronometrar(p_race_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
$fn$;

-- «Recalcular ahora»: el mismo cálculo que el automático, a mano
CREATE OR REPLACE FUNCTION public.cronometrar_recorrido(p_race_distance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race   uuid;
  v_marcas bigint[];
  v_res    jsonb;
BEGIN
  SELECT rd.race_id INTO v_race FROM race_distances rd WHERE rd.id = p_race_distance_id;
  IF v_race IS NULL OR NOT puede_cronometrar(v_race) THEN
    RAISE EXCEPTION 'Sin permiso sobre este recorrido';
  END IF;
  -- Las marcas que ya cubre este cálculo
  SELECT array_agg(id) INTO v_marcas FROM cronometraje_marcas WHERE race_distance_id = p_race_distance_id;
  v_res := motor_cronometraje(p_race_distance_id);
  DELETE FROM cronometraje_marcas WHERE id = ANY (coalesce(v_marcas, '{}'));
  RETURN v_res;
END
$fn$;

-- Interruptor «Automático» de un recorrido. Al encenderlo, se calcula enseguida.
CREATE OR REPLACE FUNCTION public.cronometraje_automatico(p_race_distance_id uuid, p_activo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
BEGIN
  SELECT rd.race_id INTO v_race FROM race_distances rd WHERE rd.id = p_race_distance_id;
  IF v_race IS NULL OR NOT puede_cronometrar(v_race) THEN
    RAISE EXCEPTION 'Sin permiso sobre este recorrido';
  END IF;
  INSERT INTO cronometraje_recorridos AS c (race_distance_id, automatico, updated_at)
  VALUES (p_race_distance_id, p_activo, now())
  ON CONFLICT (race_distance_id) DO UPDATE SET automatico = EXCLUDED.automatico, updated_at = EXCLUDED.updated_at;
  IF p_activo THEN
    INSERT INTO cronometraje_marcas (race_distance_id, motivo) VALUES (p_race_distance_id, 'automático encendido');
  END IF;
END
$fn$;

-- Estado de los recorridos de una carrera para el panel
CREATE OR REPLACE FUNCTION public.cronometraje_estado(p_race_id uuid)
RETURNS TABLE(race_distance_id uuid, recorrido text, automatico boolean, pendiente boolean,
              calculado_at timestamptz, duracion_ms integer, resumen jsonb, avisos jsonb,
              error text, error_at timestamptz, clasificar_por text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT puede_cronometrar(p_race_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera';
  END IF;
  RETURN QUERY
  SELECT rd.id, rd.name, coalesce(c.automatico, true),
         EXISTS (SELECT 1 FROM cronometraje_marcas m WHERE m.race_distance_id = rd.id),
         c.calculado_at, c.duracion_ms, c.resumen, coalesce(c.avisos, '[]'::jsonb), c.error, c.error_at,
         rd.clasificar_por
    FROM race_distances rd
    LEFT JOIN cronometraje_recorridos c ON c.race_distance_id = rd.id
   WHERE rd.race_id = p_race_id
   ORDER BY rd.display_order NULLS LAST, rd.name;
END
$fn$;

-- Los dos botones de siempre siguen funcionando: ahora hacen el cálculo nuevo
-- (y comprueban el permiso, que antes no miraban)
CREATE OR REPLACE FUNCTION public.generate_split_times(p_race_distance_id uuid)
RETURNS TABLE(inserted_count integer, updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v jsonb;
BEGIN
  v := cronometrar_recorrido(p_race_distance_id);
  IF NOT coalesce((v->>'ok')::boolean, false) THEN
    RAISE EXCEPTION '%', v->>'error';
  END IF;
  RETURN QUERY SELECT (v->>'parciales')::integer, 0;
END
$fn$;

CREATE OR REPLACE FUNCTION public.process_event_results(p_race_distance_id uuid)
RETURNS TABLE(processed_count integer, finished_count integer, in_progress_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v jsonb;
BEGIN
  v := cronometrar_recorrido(p_race_distance_id);
  IF NOT coalesce((v->>'ok')::boolean, false) THEN
    RAISE EXCEPTION '%', v->>'error';
  END IF;
  RETURN QUERY SELECT (v->>'corredores')::integer, (v->>'finalizados')::integer, (v->>'en_carrera')::integer;
END
$fn$;

-- Las dos de cálculo viejas devuelven ya lo del motor nuevo (nadie las llama
-- desde la web; se dejan por si algo de fuera las usa) y se cierran.
CREATE OR REPLACE FUNCTION public.calculate_split_times(p_race_distance_id uuid)
RETURNS TABLE(registration_id uuid, bib_number integer, checkpoint_id uuid, checkpoint_name text,
              checkpoint_order integer, lap_number integer, split_time interval, timing_reading_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH s AS (SELECT min(w.start_time AT TIME ZONE 'UTC') AS salida FROM race_waves w
              WHERE w.race_distance_id = p_race_distance_id)
  SELECT p.registration_id, p.bib_number, p.checkpoint_id, rc.name, rc.checkpoint_order,
         (row_number() OVER (PARTITION BY p.registration_id, rc.timing_point_id ORDER BY rc.checkpoint_order))::integer,
         p.paso - s.salida, p.timing_reading_id
    FROM s, motor_pasos(p_race_distance_id, s.salida) p
    JOIN race_checkpoints rc ON rc.id = p.checkpoint_id
   WHERE s.salida IS NOT NULL
   ORDER BY p.bib_number, rc.checkpoint_order
$fn$;

CREATE OR REPLACE FUNCTION public.calculate_race_results(p_race_distance_id uuid)
RETURNS TABLE(registration_id uuid, bib_number integer, finish_time interval,
              finish_checkpoint_id uuid, finish_checkpoint_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH s AS (SELECT min(w.start_time AT TIME ZONE 'UTC') AS salida FROM race_waves w
              WHERE w.race_distance_id = p_race_distance_id)
  SELECT DISTINCT ON (p.registration_id)
         p.registration_id, p.bib_number, p.paso - s.salida, p.checkpoint_id, rc.name
    FROM s, motor_pasos(p_race_distance_id, s.salida) p
    JOIN race_checkpoints rc ON rc.id = p.checkpoint_id
   WHERE s.salida IS NOT NULL
   ORDER BY p.registration_id, p.paso DESC
$fn$;

-- 5. El automático: marcas y pg_cron -----------------------------------------
-- Lecturas y retiradas: por sentencia (una importación RFID de 100 lecturas
-- deja una marca, no cien). Se marcan los recorridos con alfombra de la carrera.
CREATE OR REPLACE FUNCTION public.cronometraje_marcar_carrera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Cada rama nombra solo las tablas de transición que tiene su disparador:
  -- en un DELETE no existe «nuevas» y en un INSERT no existe «viejas»
  IF TG_OP = 'INSERT' THEN
    INSERT INTO cronometraje_marcas (race_distance_id, motivo)
    SELECT DISTINCT rd.id, TG_TABLE_NAME
      FROM (SELECT DISTINCT race_id FROM nuevas) n
      JOIN race_distances rd ON rd.race_id = n.race_id
     WHERE EXISTS (SELECT 1 FROM race_checkpoints rc
                    WHERE rc.race_distance_id = rd.id AND rc.timing_point_id IS NOT NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO cronometraje_marcas (race_distance_id, motivo)
    SELECT DISTINCT rd.id, TG_TABLE_NAME
      FROM (SELECT race_id FROM nuevas UNION SELECT race_id FROM viejas) x
      JOIN race_distances rd ON rd.race_id = x.race_id
     WHERE EXISTS (SELECT 1 FROM race_checkpoints rc
                    WHERE rc.race_distance_id = rd.id AND rc.timing_point_id IS NOT NULL);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO cronometraje_marcas (race_distance_id, motivo)
    SELECT DISTINCT rd.id, TG_TABLE_NAME
      FROM (SELECT DISTINCT race_id FROM viejas) v
      JOIN race_distances rd ON rd.race_id = v.race_id
     WHERE EXISTS (SELECT 1 FROM race_checkpoints rc
                    WHERE rc.race_distance_id = rd.id AND rc.timing_point_id IS NOT NULL);
  END IF;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS cronometraje_lecturas_ins ON public.timing_readings;
DROP TRIGGER IF EXISTS cronometraje_lecturas_upd ON public.timing_readings;
DROP TRIGGER IF EXISTS cronometraje_lecturas_del ON public.timing_readings;
CREATE TRIGGER cronometraje_lecturas_ins AFTER INSERT ON public.timing_readings
  REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION public.cronometraje_marcar_carrera();
CREATE TRIGGER cronometraje_lecturas_upd AFTER UPDATE ON public.timing_readings
  REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION public.cronometraje_marcar_carrera();
CREATE TRIGGER cronometraje_lecturas_del AFTER DELETE ON public.timing_readings
  REFERENCING OLD TABLE AS viejas FOR EACH STATEMENT EXECUTE FUNCTION public.cronometraje_marcar_carrera();

DROP TRIGGER IF EXISTS cronometraje_retiradas_ins ON public.race_results_abandons;
DROP TRIGGER IF EXISTS cronometraje_retiradas_upd ON public.race_results_abandons;
DROP TRIGGER IF EXISTS cronometraje_retiradas_del ON public.race_results_abandons;
CREATE TRIGGER cronometraje_retiradas_ins AFTER INSERT ON public.race_results_abandons
  REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION public.cronometraje_marcar_carrera();
CREATE TRIGGER cronometraje_retiradas_upd AFTER UPDATE ON public.race_results_abandons
  REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION public.cronometraje_marcar_carrera();
CREATE TRIGGER cronometraje_retiradas_del AFTER DELETE ON public.race_results_abandons
  REFERENCING OLD TABLE AS viejas FOR EACH STATEMENT EXECUTE FUNCTION public.cronometraje_marcar_carrera();

-- Salida, puntos de control, inscripción, correcciones y forma de clasificar:
-- por fila (cambian de una en una)
CREATE OR REPLACE FUNCTION public.cronometraje_marcar_recorrido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_viejo uuid;
  v_nuevo uuid;
BEGIN
  IF TG_TABLE_NAME = 'race_distances' THEN
    v_nuevo := NEW.id;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_viejo := OLD.race_distance_id; END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_nuevo := NEW.race_distance_id; END IF;
  END IF;

  -- Una inscripción solo importa si su carrera ya tiene lecturas (IF anidado:
  -- las demás tablas no tienen race_id y plpgsql no corta un AND a medias)
  IF TG_TABLE_NAME = 'registrations' THEN
    IF NOT EXISTS (SELECT 1 FROM timing_readings tr WHERE tr.race_id = NEW.race_id) THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO cronometraje_marcas (race_distance_id, motivo)
  SELECT DISTINCT x, TG_TABLE_NAME
    FROM unnest(ARRAY[v_viejo, v_nuevo]) x
   WHERE x IS NOT NULL
     AND EXISTS (SELECT 1 FROM race_distances rd WHERE rd.id = x);
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS cronometraje_salida ON public.race_waves;
CREATE TRIGGER cronometraje_salida
  AFTER INSERT OR DELETE OR UPDATE OF start_time, race_distance_id ON public.race_waves
  FOR EACH ROW EXECUTE FUNCTION public.cronometraje_marcar_recorrido();

DROP TRIGGER IF EXISTS cronometraje_puntos ON public.race_checkpoints;
CREATE TRIGGER cronometraje_puntos
  AFTER INSERT OR DELETE OR UPDATE OF race_distance_id, checkpoint_order, checkpoint_type, timing_point_id,
                                      min_time, max_time, min_lap_time, distance_km, name ON public.race_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.cronometraje_marcar_recorrido();

DROP TRIGGER IF EXISTS cronometraje_inscripcion ON public.registrations;
CREATE TRIGGER cronometraje_inscripcion
  AFTER UPDATE OF bib_number, race_distance_id, race_category_id, gender_id, status ON public.registrations
  FOR EACH ROW
  WHEN (OLD.bib_number IS DISTINCT FROM NEW.bib_number
        OR OLD.race_distance_id IS DISTINCT FROM NEW.race_distance_id
        OR OLD.race_category_id IS DISTINCT FROM NEW.race_category_id
        OR OLD.gender_id IS DISTINCT FROM NEW.gender_id
        OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cronometraje_marcar_recorrido();

DROP TRIGGER IF EXISTS cronometraje_inscripcion_nueva ON public.registrations;
CREATE TRIGGER cronometraje_inscripcion_nueva
  AFTER INSERT ON public.registrations
  FOR EACH ROW WHEN (NEW.bib_number IS NOT NULL)
  EXECUTE FUNCTION public.cronometraje_marcar_recorrido();

-- Correcciones del cronometrador (el motor nunca escribe estas columnas)
DROP TRIGGER IF EXISTS cronometraje_correccion ON public.race_results;
CREATE TRIGGER cronometraje_correccion
  AFTER UPDATE OF tiempo_manual, estado_manual, penalizacion ON public.race_results
  FOR EACH ROW
  WHEN (OLD.tiempo_manual IS DISTINCT FROM NEW.tiempo_manual
        OR OLD.estado_manual IS DISTINCT FROM NEW.estado_manual
        OR OLD.penalizacion IS DISTINCT FROM NEW.penalizacion)
  EXECUTE FUNCTION public.cronometraje_marcar_recorrido();

DROP TRIGGER IF EXISTS cronometraje_correccion_nueva ON public.race_results;
CREATE TRIGGER cronometraje_correccion_nueva
  AFTER INSERT ON public.race_results
  FOR EACH ROW
  WHEN (NEW.tiempo_manual IS NOT NULL OR NEW.estado_manual IS NOT NULL OR NEW.penalizacion IS NOT NULL)
  EXECUTE FUNCTION public.cronometraje_marcar_recorrido();

DROP TRIGGER IF EXISTS cronometraje_clasificar_por ON public.race_distances;
CREATE TRIGGER cronometraje_clasificar_por
  AFTER UPDATE OF clasificar_por ON public.race_distances
  FOR EACH ROW WHEN (OLD.clasificar_por IS DISTINCT FROM NEW.clasificar_por)
  EXECUTE FUNCTION public.cronometraje_marcar_recorrido();

-- Lo que ejecuta pg_cron: calcula los recorridos automáticos con marcas.
-- Espera 3 segundos de calma (una importación en lotes acaba antes de
-- calcular), pero nunca más de 30 desde la primera marca.
CREATE OR REPLACE FUNCTION public.cronometrar_pendientes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v   record;
  v_n integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('cronometrar_pendientes')) THEN
    RETURN 0;
  END IF;
  FOR v IN
    SELECT m.race_distance_id, array_agg(m.id) AS ids
      FROM cronometraje_marcas m
      LEFT JOIN cronometraje_recorridos c ON c.race_distance_id = m.race_distance_id
     WHERE coalesce(c.automatico, true)
     GROUP BY m.race_distance_id
    HAVING max(m.marcado_at) < clock_timestamp() - interval '3 seconds'
        OR min(m.marcado_at) < clock_timestamp() - interval '30 seconds'
     ORDER BY min(m.marcado_at)
     LIMIT 10
  LOOP
    BEGIN
      PERFORM motor_cronometraje(v.race_distance_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO cronometraje_recorridos AS c (race_distance_id, error, error_at, updated_at)
      VALUES (v.race_distance_id, SQLERRM, now(), now())
      ON CONFLICT (race_distance_id) DO UPDATE
        SET error = EXCLUDED.error, error_at = EXCLUDED.error_at, updated_at = EXCLUDED.updated_at;
    END;
    DELETE FROM cronometraje_marcas WHERE id = ANY (v.ids);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- 6. Permisos: abiertas solo las tres del panel (con su comprobación dentro) --
REVOKE EXECUTE ON FUNCTION public.motor_pasos(uuid, timestamp)            FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.motor_salida_desfasada(uuid, timestamp) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.motor_cronometraje(uuid)                FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometrar_pendientes()                FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometraje_marcar_carrera()           FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometraje_marcar_recorrido()         FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_split_times(uuid)             FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_race_results(uuid)            FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_split_positions(uuid)         FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.motor_pasos(uuid, timestamp)            TO service_role;
GRANT  EXECUTE ON FUNCTION public.motor_cronometraje(uuid)                TO service_role;
GRANT  EXECUTE ON FUNCTION public.cronometrar_pendientes()                TO service_role;

REVOKE EXECUTE ON FUNCTION public.puede_cronometrar(uuid)                 FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometrar_recorrido(uuid)             FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometraje_automatico(uuid, boolean)  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronometraje_estado(uuid)               FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_split_times(uuid)              FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_event_results(uuid)             FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.puede_cronometrar(uuid)                 TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cronometrar_recorrido(uuid)             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cronometraje_automatico(uuid, boolean)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cronometraje_estado(uuid)               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.generate_split_times(uuid)              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.process_event_results(uuid)             TO authenticated;

-- 7. Datos de partida ----------------------------------------------------------
-- Las carreras que ya pasaron, en manual: nada las recalcula solo
INSERT INTO public.cronometraje_recorridos (race_distance_id, automatico)
SELECT rd.id, coalesce(r.date >= public.hoy_local(), true)
  FROM public.race_distances rd JOIN public.races r ON r.id = rd.race_id
ON CONFLICT (race_distance_id) DO NOTHING;

-- Las correcciones a mano que ya hay se conservan como correcciones: los
-- llegados cuyo tiempo no es el de su paso por meta (hoy, los dos del podio
-- de Andarines) o que no tienen paso por meta (resultados metidos a mano)
UPDATE public.race_results rr
   SET tiempo_manual = rr.finish_time
 WHERE rr.status = 'FIN'
   AND rr.tiempo_manual IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.split_times st
                     JOIN public.race_checkpoints rc ON rc.id = st.checkpoint_id AND rc.checkpoint_type = 'FINISH'
                    WHERE st.race_result_id = rr.id AND st.split_time = rr.finish_time);
UPDATE public.race_results rr
   SET estado_manual = rr.status
 WHERE rr.status NOT IN ('FIN', 'STD', 'INS')
   AND rr.estado_manual IS NULL;
-- Las marcas que esas dos actualizaciones acaban de dejar no hacen falta
DELETE FROM public.cronometraje_marcas;

-- El reloj: cada 15 segundos (pg_cron 1.6 admite segundos)
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cronometraje-automatico') THEN
    PERFORM cron.unschedule('cronometraje-automatico');
  END IF;
  PERFORM cron.schedule('cronometraje-automatico', '15 seconds', 'SELECT public.cronometrar_pendientes()');

  -- Su historial (5.760 ejecuciones al día) se limpia cada noche
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cronometraje-limpiar-historial') THEN
    PERFORM cron.unschedule('cronometraje-limpiar-historial');
  END IF;
  PERFORM cron.schedule('cronometraje-limpiar-historial', '17 4 * * *',
    $cmd$DELETE FROM cron.job_run_details
          WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'cronometraje-automatico')
            AND end_time < now() - interval '2 days'$cmd$);
END
$cron$;

-- 8. Comprobaciones: si algo falla, se deshace todo ---------------------------
DO $$
DECLARE malas text;
BEGIN
  -- Cerradas de verdad (anon entra por su GRANT explícito, no por PUBLIC)
  SELECT string_agg(f, ', ') INTO malas
    FROM unnest(ARRAY['public.motor_pasos(uuid,timestamp without time zone)',
                      'public.motor_salida_desfasada(uuid,timestamp without time zone)',
                      'public.motor_cronometraje(uuid)', 'public.cronometrar_pendientes()',
                      'public.cronometraje_marcar_carrera()', 'public.cronometraje_marcar_recorrido()',
                      'public.calculate_split_times(uuid)', 'public.calculate_race_results(uuid)',
                      'public.calculate_split_positions(uuid)']) AS f
   WHERE has_function_privilege('anon', f::regprocedure, 'EXECUTE')
      OR has_function_privilege('authenticated', f::regprocedure, 'EXECUTE');
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Funciones internas abiertas: %', malas; END IF;

  -- Las del panel: para authenticated sí, para anon no
  SELECT string_agg(f, ', ') INTO malas
    FROM unnest(ARRAY['public.cronometrar_recorrido(uuid)', 'public.cronometraje_automatico(uuid,boolean)',
                      'public.cronometraje_estado(uuid)', 'public.generate_split_times(uuid)',
                      'public.process_event_results(uuid)', 'public.puede_cronometrar(uuid)']) AS f
   WHERE has_function_privilege('anon', f::regprocedure, 'EXECUTE')
      OR NOT has_function_privilege('authenticated', f::regprocedure, 'EXECUTE');
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Permisos del panel mal: %', malas; END IF;

  IF has_table_privilege('anon', 'public.cronometraje_marcas', 'INSERT')
     OR has_table_privilege('authenticated', 'public.cronometraje_marcas', 'SELECT')
     OR has_table_privilege('anon', 'public.cronometraje_recorridos', 'SELECT') THEN
    RAISE EXCEPTION 'Tablas de cronometraje abiertas de más';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cronometraje-automatico' AND schedule = '15 seconds') THEN
    RAISE EXCEPTION 'Falta el cron del cronometraje automático';
  END IF;

  -- Guardia de horas (CLAUDE.md): ningún FALLO
  SELECT string_agg(nombre || ' [' || left(regla, 2) || ']', ', ') INTO malas
    FROM public.guardia_horas() WHERE nivel = 'FALLO';
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Siguen convirtiendo horas: %', malas; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
