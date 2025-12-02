import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface DirectConversation {
  id: string;
  race_id: string;
  organizer_id: string;
  runner_id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  unread_count_organizer: number;
  unread_count_runner: number;
  status: string;
  race?: {
    name: string;
  };
  organizer?: {
    first_name: string | null;
    last_name: string | null;
  };
  runner?: {
    first_name: string | null;
    last_name: string | null;
  };
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
}

export const useDirectMessages = (conversationId?: string) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Cargar conversaciones del usuario
  useEffect(() => {
    if (!user) return;

    const fetchConversations = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("direct_conversations")
          .select(`
            *,
            race:races(name),
            organizer:profiles!direct_conversations_organizer_id_fkey(first_name, last_name),
            runner:profiles!direct_conversations_runner_id_fkey(first_name, last_name)
          `)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });

        if (error) throw error;
        setConversations(data || []);
      } catch (error: any) {
        console.error("Error fetching conversations:", error);
        toast.error("Error al cargar conversaciones");
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();

    // Suscripción en tiempo real para conversaciones
    const conversationsChannel = supabase
      .channel("direct_conversations_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_conversations",
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
    };
  }, [user]);

  // Cargar mensajes de una conversación específica
  useEffect(() => {
    if (!conversationId || !user) return;

    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from("direct_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (error) throw error;
        setMessages(data || []);

        // Marcar mensajes como leídos
        await markAsRead(conversationId);
      } catch (error: any) {
        console.error("Error fetching messages:", error);
        toast.error("Error al cargar mensajes");
      }
    };

    fetchMessages();

    // Suscripción en tiempo real para mensajes
    const messagesChannel = supabase
      .channel(`direct_messages_${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as DirectMessage]);
          // Marcar como leído si el usuario es el receptor
          if (payload.new.sender_id !== user.id) {
            setTimeout(() => markAsRead(conversationId), 1000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [conversationId, user]);

  // Marcar mensajes como leídos
  const markAsRead = async (convId: string) => {
    if (!user) return;

    try {
      await supabase.rpc("mark_messages_as_read", {
        p_conversation_id: convId,
        p_user_id: user.id,
      });
    } catch (error: any) {
      console.error("Error marking messages as read:", error);
    }
  };

  // Enviar mensaje
  const sendMessage = async (conversationId: string, message: string) => {
    if (!user || !message.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        message: message.trim(),
      });

      if (error) throw error;
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error("Error al enviar mensaje");
    } finally {
      setSending(false);
    }
  };

  // Crear o obtener conversación
  const getOrCreateConversation = async (
    raceId: string,
    organizerId: string,
    runnerId: string
  ) => {
    if (!user) return null;

    try {
      // Verificar si ya existe la conversación
      const { data: existing, error: fetchError } = await supabase
        .from("direct_conversations")
        .select("*")
        .eq("race_id", raceId)
        .eq("organizer_id", organizerId)
        .eq("runner_id", runnerId)
        .single();

      if (existing) return existing;

      // Crear nueva conversación
      const { data: newConv, error: createError } = await supabase
        .from("direct_conversations")
        .insert({
          race_id: raceId,
          organizer_id: organizerId,
          runner_id: runnerId,
        })
        .select()
        .single();

      if (createError) throw createError;
      return newConv;
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      toast.error("Error al crear conversación");
      return null;
    }
  };

  // Obtener conteo total de mensajes no leídos
  const getUnreadCount = () => {
    if (!user) return 0;

    return conversations.reduce((total, conv) => {
      if (conv.organizer_id === user.id) {
        return total + conv.unread_count_organizer;
      } else if (conv.runner_id === user.id) {
        return total + conv.unread_count_runner;
      }
      return total;
    }, 0);
  };

  return {
    conversations,
    messages,
    loading,
    sending,
    sendMessage,
    getOrCreateConversation,
    getUnreadCount,
  };
};
