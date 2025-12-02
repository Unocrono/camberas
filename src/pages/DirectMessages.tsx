import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDirectMessages, DirectConversation } from "@/hooks/useDirectMessages";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function DirectMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations, loading } = useDirectMessages();
  const [filter, setFilter] = useState<"all" | "active" | "archived">("active");

  const filteredConversations = conversations.filter(
    (conv) => filter === "all" || conv.status === filter
  );

  const getOtherParticipant = (conv: DirectConversation) => {
    if (conv.organizer_id === user?.id) {
      return {
        id: conv.runner_id,
        name: `${conv.runner?.first_name || ""} ${conv.runner?.last_name || ""}`.trim() || "Corredor",
      };
    } else {
      return {
        id: conv.organizer_id,
        name: `${conv.organizer?.first_name || ""} ${conv.organizer?.last_name || ""}`.trim() || "Organizador",
      };
    }
  };

  const getUnreadCount = (conv: DirectConversation) => {
    if (conv.organizer_id === user?.id) {
      return conv.unread_count_organizer;
    } else {
      return conv.unread_count_runner;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Mensajes</h1>
              <p className="text-muted-foreground mt-1">
                Conversaciones con organizadores y corredores
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 mb-6">
            <Badge
              variant={filter === "active" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter("active")}
            >
              Activas
            </Badge>
            <Badge
              variant={filter === "archived" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter("archived")}
            >
              Archivadas
            </Badge>
            <Badge
              variant={filter === "all" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter("all")}
            >
              Todas
            </Badge>
          </div>

          {/* Lista de conversaciones */}
          {filteredConversations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No tienes conversaciones {filter !== "all" && filter}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredConversations.map((conv) => {
                const participant = getOtherParticipant(conv);
                const unreadCount = getUnreadCount(conv);

                return (
                  <Card
                    key={conv.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/messages/${conv.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="font-semibold truncate">
                              {participant.name}
                            </h3>
                            {unreadCount > 0 && (
                              <Badge variant="destructive" className="ml-2">
                                {unreadCount}
                              </Badge>
                            )}
                          </div>

                          <p className="text-sm text-muted-foreground mb-2">
                            {conv.race?.name || "Carrera"}
                          </p>

                          {conv.last_message_at && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(conv.last_message_at), {
                                addSuffix: true,
                                locale: es,
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
