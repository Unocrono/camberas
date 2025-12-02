import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSupportMessages } from "@/hooks/useSupportMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Plus, Send, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function Support() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [newConversationSubject, setNewConversationSubject] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);

  const { conversations, messages, loading, createConversation, sendMessage } =
    useSupportMessages(selectedConversationId || undefined);

  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("Debes iniciar sesión para acceder al soporte");
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const handleCreateConversation = async () => {
    if (!newConversationSubject.trim()) {
      toast.error("Por favor, escribe un asunto");
      return;
    }

    const conversation = await createConversation(newConversationSubject);
    if (conversation) {
      setSelectedConversationId(conversation.id);
      setNewConversationSubject("");
      setShowNewConversation(false);
      toast.success("Conversación creada");
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversationId) return;

    const success = await sendMessage(newMessage, selectedConversationId);
    if (success) {
      setNewMessage("");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Soporte Camberas</h1>
              <p className="text-muted-foreground">Chatea con nuestro equipo</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Lista de conversaciones */}
            <Card className="md:col-span-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Conversaciones</CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowNewConversation(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {showNewConversation && (
                  <div className="p-4 border-b">
                    <Input
                      placeholder="Asunto de la consulta"
                      value={newConversationSubject}
                      onChange={(e) => setNewConversationSubject(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateConversation()}
                    />
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={handleCreateConversation}>
                        Crear
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowNewConversation(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                <ScrollArea className="h-[500px]">
                  {conversations.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No tienes conversaciones</p>
                      <Button
                        variant="link"
                        className="mt-2"
                        onClick={() => setShowNewConversation(true)}
                      >
                        Crear primera conversación
                      </Button>
                    </div>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`p-4 cursor-pointer border-b hover:bg-muted/50 transition-colors ${
                          selectedConversationId === conv.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedConversationId(conv.id)}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-medium text-sm line-clamp-1">{conv.subject}</p>
                          <Badge variant={conv.status === "open" ? "default" : "secondary"}>
                            {conv.status === "open" ? "Abierto" : "Cerrado"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(conv.last_message_at), "dd MMM HH:mm", {
                            locale: es,
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Chat */}
            <Card className="md:col-span-2">
              {selectedConversationId ? (
                <>
                  <CardHeader>
                    <CardTitle>
                      {conversations.find((c) => c.id === selectedConversationId)?.subject}
                    </CardTitle>
                    <CardDescription>
                      Conversa con el equipo de Camberas
                    </CardDescription>
                  </CardHeader>
                  <Separator />
                  <ScrollArea className="h-[400px] p-4">
                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>No hay mensajes. Escribe el primero.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${
                              msg.sender_type === "user" ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-3 ${
                                msg.sender_type === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              <p className="text-xs opacity-70 mt-1">
                                {format(new Date(msg.created_at), "HH:mm", { locale: es })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  <Separator />
                  <CardContent className="pt-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Escribe tu mensaje..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                      />
                      <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </>
              ) : (
                <div className="flex items-center justify-center h-[550px] text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Selecciona una conversación o crea una nueva</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
