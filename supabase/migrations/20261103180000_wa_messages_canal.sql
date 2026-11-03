-- El contestador también atiende por el chat de la web (asistente-chat).
-- Mismo registro para los dos canales: la bandeja del panel verá ambos.
--   canal   → 'whatsapp' | 'web'
--   user_id → quien escribe, si tenía sesión (en WhatsApp sale del teléfono)
-- En el canal web, wa_id guarda el id de sesión del navegador y wam_id un
-- id generado ('web:<uuid>').
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE INDEX IF NOT EXISTS idx_wa_messages_canal_created
  ON public.wa_messages (canal, created_at DESC);
