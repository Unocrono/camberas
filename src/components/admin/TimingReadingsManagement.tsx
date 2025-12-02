import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Filter, Search, Download } from "lucide-react";

interface TimingReading {
  id: string;
  bib_number: number;
  timing_timestamp: string;
  reading_timestamp: string;
  reading_type: string;
  status_code: string | null;
  is_processed: boolean;
  lap_number: number;
  notes: string | null;
  checkpoint_id: string | null;
  race_id: string;
  race_distance_id: string | null;
  registration_id: string | null;
  operator_user_id: string | null;
  chip_code: string | null;
  reader_device_id: string | null;
  checkpoint?: {
    name: string;
    distance_km: number;
  };
  race_distance?: {
    name: string;
  };
  registration?: {
    guest_first_name: string | null;
    guest_last_name: string | null;
    user_id: string | null;
  };
}

interface Race {
  id: string;
  name: string;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface Checkpoint {
  id: string;
  name: string;
  distance_km: number;
}

interface TimingReadingsManagementProps {
  isOrganizer?: boolean;
  selectedRaceId?: string;
}

export function TimingReadingsManagement({ isOrganizer = false, selectedRaceId }: TimingReadingsManagementProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [readings, setReadings] = useState<TimingReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [races, setRaces] = useState<Race[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  
  // Filters
  const [filterRaceId, setFilterRaceId] = useState<string>(selectedRaceId || "");
  const [filterDistanceId, setFilterDistanceId] = useState<string>("");
  const [filterCheckpointId, setFilterCheckpointId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingReading, setEditingReading] = useState<TimingReading | null>(null);
  const [deletingReading, setDeletingReading] = useState<TimingReading | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    bib_number: "",
    timing_timestamp: "",
    checkpoint_id: "",
    race_distance_id: "",
    lap_number: "1",
    notes: "",
    reading_type: "manual",
    status_code: "",
  });

  useEffect(() => {
    fetchRaces();
  }, [isOrganizer, user]);

  useEffect(() => {
    if (selectedRaceId) {
      setFilterRaceId(selectedRaceId);
    }
  }, [selectedRaceId]);

  useEffect(() => {
    if (filterRaceId) {
      fetchDistances(filterRaceId);
      fetchCheckpoints(filterRaceId);
    } else {
      setDistances([]);
      setCheckpoints([]);
      setFilterDistanceId("");
      setFilterCheckpointId("");
    }
  }, [filterRaceId]);

  useEffect(() => {
    if (filterDistanceId) {
      fetchCheckpointsByDistance(filterDistanceId);
    } else if (filterRaceId) {
      fetchCheckpoints(filterRaceId);
    }
  }, [filterDistanceId]);

  useEffect(() => {
    fetchReadings();
  }, [filterRaceId, filterDistanceId, filterCheckpointId, searchTerm]);

  const fetchRaces = async () => {
    try {
      let query = supabase.from("races").select("id, name").order("date", { ascending: false });
      
      if (isOrganizer && user) {
        query = query.eq("organizer_id", user.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setRaces(data || []);
    } catch (error: any) {
      console.error("Error fetching races:", error);
    }
  };

  const fetchDistances = async (raceId: string) => {
    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", raceId)
        .order("distance_km", { ascending: true });
      
      if (error) throw error;
      setDistances(data || []);
    } catch (error: any) {
      console.error("Error fetching distances:", error);
    }
  };

  const fetchCheckpoints = async (raceId: string) => {
    try {
      const { data, error } = await supabase
        .from("race_checkpoints")
        .select("id, name, distance_km")
        .eq("race_id", raceId)
        .order("checkpoint_order", { ascending: true });
      
      if (error) throw error;
      setCheckpoints(data || []);
    } catch (error: any) {
      console.error("Error fetching checkpoints:", error);
    }
  };

  const fetchCheckpointsByDistance = async (distanceId: string) => {
    try {
      // Usar la tabla intermedia checkpoint_distance_assignments
      const { data, error } = await supabase
        .from("checkpoint_distance_assignments")
        .select(`
          checkpoint_id,
          checkpoint_order,
          checkpoint:race_checkpoints(id, name, distance_km)
        `)
        .eq("race_distance_id", distanceId)
        .order("checkpoint_order", { ascending: true });
      
      if (error) throw error;
      
      // Transformar datos al formato esperado
      const checkpointsData = (data || [])
        .filter(item => item.checkpoint)
        .map(item => ({
          id: item.checkpoint!.id,
          name: item.checkpoint!.name,
          distance_km: item.checkpoint!.distance_km,
        }));
      
      setCheckpoints(checkpointsData);
    } catch (error: any) {
      console.error("Error fetching checkpoints:", error);
    }
  };

  const fetchReadings = async () => {
    if (!filterRaceId) {
      setReadings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from("timing_readings")
        .select(`
          *,
          checkpoint:race_checkpoints(name, distance_km),
          race_distance:race_distances(name),
          registration:registrations(guest_first_name, guest_last_name, user_id)
        `)
        .eq("race_id", filterRaceId)
        .order("timing_timestamp", { ascending: false });

      if (filterDistanceId) {
        query = query.eq("race_distance_id", filterDistanceId);
      }

      if (filterCheckpointId) {
        query = query.eq("checkpoint_id", filterCheckpointId);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data || [];

      // Apply search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filteredData = filteredData.filter((r) => {
          const bibMatch = r.bib_number.toString().includes(search);
          const nameMatch = r.registration
            ? `${r.registration.guest_first_name || ""} ${r.registration.guest_last_name || ""}`.toLowerCase().includes(search)
            : false;
          return bibMatch || nameMatch;
        });
      }

      setReadings(filteredData);
    } catch (error: any) {
      console.error("Error fetching readings:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las lecturas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      bib_number: "",
      timing_timestamp: "",
      checkpoint_id: "",
      race_distance_id: filterDistanceId || "",
      lap_number: "1",
      notes: "",
      reading_type: "manual",
      status_code: "",
    });
  };

  const handleAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEdit = (reading: TimingReading) => {
    setEditingReading(reading);
    setFormData({
      bib_number: reading.bib_number.toString(),
      timing_timestamp: reading.timing_timestamp ? new Date(reading.timing_timestamp).toISOString().slice(0, 16) : "",
      checkpoint_id: reading.checkpoint_id || "",
      race_distance_id: reading.race_distance_id || "",
      lap_number: (reading.lap_number || 1).toString(),
      notes: reading.notes || "",
      reading_type: reading.reading_type || "manual",
      status_code: reading.status_code || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (reading: TimingReading) => {
    setDeletingReading(reading);
    setIsDeleteDialogOpen(true);
  };

  const handleSaveAdd = async () => {
    if (!formData.bib_number || !formData.timing_timestamp || !filterRaceId) {
      toast({
        title: "Error",
        description: "Dorsal y hora son obligatorios",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Find registration by bib_number
      const { data: registration } = await supabase
        .from("registrations")
        .select("id, race_distance_id")
        .eq("race_id", filterRaceId)
        .eq("bib_number", parseInt(formData.bib_number))
        .maybeSingle();

      const { error } = await supabase.from("timing_readings").insert({
        race_id: filterRaceId,
        bib_number: parseInt(formData.bib_number),
        timing_timestamp: new Date(formData.timing_timestamp).toISOString(),
        checkpoint_id: formData.checkpoint_id || null,
        race_distance_id: formData.race_distance_id || registration?.race_distance_id || null,
        registration_id: registration?.id || null,
        lap_number: parseInt(formData.lap_number) || 1,
        notes: formData.notes || null,
        reading_type: formData.reading_type,
        status_code: formData.status_code || null,
        operator_user_id: user?.id || null,
        is_processed: false,
      });

      if (error) throw error;

      toast({
        title: "Lectura añadida",
        description: "La lectura se ha registrado correctamente",
      });
      
      setIsAddDialogOpen(false);
      fetchReadings();
    } catch (error: any) {
      console.error("Error adding reading:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo añadir la lectura",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingReading || !formData.bib_number || !formData.timing_timestamp) {
      toast({
        title: "Error",
        description: "Dorsal y hora son obligatorios",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("timing_readings")
        .update({
          bib_number: parseInt(formData.bib_number),
          timing_timestamp: new Date(formData.timing_timestamp).toISOString(),
          checkpoint_id: formData.checkpoint_id || null,
          race_distance_id: formData.race_distance_id || null,
          lap_number: parseInt(formData.lap_number) || 1,
          notes: formData.notes || null,
          reading_type: formData.reading_type,
          status_code: formData.status_code || null,
        })
        .eq("id", editingReading.id);

      if (error) throw error;

      toast({
        title: "Lectura actualizada",
        description: "La lectura se ha actualizado correctamente",
      });
      
      setIsEditDialogOpen(false);
      setEditingReading(null);
      fetchReadings();
    } catch (error: any) {
      console.error("Error updating reading:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la lectura",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingReading) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("timing_readings")
        .delete()
        .eq("id", deletingReading.id);

      if (error) throw error;

      toast({
        title: "Lectura eliminada",
        description: "La lectura se ha eliminado correctamente",
      });
      
      setIsDeleteDialogOpen(false);
      setDeletingReading(null);
      fetchReadings();
    } catch (error: any) {
      console.error("Error deleting reading:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la lectura",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (readings.length === 0) {
      toast({
        title: "Sin datos",
        description: "No hay lecturas para exportar",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Dorsal", "Participante", "Evento", "Checkpoint", "Hora", "Tipo", "Estado", "Vuelta", "Procesado", "Notas"];
    const rows = readings.map((r) => [
      r.bib_number,
      r.registration ? `${r.registration.guest_first_name || ""} ${r.registration.guest_last_name || ""}`.trim() : "-",
      r.race_distance?.name || "-",
      r.checkpoint?.name || "-",
      new Date(r.timing_timestamp).toLocaleString("es-ES"),
      r.reading_type || "-",
      r.status_code || "-",
      r.lap_number || 1,
      r.is_processed ? "Sí" : "No",
      r.notes || "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `lecturas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getReadingTypeBadge = (type: string | null) => {
    switch (type) {
      case "automatic":
        return <Badge variant="secondary">Automático</Badge>;
      case "manual":
        return <Badge variant="outline">Manual</Badge>;
      case "status_change":
        return <Badge variant="destructive">Estado</Badge>;
      default:
        return <Badge variant="outline">{type || "-"}</Badge>;
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "dnf":
        return <Badge variant="destructive">DNF</Badge>;
      case "dns":
        return <Badge variant="secondary">DNS</Badge>;
      case "dsq":
        return <Badge variant="destructive">DSQ</Badge>;
      case "withdrawn":
        return <Badge variant="outline">Retirado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Lecturas</h2>
          <p className="text-muted-foreground">{readings.length} lecturas</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline" disabled={readings.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button onClick={handleAdd} disabled={!filterRaceId}>
            <Plus className="h-4 w-4 mr-2" />
            Añadir Lectura
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {!selectedRaceId && (
              <div className="space-y-2">
                <Label>Carrera</Label>
                <Select value={filterRaceId} onValueChange={setFilterRaceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona carrera" />
                  </SelectTrigger>
                  <SelectContent>
                    {races.map((race) => (
                      <SelectItem key={race.id} value={race.id}>
                        {race.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Evento</Label>
              <Select value={filterDistanceId} onValueChange={setFilterDistanceId} disabled={!filterRaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los eventos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los eventos</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Punto de Control</Label>
              <Select value={filterCheckpointId} onValueChange={setFilterCheckpointId} disabled={!filterRaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los checkpoints" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los checkpoints</SelectItem>
                  {checkpoints.map((cp) => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.name} ({cp.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Dorsal o nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !filterRaceId ? (
            <div className="text-center py-12 text-muted-foreground">
              Selecciona una carrera para ver las lecturas
            </div>
          ) : readings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron lecturas
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dorsal</TableHead>
                  <TableHead>Participante</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Checkpoint</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Procesado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readings.map((reading) => (
                  <TableRow key={reading.id}>
                    <TableCell className="font-medium">{reading.bib_number}</TableCell>
                    <TableCell>
                      {reading.registration
                        ? `${reading.registration.guest_first_name || ""} ${reading.registration.guest_last_name || ""}`.trim() || "-"
                        : "-"}
                    </TableCell>
                    <TableCell>{reading.race_distance?.name || "-"}</TableCell>
                    <TableCell>{reading.checkpoint?.name || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(reading.timing_timestamp)}</TableCell>
                    <TableCell>{getReadingTypeBadge(reading.reading_type)}</TableCell>
                    <TableCell>{getStatusBadge(reading.status_code)}</TableCell>
                    <TableCell>
                      {reading.is_processed ? (
                        <Badge variant="secondary">Sí</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(reading)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(reading)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir Lectura</DialogTitle>
            <DialogDescription>Registra una nueva lectura de cronometraje manual</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dorsal *</Label>
                <Input
                  type="number"
                  value={formData.bib_number}
                  onChange={(e) => setFormData({ ...formData, bib_number: e.target.value })}
                  placeholder="123"
                />
              </div>
              <div className="space-y-2">
                <Label>Vuelta</Label>
                <Input
                  type="number"
                  value={formData.lap_number}
                  onChange={(e) => setFormData({ ...formData, lap_number: e.target.value })}
                  min="1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha y Hora *</Label>
              <Input
                type="datetime-local"
                value={formData.timing_timestamp}
                onChange={(e) => setFormData({ ...formData, timing_timestamp: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Evento</Label>
              <Select value={formData.race_distance_id} onValueChange={(v) => setFormData({ ...formData, race_distance_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin evento</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Punto de Control</Label>
              <Select value={formData.checkpoint_id} onValueChange={(v) => setFormData({ ...formData, checkpoint_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona checkpoint" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin checkpoint</SelectItem>
                  {checkpoints.map((cp) => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Lectura</Label>
              <Select value={formData.reading_type} onValueChange={(v) => setFormData({ ...formData, reading_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic">Automático</SelectItem>
                  <SelectItem value="status_change">Cambio de estado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado (opcional)</Label>
              <Select value={formData.status_code} onValueChange={(v) => setFormData({ ...formData, status_code: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin estado especial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin estado</SelectItem>
                  <SelectItem value="dnf">DNF - No terminó</SelectItem>
                  <SelectItem value="dns">DNS - No salió</SelectItem>
                  <SelectItem value="dsq">DSQ - Descalificado</SelectItem>
                  <SelectItem value="withdrawn">Retirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observaciones..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAdd} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Lectura</DialogTitle>
            <DialogDescription>Modifica los datos de la lectura</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dorsal *</Label>
                <Input
                  type="number"
                  value={formData.bib_number}
                  onChange={(e) => setFormData({ ...formData, bib_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vuelta</Label>
                <Input
                  type="number"
                  value={formData.lap_number}
                  onChange={(e) => setFormData({ ...formData, lap_number: e.target.value })}
                  min="1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha y Hora *</Label>
              <Input
                type="datetime-local"
                value={formData.timing_timestamp}
                onChange={(e) => setFormData({ ...formData, timing_timestamp: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Evento</Label>
              <Select value={formData.race_distance_id} onValueChange={(v) => setFormData({ ...formData, race_distance_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin evento</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Punto de Control</Label>
              <Select value={formData.checkpoint_id} onValueChange={(v) => setFormData({ ...formData, checkpoint_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona checkpoint" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin checkpoint</SelectItem>
                  {checkpoints.map((cp) => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Lectura</Label>
              <Select value={formData.reading_type} onValueChange={(v) => setFormData({ ...formData, reading_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic">Automático</SelectItem>
                  <SelectItem value="status_change">Cambio de estado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado (opcional)</Label>
              <Select value={formData.status_code} onValueChange={(v) => setFormData({ ...formData, status_code: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin estado especial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin estado</SelectItem>
                  <SelectItem value="dnf">DNF - No terminó</SelectItem>
                  <SelectItem value="dns">DNS - No salió</SelectItem>
                  <SelectItem value="dsq">DSQ - Descalificado</SelectItem>
                  <SelectItem value="withdrawn">Retirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observaciones..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar lectura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la lectura del dorsal #{deletingReading?.bib_number}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
