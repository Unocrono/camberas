import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface RunnersWithoutBibProps {
  raceId: string;
}

export function RunnersWithoutBib({ raceId }: RunnersWithoutBibProps) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data: registrations, error } = await supabase
          .from("registrations")
          .select("id, bib_number")
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"]);

        if (error) throw error;

        const totalCount = registrations?.length || 0;
        const withoutBib = registrations?.filter(r => !r.bib_number).length || 0;

        setTotal(totalCount);
        setCount(withoutBib);
      } catch (error) {
        console.error("Error fetching bib data:", error);
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
          <CardTitle className="text-base">Corredores sin Dorsal</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasIssue = count > 0;

  return (
    <Card className={hasIssue ? "border-amber-500/50" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {hasIssue && <AlertTriangle className="w-4 h-4 text-amber-500" />}
          Corredores sin Dorsal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Badge variant={hasIssue ? "destructive" : "secondary"} className="text-lg px-4 py-2">
            {count}
          </Badge>
          <span className="text-sm text-muted-foreground">
            de {total} inscritos
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
