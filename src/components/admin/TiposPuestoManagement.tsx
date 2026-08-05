/**
 * TIPOS DE PUESTO — catálogo de la casa (lo mantiene el admin).
 *
 * Antes eran una restricción CHECK en la base: cambiar la lista obligaba a
 * migrar. Ahora es tabla, porque cada organización llama a sus puestos como
 * los llama de verdad. El color se usa para imprimir cada acreditación del
 * color de su puesto y para verlos en el mapa.
 *
 * Migración: 20260805120000_voluntariado_puestos.sql
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Layers, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

const db = supabase as any;

export interface RacePostType {
  id: string;
  name: string;
  label: string;
  icon: string;
  color: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

const VACIO = {
  label: "",
  name: "",
  icon: "MapPin",
  color: "#64748B",
  description: "",
  display_order: 0,
  is_active: true,
};

/** "Recogida de material" → "recogida-de-material" */
const aSlug = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function TiposPuestoManagement() {
  const { toast } = useToast();
  const [tipos, setTipos] = useState<RacePostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<RacePostType | null>(null);
  const [form, setForm] = useState(VACIO);
  const [borrar, setBorrar] = useState<RacePostType | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setLoading(true);
    const { data, error: err } = await db
      .from("race_post_types")
      .select("*")
      .order("display_order");
    if (err) setError(err.message);
    else {
      setError(null);
      setTipos((data || []) as RacePostType[]);
    }
    setLoading(false);
  };

  const abrir = (t: RacePostType | null) => {
    setEditando(t);
    setForm(
      t
        ? {
            label: t.label,
            name: t.name,
            icon: t.icon,
            color: t.color,
            description: t.description || "",
            display_order: t.display_order,
            is_active: t.is_active,
          }
        : { ...VACIO, display_order: (tipos.at(-1)?.display_order ?? 0) + 10 },
    );
    setDialogOpen(true);
  };

  const guardar = async () => {
    if (!form.label.trim()) {
      toast({ title: "Falta el nombre", variant: "destructive" });
      return;
    }
    setSaving(true);
    const fila = {
      label: form.label.trim(),
      name: (form.name.trim() || aSlug(form.label)).slice(0, 40),
      icon: form.icon.trim() || "MapPin",
      color: form.color,
      description: form.description.trim() || null,
      display_order: form.display_order,
      is_active: form.is_active,
    };
    const { error: err } = editando
      ? await db.from("race_post_types").update(fila).eq("id", editando.id)
      : await db.from("race_post_types").insert(fila);
    setSaving(false);
    if (err) {
      toast({
        title: "No se pudo guardar",
        description: err.code === "23505" ? "Ya hay un tipo con ese identificador." : err.message,
        variant: "destructive",
      });
      return;
    }
    setDialogOpen(false);
    cargar();
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    const { error: err } = await db.from("race_post_types").delete().eq("id", borrar.id);
    setBorrar(null);
    if (err) {
      toast({
        title: "No se pudo borrar",
        description: err.code === "23503"
          ? "Hay puestos usando este tipo. Desactívalo en vez de borrarlo."
          : err.message,
        variant: "destructive",
      });
      return;
    }
    cargar();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Tipos de puesto
              </CardTitle>
              <CardDescription>
                La lista de la que tiran todas las carreras al crear sus puestos. Si un tipo ya está en
                uso, desactívalo en lugar de borrarlo.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => abrir(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo tipo
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando tipos…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Color</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-center">Orden</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tipos.map((t) => (
                    <TableRow key={t.id} className={t.is_active ? "" : "opacity-50"}>
                      <TableCell>
                        <span
                          className="inline-block h-5 w-5 rounded-full border border-border"
                          style={{ backgroundColor: t.color }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{t.label}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{t.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.description || "—"}</TableCell>
                      <TableCell className="text-center">{t.display_order}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={async (c) => {
                            await db.from("race_post_types").update({ is_active: c }).eq("id", t.id);
                            setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_active: c } : x)));
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrir(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setBorrar(t)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar tipo" : "Nuevo tipo de puesto"}</DialogTitle>
            <DialogDescription>
              El color se usa en el mapa de puestos y para imprimir las acreditaciones.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="t-label">Nombre *</Label>
              <Input
                id="t-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Señalización"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="t-icon">Icono (lucide)</Label>
                <Input
                  id="t-icon"
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder="Signpost"
                />
              </div>
              <div>
                <Label htmlFor="t-color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="t-color"
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-14 p-1"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="t-desc">Descripción</Label>
              <Input
                id="t-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="t-orden">Orden</Label>
                <Input
                  id="t-orden"
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end justify-between rounded-lg border border-border p-2">
                <Label htmlFor="t-activo">Activo</Label>
                <Switch
                  id="t-activo"
                  checked={form.is_active}
                  onCheckedChange={(c) => setForm({ ...form, is_active: c })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar "{borrar?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Si algún puesto lo está usando, la base no dejará borrarlo: en ese caso desactívalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrado} className="bg-destructive text-destructive-foreground">
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
