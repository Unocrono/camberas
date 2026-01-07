import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getGenderCode } from "@/lib/genderUtils";

interface GenderCategoryDistributionProps {
  raceId: string;
}

interface GenderData {
  gender: string;
  count: number;
}

export function GenderCategoryDistribution({ raceId }: GenderCategoryDistributionProps) {
  const [genderData, setGenderData] = useState<GenderData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Get registrations with gender_id directly
        const { data: registrations, error } = await supabase
          .from("registrations")
          .select(`
            id,
            gender_id
          `)
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"]);

        if (error) throw error;

        const genderMap = new Map<string, number>();

        registrations?.forEach(reg => {
          // Use gender_id to get the code (M/F/X)
          const genderCode = getGenderCode(reg.gender_id);
          genderMap.set(genderCode, (genderMap.get(genderCode) || 0) + 1);
        });

        const result: GenderData[] = Array.from(genderMap.entries())
          .map(([gender, count]) => ({ gender, count }))
          .sort((a, b) => b.count - a.count);

        setGenderData(result);
      } catch (error) {
        console.error("Error fetching gender distribution:", error);
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
          <CardTitle className="text-base">Distribución por Género</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = genderData.reduce((sum, d) => sum + d.count, 0);

  const getGenderColor = (gender: string) => {
    if (gender === "M") return "bg-blue-500/10 text-blue-700 border-blue-200";
    if (gender === "F") return "bg-pink-500/10 text-pink-700 border-pink-200";
    return "bg-muted text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Distribución por Género</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {genderData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos</p>
        ) : (
          genderData.map((item) => (
            <div key={item.gender} className="flex items-center justify-between">
              <Badge variant="outline" className={getGenderColor(item.gender)}>
                {item.gender}
              </Badge>
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
