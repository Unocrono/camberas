/**
 * Router determinista + formateo de respuestas.
 *
 * Sin LLM en esta fase: el día de carrera la inmensa mayoría de los mensajes
 * son literalmente un número de dorsal. Resolverlo con una regex es gratis,
 * instantáneo y no puede alucinar un tiempo. El LLM entra en la F2 para el
 * lenguaje libre, con estas mismas consultas como herramientas.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type BotConfig, findRunner, getTop, type RunnerInfo } from "./data.ts";

export type Intent =
  | "dorsal"
  | "top"
  | "top_f"
  | "top_m"
  | "live"
  | "info"
  | "help"
  | "unknown";

/** Quita acentos y baja a minúsculas para que "clasificación" == "clasificacion". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // ̀-ͯ = marcas diacríticas combinantes (los acentos sueltos que
    // deja NFD). Escapadas a propósito: en literal son invisibles y cualquier
    // editor con otra codificación las destroza.
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function classify(raw: string): { intent: Intent; bib?: string } {
  const text = normalize(raw);

  // Un número suelto = dorsal. Es el 80% del tráfico.
  const bibMatch = text.match(/^#?\s*(\d{1,5})$/);
  if (bibMatch) return { intent: "dorsal", bib: bibMatch[1] };

  // "dorsal 214", "el 214", "donde va el 214"
  const inline = text.match(/\b(?:dorsal|numero|num|bib)\s*#?\s*(\d{1,5})\b/) ??
    text.match(/\bva\s+(?:el|la)?\s*#?\s*(\d{1,5})\b/);
  if (inline) return { intent: "dorsal", bib: inline[1] };

  if (/\b(clasificacion|clasifica|ranking|top|generales?|puestos?)\b/.test(text)) {
    if (/\b(femenina|femenino|mujeres|chicas|fem)\b/.test(text)) return { intent: "top_f" };
    if (/\b(masculina|masculino|hombres|chicos|masc)\b/.test(text)) return { intent: "top_m" };
    return { intent: "top" };
  }

  if (/\b(mapa|directo|en vivo|live|seguimiento|gps|donde)\b/.test(text)) {
    return { intent: "live" };
  }

  if (/\b(info|informacion|horario|hora|salida|recorrido|carrera|km)\b/.test(text)) {
    return { intent: "info" };
  }

  if (/^(hola|buenas|hey|ayuda|help|menu|start|\?|gracias)\b/.test(text) || text.length < 3) {
    return { intent: "help" };
  }

  return { intent: "unknown" };
}

// ── Formateo ────────────────────────────────────────────────────────────────

function runnerReply(r: RunnerInfo, cfg: BotConfig): string {
  if (r.state === "unknown") {
    return `No encuentro el dorsal ${r.bib} en ${cfg.race_name || "esta carrera"}.\n\n` +
      `Comprueba el número o escribe *ayuda* para ver qué puedo consultar.`;
  }

  const head = `🏃 *${r.bib}* · ${r.name}`;
  const cat = [r.gender === "F" ? "Femenina" : r.gender === "M" ? "Masculina" : "", r.category]
    .filter(Boolean)
    .join(" · ");

  if (r.state === "registered") {
    return `${head}\n${cat}\n\n⏳ Todavía no ha pasado por ningún control.`;
  }

  const lines = [head];
  if (cat) lines.push(cat);
  lines.push("");

  if (r.state === "finished") {
    lines.push(`🏁 *Meta* · ${r.time ?? "—"}`);
    const posBits: string[] = [];
    if (r.overall) posBits.push(`${r.overall}º general`);
    if (r.genderPos) posBits.push(`${r.genderPos}º ${r.gender === "F" ? "femenina" : "masculina"}`);
    if (r.catPos) posBits.push(`${r.catPos}º de categoría`);
    if (posBits.length) lines.push(`🏅 ${posBits.join(" · ")}`);
    if (r.gap && r.gap !== "LÍDER") lines.push(`⏱️ ${r.gap} del líder`);
    else if (r.gap === "LÍDER") lines.push(`🥇 Líder`);
  } else {
    // En carrera. Nada de coordenadas: solo el control por el que ha pasado.
    if (cfg.position_mode === "split" && r.lastSplit) {
      lines.push(`📍 Pasó por *${r.lastSplit}* · ${r.time ?? "—"}`);
    } else {
      lines.push(`🏃 En carrera · ${r.time ?? "—"}`);
    }
    // Su puesto general en vivo no es fiable (el bridge la calcula por género),
    // así que solo damos género y categoría.
    const posBits: string[] = [];
    if (r.genderPos) posBits.push(`${r.genderPos}º ${r.gender === "F" ? "femenina" : "masculina"}`);
    if (r.catPos) posBits.push(`${r.catPos}º de categoría`);
    if (posBits.length) lines.push(`🏅 ${posBits.join(" · ")}`);
    if (r.gap && r.gap !== "LÍDER") lines.push(`⏱️ ${r.gap} del líder`);
    else if (r.gap === "LÍDER") lines.push(`🥇 Líder`);
  }

  if (cfg.live_url) lines.push(`\n🗺️ En vivo: ${cfg.live_url}`);

  return lines.join("\n");
}

function topReply(
  entries: { pos: number; name: string; time: string; gap: string; finished: boolean }[],
  cfg: BotConfig,
  label: string,
): string {
  if (!entries.length) {
    return `Todavía no hay clasificación de ${cfg.race_name || "la carrera"}.\n\n` +
      `En cuanto pasen los primeros por un control te la puedo dar.`;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const rows = entries.map((e, i) => {
    const badge = medals[i] ?? `${e.pos}º`;
    const gap = e.gap && e.gap !== "LÍDER" ? ` (+${e.gap.replace(/^\+/, "")})` : "";
    return `${badge} ${e.name} · ${e.time}${gap}`;
  });

  const provisional = entries.some((e) => !e.finished) ? "\n_Provisional, carrera en curso._" : "";
  const link = cfg.results_url ? `\n\n📊 Completa: ${cfg.results_url}` : "";

  return `*${label}* · ${cfg.race_name}\n\n${rows.join("\n")}${provisional}${link}`;
}

function helpReply(cfg: BotConfig): string {
  return [
    `👋 Asistente de *${cfg.race_name || "Camberas"}*.`,
    ``,
    `Escríbeme:`,
    `• Un *número de dorsal* (ej: 214) → cómo va`,
    `• *clasificación* → top 5 general`,
    `• *clasificación femenina* / *masculina*`,
    `• *mapa* → seguimiento en vivo`,
    `• *info* → horarios y recorrido`,
  ].join("\n");
}

const CLOSED_REPLY = "Ahora mismo no hay ninguna carrera en directo. " +
  "Vuelve a escribirme el día de la prueba y te doy tiempos al momento. 🏃";

// ── Resolución ──────────────────────────────────────────────────────────────

export async function resolve(
  sb: SupabaseClient,
  cfg: BotConfig | null,
  text: string,
): Promise<{ intent: Intent; reply: string }> {
  if (!cfg || !cfg.enabled || !cfg.active_eid) {
    return { intent: "unknown", reply: CLOSED_REPLY };
  }

  const { intent, bib } = classify(text);

  switch (intent) {
    case "dorsal": {
      const runner = await findRunner(sb, cfg.active_eid, bib!);
      return { intent, reply: runnerReply(runner, cfg) };
    }
    case "top":
      return {
        intent,
        reply: topReply(await getTop(sb, cfg.active_eid, null), cfg, "Clasificación general"),
      };
    case "top_f":
      return {
        intent,
        reply: topReply(await getTop(sb, cfg.active_eid, "F"), cfg, "Clasificación femenina"),
      };
    case "top_m":
      return {
        intent,
        reply: topReply(await getTop(sb, cfg.active_eid, "M"), cfg, "Clasificación masculina"),
      };
    case "live":
      return {
        intent,
        reply: cfg.live_url
          ? `🗺️ Seguimiento en vivo de *${cfg.race_name}*:\n${cfg.live_url}\n\n` +
            `También puedes mandarme un dorsal y te digo por dónde va.`
          : `Todavía no hay mapa en vivo publicado para esta carrera.`,
      };
    case "info":
      return {
        intent,
        reply: cfg.race_info
          ? `ℹ️ *${cfg.race_name}*\n\n${cfg.race_info}` +
            (cfg.info_url ? `\n\n🔗 ${cfg.info_url}` : "")
          : `ℹ️ *${cfg.race_name}*` + (cfg.info_url ? `\n${cfg.info_url}` : ""),
      };
    case "help":
      return { intent, reply: helpReply(cfg) };
    default:
      return {
        intent: "unknown",
        reply: `No he entendido eso 🤔\n\n${helpReply(cfg)}`,
      };
  }
}

/** Aviso RGPD que se añade a la primera respuesta a cada número. */
export const PRIVACY_NOTICE =
  "\n\n_Guardamos tu número solo para atender esta consulta y lo borramos a los 30 días._";
