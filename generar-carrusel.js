#!/usr/bin/env node
/**
 * Generador de carruseles de FAQ para Instagram.
 *
 *   node generar-carrusel.js <ruta-json> [--formato=feed|story|ambos]
 *
 * Coge el contenido de un JSON de content/, lo mete en la plantilla
 * plantillas/carrusel-faq.html y la renderiza a PNG con Playwright.
 *
 * Salida: out/{audiencia}/{slug}/{formato}/01.png, 02.png...
 *
 * Nada de texto vive en la plantilla: todo llega del JSON.
 */

import { readFile, mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PLANTILLA = join(RAIZ, 'plantillas', 'carrusel-faq.html');

/** Tope real de Instagram. */
const MAX_SLIDES = 10;
/** Portada + cierre ocupan dos, así que caben 8 de contenido. */
const MAX_PREGUNTAS = MAX_SLIDES - 2;

const FORMATOS = {
  feed: { ancho: 1080, alto: 1350 },
  story: { ancho: 1080, alto: 1920 },
};

// ── Utilidades ──────────────────────────────────────────────────

function slugificar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function validar(datos, ruta) {
  const fallos = [];
  if (!['corredores', 'organizadores'].includes(datos.audiencia))
    fallos.push('"audiencia" debe ser "corredores" u "organizadores"');
  if (datos.tipo !== undefined && !['faq', 'manual'].includes(datos.tipo))
    fallos.push('"tipo" debe ser "faq" (por defecto) o "manual"');
  if (!datos.titulo?.trim()) fallos.push('falta "titulo"');
  if (datos.imagenPortada && !existsSync(resolve(RAIZ, datos.imagenPortada)))
    fallos.push(`no existe la imagen de portada "${datos.imagenPortada}"`);
  if (!datos.cta?.trim()) fallos.push('falta "cta"');
  if (!Array.isArray(datos.slides) || datos.slides.length === 0)
    fallos.push('"slides" debe ser un array con al menos una pregunta');
  else
    datos.slides.forEach((s, i) => {
      // Un slide a sangre es solo la imagen: no lleva texto que validar
      if (s.aSangre) {
        if (!s.imagen) fallos.push(`slides[${i}]: "aSangre" necesita "imagen"`);
      } else {
        if (!s.pregunta?.trim()) fallos.push(`slides[${i}]: falta "pregunta"`);
        if (!s.respuesta?.trim()) fallos.push(`slides[${i}]: falta "respuesta"`);
      }
      // La ruta de la captura va relativa a la raíz del repo
      if (s.imagen && !existsSync(resolve(RAIZ, s.imagen)))
        fallos.push(`slides[${i}]: no existe la imagen "${s.imagen}"`);
    });

  if (fallos.length) {
    console.error(`\n✖ ${ruta} no es válido:`);
    fallos.forEach((f) => console.error(`   · ${f}`));
    process.exit(1);
  }
}

/**
 * Trocea las preguntas en carruseles de como mucho MAX_SLIDES.
 * Si hay que partir, cada parte lleva su propio slug y se avisa por consola.
 */
function repartir(datos) {
  const grupos = [];
  for (let i = 0; i < datos.slides.length; i += MAX_PREGUNTAS)
    grupos.push(datos.slides.slice(i, i + MAX_PREGUNTAS));

  const slugBase = slugificar(datos.titulo);
  return grupos.map((slides, i) => ({
    ...datos,
    slides,
    titulo: grupos.length > 1 ? `${datos.titulo} (${i + 1}/${grupos.length})` : datos.titulo,
    slug: grupos.length > 1 ? `${slugBase}-parte-${i + 1}` : slugBase,
  }));
}

// ── Render ──────────────────────────────────────────────────────

async function renderizar(navegador, carrusel, formato, plantilla) {
  const { ancho, alto } = FORMATOS[formato];

  const datos = {
    ...carrusel,
    ...(carrusel.imagenPortada
      ? { imagenPortada: `file://${resolve(RAIZ, carrusel.imagenPortada)}` }
      : {}),
    slides: carrusel.slides.map((s) =>
      s.imagen ? { ...s, imagen: `file://${resolve(RAIZ, s.imagen)}` } : s
    ),
  };

  const html = plantilla.replace(
    '__DATOS__',
    // </script> dentro del JSON cerraría la etiqueta antes de tiempo
    JSON.stringify(datos).replace(/<\//g, '<\\/')
  );

  // Va junto a la plantilla para que las rutas relativas (fuentes/) resuelvan
  const tmp = join(RAIZ, 'plantillas', `.carrusel-${formato}-${carrusel.slug}.html`);
  await writeFile(tmp, html.replace('<html lang="es">', `<html lang="es" data-formato="${formato}">`));

  const pagina = await navegador.newPage({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: 1,
  });

  try {
    await pagina.goto(`file://${tmp}`);
    await pagina.waitForFunction(() => window.__LISTO__ === true, { timeout: 30_000 });

    // Si las fuentes de marca no se aplican, el PNG sale con otra tipografía
    const faltan = await pagina.evaluate(() => window.__FUENTES_FALTAN__);
    if (faltan.length)
      console.warn(`   ⚠ fuentes sin aplicar: ${faltan.join(', ')} — sale con la de reserva`);

    const destino = join(RAIZ, 'out', carrusel.audiencia, carrusel.slug, formato);
    await mkdir(destino, { recursive: true });

    const slides = await pagina.locator('.slide').all();
    for (const [i, slide] of slides.entries()) {
      const nombre = String(i + 1).padStart(2, '0') + '.png';
      await slide.screenshot({ path: join(destino, nombre) });
    }

    const ajustes = await pagina.evaluate(() => window.__AJUSTES__);
    return { destino, total: slides.length, ajustes };
  } finally {
    await pagina.close();
    await rm(tmp, { force: true });
  }
}

// ── CLI ─────────────────────────────────────────────────────────

/** Expande carpetas a los .json que contienen, para poder pasar content/ entero. */
async function expandir(rutas) {
  const ficheros = [];
  for (const r of rutas) {
    const abs = resolve(process.cwd(), r);
    if ((await stat(abs)).isDirectory()) {
      const dentro = (await readdir(abs)).filter((f) => f.endsWith('.json')).sort();
      if (!dentro.length) console.warn(`⚠ ${r} no tiene ningún .json`);
      ficheros.push(...dentro.map((f) => join(abs, f)));
    } else {
      ficheros.push(abs);
    }
  }
  return ficheros;
}

async function main() {
  const args = process.argv.slice(2);
  const rutas = args.filter((a) => !a.startsWith('--'));
  const formatoArg = (args.find((a) => a.startsWith('--formato=')) ?? '').split('=')[1] ?? 'ambos';

  if (!rutas.length) {
    console.error(
      'Uso: node generar-carrusel.js <ruta-json…|carpeta> [--formato=feed|story|ambos]'
    );
    process.exit(1);
  }
  if (!['feed', 'story', 'ambos'].includes(formatoArg)) {
    console.error(`✖ formato "${formatoArg}" no válido. Usa feed, story o ambos.`);
    process.exit(1);
  }

  const formatos = formatoArg === 'ambos' ? ['feed', 'story'] : [formatoArg];
  const ficheros = await expandir(rutas);

  // Se valida todo antes de abrir el navegador: si un JSON está mal, mejor
  // enterarse de golpe que a mitad de una tanda de diez.
  const trabajos = [];
  for (const fichero of ficheros) {
    const corta = fichero.replace(RAIZ + '/', '');
    const datos = JSON.parse(await readFile(fichero, 'utf8'));
    validar(datos, corta);

    const carruseles = repartir(datos);
    if (carruseles.length > 1) {
      console.warn(
        `\n⚠ ${corta}: ${datos.slides.length} preguntas no caben en un carrusel de ${MAX_SLIDES} slides.\n` +
          `  Se parten en ${carruseles.length} carruseles de ${MAX_PREGUNTAS} preguntas como mucho:`
      );
      carruseles.forEach((c) => console.warn(`   · ${c.slug} (${c.slides.length} preguntas)`));
    }
    trabajos.push(...carruseles);
  }

  const plantilla = await readFile(PLANTILLA, 'utf8');

  // Normalmente basta con `npx playwright install chromium`. CHROMIUM_PATH es
  // la salida para entornos que ya traen su propio navegador (CI, contenedores).
  const navegador = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );

  let png = 0;
  try {
    for (const carrusel of trabajos) {
      for (const formato of formatos) {
        const { destino, total, ajustes } = await renderizar(
          navegador,
          carrusel,
          formato,
          plantilla
        );
        png += total;
        const escalas = ajustes.map((a) => a.escala);
        const min = Math.min(...escalas).toFixed(2);
        const max = Math.max(...escalas).toFixed(2);
        console.log(`✔ ${total} slides → ${destino.replace(RAIZ + '/', '')}  (escala ${min}–${max})`);

        // Al mínimo y aun así no cabe: hay que acortar el texto en el JSON
        ajustes
          .filter((a) => a.desbordado)
          .forEach((a) =>
            console.warn(`   ⚠ slide ${a.slide}: el texto no cabe ni al tamaño mínimo — acórtalo en el JSON`)
          );
      }
    }
  } finally {
    await navegador.close();
  }

  if (trabajos.length > 1)
    console.log(`\n${trabajos.length} carruseles · ${png} PNG en out/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
