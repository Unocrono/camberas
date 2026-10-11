/**
 * Panel › Instagram › Mensajes directos: el asistente de carrera (el mismo
 * que el de WhatsApp) contestando también por Instagram.
 *
 * La carrera en directo es la de wa_bot_config, común a los dos canales (se
 * configura como cuenta docs/whatsapp-alta-waba.md §7). Aquí solo se enciende
 * o apaga Instagram y se ven los últimos mensajes. Con Instagram apagado, o sin
 * carrera en directo, el asistente no contesta ni guarda nada: el buzón queda
 * para las personas.
 */

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { tablaSinTipos } from "@/eventos/rpc";
import { formatFechaHoraInstante } from "@/lib/timezoneUtils";

interface ConfigAsistente {
  enabled: boolean;
  active_eid: string | null;
  race_name: string;
  instagram_enabled: boolean;
}

interface Mensaje {
  mid: string;
  body: string | null;
  intent: string | null;
  reply_sent: boolean;
  error: string | null;
  created_at: string;
}

const NOMBRE_INTENT: Record<string, string> = {
  dorsal: "dorsal",
  top: "clasificación",
  top_f: "clasificación femenina",
  top_m: "clasificación masculina",
  live: "mapa",
  info: "info",
  help: "ayuda",
  unknown: "para una persona",
  adjunto: "adjunto (para una persona)",
  rate_limited: "demasiadas seguidas",
};

export function BotInstagram() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ConfigAsistente | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: m }] = await Promise.all([
      tablaSinTipos("wa_bot_config").select("enabled, active_eid, race_name, instagram_enabled").eq("id", 1).maybeSingle(),
      tablaSinTipos("ig_mensajes")
        .select("mid, body, intent, reply_sent, error, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setCfg((c as ConfigAsistente) ?? null);
    setMensajes((m ?? []) as Mensaje[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = async (instagram_enabled: boolean) => {
    const { error } = await tablaSinTipos("wa_bot_config").update({ instagram_enabled }).eq("id", 1);
    if (error) toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
    await cargar();
  };

  const enDirecto = !!cfg?.enabled && !!cfg.active_eid;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> Mensajes directos
          </CardTitle>
          <CardDescription>
            El asistente de carrera de WhatsApp, también por Instagram: dorsal, clasificación, mapa e info. Solo
            contesta con la carrera en directo, y nunca a lo que no entiende ni a fotos o audios: eso queda para
            una persona.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={cargar} aria-label="Recargar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!cfg ? (
          <p className="text-sm text-muted-foreground">
            No hay configuración del asistente (wa_bot_config). Se crea con la migración del bot de WhatsApp.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Carrera en directo:{" "}
              {enDirecto ? (
                <span className="font-medium">
                  {cfg.race_name || "sin nombre"} · EID {cfg.active_eid}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  ninguna. Se pone como en WhatsApp (docs/whatsapp-alta-waba.md §7).
                </span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <Switch id="bot-instagram" checked={cfg.instagram_enabled} onCheckedChange={cambiar} />
              <Label htmlFor="bot-instagram">Contestar también por Instagram</Label>
            </div>
          </>
        )}

        {mensajes.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1">Últimos mensajes</p>
            <ul className="divide-y">
              {mensajes.map((m) => (
                <li key={m.mid} className="py-2 text-sm flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{m.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFechaHoraInstante(m.created_at)} · {NOMBRE_INTENT[m.intent ?? ""] ?? m.intent ?? "…"}
                    </p>
                    {m.error && <p className="text-xs text-destructive break-words">{m.error}</p>}
                  </div>
                  <Badge variant={m.error ? "destructive" : m.reply_sent ? "default" : "secondary"}>
                    {m.error ? "error" : m.reply_sent ? "contestado" : "sin respuesta"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
