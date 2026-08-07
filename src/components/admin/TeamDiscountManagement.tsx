import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, Plus, Trash2 } from "lucide-react";

// Descuento por EQUIPOS por tramos: "a partir de N corredores en el lote,
// X% (o X€) de descuento por corredor". Aquí solo se definen los tramos;
// el descuento real lo aplica el servidor (team-register/team-init-payment)
// sobre la tarifa base de cada corredor del lote. Combinable con cupón
// (el cupón se calcula sobre la base ya reducida).

// Tabla nueva aún sin tipos generados
const db = supabase as any;

interface Tier {
  id?: string;
  min_members: number | "";
  discount_type: "percent" | "fixed";
  discount_value: number | "";
}

interface TeamDiscountManagementProps {
  raceId: string;
}

export function TeamDiscountManagement({ raceId }: TeamDiscountManagementProps) {
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
      .from("race_team_discount_tiers")
      .select("id, min_members, discount_type, discount_value")
      .eq("race_id", raceId)
      .order("min_members", { ascending: true });
    if (error) {
      console.error("Error fetching team discount tiers:", error);
    }
    setTiers(data || []);
    setLoading(false);
  };

  const addTier = () => {
    setTiers([...tiers, { min_members: "", discount_type: "percent", discount_value: "" }]);
  };

  const updateTier = (index: number, patch: Partial<Tier>) => {
    setTiers(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const clean = tiers.filter((t) => t.min_members !== "" && t.discount_value !== "");
    const ns = clean.map((t) => t.min_members);
    if (new Set(ns).size !== ns.length) {
      toast({
        title: "Tramos duplicados",
        description: "No puede haber dos tramos con el mismo número de corredores",
        variant: "destructive",
      });
      return;
    }
    if (clean.some((t) => Number(t.min_members) < 2)) {
      toast({
        title: "Tramo inválido",
        description: "Un equipo empieza en 2 corredores",
        variant: "destructive",
      });
      return;
    }
    if (clean.some((t) => t.discount_type === "percent" && Number(t.discount_value) > 100)) {
      toast({
        title: "Tramo inválido",
        description: "Un porcentaje no puede pasar del 100%",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      // Reemplazo completo: pocos tramos, sin ediciones concurrentes
      const { error: delError } = await db
        .from("race_team_discount_tiers")
        .delete()
        .eq("race_id", raceId);
      if (delError) throw delError;

      if (clean.length > 0) {
        const { error: insError } = await db.from("race_team_discount_tiers").insert(
          clean.map((t) => ({
            race_id: raceId,
            min_members: t.min_members,
            discount_type: t.discount_type,
            discount_value: t.discount_value,
          })),
        );
        if (insError) throw insError;
      }

      toast({
        title: "Descuento por equipos guardado",
        description:
          clean.length > 0
            ? "Se aplicará automáticamente al inscribir un lote de equipo"
            : "Sin tramos: los equipos pagan tarifa normal",
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
          <Users className="h-5 w-5" />
          Descuento por equipos
        </CardTitle>
        <CardDescription>
          Se aplica solo cuando un capitán inscribe a su equipo en lote: descuento por
          corredor sobre la tarifa (los suplementos se cobran íntegros). Aplica el tramo
          más alto que el lote alcance, y es combinable con un cupón.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tiers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin tramos definidos: los equipos pagan la tarifa normal.
          </p>
        )}
        {tiers.map((tier, index) => (
          <div key={tier.id ?? `new-${index}`} className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">A partir de</span>
            <Input
              type="number"
              min="2"
              className="w-20"
              value={tier.min_members}
              onChange={(e) =>
                updateTier(index, { min_members: e.target.value === "" ? "" : parseInt(e.target.value) })
              }
            />
            <span className="text-sm">corredores →</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="w-24"
              value={tier.discount_value}
              onChange={(e) =>
                updateTier(index, { discount_value: e.target.value === "" ? "" : parseFloat(e.target.value) })
              }
            />
            <Select
              value={tier.discount_type}
              onValueChange={(v) => updateTier(index, { discount_type: v as Tier["discount_type"] })}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">% por corredor</SelectItem>
                <SelectItem value="fixed">€ por corredor</SelectItem>
              </SelectContent>
            </Select>
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
            {saving ? "Guardando..." : "Guardar descuento"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
