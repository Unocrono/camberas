/**
 * Correos del formulario "Contactar con el organizador" (página de la carrera).
 *
 * Dos correos por consulta:
 *  - avisoOrganizador: al organizador, con reply-to al participante (lo pone
 *    index.ts): responde desde su buzón y le llega a quien preguntó.
 *  - copiaParticipante: copia de confirmación a quien escribió.
 *
 * Módulo puro (sin Deno ni imports de URL) para poder generar vistas previas
 * con tsx. Todo lo que escribe el participante pasa por esc().
 */
import { cajaInfo, envoltorio, esc, fila, nota, parrafo, saludo, tablaDatos } from "../_shared/emailCamberas.ts";

export interface DatosConsulta {
  /** Nombre de la carrera */
  carrera: string;
  /** Nombre que escribió el participante */
  nombre: string;
  /** Email del participante (el reply-to del aviso) */
  email: string;
  /** Mensaje tal cual lo escribió (texto, con saltos de línea) */
  mensaje: string;
}

export interface Correo {
  asunto: string;
  html: string;
}

/** El mensaje del participante: escapado, con sus saltos de línea y sin desbordar */
const mensajeHtml = (texto: string): string =>
  `<div style="overflow-wrap: anywhere; word-break: break-word;">${esc(texto).replace(/\r?\n/g, "<br>")}</div>`;

/** Al organizador: la consulta, quién la manda y cómo responder */
export function avisoOrganizador(d: DatosConsulta): Correo {
  return {
    asunto: `[${d.carrera}] Consulta de ${d.nombre}`,
    html: envoltorio({
      titulo: `Nueva consulta sobre ${d.carrera}`,
      interior: [
        parrafo(`Te han escrito desde la página de <strong>${esc(d.carrera)}</strong> en camberas.com.`),
        tablaDatos([fila("De", d.nombre), fila("Email", d.email), fila("Carrera", d.carrera)]),
        cajaInfo("Mensaje", mensajeHtml(d.mensaje), "verde"),
        nota(`Puedes responder directamente a este correo: la respuesta le llegará a ${esc(d.nombre)}.`),
      ].join("\n"),
      pie: "Enviado desde la página de la carrera en camberas.com",
    }),
  };
}

/** Al participante: confirmación de que la consulta ha llegado, con su mensaje */
export function copiaParticipante(d: DatosConsulta): Correo {
  return {
    asunto: `Tu consulta sobre ${d.carrera} ha sido enviada`,
    html: envoltorio({
      titulo: "¡Consulta enviada!",
      interior: [
        saludo(d.nombre),
        parrafo(
          `Hemos hecho llegar tu consulta al organizador de <strong>${esc(d.carrera)}</strong>. ` +
            "Te responderá directamente a esta dirección de correo.",
        ),
        cajaInfo("Tu mensaje", mensajeHtml(d.mensaje)),
        parrafo("Un saludo,<br><strong>El equipo de Camberas</strong>"),
      ].join("\n"),
      pie: "Copia de la consulta que enviaste desde camberas.com",
    }),
  };
}
