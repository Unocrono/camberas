import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import { plantillaDe } from "@/plantillas/registro";
import { resolverTokens, variablesCss, SECCIONES_EVENTO_IDS, type LibroDiseno, type SeccionEventoId } from "@/plantillas/libroDiseno";
import { RecorridoDetalle } from "@/plantillas/gurriana/RecorridoDetalle";
import { rutasDeWeb } from "@/tenant/TenantContext";
import "@/plantillas/gurriana/estilos.css";

const NOMBRES: Record<SeccionEventoId, string> = {
  cifras: "Cifras (distancia, desnivel, salida, límite, precio)",
  descripcion: "Descripción y relato",
  perfil: "Perfil de altimetría",
  botones: "Botones (inscribirse, mapa, vuelo 3D, GPX, rutómetro)",
  precios: "Precios y plazos",
  categorias: "Categorías",
  terreno: "Terreno",
  mapa: "Mapa",
  vuelo3d: "Vuelo 3D",
  rutometro: "Rutómetro",
  avituallamientos: "Avituallamientos y controles",
};

interface Props {
  slug: string | null;
  plantilla: string;
  tema: Record<string, unknown>;
  guardando: boolean;
  onGuardar: (plantilla: string, tema: LibroDiseno) => Promise<boolean>;
}

/**
 * «Diseño evento»: qué secciones lleva la página de cada recorrido y en qué
 * orden, con vista previa en vivo de uno de los recorridos. Colores y fuentes
 * son los de «Diseño» (portada): aquí solo se ordena. Guarda el libro de
 * diseño entero (tema), igual que el editor de la portada.
 */
export function DisenoEventoEditor({ slug, plantilla: plantillaId, tema, guardando, onGuardar }: Props) {
  const plantilla = plantillaDe(plantillaId);
  const [tokens, setTokens] = useState<LibroDiseno>(() => resolverTokens(plantilla.tokensPorDefecto, tema));
  const [cambios, setCambios] = useState(false);
  const [pruebaId, setPruebaId] = useState<string | null>(null);
  const { data: evento, isLoading, isError } = useEventoPublico(slug ?? undefined);

  useEffect(() => {
    setTokens(resolverTokens(plantillaDe(plantillaId).tokensPorDefecto, tema));
    setCambios(false);
  }, [plantillaId, tema]);

  const lista = tokens.seccionesEvento;
  const setLista = (s: LibroDiseno["seccionesEvento"]) => {
    setTokens((t) => ({ ...t, seccionesEvento: s }));
    setCambios(true);
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const s = [...lista];
    [s[i], s[j]] = [s[j], s[i]];
    setLista(s);
  };

  const rutas = useMemo(() => rutasDeWeb("camberas", slug ?? "", false), [slug]);
  const prueba = evento?.pruebas.find((p) => p.id === pruebaId) ?? evento?.pruebas[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Página de cada recorrido</CardTitle>
            <CardDescription>Qué se enseña al entrar en un recorrido desde el menú y en qué orden. Los colores y las fuentes se cambian en «Diseño».</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Secciones y orden</Label>
              <ul className="divide-y rounded-md border">
                {lista.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Switch checked={s.activa} onCheckedChange={(v) => setLista(lista.map((x, j) => (j === i ? { ...x, activa: v } : x)))} aria-label={`Mostrar ${NOMBRES[s.id]}`} />
                    <span className={`flex-1 ${s.activa ? "" : "text-muted-foreground line-through"}`}>{NOMBRES[s.id] ?? s.id}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Una sección activa solo se pinta si el recorrido tiene datos para ella; {SECCIONES_EVENTO_IDS.length} disponibles. Precios, categorías y rutómetro salen de lo que tenga la carrera en Camberas.</p>
            </div>

            {evento && evento.pruebas.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Recorrido de la vista previa</Label>
                <Select value={prueba?.id ?? ""} onValueChange={setPruebaId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {evento.pruebas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={guardando || !cambios} onClick={async () => { if (await onGuardar(plantillaId, tokens)) setCambios(false); }}>
                {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar diseño
              </Button>
              {slug && prueba && (
                <Button type="button" variant="outline" asChild>
                  <a href={`/${slug}/recorrido/${prueba.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Abrir en pestaña
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Vista previa (50 %)</p>
        <div className="overflow-hidden rounded-lg border bg-white" style={{ height: 720 }}>
          {isLoading && <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando la carrera…</div>}
          {!isLoading && (isError || !evento) && (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              No se pudo cargar el evento público (la carrera debe estar visible o ser tuya, y la función <code>evento_publico</code> aplicada).
            </div>
          )}
          {evento && !prueba && <div className="flex h-full items-center justify-center text-sm text-muted-foreground">La carrera no tiene recorridos visibles.</div>}
          {evento && prueba && (
            <div style={{ width: "200%", height: "200%", transform: "scale(0.5)", transformOrigin: "top left", overflow: "auto" }}>
              <div className="wp" style={variablesCss(tokens)}>
                <div className="mx-auto max-w-[1296px] px-5 py-8 lg:px-[72px]">
                  <p className="wp-label">Recorrido</p>
                  <h1 style={{ fontSize: "48px" }}>{prueba.nombre}</h1>
                  <RecorridoDetalle evento={evento} prueba={prueba} rutas={rutas} tokens={tokens} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
