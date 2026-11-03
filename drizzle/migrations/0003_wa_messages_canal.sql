ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE INDEX IF NOT EXISTS idx_wa_messages_canal_created
  ON public.wa_messages (canal, created_at DESC);