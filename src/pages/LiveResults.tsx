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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  ArrowLeft, Trophy, Medal, Award, Activity, MapPin, Timer, Satellite, 
  Radio, Clock, Map as MapIcon, MapPinned, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Flag, Mic, List
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
      club?: string | null;
      team?: string | null;
      birth_date?: string | null;
    } | null;
    race_distances: {
      id: string;
      name: string;
      distance_km: number;
    };
  };
  split_times?: SplitTime[];
}

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
  logo_url: string | null;
  cover_image_url: string | null;
  race_type: string;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface RaceCheckpoint {
  id: string;
  name: string;
  distance_km: number;
  checkpoint_order: number;
  checkpoint_type: string;
}

interface SplitTime {
  id: string;
  checkpoint_name: string;
  checkpoint_order: number;
  split_time: string;
  distance_km: number;
}

interface TimingReading {
  id: string;
  bib_number: number;
  timing_timestamp: string;
  reading_type: string | null;
  notes: string | null;
  checkpoint: {
    id: string;
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

const ITEMS_PER_PAGE = 50;

export default function LiveResults() {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const [raceId, setRaceId] = useState<string | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [checkpoints, setCheckpoints] = useState<RaceCheckpoint[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>("all");
  const [allResults, setAllResults] = useState<RaceResult[]>([]);
  const [recentReadings, setRecentReadings] = useState<TimingReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [newResultIds, setNewResultIds] = useState<Set<string>>(new Set());
  const [newReadingIds, setNewReadingIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [activeTab, setActiveTab] = useState("clasificacion");
  const [currentPage, setCurrentPage] = useState(1);
  const [speakerCheckpoint, setSpeakerCheckpoint] = useState<string>("all");
  const [intermediosCheckpoint, setIntermediosCheckpoint] = useState<string>("all");
  const [intermediosPage, setIntermediosPage] = useState(1);
  const [speakerPage, setSpeakerPage] = useState(1);

  // Resolve race ID from slug or direct ID
  useEffect(() => {
    const resolveRaceId = async () => {
      if (id && id.length === 36 && id.includes('-')) {
        setRaceId(id);
        return;
      }

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

  // Sorted and finished results
  const sortedResults = useMemo(() => {
    return filteredResults
      .filter(r => r.status === 'FIN' && r.overall_position)
      .sort((a, b) => (a.overall_position || 999) - (b.overall_position || 999));
  }, [filteredResults]);

  // Pagination
  const totalPages = Math.ceil(sortedResults.length / ITEMS_PER_PAGE);
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedResults.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedResults, currentPage]);

  // Top 3 for podium
  const podiumResults = useMemo(() => {
    return sortedResults.slice(0, 3);
  }, [sortedResults]);

  // Recent readings filtered by checkpoint for Speaker tab
  const filteredReadings = useMemo(() => {
    if (speakerCheckpoint === "all") return recentReadings;
    return recentReadings.filter(r => r.checkpoint?.id === speakerCheckpoint);
  }, [recentReadings, speakerCheckpoint]);

  // Checkpoints filtered by selected distance
  const filteredCheckpoints = useMemo(() => {
    if (selectedDistance === "all") return checkpoints;
    // For now, return all checkpoints - could filter by race_distance_id if needed
    return checkpoints;
  }, [checkpoints, selectedDistance]);

  // Results filtered by checkpoint for Intermedios tab - classification at that checkpoint
  const intermediosResults = useMemo(() => {
    if (intermediosCheckpoint === "all") return [];
    
    const checkpoint = checkpoints.find(c => c.id === intermediosCheckpoint);
    if (!checkpoint) return [];
    
    // Get results that have a split time for this checkpoint
    const resultsWithSplit = sortedResults
      .map(result => {
        const split = result.split_times?.find(s => s.checkpoint_order === checkpoint.checkpoint_order);
        return split ? { ...result, splitTime: split.split_time, splitOrder: split.checkpoint_order } : null;
      })
      .filter((r): r is RaceResult & { splitTime: string; splitOrder: number } => r !== null)
      .sort((a, b) => {
        // Sort by split time
        const parseTime = (t: string) => {
          const match = t.match(/(\d{2}):(\d{2}):(\d{2})/);
          if (!match) return 0;
          return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
        };
        return parseTime(a.splitTime) - parseTime(b.splitTime);
      });
    
    return resultsWithSplit;
  }, [sortedResults, intermediosCheckpoint, checkpoints]);

  // Pagination for intermedios
  const intermediosTotalPages = Math.ceil(intermediosResults.length / ITEMS_PER_PAGE);
  const paginatedIntermediosResults = useMemo(() => {
    const start = (intermediosPage - 1) * ITEMS_PER_PAGE;
    return intermediosResults.slice(start, start + ITEMS_PER_PAGE);
  }, [intermediosResults, intermediosPage]);

  // Speaker results - last 20 finishers in reverse order (most recent first)
  const speakerResults = useMemo(() => {
    // Filter by checkpoint if selected
    let results = sortedResults;
    
    if (speakerCheckpoint !== "all") {
      const checkpoint = checkpoints.find(c => c.id === speakerCheckpoint);
      if (!checkpoint) return [];
      
      // Get results that have a split time for this checkpoint, sorted by most recent
      return sortedResults
        .map(result => {
          const split = result.split_times?.find(s => s.checkpoint_order === checkpoint.checkpoint_order);
          return split ? { ...result, splitTime: split.split_time, splitOrder: split.checkpoint_order } : null;
        })
        .filter((r): r is RaceResult & { splitTime: string; splitOrder: number } => r !== null)
        .sort((a, b) => {
          // Sort by split time descending (most recent first)
          const parseTime = (t: string) => {
            const match = t.match(/(\d{2}):(\d{2}):(\d{2})/);
            if (!match) return 0;
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
          };
          return parseTime(b.splitTime) - parseTime(a.splitTime);
        })
        .slice(0, 20);
    }
    
    // For "all" - show last 20 finishers in reverse order
    return [...results].reverse().slice(0, 20);
  }, [sortedResults, speakerCheckpoint, checkpoints]);

  const fetchRaceData = async () => {
    if (!raceId) return;

    try {
      // Fetch race details, distances, and checkpoints in parallel
      const [raceResponse, distancesResponse, checkpointsResponse] = await Promise.all([
        supabase.from("races").select("id, name, date, location, logo_url, cover_image_url, race_type").eq("id", raceId).single(),
        supabase.from("race_distances").select("id, name, distance_km").eq("race_id", raceId).eq("is_visible", true).order("distance_km"),
        supabase.from("race_checkpoints").select("id, name, distance_km, checkpoint_order, checkpoint_type").eq("race_id", raceId).order("checkpoint_order")
      ]);

      if (raceResponse.error) throw raceResponse.error;
      setRace(raceResponse.data);
      setDistances(distancesResponse.data || []);
      setCheckpoints(checkpointsResponse.data || []);

      // Auto-select first distance if only one
      if (distancesResponse.data?.length === 1) {
        setSelectedDistance(distancesResponse.data[0].id);
      }

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
      
      // Fetch profiles and split_times for results
      if (resultsData && resultsData.length > 0) {
        const userIds = resultsData.map((r: any) => r.registration.user_id).filter(Boolean);
        const resultIds = resultsData.map((r: any) => r.id);
        
        const [profilesResponse, splitTimesResponse] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, first_name, last_name, gender, club, team, birth_date")
            .in("id", userIds),
          supabase
            .from("split_times")
            .select("id, race_result_id, checkpoint_name, checkpoint_order, split_time, distance_km")
            .in("race_result_id", resultIds)
            .order("checkpoint_order")
        ]);
        
        const profilesMap = new Map(profilesResponse.data?.map((p: any) => [p.id, p]));
        const splitTimesMap = new Map<string, SplitTime[]>();
        
        splitTimesResponse.data?.forEach((st: any) => {
          const existing = splitTimesMap.get(st.race_result_id) || [];
          existing.push(st);
          splitTimesMap.set(st.race_result_id, existing);
        });
        
        const enrichedData = resultsData.map((r: any) => ({
          ...r,
          registration: {
            ...r.registration,
            profiles: r.registration.user_id ? profilesMap.get(r.registration.user_id) || null : null
          },
          split_times: splitTimesMap.get(r.id) || []
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
          checkpoint:race_checkpoints(id, name, distance_km),
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
        .limit(100);

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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setIntermediosPage(1);
    setSpeakerPage(1);
  }, [selectedDistance, searchQuery]);

  const formatTime = (timeString: string): string => {
    if (!timeString) return "--:--:--";
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : timeString;
  };

  const calculateGap = (resultTime: string, leaderTime: string): string => {
    if (!resultTime || !leaderTime) return "-";
    
    const parseTime = (t: string) => {
      const match = t.match(/(\d{2}):(\d{2}):(\d{2})/);
      if (!match) return 0;
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
    };
    
    const diff = parseTime(resultTime) - parseTime(leaderTime);
    if (diff <= 0) return "-";
    
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    if (hours > 0) {
      return `+${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `+${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const calculatePace = (timeString: string, distanceKm: number): string => {
    const match = timeString?.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match || distanceKm === 0) return "--:--";
    const totalMinutes = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 60;
    const paceMinutes = Math.floor(totalMinutes / distanceKm);
    const paceSeconds = Math.round(((totalMinutes / distanceKm) % 1) * 60);
    return `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")}`;
  };

  const calculateSpeed = (timeString: string, distanceKm: number): string => {
    const match = timeString?.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match || distanceKm === 0) return "--.-";
    const totalHours = parseInt(match[1]) + parseInt(match[2]) / 60 + parseInt(match[3]) / 3600;
    if (totalHours === 0) return "--.-";
    return (distanceKm / totalHours).toFixed(1);
  };

  const getRunnerName = (result: RaceResult) => {
    const firstName = result.registration.profiles?.first_name || result.registration.guest_first_name || "";
    const lastName = result.registration.profiles?.last_name || result.registration.guest_last_name || "";
    return `${firstName} ${lastName}`.trim() || `Dorsal #${result.registration.bib_number}`;
  };

  const getClub = (result: RaceResult) => {
    return result.registration.profiles?.club || result.registration.profiles?.team || "";
  };

  const getCategory = (result: RaceResult) => {
    const gender = result.registration.profiles?.gender;
    const birthDate = result.registration.profiles?.birth_date;
    if (!birthDate || !gender) return "-";
    
    const raceDate = race?.date ? new Date(race.date) : new Date();
    const birth = new Date(birthDate);
    const age = Math.floor((raceDate.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    
    const genderPrefix = gender === 'M' ? 'M' : 'F';
    if (age < 20) return `${genderPrefix}-JUN`;
    if (age < 35) return `${genderPrefix}-SEN`;
    if (age < 45) return `${genderPrefix}-VA`;
    if (age < 55) return `${genderPrefix}-VB`;
    if (age < 65) return `${genderPrefix}-VC`;
    return `${genderPrefix}-VD`;
  };

  const getGender = (result: RaceResult) => {
    const gender = result.registration.profiles?.gender;
    if (gender === 'M') return 'Hombre';
    if (gender === 'F') return 'Mujer';
    return '-';
  };

  const getReadingRunnerName = (reading: TimingReading) => {
    const firstName = reading.registration?.profiles?.first_name || reading.registration?.guest_first_name || "";
    const lastName = reading.registration?.profiles?.last_name || reading.registration?.guest_last_name || "";
    return `${firstName} ${lastName}`.trim();
  };

  // Get split time for a specific checkpoint
  const getSplitTime = (result: RaceResult, checkpointOrder: number): string | null => {
    const split = result.split_times?.find(s => s.checkpoint_order === checkpointOrder);
    return split ? formatTime(split.split_time) : null;
  };

  // Leader time for gap calculation
  const leaderTime = sortedResults[0]?.finish_time;

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
      {/* Hero Header */}
      <div className="relative overflow-hidden">
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
        {/* Distance Selector Buttons + Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* Distance Buttons */}
          <div className="flex flex-wrap gap-2">
            {distances.length > 1 && (
              <Button
                variant={selectedDistance === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDistance("all")}
              >
                Todas
              </Button>
            )}
            {distances.map(d => (
              <Button
                key={d.id}
                variant={selectedDistance === d.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDistance(d.id)}
              >
                {d.name}
              </Button>
            ))}
          </div>
          
          {/* Search */}
          <div className="relative w-full sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nombre o dorsal..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="clasificacion" className="gap-2">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Clasificación</span>
              <span className="sm:hidden">Clas.</span>
            </TabsTrigger>
            <TabsTrigger value="podium" className="gap-2">
              <Trophy className="h-4 w-4" />
              <span>Pódium</span>
            </TabsTrigger>
            <TabsTrigger value="speaker" className="gap-2">
              <Mic className="h-4 w-4" />
              <span>Speaker</span>
            </TabsTrigger>
            <TabsTrigger value="intermedios" className="gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Pasos Intermedios</span>
              <span className="sm:hidden">Pasos</span>
            </TabsTrigger>
          </TabsList>

          {/* Clasificación Tab - Full Table */}
          <TabsContent value="clasificacion" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <List className="h-5 w-5 text-primary" />
                    Clasificación General
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    {sortedResults.length} clasificados
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[60px] text-center">Puesto</TableHead>
                        <TableHead className="w-[70px] text-center">Dorsal</TableHead>
                        <TableHead className="min-w-[180px]">Nombre</TableHead>
                        <TableHead className="min-w-[120px]">Club</TableHead>
                        <TableHead className="text-center">Categoría</TableHead>
                        <TableHead className="text-center w-[50px]">Cat.</TableHead>
                        <TableHead className="text-center">Género</TableHead>
                        <TableHead className="text-center w-[50px]">Gén.</TableHead>
                        {filteredCheckpoints.filter(c => c.checkpoint_type !== 'META').map(cp => (
                          <TableHead key={cp.id} className="text-center min-w-[100px]">
                            <div className="text-xs">
                              <div className="font-medium">{cp.name}</div>
                              <div className="text-muted-foreground">{cp.distance_km}km</div>
                            </div>
                          </TableHead>
                        ))}
                        <TableHead className="text-center min-w-[90px] font-bold">Tiempo</TableHead>
                        <TableHead className="text-center min-w-[80px]">GAP</TableHead>
                        <TableHead className="text-center min-w-[70px]">
                          {race.race_type === 'mtb' ? 'Vel. Media' : 'Ritmo'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedResults.length > 0 ? paginatedResults.map((result) => (
                        <TableRow 
                          key={result.id}
                          className={newResultIds.has(result.id) ? "bg-primary/10 animate-pulse" : ""}
                        >
                          <TableCell className="text-center font-bold">
                            {result.overall_position === 1 && <Trophy className="inline h-4 w-4 text-yellow-500 mr-1" />}
                            {result.overall_position === 2 && <Medal className="inline h-4 w-4 text-gray-400 mr-1" />}
                            {result.overall_position === 3 && <Award className="inline h-4 w-4 text-amber-600 mr-1" />}
                            {result.overall_position}
                          </TableCell>
                          <TableCell className="text-center font-mono">{result.registration.bib_number}</TableCell>
                          <TableCell className="font-medium">{getRunnerName(result)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{getClub(result) || '-'}</TableCell>
                          <TableCell className="text-center text-sm">{getCategory(result)}</TableCell>
                          <TableCell className="text-center font-mono text-sm text-primary">{result.category_position || '-'}</TableCell>
                          <TableCell className="text-center text-sm">{getGender(result)}</TableCell>
                          <TableCell className="text-center font-mono text-sm text-primary">{result.gender_position || '-'}</TableCell>
                          {filteredCheckpoints.filter(c => c.checkpoint_type !== 'META').map(cp => (
                            <TableCell key={cp.id} className="text-center font-mono text-sm">
                              {getSplitTime(result, cp.checkpoint_order) || '-'}
                            </TableCell>
                          ))}
                          <TableCell className="text-center font-mono font-bold text-primary">
                            {formatTime(result.finish_time)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm text-muted-foreground">
                            {calculateGap(result.finish_time, leaderTime)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {race.race_type === 'mtb' 
                              ? `${calculateSpeed(result.finish_time, result.registration.race_distances.distance_km)} km/h`
                              : `${calculatePace(result.finish_time, result.registration.race_distances.distance_km)}/km`
                            }
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={10 + filteredCheckpoints.filter(c => c.checkpoint_type !== 'META').length} className="text-center py-12 text-muted-foreground">
                            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p>Aún no hay finalizados</p>
                            <p className="text-sm">Los resultados aparecerán aquí en tiempo real</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedResults.length)} de {sortedResults.length}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-1 px-2">
                        <Input
                          type="number"
                          min={1}
                          max={totalPages}
                          value={currentPage}
                          onChange={(e) => {
                            const page = parseInt(e.target.value);
                            if (page >= 1 && page <= totalPages) {
                              setCurrentPage(page);
                            }
                          }}
                          className="w-14 h-8 text-center"
                        />
                        <span className="text-sm text-muted-foreground">de {totalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Podium Tab */}
          <TabsContent value="podium" className="space-y-6">
            {podiumResults.length >= 3 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Second place */}
                <div className="md:order-1 md:mt-8">
                  <ResultCard
                    position={podiumResults[1]?.overall_position || null}
                    bibNumber={podiumResults[1]?.registration.bib_number || null}
                    runnerName={getRunnerName(podiumResults[1])}
                    distanceName={podiumResults[1]?.registration.race_distances.name}
                    finishTime={formatTime(podiumResults[1]?.finish_time)}
                    pace={calculatePace(podiumResults[1]?.finish_time, podiumResults[1]?.registration.race_distances.distance_km)}
                    photoUrl={podiumResults[1]?.photo_url}
                    isNew={newResultIds.has(podiumResults[1]?.id)}
                    variant="podium"
                  />
                </div>
                {/* First place */}
                <div className="md:order-2">
                  <ResultCard
                    position={podiumResults[0]?.overall_position || null}
                    bibNumber={podiumResults[0]?.registration.bib_number || null}
                    runnerName={getRunnerName(podiumResults[0])}
                    distanceName={podiumResults[0]?.registration.race_distances.name}
                    finishTime={formatTime(podiumResults[0]?.finish_time)}
                    pace={calculatePace(podiumResults[0]?.finish_time, podiumResults[0]?.registration.race_distances.distance_km)}
                    photoUrl={podiumResults[0]?.photo_url}
                    isNew={newResultIds.has(podiumResults[0]?.id)}
                    variant="podium"
                  />
                </div>
                {/* Third place */}
                <div className="md:order-3 md:mt-12">
                  <ResultCard
                    position={podiumResults[2]?.overall_position || null}
                    bibNumber={podiumResults[2]?.registration.bib_number || null}
                    runnerName={getRunnerName(podiumResults[2])}
                    distanceName={podiumResults[2]?.registration.race_distances.name}
                    finishTime={formatTime(podiumResults[2]?.finish_time)}
                    pace={calculatePace(podiumResults[2]?.finish_time, podiumResults[2]?.registration.race_distances.distance_km)}
                    photoUrl={podiumResults[2]?.photo_url}
                    isNew={newResultIds.has(podiumResults[2]?.id)}
                    variant="podium"
                  />
                </div>
              </div>
            ) : podiumResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {podiumResults.map((result, idx) => (
                  <ResultCard
                    key={result.id}
                    position={result.overall_position}
                    bibNumber={result.registration.bib_number}
                    runnerName={getRunnerName(result)}
                    distanceName={result.registration.race_distances.name}
                    finishTime={formatTime(result.finish_time)}
                    pace={calculatePace(result.finish_time, result.registration.race_distances.distance_km)}
                    photoUrl={result.photo_url}
                    isNew={newResultIds.has(result.id)}
                    variant="podium"
                  />
                ))}
              </div>
            ) : (
              <Card className="py-12">
                <CardContent className="text-center text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>Aún no hay finalizados para el pódium</p>
                  <p className="text-sm">Los ganadores aparecerán aquí en tiempo real</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Speaker Tab - Last 20 finishers in reverse order */}
          <TabsContent value="speaker">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mic className="h-5 w-5 text-primary" />
                  Últimas Llegadas (Speaker)
                  <Badge variant="outline" className="ml-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse mr-1" />
                    En vivo
                  </Badge>
                </CardTitle>
                <Select value={speakerCheckpoint} onValueChange={setSpeakerCheckpoint}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Punto de control" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Meta (Finalizados)</SelectItem>
                    {filteredCheckpoints.map(cp => (
                      <SelectItem key={cp.id} value={cp.id}>
                        {cp.name} ({cp.distance_km}km)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[60px] text-center">Puesto</TableHead>
                        <TableHead className="w-[70px] text-center">Dorsal</TableHead>
                        <TableHead className="min-w-[180px]">Nombre</TableHead>
                        <TableHead className="min-w-[120px]">Club</TableHead>
                        <TableHead className="text-center">Categoría</TableHead>
                        <TableHead className="text-center min-w-[90px] font-bold">Tiempo</TableHead>
                        <TableHead className="text-center min-w-[70px]">
                          {race.race_type === 'mtb' ? 'Vel. Media' : 'Ritmo'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {speakerResults.length > 0 ? speakerResults.map((result, idx) => {
                        const isSplitResult = 'splitTime' in result;
                        const displayTime = isSplitResult ? (result as any).splitTime : result.finish_time;
                        const distanceKm = isSplitResult 
                          ? (checkpoints.find(c => c.id === speakerCheckpoint)?.distance_km || result.registration.race_distances.distance_km)
                          : result.registration.race_distances.distance_km;
                        
                        return (
                          <TableRow 
                            key={result.id}
                            className={`${newResultIds.has(result.id) ? "bg-primary/10 animate-pulse" : ""} ${idx === 0 ? "bg-green-500/10" : ""}`}
                          >
                            <TableCell className="text-center font-bold">
                              {result.overall_position === 1 && <Trophy className="inline h-4 w-4 text-yellow-500 mr-1" />}
                              {result.overall_position === 2 && <Medal className="inline h-4 w-4 text-gray-400 mr-1" />}
                              {result.overall_position === 3 && <Award className="inline h-4 w-4 text-amber-600 mr-1" />}
                              {result.overall_position}
                            </TableCell>
                            <TableCell className="text-center font-mono">{result.registration.bib_number}</TableCell>
                            <TableCell className="font-medium">{getRunnerName(result)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{getClub(result) || '-'}</TableCell>
                            <TableCell className="text-center text-sm">{getCategory(result)}</TableCell>
                            <TableCell className="text-center font-mono font-bold text-primary">
                              {formatTime(displayTime)}
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm">
                              {race.race_type === 'mtb' 
                                ? `${calculateSpeed(displayTime, distanceKm)} km/h`
                                : `${calculatePace(displayTime, distanceKm)}/km`
                              }
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                            <Mic className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p>No hay llegadas recientes</p>
                            <p className="text-sm">Las nuevas llegadas aparecerán aquí automáticamente</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pasos Intermedios Tab - Classification by checkpoint */}
          <TabsContent value="intermedios">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5 text-primary" />
                  Clasificación por Punto de Control
                  <Badge variant="outline" className="ml-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse mr-1" />
                    En vivo
                  </Badge>
                </CardTitle>
                <Select value={intermediosCheckpoint} onValueChange={(v) => { setIntermediosCheckpoint(v); setIntermediosPage(1); }}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Seleccionar checkpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Seleccionar punto...</SelectItem>
                    {filteredCheckpoints.map(cp => (
                      <SelectItem key={cp.id} value={cp.id}>
                        {cp.name} ({cp.distance_km}km)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                {intermediosCheckpoint === "all" ? (
                  <>
                    {/* Checkpoint selector cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                      {filteredCheckpoints.map((cp, idx) => {
                        const splitCount = sortedResults.filter(r => 
                          r.split_times?.some(s => s.checkpoint_order === cp.checkpoint_order)
                        ).length;
                        
                        return (
                          <button 
                            key={cp.id} 
                            onClick={() => setIntermediosCheckpoint(cp.id)}
                            className="group relative border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-all text-left"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                cp.checkpoint_type === 'META' ? 'bg-red-500 text-white' : 'bg-primary text-primary-foreground'
                              }`}>
                                {idx + 1}
                              </div>
                              <span className="font-semibold group-hover:text-primary transition-colors truncate">
                                {cp.name}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {cp.distance_km} km
                            </div>
                            {splitCount > 0 && (
                              <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
                                {splitCount}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    
                    <div className="text-center py-8 text-muted-foreground">
                      <MapPin className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>Selecciona un punto de control para ver la clasificación</p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Selected checkpoint info */}
                    {(() => {
                      const selectedCp = checkpoints.find(c => c.id === intermediosCheckpoint);
                      return selectedCp && (
                        <div className="flex items-center gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            selectedCp.checkpoint_type === 'META' ? 'bg-red-500 text-white' : 'bg-primary text-primary-foreground'
                          }`}>
                            {selectedCp.checkpoint_order}
                          </div>
                          <div>
                            <div className="font-semibold">{selectedCp.name}</div>
                            <div className="text-sm text-muted-foreground">{selectedCp.distance_km} km</div>
                          </div>
                          <Badge variant="secondary" className="ml-auto">
                            {intermediosResults.length} clasificados
                          </Badge>
                        </div>
                      );
                    })()}
                    
                    {/* Classification table */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[60px] text-center">Puesto</TableHead>
                            <TableHead className="w-[70px] text-center">Dorsal</TableHead>
                            <TableHead className="min-w-[180px]">Nombre</TableHead>
                            <TableHead className="min-w-[120px]">Club</TableHead>
                            <TableHead className="text-center">Categoría</TableHead>
                            <TableHead className="text-center min-w-[90px] font-bold">Tiempo Split</TableHead>
                            <TableHead className="text-center min-w-[70px]">
                              {race.race_type === 'mtb' ? 'Vel. Media' : 'Ritmo'}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedIntermediosResults.length > 0 ? paginatedIntermediosResults.map((result, idx) => {
                            const splitPosition = (intermediosPage - 1) * ITEMS_PER_PAGE + idx + 1;
                            const checkpoint = checkpoints.find(c => c.id === intermediosCheckpoint);
                            const distanceKm = checkpoint?.distance_km || 0;
                            
                            return (
                              <TableRow 
                                key={result.id}
                                className={newResultIds.has(result.id) ? "bg-primary/10 animate-pulse" : ""}
                              >
                                <TableCell className="text-center font-bold">
                                  {splitPosition === 1 && <Trophy className="inline h-4 w-4 text-yellow-500 mr-1" />}
                                  {splitPosition === 2 && <Medal className="inline h-4 w-4 text-gray-400 mr-1" />}
                                  {splitPosition === 3 && <Award className="inline h-4 w-4 text-amber-600 mr-1" />}
                                  {splitPosition}
                                </TableCell>
                                <TableCell className="text-center font-mono">{result.registration.bib_number}</TableCell>
                                <TableCell className="font-medium">{getRunnerName(result)}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">{getClub(result) || '-'}</TableCell>
                                <TableCell className="text-center text-sm">{getCategory(result)}</TableCell>
                                <TableCell className="text-center font-mono font-bold text-primary">
                                  {formatTime(result.splitTime)}
                                </TableCell>
                                <TableCell className="text-center font-mono text-sm">
                                  {race.race_type === 'mtb' 
                                    ? `${calculateSpeed(result.splitTime, distanceKm)} km/h`
                                    : `${calculatePace(result.splitTime, distanceKm)}/km`
                                  }
                                </TableCell>
                              </TableRow>
                            );
                          }) : (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                <MapPin className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p>No hay tiempos registrados en este punto</p>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Pagination for intermedios */}
                    {intermediosTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t mt-4">
                        <div className="text-sm text-muted-foreground">
                          Mostrando {((intermediosPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(intermediosPage * ITEMS_PER_PAGE, intermediosResults.length)} de {intermediosResults.length}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setIntermediosPage(1)}
                            disabled={intermediosPage === 1}
                          >
                            <ChevronsLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setIntermediosPage(p => Math.max(1, p - 1))}
                            disabled={intermediosPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <div className="px-3 text-sm">
                            {intermediosPage} de {intermediosTotalPages}
                          </div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setIntermediosPage(p => Math.min(intermediosTotalPages, p + 1))}
                            disabled={intermediosPage === intermediosTotalPages}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setIntermediosPage(intermediosTotalPages)}
                            disabled={intermediosPage === intermediosTotalPages}
                          >
                            <ChevronsRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
