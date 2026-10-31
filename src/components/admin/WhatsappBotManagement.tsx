/**
 * Panel › WhatsApp: el asistente de carrera (whatsapp-webhook) sin SQL.
 *
 * Todo vive en la fila 1 de wa_bot_config: qué carrera de Camberas está en
 * directo (y, si se quiere, una sola distancia), los enlaces y el texto que
 * devuelve. Los tiempos salen de race_results / split_times / timing_readings:
 * lo mismo que ve la web. Con «Encendido» apagado o sin carrera el bot
 * contesta que no hay carrera en directo, en vez de dar datos viejos.
 *
 * Solo contesta a teléfonos que estén en el perfil de un usuario registrado.
 *
 * Debajo, los últimos mensajes de wa_messages (solo admin, se purgan a los 30
 * días). El teléfono es dato personal: se enseña tapado.
 *
 * El alta en Meta, los secrets y el despliegue están en docs/whatsapp-alta-waba.md.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Save, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Config = Tables<"wa_bot_config">;
type Mensaje = Pick<Tables<"wa_messages">, "wam_id" | "wa_id" | "body" | "intent" | "reply_sent" | "error" | "created_at">;
type Carrera = Pick<Tables<"races">, "id" | "name" | "slug" | "date">;
type Distancia = Pick<Tables<"race_distances">, "id" | "name" | "race_id">;

const TODAS = "__todas__";

const NOMBRE_INTENT: Record<string, string> = {
  dorsal: "dorsal",
  top: "clasificación",
  top_f: "clasificación femenina",
  top_m: "clasificación masculina",
  live: "mapa",
  info: "info",
  help: "ayuda",
  unknown: "no entendido",
  rate_limited: "demasiadas seguidas",
  no_registrado: "sin cuenta en Camberas",
};

/** «34600123456» → «•••••••456». Basta para distinguir conversaciones. */
const taparTelefono = (waId: string) => "•".repeat(Math.max(waId.length - 3, 0)) + waId.slice(-3);

const formatInstante = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function WhatsappBotManagement() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [distancias, setDistancias] = useState<Distancia[]>([]);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const cargarMensajes = useCallback(async () => {
    const { data } = await supabase
      .from("wa_messages")
      .select("wam_id, wa_id, body, intent, reply_sent, error, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setMensajes(data ?? []);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    const [{ data: c, error }, { data: ca }, { data: di }] = await Promise.all([
      supabase.from("wa_bot_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("races").select("id, name, slug, date").order("date", { ascending: false }).limit(100),
      supabase.from("race_distances").select("id, name, race_id").order("display_order"),
    ]);
    if (error) toast.error("No se pudo cargar la configuración del asistente");
    setCfg(c ?? null);
    setCarreras(ca ?? []);
    setDistancias(di ?? []);
    await cargarMensajes();
    setLoading(false);
  }, [cargarMensajes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const set = <K extends keyof Config>(campo: K, valor: Config[K]) =>
    setCfg((prev) => (prev ? { ...prev, [campo]: valor } : prev));

  const elegirCarrera = (id: string) => {
    if (!cfg) return;
    const carrera = carreras.find((c) => c.id === id);
    // Al cambiar de carrera, la distancia y el nombre dejan de valer.
    setCfg({ ...cfg, race_id: id, distance_id: null, race_name: carrera?.name ?? cfg.race_name });
  };

  const elegirDistancia = (id: string) => {
    if (!cfg) return;
    setCfg({ ...cfg, distance_id: id === TODAS ? null : id });
  };

  /** Rellena los enlaces vacíos con las rutas públicas de la carrera elegida. */
  const rellenarEnlaces = () => {
    const carrera = carreras.find((c) => c.id === cfg?.race_id);
    if (!cfg || !carrera?.slug) {
      toast.error("Elige antes una carrera con dirección web (slug)");
      return;
    }
    const base = `https://camberas.com/${carrera.slug}`;
    setCfg({
      ...cfg,
      live_url: cfg.live_url || `${base}/gps`,
      results_url: cfg.results_url || `${base}/live`,
      info_url: cfg.info_url || base,
    });
  };

  const guardar = async (cambios?: Partial<Config>) => {
    if (!cfg) return;
    const fila = { ...cfg, ...cambios };
    if (fila.enabled && !fila.race_id) {
      toast.error("Para encenderlo hace falta elegir la carrera");
      return;
    }
    setSaving(true);
    const { id: _id, ...resto } = fila;
    const { error } = await supabase
      .from("wa_bot_config")
      .update({
        ...resto,
        live_url: resto.live_url?.trim() || null,
        results_url: resto.results_url?.trim() || null,
        info_url: resto.info_url?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error("No se pudo guardar", { description: error.message });
      return;
    }
    setCfg(fila);
    toast.success(cambios?.enabled === false ? "Asistente apagado" : "Configuración guardada");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!cfg) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          No hay configuración del asistente (wa_bot_config). Se crea con la migración
          20260804170000_whatsapp_bot.sql.
        </CardContent>
      </Card>
    );
  }

  const enDirecto = cfg.enabled && !!cfg.race_id;
  const distanciasDeCarrera = distancias.filter((d) => d.race_id === cfg.race_id);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-6 w-6" /> Asistente de WhatsApp
        </h2>
        <p className="text-muted-foreground">
          Contesta a los usuarios registrados que escriben un dorsal, piden la clasificación, el mapa en vivo o la
          información de la carrera. Los tiempos son los de las clasificaciones de Camberas: si no hay dato, lo
          dice; nunca se inventa.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Carrera en directo</CardTitle>
            <CardDescription>
              {enDirecto ? (
                <>
                  Contestando sobre <span className="font-medium text-foreground">{cfg.race_name || "sin nombre"}</span>
                  {cfg.distance_id ? ` · ${distanciasDeCarrera.find((d) => d.id === cfg.distance_id)?.name ?? ""}` : ""}
                </>
              ) : (
                "Apagado: contesta que no hay ninguna carrera en directo."
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="wa-encendido">Encendido</Label>
            <Switch
              id="wa-encendido"
              checked={cfg.enabled}
              disabled={saving}
              onCheckedChange={(enabled) => guardar({ enabled })}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Carrera</Label>
              <Select value={cfg.race_id ?? undefined} onValueChange={elegirCarrera}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige la carrera" />
                </SelectTrigger>
                <SelectContent>
                  {carreras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Distancia</Label>
              <Select value={cfg.distance_id ?? TODAS} onValueChange={elegirDistancia} disabled={!cfg.race_id}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas las de la carrera</SelectItem>
                  {distanciasDeCarrera.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si se cronometra con RaceTec, trae antes los tiempos en Resultados › Importar de RaceTec.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-nombre">Nombre que usa en las respuestas</Label>
            <Input id="wa-nombre" value={cfg.race_name} onChange={(e) => set("race_name", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-info">Respuesta a «info»</Label>
            <Textarea
              id="wa-info"
              rows={3}
              placeholder="Salida 9:00 · 21 km · 1.100 m D+"
              value={cfg.race_info}
              onChange={(e) => set("race_info", e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Enlaces</Label>
              <Button type="button" variant="ghost" size="sm" onClick={rellenarEnlaces}>
                <Wand2 className="h-4 w-4 mr-1" /> Rellenar los vacíos
              </Button>
            </div>
            {(
              [
                ["live_url", "Mapa en vivo"],
                ["results_url", "Clasificación completa"],
                ["info_url", "Información de la carrera"],
              ] as const
            ).map(([campo, etiqueta]) => (
              <div key={campo} className="grid grid-cols-[10rem_1fr] items-center gap-2">
                <span className="text-sm text-muted-foreground">{etiqueta}</span>
                <Input
                  value={cfg[campo] ?? ""}
                  placeholder="https://"
                  onChange={(e) => set(campo, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Paso por control</Label>
              <Select
                value={cfg.position_mode}
                onValueChange={(v) => set("position_mode", v as Config["position_mode"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="split">Decir el último control y su hora</SelectItem>
                  <SelectItem value="off">No decir dónde va</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Nunca da coordenadas GPS.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-limite">Mensajes por hora y teléfono</Label>
              <Input
                id="wa-limite"
                type="number"
                min={1}
                max={200}
                value={cfg.rate_limit_hour}
                onChange={(e) => set("rate_limit_hour", Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => guardar()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">Últimos mensajes</CardTitle>
            <CardDescription>Se borran solos a los 30 días. El teléfono va tapado.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={cargarMensajes} aria-label="Recargar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {mensajes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no ha llegado ningún mensaje.</p>
          ) : (
            <ul className="divide-y">
              {mensajes.map((m) => (
                <li key={m.wam_id} className="py-2 text-sm flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{m.body || <span className="text-muted-foreground">(sin texto)</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInstante(m.created_at)} · {taparTelefono(m.wa_id)} ·{" "}
                      {NOMBRE_INTENT[m.intent ?? ""] ?? m.intent ?? "…"}
                    </p>
                    {m.error && <p className="text-xs text-destructive break-words">{m.error}</p>}
                  </div>
                  <Badge variant={m.error ? "destructive" : m.reply_sent ? "default" : "secondary"}>
                    {m.error ? "error" : m.reply_sent ? "contestado" : "sin respuesta"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
