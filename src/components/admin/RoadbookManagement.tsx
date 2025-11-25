import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Edit, Trash2, Map, Settings } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Roadbook {
  id: string;
  race_distance_id: string;
  name: string;
  description: string | null;
  start_time: string | null;
  created_at: string;
  updated_at: string;
}

interface RoadbookManagementProps {
  distanceId: string;
}

export function RoadbookManagement({ distanceId }: RoadbookManagementProps) {
  const [roadbooks, setRoadbooks] = useState<Roadbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRoadbook, setSelectedRoadbook] = useState<Roadbook | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    start_time: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (distanceId) {
      fetchRoadbooks();
    }
  }, [distanceId]);

  const fetchRoadbooks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("roadbooks")
        .select("*")
        .eq("race_distance_id", distanceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRoadbooks(data || []);
    } catch (error: any) {
      console.error("Error fetching roadbooks:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los rutómetros",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (roadbook?: Roadbook) => {
    if (roadbook) {
      setSelectedRoadbook(roadbook);
      setFormData({
        name: roadbook.name,
        description: roadbook.description || "",
        start_time: roadbook.start_time || "",
      });
    } else {
      setSelectedRoadbook(null);
      setFormData({
        name: "",
        description: "",
        start_time: "",
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (selectedRoadbook) {
        const { error } = await supabase
          .from("roadbooks")
          .update({
            name: formData.name,
            description: formData.description || null,
            start_time: formData.start_time || null,
          })
          .eq("id", selectedRoadbook.id);

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Rutómetro actualizado correctamente",
        });
      } else {
        const { error } = await supabase.from("roadbooks").insert({
          race_distance_id: distanceId,
          name: formData.name,
          description: formData.description || null,
          start_time: formData.start_time || null,
        });

        if (error) throw error;

        toast({
          title: "Éxito",
          description: "Rutómetro creado correctamente",
        });
      }

      setDialogOpen(false);
      fetchRoadbooks();
    } catch (error: any) {
      console.error("Error saving roadbook:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedRoadbook) return;

    try {
      const { error } = await supabase
        .from("roadbooks")
        .delete()
        .eq("id", selectedRoadbook.id);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Rutómetro eliminado correctamente",
      });

      setDeleteDialogOpen(false);
      fetchRoadbooks();
    } catch (error: any) {
      console.error("Error deleting roadbook:", error);
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
          <h2 className="text-2xl font-bold">Gestión de Rutómetros</h2>
          <p className="text-muted-foreground">Crea y gestiona los rutómetros de esta distancia</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Rutómetro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedRoadbook ? "Editar Rutómetro" : "Crear Rutómetro"}
              </DialogTitle>
              <DialogDescription>
                {selectedRoadbook
                  ? "Modifica los datos del rutómetro"
                  : "Crea un nuevo rutómetro para esta carrera"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Rutómetro Oficial 2024"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del rutómetro"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_time">Hora de Salida</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {selectedRoadbook ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {roadbooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Map className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No hay rutómetros creados para esta distancia.
              <br />
              Crea uno para comenzar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roadbooks.map((roadbook) => (
            <Card key={roadbook.id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between">
                  <span className="line-clamp-1">{roadbook.name}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(roadbook)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedRoadbook(roadbook);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
                {roadbook.description && (
                  <CardDescription className="line-clamp-2">
                    {roadbook.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {roadbook.start_time && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Hora de salida: {roadbook.start_time}
                  </p>
                )}
                <Button variant="outline" className="w-full" asChild>
                  <a href={`/organizer/roadbook/${roadbook.id}`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Gestionar Ítems
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rutómetro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los ítems, ritmos y horarios
              asociados a este rutómetro.
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
