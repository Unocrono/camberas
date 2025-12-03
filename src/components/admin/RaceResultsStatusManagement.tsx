import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Edit, Trash2, Flag, CheckCircle, XCircle, AlertTriangle, Clock, UserX, Ban } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface RaceResultsStatus {
  id: string;
  sort_order: number;
  code: string;
  name: string;
  can_change_at_split: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const getStatusIcon = (code: string) => {
  switch (code) {
    case 'FIN': return CheckCircle;
    case 'STD': return Clock;
    case 'DNF': return XCircle;
    case 'DNS': return UserX;
    case 'DSQ': return Ban;
    case 'CUT': return AlertTriangle;
    case 'INS': return Flag;
    default: return Flag;
  }
};

const getStatusColor = (code: string) => {
  switch (code) {
    case 'FIN': return 'text-green-600';
    case 'STD': return 'text-blue-600';
    case 'DNF': return 'text-orange-600';
    case 'DNS': return 'text-gray-500';
    case 'DSQ': return 'text-red-600';
    case 'CUT': return 'text-yellow-600';
    case 'INS': return 'text-purple-600';
    default: return 'text-muted-foreground';
  }
};

export function RaceResultsStatusManagement() {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<RaceResultsStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<RaceResultsStatus | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    sort_order: "0",
    can_change_at_split: false,
  });

  useEffect(() => {
    fetchStatuses();
  }, []);

  const fetchStatuses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("race_results_status")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setStatuses((data as RaceResultsStatus[]) || []);
    } catch (error: any) {
      console.error("Error fetching statuses:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los estados",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (status?: RaceResultsStatus) => {
    if (status) {
      setSelectedStatus(status);
      setFormData({
        code: status.code,
        name: status.name,
        description: status.description || "",
        sort_order: String(status.sort_order),
        can_change_at_split: status.can_change_at_split,
      });
    } else {
      setSelectedStatus(null);
      const maxOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.sort_order)) + 1 : 1;
      setFormData({
        code: "",
        name: "",
        description: "",
        sort_order: String(maxOrder),
        can_change_at_split: false,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const statusData = {
        code: formData.code.toUpperCase(),
        name: formData.name,
        description: formData.description || null,
        sort_order: parseInt(formData.sort_order) || 0,
        can_change_at_split: formData.can_change_at_split,
      };

      if (selectedStatus) {
        const { error } = await supabase
          .from("race_results_status")
          .update(statusData)
          .eq("id", selectedStatus.id);

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Estado actualizado correctamente",
        });
      } else {
        const { error } = await supabase
          .from("race_results_status")
          .insert(statusData);

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Estado creado correctamente",
        });
      }

      setDialogOpen(false);
      fetchStatuses();
    } catch (error: any) {
      console.error("Error saving status:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedStatus) return;

    try {
      const { error } = await supabase
        .from("race_results_status")
        .delete()
        .eq("id", selectedStatus.id);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Estado eliminado correctamente",
      });

      setDeleteDialogOpen(false);
      fetchStatuses();
    } catch (error: any) {
      console.error("Error deleting status:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Estados de Resultados</h2>
          <p className="text-muted-foreground">Gestiona los estados posibles de un participante en carrera</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Estado
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedStatus ? "Editar Estado" : "Crear Estado"}
              </DialogTitle>
              <DialogDescription>
                {selectedStatus
                  ? "Modifica los datos del estado"
                  : "Crea un nuevo estado de resultado"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="Ej: DNF"
                    maxLength={5}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Abandono"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sort_order">Orden de visualización</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del estado..."
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="can_change_at_split"
                  checked={formData.can_change_at_split}
                  onCheckedChange={(checked) => setFormData({ ...formData, can_change_at_split: checked })}
                />
                <Label htmlFor="can_change_at_split">Puede cambiar automáticamente en splits</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {selectedStatus ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {statuses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No hay estados definidos.
              <br />
              Crea uno para comenzar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {statuses.map((status) => {
            const IconComponent = getStatusIcon(status.code);
            const colorClass = getStatusColor(status.code);
            return (
              <Card key={status.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconComponent className={`h-5 w-5 ${colorClass}`} />
                      <span>{status.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(status)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedStatus(status);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {status.code}
                    </Badge>
                    <span>Orden: {status.sort_order}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {status.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {status.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className={status.can_change_at_split ? "text-green-600" : "text-muted-foreground"}>
                      {status.can_change_at_split ? "✓ Auto en splits" : "✗ Solo manual"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar estado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si hay resultados usando este estado,
              podrían quedar sin estado asignado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
