import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

interface EventsSummaryProps {
  raceId: string;
}

interface EventData {
  id: string;
  name: string;
  distance_km: number;
  display_order: number;
  startTime: string | null;
}

export function EventsSummary({ raceId }: EventsSummaryProps) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get distances
      const { data: distances, error: distError } = await supabase
        .from("race_distances")
        .select("id, name, distance_km, display_order")
        .eq("race_id", raceId)
        .order("display_order", { ascending: true });

      if (distError) throw distError;

      // Get waves for start times
      const { data: waves, error: waveError } = await supabase
        .from("race_waves")
        .select("race_distance_id, start_time")
        .eq("race_id", raceId);

      if (waveError) throw waveError;

      const waveMap = new Map<string, string>();
      waves?.forEach(w => {
        if (w.start_time) {
          waveMap.set(w.race_distance_id, w.start_time);
        }
      });

      const result: EventData[] = distances?.map(d => ({
        id: d.id,
        name: d.name,
        distance_km: d.distance_km,
        display_order: d.display_order ?? 0,
        startTime: waveMap.get(d.id) || null,
      })) || [];

      setEvents(result);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (raceId) {
      fetchData();
    }
  }, [raceId]);

  const handleMoveUp = async (event: EventData) => {
    const index = events.findIndex(e => e.id === event.id);
    if (index <= 0) return;

    const prevEvent = events[index - 1];
    
    // Swap orders
    const updates = [
      supabase.from("race_distances").update({ display_order: prevEvent.display_order }).eq("id", event.id),
      supabase.from("race_distances").update({ display_order: event.display_order }).eq("id", prevEvent.id)
    ];

    const results = await Promise.all(updates);
    const hasError = results.some(r => r.error);
    
    if (hasError) {
      toast.error("Error al cambiar el orden");
      return;
    }

    toast.success("Orden actualizado");
    fetchData();
  };

  const handleMoveDown = async (event: EventData) => {
    const index = events.findIndex(e => e.id === event.id);
    if (index >= events.length - 1) return;

    const nextEvent = events[index + 1];
    
    // Swap orders
    const updates = [
      supabase.from("race_distances").update({ display_order: nextEvent.display_order }).eq("id", event.id),
      supabase.from("race_distances").update({ display_order: event.display_order }).eq("id", nextEvent.id)
    ];

    const results = await Promise.all(updates);
    const hasError = results.some(r => r.error);
    
    if (hasError) {
      toast.error("Error al cambiar el orden");
      return;
    }

    toast.success("Orden actualizado");
    fetchData();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px] text-center">Orden</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Distancia</TableHead>
              <TableHead className="text-center">Hora Salida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin eventos
                </TableCell>
              </TableRow>
            ) : (
              events.map((event, index) => (
                <TableRow key={event.id}>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === 0}
                        onClick={() => handleMoveUp(event)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === events.length - 1}
                        onClick={() => handleMoveDown(event)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{event.distance_km} km</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {event.startTime ? (
                      format(parseISO(event.startTime), "HH:mm", { locale: es })
                    ) : (
                      <span className="text-muted-foreground text-sm">Sin definir</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
