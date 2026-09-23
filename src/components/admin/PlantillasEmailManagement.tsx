/**
 * Plantillas de email a inscritos — solo admin (Inscripciones > Plantillas).
 *
 * Las usa la acción masiva "Enviar email a los seleccionados" del panel de
 * inscripciones. Aquí se editan las tres de sistema (comprobante, tu dorsal,
 * Camberas Track) y se crean otras.
 *
 * El diseño no se edita, el texto sí: la plantilla es texto con variables
 * {nombre} y bloques [[boton_mi_dorsal]] en su propia línea; la cabecera, los
 * colores y los botones los pone la edge function reenviar-comprobantes, que
 * es también quien pinta la vista previa. Así lo que se ve aquí es lo que
 * llega, y un admin no puede romper un email en Outlook.
 *
 * Tabla nueva (20260923220000_plantillas_email.sql): va casteada hasta que se
 * regeneren los tipos.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { AlertTriangle, Copy, Loader2, Mail, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  BLOQUES_EMAIL,
  VARIABLES_EMAIL,
  MAX_LINEA,
  bloquesDesconocidos,
  bloquesFueraDeLinea,
  claveDesdeNombre,
  lineasLargas,
  usaMensaje,
  variablesDesconocidas,
  type PlantillaEmail,
} from "@/lib/plantillasEmail";

const db = supabase as any;

type Borrador = Omit<PlantillaEmail, "orden"> & { orden: string };

const VACIA: Borrador = {
  clave: "",
  nombre: "",
  descripcion: "",
  asunto: "",
  titulo: "",
  cuerpo: "Hola {nombre},\n\n",
  etiqueta_mensaje: "",
  omitir_uno: false,
  es_sistema: false,
  activa: true,
  orden: "100",
};

const aBorrador = (p: PlantillaEmail): Borrador => ({
  ...p,
  descripcion: p.descripcion ?? "",
  etiqueta_mensaje: p.etiqueta_mensaje ?? "",
  orden: String(p.orden ?? 100),
});

export function PlantillasEmailManagement() {
  const { toast } = useToast();
  const [plantillas, setPlantillas] = useState<PlantillaEmail[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);

  // Editor: null = cerrado; con id = editar; sin id = nueva
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<PlantillaEmail | null>(null);
  // Cómo estaba al abrirlo: Escape o un clic fuera no tiran cambios sin preguntar
  const [inicial, setInicial] = useState("");
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);

  // Vista previa, pintada por la función (la misma que envía)
  const [previa, setPrevia] = useState<{ asunto: string; html: string; requisitos?: { dorsal: boolean; track: boolean } } | null>(null);
  const [previaError, setPreviaError] = useState<string | null>(null);
  const [previaCargando, setPreviaCargando] = useState(false);
  const previaPeticion = useRef(0);

  const cargar = useCallback(async () => {
    const { data, error } = await db
      .from("plantillas_email")
      .select("*")
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true });
    if (error) {
      setSinTabla(true);
      setPlantillas([]);
    } else {
      setSinTabla(false);
      setPlantillas((data ?? []) as PlantillaEmail[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ── Vista previa con un respiro: se pide al dejar de teclear ────────────
  useEffect(() => {
    if (!borrador) return;
    const peticion = ++previaPeticion.current;
    setPreviaCargando(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke("reenviar-comprobantes", {
        body: {
          vistaPrevia: {
            asunto: borrador.asunto,
            titulo: borrador.titulo,
            cuerpo: borrador.cuerpo,
            etiqueta_mensaje: borrador.etiqueta_mensaje,
          },
        },
      });
      if (peticion !== previaPeticion.current) return;
      setPreviaCargando(false);
      if (error || !data?.html) {
        setPrevia(null);
        setPreviaError(
          "No se pudo pintar la vista previa. Si acabas de estrenar las plantillas, falta desplegar la " +
            "función reenviar-comprobantes con la última versión.",
        );
        return;
      }
      setPreviaError(null);
      setPrevia(data);
    }, 700);
    return () => clearTimeout(t);
  }, [borrador?.asunto, borrador?.titulo, borrador?.cuerpo, borrador?.etiqueta_mensaje]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (b: Borrador) => {
    setPrevia(null);
    setPreviaError(null);
    setInicial(JSON.stringify(b));
    setBorrador(b);
  };

  const cerrarEditor = () => {
    if (guardando) return;
    if (borrador && JSON.stringify(borrador) !== inicial && !window.confirm("¿Descartar los cambios de esta plantilla?")) {
      return;
    }
    setBorrador(null);
  };

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setBorrador((b) => (b ? { ...b, [k]: v } : b));

  /** Mete {variable} o [[bloque]] donde está el cursor; los bloques, en su propia línea */
  const insertar = (texto: string, esBloque: boolean) => {
    const el = cuerpoRef.current;
    if (!borrador || !el) return;
    const valor = borrador.cuerpo;
    const ini = el.selectionStart ?? valor.length;
    const fin = el.selectionEnd ?? valor.length;
    let pieza = texto;
    if (esBloque) {
      const antes = valor.slice(0, ini);
      const despues = valor.slice(fin);
      if (antes && !antes.endsWith("\n")) pieza = "\n" + pieza;
      if (!despues.startsWith("\n")) pieza = pieza + "\n";
    }
    set("cuerpo", valor.slice(0, ini) + pieza + valor.slice(fin));
    requestAnimationFrame(() => {
      el.focus();
      const pos = ini + pieza.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // ── Errores que impiden guardar ─────────────────────────────────────────
  const problemas = (b: Borrador): string[] => {
    const lista: string[] = [];
    if (!b.nombre.trim()) lista.push("Falta el nombre");
    if (!b.asunto.trim()) lista.push("Falta el asunto");
    if (!b.titulo.trim()) lista.push("Falta el título");
    if (!b.cuerpo.trim()) lista.push("Falta el texto");
    const bloques = bloquesDesconocidos(b.cuerpo);
    if (bloques.length) lista.push(`Bloques que no existen: ${bloques.join(", ")}`);
    const sueltos = bloquesFueraDeLinea(b.cuerpo);
    if (sueltos.length) lista.push(`Cada bloque debe ir solo en su línea: ${sueltos.join(", ")}`);
    const largas = lineasLargas(b.cuerpo);
    if (largas) lista.push(`${largas === 1 ? "Hay una línea" : `Hay ${largas} líneas`} de más de ${MAX_LINEA} caracteres: pártela con saltos de línea`);
    const vars = variablesDesconocidas(`${b.asunto}\n${b.titulo}\n${b.cuerpo}`);
    if (vars.length) lista.push(`Variables que no existen (van en minúscula y sin espacios): ${vars.join(", ")}`);
    return lista;
  };

  const guardar = async () => {
    if (!borrador) return;
    const errores = problemas(borrador);
    if (errores.length) {
      toast({ title: "Revisa la plantilla", description: errores.join(" · "), variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const campos = {
        nombre: borrador.nombre.trim(),
        descripcion: borrador.descripcion?.trim() || null,
        asunto: borrador.asunto.trim(),
        titulo: borrador.titulo.trim(),
        cuerpo: borrador.cuerpo.replace(/\s+$/, ""),
        etiqueta_mensaje: borrador.etiqueta_mensaje?.trim() || null,
        omitir_uno: borrador.omitir_uno,
        activa: borrador.activa !== false,
        orden: (() => {
          const n = Number.parseInt(borrador.orden, 10);
          return Number.isFinite(n) ? Math.max(-2147483648, Math.min(2147483647, n)) : 100;
        })(),
      };
      if (borrador.id) {
        const { error } = await db.from("plantillas_email").update(campos).eq("id", borrador.id);
        if (error) throw error;
      } else {
        // La clave sale del nombre; si ya existe, se numera
        const base = claveDesdeNombre(borrador.nombre);
        let hecho = false;
        for (let n = 1; n <= 20 && !hecho; n++) {
          const clave = n === 1 ? base : `${base}-${n}`;
          const { error } = await db.from("plantillas_email").insert({ ...campos, clave });
          if (!error) hecho = true;
          else if (error.code !== "23505") throw error;
        }
        if (!hecho) throw new Error("No se encontró una clave libre para ese nombre");
      }
      toast({ title: borrador.id ? "Plantilla guardada" : "Plantilla creada" });
      setBorrador(null);
      cargar();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!aBorrar?.id) return;
    const { error } = await db.from("plantillas_email").delete().eq("id", aBorrar.id);
    if (error) {
      toast({ title: "No se pudo borrar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `«${aBorrar.nombre}» borrada` });
      cargar();
    }
    setABorrar(null);
  };

  if (cargando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const errores = borrador ? problemas(borrador) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Plantillas de email</h2>
          <p className="text-muted-foreground">
            Los emails que se mandan a los inscritos desde Inscripciones → Acciones masivas → «Enviar email».
          </p>
        </div>
        {!sinTabla && (
          <Button onClick={() => abrir({ ...VACIA })} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva plantilla
          </Button>
        )}
      </div>

      {sinTabla ? (
        <Card className="border-destructive/50">
          <CardContent className="py-6 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <p>
              Falta aplicar la migración <code>20260923220000_plantillas_email.sql</code> en el editor SQL. Hasta
              entonces los emails se envían con los textos de fábrica.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {plantillas.map((p) => (
            <Card key={p.id} className={p.activa === false ? "opacity-60" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex flex-wrap items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {p.nombre}
                      {p.es_sistema && <Badge variant="secondary">De sistema</Badge>}
                      {p.activa === false && <Badge variant="outline">Desactivada</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Asunto: <span className="text-foreground">{p.asunto}</span>
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => abrir(aBorrador(p))}>
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Duplicar como plantilla nueva"
                      onClick={() =>
                        abrir({
                          ...aBorrador(p),
                          id: undefined,
                          clave: "",
                          nombre: `Copia de ${p.nombre}`.slice(0, 80),
                          es_sistema: false,
                          asunto_original: null,
                          titulo_original: null,
                          cuerpo_original: null,
                        })
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {!p.es_sistema && (
                      <Button variant="ghost" size="sm" title="Borrar" onClick={() => setABorrar(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {p.descripcion && (
                <CardContent className="pt-0 text-sm text-muted-foreground">{p.descripcion}</CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Editor ─────────────────────────────────────────────────────── */}
      <Dialog open={!!borrador} onOpenChange={(o) => !o && cerrarEditor()}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          {borrador && (
            <>
              <DialogHeader>
                <DialogTitle>{borrador.id ? `Editar «${borrador.nombre}»` : "Nueva plantilla"}</DialogTitle>
                <DialogDescription>
                  Escribes el texto; el diseño (cabecera, colores y botones) lo pone Camberas. La vista previa es
                  exactamente el email que llega, con datos de ejemplo.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Columna del formulario */}
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
                    <div className="space-y-1">
                      <Label htmlFor="pe-nombre">Nombre (el que se elige al enviar)</Label>
                      <Input id="pe-nombre" maxLength={80} value={borrador.nombre}
                        onChange={(e) => set("nombre", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pe-orden">Orden</Label>
                      <Input id="pe-orden" type="number" value={borrador.orden}
                        onChange={(e) => set("orden", e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="pe-desc">Descripción (ayuda al elegirla, no va en el email)</Label>
                    <Input id="pe-desc" maxLength={400} value={borrador.descripcion ?? ""}
                      onChange={(e) => set("descripcion", e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="pe-asunto">Asunto</Label>
                    <Input id="pe-asunto" maxLength={200} value={borrador.asunto}
                      onChange={(e) => set("asunto", e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="pe-titulo">Título (el encabezado dentro del email)</Label>
                    <Input id="pe-titulo" maxLength={200} value={borrador.titulo}
                      onChange={(e) => set("titulo", e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="pe-cuerpo">Texto</Label>
                      {borrador.es_sistema && borrador.cuerpo_original && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() =>
                            setBorrador((b) =>
                              b
                                ? {
                                    ...b,
                                    asunto: b.asunto_original ?? b.asunto,
                                    titulo: b.titulo_original ?? b.titulo,
                                    cuerpo: b.cuerpo_original ?? b.cuerpo,
                                  }
                                : b,
                            )
                          }
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restaurar el texto original
                        </Button>
                      )}
                    </div>
                    <Textarea
                      id="pe-cuerpo"
                      ref={cuerpoRef}
                      rows={16}
                      maxLength={20000}
                      className="font-mono text-sm"
                      value={borrador.cuerpo}
                      onChange={(e) => set("cuerpo", e.target.value)}
                    />
                  </div>

                  {/* Piezas que se insertan donde está el cursor */}
                  <div className="space-y-2 rounded-md border p-3 text-xs">
                    <p className="font-medium">Variables — se cambian por los datos de cada corredor</p>
                    <div className="flex flex-wrap gap-1">
                      {VARIABLES_EMAIL.map((v) => (
                        <Button key={v.clave} type="button" variant="outline" size="sm" className="h-7 text-xs"
                          title={v.descripcion} onClick={() => insertar(`{${v.clave}}`, false)}>
                          {`{${v.clave}}`}
                        </Button>
                      ))}
                    </div>
                    <p className="font-medium pt-1">Bloques — cada uno en su propia línea</p>
                    <div className="flex flex-wrap gap-1">
                      {BLOQUES_EMAIL.map((b) => (
                        <Button key={b.clave} type="button" variant="outline" size="sm" className="h-7 text-xs"
                          title={b.descripcion + (b.requisito ? ` (${b.requisito})` : "")}
                          onClick={() => insertar(`[[${b.clave}]]`, true)}>
                          {`[[${b.clave}]]`}
                        </Button>
                      ))}
                    </div>
                    <p className="text-muted-foreground pt-1 leading-relaxed">
                      <strong>**negrita**</strong> · <code>[texto](https://enlace)</code> · <code>## </code>subtítulo
                      (<code>## 1. </code>con número) · <code>&gt; </code>nota en pequeño · <code>- </code>lista ·
                      línea en blanco = párrafo nuevo
                    </p>
                  </div>

                  {usaMensaje(borrador) && (
                    <div className="space-y-1">
                      <Label htmlFor="pe-etiqueta">Título del recuadro [[mensaje]]</Label>
                      <Input id="pe-etiqueta" maxLength={80} placeholder="De la organización"
                        value={borrador.etiqueta_mensaje ?? ""}
                        onChange={(e) => set("etiqueta_mensaje", e.target.value)} />
                      <p className="text-xs text-muted-foreground">
                        Al enviar se pide ese texto (p. ej. lugar y horario de recogida); si se deja vacío, el
                        recuadro no aparece.
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="pe-activa" className="font-normal">
                        Activa (aparece al enviar)
                      </Label>
                      <Switch id="pe-activa" checked={borrador.activa !== false}
                        onCheckedChange={(v) => set("activa", v)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="pe-uno" className="font-normal leading-snug">
                        No mandarla a las importadas de uno.es salvo que se pida
                      </Label>
                      <Switch id="pe-uno" checked={borrador.omitir_uno}
                        onCheckedChange={(v) => set("omitir_uno", v)} />
                    </div>
                  </div>
                </div>

                {/* Columna de la vista previa */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Vista previa</Label>
                    {previaCargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                  {previaError ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{previaError}</p>
                  ) : previa ? (
                    <>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Asunto:</span> <strong>{previa.asunto}</strong>
                      </p>
                      {previa.requisitos && (previa.requisitos.dorsal || previa.requisitos.track) && (
                        <p className="text-xs text-muted-foreground">
                          Solo se enviará a inscritos con dorsal
                          {previa.requisitos.track ? ", en recorridos con GPS y con su dorsal GPS generado" : ""}.
                        </p>
                      )}
                      <iframe
                        title="Vista previa del email"
                        sandbox=""
                        srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f3f4f6;padding:16px">${previa.html}</body>`}
                        className="w-full rounded-md border bg-white"
                        style={{ height: "70vh" }}
                      />
                    </>
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-md border text-sm text-muted-foreground">
                      Preparando la vista previa…
                    </div>
                  )}
                </div>
              </div>

              {errores.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-destructive">
                  {errores.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={cerrarEditor} disabled={guardando}>
                  Cancelar
                </Button>
                <Button onClick={guardar} disabled={guardando || errores.length > 0}>
                  {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {borrador.id ? "Guardar" : "Crear plantilla"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aBorrar} onOpenChange={(o) => !o && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar «{aBorrar?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de estar disponible al enviar. Los emails ya enviados no cambian. Si solo quieres dejar de
              usarla un tiempo, mejor desactívala.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={borrar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
