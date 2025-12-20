import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface EventsSummaryProps {
  raceId: string;
}

interface EventData {
  id: string;
  name: string;
  distance_km: number;
  startTime: string | null;
}

export function EventsSummary({ raceId }: EventsSummaryProps) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Get distances
        const { data: distances, error: distError } = await supabase
          .from("race_distances")
          .select("id, name, distance_km")
          .eq("race_id", raceId)
          .order("distance_km", { ascending: false });

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
          startTime: waveMap.get(d.id) || null,
        })) || [];

        setEvents(result);
      } catch (error) {
        console.error("Error fetching events:", error);
      } finally {
        setLoading(false);
      }
    }

    if (raceId) {
      fetchData();
    }
  }, [raceId]);

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
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Distancia</TableHead>
              <TableHead className="text-center">Hora Salida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Sin eventos
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id}>
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
