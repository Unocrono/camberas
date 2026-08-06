/**
 * Resultados — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * Consulta pura: clasificación por evento con búsqueda, el último
 * parcial de cada corredor (oro el día de carrera: "va por el km X")
 * y los estados FIN/DNF/DNS/DSQ/CUT. La edición, importación y
 * publicación de resultados viven en el panel de escritorio.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Trophy } from "lucide-react";

interface DistanceOption {
  id: string;
  name: string;
}

interface ResultRow {
  id: string;
  finish_time: string;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  status: string;
  registration: {
    bib_number: number | null;
    first_name: string | null;
    last_name: string | null;
    race_category: { short_name: string | null } | null;
  } | null;
}

interface Props {
  raceId: string | null;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DNF: { label: "DNF", className: "bg-destructive/15 text-destructive" },
  DNS: { label: "DNS", className: "bg-muted text-muted-foreground" },
  DSQ: { label: "DSQ", className: "bg-amber-500/15 text-amber-600" },
  CUT: { label: "CUT", className: "bg-amber-500/15 text-amber-600" },
};

/** "01:23:45.0" → "1:23:45" */
const formatTime = (t: string | null): string => {
  if (!t) return "—";
  const clean = t.split(".")[0];
  return clean.replace(/^0(\d):/, "$1:");
};

export const OrgResults = ({ raceId }: Props) => {
  const [distances, setDistances] = useState<DistanceOption[] | null>(null);
  const [distanceId, setDistanceId] = useState("");
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [lastSplits, setLastSplits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Eventos de la carrera; con uno solo, directo
  useEffect(() => {
    if (!raceId) return;
    setDistances(null);
    setDistanceId("");
    setResults(null);
    supabase
      .from("race_distances")
      .select("id, name")
      .eq("race_id", raceId)
      .order("distance_km", { ascending: true })
      .then(({ data }) => {
        const opts = (data || []) as DistanceOption[];
        setDistances(opts);
        if (opts.length > 0) setDistanceId(opts[0].id);
      });
  }, [raceId]);

  // Clasificación del evento elegido
  useEffect(() => {
    if (!distanceId) return;
    setResults(null);
    setError(null);
    let cancelled = false;

    const load = async () => {
      const { data, error: err } = await supabase
        .from("race_results")
        .select(`
          id, finish_time, overall_position, gender_position, category_position, status,
          registration:registrations (
            bib_number, first_name, last_name,
            race_category:race_categories (short_name)
          )
        `)
        .eq("race_distance_id", distanceId)
        .order("status", { ascending: true })
        .order("overall_position", { ascending: true, nullsFirst: false })
        .order("finish_time", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setResults([]);
        return;
      }
      const rows = (data || []) as unknown as ResultRow[];
      setResults(rows);

      // Último parcial de cada resultado ("va por el km X")
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const splits: Record<string, string> = {};
        for (let i = 0; i < ids.length; i += 500) {
          const { data: splitsData } = await supabase
            .from("split_times")
            .select("race_result_id, checkpoint_name, checkpoint_order")
            .in("race_result_id", ids.slice(i, i + 500))
            .order("checkpoint_order", { ascending: false });
          for (const s of splitsData || []) {
            if (!splits[s.race_result_id]) splits[s.race_result_id] = s.checkpoint_name;
          }
        }
        if (!cancelled) setLastSplits(splits);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [distanceId]);

  const filtrados = useMemo(() => {
    if (!results) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return results;
    return results.filter((r) => {
      const reg = r.registration;
      return [
        `${reg?.first_name ?? ""} ${reg?.last_name ?? ""}`,
        reg?.bib_number?.toString(),
      ].some((campo) => (campo || "").toLowerCase().includes(q));
    });
  }, [results, busqueda]);

  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
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

  return (
    <div className="space-y-3">
      {/* Evento */}
      {distances.length > 1 && (
        <Select value={distanceId} onValueChange={setDistanceId}>
          <SelectTrigger>
            <SelectValue placeholder="Evento" />
          </SelectTrigger>
          <SelectContent className="bg-background">
            {distances.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Buscar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o dorsal…"
          className="pl-9"
        />
      </div>

      {error && (
        <p className="py-4 text-center text-sm text-destructive">No se pudieron cargar los resultados: {error}</p>
      )}
      {!error && results === null && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-secondary" />
        </div>
      )}
      {!error && results !== null && filtrados.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {results.length === 0 ? "Aún no hay resultados en este evento." : "Nadie coincide con la búsqueda."}
        </p>
      )}

      {/* Clasificación */}
      {filtrados.length > 0 && (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtrados.map((r) => {
            const reg = r.registration;
            const st = STATUS_LABEL[r.status?.toUpperCase() ?? ""];
            return (
              <div key={r.id} className="flex items-center gap-2.5 px-3 py-2.5">
                {/* Posición (o estado) */}
                <span className="w-9 shrink-0 text-center">
                  {st ? (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${st.className}`}>{st.label}</span>
                  ) : r.overall_position === 1 ? (
                    <Trophy className="mx-auto h-4 w-4 text-amber-500" />
                  ) : (
                    <span className="font-archivo text-sm">{r.overall_position ?? "—"}</span>
                  )}
                </span>
                <span className="w-9 shrink-0 text-center font-archivo text-sm text-primary">
                  {reg?.bib_number ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {reg?.first_name} {reg?.last_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {reg?.race_category?.short_name ? `${reg.race_category.short_name}` : ""}
                    {r.category_position ? ` ${r.category_position}º cat.` : ""}
                    {lastSplits[r.id] ? ` · último paso: ${lastSplits[r.id]}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-archivo text-sm">
                  {st ? "" : formatTime(r.finish_time)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Editar, importar o publicar resultados: panel de escritorio.
      </p>
    </div>
  );
};
