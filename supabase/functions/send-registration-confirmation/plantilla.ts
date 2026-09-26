// Correo de send-registration-confirmation, con el diseño de la casa
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

export interface DatosConfirmacionInscripcion {
  /** Nombre del corredor/a */
  nombre: string;
  /** Nombre de la carrera */
  carrera: string;
  /** Fecha de la carrera ("2026-11-29" o ISO) */
  fecha: string;
  /** Lugar de la carrera */
  lugar: string;
  /** Recorrido (distancia) */
  recorrido: string;
  /** Precio de inscripción en euros */
  precio: number;
  /** Inscrito/a sin cuenta */
  invitado: boolean;
}

/** Confirmación de inscripción al corredor/a */
export function correoConfirmacionInscripcion(d: DatosConfirmacionInscripcion): { asunto: string; html: string } {
  // La usa sobre todo la inscripción GRATUITA (las de pago reciben el
  // comprobante de send-payment-confirmation al pagar): el correo viejo decía
  // siempre "pago pendiente", también cuando no había nada que pagar
  const gratuita = !(d.precio > 0);
  const interior = [
    saludo(d.nombre),
    parrafo(`¡Gracias por inscribirte en <strong>${esc(d.carrera)}</strong>!`),
    tablaDatos([
      fila("Carrera", d.carrera),
      fila("Distancia", d.recorrido),
      fila("Fecha", fechaLarga(d.fecha)),
      fila("Lugar", d.lugar),
      fila("Precio de inscripción", gratuita ? "Gratuita" : euros(d.precio), true),
    ]),
    d.invitado
      ? cajaInfo(
          "Te has inscrito como invitado",
          "Crea una cuenta con este email para gestionar tu inscripción y acceder a funciones adicionales.",
        )
      : "",
    gratuita
      ? ""
      : cajaInfo(
          "Estado del pago: pendiente",
          "Por favor, completa tu pago para confirmar tu plaza.",
          "verde",
        ),
    nota("Te enviaremos un recordatorio 7 días antes del evento con información importante para el día de la carrera."),
    nota("Si tienes alguna pregunta, no dudes en contactarnos."),
  ].join("\n");

  return {
    asunto: `Inscripción confirmada: ${d.carrera}`,
    html: envoltorio({ titulo: "¡Inscripción confirmada!", interior }),
  };
}
