/**
 * Timezone utilities for calculating UTC offset for Spanish races
 * 
 * Spain uses:
 * - CET (Central European Time): UTC+1 during winter
 * - CEST (Central European Summer Time): UTC+2 during summer (DST)
 * 
 * DST rules for Spain:
 * - Starts: Last Sunday of March at 02:00 → 03:00
 * - Ends: Last Sunday of October at 03:00 → 02:00
 */

/**
 * Gets the last Sunday of a given month in a given year
 */
function getLastSundayOfMonth(year: number, month: number): Date {
  // month is 0-indexed (0 = January, 2 = March, 9 = October)
  // Start from the last day of the month and go backwards
  const date = new Date(year, month + 1, 0); // Last day of the month
  
  // Find the last Sunday
  const dayOfWeek = date.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 0 : dayOfWeek;
  date.setDate(date.getDate() - daysToSubtract);
  
  return date;
}

/**
 * Checks if a date is in Spanish DST (summer time)
 * @param date The date to check
 * @returns true if the date is during CEST (summer time), false for CET (winter time)
 */
export function isSpanishDST(date: Date): boolean {
  const year = date.getFullYear();
  
  // DST starts: Last Sunday of March at 02:00
  const dstStart = getLastSundayOfMonth(year, 2); // March = 2
  dstStart.setHours(2, 0, 0, 0);
  
  // DST ends: Last Sunday of October at 03:00
  const dstEnd = getLastSundayOfMonth(year, 9); // October = 9
  dstEnd.setHours(3, 0, 0, 0);
  
  // Check if date is within DST period
  return date >= dstStart && date < dstEnd;
}

/**
 * Calculates the UTC offset in minutes for a date in Spain
 * @param date The date to calculate the offset for
 * @returns Offset in minutes (60 for CET/winter, 120 for CEST/summer)
 */
export function calculateSpainUtcOffset(date: Date): number {
  return isSpanishDST(date) ? 120 : 60;
}

/**
 * Calculates the UTC offset in minutes for a race date string
 * @param dateString Date string in YYYY-MM-DD format
 * @returns Offset in minutes (60 for CET/winter, 120 for CEST/summer)
 */
export function calculateUtcOffsetFromDateString(dateString: string): number {
  if (!dateString) return 60; // Default to CET if no date
  
  // Parse the date string
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid edge cases
  
  return calculateSpainUtcOffset(date);
}

/**
 * Formats the UTC offset for display
 * @param offsetMinutes Offset in minutes
 * @returns Formatted string like "+1:00" or "+2:00"
 */
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  
  return `${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Parses a formatted offset string back to minutes
 * @param offsetString String like "+1:00", "+2:00", "-5:00"
 * @returns Offset in minutes
 */
export function parseUtcOffset(offsetString: string): number {
  const match = offsetString.match(/^([+-])(\d+):(\d{2})$/);
  if (!match) return 60; // Default to CET if invalid
  
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  
  return sign * (hours * 60 + minutes);
}

/**
 * Converts a UTC timestamp to local race time by applying the offset
 * @param utcTimestamp ISO timestamp string (UTC)
 * @param offsetMinutes Offset in minutes to add
 * @returns New Date object with offset applied
 */
export function applyUtcOffset(utcTimestamp: string, offsetMinutes: number): Date {
  const date = new Date(utcTimestamp);
  date.setMinutes(date.getMinutes() + offsetMinutes);
  return date;
}

/**
 * Formats a Date to ISO string without timezone (for storing as local time)
 * @param date The date to format
 * @returns String in format "YYYY-MM-DDTHH:mm:ss"
 */
export function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Parses a timestamp string from database WITHOUT UTC conversion.
 * The database stores local times as timestamptz which adds +00 suffix.
 * This function extracts the date/time values directly without timezone interpretation.
 * @param timestampString The timestamp string from database (e.g., "2026-01-17 20:13:01+00" or "2026-01-17T20:13:01")
 * @returns Object with parsed components for formatting, or null if invalid
 */
export function parseLocalTimestamp(timestampString: string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null {
  if (!timestampString) return null;
  
  // Match formats: "2026-01-17 20:13:01+00", "2026-01-17T20:13:01", "2026-01-17T20:13:01.000Z"
  const match = timestampString.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
    hours: parseInt(match[4], 10),
    minutes: parseInt(match[5], 10),
    seconds: parseInt(match[6], 10),
  };
}

/**
 * Formats a database timestamp for display WITHOUT UTC conversion.
 * Use this instead of new Date(timestamp).toLocaleString() which causes +1 hour offset.
 * @param timestampString The timestamp string from database
 * @param options Optional formatting options
 * @returns Formatted date/time string in Spanish format
 */
export function formatLocalTimestamp(
  timestampString: string,
  options: {
    showDate?: boolean;
    showTime?: boolean;
    showSeconds?: boolean;
  } = { showDate: true, showTime: true, showSeconds: true }
): string {
  const parsed = parseLocalTimestamp(timestampString);
  if (!parsed) return "-";
  
  const parts: string[] = [];
  
  if (options.showDate !== false) {
    parts.push(`${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${parsed.year}`);
  }
  
  if (options.showTime !== false) {
    const timeParts = [
      String(parsed.hours).padStart(2, '0'),
      String(parsed.minutes).padStart(2, '0'),
    ];
    if (options.showSeconds !== false) {
      timeParts.push(String(parsed.seconds).padStart(2, '0'));
    }
    parts.push(timeParts.join(':'));
  }
  
  return parts.join(', ');
}

/**
 * Formats a database timestamp as time only (HH:MM:SS) WITHOUT UTC conversion.
 * @param timestampString The timestamp string from database
 * @returns Formatted time string
 */
export function formatLocalTime(timestampString: string): string {
  return formatLocalTimestamp(timestampString, { showDate: false, showTime: true, showSeconds: true });
}

// ─── Norma de la casa: todas las horas de carrera son hora LOCAL ─────────────
// Salidas, lecturas, aperturas, cierres y tramos se guardan como hora de pared
// (en columnas timestamptz llegan con +00, pero es la hora local tal cual). No se
// convierten nunca. Solo hay dos cosas que son instantes reales (UTC): el GPS y
// «ahora» (el reloj del sistema, now() de la BD). Estas funciones son el único
// sitio donde se cruzan las dos cosas.

const ZONA_CARRERAS = 'Europe/Madrid';

/**
 * Hora de pared en milisegundos, para RESTAR horas de pared entre sí (tiempo
 * de carrera, cuánto falta) sin que intervenga la zona del navegador.
 * '2026-09-27T09:30:00+00:00' y '2026-09-27T09:30:00' dan lo mismo.
 */
export function paredAMs(timestampString: string): number | null {
  if (!timestampString) return null;
  const m = timestampString.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?/);
  if (!m) return null;
  return Date.UTC(
    +m[1], +m[2] - 1, +m[3],
    +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0),
    m[7] ? +m[7].padEnd(3, '0') : 0
  );
}

/** Lo contrario de paredAMs: milisegundos de pared → 'YYYY-MM-DDTHH:mm:ss' (sin zona) */
export function msAPared(ms: number): string {
  // paredAMs cuenta la hora local como si fuera UTC, así que toISOString la
  // devuelve tal cual: aquí no hay conversión
  return new Date(ms).toISOString().slice(0, 19);
}

/** «Ahora» como hora de pared de las carreras: 'YYYY-MM-DDTHH:mm:ss' */
export function ahoraLocal(): string {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZONA_CARRERAS,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date());
  return p.replace(' ', 'T');
}

/** «Ahora» en milisegundos de pared: se resta directamente de paredAMs(salida) */
export function ahoraParedMs(): number {
  return (paredAMs(ahoraLocal()) as number) + (Date.now() % 1000);
}

/** La fecha de hoy en las carreras: 'YYYY-MM-DD' (no la de UTC, que de 00:00 a 02:00 aún es ayer) */
export function hoyLocal(): string {
  return ahoraLocal().slice(0, 10);
}

/** Días de calendario de hoy a una fecha 'YYYY-MM-DD' (0 = hoy, negativo = ya pasó) */
export function diasHasta(fecha: string): number {
  return Math.round(((paredAMs(fecha) as number) - (paredAMs(hoyLocal()) as number)) / 86400000);
}

/**
 * Hora de un INSTANTE real (GPS, alertas SOS, sellos now()) en hora local. Es
 * la única conversión permitida: el GPS llega en UTC.
 */
export function formatHoraGps(
  instante: string | number | Date,
  conSegundos = true
): string {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('es-ES', {
    timeZone: ZONA_CARRERAS,
    hour: '2-digit', minute: '2-digit',
    ...(conSegundos ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  });
}
