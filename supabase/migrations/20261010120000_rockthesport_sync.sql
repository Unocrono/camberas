-- Sincronización de inscritos desde RockTheSport (API CustomerService V1) a
-- una carrera de Camberas, como la de EventBooking (20260822190000): cada
-- participante de RockTheSport es una inscripción con
--   external_id = 'rts-<idInscripcionLinea>'  (la clave: repetir nunca duplica)
--   source      = 'external'
-- y el paso de tarifa a recorrido es EXPLÍCITO (tarifa_map). Una tarifa sin
-- mapear se reporta como error y esa fila no entra: no se deduce.
--
-- Relevos: en RockTheSport cada pareja es una fila de equipo (grupal = 1)
-- más sus dos deportistas enlazados por idInscripcionLineaGrupo. En Camberas
-- entra UNA inscripción por pareja (un dorsal): external_id = la del equipo,
-- nombre = primer apellido del 1.º relevista, apellidos = primer apellido
-- del 2.º, team = nombre del equipo (decisión del usuario, 10-oct-2026: dos
-- inscritos con el mismo dorsal duplicarían la clasificación).
--
-- El token de la API es por organización y vive en el Vault con el nombre
-- que diga token_secreto (lo da de alta un admin por SQL, nunca en el
-- repositorio). La función lo lee con rockthesport_token(), solo service_role.
-- El robot horario se autentica con 'rockthesport_cron_key', también en el
-- Vault (clave_cron_valida, como recuperar-pagos).

-- ── 1. Configuración por carrera ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rockthesport_sync (
  race_id       uuid PRIMARY KEY REFERENCES public.races(id) ON DELETE CASCADE,
  -- idEvento de RockTheSport
  event_id      integer NOT NULL,
  -- { "<idTarifa>": "<race_distances.id>" } — tarifas OFICIALES del evento
  -- (GET /v1/es/es/event/{id}/fee/get), nunca deducidas de los inscritos
  tarifa_map    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Nombre del secreto del Vault que guarda el token de esa organización
  token_secreto text NOT NULL DEFAULT 'rockthesport_token'
                CHECK (token_secreto LIKE 'rockthesport\_%'),
  enabled       boolean NOT NULL DEFAULT true,
  last_sync_at  timestamptz,
  last_result   jsonb,
  -- Turno: una pasada a la vez por carrera (robot y botón se pisarían los
  -- dorsales); una que se cuelga lo libera a los 5 minutos
  en_curso      timestamptz
);
ALTER TABLE public.rockthesport_sync ADD COLUMN IF NOT EXISTS en_curso timestamptz;

COMMENT ON TABLE public.rockthesport_sync IS
  'Sincronización horaria de inscritos desde RockTheSport (edge function rockthesport-sync). Mapeo tarifa→recorrido explícito; el token va en el Vault (token_secreto).';

ALTER TABLE public.rockthesport_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rockthesport_sync FROM anon, PUBLIC;
GRANT SELECT ON public.rockthesport_sync TO authenticated;
GRANT ALL ON public.rockthesport_sync TO service_role;

DROP POLICY IF EXISTS "rockthesport_sync_select" ON public.rockthesport_sync;
CREATE POLICY "rockthesport_sync_select" ON public.rockthesport_sync
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.races r
      WHERE r.id = rockthesport_sync.race_id AND r.organizer_id = auth.uid()
    )
  );
-- Sin políticas de escritura: la configuración se crea por SQL y solo la
-- edge function (service role) actualiza last_sync_at / last_result.

-- ── 2. El token, desde el Vault y solo para la función ─────────────────────
CREATE OR REPLACE FUNCTION public.rockthesport_token(p_nombre text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT s.decrypted_secret
  FROM vault.decrypted_secrets s
  WHERE s.name = p_nombre
    AND p_nombre LIKE 'rockthesport\_%'
    AND p_nombre <> 'rockthesport_cron_key'
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.rockthesport_token(text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rockthesport_token(text) TO service_role;

-- ── 3. Clave del robot (aleatoria, se crea una vez) ─────────────────────────
DO $clave$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'rockthesport_cron_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rockthesport_cron_key',
      'Clave del robot horario de rockthesport-sync (cabecera x-cron-key)');
  END IF;
END
$clave$;

-- ── 4. El robot: cada hora en el minuto 37 (EventBooking va en el 7 y
--      recuperar-pagos en el 0) ─────────────────────────────────────────────
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rockthesport-sync-cada-hora') THEN
    PERFORM cron.unschedule('rockthesport-sync-cada-hora');
  END IF;
  PERFORM cron.schedule(
    'rockthesport-sync-cada-hora',
    '37 * * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/rockthesport-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWh0eGpwaXNubGR4bnNtdXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mjg5MDAsImV4cCI6MjA3OTIwNDkwMH0.MwUTZs3BxPMsy0YtEgM92o4U3xw2SrMmpZ-GFNC03dE',
        'x-cron-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rockthesport_cron_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $cmd$
  );
END
$cron$;

-- Para dar de alta una carrera (ejemplo, el Duatlón Cros Alto Campoo 2026):
--   SELECT vault.create_secret('<token>', 'rockthesport_token_fctri', 'Token RockTheSport FCTRI');  -- una vez por organización
--   INSERT INTO rockthesport_sync (race_id, event_id, token_secreto, tarifa_map)
--   VALUES ('<race_id>', 64450, 'rockthesport_token_fctri',
--           '{"172794": "<recorrido absoluto>", "172796": "<recorrido absoluto>", ...}');

-- Comprobación: tabla con RLS y 1 política; la función del token solo
-- service_role; el robot programado
SELECT 'tabla' AS que, (SELECT relrowsecurity FROM pg_class WHERE relname = 'rockthesport_sync')::text AS valor
UNION ALL SELECT 'politicas', (SELECT count(*) FROM pg_policies WHERE tablename = 'rockthesport_sync')::text
UNION ALL SELECT 'token_anon', has_function_privilege('anon', 'public.rockthesport_token(text)', 'EXECUTE')::text
UNION ALL SELECT 'token_service', has_function_privilege('service_role', 'public.rockthesport_token(text)', 'EXECUTE')::text
UNION ALL SELECT 'cron', (SELECT schedule FROM cron.job WHERE jobname = 'rockthesport-sync-cada-hora');
