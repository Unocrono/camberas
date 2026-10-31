/**
 * Resultados › Importar de RaceTec: trae los tiempos de meta del evento por
 * la API de RaceTec (Edge Function racetec-importar) y los mete en
 * race_results casando por dorsal con las inscripciones de la distancia.
 *
 * La API key la pega quien importa y no se guarda en ningún sitio: RaceTec da
 * una por carrera y cambia cada año.
 */

import { useState } from "react";
import { Download, Loader2, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Evento {
  eid: string;
  nombre: string;
}

interface Resumen {
  total_racetec: number;
  importados: number;
  nuevos: number;
  actualizados: number;
  sin_dorsal: string[];
  sin_tiempo: string[];
}

interface Props {
  raceDistanceId: string;
  distanceName?: string;
  /** Se llama tras una importación con éxito para recargar la tabla. */
  onImported: () => void;
}

export function RaceTecImportDialog({ raceDistanceId, distanceName, onImported }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [carrera, setCarrera] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eid, setEid] = useState("");
  const [cargando, setCargando] = useState<"eventos" | "importar" | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const llamar = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    const { data, error } = await supabase.functions.invoke("racetec-importar", { body });
    const fallo = error?.message ?? (data as { error?: string } | null)?.error;
    if (fallo) {
      toast({ title: "RaceTec no responde", description: fallo, variant: "destructive" });
      return null;
    }
    return data as T;
  };

  const buscarEventos = async () => {
    setCargando("eventos");
    setResumen(null);
    const r = await llamar<{ carrera: string | null; eventos: Evento[] }>({ accion: "eventos", api_key: apiKey });
    setCargando(null);
    if (!r) return;
    setCarrera(r.carrera);
    setEventos(r.eventos);
    setEid(r.eventos.length === 1 ? r.eventos[0].eid : "");
  };

  const importar = async () => {
    setCargando("importar");
    const r = await llamar<Resumen>({ accion: "importar", api_key: apiKey, eid, race_distance_id: raceDistanceId });
    setCargando(null);
    if (!r) return;
    setResumen(r);
    if (r.importados > 0) {
      toast({ title: "Resultados importados", description: `${r.nuevos} nuevos y ${r.actualizados} actualizados.` });
      onImported();
    }
  };

  const reset = () => {
    setApiKey("");
    setCarrera(null);
    setEventos([]);
    setEid("");
    setResumen(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2" disabled={!raceDistanceId}>
          <Radio className="h-4 w-4" />
          Importar de RaceTec
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar resultados de RaceTec</DialogTitle>
          <DialogDescription>
            Trae los tiempos de meta por la API y los casa por dorsal con las inscripciones
            {distanceName ? ` de ${distanceName}` : ""}. Los que ya tengan resultado se actualizan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rt-key">API key del evento en RaceTec</Label>
            <div className="flex gap-2">
              <Input
                id="rt-key"
                type="password"
                autoComplete="off"
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={buscarEventos} disabled={!apiKey.trim() || cargando !== null}>
                {cargando === "eventos" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">No se guarda: solo se usa para esta importación.</p>
          </div>

          {eventos.length > 0 && (
            <div className="space-y-2">
              <Label>Evento{carrera ? ` · ${carrera}` : ""}</Label>
              <Select value={eid} onValueChange={setEid}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige el evento (EId)" />
                </SelectTrigger>
                <SelectContent>
                  {eventos.map((e) => (
                    <SelectItem key={e.eid} value={e.eid}>
                      {e.nombre || "Sin nombre"} · EId {e.eid}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {resumen && (
            <Alert>
              <AlertTitle>
                {resumen.importados} de {resumen.total_racetec} resultados importados
              </AlertTitle>
              <AlertDescription className="space-y-1 text-sm">
                <p>
                  {resumen.nuevos} nuevos · {resumen.actualizados} actualizados
                </p>
                {resumen.sin_dorsal.length > 0 && (
                  <p>
                    Dorsales de RaceTec sin inscripción en esta distancia ({resumen.sin_dorsal.length}):{" "}
                    {resumen.sin_dorsal.slice(0, 30).join(", ")}
                    {resumen.sin_dorsal.length > 30 ? "…" : ""}
                  </p>
                )}
                {resumen.sin_tiempo.length > 0 && (
                  <p>Sin tiempo de meta todavía ({resumen.sin_tiempo.length}): en carrera o retirados.</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={importar} disabled={!eid || cargando !== null}>
              {cargando === "importar" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Importar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
