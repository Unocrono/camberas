/**
 * Inscripciones — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * Las gestiones de móvil, con el corredor delante o al teléfono:
 * buscar (nombre, dorsal, DNI, email), ver la ficha, marcar pagado y
 * asignar dorsal. La edición completa, los borrados y los exports
 * viven en el panel de escritorio.
 *
 * Mismas tablas que el panel: registrations (+ race_distances para el
 * nombre del recorrido). La RLS del organizador ya permite leer y
 * actualizar las de sus carreras.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Search, Phone, Mail, ChevronDown, CheckCircle2, Hash,
} from "lucide-react";

interface RegistrationRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dni_passport: string | null;
  bib_number: number | null;
  payment_status: string;
  status: string;
  race_distance_id: string;
  tshirt_size: string | null;
  club: string | null;
  source: string | null;
  created_at: string;
}

interface DistanceOption {
  id: string;
  name: string;
}

interface Props {
  raceId: string | null;
}

type PayFilter = "todas" | "pendientes" | "pagadas";

const SOURCE_LABEL: Record<string, string> = {
  gateway: "Pasarela",
  manual: "Alta manual",
  free: "Gratuita",
};

/** Pagada o gratuita = pago resuelto (mismo criterio que los informes) */
const isPaid = (r: RegistrationRow) =>
  r.payment_status === "paid" || r.payment_status === "not_required";

export const OrgRegistrations = ({ raceId }: Props) => {
  const { toast } = useToast();

  const [rows, setRows] = useState<RegistrationRow[] | null>(null);
  const [distances, setDistances] = useState<DistanceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("todas");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [bibDraft, setBibDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    if (!raceId) return;
    setError(null);
    // Paginado: el límite por defecto de Supabase son 1.000 filas y una
    // carrera grande las pasa
    const all: RegistrationRow[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error: err } = await supabase
        .from("registrations")
        .select(
          "id, first_name, last_name, email, phone, dni_passport, bib_number, payment_status, status, race_distance_id, tshirt_size, club, source, created_at",
        )
        .eq("race_id", raceId)
        .neq("status", "cancelled")
        .order("bib_number", { ascending: true, nullsFirst: false })
        .range(from, from + pageSize - 1);
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      all.push(...((data || []) as RegistrationRow[]));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
  };

  useEffect(() => {
    if (!raceId) return;
    setRows(null);
    setAbierto(null);
    cargar();
    supabase
      .from("race_distances")
      .select("id, name")
      .eq("race_id", raceId)
      .then(({ data }) => setDistances((data || []) as DistanceOption[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceId]);

  const distanceName = (id: string) => distances.find((d) => d.id === id)?.name || "";

  const filtradas = useMemo(() => {
    if (!rows) return [];
    const q = busqueda.trim().toLowerCase();
    return rows.filter((r) => {
      if (payFilter === "pendientes" && isPaid(r)) return false;
      if (payFilter === "pagadas" && !isPaid(r)) return false;
      if (!q) return true;
      return [
        `${r.first_name ?? ""} ${r.last_name ?? ""}`,
        r.dni_passport,
        r.email,
        r.bib_number?.toString(),
      ].some((campo) => (campo || "").toLowerCase().includes(q));
    });
  }, [rows, busqueda, payFilter]);

  const marcarPagado = async (r: RegistrationRow) => {
    setSaving(true);
    const { error: err } = await supabase
      .from("registrations")
      .update({ payment_status: "paid", status: "confirmed" })
      .eq("id", r.id);
    setSaving(false);
    if (err) {
      toast({ title: "No se pudo marcar", description: err.message, variant: "destructive" });
      return;
    }
    toast({ title: `${r.first_name ?? ""} ${r.last_name ?? ""} marcado como pagado` });
    cargar();
  };

  const guardarDorsal = async (r: RegistrationRow) => {
    const bib = bibDraft.trim() ? parseInt(bibDraft.trim()) : null;
    if (bibDraft.trim() && Number.isNaN(bib)) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("registrations")
      .update({ bib_number: bib })
      .eq("id", r.id);
    setSaving(false);
    if (err) {
      toast({ title: "No se pudo guardar el dorsal", description: err.message, variant: "destructive" });
      return;
    }
    toast({ title: bib ? `Dorsal ${bib} asignado` : "Dorsal quitado" });
    cargar();
  };

  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }
  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">No se pudieron cargar las inscripciones: {error}</p>;
  }
  if (rows === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }

  const pendientes = rows.filter((r) => !isPaid(r)).length;

  return (
    <div className="space-y-3">
      {/* Buscar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre, dorsal, DNI o email…"
          className="pl-9"
        />
      </div>

      {/* Filtro de pago */}
      <div className="grid grid-cols-3 gap-1 rounded-full border border-border bg-card p-1 text-center text-xs font-bold uppercase">
        {(
          [
            ["todas", `Todas (${rows.length})`],
            ["pagadas", `Pagadas (${rows.length - pendientes})`],
            ["pendientes", `Sin pagar (${pendientes})`],
          ] as [PayFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPayFilter(key)}
            className={`rounded-full py-1.5 transition-colors ${
              payFilter === key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "Aún no hay inscripciones." : "Nadie coincide con el filtro."}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtradas.map((r) => {
            const expandido = abierto === r.id;
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(expandido ? null : r.id);
                    setBibDraft(r.bib_number?.toString() ?? "");
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="w-10 shrink-0 text-center font-archivo text-sm text-primary">
                      {r.bib_number ?? "—"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {r.first_name} {r.last_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{distanceName(r.race_distance_id)}</p>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-xs font-bold ${
                        r.payment_status === "paid"
                          ? "text-secondary"
                          : r.payment_status === "not_required"
                            ? "text-primary"
                            : "text-amber-600"
                      }`}
                    >
                      {r.payment_status === "paid" ? "Pagado" : r.payment_status === "not_required" ? "Gratis" : "Pendiente"}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${expandido ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>

                {expandido && (
                  <div className="space-y-3 border-t border-border/60 bg-muted/30 px-4 py-3 text-sm">
                    {/* Ficha */}
                    <div className="space-y-1 text-muted-foreground">
                      {r.dni_passport && <p>DNI: <span className="text-foreground">{r.dni_passport}</span></p>}
                      {r.tshirt_size && <p>Talla: <span className="text-foreground">{r.tshirt_size}</span></p>}
                      {r.club && <p>Club: <span className="text-foreground">{r.club}</span></p>}
                      <p>
                        Origen: <span className="text-foreground">{SOURCE_LABEL[r.source ?? ""] ?? r.source ?? "—"}</span>
                        {" · "}
                        {new Date(r.created_at).toLocaleDateString("es-ES")}
                      </p>
                    </div>

                    {/* Contacto directo */}
                    <div className="flex gap-2">
                      {r.phone && (
                        <a
                          href={`tel:${r.phone}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background py-1.5 text-xs font-bold text-secondary"
                        >
                          <Phone className="h-3.5 w-3.5" /> Llamar
                        </a>
                      )}
                      {r.email && (
                        <a
                          href={`mailto:${r.email}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background py-1.5 text-xs font-bold text-secondary"
                        >
                          <Mail className="h-3.5 w-3.5" /> Email
                        </a>
                      )}
                    </div>

                    {/* Dorsal */}
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 shrink-0 text-secondary" />
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={bibDraft}
                        onChange={(e) => setBibDraft(e.target.value)}
                        placeholder="Dorsal"
                        className="h-8 flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving || bibDraft === (r.bib_number?.toString() ?? "")}
                        onClick={() => guardarDorsal(r)}
                      >
                        Guardar
                      </Button>
                    </div>

                    {/* Pago */}
                    {!isPaid(r) && (
                      <Button size="sm" className="w-full gap-1.5" disabled={saving} onClick={() => marcarPagado(r)}>
                        <CheckCircle2 className="h-4 w-4" />
                        Marcar como pagado
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Edición completa, borrados y exports: Inscripciones del panel de escritorio.
      </p>
    </div>
  );
};
