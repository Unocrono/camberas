-- Tabla de conversaciones de soporte (Usuario <-> Camberas Support)
CREATE TABLE support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('open', 'closed'))
);

-- Tabla de mensajes de soporte
CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES support_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_sender_type CHECK (sender_type IN ('user', 'support'))
);

-- Habilitar RLS
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Políticas para support_conversations
CREATE POLICY "Users can view their own support conversations"
  ON support_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create support conversations"
  ON support_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all support conversations"
  ON support_conversations FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update support conversations"
  ON support_conversations FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- Políticas para support_messages
CREATE POLICY "Users can view their support messages"
  ON support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_conversations
      WHERE id = support_messages.conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send support messages"
  ON support_messages FOR INSERT
  WITH CHECK (
    sender_type = 'user' 
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM support_conversations
      WHERE id = support_messages.conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all support messages"
  ON support_messages FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can send support messages"
  ON support_messages FOR INSERT
  WITH CHECK (
    sender_type = 'support'
    AND has_role(auth.uid(), 'admin')
  );

-- Trigger para updated_at
CREATE TRIGGER update_support_conversations_updated_at
  BEFORE UPDATE ON support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Trigger para actualizar last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_last_message_trigger
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE support_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;