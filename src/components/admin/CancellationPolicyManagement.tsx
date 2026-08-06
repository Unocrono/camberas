import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, Plus, Trash2 } from "lucide-react";

// Política de cancelación por tramos: "cancelando con ≥ N días de antelación
// se devuelve el X%". El tramo más exigente que se cumpla es el que aplica;
// por debajo del tramo más bajo no se permite cancelar. Sin tramos, la web
// mantiene la regla histórica (7 días, sin devolución).
//
// La política se muestra sola: como apartado en el reglamento público y en el
// diálogo de cancelación del corredor. La devolución en Redsys es MANUAL.

// Tabla nueva aún sin tipos generados
const db = supabase as any;

interface Tier {
  id?: string;
  days_before: number | "";
  refund_percent: number | "";
}

interface CancellationPolicyManagementProps {
  raceId: string;
}

export function CancellationPolicyManagement({ raceId }: CancellationPolicyManagementProps) {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTiers();
  }, [raceId]);

  const fetchTiers = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("race_cancellation_tiers")
      .select("id, days_before, refund_percent")
      .eq("race_id", raceId)
      .order("days_before", { ascending: false });
    if (error) {
      console.error("Error fetching cancellation tiers:", error);
    }
    setTiers(data || []);
    setLoading(false);
  };

  const addTier = () => {
    setTiers([...tiers, { days_before: "", refund_percent: "" }]);
  };

  const updateTier = (index: number, field: keyof Tier, raw: string) => {
    const value = raw === "" ? "" : parseInt(raw);
    setTiers(tiers.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const clean = tiers.filter((t) => t.days_before !== "" && t.refund_percent !== "");
    const days = clean.map((t) => t.days_before);
    if (new Set(days).size !== days.length) {
      toast({
        title: "Tramos duplicados",
        description: "No puede haber dos tramos con los mismos días de antelación",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      // Reemplazo completo: pocos tramos, sin ediciones concurrentes
      const { error: delError } = await db
        .from("race_cancellation_tiers")
        .delete()
        .eq("race_id", raceId);
      if (delError) throw delError;

      if (clean.length > 0) {
        const { error: insError } = await db.from("race_cancellation_tiers").insert(
          clean.map((t) => ({
            race_id: raceId,
            days_before: t.days_before,
            refund_percent: t.refund_percent,
          })),
        );
        if (insError) throw insError;
      }

      toast({
        title: "Política guardada",
        description:
          clean.length > 0
            ? "Se mostrará en el reglamento y al cancelar una inscripción"
            : "Sin tramos: se aplica la regla por defecto (7 días, sin devolución)",
      });
      fetchTiers();
    } catch (error: any) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Undo2 className="h-5 w-5" />
          Política de cancelación
        </CardTitle>
        <CardDescription>
          Tramos de devolución según la antelación con la que se cancela. Se publica como
          apartado del reglamento y se aplica al cancelar. Por debajo del tramo más bajo no
          se permite cancelar. La devolución del dinero se gestiona a mano en Redsys.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tiers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin tramos definidos: se aplica la regla por defecto (cancelable hasta 7 días
            antes, sin devolución).
          </p>
        )}
        {tiers.map((tier, index) => (
          <div key={tier.id ?? `new-${index}`} className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">Cancelando con</span>
            <Input
              type="number"
              min="0"
              className="w-20"
              value={tier.days_before}
              onChange={(e) => updateTier(index, "days_before", e.target.value)}
            />
            <span className="text-sm">o más días de antelación →</span>
            <Input
              type="number"
              min="0"
              max="100"
              className="w-20"
              value={tier.refund_percent}
              onChange={(e) => updateTier(index, "refund_percent", e.target.value)}
            />
            <span className="text-sm">% de devolución</span>
            <Button variant="ghost" size="icon" onClick={() => removeTier(index)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="h-4 w-4 mr-1" />
            Añadir tramo
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar política"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
