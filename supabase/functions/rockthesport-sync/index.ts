// Sincroniza los inscritos de un evento de RockTheSport con una carrera de
// Camberas. Mismo patrón que eventbooking-sync:
//   - external_id = 'rts-<idInscripcionLinea>' → repetir nunca duplica
//   - source = 'external'
//   - tarifa → recorrido EXPLÍCITO (rockthesport_sync.tarifa_map), y solo a
//     recorridos de ESTA carrera; una tarifa sin mapear se reporta y esa
//     fila no entra (no se deduce)
//   - solo entran las inscripciones terminadas (pagadas o gratuitas); una
//     ya importada que luego se anula pasa a cancelada. Una que se canceló
//     en Camberas no la reactiva la sincronización (se avisa)
//   - dorsal al dar de alta si el recorrido numera solo (assign_next_bib)
//   - el robot no toca carreras de hoy o pasadas (el botón sí puede)
//
// Relevos: RockTheSport da una fila de EQUIPO (grupal = 1, sin persona) y
// sus deportistas enlazados por idInscripcionLineaGrupo. En Camberas entra
// UNA inscripción por pareja, con un solo dorsal (decisión del usuario,
// 10-oct-2026): nombre = primer apellido del 1.º relevista, apellidos =
// primer apellido del 2.º (1.º = el primero que se apuntó, idInscripcionLinea
// más bajo; los anulados no cuentan), team = nombre del equipo.
//
// API: CustomerService V1 (customerservicesv2.rockthesport.com), Bearer.
// El token es por organización y vive en el Vault (rockthesport_sync.token_secreto),
// se lee con rockthesport_token(); de reserva, el secreto ROCKTHESPORT_TOKEN.
//
// Quién la llama: el robot horario (x-cron-key = 'rockthesport_cron_key' del
// Vault), que sincroniza las carreras activas aún por celebrar; o un admin u
// organizador de la carrera con su sesión (botón del panel), solo esa carrera.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

const API = "https://customerservicesv2.rockthesport.com";
// La API devuelve como mucho 50 filas por página
const PAGINA = 50;
// Tope de páginas por evento (5.000 inscritos): un bucle sin fin no debe
// poder dejar la función colgada
const MAX_PAGINAS = 100;
// PostgREST corta en 1.000 filas: las lecturas de Camberas van por páginas
const PAGINA_DB = 1000;
// Una pasada que se quedó colgada libera el turno a los 5 minutos
const TURNO_MS = 5 * 60_000;

// Estados OFICIALES vistos en la API (idEstadoCabecera / estadoCabecera).
// Uno que no esté aquí no se adivina: se reporta y la fila no se toca.
const CABECERA_PAGADA = 2; // "Pagado TPV"
const CABECERA_GRATUITA = 4; // "Finalizada gratuita"
const LINEA_INSCRITO = 0; // estadoLinea "Inscrito"
const RE_ANULADA = /anul|baja|cancel|devol/;

// RockTheSport: genero 1 = Male, 2 = Female (ficha de la inscripción).
// En Camberas genders: 1 Masculino, 2 Femenino, 3 Mixto.
const GENERO: Record<number, { gender: string; gender_id: number }> = {
  1: { gender: "Masculino", gender_id: 1 },
  2: { gender: "Femenino", gender_id: 2 },
};

// Campos que la sincronización mantiene alineados con RockTheSport. El
// dorsal queda fuera: se da una vez y no se toca. Club y equipo, aparte:
// solo se escriben si vienen con valor (un vacío o un fallo al leer el
// nombre del equipo nunca borra lo que hay).
const CAMPOS_SYNC = [
  "first_name", "last_name", "email", "phone", "dni_passport", "gender", "gender_id",
  "birth_date", "address", "city", "province", "country",
  "race_distance_id", "status", "payment_status",
] as const;
// Si cambia alguno de estos, la categoría se vuelve a calcular
const CAMPOS_CATEGORIA = ["birth_date", "gender", "gender_id"];

interface FilaRts {
  idEvento: number | null;
  fechaCreacion: string | null;
  idEstadoCabecera: number | null;
  estadoCabecera: string | null;
  idInscripcionCabecera: number | null;
  idEstadoLinea: number | null;
  estadoLinea: string | null;
  idInscripcionLinea: number | null;
  idTarifa: number | null;
  nombreTarifa: string | null;
  nombre: string | null;
  apellidos: string | null;
  genero: number | null;
  fechaNacimiento: string | null;
  documento: string | null;
  email: string | null;
  telefono: string | null;
  movil: string | null;
  direccion: string | null;
  poblacion: string | null;
  nombrePais: string | null;
  nombreProvincia: string | null;
  inscripcionFinalizado: number | null;
  club: string | null;
  locator: string | null;
  grupal: number | null;
  idInscripcionLineaGrupo: number | null;
}

type Estado = { status: string; payment_status: string } | "anulada" | "sin_terminar" | null;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// "2012-06-06T00:00:00" → "2012-06-06"
const fecha = (v: string | null): string | null => {
  const m = (v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m && m[1] !== "0001" && m[1] !== "1800" ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// fechaCreacion llega sin zona. Se toma como UTC: el primer inscrito del
// Alto Campoo figura a las 19:13 y las inscripciones abrían a las 20:00 de
// Madrid, que son las 18:00 UTC; en hora de Madrid sería antes de abrir.
const instante = (v: string | null): string | null => {
  if (!v) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : v + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// Hoy en Madrid (las fechas de carrera son días de pared)
const hoyMadrid = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

// Primer apellido, respetando partículas: "de la Fuente Gómez" → "de la Fuente"
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "san", "santa", "da", "das", "do", "dos", "van", "von"]);
const primerApellido = (apellidos: string | null): string | null => {
  const palabras = (apellidos ?? "").trim().split(/\s+/).filter(Boolean);
  const salida: string[] = [];
  for (const p of palabras) {
    salida.push(p);
    if (!PARTICULAS.has(p.toLowerCase())) break;
  }
  return salida.length ? salida.join(" ") : null;
};

const dniNorm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Fecha de caducidad del token (exp del JWT), para avisar con tiempo
const caducidadToken = (token: string): Date | null => {
  try {
    const cuerpo = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = JSON.parse(atob(cuerpo.padEnd(cuerpo.length + ((4 - (cuerpo.length % 4)) % 4), "="))).exp;
    return typeof exp === "number" ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
};

// Estado de una fila según la API. null = no se sabe → no se toca
const estadoDe = (f: FilaRts): Estado => {
  const linea = num(f.idEstadoLinea);
  const textoLinea = (f.estadoLinea ?? "").toLowerCase();
  if (RE_ANULADA.test(textoLinea)) return "anulada";
  if (linea !== LINEA_INSCRITO) return null;
  if (num(f.inscripcionFinalizado) !== 1) return "sin_terminar";
  const cab = num(f.idEstadoCabecera);
  if (cab === CABECERA_PAGADA) return { status: "confirmed", payment_status: "paid" };
  if (cab === CABECERA_GRATUITA) return { status: "confirmed", payment_status: "not_required" };
  return null;
};

class ErrorApi extends Error {}

async function api(token: string, metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
  const resp = await fetch(API + ruta, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(25_000),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new ErrorApi("RockTheSport rechazó el token (caducado, revocado o sin permiso sobre el evento)");
  }
  if (resp.status === 204) return null;
  if (!resp.ok) throw new ErrorApi(`RockTheSport respondió ${resp.status} en ${ruta}`);
  const texto = await resp.text();
  return texto ? JSON.parse(texto) : null;
}

// Lee todas las filas de una consulta de Camberas por páginas de 1.000
// deno-lint-ignore no-explicit-any
async function todas(consulta: () => any, nombre: string): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += PAGINA_DB) {
    const { data, error } = await consulta().range(desde, desde + PAGINA_DB - 1);
    if (error) throw new Error(`${nombre}: ${error.message}`);
    const pagina = (data ?? []) as Record<string, unknown>[];
    filas.push(...pagina);
    if (pagina.length < PAGINA_DB) return filas;
  }
}

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

    // Rama robot: carreras con configuración activa y aún por celebrar
    const cronKey = req.headers.get("x-cron-key");
    if (cronKey) {
      const { data: valida, error: errClave } = await service.rpc("clave_cron_valida", {
        p_nombre: "rockthesport_cron_key",
        p_clave: cronKey,
      });
      if (errClave) console.error("rockthesport-sync clave_cron_valida:", errClave.message);
      if (valida !== true) return json({ error: "Clave de cron incorrecta o sin configurar" }, 403);

      const { data: cfgs } = await service
        .from("rockthesport_sync")
        .select("*, races!inner(date)")
        .eq("enabled", true)
        .gt("races.date", hoyMadrid());
      const carreras: Record<string, unknown> = {};
      for (const cfg of (cfgs ?? []) as Record<string, unknown>[]) {
        carreras[String(cfg.race_id)] = await sincronizarCarrera(service, cfg);
      }
      return json({ carreras });
    }

    // Rama botón: una carrera, con la sesión de un admin o de su organizador
    const { race_id } = await req.json().catch(() => ({} as Record<string, unknown>));
    if (!race_id) return json({ error: "Falta race_id" }, 400);

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await service.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);
    const uid = userData.user.id;

    const [{ data: roles }, { data: race }] = await Promise.all([
      service.from("user_roles").select("role").eq("user_id", uid),
      service.from("races").select("id, organizer_id").eq("id", race_id).maybeSingle(),
    ]);
    const esAdmin = ((roles ?? []) as { role: string }[]).some((r: { role: string }) => r.role === "admin");
    if (!race || (!esAdmin && race.organizer_id !== uid)) {
      return json({ error: "Sin permiso sobre esta carrera" }, 403);
    }

    const { data: cfg } = await service.from("rockthesport_sync").select("*").eq("race_id", race_id).maybeSingle();
    if (!cfg || !cfg.enabled) {
      return json({ error: "Esta carrera no tiene sincronización con RockTheSport configurada" }, 404);
    }
    return json(await sincronizarCarrera(service, cfg as Record<string, unknown>));
  } catch (e) {
    console.error("rockthesport-sync:", e);
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function sincronizarCarrera(service: any, cfg: Record<string, unknown>): Promise<Record<string, unknown>> {
  const race_id = String(cfg.race_id);
  const eventId = Number(cfg.event_id);

  // Un turno por carrera: el robot y el botón no corren a la vez (se
  // pisarían los dorsales)
  const limite = new Date(Date.now() - TURNO_MS).toISOString();
  const { data: turno, error: errTurno } = await service
    .from("rockthesport_sync")
    .update({ en_curso: new Date().toISOString() })
    .eq("race_id", race_id)
    .or(`en_curso.is.null,en_curso.lt."${limite}"`)
    .select("race_id");
  if (errTurno) return { error: `No se pudo tomar el turno: ${errTurno.message}` };
  if (!turno || (turno as unknown[]).length === 0) {
    return { error: "Ya hay una sincronización de esta carrera en curso; prueba en un minuto" };
  }

  const cerrar = async (resultado: Record<string, unknown>) => {
    await service.from("rockthesport_sync")
      .update({ last_sync_at: new Date().toISOString(), last_result: resultado, en_curso: null })
      .eq("race_id", race_id);
    return resultado;
  };

  try {
    // ── El token ──────────────────────────────────────────────────────────
    const { data: tokenVault, error: errToken } = await service.rpc("rockthesport_token", {
      p_nombre: String(cfg.token_secreto ?? "rockthesport_token"),
    });
    if (errToken) console.error("rockthesport_token:", errToken.message);
    const token = (typeof tokenVault === "string" && tokenVault) || Deno.env.get("ROCKTHESPORT_TOKEN") || "";
    if (!token) return await cerrar({ error: `Falta el token de RockTheSport (secreto ${cfg.token_secreto} del Vault)` });

    const avisos: string[] = [];
    const caduca = caducidadToken(token);
    if (caduca && caduca.getTime() - Date.now() < 7 * 86400_000) {
      avisos.push(`El token de RockTheSport caduca el ${caduca.toISOString().slice(0, 10)}: pide uno nuevo`);
    }

    // ── Los recorridos de esta carrera y el mapa de tarifas ───────────────
    const { data: distancias, error: errDist } = await service
      .from("race_distances")
      .select("id, name, bib_start")
      .eq("race_id", race_id);
    if (errDist) throw new Error(`race_distances: ${errDist.message}`);
    const recorridos = new Map<string, { name: string; bib_start: number | null }>(
      ((distancias ?? []) as { id: string; name: string; bib_start: number | null }[])
        .map((d: { id: string; name: string; bib_start: number | null }) => [d.id.toLowerCase(), { name: d.name, bib_start: d.bib_start }]),
    );
    const mapaTarifas = new Map<string, string>();
    const errores: string[] = [];
    for (const [tarifa, recorrido] of Object.entries((cfg.tarifa_map ?? {}) as Record<string, unknown>)) {
      const id = String(recorrido ?? "").toLowerCase();
      if (recorridos.has(id)) mapaTarifas.set(String(tarifa), id);
      else errores.push(`tarifa_map: la tarifa ${tarifa} apunta a «${recorrido}», que no es un recorrido de esta carrera`);
    }

    // ── Todos los inscritos del evento, también los anulados ──────────────
    const filas: FilaRts[] = [];
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const desde = pagina * PAGINA + 1;
      const lote = await api(token, "POST", "/v1/es/es/registration/list", {
        eventId,
        from: desde,
        to: desde + PAGINA - 1,
        incluirAnulados: true,
      });
      const filasLote = (Array.isArray(lote) ? lote : []) as FilaRts[];
      filas.push(...filasLote);
      if (filasLote.length < PAGINA) break;
      if (pagina === MAX_PAGINAS - 1) avisos.push(`Más de ${MAX_PAGINAS * PAGINA} filas: solo se han leído las primeras`);
    }

    // ── Equipos de relevos y sus deportistas ──────────────────────────────
    const equipos = filas.filter((f: FilaRts) => num(f.grupal) === 1);
    const miembrosDe = new Map<number, FilaRts[]>();
    for (const f of filas) {
      const grupo = num(f.idInscripcionLineaGrupo);
      if (grupo !== null && grupo > 0 && num(f.grupal) !== 1) {
        miembrosDe.set(grupo, [...(miembrosDe.get(grupo) ?? []), f]);
      }
    }
    const individuales = filas.filter((f: FilaRts) => {
      const grupo = num(f.idInscripcionLineaGrupo);
      return num(f.grupal) !== 1 && !(grupo !== null && grupo > 0);
    });

    // ── Lo que ya hay en Camberas de esta carrera (por páginas) ──────────
    const existentes = await todas(
      () => service.from("registrations")
        .select("id, external_id, club, team, " + CAMPOS_SYNC.join(", "))
        .eq("race_id", race_id)
        .like("external_id", "rts-%")
        .order("id", { ascending: true }),
      "registrations",
    );
    const porExternalId = new Map<string, Record<string, unknown>>(
      existentes.map((r: Record<string, unknown>) => [String(r.external_id), r]),
    );

    // Nacidas en Camberas: para avisar si alguien se apunta en las dos
    const nativas = await todas(
      () => service.from("registrations")
        .select("id, dni_passport, email")
        .eq("race_id", race_id)
        .is("external_id", null)
        .neq("status", "cancelled")
        .order("id", { ascending: true }),
      "registrations nativas",
    );
    const dnisCamberas = new Set(nativas.map((r: Record<string, unknown>) => dniNorm(r.dni_passport as string | null)).filter(Boolean));
    const emailsCamberas = new Set(
      nativas.map((r: Record<string, unknown>) => String(r.email ?? "").toLowerCase().trim()).filter(Boolean),
    );

    let nuevos = 0, actualizados = 0, sinCambios = 0, omitidos = 0, cancelados = 0;
    const inserciones: Record<string, unknown>[] = [];

    const procesar = async (
      externalId: string,
      etiqueta: string,
      f: FilaRts,
      deseadoBase: Record<string, unknown>,
      club: string | null,
      team: string | null,
    ) => {
      const distanceId = mapaTarifas.get(String(num(f.idTarifa)));
      if (!distanceId) {
        errores.push(`${etiqueta}: tarifa "${f.nombreTarifa ?? f.idTarifa}" (${f.idTarifa}) sin recorrido asignado`);
        return;
      }
      const existente = porExternalId.get(externalId);
      const estado = estadoDe(f);

      if (estado === null) {
        errores.push(`${etiqueta}: estado no reconocido (cabecera ${f.idEstadoCabecera} «${f.estadoCabecera}», línea ${f.idEstadoLinea} «${f.estadoLinea}») — no se toca`);
        return;
      }
      if (estado === "sin_terminar") {
        omitidos++;
        return;
      }
      if (estado === "anulada") {
        if (existente && existente.status !== "cancelled") {
          const { error } = await service.from("registrations").update({ status: "cancelled" }).eq("id", existente.id);
          if (error) errores.push(`${etiqueta}: ${error.message}`);
          else cancelados++;
        } else {
          omitidos++;
        }
        return;
      }

      const deseado: Record<string, unknown> = { ...deseadoBase, race_distance_id: distanceId, ...estado };
      if (!existente) {
        const dni = dniNorm(deseado.dni_passport as string | null);
        const email = String(deseado.email ?? "").toLowerCase().trim();
        if ((dni && dnisCamberas.has(dni)) || (email && emailsCamberas.has(email))) {
          avisos.push(`${etiqueta}: también inscrito en Camberas (mismo ${dni && dnisCamberas.has(dni) ? "DNI" : "email"}) — revisar duplicado`);
        }
        inserciones.push({
          ...deseado,
          club,
          team,
          race_id,
          external_id: externalId,
          source: "external",
          // Sin fecha de RockTheSport, la de ahora (created_at no admite NULL)
          created_at: instante(f.fechaCreacion) ?? new Date().toISOString(),
        });
        nuevos++;
        return;
      }

      // Cancelada en Camberas y activa en RockTheSport: no se reactiva
      const comparar: readonly string[] = existente.status === "cancelled"
        ? CAMPOS_SYNC.filter((c: string) => c !== "status" && c !== "payment_status")
        : CAMPOS_SYNC;
      if (existente.status === "cancelled") {
        avisos.push(`${etiqueta}: cancelada en Camberas pero activa en RockTheSport — no se reactiva`);
      }
      const cambios: Record<string, unknown> = {};
      for (const c of comparar) {
        if ((existente[c] ?? null) !== (deseado[c] ?? null)) cambios[c] = deseado[c] ?? null;
      }
      if (club && (existente.club ?? null) !== club) cambios.club = club;
      if (team && (existente.team ?? null) !== team) cambios.team = team;
      // Fecha de nacimiento o sexo nuevos: la categoría se recalcula (el
      // trigger salta con race_distance_id en el SET y la categoría a NULL)
      if (CAMPOS_CATEGORIA.some((c: string) => c in cambios)) {
        cambios.race_distance_id = deseado.race_distance_id;
        cambios.race_category_id = null;
      }
      if (Object.keys(cambios).length === 0) {
        sinCambios++;
        return;
      }
      const { error } = await service.from("registrations").update(cambios).eq("id", existente.id);
      if (error) errores.push(`${etiqueta}: ${error.message}`);
      else actualizados++;
    };

    // ── Individuales ──────────────────────────────────────────────────────
    for (const f of individuales) {
      const idLinea = num(f.idInscripcionLinea);
      if (idLinea === null) {
        errores.push("Fila sin idInscripcionLinea — no se puede importar");
        continue;
      }
      const genero = GENERO[num(f.genero) ?? 0];
      const etiqueta = `${txt(f.nombre) ?? ""} ${txt(f.apellidos) ?? ""}`.trim() || `RTS #${idLinea}`;
      await procesar(`rts-${idLinea}`, etiqueta, f, {
        first_name: txt(f.nombre),
        last_name: txt(f.apellidos),
        email: txt(f.email)?.toLowerCase() ?? null,
        phone: txt(f.movil) ?? txt(f.telefono),
        dni_passport: txt(f.documento)?.toUpperCase() ?? null,
        gender: genero?.gender ?? null,
        gender_id: genero?.gender_id ?? null,
        birth_date: fecha(f.fechaNacimiento),
        address: txt(f.direccion),
        city: txt(f.poblacion),
        province: txt(f.nombreProvincia),
        country: txt(f.nombrePais),
      }, txt(f.club), null);
    }

    // ── Relevos: una inscripción por pareja ───────────────────────────────
    for (const eq of equipos) {
      const idEquipo = num(eq.idInscripcionLinea);
      if (idEquipo === null) {
        errores.push("Equipo sin idInscripcionLinea — no se puede importar");
        continue;
      }
      const externalId = `rts-${idEquipo}`;
      const existente = porExternalId.get(externalId);

      // Los relevistas que cuentan: inscritos y terminados (los anulados o
      // a medias no dan nombre a la pareja)
      const miembros = (miembrosDe.get(idEquipo) ?? [])
        .filter((m: FilaRts) => {
          const e = estadoDe(m);
          return e !== null && e !== "anulada" && e !== "sin_terminar";
        })
        .sort((a: FilaRts, b: FilaRts) => (num(a.idInscripcionLinea) ?? 0) - (num(b.idInscripcionLinea) ?? 0));
      const [m1, m2] = miembros;

      // El nombre del equipo solo viene en la ficha: se pide si es nuevo o
      // si aún no lo tiene. Un fallo no borra nada (team solo se escribe
      // con valor)
      let nombreEquipo: string | null = null;
      if (!existente || !existente.team) {
        if (!eq.locator) {
          avisos.push(`Equipo RTS #${idEquipo}: sin localizador, no se puede leer su nombre`);
        } else {
          try {
            const ficha = await api(token, "GET", `/v1/es/es/registration/questions/${eventId}/${encodeURIComponent(eq.locator)}`);
            const d = (Array.isArray(ficha) ? ficha[0] : ficha) as Record<string, unknown> | null | undefined;
            const std = ((d?.formData as Record<string, unknown> | undefined)?.standardQuestion ?? {}) as Record<string, unknown>;
            nombreEquipo = txt(std.groupName);
            if (!nombreEquipo) avisos.push(`Equipo RTS #${idEquipo}: la ficha no trae nombre de equipo`);
          } catch (e) {
            if (e instanceof ErrorApi && /token/.test(e.message)) throw e;
            avisos.push(`Equipo RTS #${idEquipo}: no se pudo leer su nombre (${e instanceof Error ? e.message : "error"})`);
          }
        }
      }
      const etiqueta = `Relevo ${nombreEquipo ?? (existente?.team as string | undefined) ?? `RTS #${idEquipo}`}`;
      if (miembros.length !== 2 && estadoDe(eq) !== "anulada") {
        avisos.push(`${etiqueta}: tiene ${miembros.length} deportista(s) inscritos, se esperaban 2`);
      }
      const g1 = num(m1?.genero), g2 = num(m2?.genero);
      const genero = g1 && g2
        ? (g1 === g2 ? GENERO[g1] : { gender: "Mixto", gender_id: 3 })
        : (g1 ? GENERO[g1] : undefined);

      await procesar(externalId, etiqueta, eq, {
        first_name: primerApellido(m1?.apellidos ?? null) ?? txt(m1?.nombre),
        last_name: primerApellido(m2?.apellidos ?? null) ?? txt(m2?.nombre),
        email: txt(m1?.email)?.toLowerCase() ?? txt(m2?.email)?.toLowerCase() ?? null,
        phone: txt(m1?.movil) ?? txt(m1?.telefono) ?? txt(m2?.movil),
        dni_passport: txt(m1?.documento)?.toUpperCase() ?? null,
        gender: genero?.gender ?? null,
        gender_id: genero?.gender_id ?? null,
        birth_date: null,
        address: txt(m1?.direccion),
        city: txt(m1?.poblacion),
        province: txt(m1?.nombreProvincia),
        country: txt(m1?.nombrePais),
      }, txt(m1?.club) ?? txt(m2?.club), nombreEquipo);
    }

    // Deportistas de un equipo que no ha venido en la lista
    for (const [grupo, miembros] of miembrosDe) {
      if (!equipos.some((e: FilaRts) => num(e.idInscripcionLinea) === grupo)) {
        avisos.push(`${miembros.length} deportista(s) de un equipo RTS #${grupo} que no aparece en la lista — no se importan`);
      }
    }

    // ── Altas en lotes de 100 ─────────────────────────────────────────────
    for (let i = 0; i < inserciones.length; i += 100) {
      const lote = inserciones.slice(i, i + 100);
      const { error } = await service.from("registrations").insert(lote);
      if (error) {
        nuevos -= lote.length;
        errores.push(`Lote de altas ${i / 100 + 1}: ${error.message}`);
      }
    }

    // ── Dorsales: los importados sin número, si el recorrido numera solo ──
    // (después de dar de alta: si un alta fallara con el número ya pedido,
    // ese dorsal quedaría quemado)
    const pendientesDorsal = await todas(
      () => service.from("registrations")
        .select("id, race_distance_id, created_at")
        .eq("race_id", race_id)
        .like("external_id", "rts-%")
        .is("bib_number", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      "registrations sin dorsal",
    );

    let dorsales = 0;
    const sinNumeracion = new Set<string>();
    for (const reg of pendientesDorsal as { id: string; race_distance_id: string }[]) {
      if (sinNumeracion.has(reg.race_distance_id)) continue;
      const { data: bib, error } = await service.rpc("assign_next_bib", { p_distance_id: reg.race_distance_id });
      if (error) {
        errores.push(`Al asignar dorsal: ${error.message}`);
        break;
      }
      if (bib === null || bib === undefined) {
        sinNumeracion.add(reg.race_distance_id);
        const rec = recorridos.get(reg.race_distance_id.toLowerCase());
        // Con rango configurado, NULL es que se ha agotado
        if (rec?.bib_start !== null && rec?.bib_start !== undefined) {
          avisos.push(`${rec.name}: no quedan dorsales libres en su rango — hay inscritos sin dorsal`);
        }
        continue;
      }
      const { data: puesto, error: errUpd } = await service
        .from("registrations")
        .update({ bib_number: bib })
        .eq("id", reg.id)
        .is("bib_number", null)
        .select("id");
      if (errUpd) errores.push(`Dorsal ${bib}: ${errUpd.message}`);
      else if (!puesto || (puesto as unknown[]).length === 0) avisos.push(`Dorsal ${bib} sin usar: la inscripción ya tenía número`);
      else dorsales++;
    }

    return await cerrar({
      evento_rts: eventId,
      filas_rts: filas.length,
      individuales: individuales.length,
      equipos_relevos: equipos.length,
      nuevos,
      actualizados,
      sin_cambios: sinCambios,
      cancelados,
      omitidos_sin_terminar: omitidos,
      dorsales_asignados: dorsales,
      avisos,
      errores,
    });
  } catch (e) {
    console.error(`rockthesport-sync carrera ${race_id}:`, e);
    return await cerrar({ error: e instanceof Error ? e.message : "Error inesperado" });
  }
}
