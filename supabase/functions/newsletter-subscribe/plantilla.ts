/**
 * Correos de newsletter-subscribe con el diseño de la casa
 * (_shared/emailCamberas.ts): aquí solo va el texto.
 *
 *  - correoAltaSuscripcion: suscripción nueva, pide confirmarla.
 *  - correoReenvioConfirmacion: el email ya estaba apuntado sin confirmar;
 *    se le vuelve a mandar el enlace.
 *
 * Los dos llevan el enlace a newsletter-confirm con el token de la
 * suscripción, que monta index.ts.
 *
 * Módulo puro (sin Deno ni imports de URL): se puede importar desde un
 * script de Node/tsx para generar vistas previas.
 */
import { boton, envoltorio, nota, parrafo, saludo } from "../_shared/emailCamberas.ts";

export interface Correo {
  asunto: string;
  html: string;
}

export interface DatosConfirmarSuscripcion {
  /** Enlace a newsletter-confirm?token=… (se escapa en el botón) */
  confirmUrl: string;
}

const ASUNTO = "Confirma tu suscripción a Camberas";
const TITULO = "¡Bienvenido/a a Camberas!";

/** El pie que llevaba el alta, con el año al día (antes fijo en 2025) */
const pie = (): string => `© ${new Date().getFullYear()} Camberas · Tu plataforma de carreras de montaña`;

const ignorar = (): string => nota("Si no solicitaste esta suscripción, puedes ignorar este correo.");

export function correoAltaSuscripcion({ confirmUrl }: DatosConfirmarSuscripcion): Correo {
  return {
    asunto: ASUNTO,
    html: envoltorio({
      titulo: TITULO,
      interior: [
        saludo(),
        parrafo(
          "Gracias por suscribirte a nuestra newsletter. Recibirás las últimas noticias sobre carreras de " +
            "trail y montaña.",
        ),
        parrafo("Para confirmar tu suscripción, haz clic en el siguiente botón:"),
        boton(confirmUrl, "Confirmar suscripción"),
        ignorar(),
      ].join("\n"),
      pie: pie(),
    }),
  };
}

export function correoReenvioConfirmacion({ confirmUrl }: DatosConfirmarSuscripcion): Correo {
  return {
    asunto: ASUNTO,
    html: envoltorio({
      titulo: TITULO,
      interior: [
        saludo(),
        parrafo("Confirma tu suscripción haciendo clic en el siguiente botón:"),
        boton(confirmUrl, "Confirmar suscripción"),
        ignorar(),
      ].join("\n"),
      pie: pie(),
    }),
  };
}
