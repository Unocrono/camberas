/**
 * RECEPTOR ULTRA — a dónde se reparten las lecturas del lector RFID «Ultra».
 *
 * El Ultra manda sus lecturas a nuestro VPS (receptor-ultra/receptor.py) y el
 * receptor las sube a Camberas y las replica a los servidores de esta lista
 * (p. ej. el de RFID Timing / Outreach). Solo admin: la RLS de las dos tablas
 * deja leer y escribir únicamente a has_role admin.
 *
 * - ultra_receptores: uno por VPS. `clave` va en /root/ultra/config.json como
 *   "clave_receptor"; `visto_en` lo pone now() en cada sincronización y
 *   `estado` es el JSON que manda el receptor cada ~15 s.
 * - ultra_destinos: los servidores. Como mucho uno contesta al Ultra por
 *   receptor (un trigger quita `contesta` a los demás al marcar uno).
 * - ultra_lectores: cada Ultra (por número de lector) con lo que necesita el
 *   programa del PC que alimenta RaceTec: `identificador` (nombre del equipo y
 *   de su fichero de lecturas, U137 → U137.txt) y `timer_name` (el punto de
 *   RaceTec: CP1, CP2, Finish; cambia de una carrera a otra). La tabla de
 *   Ultras es la UNIÓN de lo que cuenta el receptor y lo guardado aquí.
 *
 * HORAS: `ultima_hora` de cada Ultra es hora de PARED del lector y se enseña
 * tal cual (texto). Los ISO con zona (visto_en, enviado, desde, ultimo_ok…)
 * sí son instantes reales y se enseñan como «hace …».
 *
 * Las tablas aún no están en types.ts (generado): se usa el cliente sin tipar.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { ChevronDown, Copy, Loader2, Pencil, Plus, Router, Trash2 } from "lucide-react";

const db = supabase as unknown as SupabaseClient;

/** Cada cuánto se vuelve a leer la pantalla */
const REFRESCO_MS = 10_000;
/** El receptor sincroniza cada ~15 s: más de esto sin noticias es «Sin noticias» */
const EN_LINEA_MS = 60_000;

// ---------------------------------------------------------------------------
// Datos

interface Receptor {
  id: string;
  nombre: string;
  clave: string;
  visto_en: string | null;
  estado: unknown;
  created_at: string;
}

interface Destino {
  id: string;
  receptor_id: string;
  nombre: string;
  host: string;
  puerto: number;
  contesta: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string | null;
}

/** Lo que el programa del PC necesita de cada Ultra (ultra_lectores) */
interface Lector {
  id: string;
  receptor_id: string;
  lector: number;
  identificador: string;
  timer_name: string;
  updated_at: string | null;
}

/** Lo que manda el receptor. Todo opcional: un receptor antiguo o recién arrancado manda menos. */
interface EstadoUltra {
  lector?: number | string | null;
  ip?: string | null;
  conectado?: boolean | null;
  desde?: string | null;
  hasta?: string | null;
  ultima_num?: number | null;
  ultima_hora?: string | null;
  lecturas?: number | null;
  contesta?: string | null;
}

interface EstadoEnvio {
  pendientes?: number | null;
  ultimo_ok?: string | null;
  error?: string | null;
}

interface EstadoDestino extends EstadoEnvio {
  id?: string | null;
  nombre?: string | null;
  host?: string | null;
  puerto?: number | null;
  contesta?: boolean | null;
  conectado?: boolean | null;
}

interface EstadoReceptor {
  version?: number | null;
  enviado?: string | null;
  arranque?: string | null;
  ultras: EstadoUltra[];
  camberas: EstadoEnvio | null;
  destinos: EstadoDestino[];
}

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Lee `estado` sin fiarse de su forma: lo que no cuadre, se descarta. */
const leerEstado = (crudo: unknown): EstadoReceptor | null => {
  if (!esObjeto(crudo)) return null;
  const lista = <T,>(x: unknown) => (Array.isArray(x) ? x.filter(esObjeto) : []) as T[];
  return {
    version: typeof crudo.version === "number" ? crudo.version : null,
    enviado: typeof crudo.enviado === "string" ? crudo.enviado : null,
    arranque: typeof crudo.arranque === "string" ? crudo.arranque : null,
    ultras: lista<EstadoUltra>(crudo.ultras),
    camberas: esObjeto(crudo.camberas) ? (crudo.camberas as EstadoEnvio) : null,
    destinos: lista<EstadoDestino>(crudo.destinos),
  };
};

/** Número de lector del estado (137 o «137») → 137; null si no es un lector válido (0–255, como el CHECK). */
const numLector = (x: EstadoUltra["lector"]): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : null;
};

/** Fila de la tabla de Ultras: lo que cuenta el receptor (u) y/o lo guardado en BD (l). Al menos uno. */
interface FilaUltra {
  key: string;
  lector: number | null;
  u: EstadoUltra | null;
  l: Lector | null;
}

// ---------------------------------------------------------------------------
// Horas

/** Instante real (ISO con zona) → milisegundos, o null si no se entiende. */
const instanteMs = (iso: string | null | undefined): number | null => {
  if (!iso || typeof iso !== "string") return null;
  // Safari no traga más de 3 decimales ni el espacio en vez de la T
  const t = Date.parse(iso.trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(t) ? null : t;
};

/** «hace 12 s», «hace 3 min»… Solo para instantes reales, nunca para horas de pared. */
const hace = (iso: string | null | undefined, ahora: number): string | null => {
  const t = instanteMs(iso);
  if (t === null) return null;
  const s = Math.max(0, Math.round((ahora - t) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

/** Hora de PARED del Ultra («2026-10-14 22:06:48.358» → «22:06:48.358»), tal cual, sin Date. */
const horaPared = (texto: string | null | undefined): string | null => {
  if (!texto || typeof texto !== "string") return null;
  const partes = texto.trim().split(/[ T]/);
  return partes.length > 1 ? partes[partes.length - 1] : texto.trim();
};

const enLinea = (r: Receptor, ahora: number) => {
  const t = instanteMs(r.visto_en);
  return t !== null && ahora - t < EN_LINEA_MS;
};

// ---------------------------------------------------------------------------
// Formulario

// Igual que los CHECK de ultra_destinos
/** Igual que el CHECK de ultra_destinos.host: etiquetas de 1–63, separadas por un punto, sin «..» */
const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

const destinoSchema = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre").max(80, "Máximo 80 caracteres"),
  host: z
    .string()
    .trim()
    .min(1, "Falta la IP o el nombre del servidor")
    .max(253, "Nombre demasiado largo")
    .regex(HOST_RE, "Solo la IP o el nombre, sin http:// ni puerto (p. ej. 82.113.145.105)"),
  puerto: z.coerce
    .number({ invalid_type_error: "El puerto es un número" })
    .int("El puerto es un número entero")
    .min(1, "Entre 1 y 65535")
    .max(65535, "Entre 1 y 65535"),
  contesta: z.boolean(),
});

type ErroresForm = Partial<Record<"nombre" | "host" | "puerto", string>>;

const VACIO = { receptor_id: "", nombre: "", host: "", puerto: "", contesta: false };

/** 23505 por el índice de «solo uno contesta» (el trigger debería evitarlo) y no por host + puerto */
const choqueContesta = (err: { code?: string; message: string }) =>
  err.code === "23505" && /contesta/i.test(err.message);

const mensajeError = (err: { code?: string; message: string }) => {
  if (choqueContesta(err)) return "Ya hay otro servidor que contesta al Ultra. Vuelve a intentarlo.";
  if (err.code === "23505") return "Ese servidor (misma IP o nombre y mismo puerto) ya está en la lista de este receptor.";
  if (err.code === "23514") return "Los datos no cumplen las reglas: nombre de 1 a 80 letras, IP o nombre válido y puerto de 1 a 65535.";
  if (err.code === "42501") return "Solo un administrador puede cambiar esto.";
  return err.message;
};

/** Igual que el CHECK de ultra_lectores.identificador */
const IDENT_RE = /^[A-Za-z0-9_-]{1,20}$/;

const lectorSchema = z.object({
  identificador: z
    .string()
    .trim()
    .min(1, "Falta el identificador")
    .regex(IDENT_RE, "Solo letras, cifras, guion y guion bajo, máximo 20"),
  timer_name: z.string().trim().max(50, "Máximo 50 caracteres"),
});

type ErroresLector = Partial<Record<"identificador" | "timer_name", string>>;

const LECTOR_VACIO = { identificador: "", timer_name: "" };

const mensajeErrorLector = (err: { code?: string; message: string }) => {
  if (err.code === "23514")
    return "Los datos no cumplen las reglas: identificador de 1 a 20 letras, cifras, guion o guion bajo; timer name de hasta 50.";
  if (err.code === "23503") return "Ese receptor ya no existe. Recarga la pantalla.";
  if (err.code === "42501") return "Solo un administrador puede cambiar esto.";
  return err.message;
};

// ---------------------------------------------------------------------------
// Insignias de estado

const Cargando = ({ texto }: { texto: string }) => (
  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    {texto}
  </div>
);

/** Estado de un envío (Camberas o un servidor) según lo último que contó el receptor. */
function EstadoEnvioCelda({
  estado,
  ahora,
  directo,
  sinPendientesTexto,
}: {
  estado: (EstadoEnvio & { conectado?: boolean | null }) | null | undefined;
  ahora: number;
  /** El que contesta al Ultra va en directo: no tiene cola de pendientes */
  directo?: boolean;
  /** Texto cuando no hay pendientes ni dato de conexión (p. ej. Camberas, que va por HTTP) */
  sinPendientesTexto?: string;
}) {
  if (!estado) return <span className="text-sm text-muted-foreground">Sin datos</span>;

  const pendientes = typeof estado.pendientes === "number" ? estado.pendientes : null;
  const ok = hace(estado.ultimo_ok, ahora);
  const insignias: ReactNode[] = [];

  if (estado.error) {
    insignias.push(
      <Badge key="e" variant="destructive">
        Error
      </Badge>,
    );
  }
  if (!directo && pendientes !== null && pendientes > 0) {
    insignias.push(
      <Badge key="p" variant="outline" className="border-primary/50">
        Pendientes {pendientes}
      </Badge>,
    );
  }
  if (estado.conectado === true) {
    insignias.push(
      <Badge key="c" variant="default">
        Conectado
      </Badge>,
    );
  } else if (estado.conectado === false) {
    insignias.push(
      <Badge key="c" variant="outline" className="text-muted-foreground">
        Sin conexión
      </Badge>,
    );
  } else if (!estado.error && sinPendientesTexto && pendientes === 0) {
    insignias.push(
      <Badge key="c" variant="default">
        {sinPendientesTexto}
      </Badge>,
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {insignias.length ? insignias : <span className="text-sm text-muted-foreground">Sin datos</span>}
      </div>
      {estado.error && (
        <p className="max-w-[260px] truncate text-xs text-destructive" title={estado.error}>
          {estado.error}
        </p>
      )}
      {ok && <p className="text-xs text-muted-foreground">último envío {ok}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ReceptorUltraManagement() {
  const { toast } = useToast();
  const [receptores, setReceptores] = useState<Receptor[]>([]);
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Destino | null>(null);
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState<ErroresForm>({});
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState<Destino | null>(null);

  // Identificador y timer name de un Ultra (ultra_lectores)
  const [lectores, setLectores] = useState<Lector[]>([]);
  const [lectorOpen, setLectorOpen] = useState(false);
  const [lectorEdit, setLectorEdit] = useState<{ receptor_id: string; lector: number; existente: Lector | null } | null>(null);
  const [formLector, setFormLector] = useState(LECTOR_VACIO);
  const [erroresLector, setErroresLector] = useState<ErroresLector>({});
  const [savingLector, setSavingLector] = useState(false);

  const vivo = useRef(true);
  const leyendo = useRef(false);
  const otraVez = useRef(false);

  const cargar = useCallback(async () => {
    // Si ya hay una lectura en marcha (el refresco), se repite al acabar: así un
    // guardado nunca se queda esperando al siguiente refresco
    if (leyendo.current) {
      otraVez.current = true;
      return;
    }
    leyendo.current = true;
    const [rRes, dRes, lRes] = await Promise.all([
      db
        .from("ultra_receptores")
        .select("id, nombre, clave, visto_en, estado, created_at")
        .order("created_at"),
      db
        .from("ultra_destinos")
        .select("id, receptor_id, nombre, host, puerto, contesta, activo, created_at, updated_at")
        .order("created_at"),
      db
        .from("ultra_lectores")
        .select("id, receptor_id, lector, identificador, timer_name, updated_at")
        .order("lector"),
    ]);
    leyendo.current = false;
    if (!vivo.current) return;

    const err = rRes.error || dRes.error || lRes.error;
    if (err) {
      // PGRST205 / 42P01: la tabla no existe (migración sin aplicar)
      setError(
        err.code === "PGRST205" || err.code === "42P01"
          ? "No están las tablas del receptor: falta aplicar la migración de ultra_receptores / ultra_destinos / ultra_lectores."
          : err.message,
      );
    } else {
      setError(null);
      setReceptores((rRes.data || []) as Receptor[]);
      setDestinos((dRes.data || []) as Destino[]);
      setLectores((lRes.data || []) as Lector[]);
    }
    setAhora(Date.now());
    setLoading(false);
    if (otraVez.current) {
      otraVez.current = false;
      cargar();
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    cargar();
    const t = window.setInterval(cargar, REFRESCO_MS);
    return () => {
      vivo.current = false;
      window.clearInterval(t);
    };
  }, [cargar]);

  // --- Formulario -----------------------------------------------------------

  const abrir = (d: Destino | null) => {
    setEditando(d);
    setErrores({});
    setForm(
      d
        ? { receptor_id: d.receptor_id, nombre: d.nombre, host: d.host, puerto: String(d.puerto), contesta: d.contesta }
        : { ...VACIO, receptor_id: receptores[0]?.id ?? "" },
    );
    setDialogOpen(true);
  };

  /** Si PEGAN «82.113.145.105:11111» en el host, se separa en host y puerto (al teclear no se toca). */
  const pegarHost = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const m = e.clipboardData.getData("text").trim().match(/^([^:\s/]+):(\d{1,5})$/);
    if (!m) return;
    e.preventDefault();
    setForm((f) => ({ ...f, host: m[1], puerto: m[2] }));
  };

  const guardar = async () => {
    const r = destinoSchema.safeParse(form);
    if (!r.success) {
      const e: ErroresForm = {};
      for (const issue of r.error.issues) {
        const campo = issue.path[0] as keyof ErroresForm;
        if (!e[campo]) e[campo] = issue.message;
      }
      setErrores(e);
      return;
    }
    if (!editando && !form.receptor_id) {
      toast({ title: "No hay receptor al que añadirlo", variant: "destructive" });
      return;
    }
    setErrores({});
    setSaving(true);
    const fila = { nombre: r.data.nombre, host: r.data.host, puerto: r.data.puerto, contesta: r.data.contesta };
    const { error: err } = editando
      ? await db.from("ultra_destinos").update(fila).eq("id", editando.id)
      : await db.from("ultra_destinos").insert({ ...fila, receptor_id: form.receptor_id, activo: true });
    setSaving(false);
    if (err) {
      if (err.code === "23505" && !choqueContesta(err)) {
        setErrores({ host: "Ya hay un servidor con esta IP y este puerto en la lista." });
      }
      toast({ title: "No se pudo guardar", description: mensajeError(err), variant: "destructive" });
      return;
    }
    setDialogOpen(false);
    toast({ title: editando ? "Servidor guardado" : "Servidor añadido", description: "El receptor lo recogerá en menos de 30 s." });
    cargar();
  };

  const cambiarActivo = async (d: Destino, activo: boolean) => {
    setDestinos((prev) => prev.map((x) => (x.id === d.id ? { ...x, activo } : x)));
    const { error: err } = await db.from("ultra_destinos").update({ activo }).eq("id", d.id);
    if (err) {
      setDestinos((prev) => prev.map((x) => (x.id === d.id ? { ...x, activo: d.activo } : x)));
      toast({ title: "No se pudo cambiar", description: mensajeError(err), variant: "destructive" });
    }
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    const { error: err } = await db.from("ultra_destinos").delete().eq("id", borrar.id);
    setBorrar(null);
    if (err) {
      toast({ title: "No se pudo quitar", description: mensajeError(err), variant: "destructive" });
      return;
    }
    cargar();
  };

  // --- Identificador y timer name de un Ultra ---------------------------------

  const abrirLector = (receptor_id: string, lector: number, existente: Lector | null) => {
    setLectorEdit({ receptor_id, lector, existente });
    setErroresLector({});
    // Sin fila guardada se propone U<lector>, que es lo que el PC usa por defecto
    setFormLector(
      existente
        ? { identificador: existente.identificador, timer_name: existente.timer_name }
        : { identificador: `U${lector}`, timer_name: "" },
    );
    setLectorOpen(true);
  };

  const guardarLector = async () => {
    if (!lectorEdit) return;
    const r = lectorSchema.safeParse(formLector);
    if (!r.success) {
      const e: ErroresLector = {};
      for (const issue of r.error.issues) {
        const campo = issue.path[0] as keyof ErroresLector;
        if (!e[campo]) e[campo] = issue.message;
      }
      setErroresLector(e);
      return;
    }
    setErroresLector({});
    setSavingLector(true);
    const { error: err } = await db.from("ultra_lectores").upsert(
      {
        receptor_id: lectorEdit.receptor_id,
        lector: lectorEdit.lector,
        identificador: r.data.identificador,
        timer_name: r.data.timer_name,
      },
      { onConflict: "receptor_id,lector" },
    );
    setSavingLector(false);
    if (err) {
      toast({ title: "No se pudo guardar", description: mensajeErrorLector(err), variant: "destructive" });
      return;
    }
    setLectorOpen(false);
    toast({ title: `Ultra ${lectorEdit.lector} guardado`, description: "El receptor lo recogerá en menos de 30 s." });
    cargar();
  };

  const copiarClave = (clave: string) => {
    const linea = `"clave_receptor": "${clave}",`;
    if (!navigator.clipboard) {
      toast({ title: "No se pudo copiar", description: "Cópiala a mano.", variant: "destructive" });
      return;
    }
    navigator.clipboard
      .writeText(linea)
      .then(() => toast({ title: "Línea copiada", description: "Pégala en /root/ultra/config.json." }))
      .catch(() => toast({ title: "No se pudo copiar", description: "Cópiala a mano.", variant: "destructive" }));
  };

  // Quien contesta ahora en el receptor del formulario (para avisar de que deja de hacerlo)
  const contestaAhora = destinos.find(
    (d) => d.receptor_id === form.receptor_id && d.contesta && d.id !== editando?.id,
  );

  // --- Pantalla -------------------------------------------------------------

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Router className="h-5 w-5" />
                Receptor Ultra
              </CardTitle>
              <CardDescription>
                El Ultra manda las lecturas a nuestro servidor y de ahí se reparten a Camberas y a los
                servidores de la lista.
              </CardDescription>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => abrir(null)}
              disabled={loading || receptores.length === 0}
            >
              <Plus className="h-4 w-4" />
              Añadir servidor
            </Button>
          </div>
        </CardHeader>
        {(error || loading || receptores.length === 0) && (
          <CardContent>
            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div>
            ) : loading ? (
              <Cargando texto="Cargando receptor…" />
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay ningún receptor dado de alta. La migración del receptor siembra uno.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {receptores.map((r) => {
        const estado = leerEstado(r.estado);
        const online = enLinea(r, ahora);
        const visto = hace(r.visto_en, ahora);
        const arranco = hace(estado?.arranque, ahora);
        // El que contesta, primero (en el mismo orden que se los lleva el receptor)
        const susDestinos = destinos
          .filter((d) => d.receptor_id === r.id)
          .sort((a, b) => Number(b.contesta) - Number(a.contesta));

        // Cruce BD ↔ estado: por id; si el receptor no manda id, por host + puerto
        const usados = new Set<EstadoDestino>();
        const estadoDe = (d: Destino) => {
          const e =
            estado?.destinos.find((x) => x.id === d.id) ??
            estado?.destinos.find(
              (x) => !x.id && x.host === d.host && Number(x.puerto) === d.puerto && !usados.has(x),
            );
          if (e) usados.add(e);
          return e;
        };
        const filas = susDestinos.map((d) => ({ d, e: estadoDe(d) }));
        const sueltos = (estado?.destinos ?? []).filter((x) => !usados.has(x));

        // Ultras: lo que cuenta el receptor (en su orden) ∪ lo guardado en ultra_lectores, por número de lector
        const susLectores = lectores.filter((l) => l.receptor_id === r.id);
        const vistos = new Set<number>();
        const filasUltra: FilaUltra[] = (estado?.ultras ?? []).map((u, i) => {
          const n = numLector(u.lector);
          if (n !== null) vistos.add(n);
          return {
            key: `estado-${n ?? "?"}-${i}`,
            lector: n,
            u,
            l: n === null ? null : (susLectores.find((l) => l.lector === n) ?? null),
          };
        });
        for (const l of susLectores) {
          if (!vistos.has(l.lector)) filasUltra.push({ key: `bd-${l.id}`, lector: l.lector, u: null, l });
        }

        return (
          <Card key={r.id}>
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">{r.nombre}</CardTitle>
                {online ? (
                  <Badge variant="default" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                    En línea
                  </Badge>
                ) : (
                  <Badge variant="outline">Sin noticias</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {visto ? `Visto ${visto}` : "Aún no ha dado noticias: comprueba que el VPS tiene la clave."}
                {arranco && ` · arrancó ${arranco}`}
                {estado?.version != null && ` · versión ${estado.version}`}
                {!online && visto && " · lo de abajo es lo último que contó"}
              </p>

              <Collapsible defaultOpen={!r.visto_en}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="group -ml-3 h-8 text-xs text-muted-foreground">
                    Configuración del VPS
                    <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      Pega esta línea en <code className="font-mono">/root/ultra/config.json</code> del VPS. Es
                      secreta: con ella cualquiera se hace pasar por este receptor.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1.5 font-mono text-xs">
                        "clave_receptor": "{r.clave}",
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Copiar línea"
                        onClick={() => copiarClave(r.clave)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardHeader>

            <CardContent className={`space-y-6 ${online ? "" : "opacity-80"}`}>
              {/* Ultras */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Ultras conectados</h3>
                {filasUltra.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ningún Ultra ha conectado con el receptor.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[960px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lector</TableHead>
                          <TableHead>Identificador</TableHead>
                          <TableHead>Timer name (RaceTec)</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Conexión</TableHead>
                          <TableHead>Última lectura</TableHead>
                          <TableHead className="text-right">Lecturas</TableHead>
                          <TableHead>Le contesta</TableHead>
                          <TableHead className="w-[48px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filasUltra.map(({ key, lector, u, l }) => {
                          // Conectado: desde cuándo. Desconectado: desde cuándo se fue (hasta)
                          const desde = u ? hace(u.conectado ? u.desde : u.hasta, ahora) : null;
                          const hora = horaPared(u?.ultima_hora);
                          const timer = l?.timer_name.trim() ?? "";
                          return (
                            <TableRow key={key} className={u ? "" : "opacity-60"}>
                              <TableCell className="font-medium">{lector ?? u?.lector ?? "—"}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {l ? (
                                  l.identificador
                                ) : lector !== null ? (
                                  <span className="text-muted-foreground" title="Sugerido: aún no está guardado">
                                    U{lector}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {timer ? (
                                  <span className="font-mono text-sm">{timer}</span>
                                ) : (
                                  <>
                                    <span className="text-muted-foreground">—</span>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Sin timer name: el PC usará el identificador
                                    </p>
                                  </>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{u?.ip || "—"}</TableCell>
                              <TableCell>
                                {!u ? (
                                  <>
                                    <Badge variant="outline" className="text-muted-foreground">
                                      Sin noticias
                                    </Badge>
                                    <p className="mt-1 text-xs text-muted-foreground">el receptor no lo ha visto</p>
                                  </>
                                ) : u.conectado ? (
                                  <Badge variant="default">Conectado</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Desconectado
                                  </Badge>
                                )}
                                {desde && <p className="mt-1 text-xs text-muted-foreground">desde {desde}</p>}
                              </TableCell>
                              <TableCell>
                                {u && (u.ultima_num != null || hora) ? (
                                  <>
                                    <span className="font-medium">{u.ultima_num != null ? `nº ${u.ultima_num}` : "—"}</span>
                                    {hora && (
                                      <p className="font-mono text-xs text-muted-foreground" title={u.ultima_hora ?? undefined}>
                                        {hora}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{u?.lecturas ?? "—"}</TableCell>
                              <TableCell className="text-sm">
                                {!u || !u.contesta || !u.conectado ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : u.contesta === "receptor" ? (
                                  "El receptor"
                                ) : (
                                  u.contesta
                                )}
                              </TableCell>
                              <TableCell>
                                {lector !== null && (
                                  <div className="flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Identificador y timer name"
                                      onClick={() => abrirLector(r.id, lector, l)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  El identificador da nombre al fichero de lecturas del PC (U137.txt). El timer name es el punto
                  de RaceTec (CP1, CP2, Finish): cámbialo antes de cada carrera.
                </p>
              </section>

              {/* Destinos */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">A dónde se mandan las lecturas</h3>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table className="min-w-[680px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Servidor</TableHead>
                        <TableHead>Dirección</TableHead>
                        <TableHead className="text-center">Activo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="w-[90px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Camberas: fija, siempre activa */}
                      <TableRow>
                        <TableCell className="font-medium">Camberas</TableCell>
                        <TableCell className="text-sm text-muted-foreground">esta web</TableCell>
                        <TableCell className="text-center">
                          <Switch checked disabled aria-label="Camberas siempre está activo" />
                        </TableCell>
                        <TableCell>
                          <EstadoEnvioCelda estado={estado?.camberas} ahora={ahora} sinPendientesTexto="Al día" />
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">fijo</TableCell>
                      </TableRow>

                      {filas.map(({ d, e }) => (
                        <TableRow key={d.id} className={d.activo ? "" : "opacity-60"}>
                          <TableCell>
                            <div className="font-medium">{d.nombre}</div>
                            {d.contesta && (
                              <Badge variant="outline" className="mt-1 border-primary text-primary">
                                Contesta al Ultra
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {d.host}:{d.puerto}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={d.activo}
                              onCheckedChange={(c) => cambiarActivo(d, c)}
                              aria-label={d.activo ? "Desactivar" : "Activar"}
                            />
                          </TableCell>
                          <TableCell>
                            {d.activo ? (
                              <EstadoEnvioCelda estado={e} ahora={ahora} directo={d.contesta} />
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {d.contesta ? "Desactivado: contesta el receptor" : "Desactivado"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" title="Editar" onClick={() => abrir(d)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Quitar" onClick={() => setBorrar(d)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Lo que cuenta el receptor y no está en la lista */}
                      {sueltos.map((x, i) => (
                        <TableRow key={`suelto-${i}`} className="opacity-60">
                          <TableCell>
                            <div className="font-medium">{x.nombre || "Sin nombre"}</div>
                            <p className="text-xs text-muted-foreground">solo en el receptor</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {x.host ?? "?"}:{x.puerto ?? "?"}
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">—</TableCell>
                          <TableCell>
                            <EstadoEnvioCelda estado={x} ahora={ahora} directo={!!x.contesta} />
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {sueltos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    «Solo en el receptor»: el receptor está mandando ahí pero no está en esta lista. O viene de
                    su config.json, o aún no ha recogido un cambio reciente.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  El que contesta al Ultra recibe las lecturas en directo y le confirma cada una (como hacía
                  Outreach). Los demás reciben una copia; si están caídos, al volver se les manda lo pendiente.
                  Si ninguno contesta, contesta el receptor. Los cambios llegan al receptor en menos de 30 s.
                </p>
              </section>
            </CardContent>
          </Card>
        );
      })}

      {/* Añadir / editar servidor */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar servidor" : "Añadir servidor"}</DialogTitle>
            <DialogDescription>
              El receptor le mandará las lecturas del Ultra por TCP a esta dirección.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {!editando && receptores.length > 1 && (
              <div>
                <Label>Receptor</Label>
                <Select value={form.receptor_id} onValueChange={(v) => setForm({ ...form, receptor_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige receptor" />
                  </SelectTrigger>
                  <SelectContent>
                    {receptores.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="ud-nombre">Nombre *</Label>
              <Input
                id="ud-nombre"
                value={form.nombre}
                maxLength={80}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="RFID Timing (Outreach)"
              />
              {errores.nombre && <p className="mt-1 text-xs text-destructive">{errores.nombre}</p>}
            </div>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div>
                <Label htmlFor="ud-host">IP o nombre *</Label>
                <Input
                  id="ud-host"
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  onPaste={pegarHost}
                  placeholder="82.113.145.105"
                  className="font-mono"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <Label htmlFor="ud-puerto">Puerto *</Label>
                <Input
                  id="ud-puerto"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={65535}
                  value={form.puerto}
                  onChange={(e) => setForm({ ...form, puerto: e.target.value })}
                  placeholder="11111"
                  className="font-mono"
                />
              </div>
            </div>
            {(errores.host || errores.puerto) && (
              <div className="space-y-0.5">
                {errores.host && <p className="text-xs text-destructive">{errores.host}</p>}
                {errores.puerto && <p className="text-xs text-destructive">Puerto: {errores.puerto}</p>}
              </div>
            )}
            <div className="space-y-1 rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ud-contesta"
                  checked={form.contesta}
                  onCheckedChange={(c) => setForm({ ...form, contesta: c === true })}
                  className="mt-0.5"
                />
                <Label htmlFor="ud-contesta" className="leading-snug">
                  Contesta al Ultra (como Outreach)
                </Label>
              </div>
              <p className="pl-6 text-xs text-muted-foreground">
                {form.contesta && contestaAhora
                  ? `Ahora contesta «${contestaAhora.nombre}»: al guardar dejará de hacerlo.`
                  : !form.contesta && editando?.contesta
                    ? "Si ninguno contesta, contesta el receptor."
                    : "Solo uno contesta: recibe las lecturas en directo y le confirma cada una."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Identificador y timer name de un Ultra */}
      <Dialog open={lectorOpen} onOpenChange={setLectorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ultra {lectorEdit?.lector}</DialogTitle>
            <DialogDescription>Lo que el programa del PC necesita para alimentar RaceTec.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="ul-identificador">Identificador *</Label>
              <Input
                id="ul-identificador"
                value={formLector.identificador}
                maxLength={20}
                onChange={(e) => setFormLector((f) => ({ ...f, identificador: e.target.value }))}
                placeholder={`U${lectorEdit?.lector ?? ""}`}
                className="font-mono"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {erroresLector.identificador ? (
                <p className="mt-1 text-xs text-destructive">{erroresLector.identificador}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nombre del equipo y de su fichero de lecturas (U137 → U137.txt).
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="ul-timer">Timer name (RaceTec)</Label>
              <Input
                id="ul-timer"
                value={formLector.timer_name}
                maxLength={50}
                onChange={(e) => setFormLector((f) => ({ ...f, timer_name: e.target.value }))}
                placeholder="CP1, CP2, Finish…"
                className="font-mono"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {erroresLector.timer_name ? (
                <p className="mt-1 text-xs text-destructive">{erroresLector.timer_name}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  El punto de RaceTec al que van sus lecturas. Si lo dejas vacío, el PC usará el identificador.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLectorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarLector} disabled={savingLector}>
              {savingLector && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar «{borrar?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {borrar?.host}:{borrar?.puerto} dejará de recibir lecturas, también las que tuviera pendientes.
              {borrar?.contesta && " Era el que contestaba al Ultra: pasará a contestar el receptor."} Si solo
              quieres pararlo un rato, desactívalo en vez de quitarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrado} className="bg-destructive text-destructive-foreground">
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
