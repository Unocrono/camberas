/**
 * Bandeja de Maika: las conversaciones (WhatsApp y chat web) y las que esperan
 * a una persona. El equipo contesta desde aquí por el mismo canal que usó
 * quien escribió (Edge Function asistente-responder) y cierra la conversación
 * cuando está resuelta; el siguiente mensaje vuelve a Maika.
 *
 * Las tablas asistente_conversaciones y las columnas nuevas de wa_messages
 * aún no están en types.ts (generado): se consulta con el cliente sin tipar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bot, CheckCircle2, Globe, Loader2, MessageCircle, RefreshCw, Send, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

type Estado = "bot" | "pendiente" | "persona" | "resuelta";

interface Conversacion {
  wa_id: string;
  canal: "whatsapp" | "web";
  nombre: string | null;
  estado: Estado;
  motivo: string | null;
  asignado_a: string | null;
  pendiente_desde: string | null;
  ultimo_usuario_at: string | null;
  ultimo_mensaje_at: string;
  ultimo_texto: string | null;
}

interface Mensaje {
  wam_id: string;
  body: string | null;
  reply: string | null;
  intent: string | null;
  autor: "usuario" | "persona";
  created_at: string;
}

const ETIQUETA: Record<Estado, { texto: string; variante: "default" | "secondary" | "destructive" | "outline" }> = {
  bot: { texto: "Maika", variante: "secondary" },
  pendiente: { texto: "Esperando", variante: "destructive" },
  persona: { texto: "Persona", variante: "default" },
  resuelta: { texto: "Resuelta", variante: "outline" },
};

/** «34600123456» → «•••••••456»; «web:abc…» → «web ·abc». */
const nombreConv = (c: Conversacion) =>
  c.nombre || (c.canal === "web" ? `Visitante web ·${c.wa_id.slice(-4)}` : "•".repeat(6) + c.wa_id.slice(-3));

const hace = (iso: string | null) => {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
};

const formatHora = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AsistenteBandeja() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [hilo, setHilo] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarLista = useCallback(async () => {
    const { data, error } = await db
      .from("asistente_conversaciones")
      .select("wa_id, canal, nombre, estado, motivo, asignado_a, pendiente_desde, ultimo_usuario_at, ultimo_mensaje_at, ultimo_texto")
      .order("ultimo_mensaje_at", { ascending: false })
      .limit(60);
    if (error) {
      toast.error("No se pudo cargar la bandeja");
      return;
    }
    setConversaciones((data ?? []) as Conversacion[]);
    setCargando(false);
  }, []);

  const cargarHilo = useCallback(async (waId: string) => {
    const { data } = await db
      .from("wa_messages")
      .select("wam_id, body, reply, intent, autor, created_at")
      .eq("wa_id", waId)
      .order("created_at", { ascending: true })
      .limit(200);
    setHilo((data ?? []) as Mensaje[]);
  }, []);

  useEffect(() => {
    cargarLista();
    const id = window.setInterval(cargarLista, 15000);
    return () => window.clearInterval(id);
  }, [cargarLista]);

  useEffect(() => {
    if (!seleccion) return;
    cargarHilo(seleccion);
    const id = window.setInterval(() => cargarHilo(seleccion), 10000);
    return () => window.clearInterval(id);
  }, [seleccion, cargarHilo]);

  const visibles = useMemo(
    () => (soloPendientes ? conversaciones.filter((c) => c.estado === "pendiente" || c.estado === "persona") : conversaciones),
    [conversaciones, soloPendientes],
  );
  const pendientes = conversaciones.filter((c) => c.estado === "pendiente").length;
  const actual = conversaciones.find((c) => c.wa_id === seleccion) ?? null;

  const accion = async (cuerpo: { wa_id: string; accion: "responder" | "resolver" | "asignar"; texto?: string }) => {
    const { data, error } = await supabase.functions.invoke("asistente-responder", { body: cuerpo });
    let cuerpoResp = data as { ok?: boolean; error?: string } | null;
    if (error && !cuerpoResp) {
      const ctx = (error as { context?: Response }).context;
      try {
        cuerpoResp = ctx ? await ctx.json() : null;
      } catch {
        cuerpoResp = null;
      }
    }
    if (!cuerpoResp?.ok) throw new Error(cuerpoResp?.error ?? "No se pudo hacer");
  };

  const responder = async () => {
    const t = texto.trim();
    if (!t || !seleccion || enviando) return;
    setEnviando(true);
    try {
      await accion({ wa_id: seleccion, accion: "responder", texto: t });
      setTexto("");
      await Promise.all([cargarHilo(seleccion), cargarLista()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setEnviando(false);
    }
  };

  const resolver = async () => {
    if (!seleccion) return;
    try {
      await accion({ wa_id: seleccion, accion: "resolver" });
      toast.success("Conversación resuelta: el siguiente mensaje lo atiende Maika");
      await cargarLista();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo resolver");
    }
  };

  // Ventana de 24 h de WhatsApp: pasada, Meta no deja texto libre.
  const ventanaCerrada =
    actual?.canal === "whatsapp" && actual.ultimo_usuario_at && Date.now() - Date.parse(actual.ultimo_usuario_at) > 24 * 3600_000;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            Bandeja
            {pendientes > 0 && <Badge variant="destructive">{pendientes} esperando</Badge>}
          </CardTitle>
          <CardDescription>
            Conversaciones de WhatsApp y del chat web. Las que esperan a una persona avisan por push; contesta desde aquí por el
            mismo canal y márcala resuelta al terminar.
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={soloPendientes ? "default" : "outline"} size="sm" onClick={() => setSoloPendientes(true)}>
            Esperando
          </Button>
          <Button variant={!soloPendientes ? "default" : "outline"} size="sm" onClick={() => setSoloPendientes(false)}>
            Todas
          </Button>
          <Button variant="ghost" size="icon" onClick={cargarLista} aria-label="Recargar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <ul className="divide-y rounded-md border max-h-[480px] overflow-y-auto">
              {visibles.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">
                  {soloPendientes ? "Nadie espera a una persona ahora mismo." : "Todavía no hay conversaciones."}
                </li>
              )}
              {visibles.map((c) => (
                <li key={c.wa_id}>
                  <button
                    type="button"
                    onClick={() => setSeleccion(c.wa_id)}
                    className={cn(
                      "w-full text-left p-3 text-sm hover:bg-muted/60",
                      seleccion === c.wa_id && "bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate flex items-center gap-1">
                        {c.canal === "web" ? <Globe className="h-3.5 w-3.5 shrink-0" /> : <MessageCircle className="h-3.5 w-3.5 shrink-0" />}
                        {nombreConv(c)}
                      </span>
                      <Badge variant={ETIQUETA[c.estado].variante} className="shrink-0">
                        {ETIQUETA[c.estado].texto}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.ultimo_texto || "…"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {hace(c.ultimo_mensaje_at)}
                      {c.estado === "pendiente" && c.motivo ? ` · ${c.motivo}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-col rounded-md border min-h-[320px]">
              {!actual ? (
                <p className="p-4 text-sm text-muted-foreground">Elige una conversación.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 border-b p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{nombreConv(actual)}</p>
                      <p className="text-xs text-muted-foreground">
                        {actual.canal === "web" ? "Chat web" : "WhatsApp"} · {ETIQUETA[actual.estado].texto}
                        {actual.pendiente_desde && actual.estado === "pendiente" ? ` desde ${hace(actual.pendiente_desde)}` : ""}
                      </p>
                    </div>
                    {actual.estado !== "resuelta" && actual.estado !== "bot" && (
                      <Button variant="outline" size="sm" onClick={resolver}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Resuelta
                      </Button>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto p-3 max-h-[360px]">
                    {hilo.map((m) => (
                      <div key={m.wam_id} className="space-y-1">
                        {m.autor === "usuario" && m.body && (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" /> {formatHora(m.created_at)}
                              </p>
                              {m.body}
                            </div>
                          </div>
                        )}
                        {m.reply && (
                          <div className="flex justify-end">
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap",
                                m.autor === "persona" ? "bg-[#EC7C2B]/15 border border-[#EC7C2B]/40" : "bg-[#235940]/10",
                              )}
                            >
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                {m.autor === "persona" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                                {m.autor === "persona" ? "Equipo" : "Maika"} · {formatHora(m.created_at)}
                              </p>
                              {m.reply}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t p-3 space-y-2">
                    {ventanaCerrada && (
                      <p className="text-xs text-destructive">
                        Han pasado más de 24 h desde su último mensaje: WhatsApp no deja enviar texto libre hasta que vuelva a escribir.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="Escribe como persona del equipo… (sale por el mismo canal)"
                        rows={2}
                        disabled={enviando || !!ventanaCerrada}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void responder();
                          }
                        }}
                      />
                      <Button onClick={responder} disabled={enviando || !texto.trim() || !!ventanaCerrada} aria-label="Enviar">
                        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
