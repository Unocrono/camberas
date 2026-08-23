#!/usr/bin/env node
/**
 * Convierte un carrusel ya renderizado en un vídeo MP4.
 *
 *   node plantillas/herramientas/video.mjs out/corredores/<slug>/story salida.mp4
 *
 * Cada slide se queda en pantalla el tiempo que cuesta leerlo y se encadena
 * con el siguiente mediante un fundido corto.
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
    p.on('close', (c) => (c === 0 ? ok() : mal(new Error(err.slice(-1500)))));
  });
}

const [ , , carpeta, destino ] = process.argv;
if (!carpeta || !destino) {
  console.error('Uso: node plantillas/herramientas/video.mjs <carpeta-de-slides> <salida.mp4>');
  process.exit(1);
}
if (!(await stat(carpeta).catch(() => null))?.isDirectory()) {
  console.error(`✖ no existe la carpeta ${carpeta}`);
  process.exit(1);
}

const slides = (await readdir(carpeta)).filter((f) => f.endsWith('.png')).sort();
if (!slides.length) { console.error(`✖ ${carpeta} no tiene PNG`); process.exit(1); }

const dur = slides.map((_, i) =>
  i === 0 ? SEG_PORTADA : i === slides.length - 1 ? SEG_CIERRE : SEG_CONTENIDO
);

// Una entrada por slide, cada una congelada su duración (+ el fundido, que
// se solapa con la siguiente y si no se comería el final del clip)
const entradas = slides.flatMap((f, i) => [
  '-loop', '1', '-t', String(dur[i] + FUNDIDO), '-i', join(carpeta, f),
]);

// Cadena de fundidos: el desplazamiento de cada uno descuenta los anteriores
let filtro = '', etiqueta = '[0:v]', acumulado = 0;
for (let i = 1; i < slides.length; i++) {
  acumulado += dur[i - 1];
  const off = (acumulado - FUNDIDO * (i - 1)).toFixed(3);
  const salida = i === slides.length - 1 ? '[v]' : `[x${i}]`;
  filtro += `${etiqueta}[${i}:v]xfade=transition=fade:duration=${FUNDIDO}:offset=${off}${salida};`;
  etiqueta = salida;
}
filtro = filtro.replace(/;$/, '');

const bin = await buscarFfmpeg();
await ejecutar(bin, [
  '-y', ...entradas,
  ...(slides.length > 1 ? ['-filter_complex', filtro, '-map', '[v]'] : []),
  '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  destino,
]);

const total = dur.reduce((a, b) => a + b, 0) - FUNDIDO * (slides.length - 1);
console.log(`✔ ${destino} · ${slides.length} slides · ${total.toFixed(1)} s`);
