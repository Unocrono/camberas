/**
 * Consultas a las tablas del bridge de RaceTec.
 *
 * Regla dura: aquí NO se inventa nada. Si no hay dato, se devuelve null y el
 * formateador lo dice. Un tiempo inventado en una carrera es peor que un
 * "todavía no tengo ese dato".
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BotConfig {
  enabled: boolean;
  active_eid: string | null;
  race_name: string;
  race_id: string | null;
  distance_id: string | null;
  live_url: string | null;
  results_url: string | null;
  info_url: string | null;
  race_info: string;
  position_mode: "split" | "off";
  rate_limit_hour: number;
}

export async function getConfig(sb: SupabaseClient): Promise<BotConfig | null> {
  const { data } = await sb.from("wa_bot_config").select("*").eq("id", 1).maybeSingle();
  return (data as BotConfig) ?? null;
}

export type RunnerState = "finished" | "racing" | "registered" | "unknown";

export interface RunnerInfo {
  state: RunnerState;
  bib: string;
  name: string;
  category: string;
  gender: string;
  /** Tiempo de meta (finished) o tiempo en el último control (racing) */
  time: string | null;
  /** Diferencia con el líder, ya formateada por el bridge */
  gap: string | null;
  /** Puesto general — SOLO existe en resultados de meta */
  overall: number | null;
  /** Puesto por género */
  genderPos: number | null;
  catPos: number | null;
  /** Último control por el que ha pasado */
  lastSplit: string | null;
}

/**
 * Busca un dorsal en cascada: meta → en carrera → inscrito.
 *
 * Ojo con racetec_leaderboard.position: el bridge la calcula POR GÉNERO
 * (parseLBRows asigna i+1 dentro de cada grupo), así que NO es la posición
 * general y no se puede publicar como tal. Por eso `overall` se queda a null
 * mientras el corredor está en carrera.
 */
export async function findRunner(
  sb: SupabaseClient,
  eid: string,
  bib: string,
): Promise<RunnerInfo> {
  // 1) ¿Ha terminado?
  const { data: result } = await sb
    .from("racetec_results")
    .select(
      "bib, firstname, lastname, gender, category, position, gender_position, cat_position, gun_time_display, gap_display, last_split",
    )
    .eq("eid", eid)
    .eq("bib", bib)
    .maybeSingle();

  if (result) {
    return {
      state: "finished",
      bib,
      name: fullName(result.firstname, result.lastname),
      category: result.category ?? "",
      gender: result.gender ?? "",
      time: result.gun_time_display || null,
      gap: result.gap_display || null,
      overall: result.position ?? null,
      genderPos: result.gender_position ?? null,
      catPos: result.cat_position ?? null,
      lastSplit: result.last_split || null,
    };
  }

  // 2) ¿Está en carrera?
  const { data: lb } = await sb
    .from("racetec_leaderboard")
    .select(
      "bib, firstname, lastname, gender, category, gender_position, cat_position, gun_time_display, gap_display, last_split, status",
    )
    .eq("eid", eid)
    .eq("bib", bib)
    .maybeSingle();

  if (lb) {
    return {
      state: "racing",
      bib,
      name: fullName(lb.firstname, lb.lastname),
      category: lb.category ?? "",
      gender: lb.gender ?? "",
      time: lb.gun_time_display || null,
      gap: lb.gap_display || null,
      overall: null, // ← ver comentario de la función
      genderPos: lb.gender_position ?? null,
      catPos: lb.cat_position ?? null,
      lastSplit: lb.last_split || null,
    };
  }

  // 3) ¿Está inscrito pero sin pasar por ningún control?
  const { data: athlete } = await sb
    .from("racetec_athletes")
    .select("bib, firstname, lastname, gender, category")
    .eq("eid", eid)
    .eq("bib", bib)
    .maybeSingle();

  if (athlete) {
    return {
      state: "registered",
      bib,
      name: fullName(athlete.firstname, athlete.lastname),
      category: athlete.category ?? "",
      gender: athlete.gender ?? "",
      time: null,
      gap: null,
      overall: null,
      genderPos: null,
      catPos: null,
      lastSplit: null,
    };
  }

  return {
    state: "unknown",
    bib,
    name: "",
    category: "",
    gender: "",
    time: null,
    gap: null,
    overall: null,
    genderPos: null,
    catPos: null,
    lastSplit: null,
  };
}

export interface TopEntry {
  pos: number;
  name: string;
  time: string;
  gap: string;
  finished: boolean;
}

/**
 * Top N. Si hay resultados de meta, mandan esos (posición general real).
 * Si todavía no hay nadie en meta, tira del leaderboard, donde el orden por
 * género ya viene resuelto por el bridge.
 */
export async function getTop(
  sb: SupabaseClient,
  eid: string,
  gender: "M" | "F" | null,
  limit = 5,
): Promise<TopEntry[]> {
  let q = sb
    .from("racetec_results")
    .select("firstname, lastname, gender, position, gender_position, gun_time_display, gap_display")
    .eq("eid", eid);

  if (gender) q = q.eq("gender", gender);

  const { data: results } = await q
    .order(gender ? "gender_position" : "position", { ascending: true })
    .limit(limit);

  if (results && results.length) {
    return results.map((r) => ({
      pos: (gender ? r.gender_position : r.position) ?? 0,
      name: fullName(r.firstname, r.lastname),
      time: r.gun_time_display || "",
      gap: r.gap_display || "",
      finished: true,
    }));
  }

  // Nadie en meta todavía → leaderboard
  let lq = sb
    .from("racetec_leaderboard")
    .select("firstname, lastname, gender, gender_position, gun_time_display, gap_display")
    .eq("eid", eid);

  if (gender) lq = lq.eq("gender", gender);

  const { data: lb } = await lq.order("gender_position", { ascending: true }).limit(limit);

  return (lb ?? []).map((r) => ({
    pos: r.gender_position ?? 0,
    name: fullName(r.firstname, r.lastname),
    time: r.gun_time_display || "",
    gap: r.gap_display || "",
    finished: false,
  }));
}

function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}
