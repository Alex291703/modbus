// Prueba de sincronización entre dispositivos: dos navegadores con almacenamiento
// local separado comparten un almacén de cuenta simulado (window.claude falso).
// Uso: node tests/sync.mjs  (requiere playwright instalado globalmente)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')); }

const url = pathToFileURL(path.resolve('index.html')).href;
const docs = {};
const pages = [];
const writes = [];

const MOCK = () => {
  const snapOf = (d) => ({ exists: d != null, data: () => (d == null ? undefined : d), metadata: { fromCache: false, hasPendingWrites: false } });
  window.__subs = [];
  window.__dbNotify = (p, d) => window.__subs.filter((s) => s.path === p).forEach((s) => s.next(snapOf(d)));
  window.claude = {
    use: async (name) => {
      if (name === 'user') return Object.freeze({ id: async () => 'u_prueba' });
      if (name === 'db')
        return Object.freeze({
          doc: (p) => ({
            path: p,
            set: async (data) => window.__dbSet(p, JSON.parse(JSON.stringify(data))),
            onSnapshot(next) {
              window.__subs.push({ path: p, next });
              window.__dbGet(p).then((d) => next(snapOf(d)));
              return () => {};
            },
          }),
        });
      return null;
    },
  };
};

const browser = await pw.chromium.launch();
async function device(name, seedLocal) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.exposeBinding('__dbGet', (_, p) => docs[p] ?? null);
  await ctx.exposeBinding('__dbSet', async (_, p, d) => {
    docs[p] = d;
    writes.push({ from: name, p, d });
    for (const pg of pages) await pg.evaluate(([pp, dd]) => window.__dbNotify(pp, dd), [p, d]).catch(() => {});
  });
  await ctx.addInitScript(MOCK);
  if (seedLocal) await ctx.addInitScript((v) => localStorage.setItem('academia-modbus:v1', v), JSON.stringify(seedLocal));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(url + '#intro');
  pages.push(page);
  return page;
}
const errors = [];
const fail = (m) => errors.push(m);
const progress = (pg) => pg.locator('.progress-row b').textContent();
const status = (pg) => pg.locator('.sync-line').textContent();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ordenador: sin progreso previo
const pc = await device('ordenador');
await wait(800);
if ((await status(pc)) !== 'Sincronizado con tu cuenta') fail(`ordenador: estado «${await status(pc)}»`);
await pc.click('text=Marcar como completada');
await wait(1200);
if (!docs['data/users/u_prueba/progress']?.done?.intro) fail('la lección completada no llegó a la cuenta');

// Móvil: ya tenía una lección hecha sin conexión
const phone = await device('móvil', { done: { rtu: true } });
await wait(1500);
if ((await progress(phone)) !== '2 / 15') fail(`móvil: progreso ${await progress(phone)}, se esperaba 2 / 15`);
if ((await progress(pc)) !== '2 / 15') fail(`ordenador no recibió el progreso del móvil: ${await progress(pc)}`);

// Un reto del laboratorio en el móvil aparece en el ordenador
await phone.evaluate(() => (location.hash = '#laboratorio'));
await pc.evaluate(() => (location.hash = '#laboratorio'));
await wait(400);
await phone.locator('.challenge button').first().click();
await phone.locator('.lab-grid .btn-primary').first().click();
await wait(4500);
if ((await pc.locator('.challenge.done').count()) !== 1) fail('el reto del móvil no aparece en el laboratorio del ordenador');

// Reiniciar en el ordenador borra también en el móvil
await pc.click('text=Reiniciar progreso');
await pc.click('text=Pulsa otra vez para borrar');
await wait(1500);
if ((await progress(phone)) !== '0 / 15') fail(`el reinicio no llegó al móvil: ${await progress(phone)}`);

// Sin window.claude (archivo local): solo navegador
const ctx = await browser.newContext();
const plain = await ctx.newPage();
await plain.goto(url);
await wait(300);
if ((await status(plain)) !== 'Guardado en este navegador') fail(`archivo local: estado «${await status(plain)}»`);

await browser.close();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log(`Sincronización OK (${writes.length} escrituras a la cuenta).`);
