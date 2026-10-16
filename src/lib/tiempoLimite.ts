/**
 * Tiempo límite de un recorrido (`race_distances.cutoff_time`): HORAS DE CARRERA
 * desde la salida oficial, nunca una hora de reloj (decisión del dueño, 15-oct-2026,
 * docs/libro-cronometraje.md §4). Si la salida se retrasa, el cierre se mueve con ella.
 *
 * Se guarda como texto y lo lee la base con `gps_cutoff_interval` (migración
 * `20260927190000_corte_en_horas.sql`): «7:00», «07:00:00», «7 h», «7,5» o «7.5 h».
 * Estas funciones entienden exactamente lo mismo, para que la pantalla y la base no
 * se contradigan. Vacío o ilegible: la base toma 12 h.
 */

const HORAS_MINUTOS = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/;
const HORAS_DECIMAL = /^\s*(\d+(?:[.,]\d+)?)\s*(?:h|horas?)?\s*$/i;

/** Horas de carrera que la base leerá de ese texto, en minutos; null si no se entiende. */
export function minutosTiempoLimite(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const hm = HORAS_MINUTOS.exec(texto);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const hd = HORAS_DECIMAL.exec(texto);
  if (hd) return Math.round(Number(hd[1].replace(",", ".")) * 60);
  return null;
}

/** Texto válido para guardar: vacío (12 h por defecto) o algo que la base entienda. */
export function tiempoLimiteValido(texto: string | null | undefined): boolean {
  return !texto || texto.trim() === "" || minutosTiempoLimite(texto) !== null;
}

/** «7 h», «7 h 30 min», o el texto tal cual si no se entiende. */
export function formatearTiempoLimite(texto: string | null | undefined): string {
  const minutos = minutosTiempoLimite(texto);
  if (minutos === null) return texto ?? "";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Hora de cierre («HH:MM», más « (día siguiente)» si pasa de medianoche) a partir de
 * una hora de salida «HH:MM» o «HH:MM:SS» y el tiempo límite; null si falta algo.
 */
export function horaCierre(horaSalida: string | null | undefined, tiempoLimite: string | null | undefined): string | null {
  const minutos = minutosTiempoLimite(tiempoLimite);
  const salida = /^\s*(\d{1,2}):(\d{2})/.exec(horaSalida ?? "");
  if (minutos === null || !salida) return null;
  const total = Number(salida[1]) * 60 + Number(salida[2]) + minutos;
  const dias = Math.floor(total / (24 * 60));
  const resto = total % (24 * 60);
  const hh = String(Math.floor(resto / 60)).padStart(2, "0");
  const mm = String(resto % 60).padStart(2, "0");
  return `${hh}:${mm}${dias > 0 ? " (día siguiente)" : ""}`;
}
