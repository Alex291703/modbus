// Captura de pantalla + errores de consola de una página de well-testing.
// Uso:
//   node well-testing/tools/shot.mjs <pagina.html> [--w 1440] [--h 900] [--wait 1500]
//        [--out archivo.png] [--hash "#paso-3"] [--eval "js a ejecutar antes de capturar"] [--full]
// Imprime los errores de página/consola (salida != 0 si hay errores).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')); }

const args = process.argv.slice(2);
const VALUED = ['--w', '--h', '--wait', '--out', '--hash', '--eval'];
const file = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const w = +opt('w', 1440), h = +opt('h', 900), wait = +opt('wait', 1500);
const out = opt('out', path.join(process.env.SHOT_DIR || '.', path.basename(file, '.html') + `-${w}x${h}.png`));
const hash = opt('hash', '');
const evalJs = opt('eval', '');
const full = args.includes('--full');

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
await page.goto(pathToFileURL(path.resolve(file)).href + hash);
await page.waitForTimeout(wait);
if (evalJs) { await page.evaluate(evalJs); await page.waitForTimeout(Math.min(wait, 1500)); }
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 1) errors.push(`desbordamiento horizontal de ${overflow}px`);
await page.screenshot({ path: out, fullPage: full });
await browser.close();
console.log('captura:', out);
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
