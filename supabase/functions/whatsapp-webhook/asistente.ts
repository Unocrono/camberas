/**
 * Capa de lenguaje libre: el contestador de Camberas.
 *
 * Entra solo cuando las reglas de intents.ts no reconocen el mensaje. Claude
 * recibe el texto y un juego de herramientas que leen la base de datos (las
 * inscripciones de quien escribe, las carreras, las FAQ, los tiempos) y redacta
 * la respuesta con lo que devuelven. Nunca inventa datos: si una herramienta no
 * trae nada, lo dice y remite a soporte.
 *
 * La identidad es la del teléfono: el bot solo habla de las inscripciones del
 * usuario que escribe, nunca de las de otra persona.
 *
 * Secret necesario: ANTHROPIC_API_KEY (el mismo que usa leer-carrera).
 */

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.128.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type BotConfig, findRunner, getTop, type Usuario } from "./data.ts";

const MODEL = "claude-opus-5-5";
const MAX_VUELTAS = 5;

/** Mensaje anterior de la misma persona, para que el bot tenga hilo. */
export interface Turno {
  body: string;
  reply: string;
}

export const SOPORTE = "soporte@camberas.com";

function instrucciones(cfg: BotConfig | null, usuario: Usuario, hoy: string): string {
  const enAntena = cfg?.enabled && cfg.race_id
    ? `Hay una carrera en directo ahora mismo: ${cfg.race_name}. Para dorsales y clasificaciones usa las herramientas consultar_dorsal y clasificacion.`
    : "Ahora mismo no hay ninguna carrera en directo, así que no puedes dar tiempos ni clasificaciones en vivo.";

  return `Eres el asistente de Camberas por WhatsApp. Camberas es la plataforma de carreras de montaña (trail y MTB) de UNO Cronometraje: inscripciones, cronometraje, seguimiento GPS en vivo y resultados. La web es https://camberas.com y cada carrera está en https://camberas.com/<slug>.

Hoy es ${hoy}. Hablas con ${usuario.first_name || "un usuario registrado"}, usuario de Camberas (la identidad es la de su teléfono).

${enAntena}

Cómo respondes:
- En español, de tú, cercano y breve: es WhatsApp. Una sola respuesta completa, sin saludos largos ni despedidas. Negrita con *asteriscos*, nada de títulos ni tablas. Un emoji como mucho.
- Solo con datos que te devuelvan las herramientas. Si una herramienta no trae lo que se pregunta, dilo claro ("no me consta…") y remite a ${SOPORTE}. No inventes fechas, precios, dorsales ni plazos.
- Sus inscripciones las consultas con mis_inscripciones. Las carreras abiertas con proximas_carreras. Los detalles de una carrera (precios, plazos, recorrido, FAQ) con info_carrera.
- Nunca des datos de otra persona (otro corredor, otro dorsal fuera de carrera). Si pregunta por alguien que no es él, explica que solo puedes hablar de sus propias inscripciones.
- Pagos, cambios de distancia, bajas o cesiones de dorsal: explica lo que diga la carrera (info_carrera) y, si hay que gestionarlo, indica que escriba a ${SOPORTE} o entre en https://camberas.com/dashboard (sus inscripciones) o https://camberas.com/profile (sus datos).
- Si pregunta algo ajeno a Camberas y a las carreras, dilo con amabilidad y vuelve al tema.
- Importes en euros con coma decimal (12,50 €). Fechas como "sábado 14 de marzo".`;
}

// ── Herramientas (lectura de la BD) ────────────────────────────────────────

interface Herramienta {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const HERRAMIENTAS: Herramienta[] = [
  {
    name: "mis_inscripciones",
    description:
      "Inscripciones del usuario que escribe: carrera, fecha, distancia, dorsal, estado y estado del pago. Úsala para '¿estoy inscrito?', '¿he pagado?', 'mi dorsal', 'mis carreras'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "proximas_carreras",
    description:
      "Carreras de Camberas con fecha de hoy en adelante: nombre, fecha, lugar, distancias con precio y si la inscripción está abierta. Úsala para '¿qué carreras hay?', '¿cuándo abren las inscripciones?'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "info_carrera",
    description:
      "Detalle de una carrera por su slug (sale en proximas_carreras y en mis_inscripciones): descripción, distancias con desnivel, precio y plazos, web oficial, información adicional y preguntas frecuentes del organizador.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string", description: "Slug de la carrera, p. ej. pena-prieta-2027" } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_dorsal",
    description:
      "Solo con carrera en directo: cómo va un dorsal (meta, último control, retirado). Pide el número de dorsal.",
    input_schema: {
      type: "object",
      properties: { dorsal: { type: "string", description: "Número de dorsal" } },
      required: ["dorsal"],
      additionalProperties: false,
    },
  },
  {
    name: "clasificacion",
    description: "Solo con carrera en directo: los cinco primeros, general o por sexo.",
    input_schema: {
      type: "object",
      properties: {
        sexo: { type: "string", enum: ["general", "F", "M"], description: "general, F (femenina) o M (masculina)" },
      },
      required: ["sexo"],
      additionalProperties: false,
    },
  },
];

interface InscripcionRow {
  bib_number: number | null;
  status: string | null;
  payment_status: string | null;
  created_at: string;
  race: { name: string; date: string; slug: string | null; location: string | null } | null;
  distance: { name: string; distance_km: number | null; price: number | null } | null;
}

interface CarreraRow {
  name: string;
  date: string;
  slug: string | null;
  location: string | null;
  subtitle: string | null;
  registration_opens: string | null;
  registration_closes: string | null;
  race_distances: {
    name: string;
    distance_km: number | null;
    elevation_gain: number | null;
    price: number | null;
    registration_opens: string | null;
    registration_closes: string | null;
    is_visible: boolean | null;
  }[];
}

async function ejecutar(
  sb: SupabaseClient,
  cfg: BotConfig | null,
  usuario: Usuario,
  nombre: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const hoy = new Date().toISOString().slice(0, 10);

  switch (nombre) {
    case "mis_inscripciones": {
      const { data } = await sb
        .from("registrations")
        .select(
          "bib_number, status, payment_status, created_at, race:races(name, date, slug, location), distance:race_distances(name, distance_km, price)",
        )
        .eq("user_id", usuario.id)
        .order("created_at", { ascending: false })
        .limit(10);
      const filas = (data ?? []) as unknown as InscripcionRow[];
      return filas.map((r) => ({
        carrera: r.race?.name ?? null,
        fecha: r.race?.date ?? null,
        slug: r.race?.slug ?? null,
        lugar: r.race?.location ?? null,
        distancia: r.distance?.name ?? null,
        km: r.distance?.distance_km ?? null,
        dorsal: r.bib_number,
        estado: r.status,
        pago: r.payment_status,
        precio: r.distance?.price ?? null,
      }));
    }

    case "proximas_carreras": {
      const { data } = await sb
        .from("races")
        .select(
          "name, date, slug, location, subtitle, registration_opens, registration_closes, race_distances(name, distance_km, elevation_gain, price, registration_opens, registration_closes, is_visible)",
        )
        .eq("is_visible", true)
        .or("es_demo.is.null,es_demo.eq.false")
        .gte("date", hoy)
        .order("date", { ascending: true })
        .limit(8);
      return ((data ?? []) as unknown as CarreraRow[]).map(resumenCarrera);
    }

    case "info_carrera": {
      const slug = String(input.slug ?? "").trim();
      if (!slug) return { error: "Falta el slug" };
      const { data: race } = await sb
        .from("races")
        .select(
          "id, name, date, slug, location, subtitle, description, additional_info, official_website_url, registration_opens, registration_closes, race_distances(name, distance_km, elevation_gain, price, registration_opens, registration_closes, is_visible, cutoff_time, start_location)",
        )
        .eq("slug", slug)
        .eq("is_visible", true)
        .maybeSingle();
      if (!race) return { error: "No hay ninguna carrera con ese slug" };
      const { data: faqs } = await sb
        .from("race_faqs")
        .select("question, answer")
        .eq("race_id", (race as { id: string }).id)
        .order("display_order", { ascending: true })
        .limit(30);
      const r = race as unknown as CarreraRow & {
        description: string | null;
        additional_info: string | null;
        official_website_url: string | null;
      };
      return {
        ...resumenCarrera(r),
        descripcion: r.description,
        informacion_adicional: r.additional_info,
        web_oficial: r.official_website_url,
        faq: faqs ?? [],
      };
    }

    case "consultar_dorsal": {
      if (!cfg?.enabled || !cfg.race_id) return { error: "No hay carrera en directo" };
      const dorsal = String(input.dorsal ?? "").replace(/\D/g, "");
      if (!dorsal) return { error: "Dorsal no válido" };
      return await findRunner(sb, cfg, dorsal);
    }

    case "clasificacion": {
      if (!cfg?.enabled || !cfg.race_id) return { error: "No hay carrera en directo" };
      const sexo = input.sexo === "F" || input.sexo === "M" ? input.sexo : null;
      return await getTop(sb, cfg, sexo);
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

function resumenCarrera(r: CarreraRow) {
  const ahora = Date.now();
  const abierta = (desde: string | null, hasta: string | null) =>
    (!desde || Date.parse(desde) <= ahora) && (!hasta || Date.parse(hasta) >= ahora);
  return {
    nombre: r.name,
    subtitulo: r.subtitle,
    fecha: r.date,
    lugar: r.location,
    slug: r.slug,
    url: r.slug ? `https://camberas.com/${r.slug}` : null,
    inscripcion_abre: r.registration_opens,
    inscripcion_cierra: r.registration_closes,
    inscripcion_abierta: abierta(r.registration_opens, r.registration_closes),
    distancias: (r.race_distances ?? [])
      .filter((d) => d.is_visible !== false)
      .map((d) => ({
        nombre: d.name,
        km: d.distance_km,
        desnivel_positivo: d.elevation_gain,
        precio: d.price,
        inscripcion_abre: d.registration_opens,
        inscripcion_cierra: d.registration_closes,
        inscripcion_abierta: abierta(d.registration_opens ?? r.registration_opens, d.registration_closes ?? r.registration_closes),
      })),
  };
}

// ── Bucle con Claude ───────────────────────────────────────────────────────

// Tipos a mano: el comprobador de Lovable no resuelve las definiciones del
// SDK que llega por esm.sh (mismo apaño que en leer-carrera).
interface BloqueTexto {
  type: "text";
  text: string;
}
interface BloqueTool {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
type Bloque = BloqueTexto | BloqueTool | { type: string };

interface Respuesta {
  stop_reason: string;
  content: Bloque[];
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Responde en lenguaje libre. Devuelve null si no hay clave, si el modelo se
 * niega o si algo falla: el llamador cae a la ayuda de siempre.
 */
export async function responderLibre(
  sb: SupabaseClient,
  cfg: BotConfig | null,
  usuario: Usuario,
  texto: string,
  historial: Turno[],
): Promise<string | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.warn("asistente: falta ANTHROPIC_API_KEY, sin lenguaje libre");
    return null;
  }

  const anthropic = new Anthropic({ apiKey });
  const hoy = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });

  // Hilo: los últimos turnos de esta misma persona, del más antiguo al nuevo.
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [];
  for (const t of historial) {
    messages.push({ role: "user", content: t.body });
    messages.push({ role: "assistant", content: t.reply });
  }
  messages.push({ role: "user", content: texto });

  const system = instrucciones(cfg, usuario, hoy);

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    // deno-lint-ignore no-explicit-any
    const response = (await (anthropic.beta.messages as any).create({
      model: MODEL,
      max_tokens: 1024, // una respuesta de WhatsApp; más sería un error
      system,
      output_config: { effort: "low" },
      tools: HERRAMIENTAS,
      // Si un filtro de seguridad rechazara la petición, Meta reintenta la
      // llamada sola en otro modelo en vez de dejar al usuario sin respuesta.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    })) as Respuesta;

    if (response.stop_reason === "refusal") {
      console.warn("asistente: respuesta rechazada por el modelo");
      return null;
    }

    const toolUses = response.content.filter((b): b is BloqueTool => b.type === "tool_use");

    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const texto = response.content
        .filter((b): b is BloqueTexto => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      console.log(
        `asistente: ${vuelta + 1} vuelta(s), tokens ${response.usage.input_tokens}/${response.usage.output_tokens}`,
      );
      return texto || null;
    }

    messages.push({ role: "assistant", content: response.content });

    // Todas las herramientas de la vuelta, en un solo mensaje de usuario.
    const resultados = await Promise.all(
      toolUses.map(async (t) => {
        try {
          const salida = await ejecutar(sb, cfg, usuario, t.name, t.input ?? {});
          return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(salida) };
        } catch (e) {
          const detalle = e instanceof Error ? e.message : String(e);
          console.error(`asistente: herramienta ${t.name} falló:`, detalle);
          return { type: "tool_result", tool_use_id: t.id, content: `Error: ${detalle}`, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: resultados });
  }

  console.warn("asistente: agotadas las vueltas sin respuesta");
  return null;
}
