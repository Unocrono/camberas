import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Loader2, Monitor, Plus, X } from "lucide-react";

/**
 * Pantallas de seguimiento de una carrera.
 *
 * Cada pantalla es un PUESTO con su token, no una persona con contraseña: se
 * genera aquí, se abre la URL en el portátil de la carpa y esa ventana se
 * queda enseñando el mapa toda la carrera. Se puede pasar la URL al locutor o
 * a la ambulancia sin darles acceso a la gestión, y revocarla al terminar.
 *
 * Tabla y RPC nuevas: van casteadas hasta que se regenere types.ts.
 */
const db = supabase as any;

interface Pantalla {
  id: string;
  token: string;
  nombre: string;
  activa: boolean;
  last_seen_at: string | null;
  created_at: string;
}

interface Props {
  raceId: string;
}

/** ¿La vimos hace poco? Con el latido de un minuto, dos minutos es holgado */
const enMarcha = (last: string | null) =>
  !!last && Date.now() - new Date(last).getTime() < 2 * 60 * 1000;

export function PantallasManagement({ raceId }: Props) {
  const { toast } = useToast();
  const [pantallas, setPantallas] = useState<Pantalla[]>([]);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await db.rpc("pantallas_carrera", { p_race_id: raceId });
    if (!error) setPantallas((data ?? []) as Pantalla[]);
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    cargar();
    // Refresco flojo: solo sirve para ver el punto verde de "está encendida"
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  const url = (token: string) => `${window.location.origin}/pantalla/${token}`;

  const crear = async () => {
    setCreando(true);
    try {
      const { data, error } = await db.rpc("generar_token_pantalla", {
        p_race_id: raceId,
        p_nombre: nombre.trim() || "Pantalla",
      });
      if (error) throw error;
      setNombre("");
      await cargar();
      if (data?.token) {
        window.open(url(data.token), "_blank", "noopener");
      }
    } catch (e: any) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  const revocar = async (p: Pantalla) => {
    const { error } = await db.rpc("revocar_token_pantalla", { p_id: p.id });
    if (error) {
      toast({ title: "No se pudo revocar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Pantalla revocada",
      description: `"${p.nombre}" deja de funcionar al instante.`,
    });
    cargar();
  };

  if (cargando) return null;

  const vivas = pantallas.filter((p) => p.activa);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Pantallas de seguimiento
        </CardTitle>
        <CardDescription>
          El mapa de la carrera a pantalla completa, para dejarlo puesto en un monitor de la carpa.
          Se abre con un enlace, sin contraseña, así que puedes pasárselo al locutor o a la
          ambulancia sin darles acceso a la gestión. Y ahí las alertas SOS <strong>sí llevan
          dorsal y nombre</strong>, al revés que en el mapa público.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Carpa, Meta, Locutor…"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
          />
          <Button onClick={crear} disabled={creando} className="gap-2 shrink-0">
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear y abrir
          </Button>
        </div>

        {vivas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna pantalla creada. Ponle un nombre que te diga dónde está y pulsa "Crear y abrir":
            se abre en una ventana nueva, lista para poner en el monitor.
          </p>
        ) : (
          <div className="space-y-2">
            {vivas.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    {p.nombre}
                    {enMarcha(p.last_seen_at) ? (
                      <Badge variant="default" className="gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        encendida
                      </Badge>
                    ) : (
                      <Badge variant="outline">sin señal</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{url(p.token)}</p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Copiar enlace"
                    onClick={() => {
                      navigator.clipboard.writeText(url(p.token));
                      toast({ title: "Enlace copiado" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Abrir en ventana nueva"
                    onClick={() => window.open(url(p.token), "_blank", "noopener")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Revocar"
                    onClick={() => revocar(p)}
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          "Sin señal" significa que esa pantalla lleva más de dos minutos sin dar noticias: o está
          apagada, o se ha quedado sin internet. Revocar corta el acceso al instante, y conviene
          hacerlo al acabar la carrera.
        </p>
      </CardContent>
    </Card>
  );
}
