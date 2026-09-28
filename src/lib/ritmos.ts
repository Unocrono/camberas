/**
 * Ritmos del rutómetro (roadbook_paces): dos por rutómetro, en minutos por
 * kilómetro.
 *
 *   orden 1 · «Ritmo del primero»: a qué hora pasa la cabeza de carrera.
 *   orden 2 · «Ritmo de corte»:    a qué hora cierra cada punto.
 *
 * La hora de paso es la salida PREVISTA de la ola (hora de pared, tal cual,
 * sin zonas horarias) más km × ritmo. Es una estimación lineal: no tiene en
 * cuenta el desnivel. Los cortes oficiales, si los hay, son los de los puntos
 * de control (race_checkpoints.max_time) y mandan sobre esta estimación.
 *
 * Lo usan el panel (Rutómetro), el rutómetro público (/roadbook/:id) y la
 * web propia (página del recorrido).
 */

export const RITMO_PRIMERO = { nombre: "Ritmo del primero", orden: 1 } as const;
export const RITMO_CORTE = { nombre: "Ritmo de corte", orden: 2 } as const;

export interface RitmoRutometro {
  nombre: string;
  /** minutos por km (6.5 = 6:30 min/km) */
  minKm: number;
  orden: number;
}

/** Los dos ritmos de un rutómetro por su orden (1 primero, 2 corte) */
export function ritmosDe(ritmos: RitmoRutometro[] | undefined | null): { primero?: number; corte?: number } {
  const lista = ritmos ?? [];
  const por = (orden: number) => {
    const r = lista.find((x) => x.orden === orden);
    return r && r.minKm > 0 ? r.minKm : undefined;
  };
  return { primero: por(RITMO_PRIMERO.orden), corte: por(RITMO_CORTE.orden) };
}

/** "6:30", "6,5", "6.5" o "6" → minutos por km; vacío o inválido → null */
export function textoARitmo(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t) return null;
  const mmss = t.match(/^(\d{1,2}):([0-5]\d)$/);
  if (mmss) {
    const v = +mmss[1] + +mmss[2] / 60;
    return v > 0 ? v : null;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 60 ? n : null;
}

/** 6.5 → "6:30" */
export function ritmoATexto(minKm: number | undefined | null): string {
  if (minKm == null || !(minKm > 0)) return "";
  let min = Math.floor(minKm);
  let seg = Math.round((minKm - min) * 60);
  if (seg === 60) {
    min += 1;
    seg = 0;
  }
  return `${min}:${String(seg).padStart(2, "0")}`;
}

/**
 * Hora de paso por un punto: salida "HH:MM" + km × ritmo → "HH:MM".
 * Si pasa de medianoche añade " (+1)". Sin salida o sin ritmo, null.
 */
export function horaDePaso(salida: string | null | undefined, km: number, minKm: number | undefined): string | null {
  if (!salida || minKm == null || !(km >= 0)) return null;
  const m = salida.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const total = +m[1] * 60 + +m[2] + Math.round(km * minKm);
  const dias = Math.floor(total / 1440);
  const enDia = total - dias * 1440;
  const hhmm = `${String(Math.floor(enDia / 60)).padStart(2, "0")}:${String(enDia % 60).padStart(2, "0")}`;
  return dias > 0 ? `${hhmm} (+${dias})` : hhmm;
}
