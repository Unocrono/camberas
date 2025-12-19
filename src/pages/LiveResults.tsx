import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Trophy, Medal, Award, Activity, MapPin, Timer, Satellite, 
  Radio, Users, Clock, TrendingUp, Map as MapIcon, MapPinned, Search,
  ChevronRight, Zap, Target, Flag
} from "lucide-react";
import { LiveGPSMap } from "@/components/LiveGPSMap";
import { toast } from "sonner";
import { ShareResultsButton } from "@/components/results/ShareResultsButton";
import { ExportResultsButton } from "@/components/results/ExportResultsButton";
import { ResultCard } from "@/components/results/ResultCard";

interface RaceResult {
  id: string;
  finish_time: any;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  status: string;
  photo_url: string | null;
  registration: {
    bib_number: number | null;
    user_id: string;
    guest_first_name: string | null;
    guest_last_name: string | null;
    profiles: {
      first_name: string | null;
      last_name: string | null;
      gender: string | null;
    } | null;
    race_distances: {
      id: string;
      name: string;
      distance_km: number;
    };
  };
}

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
  logo_url: string | null;
  cover_image_url: string | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface TimingReading {
  id: string;
  bib_number: number;
  timing_timestamp: string;
  reading_type: string | null;
  notes: string | null;
  checkpoint: {
    name: string;
    distance_km: number;
  } | null;
  registration: {
    profiles: {
      first_name: string | null;
      last_name: string | null;
    } | null;
    guest_first_name: string | null;
    guest_last_name: string | null;
    race_distances: {
      name: string;
    };
  } | null;
}

interface RaceStats {
  totalRegistrations: number;
  runnersOnRoute: number;
  finishedCount: number;
  totalCheckpointPasses: number;
  gpsPasses: number;
  manualPasses: number;
  avgFinishTime: string | null;
}

type ReadingFilter = 'all' | 'gps' | 'manual' | 'automatic';

export default function LiveResults() {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const [raceId, setRaceId] = useState<string | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>("all");
  const [allResults, setAllResults] = useState<RaceResult[]>([]);
  const [recentReadings, setRecentReadings] = useState<TimingReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [newResultIds, setNewResultIds] = useState<Set<string>>(new Set());
  const [newReadingIds, setNewReadingIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<RaceStats>({
    totalRegistrations: 0,
    runnersOnRoute: 0,
    finishedCount: 0,
    totalCheckpointPasses: 0,
    gpsPasses: 0,
    manualPasses: 0,
    avgFinishTime: null
  });
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>('all');
  const [showMap, setShowMap] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [activeTab, setActiveTab] = useState("rankings");

  // Resolve race ID from slug or direct ID
  useEffect(() => {
    const resolveRaceId = async () => {
      // If we have a direct UUID ID, use it
      if (id && id.length === 36 && id.includes('-')) {
        setRaceId(id);
        return;
      }

      // Si es un slug (desde /:slug o /live/:slug), buscar por el campo slug
      const searchSlug = slug || id;
      if (searchSlug) {
        const { data, error } = await supabase
          .from("races")
          .select("id, slug")
          .eq("slug", searchSlug)
          .single();

        if (data && !error) {
          setRaceId(data.id);
        } else {
          // Slug no encontrado, redirigir a 404
          setRaceId(null);
          setLoading(false);
          navigate("/404", { replace: true });
        }
      } else {
        setLoading(false);
      }
    };

    resolveRaceId();
  }, [id, slug, navigate]);

  // Filter results based on distance and search
  const filteredResults = useMemo(() => {
    return allResults.filter(result => {
      const matchesDistance = selectedDistance === "all" || result.registration.race_distances.id === selectedDistance;
      if (!matchesDistance) return false;
      
      if (!searchQuery.trim()) return true;
      
      const firstName = result.registration.profiles?.first_name || result.registration.guest_first_name || "";
      const lastName = result.registration.profiles?.last_name || result.registration.guest_last_name || "";
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const bibNumber = result.registration.bib_number?.toString() || "";
      
      return fullName.includes(searchQuery.toLowerCase()) || bibNumber.includes(searchQuery);
    });
  }, [allResults, selectedDistance, searchQuery]);

  const topResults = useMemo(() => {
    return filteredResults
      .filter(r => r.status === 'FIN' && r.overall_position)
      .sort((a, b) => (a.overall_position || 999) - (b.overall_position || 999))
      .slice(0, 10);
  }, [filteredResults]);

  const recentFinishers = useMemo(() => {
    return filteredResults
      .filter(r => r.status === 'FIN')
      .slice(0, 10);
  }, [filteredResults]);

  const fetchRaceData = async () => {
    if (!raceId) return;

    try {
      // Fetch race details and distances in parallel
      const [raceResponse, distancesResponse] = await Promise.all([
        supabase.from("races").select("id, name, date, location, logo_url, cover_image_url").eq("id", raceId).single(),
        supabase.from("race_distances").select("id, name, distance_km").eq("race_id", raceId).eq("is_visible", true).order("distance_km")
      ]);

      if (raceResponse.error) throw raceResponse.error;
      setRace(raceResponse.data);
      setDistances(distancesResponse.data || []);

      // Fetch all results using race_distance_id filter instead of nested registration.race_id
      const distanceIds = distancesResponse.data?.map(d => d.id) || [];
      
      let resultsData: any[] = [];
      let resultsError = null;
      
      if (distanceIds.length > 0) {
        const result = await supabase
          .from("race_results")
          .select(`
            id,
            finish_time,
            overall_position,
            gender_position,
            category_position,
            status,
            photo_url,
            race_distance_id,
            registration:registrations!inner (
              bib_number,
              user_id,
              guest_first_name,
              guest_last_name,
              race_distances!inner (
                id,
                name,
                distance_km
              )
            )
          `)
          .in("race_distance_id", distanceIds)
          .order("overall_position", { ascending: true, nullsFirst: false });
        
        resultsData = result.data || [];
        resultsError = result.error;
      }

      if (resultsError) throw resultsError;
      
      // Fetch profiles for results
      if (resultsData && resultsData.length > 0) {
        const userIds = resultsData.map((r: any) => r.registration.user_id).filter(Boolean);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, gender")
          .in("id", userIds);
        
        const profilesMap = new Map(profilesData?.map((p: any) => [p.id, p]));
        const enrichedData = resultsData.map((r: any) => ({
          ...r,
          registration: {
            ...r.registration,
            profiles: r.registration.user_id ? profilesMap.get(r.registration.user_id) || null : null
          }
        }));
        setAllResults(enrichedData);
      } else {
        setAllResults([]);
      }

      // Fetch recent timing readings
      const { data: readingsData, error: readingsError } = await supabase
        .from("timing_readings")
        .select(`
          id,
          bib_number,
          timing_timestamp,
          reading_type,
          notes,
          checkpoint:race_checkpoints(name, distance_km),
          registration:registrations(
            race_distances(name),
            user_id,
            guest_first_name,
            guest_last_name
          )
        `)
        .eq("race_id", raceId)
        .is("status_code", null)
        .order("timing_timestamp", { ascending: false })
        .limit(50);

      if (!readingsError && readingsData) {
        const userIds = readingsData.map((r: any) => r.registration?.user_id).filter(Boolean);
        
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", userIds);
          
          const profilesMap = new Map(profilesData?.map((p: any) => [p.id, p]));
          const enrichedReadings = readingsData.map((r: any) => ({
            ...r,
            registration: r.registration ? {
              ...r.registration,
              profiles: profilesMap.get(r.registration.user_id) || null
            } : null
          }));
          setRecentReadings(enrichedReadings as TimingReading[]);
        } else {
          const formattedReadings = readingsData.map((r: any) => ({
            ...r,
            registration: r.registration ? { ...r.registration, profiles: null } : null
          }));
          setRecentReadings(formattedReadings as TimingReading[]);
        }
      }

      // Fetch stats using race_distance_id instead of nested race_id filter
      const [registrationsCount, allReadingsCount] = await Promise.all([
        supabase.from("registrations").select("id", { count: 'exact', head: true }).eq("race_id", raceId).eq("status", "confirmed"),
        supabase.from("timing_readings").select("reading_type", { count: 'exact' }).eq("race_id", raceId).is("status_code", null)
      ]);

      // Count finished results from already fetched data
      const finishedFromResults = resultsData.filter((r: any) => r.status === 'FIN');

      const totalRegs = registrationsCount.count || 0;
      const finishedCount = finishedFromResults.length;
      const runnersOnRoute = totalRegs - finishedCount;
      const gpsPasses = readingsData?.filter((r: any) => r.reading_type === 'gps_auto').length || 0;
      const manualPasses = readingsData?.filter((r: any) => r.reading_type === 'manual').length || 0;

      let avgFinishTime: string | null = null;
      if (finishedFromResults.length > 0) {
        const times = finishedFromResults.map((r: any) => {
          const match = r.finish_time?.match(/(\d{2}):(\d{2}):(\d{2})/);
          if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
          }
          return 0;
        }).filter((t: number) => t > 0);
        
        if (times.length > 0) {
          const avgSeconds = Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length);
          const hours = Math.floor(avgSeconds / 3600);
          const minutes = Math.floor((avgSeconds % 3600) / 60);
          const seconds = avgSeconds % 60;
          avgFinishTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
      }

      setStats({
        totalRegistrations: totalRegs,
        runnersOnRoute,
        finishedCount,
        totalCheckpointPasses: allReadingsCount.count || 0,
        gpsPasses,
        manualPasses,
        avgFinishTime
      });

      // Fetch mapbox token
      try {
        const { data: tokenData } = await supabase.functions.invoke('get-mapbox-token');
        if (tokenData?.MAPBOX_PUBLIC_TOKEN) {
          setMapboxToken(tokenData.MAPBOX_PUBLIC_TOKEN);
        }
      } catch (tokenError) {
        console.error('Error fetching mapbox token:', tokenError);
      }
    } catch (error) {
      console.error("Error fetching race data:", error);
      toast.error("Error al cargar resultados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRaceData();

    const resultsChannel = supabase
      .channel("race_results_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "race_results" }, (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
          const resultId = payload.new.id as string;
          setNewResultIds((prev) => new Set(prev).add(resultId));
          setTimeout(() => setNewResultIds((prev) => { const u = new Set(prev); u.delete(resultId); return u; }), 3000);
        }
        fetchRaceData();
      })
      .subscribe();

    const readingsChannel = supabase
      .channel("timing_readings_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "timing_readings" }, (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
          const readingId = payload.new.id as string;
          setNewReadingIds((prev) => new Set(prev).add(readingId));
          setTimeout(() => setNewReadingIds((prev) => { const u = new Set(prev); u.delete(readingId); return u; }), 3000);
        }
        fetchRaceData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(resultsChannel);
      supabase.removeChannel(readingsChannel);
    };
  }, [raceId]);

  const formatTime = (timeString: string): string => {
    if (!timeString) return "--:--:--";
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : timeString;
  };

  const calculatePace = (timeString: string, distanceKm: number): string => {
    const match = timeString?.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match || distanceKm === 0) return "--:--";
    const totalMinutes = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 60;
    const paceMinutes = Math.floor(totalMinutes / distanceKm);
    const paceSeconds = Math.round(((totalMinutes / distanceKm) % 1) * 60);
    return `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")}`;
  };

  const getPositionBadge = (position: number | null) => {
    if (!position) return null;
    if (position === 1) return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/20"><Trophy className="h-5 w-5 text-yellow-500" /></div>;
    if (position === 2) return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-400/20"><Medal className="h-5 w-5 text-gray-400" /></div>;
    if (position === 3) return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-600/20"><Award className="h-5 w-5 text-amber-600" /></div>;
    return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted font-bold">{position}</div>;
  };

  const getRunnerName = (result: RaceResult) => {
    const firstName = result.registration.profiles?.first_name || result.registration.guest_first_name || "";
    const lastName = result.registration.profiles?.last_name || result.registration.guest_last_name || "";
    return `${firstName} ${lastName}`.trim() || `Dorsal #${result.registration.bib_number}`;
  };

  const getReadingRunnerName = (reading: TimingReading) => {
    const firstName = reading.registration?.profiles?.first_name || reading.registration?.guest_first_name || "";
    const lastName = reading.registration?.profiles?.last_name || reading.registration?.guest_last_name || "";
    return `${firstName} ${lastName}`.trim();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/20 border-t-primary mx-auto" />
            <Activity className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground">Cargando resultados en vivo...</p>
        </div>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center space-y-4">
            <Flag className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">Carrera no encontrada</h2>
            <p className="text-muted-foreground">La carrera que buscas no existe o ha sido eliminada.</p>
            <Button asChild>
              <Link to="/races"><ArrowLeft className="mr-2 h-4 w-4" /> Ver carreras</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Hero Header with improved design */}
      <div className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative container mx-auto px-4 py-6 md:py-10 border-b">
          <Button asChild variant="ghost" size="sm" className="mb-4 hover:bg-primary/10">
            <Link to={`/race/${raceId}`}><ArrowLeft className="mr-2 h-4 w-4" /> Volver a la carrera</Link>
          </Button>
          
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            {race.logo_url && (
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                <img src={race.logo_url} alt={race.name} className="relative h-16 w-16 md:h-20 md:w-20 object-contain rounded-xl bg-white p-2 shadow-lg" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="default" className="bg-green-500 hover:bg-green-500 shadow-lg shadow-green-500/30">
                  <span className="inline-block h-2 w-2 rounded-full bg-white mr-1.5 animate-pulse" />
                  EN VIVO
                </Badge>
                {mapboxToken && (
                  <Button variant="outline" size="sm" onClick={() => setShowMap(!showMap)} className="h-7">
                    <MapPinned className="h-3.5 w-3.5 mr-1.5" />
                    {showMap ? "Ocultar mapa" : "Ver mapa"}
                  </Button>
                )}
                <ShareResultsButton raceName={race.name} raceId={raceId!} />
                <ExportResultsButton 
                  results={allResults} 
                  raceName={race.name} 
                  raceDate={race.date}
                  distanceName={selectedDistance !== "all" ? distances.find(d => d.id === selectedDistance)?.name : undefined}
                />
              </div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">{race.name}</h1>
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <MapPin className="h-4 w-4" /> {race.location} • {new Date(race.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* GPS Map */}
      {showMap && mapboxToken && (
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-4">
            <Card className="overflow-hidden shadow-xl">
              <div className="h-[300px] md:h-[400px] w-full">
                <LiveGPSMap raceId={raceId!} mapboxToken={mapboxToken} />
              </div>
            </Card>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        {/* Stats Grid - Mobile optimized */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-blue-500 mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium">Inscritos</span>
              </div>
              <p className="text-xl md:text-2xl font-bold">{stats.totalRegistrations}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-green-500 mb-1">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium">En Ruta</span>
              </div>
              <p className="text-xl md:text-2xl font-bold">{stats.runnersOnRoute}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-amber-500 mb-1">
                <Trophy className="h-4 w-4" />
                <span className="text-xs font-medium">Finalizados</span>
              </div>
              <p className="text-xl md:text-2xl font-bold">{stats.finishedCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-purple-500 mb-1">
                <Target className="h-4 w-4" />
                <span className="text-xs font-medium">Checkpoints</span>
              </div>
              <p className="text-xl md:text-2xl font-bold">{stats.totalCheckpointPasses}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20 hidden sm:block">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-cyan-500 mb-1">
                <Satellite className="h-4 w-4" />
                <span className="text-xs font-medium">GPS / Manual</span>
              </div>
              <p className="text-xl md:text-2xl font-bold">{stats.gpsPasses} / {stats.manualPasses}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20 hidden sm:block">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-rose-500 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Tiempo Medio</span>
              </div>
              <p className="text-lg md:text-xl font-bold font-mono">{stats.avgFinishTime || '--:--:--'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nombre o dorsal..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {distances.length > 1 && (
            <Select value={selectedDistance} onValueChange={setSelectedDistance}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Todas las distancias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las distancias</SelectItem>
                {distances.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
            <TabsTrigger value="rankings" className="gap-2">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Clasificación</span>
              <span className="sm:hidden">Top</span>
            </TabsTrigger>
            <TabsTrigger value="finishers" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Llegadas</span>
              <span className="sm:hidden">Llegadas</span>
            </TabsTrigger>
            <TabsTrigger value="checkpoints" className="gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Checkpoints</span>
              <span className="sm:hidden">Pasos</span>
            </TabsTrigger>
          </TabsList>

          {/* Rankings Tab */}
          <TabsContent value="rankings" className="space-y-6">
            {/* Podium for Top 3 */}
            {topResults.length >= 3 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Second place */}
                <div className="md:order-1 md:mt-8">
                  <ResultCard
                    position={topResults[1]?.overall_position || null}
                    bibNumber={topResults[1]?.registration.bib_number || null}
                    runnerName={getRunnerName(topResults[1])}
                    distanceName={topResults[1]?.registration.race_distances.name}
                    finishTime={formatTime(topResults[1]?.finish_time)}
                    pace={calculatePace(topResults[1]?.finish_time, topResults[1]?.registration.race_distances.distance_km)}
                    photoUrl={topResults[1]?.photo_url}
                    isNew={newResultIds.has(topResults[1]?.id)}
                    variant="podium"
                  />
                </div>
                {/* First place - center */}
                <div className="md:order-2">
                  <ResultCard
                    position={topResults[0]?.overall_position || null}
                    bibNumber={topResults[0]?.registration.bib_number || null}
                    runnerName={getRunnerName(topResults[0])}
                    distanceName={topResults[0]?.registration.race_distances.name}
                    finishTime={formatTime(topResults[0]?.finish_time)}
                    pace={calculatePace(topResults[0]?.finish_time, topResults[0]?.registration.race_distances.distance_km)}
                    photoUrl={topResults[0]?.photo_url}
                    isNew={newResultIds.has(topResults[0]?.id)}
                    variant="podium"
                  />
                </div>
                {/* Third place */}
                <div className="md:order-3 md:mt-12">
                  <ResultCard
                    position={topResults[2]?.overall_position || null}
                    bibNumber={topResults[2]?.registration.bib_number || null}
                    runnerName={getRunnerName(topResults[2])}
                    distanceName={topResults[2]?.registration.race_distances.name}
                    finishTime={formatTime(topResults[2]?.finish_time)}
                    pace={calculatePace(topResults[2]?.finish_time, topResults[2]?.registration.race_distances.distance_km)}
                    photoUrl={topResults[2]?.photo_url}
                    isNew={newResultIds.has(topResults[2]?.id)}
                    variant="podium"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top 10 (after podium) */}
              <Card className="shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Clasificación General
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topResults.length > 0 ? topResults.slice(3).map((result) => (
                    <ResultCard
                      key={result.id}
                      position={result.overall_position}
                      bibNumber={result.registration.bib_number}
                      runnerName={getRunnerName(result)}
                      distanceName={result.registration.race_distances.name}
                      finishTime={formatTime(result.finish_time)}
                      pace={calculatePace(result.finish_time, result.registration.race_distances.distance_km)}
                      categoryPosition={result.category_position}
                      genderPosition={result.gender_position}
                      photoUrl={result.photo_url}
                      isNew={newResultIds.has(result.id)}
                    />
                  )) : topResults.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Trophy className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>Aún no hay finalizados</p>
                      <p className="text-sm">Los resultados aparecerán aquí en tiempo real</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* All Results List */}
              <Card className="shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Todos los Resultados
                    </span>
                    <Badge variant="secondary" className="font-mono">{filteredResults.filter(r => r.status === 'FIN').length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[400px] overflow-y-auto space-y-1">
                  {filteredResults.filter(r => r.status === 'FIN').length > 0 ? (
                    filteredResults.filter(r => r.status === 'FIN').sort((a, b) => (a.overall_position || 999) - (b.overall_position || 999)).map((result) => (
                      <ResultCard
                        key={result.id}
                        position={result.overall_position}
                        bibNumber={result.registration.bib_number}
                        runnerName={getRunnerName(result)}
                        distanceName={result.registration.race_distances.name}
                        finishTime={formatTime(result.finish_time)}
                        pace={calculatePace(result.finish_time, result.registration.race_distances.distance_km)}
                        isNew={newResultIds.has(result.id)}
                        variant="compact"
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No hay resultados{searchQuery ? " para esta búsqueda" : ""}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Recent Finishers Tab */}
          <TabsContent value="finishers">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="h-5 w-5 text-primary" />
                  Últimas Llegadas
                  <Badge variant="outline" className="ml-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse mr-1" />
                    En vivo
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentFinishers.length > 0 ? recentFinishers.map((result, index) => (
                    <div
                      key={result.id}
                      className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition-all ${
                        newResultIds.has(result.id) ? "ring-2 ring-primary shadow-lg" : ""
                      }`}
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={result.photo_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {getRunnerName(result).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{getRunnerName(result)}</p>
                          {index === 0 && newResultIds.has(result.id) && (
                            <Badge variant="default" className="bg-green-500 animate-pulse text-xs">NUEVO</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          #{result.registration.bib_number} • {result.registration.race_distances.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-lg">{formatTime(result.finish_time)}</p>
                        <p className="text-sm text-muted-foreground">Pos: {result.overall_position || '-'}</p>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No hay llegadas recientes</p>
                      <p className="text-sm">Las nuevas llegadas aparecerán aquí automáticamente</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Checkpoints Tab */}
          <TabsContent value="checkpoints">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5 text-primary" />
                  Pasos por Checkpoints
                  <Badge variant="outline" className="ml-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse mr-1" />
                    En vivo
                  </Badge>
                </CardTitle>
                <Select value={readingFilter} onValueChange={(value: ReadingFilter) => setReadingFilter(value)}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="gps">Solo GPS</SelectItem>
                    <SelectItem value="manual">Solo Manuales</SelectItem>
                    <SelectItem value="automatic">Solo RFID</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentReadings
                    .filter(reading => {
                      if (readingFilter === 'all') return true;
                      if (readingFilter === 'gps') return reading.reading_type === 'gps_auto';
                      if (readingFilter === 'manual') return reading.reading_type === 'manual';
                      if (readingFilter === 'automatic') return reading.reading_type === 'automatic';
                      return true;
                    })
                    .slice(0, 18)
                    .map((reading) => (
                    <div
                      key={reading.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border bg-card/50 transition-all ${
                        newReadingIds.has(reading.id) ? "ring-2 ring-primary shadow-lg" : ""
                      }`}
                    >
                      <div className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${
                        reading.reading_type === 'gps_auto' 
                          ? 'bg-blue-500/20 text-blue-500' 
                          : reading.reading_type === 'automatic'
                          ? 'bg-green-500/20 text-green-500'
                          : 'bg-orange-500/20 text-orange-500'
                      }`}>
                        {reading.reading_type === 'gps_auto' ? <Satellite className="h-4 w-4" /> : 
                         reading.reading_type === 'automatic' ? <Radio className="h-4 w-4" /> : 
                         <Timer className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono text-xs">#{reading.bib_number}</Badge>
                          {newReadingIds.has(reading.id) && <Badge variant="default" className="text-xs animate-pulse">NEW</Badge>}
                        </div>
                        <p className="text-sm truncate">{getReadingRunnerName(reading) || `Dorsal #${reading.bib_number}`}</p>
                        <p className="text-xs text-muted-foreground">{reading.checkpoint?.name || 'Checkpoint'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-semibold">
                          {new Date(reading.timing_timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {recentReadings.filter(reading => {
                    if (readingFilter === 'all') return true;
                    if (readingFilter === 'gps') return reading.reading_type === 'gps_auto';
                    if (readingFilter === 'manual') return reading.reading_type === 'manual';
                    if (readingFilter === 'automatic') return reading.reading_type === 'automatic';
                    return true;
                  }).length === 0 && (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      <MapPin className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No hay pasos registrados</p>
                      <p className="text-sm">Los tiempos aparecerán aquí en tiempo real</p>
                    </div>
                  )}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Satellite className="h-2.5 w-2.5 text-blue-500" />
                    </div>
                    <span>GPS</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Radio className="h-2.5 w-2.5 text-green-500" />
                    </div>
                    <span>RFID</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <Timer className="h-2.5 w-2.5 text-orange-500" />
                    </div>
                    <span>Manual</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
