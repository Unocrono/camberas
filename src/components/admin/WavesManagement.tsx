import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Wave {
  id: string;
  race_id: string;
  race_distance_id: string;
  wave_name: string;
  start_time: string | null;
  created_at: string;
  updated_at: string;
  distance?: {
    name: string;
    distance_km: number;
  };
}

interface WavesManagementProps {
  selectedRaceId: string;
}

export function WavesManagement({ selectedRaceId }: WavesManagementProps) {
  const { toast } = useToast();
  const [waves, setWaves] = useState<Wave[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWave, setEditingWave] = useState<Wave | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    wave_name: "",
    start_date: "",
    start_time: "",
  });

  useEffect(() => {
    if (selectedRaceId) {
      fetchWaves();
    } else {
      setWaves([]);
      setLoading(false);
    }
  }, [selectedRaceId]);

  const fetchWaves = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("race_waves")
        .select(`
          *,
          distance:race_distances(name, distance_km)
        `)
        .eq("race_id", selectedRaceId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setWaves(data || []);
    } catch (error: any) {
      console.error("Error fetching waves:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las oleadas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (wave: Wave) => {
    setEditingWave(wave);
    
    let startDate = "";
    let startTime = "";
    
    if (wave.start_time) {
      const date = new Date(wave.start_time);
      startDate = format(date, "yyyy-MM-dd");
      startTime = format(date, "HH:mm");
    }
    
    setFormData({
      wave_name: wave.wave_name,
      start_date: startDate,
      start_time: startTime,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingWave) return;

    try {
      setSaving(true);
      
      let startTimestamp: string | null = null;
      if (formData.start_date && formData.start_time) {
        startTimestamp = new Date(`${formData.start_date}T${formData.start_time}:00`).toISOString();
      }

      const { error } = await supabase
        .from("race_waves")
        .update({
          wave_name: formData.wave_name,
          start_time: startTimestamp,
        })
        .eq("id", editingWave.id);

      if (error) throw error;

      toast({
        title: "Oleada actualizada",
        description: "La hora de salida se ha guardado correctamente",
      });

      setDialogOpen(false);
      setEditingWave(null);
      fetchWaves();
    } catch (error: any) {
      console.error("Error saving wave:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar la oleada",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatStartTime = (startTime: string | null) => {
    if (!startTime) return "Sin configurar";
    try {
      const date = new Date(startTime);
      return format(date, "dd/MM/yyyy HH:mm", { locale: es });
    } catch {
      return "Fecha inválida";
    }
  };

  if (!selectedRaceId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecciona una carrera para gestionar las oleadas de salida</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Oleadas de Salida
        </CardTitle>
      </CardHeader>
      <CardContent>
        {waves.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No hay oleadas configuradas. Las oleadas se crean automáticamente al añadir distancias.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento / Distancia</TableHead>
                <TableHead>Nombre Oleada</TableHead>
                <TableHead>Hora de Salida</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waves.map((wave) => (
                <TableRow key={wave.id}>
                  <TableCell className="font-medium">
                    {wave.distance?.name || "Sin distancia"} 
                    {wave.distance?.distance_km && (
                      <span className="text-muted-foreground ml-1">
                        ({wave.distance.distance_km} km)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{wave.wave_name}</TableCell>
                  <TableCell>
                    <span className={wave.start_time ? "" : "text-muted-foreground"}>
                      {formatStartTime(wave.start_time)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(wave)}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Oleada de Salida</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="wave_name">Nombre de la Oleada</Label>
                <Input
                  id="wave_name"
                  value={formData.wave_name}
                  onChange={(e) => setFormData({ ...formData, wave_name: e.target.value })}
                  placeholder="Ej: Salida Elite, Salida General..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Fecha de Salida</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
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
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
