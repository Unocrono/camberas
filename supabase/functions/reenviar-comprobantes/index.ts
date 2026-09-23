// Reenvía por email el comprobante de inscripción de las inscripciones que el
// gestor selecciona en el panel (acción masiva "Reenviar comprobante").
//
// Por qué una función nueva y no reutilizar las que hay:
//  - send-payment-confirmation es interna del webhook de Redsys: solo acepta
//    la clave de servicio, recibe el contenido ya montado y además manda copia
//    al organizador (un reenvío masivo le llenaría el buzón).
//  - send-registration-confirmation dice siempre "pago pendiente" y acepta
//    cualquier destinatario: no sirve de comprobante.
// Aquí todo se lee de la base de datos en el servidor: del navegador solo
// llegan los ids. Ni el email ni el importe se aceptan del cliente.
//
// Quién puede: admin, o el organizador de TODAS las carreras de las
// inscripciones pedidas. Si falla una, no se manda nada.
//
// Qué se manda y qué no:
//  - pagada (paid) → comprobante con importe (si se conoce) y referencia.
//  - gratuita (not_required) y confirmada → comprobante sin bloque de pago.
//  - pendiente de pago, gratuita sin confirmar, cancelada o reembolsada →
//    no hay comprobante que mandar: se omite y se dice por qué.
//
// Los datos del corredor (nombre, DNI, club, talla) salen de las columnas de
// la inscripción, que son las que corrige el panel; de las respuestas del
// formulario solo se enseñan las preguntas propias de la carrera.
//  - importada de uno.es (EventBooking) → se omite salvo que se pida: uno.es
//    ya les mandó el suyo.
//  - sin email → se omite. El email sale de la inscripción; si está vacío
//    (las inscripciones hechas con cuenta se guardan sin él), del usuario o
//    de su perfil.
//
// dryRun: devuelve lo mismo sin mandar nada, para que el panel enseñe el
// recuento antes de confirmar. No escribe en la base de datos en ningún caso.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Paleta Camberas (docs/paleta-camberas.md)
const VERDE = "#235940";
const CREMA = "#FAF6EC";

// Tope por llamada: con la pausa entre envíos, 50 caben de sobra en el
// tiempo máximo de una función. El panel trocea selecciones mayores.
const MAX_POR_LLAMADA = 50;
// Resend admite unas 2 peticiones por segundo por defecto
const PAUSA_MS = 550;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Respuestas por consulta: 10 inscripciones × ~25 respuestas queda muy por
// debajo del tope de 1000 filas de PostgREST, que corta sin avisar
const RESPUESTAS_POR_CONSULTA = 10;

// Campos que el panel corrige en las columnas de la inscripción y NO en
// registration_responses: su respuesta guardada puede estar desfasada (el
// organizador arregla un DNI y la respuesta sigue con el viejo). En el
// comprobante esos datos salen de la inscripción, nunca de las respuestas.
const CAMPOS_DE_LA_INSCRIPCION = new Set([
  "first_name", "last_name", "email", "phone", "document_number", "dni_passport",
  "birth_date", "gender", "gender_id", "category", "race_category_id", "tshirt_size",
  "address", "city", "province", "country", "autonomous_community", "club", "team",
]);

type Plantilla = "pagada" | "gratuita";
// Qué email se manda: el comprobante de siempre, "tu dorsal" (con el enlace
// al QR de la recogida) o "Camberas Track" (instalar la app y activar el
// dorsal). Los dos últimos nacieron para la Marcha ADEMCO (sep-2026).
type Tipo = "comprobante" | "dorsal" | "track";
type Motivo =
  | "cancelada"
  | "reembolsada"
  | "pendiente_de_pago"
  | "pendiente_de_confirmar"
  | "importada_de_uno_es"
  | "sin_email"
  | "sin_dorsal"
  | "sin_gps_en_recorrido"
  | "sin_dorsal_gps"
  | "estado_desconocido";

interface Resultado {
  registrationId: string;
  resultado: "enviado" | "se_enviaria" | "omitido" | "fallido";
  plantilla?: Plantilla;
  motivo?: Motivo;
  email?: string;
  error?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** 1.174,50 € (useGrouping explícito: no todos los runtimes agrupan) */
const euros = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) + " €";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Casillas del formulario: "true"/"false" se leen mejor como Sí/No */
const valorLegible = (v: string) => (v === "true" ? "Sí" : v === "false" ? "No" : v);

function fila(etiqueta: string, valor: string, destacado = false): string {
  return `<tr>
    <td style="padding: 6px 0; color: #4b5563; vertical-align: top;">${esc(etiqueta)}</td>
    <td style="padding: 6px 0 6px 12px; color: ${destacado ? VERDE : "#1f2937"}; text-align: right;${
      destacado ? " font-weight: bold;" : ""
    }">${esc(valor)}</td>
  </tr>`;
}

interface Datos {
  plantilla: Plantilla;
  tipo: Tipo;
  /** Texto libre de la organización (lugar y horario de recogida, avisos) */
  mensaje: string | null;
  /** Track: enlace de activación del dorsal en la app (gps_tokens) */
  activacionUrl: string | null;
  nombre: string | null;
  carrera: string;
  fecha: string | null;
  lugar: string | null;
  recorrido: string | null;
  dorsal: number | null;
  importe: number | null;
  referencia: string | null;
  miDorsalUrl: string | null;
  /** Datos de la inscripción (columnas, al día) + preguntas propias de la carrera */
  respuestas: { label: string; value: string }[];
}

function cuerpo(d: Datos): string {
  const saludo = d.nombre ? `Hola ${esc(d.nombre)},` : "Hola,";
  const estado = d.plantilla === "pagada" ? "Pagada" : "Confirmada (inscripción gratuita)";

  const filas = [
    d.nombre ? fila("Corredor/a", d.nombre) : "",
    d.dorsal != null ? fila("Dorsal", String(d.dorsal), true) : "",
    fila("Carrera", d.carrera),
    d.recorrido ? fila("Recorrido", d.recorrido) : "",
    d.fecha ? fila("Fecha", fechaLarga(d.fecha)) : "",
    d.lugar ? fila("Lugar", d.lugar) : "",
    fila("Estado", estado),
    d.plantilla === "pagada" && d.importe != null ? fila("Importe pagado", euros(d.importe), true) : "",
    d.plantilla === "pagada" && d.referencia ? fila("Referencia de pago", d.referencia) : "",
  ].join("");

  const botonDorsal = d.miDorsalUrl
    ? `<div style="text-align: center; margin: 28px 0;">
        <a href="${esc(d.miDorsalUrl)}"
           style="display: inline-block; background: ${VERDE}; color: ${CREMA}; text-decoration: none;
                  padding: 14px 30px; border-radius: 8px; font-size: 16px; font-weight: bold;">
          Ver mi dorsal
        </a>
        <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px;">
          Es tu código para la <strong>recogida de dorsales</strong>: enséñalo en el móvil.
        </p>
      </div>`
    : "";

  const bloqueRespuestas = d.respuestas.length
    ? `<div style="background: #f9fafb; border-left: 4px solid #9ca3af; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
        <h3 style="margin: 0 0 8px; color: #1f2937; font-size: 15px;">Datos de tu inscripción</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${d.respuestas.map((r) => fila(r.label, valorLegible(r.value))).join("")}
        </table>
      </div>`
    : "";

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: ${VERDE}; padding: 28px 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; letter-spacing: 0.5px;">Camberas</h1>
      <p style="color: ${CREMA}; margin: 8px 0 0; font-size: 13px;">Carreras de trail y montaña</p>
    </div>

    <div style="padding: 36px 30px;">
      <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 21px;">Comprobante de inscripción</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">${saludo}</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Te reenviamos, a petición de la organización, el comprobante de tu inscripción en
        <strong>${esc(d.carrera)}</strong>.
      </p>

      <div style="background: ${CREMA}; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 18px 20px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">${filas}</table>
      </div>

      ${botonDorsal}
      ${bloqueRespuestas}

      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
        Si algún dato no es correcto, ponte en contacto con la organización de la carrera.
      </p>
    </div>

    <div style="background: ${CREMA}; padding: 18px 30px; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Inscripción gestionada con <strong>camberas.com</strong>
      </p>
    </div>
  </div>`;
}


const APP_STORE = "https://apps.apple.com/es/app/camberas-track/id6792264406";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.unocrono.camberastrack";

/** Texto libre de la organización, escapado y con sus saltos de línea */
function bloqueMensaje(titulo: string, mensaje: string | null): string {
  if (!mensaje) return "";
  return `<div style="background: #f9fafb; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 8px; color: #1f2937; font-size: 15px;">${esc(titulo)}</h3>
    <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">${esc(mensaje).replace(/\n/g, "<br>")}</p>
  </div>`;
}

function envoltorio(titulo: string, interior: string): string {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: ${VERDE}; padding: 28px 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; letter-spacing: 0.5px;">Camberas</h1>
      <p style="color: ${CREMA}; margin: 8px 0 0; font-size: 13px;">Carreras de trail y montaña</p>
    </div>
    <div style="padding: 36px 30px;">
      <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 21px;">${esc(titulo)}</h2>
      ${interior}
    </div>
    <div style="background: ${CREMA}; padding: 18px 30px; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Inscripción gestionada con <strong>camberas.com</strong>
      </p>
    </div>
  </div>`;
}

/** "Tu dorsal": el número en grande y el enlace a la página con el QR de la recogida */
function cuerpoDorsal(d: Datos): string {
  const saludo = d.nombre ? `Hola ${esc(d.nombre)},` : "Hola,";
  const linea = [d.recorrido, d.fecha ? fechaLarga(d.fecha) : null, d.lugar]
    .filter((x): x is string => !!x)
    .map((x) => esc(x))
    .join(" · ");
  return envoltorio("Tu dorsal para la carrera", `
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">${saludo}</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Ya tienes dorsal para <strong>${esc(d.carrera)}</strong>.
      </p>
      <div style="background: ${VERDE}; color: ${CREMA}; border-radius: 10px; padding: 22px; text-align: center; margin: 24px 0;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.85;">Dorsal</p>
        <p style="margin: 6px 0 0; font-size: 56px; font-weight: bold; line-height: 1;">${d.dorsal ?? "—"}</p>
        ${linea ? `<p style="margin: 12px 0 0; font-size: 13px; opacity: 0.9;">${linea}</p>` : ""}
      </div>
      ${
        d.miDorsalUrl
          ? `<div style="text-align: center; margin: 28px 0;">
        <a href="${esc(d.miDorsalUrl)}"
           style="display: inline-block; background: ${VERDE}; color: ${CREMA}; text-decoration: none;
                  padding: 14px 30px; border-radius: 8px; font-size: 16px; font-weight: bold;">
          Ver mi dorsal
        </a>
        <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
          Al pulsar verás tu dorsal y un <strong>código QR</strong>. Enséñalo en el móvil en la
          <strong>mesa de recogida de dorsales</strong> y te atienden en segundos. Guarda este correo.
        </p>
      </div>`
          : ""
      }
      ${bloqueMensaje("Recogida de dorsales", d.mensaje)}
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
        Si algún dato no es correcto, ponte en contacto con la organización de la carrera.
      </p>`);
}

/** "Camberas Track": instalar la app y activar el dorsal, en tres pasos */
function cuerpoTrack(d: Datos): string {
  const saludo = d.nombre ? `Hola ${esc(d.nombre)},` : "Hola,";
  const paso = (n: number, titulo: string, contenido: string) => `
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0;"><tr>
        <td style="width: 34px; vertical-align: top; padding-top: 4px;">
          <div style="width: 34px; height: 34px; border-radius: 17px; background: ${VERDE}; color: ${CREMA};
                      font-weight: bold; font-size: 16px; text-align: center; line-height: 34px;">${n}</div>
        </td>
        <td style="vertical-align: top; padding-left: 14px;">
          <p style="margin: 6px 0 4px; color: #1f2937; font-size: 16px; font-weight: bold;">${esc(titulo)}</p>
          ${contenido}
        </td>
      </tr></table>`;
  const tienda = (href: string, texto: string) =>
    `<a href="${href}" style="display: inline-block; background: #1f2937; color: #ffffff; text-decoration: none;
        padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: bold; margin: 6px 8px 6px 0;">${texto}</a>`;
  return envoltorio("Sigue la carrera en directo", `
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 8px;">${saludo}</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 12px;">
        En <strong>${esc(d.carrera)}</strong> usamos <strong>Camberas Track</strong>: la organización sabe dónde
        estás durante la prueba y tu gente puede seguirte en el mapa en directo. Solo hay que hacer tres cosas:
      </p>
      ${paso(1, "Instala Camberas Track en tu móvil", `
          <p style="margin: 0 0 6px; color: #4b5563; font-size: 14px; line-height: 1.6;">Es gratis y no pide registro.</p>
          ${tienda(APP_STORE, "App Store (iPhone)")}${tienda(PLAY_STORE, "Google Play (Android)")}`)}
      ${paso(2, `Activa tu dorsal ${d.dorsal ?? ""}`.trim(), `
          <p style="margin: 0 0 10px; color: #4b5563; font-size: 14px; line-height: 1.6;">
            Con la app ya instalada, pulsa este botón <strong>desde ese mismo móvil</strong>: tu dorsal queda
            vinculado a él. Este enlace es personal, no lo compartas.
          </p>
          ${
            d.activacionUrl
              ? `<a href="${esc(d.activacionUrl)}" style="display: inline-block; background: ${VERDE}; color: ${CREMA}; text-decoration: none;
                  padding: 14px 30px; border-radius: 8px; font-size: 16px; font-weight: bold;">Activar mi dorsal ${d.dorsal ?? ""}</a>`
              : ""
          }`)}
      ${paso(3, "El día de la carrera", `
          <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
            Abre la app antes de la salida, comprueba que aparece tu dorsal y lleva el móvil contigo.
            Nada más: la app envía tu posición sola, también con la pantalla apagada.
          </p>`)}
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 20px 0 0;">
        Sin registro ni datos personales: solo tu dorsal y tu posición durante la carrera.
      </p>
      ${bloqueMensaje("De la organización", d.mensaje)}`);
}

const asunto = (d: Datos) =>
  d.tipo === "dorsal"
    ? `Tu dorsal ${d.dorsal ?? ""} para ${d.carrera}`.replace(/\s+/g, " ")
    : d.tipo === "track"
      ? `Sigue ${d.carrera} en directo con Camberas Track`
      : `Comprobante de inscripción: ${d.carrera}`;

const cuerpoPorTipo = (d: Datos) =>
  d.tipo === "dorsal" ? cuerpoDorsal(d) : d.tipo === "track" ? cuerpoTrack(d) : cuerpo(d);

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
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://camberas.com";
    const service = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Quién llama ────────────────────────────────────────────────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await service.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);
    const uid = userData.user.id;

    // ── Qué pide ───────────────────────────────────────────────────────────
    let body: { registrationIds?: unknown; dryRun?: unknown; incluirExternas?: unknown; plantilla?: unknown; mensaje?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Cuerpo de la petición no válido" }, 400);
    }
    const ids = Array.isArray(body.registrationIds)
      ? [...new Set(body.registrationIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))]
      : [];
    if (ids.length === 0) return json({ error: "No hay inscripciones que reenviar" }, 400);
    if (ids.length > MAX_POR_LLAMADA) {
      return json({ error: `Como mucho ${MAX_POR_LLAMADA} inscripciones por llamada` }, 400);
    }
    const dryRun = body.dryRun === true;
    const incluirExternas = body.incluirExternas === true;
    const tipo: Tipo = body.plantilla === "dorsal" || body.plantilla === "track" ? body.plantilla : "comprobante";
    const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim().slice(0, 1500) : "";

    // ── Las inscripciones y el permiso sobre sus carreras ─────────────────
    const { data: regs, error: regsErr } = await service
      .from("registrations")
      .select(
        "id, race_id, race_distance_id, user_id, email, first_name, last_name, bib_number, " +
          "status, payment_status, source, importe_manual, token_inscripcion, dni_passport, club, tshirt_size",
      )
      .in("id", ids);
    if (regsErr) throw new Error(`registrations: ${regsErr.message}`);
    if (!regs || regs.length !== ids.length) {
      return json({ error: "Alguna de las inscripciones no existe" }, 404);
    }

    const raceIds = [...new Set(regs.map((r: any) => r.race_id as string))];
    const [{ data: roles }, { data: races, error: racesErr }] = await Promise.all([
      service.from("user_roles").select("role").eq("user_id", uid),
      service.from("races").select("id, name, date, location, organizer_id").in("id", raceIds),
    ]);
    if (racesErr) throw new Error(`races: ${racesErr.message}`);
    const esAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!esAdmin && (races ?? []).some((ra: any) => ra.organizer_id !== uid)) {
      return json({ error: "Sin permiso sobre alguna de las carreras" }, 403);
    }
    const carreraPorId = new Map((races ?? []).map((ra: any) => [ra.id, ra]));

    // ── Todo lo demás, en bloque ──────────────────────────────────────────
    const distanceIds = [...new Set(regs.map((r: any) => r.race_distance_id as string).filter(Boolean))];
    const userIds = [...new Set(regs.map((r: any) => r.user_id as string | null).filter(Boolean))] as string[];

    const lotesRespuestas: string[][] = [];
    for (let i = 0; i < ids.length; i += RESPUESTAS_POR_CONSULTA) {
      lotesRespuestas.push(ids.slice(i, i + RESPUESTAS_POR_CONSULTA));
    }

    // Un fallo de lectura para el envío entero: mejor no mandar nada que
    // mandar comprobantes sin importe o sin datos
    const leer = async <T>(nombre: string, consulta: PromiseLike<{ data: T[] | null; error: any }>) => {
      const { data, error } = await consulta;
      if (error) throw new Error(`${nombre}: ${error.message}`);
      return data ?? [];
    };

    const [distancias, perfiles, respuestasPorLote, intents, items] = await Promise.all([
      leer<any>("race_distances", service.from("race_distances").select("id, name, gps_tracking_enabled").in("id", distanceIds)),
      userIds.length
        ? leer<any>("profiles", service.from("profiles").select("id, email, first_name, last_name").in("id", userIds))
        : Promise.resolve([] as any[]),
      Promise.all(
        lotesRespuestas.map((lote) =>
          leer<any>(
            "registration_responses",
            service
              .from("registration_responses")
              .select(
                "registration_id, field_value, registration_form_fields(field_name, field_label, field_order, " +
                  "is_system_field, is_visible, race_distance_id)",
              )
              .in("registration_id", lote),
          )
        ),
      ),
      // Pago individual: el último intento completado
      leer<any>(
        "payment_intents",
        service
          .from("payment_intents")
          .select("registration_id, amount, order_number, completed_at")
          .in("registration_id", ids)
          .eq("status", "completed")
          .order("completed_at", { ascending: false }),
      ),
      // Pago de equipo: el capitán paga el lote y cada inscripción tiene su parte
      leer<any>(
        "payment_intent_items",
        service
          .from("payment_intent_items")
          .select("registration_id, amount, payment_intents!inner(order_number, status, completed_at)")
          .in("registration_id", ids)
          .eq("payment_intents.status", "completed"),
      ),
    ]);
    const respuestas = respuestasPorLote.flat();

    const nombreDistancia = new Map(distancias.map((d: any) => [d.id, d.name as string]));
    const gpsEnRecorrido = new Map(distancias.map((d: any) => [d.id, d.gps_tracking_enabled === true]));

    // Track: el enlace de activación de cada dorsal es el token GPS activo de
    // ese evento + dorsal (los crea el panel en "Dorsales GPS (QR)")
    const activacionPorDorsal = new Map<string, string>();
    if (tipo === "track" && distanceIds.length) {
      const toks = await leer<any>(
        "gps_tokens",
        service.from("gps_tokens").select("event_id, bib_number, token, active").in("event_id", distanceIds).eq("active", true),
      );
      for (const t of toks) {
        activacionPorDorsal.set(`${t.event_id}|${String(t.bib_number ?? "").trim()}`, `${SITE_URL}/activar.html?t=${t.token}`);
      }
    }
    const perfilPorId = new Map(perfiles.map((p: any) => [p.id, p]));

    const pagoIndividual = new Map<string, { amount: number; order: string | null }>();
    for (const pi of intents) {
      if (!pagoIndividual.has(pi.registration_id)) {
        pagoIndividual.set(pi.registration_id, { amount: Number(pi.amount), order: pi.order_number ?? null });
      }
    }
    const pagoEquipo = new Map<string, { amount: number; order: string | null }>();
    for (const it of items) {
      const pi = Array.isArray(it.payment_intents) ? it.payment_intents[0] : it.payment_intents;
      if (!pagoEquipo.has(it.registration_id)) {
        pagoEquipo.set(it.registration_id, { amount: Number(it.amount), order: pi?.order_number ?? null });
      }
    }

    // Solo las preguntas propias de la carrera, del recorrido actual y a la
    // vista. Las de sistema (nombre, DNI, email…) pueden estar desfasadas; las
    // de otro recorrido se quedan huérfanas si se cambió de recorrido.
    const distanciaDe = new Map((regs as any[]).map((r) => [r.id, r.race_distance_id as string]));
    const respuestasPorInscripcion = new Map<string, { label: string; value: string; order: number }[]>();
    for (const r of respuestas) {
      const campo = Array.isArray(r.registration_form_fields) ? r.registration_form_fields[0] : r.registration_form_fields;
      if (!campo) continue;
      if (campo.is_system_field === true || campo.is_visible === false) continue;
      if (CAMPOS_DE_LA_INSCRIPCION.has(campo.field_name)) continue;
      if (campo.race_distance_id && campo.race_distance_id !== distanciaDe.get(r.registration_id)) continue;
      const label = campo.field_label ?? "";
      const value = (r.field_value ?? "").trim();
      if (!label || !value) continue;
      const lista = respuestasPorInscripcion.get(r.registration_id) ?? [];
      lista.push({ label, value, order: campo?.field_order ?? 999 });
      respuestasPorInscripcion.set(r.registration_id, lista);
    }

    // Email de la cuenta, solo para quien no lo tiene en la inscripción
    const emailCuenta = new Map<string, string>();
    for (const r of regs as any[]) {
      if (r.user_id && !(r.email ?? "").trim() && !emailCuenta.has(r.user_id)) {
        const { data } = await service.auth.admin.getUserById(r.user_id);
        if (data?.user?.email) emailCuenta.set(r.user_id, data.user.email);
      }
    }

    // ── Clasificar ────────────────────────────────────────────────────────
    const resend = dryRun ? null : new Resend(Deno.env.get("RESEND_API_KEY"));
    const resultados: Resultado[] = [];
    let primerEnvio = true;

    // Mismo orden que pidió el panel
    const porId = new Map((regs as any[]).map((r) => [r.id, r]));
    for (const id of ids) {
      const r = porId.get(id)!;
      const perfil = r.user_id ? perfilPorId.get(r.user_id) : null;

      let motivo: Motivo | null = null;
      let plantilla: Plantilla | null = null;
      if (r.status === "cancelled") motivo = "cancelada";
      else if (r.payment_status === "refunded") motivo = "reembolsada";
      else if (r.payment_status === "pending") motivo = "pendiente_de_pago";
      else if (tipo === "comprobante" && r.source === "external" && !incluirExternas) motivo = "importada_de_uno_es";
      else if (r.payment_status === "paid") plantilla = "pagada";
      // La gratuita dice "Confirmada": solo si lo está (el organizador puede
      // haberla dejado pendiente, p. ej. mientras revisa una licencia)
      else if (r.payment_status === "not_required" && r.status !== "confirmed") motivo = "pendiente_de_confirmar";
      else if (r.payment_status === "not_required") plantilla = "gratuita";
      else motivo = "estado_desconocido";

      // "Tu dorsal" y "Track" necesitan el dorsal puesto; Track, además, el
      // GPS activo en el recorrido y el token de activación de ese dorsal
      if (!motivo && tipo !== "comprobante" && r.bib_number == null) motivo = "sin_dorsal";
      if (!motivo && tipo === "track") {
        if (!gpsEnRecorrido.get(r.race_distance_id)) motivo = "sin_gps_en_recorrido";
        else if (!activacionPorDorsal.has(`${r.race_distance_id}|${String(r.bib_number).trim()}`)) motivo = "sin_dorsal_gps";
      }

      const email = (
        (r.email ?? "").trim() ||
        (r.user_id ? emailCuenta.get(r.user_id) : "") ||
        (perfil?.email ?? "").trim()
      ).toLowerCase();

      if (!motivo && !EMAIL.test(email)) motivo = "sin_email";

      if (motivo || !plantilla) {
        resultados.push({ registrationId: id, resultado: "omitido", motivo: motivo ?? "estado_desconocido" });
        continue;
      }
      if (dryRun) {
        resultados.push({ registrationId: id, resultado: "se_enviaria", plantilla, email });
        continue;
      }

      const carrera = carreraPorId.get(r.race_id);
      const nombre =
        [r.first_name, r.last_name].map((x: string | null) => (x ?? "").trim()).filter(Boolean).join(" ") ||
        [perfil?.first_name, perfil?.last_name].map((x: string | null) => (x ?? "").trim()).filter(Boolean).join(" ") ||
        null;
      const pago = pagoIndividual.get(id) ?? pagoEquipo.get(id) ?? null;
      const importe = pago?.amount ?? (r.importe_manual != null ? Number(r.importe_manual) : null);

      const datos: Datos = {
        plantilla,
        tipo,
        mensaje: mensaje || null,
        activacionUrl: activacionPorDorsal.get(`${r.race_distance_id}|${String(r.bib_number ?? "").trim()}`) ?? null,
        nombre,
        carrera: carrera?.name ?? "Carrera",
        fecha: carrera?.date ?? null,
        lugar: carrera?.location ?? null,
        recorrido: nombreDistancia.get(r.race_distance_id) ?? null,
        dorsal: r.bib_number ?? null,
        importe: importe != null && Number.isFinite(importe) ? importe : null,
        referencia: pago?.order ?? null,
        miDorsalUrl: r.token_inscripcion ? `${SITE_URL}/mi-dorsal/${r.token_inscripcion}` : null,
        respuestas: [
          // Lo que el panel mantiene al día, de las columnas de la inscripción
          ...[
            { label: "Documento", value: r.dni_passport },
            { label: "Club", value: r.club },
            { label: "Talla de camiseta", value: r.tshirt_size },
          ]
            .map(({ label, value }) => ({ label, value: String(value ?? "").trim() }))
            .filter((x) => x.value),
          // Y las preguntas propias de la carrera
          ...(respuestasPorInscripcion.get(id) ?? [])
            .sort((a, b) => a.order - b.order)
            .map(({ label, value }) => ({ label, value })),
        ],
      };

      if (!primerEnvio) await dormir(PAUSA_MS);
      primerEnvio = false;

      const mandar = () =>
        resend!.emails.send({
          from: "Camberas <noreply@camberas.com>",
          to: [email],
          subject: asunto(datos),
          html: cuerpoPorTipo(datos),
        });

      try {
        let { error } = await mandar();
        // Límite de Resend: un reintento tras una pausa larga
        if (error && ((error as any).statusCode === 429 || (error as any).name === "rate_limit_exceeded")) {
          await dormir(1500);
          ({ error } = await mandar());
        }
        if (error) throw new Error((error as any).message ?? String(error));
        resultados.push({ registrationId: id, resultado: "enviado", plantilla, email });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`reenviar-comprobantes: fallo con ${id}: ${msg}`);
        resultados.push({ registrationId: id, resultado: "fallido", plantilla, email, error: msg });
      }
    }

    const cuenta = (t: Resultado["resultado"]) => resultados.filter((x) => x.resultado === t).length;
    const resumen = {
      ensayo: dryRun,
      total: resultados.length,
      enviados: cuenta("enviado"),
      se_enviarian: cuenta("se_enviaria"),
      omitidos: cuenta("omitido"),
      fallidos: cuenta("fallido"),
      resultados,
    };
    console.log(
      `reenviar-comprobantes${dryRun ? " [ENSAYO]" : ""} por ${uid}: ` +
        `${resumen.enviados || resumen.se_enviarian} de ${resumen.total}, ${resumen.omitidos} omitidos, ${resumen.fallidos} fallidos`,
    );
    return json(resumen);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("reenviar-comprobantes:", msg);
    return json({ error: msg }, 500);
  }
});
