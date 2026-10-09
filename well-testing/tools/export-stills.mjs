// Exporta imágenes fijas (PNG) y PDF vectoriales de las páginas de well-testing con Playwright.
//
// Uso (desde la raíz del repositorio):
//   node well-testing/tools/export-stills.mjs                 # todos los trabajos
//   node well-testing/tools/export-stills.mjs --only dti-vertical.pdf,dti-vertical.png
//   node well-testing/tools/export-stills.mjs --list          # muestra los trabajos disponibles
//   node well-testing/tools/export-stills.mjs --out /otra/carpeta
//
// Cada trabajo abre una página con parámetros de exportación (sin barra superior, sin animación
// ni controles), espera a que la página avise que está lista y guarda el archivo en
// well-testing/entregables/ (o en --out). Sale con código 1 si hubo errores de consola, de página
// o de carga de recursos.
//
// Para agregar capturas de otras páginas basta con añadir un objeto a JOBS:
//   {
//     out: 'macropera-aerea.png',            // nombre del archivo de salida (.png o .pdf)
//     page: 'macropera.html',                // página dentro de well-testing/
//     query: { export: 1 },                  // parámetros de URL (la página decide qué hacer con ellos)
//     hash: '#vista-aerea',                  // opcional
//     viewport: [1920, 1080], scale: 2,      // px CSS y deviceScaleFactor (PNG = viewport × scale)
//     ready: 'flag' | 1500,                  // 'flag' = espera window.__WT_READY === true; número = ms fijos
//     eval: 'js…',                           // opcional: código a ejecutar antes de capturar
//     pdf: { width: '420mm', height: '297mm', margin: '8mm' } // solo para .pdf (tamaño de página; margen opcional, 0 por defecto)
//     svg: true                              // solo para .svg: requiere que la página exponga WT_DTI.pid (WT.PID)
//   }
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');                 // well-testing/
const A3_PORT = { width: '297mm', height: '420mm', margin: '8mm' };   // margen para impresoras que no imprimen a sangre
// El DTI horizontal está compuesto en 16:9 (pantalla): su PDF usa una página de la misma proporción con el ancho de
// un A3 (420 × 236.25 mm), sin franjas blancas. La versión de impresión en papel A3 es la vertical.
const PAGE_16_9 = { width: '420mm', height: '236.25mm' };

/** Lista de trabajos (extensible). */
export const JOBS = [
  // DTI — infografía horizontal (pantalla 16:9) en tema papel, 4K
  { out: 'dti-horizontal.png', page: 'dti.html', query: { orientacion: 'horizontal', tema: 'papel', export: 1 }, viewport: [1920, 1080], scale: 2, ready: 'flag' },
  // DTI — horizontal en tema pantalla (marino), 4K
  { out: 'dti-horizontal-pantalla.png', page: 'dti.html', query: { orientacion: 'horizontal', tema: 'pantalla', export: 1 }, viewport: [1920, 1080], scale: 2, ready: 'flag' },
  // DTI — vertical A3 en tema papel, ~300 dpi en A4 / 212 dpi en A3 (2480 × 3508)
  { out: 'dti-vertical.png', page: 'dti.html', query: { orientacion: 'vertical', tema: 'papel', export: 1 }, viewport: [1240, 1754], scale: 2, ready: 'flag' },
  // PDF vectoriales (texto seleccionable, fuentes incrustadas): horizontal en página 16:9, vertical en A3 para imprimir
  { out: 'dti-horizontal.pdf', page: 'dti.html', query: { orientacion: 'horizontal', tema: 'papel', export: 1 }, viewport: [1587, 893], ready: 'flag', pdf: PAGE_16_9 },
  { out: 'dti-vertical.pdf', page: 'dti.html', query: { orientacion: 'vertical', tema: 'papel', export: 1 }, viewport: [1123, 1587], ready: 'flag', pdf: A3_PORT },
  // SVG vectoriales autónomos (fuentes y logo incrustados) para edición en Illustrator / Inkscape
  { out: 'dti-horizontal.svg', page: 'dti.html', query: { orientacion: 'horizontal', tema: 'papel', export: 1 }, viewport: [1920, 1080], ready: 'flag', svg: true },
  { out: 'dti-vertical.svg', page: 'dti.html', query: { orientacion: 'vertical', tema: 'papel', export: 1 }, viewport: [1240, 1754], ready: 'flag', svg: true }
];

/* ---------------- CLI ---------------- */
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--list')) {
  for (const j of JOBS) console.log(`${j.out.padEnd(32)} ${j.page}?${new URLSearchParams(j.query || {})}`);
  process.exit(0);
}
const only = (opt('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const outDir = path.resolve(opt('out', path.join(ROOT, 'entregables')));
const jobs = only.length ? JOBS.filter((j) => only.includes(j.out) || only.includes(j.out.replace(/\.\w+$/, ''))) : JOBS;
if (!jobs.length) { console.error('No hay trabajos que coincidan con --only', only.join(',')); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const FONT_PROBES = [
  '400 16px "Barlow"', '500 16px "Barlow"', '600 16px "Barlow"', '700 16px "Barlow"',
  '500 16px "Barlow Condensed"', '600 16px "Barlow Condensed"', '700 16px "Barlow Condensed"', '800 16px "Barlow Condensed"',
  '400 16px "JetBrains Mono"', '700 16px "JetBrains Mono"'
];

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none'] });
let failed = 0;
for (const job of jobs) {
  const t0 = Date.now();
  const [vw, vh] = job.viewport || [1920, 1080];
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: job.pdf ? 1 : (job.scale || 1) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  const url = pathToFileURL(path.join(ROOT, job.page)).href + (job.query ? '?' + new URLSearchParams(job.query) : '') + (job.hash || '');
  await page.goto(url, { waitUntil: 'load' });
  // fuentes locales usadas por el SVG
  await page.evaluate(async (probes) => { if (document.fonts) { await Promise.all(probes.map((f) => document.fonts.load(f).catch(() => null))); await document.fonts.ready; } }, FONT_PROBES);
  if (job.ready === 'flag') await page.waitForFunction(() => window.__WT_READY === true, null, { timeout: 30000 });
  else await page.waitForTimeout(+job.ready || 1500);
  if (job.eval) { await page.evaluate(job.eval); await page.waitForTimeout(300); }

  const dest = path.join(outDir, job.out);
  if (job.svg) {
    // fuentes y logo leídos del disco e incrustados como data: → SVG que se ve igual en cualquier equipo
    const fuentes = await page.evaluate(() => window.WT.PID.FUENTES);
    const fontCSS = fuentes.map((f) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'assets', f.file)).toString('base64')}) format("woff2")}`).join('\n');
    const logoRel = await page.evaluate(() => { const i = window.WT_DTI.pid.svg.querySelector('image.logo'); return i ? i.getAttribute('href') : null; });
    const logoHref = logoRel ? 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ROOT, logoRel)).toString('base64') : null;
    const svg = await page.evaluate(([css, logo]) => window.WT_DTI.pid.toSVGString({ fontCSS: css, logoHref: logo }), [fontCSS, logoHref]);
    fs.writeFileSync(dest, svg);
  } else if (job.pdf) {
    await page.emulateMedia({ media: 'screen' });       // usa el diseño de exportación, no el de impresión del visor
    const m = job.pdf.margin || 0;
    await page.pdf({ path: dest, width: job.pdf.width, height: job.pdf.height, printBackground: true, margin: { top: m, right: m, bottom: m, left: m }, pageRanges: '1' });
  } else {
    await page.screenshot({ path: dest, type: 'png' });
  }
  await ctx.close();
  const kb = Math.round(fs.statSync(dest).size / 1024);
  const tag = errors.length ? '✗' : '✓';
  console.log(`${tag} ${job.out.padEnd(30)} ${String(kb).padStart(6)} KB  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (errors.length) { failed++; console.log('   ' + errors.join('\n   ')); }
}
await browser.close();
console.log(`Salida: ${outDir}`);
process.exit(failed ? 1 : 0);
