/**
 * Bandeja: el paso de Maika a una persona del equipo.
 *
 * Cada conversación (wa_id) tiene un estado en asistente_conversaciones:
 *   bot        → contesta Maika
 *   pendiente  → alguien pidió una persona (o Maika no supo); el equipo tiene
 *                aviso push y nadie ha contestado aún. Maika calla.
 *   persona    → una persona ya ha contestado y lleva la conversación. Maika calla.
 *   resuelta   → cerrada por el equipo; el siguiente mensaje vuelve a Maika.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Canal } from "./asistente.ts";

export type Estado = "bot" | "pendiente" | "persona" | "resuelta";

export interface Conversacion {
  wa_id: string;
  canal: Canal;
  estado: Estado;
  asignado_a: string | null;
  nombre: string | null;
}

export const PASO_A_PERSONA =
  "Te paso con el equipo de Camberas: te contestará una persona por aquí mismo en cuanto pueda " +
  "(en horario de oficina suele ser en pocos minutos). Si es urgente, escribe a soporte@camberas.com.";

/** Pide hablar con alguien: «quiero hablar con una persona», «un humano», «pásame con el equipo»… */
export function pideUnaPersona(texto: string): boolean {
  const t = texto.toLowerCase();
  return /\b(persona|humano|humana|alguien del equipo|operador|operadora|un agente|con el equipo|atenci[oó]n al cliente)\b/.test(t) &&
    /\b(hablar|hablo|contactar|contacto|p[aá]same|pasame|quiero|necesito|puedo|me atiende|atienda|llam[ae]|habla)\b/.test(t);
}

/** Registra la actividad de la conversación; crea la fila si no existe. Devuelve su estado. */
export async function tocarConversacion(
  sb: SupabaseClient,
  datos: { wa_id: string; canal: Canal; user_id: string | null; nombre: string | null; texto: string },
): Promise<Conversacion> {
  const ahora = new Date().toISOString();
  const { data: actual } = await sb
    .from("asistente_conversaciones")
    .select("wa_id, canal, estado, asignado_a, nombre")
    .eq("wa_id", datos.wa_id)
    .maybeSingle();

  const estado: Estado = actual && actual.estado !== "resuelta" ? actual.estado : "bot";
  const fila = {
    wa_id: datos.wa_id,
    canal: datos.canal,
    user_id: datos.user_id,
    nombre: datos.nombre ?? actual?.nombre ?? null,
    estado,
    ultimo_usuario_at: ahora,
    ultimo_mensaje_at: ahora,
    ultimo_texto: datos.texto.slice(0, 200),
    updated_at: ahora,
  };
  await sb.from("asistente_conversaciones").upsert(fila, { onConflict: "wa_id" });
  return { wa_id: datos.wa_id, canal: datos.canal, estado, asignado_a: actual?.asignado_a ?? null, nombre: fila.nombre };
}

/** Anota que ha salido un mensaje (del bot o de una persona). */
export async function anotarSalida(sb: SupabaseClient, waId: string, texto: string, estado?: Estado): Promise<void> {
  const ahora = new Date().toISOString();
  const cambios: Record<string, unknown> = { ultimo_mensaje_at: ahora, ultimo_texto: texto.slice(0, 200), updated_at: ahora };
  if (estado) cambios.estado = estado;
  await sb.from("asistente_conversaciones").update(cambios).eq("wa_id", waId);
}

/**
 * Pasa la conversación a pendiente y avisa por push a quien toque: a quien
 * ya la tuviera asignada, o a todos los admins.
 */
export async function pasarAPersona(
  sb: SupabaseClient,
  conv: Conversacion,
  motivo: string,
  textoUsuario: string,
): Promise<void> {
  const ahora = new Date().toISOString();
  if (conv.estado === "bot" || conv.estado === "resuelta") {
    await sb
      .from("asistente_conversaciones")
      .update({ estado: "pendiente", motivo: motivo.slice(0, 200), pendiente_desde: ahora, updated_at: ahora })
      .eq("wa_id", conv.wa_id);
  }
  await avisar(sb, conv, textoUsuario);
}

/** Push a quien atiende (o a los admins si nadie) con el último mensaje. */
export async function avisar(sb: SupabaseClient, conv: Conversacion, texto: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return;

  let destinatarios: string[] = [];
  if (conv.asignado_a) {
    destinatarios = [conv.asignado_a];
  } else {
    const { data } = await sb.from("user_roles").select("user_id").eq("role", "admin");
    destinatarios = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  }

  const quien = conv.nombre || (conv.canal === "web" ? "Visitante web" : "WhatsApp");
  console.log(`bandeja: aviso a ${destinatarios.length} destinatario(s) por ${conv.wa_id}`);
  await Promise.all(
    destinatarios.map(async (userId) => {
      try {
        const res = await fetch(`${url}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            userId,
            title: `💬 ${quien} espera respuesta`,
            body: texto.slice(0, 120),
            url: "/org?pantalla=bandeja",
          }),
        });
        // Se deja escrito lo que contestó send-push (sent/skipped/removed o
        // error): es la única forma de saber si el push salió de verdad.
        console.log(`bandeja: send-push ${res.status} ${await res.text()} (usuario ${userId})`);
      } catch (e) {
        console.warn("bandeja: push falló", e instanceof Error ? e.message : e);
      }
    }),
  );
}
