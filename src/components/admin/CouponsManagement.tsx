import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Pencil, Plus, TicketPercent, Trash2 } from "lucide-react";
import { TeamDiscountManagement } from "@/components/admin/TeamDiscountManagement";

// Los cupones NO fijan el precio desde el cliente: aquí solo se definen.
// La validación y el descuento real los aplican las edge functions
// (validate-coupon / guest-register / redsys-init-payment) en servidor.

// Tablas nuevas aún sin tipos generados
const db = supabase as any;

interface Coupon {
  id: string;
  race_id: string;
  race_distance_id: string | null;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  applies_to: "base" | "total";
  max_uses: number | null;
  max_uses_per_email: number;
  min_amount: number | null;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
  notes: string | null;
  uses?: number;
}

interface CouponsManagementProps {
  selectedRaceId: string;
}

const emptyForm = {
  code: "",
  discount_type: "percent" as "percent" | "fixed",
  discount_value: "",
  applies_to: "base" as "base" | "total",
  race_distance_id: "",
  max_uses: "",
  max_uses_per_email: "1",
  min_amount: "",
  valid_from: "",
  valid_until: "",
  active: true,
  notes: "",
};

/** timestamptz de la BD → valor de un <input type="datetime-local"> */
const toLocalInput = (ts: string | null): string => {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function CouponsManagement({ selectedRaceId }: CouponsManagementProps) {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [distances, setDistances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (selectedRaceId) {
      fetchAll();
    } else {
      setCoupons([]);
      setLoading(false);
    }
  }, [selectedRaceId]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [{ data: couponsData, error }, { data: distancesData }] = await Promise.all([
        db.from("coupons").select("*").eq("race_id", selectedRaceId).order("created_at"),
        supabase.from("race_distances").select("id, name, distance_km").eq("race_id", selectedRaceId),
      ]);
      if (error) throw error;
      setDistances(distancesData || []);

      // Usos consumidos: canjes de inscripciones no canceladas (cancelar
      // libera el uso — misma cuenta que hace el servidor al validar)
      const withUses = await Promise.all(
        (couponsData || []).map(async (c: Coupon) => {
          const { data: uses } = await db.rpc("coupon_uses", { p_coupon_id: c.id });
          return { ...c, uses: uses ?? 0 };
        }),
      );
      setCoupons(withUses);
    } catch (error: any) {
      console.error("Error fetching coupons:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los cupones",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setFormData({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      applies_to: coupon.applies_to,
      race_distance_id: coupon.race_distance_id || "",
      max_uses: coupon.max_uses != null ? String(coupon.max_uses) : "",
      max_uses_per_email: String(coupon.max_uses_per_email),
      min_amount: coupon.min_amount != null ? String(coupon.min_amount) : "",
      valid_from: toLocalInput(coupon.valid_from),
      valid_until: toLocalInput(coupon.valid_until),
      active: coupon.active,
      notes: coupon.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const value = parseFloat(formData.discount_value);
    if (!formData.code.trim() || isNaN(value) || value <= 0) {
      toast({
        title: "Faltan datos",
        description: "El cupón necesita un código y un descuento mayor que cero",
        variant: "destructive",
      });
      return;
    }
    if (formData.discount_type === "percent" && value > 100) {
      toast({
        title: "Descuento inválido",
        description: "Un porcentaje no puede superar el 100%",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const row = {
        race_id: selectedRaceId,
        race_distance_id: formData.race_distance_id || null,
        code: formData.code, // la BD lo normaliza (mayúsculas, sin espacios)
        discount_type: formData.discount_type,
        discount_value: value,
        applies_to: formData.applies_to,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
        max_uses_per_email: Math.max(1, parseInt(formData.max_uses_per_email) || 1),
        min_amount: formData.min_amount ? parseFloat(formData.min_amount) : null,
        valid_from: formData.valid_from ? new Date(formData.valid_from).toISOString() : null,
        valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : null,
        active: formData.active,
        notes: formData.notes.trim() || null,
      };

      const { error } = editing
        ? await db.from("coupons").update(row).eq("id", editing.id)
        : await db.from("coupons").insert(row);
      if (error) throw error;

      toast({
        title: editing ? "Cupón actualizado" : "Cupón creado",
        description: `${row.code.toUpperCase().replace(/\s/g, "")} guardado correctamente`,
      });
      setDialogOpen(false);
      fetchAll();
    } catch (error: any) {
      const duplicated = String(error.message || "").includes("duplicate");
      toast({
        title: "Error al guardar",
        description: duplicated
          ? "Ya existe un cupón con ese código en esta carrera"
          : error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    const { error } = await db
      .from("coupons")
      .update({ active: !coupon.active })
      .eq("id", coupon.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setCoupons((prev) =>
      prev.map((c) => (c.id === coupon.id ? { ...c, active: !c.active } : c)),
    );
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await db.from("coupons").delete().eq("id", deleting.id);
    if (error) {
      toast({ title: "Error al borrar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cupón eliminado", description: deleting.code });
      fetchAll();
    }
    setDeleting(null);
  };

  const distanceName = (id: string | null) => {
    if (!id) return "Todos los recorridos";
    const d = distances.find((x) => x.id === id);
    return d ? `${d.name} (${d.distance_km}km)` : "—";
  };

  const discountLabel = (c: Coupon) =>
    c.discount_type === "percent" ? `${c.discount_value}%` : `${c.discount_value}€`;

  const validityLabel = (c: Coupon) => {
    const fmt = (ts: string) => new Date(ts).toLocaleDateString("es-ES");
    if (c.valid_from && c.valid_until) return `${fmt(c.valid_from)} – ${fmt(c.valid_until)}`;
    if (c.valid_until) return `hasta ${fmt(c.valid_until)}`;
    if (c.valid_from) return `desde ${fmt(c.valid_from)}`;
    return "Siempre";
  };

  if (!selectedRaceId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Selecciona una carrera para gestionar sus cupones</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cupones de descuento</h2>
          <p className="text-muted-foreground">
            Códigos que el corredor aplica al inscribirse. El precio final lo calcula
            siempre el servidor.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo cupón
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TicketPercent className="h-5 w-5" />
            Cupones ({coupons.length})
          </CardTitle>
          <CardDescription>
            Los usos cuentan solo inscripciones no canceladas: cancelar libera el cupón.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coupons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TicketPercent className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aún no hay cupones para esta carrera.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descuento</TableHead>
                    <TableHead>Aplica a</TableHead>
                    <TableHead>Ámbito</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead>Usos</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((coupon) => (
                    <TableRow key={coupon.id}>
                      <TableCell className="font-mono font-semibold">{coupon.code}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{discountLabel(coupon)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {coupon.applies_to === "base" ? "Solo tarifa" : "Tarifa + extras"}
                      </TableCell>
                      <TableCell className="text-sm">{distanceName(coupon.race_distance_id)}</TableCell>
                      <TableCell className="text-sm">{validityLabel(coupon)}</TableCell>
                      <TableCell className="text-sm">
                        {coupon.uses ?? 0}
                        {coupon.max_uses != null ? ` / ${coupon.max_uses}` : ""}
                      </TableCell>
                      <TableCell>
                        <Switch checked={coupon.active} onCheckedChange={() => toggleActive(coupon)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(coupon)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(coupon)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cupón" : "Nuevo cupón"}</DialogTitle>
            <DialogDescription>
              El código se guarda en mayúsculas y sin espacios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Código *</Label>
              <Input
                id="coupon-code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="PRENSA2026"
                className="uppercase font-mono"
                maxLength={60}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={formData.discount_type}
                  onValueChange={(v: any) => setFormData({ ...formData, discount_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Porcentaje (%)</SelectItem>
                    <SelectItem value="fixed">Importe fijo (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-value">
                  Descuento ({formData.discount_type === "percent" ? "%" : "€"}) *
                </Label>
                <Input
                  id="coupon-value"
                  type="number"
                  min="0"
                  step={formData.discount_type === "percent" ? "1" : "0.01"}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>El descuento se aplica sobre</Label>
              <Select
                value={formData.applies_to}
                onValueChange={(v: any) => setFormData({ ...formData, applies_to: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Solo la tarifa de inscripción</SelectItem>
                  <SelectItem value="total">Tarifa + extras del formulario</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Con "solo la tarifa", los extras (autobús, comidas…) se cobran íntegros
                aunque el cupón sea del 100%.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Recorrido</Label>
              <Select
                value={formData.race_distance_id || "all"}
                onValueChange={(v) =>
                  setFormData({ ...formData, race_distance_id: v === "all" ? "" : v })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los recorridos</SelectItem>
                  {distances.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-max-uses">Usos máximos</Label>
                <Input
                  id="coupon-max-uses"
                  type="number"
                  min="1"
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                  placeholder="Sin límite"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-max-email">Usos por email</Label>
                <Input
                  id="coupon-max-email"
                  type="number"
                  min="1"
                  value={formData.max_uses_per_email}
                  onChange={(e) => setFormData({ ...formData, max_uses_per_email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-from">Válido desde</Label>
                <Input
                  id="coupon-from"
                  type="datetime-local"
                  value={formData.valid_from}
                  onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-until">Válido hasta</Label>
                <Input
                  id="coupon-until"
                  type="datetime-local"
                  value={formData.valid_until}
                  onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon-min">Importe mínimo (€)</Label>
              <Input
                id="coupon-min"
                type="number"
                min="0"
                step="0.01"
                value={formData.min_amount}
                onChange={(e) => setFormData({ ...formData, min_amount: e.target.value })}
                placeholder="Sin mínimo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon-notes">Notas internas</Label>
              <Textarea
                id="coupon-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Invitaciones prensa, acuerdo con el club…"
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="coupon-active"
                checked={formData.active}
                onCheckedChange={(v) => setFormData({ ...formData, active: v })}
              />
              <Label htmlFor="coupon-active">Activo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el cupón {deleting?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán también sus canjes registrados. Si solo quieres que deje de
              funcionar, desactívalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Descuento por equipos: misma vista que los cupones — todo lo que
          abarata la inscripción se gestiona en un sitio */}
      <TeamDiscountManagement raceId={selectedRaceId} />
    </div>
  );
}
