/**
 * Estadísticas — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * Dos bloques: inscritos por evento (ocupación y recaudación, del mismo
 * RPC del informe de la portada) y tallas de camisetas para el pedido
 * al proveedor. Las tallas usan EL MISMO criterio que el panel de
 * escritorio: respuestas del formulario (registration_responses) de
 * inscripciones confirmadas; si el formulario no tiene campo de talla,
 * cae a la columna tshirt_size de registrations.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Shirt } from "lucide-react";

/** Orden de tallas del pedido; lo que no encaje se lista al final */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

interface DistanceSummary {
  distance_id: string;
  name: string;
  count: number;
  paid: number;
  revenue: number;
  max_participants: number | null;
}

interface Props {
  raceId: string | null;
  byDistance: DistanceSummary[];
}

const euro = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const OrgStats = ({ raceId, byDistance }: Props) => {
  // Talla → unidades (global de la carrera)
  const [sizes, setSizes] = useState<Record<string, number> | null>(null);
  const [sizesError, setSizesError] = useState<string | null>(null);

  useEffect(() => {
    if (!raceId) return;
    setSizes(null);
    setSizesError(null);
    let cancelled = false;

    const load = async () => {
      try {
        // Inscripciones confirmadas de la carrera (id + talla de columna)
        const regs: { id: string; tshirt_size: string | null }[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("registrations")
            .select("id, tshirt_size")
            .eq("race_id", raceId)
            .eq("status", "confirmed")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          regs.push(...((data || []) as typeof regs));
          if (!data || data.length < pageSize) break;
          from += pageSize;
        }

        // Campos tshirt_size del formulario de esta carrera
        const { data: dists } = await supabase
          .from("race_distances")
          .select("id")
          .eq("race_id", raceId);
        const distIds = (dists || []).map((d) => d.id);
        const { data: fields } = distIds.length
          ? await supabase
              .from("registration_form_fields")
              .select("id")
              .eq("field_name", "tshirt_size")
              .in("race_distance_id", distIds)
          : { data: [] as { id: string }[] };

        const counts: Record<string, number> = {};
        const counted = new Set<string>();

        // 1º las respuestas del formulario (criterio del panel)
        if (fields && fields.length > 0 && regs.length > 0) {
          const fieldIds = fields.map((f) => f.id);
          const regIds = regs.map((r) => r.id);
          // in() con miles de ids se parte en lotes
          for (let i = 0; i < regIds.length; i += 500) {
            const { data: responses } = await supabase
              .from("registration_responses")
              .select("registration_id, field_value")
              .in("field_id", fieldIds)
              .in("registration_id", regIds.slice(i, i + 500));
            for (const resp of responses || []) {
              const size = (resp.field_value || "").toUpperCase().trim();
              if (!size) continue;
              counts[size] = (counts[size] || 0) + 1;
              counted.add(resp.registration_id);
            }
          }
        }

        // 2º respaldo: la columna, para las que no tenían respuesta
        for (const r of regs) {
          if (counted.has(r.id)) continue;
          const size = (r.tshirt_size || "").toUpperCase().trim();
          if (!size) continue;
          counts[size] = (counts[size] || 0) + 1;
        }

        if (!cancelled) setSizes(counts);
      } catch (e: any) {
        if (!cancelled) setSizesError(e.message || "Error desconocido");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }

  const sizeEntries = sizes
    ? Object.entries(sizes).sort(([a], [b]) => {
        const ia = SIZE_ORDER.indexOf(a);
        const ib = SIZE_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
    : [];
  const totalShirts = sizeEntries.reduce((sum, [, n]) => sum + n, 0);
  const maxSize = Math.max(1, ...sizeEntries.map(([, n]) => n));

  return (
    <div className="space-y-5">
      {/* Inscritos por evento */}
      <section>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.14em] text-secondary">
          <Users className="h-4 w-4" /> Inscritos por evento
        </p>
        {byDistance.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin datos todavía.</p>
        ) : (
          <div className="space-y-2">
            {byDistance.map((d) => {
              const pct = d.max_participants
                ? Math.min(100, Math.round((d.count / d.max_participants) * 100))
                : null;
              return (
                <div key={d.distance_id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-archivo uppercase">{d.name}</p>
                    <p className="font-archivo text-lg text-secondary">{euro(d.revenue)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {d.count}
                    {d.max_participants ? ` / ${d.max_participants}` : ""} inscritos · {d.paid} pagados
                    {pct !== null ? ` · ${pct}% lleno` : ""}
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
              );
            })}
          </div>
        )}
      </section>

      {/* Tallas de camisetas */}
      <section>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.14em] text-secondary">
          <Shirt className="h-4 w-4" /> Tallas de camisetas
        </p>
        {sizesError ? (
          <p className="py-4 text-center text-sm text-destructive">No se pudieron cargar las tallas: {sizesError}</p>
        ) : sizes === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-secondary" />
          </div>
        ) : sizeEntries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ninguna inscripción confirmada tiene talla (o el formulario no la pide).
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="space-y-2">
              {sizeEntries.map(([size, n]) => (
                <div key={size} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-archivo text-sm uppercase">{size}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="flex h-full items-center rounded-full bg-secondary"
                      style={{ width: `${Math.max(8, Math.round((n / maxSize) * 100))}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-archivo text-sm">{n}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-border pt-2 text-right text-xs text-muted-foreground">
              Total: <span className="font-archivo text-sm text-foreground">{totalShirts}</span> camisetas
              (solo inscripciones confirmadas)
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
