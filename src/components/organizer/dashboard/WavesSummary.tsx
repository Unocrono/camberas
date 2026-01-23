import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";
import { formatLocalTime } from "@/lib/timezoneUtils";


interface WavesSummaryProps {
  raceId: string;
}

interface WaveData {
  wave_name: string;
  start_time: string | null;
}

export function WavesSummary({ raceId }: WavesSummaryProps) {
  const [waves, setWaves] = useState<WaveData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data, error, count } = await supabase
          .from("race_waves")
          .select("wave_name, start_time", { count: "exact" })
          .eq("race_id", raceId)
          .order("start_time", { ascending: true, nullsFirst: false })
          .limit(3);

        if (error) throw error;

        setWaves(data || []);
        setTotal(count || 0);
      } catch (error) {
        console.error("Error fetching waves:", error);
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
            <Clock className="w-4 h-4" />
            Horas de Salida
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
            <Clock className="w-4 h-4 text-primary" />
            Horas de Salida
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Total: {total}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {waves.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin oleadas</p>
        ) : (
          <div className="space-y-1.5">
            {waves.map((wave, idx) => (
              <div key={idx} className="text-xs flex items-center justify-between gap-2">
                <span className="truncate">{wave.wave_name}</span>
                <span className="shrink-0 font-medium">
                  {wave.start_time 
                    ? formatLocalTime(wave.start_time).slice(0, 5)
                    : <span className="text-muted-foreground">--:--</span>
                  }
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
