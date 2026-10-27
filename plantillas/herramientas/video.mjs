#!/usr/bin/env node
/**
 * Convierte un carrusel ya renderizado en un vídeo MP4.
 *
 *   node plantillas/herramientas/video.mjs out/corredores/<slug>/story salida.mp4
 *
 * Cada slide se queda en pantalla el tiempo que cuesta leerlo y se encadena
 * con el siguiente mediante un fundido corto.
 *
 * Con --ritmo=N se estiran o encogen todos los tiempos a la vez: 1.3 deja el
 * vídeo un 30 % más lento, 0.8 lo acelera. El fundido se estira igual, para
 * que no quede seco en un vídeo pausado.
 *
 * Necesita un ffmpeg con libx264 (el que trae Playwright NO vale: solo saca
 * WebM/VP8, que Instagram no admite). Se busca en este orden:
 *   FFMPEG_PATH → ffmpeg del PATH → node_modules/ffmpeg-static
 */

import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

/** Fundido entre slides, en segundos. */
const FUNDIDO = 0.4;
/** Portada y cierre se leen antes; los de contenido llevan más texto. */
const SEG_PORTADA = 2.6;
const SEG_CONTENIDO = 4.0;
const SEG_CIERRE = 3.4;

async function buscarFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const estatico = resolve('node_modules/ffmpeg-static/ffmpeg');
  if (existsSync(estatico)) return estatico;
  return 'ffmpeg'; // que lo resuelva el PATH
}

function ejecutar(bin, args) {
  return new Promise((ok, mal) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', mal);
    p.on('close', (c) => (c === 0 ? ok() : mal(new Error(err.slice(-3500)))));
  });
}

/** Duración de un vídeo, leída del propio ffmpeg. */
function duracion(bin, fichero) {
  return new Promise((ok) => {
    const p = spawn(bin, ['-i', fichero], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      ok(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null);
    });
  });
}

const args = process.argv.slice(2);
const [ carpeta, destino ] = args.filter((a) => !a.startsWith('--'));
const ritmo = Number((args.find((a) => a.startsWith('--ritmo=')) ?? '').split('=')[1] ?? 1);

if (!carpeta || !destino) {
  console.error(
    'Uso: node plantillas/herramientas/video.mjs <carpeta-de-slides> <salida.mp4> \\\n' +
    '       [--ritmo=N] [--sustituir=4:simulacion.mp4]'
  );
  process.exit(1);
}
if (!Number.isFinite(ritmo) || ritmo <= 0) {
  console.error('✖ --ritmo tiene que ser un número mayor que cero');
  process.exit(1);
}
if (!(await stat(carpeta).catch(() => null))?.isDirectory()) {
  console.error(`✖ no existe la carpeta ${carpeta}`);
  process.exit(1);
}

const slides = (await readdir(carpeta)).filter((f) => f.endsWith('.png')).sort();
if (!slides.length) { console.error(`✖ ${carpeta} no tiene PNG`); process.exit(1); }

/*
 * --sustituir=4:simulacion.mp4 cambia ese slide por un vídeo. Sirve para
 * meter la simulación del mapa dentro del reel, en el sitio del slide que
 * llevaba el mapa quieto.
 */
const bin = await buscarFfmpeg();
const sust = (args.find((a) => a.startsWith('--sustituir=')) ?? '').split('=')[1];
let cambio = null;
if (sust) {
  const i = sust.indexOf(':');
  const n = Number(sust.slice(0, i));
  const ruta = sust.slice(i + 1);
  if (!Number.isInteger(n) || n < 1 || n > slides.length) {
    console.error(`✖ --sustituir: el slide ${n} no existe (hay ${slides.length})`);
    process.exit(1);
  }
  const d = await duracion(bin, ruta);
  if (!d) { console.error(`✖ no puedo leer la duración de ${ruta}`); process.exit(1); }
  cambio = { i: n - 1, ruta, d };
}

const fundido = FUNDIDO * ritmo;
const dur = slides.map((_, i) =>
  cambio && i === cambio.i
    ? cambio.d
    : (i === 0 ? SEG_PORTADA : i === slides.length - 1 ? SEG_CIERRE : SEG_CONTENIDO) * ritmo
);

// Una entrada por slide, cada una congelada su duración (+ el fundido, que
// se solapa con la siguiente y si no se comería el final del clip)
const entradas = slides.flatMap((f, i) =>
  cambio && i === cambio.i
    ? ['-i', cambio.ruta]
    // -framerate en la entrada: sin él, un PNG en bucle llega con tasa 1/0 y
    // xfade lo rechaza por no ser constante
    : ['-loop', '1', '-framerate', '30', '-t', String(dur[i] + fundido), '-i', join(carpeta, f)]
);

/*
 * xfade exige que todas las entradas vengan igualadas: mismo fps, mismo
 * formato y el reloj a cero. Un PNG entra a 25 fps y la simulación a 20, y
 * sin normalizar ffmpeg se planta.
 */
const FPS = 30;
let filtro = slides
  .map((_, i) => `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p,fps=${FPS}[n${i}];`)
  .join('');

// Cadena de fundidos: el desplazamiento de cada uno descuenta los anteriores
let etiqueta = '[n0]', acumulado = 0;
for (let i = 1; i < slides.length; i++) {
  acumulado += dur[i - 1];
  const off = (acumulado - fundido * (i - 1)).toFixed(3);
  const salida = i === slides.length - 1 ? '[v]' : `[x${i}]`;
  filtro += `${etiqueta}[n${i}]xfade=transition=fade:duration=${fundido.toFixed(3)}:offset=${off}${salida};`;
  etiqueta = salida;
}
filtro = filtro.replace(/;$/, '');

await ejecutar(bin, [
  '-y', ...entradas,
  ...(slides.length > 1 ? ['-filter_complex', filtro, '-map', '[v]'] : []),
  '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  destino,
]);

const total = dur.reduce((a, b) => a + b, 0) - fundido * (slides.length - 1);
console.log(`✔ ${destino} · ${slides.length} slides · ${total.toFixed(1)} s`);
