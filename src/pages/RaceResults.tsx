import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, FileText, ChevronLeft, ChevronRight, Loader2, MapPin, Flag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";

interface SplitTime {
  checkpoint_name: string;
  checkpoint_order: number;
  split_time: string;
  distance_km: number;
}

interface RaceResult {
  id: string;
  finish_time: string;
  overall_position: number | null;
  category_position: number | null;
  gender_position: number | null;
  status: string;
  registration: {
    bib_number: number | null;
    race_distance_id: string;
    race_distance: {
      id: string;
      name: string;
      distance_km: number;
    };
    user_id: string | null;
    profiles: {
      first_name: string | null;
      last_name: string | null;
      gender: string | null;
      club: string | null;
      birth_date: string | null;
    } | null;
    guest_first_name: string | null;
    guest_last_name: string | null;
  };
  split_times?: SplitTime[];
}

interface Checkpoint {
  id: string;
  name: string;
  checkpoint_order: number;
  distance_km: number;
}

type ClassificationType = "general" | "category" | "gender";

const ITEMS_PER_PAGE = 50;

const RaceResults = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [race, setRace] = useState<any>(null);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [distances, setDistances] = useState<any[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters from URL params
  const selectedDistance = searchParams.get("event") || "all";
  const classificationType = (searchParams.get("type") as ClassificationType) || "general";
  const searchTerm = searchParams.get("q") || "";
  const currentPage = parseInt(searchParams.get("page") || "1");

  const updateParams = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    setSearchParams(newParams);
  };

  useEffect(() => {
    fetchRaceData();
  }, [id]);

  const fetchRaceData = async () => {
    setLoading(true);
    try {
      const { data: raceData, error: raceError } = await supabase
        .from("races")
        .select("*")
        .eq("id", id)
        .single();

      if (raceError) throw raceError;
      setRace(raceData);

      const { data: distancesData, error: distancesError } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", id)
        .eq("is_visible", true)
        .order("distance_km", { ascending: true });

      if (distancesError) throw distancesError;
      setDistances(distancesData || []);

      // Fetch checkpoints for splits columns
      const { data: checkpointsData } = await supabase
        .from("race_checkpoints")
        .select("id, name, checkpoint_order, distance_km")
        .eq("race_id", id)
        .order("checkpoint_order", { ascending: true });
      
      setCheckpoints(checkpointsData || []);

      // Fetch results with split times
      const { data: resultsData, error: resultsError } = await supabase
        .from("race_results")
        .select(`
          id,
          finish_time,
          overall_position,
          category_position,
          gender_position,
          status,
          registration:registrations!inner (
            bib_number,
            race_distance_id,
            user_id,
            guest_first_name,
            guest_last_name,
            race_distance:race_distances (
              id,
              name,
              distance_km
            ),
            profiles (
              first_name,
              last_name,
              gender,
              club,
              birth_date
            )
          )
        `)
        .eq("registration.race_id", id)
        .in("status", ["finished", "in_progress"])
        .order("overall_position", { ascending: true, nullsFirst: false });

      if (resultsError) throw resultsError;

      // Fetch split times for all results
      const resultIds = (resultsData || []).map(r => r.id);
      let splitTimesMap: Record<string, SplitTime[]> = {};
      
      if (resultIds.length > 0) {
        const { data: splitsData } = await supabase
          .from("split_times")
          .select("race_result_id, checkpoint_name, checkpoint_order, split_time, distance_km")
          .in("race_result_id", resultIds)
          .order("checkpoint_order", { ascending: true });

        if (splitsData) {
          splitsData.forEach((split: any) => {
            if (!splitTimesMap[split.race_result_id]) {
              splitTimesMap[split.race_result_id] = [];
            }
            splitTimesMap[split.race_result_id].push(split);
          });
        }
      }

      const resultsWithSplits = (resultsData || []).map(result => ({
        ...result,
        split_times: splitTimesMap[result.id] || []
      }));

      setResults(resultsWithSplits as any);
    } catch (error: any) {
      toast({
        title: "Error al cargar resultados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeString: string): string => {
    if (!timeString) return "-";
    const match = timeString.match(/(\d+):(\d+):(\d+)/);
    if (!match) return timeString;
    const hours = parseInt(match[1]);
    const minutes = match[2];
    const seconds = match[3];
    if (hours === 0) {
      return `${minutes}:${seconds}`;
    }
    return `${hours}:${minutes}:${seconds}`;
  };

  const calculatePace = (timeString: string, distanceKm: number): string => {
    if (!timeString || !distanceKm) return "-";
    const match = timeString.match(/(\d+):(\d+):(\d+)/);
    if (!match) return "-";
    
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const totalMinutes = hours * 60 + minutes + seconds / 60;
    const paceMinutes = totalMinutes / distanceKm;
    const paceMin = Math.floor(paceMinutes);
    const paceSec = Math.round((paceMinutes - paceMin) * 60);
    
    return `${paceMin}:${paceSec.toString().padStart(2, '0')}`;
  };

  const calculateGap = (timeString: string, winnerTime: string): string => {
    if (!timeString || !winnerTime) return "-";
    const parseTime = (t: string) => {
      const match = t.match(/(\d+):(\d+):(\d+)/);
      if (!match) return 0;
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
    };
    
    const diff = parseTime(timeString) - parseTime(winnerTime);
    if (diff === 0) return "-";
    
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    if (hours > 0) {
      return `+${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `+${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getCategory = (birthDate: string | null, gender: string | null, raceDate: string): string => {
    if (!birthDate || !gender) return "-";
    const birth = new Date(birthDate);
    const race = new Date(raceDate);
    const age = race.getFullYear() - birth.getFullYear();
    
    const genderPrefix = gender === "male" || gender === "M" ? "M" : "F";
    
    if (age < 20) return `${genderPrefix}-JUN`;
    if (age < 23) return `${genderPrefix}-SUB23`;
    if (age < 35) return `${genderPrefix}-SEN`;
    if (age < 40) return `${genderPrefix}-M35`;
    if (age < 45) return `${genderPrefix}-M40`;
    if (age < 50) return `${genderPrefix}-M45`;
    if (age < 55) return `${genderPrefix}-M50`;
    if (age < 60) return `${genderPrefix}-M55`;
    if (age < 65) return `${genderPrefix}-M60`;
    return `${genderPrefix}-M65`;
  };

  const getRunnerName = (result: RaceResult): string => {
    if (result.registration.profiles) {
      return `${result.registration.profiles.first_name || ''} ${result.registration.profiles.last_name || ''}`.trim();
    }
    return `${result.registration.guest_first_name || ''} ${result.registration.guest_last_name || ''}`.trim() || 'Sin nombre';
  };

  const getGender = (result: RaceResult): string => {
    const gender = result.registration.profiles?.gender;
    if (!gender) return "-";
    if (gender === "male" || gender === "M") return "H";
    if (gender === "female" || gender === "F") return "M";
    return gender;
  };

  // Get unique checkpoints for the selected distance (excluding Meta/finish checkpoints)
  const distanceCheckpoints = useMemo(() => {
    if (selectedDistance === "all") {
      // Get checkpoints that appear in results
      const checkpointNames = new Set<string>();
      results.forEach(r => {
        r.split_times?.forEach(s => checkpointNames.add(s.checkpoint_name));
      });
      return Array.from(checkpointNames).map(name => {
        const cp = checkpoints.find(c => c.name === name);
        return { name, order: cp?.checkpoint_order || 0, distance_km: cp?.distance_km || 0 };
      })
      .filter(cp => !cp.name.toLowerCase().includes('meta')) // Exclude Meta - shown as finish_time
      .sort((a, b) => a.order - b.order);
    }
    
    const distanceResults = results.filter(r => r.registration.race_distance_id === selectedDistance);
    const checkpointNames = new Set<string>();
    distanceResults.forEach(r => {
      r.split_times?.forEach(s => checkpointNames.add(s.checkpoint_name));
    });
    return Array.from(checkpointNames).map(name => {
      const cp = checkpoints.find(c => c.name === name);
      return { name, order: cp?.checkpoint_order || 0, distance_km: cp?.distance_km || 0 };
    })
    .filter(cp => !cp.name.toLowerCase().includes('meta')) // Exclude Meta - shown as finish_time
    .sort((a, b) => a.order - b.order);
  }, [results, selectedDistance, checkpoints]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = results.filter(result => {
      const matchesDistance = selectedDistance === "all" || result.registration.race_distance_id === selectedDistance;
      const search = searchTerm.toLowerCase();
      const bibNumber = result.registration.bib_number?.toString() || "";
      const name = getRunnerName(result).toLowerCase();
      const club = result.registration.profiles?.club?.toLowerCase() || "";
      const matchesSearch = !search || bibNumber.includes(search) || name.includes(search) || club.includes(search);
      
      return matchesDistance && matchesSearch;
    });

    // Sort based on classification type
    if (classificationType === "category") {
      filtered = [...filtered].sort((a, b) => {
        const catA = getCategory(a.registration.profiles?.birth_date || null, a.registration.profiles?.gender || null, race?.date || "");
        const catB = getCategory(b.registration.profiles?.birth_date || null, b.registration.profiles?.gender || null, race?.date || "");
        if (catA !== catB) return catA.localeCompare(catB);
        return (a.category_position || 999) - (b.category_position || 999);
      });
    } else if (classificationType === "gender") {
      filtered = [...filtered].sort((a, b) => {
        const genderA = getGender(a);
        const genderB = getGender(b);
        if (genderA !== genderB) return genderA.localeCompare(genderB);
        return (a.gender_position || 999) - (b.gender_position || 999);
      });
    }

    return filtered;
  }, [results, selectedDistance, searchTerm, classificationType, race]);

  // Get winner time for gap calculation
  const winnerTime = useMemo(() => {
    const distanceResults = filteredResults.filter(r => 
      selectedDistance === "all" || r.registration.race_distance_id === selectedDistance
    );
    return distanceResults[0]?.finish_time || "";
  }, [filteredResults, selectedDistance]);

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const exportToCsv = () => {
    const headers = ["Pos", "Dorsal", "Nombre", "Club", "Sx", "Cat", "Por Cat", ...distanceCheckpoints.map(c => c.name), "Tiempo", "Gap", "Ritmo"];
    const rows = filteredResults.map(result => {
      const splits = distanceCheckpoints.map(cp => {
        const split = result.split_times?.find(s => s.checkpoint_name === cp.name);
        return split ? formatTime(split.split_time) : "";
      });
      return [
        result.overall_position || "",
        result.registration.bib_number || "",
        getRunnerName(result),
        result.registration.profiles?.club || "",
        getGender(result),
        getCategory(result.registration.profiles?.birth_date || null, result.registration.profiles?.gender || null, race?.date || ""),
        result.category_position || "",
        ...splits,
        formatTime(result.finish_time),
        calculateGap(result.finish_time, winnerTime),
        calculatePace(result.finish_time, result.registration.race_distance.distance_km)
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resultados_${race?.name || "carrera"}.csv`;
    a.click();
  };

  const exportToPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(race?.name || "Resultados", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(new Date(race?.date).toLocaleDateString('es-ES'), pageWidth / 2, 28, { align: "center" });
    
    let y = 45;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Pos", 10, y);
    doc.text("Dorsal", 25, y);
    doc.text("Nombre", 45, y);
    doc.text("Club", 110, y);
    doc.text("Tiempo", 160, y);
    doc.text("Ritmo", 185, y);
    
    y += 8;
    doc.setFont("helvetica", "normal");
    
    filteredResults.slice(0, 100).forEach((result, i) => {
      if (y > 280) { doc.addPage(); y = 20; }
      if (i % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(8, y - 4, pageWidth - 16, 6, 'F'); }
      doc.text(String(result.overall_position || '-'), 10, y);
      doc.text(String(result.registration.bib_number || '-'), 25, y);
      doc.text(getRunnerName(result).substring(0, 30), 45, y);
      doc.text((result.registration.profiles?.club || '-').substring(0, 20), 110, y);
      doc.text(formatTime(result.finish_time), 160, y);
      doc.text(calculatePace(result.finish_time, result.registration.race_distance.distance_km), 185, y);
      y += 6;
    });
    
    doc.save(`resultados_${race?.name || "carrera"}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <p className="text-muted-foreground">Carrera no encontrada</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-24">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{race.name}</h1>
            <p className="text-muted-foreground">
              {new Date(race.date).toLocaleDateString('es-ES', { 
                day: 'numeric',
                month: 'long', 
                year: 'numeric' 
              })}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToCsv}>
                <FileText className="h-4 w-4 mr-2" />
                Descargar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPdf}>
                <FileText className="h-4 w-4 mr-2" />
                Descargar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Distance Tabs */}
        {distances.length > 1 && (
          <div className="mb-4 border-b">
            <div className="flex flex-wrap gap-1">
              <Button
                variant={selectedDistance === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => updateParams({ event: "", page: "1" })}
                className="rounded-b-none"
              >
                Todos
              </Button>
              {distances.map(distance => (
                <Button
                  key={distance.id}
                  variant={selectedDistance === distance.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => updateParams({ event: distance.id, page: "1" })}
                  className="rounded-b-none"
                >
                  {distance.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Classification Type + Search */}
        <div className="mb-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Tabs value={classificationType} onValueChange={(v) => updateParams({ type: v, page: "1" })}>
            <TabsList>
              <TabsTrigger value="general">Clasificación</TabsTrigger>
              <TabsTrigger value="category">Por Categoría</TabsTrigger>
              <TabsTrigger value="gender">Por Sexo</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar dorsal, nombre, club..."
              value={searchTerm}
              onChange={(e) => updateParams({ q: e.target.value, page: "1" })}
              className="pl-9"
            />
          </div>
        </div>

        {/* Results Count + Pagination Info */}
        <div className="mb-2 text-sm text-muted-foreground flex justify-between items-center">
          <span>
            Página {currentPage} de {totalPages} ({filteredResults.length} resultados)
          </span>
        </div>

        {/* Checkpoints Timeline Header */}
        {distanceCheckpoints.length > 0 && (
          <div className="mb-4 p-4 border rounded-lg bg-card">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Puntos de Control</span>
            </div>
            <div className="relative">
              {/* Progress Line */}
              <div className="absolute top-4 left-8 right-8 h-1 bg-muted rounded-full" />
              <div className="absolute top-4 left-8 right-8 h-1 bg-primary/30 rounded-full" style={{ width: '100%' }} />
              
              {/* Checkpoints */}
              <div className="relative flex justify-between items-start px-4">
                {/* Start */}
                <div className="flex flex-col items-center z-10">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center mb-2 shadow-sm border-2 border-background">
                    <Flag className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold">Salida</span>
                  <span className="text-xs text-muted-foreground">0 km</span>
                </div>

                {/* Intermediate Checkpoints */}
                {distanceCheckpoints.slice(0, 6).map((cp, index) => {
                  const isLast = index === distanceCheckpoints.slice(0, 6).length - 1 && cp.name.toLowerCase().includes('meta');
                  return (
                    <div key={cp.name} className="flex flex-col items-center z-10">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 shadow-sm border-2 border-background ${
                        isLast ? 'bg-red-500' : 'bg-primary'
                      }`}>
                        {isLast ? (
                          <Flag className="h-4 w-4 text-white" />
                        ) : (
                          <span className="text-xs font-bold text-primary-foreground">{index + 1}</span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-center max-w-[80px] truncate" title={cp.name}>
                        {cp.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{cp.distance_km} km</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center font-semibold">Pos.</TableHead>
                  <TableHead className="w-16 font-semibold">Dorsal</TableHead>
                  <TableHead className="min-w-[200px] font-semibold">Nombre</TableHead>
                  <TableHead className="font-semibold">Club</TableHead>
                  <TableHead className="w-12 text-center font-semibold">Sx</TableHead>
                  <TableHead className="w-20 font-semibold">Cat</TableHead>
                  <TableHead className="w-16 text-center font-semibold">Por Cat.</TableHead>
                  <TableHead className="w-16 text-center font-semibold">Por Gén.</TableHead>
                  <TableHead className="font-semibold text-center min-w-[80px]">Tiempo</TableHead>
                  {distanceCheckpoints.slice(0, 6).map((cp, idx) => (
                    <TableHead key={cp.name} className="font-semibold text-center whitespace-nowrap min-w-[80px]">
                      <div className="flex flex-col items-center">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center mb-1 text-[10px] font-bold bg-primary text-primary-foreground">
                          {idx + 1}
                        </div>
                        <span className="text-xs">{cp.name}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">{cp.distance_km}km</span>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="font-semibold text-center">Gap</TableHead>
                  <TableHead className="font-semibold text-center">Ritmo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedResults.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11 + distanceCheckpoints.length} className="text-center py-12 text-muted-foreground">
                      No se encontraron resultados
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedResults.map((result, index) => {
                    const position = classificationType === "general" 
                      ? result.overall_position 
                      : classificationType === "gender"
                        ? result.gender_position
                        : result.category_position;
                    
                    return (
                      <TableRow 
                        key={result.id} 
                        className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}
                      >
                        <TableCell className="text-center font-medium">
                          {position || "-"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {result.registration.bib_number}
                        </TableCell>
                        <TableCell className="font-medium text-primary">
                          {getRunnerName(result)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {result.registration.profiles?.club || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={getGender(result) === "H" ? "text-blue-600" : "text-pink-600"}>
                            {getGender(result)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-normal">
                            {getCategory(
                              result.registration.profiles?.birth_date || null, 
                              result.registration.profiles?.gender || null, 
                              race?.date || ""
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {result.category_position || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.gender_position || "-"}
                        </TableCell>
                        <TableCell className="text-center font-mono font-semibold text-primary">
                          {formatTime(result.finish_time)}
                        </TableCell>
                        {distanceCheckpoints.slice(0, 6).map(cp => {
                          const split = result.split_times?.find(s => s.checkpoint_name === cp.name);
                          return (
                            <TableCell key={cp.name} className="text-center font-mono text-sm">
                              {split ? formatTime(split.split_time) : "-"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-mono text-sm text-destructive">
                          {calculateGap(result.finish_time, winnerTime)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {calculatePace(result.finish_time, result.registration.race_distance.distance_km)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => updateParams({ page: (currentPage - 1).toString() })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 7) {
                  page = i + 1;
                } else if (currentPage <= 4) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  page = totalPages - 6 + i;
                } else {
                  page = currentPage - 3 + i;
                }
                
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "ghost"}
                    size="sm"
                    onClick={() => updateParams({ page: page.toString() })}
                    className="w-8"
                  >
                    {page}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => updateParams({ page: (currentPage + 1).toString() })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default RaceResults;
