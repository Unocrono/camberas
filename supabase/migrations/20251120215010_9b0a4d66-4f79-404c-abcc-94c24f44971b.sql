-- Create training plans table
CREATE TABLE public.training_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  race_id UUID REFERENCES public.races(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  fitness_level TEXT NOT NULL,
  weeks_until_race INTEGER NOT NULL,
  plan_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

-- Policies for training plans
CREATE POLICY "Users can view their own training plans"
ON public.training_plans
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own training plans"
ON public.training_plans
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own training plans"
ON public.training_plans
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training plans"
ON public.training_plans
FOR DELETE
USING (auth.uid() = user_id);

-- Create chat conversations table
CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nueva conversación',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Policies for chat conversations
CREATE POLICY "Users can view their own conversations"
ON public.chat_conversations
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.chat_conversations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.chat_conversations
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
ON public.chat_conversations
FOR DELETE
USING (auth.uid() = user_id);

-- Create chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for chat messages
CREATE POLICY "Users can view messages from their conversations"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE chat_conversations.id = chat_messages.conversation_id
    AND chat_conversations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create messages in their conversations"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE chat_conversations.id = chat_messages.conversation_id
    AND chat_conversations.user_id = auth.uid()
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_training_plans_updated_at
BEFORE UPDATE ON public.training_plans
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_chat_conversations_updated_at
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();