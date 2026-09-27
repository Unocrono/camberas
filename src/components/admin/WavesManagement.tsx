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

interface Wave {
  id: string;
  race_id: string;
  race_distance_id: string;
  wave_name: string;
  // OFICIAL (cronometraje): se edita aquí y en /start
  start_time: string | null;
  // PREVISTA: viene de Recorridos y aquí no se edita
  hora_prevista: string | null;
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
      // Parse the timestamp string directly without timezone conversion
      // Expected format: "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DDTHH:mm:ss+00"
      const match = wave.start_time.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        startDate = `${match[1]}-${match[2]}-${match[3]}`;
        startTime = `${match[4]}:${match[5]}:${match[6]}`;
      }
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
      
      // La oficial necesita fecha y hora: con una sola, antes se guardaba vacía.
      // Las dos vacías solo valen si no había oficial (p. ej. renombrar la ola);
      // una oficial que ya existe no se borra desde aquí
      const conFecha = !!formData.start_date;
      const conHora = !!formData.start_time;
      if (conFecha !== conHora || (!conFecha && editingWave.start_time)) {
        toast({
          title: "Falta la fecha o la hora",
          description: "La salida oficial necesita fecha y hora.",
          variant: "destructive",
        });
        return;
      }
      let startTimestamp: string | null = null;
      if (formData.start_date && formData.start_time) {
        // Asegurar formato HH:mm:ss
        let timeValue = formData.start_time;
        if (timeValue.length === 5) {
          timeValue += ":00"; // Si es HH:mm, añadir :00
        }
        // Store as local time directly (no UTC conversion)
        // Format: YYYY-MM-DDTHH:mm:ss without timezone suffix
        startTimestamp = `${formData.start_date}T${timeValue}`;
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
      // Parse the timestamp directly without timezone conversion
      const match = startTime.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const day = match[3];
        const month = match[2];
        const year = match[1];
        const hours = match[4];
        const minutes = match[5];
        const seconds = match[6];
        return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
      }
      return "Fecha inválida";
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
          SALIDAS / WAVES
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
                <TableHead>Hora de salida prevista</TableHead>
                <TableHead>Hora de salida oficial</TableHead>
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
                    <span className="text-muted-foreground" title="Se cambia en Recorridos">
                      {formatStartTime(wave.hora_prevista)}
                    </span>
                  </TableCell>
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
              
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Prevista: </span>
                {formatStartTime(editingWave?.hora_prevista ?? null)}
                <span className="block text-xs text-muted-foreground">
                  La prevista se cambia en Recorridos; aquí solo la oficial, que es la del cronometraje.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Fecha de salida oficial</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start_time">Hora de salida oficial</Label>
                  <Input
                    id="start_time"
                    type="time"
                    step="1"
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
