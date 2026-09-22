import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Loader2, Plus, Ticket, X } from "lucide-react";

/**
 * Mesas de recogida de dorsales.
 *
 * Mismo patrón que las pantallas de seguimiento: cada mesa es un PUESTO con
 * su token, no una persona con contraseña. Se genera aquí, se abre la URL en
 * la tablet de la mesa y ese dispositivo queda atendiendo la recogida. La
 * herramienta en sí (/recogida/<token>) es del personal de la mesa — la
 * decisión de agosto: fuera del panel; aquí solo se crean y revocan puestos
 * y se ve el progreso.
 */
const db = supabase as any;

interface Mesa {
  id: string;
  token: string;
  nombre: string;
  activa: boolean;
  last_seen_at: string | null;
  created_at: string;
  entregados: number;
}

interface Props {
  raceId: string;
}

/** ¿La vimos hace poco? Con el latido de un minuto, dos minutos es holgado */
const enMarcha = (last: string | null) =>
  !!last && Date.now() - new Date(last).getTime() < 2 * 60 * 1000;

export function MesasRecogidaManagement({ raceId }: Props) {
  const { toast } = useToast();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await db.rpc("mesas_recogida_carrera", { p_race_id: raceId });
    if (!error) setMesas((data ?? []) as Mesa[]);
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  const url = (token: string) => `${window.location.origin}/recogida/${token}`;

  const crear = async () => {
    setCreando(true);
    try {
      const { data, error } = await db.rpc("generar_token_mesa_recogida", {
        p_race_id: raceId,
        p_nombre: nombre.trim() || "Mesa",
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

  const revocar = async (m: Mesa) => {
    const { error } = await db.rpc("revocar_token_mesa_recogida", { p_id: m.id });
    if (error) {
      toast({ title: "No se pudo revocar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Mesa revocada",
      description: `"${m.nombre}" deja de funcionar al instante. Sus entregas quedan registradas.`,
    });
    cargar();
  };

  if (cargando) return null;

  const vivas = mesas.filter((m) => m.activa);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          Mesas de recogida de dorsales
        </CardTitle>
        <CardDescription>
          Cada mesa es un enlace sin contraseña para la tablet o el móvil de quien atiende:
          busca al corredor (o escanea su QR), ve los avisos —pendiente de pago, menor,
          ya entregado— y sella la entrega. Se revoca al terminar.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Carpa, Mesa 21K, Feria del corredor…"
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
            Ninguna mesa creada. Ponle un nombre que diga dónde está y pulsa "Crear y abrir":
            la URL se abre en ventana nueva, lista para la tablet de la mesa.
          </p>
        ) : (
          <div className="space-y-2">
            {vivas.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    {m.nombre}
                    {enMarcha(m.last_seen_at) ? (
                      <Badge variant="default" className="gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        atendiendo
                      </Badge>
                    ) : (
                      <Badge variant="outline">sin señal</Badge>
                    )}
                    <span className="text-xs text-muted-foreground font-normal">
                      {m.entregados} entregados aquí
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{url(m.token)}</p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Copiar enlace"
                    onClick={() => {
                      navigator.clipboard.writeText(url(m.token));
                      toast({ title: "Enlace copiado" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Abrir en ventana nueva"
                    onClick={() => window.open(url(m.token), "_blank", "noopener")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Revocar" onClick={() => revocar(m)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          "Sin señal" significa que esa mesa lleva más de dos minutos sin dar noticias.
          Solo se entrega a inscripciones pagadas; si recoge otra persona, la mesa anota quién.
        </p>
      </CardContent>
    </Card>
  );
}
