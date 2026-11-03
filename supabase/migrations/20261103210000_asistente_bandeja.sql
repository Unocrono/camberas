-- ═══════════════════════════════════════════════════════════════════════════
-- Bandeja de Maika: cuando el bot no sabe (o se lo piden), la conversación
-- pasa a una persona del equipo, que contesta desde el panel por el mismo
-- canal (WhatsApp o chat web).
--
--   asistente_conversaciones → una fila por conversación (wa_id) con su
--                              estado: bot | pendiente | persona | resuelta
--   wa_messages.autor        → 'usuario' (fila con body y, si lo hubo, reply
--                              del bot) o 'persona' (fila con reply de alguien
--                              del equipo, autor_id)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS autor text NOT NULL DEFAULT 'usuario',
  ADD COLUMN IF NOT EXISTS autor_id uuid;

CREATE TABLE IF NOT EXISTS public.asistente_conversaciones (
  wa_id              text PRIMARY KEY,          -- teléfono o 'web:<sesión>'
  canal              text NOT NULL DEFAULT 'whatsapp',
  user_id            uuid,                      -- usuario de Camberas si se sabe
  nombre             text,                      -- para la lista del panel
  estado             text NOT NULL DEFAULT 'bot'
                     CHECK (estado IN ('bot', 'pendiente', 'persona', 'resuelta')),
  motivo             text,                      -- por qué pasó a persona
  asignado_a         uuid,                      -- quien la está atendiendo
  pendiente_desde    timestamptz,
  ultimo_usuario_at  timestamptz,               -- para la ventana de 24 h de Meta
  ultimo_mensaje_at  timestamptz NOT NULL DEFAULT now(),
  ultimo_texto       text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asistente_conv_estado
  ON public.asistente_conversaciones (estado, ultimo_mensaje_at DESC);

ALTER TABLE public.asistente_conversaciones ENABLE ROW LEVEL SECURITY;

-- El equipo (admin u organizador) ve y toca las conversaciones; el webhook y
-- el chat escriben con service role.
DROP POLICY IF EXISTS "equipo_lee_conversaciones" ON public.asistente_conversaciones;
CREATE POLICY "equipo_lee_conversaciones" ON public.asistente_conversaciones
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'));

DROP POLICY IF EXISTS "equipo_actualiza_conversaciones" ON public.asistente_conversaciones;
CREATE POLICY "equipo_actualiza_conversaciones" ON public.asistente_conversaciones
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'));

-- Los organizadores también leen los mensajes (antes solo admin).
DROP POLICY IF EXISTS "admin_read_wa_messages" ON public.wa_messages;
CREATE POLICY "equipo_lee_wa_messages" ON public.wa_messages
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'organizer'));
