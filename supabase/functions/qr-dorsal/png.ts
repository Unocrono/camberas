/**
 * PNG en blanco y negro (1 bit) de una matriz de QR, sin dependencias: los
 * correos no ejecutan JavaScript ni muestran SVG ni data: URIs (Gmail), así
 * que el QR tiene que llegar como imagen PNG de verdad.
 *
 * Sin imports: se puede probar desde Node (CompressionStream es global en
 * Node 18+ y en Deno).
 */

/** Una matriz cuadrada de módulos: data[fila * size + columna] = 1 si es negro */
export interface MatrizQr {
  size: number;
  data: ArrayLike<number>;
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Un trozo PNG: longitud, tipo, datos y CRC de tipo + datos */
const trozo = (tipo: string, datos: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + datos.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, datos.length);
  out.set(new TextEncoder().encode(tipo), 4);
  out.set(datos, 8);
  dv.setUint32(8 + datos.length, crc32(out.subarray(4, 8 + datos.length)));
  return out;
};

/** zlib (lo que pide el IDAT de PNG): CompressionStream "deflate" lo es */
const comprimir = async (b: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(
    await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer(),
  );

/**
 * La matriz a PNG: cada módulo, escala × escala píxeles, con margen blanco
 * de `margen` módulos alrededor (el estándar pide 4 para leerlo bien).
 */
export async function pngDeQr(m: MatrizQr, escala = 8, margen = 4): Promise<Uint8Array> {
  const lado = (m.size + margen * 2) * escala;
  const bytesFila = Math.ceil(lado / 8);
  // Escala de grises de 1 bit: 1 = blanco, 0 = negro. Cada fila empieza
  // con el byte de filtro (0, sin filtro)
  const crudo = new Uint8Array((bytesFila + 1) * lado);
  for (let y = 0; y < lado; y++) {
    const fila = (bytesFila + 1) * y;
    const my = Math.floor(y / escala) - margen;
    for (let x = 0; x < lado; x++) {
      const mx = Math.floor(x / escala) - margen;
      const negro = my >= 0 && my < m.size && mx >= 0 && mx < m.size && m.data[my * m.size + mx] === 1;
      if (!negro) crudo[fila + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, lado);
  dv.setUint32(4, lado);
  ihdr[8] = 1; // bits por píxel
  ihdr[9] = 0; // escala de grises
  // compresión, filtro y entrelazado: 0
  const partes = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", await comprimir(crudo)),
    trozo("IEND", new Uint8Array(0)),
  ];
  const total = partes.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    png.set(p, pos);
    pos += p.length;
  }
  return png;
}

/** Un raster RGBA (el logo): data[(y * width + x) * 4 + canal] */
export interface RasterRgba {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * La matriz a PNG en color (RGB de 8 bits) con el logo de Camberas en el
 * centro, con las mismas proporciones que qrConLogo en la web: disco blanco
 * y encima el logo, a un 22 % del lado. Solo se pinta el círculo inscrito del
 * logo (sus esquinas son blancas) y los bordes van suavizados. Exige
 * corrección H en el QR: el logo tapa alrededor de un 5 % de los módulos.
 */
export async function pngDeQrConLogo(m: MatrizQr, logo: RasterRgba, escala = 8, margen = 4): Promise<Uint8Array> {
  const lado = (m.size + margen * 2) * escala;
  const stride = lado * 3;
  // RGB de 8 bits. Cada fila empieza con el byte de filtro (0, sin filtro)
  const crudo = new Uint8Array((stride + 1) * lado);

  // 1) El QR en blanco y negro
  for (let y = 0; y < lado; y++) {
    const fila = (stride + 1) * y;
    const my = Math.floor(y / escala) - margen;
    for (let x = 0; x < lado; x++) {
      const mx = Math.floor(x / escala) - margen;
      const negro = my >= 0 && my < m.size && mx >= 0 && mx < m.size && m.data[my * m.size + mx] === 1;
      const v = negro ? 0 : 255;
      const o = fila + 1 + x * 3;
      crudo[o] = v;
      crudo[o + 1] = v;
      crudo[o + 2] = v;
    }
  }

  // 2) Disco blanco y logo (qrConLogo: lado 22 %, disco = lado/2 + 6 px a 360)
  const ladoLogo = lado * 0.22;
  const radioLogo = ladoLogo / 2;
  const radioDisco = radioLogo + (6 * lado) / 360;
  const cx = lado / 2;
  const cy = lado / 2;
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // Muestreo bilineal del raster del logo en (u, v) en píxeles del logo
  const muestra = (u: number, v: number, canal: number): number => {
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, logo.width - 1);
    const y1 = Math.min(y0 + 1, logo.height - 1);
    const fx = u - x0;
    const fy = v - y0;
    const px = (x: number, y: number) => logo.data[(y * logo.width + x) * 4 + canal];
    return (
      px(x0, y0) * (1 - fx) * (1 - fy) +
      px(x1, y0) * fx * (1 - fy) +
      px(x0, y1) * (1 - fx) * fy +
      px(x1, y1) * fx * fy
    );
  };

  const yIni = Math.max(0, Math.floor(cy - radioDisco) - 1);
  const yFin = Math.min(lado - 1, Math.ceil(cy + radioDisco) + 1);
  const xIni = Math.max(0, Math.floor(cx - radioDisco) - 1);
  const xFin = Math.min(lado - 1, Math.ceil(cx + radioDisco) + 1);
  for (let y = yIni; y <= yFin; y++) {
    const fila = (stride + 1) * y;
    for (let x = xIni; x <= xFin; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const cobDisco = clamp01(radioDisco - d + 0.5);
      if (cobDisco <= 0) continue;
      const o = fila + 1 + x * 3;
      // Disco blanco (borde suavizado en el último píxel)
      for (let c = 0; c < 3; c++) crudo[o + c] = Math.round(crudo[o + c] + (255 - crudo[o + c]) * cobDisco);
      // Logo, solo dentro de su círculo inscrito
      const cobLogo = clamp01(radioLogo - d + 0.5);
      if (cobLogo <= 0) continue;
      const u = Math.min(logo.width - 1, Math.max(0, ((dx + radioLogo) / ladoLogo) * logo.width - 0.5));
      const v = Math.min(logo.height - 1, Math.max(0, ((dy + radioLogo) / ladoLogo) * logo.height - 0.5));
      const alfa = (muestra(u, v, 3) / 255) * cobLogo;
      if (alfa <= 0) continue;
      for (let c = 0; c < 3; c++) {
        crudo[o + c] = Math.round(crudo[o + c] * (1 - alfa) + muestra(u, v, c) * alfa);
      }
    }
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, lado);
  dv.setUint32(4, lado);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  // compresión, filtro y entrelazado: 0
  const partes = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", await comprimir(crudo)),
    trozo("IEND", new Uint8Array(0)),
  ];
  const total = partes.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}
