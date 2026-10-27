#!/usr/bin/env node
/**
 * Dibuja el mapa de una carrera a partir de su GPX, con la paleta de Camberas.
 *
 *   node plantillas/herramientas/mapa.mjs public/gpx/picota.gpx capturas/mapa.png
 *
 * No es un pantallazo de Mapbox: es un dibujo. A tamaño de Instagram un mapa
 * real mete su propio gris y su interfaz y no se lee nada; así la pieza habla
 * el mismo idioma que el resto del carrusel.
 *
 * Pinta la traza, los avituallamientos, los vehículos de organización —cada
 * uno con su color— y el pelotón, con el cierre detrás del último y su
 * estela, que es lo que hace que se lea «moviéndose».
 */

import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Todo de docs/paleta-camberas.md. Nada de colores sueltos. */
const C = {
  fondo: '#0E2419',
  traza: '#3CA15B',
  crema: '#FAF6EC',
  naranja: '#EC7C2B',
  lima: '#C8E85C',
  rojo: '#D91F10',
  colina: '#2E8B4A',
};

const LADO = 1080;
const MARGEN = 96;

/** Posición de cada cosa, en fracción del recorrido (0 = salida, 1 = meta). */
const AVITUALLAMIENTOS = [0.20, 0.44, 0.80];
const VEHICULOS = [
  { en: 0.93, nombre: 'Moto cámara', color: C.lima, icono: 'camara' },
  { en: 0.64, nombre: 'Ambulancia', color: C.rojo, icono: 'cruz' },
  { en: 0.26, nombre: 'Cierre', color: C.naranja, icono: 'coche', estela: true },
];
/** El pelotón, por delante del cierre. */
const CORREDORES = [0.31, 0.38, 0.46, 0.53, 0.68, 0.75, 0.82, 0.88];

function leerTraza(xml) {
  const pts = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)]
    .map((m) => ({ lat: +m[1], lon: +m[2] }));
  if (pts.length < 2) throw new Error('el GPX no trae traza (menos de dos trkpt)');
  return pts;
}

/** Equirectangular con corrección de latitud, encajado en el lienzo. */
function proyectar(pts) {
  const latMedia = (Math.min(...pts.map(p => p.lat)) + Math.max(...pts.map(p => p.lat))) / 2;
  const k = Math.cos((latMedia * Math.PI) / 180);
  const xs = pts.map(p => p.lon * k);
  const ys = pts.map(p => -p.lat);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const util = LADO - MARGEN * 2;
  const escala = Math.min(util / (x1 - x0 || 1), util / (y1 - y0 || 1));
  // Centrado: lo que sobra del lado más corto se reparte a los dos lados
  const dx = (LADO - (x1 - x0) * escala) / 2;
  const dy = (LADO - (y1 - y0) * escala) / 2;
  return xs.map((x, i) => [
    (x - x0) * escala + dx,
    (ys[i] - y0) * escala + dy,
  ]);
}

/** Longitudes acumuladas, para poder situar algo "al 26 % del recorrido". */
function acumulado(xy) {
  const acc = [0];
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1], [bx, by] = xy[i];
    acc.push(acc[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return acc;
}

const enFraccion = (xy, acc, f) => {
  const objetivo = acc[acc.length - 1] * f;
  let i = acc.findIndex((d) => d >= objetivo);
  if (i < 1) i = 1;
  return xy[i];
};

/** Trozo de traza entre dos fracciones: la estela del cierre. */
function tramo(xy, acc, desde, hasta) {
  const total = acc[acc.length - 1];
  const a = acc.findIndex((d) => d >= total * desde);
  const b = acc.findIndex((d) => d >= total * hasta);
  return xy.slice(Math.max(a, 0), Math.max(b, 1) + 1);
}

const linea = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function icono(tipo, color) {
  if (tipo === 'cruz')
    return `<path d="M-3.5,-11 h7 v7.5 h7.5 v7 h-7.5 v7.5 h-7 v-7.5 h-7.5 v-7 h7.5 z" fill="${color}"/>`;
  if (tipo === 'camara')
    return `<g fill="${color}"><rect x="-12" y="-7" width="24" height="16" rx="3"/>
      <rect x="-5" y="-11" width="10" height="4" rx="1.5"/>
      <circle cx="0" cy="1" r="4.5" fill="${C.fondo}"/></g>`;
  if (tipo === 'coche')
    return `<g fill="${color}"><path d="M-13,3 l2.5,-7 h21 l2.5,7 v5 h-26 z"/>
      <circle cx="-7.5" cy="8.5" r="3.2"/><circle cx="7.5" cy="8.5" r="3.2"/></g>`;
  // avituallamiento: vaso
  return `<path d="M-7,-8 h14 l-2,16 h-10 z" fill="${color}"/>`;
}

const pin = (x, y, color, tipo, r = 30) => `
  <g transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
    <circle r="${r + 5}" fill="${C.fondo}"/>
    <circle r="${r}" fill="none" stroke="${color}" stroke-width="5"/>
    ${icono(tipo, color)}
  </g>`;

/* Con placa detrás: sin ella el texto se pierde en cuanto cae sobre la traza. */
const etiqueta = (x, y, texto, color, r = 30) => {
  const ancho = texto.length * 17 + 28;
  return `
  <g transform="translate(${x.toFixed(1)},${(y + r + 14).toFixed(1)})">
    <rect x="${-ancho / 2}" y="0" width="${ancho}" height="42" rx="21" fill="${C.fondo}"/>
    <text x="0" y="29" text-anchor="middle" font-family="Barlow Semi Condensed"
          font-weight="700" font-size="26" letter-spacing="2.2"
          fill="${color}">${texto.toUpperCase()}</text>
  </g>`;
};

function construir(xy, acc) {
  const partes = [];

  partes.push(`<polyline points="${linea(xy)}" fill="none" stroke="${C.traza}"
      stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`);

  // Estela: por dónde acaba de pasar el cierre
  // A opacidad plena: el naranja translúcido sobre el verde tinta se vuelve
  // marrón (está apuntado en docs/paleta-camberas.md). Para que se lea como
  // «viene de ahí», la estela se estrecha hacia atrás en dos tramos.
  const cierre = VEHICULOS.find((v) => v.estela);
  const desde = Math.max(cierre.en - 0.13, 0);
  partes.push(`<polyline points="${linea(tramo(xy, acc, desde, cierre.en))}"
      fill="none" stroke="${cierre.color}" stroke-width="9"
      stroke-linecap="round" stroke-linejoin="round"/>`);
  partes.push(`<polyline points="${linea(tramo(xy, acc, Math.max(cierre.en - 0.06, 0), cierre.en))}"
      fill="none" stroke="${cierre.color}" stroke-width="16"
      stroke-linecap="round" stroke-linejoin="round"/>`);

  for (const f of AVITUALLAMIENTOS) {
    const [x, y] = enFraccion(xy, acc, f);
    partes.push(pin(x, y, C.crema, 'vaso', 24));
  }

  // El pelotón: por delante del cierre, para que se lea quién va detrás de quién
  for (const f of CORREDORES) {
    const [x, y] = enFraccion(xy, acc, f);
    partes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"
        fill="${C.crema}" stroke="${C.fondo}" stroke-width="5"/>`);
  }

  // Salida y meta coinciden en un circular
  const [sx, sy] = xy[0];
  // En un circular la salida y la meta son el mismo punto
  partes.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="20"
      fill="${C.fondo}" stroke="${C.crema}" stroke-width="6"/>`);
  partes.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="8" fill="${C.crema}"/>`);

  // Todos los pines antes que las etiquetas: al revés, la placa de uno tapa
  // el pin del siguiente
  const sitios = VEHICULOS.map((v) => ({ v, p: enFraccion(xy, acc, v.en) }));
  for (const { v, p } of sitios) partes.push(pin(p[0], p[1], v.color, v.icono));
  for (const { v, p } of sitios) partes.push(etiqueta(p[0], p[1], v.nombre, v.color));

  return partes.join('\n');
}

const [, , entrada, salida] = process.argv;
if (!entrada || !salida) {
  console.error('Uso: node plantillas/herramientas/mapa.mjs <ruta.gpx> <salida.png>');
  process.exit(1);
}

const xml = await readFile(resolve(process.cwd(), entrada), 'utf8');
const xy = proyectar(leerTraza(xml));
const acc = acumulado(xy);

// Las fuentes van autoalojadas con nombre de fichero con hash, así que se
// enlaza su propia hoja en vez de adivinar la ruta de cada .woff2. El HTML se
// escribe DENTRO de plantillas/ y se abre con goto: con setContent la página
// es about:blank, no resuelve el file:// de la hoja y el PNG sale en serif.
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="fuentes/fuentes.css">
<style>
html,body{margin:0;padding:0;background:${C.fondo}}
svg{display:block}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 ${LADO} ${LADO}">
  <rect width="${LADO}" height="${LADO}" fill="${C.fondo}"/>
  ${construir(xy, acc)}
</svg></body></html>`;

const tmp = join(RAIZ, 'plantillas', `.mapa-${Date.now()}.html`);
await writeFile(tmp, html);

const navegador = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  const pagina = await navegador.newPage({
    viewport: { width: LADO, height: LADO },
    deviceScaleFactor: 1,
  });
  await pagina.goto(`file://${tmp}`);
  // Cargar la cara explícitamente: con esperar a fonts.ready, el SVG se pinta
  // con la de reserva y el PNG sale en serif sin avisar de nada.
  await pagina.evaluate(async () => {
    await document.fonts.load('700 26px "Barlow Semi Condensed"');
    await document.fonts.ready;
  });
  const destino = resolve(process.cwd(), salida);
  await pagina.locator('svg').screenshot({ path: destino });
  console.log(`✔ ${salida} · ${LADO}×${LADO}`);
} finally {
  await navegador.close();
  await rm(tmp, { force: true });
}
