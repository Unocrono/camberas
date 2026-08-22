-- ═══════════════════════════════════════════════════════════════════════════
-- Asistente de WhatsApp (WABA / Cloud API) — infraestructura mínima
--
-- Dos tablas:
--   wa_bot_config  → qué carrera está "en antena" y con qué enlaces responde
--   wa_messages    → log + idempotencia (Meta reintenta el webhook) + rate limit
--
-- Ninguna es pública: el webhook usa service role y salta RLS. El panel de
-- admin/organizador puede leer y escribir la config.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Configuración del bot ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_bot_config (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled         boolean NOT NULL DEFAULT false,
  -- Carrera en antena
  active_eid      text,                    -- EID de RaceTec (racetec_*.eid)
  race_name       text NOT NULL DEFAULT '',
  race_id         uuid,                    -- races.id (para el mapa en vivo)
  distance_id     uuid,                    -- race_distances.id
  -- Enlaces que devuelve el bot
  live_url        text,
  results_url     text,
  info_url        text,
  -- Textos
  race_info       text NOT NULL DEFAULT '',
  -- Privacidad: 'split' = solo paso por control (recomendado) · 'off' = nada
  position_mode   text NOT NULL DEFAULT 'split'
                  CHECK (position_mode IN ('split', 'off')),
  -- Anti-abuso
  rate_limit_hour smallint NOT NULL DEFAULT 20,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.wa_bot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.wa_bot_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_org_manage_wa_bot_config" ON public.wa_bot_config;
CREATE POLICY "admin_org_manage_wa_bot_config" ON public.wa_bot_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'));

-- ── 2) Mensajes recibidos ──────────────────────────────────────────────────
-- wam_id es el message.id de Meta: PRIMARY KEY para que el reintento del
-- webhook choque contra el índice y no se conteste dos veces.
CREATE TABLE IF NOT EXISTS public.wa_messages (
  wam_id      text PRIMARY KEY,
  wa_id       text NOT NULL,               -- teléfono del remitente (dato personal)
  body        text,
  intent      text,
  reply_sent  boolean NOT NULL DEFAULT false,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_wa_id_created
  ON public.wa_messages (wa_id, created_at DESC);

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

-- Sin política pública: solo service role (webhook) y admin.
DROP POLICY IF EXISTS "admin_read_wa_messages" ON public.wa_messages;
CREATE POLICY "admin_read_wa_messages" ON public.wa_messages
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- ── 3) Retención: 30 días (RGPD — el wa_id es dato personal) ───────────────
CREATE OR REPLACE FUNCTION public.purge_wa_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.wa_messages WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.purge_wa_messages() FROM public, anon, authenticated;
