/**
 * Consulta de inscripción: el corredor se busca con su documento y demuestra
 * que es él con el email de la inscripción o, si no lo recuerda, con su fecha
 * de nacimiento. Ve lo justo (carrera, recorrido, dorsal, estado) y puede
 * pedirse una copia por email.
 *
 *   - ConsultaInscripcionDialog: en UNA carrera (ficha clásica, web con
 *     plantilla, dominio propio). Se abre con ?consulta=1 en la URL de la
 *     carrera (useConsultaInscripcion), también desde widget.js.
 *   - ConsultaInscripcionPanel sin carrera: camberas.com/mi-inscripcion,
 *     busca en todas las carreras próximas y del último mes.
 *
 * La lista de inscritos no se publica: aquí solo aparece lo propio. La copia
 * va SIEMPRE al email de la inscripción (enmascarado en pantalla), nunca a
 * uno tecleado aquí. Todo lo decide la edge function consultar-inscripcion,
 * que además limita los intentos.
 */
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, Mail, SearchCheck } from "lucide-react";

type Estado =
  | "pagada"
  | "confirmada"
  | "pendiente_confirmar"
  | "confirmada_sin_pago"
  | "pendiente_pago"
  | "cancelada"
  | "devuelta";

interface Item {
  id: string;
  carrera: string;
  fecha: string;
  slug: string | null;
  nombre: string | null;
  recorrido: string | null;
  dorsal: number | null;
  estado: Estado;
  accion: "copia" | "pago" | null;
  email: string | null;
  aviso: string | null;
}

type Resultado = { encontrado: false } | { encontrado: true; inscripciones: Item[] };

/** Lo que se manda a la función: los datos con los que se buscó */
interface Datos {
  carrera?: string;
  dni: string;
  email?: string;
  nacimiento?: string;
}

const ESTADOS: Record<Estado, { texto: string; clase: string }> = {
  pagada: { texto: "Inscripción pagada", clase: "bg-primary/15 text-primary" },
  confirmada: { texto: "Inscripción confirmada", clase: "bg-primary/15 text-primary" },
  pendiente_confirmar: { texto: "Pendiente de confirmar", clase: "bg-amber-100 text-amber-900" },
  confirmada_sin_pago: { texto: "Confirmada, pago con la organización", clase: "bg-amber-100 text-amber-900" },
  pendiente_pago: { texto: "Pendiente de pago", clase: "bg-amber-100 text-amber-900" },
  cancelada: { texto: "Cancelada", clase: "bg-destructive/15 text-destructive" },
  devuelta: { texto: "Cancelada y devuelta", clase: "bg-destructive/15 text-destructive" },
};

/** dd/mm/aaaa según se teclea: solo cifras, las barras las pone esto */
function formatearFecha(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

/** dd/mm/aaaa → aaaa-mm-dd, o null si no es una fecha real y pasada */
function fechaISO(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  if (a < 1900 || f.getTime() > Date.now()) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 3 de octubre de 2026 (la fecha de la carrera es un día, sin hora) */
const fechaCarrera = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

/** El motivo que manda la función (el error genérico de invoke lo esconde) */
async function motivoDe(error: unknown): Promise<string> {
  const e = error as { context?: { json?: () => Promise<{ error?: string }> } };
  try {
    const cuerpo = await e.context?.json?.();
    if (cuerpo?.error) return cuerpo.error;
  } catch {
    /* sin cuerpo legible */
  }
  return "No se ha podido consultar ahora mismo. Inténtalo de nuevo en unos minutos.";
}

interface PanelProps {
  /** races.id o slug. Sin carrera: todas las próximas y del último mes */
  carrera?: string;
}

export function ConsultaInscripcionPanel({ carrera }: PanelProps) {
  const global = !carrera;
  const [modo, setModo] = useState<"email" | "nacimiento">("email");
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [nacimiento, setNacimiento] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Por inscripción: enviando, enviada (a dónde) o el motivo de no poder
  const [enviando, setEnviando] = useState<string | null>(null);
  const [enviadas, setEnviadas] = useState<Record<string, string>>({});
  const [fallos, setFallos] = useState<Record<string, string>>({});
  // Los datos con los que se encontró lo que hay en pantalla: la copia se
  // pide con ESOS, no con lo que haya ahora en los campos
  const consultaHecha = useRef<Datos | null>(null);
  // Solo cuenta la respuesta de la última búsqueda
  const peticion = useRef(0);

  /** Tocar un dato invalida lo que hay en pantalla */
  const olvidarResultado = () => {
    peticion.current++;
    consultaHecha.current = null;
    setResultado(null);
    setEnviadas({});
    setFallos({});
    setBuscando(false);
  };

  const buscar = async () => {
    setError(null);
    if (dni.replace(/[^a-z0-9]/gi, "").length < 5) {
      setError("Escribe tu DNI, NIE o pasaporte completo.");
      return;
    }
    const nac = modo === "nacimiento" ? fechaISO(nacimiento) : null;
    if (modo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Escribe el email con el que te inscribiste.");
      return;
    }
    if (modo === "nacimiento" && !nac) {
      setError("Escribe tu fecha de nacimiento como dd/mm/aaaa.");
      return;
    }
    const datos: Datos = {
      ...(carrera ? { carrera } : {}),
      dni: dni.trim(),
      ...(modo === "email" ? { email: email.trim().toLowerCase() } : { nacimiento: nac! }),
    };
    olvidarResultado();
    const mia = peticion.current;
    setBuscando(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("consultar-inscripcion", {
        body: { accion: "buscar", ...datos },
      });
      if (mia !== peticion.current) return;
      if (err) throw new Error(await motivoDe(err));
      const r = data as Resultado;
      if (r.encontrado) consultaHecha.current = datos;
      setResultado(r);
    } catch (e) {
      if (mia !== peticion.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mia === peticion.current) setBuscando(false);
    }
  };

  const enviar = async (item: Item) => {
    const datos = consultaHecha.current;
    if (!datos) return;
    const mia = peticion.current;
    setEnviando(item.id);
    setFallos((f) => {
      const { [item.id]: _, ...resto } = f;
      return resto;
    });
    try {
      const { data, error: err } = await supabase.functions.invoke("consultar-inscripcion", {
        body: { accion: "enviar", inscripcion: item.id, ...datos },
      });
      if (mia !== peticion.current) return;
      if (err) throw new Error(await motivoDe(err));
      const r = data as { enviado?: boolean; email?: string } | null;
      if (r?.enviado !== true) throw new Error("No se ha podido enviar. Vuelve a buscar tu inscripción.");
      setEnviadas((e) => ({ ...e, [item.id]: r.email ?? item.email ?? "tu email" }));
    } catch (e) {
      if (mia !== peticion.current) return;
      setFallos((f) => ({ ...f, [item.id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (mia === peticion.current) setEnviando(null);
    }
  };

  const cambiarModo = (nuevo: "email" | "nacimiento") => {
    setModo(nuevo);
    setError(null);
    olvidarResultado();
  };

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="consulta-dni">DNI, NIE o pasaporte</Label>
          <Input
            id="consulta-dni"
            value={dni}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="12345678Z"
            onChange={(e) => {
              setDni(e.target.value);
              olvidarResultado();
            }}
          />
        </div>

        {modo === "email" ? (
          <div className="space-y-1.5">
            <Label htmlFor="consulta-email">Email de la inscripción</Label>
            <Input
              id="consulta-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              placeholder="el que usaste al inscribirte"
              onChange={(e) => {
                setEmail(e.target.value);
                olvidarResultado();
              }}
            />
            <button
              type="button"
              className="text-sm text-primary underline underline-offset-2"
              onClick={() => cambiarModo("nacimiento")}
            >
              ¿No recuerdas qué email usaste? Usa tu fecha de nacimiento
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="consulta-nacimiento">Fecha de nacimiento</Label>
            <Input
              id="consulta-nacimiento"
              inputMode="numeric"
              autoComplete="bday"
              value={nacimiento}
              placeholder="dd/mm/aaaa"
              autoFocus
              onChange={(e) => {
                setNacimiento(formatearFecha(e.target.value));
                olvidarResultado();
              }}
            />
            <button
              type="button"
              className="text-sm text-primary underline underline-offset-2"
              onClick={() => cambiarModo("email")}
            >
              Prefiero buscar con el email
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={buscando}>
          {buscando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {global ? "Buscar mis inscripciones" : "Buscar mi inscripción"}
        </Button>
      </form>

      <div aria-live="polite" className="space-y-3">
        {resultado && !resultado.encontrado && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              {global
                ? "No encontramos inscripciones con esos datos en las próximas carreras."
                : "No encontramos ninguna inscripción con esos datos en esta carrera."}
            </p>
            <p className="mt-1 text-muted-foreground">
              Revisa el documento y {modo === "email" ? "el email (o prueba con tu fecha de nacimiento)" : "la fecha de nacimiento"}.
              Si crees que es un error, escribe a la organización de la carrera.
            </p>
          </div>
        )}

        {resultado?.encontrado && (
          <>
            {resultado.inscripciones.map((it) => (
              <div key={it.id} className="space-y-3 rounded-lg border border-border p-4">
                {global && (
                  <div>
                    <p className="font-semibold leading-tight">
                      {it.slug ? (
                        <a href={`/${it.slug}`} className="hover:underline">
                          {it.carrera}
                        </a>
                      ) : (
                        it.carrera
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{fechaCarrera(it.fecha)}</p>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {it.nombre && <p className={global ? "text-sm" : "font-semibold"}>{it.nombre}</p>}
                    <p className="text-sm text-muted-foreground">
                      {[it.recorrido, it.dorsal != null ? `Dorsal ${it.dorsal}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 whitespace-nowrap ${ESTADOS[it.estado].clase}`}>
                    {ESTADOS[it.estado].texto}
                  </Badge>
                </div>

                {enviadas[it.id] ? (
                  <p className="flex items-start gap-2 text-sm text-primary">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Enviado a <strong>{enviadas[it.id]}</strong>. Si no lo ves en unos minutos, mira en la carpeta de spam.
                    </span>
                  </p>
                ) : it.accion ? (
                  <div className="space-y-1.5">
                    <Button variant="outline" className="w-full" disabled={enviando !== null} onClick={() => enviar(it)}>
                      {enviando === it.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      {it.accion === "pago" ? "Enviarme el enlace para pagar" : "Enviarme una copia"}
                    </Button>
                    {it.email && (
                      <p className="text-center text-xs text-muted-foreground">
                        Se envía a {it.email}, el email de tu inscripción.
                      </p>
                    )}
                  </div>
                ) : (
                  it.aviso && <p className="text-sm text-muted-foreground">{it.aviso}</p>
                )}

                {fallos[it.id] && (
                  <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {fallos[it.id]}
                  </p>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              ¿Ese email ya no es tuyo o algún dato está mal? Escribe a la organización de la carrera para que lo corrija.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

interface DialogProps {
  /** races.id o slug */
  carrera: string;
  nombreCarrera: string;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * La consulta de UNA carrera. El panel vive dentro del contenido del
 * diálogo: al cerrarlo se desmonta y no queda nada a la vista (móvil
 * compartido), ni siquiera una búsqueda que siguiera en curso.
 */
export function ConsultaInscripcionDialog({ carrera, nombreCarrera, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="h-5 w-5 text-primary" />
            Comprueba tu inscripción
          </DialogTitle>
          <DialogDescription>
            Busca tu inscripción en {nombreCarrera} con tu documento y, por tu privacidad, el email con el que te
            inscribiste (o tu fecha de nacimiento).
          </DialogDescription>
        </DialogHeader>
        <ConsultaInscripcionPanel carrera={carrera} />
      </DialogContent>
    </Dialog>
  );
}
