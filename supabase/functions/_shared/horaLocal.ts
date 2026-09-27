// Norma de la casa (CLAUDE.md, src/lib/timezoneUtils.ts): las horas de
// carrera — aperturas y cierres de inscripción, tramos de precio, salidas —
// son hora de pared de Madrid guardada con +00, NO instantes UTC. Para
// compararlas con «ahora» hay que usar «ahora» en hora de pared, no
// new Date().toISOString() (que es UTC y va 1-2 h por detrás).
// Gemelas de ahoraParedMs() / hoyLocal() de la web y de public.ahora_pared()
// / public.hoy_local() de la base.

const madrid = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Madrid",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

/** «Ahora» como hora de pared de Madrid, 'YYYY-MM-DDTHH:mm:ssZ' (el mismo dominio que las columnas +00) */
export const ahoraPared = (): string => madrid.format(new Date()).replace(" ", "T") + "Z";

/** La fecha de hoy en Madrid, 'YYYY-MM-DD' */
export const hoyLocal = (): string => ahoraPared().slice(0, 10);
