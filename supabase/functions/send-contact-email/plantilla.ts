/**
 * Correos del formulario de contacto general de la web (/contact).
 *
 * Dos correos por mensaje:
 *  - avisoSoporte: a soporte@camberas.com, con reply-to a quien escribe (lo
 *    pone index.ts): se contesta desde el buzón y le llega a esa persona.
 *  - confirmacionUsuario: acuse de recibo a quien escribió, con su mensaje.
 *
 * Módulo puro (sin Deno ni imports de URL) para poder generar vistas previas
 * con tsx. Todo lo que escribe el usuario pasa por esc().
 */
import { cajaInfo, envoltorio, esc, fila, nota, parrafo, saludo, tablaDatos } from "../_shared/emailCamberas.ts";

export interface DatosContacto {
  /** Nombre que escribió el usuario */
  nombre: string;
  /** Email del usuario (el reply-to del aviso) */
  email: string;
  /** Asunto que escribió el usuario */
  asunto: string;
  /** Mensaje tal cual lo escribió (texto, con saltos de línea) */
  mensaje: string;
}

export interface Correo {
  asunto: string;
  html: string;
}

/** El mensaje del usuario: escapado, con sus saltos de línea y sin desbordar */
const mensajeHtml = (texto: string): string =>
  `<div style="overflow-wrap: anywhere; word-break: break-word;">${esc(texto).replace(/\r?\n/g, "<br>")}</div>`;

/** Al equipo de Camberas (soporte): el mensaje y quién lo manda */
export function avisoSoporte(d: DatosContacto): Correo {
  return {
    asunto: `[Contacto Web] ${d.asunto}`,
    html: envoltorio({
      titulo: "Nuevo mensaje de contacto",
      interior: [
        tablaDatos([fila("De", d.nombre), fila("Email", d.email), fila("Asunto", d.asunto)]),
        cajaInfo("Mensaje", mensajeHtml(d.mensaje), "verde"),
        nota(`Puedes responder directamente a este correo: la respuesta le llegará a ${esc(d.nombre)}.`),
      ].join("\n"),
      pie: "Aviso interno de camberas.com: formulario de contacto de la web",
    }),
  };
}

/** A quien escribió: acuse de recibo con su mensaje */
export function confirmacionUsuario(d: DatosContacto): Correo {
  return {
    asunto: "Hemos recibido tu mensaje - Camberas",
    html: envoltorio({
      titulo: "¡Gracias por contactarnos!",
      interior: [
        saludo(d.nombre),
        parrafo("Hemos recibido tu mensaje y te responderemos lo antes posible."),
        cajaInfo("Tu mensaje", mensajeHtml(d.mensaje)),
        parrafo("Un saludo,<br><strong>El equipo de Camberas</strong>"),
      ].join("\n"),
      pie: "Has recibido este correo porque nos escribiste desde camberas.com",
    }),
  };
}
