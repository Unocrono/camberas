import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Download, RefreshCw, Trash2, MapPin, Satellite } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GPSTracking {
  id: string;
  registration_id: string;
  race_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  timestamp: string;  // UTC (stored as timestamptz)
  battery_level: number | null;
  created_at: string;
  registration?: {
    bib_number: number | null;
    guest_first_name: string | null;
    guest_last_name: string | null;
    user_id: string | null;
    race_distance_id: string;
    race_distance?: {
      name: string;
      distance_km: number;
    };
    profiles?: {
      first_name: string | null;
      last_name: string | null;
    };
  };
  race?: {
    name: string;
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
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number | null; // Radio en metros desde race_checkpoints
}

interface GPSTrackingViewerProps {
  selectedRaceId?: string;
}

// Haversine formula for distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function GPSTrackingViewer({ selectedRaceId }: GPSTrackingViewerProps) {
  const { toast } = useToast();
  const [readings, setReadings] = useState<GPSTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [races, setRaces] = useState<Race[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Filters - ya viene filtrado por carrera desde props
  const [filterRaceId, setFilterRaceId] = useState<string>(selectedRaceId || "");
  const [filterDistanceId, setFilterDistanceId] = useState<string>("all");
  const [filterTimingPointId, setFilterTimingPointId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 100;

  useEffect(() => {
    fetchRaces();
  }, []);

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
      setFilterDistanceId("all");
      setFilterTimingPointId("all");
    }
  }, [filterRaceId]);

  useEffect(() => {
    fetchReadings();
    setSelectedIds(new Set());
  }, [filterRaceId, filterDistanceId, filterTimingPointId, searchTerm, page]);

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select("id, name")
        .order("date", { ascending: false });
      
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
      // Obtener timing points con sus coordenadas y geofence desde race_checkpoints
      const { data: tpData, error: tpError } = await supabase
        .from("timing_points")
        .select("id, name, latitude, longitude")
        .eq("race_id", raceId)
        .order("point_order");
      
      if (tpError) throw tpError;

      // Obtener las coordenadas y geofence_radius de race_checkpoints
      // Usamos las coordenadas del checkpoint si el timing_point no las tiene
      const { data: cpData, error: cpError } = await supabase
        .from("race_checkpoints")
        .select("timing_point_id, geofence_radius, latitude, longitude")
        .eq("race_id", raceId)
        .not("timing_point_id", "is", null);

      if (cpError) throw cpError;

      // Crear mapa de timing_point_id -> datos del checkpoint
      const checkpointMap = new Map<string, { geofence_radius: number | null; latitude: number | null; longitude: number | null }>();
      cpData?.forEach(cp => {
        if (cp.timing_point_id) {
          // Si ya existe, combinar (tomar el primer geofence encontrado o el mayor)
          const existing = checkpointMap.get(cp.timing_point_id);
          if (!existing || (cp.geofence_radius && (!existing.geofence_radius || cp.geofence_radius > existing.geofence_radius))) {
            checkpointMap.set(cp.timing_point_id, {
              geofence_radius: cp.geofence_radius,
              latitude: cp.latitude,
              longitude: cp.longitude
            });
          }
        }
      });

      // Combinar datos: preferir coordenadas del checkpoint sobre las del timing_point
      const timingPointsWithGeofence: TimingPoint[] = (tpData || []).map(tp => {
        const cpInfo = checkpointMap.get(tp.id);
        return {
          ...tp,
          // Usar coordenadas del checkpoint si están disponibles, sino las del timing_point
          latitude: cpInfo?.latitude ?? tp.latitude,
          longitude: cpInfo?.longitude ?? tp.longitude,
          geofence_radius: cpInfo?.geofence_radius || 50 // Default 50m
        };
      });

      console.log("Timing points con geofence:", timingPointsWithGeofence);
      setTimingPoints(timingPointsWithGeofence);
    } catch (error: any) {
      console.error("Error fetching timing points:", error);
    }
  };

  const fetchReadings = async () => {
    if (!filterRaceId) {
      setReadings([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Build base query for counting
      let countQuery = supabase
        .from("gps_tracking")
        .select("id", { count: "exact", head: true })
        .eq("race_id", filterRaceId);

      // Build data query
      let query = supabase
        .from("gps_tracking")
        .select(`
          *,
          registration:registrations(
            bib_number,
            guest_first_name,
            guest_last_name,
            user_id,
            race_distance_id,
            race_distance:race_distances(name, distance_km),
            profiles(first_name, last_name)
          ),
          race:races(name)
        `)
        .eq("race_id", filterRaceId)
        .order("timestamp", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      // Apply distance filter via registration
      if (filterDistanceId && filterDistanceId !== "all") {
        const { data: regIds } = await supabase
          .from("registrations")
          .select("id")
          .eq("race_distance_id", filterDistanceId);
        
        if (regIds && regIds.length > 0) {
          const ids = regIds.map(r => r.id);
          query = query.in("registration_id", ids);
          countQuery = countQuery.in("registration_id", ids);
        }
      }

      // Get count
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotalCount(count || 0);

      // Get data
      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data || [];

      // Apply search filter (client-side for bib number and name)
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filteredData = filteredData.filter((r) => {
          const bibMatch = r.registration?.bib_number?.toString().includes(search);
          const guestName = `${r.registration?.guest_first_name || ""} ${r.registration?.guest_last_name || ""}`.toLowerCase();
          const profileName = r.registration?.profiles 
            ? `${r.registration.profiles.first_name || ""} ${r.registration.profiles.last_name || ""}`.toLowerCase()
            : "";
          return bibMatch || guestName.includes(search) || profileName.includes(search);
        });
      }

      // Apply timing point geofence filter (client-side)
      if (filterTimingPointId && filterTimingPointId !== "all") {
        const selectedTP = timingPoints.find(tp => tp.id === filterTimingPointId);
        console.log("Timing point seleccionado:", selectedTP);
        
        if (selectedTP && selectedTP.latitude !== null && selectedTP.longitude !== null) {
          const geofenceRadiusKm = (selectedTP.geofence_radius || 50) / 1000; // Convert meters to km
          console.log(`Filtrando por geofence: ${selectedTP.name}, radio: ${geofenceRadiusKm * 1000}m, coords: ${selectedTP.latitude}, ${selectedTP.longitude}`);
          
          const beforeCount = filteredData.length;
          filteredData = filteredData.filter((r) => {
            const distance = calculateDistance(
              r.latitude,
              r.longitude,
              selectedTP.latitude!,
              selectedTP.longitude!
            );
            return distance <= geofenceRadiusKm;
          });
          console.log(`Filtrado geofence: ${beforeCount} -> ${filteredData.length} lecturas`);
        } else {
          console.warn("Timing point sin coordenadas, no se aplica filtro geofence:", selectedTP);
        }
      }

      setReadings(filteredData);
    } catch (error: any) {
      console.error("Error fetching GPS readings:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las lecturas GPS",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getParticipantName = (reading: GPSTracking): string => {
    if (reading.registration?.profiles?.first_name) {
      return `${reading.registration.profiles.first_name} ${reading.registration.profiles.last_name || ""}`.trim();
    }
    if (reading.registration?.guest_first_name) {
      return `${reading.registration.guest_first_name} ${reading.registration.guest_last_name || ""}`.trim();
    }
    return "-";
  };

  const getClosestTimingPoint = (reading: GPSTracking): { name: string; distance: number } | null => {
    // Only consider timing points with coordinates
    const pointsWithCoords = timingPoints.filter(tp => tp.latitude !== null && tp.longitude !== null);
    if (!pointsWithCoords.length) return null;

    let closest: { name: string; distance: number } | null = null;
    
    for (const tp of pointsWithCoords) {
      const dist = calculateDistance(
        reading.latitude,
        reading.longitude,
        tp.latitude!,
        tp.longitude!
      );
      
      if (!closest || dist < closest.distance) {
        closest = { name: tp.name, distance: dist };
      }
    }
    
    return closest;
  };

  const getDistanceToFinish = (reading: GPSTracking): number | null => {
    // Find "Meta" timing point
    const finishPoint = timingPoints.find(
      tp => tp.name.toLowerCase().includes("meta") &&
           tp.latitude !== null && tp.longitude !== null
    );
    
    if (!finishPoint || finishPoint.latitude === null || finishPoint.longitude === null) {
      return null;
    }
    
    return calculateDistance(
      reading.latitude,
      reading.longitude,
      finishPoint.latitude,
      finishPoint.longitude
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(readings.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("gps_tracking")
        .delete()
        .in("id", Array.from(selectedIds));
      
      if (error) throw error;
      
      toast({
        title: "Eliminadas",
        description: `Se eliminaron ${selectedIds.size} lecturas GPS`,
      });
      
      setSelectedIds(new Set());
      setShowDeleteDialog(false);
      fetchReadings();
    } catch (error: any) {
      console.error("Error deleting GPS readings:", error);
      toast({
        title: "Error",
        description: "No se pudieron eliminar las lecturas GPS",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCSV = () => {
    if (readings.length === 0) {
      toast({
        title: "Sin datos",
        description: "No hay lecturas GPS para exportar",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "ID", "Dorsal", "Participante", "Carrera", "Evento", 
      "Latitud", "Longitud", "Altitud", "Velocidad", "Precisión",
      "Timestamp (UTC)", "Timestamp (Local)", "Batería", "Pto Crono Cercano", "Dist Pto (km)", "Dist Meta (km)"
    ];
    
    const rows = readings.map((r) => {
      const closest = getClosestTimingPoint(r);
      const distToFinish = getDistanceToFinish(r);
      const localTime = new Date(r.timestamp).toLocaleString('es-ES');
      
      return [
        r.id,
        r.registration?.bib_number || "-",
        getParticipantName(r),
        r.race?.name || "-",
        r.registration?.race_distance?.name || "-",
        r.latitude,
        r.longitude,
        r.altitude ?? "-",
        r.speed ?? "-",
        r.accuracy ?? "-",
        r.timestamp,
        localTime,
        r.battery_level ?? "-",
        closest?.name || "-",
        closest?.distance?.toFixed(3) || "-",
        distToFinish?.toFixed(3) || "-",
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `gps_tracking_${filterRaceId}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    
    toast({
      title: "Exportado",
      description: `Exportadas ${readings.length} lecturas GPS`,
    });
  };

  // Format timestamp: convert UTC to local time for display
  const formatDateTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Satellite className="h-6 w-6" />
            Visor de Lecturas GPS
          </h2>
          <p className="text-sm text-muted-foreground">
            Visualiza y gestiona las lecturas GPS de la tabla gps_tracking
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchReadings()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={readings.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Lecturas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mostrando</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{readings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Seleccionados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedIds.size}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Página</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPages > 0 ? page + 1 : 0} / {totalPages}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Evento</label>
              <Select value={filterDistanceId} onValueChange={(v) => { setFilterDistanceId(v); setPage(0); }} disabled={!filterRaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los eventos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los eventos</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.distance_km}km)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Punto de Cronometraje</label>
              <Select value={filterTimingPointId} onValueChange={(v) => { setFilterTimingPointId(v); setPage(0); }} disabled={!filterRaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los puntos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los puntos</SelectItem>
                  {timingPoints.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.name} {tp.geofence_radius ? `(radio: ${tp.geofence_radius}m)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Dorsal o nombre..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Badge variant="secondary" className="h-9 px-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {timingPoints.filter(tp => tp.latitude && tp.longitude).length} puntos con coordenadas
              </Badge>
              {filterTimingPointId && filterTimingPointId !== "all" && (() => {
                const selectedTP = timingPoints.find(tp => tp.id === filterTimingPointId);
                return selectedTP ? (
                  <Badge variant="outline" className="h-9 px-3 flex items-center gap-2 border-primary">
                    Geofence: {selectedTP.geofence_radius || 50}m
                  </Badge>
                ) : null;
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={readings.length > 0 && selectedIds.size === readings.length}
                    onCheckedChange={handleSelectAll}
                    aria-label="Seleccionar todo"
                  />
                </TableHead>
                <TableHead className="w-[80px]">Dorsal</TableHead>
                <TableHead>Participante</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Latitud</TableHead>
                <TableHead>Longitud</TableHead>
                <TableHead>Altitud</TableHead>
                <TableHead>Velocidad</TableHead>
                <TableHead>Precisión</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Batería</TableHead>
                <TableHead>Pto Crono Cercano</TableHead>
                <TableHead>Dist Pto</TableHead>
                <TableHead>Dist Meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : readings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                    {filterRaceId ? "No hay lecturas GPS para esta carrera" : "Selecciona una carrera para ver las lecturas GPS"}
                  </TableCell>
                </TableRow>
              ) : (
                readings.map((reading) => {
                  const closest = getClosestTimingPoint(reading);
                  const distToFinish = getDistanceToFinish(reading);
                  
                  return (
                    <TableRow key={reading.id} className={selectedIds.has(reading.id) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(reading.id)}
                          onCheckedChange={(checked) => handleSelectOne(reading.id, checked as boolean)}
                          aria-label={`Seleccionar lectura ${reading.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono font-bold">
                        {reading.registration?.bib_number || "-"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {getParticipantName(reading)}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {reading.registration?.race_distance?.name || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {reading.latitude.toFixed(6)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {reading.longitude.toFixed(6)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {reading.altitude?.toFixed(1) ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {reading.speed ? `${reading.speed.toFixed(1)} m/s` : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {reading.accuracy ? `${reading.accuracy.toFixed(1)}m` : "-"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTime(reading.timestamp)}
                      </TableCell>
                      <TableCell>
                        {reading.battery_level !== null ? (
                          <Badge variant={reading.battery_level > 20 ? "secondary" : "destructive"}>
                            {reading.battery_level}%
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate">
                        {closest?.name || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {closest ? `${(closest.distance * 1000).toFixed(0)}m` : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {distToFinish !== null ? `${distToFinish.toFixed(2)}km` : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar lecturas GPS?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar {selectedIds.size} lectura(s) GPS. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
