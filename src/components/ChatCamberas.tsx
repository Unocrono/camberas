/**
 * Chat de la web: burbuja abajo a la derecha que habla con el contestador de
 * Camberas (Edge Function asistente-chat, el mismo cerebro que WhatsApp).
 *
 * - Con sesión iniciada manda el JWT y el bot puede hablar de las
 *   inscripciones de quien escribe.
 * - Sin sesión contesta lo público; a la tercera pregunta el servidor cierra
 *   el chat hasta que entre con su cuenta. El asistente es para usuarios.
 * - El hilo vive en el servidor (wa_messages, canal web) atado a un id de
 *   sesión que se guarda en localStorage; aquí solo se pinta lo de esta visita.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Donde no tiene sentido (paneles, puestos de cronometraje, overlays, pantallas). */
const SIN_CHAT = [/^\/admin/, /^\/organizer/, /^\/org\b/, /^\/timing/, /^\/overlay/, /^\/pantalla/, /^\/vuelo/, /^\/start-control/, /^\/auth/];

const CLAVE_SESION = "camberas-chat-sesion";

interface Burbuja {
  de: "yo" | "bot";
  texto: string;
}

const SALUDO: Burbuja = {
  de: "bot",
  texto:
    "👋 Hola, soy Maika. Bienvenido a Camberas.\n\nEstoy aquí para ayudarte a resolver cualquier duda sobre tu inscripción, buscar carreras, consultar el estado de tu dorsal o atender cualquier incidencia.\n\n¿En qué te puedo ayudar hoy?",
};

function sesionId(): string {
  try {
    const v = localStorage.getItem(CLAVE_SESION);
    if (v) return v;
    const nuevo = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(CLAVE_SESION, nuevo);
    return nuevo;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/** *negrita* de WhatsApp → <strong>, y las URL → enlaces. */
function pintar(texto: string) {
  const partes = texto.split(/(\*[^*\n]+\*|https?:\/\/[^\s)]+)/g);
  return partes.map((p, i) => {
    if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^https?:\/\//.test(p)) {
      return (
        <a key={i} href={p} className="underline break-all" target="_blank" rel="noreferrer">
          {p.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export default function ChatCamberas() {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [burbujas, setBurbujas] = useState<Burbuja[]>([SALUDO]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cerrado, setCerrado] = useState(false);
  const [restantes, setRestantes] = useState<number | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [burbujas, abierto]);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  // Al iniciar sesión se levanta el cierre: ya es usuario.
  useEffect(() => {
    if (session) {
      setCerrado(false);
      setRestantes(null);
    }
  }, [session]);

  if (SIN_CHAT.some((r) => r.test(pathname))) return null;

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando || cerrado) return;
    setTexto("");
    setBurbujas((b) => [...b, { de: "yo", texto: t }]);
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("asistente-chat", {
        body: { session_id: sesionId(), texto: t },
      });
      // invoke devuelve error en los 4xx/5xx, pero el cuerpo trae la respuesta
      // que queremos enseñar (cierre, límite). Se lee de ahí si hace falta.
      let cuerpo = data as { reply?: string; cerrado?: boolean; restantes?: number; error?: string } | null;
      if (error && !cuerpo) {
        const ctx = (error as { context?: Response }).context;
        try {
          cuerpo = ctx ? await ctx.json() : null;
        } catch {
          cuerpo = null;
        }
      }
      const reply = cuerpo?.reply ?? cuerpo?.error ?? "Ahora mismo no puedo contestar. Escríbenos a soporte@camberas.com.";
      setBurbujas((b) => [...b, { de: "bot", texto: reply }]);
      if (cuerpo?.cerrado) setCerrado(true);
      if (typeof cuerpo?.restantes === "number") {
        setRestantes(cuerpo.restantes);
        if (cuerpo.restantes === 0) setCerrado(true);
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir el chat con Maika"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#EC7C2B] text-white shadow-lg transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#EC7C2B]/40"
        >
          <MessageCircle className="h-7 w-7" />
        </button>
      )}

      {abierto && (
        <div
          role="dialog"
          aria-label="Chat con Maika, la asistente de Camberas"
          className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col bg-[#FAF6EC] shadow-2xl sm:bottom-5 sm:right-5 sm:h-[560px] sm:max-h-[85vh] sm:w-[380px] sm:rounded-2xl sm:border sm:border-[#235940]/15"
        >
          <div className="flex items-center justify-between bg-[#235940] px-4 py-3 text-white sm:rounded-t-2xl">
            <div>
              <p className="font-semibold leading-tight">Maika · Camberas</p>
              <p className="text-xs text-white/75">
                {session ? "Te contesta al momento" : "Entra con tu cuenta para preguntar por tus inscripciones"}
              </p>
            </div>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="rounded-full p-1 hover:bg-white/15">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {burbujas.map((b, i) => (
              <div key={i} className={cn("flex", b.de === "yo" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-snug",
                    b.de === "yo" ? "rounded-br-sm bg-[#235940] text-white" : "rounded-bl-sm border border-[#235940]/10 bg-white text-foreground",
                  )}
                >
                  {b.de === "bot" ? pintar(b.texto) : b.texto}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-[#235940]/10 bg-white px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#235940]" />
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>

          {cerrado ? (
            <div className="border-t border-[#235940]/10 p-3 text-center text-sm">
              <Button asChild className="w-full bg-[#EC7C2B] hover:bg-[#EC7C2B]/90">
                <Link to="/auth">Entrar o crear mi cuenta</Link>
              </Button>
            </div>
          ) : (
            <form
              className="flex items-center gap-2 border-t border-[#235940]/10 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
            >
              <Input
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={restantes !== null && restantes > 0 ? `Escribe… (${restantes} sin cuenta)` : "Escribe tu pregunta…"}
                maxLength={1000}
                className="bg-white"
                disabled={enviando}
              />
              <Button type="submit" size="icon" disabled={enviando || !texto.trim()} className="shrink-0 bg-[#EC7C2B] hover:bg-[#EC7C2B]/90" aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
