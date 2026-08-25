-- Robot horario que recupera las inscripciones que se quedaron a medias.
--
-- NO es una migración: vive aquí a propósito, fuera de supabase/migrations/,
-- porque hay que rellenar una clave antes de ejecutarlo y no debe aplicarse
-- por inercia junto al resto.
--
-- ANTES de ejecutar:
--   1. Inventa una clave aleatoria (mínimo 30 caracteres) y guárdala en
--      Lovable como secreto RECUPERAR_PAGOS_CRON_KEY.
--   2. Sustituye abajo PON_AQUI_LA_CLAVE_DE_CRON por esa misma clave.
--   3. Aplica antes la migración 20260825120000_recuperar_pagos_a_medias.sql
--      y despliega la función recuperar-pagos.
--
-- Corre cada hora en el minuto 17 (el sincronizador de EventBooking usa el 7:
-- así no se pisan). Con esa cadencia, el aviso de las 2 h sale entre las 2 h
-- y las 3 h del abandono, y el de las 24 h entre las 24 h y las 25 h. De
-- sobra: no hay ninguna prisa que justifique mirar cada minuto.
--
-- El Bearer es la clave anónima pública (la misma que lleva el navegador),
-- no la de servicio: la función no confía en ella, valida x-cron-key.
DO $cr$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recuperar-pagos-cada-hora') THEN
    PERFORM cron.unschedule('recuperar-pagos-cada-hora');
  END IF;
  PERFORM cron.schedule(
    'recuperar-pagos-cada-hora',
    '17 * * * *',
    $$
    SELECT net.http_post(
      url := 'https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/recuperar-pagos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWh0eGpwaXNubGR4bnNtdXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mjg5MDAsImV4cCI6MjA3OTIwNDkwMH0.MwUTZs3BxPMsy0YtEgM92o4U3xw2SrMmpZ-GFNC03dE',
        'x-cron-key', 'PON_AQUI_LA_CLAVE_DE_CRON'
      ),
      body := '{}'::jsonb
    );
    $$
  );
END
$cr$;

-- Para pararlo:
--   SELECT cron.unschedule('recuperar-pagos-cada-hora');
--
-- Para ver si corre:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'recuperar%';
--   SELECT start_time, status, return_message FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'recuperar-pagos-cada-hora')
--    ORDER BY start_time DESC LIMIT 10;
