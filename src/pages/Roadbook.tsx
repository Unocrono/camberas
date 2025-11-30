import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Loader2, MapPin, Mountain, Clock, ArrowLeft, Flag, Trophy,
  Droplet, AlertTriangle, Camera, CircleDot, GlassWater, Timer
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RoadbookItemType {
  id: string;
  name: string;
  label: string;
  icon: string;
}

interface RoadbookItem {
  id: string;
  item_type: string;
  item_type_id: string | null;
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
  is_checkpoint: boolean;
  item_order: number;
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

// Icon mapping for item types
const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {
  Flag,
  MapPin,
  Droplet,
  GlassWater,
  AlertTriangle,
  Camera,
  Trophy,
  Mountain,
  CircleDot,
  Timer,
  Clock,
};

export default function Roadbook() {
  const { roadbookId } = useParams<{ roadbookId: string }>();
  const [roadbook, setRoadbook] = useState<Roadbook | null>(null);
  const [distance, setDistance] = useState<Distance | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [items, setItems] = useState<RoadbookItem[]>([]);
  const [itemTypes, setItemTypes] = useState<RoadbookItemType[]>([]);
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

      // Fetch item types
      const { data: typesData, error: typesError } = await supabase
        .from("roadbook_item_types")
        .select("id, name, label, icon")
        .eq("is_active", true);

      if (typesError) throw typesError;
      setItemTypes(typesData || []);

      // Fetch only highlighted items
      const { data: itemsData, error: itemsError } = await supabase
        .from("roadbook_items")
        .select("*")
        .eq("roadbook_id", roadbookId)
        .eq("is_highlighted", true)
        .order("item_order");

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

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

  const getItemTypeInfo = (item: RoadbookItem): { icon: React.ReactNode; label: string } => {
    // Find the item type by item_type_id or item_type name
    const itemType = itemTypes.find(t => t.id === item.item_type_id || t.name === item.item_type);
    
    if (itemType) {
      // Special case: checkpoint type uses Timer icon
      if (itemType.name === "checkpoint" || item.is_checkpoint) {
        return {
          icon: <Timer className="h-5 w-5 text-primary" />,
          label: itemType.label
        };
      }
      
      const IconComponent = iconComponents[itemType.icon];
      if (IconComponent) {
        return {
          icon: <IconComponent className="h-5 w-5 text-primary" />,
          label: itemType.label
        };
      }
      return { icon: null, label: itemType.label };
    }
    
    // Fallback for is_checkpoint
    if (item.is_checkpoint) {
      return {
        icon: <Timer className="h-5 w-5 text-primary" />,
        label: "Control"
      };
    }
    
    return { icon: null, label: item.item_type };
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
        <Card>
          <CardHeader>
            <CardTitle>Puntos Destacados</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No hay puntos destacados en este rutómetro.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Tipo</TableHead>
                      <TableHead>Punto</TableHead>
                      <TableHead className="text-right w-20">TOTAL</TableHead>
                      <TableHead className="text-right w-20">PARCIAL</TableHead>
                      <TableHead className="text-right w-20">FALTAN</TableHead>
                      <TableHead className="text-right w-20">ALT.</TableHead>
                      <TableHead className="w-32">Vía</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const typeInfo = getItemTypeInfo(item);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-center">
                            {typeInfo.icon ? (
                              <div className="flex justify-center" title={typeInfo.label}>
                                {typeInfo.icon}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{typeInfo.label}</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {item.km_total.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.km_partial !== null ? item.km_partial.toFixed(1) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.km_remaining !== null ? item.km_remaining.toFixed(1) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.altitude !== null ? `${item.altitude}m` : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.via || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
