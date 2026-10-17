// Sincroniza los inscritos de uno o varios eventos de EventBooking (uno.es)
// con una carrera de Camberas. El origen es el fichero camberas-sync.php
// subido a la raíz de Joomla, que devuelve los inscritos en JSON protegidos
// por clave. La clave de idempotencia es el ID del inscrito en EventBooking
// (registrations.external_id): repetir la sincronización nunca duplica.
//
// Secretos necesarios en Lovable:
//   EVENTBOOKING_ENDPOINT  p.ej. https://uno.es/camberas-sync.php
//   EVENTBOOKING_KEY       la misma CLAVE_API escrita en el fichero PHP
//
// La configuración por carrera vive en la tabla eventbooking_sync:
//   · event_id + distance_map: UN evento, recorrido por el campo «Modalidad»
//     (ADEMCO);
//   · eventos (jsonb): VARIOS eventos, cada uno con su campo de recorrido,
//     su mapeo, un recorrido por defecto y si es de equipos (Entre Viñedos:
//     1061 carrera y marcha por «Recorrido», 1062 infantil, 1060 equipos).
// Una modalidad sin mapear se reporta como error y esa fila NO se importa:
// el mapeo es explícito, no se deduce.
//
// Equipos (Group Billing de EventBooking): el representante del grupo es un
// inscrito más con is_group_billing = 1 y los miembros llevan group_id = su
// id. El representante NO se importa; cada miembro entra como inscripción
// individual con registrations.team = nombre del equipo (campo «Nombre del
// equipo» del representante o, si no lo hay, su nombre y apellidos). Para
// ello camberas-sync.php debe devolver por inscrito `group_id` e
// `is_group_billing` (columnas de #__eb_registrants); si no vienen, el sync
// lo avisa y trata a todos como individuales.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { formatoPropio, formatoPropioSiEsNombre } from "../_shared/formatoPropio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Busca un campo personalizado por su título visible, tolerando tildes,
// mayúsculas y puntuación ("DNI / Pasaporte" ≈ "dni pasaporte").
function campo(fields: Record<string, string>, ...candidatos: string[]): string | null {
  const mapa = new Map(Object.entries(fields).map(([k, v]) => [normalizar(k), v]));
  for (const c of candidatos) {
    const v = mapa.get(normalizar(c));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

// "13-07-1980" | "13/07/1980" | "1980-07-13" → "1980-07-13"
function fechaISO(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// EventBooking guarda las fechas en hora de Madrid sin zona; para que la
// columna "Fecha y hora" salga bien hay que convertir a UTC respetando
// el horario de verano de la fecha en cuestión.
function madridAUtc(s: string | null): string | null {
  if (!s || s.startsWith("0000")) return null;
  const local = new Date(s.replace(" ", "T") + "Z"); // fingimos UTC
  if (isNaN(local.getTime())) return null;
  const enMadrid = new Date(
    local.toLocaleString("en-US", { timeZone: "Europe/Madrid" }),
  );
  const offsetMs = enMadrid.getTime() - local.getTime();
  return new Date(local.getTime() - offsetMs).toISOString();
}

const GENERO: Record<string, { gender: string; gender_id: number }> = {
  masculino: { gender: "Masculino", gender_id: 1 },
  hombre: { gender: "Masculino", gender_id: 1 },
  m: { gender: "Masculino", gender_id: 1 },
  h: { gender: "Masculino", gender_id: 1 },
  femenino: { gender: "Femenino", gender_id: 2 },
  mujer: { gender: "Femenino", gender_id: 2 },
  f: { gender: "Femenino", gender_id: 2 },
};

// Campos que la sincronización mantiene alineados con EventBooking.
// El dorsal queda fuera a propósito: aquí no se asigna ni se toca.
const CAMPOS_SYNC = [
  "first_name", "last_name", "email", "phone", "dni_passport",
  "gender", "gender_id", "birth_date", "city", "autonomous_community",
  "tshirt_size", "race_distance_id", "status", "payment_status",
] as const;

// Un evento de EventBooking que alimenta la carrera (eventbooking_sync.eventos)
interface EventoEB {
  event_id: number;
  /** Título del campo personalizado con el recorrido («Modalidad» por defecto) */
  campo: string;
  /** valor del campo (normalizado) → race_distance_id */
  mapa: Map<string, string>;
  /** Recorrido si el campo falta o está vacío */
  distance_id: string | null;
  /** Group Billing: saltar al representante y poner el equipo a los miembros */
  grupos: boolean;
  /** Evento ya cerrado en EventBooking: se importa UNA vez desde el botón y el
      robot (cron) no lo vuelve a pedir. Tras importarlo se anota `hecho`. */
  una_vez: boolean;
  /** Fecha de la importación única ya hecha (ISO); vacío si aún no se ha hecho */
  hecho: string | null;
}

function eventosDe(cfg: any): EventoEB[] {
  const aMapa = (m: unknown) =>
    new Map<string, string>(
      Object.entries((m ?? {}) as Record<string, string>).map(([k, v]) => [normalizar(k), v]),
    );
  const lista = Array.isArray(cfg.eventos) ? cfg.eventos : null;
  if (!lista || lista.length === 0) {
    return [{
      event_id: Number(cfg.event_id),
      campo: "Modalidad",
      mapa: aMapa(cfg.distance_map),
      distance_id: null,
      grupos: false,
      una_vez: false,
      hecho: null,
    }];
  }
  return lista
    .filter((e: any) => e && e.event_id)
    .map((e: any) => ({
      event_id: Number(e.event_id),
      campo: String(e.campo ?? "Modalidad"),
      mapa: aMapa(e.distance_map),
      distance_id: e.distance_id ? String(e.distance_id) : null,
      grupos: e.grupos === true,
      una_vez: e.una_vez === true,
      hecho: e.hecho ? String(e.hecho) : null,
    }));
}

// Qué eventos toca pedir en esta pasada: el robot (cron) nunca pide los de
// una sola vez; el botón los pide mientras no estén hechos.
function eventosDeLaPasada(eventos: EventoEB[], modo: "cron" | "boton"): EventoEB[] {
  return eventos.filter((e) => !e.una_vez || (modo === "boton" && !e.hecho));
}

// is_group_billing / group_id tal como los da EventBooking ("1", 1, true…)
const esRepresentante = (r: any): boolean =>
  r.is_group_billing === true || Number(r.is_group_billing) === 1;
const grupoDe = (r: any): string | null => {
  const g = Number(r.group_id);
  return Number.isFinite(g) && g > 0 ? String(g) : null;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rama robot: el cron de la base de datos llama con x-cron-key y
    // sincroniza TODAS las carreras que tengan configuración activa.
    const cronKey = req.headers.get("x-cron-key");
    if (cronKey) {
      const cronSecret = Deno.env.get("EVENTBOOKING_CRON_KEY");
      if (!cronSecret || cronKey !== cronSecret) {
        return json({ error: "Clave de cron incorrecta o sin configurar" }, 403);
      }
      const { data: cfgs } = await service
        .from("eventbooking_sync")
        .select("*")
        .eq("enabled", true);
      const carreras: Record<string, unknown> = {};
      for (const cfg of cfgs ?? []) {
        carreras[cfg.race_id] = await sincronizarCarrera(service, cfg, "cron");
      }
      return json({ carreras });
    }

    // Rama botón: sincroniza una carrera con la sesión del usuario.
    const { race_id } = await req.json().catch(() => ({}));
    if (!race_id) return json({ error: "Falta race_id" }, 400);

    // ¿Quién llama? Solo admin o el organizador de la carrera.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await service.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);
    const uid = userData.user.id;

    const [{ data: roles }, { data: race }] = await Promise.all([
      service.from("user_roles").select("role").eq("user_id", uid),
      service.from("races").select("id, organizer_id").eq("id", race_id).single(),
    ]);
    const esAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!esAdmin && race?.organizer_id !== uid) {
      return json({ error: "Sin permiso sobre esta carrera" }, 403);
    }

    const { data: cfg } = await service
      .from("eventbooking_sync")
      .select("*")
      .eq("race_id", race_id)
      .single();
    if (!cfg || !cfg.enabled) {
      return json({ error: "Esta carrera no tiene sincronización EventBooking configurada" }, 404);
    }

    return json(await sincronizarCarrera(service, cfg, "boton"));
  } catch (e) {
    console.error("eventbooking-sync:", e);
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

// Descarga los inscritos de los eventos de EventBooking asociados a cfg y los
// vuelca en registrations. Devuelve el resumen (nuevos/actualizados/...).
async function sincronizarCarrera(service: any, cfg: any, modo: "cron" | "boton"): Promise<Record<string, unknown>> {
  const race_id = cfg.race_id;
  try {
    const endpoint = Deno.env.get("EVENTBOOKING_ENDPOINT");
    const apiKey = Deno.env.get("EVENTBOOKING_KEY");
    if (!endpoint || !apiKey) {
      return { error: "Faltan los secretos EVENTBOOKING_ENDPOINT / EVENTBOOKING_KEY" };
    }

    const todos = eventosDe(cfg);
    const eventos = eventosDeLaPasada(todos, modo);
    const errores: string[] = [];
    const avisos: string[] = [];
    if (eventos.length === 0) {
      return { error: "Ningún evento que pedir en esta pasada (los de una sola vez ya están importados)" };
    }

    // Inscritos de todos los eventos, cada uno con su configuración
    const filas: { r: any; ev: EventoEB }[] = [];
    const camposEventBooking: Record<number, string[]> = {};
    const pedidosBien = new Set<number>();
    for (const ev of eventos) {
      const resp = await fetch(`${endpoint}?event_id=${ev.event_id}`, {
        headers: { "x-api-key": apiKey },
      });
      if (!resp.ok) {
        errores.push(`uno.es respondió ${resp.status} al pedir los inscritos del evento ${ev.event_id}`);
        continue;
      }
      const origen = await resp.json();
      for (const r of origen.registrants ?? []) filas.push({ r, ev });
      // Títulos de los campos que trae el evento, para ver en last_result cómo
      // se llaman en uno.es cuando un campo no casa
      const titulos = new Set<string>();
      for (const r of origen.registrants ?? []) {
        for (const t of Object.keys(r.fields ?? {})) titulos.add(t);
      }
      camposEventBooking[ev.event_id] = [...titulos];
      pedidosBien.add(ev.event_id);
    }
    if (filas.length === 0 && errores.length > 0) {
      return { error: errores.join(" · ") };
    }

    // Los eventos de una sola vez (cerrados en EventBooking, p. ej. los equipos
    // de Entre Viñedos) quedan anotados como hechos: ni el robot ni el botón
    // los vuelven a pedir. Para repetirlos, borrar `hecho` en eventbooking_sync.
    const unaVezHechos = eventos.filter((e) => e.una_vez && pedidosBien.has(e.event_id));
    if (unaVezHechos.length > 0 && Array.isArray(cfg.eventos)) {
      const ahora = new Date().toISOString();
      const nuevos = cfg.eventos.map((e: any) =>
        unaVezHechos.some((h) => h.event_id === Number(e?.event_id)) ? { ...e, hecho: ahora } : e,
      );
      await service.from("eventbooking_sync").update({ eventos: nuevos }).eq("race_id", race_id);
      avisos.push(`Importación única hecha de los eventos ${unaVezHechos.map((e) => e.event_id).join(", ")}: no se volverán a pedir`);
    }

    // Equipos (Group Billing): representantes por id, para dar nombre al
    // equipo de sus miembros. Si el PHP no manda group_id / is_group_billing,
    // no hay forma de distinguirlos: se avisa y todos entran como individuales.
    const representantes = new Map<string, any>();
    for (const { r, ev } of filas) {
      if (ev.grupos && esRepresentante(r)) representantes.set(String(r.id), r);
    }
    for (const ev of eventos) {
      if (!ev.grupos) continue;
      const delEvento = filas.filter((f) => f.ev === ev);
      const traeGrupos = delEvento.some((f) => "group_id" in f.r || "is_group_billing" in f.r);
      if (delEvento.length > 0 && !traeGrupos) {
        avisos.push(`Evento ${ev.event_id}: camberas-sync.php no devuelve group_id / is_group_billing; los inscritos entran como individuales y sin equipo`);
      }
    }
    const nombreEquipo = (rep: any): string | null => {
      const f: Record<string, string> = rep.fields ?? {};
      const nombre = campo(f, "Nombre del equipo", "Nombre equipo", "Equipo", "Nombre del grupo", "Grupo", "Club");
      if (nombre) return nombre;
      const persona = `${rep.first_name ?? ""} ${rep.last_name ?? ""}`.trim();
      return persona || null;
    };

    // Inscripciones ya sincronizadas de esta carrera. Por páginas: PostgREST
    // corta en 1.000 filas y, sin paginar, a partir de ahí las ya importadas
    // parecerían nuevas y el alta chocaría con el índice único.
    const existentes = await todasLasFilas((desde, hasta) =>
      service
        .from("registrations")
        .select("id, external_id, club, team, " + CAMPOS_SYNC.join(", "))
        .eq("race_id", race_id)
        .not("external_id", "is", null)
        .order("id")
        .range(desde, hasta),
    );
    const porExternalId = new Map(
      existentes.map((r: any) => [String(r.external_id), r]),
    );

    // Campos propios del formulario de cada recorrido (no de sistema y sin
    // columna en registrations, p. ej. «¿Estás empadronado/a o resides en
    // Cenicero?»). Su respuesta va a registration_responses; se casan con el
    // campo de uno.es por el título (ver campoFormularioEnEB).
    const { data: camposForm } = await service
      .from("registration_form_fields")
      .select("id, race_distance_id, field_label, field_options")
      .in("race_distance_id", [
        ...new Set(eventos.flatMap((e) => [...e.mapa.values(), ...(e.distance_id ? [e.distance_id] : [])])),
      ])
      .eq("is_system_field", false)
      .is("profile_field", null);
    const camposPorRecorrido = new Map<string, any[]>();
    for (const f of camposForm ?? []) {
      camposPorRecorrido.set(f.race_distance_id, [...(camposPorRecorrido.get(f.race_distance_id) ?? []), f]);
    }
    // Respuestas que ya tienen las inscripciones importadas: registration_id → field_id → valor
    const respuestasActuales = new Map<string, Map<string, string>>();
    const idsExistentes = existentes.map((r: any) => r.id);
    for (let i = 0; i < idsExistentes.length; i += 100) {
      const { data } = await service
        .from("registration_responses")
        .select("registration_id, field_id, field_value")
        .in("registration_id", idsExistentes.slice(i, i + 100));
      for (const r of data ?? []) {
        if (!respuestasActuales.has(r.registration_id)) respuestasActuales.set(r.registration_id, new Map());
        respuestasActuales.get(r.registration_id)!.set(r.field_id, r.field_value);
      }
    }
    // Respuestas a escribir: para las altas se resuelven por external_id
    // después de insertar; para las existentes, directamente
    const respuestasPorExternalId = new Map<string, { field_id: string; field_value: string }[]>();
    const respuestasExistentes: { registration_id: string; field_id: string; field_value: string }[] = [];
    let respuestasEscritas = 0;

    // Inscripciones nacidas en Camberas (la carrera puede estar abierta en
    // las dos plataformas a la vez): sirven para avisar de posibles
    // duplicados cuando la misma persona se apunta en ambas.
    const { data: nativas } = await service
      .from("registrations")
      .select("dni_passport, email")
      .eq("race_id", race_id)
      .is("external_id", null)
      .neq("status", "cancelled");
    const dniNorm = (s: string | null) =>
      (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const dnisCamberas = new Set(
      (nativas ?? []).map((r: any) => dniNorm(r.dni_passport)).filter(Boolean),
    );
    const emailsCamberas = new Set(
      (nativas ?? []).map((r: any) => (r.email ?? "").toLowerCase().trim()).filter(Boolean),
    );

    let nuevos = 0, actualizados = 0, sinCambios = 0, omitidosPendientes = 0, representantesOmitidos = 0;
    const inserciones: any[] = [];

    for (const { r, ev } of filas) {
      const externalId = String(r.id);
      const fields: Record<string, string> = r.fields ?? {};
      const nombre = (r.first_name ?? campo(fields, "Nombre") ?? "").trim();
      const apellidos = (r.last_name ?? campo(fields, "Apellidos") ?? "").trim();
      const etiqueta = `${nombre} ${apellidos}`.trim() || `EB #${externalId}`;

      // El representante del grupo paga y da nombre al equipo, pero no corre
      if (ev.grupos && esRepresentante(r)) {
        representantesOmitidos++;
        continue;
      }

      const modalidad = campo(fields, ev.campo) ?? "";
      const distanceId = modalidad
        ? mapaRecorrido(ev, modalidad)
        : ev.distance_id;
      if (!distanceId) {
        errores.push(
          modalidad
            ? `${etiqueta}: ${ev.campo.toLowerCase()} "${modalidad}" sin mapear (evento ${ev.event_id})`
            : `${etiqueta}: sin ${ev.campo.toLowerCase()} y el evento ${ev.event_id} no tiene recorrido por defecto`,
        );
        continue;
      }

      // published de EventBooking: 0 pendiente, 1 pagado, 2 cancelado
      const pub = Number(r.published);
      const status = pub === 2 ? "cancelled" : pub === 1 ? "confirmed" : "pending";
      const paymentStatus = pub === 1 ? "paid" : "pending";

      // Los intentos de pago abandonados (published 0) NO se dan de alta:
      // EventBooking guarda cada intento y el mismo corredor aparece dos
      // veces (pendiente + pagado). Pero si un ya-importado cambia luego
      // (p.ej. a cancelado), sí se actualiza más abajo.
      if (pub !== 1 && !porExternalId.has(externalId)) {
        omitidosPendientes++;
        continue;
      }

      const sexo = campo(fields, "Sexo", "Genero", "Género");
      const genero = sexo ? GENERO[normalizar(sexo)] : undefined;

      const deseado: Record<string, unknown> = {
        // Nombres y lugares en formato propio («MARTA» → «Marta»): así llegan
        // iguales de todas las plataformas. Email, DNI, teléfono y talla, tal cual
        first_name: formatoPropio(nombre),
        last_name: formatoPropio(apellidos),
        email: (r.email ?? campo(fields, "Email")) || null,
        phone: (r.phone ?? campo(fields, "Tel. Movil", "Telefono", "Teléfono", "Tel. Móvil")) || null,
        dni_passport: campo(fields, "DNI / Pasaporte", "DNI", "NIF"),
        gender: genero?.gender ?? null,
        gender_id: genero?.gender_id ?? null,
        birth_date: fechaISO(campo(fields, "Fecha de Nacimiento")),
        city: formatoPropio(campo(fields, "Localidad", "Poblacion", "Población", "Ciudad")),
        autonomous_community: formatoPropio(campo(fields, "Com Autonoma", "Comunidad Autonoma", "Com Autónoma")),
        tshirt_size: campo(fields, "Talla camiseta", "Talla"),
        race_distance_id: distanceId,
        status,
        payment_status: paymentStatus,
      };

      // El club es opcional en EventBooking: si viene se sincroniza, pero
      // un valor vacío nunca borra el que el organizador puso a mano.
      // En Entre Viñedos el campo se llama «Club / Equipo»
      const clubEB = formatoPropio(campo(fields, "Club", "Club / Equipo", "Club/Equipo", "Club o Equipo"));

      // Equipo: el del Group Billing al que pertenece el miembro. Igual que
      // el club, solo se escribe cuando hay valor.
      let equipoEB: string | null = null;
      if (ev.grupos) {
        const grupo = grupoDe(r);
        const rep = grupo ? representantes.get(grupo) : undefined;
        if (grupo && !rep) {
          avisos.push(`${etiqueta}: su grupo ${grupo} no está entre los inscritos del evento ${ev.event_id}; entra sin equipo`);
        }
        equipoEB = rep ? formatoPropio(nombreEquipo(rep)) : null;
      }

      // Respuestas a los campos propios del formulario de su recorrido
      const respuestas: { field_id: string; field_value: string }[] = [];
      for (const f of camposPorRecorrido.get(distanceId) ?? []) {
        const valor = campoFormularioEnEB(fields, f.field_label);
        if (valor) {
          // Con opciones, la opción tal cual; texto libre con pinta de nombre
          // (el tutor), en formato propio
          const v = Array.isArray(f.field_options) && f.field_options.length ? valorDeOpcion(valor, f.field_options) : formatoPropioSiEsNombre(valor);
          respuestas.push({ field_id: f.id, field_value: v });
        }
      }

      const existente = porExternalId.get(externalId);
      if (existente) {
        const actuales = respuestasActuales.get(existente.id);
        for (const r of respuestas) {
          if (actuales?.get(r.field_id) !== r.field_value) {
            respuestasExistentes.push({ registration_id: existente.id, ...r });
          }
        }
      } else if (respuestas.length > 0) {
        respuestasPorExternalId.set(externalId, respuestas);
      }
      if (!existente) {
        const dni = dniNorm(deseado.dni_passport as string | null);
        const email = String(deseado.email ?? "").toLowerCase().trim();
        if ((dni && dnisCamberas.has(dni)) || (email && emailsCamberas.has(email))) {
          avisos.push(`${etiqueta}: también inscrito en Camberas (mismo ${dni && dnisCamberas.has(dni) ? "DNI" : "email"}) — revisar duplicado`);
        }
        inserciones.push({
          ...deseado,
          club: clubEB,
          team: equipoEB,
          race_id,
          external_id: externalId,
          source: "external",
          created_at: madridAUtc(r.register_date) ?? undefined,
        });
        nuevos++;
      } else {
        const cambios: Record<string, unknown> = {};
        for (const c of CAMPOS_SYNC) {
          if ((existente[c] ?? null) !== (deseado[c] ?? null)) cambios[c] = deseado[c];
        }
        if (clubEB && (existente.club ?? null) !== clubEB) cambios.club = clubEB;
        if (equipoEB && (existente.team ?? null) !== equipoEB) cambios.team = equipoEB;
        if (Object.keys(cambios).length > 0) {
          const { error } = await service
            .from("registrations")
            .update(cambios)
            .eq("id", existente.id);
          if (error) errores.push(`${etiqueta}: ${error.message}`);
          else actualizados++;
        } else {
          sinCambios++;
        }
      }
    }

    // Altas en lotes de 100 (devuelven su id para colgar las respuestas)
    for (let i = 0; i < inserciones.length; i += 100) {
      const lote = inserciones.slice(i, i + 100);
      const { data: altas, error } = await service.from("registrations").insert(lote).select("id, external_id");
      if (error) {
        nuevos -= lote.length;
        errores.push(`Lote de altas ${i / 100 + 1}: ${error.message}`);
        continue;
      }
      for (const a of altas ?? []) {
        for (const r of respuestasPorExternalId.get(String(a.external_id)) ?? []) {
          respuestasExistentes.push({ registration_id: a.id, ...r });
        }
      }
    }

    // Respuestas del formulario (altas y cambios), en lotes de 500
    for (let i = 0; i < respuestasExistentes.length; i += 500) {
      const lote = respuestasExistentes.slice(i, i + 500);
      const { error } = await service
        .from("registration_responses")
        .upsert(lote, { onConflict: "registration_id,field_id" });
      if (error) errores.push(`Respuestas del formulario: ${error.message}`);
      else respuestasEscritas += lote.length;
    }

    // Dorsales: solo si el recorrido tiene numeracion automatica.
    // assign_next_bib devuelve el siguiente numero cuando hay rango
    // configurado, y NULL cuando no lo hay (o esta agotado), asi que la
    // regla es directa: si la carrera numera sola, el inscrito importado
    // recibe dorsal igual que uno que se apunta en Camberas; si no numera,
    // se queda sin dorsal y ya se asignaran al cerrar inscripciones.
    //
    // Se asigna DESPUES de dar de alta, no antes: si un alta fallara con el
    // numero ya pedido, ese dorsal quedaria quemado y abriria un hueco.
    // Tambien alcanza a los importados en pasadas anteriores que aun no
    // tengan numero, por si el rango se configuro despues.
    //
    // Con cfg.numerar_por_carrera la serie es UNA para toda la carrera:
    // asignar_dorsal_carrera elige el primer numero libre y lo escribe en la
    // misma transaccion (ADEMCO: una sola numeracion para las tres marchas).
    // Sin él, cada recorrido numera en su rango (Entre Viñedos: carrera
    // desde el 11, marcha desde el 1001, infantil desde el 2001).
    const porCarrera = cfg.numerar_por_carrera === true;
    const pendientesDorsal = await todasLasFilas((desde, hasta) =>
      service
        .from("registrations")
        .select("id, race_distance_id")
        .eq("race_id", race_id)
        .not("external_id", "is", null)
        .is("bib_number", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta),
    );

    let dorsales = 0;
    const sinNumeracion = new Set<string>();
    for (const reg of pendientesDorsal ?? []) {
      if (porCarrera) {
        const { data: bib, error } = await service.rpc("asignar_dorsal_carrera", {
          p_registration_id: reg.id,
        });
        if (error) {
          errores.push(`Al asignar dorsal: ${error.message}`);
          break;
        }
        if (bib !== null && bib !== undefined) dorsales++;
        continue;
      }
      if (sinNumeracion.has(reg.race_distance_id)) continue;
      const { data: bib, error } = await service.rpc("assign_next_bib", {
        p_distance_id: reg.race_distance_id,
      });
      if (error) {
        errores.push(`Al asignar dorsal: ${error.message}`);
        break;
      }
      if (bib === null || bib === undefined) {
        // Ese recorrido no numera automaticamente: no insistimos con el resto.
        sinNumeracion.add(reg.race_distance_id);
        continue;
      }
      const { error: errUpd } = await service
        .from("registrations")
        .update({ bib_number: bib })
        .eq("id", reg.id);
      if (errUpd) errores.push(`Dorsal ${bib}: ${errUpd.message}`);
      else dorsales++;
    }

    const resultado = {
      total_eventbooking: filas.length,
      eventos: eventos.map((e) => e.event_id),
      nuevos,
      actualizados,
      sin_cambios: sinCambios,
      omitidos_sin_pagar: omitidosPendientes,
      representantes_omitidos: representantesOmitidos,
      dorsales_asignados: dorsales,
      respuestas_formulario: respuestasEscritas,
      campos_eventbooking: camposEventBooking,
      avisos,
      errores,
    };

    await service
      .from("eventbooking_sync")
      .update({ last_sync_at: new Date().toISOString(), last_result: resultado })
      .eq("race_id", race_id);

    return resultado;
  } catch (e) {
    console.error(`eventbooking-sync carrera ${race_id}:`, e);
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }
}

// Todas las filas de una consulta, pidiéndolas por páginas de 1.000 (el tope
// de PostgREST). La consulta tiene que llevar un orden estable.
async function todasLasFilas(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const todas: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) throw new Error(error.message ?? String(error));
    todas.push(...(data ?? []));
    if (!data || data.length < 1000) return todas;
  }
}

// Valor del campo de uno.es que corresponde a un campo propio del formulario
// de Camberas, casando por el título: igual (sin tildes ni signos) o, si no,
// el que comparte al menos dos palabras de 4+ letras con él («Empadronado o
// residente en Cenicero» ≈ «¿Estás empadronado/a o resides en Cenicero?»).
function campoFormularioEnEB(fields: Record<string, string>, etiqueta: string): string | null {
  const objetivo = normalizar(etiqueta);
  const palabras = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
  const delCampo = new Set(palabras(etiqueta));
  let mejor: { valor: string; aciertos: number } | null = null;
  for (const [titulo, v] of Object.entries(fields)) {
    const valor = String(v ?? "").trim();
    if (!valor) continue;
    if (normalizar(titulo) === objetivo) return valor;
    const aciertos = palabras(titulo).filter((p) => delCampo.has(p)).length;
    if (aciertos >= 2 && (!mejor || aciertos > mejor.aciertos)) mejor = { valor, aciertos };
  }
  return mejor?.valor ?? null;
}

// Si el campo tiene opciones, el valor se escribe como la opción equivalente
// («Si» → «Sí»); si no cuadra con ninguna, tal cual viene.
function valorDeOpcion(valor: string, opciones: unknown): string {
  if (!Array.isArray(opciones)) return valor;
  const igual = opciones.find((o) => normalizar(String(o)) === normalizar(valor));
  return igual !== undefined ? String(igual) : valor;
}

// Recorrido de una modalidad: el mapeo explícito del evento. Sin
// coincidencia, el recorrido por defecto del evento NO vale: una modalidad
// escrita y desconocida es un error que hay que mapear, no adivinar.
function mapaRecorrido(ev: EventoEB, modalidad: string): string | null {
  return ev.mapa.get(normalizar(modalidad)) ?? null;
}
