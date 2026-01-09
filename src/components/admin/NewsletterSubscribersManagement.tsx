import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, Trash2, Loader2, Mail, Users, CheckCircle, XCircle, Clock, Download } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Subscriber {
  id: string;
  email: string;
  first_name: string | null;
  status: string;
  segments: string[] | null;
  source: string | null;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  pending: { label: "Pendiente", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  confirmed: { label: "Confirmado", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  unsubscribed: { label: "Dado de baja", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
};

const segmentLabels: Record<string, string> = {
  general: "General",
  runners: "Corredores",
  organizers: "Organizadores",
  trail: "Trail Running",
  road: "Asfalto",
  mtb: "MTB",
};

export default function NewsletterSubscribersManagement() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [deleteSubscriber, setDeleteSubscriber] = useState<Subscriber | null>(null);

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const fetchSubscribers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("newsletter_subscribers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSubscribers(data || []);
    } catch (error) {
      console.error("Error fetching subscribers:", error);
      toast.error("Error al cargar los suscriptores");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteSubscriber) return;

    try {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .delete()
        .eq("id", deleteSubscriber.id);

      if (error) throw error;
      
      toast.success("Suscriptor eliminado");
      fetchSubscribers();
    } catch (error) {
      console.error("Error deleting subscriber:", error);
      toast.error("Error al eliminar el suscriptor");
    } finally {
      setDeleteSubscriber(null);
    }
  };

  const handleExportCSV = () => {
    const headers = ["Email", "Nombre", "Estado", "Segmentos", "Fuente", "Fecha suscripción", "Fecha confirmación"];
    const rows = filteredSubscribers.map(sub => [
      sub.email,
      sub.first_name || "",
      statusConfig[sub.status]?.label || sub.status,
      sub.segments?.map(s => segmentLabels[s] || s).join(", ") || "",
      sub.source || "",
      format(new Date(sub.created_at), "dd/MM/yyyy HH:mm"),
      sub.confirmed_at ? format(new Date(sub.confirmed_at), "dd/MM/yyyy HH:mm") : "",
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `newsletter_subscribers_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Get unique segments from all subscribers
  const allSegments = Array.from(
    new Set(subscribers.flatMap(s => s.segments || []))
  );

  const filteredSubscribers = subscribers.filter((sub) => {
    const matchesSearch = 
      sub.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.first_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    
    const matchesSegment = segmentFilter === "all" || sub.segments?.includes(segmentFilter);

    return matchesSearch && matchesStatus && matchesSegment;
  });

  // Stats
  const stats = {
    total: subscribers.length,
    confirmed: subscribers.filter(s => s.status === "confirmed").length,
    pending: subscribers.filter(s => s.status === "pending").length,
    unsubscribed: subscribers.filter(s => s.status === "unsubscribed").length,
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Confirmados</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Pendientes</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Bajas</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.unsubscribed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Suscriptores Newsletter
          </CardTitle>
          <Button variant="outline" onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por email o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="unsubscribed">Dados de baja</SelectItem>
              </SelectContent>
            </Select>
            <Select value={segmentFilter} onValueChange={setSegmentFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Segmento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los segmentos</SelectItem>
                {allSegments.map(segment => (
                  <SelectItem key={segment} value={segment}>
                    {segmentLabels[segment] || segment}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSubscribers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || statusFilter !== "all" || segmentFilter !== "all" 
                ? "No se encontraron suscriptores con los filtros aplicados" 
                : "No hay suscriptores todavía"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Segmentos</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubscribers.map((subscriber) => (
                    <TableRow key={subscriber.id}>
                      <TableCell className="font-medium">{subscriber.email}</TableCell>
                      <TableCell>{subscriber.first_name || "-"}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={statusConfig[subscriber.status]?.variant || "secondary"}
                          className="gap-1"
                        >
                          {statusConfig[subscriber.status]?.icon}
                          {statusConfig[subscriber.status]?.label || subscriber.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {subscriber.segments?.map(segment => (
                            <Badge key={segment} variant="outline" className="text-xs">
                              {segmentLabels[segment] || segment}
                            </Badge>
                          )) || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {subscriber.source || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(subscriber.created_at), "dd/MM/yyyy", { locale: es })}
                          {subscriber.confirmed_at && (
                            <p className="text-xs text-muted-foreground">
                              Confirmado: {format(new Date(subscriber.confirmed_at), "dd/MM/yyyy", { locale: es })}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteSubscriber(subscriber)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteSubscriber} onOpenChange={() => setDeleteSubscriber(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar suscriptor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el suscriptor
              "{deleteSubscriber?.email}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
