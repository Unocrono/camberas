import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Euro, Users, Gift } from "lucide-react";

interface Metrics {
  totalRevenue: number;
  totalRegistrations: number;
  freeRegistrations: number;
}

interface RegistrationMetricsProps {
  raceId: string;
}

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const duration = 1000;
    const steps = 60;
    const stepValue = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(stepValue * step, value);
      setDisplayValue(Math.round(current));
      
      if (step >= steps) {
        clearInterval(timer);
        setDisplayValue(value);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  const formattedValue = prefix === "€" 
    ? displayValue.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : displayValue.toLocaleString("es-ES");

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{formattedValue}{suffix}
    </span>
  );
}

export function RegistrationMetrics({ raceId }: RegistrationMetricsProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      setLoading(true);
      try {
        // Get all registrations with their distance prices
        const { data: registrations, error } = await supabase
          .from("registrations")
          .select(`
            id,
            status,
            race_distance:race_distances!inner(price)
          `)
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"]);

        if (error) throw error;

        let totalRevenue = 0;
        let totalRegistrations = 0;
        let freeRegistrations = 0;

        registrations?.forEach((reg: any) => {
          totalRegistrations++;
          const price = reg.race_distance?.price || 0;
          totalRevenue += price;
          if (price === 0) {
            freeRegistrations++;
          }
        });

        setMetrics({
          totalRevenue,
          totalRegistrations,
          freeRegistrations,
        });
      } catch (error) {
        console.error("Error fetching metrics:", error);
      } finally {
        setLoading(false);
      }
    }

    if (raceId) {
      fetchMetrics();
    }
  }, [raceId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "Recaudación Total",
      value: metrics?.totalRevenue || 0,
      prefix: "€",
      icon: Euro,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Total Inscripciones",
      value: metrics?.totalRegistrations || 0,
      prefix: "",
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Inscripciones Gratuitas",
      value: metrics?.freeRegistrations || 0,
      prefix: "",
      icon: Gift,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card key={item.label} className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{item.label}</p>
                <p className="text-2xl font-bold">
                  <AnimatedNumber value={item.value} prefix={item.prefix === "€" ? "€" : ""} />
                </p>
              </div>
              <div className={`p-3 rounded-full ${item.bgColor}`}>
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
