/**
 * Registro de accesos (28-oct-2026): ayudas para enseñar en el panel el
 * dispositivo y las fechas de cada inicio de sesión.
 *
 * Las fechas de accesos son instantes reales (now() del servidor), no horas de
 * carrera: aquí SÍ se pasan a hora de Madrid para enseñarlas.
 */

export interface AccesoUsuario {
  inicio: string;
  /** Último refresco del token: puede ir hasta una hora por detrás del uso real */
  ultima_actividad: string;
  user_agent: string | null;
  /** IP desde la que se inició la sesión (null si no se sabe) */
  ip: string | null;
  /** Última IP con la que se usó la sesión */
  ip_ultima: string | null;
  /** La sesión no se ha cerrado (sigue en auth.sessions), aunque no se use */
  abierta: boolean;
  origen: "sesion" | "historico";
}

/**
 * Una sesión sin cerrar solo cuenta como abierta si se ha usado hace poco: las
 * que se pierden (almacenamiento borrado, incógnito) no se cierran nunca.
 */
export const DIAS_SESION_EN_USO = 7;

export function sesionEnUso(a: AccesoUsuario, ahora: Date = new Date()): boolean {
  return a.abierta && ahora.getTime() - Date.parse(a.ultima_actividad) < DIAS_SESION_EN_USO * 86_400_000;
}

/** "IP 1.2.3.4", "IP 1.2.3.4 · después 5.6.7.8", "última IP 5.6.7.8" o "". */
export function textoIp(a: Pick<AccesoUsuario, "ip" | "ip_ultima">): string {
  if (a.ip && a.ip_ultima && a.ip !== a.ip_ultima) return `IP ${a.ip} · después ${a.ip_ultima}`;
  if (a.ip) return `IP ${a.ip}`;
  if (a.ip_ultima) return `última IP ${a.ip_ultima}`;
  return "";
}

export interface UltimoAcceso {
  user_id: string;
  ultimo_acceso: string | null;
  accesos: number;
  sesiones_abiertas: number;
}

const ZONA = "Europe/Madrid";

const fechaHora = new Intl.DateTimeFormat("es-ES", {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });
const diaMes = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, day: "numeric", month: "short" });
const diaMesAnio = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, day: "numeric", month: "short", year: "numeric" });
// "2026-10-28": el día de calendario en Madrid, para comparar días
const diaClave = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const anio = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, year: "numeric" });

/** "28 oct 2026, 21:47" en hora de Madrid. */
export function fechaHoraMadrid(iso: string): string {
  return fechaHora.format(new Date(iso));
}

/**
 * Cuándo, contado como lo diría una persona: "hace 5 min", "hace 3 h",
 * "ayer, 18:30", "hace 4 días", "12 oct", "12 oct 2025".
 */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  const ms = ahora.getTime() - fecha.getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  // Días de calendario en Madrid, no bloques de 24 h: los días del cambio de
  // hora duran 23 o 25 h
  const dias = Math.round(
    (Date.parse(diaClave.format(ahora)) - Date.parse(diaClave.format(fecha))) / 86_400_000,
  );
  if (dias <= 0) return `hace ${Math.floor(min / 60)} h`;
  if (dias === 1) return `ayer, ${hora.format(fecha)}`;
  if (dias < 7) return `hace ${dias} días`;
  const mismoAnio = anio.format(fecha) === anio.format(ahora);
  return mismoAnio ? diaMes.format(fecha) : diaMesAnio.format(fecha);
}

/**
 * El navegador y el sistema en palabras: "Chrome en Android", "Safari en
 * iPhone", "Edge en Windows", "App en Android" (vista web dentro de una app).
 */
export function describirDispositivo(ua: string | null | undefined): string {
  if (!ua) return "Dispositivo desconocido";

  let sistema = "";
  if (/iPhone/.test(ua)) sistema = "iPhone";
  else if (/iPad/.test(ua)) sistema = "iPad";
  else if (/Android/.test(ua)) sistema = "Android";
  else if (/CrOS/.test(ua)) sistema = "ChromeOS";
  else if (/Windows/.test(ua)) sistema = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) sistema = "Mac";
  else if (/Linux|X11/.test(ua)) sistema = "Linux";

  let navegador = "";
  if (/; wv\)/.test(ua)) navegador = "App";
  else if (/Edg(A|iOS)?\//.test(ua)) navegador = "Edge";
  else if (/OPR\/|Opera/.test(ua)) navegador = "Opera";
  else if (/SamsungBrowser\//.test(ua)) navegador = "Samsung Internet";
  else if (/FxiOS\/|Firefox\//.test(ua)) navegador = "Firefox";
  else if (/CriOS\/|Chrome\//.test(ua)) navegador = "Chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) navegador = "Safari";

  if (navegador && sistema) return `${navegador} en ${sistema}`;
  if (navegador || sistema) return navegador || sistema;
  return ua.length > 60 ? `${ua.slice(0, 57)}…` : ua;
}
