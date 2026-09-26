/**
 * Correo con los enlaces para ceder el dorsal, con el diseño de la casa
 * (_shared/emailCamberas.ts). Módulo puro: se puede importar desde Node/tsx
 * para generar vistas previas. Los enlaces llevan el token de la cesión.
 */
import { CREMA, envoltorio, esc, fechaLarga, NARANJA, nota, parrafo, saludo, VERDE } from "../_shared/emailCamberas.ts";

export interface Cedible {
  registration_id: string;
  race_name: string;
  race_date: string;
  distance_name: string;
  dorsal: number | null;
  token: string;
}

/** Una tarjeta por inscripción cedible, con su botón */
const tarjeta = (i: Cedible, siteUrl: string): string =>
  `<div style="background: ${CREMA}; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 16px 18px; margin: 16px 0;">
    <p style="margin: 0 0 4px; font-size: 16px; font-weight: bold; color: #1f2937;">${esc(i.race_name)}</p>
    <p style="margin: 0 0 2px; color: #4b5563; font-size: 14px;">${esc(i.distance_name)}${
      i.dorsal != null ? ` · dorsal ${esc(i.dorsal)}` : ""
    }</p>
    <p style="margin: 0 0 14px; color: #6b7280; font-size: 13px;">${esc(fechaLarga(i.race_date))}</p>
    <a href="${esc(`${siteUrl}/ceder/${i.token}`)}"
       style="display: inline-block; background: ${NARANJA}; color: #ffffff; text-decoration: none;
              padding: 11px 22px; border-radius: 30px; font-size: 14px; font-weight: bold;">Ceder este dorsal</a>
  </div>`;

export function correoCesion(nombre: string | null, items: Cedible[], siteUrl: string): { asunto: string; html: string } {
  return {
    asunto:
      items.length === 1
        ? `Tu enlace para ceder el dorsal de ${items[0].race_name}`
        : "Tus enlaces para ceder dorsal",
    html: envoltorio({
      titulo: "Ceder tu dorsal",
      interior: [
        saludo(nombre),
        parrafo("Has pedido el enlace para pasarle tu plaza a otra persona. Aquí lo tienes:"),
        items.map((i) => tarjeta(i, siteUrl)).join(""),
        nota(
          "Pásale el enlace a quien vaya a correr. Rellenará sus datos, aceptará el reglamento y el dorsal " +
            "pasará a su nombre. <strong>Tú dejarás de figurar en la salida.</strong>",
        ),
        nota("El enlace caduca en 72 horas y solo sirve una vez. Mándaselo únicamente a quien de verdad vaya a usarlo."),
        nota("Si no has pedido esto, ignora el correo: mientras nadie abra el enlace, tu inscripción sigue igual."),
      ].join("\n"),
      pie: "Enviado desde camberas.com a petición tuya",
    }),
  };
}
