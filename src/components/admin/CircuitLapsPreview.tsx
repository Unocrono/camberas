import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin, RotateCcw } from "lucide-react";

interface Checkpoint {
  id: string;
  name: string;
  checkpoint_order: number;
  distance_km: number;
  timing_point_id: string | null;
  min_time: unknown;
  max_time: unknown;
  expected_laps: number | null;
  min_lap_time: unknown;
}

interface TimingPoint {
  id: string;
  name: string;
}

interface CircuitLapsPreviewProps {
  checkpoints: Checkpoint[];
  timingPoints: TimingPoint[];
}

// Helper to format interval to readable time
const formatTime = (interval: unknown): string => {
  if (!interval) return "--:--";
  const strVal = String(interval);
  const match = strVal.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}:${match[3]}`;
  return "--:--";
};

export function CircuitLapsPreview({ checkpoints, timingPoints }: CircuitLapsPreviewProps) {
  // Group checkpoints by timing_point_id
  const timingPointGroups = new Map<string, Checkpoint[]>();
  
  checkpoints.forEach(cp => {
    if (cp.timing_point_id) {
      const existing = timingPointGroups.get(cp.timing_point_id) || [];
      existing.push(cp);
      timingPointGroups.set(cp.timing_point_id, existing);
    }
  });

  // Filter only timing points with multiple checkpoints (laps)
  const lapsConfigurations: { timingPoint: TimingPoint; checkpoints: Checkpoint[] }[] = [];
  
  timingPointGroups.forEach((cps, tpId) => {
    if (cps.length > 1) {
      const tp = timingPoints.find(t => t.id === tpId);
      if (tp) {
        // Sort by checkpoint_order
        const sortedCps = [...cps].sort((a, b) => a.checkpoint_order - b.checkpoint_order);
        lapsConfigurations.push({ timingPoint: tp, checkpoints: sortedCps });
      }
    }
  });

  if (lapsConfigurations.length === 0) {
    return null;
  }

  return (
    <Card className="border-dashed border-amber-500/50 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="h-4 w-4 text-amber-500" />
          Configuración de Vueltas (Circuito)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lapsConfigurations.map(({ timingPoint, checkpoints: laps }) => (
          <div key={timingPoint.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-background">
                <MapPin className="h-3 w-3 mr-1" />
                {timingPoint.name}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {laps.length} pasos configurados
              </span>
            </div>

            {/* Visual timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-3 bottom-3 w-0.5 bg-gradient-to-b from-amber-500 via-amber-500 to-amber-500/30" />

              <div className="space-y-2">
                {laps.map((cp, index) => (
                  <div key={cp.id} className="relative flex items-start gap-3 pl-0">
                    {/* Lap indicator */}
                    <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-sm font-bold shadow-md">
                      {index + 1}
                    </div>

                    {/* Checkpoint info */}
                    <div className="flex-1 rounded-lg bg-background/80 border p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{cp.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            LAP {cp.expected_laps || index + 1}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Km {cp.distance_km.toFixed(1)}
                        </span>
                      </div>

                      {/* Time windows */}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Min: {formatTime(cp.min_time)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Max: {formatTime(cp.max_time)}</span>
                        </div>
                        {cp.min_lap_time && (
                          <div className="flex items-center gap-1">
                            <RotateCcw className="h-3 w-3" />
                            <span>Min vuelta: {formatTime(cp.min_lap_time)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
              💡 Cada paso por <strong>{timingPoint.name}</strong> se diferencia por su ventana de tiempo (min/max).
              Asegúrate de que los rangos no se solapen.
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
