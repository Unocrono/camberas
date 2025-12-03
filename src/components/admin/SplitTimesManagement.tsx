import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Clock, Search, Edit, ChevronLeft, ChevronRight } from "lucide-react";

interface SplitTimeWithDetails {
  id: string;
  checkpoint_name: string;
  checkpoint_order: number;
  split_time: string;
  distance_km: number;
  lap_number: number | null;
  bib_number: number | null;
  participant_name: string;
  event_name: string;
  race_result_id: string;
  registration_id: string;
  race_distance_id: string;
}

interface Checkpoint {
  id: string;
  name: string;
  checkpoint_order: number;
  distance_km: number;
}

interface Distance {
  id: string;
  name: string;
  distance_km: number;
}

interface Registration {
  id: string;
  bib_number: number | null;
  race_distance_id: string;
  participant_name: string;
  race_result_id?: string;
}

interface SplitTimesManagementProps {
  isOrganizer?: boolean;
  selectedRaceId?: string;
  selectedDistanceId?: string;
}

export function SplitTimesManagement({ 
  isOrganizer = false, 
  selectedRaceId: propSelectedRaceId,
  selectedDistanceId: propSelectedDistanceId 
}: SplitTimesManagementProps) {
  // Filters
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>("");
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  // Data
  const [distances, setDistances] = useState<Distance[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [splitTimes, setSplitTimes] = useState<SplitTimeWithDetails[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  
  // Dialogs
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingSplit, setEditingSplit] = useState<SplitTimeWithDetails | null>(null);
  const [deletingSplitId, setDeletingSplitId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    registrationId: "",
    checkpointId: "",
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Sync prop changes
  useEffect(() => {
    if (propSelectedDistanceId) {
      setSelectedDistanceId(propSelectedDistanceId);
    }
  }, [propSelectedDistanceId]);

  // Fetch distances when race changes
  useEffect(() => {
    if (propSelectedRaceId) {
      fetchDistances();
      fetchRegistrations();
    } else {
      setDistances([]);
      setCheckpoints([]);
      setSplitTimes([]);
      setRegistrations([]);
    }
  }, [propSelectedRaceId]);

  // Fetch checkpoints when distance changes
  useEffect(() => {
    if (propSelectedRaceId) {
      fetchCheckpoints();
      setSelectedCheckpointId(""); // Reset checkpoint selection when distance changes
    }
  }, [propSelectedRaceId, selectedDistanceId]);

  // Fetch split times when filters change
  useEffect(() => {
    if (propSelectedRaceId) {
      fetchSplitTimes();
    }
  }, [propSelectedRaceId, selectedDistanceId, selectedCheckpointId]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDistanceId, selectedCheckpointId, searchTerm]);

  const fetchDistances = async () => {
    if (!propSelectedRaceId) return;
    
    const { data, error } = await supabase
      .from("race_distances")
      .select("id, name, distance_km")
      .eq("race_id", propSelectedRaceId)
      .order("distance_km");

    if (error) {
      toast.error("Error al cargar eventos");
      return;
    }
    setDistances(data || []);
  };

  const fetchCheckpoints = async () => {
    if (!propSelectedRaceId) return;
    
    if (selectedDistanceId) {
      const { data, error } = await supabase
        .from("race_checkpoints")
        .select("id, name, checkpoint_order, distance_km")
        .eq("race_distance_id", selectedDistanceId)
        .order("checkpoint_order");

      if (!error) setCheckpoints(data || []);
    } else {
      // Sin evento seleccionado: cargar todos los checkpoints de la carrera
      const { data, error } = await supabase
        .from("race_checkpoints")
        .select("id, name, checkpoint_order, distance_km")
        .eq("race_id", propSelectedRaceId)
        .order("checkpoint_order");

      if (error) {
        toast.error("Error al cargar checkpoints");
        return;
      }
      setCheckpoints(data || []);
    }
  };

  const fetchRegistrations = async () => {
    if (!propSelectedRaceId) return;
    
    const { data, error } = await supabase
      .from("registrations")
      .select(`
        id,
        bib_number,
        race_distance_id,
        user_id,
        guest_first_name,
        guest_last_name
      `)
      .eq("race_id", propSelectedRaceId)
      .eq("status", "confirmed");

    if (error) {
      toast.error("Error al cargar inscripciones");
      return;
    }

    // Fetch profiles for registered users
    const userIds = data?.filter(r => r.user_id).map(r => r.user_id) || [];
    let profilesMap = new Map();
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      
      profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
    }

    // Fetch race_results to get race_result_id for each registration
    const { data: results } = await supabase
      .from("race_results")
      .select("id, registration_id")
      .in("registration_id", data?.map(r => r.id) || []);
    
    const resultsMap = new Map(results?.map(r => [r.registration_id, r.id]) || []);

    const enrichedData: Registration[] = (data || []).map(r => {
      const profile = profilesMap.get(r.user_id);
      const name = profile 
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : `${r.guest_first_name || ''} ${r.guest_last_name || ''}`.trim();
      
      return {
        id: r.id,
        bib_number: r.bib_number,
        race_distance_id: r.race_distance_id,
        participant_name: name || 'Sin nombre',
        race_result_id: resultsMap.get(r.id),
      };
    });

    setRegistrations(enrichedData);
  };

  const fetchSplitTimes = async () => {
    if (!propSelectedRaceId) return;
    
    setLoading(true);
    
    // First get registrations for this race with their details
    let regQuery = supabase
      .from("registrations")
      .select(`
        id,
        bib_number,
        race_distance_id,
        user_id,
        guest_first_name,
        guest_last_name,
        race_distances!inner (
          id,
          name
        )
      `)
      .eq("race_id", propSelectedRaceId);

    if (selectedDistanceId) {
      regQuery = regQuery.eq("race_distance_id", selectedDistanceId);
    }

    const { data: regsData, error: regsError } = await regQuery;
    
    if (regsError) {
      toast.error("Error al cargar datos");
      setLoading(false);
      return;
    }

    if (!regsData || regsData.length === 0) {
      setSplitTimes([]);
      setLoading(false);
      return;
    }

    // Get race results for these registrations
    const regIds = regsData.map(r => r.id);
    const { data: resultsData } = await supabase
      .from("race_results")
      .select("id, registration_id")
      .in("registration_id", regIds);

    if (!resultsData || resultsData.length === 0) {
      setSplitTimes([]);
      setLoading(false);
      return;
    }

    // Get split times for these results
    const resultIds = resultsData.map(r => r.id);
    let splitQuery = supabase
      .from("split_times")
      .select("*")
      .in("race_result_id", resultIds)
      .order("checkpoint_order");

    if (selectedCheckpointId) {
      const checkpoint = checkpoints.find(c => c.id === selectedCheckpointId);
      if (checkpoint) {
        splitQuery = splitQuery.eq("checkpoint_name", checkpoint.name);
      }
    }

    const { data: splitsData, error: splitsError } = await splitQuery;

    if (splitsError) {
      toast.error("Error al cargar tiempos parciales");
      setLoading(false);
      return;
    }

    // Get profiles for users
    const userIds = regsData.filter(r => r.user_id).map(r => r.user_id);
    let profilesMap = new Map();
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      
      profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
    }

    // Create lookup maps
    const resultToRegMap = new Map(resultsData.map(r => [r.id, r.registration_id]));
    const regMap = new Map(regsData.map(r => [r.id, r]));

    // Combine data
    const enrichedSplits: SplitTimeWithDetails[] = (splitsData || []).map(split => {
      const regId = resultToRegMap.get(split.race_result_id);
      const reg = regMap.get(regId);
      const profile = reg?.user_id ? profilesMap.get(reg.user_id) : null;
      
      const name = profile 
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : `${reg?.guest_first_name || ''} ${reg?.guest_last_name || ''}`.trim();

      return {
        id: split.id,
        checkpoint_name: split.checkpoint_name,
        checkpoint_order: split.checkpoint_order,
        split_time: formatTime(String(split.split_time || '')),
        distance_km: split.distance_km,
        lap_number: split.lap_number,
        bib_number: reg?.bib_number || null,
        participant_name: name || 'Sin nombre',
        event_name: (reg?.race_distances as any)?.name || '',
        race_result_id: split.race_result_id,
        registration_id: regId || '',
        race_distance_id: reg?.race_distance_id || '',
      };
    });

    setSplitTimes(enrichedSplits);
    setLoading(false);
  };

  const formatTime = (timeString: string): string => {
    if (!timeString) return "00:00:00";
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}:${match[2]}:${match[3]}`;
    }
    return timeString;
  };

  const parseTimeToComponents = (timeString: string) => {
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return {
        hours: parseInt(match[1]),
        minutes: parseInt(match[2]),
        seconds: parseInt(match[3]),
      };
    }
    return { hours: 0, minutes: 0, seconds: 0 };
  };

  // Filter and paginate
  const filteredSplits = useMemo(() => {
    return splitTimes.filter(split => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        split.bib_number?.toString().includes(search) ||
        split.participant_name.toLowerCase().includes(search)
      );
    });
  }, [splitTimes, searchTerm]);

  const paginatedSplits = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSplits.slice(start, start + pageSize);
  }, [filteredSplits, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredSplits.length / pageSize);

  // CRUD Operations
  const handleAddSplit = async () => {
    if (!formData.registrationId || !formData.checkpointId) {
      toast.error("Selecciona participante y checkpoint");
      return;
    }

    const registration = registrations.find(r => r.id === formData.registrationId);
    const checkpoint = checkpoints.find(c => c.id === formData.checkpointId);
    
    if (!registration || !checkpoint) {
      toast.error("Datos inválidos");
      return;
    }

    const interval = `${formData.hours.toString().padStart(2, "0")}:${formData.minutes.toString().padStart(2, "0")}:${formData.seconds.toString().padStart(2, "0")}`;
    const now = new Date().toISOString();

    // Get or create race_result
    let raceResultId = registration.race_result_id;
    
    if (!raceResultId) {
      // Create race_result first
      const { data: newResult, error: resultError } = await supabase
        .from("race_results")
        .insert({
          registration_id: registration.id,
          race_distance_id: registration.race_distance_id,
          finish_time: "00:00:00",
          status: "in_progress",
        })
        .select("id")
        .single();

      if (resultError) {
        toast.error("Error al crear resultado");
        return;
      }
      raceResultId = newResult.id;
    }

    // Create timing_reading first
    const { data: reading, error: readingError } = await supabase
      .from("timing_readings")
      .insert({
        race_id: propSelectedRaceId,
        race_distance_id: registration.race_distance_id,
        registration_id: registration.id,
        checkpoint_id: checkpoint.id,
        bib_number: registration.bib_number || 0,
        timing_timestamp: now,
        reading_timestamp: now,
        reading_type: "manual",
        is_processed: true,
      })
      .select("id")
      .single();

    if (readingError) {
      toast.error("Error al crear lectura de cronometraje");
      return;
    }

    // Create split_time
    const { error: splitError } = await supabase
      .from("split_times")
      .insert({
        race_result_id: raceResultId,
        checkpoint_name: checkpoint.name,
        checkpoint_order: checkpoint.checkpoint_order,
        split_time: interval,
        distance_km: checkpoint.distance_km,
      });

    if (splitError) {
      toast.error("Error al crear tiempo parcial");
      return;
    }

    toast.success("Tiempo parcial añadido");
    setIsAddDialogOpen(false);
    resetForm();
    fetchSplitTimes();
    fetchRegistrations(); // Refresh to get updated race_result_ids
  };

  const handleEditSplit = async () => {
    if (!editingSplit) return;

    const interval = `${formData.hours.toString().padStart(2, "0")}:${formData.minutes.toString().padStart(2, "0")}:${formData.seconds.toString().padStart(2, "0")}`;

    const { error } = await supabase
      .from("split_times")
      .update({ split_time: interval })
      .eq("id", editingSplit.id);

    if (error) {
      toast.error("Error al actualizar tiempo parcial");
      return;
    }

    toast.success("Tiempo parcial actualizado");
    setIsEditDialogOpen(false);
    setEditingSplit(null);
    resetForm();
    fetchSplitTimes();
  };

  const handleDeleteSplit = async () => {
    if (!deletingSplitId) return;

    const { error } = await supabase
      .from("split_times")
      .delete()
      .eq("id", deletingSplitId);

    if (error) {
      toast.error("Error al eliminar tiempo parcial");
      return;
    }

    toast.success("Tiempo parcial eliminado");
    setIsDeleteDialogOpen(false);
    setDeletingSplitId(null);
    fetchSplitTimes();
  };

  const openEditDialog = (split: SplitTimeWithDetails) => {
    const time = parseTimeToComponents(split.split_time);
    setEditingSplit(split);
    setFormData({
      registrationId: split.registration_id,
      checkpointId: "",
      ...time,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeletingSplitId(id);
    setIsDeleteDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      registrationId: "",
      checkpointId: "",
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  };

  // Filtered registrations for the add dialog (by selected distance)
  const filteredRegistrations = useMemo(() => {
    if (!selectedDistanceId) return registrations;
    return registrations.filter(r => r.race_distance_id === selectedDistanceId);
  }, [registrations, selectedDistanceId]);

  if (!propSelectedRaceId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecciona una carrera para gestionar los tiempos parciales</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6" />
          Gestión de Tiempos Parciales
        </h2>
        <Button onClick={() => setIsAddDialogOpen(true)} disabled={checkpoints.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir Tiempo
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label>Evento</Label>
              <Select value={selectedDistanceId} onValueChange={setSelectedDistanceId}>
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
            <div className="flex-1 min-w-[200px]">
              <Label>Checkpoint</Label>
              <Select value={selectedCheckpointId} onValueChange={setSelectedCheckpointId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los checkpoints" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los checkpoints</SelectItem>
                  {checkpoints.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
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
        <CardHeader>
          <CardTitle>
            {filteredSplits.length} tiempo{filteredSplits.length !== 1 ? 's' : ''} parcial{filteredSplits.length !== 1 ? 'es' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : paginatedSplits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay tiempos parciales registrados
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dorsal</TableHead>
                    <TableHead>Participante</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Checkpoint</TableHead>
                    <TableHead>KM</TableHead>
                    <TableHead>Tiempo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSplits.map((split) => (
                    <TableRow key={split.id}>
                      <TableCell className="font-medium">#{split.bib_number || '-'}</TableCell>
                      <TableCell>{split.participant_name}</TableCell>
                      <TableCell>{split.event_name}</TableCell>
                      <TableCell>{split.checkpoint_name}</TableCell>
                      <TableCell>{split.distance_km}</TableCell>
                      <TableCell className="font-mono">{split.split_time}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(split)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(split.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir Tiempo Parcial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Participante</Label>
              <Select
                value={formData.registrationId}
                onValueChange={(value) => setFormData({ ...formData, registrationId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar participante" />
                </SelectTrigger>
                <SelectContent>
                  {filteredRegistrations.map((reg) => (
                    <SelectItem key={reg.id} value={reg.id}>
                      #{reg.bib_number || '?'} - {reg.participant_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Checkpoint</Label>
              <Select
                value={formData.checkpointId}
                onValueChange={(value) => setFormData({ ...formData, checkpointId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar checkpoint" />
                </SelectTrigger>
                <SelectContent>
                  {checkpoints.map((cp) => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.name} ({cp.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tiempo (HH:MM:SS)</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  min="0"
                  max="99"
                  placeholder="HH"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: parseInt(e.target.value) || 0 })}
                />
                <Input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="MM"
                  value={formData.minutes}
                  onChange={(e) => setFormData({ ...formData, minutes: parseInt(e.target.value) || 0 })}
                />
                <Input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="SS"
                  value={formData.seconds}
                  onChange={(e) => setFormData({ ...formData, seconds: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddSplit}>
              Añadir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modificar Tiempo Parcial</DialogTitle>
          </DialogHeader>
          {editingSplit && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">#{editingSplit.bib_number} - {editingSplit.participant_name}</p>
                <p className="text-sm text-muted-foreground">{editingSplit.checkpoint_name}</p>
              </div>
              <div>
                <Label>Tiempo (HH:MM:SS)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="99"
                    placeholder="HH"
                    value={formData.hours}
                    onChange={(e) => setFormData({ ...formData, hours: parseInt(e.target.value) || 0 })}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="MM"
                    value={formData.minutes}
                    onChange={(e) => setFormData({ ...formData, minutes: parseInt(e.target.value) || 0 })}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="SS"
                    value={formData.seconds}
                    onChange={(e) => setFormData({ ...formData, seconds: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditSplit}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tiempo parcial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El tiempo parcial será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSplit} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
