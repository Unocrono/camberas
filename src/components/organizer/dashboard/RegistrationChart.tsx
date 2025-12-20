import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, eachDayOfInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface RegistrationChartProps {
  raceId: string;
}

interface ChartData {
  date: string;
  displayDate: string;
  inscripciones: number;
}

export function RegistrationChart({ raceId }: RegistrationChartProps) {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const endDate = new Date();
        const startDate = subDays(endDate, 30);

        const { data: registrations, error } = await supabase
          .from("registrations")
          .select("created_at")
          .eq("race_id", raceId)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        if (error) throw error;

        // Create a map for each day
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        const countMap = new Map<string, number>();
        
        days.forEach(day => {
          countMap.set(format(day, "yyyy-MM-dd"), 0);
        });

        registrations?.forEach(reg => {
          const day = format(parseISO(reg.created_at), "yyyy-MM-dd");
          countMap.set(day, (countMap.get(day) || 0) + 1);
        });

        const chartData: ChartData[] = days.map(day => ({
          date: format(day, "yyyy-MM-dd"),
          displayDate: format(day, "d MMM", { locale: es }),
          inscripciones: countMap.get(format(day, "yyyy-MM-dd")) || 0,
        }));

        setData(chartData);
      } catch (error) {
        console.error("Error fetching chart data:", error);
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
          <CardTitle className="text-base">Evolución de Inscripciones (30 días)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evolución de Inscripciones (30 días)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="displayDate" 
                tick={{ fontSize: 10 }} 
                interval="preserveStartEnd"
                className="text-muted-foreground"
              />
              <YAxis 
                allowDecimals={false} 
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--card))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar 
                dataKey="inscripciones" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
                name="Inscripciones"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
