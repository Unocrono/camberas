// Consulta de inscripción: el corredor se busca con su documento y demuestra
// que es él con el email de la inscripción o, si no lo recuerda, con su fecha
// de nacimiento. Si está, ve lo justo (carrera, recorrido, dorsal, estado) y
// puede pedirse una copia por email. Dos puertas:
//   - con `carrera` (ficha, web propia, widget): solo en esa carrera
//   - sin `carrera` (camberas.com/mi-inscripcion): en todas las carreras
//     visibles de hace un mes en adelante, sin tener que buscar la carrera
//
// La lista de inscritos NO se publica, y esto no debe convertirse en una:
//  - Sin el segundo dato (email o nacimiento) no se busca nada.
//  - Se enseña solo nombre, carrera, recorrido, dorsal y estado. Ni DNI, ni
//    fecha de nacimiento, ni teléfono, ni el email completo (va enmascarado).
//  - La copia va SIEMPRE al email de la inscripción, nunca a uno tecleado aquí.
//  - Límites atómicos (reservar_consulta_inscripcion, con cerrojo): la
//    búsqueda o el envío se reservan ANTES de hacerse, así una ráfaga de
//    peticiones simultáneas no se los salta. Sin datos en claro: huellas.
//
// El correo lo monta y lo manda reenviar-comprobantes (plantilla
// copia_inscripcion, o recordatorio_pago si falta pagar), llamada con la
// clave de servicio: un solo sitio para el diseño y las reglas del envío.
//
// Acciones (carrera = races.id o slug, opcional):
//   { accion: "buscar", carrera?, dni, email? | nacimiento? }
//   { accion: "enviar", carrera?, dni, email? | nacimiento?, inscripcion }
// "enviar" vuelve a comprobar los datos: el id solo no vale para nada.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Estado =
  | "pagada"
  | "confirmada"
  | "pendiente_confirmar"
  | "confirmada_sin_pago"
  | "pendiente_pago"
  | "cancelada"
  | "devuelta";

interface Fila {
  id: string;
  race_id: string;
  carrera: string;
  fecha: string;
  slug: string | null;
  race_distance_id: string;
  recorrido: string | null;
  first_name: string | null;
  last_name: string | null;
  bib_number: number | null;
  status: string;
  payment_status: string;
  source: string | null;
  team_id: string | null;
  email_destino: string | null;
  ya_dentro: boolean | null;
  created_at: string;
}

interface Item {
  id: string;
  /** La carrera: la página de todas las carreras la necesita para cada una */
  raceId: string;
  carrera: string;
  fecha: string;
  slug: string | null;
  nombre: string | null;
  recorrido: string | null;
  dorsal: number | null;
  estado: Estado;
  /** Qué puede pedirse: la copia, el enlace para pagar, o nada */
  accion: "copia" | "pago" | null;
  /** A dónde iría (enmascarado) */
  email: string | null;
  /** Por qué no hay botón, en palabras del corredor */
  aviso: string | null;
}

/** m•••s@hotmail.es: lo justo para reconocer el suyo */
function enmascarar(email: string | null): string | null {
  if (!email || !EMAIL.test(email)) return null;
  const [local, dominio] = email.split("@");
  const visible = local.length <= 2 ? `${local.slice(0, 1)}•••` : `${local.slice(0, 1)}•••${local.slice(-1)}`;
  return `${visible}@${dominio}`;
}

async function huella(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(`consulta-inscripcion|${texto}`);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash)).map((b: number) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * La misma regla que documento_consulta() en SQL: mayúsculas, solo letras y
 * cifras, sin ceros delante y sin la letra de control del DNI/NIE. La huella
 * del límite sale de aquí: cambiar la letra o el formato no da cupo nuevo.
 */
const normalizarDocumento = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "").replace(/^([XYZ]?\d{6,8})[A-Z]$/, "$1");

/**
 * La IP del corredor, de una cabecera que no pueda poner él. Cloudflare
 * (delante de Supabase) pone cf-connecting-ip y sobrescribe la que mande el
 * cliente; en X-Forwarded-For el cliente puede meter lo que quiera al
 * PRINCIPIO, así que de ahí solo vale el último. En IPv6 cuenta el /64 (una
 * conexión doméstica tiene millones de direcciones dentro).
 */
function ipDe(req: Request): string | null {
  const directa = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "").trim();
  const reenviada = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
  const ip = directa || reenviada[reenviada.length - 1] || "";
  if (!ip) return null;
  if (!ip.includes(":")) return ip;
  // IPv6: se expande "::" y se quedan los cuatro primeros grupos
  const [izq, der] = ip.split("::");
  const a = izq ? izq.split(":") : [];
  const b = der !== undefined && der !== "" ? der.split(":") : [];
  const grupos = der !== undefined ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return `${grupos.slice(0, 4).map((g: string) => (g || "0").toLowerCase()).join(":")}::/64`;
}

function estadoDe(f: Fila): Estado {
  if (f.status === "cancelled") return f.payment_status === "refunded" ? "devuelta" : "cancelada";
  if (f.payment_status === "refunded") return "devuelta";
  if (f.payment_status === "paid") return "pagada";
  if (f.payment_status === "not_required") return f.status === "confirmed" ? "confirmada" : "pendiente_confirmar";
  // payment_status pending
  return f.status === "confirmed" ? "confirmada_sin_pago" : "pendiente_pago";
}

function aItem(f: Fila): Item {
  const estado = estadoDe(f);
  let accion: Item["accion"] = null;
  let aviso: string | null = null;
  switch (estado) {
    case "pagada":
    case "confirmada":
      accion = "copia";
      break;
    case "pendiente_pago":
      // El enlace para pagar solo sirve a lo que se paga en la pasarela, no
      // es de equipo (el pago de equipo lo hace el capitán) y no está ya
      // dentro por otra fila. El plazo, las plazas y si se avisó hace poco lo
      // decide reenviar-comprobantes al enviar.
      if (f.ya_dentro) aviso = "Ya tienes otra inscripción completa en esta carrera: este intento de pago no hace falta.";
      else if (f.team_id) aviso = "Es una inscripción de equipo: el pago lo hace quien inscribió al equipo.";
      else if (f.source !== "gateway") aviso = "El pago de esta inscripción se gestiona con la organización.";
      else accion = "pago";
      break;
    case "confirmada_sin_pago":
      aviso = "La organización tiene tu inscripción confirmada; el pago lo gestionas con ella.";
      break;
    case "pendiente_confirmar":
      aviso = "La organización todavía tiene que confirmar tu inscripción.";
      break;
    case "cancelada":
      aviso = "Esta inscripción está cancelada.";
      break;
    case "devuelta":
      aviso = "Esta inscripción está cancelada y su importe, devuelto.";
      break;
  }
  // Sin email válido no hay a dónde mandar nada: fuera el botón
  const destino = enmascarar(f.email_destino);
  if (accion && !destino) {
    aviso = accion === "pago"
      ? "No tenemos un email válido en tu inscripción: pide a la organización el enlace para pagar."
      : "No tenemos un email válido en tu inscripción: pide la copia a la organización.";
    accion = null;
  }
  const nombre = [f.first_name, f.last_name].map((x: string | null) => (x ?? "").trim()).filter(Boolean).join(" ") || null;
  return {
    id: f.id,
    raceId: f.race_id,
    carrera: f.carrera,
    fecha: f.fecha,
    slug: f.slug,
    nombre,
    recorrido: f.recorrido,
    dorsal: f.bib_number,
    estado,
    accion,
    email: destino,
    aviso,
  };
}

/**
 * Qué se enseña de las filas de la persona en UNA carrera. Si está dentro
 * (pagada o confirmada, también pendiente de confirmar), solo eso: los
 * intentos de pago abandonados y las canceladas de antes confunden. Si no, lo
 * último de cada recorrido (el intento pendiente más reciente o, si no hay,
 * la cancelada).
 */
function visiblesDeUnaCarrera(filas: Fila[]): Item[] {
  const items = filas.map(aItem);
  const dentro = items.filter((i: Item) =>
    ["pagada", "confirmada", "pendiente_confirmar", "confirmada_sin_pago"].includes(i.estado)
  );
  if (dentro.length) return dentro;
  const pendientes = items.filter((i: Item) => i.estado === "pendiente_pago");
  const base = pendientes.length ? pendientes : items;
  // filas viene ordenado por created_at: la última de cada recorrido gana
  const porRecorrido = new Map<string, Item>();
  base.forEach((it: Item) => {
    const f = filas.find((x: Fila) => x.id === it.id)!;
    porRecorrido.set(f.race_distance_id, it);
  });
  return [...porRecorrido.values()];
}

/** Lo mismo, carrera a carrera (la búsqueda sin carrera trae varias) */
function visibles(filas: Fila[]): Item[] {
  const porCarrera = new Map<string, Fila[]>();
  for (const f of filas) porCarrera.set(f.race_id, [...(porCarrera.get(f.race_id) ?? []), f]);
  // El orden de llegada ya es por fecha de carrera
  return [...porCarrera.values()].flatMap(visiblesDeUnaCarrera);
}

// Motivos de reenviar-comprobantes → lo que ve el corredor
const MOTIVOS: Record<string, string> = {
  avisada_hace_poco: "Ya te enviamos el enlace para pagar hace poco: mira tu correo, también en la carpeta de spam.",
  inscripciones_cerradas: "Las inscripciones están cerradas: ya no se puede completar el pago.",
  recorrido_completo: "El recorrido está completo: ya no se puede completar el pago.",
  sin_enlace_de_pago: "Ya no se puede completar el pago de esta inscripción (el plazo está cerrado o no quedan plazas): escribe a la organización.",
  ya_inscrita_por_otra_fila: "Ya tienes una inscripción completa en esta carrera.",
  ya_pagada: "Esta inscripción ya está pagada.",
  no_pendiente_de_pago: "Esta inscripción ya no está pendiente de pago.",
  confirmada_sin_pago: "La organización tiene tu inscripción confirmada; el pago lo gestionas con ella.",
  pago_fuera_de_pasarela: "El pago de esta inscripción se gestiona con la organización.",
  de_equipo: "Es una inscripción de equipo: el pago lo hace quien inscribió al equipo.",
  sin_email: "No tenemos un email válido en tu inscripción: escribe a la organización.",
  pendiente_de_confirmar: "La organización todavía tiene que confirmar tu inscripción.",
  pendiente_de_pago: "La inscripción está pendiente de pago.",
  cancelada: "Esta inscripción está cancelada.",
  reembolsada: "Esta inscripción está cancelada y su importe, devuelto.",
};

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
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Qué pide ───────────────────────────────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Petición no válida" }, 400);
    }
    const accion = body.accion === "enviar" ? "enviar" : "buscar";
    const carrera = typeof body.carrera === "string" ? body.carrera.trim().slice(0, 200) : "";
    const dni = normalizarDocumento(typeof body.dni === "string" ? body.dni.slice(0, 40) : "");
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 255) : "";
    const nacimiento = typeof body.nacimiento === "string" ? body.nacimiento.trim() : "";
    const inscripcion = typeof body.inscripcion === "string" ? body.inscripcion.trim() : "";

    if (dni.length < 5) return json({ error: "Escribe tu DNI, NIE o pasaporte completo" }, 400);
    if (!email && !nacimiento) {
      return json({ error: "Escribe el email de tu inscripción o tu fecha de nacimiento" }, 400);
    }
    if (email && !EMAIL.test(email)) return json({ error: "Ese email no parece válido" }, 400);
    if (nacimiento) {
      const f = new Date(`${nacimiento}T12:00:00Z`);
      if (!FECHA.test(nacimiento) || isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== nacimiento ||
          nacimiento < "1900-01-01" || f.getTime() > Date.now()) {
        return json({ error: "Esa fecha de nacimiento no es válida" }, 400);
      }
    }
    if (accion === "enviar" && !UUID.test(inscripcion)) return json({ error: "Falta la inscripción" }, 400);

    // ── La carrera (si se pide una): por id o por slug, y solo si es pública.
    //    Sin carrera se busca en todas las visibles de hace un mes en adelante.
    let race: { id: string; name: string } | null = null;
    if (carrera) {
      const { data, error: errRace } = await (UUID.test(carrera)
        ? service.from("races").select("id, name, is_visible").eq("id", carrera).maybeSingle()
        : service.from("races").select("id, name, is_visible").eq("slug", carrera).maybeSingle());
      if (errRace) throw new Error(`races: ${errRace.message}`);
      if (!data || data.is_visible === false) return json({ error: "No encontramos esa carrera" }, 404);
      race = { id: data.id, name: data.name };
    }

    // ── Huellas para los límites ───────────────────────────────────────────
    const ip = ipDe(req);
    if (!ip) console.warn("consultar-inscripcion: sin cabecera de IP (cf-connecting-ip / x-real-ip / x-forwarded-for)");
    const [claveDni, claveDato, claveIp] = await Promise.all([
      huella(`dni|${dni}`),
      email ? huella(`email|${email}`) : Promise.resolve(null),
      huella(`ip|${ip ?? "sin-ip"}`),
    ]);

    const reservar = async (tipo: "busqueda" | "envio", registrationId: string | null, raceId: string | null) => {
      const { data, error } = await service.rpc("reservar_consulta_inscripcion", {
        p_tipo: tipo,
        p_race_id: raceId,
        p_clave_dni: claveDni,
        p_clave_dato: claveDato,
        p_clave_ip: claveIp,
        p_registration_id: registrationId,
      });
      if (error) throw new Error(`reservar_consulta_inscripcion: ${error.message}`);
      return (data as number | null) ?? null;
    };

    // De vez en cuando, fuera lo de hace más de una semana
    if (Math.random() < 0.05) {
      const haceUnaSemana = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { error } = await service.from("consultas_inscripcion").delete().lt("created_at", haceUnaSemana);
      if (error) console.error("consultar-inscripcion: purga:", error.message);
    }

    // ── La búsqueda, reservada antes (cuenta como fallo hasta que acierta) ─
    const reserva = await reservar("busqueda", null, race?.id ?? null);
    if (reserva == null) {
      return json({ error: "Demasiados intentos sin acierto. Espera una hora y vuelve a probar." }, 429);
    }

    const { data: filas, error: errBusca } = await service.rpc("buscar_inscripcion_consulta", {
      p_race_id: race?.id ?? null,
      p_dni: dni,
      p_email: email || null,
      p_nacimiento: nacimiento || null,
    });
    if (errBusca) throw new Error(`buscar_inscripcion_consulta: ${errBusca.message}`);
    const items = visibles((filas ?? []) as Fila[]);

    if (items.length > 0) {
      const { error } = await service.from("consultas_inscripcion").update({ acierto: true }).eq("id", reserva);
      if (error) console.error("consultar-inscripcion: marcar acierto:", error.message);
    }

    if (accion === "buscar") {
      return json(items.length ? { encontrado: true, inscripciones: items } : { encontrado: false });
    }

    // ── Enviar la copia (o el enlace para pagar) ──────────────────────────
    const item = items.find((i: Item) => i.id === inscripcion);
    if (!item) return json({ error: "No encontramos esa inscripción con esos datos. Vuelve a buscarla." }, 404);
    if (!item.accion) return json({ error: item.aviso ?? "Esta inscripción no tiene copia que enviar." }, 409);

    const reservaEnvio = await reservar("envio", item.id, item.raceId);
    if (reservaEnvio == null) {
      return json({ error: "Hoy ya te hemos enviado varias copias, o hay muchas peticiones ahora mismo. Mira tu correo (también en spam) o inténtalo más tarde." }, 429);
    }
    // Si al final no sale, se devuelve el cupo
    const liberar = async () => {
      const { error } = await service.from("consultas_inscripcion").delete().eq("id", reservaEnvio);
      if (error) console.error("consultar-inscripcion: liberar reserva:", error.message);
    };
    const noSePudo = item.accion === "pago"
      ? "Ahora mismo no podemos enviarte el enlace para pagar. Inténtalo en unos minutos o escribe a la organización."
      : "No se ha podido enviar ahora mismo. Inténtalo de nuevo en unos minutos.";

    let r: Response;
    try {
      r = await fetch(`${SUPABASE_URL}/functions/v1/reenviar-comprobantes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationIds: [item.id],
          plantilla: item.accion === "pago" ? "recordatorio_pago" : "copia_inscripcion",
          // La pide el propio corredor: también si vino de uno.es
          incluirExternas: true,
        }),
      });
    } catch (e) {
      await liberar();
      throw e;
    }
    const resultado = await r.json().catch(() => null) as
      | { error?: string; resultados?: { resultado: string; motivo?: string; error?: string }[] }
      | null;
    const res = resultado?.resultados?.[0];
    if (!r.ok || !res) {
      await liberar();
      console.error(`consultar-inscripcion: reenviar-comprobantes ${r.status}:`, resultado?.error ?? "sin respuesta");
      return json({ error: noSePudo }, 502);
    }
    if (res.resultado === "enviado") {
      console.log(`consultar-inscripcion: ${item.accion} enviada (${item.id})`);
      return json({ enviado: true, email: item.email, accion: item.accion });
    }
    await liberar();
    if (res.resultado === "omitido") {
      return json({ error: MOTIVOS[res.motivo ?? ""] ?? noSePudo }, 409);
    }
    console.error(`consultar-inscripcion: fallo enviando ${item.id}:`, res.error);
    return json({ error: noSePudo }, 502);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("consultar-inscripcion:", msg);
    return json({ error: "Algo ha fallado. Inténtalo de nuevo en unos minutos." }, 500);
  }
});
