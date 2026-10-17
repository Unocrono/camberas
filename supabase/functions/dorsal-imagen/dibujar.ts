// Dibuja el dorsal simulado: la plantilla en blanco de la carrera (JPG) con el
// número y el nombre del corredor encima. Sin base de datos: recibe los bytes
// de la plantilla y de la fuente, y la colocación (races.dorsal_simulado).
//
// La colocación se mide sobre el dorsal de muestra del organizador:
//   numero.centroX / arriba / alto  → caja del número (alto de las cifras)
//   numero.ensanche                → la fuente libre (Anton) es algo más
//                                    estrecha que la del diseño: se ensancha
//   numero.anchoMax                → con 5 cifras no se sale: se encoge entero
//   nombre.centroX / arriba        → arriba = alto de la MAYÚSCULA (la J de
//                                    «Jorge»); se alinea por la línea base,
//                                    así una tilde (Í) no empuja el nombre
//   nombre.alto                    → alto de la mayúscula en píxeles
//   nombre.ensanche                → como en el número
//   nombre.anchoMax                → un nombre largo se encoge hasta caber

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

export interface CajaNumero {
  centroX: number;
  arriba: number;
  alto: number;
  ensanche?: number;
  anchoMax?: number;
  color?: string;
}
export interface CajaNombre {
  centroX: number;
  arriba: number;
  alto: number;
  ensanche?: number;
  anchoMax?: number;
  color?: string;
}
export interface Colocacion {
  numero: CajaNumero;
  nombre?: CajaNombre;
}

// "#1a2b3c" → 0x1a2b3cff (RGBA que usa imagescript); negro si no vale
function rgba(color?: string): number {
  const m = (color ?? "").match(/^#?([0-9a-f]{6})$/i);
  return m ? ((parseInt(m[1], 16) << 8) | 0xff) >>> 0 : 0x000000ff;
}

// Caja de la tinta (píxeles con opacidad) dentro de una imagen de texto
function tinta(img: Image): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 1; y <= img.height; y++) {
    for (let x = 1; x <= img.width; x++) {
      if ((img.getPixelAt(x, y) & 0xff) > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** El nombre como va en el dorsal: «MARTA» / «marta» → «Marta» */
export function nombreDorsal(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es")
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toLocaleUpperCase("es"));
}

export async function dibujarDorsal(
  plantilla: Uint8Array,
  fuente: Uint8Array,
  numero: string,
  nombre: string | null,
  c: Colocacion,
): Promise<Uint8Array> {
  const lienzo = await Image.decode(plantilla);

  // ── Número: se escala al alto de la caja, se ensancha y, si no cabe, se encoge
  const n = await Image.renderText(fuente, 600, numero, rgba(c.numero.color));
  const tn = tinta(n);
  if (tn) {
    const cifras = n.crop(tn.x - 1, tn.y - 1, tn.w, tn.h);
    let alto = c.numero.alto;
    let ancho = Math.round((cifras.width * alto) / cifras.height * (c.numero.ensanche ?? 1));
    const max = c.numero.anchoMax ?? lienzo.width;
    if (ancho > max) {
      alto = Math.round((alto * max) / ancho);
      ancho = max;
    }
    cifras.resize(ancho, alto);
    // Encogido, se queda apoyado en la misma línea de abajo
    lienzo.composite(cifras, Math.round(c.numero.centroX - ancho / 2), c.numero.arriba + (c.numero.alto - alto));
  }

  // ── Nombre: escala por el alto de la mayúscula y alineado por la línea base
  if (nombre && c.nombre) {
    const color = rgba(c.nombre.color);
    // La imagen de una línea tiene siempre el mismo alto y la misma línea
    // base: midiendo la «H» se sabe dónde cae la mayúscula en cualquier texto
    const ref = await Image.renderText(fuente, 100, "H", color);
    const th = tinta(ref);
    const escala = th ? (100 * c.nombre.alto) / th.h : 100;
    const linea = await Image.renderText(fuente, escala, nombre, color);
    const h = await Image.renderText(fuente, escala, "H", color);
    const capArriba = tinta(h)?.y ?? 1;
    const tl = tinta(linea);
    if (tl) {
      // Solo se recorta de lado a lado: arriba y abajo se respeta la línea
      let texto = linea.crop(tl.x - 1, 0, tl.w, linea.height);
      if ((c.nombre.ensanche ?? 1) !== 1) {
        texto = texto.resize(Math.round(texto.width * (c.nombre.ensanche ?? 1)), texto.height);
      }
      let desplaza = capArriba - 1;
      const max = c.nombre.anchoMax ?? lienzo.width;
      if (texto.width > max) {
        const f = max / texto.width;
        texto = texto.resize(max, Math.max(1, Math.round(texto.height * f)));
        desplaza = Math.round(desplaza * f);
        // Más pequeño, se baja para que siga apoyado en la misma línea base
        desplaza -= Math.round(c.nombre.alto * (1 - f));
      }
      lienzo.composite(texto, Math.round(c.nombre.centroX - texto.width / 2), c.nombre.arriba - desplaza);
    }
  }

  return await lienzo.encodeJPEG(85);
}
