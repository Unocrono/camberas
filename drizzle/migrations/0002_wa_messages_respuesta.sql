-- El asistente de WhatsApp pasa a tener hilo: guardamos lo que contestó a cada
-- mensaje para dárselo como contexto al siguiente (y para la bandeja del panel).
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS reply text;
