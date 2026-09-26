/**
 * Recordatorio "faltan 7 días" al corredor, con el diseño de la casa
 * (_shared/emailCamberas.ts). Módulo puro: se puede importar desde Node/tsx
 * para generar vistas previas. Todo dato de fuera va escapado.
 */
import { cajaInfo, envoltorio, esc, fechaLarga, fila, lista, parrafo, saludo, tablaDatos, VERDE } from "../_shared/emailCamberas.ts";

export interface DatosRecordatorio {
  nombre: string;
  carrera: string;
  /** "2026-11-29" o ISO */
  fecha: string;
  lugar: string;
  recorrido: string;
  km: string | number;
  dorsal?: number | null;
  /** Tiempo de corte, si lo hay */
  corte?: string | null;
}

export function correoRecordatorio(d: DatosRecordatorio): { asunto: string; html: string } {
  return {
    asunto: `Recordatorio: ${d.carrera} - ¡Faltan 7 días!`,
    html: envoltorio({
      titulo: "¡Tu carrera está cerca!",
      interior: [
        saludo(d.nombre),
        parrafo(`Un recordatorio amistoso: <strong>${esc(d.carrera)}</strong> es en solo <strong>7 días</strong>.`),
        tablaDatos([
          fila("Carrera", d.carrera),
          fila("Tu recorrido", `${d.recorrido} (${d.km} km)`),
          fila("Fecha", fechaLarga(d.fecha)),
          fila("Ubicación", d.lugar),
          d.dorsal != null ? fila("Tu dorsal", d.dorsal, true) : null,
          d.corte ? fila("Tiempo de corte", d.corte) : null,
        ]),
        cajaInfo(
          "Lista de comprobación para el día de la carrera",
          lista([
            "Recoge tu dorsal (consulta los detalles de la carrera para los horarios de recogida)",
            "Prepara tu equipamiento y nutrición",
            "Descansa bien la noche anterior",
            "Llega temprano para calentar y encontrar tu posición de salida",
            "Consulta la previsión del tiempo y vístete apropiadamente",
          ]),
          "verde",
        ),
        `<p style="color: ${VERDE}; font-size: 17px; font-weight: bold; text-align: center; margin: 28px 0 0;">¡Estamos deseando verte en la línea de salida!</p>`,
      ].join("\n"),
    }),
  };
}
