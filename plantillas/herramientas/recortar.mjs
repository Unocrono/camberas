import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const [ , , origen, destino, x, y, w, h ] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('file://' + process.cwd() + '/' + origen);

const b64 = await p.evaluate(({ x, y, w, h }) => {
  const img = document.querySelector('img');
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, x, y, w, h, 0, 0, w, h);

  const d = g.getImageData(0, 0, w, h);
  const px = d.data;
  const APP = [0x14, 0x3a, 0x25];   // fondo de Camberas Track
  const SLIDE = [0x0e, 0x24, 0x19]; // verde tinta del carrusel

  for (let i = 0; i < px.length; i += 4) {
    const dist = Math.hypot(px[i] - APP[0], px[i+1] - APP[1], px[i+2] - APP[2]);
    // Cerca del fondo → se sustituye entero. En la franja de transición se
    // mezcla, para que el borde del círculo no quede con halo.
    let k = 0;
    if (dist < 26) k = 1;
    else if (dist < 60) k = 1 - (dist - 26) / 34;
    if (k > 0) for (let j = 0; j < 3; j++)
      px[i+j] = Math.round(px[i+j] + (SLIDE[j] - APP[j]) * k);
  }
  g.putImageData(d, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}, { x: +x, y: +y, w: +w, h: +h });

await writeFile(destino, Buffer.from(b64, 'base64'));
console.log(`${destino}  ${w}x${h}  (fondo adaptado)`);
await b.close();
