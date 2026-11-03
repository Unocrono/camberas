ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS autor text NOT NULL DEFAULT 'usuario',
  ADD COLUMN IF NOT EXISTS autor_id uuid;

CREATE TABLE IF NOT EXISTS public.asistente_conversaciones (
  wa_id              text PRIMARY KEY,
  canal              text NOT NULL DEFAULT 'whatsapp',
  user_id            uuid,
  nombre             text,
  estado             text NOT NULL DEFAULT 'bot'
                     CHECK (estado IN ('bot', 'pendiente', 'persona', 'resuelta')),
  motivo             text,
  asignado_a         uuid,
  pendiente_desde    timestamptz,
  ultimo_usuario_at  timestamptz,
  ultimo_mensaje_at  timestamptz NOT NULL DEFAULT now(),
  ultimo_texto       text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asistente_conv_estado
  ON public.asistente_conversaciones (estado, ultimo_mensaje_at DESC);

ALTER TABLE public.asistente_conversaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo_lee_conversaciones" ON public.asistente_conversaciones;
CREATE POLICY "equipo_lee_conversaciones" ON public.asistente_conversaciones
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'));

DROP POLICY IF EXISTS "equipo_actualiza_conversaciones" ON public.asistente_conversaciones;
CREATE POLICY "equipo_actualiza_conversaciones" ON public.asistente_conversaciones
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'));

DROP POLICY IF EXISTS "admin_read_wa_messages" ON public.wa_messages;
DROP POLICY IF EXISTS "equipo_lee_wa_messages" ON public.wa_messages;
CREATE POLICY "equipo_lee_wa_messages" ON public.wa_messages
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'));