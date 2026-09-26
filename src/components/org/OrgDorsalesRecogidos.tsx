/**
 * Dorsales recogidos — pantalla PROPIA de Camberas Org (formato móvil),
 * dentro de Corredores.
 *
 * El organizador, el día de la recogida, con el móvil en la mano: cuántos
 * dorsales van entregados (en total y por recorrido), qué mesas están
 * atendiendo y la lista de entregas —quién, cuándo, en qué mesa y si recogió
 * otra persona—, con buscador para "¿ha pasado ya el 137?".
 *
 * Lee lo mismo que el panel (Mesas de recogida): mesas_recogida_carrera y
 * entregas_dorsal, cuya RLS deja leer al admin y al organizador de la
 * carrera. Se refresca sola cada 30 s.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2, Search, Ticket } from "lucide-react";
import { mesaAtendiendo, numerarMesas, textoMesa } from "@/lib/mesasRecogida";

interface Recorrido {
  distance_id: string;
  name: string;
  /** Inscripciones con el pago resuelto (pagadas o gratuitas): las que se entregan */
  count: number;
}

interface Mesa {
  id: string;
  nombre: string;
  activa: boolean;
  last_seen_at: string | null;
  created_at: string;
  entregados: number;
}

interface Entrega {
  id: string;
  entregado_at: string;
  recogido_por: string | null;
  mesa_id: string | null;
  registrations: {
    bib_number: number | null;
    first_name: string | null;
    last_name: string | null;
    race_distance_id: string | null;
  } | null;
}

interface Props {
  raceId: string | null;
  byDistance: Recorrido[];
}

const PAGINA = 1000; // tope de filas de PostgREST por consulta
const REFRESCO_MS = 30_000;

const hora = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  return hoy
    ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export const OrgDorsalesRecogidos = ({ raceId, byDistance }: Props) => {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const cargar = useCallback(async () => {
    if (!raceId) return;
    const { data: ms, error: errMesas } = await (supabase as any).rpc("mesas_recogida_carrera", {
      p_race_id: raceId,
    });
    if (errMesas) {
      setError(errMesas.message);
      setCargando(false);
      return;
    }
    const todas: Entrega[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error: err } = await supabase
        .from("entregas_dorsal")
        .select("id, entregado_at, recogido_por, mesa_id, registrations(bib_number, first_name, last_name, race_distance_id)")
        .eq("race_id", raceId)
        .order("entregado_at", { ascending: false })
        .range(desde, desde + PAGINA - 1);
      if (err) {
        setError(err.message);
        setCargando(false);
        return;
      }
      todas.push(...((data ?? []) as unknown as Entrega[]));
      if (!data || data.length < PAGINA) break;
    }
    setError(null);
    setMesas((ms ?? []) as Mesa[]);
    setEntregas(todas);
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    setCargando(true);
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const numeracion = useMemo(() => numerarMesas(mesas), [mesas]);
  const nombreMesa = (id: string | null) =>
    id && numeracion[id] ? textoMesa(numeracion[id].numero, numeracion[id].nombre) : "—";

  // Por recorrido: entregados / entregables
  const porRecorrido = useMemo(() => {
    const cuenta: Record<string, number> = {};
    for (const e of entregas) {
      const d = e.registrations?.race_distance_id;
      if (d) cuenta[d] = (cuenta[d] ?? 0) + 1;
    }
    return byDistance.map((d) => ({ ...d, entregados: cuenta[d.distance_id] ?? 0 }));
  }, [entregas, byDistance]);

  const total = byDistance.reduce((a, d) => a + d.count, 0);
  const pct = total > 0 ? Math.min(100, Math.round((entregas.length / total) * 100)) : 0;

  const corredor = (e: Entrega) =>
    [e.registrations?.first_name, e.registrations?.last_name].filter(Boolean).join(" ") || "Sin nombre";
  const recorridoDe = (e: Entrega) =>
    byDistance.find((d) => d.distance_id === e.registrations?.race_distance_id)?.name ?? "";

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return entregas;
    return entregas.filter((e) => {
      const dorsal = e.registrations?.bib_number != null ? String(e.registrations.bib_number) : "";
      return dorsal.startsWith(t) || corredor(e).toLowerCase().includes(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregas, texto]);

  if (!raceId) return null;

  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">No se pudo cargar la recogida: {error}</p>;
  }

  const mesasVivas = mesas.filter((m) => m.activa);

  return (
    <div className="space-y-4">
      {/* Cómo vamos: total y por recorrido */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-secondary">Recogidos</p>
            <p className="font-archivo text-4xl leading-none text-primary">
              {entregas.length}
              <span className="text-lg text-muted-foreground"> / {total}</span>
            </p>
          </div>
          <p className="font-archivo text-2xl text-muted-foreground">{pct}%</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {porRecorrido.length > 1 && (
          <div className="space-y-2 pt-1">
            {porRecorrido.map((d) => (
              <div key={d.distance_id} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{d.name}</span>
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">{d.entregados}</strong> / {d.count}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${d.count > 0 ? Math.min(100, (d.entregados / d.count) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mesas */}
      {mesasVivas.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-center space-y-1">
          <Ticket className="h-7 w-7 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay mesas de recogida abiertas. Se crean en el panel, en Organización › Mesas de recogida.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {mesasVivas.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{nombreMesa(m.id)}</p>
                <p className="text-xs text-muted-foreground">{m.entregados} entregados aquí</p>
              </div>
              {mesaAtendiendo(m.last_seen_at) ? (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase text-primary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Atendiendo
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold uppercase text-muted-foreground">
                  Sin señal
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Entregas */}
      {entregas.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Todavía no se ha entregado ningún dorsal.</p>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="¿Ha pasado ya? Dorsal o nombre…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-9 pr-3 text-base"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
            {filtradas.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-12 shrink-0 text-center font-mono text-lg font-bold">
                  {e.registrations?.bib_number ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{corredor(e)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[recorridoDe(e), hora(e.entregado_at), nombreMesa(e.mesa_id)].filter(Boolean).join(" · ")}
                  </p>
                  {e.recogido_por && (
                    <p className="truncate text-xs text-secondary">Recogió: {e.recogido_por}</p>
                  )}
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              </div>
            ))}
            {filtradas.length === 0 && (
              <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                No se ha entregado ningún dorsal que coincida con «{texto.trim()}».
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
