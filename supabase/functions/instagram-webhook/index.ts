/**
 * Webhook de mensajes directos de Instagram: el mismo asistente de carrera
 * que el de WhatsApp (dorsal, clasificación, mapa, info), por Instagram.
 *
 * GET  → verificación del webhook (hub.challenge) al darlo de alta en Meta.
 * POST → mensajes entrantes. Se valida la firma, se responde en segundo plano
 *        y se devuelve 200 al instante: si Meta no ve el 200 rápido, reintenta
 *        y la respuesta llega duplicada.
 *
 * Diferencias con WhatsApp, a propósito:
 *  · El buzón de Instagram de Camberas lo atienden personas. El asistente SOLO
 *    contesta con wa_bot_config.instagram_enabled y una carrera en directo, y
 *    nunca a lo que no entiende (ni a fotos o audios): eso se queda para una
 *    persona. Fuera de carrera no contesta ni guarda nada.
 *  · Instagram no pinta *negritas* ni _cursivas_: se quitan las marcas.
 *  · Se contesta a través de la página de Facebook, con su token, que se saca
 *    del token del usuario del sistema.
 *
 * Secrets: INSTAGRAM_VERIFY_TOKEN, INSTAGRAM_TOKEN, INSTAGRAM_USER_ID,
 * INSTAGRAM_PAGE_ID y el App Secret (META_APP_SECRET; vale WHATSAPP_APP_SECRET,
 * es la misma app). Alta: docs/instagram-alta-meta.md §10.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GRAPH_VERSION, verifySignature } from "../_shared/meta.ts";
import { credenciales } from "../_shared/instagram.ts";
import { getConfig } from "../_shared/asistente/data.ts";
import { resolve } from "../_shared/asistente/intents.ts";

const RATE_LIMIT_REPLY = "Has hecho muchas consultas seguidas 😅 Espera un momento y vuelve a escribirme.";
const AVISO_PRIVACIDAD =
  "\n\nGuardamos tu usuario de Instagram solo para atender esta consulta y lo borramos a los 30 días.";
// Instagram corta los mensajes en 1.000 bytes
const MAX_BYTES = 1000;

interface MensajeIG {
  mid: string;
  de: string;
  texto: string;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Verificación del webhook (solo al configurarlo en Meta) ───────────────
  if (req.method === "GET") {
    const esperado = Deno.env.get("INSTAGRAM_VERIFY_TOKEN");
    if (
      url.searchParams.get("hub.mode") === "subscribe" && esperado &&
      url.searchParams.get("hub.verify_token") === esperado && url.searchParams.get("hub.challenge")
    ) {
      return new Response(url.searchParams.get("hub.challenge"), {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // ── Firma ─────────────────────────────────────────────────────────────────
  const raw = await req.text();
  const appSecret = Deno.env.get("META_APP_SECRET") ?? Deno.env.get("WHATSAPP_APP_SECRET");
  if (!appSecret) {
    console.error("❌ META_APP_SECRET sin configurar");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), appSecret))) {
    console.warn("❌ Firma inválida — petición descartada");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const mensajes = extraerMensajes(payload);
  if (mensajes.length) {
    const trabajo = atender(mensajes);
    if (typeof EdgeRuntime !== "undefined" && "waitUntil" in EdgeRuntime) EdgeRuntime.waitUntil(trabajo);
    else await trabajo;
  }
  return new Response("OK", { status: 200 });
});

/**
 * Mensajes de texto entrantes. Lo demás (ecos de lo que manda la cuenta,
 * borrados, reacciones, leídos) no se contesta. Acepta las dos formas en que
 * Meta los manda: entry[].messaging[] y entry[].changes[] del campo messages.
 */
function extraerMensajes(payload: unknown): MensajeIG[] {
  const p = payload as { object?: string; entry?: unknown[] };
  if (p?.object !== "instagram") return [];
  const propia = Deno.env.get("INSTAGRAM_USER_ID");
  const out: MensajeIG[] = [];
  for (const entrada of p.entry ?? []) {
    const e = entrada as { messaging?: unknown[]; changes?: { field?: string; value?: unknown }[] };
    const eventos = [
      ...(e.messaging ?? []),
      ...(e.changes ?? []).filter((c) => c.field === "messages").map((c) => c.value),
    ];
    for (const ev of eventos) {
      const m = ev as {
        sender?: { id?: string };
        message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean };
      };
      if (!m?.message || m.message.is_echo || m.message.is_deleted) continue;
      const mid = String(m.message.mid ?? "");
      const de = String(m.sender?.id ?? "");
      if (!mid || !de || de === propia) continue;
      // Fotos, audios y stickers llegan sin texto: para una persona
      out.push({ mid, de, texto: String(m.message.text ?? "").trim() });
    }
  }
  return out;
}

/** Instagram no pinta las marcas de WhatsApp: *negrita* y _cursiva_ se quitan */
const sinMarcas = (t: string) =>
  t.replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/gm, "$1$2");

/** Recorta a los bytes que admite Instagram sin partir un emoji */
function recortar(t: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(t).length <= maxBytes) return t;
  const letras = Array.from(t);
  while (letras.length && enc.encode(letras.join("") + "…").length > maxBytes) letras.pop();
  return letras.join("") + "…";
}

let tokenPagina: string | null = null;

/** El token de la página, sacado una vez del token del usuario del sistema */
async function tokenDePagina(pagina: string): Promise<string> {
  if (tokenPagina) return tokenPagina;
  const { token } = credenciales();
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pagina}?fields=access_token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`No se pudo sacar el token de la página: ${j?.error?.message ?? r.status}`);
  }
  tokenPagina = j.access_token as string;
  return tokenPagina;
}

async function enviar(a: string, texto: string): Promise<void> {
  const pagina = Deno.env.get("INSTAGRAM_PAGE_ID");
  if (!pagina) throw new Error("INSTAGRAM_PAGE_ID sin configurar");
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pagina}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenDePagina(pagina)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: a },
      messaging_type: "RESPONSE",
      message: { text: recortar(sinMarcas(texto), MAX_BYTES) },
    }),
  });
  if (!r.ok) throw new Error(`Graph API ${r.status}: ${await r.text()}`);
}

/** Procesa los mensajes ya validados. Nunca lanza: los errores se registran. */
async function atender(mensajes: MensajeIG[]): Promise<void> {
  const sb: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const cfg = await getConfig(sb);
  // Sin carrera en directo por Instagram, el buzón es de las personas: ni se
  // contesta ni se guarda nada
  if (!cfg?.instagram_enabled || !cfg.enabled || !cfg.active_eid) return;

  for (const msg of mensajes) {
    try {
      // Idempotencia: el mid es PK. Si Meta reintenta, el insert choca
      const { error: duplicado } = await sb.from("ig_mensajes").insert({
        mid: msg.mid,
        igsid: msg.de,
        body: msg.texto || "[adjunto]",
      });
      if (duplicado) {
        if (duplicado.code !== "23505") console.error("❌ Error registrando mensaje:", duplicado);
        continue;
      }

      if (!msg.texto) {
        await sb.from("ig_mensajes").update({ intent: "adjunto" }).eq("mid", msg.mid);
        continue;
      }

      const { count: total } = await sb
        .from("ig_mensajes")
        .select("mid", { count: "exact", head: true })
        .eq("igsid", msg.de);
      const primero = (total ?? 1) <= 1;

      const desde = new Date(Date.now() - 3600_000).toISOString();
      const { count: ultimaHora } = await sb
        .from("ig_mensajes")
        .select("mid", { count: "exact", head: true })
        .eq("igsid", msg.de)
        .gte("created_at", desde);
      const limite = cfg.rate_limit_hour ?? 20;
      if ((ultimaHora ?? 0) > limite) {
        if ((ultimaHora ?? 0) === limite + 1) await enviar(msg.de, RATE_LIMIT_REPLY);
        await sb.from("ig_mensajes").update({ intent: "rate_limited" }).eq("mid", msg.mid);
        continue;
      }

      const { intent, reply } = await resolve(sb, cfg, msg.texto);
      // Lo que el asistente no entiende lo contesta una persona
      if (intent === "unknown") {
        await sb.from("ig_mensajes").update({ intent }).eq("mid", msg.mid);
        continue;
      }

      await enviar(msg.de, primero ? reply + AVISO_PRIVACIDAD : reply);
      await sb.from("ig_mensajes").update({ intent, reply_sent: true }).eq("mid", msg.mid);
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      console.error(`❌ Error con ${msg.mid}:`, detalle);
      await sb.from("ig_mensajes").update({ error: detalle }).eq("mid", msg.mid);
    }
  }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
