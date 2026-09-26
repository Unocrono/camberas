/**
 * Correos de send-welcome-email con el diseño de la casa
 * (_shared/emailCamberas.ts): aquí solo va el texto.
 *
 *  - correoConfirmarCuenta: alta con enlace para confirmar el email. Solo
 *    sale si quien llama pasa confirmationUrl; hoy ningún cliente lo hace
 *    (Auth, OrganizerAuth, GrupettaCapo y TeamAccessCard mandan solo email y
 *    nombre), pero se conserva por si vuelve a usarse.
 *  - correoBienvenida: cuenta creada, sin confirmación.
 *
 * Módulo puro (sin Deno ni imports de URL): se puede importar desde un
 * script de Node/tsx para generar vistas previas.
 */
import { boton, cajaInfo, CREMA, envoltorio, esc, lista, nota, parrafo, VERDE } from "../_shared/emailCamberas.ts";

export interface Correo {
  asunto: string;
  html: string;
}

/** El cierre "Un saludo, el equipo de camberas.com" que llevaban los dos */
const PIE = "Un saludo del equipo de camberas.com";

/** El enlace entero en texto, por si el botón no abre (se escapa) */
const enlaceCopiable = (url: string): string =>
  `<p style="background: ${CREMA}; padding: 12px 14px; border-radius: 6px; margin: 8px 0 0; word-break: break-all; font-size: 12px; line-height: 1.5;">
    <a href="${esc(url)}" style="color: ${VERDE};">${esc(url)}</a>
  </p>`;

export interface DatosConfirmarCuenta {
  /** Nombre, o la parte del email antes de la @ si no hay (texto, se escapa) */
  nombre: string;
  /** Enlace de confirmación, ya validado en index.ts (https y host de confianza) */
  confirmationUrl: string;
}

export function correoConfirmarCuenta({ nombre, confirmationUrl }: DatosConfirmarCuenta): Correo {
  return {
    asunto: "Confirma tu cuenta en Camberas",
    html: envoltorio({
      titulo: `¡Bienvenido/a, ${nombre}!`,
      interior: [
        parrafo(
          "Gracias por registrarte en <strong>Camberas</strong>. Para completar tu registro y activar tu cuenta, " +
            "confirma tu dirección de email.",
        ),
        boton(confirmationUrl, "Confirmar mi cuenta"),
        nota("Si el botón no funciona, copia y pega este enlace en tu navegador:"),
        enlaceCopiable(confirmationUrl),
        nota("Si no has creado una cuenta en Camberas, puedes ignorar este correo."),
      ].join("\n"),
      pie: PIE,
    }),
  };
}

export interface DatosBienvenida {
  /** Nombre, o la parte del email antes de la @ si no hay (texto, se escapa) */
  nombre: string;
}

export function correoBienvenida({ nombre }: DatosBienvenida): Correo {
  return {
    asunto: "¡Bienvenido/a a Camberas!",
    html: envoltorio({
      titulo: `¡Bienvenido/a, ${nombre}!`,
      interior: [
        parrafo(
          "Tu cuenta en <strong>Camberas</strong> se ha creado correctamente. Ya puedes empezar a explorar " +
            "las mejores carreras de trail y montaña en España.",
        ),
        cajaInfo(
          "¿Qué puedes hacer ahora?",
          lista([
            "Explorar las próximas carreras disponibles",
            "Inscribirte en tus carreras favoritas",
            "Completar tu perfil de corredor",
            "Seguir tu historial de participaciones",
          ]),
          "verde",
        ),
        boton("https://camberas.com/races", "Ver carreras disponibles"),
      ].join("\n"),
      pie: PIE,
    }),
  };
}
