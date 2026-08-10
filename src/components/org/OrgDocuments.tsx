/**
 * Documentación — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * Versión resumida del módulo documental: el checklist de requisitos
 * (permisos, seguros, ETRAZA…) con su semáforo, cuánto queda para la
 * fecha límite y el documento entregado, que se puede abrir. Subir
 * ficheros, editar fechas y aprobar sigue en el panel de escritorio.
 *
 * Tablas: race_document_requirements + race_documents; el bucket
 * race-documents es PRIVADO, así que se abre con createSignedUrl.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileCheck2, AlertTriangle, Clock, CheckCircle2, ExternalLink } from "lucide-react";

// Tablas nuevas aún sin tipos generados
const db = supabase as any;

interface Requirement {
  id: string;
  category: string;
  title: string;
  days_before_race: number;
  is_required: boolean;
  display_order: number;
}

interface RaceDocument {
  id: string;
  requirement_id: string | null;
  title: string;
  file_path: string | null;
  status: string;
  expiry_date: string | null;
}

interface Props {
  raceId: string | null;
  /** Fecha de la carrera: la referencia de los plazos */
  raceDate?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  subido: "Subido",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  caducado: "Caducado",
};

/** caducado se deriva en cliente (igual que en el panel) */
const effectiveStatus = (doc: RaceDocument | undefined): string => {
  if (!doc) return "pendiente";
  if (doc.expiry_date && doc.expiry_date < new Date().toISOString().slice(0, 10)) return "caducado";
  return doc.status;
};

const STATUS_STYLE: Record<string, string> = {
  aprobado: "bg-secondary/15 text-secondary",
  en_revision: "bg-amber-500/15 text-amber-600",
  subido: "bg-muted text-foreground",
  rechazado: "bg-destructive/15 text-destructive",
  caducado: "bg-destructive/15 text-destructive",
  pendiente: "bg-muted text-muted-foreground",
};

export const OrgDocuments = ({ raceId, raceDate }: Props) => {
  const { toast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [documents, setDocuments] = useState<RaceDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!raceId) return;
    setRequirements(null);
    setError(null);
    const load = async () => {
      const [reqs, docs] = await Promise.all([
        db
          .from("race_document_requirements")
          .select("id, category, title, days_before_race, is_required, display_order")
          .eq("race_id", raceId)
          .order("display_order", { ascending: true }),
        db
          .from("race_documents")
          .select("id, requirement_id, title, file_path, status, expiry_date")
          .eq("race_id", raceId),
      ]);
      if (reqs.error) {
        setError(
          reqs.error.code === "42P01" || /does not exist/i.test(reqs.error.message || "")
            ? "Falta aplicar la migración de documentación (20260807110000) en Supabase."
            : reqs.error.message,
        );
        setRequirements([]);
        return;
      }
      setRequirements((reqs.data || []) as Requirement[]);
      setDocuments((docs.data || []) as RaceDocument[]);
    };
    load();
  }, [raceId]);

  /** El bucket es privado: hay que firmar la URL para abrir el fichero */
  const abrirDocumento = async (path: string) => {
    const { data, error: err } = await supabase.storage
      .from("race-documents")
      .createSignedUrl(path, 60);
    if (err || !data?.signedUrl) {
      toast({ title: "No se pudo abrir", description: err?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  /** Días que faltan para la fecha límite del requisito */
  const diasParaLimite = (req: Requirement): number | null => {
    if (!raceDate) return null;
    const limite = new Date(raceDate);
    limite.setDate(limite.getDate() - req.days_before_race);
    return Math.ceil((limite.getTime() - Date.now()) / 86400000);
  };

  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }
  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
  }
  if (requirements === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }
  if (requirements.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Esta carrera aún no tiene checklist documental. Se genera desde el panel de escritorio
        (Documentación → crear requisitos).
      </p>
    );
  }

  const docPorRequisito = new Map<string, RaceDocument>();
  for (const d of documents) {
    if (d.requirement_id && !docPorRequisito.has(d.requirement_id)) docPorRequisito.set(d.requirement_id, d);
  }

  const aprobados = requirements.filter(
    (r) => effectiveStatus(docPorRequisito.get(r.id)) === "aprobado",
  ).length;

  return (
    <div className="space-y-3">
      {/* Resumen: cuántos requisitos están cerrados */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <FileCheck2 className="h-4 w-4 text-secondary" /> Aprobados
        </span>
        <span className="font-archivo text-2xl text-secondary">
          {aprobados}/{requirements.length}
        </span>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {requirements.map((req) => {
          const doc = docPorRequisito.get(req.id);
          const status = effectiveStatus(doc);
          const dias = diasParaLimite(req);
          // Urgente: sin aprobar y quedan 7 días o menos (o ya pasó)
          const urgente = status !== "aprobado" && dias !== null && dias <= 7;
          return (
            <div key={req.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {req.title}
                    {!req.is_required && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(opcional)</span>
                    )}
                  </p>
                  {dias !== null && (
                    <p
                      className={`flex items-center gap-1 text-xs ${
                        urgente ? "font-bold text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {urgente ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {dias < 0
                        ? `Plazo vencido hace ${Math.abs(dias)} d`
                        : dias === 0
                          ? "El plazo vence hoy"
                          : `Quedan ${dias} días`}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[status] ?? STATUS_STYLE.pendiente}`}
                >
                  {status === "aprobado" && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                  {STATUS_LABELS[status] ?? status}
                </span>
              </div>
              {doc?.file_path && (
                <button
                  onClick={() => abrirDocumento(doc.file_path!)}
                  className="mt-1.5 flex items-center gap-1 text-xs font-bold text-secondary"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver documento
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Subir documentos, fechas y aprobaciones: panel de escritorio.
      </p>
    </div>
  );
};
