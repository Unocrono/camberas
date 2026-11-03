/**
 * Consultas a las clasificaciones de Camberas (race_results, split_times,
 * timing_readings). Si la carrera se cronometra con RaceTec, los tiempos
 * llegan aquí por la importación de Resultados (racetec-importar), así que el
 * bot siempre lee lo mismo que la web.
 *
 * Regla dura: aquí NO se inventa nada. Si no hay dato, se devuelve null y el
 * formateador lo dice. Un tiempo inventado en una carrera es peor que un
 * "todavía no tengo ese dato".
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BotConfig {
  enabled: boolean;
  /** Carrera en directo (races.id). Sin ella el bot está cerrado. */
  race_id: string | null;
  /** Distancia concreta; null = todas las de la carrera. */
  distance_id: string | null;
  race_name: string;
  live_url: string | null;
  results_url: string | null;
  info_url: string | null;
  race_info: string;
  position_mode: "split" | "off";
  rate_limit_hour: number;
  /** Resto de la primera versión (RaceTec directo). Ya no se usa. */
  active_eid: string | null;
}

export async function getConfig(sb: SupabaseClient): Promise<BotConfig | null> {
  const { data } = await sb.from("wa_bot_config").select("*").eq("id", 1).maybeSingle();
  return (data as BotConfig) ?? null;
}

// ── Usuario registrado ───────────────────────────────────────────────────────

export interface Usuario {
  id: string;
  first_name: string | null;
}

/**
 * El asistente es solo para usuarios de Camberas, del nivel que sea: el
 * teléfono de WhatsApp tiene que estar en su perfil.
 *
 * wa_id llega como «34600123456». En profiles.phone hay de todo («+34 600 12
 * 34 56», «600123456»…), así que se comparan las 9 últimas cifras permitiendo
 * cualquier cosa que no sea un dígito entre ellas.
 */
export async function findUser(sb: SupabaseClient, waId: string): Promise<Usuario | null> {
  const digits = waId.replace(/\D/g, "");
  if (digits.length < 9) return null;
  const cola = digits.slice(-9);
  const patron = cola.split("").join("\\D*") + "\\D*$";

  const { data } = await sb
    .from("profiles")
    .select("id, first_name")
    .filter("phone", "imatch", patron)
    .limit(1)
    .maybeSingle();

  return (data as Usuario) ?? null;
}

// ── Corredor ─────────────────────────────────────────────────────────────────

export type RunnerState = "finished" | "racing" | "retired" | "registered" | "unknown";

export interface RunnerInfo {
  state: RunnerState;
  bib: string;
  name: string;
  distance: string;
  category: string;
  /** M / F / X según genders */
  gender: string;
  /** Tiempo de meta (finished) o tiempo en el último control (racing), h:mm:ss */
  time: string | null;
  /** Diferencia con el líder, ya formateada */
  gap: string | null;
  /** Puesto general — solo en meta */
  overall: number | null;
  genderPos: number | null;
  catPos: number | null;
  /** Último control por el que ha pasado */
  lastSplit: string | null;
  /** Hora de pared del paso, cuando no se puede calcular el tiempo */
  passedAt: string | null;
  /** DNF / DNS / DSQ */
  statusLabel: string | null;
}

const GENDER_CODE: Record<number, string> = { 1: "M", 2: "F", 3: "X" };

interface RegistrationRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gender_id: number | null;
  race_distance_id: string;
  race_category: { name: string; short_name: string | null } | null;
  race_distance: { name: string } | null;
}

interface ResultRow {
  id: string;
  finish_time: string;
  status: string;
  overall_position: number | null;
  gender_position: number | null;
  category_position: number | null;
  race_distance_id: string;
}

/**
 * Busca un dorsal en cascada: inscripción → resultado de meta → último split
 * → última lectura de cronometraje.
 */
export async function findRunner(
  sb: SupabaseClient,
  cfg: BotConfig,
  bib: string,
): Promise<RunnerInfo> {
  const base: RunnerInfo = {
    state: "unknown",
    bib,
    name: "",
    distance: "",
    category: "",
    gender: "",
    time: null,
    gap: null,
    overall: null,
    genderPos: null,
    catPos: null,
    lastSplit: null,
    passedAt: null,
    statusLabel: null,
  };

  let q = sb
    .from("registrations")
    .select(
      "id, first_name, last_name, gender_id, race_distance_id, race_category:race_categories(name, short_name), race_distance:race_distances(name)",
    )
    .eq("race_id", cfg.race_id!)
    .eq("bib_number", Number(bib))
    .neq("status", "cancelled");
  if (cfg.distance_id) q = q.eq("race_distance_id", cfg.distance_id);
  const { data: regData } = await q.limit(1).maybeSingle();
  const reg = regData as unknown as RegistrationRow | null;
  if (!reg) return base;

  const info: RunnerInfo = {
    ...base,
    state: "registered",
    name: fullName(reg.first_name, reg.last_name),
    distance: reg.race_distance?.name ?? "",
    category: reg.race_category?.short_name || reg.race_category?.name || "",
    gender: reg.gender_id ? GENDER_CODE[reg.gender_id] ?? "" : "",
  };

  // 1) ¿Tiene resultado?
  const { data: resData } = await sb
    .from("race_results")
    .select("id, finish_time, status, overall_position, gender_position, category_position, race_distance_id")
    .eq("registration_id", reg.id)
    .maybeSingle();
  const res = resData as ResultRow | null;

  if (res?.status === "FIN") {
    const { data: leader } = await sb
      .from("race_results")
      .select("finish_time")
      .eq("race_distance_id", res.race_distance_id)
      .eq("status", "FIN")
      .order("overall_position", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    return {
      ...info,
      state: "finished",
      time: formatInterval(res.finish_time),
      gap: formatGap(intervalToSecs(res.finish_time), intervalToSecs(leader?.finish_time ?? null)),
      overall: res.overall_position,
      genderPos: res.gender_position,
      catPos: res.category_position,
    };
  }

  if (res && ["DNF", "DNS", "DSQ", "DQ"].includes(res.status)) {
    return { ...info, state: "retired", statusLabel: res.status };
  }

  // 2) En carrera: último split calculado (si Resultados ha procesado tiempos)
  if (res) {
    const { data: split } = await sb
      .from("split_times")
      .select("checkpoint_name, split_time, gender_position, category_position")
      .eq("race_result_id", res.id)
      .order("checkpoint_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (split) {
      return {
        ...info,
        state: "racing",
        time: formatInterval(split.split_time),
        lastSplit: split.checkpoint_name,
        genderPos: split.gender_position,
        catPos: split.category_position,
      };
    }
  }

  // 3) En carrera: última lectura cruda del cronometraje
  const { data: reading } = await sb
    .from("timing_readings")
    .select("timing_timestamp, checkpoint:race_checkpoints(name)")
    .eq("race_id", cfg.race_id!)
    .eq("bib_number", Number(bib))
    .is("status_code", null)
    .order("timing_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reading) {
    const checkpoint = (reading as unknown as { checkpoint: { name: string } | null }).checkpoint;
    const { data: wave } = await sb
      .from("race_waves")
      .select("start_time")
      .eq("race_distance_id", reg.race_distance_id)
      .not("start_time", "is", null)
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    const elapsed = elapsedSecs(wave?.start_time ?? null, reading.timing_timestamp);
    return {
      ...info,
      state: "racing",
      lastSplit: checkpoint?.name ?? null,
      time: elapsed !== null ? secsToDisplay(elapsed) : null,
      passedAt: elapsed === null ? horaPared(reading.timing_timestamp) : null,
    };
  }

  return info;
}

// ── Clasificación ────────────────────────────────────────────────────────────

export interface TopEntry {
  pos: number;
  name: string;
  time: string;
  gap: string;
  finished: boolean;
}

/** Top N de meta. Sin llegados devuelve [] y el formateador lo dice. */
export async function getTop(
  sb: SupabaseClient,
  cfg: BotConfig,
  gender: "M" | "F" | null,
  limit = 5,
): Promise<TopEntry[]> {
  const distanceIds = await distanceIdsOf(sb, cfg);
  if (!distanceIds.length) return [];

  const genderId = gender === "F" ? 2 : gender === "M" ? 1 : null;
  let q = sb
    .from("race_results")
    .select(
      "finish_time, overall_position, gender_position, registration:registrations!inner(first_name, last_name, gender_id)",
    )
    .in("race_distance_id", distanceIds)
    .eq("status", "FIN");
  if (genderId) q = q.eq("registration.gender_id", genderId);
  const { data } = await q
    .order(genderId ? "gender_position" : "overall_position", { ascending: true, nullsFirst: false })
    .limit(limit);

  const rows = (data ?? []) as unknown as {
    finish_time: string;
    overall_position: number | null;
    gender_position: number | null;
    registration: { first_name: string | null; last_name: string | null } | null;
  }[];
  if (!rows.length) return [];

  const leaderSecs = intervalToSecs(rows[0].finish_time);
  return rows.map((r, i) => ({
    pos: (genderId ? r.gender_position : r.overall_position) ?? i + 1,
    name: fullName(r.registration?.first_name ?? null, r.registration?.last_name ?? null),
    time: formatInterval(r.finish_time) ?? "",
    gap: i === 0 ? "LÍDER" : formatGap(intervalToSecs(r.finish_time), leaderSecs) ?? "",
    finished: true,
  }));
}

async function distanceIdsOf(sb: SupabaseClient, cfg: BotConfig): Promise<string[]> {
  if (cfg.distance_id) return [cfg.distance_id];
  const { data } = await sb.from("race_distances").select("id").eq("race_id", cfg.race_id!);
  return (data ?? []).map((d: { id: string }) => d.id);
}

// ── Tiempos ──────────────────────────────────────────────────────────────────

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

/** Interval de Postgres («01:03:33.8», «1 day 02:00:00») → segundos. */
export function intervalToSecs(iv: string | null): number | null {
  if (!iv) return null;
  let secs = 0;
  const days = iv.match(/(\d+)\s*day/);
  if (days) secs += Number(days[1]) * 86400;
  const hms = iv.match(/(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!hms) return days ? secs : null;
  secs += Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  return secs;
}

export function secsToDisplay(total: number): string {
  const s = Math.floor(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function formatInterval(iv: string | null): string | null {
  const s = intervalToSecs(iv);
  return s === null ? null : secsToDisplay(s);
}

/** «+1:23» respecto al líder; null si falta alguno; «LÍDER» si es el primero. */
function formatGap(secs: number | null, leader: number | null): string | null {
  if (secs === null || leader === null) return null;
  const diff = Math.max(0, secs - leader);
  if (diff < 1) return "LÍDER";
  return `+${secsToDisplay(diff)}`;
}

/**
 * Tiempo transcurrido entre la salida de la oleada (hora de pared «HH:MM:SS»)
 * y una lectura (hora de pared «YYYY-MM-DDTHH:MM:SS»). Todo en hora local, sin
 * zonas horarias: así se guarda en Camberas.
 */
function elapsedSecs(start: string | null, reading: string): number | null {
  if (!start) return null;
  const a = start.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const b = reading.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!a || !b) return null;
  const s = Number(a[1]) * 3600 + Number(a[2]) * 60 + Number(a[3] ?? 0);
  let r = Number(b[1]) * 3600 + Number(b[2]) * 60 + Number(b[3] ?? 0);
  if (r < s) r += 86400; // pasó la medianoche
  return r - s;
}

function horaPared(reading: string): string | null {
  const m = reading.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}
