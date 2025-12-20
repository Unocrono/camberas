import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";

interface TimingPointsSummaryProps {
  raceId: string;
}

interface TimingPoint {
  name: string;
  point_order: number | null;
}

export function TimingPointsSummary({ raceId }: TimingPointsSummaryProps) {
  const [points, setPoints] = useState<TimingPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data, error, count } = await supabase
          .from("timing_points")
          .select("name, point_order", { count: "exact" })
          .eq("race_id", raceId)
          .order("point_order", { ascending: true })
          .limit(3);

        if (error) throw error;

        setPoints(data || []);
        setTotal(count || 0);
      } catch (error) {
        console.error("Error fetching timing points:", error);
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
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Puntos de Cronometraje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Puntos de Cronometraje
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Total: {total}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {points.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin puntos</p>
        ) : (
          <div className="space-y-1.5">
            {points.map((point, idx) => (
              <div key={idx} className="text-xs flex items-center gap-2">
                <span className="w-4 text-muted-foreground">{point.point_order || idx + 1}</span>
                <span className="truncate">{point.name}</span>
              </div>
            ))}
            {total > 3 && (
              <p className="text-xs text-muted-foreground">+{total - 3} más...</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
