import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Trash2, Upload } from "lucide-react";

/**
 * Dorsal simulado del recorrido (Recorridos › Dorsales).
 *
 * El organizador sube la plantilla del dorsal en blanco (JPG), decide si se
 * personaliza con el nombre del corredor (o su nick) y ve al momento cómo
 * queda con los datos del primer corredor del recorrido, que puede cambiar
 * para probar. La imagen la dibuja la edge function dorsal-imagen, la misma
 * que pinta el dorsal en el correo «Tu dorsal y QR»: lo que se ve aquí es lo
 * que recibe el corredor. Se guarda en race_distances.dorsal_simulado.
 */

type Texto = "nombre" | "nick" | "ninguno";
interface Caja {
  centroX: number;
  arriba: number;
  alto: number;
  ensanche?: number;
  anchoMax?: number;
  color?: string;
}
export interface DorsalSimulado {
  fondo: string;
  fuente?: string;
  texto: Texto;
  numero: Caja;
  nombre: Caja;
}

// Colocación de partida para una plantilla nueva, en proporción a su tamaño:
// la del dorsal de Entre Viñedos (1181 x 833), que es el formato habitual
function colocacionInicial(ancho: number, alto: number): Pick<DorsalSimulado, "numero" | "nombre"> {
  return {
    numero: {
      centroX: Math.round(ancho * 0.48),
      arriba: Math.round(alto * 0.333),
      alto: Math.round(alto * 0.327),
      ensanche: 1.15,
      anchoMax: Math.round(ancho * 0.85),
      color: "#000000",
    },
    nombre: {
      centroX: Math.round(ancho * 0.498),
      arriba: Math.round(alto * 0.669),
      alto: Math.round(alto * 0.055),
      ensanche: 1.23,
      anchoMax: Math.round(ancho * 0.61),
      color: "#000000",
    },
  };
}

const medirImagen = (url: string) =>
  new Promise<{ ancho: number; alto: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ ancho: img.naturalWidth, alto: img.naturalHeight });
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = url;
  });

interface Props {
  raceId: string;
  distanceId: string;
}

export function DorsalSimuladoEditor({ raceId, distanceId }: Props) {
  const { toast } = useToast();
  const [conf, setConf] = useState<DorsalSimulado | null>(null);
  const [heredada, setHeredada] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aTodos, setATodos] = useState(false);
  const [medidas, setMedidas] = useState<{ ancho: number; alto: number } | null>(null);
  const [verAjustes, setVerAjustes] = useState(false);
  // Datos de prueba: el primer corredor del recorrido, editables
  const [numero, setNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [nick, setNick] = useState("");
  const [corredor, setCorredor] = useState<string | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [pintando, setPintando] = useState(false);
  const vistaAnterior = useRef<string | null>(null);

  // ── Carga: la configuración del recorrido (o la de la carrera, heredada) y
  //    el primer corredor con dorsal
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const [{ data: dist }, { data: race }, { data: primero }] = await Promise.all([
        supabase.from("race_distances").select("dorsal_simulado" as "*").eq("id", distanceId).maybeSingle(),
        supabase.from("races").select("dorsal_simulado" as "*").eq("id", raceId).maybeSingle(),
        supabase
          .from("registrations")
          .select("id, bib_number, first_name, last_name")
          .eq("race_distance_id", distanceId)
          .not("bib_number", "is", null)
          .neq("status", "cancelled")
          .order("bib_number", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!vivo) return;
      const propia = (dist as unknown as { dorsal_simulado?: DorsalSimulado | null } | null)?.dorsal_simulado ?? null;
      const deCarrera = (race as unknown as { dorsal_simulado?: (DorsalSimulado & { recorridos?: Record<string, Partial<DorsalSimulado>> }) | null } | null)
        ?.dorsal_simulado ?? null;
      if (propia?.fondo) {
        setConf({ ...propia, texto: propia.texto ?? "nombre" });
        setHeredada(false);
      } else if (deCarrera?.fondo) {
        const { recorridos, ...resto } = deCarrera;
        setConf({ ...resto, ...(recorridos?.[distanceId] ?? {}), texto: resto.texto ?? "nombre" } as DorsalSimulado);
        setHeredada(true);
      } else {
        setConf(null);
      }
      const p = primero as unknown as { id: string; bib_number: number; first_name: string | null; last_name: string | null } | null;
      if (p) {
        setNumero(String(p.bib_number));
        setNombre((p.first_name ?? "").trim());
        setCorredor([p.first_name, p.last_name].filter(Boolean).join(" ") || null);
        const { data: resp } = await supabase
          .from("registration_responses")
          .select("field_value, registration_form_fields!inner(field_name)")
          .eq("registration_id", p.id)
          .in("registration_form_fields.field_name", ["nick", "apodo", "nombre_dorsal"])
          .limit(1);
        if (vivo) setNick(((resp?.[0] as { field_value?: string } | undefined)?.field_value ?? "").trim());
      } else {
        setNumero("1");
        setNombre("Nombre");
        setCorredor(null);
      }
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [raceId, distanceId]);

  useEffect(() => {
    if (conf?.fondo) medirImagen(conf.fondo).then(setMedidas).catch(() => setMedidas(null));
  }, [conf?.fondo]);

  // ── Vista previa: la dibuja el servidor, igual que en el correo
  const pintar = useCallback(
    async (c: DorsalSimulado | null = conf) => {
      if (!c?.fondo) return;
      setPintando(true);
      try {
        const { data: sesion } = await supabase.auth.getSession();
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dorsal-imagen`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${sesion.session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            race_distance_id: distanceId,
            dorsal_simulado: c,
            numero,
            // Lo que pondría el correo: nombre de pila, o el nick si lo hay
            nombre: c.texto === "nick" ? nick || nombre : nombre,
          }),
        });
        if (!resp.ok) throw new Error((await resp.text()) || `Error ${resp.status}`);
        const url = URL.createObjectURL(await resp.blob());
        if (vistaAnterior.current) URL.revokeObjectURL(vistaAnterior.current);
        vistaAnterior.current = url;
        setVista(url);
      } catch (e) {
        toast({ title: "No se pudo dibujar el dorsal", description: e instanceof Error ? e.message : "", variant: "destructive" });
      } finally {
        setPintando(false);
      }
    },
    [conf, distanceId, numero, nombre, nick, toast],
  );

  // Primera vista en cuanto hay plantilla y datos
  const primeraVista = useRef(false);
  useEffect(() => {
    if (!cargando && conf?.fondo && !primeraVista.current) {
      primeraVista.current = true;
      pintar(conf);
    }
  }, [cargando, conf, pintar]);

  useEffect(() => () => {
    if (vistaAnterior.current) URL.revokeObjectURL(vistaAnterior.current);
  }, []);

  // ── Subir la plantilla
  const subir = async (fichero: File) => {
    if (!/^image\/(jpeg|png)$/.test(fichero.type)) {
      toast({ title: "Formato no válido", description: "Sube el dorsal en blanco como JPG o PNG", variant: "destructive" });
      return;
    }
    setSubiendo(true);
    try {
      const local = URL.createObjectURL(fichero);
      const dim = await medirImagen(local).finally(() => URL.revokeObjectURL(local));
      const ext = fichero.type === "image/png" ? "png" : "jpg";
      const ruta = `${raceId}/dorsales/${distanceId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("race-images")
        .upload(ruta, fichero, { cacheControl: "31536000", upsert: false, contentType: fichero.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("race-images").getPublicUrl(ruta);
      // Con la misma medida que la plantilla anterior se conserva la colocación
      const mismaMedida = medidas && medidas.ancho === dim.ancho && medidas.alto === dim.alto;
      const nueva: DorsalSimulado = {
        ...(conf && mismaMedida ? conf : { texto: conf?.texto ?? "nombre", ...colocacionInicial(dim.ancho, dim.alto) }),
        fondo: publicUrl,
      } as DorsalSimulado;
      setConf(nueva);
      setHeredada(false);
      setMedidas(dim);
      await pintar(nueva);
      toast({ title: "Plantilla subida", description: "Revisa la simulación y pulsa «Guardar dorsal»." });
    } catch (e) {
      toast({ title: "No se pudo subir la plantilla", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSubiendo(false);
    }
  };

  // ── Guardar en el recorrido (y, si se pide, en todos los de la carrera)
  const guardar = async () => {
    if (!conf) return;
    setGuardando(true);
    try {
      let consulta = supabase.from("race_distances").update({ dorsal_simulado: conf } as never);
      consulta = aTodos ? consulta.eq("race_id", raceId) : consulta.eq("id", distanceId);
      const { error } = await consulta;
      if (error) throw error;
      setHeredada(false);
      toast({
        title: "Dorsal guardado",
        description: aTodos ? "Aplicado a todos los recorridos de la carrera." : "Saldrá en el correo «Tu dorsal y QR».",
      });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    setGuardando(true);
    const { error } = await supabase.from("race_distances").update({ dorsal_simulado: null } as never).eq("id", distanceId);
    setGuardando(false);
    if (error) {
      toast({ title: "No se pudo quitar", description: error.message, variant: "destructive" });
      return;
    }
    setConf(null);
    setVista(null);
    toast({ title: "Dorsal simulado quitado", description: "El correo volverá a mostrar la tarjeta con el número." });
  };

  const cambiarCaja = (cual: "numero" | "nombre", campo: keyof Caja, valor: string) => {
    if (!conf) return;
    const n = Number(valor);
    if (!Number.isFinite(n)) return;
    setConf({ ...conf, [cual]: { ...conf[cual], [campo]: n } });
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando el dorsal simulado…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Dorsal simulado</p>
        <p className="text-sm text-muted-foreground">
          Sube el dorsal en blanco (JPG, sin número ni nombre). Cada corredor lo verá con su número en el correo «Tu dorsal y QR».
        </p>
        {heredada && (
          <p className="mt-1 text-xs text-muted-foreground">
            Este recorrido usa el dorsal de la carrera. Al guardar, queda como suyo.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`dorsal-plantilla-${distanceId}`}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) subir(f);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" className="gap-2" disabled={subiendo} asChild>
          <label htmlFor={`dorsal-plantilla-${distanceId}`} className="cursor-pointer">
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {conf?.fondo ? "Cambiar plantilla" : "Subir plantilla del dorsal"}
          </label>
        </Button>
        {medidas && <span className="text-xs text-muted-foreground">{medidas.ancho} × {medidas.alto} px</span>}
      </div>

      {conf?.fondo && (
        <>
          {/* ¿Personalizar con el nombre? */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Label>Personalizar con el nombre</Label>
                <p className="text-xs text-muted-foreground">Debajo del número, el nombre del corredor</p>
              </div>
              <Switch
                checked={conf.texto !== "ninguno"}
                onCheckedChange={(v) => setConf({ ...conf, texto: v ? "nombre" : "ninguno" })}
              />
            </div>
            {conf.texto !== "ninguno" && (
              <div className="space-y-1.5">
                <Label>Qué nombre</Label>
                <Select value={conf.texto} onValueChange={(v) => setConf({ ...conf, texto: v as Texto })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nombre">Nombre de pila</SelectItem>
                    <SelectItem value="nick">Nick (si lo pide el formulario)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Color de las letras: negro sobre fondo claro, blanco sobre una
              franja oscura (la Marcha de Entre Viñedos, en morado) */}
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="dorsal-color">Color del número y del nombre</Label>
            <input
              id="dorsal-color"
              type="color"
              className="h-9 w-14 cursor-pointer rounded border"
              value={conf.numero.color ?? "#000000"}
              onChange={(e) =>
                setConf({
                  ...conf,
                  numero: { ...conf.numero, color: e.target.value },
                  nombre: { ...conf.nombre, color: e.target.value },
                })
              }
            />
            {(["#000000", "#ffffff"] as const).map((c) => (
              <Button
                key={c}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConf({ ...conf, numero: { ...conf.numero, color: c }, nombre: { ...conf.nombre, color: c } })}
              >
                {c === "#000000" ? "Negro" : "Blanco"}
              </Button>
            ))}
          </div>

          {/* Datos de prueba: el primer corredor del recorrido */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="dorsal-prueba-numero">Dorsal</Label>
              <Input id="dorsal-prueba-numero" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            {conf.texto !== "ninguno" && (
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="dorsal-prueba-nombre">{conf.texto === "nick" ? "Nick" : "Nombre"}</Label>
                <Input
                  id="dorsal-prueba-nombre"
                  value={conf.texto === "nick" ? nick : nombre}
                  placeholder={conf.texto === "nick" ? nombre : undefined}
                  onChange={(e) => (conf.texto === "nick" ? setNick(e.target.value) : setNombre(e.target.value))}
                />
              </div>
            )}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {corredor ? `Datos de ${corredor}, el primer dorsal del recorrido. Cámbialos para probar; no se guardan.` : "Aún no hay corredores con dorsal: datos de ejemplo."}
          </p>

          {/* Ajuste fino de la colocación, en píxeles de la plantilla */}
          <div>
            <button type="button" className="text-sm font-medium underline underline-offset-4" onClick={() => setVerAjustes((v) => !v)}>
              {verAjustes ? "Ocultar ajustes de posición" : "Ajustar posición y tamaño"}
            </button>
            {verAjustes && (
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                {(["numero", "nombre"] as const)
                  .filter((cual) => cual === "numero" || conf.texto !== "ninguno")
                  .map((cual) => (
                    <div key={cual} className="space-y-2 rounded-md border p-3">
                      <p className="text-sm font-medium">{cual === "numero" ? "Número" : "Nombre"}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["centroX", "Centro (x)"],
                          ["arriba", "Arriba (y)"],
                          ["alto", cual === "numero" ? "Alto cifras" : "Alto mayúscula"],
                        ] as const).map(([campo, etiqueta]) => (
                          <div key={campo} className="space-y-1">
                            <Label className="text-xs">{etiqueta}</Label>
                            <Input
                              type="number"
                              value={conf[cual][campo] ?? ""}
                              onChange={(e) => cambiarCaja(cual, campo, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* La simulación */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Simulación</Label>
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={pintando} onClick={() => pintar()}>
                <RefreshCw className={`h-4 w-4 ${pintando ? "animate-spin" : ""}`} />
                Actualizar simulación
              </Button>
            </div>
            <div className="overflow-hidden rounded-md border bg-muted/30">
              {vista ? (
                <img src={vista} alt={`Simulación del dorsal ${numero}`} className="block w-full h-auto" />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  {pintando ? "Dibujando…" : "Pulsa «Actualizar simulación»"}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={aTodos} onChange={(e) => setATodos(e.target.checked)} />
              Usar este dorsal en todos los recorridos de la carrera
            </label>
            <div className="flex gap-2">
              {!heredada && (
                <Button type="button" variant="ghost" className="gap-2 text-destructive" disabled={guardando} onClick={quitar}>
                  <Trash2 className="h-4 w-4" />
                  Quitar
                </Button>
              )}
              <Button type="button" disabled={guardando} onClick={guardar}>
                {guardando ? "Guardando…" : "Guardar dorsal"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
