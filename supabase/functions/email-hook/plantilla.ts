/**
 * Correos de acceso (Supabase Auth, send-email hook) con el diseño de la casa
 * (_shared/emailCamberas.ts): confirmar la cuenta, recuperar la contraseña,
 * invitación y cambio de email. Aquí solo va el texto; el enlace de acción
 * (actionUrl, con el token) lo monta index.ts y llega intacto.
 *
 * Módulo puro (sin Deno ni imports de URL): se puede importar desde un script
 * de Node/tsx para generar vistas previas.
 */
import { boton, cajaInfo, CREMA, envoltorio, esc, nota, parrafo, VERDE } from "../_shared/emailCamberas.ts";

export interface Correo {
  asunto: string;
  html: string;
}

export interface DatosAcceso {
  /** Nombre del perfil o la parte del email antes de la @ (texto, se escapa) */
  nombre: string;
  /** Enlace de Supabase /auth/v1/verify?token=… (se escapa en el HTML) */
  actionUrl: string;
}

const PIE = "Un saludo del equipo de camberas.com";

/** El enlace entero en texto, por si el botón no abre */
const enlaceCopiable = (url: string): string =>
  nota("Si el botón no funciona, copia y pega este enlace en tu navegador:") +
  `<p style="background: ${CREMA}; padding: 12px 14px; border-radius: 6px; margin: 8px 0 0; word-break: break-all; font-size: 12px; line-height: 1.5;">
    <a href="${esc(url)}" style="color: ${VERDE};">${esc(url)}</a>
  </p>`;

/** Correo según email_action_type (mismos asuntos y casos que antes) */
export function correoAcceso(tipo: string, { nombre, actionUrl }: DatosAcceso): Correo {
  switch (tipo) {
    case "signup":
    case "email_confirmation":
      return {
        asunto: "Confirma tu cuenta en Camberas",
        html: envoltorio({
          titulo: `¡Bienvenido/a, ${nombre}!`,
          interior: [
            parrafo(
              "Gracias por registrarte en <strong>Camberas</strong>. Para completar tu registro y activar tu " +
                "cuenta, confirma tu dirección de email.",
            ),
            boton(actionUrl, "Confirmar mi cuenta"),
            enlaceCopiable(actionUrl),
            nota("Si no has creado una cuenta en Camberas, puedes ignorar este correo."),
          ].join("\n"),
          pie: PIE,
        }),
      };

    case "recovery":
    case "magiclink":
      return {
        asunto: "Recupera tu contraseña - Camberas",
        html: envoltorio({
          titulo: "Recuperación de contraseña",
          interior: [
            parrafo(
              `Hola ${esc(nombre)}, hemos recibido una solicitud para restablecer la contraseña de tu cuenta en ` +
                "<strong>Camberas</strong>.",
            ),
            boton(actionUrl, "Restablecer contraseña"),
            enlaceCopiable(actionUrl),
            cajaInfo(
              "Nota de seguridad",
              "Este enlace expirará en 24 horas. Si no solicitaste restablecer tu contraseña, ignora este correo.",
            ),
          ].join("\n"),
          pie: PIE,
        }),
      };

    case "invite":
      return {
        asunto: "Has sido invitado a Camberas",
        html: envoltorio({
          titulo: "¡Has sido invitado!",
          interior: [
            parrafo(
              "Has recibido una invitación para unirte a <strong>Camberas</strong>, la plataforma de carreras de " +
                "trail y montaña en España.",
            ),
            boton(actionUrl, "Aceptar invitación"),
            enlaceCopiable(actionUrl),
          ].join("\n"),
          pie: PIE,
        }),
      };

    case "email_change":
      return {
        asunto: "Confirma tu nuevo email - Camberas",
        html: envoltorio({
          titulo: "Confirma tu nuevo email",
          interior: [
            parrafo(
              `Hola ${esc(nombre)}, has solicitado cambiar tu dirección de email en <strong>Camberas</strong>. ` +
                "Confirma tu nueva dirección de email.",
            ),
            boton(actionUrl, "Confirmar nuevo email"),
            enlaceCopiable(actionUrl),
            nota("Si no solicitaste este cambio, ignora este correo y tu dirección de email no se modificará."),
          ].join("\n"),
          pie: PIE,
        }),
      };

    default:
      return {
        asunto: "Notificación de Camberas",
        html: envoltorio({
          titulo: "Notificación de Camberas",
          interior: [
            parrafo(`Hola ${esc(nombre)},`),
            parrafo("Has recibido esta notificación de Camberas."),
            boton(actionUrl, "Continuar"),
          ].join("\n"),
          pie: PIE,
        }),
      };
  }
}
