-- Instagram, fase 4: el asistente de carrera también por mensajes directos.
--
-- Es el mismo asistente que el de WhatsApp (edge function instagram-webhook,
-- consultas en _shared/asistente/) y lee la misma carrera en directo
-- (wa_bot_config). Diferencia a propósito: el buzón de Instagram de Camberas
-- lo atienden personas, así que el asistente solo contesta con
-- instagram_enabled encendido y la carrera en directo (enabled), y nunca a lo
-- que no entiende. Fuera de carrera no contesta ni guarda nada.

ALTER TABLE public.wa_bot_config
  ADD COLUMN IF NOT EXISTS instagram_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wa_bot_config.instagram_enabled IS
  'El asistente contesta también por mensajes directos de Instagram (solo con enabled). Apagado, el buzón de Instagram queda para las personas.';

-- ── Mensajes recibidos (como wa_messages) ─────────────────────────────────
-- igsid es el id del remitente para la cuenta de Camberas: dato personal, se
-- purga a los 30 días (aviso en la primera respuesta).
CREATE TABLE IF NOT EXISTS public.ig_mensajes (
  mid        text PRIMARY KEY,           -- id del mensaje: un reintento de Meta choca aquí
  igsid      text NOT NULL,
  body       text,
  intent     text,
  reply_sent boolean NOT NULL DEFAULT false,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ig_mensajes_igsid_idx ON public.ig_mensajes (igsid, created_at DESC);

ALTER TABLE public.ig_mensajes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ig_mensajes FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ig_mensajes TO authenticated;

DROP POLICY IF EXISTS "ig_mensajes lee admin" ON public.ig_mensajes;
CREATE POLICY "ig_mensajes lee admin" ON public.ig_mensajes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.purge_ig_mensajes()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  DELETE FROM public.ig_mensajes WHERE created_at < now() - interval '30 days';
$fn$;

REVOKE EXECUTE ON FUNCTION public.purge_ig_mensajes() FROM anon, authenticated, PUBLIC;

-- ── Purga diaria de los dos buzones ───────────────────────────────────────
-- La de WhatsApp (purge_wa_messages) existía pero nadie la programó: el aviso
-- de privacidad promete borrar a los 30 días.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asistente-purga-mensajes') THEN
    PERFORM cron.unschedule('asistente-purga-mensajes');
  END IF;
  PERFORM cron.schedule(
    'asistente-purga-mensajes',
    '45 4 * * *',
    $cmd$ SELECT public.purge_wa_messages(); SELECT public.purge_ig_mensajes(); $cmd$
  );
END
$cron$;

-- ── Comprobaciones ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.purge_ig_mensajes()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.purge_ig_mensajes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'purge_ig_mensajes tiene que quedar cerrada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN
    RAISE EXCEPTION 'horas';
  END IF;
END $$;
