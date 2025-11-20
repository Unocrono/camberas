import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Calendar as CalendarIcon, MapPin } from "lucide-react";
import { z } from "zod";

const raceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(1000, "Máximo 1000 caracteres").optional(),
  location: z.string().trim().min(1, "La ubicación es requerida").max(200, "Máximo 200 caracteres"),
  date: z.string().min(1, "La fecha es requerida"),
  max_participants: z.number().positive().optional(),
  image_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

interface Race {
  id: string;
  name: string;
  description: string | null;
  location: string;
  date: string;
  max_participants: number | null;
  image_url: string | null;
  created_at: string;
}

export function RaceManagement() {
  const { toast } = useToast();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRace, setEditingRace] = useState<Race | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    location: "",
    date: "",
    max_participants: "",
    image_url: "",
  });

  useEffect(() => {
    fetchRaces();
  }, []);

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      setRaces(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar carreras",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (race?: Race) => {
    if (race) {
      setEditingRace(race);
      setFormData({
        name: race.name,
        description: race.description || "",
        location: race.location,
        date: race.date,
        max_participants: race.max_participants?.toString() || "",
        image_url: race.image_url || "",
      });
    } else {
      setEditingRace(null);
      setFormData({
        name: "",
        description: "",
        location: "",
        date: "",
        max_participants: "",
        image_url: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const validatedData = raceSchema.parse({
        ...formData,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : undefined,
        image_url: formData.image_url || undefined,
        description: formData.description || undefined,
      });

      if (editingRace) {
        const { error } = await supabase
          .from("races")
          .update({
            name: validatedData.name,
            description: validatedData.description || null,
            location: validatedData.location,
            date: validatedData.date,
            max_participants: validatedData.max_participants || null,
            image_url: validatedData.image_url || null,
          })
          .eq("id", editingRace.id);

        if (error) throw error;

        toast({
          title: "Carrera actualizada",
          description: "La carrera se ha actualizado exitosamente",
        });
      } else {
        const { error } = await supabase
          .from("races")
          .insert([{
            name: validatedData.name,
            description: validatedData.description || null,
            location: validatedData.location,
            date: validatedData.date,
            max_participants: validatedData.max_participants || null,
            image_url: validatedData.image_url || null,
          }]);

        if (error) throw error;

        toast({
          title: "Carrera creada",
          description: "La carrera se ha creado exitosamente",
        });
      }

      setIsDialogOpen(false);
      fetchRaces();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Error de validación",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (raceId: string) => {
    try {
      const { error } = await supabase
        .from("races")
        .delete()
        .eq("id", raceId);

      if (error) throw error;

      toast({
        title: "Carrera eliminada",
        description: "La carrera se ha eliminado exitosamente",
      });

      fetchRaces();
    } catch (error: any) {
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Cargando carreras...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Gestión de Carreras</h2>
          <p className="text-muted-foreground">Crea, edita y elimina carreras</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva Carrera
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRace ? "Editar Carrera" : "Nueva Carrera"}</DialogTitle>
              <DialogDescription>
                {editingRace ? "Modifica los datos de la carrera" : "Completa los datos para crear una nueva carrera"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Carrera *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Ubicación *</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Fecha *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_participants">Máximo de Participantes</Label>
                  <Input
                    id="max_participants"
                    type="number"
                    min="1"
                    value={formData.max_participants}
                    onChange={(e) => setFormData({ ...formData, max_participants: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image_url">URL de Imagen</Label>
                  <Input
                    id="image_url"
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : editingRace ? "Actualizar Carrera" : "Crear Carrera"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {races.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarIcon className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No hay carreras</h3>
              <p className="text-muted-foreground">Crea tu primera carrera para comenzar</p>
            </CardContent>
          </Card>
        ) : (
          races.map((race) => (
            <Card key={race.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-2xl">{race.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {race.description || "Sin descripción"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleOpenDialog(race)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar carrera?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará permanentemente <strong>{race.name}</strong> y todas sus distancias e inscripciones relacionadas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(race.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {new Date(race.date).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{race.location}</span>
                  </div>
                  {race.max_participants && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Capacidad:</span>
                      <span>{race.max_participants} participantes</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
