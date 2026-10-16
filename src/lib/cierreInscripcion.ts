import { paredAMs } from "@/lib/timezoneUtils";

/**
 * Cuándo se cierra la inscripción de un recorrido.
 *
 * La inscripción se cierra en su plazo (registration_closes) y, como muy
 * tarde, a la SALIDA del recorrido: una vez dada la salida no tiene sentido
 * inscribirse (petición del dueño, 16-oct-2026, tras ver el botón
 * «Inscribirme» activo con la carrera ya corrida).
 *
 * La salida es la OFICIAL (race_waves.start_time) y, si el recorrido no tiene
 * salida, las 23:59 del día de la carrera. Es la misma regla con la que se
 * cierran las cesiones de dorsal (hora_salida_recorrido) y la que aplican en
 * el servidor estado_carreras, evento_publico y widget_carrera
 * (migración 20261016120000).
 *
 * Todas las horas son de pared (+00, CLAUDE.md): se comparan con
 * ahoraParedMs() y no se convierten nunca.
 */
export type EstadoPlazo = "proximamente" | "abierta" | "cerrada";

export interface PlazoInscripcion {
  /** Apertura en ms de pared, o null si no tiene */
  abreMs: number | null;
  /** Fin del plazo (registration_closes) en ms de pared, o null si no tiene */
  plazoMs: number | null;
  /** Salida del recorrido en ms de pared (la oficial, o las 23:59 del día de la carrera) */
  salidaMs: number | null;
}

/** Salida del recorrido en ms de pared: la oficial, o las 23:59 del día de la carrera */
export function salidaRecorridoMs(salidaOficial: string | null | undefined, fechaCarrera: string | null | undefined): number | null {
  const oficial = salidaOficial ? paredAMs(salidaOficial) : null;
  if (oficial !== null) return oficial;
  return fechaCarrera ? paredAMs(`${String(fechaCarrera).slice(0, 10)}T23:59:00`) : null;
}

export function plazoInscripcion(opciones: {
  registrationOpens: string | null | undefined;
  registrationCloses: string | null | undefined;
  salidaOficial: string | null | undefined;
  fechaCarrera: string | null | undefined;
}): PlazoInscripcion {
  return {
    abreMs: opciones.registrationOpens ? paredAMs(opciones.registrationOpens) : null,
    plazoMs: opciones.registrationCloses ? paredAMs(opciones.registrationCloses) : null,
    salidaMs: salidaRecorridoMs(opciones.salidaOficial, opciones.fechaCarrera),
  };
}

/**
 * Estado en un momento dado. El plazo incluye su último instante (como hasta
 * ahora y como en el servidor: ahora <= registration_closes); la salida no: a
 * la hora de salida ya está cerrada.
 */
export function estadoPlazo(plazo: PlazoInscripcion, ahoraMs: number): EstadoPlazo {
  if (plazo.abreMs !== null && ahoraMs < plazo.abreMs) return "proximamente";
  if (plazo.plazoMs !== null && ahoraMs > plazo.plazoMs) return "cerrada";
  if (plazo.salidaMs !== null && ahoraMs >= plazo.salidaMs) return "cerrada";
  return "abierta";
}

/** El próximo momento (ms de pared) en que cambia el estado, para volver a pintar; null si ya no cambia */
export function proximoCambioMs(plazo: PlazoInscripcion, ahoraMs: number): number | null {
  const momentos = [plazo.abreMs, plazo.plazoMs === null ? null : plazo.plazoMs + 1, plazo.salidaMs]
    .filter((ms): ms is number => ms !== null && ms > ahoraMs);
  return momentos.length ? Math.min(...momentos) : null;
}
