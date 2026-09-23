-- Robot horario que recupera las inscripciones que se quedaron a medias.
--
-- NO es una migración: vive aquí a propósito, fuera de supabase/migrations/,
-- porque ENCIENDE envíos de email a corredores reales y no debe aplicarse por
-- inercia junto al resto.
--
-- ANTES de ejecutar, por este orden:
--   1. Migración 20260923210000_aviso_de_pago_listo_para_encender.sql
--      (arreglos + la clave del robot en el Vault).
--   2. Redesplegar la función recuperar-pagos (valida la clave contra el
--      Vault). Sin esto, cada llamada del cron recibe 401 y no sale nada.
--
-- La clave NO se escribe aquí: el cron la lee del Vault en cada llamada
-- (secreto 'recuperar_pagos_cron_key') y la función la compara con el mismo
-- secreto. No hay que copiarla a los secretos de Lovable.
--
-- Corre cada hora en el minuto 17 (el sincronizador de EventBooking usa el 7:
-- así no se pisan). Con esa cadencia, el aviso de las 2 h sale entre las 2 h
-- y las 3 h del abandono, y el de las 24 h entre las 24 h y las 25 h.
--
-- El Bearer es la clave anónima pública (la misma que lleva el navegador),
-- no la de servicio: la función no confía en ella, valida x-cron-key.
--
-- Editor SQL de Lovable: sentencias sueltas, etiquetas con nombre (no $$).

SELECT cron.unschedule('recuperar-pagos-cada-hora')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recuperar-pagos-cada-hora');

SELECT cron.schedule(
  'recuperar-pagos-cada-hora',
  '17 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/recuperar-pagos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWh0eGpwaXNubGR4bnNtdXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mjg5MDAsImV4cCI6MjA3OTIwNDkwMH0.MwUTZs3BxPMsy0YtEgM92o4U3xw2SrMmpZ-GFNC03dE',
      'x-cron-key', (SELECT decrypted_secret FROM vault.decrypted_secrets
                     WHERE name = 'recuperar_pagos_cron_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);

-- Comprobación: debe salir una fila, activa
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'recuperar-pagos-cada-hora';

-- Para pararlo:
--   SELECT cron.unschedule('recuperar-pagos-cada-hora');
--
-- Para ver si corre (status 'succeeded' solo dice que la llamada salió; la
-- respuesta de la función está en net._http_response):
--   SELECT start_time, status, return_message FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'recuperar-pagos-cada-hora')
--    ORDER BY start_time DESC LIMIT 10;
--   SELECT created, status_code, left(content, 300) FROM net._http_response
--    ORDER BY created DESC LIMIT 5;
