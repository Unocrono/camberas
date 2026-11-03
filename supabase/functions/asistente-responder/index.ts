/**
 * El equipo contesta desde el panel por el mismo canal que usó la persona.
 *
 * POST { wa_id, accion: "responder", texto }  → manda el texto (WhatsApp por la
 *                                               Graph API; web lo recoge el chat)
 * POST { wa_id, accion: "resolver" }           → cierra: el siguiente mensaje
 *                                               vuelve a Maika
 * POST { wa_id, accion: "asignar" }            → me la quedo yo
 *
 * Con JWT: solo admin u organizador.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendText } from "../_shared/asistente/graph.ts";
import { anotarSalida } from "../_shared/asistente/bandeja.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const [{ data: esAdmin }, { data: esOrg }] = await Promise.all([
    authClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    authClient.rpc("has_role", { _user_id: user.id, _role: "organizer" }),
  ]);
  if (esAdmin !== true && esOrg !== true) return json({ error: "Solo el equipo" }, 403);

  let cuerpo: { wa_id?: unknown; accion?: unknown; texto?: unknown } = {};
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Cuerpo no válido" }, 400);
  }
  const waId = typeof cuerpo.wa_id === "string" ? cuerpo.wa_id : "";
  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
  const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
  if (!waId) return json({ error: "Falta wa_id" }, 400);

  const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: conv } = await sb
    .from("asistente_conversaciones")
    .select("wa_id, canal, estado, asignado_a, ultimo_usuario_at")
    .eq("wa_id", waId)
    .maybeSingle();
  if (!conv) return json({ error: "Conversación no encontrada" }, 404);

  const ahora = new Date().toISOString();

  if (accion === "resolver") {
    await sb
      .from("asistente_conversaciones")
      .update({ estado: "resuelta", updated_at: ahora })
      .eq("wa_id", waId);
    return json({ ok: true, estado: "resuelta" });
  }

  if (accion === "asignar") {
    await sb
      .from("asistente_conversaciones")
      .update({ asignado_a: user.id, estado: conv.estado === "resuelta" ? "persona" : conv.estado, updated_at: ahora })
      .eq("wa_id", waId);
    return json({ ok: true });
  }

  if (accion !== "responder") return json({ error: "Acción desconocida" }, 400);
  if (!texto) return json({ error: "Escribe algo" }, 400);
  if (texto.length > 2000) return json({ error: "Demasiado largo" }, 400);

  // WhatsApp: fuera de la ventana de 24 h Meta rechaza el texto libre.
  if (conv.canal === "whatsapp") {
    const ultimo = conv.ultimo_usuario_at ? Date.parse(conv.ultimo_usuario_at) : 0;
    if (Date.now() - ultimo > 24 * 3600_000) {
      return json({ error: "Han pasado más de 24 h desde su último mensaje: WhatsApp no deja enviar texto libre. Espera a que vuelva a escribir." }, 409);
    }
    try {
      await sendText(waId, texto);
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      return json({ error: `WhatsApp no aceptó el mensaje: ${detalle}` }, 502);
    }
  }

  const wamId = `persona:${crypto.randomUUID()}`;
  await sb.from("wa_messages").insert({
    wam_id: wamId,
    wa_id: waId,
    body: null,
    reply: texto,
    intent: "persona",
    reply_sent: true,
    canal: conv.canal,
    autor: "persona",
    autor_id: user.id,
  });
  await sb
    .from("asistente_conversaciones")
    .update({ asignado_a: conv.asignado_a ?? user.id })
    .eq("wa_id", waId);
  await anotarSalida(sb, waId, texto, "persona");

  return json({ ok: true, wam_id: wamId });
});
