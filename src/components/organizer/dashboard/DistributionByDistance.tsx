import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface DistributionByDistanceProps {
  raceId: string;
}

interface DistanceData {
  name: string;
  count: number;
  distance_km: number;
}

export function DistributionByDistance({ raceId }: DistributionByDistanceProps) {
  const [data, setData] = useState<DistanceData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Get distances with registration count
        const { data: distances, error: distError } = await supabase
          .from("race_distances")
          .select("id, name, distance_km")
          .eq("race_id", raceId)
          .order("distance_km", { ascending: false });

        if (distError) throw distError;

        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select("race_distance_id")
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"]);

        if (regError) throw regError;

        const countMap = new Map<string, number>();
        registrations?.forEach(reg => {
          countMap.set(reg.race_distance_id, (countMap.get(reg.race_distance_id) || 0) + 1);
        });

        const result: DistanceData[] = distances?.map(d => ({
          name: d.name,
          distance_km: d.distance_km,
          count: countMap.get(d.id) || 0,
        })) || [];

        setData(result);
      } catch (error) {
        console.error("Error fetching distribution:", error);
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
        <CardHeader>
          <CardTitle className="text-base">Inscritos por Evento</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inscritos por Evento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos</p>
        ) : (
          data.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{item.name}</span>
                <Badge variant="outline" className="text-xs">
                  {item.distance_km}km
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{item.count}</span>
                <span className="text-xs text-muted-foreground">
                  ({total > 0 ? Math.round((item.count / total) * 100) : 0}%)
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
