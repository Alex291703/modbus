// Exporta los entregables de Well Testing: videos MP4 (cuadro por cuadro,
// deterministas) y la infografía DTI / macropera en PNG y PDF.
//
// Uso:
//   node well-testing/tools/render.mjs                 # todo
//   node well-testing/tools/render.mjs proceso         # solo la animación del proceso (16:9 y 9:16)
//   node well-testing/tools/render.mjs separador --fmt 16x9 --fps 30
//   node well-testing/tools/render.mjs dti macropera   # solo imágenes
//
// Requiere Playwright (Chromium) y ffmpeg en el PATH. Los archivos se
// escriben en well-testing/entregables/.
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(path.join(process.env.NODE_PATH || "/opt/node22/lib/node_modules", "playwright"));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = path.join(root, "entregables");
fs.mkdirSync(out, { recursive: true });
const pageURL = pathToFileURL(path.join(root, "index.html")).href;

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : def;
};
const jobs = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const want = (j) => jobs.length === 0 || jobs.includes(j);
const FPS = +opt("fps", 30);
const FMTS = opt("fmt", "16x9,9x16").split(",");
const SIZE = { "16x9": [1920, 1080], "9x16": [1080, 1920] };

// SwiftShader permite WebGL sin GPU (servidores, CI).
const launch = () =>
  pw.chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function openCapture(browser, query, [w, h]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("  pageerror:", e.message));
  await page.goto(`${pageURL}?${query}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 90000 });
  return page;
}

async function video(scene, fmt) {
  const size = SIZE[fmt];
  const file = path.join(out, `${scene === "proceso" ? "aforo-proceso" : "separador-corte"}-${fmt}.mp4`);
  const browser = await launch();
  const page = await openCapture(browser, `capture=${scene}&fmt=${fmt}`, size);
  const dur = await page.evaluate(() => window.__wt.duration);
  const n = Math.round(dur * FPS);
  console.log(`▶ ${path.basename(file)}: ${n} cuadros a ${FPS} fps (${size.join("×")})`);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.__wt.seek(t), i / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  ${scene} ${fmt}: ${i}/${n}  (${el.toFixed(0)} s, ~${((el / (i + 1)) * (n - i)).toFixed(0)} s restantes)`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  console.log(`✔ ${file}`);
}

async function images() {
  const browser = await launch();
  if (want("dti")) {
    for (const [layout, size] of [
      ["h", [1920, 1080]],
      ["v", [1123, 1587]],
    ]) {
      const page = await openCapture(browser, `capture=dti&layout=${layout}`, size);
      await page.waitForFunction(() => document.documentElement.dataset.dtiReady === "1", null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(400);
      const name = layout === "h" ? "dti-horizontal" : "dti-vertical";
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      // PNG en alta resolución (2×) para impresión
      const hi = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2 });
      await hi.goto(`${pageURL}?capture=dti&layout=${layout}`);
      await hi.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 60000 });
      await hi.waitForTimeout(400);
      await hi.screenshot({ path: path.join(out, `${name}@2x.png`) });
      await hi.close();
      // El modo captura del DTI define el tamaño de página (@page): A3 vertical o 1920×1080 px.
      await page.pdf({ path: path.join(out, `${name}.pdf`), preferCSSPageSize: true, printBackground: true, pageRanges: "1" });
      await page.close();
      console.log(`✔ ${name}.png / ${name}@2x.png / ${name}.pdf`);
    }
  }
  if (want("macropera")) {
    for (const view of ["plan", "3d"]) {
      const page = await openCapture(browser, `capture=macropera&view=${view}`, [1920, 1080]);
      // La cámara ya está en su encuadre final (setMode instantáneo): basta un cuadro
      await page.evaluate(() => window.__wt.seek(6));
      await page.waitForTimeout(300);
      const name = `macropera-${view === "plan" ? "planta" : "3d"}`;
      await page.screenshot({ path: path.join(out, `${name}.png`), timeout: 180000 });
      await page.close();
      console.log(`✔ ${name}.png`);
    }
  }
  await browser.close();
}

if (want("dti") || want("macropera")) await images();
const vids = [];
for (const scene of ["proceso", "separador"]) if (want(scene)) for (const f of FMTS) vids.push([scene, f]);
// Dos videos en paralelo: SwiftShader ya usa varios hilos por proceso.
const par = +opt("par", 2);
for (let i = 0; i < vids.length; i += par) await Promise.all(vids.slice(i, i + par).map(([s, f]) => video(s, f)));
