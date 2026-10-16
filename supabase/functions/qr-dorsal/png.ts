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
