import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Download, RefreshCw, MapPin, Satellite, Clock, Users, Radio } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GPSTimingReading {
  id: string;
  bib_number: number;
  timing_timestamp: string;
  reading_timestamp: string;
  reading_type: string;
  is_processed: boolean;
  lap_number: number;
  notes: string | null;
  race_id: string;
  race_distance_id: string | null;
  registration_id: string | null;
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

interface GPSReadingsManagementProps {
  isOrganizer?: boolean;
  selectedRaceId?: string;
}

export function GPSReadingsManagement({ isOrganizer = false, selectedRaceId }: GPSReadingsManagementProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [readings, setReadings] = useState<GPSTimingReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [races, setRaces] = useState<Race[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  
  // Stats
  const [stats, setStats] = useState({
    totalReadings: 0,
    processedReadings: 0,
    uniqueRunners: 0,
    checkpointsPassed: 0,
  });
  
  // Filters
  const [filterRaceId, setFilterRaceId] = useState<string>(selectedRaceId || "");
  const [filterDistanceId, setFilterDistanceId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isLive, setIsLive] = useState(true);
  const [newReadingsCount, setNewReadingsCount] = useState(0);

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
    } else {
      setDistances([]);
      setFilterDistanceId("all");
    }
  }, [filterRaceId]);

  useEffect(() => {
    fetchReadings();
  }, [filterRaceId, filterDistanceId, searchTerm]);

  // Realtime subscription for GPS readings
  useEffect(() => {
    if (!filterRaceId || !isLive) return;

    console.log('Setting up realtime subscription for GPS readings, race:', filterRaceId);

    const channel = supabase
      .channel(`gps-readings-${filterRaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'timing_readings',
          filter: `race_id=eq.${filterRaceId}`
        },
        async (payload) => {
          console.log('New timing reading received:', payload);
          
          // Only process GPS geofence readings
          if (payload.new.reading_type !== 'gps_geofence') {
            return;
          }

          // Check distance filter
          if (filterDistanceId && filterDistanceId !== "all" && payload.new.race_distance_id !== filterDistanceId) {
            return;
          }

          // Fetch related data for the new reading
          const { data: enrichedReading, error } = await supabase
            .from("timing_readings")
            .select(`
              *,
              checkpoint:race_checkpoints(name, distance_km),
              race_distance:race_distances(name),
              registration:registrations(guest_first_name, guest_last_name, user_id)
            `)
            .eq("id", payload.new.id)
            .maybeSingle();

          if (error) {
            console.error('Error fetching enriched reading:', error);
            return;
          }

          if (enrichedReading) {
            // Apply search filter
            if (searchTerm) {
              const search = searchTerm.toLowerCase();
              const bibMatch = enrichedReading.bib_number.toString().includes(search);
              const nameMatch = enrichedReading.registration
                ? `${enrichedReading.registration.guest_first_name || ""} ${enrichedReading.registration.guest_last_name || ""}`.toLowerCase().includes(search)
                : false;
              if (!bibMatch && !nameMatch) return;
            }

            setReadings(prev => [enrichedReading, ...prev]);
            setNewReadingsCount(prev => prev + 1);
            
            // Update stats
            setStats(prev => ({
              totalReadings: prev.totalReadings + 1,
              processedReadings: enrichedReading.is_processed ? prev.processedReadings + 1 : prev.processedReadings,
              uniqueRunners: prev.uniqueRunners, // Will be recalculated on next fetch
              checkpointsPassed: prev.checkpointsPassed,
            }));

            toast({
              title: "Nueva lectura GPS",
              description: `Dorsal #${enrichedReading.bib_number} - ${enrichedReading.checkpoint?.name || 'Checkpoint'}`,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [filterRaceId, filterDistanceId, searchTerm, isLive, toast]);

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

  const fetchReadings = async () => {
    if (!filterRaceId) {
      setReadings([]);
      setStats({ totalReadings: 0, processedReadings: 0, uniqueRunners: 0, checkpointsPassed: 0 });
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
        .eq("reading_type", "gps_geofence")
        .order("timing_timestamp", { ascending: false });

      if (filterDistanceId && filterDistanceId !== "all") {
        query = query.eq("race_distance_id", filterDistanceId);
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

      // Calculate stats
      const uniqueRunners = new Set(filteredData.map(r => r.registration_id)).size;
      const uniqueCheckpoints = new Set(filteredData.map(r => r.checkpoint_id)).size;
      const processedCount = filteredData.filter(r => r.is_processed).length;

      setStats({
        totalReadings: filteredData.length,
        processedReadings: processedCount,
        uniqueRunners,
        checkpointsPassed: uniqueCheckpoints,
      });

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

  const handleProcessGPS = async () => {
    if (!filterRaceId) {
      toast({
        title: "Selecciona una carrera",
        description: "Debes seleccionar una carrera para procesar las lecturas GPS",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-gps-geofence", {
        body: { race_id: filterRaceId, minutes_back: 60 },
      });

      if (error) throw error;

      toast({
        title: "Procesamiento completado",
        description: `Procesadas ${data.processed} lecturas GPS, creadas ${data.created} lecturas de cronometraje`,
      });

      fetchReadings();
    } catch (error: any) {
      console.error("Error processing GPS:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo procesar las lecturas GPS",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
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

    const headers = ["Dorsal", "Participante", "Evento", "Checkpoint", "KM", "Hora GPS", "Procesado", "Notas"];
    const rows = readings.map((r) => [
      r.bib_number,
      r.registration ? `${r.registration.guest_first_name || ""} ${r.registration.guest_last_name || ""}`.trim() : "-",
      r.race_distance?.name || "-",
      r.checkpoint?.name || "-",
      r.checkpoint?.distance_km?.toFixed(1) || "-",
      new Date(r.timing_timestamp).toLocaleString("es-ES"),
      r.is_processed ? "Sí" : "No",
      r.notes || "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `lecturas_gps_${new Date().toISOString().split("T")[0]}.csv`;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Satellite className="h-6 w-6 text-primary" />
            Lecturas GPS → Cronometraje
            {isLive && filterRaceId && (
              <Badge variant="default" className="ml-2 bg-green-500 animate-pulse flex items-center gap-1">
                <Radio className="h-3 w-3" />
                EN VIVO
              </Badge>
            )}
            {newReadingsCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                +{newReadingsCount} nuevas
              </Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Lecturas de cronometraje generadas automáticamente desde datos GPS por geofencing
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={isLive ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setIsLive(!isLive);
              if (!isLive) {
                setNewReadingsCount(0);
              }
            }}
            className={isLive ? "bg-green-600 hover:bg-green-700" : ""}
          >
            <Radio className={`h-4 w-4 mr-2 ${isLive ? "animate-pulse" : ""}`} />
            {isLive ? "En vivo" : "Pausado"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchReadings(); setNewReadingsCount(0); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleProcessGPS} disabled={processing || !filterRaceId}>
            {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Procesar GPS
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={readings.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lecturas GPS</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Satellite className="h-5 w-5 text-blue-500" />
              {stats.totalReadings}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Procesadas</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-500" />
              {stats.processedReadings}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Corredores</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-500" />
              {stats.uniqueRunners}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Checkpoints</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              {stats.checkpointsPassed}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            {!selectedRaceId && (
              <div className="flex-1 min-w-[200px]">
                <Select value={filterRaceId} onValueChange={setFilterRaceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una carrera" />
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
            
            {distances.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <Select value={filterDistanceId} onValueChange={setFilterDistanceId}>
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
            )}
            
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por dorsal o nombre..."
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
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !filterRaceId ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Satellite className="h-12 w-12 mb-4 opacity-50" />
              <p>Selecciona una carrera para ver las lecturas GPS</p>
            </div>
          ) : readings.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mb-4 opacity-50" />
              <p>No hay lecturas GPS para esta carrera</p>
              <p className="text-sm mt-2">Las lecturas GPS se generan automáticamente cuando los corredores pasan por checkpoints con geofencing configurado</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[80px]">Dorsal</TableHead>
                    <TableHead>Participante</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Checkpoint</TableHead>
                    <TableHead>KM</TableHead>
                    <TableHead>Hora GPS</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readings.map((reading) => (
                    <TableRow key={reading.id}>
                      <TableCell className="font-bold">{reading.bib_number}</TableCell>
                      <TableCell>
                        {reading.registration
                          ? `${reading.registration.guest_first_name || ""} ${reading.registration.guest_last_name || ""}`.trim()
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {reading.race_distance?.name || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {reading.checkpoint?.name || <span className="text-muted-foreground">-</span>}
                        </div>
                      </TableCell>
                      <TableCell>{reading.checkpoint?.distance_km?.toFixed(1) || "-"}</TableCell>
                      <TableCell>{formatDateTime(reading.timing_timestamp)}</TableCell>
                      <TableCell>
                        {reading.is_processed ? (
                          <Badge variant="default" className="bg-green-500">Procesado</Badge>
                        ) : (
                          <Badge variant="secondary">Pendiente</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
