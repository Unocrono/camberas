#!/usr/bin/env node
/**
 * QR de marca: módulos en verde tinta sobre tarjeta crema, con el logo de
 * Camberas en el centro.
 *
 *   node plantillas/herramientas/qr.mjs https://camberas.com/organizadores capturas/qr.png
 *
 * Va en corrección H (tolera perder un 30 % del código), que es lo que
 * permite taparle el centro con el logo sin que deje de leerse.
 *
 * Oscuro sobre claro, no al revés: un QR en negativo lo rechazan bastantes
 * lectores, y aquí el objetivo es que la gente lo escanee de la pantalla.
 */

import { readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLANTILLA = join(RAIZ, 'plantillas', 'carrusel-faq.html');

const C = { fondo: '#0E2419', tinta: '#0E2419', crema: '#FAF6EC' };
const LADO = 900;
/** Hueco del logo, en fracción del lado. Por encima de ~0.26 deja de leerse. */
const LOGO_F = 0.23;

/* El logo vive una sola vez, en la plantilla del carrusel. Se lee de ahí en
   vez de hacer una tercera copia (ya hay una en CamberasLogo.tsx). */
async function logo() {
  const html = await readFile(PLANTILLA, 'utf8');
  const m = html.match(/const LOGO = `([\s\S]*?)`;/);
  if (!m) throw new Error('no encuentro el logo en plantillas/carrusel-faq.html');
  return m[1].trim();
}

const [, , texto, salida] = process.argv;
if (!texto || !salida) {
  console.error('Uso: node plantillas/herramientas/qr.mjs <texto|url> <salida.png>');
  process.exit(1);
}

const svgQr = await QRCode.toString(texto, {
  type: 'svg',
  errorCorrectionLevel: 'H',
  margin: 2,
  color: { dark: C.tinta, light: C.crema },
});

// qrcode saca su propio <svg> con viewBox: se mete tal cual dentro del nuestro
const cuerpo = svgQr.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const vb = (svgQr.match(/viewBox="([^"]+)"/) || [])[1] ?? '0 0 33 33';

const hueco = LADO * LOGO_F;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${C.fondo}}svg{display:block}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 ${LADO} ${LADO}">
  <rect width="${LADO}" height="${LADO}" rx="44" fill="${C.crema}"/>
  <svg x="0" y="0" width="${LADO}" height="${LADO}" viewBox="${vb}">${cuerpo}</svg>
  <circle cx="${LADO / 2}" cy="${LADO / 2}" r="${hueco / 2 + 14}" fill="${C.crema}"/>
  <svg x="${(LADO - hueco) / 2}" y="${(LADO - hueco) / 2}" width="${hueco}" height="${hueco}">
    ${await logo()}
  </svg>
</svg></body></html>`;

const tmp = join(RAIZ, 'plantillas', `.qr-${Date.now()}.html`);
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
  const destino = resolve(process.cwd(), salida);
  await pagina.locator('svg').first().screenshot({ path: destino });

  // Taparle el centro a un QR puede dejarlo ilegible sin que nada lo avise:
  // el PNG sale precioso y no lo lee ningún móvil. Así que se decodifica.
  const png = PNG.sync.read(await readFile(destino));
  const leido = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!leido) {
    console.error('✖ el QR generado no se puede leer — baja LOGO_F o acorta el texto');
    process.exitCode = 1;
  } else if (leido.data !== texto) {
    console.error(`✖ el QR se lee pero dice otra cosa: ${leido.data}`);
    process.exitCode = 1;
  } else {
    console.log(`✔ ${salida} · ${LADO}×${LADO} · comprobado: ${leido.data}`);
  }
} finally {
  await navegador.close();
  await rm(tmp, { force: true });
}
