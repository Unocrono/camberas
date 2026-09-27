// Lee el cartel (imagen) o el reglamento (texto) de una carrera y devuelve
// los datos del asistente de creación ya estructurados: carrera, recorridos y
// avisos. Lo llama RaceWizard ("¿Cómo empezamos? → Desde el cartel / Desde el
// reglamento"); el organizador revisa lo leído paso a paso antes de crear
// nada. Aquí NO se escribe en la base de datos.
//
// Quién puede: admin u organizador aprobado (has_role), con sesión.
//
// Claude (API de Anthropic, secreto ANTHROPIC_API_KEY en Lovable) con salida
// estructurada: la respuesta cumple siempre el esquema de abajo, así el
// asistente no tiene que interpretar texto libre. Lo que no está en el cartel
// vuelve como null y se explica en `avisos`; nunca se inventa.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Topes de entrada: un reglamento largo cabe de sobra; el cartel llega
// reducido a 1600 px desde el navegador (unos 300-600 KB en base64)
const MAX_TEXTO = 30_000;
const MAX_IMAGEN_BASE64 = 6_000_000;
const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const Recorrido = z.object({
  nombre: z.string().nullable().describe("Nombre del recorrido o modalidad, p. ej. «Trail 21K», «Marcha»"),
  km: z.number().nullable().describe("Distancia en kilómetros"),
  desnivel: z.number().nullable().describe("Desnivel positivo acumulado en metros (D+)"),
  precio: z.number().nullable().describe("Precio de inscripción en euros. Si hay varios tramos, el primero o el vigente"),
  plazas: z.number().nullable().describe("Número máximo de participantes, si se indica"),
  hora: z.string().nullable().describe("Hora de salida en formato HH:MM (24 h)"),
});

const Lectura = z.object({
  carrera: z.object({
    nombre: z.string().nullable().describe("Nombre completo de la carrera, sin el año si va aparte"),
    fecha: z.string().nullable().describe("Fecha de la carrera en formato YYYY-MM-DD"),
    localidad: z.string().nullable().describe("Localidad y provincia, p. ej. «Santoña, Cantabria»"),
    tipo: z.enum(["trail", "mtb"]).nullable().describe("mtb si es de bicicleta (BTT, MTB); trail si es a pie"),
    cierre_inscripciones: z.string().nullable().describe("Último día de inscripción, YYYY-MM-DD"),
  }),
  recorridos: z.array(Recorrido).describe("Un elemento por recorrido, distancia o modalidad"),
  avisos: z
    .array(z.string())
    .describe("Notas breves en español sobre lo que falta, es dudoso o se ha supuesto (p. ej. el año de la fecha)"),
});

const instrucciones = (hoy: string) => `Eres el asistente de Camberas, una plataforma de inscripciones de carreras de trail y MTB. Te dan el cartel o el reglamento de una carrera y devuelves sus datos para dar de alta la carrera.

Reglas:
- Solo lo que esté en el material. Lo que no aparezca va como null y lo explicas en "avisos". No inventes nada.
- Fechas en formato YYYY-MM-DD. Si el material no dice el año, usa la próxima vez que caiga esa fecha a partir de hoy (${hoy}) y avísalo en "avisos".
- Horas en formato HH:MM de 24 horas.
- Precios en euros, como número (22, no "22 €"). Si hay varios tramos de precio, pon el primero o el vigente y avísalo.
- Un recorrido por cada distancia o modalidad (por ejemplo, un cartel con "22K, 10K y marcha de 8 km" son tres recorridos). Nombre corto y reconocible.
- "cierre_inscripciones" es el último día en que se admiten inscripciones, si se indica.
- "tipo": "mtb" si es una prueba de bicicleta (BTT, MTB, ciclista); "trail" en cualquier otro caso (trail, montaña, marcha, carrera a pie).
- Los "avisos" son frases cortas, en español, pensadas para quien va a revisar los datos.`;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "Falta configurar la clave de Anthropic (ANTHROPIC_API_KEY) en los secretos" }, 500);
    }

    // ── Quién llama: admin u organizador aprobado ─────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "No autenticado" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const [{ data: esAdmin }, { data: esOrganizador }] = await Promise.all([
      authClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      authClient.rpc("has_role", { _user_id: user.id, _role: "organizer" }),
    ]);
    if (esAdmin !== true && esOrganizador !== true) {
      return json({ error: "Solo organizadores y administradores" }, 403);
    }

    // ── Qué hay que leer ─────────────────────────────────────────────────
    let cuerpo: { texto?: unknown; imagen?: { base64?: unknown; mediaType?: unknown } } = {};
    try {
      cuerpo = await req.json();
    } catch {
      return json({ error: "Cuerpo de la petición no válido" }, 400);
    }
    const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
    const base64 = typeof cuerpo.imagen?.base64 === "string" ? cuerpo.imagen.base64 : "";
    const mediaType = typeof cuerpo.imagen?.mediaType === "string" ? cuerpo.imagen.mediaType : "";

    if (!texto && !base64) return json({ error: "Manda el texto del reglamento o la imagen del cartel" }, 400);
    if (texto.length > MAX_TEXTO) return json({ error: `El texto es demasiado largo (máximo ${MAX_TEXTO} caracteres)` }, 400);
    if (base64 && base64.length > MAX_IMAGEN_BASE64) return json({ error: "La imagen es demasiado grande" }, 400);
    if (base64 && !(TIPOS_IMAGEN as readonly string[]).includes(mediaType)) {
      return json({ error: "Formato de imagen no admitido (JPEG, PNG, WebP o GIF)" }, 400);
    }

    const contenido: Anthropic.ContentBlockParam[] = [];
    if (base64) {
      contenido.push({
        type: "image",
        source: { type: "base64", media_type: mediaType as (typeof TIPOS_IMAGEN)[number], data: base64 },
      });
    }
    contenido.push({
      type: "text",
      text: texto
        ? `Este es el texto del reglamento o de la convocatoria:\n\n${texto}\n\nDevuelve los datos de la carrera.`
        : "Este es el cartel de la carrera. Devuelve los datos de la carrera.",
    });

    // ── Claude ───────────────────────────────────────────────────────────
    // Sin fallbacks de rechazo: un cartel de carrera no activa los filtros
    // de seguridad, y así la petición se queda en lo mínimo.
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const hoy = new Date().toISOString().slice(0, 10);
    const response = await anthropic.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: instrucciones(hoy),
      output_config: { effort: "medium", format: zodOutputFormat(Lectura) },
      messages: [{ role: "user", content: contenido }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "No se pudo leer el material" }, 422);
    }
    const lectura = response.parsed_output;
    if (!lectura) {
      console.error("leer-carrera: respuesta sin formato esperado", JSON.stringify(response.content).slice(0, 500));
      return json({ error: "No se pudo interpretar la lectura. Prueba con una imagen más nítida o pega el texto." }, 502);
    }

    console.log(
      `leer-carrera: ${base64 ? "cartel" : "reglamento"} por ${user.id}, ` +
        `${lectura.recorridos.length} recorridos, tokens ${response.usage.input_tokens}/${response.usage.output_tokens}`,
    );
    return json(lectura);
  } catch (err: unknown) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("leer-carrera: clave de Anthropic rechazada");
      return json({ error: "La clave de Anthropic no es válida" }, 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "Demasiadas lecturas seguidas: espera un momento y vuelve a intentarlo" }, 429);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`leer-carrera: API de Anthropic ${err.status}:`, err.message);
      return json({ error: `No se pudo leer (${err.status})` }, 502);
    }
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("leer-carrera:", msg);
    return json({ error: msg }, 500);
  }
});
