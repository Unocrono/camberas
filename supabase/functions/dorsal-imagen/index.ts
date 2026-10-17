// El dorsal simulado de un inscrito, como imagen JPG, para enseñarlo dentro
// de los correos (bloque [[tarjeta_dorsal]] de reenviar-comprobantes): la
// plantilla en blanco de la carrera con su número y su nombre encima.
//
//   GET /functions/v1/dorsal-imagen?t=<token_inscripcion>  →  image/jpeg
//
//   POST (panel, con sesión de admin u organizador) {race_distance_id,
//   dorsal_simulado, numero, nombre}  →  vista previa sin guardar nada
//
// Se configura por RECORRIDO en race_distances.dorsal_simulado (Recorridos ›
// Dorsales) y, si el recorrido no tiene, vale la de la carrera
// (races.dorsal_simulado, con «recorridos» por id). Formato:
//   {
//     "fondo":  "https://camberas.com/fotos/<carrera>/dorsal.jpg",  plantilla en blanco
//     "fuente": "https://camberas.com/fuentes/Anton-Regular.ttf",   opcional (Anton)
//     "texto":  "nombre" | "nick" | "ninguno",  qué va debajo del número (nombre de pila
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
};
const texto = (s: string, status: number) =>
  new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS } });
const imagen = (jpg: Uint8Array, cache: string, cabeza = false) =>
  new Response(cabeza ? null : (jpg.buffer as ArrayBuffer), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpg.length), "Cache-Control": cache, ...CORS },
  });

// deno-lint-ignore no-explicit-any
type Conf = Record<string, any>;

/** La configuración que manda: la del recorrido y, si no tiene, la de la carrera */
function configuracion(recorrido: Conf | null, carrera: Conf | null, distanceId: string): Conf | null {
  if (recorrido?.fondo && recorrido?.numero) return recorrido;
  if (!carrera) return null;
  const c = { ...carrera, ...(carrera.recorridos?.[distanceId] ?? {}) };
  return c.fondo && c.numero ? c : null;
}

// Solo plantillas y fuentes nuestras: Storage del proyecto o camberas.com
function urlPermitida(url: unknown): url is string {
  try {
    const u = new URL(String(url));
    const propio = new URL(Deno.env.get("SUPABASE_URL")!).host;
    return u.protocol === "https:" && (u.host === propio || u.host === "camberas.com" || u.host.endsWith(".camberas.com"));
  } catch {
    return false;
  }
}

async function pintar(conf: Conf, numero: string, nombre: string | null): Promise<Uint8Array> {
  const sitio = (Deno.env.get("SITE_URL") ?? "https://camberas.com").replace(/\/+$/, "");
  const fuenteUrl = conf.fuente ?? `${sitio}/fuentes/Anton-Regular.ttf`;
  if (!urlPermitida(conf.fondo) || !urlPermitida(fuenteUrl)) throw new Error("Plantilla o fuente fuera de Camberas");
  const [plantilla, fuente] = await Promise.all([descargar(conf.fondo), descargar(fuenteUrl)]);
  return await dibujarDorsal(plantilla, fuente, numero, conf.texto === "ninguno" ? null : nombre, conf as unknown as Colocacion);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── Vista previa del panel (Recorridos › Dorsales): datos de prueba y la
  //    configuración que se está editando, sin guardar. Solo admin u
  //    organizador de la carrera del recorrido.
  if (req.method === "POST") {
    try {
      const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const { data: u } = await service.auth.getUser(jwt);
      if (!u?.user) return texto("No autenticado", 401);
      const body = await req.json().catch(() => ({}));
      const distanceId = String(body.race_distance_id ?? "");
      if (!UUID.test(distanceId)) return texto("Falta el recorrido", 400);
      const [{ data: roles }, { data: dist }] = await Promise.all([
        service.from("user_roles").select("role").eq("user_id", u.user.id),
        service.from("race_distances").select("id, race:races!race_distances_race_id_fkey(organizer_id)").eq("id", distanceId).maybeSingle(),
      ]);
      const esAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
      // deno-lint-ignore no-explicit-any
      if (!dist || (!esAdmin && (dist as any).race?.organizer_id !== u.user.id)) return texto("Sin permiso sobre este recorrido", 403);
      const conf = body.dorsal_simulado as Conf | null;
      if (!conf?.fondo || !conf?.numero) return texto("Falta la plantilla", 400);
      const numero = String(body.numero ?? "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 6) || "1";
      const nombre = String(body.nombre ?? "").trim().slice(0, 60) || null;
      return imagen(await pintar(conf, numero, nombre), "no-store");
    } catch (e) {
      console.error("dorsal-imagen (vista previa):", e);
      return texto(e instanceof Error ? e.message : "No se pudo generar el dorsal", 500);
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") return texto("Método no permitido", 405);
  const token = (new URL(req.url).searchParams.get("t") ?? "").trim().toLowerCase();
  if (!UUID.test(token)) return texto("Falta el código de la inscripción", 400);

  try {
    const { data: reg, error } = await service
      .from("registrations")
      .select("id, bib_number, first_name, status, race_distance_id, race:races!registrations_race_id_fkey(dorsal_simulado), distance:race_distances!registrations_race_distance_id_fkey(dorsal_simulado)")
      .eq("token_inscripcion", token)
      .maybeSingle();
    if (error) throw error;
    if (!reg || reg.status === "cancelled") return texto("Inscripción no encontrada", 404);
    if (reg.bib_number == null) return texto("Aún sin dorsal", 404);

    // deno-lint-ignore no-explicit-any
    const r = reg as any;
    const conf = configuracion(r.distance?.dorsal_simulado ?? null, r.race?.dorsal_simulado ?? null, reg.race_distance_id);
    if (!conf) return texto("Este recorrido no tiene dorsal simulado", 404);

    // Debajo del número: el nombre de pila (normalizado, «MARTA» → «Marta»),
    // el nick tal cual si el recorrido lo pide, o nada («ninguno»)
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

    // El dorsal o el nombre pueden cambiar: una hora de caché basta para que
    // los proxies de imágenes de los correos no la pidan sin parar
    return imagen(await pintar(conf, String(reg.bib_number), nombre), "public, max-age=3600", req.method === "HEAD");
  } catch (e) {
    console.error("dorsal-imagen:", e);
    return texto("No se pudo generar el dorsal", 500);
  }
});
