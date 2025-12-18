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
import { Loader2, Plus, Pencil, Trash2, Filter, Search, Download, CheckSquare, ArrowRightLeft, RefreshCw, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RFIDImportDialog } from "./RFIDImportDialog";

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
  timing_point_id: string | null;
  race_id: string;
  race_distance_id: string | null;
  registration_id: string | null;
  operator_user_id: string | null;
  chip_code: string | null;
  reader_device_id: string | null;
  timing_point?: {
    name: string;
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

interface TimingPoint {
  id: string;
  name: string;
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
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteMultipleDialogOpen, setIsDeleteMultipleDialogOpen] = useState(false);
  const [isChangeTimingPointDialogOpen, setIsChangeTimingPointDialogOpen] = useState(false);
  const [newTimingPointId, setNewTimingPointId] = useState<string>("");
  
  // Reimport GPS state
  const [isReimportDialogOpen, setIsReimportDialogOpen] = useState(false);
  const [reimportDate, setReimportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reimportStartTime, setReimportStartTime] = useState("00:00");
  const [reimportEndTime, setReimportEndTime] = useState("23:59");
  const [reimporting, setReimporting] = useState(false);
  const [waveInfo, setWaveInfo] = useState<{ date: string; time: string } | null>(null);
  
  // RFID Import state
  const [isRFIDImportDialogOpen, setIsRFIDImportDialogOpen] = useState(false);
  
  // Filters
  const [filterRaceId, setFilterRaceId] = useState<string>(selectedRaceId || "");
  const [filterDistanceId, setFilterDistanceId] = useState<string>("");
  const [filterTimingPointId, setFilterTimingPointId] = useState<string>("");
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
    timing_point_id: "",
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
      fetchTimingPoints(filterRaceId);
    } else {
      setDistances([]);
      setTimingPoints([]);
      setFilterDistanceId("");
      setFilterTimingPointId("");
    }
  }, [filterRaceId]);

  useEffect(() => {
    fetchReadings();
  }, [filterRaceId, filterDistanceId, filterTimingPointId, searchTerm]);

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

  const fetchTimingPoints = async (raceId: string) => {
    try {
      const { data, error } = await supabase
        .from("timing_points")
        .select("id, name, point_order")
        .eq("race_id", raceId)
        .order("point_order", { ascending: true });
      
      if (error) throw error;
      setTimingPoints(data || []);
    } catch (error: any) {
      console.error("Error fetching timing points:", error);
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
          timing_point:timing_points(name),
          race_distance:race_distances(name),
          registration:registrations(guest_first_name, guest_last_name, user_id)
        `)
        .eq("race_id", filterRaceId)
        .order("timing_timestamp", { ascending: false });

      if (filterDistanceId) {
        query = query.eq("race_distance_id", filterDistanceId);
      }

      if (filterTimingPointId) {
        query = query.eq("timing_point_id", filterTimingPointId);
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
      timing_point_id: "",
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
      timing_point_id: reading.timing_point_id || "",
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
        timing_point_id: formData.timing_point_id || null,
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
          timing_point_id: formData.timing_point_id || null,
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(readings.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleDeleteMultiple = () => {
    if (selectedIds.size === 0) {
      toast({
        title: "Sin selección",
        description: "Selecciona al menos una lectura para eliminar",
        variant: "destructive",
      });
      return;
    }
    setIsDeleteMultipleDialogOpen(true);
  };

  const handleConfirmDeleteMultiple = async () => {
    if (selectedIds.size === 0) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("timing_readings")
        .delete()
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast({
        title: "Lecturas eliminadas",
        description: `Se han eliminado ${selectedIds.size} lecturas correctamente`,
      });
      
      setIsDeleteMultipleDialogOpen(false);
      setSelectedIds(new Set());
      fetchReadings();
    } catch (error: any) {
      console.error("Error deleting readings:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudieron eliminar las lecturas",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeTimingPoint = () => {
    if (selectedIds.size === 0) {
      toast({
        title: "Sin selección",
        description: "Selecciona al menos una lectura para cambiar el punto de cronometraje",
        variant: "destructive",
      });
      return;
    }
    setNewTimingPointId("");
    setIsChangeTimingPointDialogOpen(true);
  };

  const handleConfirmChangeTimingPoint = async () => {
    if (selectedIds.size === 0) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("timing_readings")
        .update({ 
          timing_point_id: newTimingPointId || null,
          updated_at: new Date().toISOString()
        })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      const pointName = timingPoints.find(tp => tp.id === newTimingPointId)?.name || "ninguno";
      toast({
        title: "Punto de crono actualizado",
        description: `Se han actualizado ${selectedIds.size} lecturas al punto "${pointName}"`,
      });
      
      setIsChangeTimingPointDialogOpen(false);
      setSelectedIds(new Set());
      setNewTimingPointId("");
      fetchReadings();
    } catch (error: any) {
      console.error("Error updating timing point:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el punto de cronometraje",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReimportDialog = async () => {
    if (!filterRaceId) return;
    
    // Get the wave start time for the selected distance (or first distance if "all")
    const distanceId = filterDistanceId && filterDistanceId !== "all" ? filterDistanceId : distances[0]?.id;
    
    if (distanceId) {
      try {
        const { data: wave, error } = await supabase
          .from("race_waves")
          .select("start_time")
          .eq("race_distance_id", distanceId)
          .maybeSingle();
        
        if (!error && wave?.start_time) {
          const datePart = wave.start_time.slice(0, 10);
          const timePart = wave.start_time.slice(11, 19);
          
          setReimportDate(datePart);
          setReimportStartTime(timePart);
          setReimportEndTime("23:59:59");
          setWaveInfo({ date: datePart, time: timePart });
        } else {
          const today = new Date().toISOString().split('T')[0];
          setReimportDate(today);
          setReimportStartTime("00:00:00");
          setReimportEndTime("23:59:59");
          setWaveInfo(null);
        }
      } catch (err) {
        console.error("Error fetching wave:", err);
        const today = new Date().toISOString().split('T')[0];
        setReimportDate(today);
        setReimportStartTime("00:00:00");
        setReimportEndTime("23:59:59");
        setWaveInfo(null);
      }
    } else {
      const today = new Date().toISOString().split('T')[0];
      setReimportDate(today);
      setReimportStartTime("00:00:00");
      setReimportEndTime("23:59:59");
      setWaveInfo(null);
    }
    
    setIsReimportDialogOpen(true);
  };

  const handleReimportGPS = async () => {
    if (!filterRaceId) {
      toast({
        title: "Selecciona una carrera",
        description: "Debes seleccionar una carrera para reimportar las lecturas GPS",
        variant: "destructive",
      });
      return;
    }

    setReimporting(true);
    try {
      // Validar que tenemos todos los valores necesarios
      if (!reimportDate || !reimportStartTime || !reimportEndTime) {
        throw new Error("Debes completar la fecha y las horas de inicio y fin");
      }

      // Normalizar formato de tiempo: si ya tiene segundos no añadir más
      const normalizeTime = (time: string) => {
        const parts = time.split(':');
        if (parts.length === 2) {
          return `${time}:00`; // HH:MM → HH:MM:SS
        }
        return time; // Ya tiene HH:MM:SS
      };

      // Construir timestamps en formato local (sin conversión a UTC)
      // Los GPS se almacenan en hora local, así que comparamos directamente
      const startTimestamp = `${reimportDate}T${normalizeTime(reimportStartTime)}`;
      const endTimestamp = `${reimportDate}T${normalizeTime(reimportEndTime)}`;
      
      console.log(`Reimporting GPS readings:`);
      console.log(`  Time range: ${startTimestamp} to ${endTimestamp}`);
      
      // PASO 1: Obtener los IDs de GPS en el rango (como hace el trigger)
      const { data: gpsData, error: gpsError } = await supabase
        .from('gps_tracking')
        .select('id')
        .eq('race_id', filterRaceId)
        .gte('timestamp', startTimestamp)
        .lte('timestamp', endTimestamp)
        .order('timestamp', { ascending: true });
      
      if (gpsError) throw gpsError;
      
      if (!gpsData || gpsData.length === 0) {
        toast({
          title: "Sin lecturas GPS",
          description: "No se encontraron lecturas GPS en el rango especificado",
          variant: "destructive",
        });
        setReimporting(false);
        return;
      }
      
      const gpsIds = gpsData.map(g => g.id);
      console.log(`Found ${gpsIds.length} GPS readings to reimport`);
      
      // PASO 2: Enviar los IDs a la edge function (mismo flujo que el trigger)
      const { data, error } = await supabase.functions.invoke("process-gps-geofence", {
        body: { 
          race_id: filterRaceId,
          gps_ids: gpsIds,
          force_reprocess: true
        },
      });

      if (error) throw error;

      toast({
        title: "Reimportación completada",
        description: `Procesadas ${data?.processed || 0} lecturas GPS, creadas ${data?.created || 0} nuevas lecturas`,
      });

      setIsReimportDialogOpen(false);
      fetchReadings();
    } catch (error: any) {
      console.error("Error reimporting GPS:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo reimportar las lecturas GPS",
        variant: "destructive",
      });
    } finally {
      setReimporting(false);
    }
  };

  const handleTimeChange = (value: string, setter: (v: string) => void) => {
    let cleaned = value.replace(/[^\d:]/g, '');
    const digits = cleaned.replace(/:/g, '');
    if (digits.length <= 2) {
      cleaned = digits;
    } else if (digits.length <= 4) {
      cleaned = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    } else {
      cleaned = `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
    }
    setter(cleaned);
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

    const headers = ["Dorsal", "Participante", "Evento", "Punto de Crono", "Hora", "Tipo", "Estado", "Vuelta", "Procesado", "Notas"];
    const rows = readings.map((r) => [
      r.bib_number,
      r.registration ? `${r.registration.guest_first_name || ""} ${r.registration.guest_last_name || ""}`.trim() : "-",
      r.race_distance?.name || "-",
      r.timing_point?.name || "-",
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
          <p className="text-muted-foreground">
            {readings.length} lecturas
            {selectedIds.size > 0 && ` (${selectedIds.size} seleccionadas)`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <>
              <Button onClick={handleChangeTimingPoint} variant="outline">
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Cambiar Punto ({selectedIds.size})
              </Button>
              <Button onClick={handleDeleteMultiple} variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar ({selectedIds.size})
              </Button>
            </>
          )}
          <Button onClick={handleOpenReimportDialog} variant="outline" disabled={!filterRaceId}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reimportar GPS
          </Button>
          <Button onClick={() => setIsRFIDImportDialogOpen(true)} variant="outline" disabled={!filterRaceId}>
            <Upload className="h-4 w-4 mr-2" />
            Importar RFID
          </Button>
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
              <Select 
                value={filterDistanceId || "all"} 
                onValueChange={(val) => setFilterDistanceId(val === "all" ? "" : val)} 
                disabled={!filterRaceId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los eventos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los eventos</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Punto de Cronometraje</Label>
              <Select 
                value={filterTimingPointId || "all"} 
                onValueChange={(val) => setFilterTimingPointId(val === "all" ? "" : val)} 
                disabled={!filterRaceId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los puntos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los puntos</SelectItem>
                  {timingPoints.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.name}
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
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={readings.length > 0 && selectedIds.size === readings.length}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead>Dorsal</TableHead>
                  <TableHead>Participante</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Punto Crono</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Procesado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readings.map((reading) => (
                  <TableRow key={reading.id} className={selectedIds.has(reading.id) ? "bg-muted/50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(reading.id)}
                        onCheckedChange={(checked) => handleSelectOne(reading.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{reading.bib_number}</TableCell>
                    <TableCell>
                      {reading.registration
                        ? `${reading.registration.guest_first_name || ""} ${reading.registration.guest_last_name || ""}`.trim() || "-"
                        : "-"}
                    </TableCell>
                    <TableCell>{reading.race_distance?.name || "-"}</TableCell>
                    <TableCell>{reading.timing_point?.name || "-"}</TableCell>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
              <Select 
                value={formData.race_distance_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, race_distance_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin evento</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Punto de Cronometraje</Label>
              <Select 
                value={formData.timing_point_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, timing_point_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona punto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin punto</SelectItem>
                  {timingPoints.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.name}
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
              <Select 
                value={formData.status_code || "none"} 
                onValueChange={(v) => setFormData({ ...formData, status_code: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin estado especial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin estado</SelectItem>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
              <Select 
                value={formData.race_distance_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, race_distance_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin evento</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Punto de Cronometraje</Label>
              <Select 
                value={formData.timing_point_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, timing_point_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona punto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin punto</SelectItem>
                  {timingPoints.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.name}
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
              <Select 
                value={formData.status_code || "none"} 
                onValueChange={(v) => setFormData({ ...formData, status_code: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin estado especial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin estado</SelectItem>
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

      {/* Delete Multiple Dialog */}
      <AlertDialog open={isDeleteMultipleDialogOpen} onOpenChange={setIsDeleteMultipleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} lecturas?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará {selectedIds.size} lecturas seleccionadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteMultiple} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar {selectedIds.size} lecturas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Timing Point Dialog */}
      <Dialog open={isChangeTimingPointDialogOpen} onOpenChange={setIsChangeTimingPointDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Punto de Cronometraje</DialogTitle>
            <DialogDescription>
              Selecciona el nuevo punto de cronometraje para las {selectedIds.size} lecturas seleccionadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nuevo Punto de Cronometraje</Label>
              <Select value={newTimingPointId || "none"} onValueChange={(v) => setNewTimingPointId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona punto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin punto asignado</SelectItem>
                  {timingPoints.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Esto asignará el punto de cronometraje seleccionado a todas las lecturas marcadas. 
              Útil para corregir lecturas GPS que fueron asignadas incorrectamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsChangeTimingPointDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmChangeTimingPoint} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cambiar Punto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reimport GPS Dialog */}
      <Dialog open={isReimportDialogOpen} onOpenChange={setIsReimportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reimportar Lecturas GPS</DialogTitle>
            <DialogDescription>
              Reprocesa las lecturas GPS de la carrera para un rango de tiempo específico.
              Esto eliminará las lecturas GPS existentes y las volverá a generar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {waveInfo && (
              <div className="p-3 bg-muted rounded-md text-sm">
                <p><strong>Hora de salida configurada:</strong> {waveInfo.date} a las {waveInfo.time}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={reimportDate}
                onChange={(e) => setReimportDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora Inicio</Label>
                <Input
                  type="text"
                  placeholder="HH:MM:SS"
                  value={reimportStartTime}
                  onChange={(e) => handleTimeChange(e.target.value, setReimportStartTime)}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora Fin</Label>
                <Input
                  type="text"
                  placeholder="HH:MM:SS"
                  value={reimportEndTime}
                  onChange={(e) => handleTimeChange(e.target.value, setReimportEndTime)}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Se procesarán todas las lecturas GPS dentro del rango de tiempo especificado 
              y se crearán lecturas de cronometraje cuando un corredor pase por un checkpoint con geofence.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReimportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleReimportGPS} disabled={reimporting || !reimportDate}>
              {reimporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reimportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RFID Import Dialog */}
      <RFIDImportDialog
        open={isRFIDImportDialogOpen}
        onOpenChange={setIsRFIDImportDialogOpen}
        raceId={filterRaceId}
        timingPoints={timingPoints}
        distances={distances}
        onImportComplete={fetchReadings}
      />
    </div>
  );
}
