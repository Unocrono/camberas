import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDirectMessages } from "@/hooks/useDirectMessages";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function DirectMessageChat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, sending, sendMessage } = useDirectMessages(conversationId);
  const [newMessage, setNewMessage] = useState("");
  const [conversation, setConversation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cargar datos de la conversación
  useEffect(() => {
    if (!conversationId) return;

    const fetchConversation = async () => {
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
          .eq("id", conversationId)
          .single();

        if (error) throw error;
        setConversation(data);
      } catch (error) {
        console.error("Error fetching conversation:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversation();
  }, [conversationId]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conversationId || !newMessage.trim() || sending) return;

    await sendMessage(conversationId, newMessage);
    setNewMessage("");
  };

  const getOtherParticipant = () => {
    if (!conversation) return { name: "", id: "" };

    if (conversation.organizer_id === user?.id) {
      return {
        id: conversation.runner_id,
        name: `${conversation.runner?.first_name || ""} ${conversation.runner?.last_name || ""}`.trim() || "Corredor",
      };
    } else {
      return {
        id: conversation.organizer_id,
        name: `${conversation.organizer?.first_name || ""} ${conversation.organizer?.last_name || ""}`.trim() || "Organizador",
      };
    }
  };

  const participant = getOtherParticipant();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8">
          <Skeleton className="h-96 w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-4">
        <div className="max-w-4xl mx-auto h-[calc(100vh-200px)] flex flex-col">
          {/* Header */}
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center gap-4 py-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/messages")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{participant.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {conversation?.race?.name}
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Mensajes */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-center">
                    No hay mensajes aún.
                    <br />
                    Envía el primero para comenzar la conversación.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isOwn = message.sender_id === user?.id;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        isOwn ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg px-4 py-2",
                          isOwn
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <p className="break-words">{message.message}</p>
                        <p
                          className={cn(
                            "text-xs mt-1",
                            isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}
                        >
                          {formatDistanceToNow(new Date(message.created_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </CardContent>

            {/* Input de mensaje */}
            <div className="border-t p-4">
              <form onSubmit={handleSend} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  disabled={sending}
                  className="flex-1"
                />
                <Button type="submit" disabled={sending || !newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
