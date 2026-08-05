/**
 * Recorridos — resumen rápido de los eventos de la carrera.
 * Pantalla PROPIA de Camberas Org (formato móvil, solo lectura):
 * km, desnivel, hora de salida (cajones), plazas y ocupación.
 * Para EDITAR recorridos: panel de escritorio.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, MapPin, Users } from "lucide-react";

interface DistanceRow {
  id: string;
  name: string;
  distance_km: number;
  elevation_gain: number | null;
  max_participants: number | null;
  start_location: string | null;
}

interface WaveRow {
  race_distance_id: string;
  wave_name: string;
  start_time: string | null;
}

interface Props {
  raceId: string | null;
  /** Ocupación por recorrido, del RPC del informe de la portada */
  byDistance: { distance_id: string; count: number }[];
}

/** "HH:MM:SS" o timestamp → "HH:MM" */
const formatTime = (t: string | null): string | null => {
  if (!t) return null;
  if (t.includes("T")) {
    return new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  return t.slice(0, 5);
};

export const OrgDistancesSummary = ({ raceId, byDistance }: Props) => {
  const [distances, setDistances] = useState<DistanceRow[] | null>(null);
  const [waves, setWaves] = useState<WaveRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!raceId) return;
    setDistances(null);
    setError(null);
    const load = async () => {
      const [d, w] = await Promise.all([
        supabase
          .from("race_distances")
          .select("id, name, distance_km, elevation_gain, max_participants, start_location")
          .eq("race_id", raceId)
          .order("display_order", { ascending: true })
          .order("distance_km", { ascending: true }),
        supabase
          .from("race_waves")
          .select("race_distance_id, wave_name, start_time")
          .eq("race_id", raceId)
          .order("start_time", { ascending: true }),
      ]);
      if (d.error) {
        setError(d.error.message);
        setDistances([]);
        return;
      }
      setDistances(d.data || []);
      setWaves(w.data || []);
    };
    load();
  }, [raceId]);

  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }
  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">No se pudieron cargar los eventos: {error}</p>;
  }
  if (distances === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }
  if (distances.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Esta carrera no tiene eventos todavía.</p>;
  }

  const countByDistance = new Map(byDistance.map((d) => [d.distance_id, d.count]));

  return (
    <div className="space-y-3">
      {distances.map((d) => {
        const count = countByDistance.get(d.id) ?? 0;
        const dWaves = waves.filter((w) => w.race_distance_id === d.id && w.start_time);
        const left = d.max_participants !== null ? Math.max(0, d.max_participants - count) : null;
        const pct = d.max_participants ? Math.min(100, Math.round((count / d.max_participants) * 100)) : null;
        return (
          <div key={d.id} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-archivo uppercase leading-tight">{d.name}</p>
              <p className="shrink-0 text-sm text-muted-foreground">
                {d.distance_km} km{d.elevation_gain ? ` · +${d.elevation_gain} m` : ""}
              </p>
            </div>

            {/* Salida: hora de cada cajón (o del único) */}
            {dWaves.length > 0 && (
              <p className="flex items-center gap-1.5 text-sm">
                <Clock className="h-4 w-4 shrink-0 text-secondary" />
                {dWaves.length === 1
                  ? `Salida ${formatTime(dWaves[0].start_time)}`
                  : dWaves.map((w) => `${w.wave_name} ${formatTime(w.start_time)}`).join(" · ")}
              </p>
            )}
            {d.start_location && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 text-secondary" />
                {d.start_location}
              </p>
            )}

            {/* Ocupación */}
            <div>
              <p className="flex items-center gap-1.5 text-sm">
                <Users className="h-4 w-4 shrink-0 text-secondary" />
                {count}
                {d.max_participants ? ` / ${d.max_participants}` : ""} inscritos
                {left !== null ? ` · quedan ${left}` : ""}
              </p>
              {pct !== null && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : "bg-secondary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
