import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrganizerRequest {
  role_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

const OrganizerApprovalManagement = () => {
  const [requests, setRequests] = useState<OrganizerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<OrganizerRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchOrganizerRequests();
  }, []);

  const fetchOrganizerRequests = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .rpc('get_organizer_requests');

      if (error) throw error;

      setRequests(data || []);
    } catch (error: any) {
      console.error("Error fetching organizer requests:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las solicitudes de organizadores",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (roleId: string, newStatus: 'approved' | 'rejected') => {
    try {
      setActionLoading(roleId);

      const { error } = await supabase
        .from("user_roles")
        .update({ status: newStatus })
        .eq("id", roleId);

      if (error) throw error;

      toast({
        title: newStatus === 'approved' ? "Solicitud aprobada" : "Solicitud rechazada",
        description: `La solicitud de organizador ha sido ${newStatus === 'approved' ? 'aprobada' : 'rechazada'}.`,
      });

      fetchOrganizerRequests();
    } catch (error: any) {
      console.error("Error updating organizer status:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el estado",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setSelectedRequest(null);
      setActionType(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pendiente</Badge>;
      case 'approved':
        return <Badge className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" />Aprobado</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rechazado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Aprobación de Organizadores</h2>
        <p className="text-muted-foreground">
          Gestiona las solicitudes de registro como organizador
        </p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <p className="text-muted-foreground">No hay solicitudes de organizadores</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request.role_id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>
                      {request.first_name} {request.last_name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {request.email}
                    </CardDescription>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Solicitado el {new Date(request.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                  {request.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setSelectedRequest(request);
                          setActionType('reject');
                        }}
                        disabled={actionLoading === request.role_id}
                      >
                        {actionLoading === request.role_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Rechazar
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setActionType('approve');
                        }}
                        disabled={actionLoading === request.role_id}
                      >
                        {actionLoading === request.role_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Aprobar
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!selectedRequest && !!actionType} onOpenChange={() => {
        setSelectedRequest(null);
        setActionType(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? '¿Aprobar solicitud?' : '¿Rechazar solicitud?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve' 
                ? `Estás a punto de aprobar la solicitud de ${selectedRequest?.first_name} ${selectedRequest?.last_name} como organizador. Podrá crear y gestionar carreras en la plataforma.`
                : `Estás a punto de rechazar la solicitud de ${selectedRequest?.first_name} ${selectedRequest?.last_name} como organizador.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedRequest && handleAction(selectedRequest.role_id, actionType === 'approve' ? 'approved' : 'rejected')}
              className={actionType === 'reject' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {actionType === 'approve' ? 'Aprobar' : 'Rechazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrganizerApprovalManagement;
