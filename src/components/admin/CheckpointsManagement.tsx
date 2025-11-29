import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Pencil } from "lucide-react";

interface Checkpoint {
  id: string;
  name: string;
  lugar: string | null;
  checkpoint_order: number;
  distance_km: number;
  race_id: string;
  race_distance_id: string | null;
}

interface CheckpointsManagementProps {
  selectedRaceId: string;
  selectedDistanceId: string;
}

export function CheckpointsManagement({ selectedRaceId, selectedDistanceId }: CheckpointsManagementProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    lugar: "",
    checkpoint_order: 1,
    distance_km: 0,
  });

  useEffect(() => {
    if (selectedDistanceId) {
      fetchCheckpoints();
    }
  }, [selectedDistanceId]);

  const fetchCheckpoints = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("race_checkpoints")
      .select("*")
      .eq("race_distance_id", selectedDistanceId)
      .order("checkpoint_order");

    if (error) {
      toast.error("Error al cargar los puntos de control");
      console.error(error);
    } else {
      setCheckpoints(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      lugar: "",
      checkpoint_order: checkpoints.length + 1,
      distance_km: 0,
    });
    setSelectedCheckpoint(null);
    setIsEditing(false);
  };

  const handleOpenDialog = (checkpoint?: Checkpoint) => {
    if (checkpoint) {
      setFormData({
        name: checkpoint.name,
        lugar: checkpoint.lugar || "",
        checkpoint_order: checkpoint.checkpoint_order,
        distance_km: checkpoint.distance_km,
      });
      setSelectedCheckpoint(checkpoint);
      setIsEditing(true);
    } else {
      resetForm();
      setFormData(prev => ({
        ...prev,
        checkpoint_order: checkpoints.length + 1,
      }));
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditing && selectedCheckpoint) {
      const { error } = await supabase
        .from("race_checkpoints")
        .update({
          name: formData.name,
          lugar: formData.lugar || null,
          checkpoint_order: formData.checkpoint_order,
          distance_km: formData.distance_km,
        })
        .eq("id", selectedCheckpoint.id);

      if (error) {
        toast.error("Error al actualizar el punto de control");
        console.error(error);
        return;
      }
      toast.success("Punto de control actualizado");
    } else {
      const { error } = await supabase.from("race_checkpoints").insert({
        race_id: selectedRaceId,
        race_distance_id: selectedDistanceId,
        name: formData.name,
        lugar: formData.lugar || null,
        checkpoint_order: formData.checkpoint_order,
        distance_km: formData.distance_km,
      });

      if (error) {
        toast.error("Error al crear el punto de control");
        console.error(error);
        return;
      }
      toast.success("Punto de control creado");
    }

    setIsDialogOpen(false);
    resetForm();
    fetchCheckpoints();
  };

  const handleDeleteClick = (checkpoint: Checkpoint) => {
    setSelectedCheckpoint(checkpoint);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedCheckpoint) return;

    const { error } = await supabase
      .from("race_checkpoints")
      .delete()
      .eq("id", selectedCheckpoint.id);

    if (error) {
      toast.error("Error al eliminar el punto de control");
      console.error(error);
      return;
    }

    toast.success("Punto de control eliminado");
    setIsDeleteDialogOpen(false);
    setSelectedCheckpoint(null);
    fetchCheckpoints();
  };

  if (!selectedRaceId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Selecciona una carrera para gestionar sus puntos de control
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!selectedDistanceId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Selecciona una distancia para gestionar sus puntos de control
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Puntos de Control
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir Punto de Control
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isEditing ? "Editar Punto de Control" : "Crear Punto de Control"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Avituallamiento 1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lugar">Lugar</Label>
                  <Input
                    id="lugar"
                    value={formData.lugar}
                    onChange={(e) => setFormData({ ...formData, lugar: e.target.value })}
                    placeholder="Ej: Plaza Mayor"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="order">Orden</Label>
                    <Input
                      id="order"
                      type="number"
                      min="1"
                      value={formData.checkpoint_order}
                      onChange={(e) => setFormData({ ...formData, checkpoint_order: parseInt(e.target.value) || 1 })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="distance">Distancia (km)</Label>
                    <Input
                      id="distance"
                      type="number"
                      step="0.1"
                      min="0"
                      value={formData.distance_km}
                      onChange={(e) => setFormData({ ...formData, distance_km: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  {isEditing ? "Guardar Cambios" : "Crear Punto de Control"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-4">Cargando...</p>
          ) : checkpoints.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No hay puntos de control configurados. Los puntos de control "Salida" y "Meta" se crean automáticamente al añadir una distancia.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Orden</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Lugar</TableHead>
                  <TableHead className="text-right">Distancia (km)</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkpoints.map((checkpoint) => (
                  <TableRow key={checkpoint.id}>
                    <TableCell>
                      <Badge variant="outline">{checkpoint.checkpoint_order}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{checkpoint.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {checkpoint.lugar || "-"}
                    </TableCell>
                    <TableCell className="text-right">{checkpoint.distance_km}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpenDialog(checkpoint)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDeleteClick(checkpoint)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar punto de control?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el punto de control "{selectedCheckpoint?.name}". 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
