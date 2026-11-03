/**
 * Chat de la web: el mismo contestador que WhatsApp, pero desde camberas.com.
 *
 * POST { session_id, texto } → { reply, intent }
 *
 * Atiende a cualquiera: con sesión de Supabase (cabecera Authorization) el
 * bot sabe quién es y puede hablar de sus inscripciones; sin ella, solo de lo
 * público (carreras, precios, cómo inscribirse). Por eso se despliega SIN
 * verify_jwt y se comprueba la sesión a mano.
 *
 * Reutiliza _shared/asistente (reglas + Claude con herramientas) y registra
 * los turnos en wa_messages con canal = 'web', así la bandeja del panel verá
 * los dos canales juntos.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getConfig, type Usuario } from "../_shared/asistente/data.ts";
import { resolve } from "../_shared/asistente/intents.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TEXTO = 1000;
/** Mensajes por sesión y hora: el contestador cuesta dinero por respuesta. */
const LIMITE_HORA = 30;
const HILO = 6;
/**
 * Sin sesión iniciada se contestan como mucho tres preguntas; a partir de ahí
 * el chat se cierra hasta que entre con su cuenta. El asistente es para
 * usuarios de Camberas; el visitante tiene tres preguntas para hacerse uno.
 */
const PREGUNTAS_SIN_CUENTA = 3;
const CERRADO_SIN_CUENTA =
  "Para seguir hablando conmigo necesitas una cuenta de Camberas: es gratis y te la haces en un minuto. " +
  "Entra o regístrate en https://camberas.com/auth y vuelve a preguntarme lo que quieras. 🙂";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let cuerpo: { session_id?: unknown; texto?: unknown } = {};
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Cuerpo no válido" }, 400);
  }
  const sessionId = typeof cuerpo.session_id === "string" ? cuerpo.session_id.trim() : "";
  const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return json({ error: "Sesión no válida" }, 400);
  if (!texto) return json({ error: "Escribe algo" }, 400);
  if (texto.length > MAX_TEXTO) return json({ error: "Mensaje demasiado largo" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  // ── ¿Quién escribe? Solo si trae sesión válida ───────────────────────────
  let usuario: Usuario | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const { data: perfil } = await sb.from("profiles").select("id, first_name").eq("id", user.id).maybeSingle();
      usuario = (perfil as Usuario) ?? { id: user.id, first_name: null };
    }
  }

  const waId = `web:${sessionId}`;
  const wamId = `web:${crypto.randomUUID()}`;

  try {
    // Límite por sesión y hora
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await sb
      .from("wa_messages")
      .select("wam_id", { count: "exact", head: true })
      .eq("wa_id", waId)
      .gte("created_at", since);
    if ((count ?? 0) >= LIMITE_HORA) {
      return json({ reply: "Has hecho muchas consultas seguidas 😅 Espera un rato y vuelve a escribirme.", intent: "rate_limited" }, 429);
    }

    // Sin cuenta: tres preguntas y se cierra (cuenta todas las de la sesión,
    // no solo las de la última hora).
    if (!usuario) {
      const { count: sinCuenta } = await sb
        .from("wa_messages")
        .select("wam_id", { count: "exact", head: true })
        .eq("wa_id", waId);
      if ((sinCuenta ?? 0) >= PREGUNTAS_SIN_CUENTA) {
        return json({ reply: CERRADO_SIN_CUENTA, intent: "no_registrado", cerrado: true }, 403);
      }
    }

    await sb.from("wa_messages").insert({
      wam_id: wamId,
      wa_id: waId,
      body: texto,
      canal: "web",
      user_id: usuario?.id ?? null,
    });

    const [{ data: previos }, cfg] = await Promise.all([
      sb
        .from("wa_messages")
        .select("body, reply")
        .eq("wa_id", waId)
        .neq("wam_id", wamId)
        .not("reply", "is", null)
        .order("created_at", { ascending: false })
        .limit(HILO),
      getConfig(sb),
    ]);
    const historial = ((previos ?? []) as { body: string | null; reply: string | null }[])
      .reverse()
      .filter((p) => p.body && p.reply)
      .map((p) => ({ body: p.body as string, reply: p.reply as string }));

    const { intent, reply } = await resolve(sb, cfg, usuario, texto, historial, "web");

    await sb.from("wa_messages").update({ intent, reply, reply_sent: true }).eq("wam_id", wamId);

    // Al visitante sin cuenta se le dice cuántas le quedan; en la última, que
    // la siguiente ya no se contesta.
    let restantes: number | undefined;
    if (!usuario) {
      const { count: usadas } = await sb
        .from("wa_messages")
        .select("wam_id", { count: "exact", head: true })
        .eq("wa_id", waId);
      restantes = Math.max(0, PREGUNTAS_SIN_CUENTA - (usadas ?? 0));
    }

    return json({ reply, intent, restantes });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("asistente-chat:", detalle);
    await sb.from("wa_messages").update({ error: detalle }).eq("wam_id", wamId);
    return json({ error: "Ahora mismo no puedo contestar. Escríbenos a soporte@camberas.com." }, 500);
  }
});
