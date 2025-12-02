import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, X, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Conversation {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "closed";
  last_message_at: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_type: "user" | "support";
  sender_id: string | null;
  content: string;
  created_at: string;
}

export default function SupportChat() {
  const { user, isAdmin, loading: authLoading, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("open");

  useEffect(() => {
    if (!authLoading && rolesLoaded) {
      if (user && !isAdmin) {
        navigate("/");
        toast.error("No tienes permisos para acceder a esta página");
      } else if (!user) {
        navigate("/auth");
        toast.error("Debes iniciar sesión");
      }
    }
  }, [user, isAdmin, authLoading, rolesLoaded, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadConversations();
    }
  }, [isAdmin, filter]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation);
    }
  }, [selectedConversation]);

  // Realtime subscriptions
  useEffect(() => {
    if (!isAdmin) return;

    const conversationsChannel = supabase
      .channel("admin_conversations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_conversations",
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel("admin_messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
        },
        (payload) => {
          if (payload.new.conversation_id === selectedConversation) {
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [isAdmin, selectedConversation]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("support_conversations")
        .select("*")
        .order("last_message_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Obtener emails de usuarios
      const conversationsWithUserData = await Promise.all(
        (data || []).map(async (conv) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", conv.user_id)
            .single();

          return {
            ...conv,
            user_name: profile
              ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
              : "Usuario",
          } as Conversation;
        })
      );

      setConversations(conversationsWithUserData);
    } catch (error) {
      console.error("Error loading conversations:", error);
      toast.error("Error al cargar conversaciones");
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);
    } catch (error) {
      console.error("Error loading messages:", error);
      toast.error("Error al cargar mensajes");
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !user) return;

    try {
      setSending(true);
      const { error } = await supabase.from("support_messages").insert({
        conversation_id: selectedConversation,
        sender_type: "support",
        sender_id: user.id,
        content: newMessage.trim(),
      });

      if (error) throw error;

      setNewMessage("");
      toast.success("Mensaje enviado");
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Error al enviar mensaje");
    } finally {
      setSending(false);
    }
  };

  const updateConversationStatus = async (conversationId: string, status: "open" | "closed") => {
    try {
      const { error } = await supabase
        .from("support_conversations")
        .update({ status })
        .eq("id", conversationId);

      if (error) throw error;

      toast.success(`Ticket ${status === "closed" ? "cerrado" : "reabierto"}`);
      loadConversations();
    } catch (error) {
      console.error("Error updating conversation:", error);
      toast.error("Error al actualizar ticket");
    }
  };

  const selectedConv = conversations.find((c) => c.id === selectedConversation);

  if (authLoading || !rolesLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; // El useEffect se encargará de redirigir
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Panel de Soporte
          </CardTitle>
          <CardDescription>Gestiona todas las conversaciones de soporte</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="open" value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="open">Abiertas</TabsTrigger>
              <TabsTrigger value="closed">Cerradas</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Lista de conversaciones */}
            <ScrollArea className="h-[600px] border rounded-lg p-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay conversaciones</p>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedConversation === conv.id
                          ? "bg-primary/10 border-2 border-primary"
                          : "bg-muted/50 hover:bg-muted"
                      }`}
                      onClick={() => setSelectedConversation(conv.id)}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <p className="font-medium text-sm truncate">{conv.subject}</p>
                        <Badge variant={conv.status === "open" ? "default" : "secondary"} className="text-xs">
                          {conv.status === "open" ? "Abierto" : "Cerrado"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">{conv.user_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(conv.last_message_at), "dd MMM HH:mm", { locale: es })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Chat */}
            <div className="md:col-span-2 border rounded-lg flex flex-col">
              {selectedConversation && selectedConv ? (
                <>
                  {/* Header */}
                  <div className="p-4 border-b flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{selectedConv.subject}</h3>
                      <p className="text-sm text-muted-foreground">{selectedConv.user_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateConversationStatus(
                            selectedConversation,
                            selectedConv.status === "open" ? "closed" : "open"
                          )
                        }
                      >
                        {selectedConv.status === "open" ? (
                          <>
                            <X className="h-4 w-4 mr-1" />
                            Cerrar
                          </>
                        ) : (
                          "Reabrir"
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4 h-[450px]">
                    <div className="space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender_type === "support" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                              msg.sender_type === "support"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <p
                              className={`text-xs mt-1 ${
                                msg.sender_type === "support" ? "text-primary-foreground/70" : "text-muted-foreground"
                              }`}
                            >
                              {format(new Date(msg.created_at), "dd MMM HH:mm", { locale: es })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  {selectedConv.status === "open" && (
                    <>
                      <Separator />
                      <div className="p-4 flex gap-2">
                        <Textarea
                          placeholder="Escribe tu respuesta..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              sendMessage();
                            }
                          }}
                          className="min-h-[60px]"
                        />
                        <Button onClick={sendMessage} disabled={sending || !newMessage.trim()} size="icon">
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Selecciona una conversación
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
