-- Tabla de conversaciones directas entre organizador y corredor
CREATE TABLE IF NOT EXISTS public.direct_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID REFERENCES public.races(id) ON DELETE CASCADE NOT NULL,
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  runner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_message_at TIMESTAMPTZ,
  unread_count_organizer INTEGER DEFAULT 0 NOT NULL,
  unread_count_runner INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'archived', 'closed')),
  UNIQUE(race_id, organizer_id, runner_id)
);

-- Tabla de mensajes del chat directo
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.direct_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMPTZ
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_direct_conversations_organizer ON public.direct_conversations(organizer_id);
CREATE INDEX IF NOT EXISTS idx_direct_conversations_runner ON public.direct_conversations(runner_id);
CREATE INDEX IF NOT EXISTS idx_direct_conversations_race ON public.direct_conversations(race_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON public.direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created ON public.direct_messages(created_at DESC);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_direct_conversations_updated_at
  BEFORE UPDATE ON public.direct_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Función para actualizar last_message_at y contadores
CREATE OR REPLACE FUNCTION public.update_conversation_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizer_id UUID;
  v_runner_id UUID;
BEGIN
  -- Obtener IDs de la conversación
  SELECT organizer_id, runner_id INTO v_organizer_id, v_runner_id
  FROM direct_conversations
  WHERE id = NEW.conversation_id;
  
  -- Actualizar conversación
  UPDATE direct_conversations
  SET 
    last_message_at = NEW.created_at,
    unread_count_organizer = CASE 
      WHEN NEW.sender_id = v_runner_id THEN unread_count_organizer + 1 
      ELSE unread_count_organizer 
    END,
    unread_count_runner = CASE 
      WHEN NEW.sender_id = v_organizer_id THEN unread_count_runner + 1 
      ELSE unread_count_runner 
    END
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;

-- Trigger para actualizar conversación al crear mensaje
CREATE TRIGGER trigger_update_conversation_on_new_message
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_on_new_message();

-- Función para marcar mensajes como leídos
CREATE OR REPLACE FUNCTION public.mark_messages_as_read(p_conversation_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizer_id UUID;
  v_runner_id UUID;
BEGIN
  -- Verificar que el usuario es parte de la conversación
  SELECT organizer_id, runner_id INTO v_organizer_id, v_runner_id
  FROM direct_conversations
  WHERE id = p_conversation_id;
  
  IF v_organizer_id != p_user_id AND v_runner_id != p_user_id THEN
    RAISE EXCEPTION 'Usuario no autorizado para esta conversación';
  END IF;
  
  -- Marcar mensajes como leídos
  UPDATE direct_messages
  SET is_read = true, read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND is_read = false;
  
  -- Resetear contador de no leídos
  IF v_organizer_id = p_user_id THEN
    UPDATE direct_conversations
    SET unread_count_organizer = 0
    WHERE id = p_conversation_id;
  ELSE
    UPDATE direct_conversations
    SET unread_count_runner = 0
    WHERE id = p_conversation_id;
  END IF;
END;
$$;

-- Enable Row Level Security
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies para direct_conversations

-- Los participantes pueden ver sus conversaciones
CREATE POLICY "Participantes pueden ver sus conversaciones"
ON public.direct_conversations
FOR SELECT
TO authenticated
USING (
  auth.uid() = organizer_id OR auth.uid() = runner_id
);

-- Los organizadores pueden crear conversaciones con sus corredores
CREATE POLICY "Organizadores pueden crear conversaciones"
ON public.direct_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = organizer_id
  AND has_role(auth.uid(), 'organizer')
  AND EXISTS (
    SELECT 1 FROM registrations r
    WHERE r.race_id = direct_conversations.race_id
      AND r.user_id = direct_conversations.runner_id
  )
  AND EXISTS (
    SELECT 1 FROM races
    WHERE races.id = direct_conversations.race_id
      AND races.organizer_id = auth.uid()
  )
);

-- Los corredores pueden crear conversaciones con organizadores de sus carreras
CREATE POLICY "Corredores pueden crear conversaciones"
ON public.direct_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = runner_id
  AND EXISTS (
    SELECT 1 FROM registrations r
    JOIN races ON races.id = r.race_id
    WHERE r.race_id = direct_conversations.race_id
      AND r.user_id = auth.uid()
      AND races.organizer_id = direct_conversations.organizer_id
  )
);

-- Los participantes pueden actualizar sus conversaciones
CREATE POLICY "Participantes pueden actualizar conversaciones"
ON public.direct_conversations
FOR UPDATE
TO authenticated
USING (
  auth.uid() = organizer_id OR auth.uid() = runner_id
);

-- RLS Policies para direct_messages

-- Los participantes pueden ver mensajes de sus conversaciones
CREATE POLICY "Participantes pueden ver mensajes"
ON public.direct_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM direct_conversations
    WHERE direct_conversations.id = direct_messages.conversation_id
      AND (direct_conversations.organizer_id = auth.uid() 
           OR direct_conversations.runner_id = auth.uid())
  )
);

-- Los participantes pueden enviar mensajes en sus conversaciones
CREATE POLICY "Participantes pueden enviar mensajes"
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM direct_conversations
    WHERE direct_conversations.id = direct_messages.conversation_id
      AND (direct_conversations.organizer_id = auth.uid() 
           OR direct_conversations.runner_id = auth.uid())
  )
);

-- Los participantes pueden actualizar estado de lectura
CREATE POLICY "Participantes pueden actualizar mensajes"
ON public.direct_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM direct_conversations
    WHERE direct_conversations.id = direct_messages.conversation_id
      AND (direct_conversations.organizer_id = auth.uid() 
           OR direct_conversations.runner_id = auth.uid())
  )
);

-- Admins pueden gestionar todo
CREATE POLICY "Admins pueden gestionar conversaciones"
ON public.direct_conversations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins pueden gestionar mensajes"
ON public.direct_messages
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;