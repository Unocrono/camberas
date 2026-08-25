import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftRight, Loader2 } from "lucide-react";

// Política de CESIÓN DE DORSAL de una carrera.
//
// Va aparte de la de cancelación a propósito: son cosas distintas y los
// organizadores ya las escriben distintas. El reglamento de Peña Prieta, sin
// ir más lejos, permite cancelar hasta el 15-sep y cambiar de titular hasta
// el 20-sep.
//
// Apagada por defecto: si el organizador no la enciende, para él no cambia
// nada. Y se guarda con UPSERT de una sola fila, nunca con el borra-todo-y
// -reinserta de la política de cancelación, que deja la carrera sin política
// en silencio si el insert falla.
//
// Tablas nuevas aún sin tipos generados
const db = supabase as any;

interface Props {
  raceId: string;
}

interface Cfg {
  permitida: boolean;
  fecha_limite: string;
  max_cesiones: number | "";
  texto_extra: string;
}

const VACIA: Cfg = { permitida: false, fecha_limite: "", max_cesiones: 1, texto_extra: "" };

export function CesionPolicyManagement({ raceId }: Props) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<Cfg>(VACIA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reglamentoPublicado, setReglamentoPublicado] = useState<boolean | null>(null);

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      const [{ data }, { data: reg }] = await Promise.all([
        db.from("race_cesion_config").select("*").eq("race_id", raceId).maybeSingle(),
        db.from("race_regulations").select("published").eq("race_id", raceId).maybeSingle(),
      ]);
      if (data) {
        setCfg({
          permitida: data.permitida ?? false,
          // datetime-local quiere 'YYYY-MM-DDTHH:mm'
          fecha_limite: data.fecha_limite ? String(data.fecha_limite).slice(0, 16) : "",
          max_cesiones: data.max_cesiones ?? 1,
          texto_extra: data.texto_extra ?? "",
        });
      } else {
        setCfg(VACIA);
      }
      setReglamentoPublicado(reg ? reg.published === true : false);
      setLoading(false);
    };
    cargar();
  }, [raceId]);

  const guardar = async () => {
    setSaving(true);
    try {
      const { error } = await db.from("race_cesion_config").upsert(
        {
          race_id: raceId,
          permitida: cfg.permitida,
          fecha_limite: cfg.fecha_limite ? new Date(cfg.fecha_limite).toISOString() : null,
          max_cesiones: Number(cfg.max_cesiones) || 1,
          texto_extra: cfg.texto_extra || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "race_id" },
      );
      if (error) throw error;
      toast({
        title: "Política guardada",
        description: cfg.permitida
          ? "Los inscritos ya pueden ceder su dorsal, y sale publicada en el reglamento"
          : "La cesión queda desactivada para esta carrera",
      });
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          Cesión de dorsal
        </CardTitle>
        <CardDescription>
          Permite que un inscrito que no puede correr pase su plaza a otra persona, con sus datos
          correctos y su aceptación del reglamento. Hoy eso ya ocurre por WhatsApp: la diferencia
          es que así te enteras y en meta corre quien figura en el seguro.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="cesion-permitida" className="text-base">
              Permitir la cesión en esta carrera
            </Label>
            <p className="text-sm text-muted-foreground">
              Desactivada, nada cambia para ti.
            </p>
          </div>
          <Switch
            id="cesion-permitida"
            checked={cfg.permitida}
            onCheckedChange={(v) => setCfg({ ...cfg, permitida: v })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cesion-fecha">Fecha límite</Label>
            <Input
              id="cesion-fecha"
              type="datetime-local"
              value={cfg.fecha_limite}
              onChange={(e) => setCfg({ ...cfg, fecha_limite: e.target.value })}
              disabled={!cfg.permitida}
            />
            <p className="text-xs text-muted-foreground">
              Ponla <strong>antes de imprimir los dorsales</strong>: a partir de ahí, un cambio de
              titular te obliga a reimprimir. Si la dejas vacía vale hasta la salida.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cesion-max">Cesiones por dorsal</Label>
            <Input
              id="cesion-max"
              type="number"
              min={1}
              value={cfg.max_cesiones}
              onChange={(e) =>
                setCfg({ ...cfg, max_cesiones: e.target.value === "" ? "" : Number(e.target.value) })
              }
              disabled={!cfg.permitida}
            />
            <p className="text-xs text-muted-foreground">
              Déjalo en 1 salvo que tengas un motivo. Más de una cesión por dorsal convierte esto
              en un mercado de reventa.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cesion-texto">Condiciones adicionales (opcional)</Label>
          <Textarea
            id="cesion-texto"
            rows={3}
            value={cfg.texto_extra}
            onChange={(e) => setCfg({ ...cfg, texto_extra: e.target.value })}
            disabled={!cfg.permitida}
            placeholder="Ej.: el cambio de titular no da derecho a cambiar de recorrido ni de talla de camiseta."
          />
          <p className="text-xs text-muted-foreground">
            Se publica tal cual en el apartado de cesión del reglamento.
          </p>
        </div>

        {cfg.permitida && reglamentoPublicado === false && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Esta carrera no tiene reglamento publicado. Quien reciba un dorsal aceptará solo los
            términos generales de Camberas, no tus condiciones. Publica el reglamento para que su
            aceptación quede anclada a él.
          </p>
        )}

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p>
            <strong>No tienes que aprobar nada</strong>: te llega un aviso con cada cesión y el
            panel muestra siempre al titular actual.
          </p>
          <p>
            Nunca se puede ceder un dorsal que ya tenga lecturas de cronometraje, ni después de la
            salida, sea cual sea la fecha que pongas.
          </p>
          <p>
            Camberas no mueve el dinero de la inscripción entre las dos personas: eso lo arreglan
            ellas.
          </p>
        </div>

        <Button onClick={guardar} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar política de cesión
        </Button>
      </CardContent>
    </Card>
  );
}
