/**
 * Webhook de WhatsApp Cloud API (WABA) — asistente para corredores y público.
 *
 * GET  → verificación del webhook (hub.challenge) al darlo de alta en Meta.
 * POST → mensaje entrante. Se valida la firma, se responde en segundo plano
 *        y se devuelve 200 al instante: si Meta no ve el 200 rápido, reintenta
 *        y el usuario recibe la respuesta duplicada.
 *
 * Secrets necesarios (supabase secrets set ...):
 *   WHATSAPP_VERIFY_TOKEN     — cadena que tú inventas, se pega en Meta
 *   WHATSAPP_APP_SECRET       — App Secret de la app de Meta (firma)
 *   WHATSAPP_TOKEN            — token permanente del System User
 *   WHATSAPP_PHONE_NUMBER_ID  — id del número, no el número
 *
 * Desplegar SIN JWT (Meta no manda el JWT de Supabase):
 *   supabase functions deploy whatsapp-webhook --no-verify-jwt
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractMessages, type IncomingMessage, sendText, verifySignature } from "./graph.ts";
import { getConfig } from "./data.ts";
import { PRIVACY_NOTICE, resolve } from "./intents.ts";

const RATE_LIMIT_REPLY =
  "Has hecho muchas consultas seguidas 😅 Espera un momento y vuelve a escribirme.";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Verificación del webhook (solo al configurarlo en Meta) ───────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && expected && token === expected && challenge) {
      console.log("✅ Webhook verificado por Meta");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.warn("❌ Verificación rechazada");
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Firma ─────────────────────────────────────────────────────────────────
  const raw = await req.text();
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");

  if (!appSecret) {
    console.error("❌ WHATSAPP_APP_SECRET sin configurar");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!(await verifySignature(raw, signature, appSecret))) {
    console.warn("❌ Firma inválida — petición descartada");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = extractMessages(payload);

  // Eventos de estado (delivered/read) y demás: 200 y a otra cosa.
  if (messages.length) {
    const work = handleMessages(messages);
    // waitUntil: contestamos a Meta ya y seguimos trabajando por detrás.
    if (typeof EdgeRuntime !== "undefined" && "waitUntil" in EdgeRuntime) {
      EdgeRuntime.waitUntil(work);
    } else {
      await work;
    }
  }

  return new Response("OK", { status: 200 });
});

/** Procesa los mensajes ya validados. Nunca lanza: los errores se registran. */
async function handleMessages(messages: IncomingMessage[]): Promise<void> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const cfg = await getConfig(sb);

  for (const msg of messages) {
    try {
      // Idempotencia: el wam_id es PK. Si Meta reintenta, el insert choca
      // y no contestamos dos veces.
      const { error: dupError } = await sb.from("wa_messages").insert({
        wam_id: msg.wamId,
        wa_id: msg.from,
        body: msg.type === "text" ? msg.text : `[${msg.type}]`,
      });

      if (dupError) {
        if (dupError.code === "23505") {
          console.log(`↩️ Reintento de Meta ignorado: ${msg.wamId}`);
        } else {
          console.error("❌ Error registrando mensaje:", dupError);
        }
        continue;
      }

      // ¿Es la primera vez que escribe? (el insert de arriba ya cuenta como 1)
      const { count: total } = await sb
        .from("wa_messages")
        .select("wam_id", { count: "exact", head: true })
        .eq("wa_id", msg.from);

      const isFirst = (total ?? 1) <= 1;

      // Rate limit por hora
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count: lastHour } = await sb
        .from("wa_messages")
        .select("wam_id", { count: "exact", head: true })
        .eq("wa_id", msg.from)
        .gte("created_at", since);

      const limit = cfg?.rate_limit_hour ?? 20;
      if ((lastHour ?? 0) > limit) {
        // Solo avisamos en el mensaje que cruza el límite, no en cada uno.
        if ((lastHour ?? 0) === limit + 1) await sendText(msg.from, RATE_LIMIT_REPLY);
        await sb
          .from("wa_messages")
          .update({ intent: "rate_limited" })
          .eq("wam_id", msg.wamId);
        continue;
      }

      // Solo texto. Audios, fotos y stickers reciben la ayuda.
      const text = msg.type === "text" ? msg.text : "";
      const { intent, reply } = await resolve(sb, cfg, text);

      await sendText(msg.from, isFirst ? reply + PRIVACY_NOTICE : reply);

      await sb
        .from("wa_messages")
        .update({ intent, reply_sent: true })
        .eq("wam_id", msg.wamId);

      console.log(`✅ ${msg.from} · ${intent}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`❌ Error con ${msg.wamId}:`, detail);
      await sb
        .from("wa_messages")
        .update({ error: detail })
        .eq("wam_id", msg.wamId);
    }
  }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
