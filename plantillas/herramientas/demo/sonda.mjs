/**
 * Sonda: abre /org con sesión simulada y apunta TODO lo que la app le pide a
 * Supabase. Sirve para saber qué hay que simular antes de simularlo.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';
import { REF, USUARIO, SESION, simular, sesionSimulada } from './servidor.mjs';

const navegador = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await navegador.newContext({ viewport: { width: 420, height: 880 } });

await sesionSimulada(ctx);

const pedidos = new Map();
const pagina = await ctx.newPage();
await simular(pagina, {
  registro: (p, q) => {
    const k = p + (q ? ' ?' + q.slice(1, 80) : '');
    pedidos.set(k, (pedidos.get(k) ?? 0) + 1);
  },
});

pagina.on('console', (m) => { if (m.type() === 'error') console.log('  ✖', m.text().slice(0, 140)); });

await pagina.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
await pagina.waitForTimeout(2500);

// Recorre el menú para ver qué pide cada sección
for (const etiqueta of ['RECORRIDOS','CORREDORES','VOLUNTARIADO','ESTADÍSTICAS','SEGUIMIENTO GPS','DOCUMENTACIÓN','RESULTADOS']) {
  const b = pagina.getByText(etiqueta, { exact: true }).first();
  if (await b.count()) {
    console.log(`\n--- ${etiqueta} ---`);
    const antes = new Set(pedidos.keys());
    await b.click().catch(() => {});
    await pagina.waitForTimeout(1200);
    [...pedidos.keys()].filter((k) => !antes.has(k)).forEach((k) => console.log('   ' + k));
    await pagina.goto(`${BASE}/org`, { waitUntil: 'networkidle' }).catch(() => {});
    await pagina.waitForTimeout(500);
  }
}

console.log('\n=== lo que pide /org ===');
[...pedidos.entries()].sort().forEach(([k, n]) => console.log(`  ${n}×  ${k}`));
console.log('\n=== lo que se ve ===');
console.log((await pagina.locator('body').innerText()).split('\n').filter(Boolean).slice(0, 30).join('\n'));
await pagina.screenshot({ path: 'out/org-sonda.png' });
await navegador.close();
