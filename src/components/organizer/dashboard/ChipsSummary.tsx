import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu } from "lucide-react";

interface ChipsSummaryProps {
  raceId: string;
}

interface ChipData {
  bib_number: number;
  chip_code: string;
}

export function ChipsSummary({ raceId }: ChipsSummaryProps) {
  const [chips, setChips] = useState<ChipData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data, error, count } = await supabase
          .from("bib_chips")
          .select("bib_number, chip_code", { count: "exact" })
          .eq("race_id", raceId)
          .order("bib_number", { ascending: true })
          .limit(3);

        if (error) throw error;

        setChips(data || []);
        setTotal(count || 0);
      } catch (error) {
        console.error("Error fetching chips:", error);
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
            <Cpu className="w-4 h-4" />
            Chips RFID
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
            <Cpu className="w-4 h-4 text-primary" />
            Chips RFID
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Total: {total}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {chips.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin chips</p>
        ) : (
          <div className="space-y-1.5">
            {chips.map((chip, idx) => (
              <div key={idx} className="text-xs flex items-center justify-between gap-2">
                <span className="font-medium">#{chip.bib_number}</span>
                <span className="truncate text-muted-foreground font-mono">
                  {chip.chip_code}
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
