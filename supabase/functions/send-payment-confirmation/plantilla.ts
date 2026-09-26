/**
 * Correos de send-payment-confirmation, con el diseño de la casa
 * (_shared/emailCamberas.ts):
 *  - correoCorredor: el comprobante de pago que recibe quien se inscribe
 *    (o el capitán, en un pago de equipo).
 *  - correoOrganizador: la copia interna para la organización.
 *
 * Módulo puro: sin imports de URL ni APIs de Deno, para poder generar las
 * vistas previas desde Node. Todo dato de fuera va escapado.
 */
import {
  boton,
  cajaInfo,
  envoltorio,
  esc,
  euros,
  fila,
  lista,
  nota,
  parrafo,
  saludo,
  tablaDatos,
  VERDE,
} from "../_shared/emailCamberas.ts";

/** Lo mismo que llega en el cuerpo de la petición (contrato de redsys-webhook) */
export interface DatosPago {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  raceName: string;
  distanceName?: string | null;
  amount: number;
  orderNumber?: string | null;
  bibNumber?: number | null;
  /** Página "Mi dorsal" del corredor (con su QR para la recogida) */
  miDorsalUrl?: string | null;
  /** Respuestas del formulario; en un pago de equipo, la lista de corredores */
  formData?: { label: string; value: string }[] | null;
}

interface Correo {
  asunto: string;
  html: string;
}

/** Nombre y apellidos, o null si no hay ninguno */
const nombreDe = (d: DatosPago): string | null =>
  [d.firstName, d.lastName].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || null;

/** Casillas del formulario: "true"/"false" se leen mejor como Sí/No */
const valorLegible = (v: string) => (v === "true" ? "Sí" : v === "false" ? "No" : v);

/** Las respuestas del formulario en filas etiqueta · valor */
const tablaFormulario = (formData: { label: string; value: string }[]): string =>
  `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">${formData
    .map((f) => fila(f.label, valorLegible(f.value)))
    .join("")}</table>`;

/** Frase de cierre verde y centrada (la de recuperar-pagos) */
const despedida = (texto: string): string =>
  `<p style="color: ${VERDE}; font-size: 17px; font-weight: bold; text-align: center; margin: 28px 0 0;">${esc(texto)}</p>`;

/** Comprobante para el corredor (o el capitán del equipo) */
export function correoCorredor(d: DatosPago): Correo {
  const nombre = nombreDe(d);
  const formData = d.formData ?? [];

  const interior = [
    saludo(nombre),
    parrafo(`Hemos recibido tu pago para <strong>${esc(d.raceName)}</strong>. ¡Tu inscripción está completa!`),
    tablaDatos([
      nombre && fila("Corredor/a", nombre),
      d.bibNumber ? fila("Dorsal", d.bibNumber, true) : null,
      fila("Carrera", d.raceName),
      d.distanceName ? fila("Recorrido", d.distanceName) : null,
      fila("Importe pagado", euros(d.amount), true),
      d.orderNumber ? fila("Referencia de pago", d.orderNumber) : null,
    ]),
    d.miDorsalUrl
      ? boton(d.miDorsalUrl, "Ver mi dorsal") +
        nota(
          "Guarda este enlace: es tu código para la <strong>recogida de dorsales</strong>. " +
            "Enséñalo en el móvil y te atienden en segundos.",
        )
      : "",
    formData.length > 0 ? cajaInfo("Datos de tu inscripción", tablaFormulario(formData)) : "",
    cajaInfo(
      "¿Qué viene ahora?",
      lista([
        "Te enviaremos un recordatorio 7 días antes del evento",
        "Consulta la web de la carrera para información sobre la recogida de dorsales",
        "¡Empieza a entrenar y prepárate para el día de la carrera!",
      ]),
      "verde",
    ),
    despedida("¡Nos vemos en la línea de salida!"),
  ].join("\n");

  return {
    asunto: `Pago confirmado: ${d.raceName}`,
    html: envoltorio({ titulo: "¡Pago confirmado!", interior }),
  };
}

/** Copia interna para la organización, con el email del corredor */
export function correoOrganizador(d: DatosPago): Correo {
  const nombre = nombreDe(d);
  const formData = d.formData ?? [];

  const interior = [
    parrafo(
      `Inscripción confirmada y pagada en <strong>${esc(d.raceName)}</strong>${
        d.distanceName ? ` (${esc(d.distanceName)})` : ""
      }.`,
    ),
    tablaDatos([
      nombre && fila("Corredor/a", nombre),
      d.bibNumber ? fila("Dorsal", d.bibNumber, true) : null,
      fila("Email", d.email),
      fila("Carrera", d.raceName),
      d.distanceName ? fila("Recorrido", d.distanceName) : null,
      fila("Importe pagado", euros(d.amount), true),
      d.orderNumber ? fila("Referencia de pago", d.orderNumber) : null,
    ]),
    formData.length > 0 ? cajaInfo("Datos del formulario", tablaFormulario(formData)) : "",
  ].join("\n");

  return {
    asunto: `Nueva inscripción pagada: ${d.raceName} — ${nombre ?? "corredor/a"}`,
    html: envoltorio({ titulo: "Nueva inscripción pagada", interior, pie: "Aviso interno de camberas.com" }),
  };
}
