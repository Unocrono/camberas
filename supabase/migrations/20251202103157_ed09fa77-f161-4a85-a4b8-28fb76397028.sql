-- Revertir sistema de mensajería directa organizador-corredor

-- Eliminar triggers (orden correcto)
DROP TRIGGER IF EXISTS trigger_update_conversation_on_new_message ON public.direct_messages;
DROP TRIGGER IF EXISTS update_direct_conversations_updated_at ON public.direct_conversations;

-- Eliminar funciones
DROP FUNCTION IF EXISTS public.mark_messages_as_read(UUID, UUID);
DROP FUNCTION IF EXISTS public.update_conversation_on_new_message();

-- Eliminar tablas
DROP TABLE IF EXISTS public.direct_messages CASCADE;
DROP TABLE IF EXISTS public.direct_conversations CASCADE;