/**
 * Correos de redsys-devolucion, con el diseño de la casa
 * (_shared/emailCamberas.ts):
 *  - correoCorredor: aviso al corredor de que se le ha devuelto el dinero.
 *  - correoOrganizador: la copia interna para la organización, como la que
 *    recibe con cada inscripción pagada.
 *
 * Módulo puro: sin imports de URL ni APIs de Deno, para poder generar las
 * vistas previas desde Node. Todo dato de fuera va escapado.
 */
import { envoltorio, esc, euros, fila, nota, parrafo, saludo, tablaDatos } from "../_shared/emailCamberas.ts";

export interface DatosDevolucion {
  nombre?: string | null;
  apellidos?: string | null;
  email?: string | null;
  carrera: string;
  recorrido?: string | null;
  dorsal?: number | string | null;
  importeCent: number;
  /** true si la devolución anula la inscripción */
  anulada: boolean;
  /** Número de pedido Redsys del cobro devuelto */
  orderNumber?: string | null;
  /** Motivo que escribió el admin (solo va en la copia interna) */
  motivo?: string | null;
  /** 'redsys' (pedida desde Camberas) o 'externa' (hecha fuera y apuntada a mano) */
  origen: "redsys" | "externa";
  /** Dorsal cedido: el dinero vuelve a la tarjeta de quien pagó, no al titular actual */
  cedida?: boolean;
}

interface Correo {
  asunto: string;
  html: string;
}

/** Nombre y apellidos, o null si no hay ninguno */
const nombreDe = (d: DatosDevolucion): string | null =>
  [d.nombre, d.apellidos].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || null;

/** Importe en euros a partir de céntimos, con el formato de la casa */
const importe = (d: DatosDevolucion): string => euros(d.importeCent / 100);

/** Aviso al corredor */
export function correoCorredor(d: DatosDevolucion): Correo {
  const interior = [
    saludo((d.nombre ?? "").trim() || null),
    parrafo(`Hemos ordenado la devolución de tu pago de <strong>${esc(d.carrera)}</strong>.`),
    tablaDatos([
      fila("Importe devuelto", importe(d), true),
      fila("Carrera", d.carrera),
      d.recorrido ? fila("Recorrido", d.recorrido) : null,
      d.dorsal ? fila("Dorsal", d.dorsal) : null,
      d.orderNumber ? fila("Referencia de pago", d.orderNumber) : null,
      fila("Tu inscripción", d.anulada ? "Queda anulada" : "Sigue en vigor"),
    ]),
    d.anulada
      ? parrafo(`Tu inscripción en <strong>${esc(d.carrera)}</strong> queda anulada.`)
      : "",
    parrafo(
      "El dinero vuelve a la misma tarjeta con la que pagaste. Según tu banco, puede tardar unos días en aparecer en tu cuenta.",
    ),
    nota("Si tienes cualquier duda, escribe a la organización de la carrera."),
  ].join("\n");

  return {
    asunto: `Te hemos devuelto ${importe(d)} · ${d.carrera}`,
    html: envoltorio({ titulo: "Te hemos hecho una devolución", interior }),
  };
}

/** Copia interna para la organización */
export function correoOrganizador(d: DatosDevolucion): Correo {
  const nombre = nombreDe(d);

  const interior = [
    parrafo(
      `Se ha devuelto <strong>${importe(d)}</strong> a ${nombre ? `<strong>${esc(nombre)}</strong>` : "un corredor"} de <strong>${esc(d.carrera)}</strong>${
        d.recorrido ? ` (${esc(d.recorrido)})` : ""
      }.`,
    ),
    tablaDatos([
      nombre && fila("Corredor/a", nombre),
      d.dorsal ? fila("Dorsal", d.dorsal, true) : null,
      d.email ? fila("Email", d.email) : null,
      fila("Carrera", d.carrera),
      d.recorrido ? fila("Recorrido", d.recorrido) : null,
      fila("Importe devuelto", importe(d), true),
      d.orderNumber ? fila("Referencia de pago", d.orderNumber) : null,
      fila("Inscripción", d.anulada ? "Anulada" : "Sigue en vigor"),
      fila("Forma", d.origen === "externa" ? "Hecha fuera de Camberas y apuntada a mano" : "Pedida a Redsys desde Camberas"),
      d.motivo && d.motivo.trim() ? fila("Motivo", d.motivo.trim()) : null,
      d.cedida ? fila("Aviso", "Dorsal cedido: el dinero vuelve a la tarjeta de quien pagó") : null,
    ]),
    nota(
      d.anulada
        ? "La plaza queda libre. El corredor ha recibido su aviso por correo."
        : "La inscripción sigue activa con su dorsal. El corredor ha recibido su aviso por correo.",
    ),
  ].join("\n");

  return {
    asunto: `Devolución hecha: ${d.carrera} — ${nombre ?? "corredor/a"}`,
    html: envoltorio({ titulo: "Devolución a un corredor", interior, pie: "Aviso interno de camberas.com" }),
  };
}
