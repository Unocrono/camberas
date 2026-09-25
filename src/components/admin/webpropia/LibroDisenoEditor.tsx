import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import { PLANTILLAS, plantillaDe } from "@/plantillas/registro";
import { avisosContraste, FUENTES, resolverTokens, SECCIONES_IDS, type LibroDiseno, type SeccionId } from "@/plantillas/libroDiseno";
import { rutasDeWeb } from "@/tenant/TenantContext";

const NOMBRES_SECCION: Record<SeccionId, string> = {
  hero: "Portada",
  cifras: "Franja de cifras",
  cinta: "Cinta de meta",
  beneficiario: "Causa solidaria",
  recorridos: "Recorridos",
  inscripcion: "Inscripción",
  reglamento: "Reglamento",
  dia: "Día de carrera",
  premios: "Premios (dentro de servicios)",
  servicios: "Premios, servicios y camiseta",
  camiseta: "Camiseta (dentro de servicios)",
  info: "Info práctica",
  medioambiente: "Medioambiente",
  patrocinadores: "Patrocinadores",
};

interface Props {
  slug: string | null;
  plantilla: string;
  tema: Record<string, unknown>;
  guardando: boolean;
  onGuardar: (plantilla: string, tema: LibroDiseno) => Promise<boolean>;
}

/**
 * Editor del libro de diseño: plantilla, colores, fuentes, forma, hero,
 * cinta y secciones (activas y en orden), con vista previa en vivo de la
 * plantilla escalada al 50 % (sin iframe: los tokens van en variables CSS con
 * ámbito .wp, así el panel no se ve afectado).
 */
export function LibroDisenoEditor({ slug, plantilla: plantillaInicial, tema, guardando, onGuardar }: Props) {
  const [plantillaId, setPlantillaId] = useState(plantillaInicial);
  const plantilla = plantillaDe(plantillaId);
  const [tokens, setTokens] = useState<LibroDiseno>(() => resolverTokens(plantilla.tokensPorDefecto, tema));
  const [cambios, setCambios] = useState(false);
  const { data: evento, isLoading, isError } = useEventoPublico(slug ?? undefined);

  useEffect(() => {
    setTokens(resolverTokens(plantillaDe(plantillaInicial).tokensPorDefecto, tema));
    setPlantillaId(plantillaInicial);
    setCambios(false);
  }, [plantillaInicial, tema]);

  const set = <K extends keyof LibroDiseno>(k: K, v: LibroDiseno[K]) => {
    setTokens((t) => ({ ...t, [k]: v }));
    setCambios(true);
  };
  const moverSeccion = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= tokens.secciones.length) return;
    const s = [...tokens.secciones];
    [s[i], s[j]] = [s[j], s[i]];
    set("secciones", s);
  };
  const avisos = useMemo(() => avisosContraste(tokens), [tokens]);
  const rutas = useMemo(() => rutasDeWeb("camberas", slug ?? "", true), [slug]);
  const Vista = plantilla.componente;

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Plantilla y libro de diseño</CardTitle>
            <CardDescription>Los cambios se ven a la derecha al momento; se aplican a la web al guardar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Plantilla</Label>
              <Select value={plantillaId} onValueChange={(v) => { setPlantillaId(v); setTokens(resolverTokens(plantillaDe(v).tokensPorDefecto, tema)); setCambios(true); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(PLANTILLAS).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{plantilla.descripcion}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(["colorMarca", "colorAccion", "colorSecundario"] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label className="text-xs">{k === "colorMarca" ? "Marca" : k === "colorAccion" ? "Acción" : "Secundario"}</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={tokens[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} className="h-9 w-10 cursor-pointer rounded border p-0.5" aria-label={k} />
                    <Input value={tokens[k]} maxLength={7} className="h-9 font-mono text-xs" onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && set(k, e.target.value.toUpperCase())} />
                  </div>
                </div>
              ))}
            </div>
            {avisos.length > 0 && (
              <Alert>
                <AlertDescription className="text-xs">{avisos.join(" ")}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fuente de titulares</Label>
                <Select value={tokens.fuenteDisplay} onValueChange={(v) => set("fuenteDisplay", v as LibroDiseno["fuenteDisplay"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(FUENTES).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fuente de texto</Label>
                <Select value={tokens.fuenteTexto} onValueChange={(v) => set("fuenteTexto", v as LibroDiseno["fuenteTexto"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(FUENTES).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Esquinas</Label>
                <Select value={tokens.radio} onValueChange={(v) => set("radio", v as LibroDiseno["radio"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">Rectas (10 px)</SelectItem>
                    <SelectItem value="16">Suaves (16 px)</SelectItem>
                    <SelectItem value="20">Redondas (20 px)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Portada</Label>
                <Select value={tokens.hero} onValueChange={(v) => set("hero", v as LibroDiseno["hero"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="foto">Foto de la carrera</SelectItem>
                    <SelectItem value="color">Color de marca</SelectItem>
                    <SelectItem value="textura">Color con el logo de fondo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Cinta de meta</Label>
                <p className="text-xs text-muted-foreground">Línea de colores bajo la portada</p>
              </div>
              <Switch checked={tokens.cinta} onCheckedChange={(v) => set("cinta", v)} />
            </div>

            <div className="space-y-2">
              <Label>Secciones y orden</Label>
              <ul className="divide-y rounded-md border">
                {tokens.secciones.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Switch checked={s.activa} onCheckedChange={(v) => set("secciones", tokens.secciones.map((x, j) => (j === i ? { ...x, activa: v } : x)))} aria-label={`Mostrar ${NOMBRES_SECCION[s.id]}`} />
                    <span className={`flex-1 ${s.activa ? "" : "text-muted-foreground line-through"}`}>{NOMBRES_SECCION[s.id] ?? s.id}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moverSeccion(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moverSeccion(i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Una sección activa solo se pinta si la carrera tiene datos para ella; {SECCIONES_IDS.length} disponibles.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={guardando || !cambios} onClick={async () => { if (await onGuardar(plantillaId, tokens)) setCambios(false); }}>
                {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar diseño
              </Button>
              {slug && (
                <Button type="button" variant="outline" asChild>
                  <a href={`/${slug}?previa=1`} target="_blank" rel="noopener noreferrer">
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
              No se pudo cargar el evento público (la carrera debe estar visible y la función <code>evento_publico</code> aplicada en la base de datos).
            </div>
          )}
          {evento && (
            <div style={{ width: "200%", height: "200%", transform: "scale(0.5)", transformOrigin: "top left", overflow: "auto" }}>
              <Suspense fallback={null}>
                <Vista evento={evento} tokens={tokens} rutas={rutas} modo="camberas" onInscribirse={() => undefined} />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
