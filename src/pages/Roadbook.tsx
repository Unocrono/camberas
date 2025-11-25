import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, MapPin, Mountain, Clock, TrendingUp, Image as ImageIcon, ArrowLeft, Navigation } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RoadbookItem {
  id: string;
  item_type: string;
  description: string;
  via: string | null;
  km_total: number;
  km_partial: number | null;
  km_remaining: number | null;
  altitude: number | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  photo_16_9_url: string | null;
  photo_9_16_url: string | null;
  icon_url: string | null;
  is_highlighted: boolean;
  item_order: number;
}

interface RoadbookPace {
  id: string;
  pace_name: string;
  pace_minutes_per_km: number;
  pace_order: number;
}

interface RoadbookSchedule {
  roadbook_item_id: string;
  roadbook_pace_id: string;
  estimated_time: string;
}

interface Roadbook {
  id: string;
  name: string;
  description: string | null;
  start_time: string | null;
  race_distance_id: string;
}

interface Distance {
  name: string;
  distance_km: number;
  race_id: string;
}

interface Race {
  name: string;
  date: string;
  location: string;
}

export default function Roadbook() {
  const { roadbookId } = useParams<{ roadbookId: string }>();
  const [roadbook, setRoadbook] = useState<Roadbook | null>(null);
  const [distance, setDistance] = useState<Distance | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [items, setItems] = useState<RoadbookItem[]>([]);
  const [paces, setPaces] = useState<RoadbookPace[]>([]);
  const [schedules, setSchedules] = useState<RoadbookSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (roadbookId) {
      fetchRoadbookData();
    }
  }, [roadbookId]);

  const fetchRoadbookData = async () => {
    try {
      setLoading(true);

      // Fetch roadbook
      const { data: roadbookData, error: roadbookError } = await supabase
        .from("roadbooks")
        .select("*")
        .eq("id", roadbookId)
        .single();

      if (roadbookError) throw roadbookError;
      setRoadbook(roadbookData);

      // Fetch distance and race info
      const { data: distanceData, error: distanceError } = await supabase
        .from("race_distances")
        .select("name, distance_km, race_id")
        .eq("id", roadbookData.race_distance_id)
        .single();

      if (distanceError) throw distanceError;
      setDistance(distanceData);

      const { data: raceData, error: raceError } = await supabase
        .from("races")
        .select("name, date, location")
        .eq("id", distanceData.race_id)
        .single();

      if (raceError) throw raceError;
      setRace(raceData);

      // Fetch items
      const { data: itemsData, error: itemsError } = await supabase
        .from("roadbook_items")
        .select("*")
        .eq("roadbook_id", roadbookId)
        .order("item_order");

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      // Fetch paces
      const { data: pacesData, error: pacesError } = await supabase
        .from("roadbook_paces")
        .select("*")
        .eq("roadbook_id", roadbookId)
        .order("pace_order");

      if (pacesError) throw pacesError;
      setPaces(pacesData || []);

      // Fetch schedules
      const { data: schedulesData, error: schedulesError } = await supabase
        .from("roadbook_schedules")
        .select("*")
        .in("roadbook_item_id", itemsData?.map(i => i.id) || []);

      if (schedulesError) throw schedulesError;
      setSchedules((schedulesData || []).map(s => ({
        ...s,
        estimated_time: String(s.estimated_time)
      })));

    } catch (error: any) {
      console.error("Error fetching roadbook data:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el rutómetro",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (intervalString: string): string => {
    // Parse PostgreSQL interval format (e.g., "02:30:00")
    const match = intervalString.match(/(\d+):(\d+):(\d+)/);
    if (!match) return intervalString;
    
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const calculateArrivalTime = (startTime: string, durationInterval: string): string => {
    if (!startTime) return "-";
    
    // Parse start time (HH:MM format)
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    
    // Parse duration interval
    const match = durationInterval.match(/(\d+):(\d+):(\d+)/);
    if (!match) return "-";
    
    const durationHours = parseInt(match[1]);
    const durationMinutes = parseInt(match[2]);
    
    // Calculate arrival
    let totalMinutes = (startHours * 60 + startMinutes) + (durationHours * 60 + durationMinutes);
    const arrivalHours = Math.floor(totalMinutes / 60) % 24;
    const arrivalMinutes = totalMinutes % 60;
    
    return `${arrivalHours.toString().padStart(2, '0')}:${arrivalMinutes.toString().padStart(2, '0')}`;
  };

  const getScheduleForItem = (itemId: string, paceId: string): RoadbookSchedule | undefined => {
    return schedules.find(s => s.roadbook_item_id === itemId && s.roadbook_pace_id === paceId);
  };

  const getItemTypeIcon = (type: string) => {
    switch (type) {
      case "checkpoint":
        return <MapPin className="h-5 w-5" />;
      case "aid_station":
        return <TrendingUp className="h-5 w-5" />;
      case "summit":
        return <Mountain className="h-5 w-5" />;
      default:
        return <Navigation className="h-5 w-5" />;
    }
  };

  const getItemTypeName = (type: string) => {
    const types: Record<string, string> = {
      checkpoint: "Control",
      aid_station: "Avituallamiento",
      summit: "Cumbre",
      water_point: "Punto de Agua",
      technical_zone: "Zona Técnica",
      danger_zone: "Zona Peligrosa",
      viewpoint: "Mirador",
      start: "Salida",
      finish: "Meta",
    };
    return types[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando rutómetro...</p>
        </div>
      </div>
    );
  }

  if (!roadbook || !distance || !race) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Rutómetro no encontrado</h2>
          <p className="text-muted-foreground mb-4">El rutómetro que buscas no existe o no está disponible.</p>
          <Button asChild>
            <Link to="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link to={`/race/${distance.race_id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a la carrera
            </Link>
          </Button>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{roadbook.name}</h1>
              <p className="text-muted-foreground mt-1">
                {race.name} - {distance.name} ({distance.distance_km}km)
              </p>
            </div>
            {roadbook.start_time && (
              <div className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                <span className="font-semibold">Salida: {roadbook.start_time}</span>
              </div>
            )}
          </div>
          {roadbook.description && (
            <p className="text-muted-foreground mt-3">{roadbook.description}</p>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="visual" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="visual">Vista Visual</TabsTrigger>
            <TabsTrigger value="table">Tabla Completa</TabsTrigger>
          </TabsList>

          {/* Visual View */}
          <TabsContent value="visual" className="space-y-6">
            {items.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No hay ítems en este rutómetro todavía.
                  </p>
                </CardContent>
              </Card>
            ) : (
              items.map((item, index) => (
                <Card key={item.id} className={item.is_highlighted ? "border-primary shadow-lg" : ""}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1">
                          {getItemTypeIcon(item.item_type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-xl">{item.description}</CardTitle>
                            <Badge variant={item.is_highlighted ? "default" : "secondary"}>
                              {getItemTypeName(item.item_type)}
                            </Badge>
                          </div>
                          {item.via && (
                            <CardDescription className="mt-1">
                              Vía: {item.via}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                          KM {item.km_total.toFixed(1)}
                        </div>
                        {item.altitude && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1 justify-end mt-1">
                            <Mountain className="h-3 w-3" />
                            {item.altitude}m
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Photos */}
                    {(item.photo_16_9_url || item.photo_9_16_url) && (
                      <div className="grid gap-4 md:grid-cols-2">
                        {item.photo_16_9_url && (
                          <img
                            src={item.photo_16_9_url}
                            alt={item.description}
                            className="rounded-lg w-full h-48 object-cover"
                          />
                        )}
                        {item.photo_9_16_url && (
                          <img
                            src={item.photo_9_16_url}
                            alt={item.description}
                            className="rounded-lg w-full h-48 object-cover"
                          />
                        )}
                      </div>
                    )}

                    {/* Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {item.km_partial !== null && (
                        <div>
                          <span className="text-muted-foreground">KM Parcial:</span>
                          <div className="font-semibold">{item.km_partial.toFixed(1)} km</div>
                        </div>
                      )}
                      {item.km_remaining !== null && (
                        <div>
                          <span className="text-muted-foreground">KM Restantes:</span>
                          <div className="font-semibold">{item.km_remaining.toFixed(1)} km</div>
                        </div>
                      )}
                      {item.latitude && item.longitude && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Coordenadas:</span>
                          <div className="font-mono text-xs">
                            {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                          </div>
                        </div>
                      )}
                    </div>

                    {item.notes && (
                      <div className="bg-muted/50 p-3 rounded-md">
                        <p className="text-sm">{item.notes}</p>
                      </div>
                    )}

                    {/* Schedules by Pace */}
                    {paces.length > 0 && (
                      <div>
                        <Separator className="mb-3" />
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Horarios Estimados
                        </h4>
                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                          {paces.map((pace) => {
                            const schedule = getScheduleForItem(item.id, pace.id);
                            return (
                              <div key={pace.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                <span className="text-sm font-medium">{pace.pace_name}</span>
                                {schedule && roadbook.start_time ? (
                                  <div className="text-right">
                                    <div className="text-sm font-bold">
                                      {calculateArrivalTime(roadbook.start_time, schedule.estimated_time)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      ({formatTime(schedule.estimated_time)})
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Table View */}
          <TabsContent value="table">
            <Card>
              <CardHeader>
                <CardTitle>Rutómetro Completo</CardTitle>
                <CardDescription>
                  Vista de tabla con todos los detalles y horarios estimados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Punto</TableHead>
                        <TableHead className="text-right">KM Total</TableHead>
                        <TableHead className="text-right">KM Parcial</TableHead>
                        <TableHead className="text-right">Altitud</TableHead>
                        {paces.map((pace) => (
                          <TableHead key={pace.id} className="text-center">
                            {pace.pace_name}
                            <div className="text-xs text-muted-foreground font-normal">
                              ({pace.pace_minutes_per_km.toFixed(1)} min/km)
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={item.id} className={item.is_highlighted ? "bg-primary/5" : ""}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="whitespace-nowrap">
                              {getItemTypeName(item.item_type)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{item.description}</div>
                            {item.via && (
                              <div className="text-xs text-muted-foreground">Vía: {item.via}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {item.km_total.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.km_partial !== null ? item.km_partial.toFixed(1) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.altitude ? `${item.altitude}m` : "-"}
                          </TableCell>
                          {paces.map((pace) => {
                            const schedule = getScheduleForItem(item.id, pace.id);
                            return (
                              <TableCell key={pace.id} className="text-center">
                                {schedule && roadbook.start_time ? (
                                  <div>
                                    <div className="font-semibold">
                                      {calculateArrivalTime(roadbook.start_time, schedule.estimated_time)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatTime(schedule.estimated_time)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {paces.length > 0 && (
                  <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-2">Ritmos Configurados:</h4>
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {paces.map((pace) => (
                        <div key={pace.id} className="flex items-center justify-between">
                          <span className="font-medium">{pace.pace_name}:</span>
                          <span className="text-muted-foreground">{pace.pace_minutes_per_km.toFixed(1)} min/km</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}