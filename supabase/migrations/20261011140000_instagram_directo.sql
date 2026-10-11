-- Instagram, fase 3: historias en directo desde el cronometraje.
--
-- Cada minuto, el robot (pg_cron → edge function instagram-directo) mira las
-- carreras con el directo encendido y, por recorrido y sexo, detecta dos
-- momentos: «primero en meta» y «podio provisional» (tres en meta). Cada
-- momento ESPERA retraso_min minutos sin cambios antes de publicarse como
-- historia: si el cronometrador corrige una lectura o retira a alguien en ese
-- rato, la historia sale con el dato bueno, o no sale.
--
-- Fuente, recorrido a recorrido:
--   · Camberas: la primera lectura de cada dorsal en el punto de la meta (el
--     del control FINISH) menos la salida OFICIAL de su ola. Lo calcula
--     directo_podios(). race_results no vale: solo se rehace cuando alguien
--     pulsa «Procesar» en Resultados.
--   · RaceTec: si el recorrido tiene EID en racetec_eids, racetec_results
--     (gender_position 1 a 3), lo que mete el puente de RaceTec.
--
-- HORAS: lecturas y salida son hora de pared y se restan tal cual
-- (AT TIME ZONE 'UTC' a las dos). Los únicos instantes reales son visto_at,
-- ultima_pasada y updated_at, que se comparan con now().

-- ── 1. Configuración por carrera (la toca el admin en Panel › Instagram) ──
CREATE TABLE IF NOT EXISTS public.instagram_directo (
  race_id          uuid PRIMARY KEY REFERENCES public.races(id) ON DELETE CASCADE,
  activo           boolean  NOT NULL DEFAULT false,
  primero          boolean  NOT NULL DEFAULT true,
  podio            boolean  NOT NULL DEFAULT true,
  retraso_min      smallint NOT NULL DEFAULT 3 CHECK (retraso_min BETWEEN 0 AND 30),
  -- Recorridos cronometrados con RaceTec: { "<race_distance_id>": "<EID>" }
  racetec_eids     jsonb    NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(racetec_eids) = 'object'),
  ultima_pasada    timestamptz,   -- la última del robot: el panel enseña que está vivo
  ultimo_resultado jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.instagram_directo IS
  'Historias de Instagram en directo por carrera (edge function instagram-directo). Las enciende el admin; el robot solo actúa el día de la carrera y el siguiente.';

ALTER TABLE public.instagram_directo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_directo FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_directo TO authenticated;

DROP POLICY IF EXISTS "instagram_directo admin" ON public.instagram_directo;
CREATE POLICY "instagram_directo admin" ON public.instagram_directo
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 2. Cada momento detectado y su estado ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instagram_directo_eventos (
  -- 'historia:<race_id>:<race_distance_id>:<sexo>:primero|podio'
  clave          text PRIMARY KEY,
  race_id        uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  datos          jsonb NOT NULL,         -- lo que se dibuja: recorrido, nombres, tiempos
  firma          text  NOT NULL,         -- huella de datos: si cambia, vuelve a esperar
  visto_at       timestamptz NOT NULL DEFAULT now(),  -- desde cuándo está igual (instante real)
  estado         text  NOT NULL DEFAULT 'esperando'
                 CHECK (estado IN ('esperando', 'publicada', 'error', 'descartada')),
  publicacion_id uuid REFERENCES public.instagram_publicaciones(id) ON DELETE SET NULL,
  error          text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_directo_eventos_carrera_idx
  ON public.instagram_directo_eventos (race_id, estado);

COMMENT ON TABLE public.instagram_directo_eventos IS
  'Momentos del directo (primero en meta, podio provisional) por recorrido y sexo. Escribe el robot con la service role; el admin los ve y puede descartarlos o reintentarlos.';

ALTER TABLE public.instagram_directo_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_directo_eventos FROM anon, authenticated, PUBLIC;
GRANT SELECT, UPDATE ON public.instagram_directo_eventos TO authenticated;

DROP POLICY IF EXISTS "instagram_directo_eventos lee admin" ON public.instagram_directo_eventos;
CREATE POLICY "instagram_directo_eventos lee admin" ON public.instagram_directo_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Descartar o reintentar desde el panel
DROP POLICY IF EXISTS "instagram_directo_eventos cambia admin" ON public.instagram_directo_eventos;
CREATE POLICY "instagram_directo_eventos cambia admin" ON public.instagram_directo_eventos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 3. Podios provisionales desde las lecturas de Camberas ────────────────
-- Por recorrido y sexo, los tres primeros que han pasado por la meta. Tiempo
-- oficial (pistola): primera lectura de meta del dorsal menos la salida
-- oficial de su ola, las dos como hora de pared. Fuera quien tenga una lectura
-- de estado (dnf, dns, dsq, withdrawn) y las inscripciones canceladas.
-- El sexo es el de la inscripción (gender_id, y si falta el texto), como en
-- LiveResults. Solo la llama el robot (service role).
CREATE OR REPLACE FUNCTION public.directo_podios(p_race_id uuid)
RETURNS TABLE(race_distance_id uuid, sexo int, puesto int, dorsal int, nombre text, club text, tiempo interval)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  WITH meta AS (
    SELECT rc.race_distance_id, rc.timing_point_id
    FROM race_checkpoints rc
    JOIN race_distances d ON d.id = rc.race_distance_id
    WHERE d.race_id = p_race_id
      AND rc.checkpoint_type = 'FINISH'
      AND rc.timing_point_id IS NOT NULL
  ),
  salida AS (
    SELECT w.race_distance_id, w.start_time AT TIME ZONE 'UTC' AS hora
    FROM race_waves w
    JOIN race_distances d ON d.id = w.race_distance_id
    WHERE d.race_id = p_race_id
      AND w.start_time IS NOT NULL
  ),
  retirados AS (
    SELECT DISTINCT x.bib_number
    FROM timing_readings x
    WHERE x.race_id = p_race_id
      AND x.status_code IS NOT NULL
  ),
  llegadas AS (
    SELECT DISTINCT ON (r.id)
      r.race_distance_id,
      r.bib_number,
      trim(concat_ws(' ', r.first_name, r.last_name)) AS nombre,
      COALESCE(NULLIF(trim(r.club), ''), NULLIF(trim(r.team), '')) AS club,
      COALESCE(r.gender_id, CASE lower(trim(r.gender))
        WHEN 'm' THEN 1 WHEN 'masculino' THEN 1 WHEN 'male' THEN 1 WHEN 'hombre' THEN 1 WHEN 'h' THEN 1
        WHEN 'f' THEN 2 WHEN 'femenino' THEN 2 WHEN 'female' THEN 2 WHEN 'mujer' THEN 2
        WHEN 'x' THEN 3 WHEN 'mixto' THEN 3 END) AS sexo,
      (tr.timing_timestamp AT TIME ZONE 'UTC') - s.hora AS tiempo
    FROM timing_readings tr
    JOIN registrations r ON r.race_id = p_race_id AND r.bib_number = tr.bib_number
    JOIN meta m   ON m.race_distance_id = r.race_distance_id AND m.timing_point_id = tr.timing_point_id
    JOIN salida s ON s.race_distance_id = r.race_distance_id
    WHERE tr.race_id = p_race_id
      AND tr.status_code IS NULL
      AND r.status IS DISTINCT FROM 'cancelled'
      AND (tr.timing_timestamp AT TIME ZONE 'UTC') > s.hora
      AND tr.bib_number NOT IN (SELECT bib_number FROM retirados WHERE bib_number IS NOT NULL)
    ORDER BY r.id, tr.timing_timestamp
  ),
  puestos AS (
    SELECT l.*,
           row_number() OVER (PARTITION BY l.race_distance_id, l.sexo ORDER BY l.tiempo, l.bib_number) AS n
    FROM llegadas l
    WHERE l.sexo IS NOT NULL
  )
  SELECT p.race_distance_id, p.sexo, p.n::int, p.bib_number, p.nombre, p.club, p.tiempo
  FROM puestos p
  WHERE p.n <= 3
  ORDER BY p.race_distance_id, p.sexo, p.n;
$fn$;

REVOKE EXECUTE ON FUNCTION public.directo_podios(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.directo_podios(uuid) TO service_role;

-- ── 4. Clave del robot (aleatoria, se crea una vez) ───────────────────────
DO $clave$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'instagram_directo_cron_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'instagram_directo_cron_key',
      'Clave del robot de historias en directo de Instagram (cabecera x-cron-key)');
  END IF;
END
$clave$;

-- ── 5. El robot: cada minuto, pero solo llama a la función si hay algún
--      directo encendido (si no, no gasta ni una invocación) ──────────────
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-directo-cada-minuto') THEN
    PERFORM cron.unschedule('instagram-directo-cada-minuto');
  END IF;
  PERFORM cron.schedule(
    'instagram-directo-cada-minuto',
    '* * * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/instagram-directo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWh0eGpwaXNubGR4bnNtdXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mjg5MDAsImV4cCI6MjA3OTIwNDkwMH0.MwUTZs3BxPMsy0YtEgM92o4U3xw2SrMmpZ-GFNC03dE',
        'x-cron-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_directo_cron_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    )
    WHERE EXISTS (SELECT 1 FROM public.instagram_directo WHERE activo);
    $cmd$
  );
END
$cron$;

-- ── 6. Comprobaciones ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.directo_podios(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.directo_podios(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'directo_podios tiene que quedar solo para service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN
    RAISE EXCEPTION 'horas';
  END IF;
END $$;
