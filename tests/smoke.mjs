// Prueba de humo: abre cada lección en Chromium y comprueba que no hay errores.
// Uso: node tests/smoke.mjs  (requiere playwright instalado globalmente)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')); }

const url = pathToFileURL(path.resolve('index.html')).href;
const browser = await pw.chromium.launch();
const shots = process.argv.includes('--shots');
const outDir = process.env.SHOT_DIR || '.';
const errors = [];
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport: vp, ignoreHTTPSErrors: true });
  page.on('pageerror', (e) => errors.push(`[${vp.width}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/fonts\.(googleapis|gstatic)/.test(m.location().url || '')) return; // sin red para fuentes: no es un fallo
    errors.push(`[${vp.width}] console: ${m.text()}`);
  });
  await page.goto(url + '#inicio');
  await page.waitForTimeout(600);
  const ids = await page.evaluate(() => MB.LESSONS.map((l) => l.id));
  for (const id of ['inicio', ...ids]) {
    await page.evaluate((h) => (location.hash = h), '#' + id);
    await page.waitForTimeout(350);
    const figErr = await page.$$eval('.frame-error', (els) => els.filter((e) => /No se pudo cargar/.test(e.textContent)).length);
    if (figErr) errors.push(`[${vp.width}] ${id}: ${figErr} figura(s) sin cargar`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) errors.push(`[${vp.width}] ${id}: desbordamiento horizontal de ${overflow}px`);
    if (shots) await page.screenshot({ path: `${outDir}/${vp.width}-${id}.png`, fullPage: false });
  }
  // Laboratorio: enviar peticiones de cada reto
  await page.evaluate((h) => (location.hash = h), '#laboratorio');
  await page.waitForTimeout(300);
  const n = await page.$$eval('.challenge', (els) => els.length);
  for (let i = 0; i < n; i++) {
    await page.locator('.challenge button').nth(i).click();
    await page.waitForTimeout(100);
    await page.locator('.lab-grid .btn-primary').first().click();
    await page.waitForFunction(() => !document.querySelector('.lab-grid .btn-primary').disabled, null, { timeout: 8000 });
  }
  const got = await page.$$eval('.challenge.done', (els) => els.length);
  if (got !== n) errors.push(`[${vp.width}] retos completados ${got}/${n}`);

  // Del monitor de tráfico al analizador
  await page.locator('.log-row').first().click();
  await page.waitForTimeout(400);
  if (!page.url().endsWith('#analizador')) errors.push(`[${vp.width}] el monitor no abre el analizador`);
  const decoded = await page.$$eval('.ftable tbody tr', (els) => els.length);
  if (!decoded) errors.push(`[${vp.width}] el analizador no decodificó la trama del laboratorio`);

  // Paleta de búsqueda
  await page.keyboard.press('Control+k');
  await page.keyboard.type('crc-16 paso');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  if (!page.url().endsWith('#crc')) errors.push(`[${vp.width}] la paleta no navega a #crc`);

  // Tipos de datos: solo un grupo de campos visible
  await page.evaluate(() => (location.hash = '#tipos'));
  await page.waitForTimeout(300);
  if (await page.locator('#dt-r0').isVisible()) errors.push(`[${vp.width}] tipos: campos de registros visibles en modo valor`);

  // Examen completo
  await page.evaluate(() => (location.hash = '#examen'));
  await page.waitForTimeout(300);
  await page.click('text=Empezar el examen');
  for (let i = 0; i < 15; i++) {
    await page.locator('.q-opt').first().click();
    await page.locator('.plain-widget .btn-primary:visible').last().click();
  }
  if (!(await page.locator('.ring b').first().textContent()).includes('%')) errors.push(`[${vp.width}] el examen no muestra resultado`);
  await page.close();
}
await browser.close();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log('Humo OK: todas las rutas cargan sin errores y los retos del laboratorio se completan.');
