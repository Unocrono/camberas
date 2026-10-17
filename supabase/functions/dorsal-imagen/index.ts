// El dorsal simulado de un inscrito, como imagen JPG, para enseñarlo dentro
// de los correos (bloque [[tarjeta_dorsal]] de reenviar-comprobantes): la
// plantilla en blanco de la carrera con su número y su nombre encima.
//
//   GET /functions/v1/dorsal-imagen?t=<token_inscripcion>  →  image/jpeg
//
// Se configura por carrera en races.dorsal_simulado (jsonb):
//   {
//     "fondo":  "https://camberas.com/fotos/<carrera>/dorsal.jpg",  plantilla en blanco
//     "fuente": "https://camberas.com/fuentes/Anton-Regular.ttf",   opcional (Anton)
//     "texto":  "nombre" | "nick",   qué va debajo del número (nombre de pila
//                                    por defecto; «nick» lee la respuesta del
//                                    campo nick/apodo/nombre_dorsal del formulario)
//     "numero": { centroX, arriba, alto, ensanche, anchoMax, color },
//     "nombre": { centroX, arriba, alto, ensanche, anchoMax, color },
//     "recorridos": { "<race_distance_id>": { "fondo": … } }   diseño propio de un recorrido
//   }
// Sin configuración, sin dorsal o cancelada: 404, y el correo enseña la
// tarjeta verde de siempre.
//
// Pública a propósito (verify_jwt = false): la pide el cliente de correo, que
// no manda credenciales. Solo enseña el número y el nombre de pila de quien
// ya tiene el token (lo mismo que su página /mi-dorsal/<token>).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { type Colocacion, dibujarDorsal, nombreDorsal } from "./dibujar.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Plantillas y fuentes ya descargadas, mientras viva el proceso
const ficheros = new Map<string, Uint8Array>();
async function descargar(url: string): Promise<Uint8Array> {
  const guardado = ficheros.get(url);
  if (guardado) return guardado;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url} respondió ${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (ficheros.size > 20) ficheros.clear();
  ficheros.set(url, bytes);
  return bytes;
}

const texto = (s: string, status: number) =>
  new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } });

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "HEAD") return texto("Método no permitido", 405);
  const token = (new URL(req.url).searchParams.get("t") ?? "").trim().toLowerCase();
  if (!UUID.test(token)) return texto("Falta el código de la inscripción", 400);

  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: reg, error } = await service
      .from("registrations")
      .select("id, bib_number, first_name, status, race_distance_id, race:races!registrations_race_id_fkey(dorsal_simulado)")
      .eq("token_inscripcion", token)
      .maybeSingle();
    if (error) throw error;
    if (!reg || reg.status === "cancelled") return texto("Inscripción no encontrada", 404);
    if (reg.bib_number == null) return texto("Aún sin dorsal", 404);

    // deno-lint-ignore no-explicit-any
    const base = ((reg as any).race?.dorsal_simulado ?? null) as Record<string, any> | null;
    if (!base?.fondo && !base?.recorridos) return texto("Esta carrera no tiene dorsal simulado", 404);
    const conf = { ...base, ...(base?.recorridos?.[reg.race_distance_id] ?? {}) };
    if (!conf.fondo || !conf.numero) return texto("Esta carrera no tiene dorsal simulado", 404);

    // Debajo del número: el nombre de pila o, si la carrera lo pide, el nick
    // El nombre de pila se normaliza («MARTA» → «Marta»); el nick va tal cual
    let nombre: string | null = reg.first_name ? nombreDorsal(reg.first_name) : null;
    if (conf.texto === "nick") {
      const { data: resp } = await service
        .from("registration_responses")
        .select("field_value, field:registration_form_fields!inner(field_name)")
        .eq("registration_id", reg.id)
        .in("field.field_name", ["nick", "apodo", "nombre_dorsal"])
        .limit(1);
      const nick = (resp?.[0]?.field_value ?? "").trim();
      if (nick) nombre = nick;
    }

    const sitio = (Deno.env.get("SITE_URL") ?? "https://camberas.com").replace(/\/+$/, "");
    const [plantilla, fuente] = await Promise.all([
      descargar(conf.fondo),
      descargar(conf.fuente ?? `${sitio}/fuentes/Anton-Regular.ttf`),
    ]);
    const jpg = await dibujarDorsal(
      plantilla,
      fuente,
      String(reg.bib_number),
      nombre,
      conf as unknown as Colocacion,
    );

    return new Response(req.method === "HEAD" ? null : (jpg.buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpg.length),
        // El dorsal o el nombre pueden cambiar: una hora de caché basta para
        // que los proxies de imágenes de los correos no la pidan sin parar
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("dorsal-imagen:", e);
    return texto("No se pudo generar el dorsal", 500);
  }
});
