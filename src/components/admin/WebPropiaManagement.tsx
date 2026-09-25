import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRaceWeb } from "@/eventos/useRaceWeb";
import type { LibroDiseno } from "@/plantillas/libroDiseno";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LibroDisenoEditor } from "./webpropia/LibroDisenoEditor";
import { ContenidoWebEditor } from "./webpropia/ContenidoWebEditor";
import { PatrocinadoresManagement } from "./webpropia/PatrocinadoresManagement";
import { DominioManagement } from "./webpropia/DominioManagement";
import { TpvManagement } from "./webpropia/TpvManagement";

/**
 * Web propia de la carrera (panel del organizador y admin): plantilla y
 * libro de diseño, contenido, patrocinadores, dominio, TPV y publicación.
 * Todo se guarda en race_web / race_sponsors / race_domains / race_tpv.
 */
export function WebPropiaManagement({ selectedRaceId }: { selectedRaceId: string }) {
  const { toast } = useToast();
  const { web, cargando, guardando, error, guardar } = useRaceWeb(selectedRaceId);
  const [carrera, setCarrera] = useState<{ slug: string | null; name: string; is_visible: boolean | null } | null>(null);

  useEffect(() => {
    supabase.from("races").select("slug, name, is_visible").eq("id", selectedRaceId).maybeSingle().then(({ data }) => setCarrera(data ?? null));
  }, [selectedRaceId]);

  const slug = carrera?.slug ?? null;

  const guardarDiseno = async (plantilla: string, tema: LibroDiseno) => {
    const ok = await guardar({ plantilla, tema });
    toast(ok ? { title: "Diseño guardado" } : { title: "No se pudo guardar el diseño", description: error ?? "", variant: "destructive" });
    return ok;
  };
  const guardarContenido = async (contenido: Record<string, unknown>) => {
    const ok = await guardar({ contenido });
    toast(ok ? { title: "Contenido guardado" } : { title: "No se pudo guardar el contenido", description: error ?? "", variant: "destructive" });
    return ok;
  };
  const publicar = async (activa: boolean) => {
    const ok = await guardar({ activa });
    toast(ok ? { title: activa ? "Web publicada" : "Web desactivada", description: activa ? `camberas.com/${slug} muestra ahora la web con plantilla.` : "Vuelve a verse la ficha clásica." } : { title: "No se pudo cambiar", variant: "destructive" });
  };

  if (cargando || !web) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando la web de la carrera…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Web propia · {carrera?.name}</h2>
          <p className="text-sm text-muted-foreground">
            {slug ? (
              <>Se sirve en <a href={`/${slug}${web.activa ? "" : "?previa=1"}`} target="_blank" rel="noopener noreferrer" className="underline">camberas.com/{slug}</a>{web.activa ? "" : " (vista previa hasta que la publiques)"}.</>
            ) : (
              "La carrera necesita un slug (URL amigable) para tener web propia: ponlo en Datos de la carrera."
            )}
            {carrera && carrera.is_visible === false && " La carrera está oculta: la web no será pública hasta que la hagas visible."}
          </p>
        </div>
        {slug && (
          <Button variant="outline" asChild>
            <a href={`/${slug}?previa=1`} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Ver la web</a>
          </Button>
        )}
      </div>

      <Tabs defaultValue="diseno">
        <TabsList className="flex-wrap">
          <TabsTrigger value="diseno">Diseño</TabsTrigger>
          <TabsTrigger value="contenido">Contenido</TabsTrigger>
          <TabsTrigger value="patrocinadores">Patrocinadores</TabsTrigger>
          <TabsTrigger value="dominio">Dominio</TabsTrigger>
          <TabsTrigger value="tpv">TPV</TabsTrigger>
          <TabsTrigger value="publicar">Publicar</TabsTrigger>
        </TabsList>
        <TabsContent value="diseno" className="mt-4">
          <LibroDisenoEditor slug={slug} plantilla={web.plantilla} tema={web.tema} guardando={guardando} onGuardar={guardarDiseno} />
        </TabsContent>
        <TabsContent value="contenido" className="mt-4">
          <ContenidoWebEditor contenido={web.contenido} guardando={guardando} onGuardar={guardarContenido} />
        </TabsContent>
        <TabsContent value="patrocinadores" className="mt-4">
          <PatrocinadoresManagement raceId={selectedRaceId} />
        </TabsContent>
        <TabsContent value="dominio" className="mt-4">
          <DominioManagement raceId={selectedRaceId} slug={slug} />
        </TabsContent>
        <TabsContent value="tpv" className="mt-4">
          <TpvManagement raceId={selectedRaceId} />
        </TabsContent>
        <TabsContent value="publicar" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Publicar</CardTitle>
              <CardDescription>Con la web publicada, camberas.com/{slug ?? "…"} muestra la plantilla en vez de la ficha clásica. El dominio propio, si está verificado, la muestra siempre.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div>
                  <Label className="text-base">Web con plantilla activa</Label>
                  <p className="text-sm text-muted-foreground">{web.activa ? "Publicada." : "Desactivada: se ve la ficha clásica de Camberas."}</p>
                </div>
                <Switch checked={web.activa} disabled={guardando || !slug} onCheckedChange={publicar} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
