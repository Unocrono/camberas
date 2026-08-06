/**
 * Voluntarios — pantalla PROPIA de Camberas Org (formato móvil).
 * Gestión COMPLETA de la bolsa, sin salir de la app: alta rápida
 * (nombre + teléfono + puesto), buscar, llamar, asignar puesto,
 * activar/desactivar, ficha completa (DNI, carnet, vehículo…),
 * importar pegando de Excel y borrar.
 *
 * Misma bolsa que el panel: tabla volunteers (del organizador de la
 * carrera) + volunteer_assignments/race_posts de la carrera en curso.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Search, Phone, ShieldAlert, ChevronDown, Pencil, Trash2, ClipboardPaste,
} from "lucide-react";

// El cliente tipado no conoce las tablas nuevas hasta regenerar types.ts
const db = supabase as any;

interface Volunteer {
  id: string;
  full_name: string;
  phone: string;
  dni: string | null;
  driving_license: string | null;
  vehicle: string | null;
  plate: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
}

const FICHA_VACIA = {
  full_name: "",
  phone: "",
  dni: "",
  driving_license: "",
  vehicle: "",
  plate: "",
  email: "",
  notes: "",
};

interface PuestoOpcion {
  id: string;
  name: string;
  abbr: string | null;
}

interface Asignacion {
  id: string;
  volunteer_id: string;
  post_id: string;
  accreditation: string | null;
}

interface Props {
  raceId: string | null;
}

// Radix no admite <SelectItem value="">: centinela para "sin asignar"
const SIN_PUESTO = "__sin_puesto__";

export const OrgVolunteers = ({ raceId }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [puestos, setPuestos] = useState<PuestoOpcion[]>([]);
  const [asignaciones, setAsignaciones] = useState<Record<string, Asignacion>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  // Alta rápida: lo mínimo para que la persona exista
  const [altaNombre, setAltaNombre] = useState("");
  const [altaTelefono, setAltaTelefono] = useState("");
  const [altaPuesto, setAltaPuesto] = useState("");

  // Ficha completa, importación y borrado (gestión completa en la app)
  const [editando, setEditando] = useState<Volunteer | null>(null);
  const [ficha, setFicha] = useState(FICHA_VACIA);
  const [importOpen, setImportOpen] = useState(false);
  const [importTexto, setImportTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [borrar, setBorrar] = useState<Volunteer | null>(null);

  // Dueño de la bolsa: el organizador de la carrera (así el admin
  // trabaja sobre la bolsa correcta, no sobre la suya)
  useEffect(() => {
    let cancelado = false;
    const resolver = async () => {
      if (!user) return;
      if (!raceId) {
        if (!cancelado) setOwnerId(user.id);
        return;
      }
      const { data } = await db.from("races").select("organizer_id").eq("id", raceId).maybeSingle();
      if (!cancelado) setOwnerId(data?.organizer_id || user.id);
    };
    resolver();
    return () => {
      cancelado = true;
    };
  }, [raceId, user]);

  const cargar = async () => {
    if (!ownerId) return;
    const { data, error: err } = await db
      .from("volunteers")
      .select("id, full_name, phone, dni, driving_license, vehicle, plate, email, notes, active")
      .eq("organizer_id", ownerId)
      .order("full_name");
    if (err) {
      setError(err.message || "Error desconocido");
    } else {
      setError(null);
      setVolunteers((data || []) as Volunteer[]);
    }
    setLoading(false);
  };

  const cargarPuestos = async () => {
    if (!raceId) {
      setPuestos([]);
      setAsignaciones({});
      return;
    }
    const [p, a] = await Promise.all([
      db.from("race_posts").select("id, name, abbr").eq("race_id", raceId).order("post_order", { nullsFirst: false }),
      db.from("volunteer_assignments").select("id, volunteer_id, post_id, accreditation").eq("race_id", raceId),
    ]);
    if (!p.error) setPuestos((p.data || []) as PuestoOpcion[]);
    if (!a.error) {
      const mapa: Record<string, Asignacion> = {};
      for (const x of (a.data || []) as Asignacion[]) mapa[x.volunteer_id] = x;
      setAsignaciones(mapa);
    }
  };

  useEffect(() => {
    setLoading(true);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  useEffect(() => {
    cargarPuestos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceId]);

  /** Pone (o quita) al voluntario en un puesto de la carrera en curso */
  const sincronizarPuesto = async (volunteerId: string, postId: string) => {
    if (!raceId) return;
    const actual = asignaciones[volunteerId];
    if (!postId) {
      if (actual) await db.from("volunteer_assignments").delete().eq("id", actual.id);
    } else if (actual?.post_id !== postId) {
      const { error: err } = actual
        ? await db.from("volunteer_assignments").update({ post_id: postId }).eq("id", actual.id)
        : await db.from("volunteer_assignments").insert({ race_id: raceId, post_id: postId, volunteer_id: volunteerId });
      if (err) {
        toast({ title: "No se pudo asignar el puesto", description: err.message, variant: "destructive" });
      }
    }
    cargarPuestos();
  };

  const errorGuardado = (e: any) =>
    e?.code === "23505"
      ? e.message?.includes("dni")
        ? "Ya hay un voluntario con ese DNI en la bolsa."
        : "Ya hay un voluntario con ese teléfono en la bolsa."
      : e?.message || "Error desconocido";

  const altaRapida = async () => {
    if (!altaNombre.trim() || !altaTelefono.trim()) {
      toast({ title: "Faltan datos", description: "Nombre y teléfono son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error: err } = await db
      .from("volunteers")
      .insert({ organizer_id: ownerId, full_name: altaNombre, phone: altaTelefono })
      .select("id")
      .single();
    if (err) {
      setSaving(false);
      toast({ title: "No se pudo dar de alta", description: errorGuardado(err), variant: "destructive" });
      return;
    }
    if (altaPuesto && data?.id) await sincronizarPuesto(data.id, altaPuesto);
    setSaving(false);
    setAltaNombre("");
    setAltaTelefono("");
    // El puesto se queda puesto: dando de alta a la cuadrilla de un
    // cruce, lo normal es que los siguientes vayan al mismo sitio.
    cargar();
  };

  const cambiarActivo = async (v: Volunteer, activo: boolean) => {
    const { error: err } = await db.from("volunteers").update({ active: activo }).eq("id", v.id);
    if (err) {
      toast({ title: "No se pudo cambiar", description: err.message, variant: "destructive" });
      return;
    }
    setVolunteers((prev) => prev.map((x) => (x.id === v.id ? { ...x, active: activo } : x)));
  };

  const abrirFicha = (v: Volunteer) => {
    setEditando(v);
    setFicha({
      full_name: v.full_name,
      phone: v.phone,
      dni: v.dni || "",
      driving_license: v.driving_license || "",
      vehicle: v.vehicle || "",
      plate: v.plate || "",
      email: v.email || "",
      notes: v.notes || "",
    });
  };

  const guardarFicha = async () => {
    if (!editando) return;
    if (!ficha.full_name.trim() || !ficha.phone.trim()) {
      toast({ title: "Faltan datos", description: "Nombre y teléfono son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error: err } = await db
      .from("volunteers")
      .update({
        full_name: ficha.full_name.trim(),
        phone: ficha.phone.trim(),
        dni: ficha.dni.trim() || null,
        driving_license: ficha.driving_license.trim() || null,
        vehicle: ficha.vehicle.trim() || null,
        plate: ficha.plate.trim() || null,
        email: ficha.email.trim() || null,
        notes: ficha.notes.trim() || null,
      })
      .eq("id", editando.id);
    setSaving(false);
    if (err) {
      toast({ title: "No se pudo guardar", description: errorGuardado(err), variant: "destructive" });
      return;
    }
    setEditando(null);
    cargar();
  };

  /**
   * Importar pegando de Excel: una línea por voluntario, columnas por
   * tabulador, punto y coma o coma → nombre, teléfono, DNI, carnet.
   * Los duplicados no rompen la importación: se cuentan y se avisa.
   * (Mismo formato que la importación del panel de escritorio.)
   */
  const importar = async () => {
    const filas = importTexto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((linea) => {
        const c = linea.split(/\t|;|,/).map((x) => x.trim());
        return {
          organizer_id: ownerId,
          full_name: c[0] || "",
          phone: c[1] || "",
          dni: c[2] || null,
          driving_license: c[3] || null,
        };
      })
      .filter((f) => f.full_name && f.phone);

    if (filas.length === 0) {
      toast({
        title: "Nada que importar",
        description: "Cada línea necesita al menos nombre y teléfono.",
        variant: "destructive",
      });
      return;
    }

    setImportando(true);
    let ok = 0;
    let repetidos = 0;
    for (const fila of filas) {
      const { error: err } = await db.from("volunteers").insert(fila);
      if (!err) ok++;
      else if (err.code === "23505") repetidos++;
    }
    setImportando(false);
    setImportOpen(false);
    setImportTexto("");
    cargar();
    toast({
      title: `${ok} voluntario${ok === 1 ? "" : "s"} importado${ok === 1 ? "" : "s"}`,
      description:
        repetidos > 0
          ? `${repetidos} ya estaban en la bolsa (mismo teléfono o DNI) y se han dejado como estaban.`
          : undefined,
    });
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    const { error: err } = await db.from("volunteers").delete().eq("id", borrar.id);
    setBorrar(null);
    if (err) {
      toast({ title: "No se pudo borrar", description: err.message, variant: "destructive" });
      return;
    }
    setAbierto(null);
    cargar();
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return volunteers;
    return volunteers.filter((v) =>
      [v.full_name, v.phone, v.dni].some((c) => (c || "").toLowerCase().includes(q)),
    );
  }, [volunteers, busqueda]);

  const activos = volunteers.filter((v) => v.active).length;
  const sinDni = volunteers.filter((v) => v.active && !v.dni).length;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }
  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">No se pudo cargar la bolsa: {error}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Alta rápida */}
      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alta rápida</p>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 text-xs font-bold text-secondary"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            Importar
          </button>
        </div>
        <Input
          value={altaNombre}
          onChange={(e) => setAltaNombre(e.target.value)}
          placeholder="Nombre y apellidos"
        />
        <div className="flex gap-2">
          <Input
            value={altaTelefono}
            onChange={(e) => setAltaTelefono(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && altaRapida()}
            placeholder="Teléfono"
            type="tel"
            className="flex-1"
          />
          {puestos.length > 0 && (
            <Select value={altaPuesto || SIN_PUESTO} onValueChange={(v) => setAltaPuesto(v === SIN_PUESTO ? "" : v)}>
              <SelectTrigger className="w-[135px] shrink-0">
                <SelectValue placeholder="Puesto" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value={SIN_PUESTO}>Sin puesto</SelectItem>
                {puestos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.abbr ? `${p.abbr} · ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button onClick={altaRapida} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-2">Añadir voluntario</span>
        </Button>
      </div>

      {/* Aviso de póliza: activos sin DNI */}
      {sinDni > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <strong>{sinDni}</strong> sin DNI: no {sinDni === 1 ? "entra" : "entran"} en la póliza de
            accidentes. El DNI se completa en la gestión completa (escritorio).
          </p>
        </div>
      )}

      {/* Buscar + contadores */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="pl-9"
          />
        </div>
        <Badge variant="secondary" className="shrink-0">{activos} activos</Badge>
      </div>

      {/* Lista: tarjeta por voluntario; un toque despliega las acciones */}
      {filtrados.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {volunteers.length === 0
            ? "Todavía no hay nadie en la bolsa. Empieza por el alta rápida."
            : "Nadie coincide con la búsqueda."}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtrados.map((v) => {
            const asig = asignaciones[v.id];
            const puesto = puestos.find((p) => p.id === asig?.post_id);
            const expandido = abierto === v.id;
            return (
              <div key={v.id} className={v.active ? "" : "opacity-50"}>
                <button
                  type="button"
                  onClick={() => setAbierto(expandido ? null : v.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {v.full_name}
                      {!v.dni && v.active && (
                        <ShieldAlert className="ml-1.5 inline h-3.5 w-3.5 text-amber-600" aria-label="sin DNI" />
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {puesto ? puesto.name : "sin puesto"}
                      {asig?.accreditation ? ` · ${asig.accreditation}` : ""}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <a
                      href={`tel:${v.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full border border-border bg-background p-2 text-secondary"
                      aria-label={`Llamar a ${v.full_name}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandido ? "rotate-180" : ""}`} />
                  </span>
                </button>

                {expandido && (
                  <div className="space-y-3 border-t border-border/60 bg-muted/30 px-4 py-3">
                    {raceId && puestos.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs font-bold uppercase text-muted-foreground">Puesto</span>
                        <Select
                          value={asig?.post_id || SIN_PUESTO}
                          onValueChange={(val) => sincronizarPuesto(v.id, val === SIN_PUESTO ? "" : val)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background">
                            <SelectItem value={SIN_PUESTO}>Sin asignar</SelectItem>
                            {puestos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.abbr ? `${p.abbr} · ` : ""}
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-muted-foreground">Activo este año</span>
                      <Switch checked={v.active} onCheckedChange={(c) => cambiarActivo(v, c)} />
                    </div>
                    {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
                    {/* Ficha completa y borrado, sin salir de la app */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirFicha(v)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background py-1.5 text-xs font-bold text-secondary"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar ficha
                      </button>
                      <button
                        onClick={() => setBorrar(v)}
                        className="flex items-center justify-center gap-1.5 rounded-full border border-destructive/40 bg-background px-4 py-1.5 text-xs font-bold text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Borrar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ficha completa */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar voluntario</DialogTitle>
            <DialogDescription>
              El DNI se pide para el seguro de accidentes; el carnet, para saber quién puede
              llevar la escoba o un control móvil.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="fv-nombre">Nombre y apellidos *</Label>
              <Input id="fv-nombre" value={ficha.full_name} onChange={(e) => setFicha({ ...ficha, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fv-telefono">Teléfono *</Label>
                <Input id="fv-telefono" type="tel" value={ficha.phone} onChange={(e) => setFicha({ ...ficha, phone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="fv-dni">DNI</Label>
                <Input id="fv-dni" value={ficha.dni} onChange={(e) => setFicha({ ...ficha, dni: e.target.value })} placeholder="12345678Z" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fv-carnet">Carnet</Label>
                <Input id="fv-carnet" value={ficha.driving_license} onChange={(e) => setFicha({ ...ficha, driving_license: e.target.value })} placeholder="B, A2…" />
              </div>
              <div>
                <Label htmlFor="fv-matricula">Matrícula</Label>
                <Input id="fv-matricula" value={ficha.plate} onChange={(e) => setFicha({ ...ficha, plate: e.target.value })} className="font-mono uppercase" placeholder="1234ABC" />
              </div>
            </div>
            <div>
              <Label htmlFor="fv-vehiculo">Vehículo</Label>
              <Input id="fv-vehiculo" value={ficha.vehicle} onChange={(e) => setFicha({ ...ficha, vehicle: e.target.value })} placeholder="Berlingo blanco" />
            </div>
            <div>
              <Label htmlFor="fv-email">Email</Label>
              <Input id="fv-email" type="email" value={ficha.email} onChange={(e) => setFicha({ ...ficha, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="fv-notas">Notas</Label>
              <Textarea id="fv-notas" rows={2} value={ficha.notes} onChange={(e) => setFicha({ ...ficha, notes: e.target.value })} placeholder="Tiene coche, solo por la mañana, talla L…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardarFicha} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Importar pegando de Excel */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar voluntarios</DialogTitle>
            <DialogDescription>
              Pega las filas de tu hoja de cálculo: una por línea, en el orden{" "}
              <strong>nombre, teléfono, DNI, carnet</strong>. Los dos últimos pueden ir vacíos.
              Quien ya esté en la bolsa (mismo teléfono o DNI) se deja como está.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={importTexto}
            onChange={(e) => setImportTexto(e.target.value)}
            rows={7}
            className="font-mono text-sm"
            placeholder={"María Etxebarria\t600123456\t12345678Z\tB\nJon Aguirre\t600654321"}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={importar} disabled={importando}>
              {importando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar a {borrar?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Desaparece de la bolsa y de las carreras en las que estuviera asignado. Si solo es
              que este año no puede, es mejor desactivarlo.
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
};
