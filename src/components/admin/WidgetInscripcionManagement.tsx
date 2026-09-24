import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Code, Copy, ExternalLink, Loader2, Mountain } from "lucide-react";

/**
 * Widgets para la web de la carrera (sin iframe que pegar).
 *
 * Genera el código que el organizador pega en su web — un <div> y el script
 * público /widget.js — y lo previsualiza con ese mismo script, así lo que se
 * ve aquí es exactamente lo que saldrá allí. Dos widgets:
 *  - Inscripción: recorridos, precio vigente, plazas libres y botón.
 *  - Vuelo 3D de un recorrido (el mismo de la ficha de la carrera).
 * Los datos los lee el script al cargar: no hay que regenerar el código
 * cuando cambian precios, plazas o el GPX.
 */

// El código que se pega apunta SIEMPRE a producción, aunque el panel se esté
// usando desde la vista previa de Lovable
const WEB = "https://camberas.com";
const CODIGO_SCRIPT = `<script src="${WEB}/widget.js" async></script>`;

declare global {
  interface Window {
    CamberasWidget?: {
      version: number;
      montar: (el: Element) => void;
      montarVuelo?: (el: Element) => void;
      montarTodos: () => void;
    };
  }
}

interface Props {
  selectedRaceId: string;
}

interface Carrera {
  id: string;
  name: string;
  slug: string | null;
  is_visible: boolean | null;
}

interface RecorridoConGpx {
  id: string;
  name: string;
}

/**
 * Carga /widget.js una sola vez (del mismo sitio que el panel, para la vista
 * previa). Si falla, se quita la etiqueta: al volver a la vista se reintenta
 * en vez de esperar para siempre a una carga que ya terminó.
 */
function cargarScript(): Promise<void> {
  if (window.CamberasWidget) return Promise.resolve();
  document.querySelector("script[data-camberas-widget]")?.remove();
  return new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = `${window.location.origin}/widget.js`;
    s.async = true;
    s.dataset.camberasWidget = "1";
    s.onload = () => (window.CamberasWidget ? ok() : mal(new Error("widget.js cargó pero no arrancó")));
    s.onerror = () => {
      s.remove();
      mal(new Error("No se pudo cargar widget.js"));
    };
    document.head.appendChild(s);
  });
}

export function WidgetInscripcionManagement({ selectedRaceId }: Props) {
  const { toast } = useToast();
  const [carrera, setCarrera] = useState<Carrera | null>(null);
  const [recorridos, setRecorridos] = useState<RecorridoConGpx[]>([]);
  const [recorridoVuelo, setRecorridoVuelo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");
  const [scriptListo, setScriptListo] = useState(false);
  const [errorScript, setErrorScript] = useState<string | null>(null);
  const vistaInscripcion = useRef<HTMLDivElement>(null);
  const vistaVuelo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cargarScript()
      .then(() => setScriptListo(true))
      .catch((e) => setErrorScript(e.message));
  }, []);

  useEffect(() => {
    if (!selectedRaceId) {
      setCarrera(null);
      setRecorridos([]);
      return;
    }
    let vigente = true;
    setCargando(true);
    Promise.all([
      supabase.from("races").select("id, name, slug, is_visible").eq("id", selectedRaceId).maybeSingle(),
      supabase
        .from("race_distances")
        .select("id, name, gpx_file_url, show_route_map, is_visible")
        .eq("race_id", selectedRaceId)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("distance_km", { ascending: true }),
    ]).then(([carreraRes, recorridosRes]) => {
      if (!vigente) return;
      if (carreraRes.error) toast({ title: "Error", description: carreraRes.error.message, variant: "destructive" });
      setCarrera((carreraRes.data as Carrera) ?? null);
      // El vuelo solo existe con GPX y con el mapa del recorrido activado,
      // igual que el botón de la ficha
      const conGpx = (recorridosRes.data ?? [])
        .filter((d: any) => d.gpx_file_url && d.show_route_map !== false && d.is_visible !== false)
        .map((d: any) => ({ id: d.id as string, name: d.name as string }));
      setRecorridos(conGpx);
      setRecorridoVuelo(conGpx[0]?.id ?? "");
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [selectedRaceId, toast]);

  // El slug es lo que se pega (legible en el código de la web); sin slug, el id
  const clave = carrera ? carrera.slug || carrera.id : "";

  // Repintar las vistas previas al cambiar de carrera, tema o recorrido
  useEffect(() => {
    if (scriptListo && vistaInscripcion.current && clave) {
      window.CamberasWidget?.montar(vistaInscripcion.current);
    }
  }, [scriptListo, clave, tema]);

  useEffect(() => {
    if (scriptListo && vistaVuelo.current && recorridoVuelo) {
      window.CamberasWidget?.montarVuelo?.(vistaVuelo.current);
    }
  }, [scriptListo, recorridoVuelo]);

  const codigoInscripcion = clave
    ? `<div data-camberas-carrera="${clave}"${tema === "oscuro" ? ' data-tema="oscuro"' : ""}></div>\n${CODIGO_SCRIPT}`
    : "";
  const codigoVuelo = recorridoVuelo
    ? `<div data-camberas-vuelo="${recorridoVuelo}"></div>\n${CODIGO_SCRIPT}`
    : "";

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: "Código copiado", description: "Pégalo en la web de la carrera" });
    } catch {
      toast({ title: "No se pudo copiar", description: "Selecciona el texto y cópialo a mano", variant: "destructive" });
    }
  };

  if (!selectedRaceId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Elige una carrera arriba para generar sus widgets.
        </CardContent>
      </Card>
    );
  }

  if (cargando || !carrera) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando carrera…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Code className="h-6 w-6" />
          Widgets para la web
        </h2>
        <p className="text-muted-foreground">
          Recuadros para pegar en la web de {carrera.name}. Se copia un código corto (sin iframe) y los datos se
          actualizan solos.
        </p>
      </div>

      {carrera.is_visible === false && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />
          Esta carrera está oculta en Camberas: los widgets no mostrarán nada hasta que la hagas visible.
        </div>
      )}
      {errorScript && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />
          {errorScript}. La vista previa no está disponible; el código sigue siendo válido.
        </div>
      )}

      {/* ── Inscripción ─────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inscripción · así se verá</CardTitle>
            <CardDescription>Recorridos, precio vigente, plazas libres y botón para inscribirse</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={tema} onValueChange={(v) => setTema(v as "claro" | "oscuro")} className="flex gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="claro" id="widget-claro" />
                <Label htmlFor="widget-claro" className="font-normal">Claro</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="oscuro" id="widget-oscuro" />
                <Label htmlFor="widget-oscuro" className="font-normal">Oscuro (webs de fondo oscuro)</Label>
              </div>
            </RadioGroup>
            <div className={`rounded-md border p-4 ${tema === "oscuro" ? "bg-neutral-900" : "bg-white"}`}>
              <div ref={vistaInscripcion} data-camberas-carrera={clave} data-tema={tema} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Código de la inscripción</CardTitle>
            <CardDescription>Cópialo y pégalo donde quieras que aparezca</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea readOnly value={codigoInscripcion} rows={3} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copiar(codigoInscripcion)}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar código
              </Button>
              <Button variant="outline" asChild>
                <a href={`${WEB}/${clave}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Página de la carrera
                </a>
              </Button>
            </div>
            <DondePegarlo />
          </CardContent>
        </Card>
      </div>

      {/* ── Vuelo 3D ───────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mountain className="h-5 w-5" />
              Vuelo 3D del recorrido
            </CardTitle>
            <CardDescription>El mismo vuelo que el de la ficha de la carrera</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recorridos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ningún recorrido de esta carrera tiene GPX con el mapa activado. Súbelo en Recorridos.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Recorrido</Label>
                  <Select value={recorridoVuelo} onValueChange={setRecorridoVuelo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {recorridos.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border p-2 bg-neutral-900">
                  {/* Vista previa con alto fijo; en la web ocupa el ancho y se adapta */}
                  <div ref={vistaVuelo} data-camberas-vuelo={recorridoVuelo} data-alto="420" />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {recorridos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Código del vuelo 3D</CardTitle>
              <CardDescription>Uno por recorrido: elige el recorrido a la izquierda</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea readOnly value={codigoVuelo} rows={3} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button onClick={() => copiar(codigoVuelo)}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar código
              </Button>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Ocupa el ancho disponible con proporción de pantalla. Para un alto fijo, añade{" "}
                  <code>data-alto="500"</code> al div (en píxeles).
                </p>
                <p>
                  Si en la misma página ya está el widget de inscripción, la línea del <code>&lt;script&gt;</code> basta
                  con pegarla una vez.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DondePegarlo() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Dónde pegarlo</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>WordPress:</strong> añade un bloque «HTML personalizado» y pega el código.</li>
        <li>
          <strong>Joomla</strong> (como uno.es): módulo o artículo en modo código. Si el editor borra el{" "}
          <code>&lt;script&gt;</code>, desactívalo para ese artículo o usa un módulo «HTML personalizado».
        </li>
        <li><strong>Wix:</strong> «Añadir › Insertar código › HTML personalizado».</li>
        <li>Cualquier otra web: donde se pueda pegar HTML.</li>
      </ul>
      <p>
        El precio (también los tramos) y las plazas libres se leen al abrir la página: no hace falta volver a copiar el
        código cuando cambian.
      </p>
    </div>
  );
}
