/**
 * Aviso a soporte de una solicitud de organizador, con el diseño de la casa
 * (_shared/emailCamberas.ts). Módulo puro: se puede importar desde Node/tsx
 * para generar vistas previas. Todo lo que escribe quien solicita va escapado.
 */
import { boton, cajaInfo, envoltorio, fila, parrafo, tablaDatos } from "../_shared/emailCamberas.ts";

export interface DatosSolicitud {
  nombre: string;
  email: string;
  club?: string | null;
}

export function avisoSolicitudOrganizador(d: DatosSolicitud): { asunto: string; html: string } {
  return {
    asunto: `[Nueva Solicitud] Organizador: ${d.nombre}`,
    html: envoltorio({
      titulo: "Nueva solicitud de organizador",
      interior: [
        parrafo(
          "Un nuevo usuario ha solicitado el rol de <strong>Organizador</strong> y necesita la aprobación de un " +
            "administrador.",
        ),
        tablaDatos([
          fila("Nombre", d.nombre),
          fila("Email", d.email),
          d.club ? fila("Club u organización", d.club) : null,
        ]),
        cajaInfo(
          "Acción requerida",
          "Entra en el panel de administración para aprobar o rechazar esta solicitud.",
          "verde",
        ),
        boton("https://camberas.com/admin", "Ir al panel de admin"),
      ].join("\n"),
      pie: "Aviso interno de camberas.com",
    }),
  };
}
