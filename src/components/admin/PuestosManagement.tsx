/**
 * PUESTOS de la carrera — el sitio donde va el voluntario.
 *
 * El puesto lleva ABREVIATURA de 3 caracteres: es lo que se lee de lejos en
 * la acreditación (CRU, MET, AV1…) y la raíz del número de cada una, así que
 * es única dentro de la carrera. Se propone sola a partir del nombre.
 *
 * La ubicación vive aquí y no en la asignación: el sitio es del puesto, y de
 * él sale el enlace "cómo llegar" que recibe el voluntario.
 *
 * Migración: 20260805120000_voluntariado_puestos.sql
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Plus, Pencil, Trash2, Loader2, ExternalLink, Users } from "lucide-react";
import type { RacePostType } from "@/components/admin/TiposPuestoManagement";

const db = supabase as any;

export interface RacePost {
  id: string;
  race_id: string;
  name: string;
  abbr: string | null;
  post_type_id: string | null;
  needed: number;
  latitude: number | null;
  longitude: number | null;
  location_hint: string | null;
  notes: string | null;
  post_order: number | null;
}

interface Cobertura {
  post_id: string;
  asignados: number;
  confirmados: number;
  sin_dni: number;
}

interface PuestosManagementProps {
  selectedRaceId: string;
}

const VACIO = {
  name: "",
  abbr: "",
  post_type_id: "",
  needed: 1,
  latitude: "",
  longitude: "",
  location_hint: "",
  notes: "",
  post_order: 0,
};

/** "Cruce de la ermita" → "CRU"; evita chocar con las ya usadas */
export const proponerAbreviatura = (nombre: string, usadas: string[]) => {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const base = (limpio.slice(0, 3) || "PST").padEnd(3, "X");
  if (!usadas.includes(base)) return base;
  for (let i = 1; i < 100; i++) {
    const alt = base.slice(0, 2) + i;
    if (!usadas.includes(alt)) return alt;
  }
  return base;
};

export const enlaceMapa = (lat: number | null, lng: number | null) =>
  lat != null && lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : null;

export function PuestosManagement({ selectedRaceId }: PuestosManagementProps) {
  const { toast } = useToast();
  const [puestos, setPuestos] = useState<RacePost[]>([]);
  const [tipos, setTipos] = useState<RacePostType[]>([]);
  const [cobertura, setCobertura] = useState<Record<string, Cobertura>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<RacePost | null>(null);
  const [form, setForm] = useState(VACIO);
  const [borrar, setBorrar] = useState<RacePost | null>(null);

  useEffect(() => {
    if (selectedRaceId) cargar();
  }, [selectedRaceId]);

  const cargar = async () => {
    setLoading(true);
    const [puestosRes, tiposRes, cobRes] = await Promise.all([
      db.from("race_posts").select("*").eq("race_id", selectedRaceId).order("post_order", { nullsFirst: false }),
      db.from("race_post_types").select("*").eq("is_active", true).order("display_order"),
      db.rpc("voluntariado_cobertura", { p_race_id: selectedRaceId }),
    ]);

    if (puestosRes.error) {
      setError(
        puestosRes.error.code === "42P01"
          ? "Faltan las tablas de puestos: aplica la migración 20260805120000_voluntariado_puestos.sql en Supabase."
          : puestosRes.error.message,
      );
    } else {
      setError(null);
      setPuestos((puestosRes.data || []) as RacePost[]);
    }
    if (!tiposRes.error) setTipos((tiposRes.data || []) as RacePostType[]);
    if (!cobRes.error) {
      const mapa: Record<string, Cobertura> = {};
      for (const c of (cobRes.data || []) as Cobertura[]) mapa[c.post_id] = c;
      setCobertura(mapa);
    }
    setLoading(false);
  };

  const abrevUsadas = useMemo(
    () => puestos.map((p) => p.abbr).filter(Boolean) as string[],
    [puestos],
  );

  const abrir = (p: RacePost | null) => {
    setEditando(p);
    setForm(
      p
        ? {
            name: p.name,
            abbr: p.abbr || "",
            post_type_id: p.post_type_id || "",
            needed: p.needed,
            latitude: p.latitude?.toString() || "",
            longitude: p.longitude?.toString() || "",
            location_hint: p.location_hint || "",
            notes: p.notes || "",
            post_order: p.post_order ?? 0,
          }
        : {
            ...VACIO,
            post_type_id: tipos[0]?.id || "",
            post_order: (puestos.at(-1)?.post_order ?? 0) + 10,
          },
    );
    setDialogOpen(true);
  };

  const guardar = async () => {
    if (!form.name.trim()) {
      toast({ title: "Falta el nombre del puesto", variant: "destructive" });
      return;
    }
    const abbr = (form.abbr || proponerAbreviatura(form.name, abrevUsadas)).toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(abbr)) {
      toast({
        title: "Abreviatura no válida",
        description: "Son exactamente 3 caracteres, letras o números.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const fila = {
      race_id: selectedRaceId,
      name: form.name.trim(),
      abbr,
      post_type_id: form.post_type_id || null,
      needed: Math.max(1, Number(form.needed) || 1),
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      location_hint: form.location_hint.trim() || null,
      notes: form.notes.trim() || null,
      post_order: Number(form.post_order) || 0,
    };
    const { error: err } = editando
      ? await db.from("race_posts").update(fila).eq("id", editando.id)
      : await db.from("race_posts").insert(fila);
    setSaving(false);

    if (err) {
      toast({
        title: "No se pudo guardar",
        description:
          err.code === "23505"
            ? `La abreviatura ${abbr} ya la usa otro puesto de esta carrera.`
            : err.message,
        variant: "destructive",
      });
      return;
    }

    // Si cambió la abreviatura, las acreditaciones de ese puesto se rehacen
    if (editando && editando.abbr && editando.abbr !== abbr) {
      const { error: errNum } = await db.rpc("voluntariado_renumerar_puesto", {
        p_post_id: editando.id,
      });
      if (!errNum) {
        toast({
          title: "Acreditaciones renumeradas",
          description: `Las de este puesto pasan a empezar por ${abbr}.`,
        });
      }
    }

    setDialogOpen(false);
    cargar();
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    const { error: err } = await db.from("race_posts").delete().eq("id", borrar.id);
    setBorrar(null);
    if (err) {
      toast({ title: "No se pudo borrar", description: err.message, variant: "destructive" });
      return;
    }
    cargar();
  };

  const tipoDe = (id: string | null) => tipos.find((t) => t.id === id);

  if (!selectedRaceId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Selecciona una carrera para gestionar sus puestos</p>
      </div>
    );
  }

  const totalNecesarios = puestos.reduce((s, p) => s + p.needed, 0);
  const totalAsignados = Object.values(cobertura).reduce((s, c) => s + c.asignados, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Puestos
              </CardTitle>
              <CardDescription>
                Cada puesto lleva una abreviatura de 3 caracteres: es la raíz de las acreditaciones de
                quien lo cubre (CRU01, CRU02…).
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => abrir(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo puesto
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              {error}
            </div>
          )}

          {puestos.length > 0 && (
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {totalAsignados} de {totalNecesarios} plazas cubiertas
              </Badge>
              <Badge variant="outline">{puestos.length} puestos</Badge>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando puestos…
            </div>
          ) : puestos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Esta carrera todavía no tiene puestos. Crea el primero con el botón de arriba.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Abrev.</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-center">Cobertura</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {puestos.map((p) => {
                    const tipo = tipoDe(p.post_type_id);
                    const cob = cobertura[p.id];
                    const asignados = cob?.asignados ?? 0;
                    const falta = asignados < p.needed;
                    const mapa = enlaceMapa(p.latitude, p.longitude);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {p.abbr || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {p.name}
                          {p.location_hint && (
                            <span className="block text-xs text-muted-foreground">{p.location_hint}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tipo ? (
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-full"
                                style={{ backgroundColor: tipo.color }}
                              />
                              {tipo.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={falta ? "destructive" : "secondary"}>
                            {asignados}/{p.needed}
                          </Badge>
                          {cob?.sin_dni ? (
                            <span className="block text-xs text-amber-600">{cob.sin_dni} sin DNI</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {mapa ? (
                            <a
                              href={mapa}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm hover:underline"
                            >
                              Cómo llegar
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">sin coordenadas</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => abrir(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setBorrar(p)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar puesto" : "Nuevo puesto"}</DialogTitle>
            <DialogDescription>
              Las coordenadas son las que generan el enlace "cómo llegar" del voluntario.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div>
                <Label htmlFor="p-nombre">Nombre del puesto *</Label>
                <Input
                  id="p-nombre"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      // La abreviatura se propone sola mientras no se toque
                      abbr: editando ? f.abbr : proponerAbreviatura(name, abrevUsadas),
                    }));
                  }}
                  placeholder="Cruce de la ermita"
                />
              </div>
              <div>
                <Label htmlFor="p-abbr">Abreviatura</Label>
                <Input
                  id="p-abbr"
                  value={form.abbr}
                  maxLength={3}
                  onChange={(e) =>
                    setForm({ ...form, abbr: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                  }
                  className="font-mono uppercase"
                  placeholder="CRU"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-tipo">Tipo</Label>
                <Select
                  value={form.post_type_id}
                  onValueChange={(v) => setForm({ ...form, post_type_id: v })}
                >
                  <SelectTrigger id="p-tipo">
                    <SelectValue placeholder="Sin tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-needed">Personas necesarias</Label>
                <Input
                  id="p-needed"
                  type="number"
                  min={1}
                  value={form.needed}
                  onChange={(e) => setForm({ ...form, needed: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-lat">Latitud</Label>
                <Input
                  id="p-lat"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                  placeholder="43.3012"
                />
              </div>
              <div>
                <Label htmlFor="p-lng">Longitud</Label>
                <Input
                  id="p-lng"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                  placeholder="-2.9401"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="p-hint">Referencia del sitio</Label>
              <Input
                id="p-hint"
                value={form.location_hint}
                onChange={(e) => setForm({ ...form, location_hint: e.target.value })}
                placeholder="Junto al panel de madera, lado del río"
              />
            </div>

            <div>
              <Label htmlFor="p-notas">Instrucciones</Label>
              <Textarea
                id="p-notas"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Llevar cinta y chaleco. Cortar el paso solo al pasar corredores."
              />
            </div>

            <div>
              <Label htmlFor="p-orden">Orden</Label>
              <Input
                id="p-orden"
                type="number"
                value={form.post_order}
                onChange={(e) => setForm({ ...form, post_order: Number(e.target.value) })}
              />
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
            <AlertDialogTitle>¿Borrar el puesto "{borrar?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran también sus asignaciones y las acreditaciones que hubiera dado. Los
              voluntarios siguen en la bolsa.
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
