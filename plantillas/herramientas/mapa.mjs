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

import { readFile, writeFile, rm, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
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
/*
 * Los puntos salen de los <wpt> del propio GPX, que es donde los pone quien
 * marca el recorrido. Se agrupan por su <sym>, que es lo que rellenan los
 * programas de rutas.
 *
 * Lo de la zona de meta —parkings, duchas, baños, comedor— se deja fuera por
 * defecto: son quince chinchetas en el mismo sitio y tapan el dibujo.
 */
const CATEGORIAS = {
  'Picnic Area':    { grupo: 'avituallamiento', icono: 'vaso',  color: 'crema' },
  'Drinking Water': { grupo: 'avituallamiento', icono: 'vaso',  color: 'crema' },
  Pharmacy:         { grupo: 'sanitario',       icono: 'cruz',  color: 'rojo'  },
  Information:      { grupo: 'control',         icono: 'arco',  color: 'lima'  },
  Crossing:         { grupo: 'cruce',           icono: 'vaso',  color: 'crema' },
};
const GRUPOS_POR_DEFECTO = ['avituallamiento', 'sanitario'];

/** El GPX los nombra largo; en el dibujo sobra el prefijo. */
const acortar = (n) =>
  n.replace(/^(Avituallamiento|Control de paso cronometrado|Control cronometrado)\s+(de[l]?\s+|zona de\s+)?/i, '')
   .replace(/\s*\(.*\)\s*$/, '')
   .trim();

/*
 * Repuesto para trazas sin waypoints: se colocan a mano por fracción del
 * recorrido. La Picota, por ejemplo, no trae ninguno.
 */
let PUNTOS = [];
let SUELTOS = [];
const VEHICULOS = [
  { en: 0.93, nombre: 'Moto cámara', color: C.lima, icono: 'camara' },
  { en: 0.64, nombre: 'Ambulancia', color: C.rojo, icono: 'cruz' },
  { en: 0.26, nombre: 'Cierre', color: C.naranja, icono: 'coche', estela: true },
];
/** El pelotón, por delante del cierre. */
const CORREDORES = [0.31, 0.38, 0.46, 0.53, 0.68, 0.75, 0.82, 0.88];

function leerWaypoints(xml, grupos) {
  return [...xml.matchAll(/<wpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*>([\s\S]*?)<\/wpt>/g)]
    .map((m) => ({
      lat: +m[1],
      lon: +m[2],
      nombre: (m[3].match(/<name>([^<]*)<\/name>/) || [])[1] ?? '',
      sym: (m[3].match(/<sym>([^<]*)<\/sym>/) || [])[1] ?? '',
    }))
    .map((w) => ({ ...w, cat: CATEGORIAS[w.sym] }))
    .filter((w) => w.cat && grupos.includes(w.cat.grupo));
}

function leerTraza(xml) {
  const pts = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)]
    .map((m) => ({ lat: +m[1], lon: +m[2] }));
  if (pts.length < 2) throw new Error('el GPX no trae traza (menos de dos trkpt)');
  return pts;
}

/**
 * Equirectangular con corrección de latitud, encajado en el lienzo. Devuelve
 * la traza ya proyectada y la función, para poder situar los waypoints con
 * exactamente la misma transformación.
 */
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
  const proy = (lat, lon) => [
    (lon * k - x0) * escala + dx,
    (-lat - y0) * escala + dy,
  ];
  return { xy: pts.map((p) => proy(p.lat, p.lon)), proy };
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
  if (tipo === 'arco')
    return `<g fill="${color}"><rect x="-12" y="-10" width="24" height="5" rx="2"/>
      <rect x="-11" y="-5" width="4.5" height="15"/><rect x="6.5" y="-5" width="4.5" height="15"/></g>`;
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
  const ancho = texto.length * 22 + 34;
  return `
  <g transform="translate(${x.toFixed(1)},${(y + r + 12).toFixed(1)})">
    <rect x="${-ancho / 2}" y="0" width="${ancho}" height="54" rx="27" fill="${C.fondo}"/>
    <text x="0" y="37" text-anchor="middle" font-family="Barlow Semi Condensed"
          font-weight="700" font-size="34" letter-spacing="2.4"
          fill="${color}">${texto.toUpperCase()}</text>
  </g>`;
};

function construir(xy, acc, t = null) {
  // Tres capas. Si se mezclan, un punto de corredor o un pin cae encima de una
  // etiqueta y se come media palabra: las etiquetas van siempre las últimas.
  const trazas = [], pines = [], etiquetas = [];

  trazas.push(`<polyline points="${linea(xy)}" fill="none" stroke="${C.traza}"
      stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`);

  // Estela a opacidad plena: el naranja translúcido sobre el verde tinta se
  // vuelve marrón (apuntado en docs/paleta-camberas.md). Para que se lea la
  // dirección, se estrecha hacia atrás en dos tramos.
  const cierre = VEHICULOS.find((v) => v.estela);
  // En simulación todo el mundo avanza; parado, cada uno se queda en su sitio
  const cierreF = t === null ? cierre.en : 0.04 + t * 0.92;
  trazas.push(`<polyline points="${linea(tramo(xy, acc, Math.max(cierreF - 0.13, 0), cierreF))}"
      fill="none" stroke="${cierre.color}" stroke-width="9"
      stroke-linecap="round" stroke-linejoin="round"/>`);
  trazas.push(`<polyline points="${linea(tramo(xy, acc, Math.max(cierreF - 0.06, 0), cierreF))}"
      fill="none" stroke="${cierre.color}" stroke-width="16"
      stroke-linecap="round" stroke-linejoin="round"/>`);

  for (const p of PUNTOS) {
    const color = C[p.cat.color];
    pines.push(pin(p.x, p.y, color, p.cat.icono, 24));
    if (p.etiqueta) etiquetas.push(etiqueta(p.x, p.y, p.etiqueta, color, 24));
  }

  for (const a of SUELTOS) {
    const [x, y] = enFraccion(xy, acc, a.f);
    // Pasada la escoba, el avituallamiento se levanta: se apaga en el mapa
    const levantado = t !== null && cierreF > a.f;
    pines.push(`<g opacity="${levantado ? 0.22 : 1}">${pin(x, y, C.crema, 'vaso', 24)}</g>`);
    if (a.nombre)
      etiquetas.push(`<g opacity="${levantado ? 0.22 : 1}">${etiqueta(x, y, a.nombre, C.crema, 24)}</g>`);
  }

  // El pelotón, por delante del cierre: así se lee quién va detrás de quién
  for (const [i, f0] of CORREDORES.entries()) {
    const f = t === null ? f0 : Math.min(cierreF + 0.05 + i * 0.055, 0.995);
    const [x, y] = enFraccion(xy, acc, f);
    pines.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"
        fill="${C.crema}" stroke="${C.fondo}" stroke-width="5"/>`);
  }

  // En un circular la salida y la meta son el mismo punto
  const [sx, sy] = xy[0];
  pines.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="20"
      fill="${C.fondo}" stroke="${C.crema}" stroke-width="6"/>`);
  pines.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="8" fill="${C.crema}"/>`);

  for (const v of VEHICULOS) {
    let f = v.en;
    if (t !== null) {
      if (v.estela) f = cierreF;                                   // la escoba
      else if (v.icono === 'camara') f = Math.min(cierreF + 0.55, 0.99); // delante
      // la ambulancia es un puesto fijo: no se mueve
    }
    const [x, y] = enFraccion(xy, acc, f);
    pines.push(pin(x, y, v.color, v.icono));
    etiquetas.push(etiqueta(x, y, v.nombre, v.color));
  }

  return [...trazas, ...pines, ...etiquetas].join('\n');
}

const args = process.argv.slice(2);
const [entrada, salida] = args.filter((a) => !a.startsWith('--'));
const opcion = (n) => (args.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=');

if (!entrada || !salida) {
  console.error(
    'Uso: node plantillas/herramientas/mapa.mjs <ruta.gpx> <salida.png> \\\n' +
    '       [--mostrar=avituallamiento,sanitario,control,cruce] [--sin-etiquetas]\\\n' +
    '       [--avituallamientos="0.2,0.44,0.8"]  (fracciones, para trazas sin waypoints)\\\n' +
    '       [--video=simulacion.mp4] [--segundos=10]  (la escoba recorriendo la traza)'
  );
  process.exit(1);
}

const video = opcion('video') || null;
const segundos = Number(opcion('segundos') || 10);

const grupos = (opcion('mostrar') || GRUPOS_POR_DEFECTO.join(',')).split(',').map((g) => g.trim());
const conEtiquetas = !args.includes('--sin-etiquetas');

const xml = await readFile(resolve(process.cwd(), entrada), 'utf8');
const { xy, proy } = proyectar(leerTraza(xml));
const acc = acumulado(xy);

PUNTOS = leerWaypoints(xml, grupos).map((w) => {
  const [x, y] = proy(w.lat, w.lon);
  return { ...w, x, y, etiqueta: conEtiquetas ? acortar(w.nombre) : null };
});
const manual = opcion('avituallamientos');
if (manual) {
  SUELTOS = manual.split(',').map((t) => {
    const [f, ...resto] = t.split(':');
    return { f: Number(f), nombre: resto.join(':').trim() || null };
  }).filter((a) => Number.isFinite(a.f));
}
if (!PUNTOS.length && !SUELTOS.length)
  console.warn(
    `⚠ el GPX no trae waypoints de ${grupos.join(', ')}.\n` +
    '  Colócalos a mano con --avituallamientos="0.2,0.44,0.8" (fracción del recorrido).'
  );

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

/** Igual que en video.mjs: el ffmpeg de Playwright no trae libx264. */
function buscarFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const estatico = resolve(RAIZ, 'node_modules/ffmpeg-static/ffmpeg');
  return existsSync(estatico) ? estatico : 'ffmpeg';
}

function ejecutar(bin, args) {
  return new Promise((ok, mal) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', mal);
    p.on('close', (c) => (c === 0 ? ok() : mal(new Error(err.slice(-1200)))));
  });
}

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

  if (video) {
    const fps = 20;
    const total = Math.max(Math.round(segundos * fps), 2);
    const carpeta = await mkdtemp(join(tmpdir(), 'mapa-'));
    for (let i = 0; i < total; i++) {
      // El SVG ya está montado: se le cambia el contenido en vez de recargar
      // la página, que con doscientos fotogramas se nota mucho.
      await pagina.evaluate(
        (m) => { document.querySelector('svg').innerHTML = m; },
        `<rect width="${LADO}" height="${LADO}" fill="${C.fondo}"/>` +
          construir(xy, acc, i / (total - 1))
      );
      await pagina.locator('svg').screenshot({
        path: join(carpeta, `f-${String(i).padStart(4, '0')}.png`),
      });
    }
    await ejecutar(buscarFfmpeg(), [
      '-y', '-framerate', String(fps), '-i', join(carpeta, 'f-%04d.png'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      resolve(process.cwd(), video),
    ]);
    await rm(carpeta, { recursive: true, force: true });
    console.log(`✔ ${video} · ${total} fotogramas · ${segundos} s`);
  }
} finally {
  await navegador.close();
  await rm(tmp, { force: true });
}
