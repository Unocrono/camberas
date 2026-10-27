/**
 * Graba un recorrido por la app de organizador con datos simulados.
 *
 *   node plantillas/herramientas/demo/grabar.mjs out/videos/org.mp4
 *
 * No son pantallazos pegados: es la app de verdad corriendo en el servidor
 * de desarrollo, con Supabase interceptado. Se graba en tiempo real, así que
 * salen las transiciones y los despliegues como se ven de verdad.
 *
 * Hace falta `npm run dev -- --host 127.0.0.1` levantado.
 */
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { simular, sesionSimulada } from './servidor.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = 'http://127.0.0.1:8080';
/*
 * El móvil: 9:16 exacto, que es lo que pide un reel. Se graba a tamaño de
 * móvil y se sube a 1080 con ffmpeg, porque recordVideo NO escala la página:
 * si le pides un lienzo mayor, te deja la web en una esquina y el resto gris.
 */
const MOVIL = { width: 540, height: 960 };
const VIDEO = { width: 1080, height: 1920 };

const salida = process.argv[2] ?? 'out/videos/org-demo.mp4';

function ejecutar(bin, args) {
  return new Promise((ok, mal) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', mal);
    p.on('close', (c) => (c === 0 ? ok() : mal(new Error(err.slice(-1500)))));
  });
}
const ffmpeg = () => process.env.FFMPEG_PATH
  ?? (existsSync(join(RAIZ, 'node_modules/ffmpeg-static/ffmpeg'))
      ? join(RAIZ, 'node_modules/ffmpeg-static/ffmpeg') : 'ffmpeg');

const carpeta = await mkdtemp(join(tmpdir(), 'org-'));
const navegador = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await navegador.newContext({
  viewport: MOVIL,
  deviceScaleFactor: 2,
  recordVideo: { dir: carpeta, size: MOVIL },
  hasTouch: true,
  isMobile: true,
});
await sesionSimulada(ctx);

const pagina = await ctx.newPage();
await simular(pagina);

/* El dedo: sin esto no se entiende que alguien está pulsando. */
await pagina.addInitScript(() => {
  const css = document.createElement('style');
  css.textContent = `@keyframes toque{0%{transform:translate(-50%,-50%) scale(.3);opacity:.9}
    100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}
    .toque{position:fixed;z-index:99999;width:92px;height:92px;border-radius:50%;
      border:5px solid #EC7C2B;background:rgba(236,124,43,.25);pointer-events:none;
      animation:toque .55s ease-out forwards}`;
  document.head.append(css);
  window.__toque = (x, y) => {
    const d = document.createElement('div');
    d.className = 'toque';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    document.body.append(d);
    setTimeout(() => d.remove(), 600);
  };
});

/** Pulsa un elemento enseñando el dedo. */
async function pulsar(texto, { espera = 1400 } = {}) {
  const el = pagina.getByText(texto, { exact: false }).first();
  if (!(await el.count())) { console.warn(`   ⚠ no encuentro «${texto}»`); return false; }
  const caja = await el.boundingBox();
  if (caja) {
    await pagina.evaluate(
      ([x, y]) => window.__toque?.(x, y),
      [caja.x + caja.width / 2, caja.y + caja.height / 2]
    );
    await pagina.waitForTimeout(380);
  }
  await el.click({ timeout: 5000 }).catch(() => {});
  await pagina.waitForTimeout(espera);
  console.log(`   · ${texto}`);
  return true;
}

const pausa = (ms) => pagina.waitForTimeout(ms);

console.log('Grabando el recorrido…');
await pagina.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
await pausa(2600);

await pulsar('CORREDORES');
await pausa(900);
await pulsar('Inscripciones', { espera: 2200 });
await pausa(1500);

await pagina.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
await pausa(1400);
await pulsar('SEGUIMIENTO GPS');
await pausa(900);
await pulsar('Organización', { espera: 2400 });
await pausa(1600);

await pagina.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
await pausa(1200);
await pulsar('DOCUMENTACIÓN', { espera: 2400 });
await pausa(1800);

await ctx.close();
await navegador.close();

const webm = (await readdir(carpeta)).find((f) => f.endsWith('.webm'));
if (!webm) { console.error('✖ Playwright no dejó vídeo'); process.exit(1); }

await ejecutar(ffmpeg(), [
  '-y', '-i', join(carpeta, webm),
  '-vf', `scale=${VIDEO.width}:${VIDEO.height}:flags=lanczos`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  resolve(process.cwd(), salida),
]);
await rm(carpeta, { recursive: true, force: true });
console.log(`✔ ${salida}`);
