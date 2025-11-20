import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SplitTimesDisplay from "@/components/SplitTimesDisplay";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Trophy, Medal, Award } from "lucide-react";

interface RaceResult {
  id: string;
  finish_time: string;
  overall_position: number | null;
  category_position: number | null;
  status: string;
  photo_url: string | null;
  registration: {
    bib_number: number | null;
    race_distance: {
      id: string;
      name: string;
      distance_km: number;
    };
    profiles: {
      first_name: string | null;
      last_name: string | null;
    };
  };
}

const RaceResults = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const [race, setRace] = useState<any>(null);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [distances, setDistances] = useState<any[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRaceData();
  }, [id]);

  const fetchRaceData = async () => {
    setLoading(true);
    try {
      // Fetch race info
      const { data: raceData, error: raceError } = await supabase
        .from("races")
        .select("*")
        .eq("id", id)
        .single();

      if (raceError) throw raceError;
      setRace(raceData);

      // Fetch distances
      const { data: distancesData, error: distancesError } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", id)
        .order("distance_km", { ascending: true });

      if (distancesError) throw distancesError;
      setDistances(distancesData || []);

      // Fetch results
      const { data: resultsData, error: resultsError } = await supabase
        .from("race_results")
        .select(`
          *,
          registration:registrations (
            bib_number,
            race_distance:race_distances (
              id,
              name,
              distance_km
            ),
            profiles (
              first_name,
              last_name
            )
          )
        `)
        .eq("registration.race_id", id)
        .eq("status", "finished")
        .order("overall_position", { ascending: true, nullsFirst: false });

      if (resultsError) throw resultsError;
      setResults(resultsData as any || []);
    } catch (error: any) {
      toast({
        title: "Error loading results",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeString: string): string => {
    const match = timeString.match(/(\d+):(\d+):(\d+)/);
    if (!match) return timeString;
    return `${match[1]}:${match[2]}:${match[3]}`;
  };

  const calculatePace = (timeString: string, distanceKm: number): string => {
    const match = timeString.match(/(\d+):(\d+):(\d+)/);
    if (!match) return "-";
    
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const totalMinutes = hours * 60 + minutes + seconds / 60;
    const paceMinutes = totalMinutes / distanceKm;
    const paceMin = Math.floor(paceMinutes);
    const paceSec = Math.round((paceMinutes - paceMin) * 60);
    
    return `${paceMin}:${paceSec.toString().padStart(2, '0')}/km`;
  };

  const getPositionBadge = (position: number | null) => {
    if (!position) return null;
    
    if (position === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (position === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (position === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return null;
  };

  const filteredResults = results.filter(result => {
    const matchesDistance = selectedDistance === "all" || result.registration.race_distance.id === selectedDistance;
    const search = searchTerm.toLowerCase();
    const bibNumber = result.registration.bib_number?.toString() || "";
    const firstName = result.registration.profiles?.first_name?.toLowerCase() || "";
    const lastName = result.registration.profiles?.last_name?.toLowerCase() || "";
    const matchesSearch = bibNumber.includes(search) || firstName.includes(search) || lastName.includes(search);
    
    return matchesDistance && matchesSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading results...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!race) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Race not found</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-24">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{race.name} - Results</h1>
          <p className="text-muted-foreground">
            {new Date(race.date).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Results</CardTitle>
            <CardDescription>Search by name or bib number, and filter by distance category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or bib number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={selectedDistance} onValueChange={setSelectedDistance}>
                <SelectTrigger>
                  <SelectValue placeholder="All distances" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Distances</SelectItem>
                  {distances.map(distance => (
                    <SelectItem key={distance.id} value={distance.id}>
                      {distance.name} ({distance.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {filteredResults.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Trophy className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Results Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || selectedDistance !== "all" 
                  ? "Try adjusting your filters" 
                  : "Results will appear here once they are published"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Race Results ({filteredResults.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Pos</TableHead>
                      <TableHead>Bib</TableHead>
                      <TableHead>Runner</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Pace</TableHead>
                      <TableHead>Cat Pos</TableHead>
                      <TableHead>Splits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => (
                      <>
                        <TableRow key={result.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getPositionBadge(result.overall_position)}
                              <span className="font-medium">{result.overall_position || "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">#{result.registration.bib_number}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={result.photo_url || undefined} />
                                <AvatarFallback>
                                  {result.registration.profiles?.first_name?.[0]}
                                  {result.registration.profiles?.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">
                                {result.registration.profiles?.first_name} {result.registration.profiles?.last_name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {result.registration.race_distance.name}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {formatTime(result.finish_time)}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {calculatePace(result.finish_time, result.registration.race_distance.distance_km)}
                          </TableCell>
                          <TableCell>
                            {result.category_position ? (
                              <Badge variant="outline">{result.category_position}</Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            <details className="cursor-pointer">
                              <summary className="text-sm text-primary hover:underline">
                                View Splits
                              </summary>
                            </details>
                          </TableCell>
                        </TableRow>
                        <TableRow key={`${result.id}-splits`} className="hover:bg-transparent">
                          <TableCell colSpan={8} className="p-0">
                            <details className="group">
                              <summary className="sr-only">Split Times</summary>
                              <div className="p-4 bg-muted/50">
                                <SplitTimesDisplay 
                                  raceResultId={result.id} 
                                  totalDistance={result.registration.race_distance.distance_km}
                                />
                              </div>
                            </details>
                          </TableCell>
                        </TableRow>
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default RaceResults;
