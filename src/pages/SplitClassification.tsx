import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  ArrowLeft, Trophy, Medal, Award, MapPin, Timer, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Youtube
} from "lucide-react";
import { ShareResultsButton } from "@/components/results/ShareResultsButton";
import { YouTubeVideoModal } from "@/components/YouTubeVideoModal";

interface SplitResult {
  id: string;
  split_time: string;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  pace: string | null;
  checkpoint_name: string;
  distance_km: number;
  lap_number: number | null;
  race_result: {
    registration: {
      bib_number: number | null;
      user_id: string | null;
      first_name: string | null;
      last_name: string | null;
      category: string | null;
      race_category: {
        id: string;
        name: string;
        short_name: string | null;
      } | null;
      profiles: {
        first_name: string | null;
        last_name: string | null;
        gender: string | null;
        club: string | null;
        team: string | null;
        birth_date: string | null;
      } | null;
      race_distances: {
        id: string;
        name: string;
        distance_km: number;
      };
    };
  };
}

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
  logo_url: string | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface RaceWave {
  id: string;
  race_distance_id: string;
  start_time: string | null;
}

interface RaceCheckpoint {
  id: string;
  name: string;
  distance_km: number;
  checkpoint_order: number;
  checkpoint_type: string;
  race_distance_id: string | null;
  youtube_video_id: string | null;
  youtube_video_start_time: string | null;
  youtube_seconds_before: number | null;
  youtube_seconds_after: number | null;
  youtube_error_text: string | null;
  youtube_enabled: boolean | null;
}

type ClassificationType = "general" | "gender" | "category";

const ITEMS_PER_PAGE = 50;

export default function SplitClassification() {
  const { id, slug, checkpointOrder } = useParams();
  const navigate = useNavigate();
  const [raceId, setRaceId] = useState<string | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [waves, setWaves] = useState<RaceWave[]>([]);
  const [checkpoints, setCheckpoints] = useState<RaceCheckpoint[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>("all");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string>("");
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationType, setClassificationType] = useState<ClassificationType>("general");
  const [currentPage, setCurrentPage] = useState(1);
  
  // YouTube modal state
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [youtubeVideoData, setYoutubeVideoData] = useState<{
    videoId: string;
    startSeconds: number;
    runnerName: string;
    checkpointName: string;
    formattedTime: string;
    errorText: string;
  } | null>(null);

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
          .maybeSingle();

        if (data && !error) {
          setRaceId(data.id);
        } else {
          navigate("/404", { replace: true });
        }
      }
    };

    resolveRaceId();
  }, [id, slug, navigate]);

  // Fetch race data
  useEffect(() => {
    const fetchData = async () => {
      if (!raceId) return;

      try {
        const [raceRes, distancesRes, checkpointsRes, wavesRes] = await Promise.all([
          supabase.from("races").select("id, name, date, location, logo_url").eq("id", raceId).single(),
          supabase.from("race_distances").select("id, name, distance_km").eq("race_id", raceId).eq("is_visible", true).order("distance_km"),
          supabase.from("race_checkpoints").select("id, name, distance_km, checkpoint_order, checkpoint_type, race_distance_id, youtube_video_id, youtube_video_start_time, youtube_seconds_before, youtube_seconds_after, youtube_error_text, youtube_enabled").eq("race_id", raceId).order("checkpoint_order"),
          supabase.from("race_waves").select("id, race_distance_id, start_time").eq("race_id", raceId)
        ]);

        if (raceRes.error) throw raceRes.error;
        setRace(raceRes.data);
        setDistances(distancesRes.data || []);
        setCheckpoints(checkpointsRes.data || []);
        setWaves(wavesRes.data || []);

        // Set initial checkpoint from URL param
        if (checkpointOrder && checkpointsRes.data) {
          const cp = checkpointsRes.data.find(c => c.checkpoint_order === parseInt(checkpointOrder));
          if (cp) {
            setSelectedCheckpoint(checkpointOrder);
          } else if (checkpointsRes.data.length > 0) {
            setSelectedCheckpoint(checkpointsRes.data[0].checkpoint_order.toString());
          }
        } else if (checkpointsRes.data && checkpointsRes.data.length > 0) {
          setSelectedCheckpoint(checkpointsRes.data[0].checkpoint_order.toString());
        }

        if (distancesRes.data?.length === 1) {
          setSelectedDistance(distancesRes.data[0].id);
        }
      } catch (error) {
        console.error("Error fetching race data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [raceId, checkpointOrder]);

  // Fetch split times for selected checkpoint
  useEffect(() => {
    const fetchSplitTimes = async () => {
      if (!raceId || !selectedCheckpoint) return;

      try {
        const distanceIds = selectedDistance === "all" 
          ? distances.map(d => d.id) 
          : [selectedDistance];

        if (distanceIds.length === 0) return;

        const { data, error } = await supabase
          .from("split_times")
          .select(`
            id,
            split_time,
            overall_position,
            gender_position,
            category_position,
            pace,
            checkpoint_name,
            distance_km,
            lap_number,
            race_result_id
          `)
          .eq("checkpoint_order", parseInt(selectedCheckpoint))
          .order("split_time", { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          const resultIds = data.map(s => s.race_result_id);
          
          const { data: resultsData, error: resultsError } = await supabase
            .from("race_results")
            .select(`
              id,
              race_distance_id,
              registration:registrations!inner(
                bib_number,
                user_id,
                first_name,
                last_name,
                category,
                race_category:race_categories(id, name, short_name),
                race_distances!inner(id, name, distance_km)
              )
            `)
            .in("id", resultIds)
            .in("race_distance_id", distanceIds);

          if (resultsError) throw resultsError;

          const userIds = resultsData?.map(r => r.registration?.user_id).filter(Boolean) || [];
          
          let profilesMap = new Map();
          if (userIds.length > 0) {
            const { data: profilesData } = await supabase
              .from("profiles")
              .select("id, first_name, last_name, gender, club, team, birth_date")
              .in("id", userIds);
            profilesMap = new Map(profilesData?.map(p => [p.id, p]));
          }

          const resultsMap = new Map(resultsData?.map(r => [
            r.id, 
            {
              ...r,
              registration: {
                ...r.registration,
                profiles: r.registration?.user_id ? profilesMap.get(r.registration.user_id) || null : null
              }
            }
          ]));

          const enrichedSplits = data
            .filter(s => resultsMap.has(s.race_result_id))
            .map(s => ({
              ...s,
              race_result: resultsMap.get(s.race_result_id)
            })) as SplitResult[];

          setSplitResults(enrichedSplits);
        } else {
          setSplitResults([]);
        }
      } catch (error) {
        console.error("Error fetching split times:", error);
        setSplitResults([]);
      }
    };

    fetchSplitTimes();
  }, [raceId, selectedCheckpoint, selectedDistance, distances]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let results = splitResults.filter(result => {
      if (!searchQuery.trim()) return true;
      
      const firstName = result.race_result?.registration?.profiles?.first_name || result.race_result?.registration?.first_name || "";
      const lastName = result.race_result?.registration?.profiles?.last_name || result.race_result?.registration?.last_name || "";
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const bibNumber = result.race_result?.registration?.bib_number?.toString() || "";
      
      return fullName.includes(searchQuery.toLowerCase()) || bibNumber.includes(searchQuery);
    });

    // Sort based on classification type
    if (classificationType === "gender") {
      results = [...results].sort((a, b) => (a.gender_position || 999) - (b.gender_position || 999));
    } else if (classificationType === "category") {
      results = [...results].sort((a, b) => (a.category_position || 999) - (b.category_position || 999));
    } else {
      results = [...results].sort((a, b) => (a.overall_position || 999) - (b.overall_position || 999));
    }

    return results;
  }, [splitResults, searchQuery, classificationType]);

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredResults.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredResults, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDistance, selectedCheckpoint, searchQuery, classificationType]);

  const formatTime = (timeString: string): string => {
    if (!timeString) return "--:--:--";
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : timeString;
  };

  const getRunnerName = (result: SplitResult) => {
    const firstName = result.race_result?.registration?.profiles?.first_name || result.race_result?.registration?.first_name || "";
    const lastName = result.race_result?.registration?.profiles?.last_name || result.race_result?.registration?.last_name || "";
    return `${firstName} ${lastName}`.trim() || `Dorsal #${result.race_result?.registration?.bib_number}`;
  };

  const getClub = (result: SplitResult) => {
    return result.race_result?.registration?.profiles?.club || result.race_result?.registration?.profiles?.team || "";
  };

  const getCategory = (result: SplitResult) => {
    // First priority: race_category FK (new system)
    if (result.race_result?.registration?.race_category?.name) {
      return result.race_result.registration.race_category.short_name || 
             result.race_result.registration.race_category.name;
    }
    
    // Second priority: category text field (legacy)
    if (result.race_result?.registration?.category) {
      return result.race_result.registration.category;
    }
    
    // Fallback: calculate from birth_date/gender
    const gender = result.race_result?.registration?.profiles?.gender;
    const birthDate = result.race_result?.registration?.profiles?.birth_date;
    if (!birthDate || !gender) return "-";
    
    const raceDate = race?.date ? new Date(race.date) : new Date();
    const birth = new Date(birthDate);
    const age = Math.floor((raceDate.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    
    const genderPrefix = gender === 'M' || gender === 'Masculino' ? 'M' : 'F';
    if (age < 20) return `${genderPrefix}-JUN`;
    if (age < 35) return `${genderPrefix}-SEN`;
    if (age < 45) return `${genderPrefix}-VA`;
    if (age < 55) return `${genderPrefix}-VB`;
    if (age < 65) return `${genderPrefix}-VC`;
    return `${genderPrefix}-VD`;
  };

  const getGender = (result: SplitResult) => {
    const g = result.race_result?.registration?.profiles?.gender;
    if (g === 'Masculino' || g === 'M') return 'H';
    if (g === 'Femenino' || g === 'F') return 'M';
    return '-';
  };

  const getPositionBadge = (position: number | null) => {
    if (!position) return null;
    if (position === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (position === 2) return <Medal className="h-4 w-4 text-gray-400" />;
    if (position === 3) return <Award className="h-4 w-4 text-amber-600" />;
    return null;
  };

  // Calculate YouTube video timestamp from split time and checkpoint config
  const handleYoutubeClick = (
    checkpoint: RaceCheckpoint,
    splitTimeStr: string,
    runnerName: string
  ) => {
    if (!checkpoint.youtube_video_id || !checkpoint.youtube_video_start_time) {
      return;
    }

    // Parse the split time to get total seconds from race start
    const splitMatch = splitTimeStr.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!splitMatch) {
      return;
    }
    const splitSeconds = parseInt(splitMatch[1]) * 3600 + parseInt(splitMatch[2]) * 60 + parseInt(splitMatch[3]);

    // Get wave start time for this race distance
    const wave = waves.find(w => w.race_distance_id === checkpoint.race_distance_id);
    if (!wave?.start_time) {
      return;
    }
    const waveStartTime = new Date(wave.start_time);
    
    // Parse video start time (real-world wall-clock time)
    const videoStartTime = new Date(checkpoint.youtube_video_start_time);
    
    // The crossing time in the real world: wave start + split time
    const crossingTime = new Date(waveStartTime.getTime() + splitSeconds * 1000);
    
    // Difference between crossing time and video start time
    const diffMs = crossingTime.getTime() - videoStartTime.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    // Apply the seconds_before offset
    const secondsBefore = checkpoint.youtube_seconds_before || 5;
    const startSeconds = Math.max(0, diffSeconds - secondsBefore);
    
    // Validate that the crossing time is after the video start time
    if (diffSeconds < 0) {
      return;
    }

    setYoutubeVideoData({
      videoId: checkpoint.youtube_video_id,
      startSeconds,
      runnerName,
      checkpointName: checkpoint.name,
      formattedTime: splitTimeStr,
      errorText: checkpoint.youtube_error_text || "Video no disponible"
    });
    setYoutubeModalOpen(true);
  };

  const currentCheckpoint = checkpoints.find(cp => cp.checkpoint_order === parseInt(selectedCheckpoint));
  const raceSlug = slug || id;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Timer className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!race) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <MapPin className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Carrera no encontrada</h1>
        <Button asChild><Link to="/races">Ver carreras</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/${raceSlug}/live`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            {race.logo_url && (
              <img src={race.logo_url} alt={race.name} className="h-12 w-12 object-contain rounded" />
            )}
            <div>
              <h1 className="text-xl font-bold">{race.name}</h1>
              <p className="text-sm text-muted-foreground">
                Clasificación en {currentCheckpoint?.name || 'Punto de Control'}
              </p>
            </div>
          </div>

          {/* Checkpoint Selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {checkpoints.map(cp => (
              <Button
                key={cp.id}
                variant={selectedCheckpoint === cp.checkpoint_order.toString() ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCheckpoint(cp.checkpoint_order.toString())}
              >
                {cp.name} ({cp.distance_km}km)
              </Button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={selectedDistance} onValueChange={setSelectedDistance}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Distancia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las distancias</SelectItem>
                {distances.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classificationType} onValueChange={(v: ClassificationType) => setClassificationType(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="gender">Por Género</SelectItem>
                <SelectItem value="category">Por Categoría</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o dorsal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <ShareResultsButton raceName={race.name} raceId={raceId || ""} />
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                {currentCheckpoint?.name} - {currentCheckpoint?.distance_km}km
              </CardTitle>
              <Badge variant="secondary">{filteredResults.length} participantes</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {filteredResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Timer className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No hay tiempos registrados en este punto</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Pos</TableHead>
                        <TableHead className="w-20">Dorsal</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="hidden md:table-cell">Club</TableHead>
                        <TableHead className="w-16 text-center hidden sm:table-cell">Sex</TableHead>
                        <TableHead className="w-20 hidden sm:table-cell">Cat</TableHead>
                        <TableHead className="w-16 text-center hidden sm:table-cell">P.Cat</TableHead>
                        <TableHead className="w-24 text-right">Tiempo</TableHead>
                        <TableHead className="w-20 text-right hidden sm:table-cell">Ritmo</TableHead>
                        <TableHead className="w-12 text-center">Video</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedResults.map((result) => {
                        const position = classificationType === "general" 
                          ? result.overall_position 
                          : classificationType === "gender" 
                          ? result.gender_position 
                          : result.category_position;
                        
                        return (
                          <TableRow key={result.id}>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {getPositionBadge(position)}
                                <span className="font-mono font-semibold">{position || "-"}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono">
                                {result.race_result?.registration?.bib_number}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{getRunnerName(result)}</p>
                                <p className="text-xs text-muted-foreground md:hidden">
                                  {getClub(result)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">
                              {getClub(result) || "-"}
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                              {getGender(result)}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge variant="secondary" className="text-xs">
                                {getCategory(result)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell font-mono">
                              {result.category_position || "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatTime(result.split_time)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground hidden sm:table-cell">
                              {result.pace || "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              {currentCheckpoint?.youtube_enabled && currentCheckpoint?.youtube_video_id && currentCheckpoint?.youtube_video_start_time ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => currentCheckpoint && handleYoutubeClick(currentCheckpoint, result.split_time, getRunnerName(result))}
                                >
                                  <Youtube className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredResults.length)} de {filteredResults.length}
                    </p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="flex items-center px-3 text-sm">{currentPage} / {totalPages}</span>
                      <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* YouTube Video Modal */}
      <YouTubeVideoModal
        isOpen={youtubeModalOpen}
        onClose={() => setYoutubeModalOpen(false)}
        videoId={youtubeVideoData?.videoId || ""}
        startSeconds={youtubeVideoData?.startSeconds || 0}
        runnerName={youtubeVideoData?.runnerName}
        checkpointName={youtubeVideoData?.checkpointName}
        formattedTime={youtubeVideoData?.formattedTime}
        errorText={youtubeVideoData?.errorText}
      />
    </div>
  );
}
