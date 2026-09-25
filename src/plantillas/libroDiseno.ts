import { z } from "zod";
import type { CSSProperties } from "react";

/**
 * Libro de diseño de la web de una carrera: los tokens que el organizador
 * puede tocar. Se guarda en race_web.tema como JSON y se valida aquí; lo que
 * no valide se ignora clave a clave y entra el valor por defecto de la
 * plantilla. Nunca CSS libre: solo estos tokens.
 *
 * Se aplican como variables CSS --wp-* en el contenedor .wp de la plantilla
 * (src/plantillas/gurriana/estilos.css y tailwind.config.ts → colors.wp).
 */

/** Fuentes permitidas (Google Fonts). Lista cerrada: ni URLs ni nombres libres. */
export const FUENTES = {
  "Barlow Condensed": { css: "Barlow+Condensed:wght@600;700;800", fallback: "Impact, 'Arial Narrow', sans-serif" },
  "Barlow": { css: "Barlow:wght@400;500;600;700", fallback: "'Helvetica Neue', Arial, sans-serif" },
  "Bebas Neue": { css: "Bebas+Neue", fallback: "Impact, sans-serif" },
  "Archivo Black": { css: "Archivo+Black", fallback: "Impact, sans-serif" },
  "Roboto Condensed": { css: "Roboto+Condensed:wght@400;700", fallback: "'Arial Narrow', sans-serif" },
  "Oswald": { css: "Oswald:wght@500;700", fallback: "Impact, sans-serif" },
  "Montserrat": { css: "Montserrat:wght@400;600;800", fallback: "Arial, sans-serif" },
  "Inter": { css: "Inter:wght@400;500;600", fallback: "system-ui, sans-serif" },
} as const;

export type Fuente = keyof typeof FUENTES;
const NOMBRES_FUENTES = Object.keys(FUENTES) as [Fuente, ...Fuente[]];

/** Secciones que la plantilla sabe pintar, en su orden por defecto */
export const SECCIONES_IDS = [
  "hero",
  "cifras",
  "cinta",
  "beneficiario",
  "recorridos",
  "inscripcion",
  "reglamento",
  "dia",
  "premios",
  "servicios",
  "camiseta",
  "info",
  "medioambiente",
  "patrocinadores",
] as const;
export type SeccionId = (typeof SECCIONES_IDS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex de 6 dígitos");

export const LibroDisenoSchema = z.object({
  colorMarca: hex,
  colorAccion: hex,
  colorSecundario: hex,
  fuenteDisplay: z.enum(NOMBRES_FUENTES),
  fuenteTexto: z.enum(NOMBRES_FUENTES),
  radio: z.enum(["10", "16", "20"]),
  hero: z.enum(["foto", "color", "textura"]),
  cinta: z.boolean(),
  secciones: z.array(z.object({ id: z.enum(SECCIONES_IDS), activa: z.boolean() })),
});

export type LibroDiseno = z.infer<typeof LibroDisenoSchema>;

/**
 * Defaults ← tema válido, clave a clave: un tema con un color mal escrito no
 * tira todo el libro, solo esa clave.
 */
export function resolverTokens(porDefecto: LibroDiseno, tema: unknown): LibroDiseno {
  if (!tema || typeof tema !== "object" || Array.isArray(tema)) return porDefecto;
  const t = tema as Record<string, unknown>;
  const salida: Record<string, unknown> = { ...porDefecto };
  for (const clave of Object.keys(LibroDisenoSchema.shape) as (keyof LibroDiseno)[]) {
    if (!(clave in t)) continue;
    const parcial = LibroDisenoSchema.shape[clave].safeParse(t[clave]);
    if (parcial.success) salida[clave] = parcial.data;
  }
  // Secciones: las que el tema no menciona se añaden al final con su default
  const secciones = salida.secciones as LibroDiseno["secciones"];
  const vistas = new Set(secciones.map((s) => s.id));
  for (const s of porDefecto.secciones) if (!vistas.has(s.id)) secciones.push(s);
  return salida as LibroDiseno;
}

// ── Color: utilidades pequeñas, sin dependencias ─────────────────────────
function hexARgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbAHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Luminancia relativa WCAG */
function luminancia(h: string): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexARgb(h);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contraste WCAG entre dos colores */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mezcla hacia blanco (t > 0) o negro (t < 0), t en [-1, 1] */
function mezclar(h: string, t: number): string {
  const [r, g, b] = hexARgb(h);
  const destino = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgbAHex(r + (destino - r) * k, g + (destino - g) * k, b + (destino - b) * k);
}

/** Texto que contrasta con un fondo: tinta oscura o crema */
export function textoSobre(fondo: string, oscuro = "#0F1A08", claro = "#FFFFFF"): string {
  return contraste(fondo, claro) >= contraste(fondo, oscuro) ? claro : oscuro;
}

/**
 * Variables CSS de un libro de diseño. Se ponen como `style` en el wrapper
 * .wp; tailwind.config.ts las expone como colores wp-*.
 */
export function variablesCss(t: LibroDiseno): CSSProperties {
  const display = FUENTES[t.fuenteDisplay];
  const texto = FUENTES[t.fuenteTexto];
  return {
    "--wp-marca": t.colorMarca,
    "--wp-marca-oscuro": mezclar(t.colorMarca, -0.35),
    "--wp-marca-claro": mezclar(t.colorMarca, 0.85),
    "--wp-marca-texto": textoSobre(t.colorMarca),
    "--wp-accion": t.colorAccion,
    "--wp-accion-texto": textoSobre(t.colorAccion),
    "--wp-secundario": t.colorSecundario,
    "--wp-secundario-texto": textoSobre(t.colorSecundario),
    "--wp-fuente-display": `'${t.fuenteDisplay}', ${display.fallback}`,
    "--wp-fuente-texto": `'${t.fuenteTexto}', ${texto.fallback}`,
    "--wp-radio": `${t.radio}px`,
  } as CSSProperties;
}

/** Carga (una vez por combinación) las fuentes de Google Fonts que pide el libro. */
export function cargarFuentes(t: LibroDiseno): void {
  if (typeof document === "undefined") return;
  const familias = Array.from(new Set([t.fuenteDisplay, t.fuenteTexto])).map((f) => `family=${FUENTES[f].css}`);
  const href = `https://fonts.googleapis.com/css2?${familias.join("&")}&display=swap`;
  const id = "wp-fuentes";
  const existente = document.getElementById(id) as HTMLLinkElement | null;
  if (existente?.href === href) return;
  const link = existente ?? document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  if (!existente) document.head.appendChild(link);
}

/** Avisos de contraste para el editor del panel (no bloquean; informan) */
export function avisosContraste(t: LibroDiseno): string[] {
  const avisos: string[] = [];
  if (contraste(t.colorMarca, textoSobre(t.colorMarca)) < 4.5) avisos.push("El color de marca no contrasta bien con el texto: sube o baja su oscuridad.");
  if (contraste(t.colorAccion, textoSobre(t.colorAccion)) < 4.5) avisos.push("El color de acción no contrasta con el texto del botón.");
  if (contraste(t.colorAccion, t.colorMarca) < 3) avisos.push("El botón de acción apenas se distingue sobre el color de marca (hero, bloques oscuros).");
  return avisos;
}
