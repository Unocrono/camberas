/**
 * Historias de Instagram (1080×1920, JPEG) dibujadas en el servidor: «primero
 * en meta» y «podio provisional». Las funciones de Supabase no tienen canvas,
 * así que se dibuja con ImageScript (WASM), que también rasteriza las fuentes.
 *
 * Mismo aire que los carteles de la web (CartelRuta, CartelResultados): paleta
 * de docs/paleta-camberas.md, titulares en negra y la mosca arriba.
 */

import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const W = 1080;
const H = 1920;
const M = 80;
// Instagram tapa arriba la barra del perfil y abajo la de responder: lo que
// importa va entre estas dos alturas
const ZONA_ARRIBA = 230;
const ZONA_ABAJO = H - 300;

// Paleta Camberas, RGBA
const TINTA = 0x0e2419ff;
const VERDE_RGB = [0x23, 0x59, 0x40];
const TINTA_RGB = [0x0e, 0x24, 0x19];
const NARANJA = 0xec7c2bff;
const CREMA = 0xfaf6ecff;
const CREMA_SUAVE = 0xfaf6ecb8;
const LIMA = 0xc8e85cff;
const MELOCOTON = 0xf6c89aff;
// Oro, plata y bronce, con colores de la paleta
const COLOR_PUESTO = [NARANJA, CREMA, MELOCOTON];

// Las de Google Fonts (OFL), del repositorio oficial
const URL_FUENTES = {
  negra: "https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf",
  texto: "https://raw.githubusercontent.com/google/fonts/main/ofl/barlowsemicondensed/BarlowSemiCondensed-Bold.ttf",
};

export interface Fuentes {
  /** Titulares (Archivo Black) */
  negra: Uint8Array;
  /** Texto (Barlow Semi Condensed Bold) */
  texto: Uint8Array;
}

export interface Puesto {
  nombre: string;
  club: string | null;
  tiempo: string;
}

export interface DatosHistoria {
  tipo: "primero" | "podio";
  carrera: string;
  recorrido: string;
  /** 1 masculino, 2 femenino, 3 mixto */
  sexo: number;
  puestos: Puesto[];
  /** Línea de abajo, p. ej. 'Resultados en directo: camberas.com/slug/live' */
  pie: string | null;
}

let fuentes: Fuentes | null = null;

/** Se descargan una vez por instancia de la función */
export async function cargarFuentes(): Promise<Fuentes> {
  if (fuentes) return fuentes;
  const bajar = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo descargar la fuente ${url} (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const [negra, texto] = await Promise.all([bajar(URL_FUENTES.negra), bajar(URL_FUENTES.texto)]);
  fuentes = { negra, texto };
  return fuentes;
}

/** Una imagen de una URL (foto de la carrera, logo), o null si no se puede */
export async function cargarImagen(url: string | null | undefined): Promise<Image | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const img = await decode(new Uint8Array(await r.arrayBuffer()));
    return img instanceof Image ? img : null;
  } catch {
    return null;
  }
}

/** Texto en una línea que encoge hasta caber; si ni al mínimo, con puntos suspensivos */
async function linea(
  fuente: Uint8Array, tam: number, minimo: number, t: string, color: number, max: number,
): Promise<Image> {
  let s = tam;
  let img = await Image.renderText(fuente, s, t, color);
  while (img.width > max && s > minimo) {
    s -= 4;
    img = await Image.renderText(fuente, s, t, color);
  }
  let corto = t;
  while (img.width > max && corto.length > 3) {
    corto = corto.slice(0, -1);
    img = await Image.renderText(fuente, s, corto.trimEnd() + "…", color);
  }
  return img;
}

/** Titular partido por palabras en hasta `maxLineas`, encogiendo si hace falta */
async function titular(
  fuente: Uint8Array, t: string, color: number, max: number, maxLineas: number, grande = 84,
): Promise<Image[]> {
  const palabras = t.toUpperCase().split(/\s+/).filter(Boolean);
  for (let tam = grande; tam >= 44; tam -= 6) {
    const lineas: string[] = [];
    let l = "";
    for (const p of palabras) {
      const prueba = l ? `${l} ${p}` : p;
      if (l && (await Image.renderText(fuente, tam, prueba, color)).width > max) {
        lineas.push(l);
        l = p;
      } else l = prueba;
    }
    if (l) lineas.push(l);
    if (lineas.length > maxLineas) continue;
    const imgs = await Promise.all(lineas.map((x) => Image.renderText(fuente, tam, x, color)));
    if (imgs.every((i) => i.width <= max)) return imgs;
  }
  return [await linea(fuente, 44, 36, t.toUpperCase(), color, max)];
}

function fondoBase(foto: Image | null): Image {
  const img = new Image(W, H);
  // Degradado de la casa: verde arriba, tinta abajo
  img.fill((_x: number, y: number) => {
    const k = Math.min(1, y / H);
    const c = VERDE_RGB.map((v, i) => Math.round(v + (TINTA_RGB[i] - v) * k));
    return Image.rgbaToColor(c[0], c[1], c[2], 255);
  });
  if (foto) {
    // La foto de la carrera, cubriendo y muy tenue: el texto se lee siempre
    const capa = foto.clone().cover(W, H);
    capa.opacity(0.18, true);
    img.composite(capa, 0, 0);
  }
  return img;
}

export async function dibujarHistoria(
  d: DatosHistoria, f: Fuentes, foto: Image | null = null, logo: Image | null = null,
): Promise<Uint8Array> {
  const img = fondoBase(foto);
  const ancho = W - M * 2;
  let y = ZONA_ARRIBA;

  // La mosca, arriba a la derecha y por encima del titular
  if (logo) img.composite(logo.clone().resize(104, 104), W - M - 104, y - 70);
  const antetitulo = await Image.renderText(f.texto, 34, "CAMBERAS · EN DIRECTO", NARANJA);
  img.composite(antetitulo, M, y);
  y += antetitulo.height + 30;

  for (const l of await titular(f.negra, d.carrera, CREMA, ancho, 3, 78)) {
    img.composite(l, M, y);
    y += l.height + 4;
  }
  y += 16;
  const recorrido = await linea(f.texto, 46, 30, d.recorrido.toUpperCase(), LIMA, ancho);
  img.composite(recorrido, M, y);
  y += recorrido.height + 64;

  // Banda con lo que ha pasado
  const fem = d.sexo === 2;
  const rotulo = d.tipo === "primero"
    ? (fem ? "PRIMERA EN META" : "PRIMERO EN META")
    : `PODIO PROVISIONAL · ${fem ? "FEMENINO" : d.sexo === 3 ? "MIXTO" : "MASCULINO"}`;
  const banda = await linea(f.negra, 54, 34, rotulo, TINTA, ancho - 60);
  img.drawBox(M, y, ancho, banda.height + 44, NARANJA);
  img.composite(banda, M + 30, y + 22);
  y += banda.height + 44 + 76;

  if (d.tipo === "primero" && d.puestos[0]) {
    const p = d.puestos[0];
    for (const l of await titular(f.negra, p.nombre, CREMA, ancho, 2)) {
      img.composite(l, M, y);
      y += l.height + 6;
    }
    if (p.club) {
      const club = await linea(f.texto, 44, 30, p.club, CREMA_SUAVE, ancho);
      img.composite(club, M, y + 6);
      y += club.height + 6;
    }
    y += 56;
    const tiempo = await linea(f.negra, 170, 110, p.tiempo, NARANJA, ancho);
    img.composite(tiempo, M - 6, y);
  } else {
    const fila = 190;
    for (const [i, p] of d.puestos.slice(0, 3).entries()) {
      const cy = y + fila / 2;
      img.drawCircle(M + 44, Math.round(cy), 44, COLOR_PUESTO[i]);
      const n = await Image.renderText(f.negra, 50, String(i + 1), TINTA);
      img.composite(n, Math.round(M + 44 - n.width / 2), Math.round(cy - n.height / 2));
      const x = M + 120;
      const tiempo = await Image.renderText(f.negra, 54, p.tiempo, i === 0 ? NARANJA : CREMA);
      const maxNombre = W - M - x - tiempo.width - 30;
      const nombre = await linea(f.texto, 54, 32, p.nombre.toUpperCase(), CREMA, maxNombre);
      const alto = nombre.height + (p.club ? 46 : 0);
      img.composite(nombre, x, Math.round(cy - alto / 2));
      if (p.club) {
        const club = await linea(f.texto, 34, 26, p.club, CREMA_SUAVE, maxNombre);
        img.composite(club, x, Math.round(cy - alto / 2 + nombre.height + 8));
      }
      img.composite(tiempo, W - M - tiempo.width, Math.round(cy - tiempo.height / 2));
      y += fila;
    }
  }

  if (d.pie) {
    const pie = await linea(f.texto, 36, 26, d.pie, CREMA_SUAVE, ancho);
    img.composite(pie, M, ZONA_ABAJO - pie.height);
  }
  return await img.encodeJPEG(88);
}
