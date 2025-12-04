import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Trophy, Medal, Award, Activity, MapPin, Timer, Satellite, Radio } from "lucide-react";
import { toast } from "sonner";

interface RaceResult {
  id: string;
  finish_time: any;
  overall_position: number | null;
  category_position: number | null;
  status: string;
  photo_url: string | null;
  registration: {
    bib_number: number | null;
    user_id: string;
    profiles: {
      first_name: string | null;
      last_name: string | null;
    };
    race_distances: {
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
    race_distances: {
      name: string;
    };
  } | null;
}

export default function LiveResults() {
  const { id } = useParams();
  const [race, setRace] = useState<Race | null>(null);
  const [topResults, setTopResults] = useState<RaceResult[]>([]);
  const [recentFinishers, setRecentFinishers] = useState<RaceResult[]>([]);
  const [recentReadings, setRecentReadings] = useState<TimingReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [newResultIds, setNewResultIds] = useState<Set<string>>(new Set());
  const [newReadingIds, setNewReadingIds] = useState<Set<string>>(new Set());

  const fetchRaceData = async () => {
    if (!id) return;

    try {
      // Fetch race details
      const { data: raceData, error: raceError } = await supabase
        .from("races")
        .select("*")
        .eq("id", id)
        .single();

      if (raceError) throw raceError;
      setRace(raceData);

      // Fetch top 10 results
      const { data: topData, error: topError } = await supabase
        .from("race_results")
        .select(`
          id,
          finish_time,
          overall_position,
          category_position,
          status,
          photo_url,
          registration:registrations!inner (
            bib_number,
            user_id,
            race_distances!inner (
              name,
              distance_km
            )
          )
        `)
        .eq("registration.race_id", id)
        .eq("status", "finished")
        .not("overall_position", "is", null)
        .order("overall_position", { ascending: true })
        .limit(10);

      if (topError) throw topError;
      
      // Fetch profiles for top results
      if (topData && topData.length > 0) {
        const userIds = topData.map((r: any) => r.registration.user_id);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        
        const profilesMap = new Map(profilesData?.map((p: any) => [p.id, p]));
        const enrichedTopData = topData.map((r: any) => ({
          ...r,
          registration: {
            ...r.registration,
            profiles: profilesMap.get(r.registration.user_id) || { first_name: "", last_name: "" }
          }
        }));
        setTopResults(enrichedTopData);
      } else {
        setTopResults([]);
      }

      // Fetch recent 10 finishers
      const { data: recentData, error: recentError } = await supabase
        .from("race_results")
        .select(`
          id,
          finish_time,
          overall_position,
          category_position,
          status,
          photo_url,
          registration:registrations!inner (
            bib_number,
            user_id,
            race_distances!inner (
              name,
              distance_km
            )
          )
        `)
        .eq("registration.race_id", id)
        .eq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(10);

      if (recentError) throw recentError;
      
      // Fetch profiles for recent finishers
      if (recentData && recentData.length > 0) {
        const userIds = recentData.map((r: any) => r.registration.user_id);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        
        const profilesMap = new Map(profilesData?.map((p: any) => [p.id, p]));
        const enrichedRecentData = recentData.map((r: any) => ({
          ...r,
          registration: {
            ...r.registration,
            profiles: profilesMap.get(r.registration.user_id) || { first_name: "", last_name: "" }
          }
        }));
        setRecentFinishers(enrichedRecentData);
      } else {
        setRecentFinishers([]);
      }

      // Fetch recent timing readings (checkpoint passes)
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
            user_id
          )
        `)
        .eq("race_id", id)
        .is("status_code", null)
        .order("timing_timestamp", { ascending: false })
        .limit(15);

      if (!readingsError && readingsData) {
        // Fetch profiles for readings
        const userIds = readingsData
          .map((r: any) => r.registration?.user_id)
          .filter(Boolean);
        
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
          // Format readings without profiles
          const formattedReadings = readingsData.map((r: any) => ({
            ...r,
            registration: r.registration ? {
              ...r.registration,
              profiles: null
            } : null
          }));
          setRecentReadings(formattedReadings as TimingReading[]);
        }
      }
    } catch (error) {
      console.error("Error fetching race data:", error);
      toast.error("Failed to load race results");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRaceData();

    // Set up realtime subscription for race_results
    const resultsChannel = supabase
      .channel("race_results_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "race_results",
        },
        (payload) => {
          console.log("Race result update:", payload);
          
          // Mark new result for animation
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            const resultId = payload.new.id as string;
            setNewResultIds((prev) => new Set(prev).add(resultId));
            setTimeout(() => {
              setNewResultIds((prev) => {
                const updated = new Set(prev);
                updated.delete(resultId);
                return updated;
              });
            }, 2000);
          }

          // Refresh data
          fetchRaceData();
        }
      )
      .subscribe();

    // Set up realtime subscription for timing_readings
    const readingsChannel = supabase
      .channel("timing_readings_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "timing_readings",
        },
        (payload) => {
          console.log("Timing reading update:", payload);
          
          // Mark new reading for animation
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            const readingId = payload.new.id as string;
            setNewReadingIds((prev) => new Set(prev).add(readingId));
            setTimeout(() => {
              setNewReadingIds((prev) => {
                const updated = new Set(prev);
                updated.delete(readingId);
                return updated;
              });
            }, 3000);
          }

          // Refresh data
          fetchRaceData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(resultsChannel);
      supabase.removeChannel(readingsChannel);
    };
  }, [id]);

  const formatTime = (timeString: string): string => {
    if (!timeString) return "00:00:00";
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}:${match[2]}:${match[3]}`;
    }
    return timeString;
  };

  const calculatePace = (timeString: string, distanceKm: number): string => {
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match || distanceKm === 0) return "--:--";
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const totalMinutes = hours * 60 + minutes + seconds / 60;
    const paceMinutes = Math.floor(totalMinutes / distanceKm);
    const paceSeconds = Math.round(((totalMinutes / distanceKm) % 1) * 60);
    return `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")}`;
  };

  const getPositionIcon = (position: number | null) => {
    if (!position) return null;
    if (position === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (position === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (position === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading live results...</p>
        </div>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Race not found</p>
          <Button asChild className="mt-4">
            <Link to="/races">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Races
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button asChild variant="ghost" className="mb-4">
            <Link to={`/race/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Race
            </Link>
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-8 w-8 text-primary animate-pulse" />
            <h1 className="text-4xl font-bold">{race.name} - Live Results</h1>
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live updates enabled
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 10 Rankings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Top 10 Overall
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topResults.map((result) => (
                  <div
                    key={result.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition-all duration-500 ${
                      newResultIds.has(result.id)
                        ? "animate-scale-in border-primary shadow-lg"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted font-bold text-lg">
                      {getPositionIcon(result.overall_position) || result.overall_position}
                    </div>
                    
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={result.photo_url || undefined} />
                      <AvatarFallback>
                        {result.registration.profiles.first_name?.[0]}
                        {result.registration.profiles.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {result.registration.profiles.first_name}{" "}
                        {result.registration.profiles.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Bib #{result.registration.bib_number} • {result.registration.race_distances.name}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-bold text-lg">
                        {formatTime(result.finish_time)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {calculatePace(
                          result.finish_time,
                          result.registration.race_distances.distance_km
                        )}{" "}
                        /km
                      </p>
                    </div>
                  </div>
                ))}
                
                {topResults.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No finishers yet. Results will appear here as participants finish.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Finishers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Recent Finishers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentFinishers.map((result, index) => (
                  <div
                    key={result.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition-all duration-500 ${
                      newResultIds.has(result.id)
                        ? "animate-fade-in border-primary shadow-lg"
                        : ""
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={result.photo_url || undefined} />
                      <AvatarFallback>
                        {result.registration.profiles.first_name?.[0]}
                        {result.registration.profiles.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">
                          {result.registration.profiles.first_name}{" "}
                          {result.registration.profiles.last_name}
                        </p>
                        {index === 0 && newResultIds.has(result.id) && (
                          <Badge variant="default" className="animate-pulse">
                            NEW
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Bib #{result.registration.bib_number} • {result.registration.race_distances.name}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-bold">
                        {formatTime(result.finish_time)}
                      </p>
                      {result.overall_position && (
                        <p className="text-sm text-muted-foreground">
                          Position: {result.overall_position}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                
                {recentFinishers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No recent finishers. Check back soon!
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Checkpoint Passes */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Pasos por Checkpoints
              <Badge variant="outline" className="ml-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse mr-1" />
                En vivo
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentReadings.map((reading, index) => (
                <div
                  key={reading.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-all duration-500 ${
                    newReadingIds.has(reading.id)
                      ? "animate-fade-in border-primary shadow-lg"
                      : ""
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Reading type icon */}
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    reading.reading_type === 'gps_auto' 
                      ? 'bg-blue-500/20 text-blue-500' 
                      : reading.reading_type === 'automatic'
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-orange-500/20 text-orange-500'
                  }`}>
                    {reading.reading_type === 'gps_auto' ? (
                      <Satellite className="h-5 w-5" />
                    ) : reading.reading_type === 'automatic' ? (
                      <Radio className="h-5 w-5" />
                    ) : (
                      <Timer className="h-5 w-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        #{reading.bib_number}
                      </Badge>
                      {reading.reading_type === 'gps_auto' && (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
                          GPS
                        </Badge>
                      )}
                      {newReadingIds.has(reading.id) && (
                        <Badge variant="default" className="animate-pulse text-xs">
                          NEW
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm truncate">
                      {reading.registration?.profiles?.first_name || ''} {reading.registration?.profiles?.last_name || ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reading.checkpoint?.name || 'Checkpoint'} • {reading.checkpoint?.distance_km?.toFixed(1) || '?'}km
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold">
                      {new Date(reading.timing_timestamp).toLocaleTimeString('es-ES', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reading.registration?.race_distances?.name || ''}
                    </p>
                  </div>
                </div>
              ))}
              
              {recentReadings.length === 0 && (
                <p className="col-span-full text-center text-muted-foreground py-8">
                  No hay pasos registrados aún. Los tiempos aparecerán aquí en tiempo real.
                </p>
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Satellite className="h-2 w-2 text-blue-500" />
                </div>
                <span>GPS Automático</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Radio className="h-2 w-2 text-green-500" />
                </div>
                <span>Chip RFID</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Timer className="h-2 w-2 text-orange-500" />
                </div>
                <span>Manual</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
