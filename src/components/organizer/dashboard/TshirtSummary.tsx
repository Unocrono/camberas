import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface TshirtSummaryProps {
  raceId: string;
}

interface SizeData {
  size: string;
  count: number;
}

export function TshirtSummary({ raceId }: TshirtSummaryProps) {
  const [data, setData] = useState<SizeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Get registrations
        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select("id")
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"]);

        if (regError) throw regError;

        const regIds = registrations?.map(r => r.id) || [];

        // Get tshirt size responses
        const { data: responses, error: respError } = await supabase
          .from("registration_responses")
          .select(`
            field_value,
            field:registration_form_fields!inner(field_name)
          `)
          .in("registration_id", regIds);

        if (respError) throw respError;

        const sizeMap = new Map<string, number>();
        const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

        responses?.forEach(resp => {
          if ((resp.field as any)?.field_name === "tshirt_size") {
            const size = resp.field_value;
            sizeMap.set(size, (sizeMap.get(size) || 0) + 1);
          }
        });

        const result: SizeData[] = Array.from(sizeMap.entries())
          .map(([size, count]) => ({ size, count }))
          .sort((a, b) => {
            const aIndex = sizeOrder.indexOf(a.size);
            const bIndex = sizeOrder.indexOf(b.size);
            if (aIndex === -1 && bIndex === -1) return a.size.localeCompare(b.size);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          });

        setData(result);
      } catch (error) {
        console.error("Error fetching tshirt data:", error);
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
          <CardTitle className="text-base">Tallas de Camiseta</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tallas de Camiseta</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos de tallas</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.map((item) => (
              <Badge key={item.size} variant="secondary" className="text-sm px-3 py-1">
                {item.size}: <span className="font-bold ml-1">{item.count}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
