import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Euro, Users, Gift, Clock } from "lucide-react";

interface Metrics {
  totalRevenue: number;
  totalRegistrations: number;
  pendingRegistrations: number;
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
        // Misma fuente que la app /org: el RPC suma los COBROS REALES de
        // payment_intents. Antes se multiplicaba el precio base del
        // recorrido por el nº de inscritos, y eso se perdía las tarifas
        // por tramos y los suplementos del formulario (455€ vs 470€
        // reales en la Peña Prieta).
        const { data, error } = await (supabase as any).rpc(
          "get_organizer_race_summary",
          { p_race_id: raceId },
        );

        if (error) throw error;

        const s = data as {
          total_registrations: number;
          paid_registrations: number;
          pending_registrations?: number;
          revenue_total: number;
        };

        setMetrics({
          totalRevenue: s.revenue_total ?? 0,
          totalRegistrations: s.total_registrations ?? 0,
          pendingRegistrations: s.pending_registrations ?? 0,
          // Inscrito con pago resuelto que no pagó = gratuita
          freeRegistrations: Math.max(
            0,
            (s.total_registrations ?? 0) - (s.paid_registrations ?? 0),
          ),
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
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
      label: "Pendientes de Pago",
      value: metrics?.pendingRegistrations || 0,
      prefix: "",
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Inscripciones Gratuitas",
      value: metrics?.freeRegistrations || 0,
      prefix: "",
      icon: Gift,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
