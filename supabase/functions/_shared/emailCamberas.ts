/**
 * Diseño de los correos de Camberas (26-sep-2026).
 *
 * Una sola fuente para el aspecto de TODOS los correos: la franja arena con
 * el nombre y el lema, la ilustración de las colinas, los recuadros de datos
 * en crema con filo verde, el botón naranja redondeado y el pie crema. Es el
 * diseño que estrenaron reenviar-comprobantes y recuperar-pagos; aquí queda
 * en piezas para que cada función solo ponga el texto.
 *
 * Reglas:
 *  - Todo lo que viene de fuera (nombres, carreras, respuestas, mensajes)
 *    pasa por esc(). Las piezas escapan lo que reciben como TEXTO; las que
 *    reciben HTML (interior, parrafo) esperan HTML ya escapado.
 *  - Sin dependencias ni imports de URL: se puede importar desde un script
 *    de Node/tsx para generar vistas previas.
 *  - Estilos en línea (los clientes de correo ignoran <style>), anchura 600.
 */

// Paleta Camberas (docs/paleta-camberas.md)
export const VERDE = "#235940";
export const NARANJA = "#EC7C2B";
export const CREMA = "#FAF6EC";
export const ARENA = "#FCEBD6";
export const TINTA = "#0E2419";
export const COLINA_OSCURA = "#1E5B38";
const GRIS_TEXTO = "#4b5563";
const GRIS_SUAVE = "#6b7280";

const sitio = (): string => {
  try {
    const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
    return env?.get("SITE_URL") ?? "https://camberas.com";
  } catch {
    return "https://camberas.com";
  }
};

/**
 * Cabecera ilustrada (cielo arena, sol y las tres colinas). Imagen servida
 * desde la web: las formas hechas con HTML no se ven igual en todos los
 * correos; si se bloquean las imágenes queda la franja arena con el nombre.
 */
export const CABECERA_URL = `${sitio()}/email/cabecera-colinas.png`;

/** Escapar texto para meterlo en HTML */
export const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 1.174,50 € (useGrouping explícito: no todos los runtimes agrupan) */
export const euros = (n: number): string =>
  Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) + " €";

/** "domingo, 29 de noviembre de 2026" a partir de "2026-11-29" (o un ISO) */
export const fechaLarga = (iso: string): string => {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  return isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

interface Envoltorio {
  /** Título grande del cuerpo (texto, se escapa) */
  titulo: string;
  /** Cuerpo en HTML ya montado con las piezas de abajo */
  interior: string;
  /** Línea del pie (texto, se escapa). Por defecto la de las inscripciones */
  pie?: string;
  /** Lema bajo "Camberas" (texto) */
  lema?: string;
}

/** El correo entero: cabecera arena + colinas + cuerpo + pie crema */
export function envoltorio({ titulo, interior, pie, lema }: Envoltorio): string {
  const piePorDefecto = "Inscripción gestionada con <strong>camberas.com</strong>";
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: ${ARENA}; padding: 24px 30px 6px; text-align: center;">
      <h1 style="color: ${TINTA}; margin: 0; font-size: 28px; letter-spacing: 0.5px;">Camberas</h1>
      <p style="color: ${COLINA_OSCURA}; margin: 6px 0 0; font-size: 13px;">${esc(lema ?? "Carreras de trail y montaña")}</p>
    </div>
    <img src="${CABECERA_URL}" width="600" alt=""
         style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; background: ${ARENA};">
    <div style="padding: 32px 30px 36px;">
      <h2 style="color: ${TINTA}; margin: 0 0 16px; font-size: 24px; line-height: 1.25;">${esc(titulo)}</h2>
      ${interior}
    </div>
    <div style="background: ${CREMA}; padding: 18px 30px; text-align: center;">
      <p style="color: ${GRIS_SUAVE}; font-size: 12px; margin: 0; line-height: 1.5;">
        ${pie != null ? esc(pie) : piePorDefecto}
      </p>
    </div>
  </div>`;
}

/** Párrafo normal. Recibe HTML (escapa tú los datos con esc) */
export const parrafo = (html: string): string =>
  `<p style="color: ${GRIS_TEXTO}; font-size: 16px; line-height: 1.6; margin: 0 0 14px;">${html}</p>`;

/** "Hola Nombre," o "Hola," */
export const saludo = (nombre?: string | null): string =>
  parrafo(nombre && String(nombre).trim() ? `Hola ${esc(String(nombre).trim())},` : "Hola,");

/** Nota pequeña gris (avisos, letra pequeña). Recibe HTML */
export const nota = (html: string): string =>
  `<p style="color: ${GRIS_SUAVE}; font-size: 13px; line-height: 1.6; margin: 16px 0 0;">${html}</p>`;

/** Una fila etiqueta · valor para tablaDatos (los dos son TEXTO, se escapan) */
export function fila(etiqueta: string, valor: string | number, destacado = false): string {
  return `<tr>
    <td style="padding: 6px 0; color: ${GRIS_TEXTO}; vertical-align: top;">${esc(etiqueta)}</td>
    <td style="padding: 6px 0 6px 12px; color: ${destacado ? VERDE : "#1f2937"}; text-align: right;${
      destacado ? " font-weight: bold;" : ""
    }">${esc(valor)}</td>
  </tr>`;
}

/** Recuadro crema con filo verde y filas (usa fila()); las vacías se ignoran */
export const tablaDatos = (filas: (string | null | undefined | false)[]): string => {
  const contenido = filas.filter(Boolean).join("");
  return contenido
    ? `<div style="background: ${CREMA}; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 18px 20px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">${contenido}</table>
      </div>`
    : "";
};

/** Recuadro gris con título (texto) y contenido HTML: "Datos de tu inscripción", "¿Qué viene ahora?"… */
export const cajaInfo = (titulo: string, html: string, color: "gris" | "verde" = "gris"): string =>
  `<div style="background: #f9fafb; border-left: 4px solid ${color === "verde" ? VERDE : "#9ca3af"}; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 8px; color: #1f2937; font-size: 15px;">${esc(titulo)}</h3>
    <div style="color: ${GRIS_TEXTO}; font-size: 14px; line-height: 1.6;">${html}</div>
  </div>`;

/** Lista con viñetas. Cada elemento es HTML */
export const lista = (items: string[]): string =>
  `<ul style="margin: 8px 0 0; padding-left: 20px; color: ${GRIS_TEXTO}; font-size: 14px; line-height: 1.8;">${items
    .map((i) => `<li>${i}</li>`)
    .join("")}</ul>`;

/** Botón principal naranja redondeado (href y texto se escapan) */
export const boton = (href: string, texto: string): string =>
  `<div style="text-align: center; margin: 24px 0 12px;">
    <a href="${esc(href)}"
       style="display: inline-block; background: ${NARANJA}; color: #ffffff; text-decoration: none;
              padding: 16px 34px; border-radius: 30px; font-size: 17px; font-weight: bold;">${esc(texto)}</a>
  </div>`;

/** Enlace en línea con el verde de la casa (href y texto se escapan) */
export const enlace = (href: string, texto: string): string =>
  `<a href="${esc(href)}" style="color: ${VERDE}; font-weight: bold;">${esc(texto)}</a>`;

/** Bloque grande del dorsal (verde, número enorme) */
export const tarjetaDorsal = (dorsal: number | string, linea?: string | null): string =>
  `<div style="background: ${VERDE}; color: ${CREMA}; border-radius: 10px; padding: 22px; text-align: center; margin: 24px 0;">
    <p style="margin: 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.85;">Dorsal</p>
    <p style="margin: 6px 0 0; font-size: 56px; font-weight: bold; line-height: 1;">${esc(dorsal)}</p>
    ${linea ? `<p style="margin: 12px 0 0; font-size: 13px; opacity: 0.9;">${esc(linea)}</p>` : ""}
  </div>`;
