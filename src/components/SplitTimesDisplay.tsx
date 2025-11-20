import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Timer, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SplitTime {
  id: string;
  checkpoint_name: string;
  checkpoint_order: number;
  split_time: any;
  distance_km: number;
}

interface SplitAnalysis {
  checkpoint_name: string;
  time: string;
  pace: string;
  segmentTime: string;
  segmentDistance: number;
  segmentPace: string;
  avgSegmentTime: number;
  performance: "faster" | "slower" | "average";
  percentile: number;
}

interface Props {
  raceResultId: string;
  totalDistance: number;
}

export default function SplitTimesDisplay({ raceResultId, totalDistance }: Props) {
  const [splitTimes, setSplitTimes] = useState<SplitTime[]>([]);
  const [analysis, setAnalysis] = useState<SplitAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSplitTimes();
  }, [raceResultId]);

  const fetchSplitTimes = async () => {
    try {
      setLoading(true);

      // Fetch split times for this result
      const { data: splits, error: splitsError } = await supabase
        .from("split_times")
        .select("*")
        .eq("race_result_id", raceResultId)
        .order("checkpoint_order");

      if (splitsError) throw splitsError;

      if (!splits || splits.length === 0) {
        setSplitTimes([]);
        setAnalysis([]);
        setLoading(false);
        return;
      }

      setSplitTimes(splits);

      // Get race_id from the result
      const { data: result } = await supabase
        .from("race_results")
        .select("registration:registrations!inner(race_id)")
        .eq("id", raceResultId)
        .single();

      if (!result) return;

      const raceId = (result.registration as any).race_id;

      // Fetch all split times for this race to calculate averages
      const { data: allSplits } = await supabase
        .from("race_results")
        .select(`
          id,
          split_times:split_times(*)
        `)
        .eq("registration.race_id", raceId);

      // Calculate analysis
      const analyzed = analyzeSplits(splits, allSplits || []);
      setAnalysis(analyzed);
    } catch (error) {
      console.error("Error fetching split times:", error);
    } finally {
      setLoading(false);
    }
  };

  const timeToSeconds = (timeStr: string): number => {
    const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return 0;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
  };

  const secondsToTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const calculatePace = (seconds: number, distanceKm: number): string => {
    if (distanceKm === 0) return "--:--";
    const paceSeconds = seconds / distanceKm;
    const m = Math.floor(paceSeconds / 60);
    const s = Math.floor(paceSeconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const analyzeSplits = (mySplits: SplitTime[], allResults: any[]): SplitAnalysis[] => {
    const analyzed: SplitAnalysis[] = [];
    let previousDistance = 0;
    let previousTime = 0;

    mySplits.forEach((split, index) => {
      const splitSeconds = timeToSeconds(split.split_time);
      const segmentDistance = split.distance_km - previousDistance;
      const segmentTime = splitSeconds - previousTime;

      // Calculate average segment time for this checkpoint
      const segmentTimes: number[] = [];
      allResults.forEach((result: any) => {
        const splits = result.split_times || [];
        const currentSplit = splits.find(
          (s: any) => s.checkpoint_order === split.checkpoint_order
        );
        const prevSplit = splits.find(
          (s: any) => s.checkpoint_order === split.checkpoint_order - 1
        );

        if (currentSplit) {
          const currSeconds = timeToSeconds(currentSplit.split_time);
          const prevSeconds = prevSplit ? timeToSeconds(prevSplit.split_time) : 0;
          segmentTimes.push(currSeconds - prevSeconds);
        }
      });

      const avgSegmentTime =
        segmentTimes.length > 0
          ? segmentTimes.reduce((a, b) => a + b, 0) / segmentTimes.length
          : segmentTime;

      // Determine performance
      let performance: "faster" | "slower" | "average" = "average";
      const deviation = ((segmentTime - avgSegmentTime) / avgSegmentTime) * 100;
      if (deviation < -5) performance = "faster";
      else if (deviation > 5) performance = "slower";

      // Calculate percentile
      const fasterCount = segmentTimes.filter((t) => t > segmentTime).length;
      const percentile = segmentTimes.length > 0
        ? Math.round((fasterCount / segmentTimes.length) * 100)
        : 50;

      analyzed.push({
        checkpoint_name: split.checkpoint_name,
        time: secondsToTime(splitSeconds),
        pace: calculatePace(splitSeconds, split.distance_km),
        segmentTime: secondsToTime(segmentTime),
        segmentDistance,
        segmentPace: calculatePace(segmentTime, segmentDistance),
        avgSegmentTime,
        performance,
        percentile,
      });

      previousDistance = split.distance_km;
      previousTime = splitSeconds;
    });

    return analyzed;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Loading split times...</p>
        </CardContent>
      </Card>
    );
  }

  if (splitTimes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            No split times available for this result.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Split Times Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {analysis.map((split, index) => (
              <div key={index} className="space-y-3 pb-6 border-b last:border-b-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{index + 1}</Badge>
                      <h4 className="font-semibold">{split.checkpoint_name}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {split.segmentDistance.toFixed(1)} km segment
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold">{split.time}</p>
                    <p className="text-sm text-muted-foreground">
                      {split.pace} /km avg
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Segment Time</p>
                    <p className="font-mono font-semibold">{split.segmentTime}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Segment Pace</p>
                    <p className="font-mono font-semibold">
                      {split.segmentPace} /km
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Performance vs Field
                    </span>
                    <div className="flex items-center gap-2">
                      {split.performance === "faster" && (
                        <>
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <Badge variant="default" className="bg-green-500">
                            Faster
                          </Badge>
                        </>
                      )}
                      {split.performance === "slower" && (
                        <>
                          <TrendingDown className="h-4 w-4 text-red-500" />
                          <Badge variant="destructive">Slower</Badge>
                        </>
                      )}
                      {split.performance === "average" && (
                        <>
                          <Minus className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="secondary">Average</Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Top {split.percentile}%</span>
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {split.percentile >= 75 ? "Excellent" : split.percentile >= 50 ? "Good" : "Keep Pushing"}
                      </span>
                    </div>
                    <Progress value={split.percentile} className="h-2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
