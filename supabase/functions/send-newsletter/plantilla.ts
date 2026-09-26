/**
 * Newsletter, con el diseño de la casa (_shared/emailCamberas.ts): cabecera
 * y pie de Camberas alrededor del contenido que escribe el admin.
 *
 * El contenido es HTML DE CONFIANZA (lo escribe el admin en el panel, con
 * el {{name}} ya sustituido): NO se escapa. El enlace de baja va al final,
 * como antes.
 *
 * Módulo puro: se puede importar desde Node/tsx para generar vistas previas.
 */
import { enlace, envoltorio, nota } from "../_shared/emailCamberas.ts";

export interface DatosNewsletter {
  /** Título del correo (el asunto de la campaña) */
  titulo: string;
  /** HTML del admin, ya personalizado. Se inserta tal cual */
  contenidoHtml: string;
  /** Enlace a newsletter-unsubscribe con el email */
  unsubscribeUrl: string;
}

export function correoNewsletter(d: DatosNewsletter): { html: string } {
  return {
    html: envoltorio({
      titulo: d.titulo,
      interior: [
        `<div style="color: #4b5563; font-size: 16px; line-height: 1.6;">${d.contenidoHtml}</div>`,
        nota(
          "Has recibido este correo porque estás suscrito a la newsletter de Camberas. " +
            enlace(d.unsubscribeUrl, "Darse de baja"),
        ),
      ].join("\n"),
      pie: "Newsletter de camberas.com",
    }),
  };
}
