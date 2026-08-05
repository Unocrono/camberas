/**
 * VOLUNTARIADO — la bolsa del organizador.
 *
 * El voluntario no es un usuario: es una fila. No hay altas de usuario, ni
 * contraseñas, ni invitaciones (ver docs/voluntarios-diseno.md).
 *
 * La bolsa es DEL ORGANIZADOR y se reutiliza entre carreras y ediciones: los
 * mismos vecinos y el mismo club repiten cada año. Por eso, cuando hay una
 * carrera seleccionada, la bolsa que se muestra es la de SU organizador (así
 * el admin trabaja sobre la bolsa correcta y no sobre la suya).
 *
 * ⚠️ El DNI está aquí para asegurar al voluntario en caso de accidente: sin
 * DNI no entra en la póliza. De ahí el aviso de "sin DNI" y que este dato no
 * salga en las hojas de puesto.
 *
 * Migración: 20260805100000_voluntariado.sql
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HeartHandshake,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  ClipboardPaste,
  ShieldAlert,
  Car,
} from "lucide-react";

// El cliente tipado no conoce las tablas nuevas hasta regenerar types.ts
const db = supabase as any;

interface Volunteer {
  id: string;
  organizer_id: string;
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

/** Puesto de la carrera en curso, para el desplegable */
interface PuestoOpcion {
  id: string;
  name: string;
  abbr: string | null;
}

/** Asignación del voluntario en la carrera en curso */
interface Asignacion {
  id: string;
  volunteer_id: string;
  post_id: string;
  accreditation: string | null;
}

interface VoluntariadoManagementProps {
  /** Carrera en curso, si la hay: determina de quién es la bolsa. */
  selectedRaceId?: string;
}

// Radix no admite <SelectItem value="">: hace falta un centinela para "ninguno"
const SIN_PUESTO = "__sin_puesto__";

const FICHA_VACIA = {
  full_name: "",
  phone: "",
  dni: "",
  driving_license: "",
  vehicle: "",
  plate: "",
  email: "",
  notes: "",
  active: true,
};

export function VoluntariadoManagement({ selectedRaceId }: VoluntariadoManagementProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  // El error se queda a la vista: un toast se va solo y deja la pantalla muda
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // Alta rápida: nombre, teléfono y puesto; el resto se completa en la ficha
  const [altaNombre, setAltaNombre] = useState("");
  const [altaTelefono, setAltaTelefono] = useState("");
  const [altaPuesto, setAltaPuesto] = useState("");

  // Puestos y asignaciones de la carrera en curso (sin carrera, no hay puesto)
  const [puestos, setPuestos] = useState<PuestoOpcion[]>([]);
  const [asignaciones, setAsignaciones] = useState<Record<string, Asignacion>>({});

  const [fichaOpen, setFichaOpen] = useState(false);
  const [editando, setEditando] = useState<Volunteer | null>(null);
  const [ficha, setFicha] = useState(FICHA_VACIA);
  const [fichaPuesto, setFichaPuesto] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importTexto, setImportTexto] = useState("");
  const [importando, setImportando] = useState(false);

  const [borrar, setBorrar] = useState<Volunteer | null>(null);

  // Dueño de la bolsa: el organizador de la carrera si hay una seleccionada
  useEffect(() => {
    let cancelado = false;
    const resolverDueno = async () => {
      if (!user) return;
      if (!selectedRaceId) {
        if (!cancelado) setOwnerId(user.id);
        return;
      }
      const { data } = await db
        .from("races")
        .select("organizer_id")
        .eq("id", selectedRaceId)
        .maybeSingle();
      if (!cancelado) setOwnerId(data?.organizer_id || user.id);
    };
    resolverDueno();
    return () => {
      cancelado = true;
    };
  }, [selectedRaceId, user]);

  useEffect(() => {
    if (ownerId) cargar();
  }, [ownerId]);

  // Los puestos y quién los cubre son de la carrera, no de la bolsa
  useEffect(() => {
    if (selectedRaceId) cargarPuestos();
    else {
      setPuestos([]);
      setAsignaciones({});
    }
  }, [selectedRaceId]);

  const cargarPuestos = async () => {
    const [puestosRes, asigRes] = await Promise.all([
      db.from("race_posts").select("id, name, abbr").eq("race_id", selectedRaceId).order("post_order", { nullsFirst: false }),
      db.from("volunteer_assignments").select("id, volunteer_id, post_id, accreditation").eq("race_id", selectedRaceId),
    ]);
    if (!puestosRes.error) setPuestos((puestosRes.data || []) as PuestoOpcion[]);
    if (!asigRes.error) {
      const mapa: Record<string, Asignacion> = {};
      for (const a of (asigRes.data || []) as Asignacion[]) mapa[a.volunteer_id] = a;
      setAsignaciones(mapa);
    }
  };

  /**
   * Pone (o quita) al voluntario en un puesto de la carrera en curso.
   * La acreditación no se toca desde aquí: la calcula la base al asignar.
   */
  const sincronizarPuesto = async (volunteerId: string, postId: string) => {
    if (!selectedRaceId) return;
    const actual = asignaciones[volunteerId];

    if (!postId) {
      if (actual) await db.from("volunteer_assignments").delete().eq("id", actual.id);
      return;
    }
    if (actual?.post_id === postId) return;

    const { error: err } = actual
      ? await db.from("volunteer_assignments").update({ post_id: postId }).eq("id", actual.id)
      : await db.from("volunteer_assignments").insert({
          race_id: selectedRaceId,
          post_id: postId,
          volunteer_id: volunteerId,
        });

    if (err) {
      toast({ title: "No se pudo asignar el puesto", description: err.message, variant: "destructive" });
    }
  };

  const cargar = async () => {
    setLoading(true);
    const { data, error: err } = await db
      .from("volunteers")
      .select("*")
      .eq("organizer_id", ownerId)
      .order("full_name");
    if (err) {
      // 42P01 = la tabla no existe todavía: falta aplicar la migración
      setError(
        err.code === "42P01" || /does not exist/i.test(err.message || "")
          ? "Faltan las tablas del voluntariado: aplica la migración 20260805100000_voluntariado.sql en el editor SQL de Supabase."
          : err.message || "Error desconocido",
      );
    } else {
      setError(null);
      setVolunteers((data || []) as Volunteer[]);
    }
    setLoading(false);
  };

  const errorGuardado = (error: any) => {
    // 23505 = choca con el índice único (organizer_id, phone|dni)
    if (error?.code === "23505") {
      return error.message?.includes("dni")
        ? "Ya hay un voluntario con ese DNI en la bolsa."
        : "Ya hay un voluntario con ese teléfono en la bolsa.";
    }
    return error?.message || "Error desconocido";
  };

  const altaRapida = async () => {
    if (!altaNombre.trim() || !altaTelefono.trim()) {
      toast({
        title: "Faltan datos",
        description: "El nombre y el teléfono son obligatorios.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { data, error } = await db
      .from("volunteers")
      .insert({
        organizer_id: ownerId,
        full_name: altaNombre,
        phone: altaTelefono,
      })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      toast({ title: "No se pudo dar de alta", description: errorGuardado(error), variant: "destructive" });
      return;
    }
    if (altaPuesto && data?.id) await sincronizarPuesto(data.id, altaPuesto);
    setSaving(false);
    setAltaNombre("");
    setAltaTelefono("");
    // El puesto se queda puesto: dando de alta a la cuadrilla de un cruce,
    // lo normal es que los siguientes vayan al mismo sitio.
    cargar();
    cargarPuestos();
  };

  const abrirFicha = (v: Volunteer | null) => {
    setEditando(v);
    setFicha(
      v
        ? {
            full_name: v.full_name,
            phone: v.phone,
            dni: v.dni || "",
            driving_license: v.driving_license || "",
            vehicle: v.vehicle || "",
            plate: v.plate || "",
            email: v.email || "",
            notes: v.notes || "",
            active: v.active,
          }
        : FICHA_VACIA,
    );
    setFichaPuesto(v ? asignaciones[v.id]?.post_id || "" : "");
    setFichaOpen(true);
  };

  const guardarFicha = async () => {
    if (!ficha.full_name.trim() || !ficha.phone.trim()) {
      toast({
        title: "Faltan datos",
        description: "El nombre y el teléfono son obligatorios.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const fila = {
      organizer_id: ownerId,
      full_name: ficha.full_name,
      phone: ficha.phone,
      dni: ficha.dni.trim() || null,
      driving_license: ficha.driving_license.trim() || null,
      vehicle: ficha.vehicle.trim() || null,
      plate: ficha.plate.trim() || null,
      email: ficha.email.trim() || null,
      notes: ficha.notes.trim() || null,
      active: ficha.active,
    };
    const { data, error } = editando
      ? await db.from("volunteers").update(fila).eq("id", editando.id).select("id").single()
      : await db.from("volunteers").insert(fila).select("id").single();
    if (error) {
      setSaving(false);
      toast({ title: "No se pudo guardar", description: errorGuardado(error), variant: "destructive" });
      return;
    }
    if (selectedRaceId && data?.id) await sincronizarPuesto(data.id, fichaPuesto);
    setSaving(false);
    setFichaOpen(false);
    cargar();
    cargarPuestos();
  };

  const cambiarActivo = async (v: Volunteer, activo: boolean) => {
    const { error } = await db.from("volunteers").update({ active: activo }).eq("id", v.id);
    if (error) {
      toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
      return;
    }
    setVolunteers((prev) => prev.map((x) => (x.id === v.id ? { ...x, active: activo } : x)));
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    const { error } = await db.from("volunteers").delete().eq("id", borrar.id);
    setBorrar(null);
    if (error) {
      toast({ title: "No se pudo borrar", description: error.message, variant: "destructive" });
      return;
    }
    cargar();
  };

  /**
   * Importar pegando de Excel: una línea por voluntario, columnas separadas
   * por tabulador, punto y coma o coma → nombre, teléfono, DNI, carnet.
   * Los duplicados no rompen la importación: se cuentan y se avisa.
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
      const { error } = await db.from("volunteers").insert(fila);
      if (!error) ok++;
      else if (error.code === "23505") repetidos++;
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

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return volunteers;
    return volunteers.filter((v) =>
      [v.full_name, v.phone, v.dni, v.email].some((campo) => (campo || "").toLowerCase().includes(q)),
    );
  }, [volunteers, busqueda]);

  const sinDni = volunteers.filter((v) => v.active && !v.dni).length;
  const conCarnet = volunteers.filter((v) => v.active && v.driving_license).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HeartHandshake className="h-5 w-5" />
                Voluntariado
              </CardTitle>
              <CardDescription>
                La bolsa es del organizador y se reutiliza en todas sus carreras: se da de alta una vez
                y cada año solo se reasigna.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Importar
              </Button>
              <Button size="sm" onClick={() => abrirFicha(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <p>{error}</p>
            </div>
          )}

          {/* Alta rápida: lo mínimo para que la persona exista */}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="alta-nombre" className="text-xs text-muted-foreground">
                Nombre y apellidos
              </Label>
              <Input
                id="alta-nombre"
                value={altaNombre}
                onChange={(e) => setAltaNombre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && altaRapida()}
                placeholder="María Etxebarria"
              />
            </div>
            <div className="w-[170px]">
              <Label htmlFor="alta-telefono" className="text-xs text-muted-foreground">
                Teléfono
              </Label>
              <Input
                id="alta-telefono"
                value={altaTelefono}
                onChange={(e) => setAltaTelefono(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && altaRapida()}
                placeholder="600 123 456"
              />
            </div>
            <div className="w-[200px]">
              <Label htmlFor="alta-puesto" className="text-xs text-muted-foreground">
                Puesto
              </Label>
              <Select
                value={altaPuesto || SIN_PUESTO}
                onValueChange={(v) => setAltaPuesto(v === SIN_PUESTO ? "" : v)}
                disabled={puestos.length === 0}
              >
                <SelectTrigger id="alta-puesto">
                  <SelectValue
                    placeholder={
                      !selectedRaceId
                        ? "Elige carrera"
                        : puestos.length === 0
                          ? "Sin puestos"
                          : "Sin asignar"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
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
            <Button onClick={altaRapida} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">Añadir</span>
            </Button>
          </div>

          {sinDni > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
              <p>
                <strong>{sinDni}</strong> {sinDni === 1 ? "voluntario activo no tiene" : "voluntarios activos no tienen"}{" "}
                DNI. El DNI es lo que identifica a la persona en la póliza:{" "}
                <strong>sin él no está cubierta si hay un accidente</strong>.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, teléfono o DNI…"
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{volunteers.filter((v) => v.active).length} activos</Badge>
              <Badge variant="outline" className="gap-1">
                <Car className="h-3 w-3" />
                {conCarnet} con carnet
              </Badge>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando el voluntariado…
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {volunteers.length === 0
                ? "Todavía no hay nadie en la bolsa. Empieza por el alta rápida de arriba o importa una lista."
                : "Ningún voluntario coincide con la búsqueda."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    {selectedRaceId && <TableHead>Puesto</TableHead>}
                    {selectedRaceId && <TableHead>Acreditación</TableHead>}
                    <TableHead>DNI</TableHead>
                    <TableHead>Carnet</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((v) => (
                    <TableRow key={v.id} className={v.active ? "" : "opacity-50"}>
                      <TableCell className="font-medium">
                        {v.full_name}
                        {v.notes && (
                          <span className="block text-xs text-muted-foreground">{v.notes}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <a href={`tel:${v.phone}`} className="hover:underline">
                          {v.phone}
                        </a>
                      </TableCell>
                      {selectedRaceId && (
                        <TableCell className="text-sm">
                          {puestos.find((p) => p.id === asignaciones[v.id]?.post_id)?.name || (
                            <span className="text-muted-foreground">sin puesto</span>
                          )}
                        </TableCell>
                      )}
                      {selectedRaceId && (
                        <TableCell>
                          {asignaciones[v.id]?.accreditation ? (
                            <Badge className="font-mono">{asignaciones[v.id].accreditation}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {v.dni ? (
                          <span className="font-mono text-sm">{v.dni}</span>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
                            <ShieldAlert className="h-3 w-3" />
                            sin DNI
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {v.driving_license ? (
                          <Badge variant="secondary">{v.driving_license}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={v.active} onCheckedChange={(c) => cambiarActivo(v, c)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirFicha(v)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setBorrar(v)}>
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

      {/* Ficha completa */}
      <Dialog open={fichaOpen} onOpenChange={setFichaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar voluntario" : "Nuevo voluntario"}</DialogTitle>
            <DialogDescription>
              El DNI se pide para el seguro de accidentes; el carnet, para saber quién puede llevar
              la escoba o un control móvil.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="f-nombre">Nombre y apellidos *</Label>
              <Input
                id="f-nombre"
                value={ficha.full_name}
                onChange={(e) => setFicha({ ...ficha, full_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="f-telefono">Teléfono *</Label>
                <Input
                  id="f-telefono"
                  value={ficha.phone}
                  onChange={(e) => setFicha({ ...ficha, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="f-dni">DNI</Label>
                <Input
                  id="f-dni"
                  value={ficha.dni}
                  onChange={(e) => setFicha({ ...ficha, dni: e.target.value })}
                  placeholder="12345678Z"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="f-vehiculo">Vehículo</Label>
                <Input
                  id="f-vehiculo"
                  value={ficha.vehicle}
                  onChange={(e) => setFicha({ ...ficha, vehicle: e.target.value })}
                  placeholder="Berlingo blanco"
                />
              </div>
              <div>
                <Label htmlFor="f-matricula">Matrícula</Label>
                <Input
                  id="f-matricula"
                  value={ficha.plate}
                  onChange={(e) => setFicha({ ...ficha, plate: e.target.value })}
                  className="font-mono uppercase"
                  placeholder="1234ABC"
                />
              </div>
              <div>
                <Label htmlFor="f-carnet">Carnet de conducir</Label>
                <Input
                  id="f-carnet"
                  value={ficha.driving_license}
                  onChange={(e) => setFicha({ ...ficha, driving_license: e.target.value })}
                  placeholder="B, A2…"
                />
              </div>
            </div>

            {selectedRaceId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="f-puesto">Puesto en esta carrera</Label>
                  <Select
                    value={fichaPuesto || SIN_PUESTO}
                    onValueChange={(v) => setFichaPuesto(v === SIN_PUESTO ? "" : v)}
                    disabled={puestos.length === 0}
                  >
                    <SelectTrigger id="f-puesto">
                      <SelectValue placeholder={puestos.length === 0 ? "Sin puestos creados" : "Sin asignar"} />
                    </SelectTrigger>
                    <SelectContent>
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
                <div>
                  <Label htmlFor="f-acreditacion">Acreditación</Label>
                  <Input
                    id="f-acreditacion"
                    readOnly
                    className="font-mono bg-muted"
                    value={
                      (editando && asignaciones[editando.id]?.accreditation) ||
                      (fichaPuesto
                        ? `${puestos.find((p) => p.id === fichaPuesto)?.abbr || "···"}· al guardar`
                        : "")
                    }
                    placeholder="Se genera al darle puesto"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Abreviatura del puesto + número correlativo. La asigna sola la base de datos.
                  </p>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="f-email">Email</Label>
              <Input
                id="f-email"
                type="email"
                value={ficha.email}
                onChange={(e) => setFicha({ ...ficha, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="f-notas">Notas</Label>
              <Textarea
                id="f-notas"
                value={ficha.notes}
                onChange={(e) => setFicha({ ...ficha, notes: e.target.value })}
                placeholder="Tiene coche, solo por la mañana, talla L…"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="f-activo">Activo</Label>
                <p className="text-xs text-muted-foreground">
                  El que este año no puede se desactiva; el año que viene sigue en la bolsa.
                </p>
              </div>
              <Switch
                id="f-activo"
                checked={ficha.active}
                onCheckedChange={(c) => setFicha({ ...ficha, active: c })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFichaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarFicha} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Importar pegando de Excel */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar voluntarios</DialogTitle>
            <DialogDescription>
              Pega las filas de tu hoja de cálculo: una por línea, en el orden{" "}
              <strong>nombre, teléfono, DNI, carnet</strong>. Los dos últimos pueden ir vacíos. Quien
              ya esté en la bolsa (mismo teléfono o DNI) se deja como está.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={importTexto}
            onChange={(e) => setImportTexto(e.target.value)}
            rows={8}
            className="font-mono text-sm"
            placeholder={"María Etxebarria\t600123456\t12345678Z\tB\nJon Aguirre\t600654321\t87654321X"}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={importar} disabled={importando}>
              {importando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar a {borrar?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Desaparece de la bolsa y de las carreras en las que estuviera asignado. Si solo es que
              este año no puede, es mejor desactivarlo.
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
