// Correo de send-cancellation-confirmation, con el diseño de la casa
// (_shared/emailCamberas.ts). Módulo puro: sin imports de URL ni Deno, para
// poder generar vistas previas desde Node.

import {
  cajaInfo,
  envoltorio,
  esc,
  euros,
  fechaLarga,
  fila,
  nota,
  parrafo,
  saludo,
  tablaDatos,
} from "../_shared/emailCamberas.ts";

export interface DatosCancelacionInscripcion {
  /** Nombre del corredor/a */
  nombre: string;
  /** Nombre de la carrera */
  carrera: string;
  /** Fecha de la carrera (ISO o "2026-11-29") */
  fecha: string;
  /** Recorrido (distancia) */
  recorrido: string;
  /** Precio de inscripción en euros */
  precio: number;
  /** Estado del pago de la inscripción cancelada */
  estadoPago: "paid" | "pending" | "cancelled";
}

/** Confirmación de cancelación al corredor/a (con o sin reembolso) */
export function correoCancelacionInscripcion(d: DatosCancelacionInscripcion): { asunto: string; html: string } {
  const reembolso =
    d.estadoPago === "paid"
      ? cajaInfo(
          "Información del reembolso",
          `Como ya habías pagado esta inscripción, se procesará un reembolso de <strong>${esc(euros(d.precio))}</strong> ` +
            "en un plazo de 5-7 días hábiles.<br>El reembolso se abonará en el método de pago original.",
          "verde",
        )
      : cajaInfo(
          "Sin reembolso",
          "No se realizó ningún pago por esta inscripción, por lo que no es necesario ningún reembolso.",
        );

  const interior = [
    saludo(d.nombre),
    parrafo(`Tu inscripción en <strong>${esc(d.carrera)}</strong> ha sido cancelada correctamente.`),
    tablaDatos([
      fila("Carrera", d.carrera),
      fila("Distancia", d.recorrido),
      fila("Fecha", fechaLarga(d.fecha)),
      fila("Precio de inscripción", euros(d.precio)),
      fila("Estado", "Cancelada", true),
    ]),
    reembolso,
    parrafo("Sentimos que no puedas participar, ¡pero esperamos verte en futuros eventos!"),
    nota("Si tienes alguna pregunta sobre tu cancelación o reembolso, no dudes en contactarnos."),
  ].join("\n");

  return {
    asunto: `Inscripción cancelada: ${d.carrera}`,
    html: envoltorio({ titulo: "Inscripción cancelada", interior }),
  };
}
