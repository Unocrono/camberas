/**
 * Aviso a soporte de una carrera nueva, con el diseño de la casa
 * (_shared/emailCamberas.ts). Módulo puro: se puede importar desde Node/tsx
 * para generar vistas previas. Todo lo que escribe el organizador va escapado.
 */
import { boton, cajaInfo, envoltorio, fila, parrafo, tablaDatos } from "../_shared/emailCamberas.ts";

export interface DatosCarreraNueva {
  carrera: string;
  /** Fecha ya formateada ("29 de noviembre de 2026") */
  fecha: string;
  lugar: string;
  /** "Trail" o "MTB" */
  tipo: string;
  organizador?: string | null;
  emailOrganizador?: string | null;
}

export function avisoCarreraNueva(d: DatosCarreraNueva): { asunto: string; html: string } {
  return {
    asunto: `[Nueva Carrera] ${d.carrera}`,
    html: envoltorio({
      titulo: "Nueva carrera añadida",
      interior: [
        parrafo("Un organizador ha creado una nueva carrera en la plataforma."),
        tablaDatos([
          fila("Nombre", d.carrera, true),
          fila("Fecha", d.fecha),
          fila("Ubicación", d.lugar),
          fila("Tipo", d.tipo),
        ]),
        d.organizador || d.emailOrganizador
          ? tablaDatos([
              d.organizador ? fila("Organizador", d.organizador) : null,
              d.emailOrganizador ? fila("Email", d.emailOrganizador) : null,
            ])
          : "",
        cajaInfo("Info", "Puedes revisar los detalles de la carrera desde el panel de administración.", "verde"),
        boton("https://camberas.com/admin", "Ir al panel de admin"),
      ].join("\n"),
      pie: "Aviso interno de camberas.com",
    }),
  };
}
