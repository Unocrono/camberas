/**
 * Importar resultados de RaceTec a Camberas por la API (results.aspx).
 *
 * Sustituye al CSV cuando la carrera se cronometra con RaceTec: el admin
 * pega la API key del evento, elige el EId y los tiempos de meta entran en
 * race_results casando por dorsal con las inscripciones de la distancia.
 * Así la web, los overlays y el asistente de WhatsApp leen lo mismo.
 *
 * La API de RaceTec no manda CORS, por eso pasa por aquí y no se llama desde
 * el navegador. La API key viaja en el cuerpo de la petición y no se guarda.
 *
 * Acciones:
 *   { accion: "eventos", api_key }                        → lista de eventos (EId, nombre)
 *   { accion: "importar", api_key, eid, race_distance_id } → upsert en race_results
 *
 * Escribe con el JWT del usuario, así que manda la RLS de race_results:
 * admin, u organizador de esa carrera.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://results.racetec.net/API";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function apiGet(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${endpoint}?${qs}`);
  const text = (await res.text()).trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    throw new Error(`RaceTec ${endpoint}: ${text.slice(0, 120) || res.status}`);
  }
  return JSON.parse(text);
}

const asList = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? data : data ? [data as Record<string, unknown>] : [];

/** «01:03:33.8» o «10:34» → «HH:MM:SS.f» para el interval de Postgres. */
function normalizarTiempo(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const limpio = t.trim();
  if (!limpio || /^[0:.]+$/.test(limpio)) return null;
  const [hms, dec] = limpio.split(".");
  const partes = hms.split(":").map(Number);
  if (partes.some((n) => Number.isNaN(n))) return null;
  const [h, m, s] = partes.length === 3 ? partes : [0, partes[0], partes[1] ?? 0];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${dec ? `.${dec}` : ""}`;
}

const entero = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

interface RaceTecResult {
  RaceNo?: unknown;
  GunFinishTime?: unknown;
  OverallPos?: unknown;
  GenderPos?: unknown;
  CategoryPos?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta la cabecera de autorización" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError || !user) return json({ error: "Sesión no válida" }, 401);

    const [{ data: esAdmin }, { data: esOrganizador }] = await Promise.all([
      sb.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      sb.rpc("has_role", { _user_id: user.id, _role: "organizer" }),
    ]);
    if (!esAdmin && !esOrganizador) return json({ error: "Solo administradores y organizadores" }, 403);

    const body = await req.json().catch(() => ({}));
    const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (!apiKey) return json({ error: "Falta la API key de RaceTec" }, 400);

    // ── Eventos ─────────────────────────────────────────────────────────────
    if (body.accion === "eventos") {
      const [carrera, eventos] = await Promise.all([
        apiGet("race.aspx", { ApiKey: apiKey }).catch(() => null),
        apiGet("events.aspx", { ApiKey: apiKey }),
      ]);
      const nombreCarrera = (asList(carrera)[0]?.RaceName as string | undefined) ?? null;
      return json({
        carrera: nombreCarrera,
        eventos: asList(eventos).map((e) => ({ eid: String(e.EventId), nombre: String(e.EventName ?? "") })),
      });
    }

    // ── Importar ────────────────────────────────────────────────────────────
    if (body.accion !== "importar") return json({ error: "Acción desconocida" }, 400);

    const eid = String(body.eid ?? "").trim();
    const raceDistanceId = String(body.race_distance_id ?? "").trim();
    if (!eid || !raceDistanceId) return json({ error: "Faltan el evento (EId) o la distancia" }, 400);

    const [{ data: inscripciones, error: regError }, { data: existentes, error: resError }, racetec] =
      await Promise.all([
        sb.from("registrations").select("id, bib_number").eq("race_distance_id", raceDistanceId).not("bib_number", "is", null),
        sb.from("race_results").select("id, registration_id").eq("race_distance_id", raceDistanceId),
        apiGet("results.aspx", { ApiKey: apiKey, EId: eid, NoRecords: "9999" }),
      ]);
    if (regError) throw regError;
    if (resError) throw resError;

    const porDorsal = new Map((inscripciones ?? []).map((r) => [String(r.bib_number), r.id]));
    const resultadoDe = new Map((existentes ?? []).map((r) => [r.registration_id, r.id]));

    const filas: Record<string, unknown>[] = [];
    const sinDorsal: string[] = [];
    const sinTiempo: string[] = [];
    let nuevos = 0;
    let actualizados = 0;

    for (const r of asList(racetec) as RaceTecResult[]) {
      const dorsal = String(r.RaceNo ?? "").trim();
      if (!dorsal || dorsal === "undefined") continue;
      const registrationId = porDorsal.get(dorsal);
      if (!registrationId) {
        sinDorsal.push(dorsal);
        continue;
      }
      const tiempo = normalizarTiempo(r.GunFinishTime);
      if (!tiempo) {
        sinTiempo.push(dorsal);
        continue;
      }
      const id = resultadoDe.get(registrationId);
      if (id) actualizados++;
      else nuevos++;
      filas.push({
        ...(id ? { id } : {}),
        registration_id: registrationId,
        race_distance_id: raceDistanceId,
        finish_time: tiempo,
        overall_position: entero(r.OverallPos),
        gender_position: entero(r.GenderPos),
        category_position: entero(r.CategoryPos),
        status: "FIN",
        notes: `RaceTec EId ${eid}`,
      });
    }

    // Por lotes: PostgREST aguanta, pero un upsert de miles de filas de golpe
    // se acerca al límite de tamaño de petición.
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await sb.from("race_results").upsert(filas.slice(i, i + 200), { onConflict: "id" });
      if (error) throw error;
    }

    return json({
      total_racetec: asList(racetec).length,
      importados: filas.length,
      nuevos,
      actualizados,
      sin_dorsal: sinDorsal,
      sin_tiempo: sinTiempo,
    });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("❌ racetec-importar:", detalle);
    return json({ error: detalle }, 500);
  }
});
