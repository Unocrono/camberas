import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Globe, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { tablaSinTipos } from "@/eventos/rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Dominio {
  id: string;
  race_id: string;
  hostname: string;
  principal: boolean;
  verificado: boolean;
  verificado_at: string | null;
}

/** Dominio propio de la carrera: alta, instrucciones DNS y comprobación */
export function DominioManagement({ raceId, slug }: { raceId: string; slug: string | null }) {
  const { toast } = useToast();
  const [dominio, setDominio] = useState<Dominio | null>(null);
  const [hostname, setHostname] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [resultado, setResultado] = useState<{ verificado: boolean; ayuda?: string; cname?: string[]; txt?: string[] } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await tablaSinTipos("race_domains").select("*").eq("race_id", raceId).eq("principal", true).maybeSingle();
    setDominio((data as Dominio | null) ?? null);
    setHostname((data as Dominio | null)?.hostname ?? "");
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const normalizar = (h: string) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "");

  const guardar = async () => {
    const h = normalizar(hostname);
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(h)) {
      return toast({ title: "Dominio no válido", description: "Escribe solo el dominio, por ejemplo desafio-sarrio.com", variant: "destructive" });
    }
    setGuardando(true);
    const fila = dominio ? { hostname: h } : { race_id: raceId, hostname: h, principal: true };
    const q = dominio ? tablaSinTipos("race_domains").update(fila).eq("id", dominio.id) : tablaSinTipos("race_domains").insert(fila);
    const { error } = await q;
    setGuardando(false);
    if (error) return toast({ title: "No se pudo guardar", description: error.message.includes("unique") ? "Ese dominio ya está asignado a otra carrera." : error.message, variant: "destructive" });
    setResultado(null);
    toast({ title: "Dominio guardado", description: "Ahora configura el DNS y pulsa Comprobar." });
    cargar();
  };

  const quitar = async () => {
    if (!dominio) return;
    const { error } = await tablaSinTipos("race_domains").delete().eq("id", dominio.id);
    if (error) return toast({ title: "No se pudo quitar", description: error.message, variant: "destructive" });
    setDominio(null);
    setHostname("");
    setResultado(null);
  };

  const comprobar = async () => {
    if (!dominio) return;
    setComprobando(true);
    try {
      const { data, error } = await supabase.functions.invoke("verificar-dominio", { body: { domainId: dominio.id } });
      if (error) throw error;
      setResultado(data);
      if (data?.verificado) {
        toast({ title: "Dominio verificado", description: `${dominio.hostname} ya sirve la web de la carrera.` });
        cargar();
      }
    } catch (e) {
      toast({ title: "No se pudo comprobar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setComprobando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Dominio propio</CardTitle>
        <CardDescription>
          La web de la carrera se sirve en camberas.com/{slug ?? "…"} y, si lo configuras, también en el dominio del club (por ejemplo desafio-sarrio.com). Hace falta tener el dominio comprado y acceso a su DNS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : (
          <>
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="flex-1 space-y-1.5">
                <Label>Dominio</Label>
                <Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="desafio-sarrio.com" />
              </div>
              <Button type="button" onClick={guardar} disabled={guardando || !hostname.trim() || normalizar(hostname) === dominio?.hostname}>
                {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {dominio ? "Cambiar" : "Guardar"}
              </Button>
              {dominio && (
                <Button type="button" variant="outline" onClick={quitar}>Quitar</Button>
              )}
            </div>

            {dominio && (
              <>
                <Alert>
                  {dominio.verificado ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                  <AlertTitle>{dominio.verificado ? `Verificado: ${dominio.hostname}` : `Pendiente de verificar: ${dominio.hostname}`}</AlertTitle>
                  <AlertDescription>
                    {dominio.verificado
                      ? "El dominio apunta a Camberas y sirve la web de la carrera con certificado propio."
                      : "Añade estos registros en el DNS de tu dominio (en el panel de tu registrador) y pulsa Comprobar. Los cambios pueden tardar hasta una hora en verse."}
                  </AlertDescription>
                </Alert>

                {!dominio.verificado && (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Nombre</th>
                          <th className="px-3 py-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono text-xs">
                        <tr className="border-t"><td className="px-3 py-2">CNAME</td><td className="px-3 py-2">www</td><td className="px-3 py-2">sitios.camberas.com</td></tr>
                        <tr className="border-t"><td className="px-3 py-2">TXT</td><td className="px-3 py-2">_camberas</td><td className="px-3 py-2">camberas-verificacion={raceId}</td></tr>
                      </tbody>
                    </table>
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Para que funcione también sin "www" ({dominio.hostname} a secas), configura en tu registrador una redirección de {dominio.hostname} a www.{dominio.hostname}, o un registro ALIAS/ANAME si lo admite.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant={dominio.verificado ? "outline" : "default"} onClick={comprobar} disabled={comprobando}>
                    {comprobando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {dominio.verificado ? "Volver a comprobar" : "Comprobar DNS"}
                  </Button>
                  {dominio.verificado && (
                    <a href={`https://${dominio.hostname}`} target="_blank" rel="noopener noreferrer" className="text-sm underline">Abrir https://{dominio.hostname}</a>
                  )}
                </div>
                {resultado && !resultado.verificado && (
                  <p className="text-sm text-muted-foreground">
                    {resultado.ayuda}
                    {resultado.cname?.length ? ` CNAME visto: ${resultado.cname.join(", ")}.` : " No se ha encontrado ningún CNAME."}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
