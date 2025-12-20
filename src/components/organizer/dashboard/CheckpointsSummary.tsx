import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CheckpointsSummaryProps {
  raceId: string;
}

interface CheckpointData {
  name: string;
  checkpoint_type: string;
  distance_km: number;
}

export function CheckpointsSummary({ raceId }: CheckpointsSummaryProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data, error, count } = await supabase
          .from("race_checkpoints")
          .select("name, checkpoint_type, distance_km", { count: "exact" })
          .eq("race_id", raceId)
          .order("distance_km", { ascending: true })
          .limit(3);

        if (error) throw error;

        setCheckpoints(data || []);
        setTotal(count || 0);
      } catch (error) {
        console.error("Error fetching checkpoints:", error);
      } finally {
        setLoading(false);
      }
    }

    if (raceId) {
      fetchData();
    }
  }, [raceId]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "START": return "Salida";
      case "FINISH": return "Meta";
      case "CONTROL": return "Control";
      case "PROVISIONING": return "Avit.";
      default: return type;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Flag className="w-4 h-4" />
            Puntos de Control
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
            <Flag className="w-4 h-4 text-primary" />
            Puntos de Control
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Total: {total}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {checkpoints.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin controles</p>
        ) : (
          <div className="space-y-1.5">
            {checkpoints.map((cp, idx) => (
              <div key={idx} className="text-xs flex items-center justify-between gap-2">
                <span className="truncate flex-1">{cp.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {getTypeLabel(cp.checkpoint_type)}
                </Badge>
                <span className="text-muted-foreground shrink-0 w-12 text-right">
                  {cp.distance_km} km
                </span>
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
