# Well Testing · Aforo de pozos — material técnico-visual

Material de R.B. Tec México para explicar el servicio de Well Testing (aforo de pozos con
separador bifásico de circuito cerrado) en presentaciones a PEMEX/clientes y en la
capacitación de personal nuevo.

## Entregables

| # | Entregable | Interactivo | Archivos para presentar / imprimir |
|---|------------|-------------|------------------------------------|
| 1 | Animación del proceso pozo → separador → batería | `proceso.html` | `entregables/well-testing-16x9.mp4`, `entregables/well-testing-9x16.mp4` |
| 2 | Corte interno del separador, paso a paso | `separador.html` | (incluido en el video) |
| 3 | Vista aérea de la macropera | `macropera.html` | (incluida en el video) |
| 4 | Infografía del DTI (P&ID) con simbología ISA | `dti.html` | `entregables/dti-horizontal.png/.pdf`, `entregables/dti-vertical.png/.pdf` |

`index.html` es la portada que reúne todo (videos, descargas, fotos de campo, instrumentación).

## Cómo abrirlo

No necesita instalación ni internet: abra `well-testing/index.html` con doble clic en Chrome o Edge.
Todo (three.js, GSAP, fuentes, imágenes) está incluido en la carpeta.

## Cómo corregir datos

Todos los textos técnicos, tags y datos salen de **`js/data.js`**. Una corrección ahí se refleja
en las páginas, el DTI y (al volver a renderizar) el video.

El logotipo es **provisional**: reemplace `assets/logo-rbtec.svg` (fondos claros) y
`assets/logo-rbtec-blanco.svg` (fondos oscuros) por el oficial, con el mismo nombre de archivo, y
ejecute `node well-testing/tools/build-logo.mjs` para actualizar la copia incrustada (`js/logo.js`)
que usan las exportaciones a PNG/SVG.

### Regenerar PNG/PDF/SVG del DTI

Después de cualquier cambio en `js/data.js` o `js/pid.js`, regenere las láminas de `entregables/`
(requiere Playwright con Chromium):

```bash
npm i -D playwright && npx playwright install chromium   # una sola vez
node well-testing/tools/export-stills.mjs                # desde la raíz del repositorio
```

### Puntos por confirmar con el área técnica

* **Asignación tag ↔ variable** (`WT.data.instrumentos`). Se interpretó así a partir de las
  variables reportadas y de los rótulos del cableado del RTU:
  TDP = presión en boca de pozo · TPS = presión del separador · TT = temperatura del separador ·
  TN = nivel del separador · CORIOLIS = Promass 300 (másico, densidad, % agua) ·
  TDG = transmisor de presión diferencial de la placa de orificio para el gasto de gas (ISA FIT) ·
  TDM = presión de la línea de salida (mezcla reincorporada) · TPL = presión de la línea a batería.
* **Datos del separador**: diámetro, longitud, presión y temperatura de diseño están vacíos
  (`null`) y no se muestran hasta capturarlos. La capacidad (0.761 m³ / 4.78 bls) se tomó de la
  placa del equipo FA-02 de la fotografía.
* **Macropera**: no se recibió croquis; la distribución y las distancias son aproximadas
  (`WT.data.macropera`).
* **Duración de la estabilización** (2 h ilustrativas, `WT.data.medicion`).
* **Orden en cada salida**: se dibujó la práctica usual de separadores de prueba, con el medidor
  aguas arriba de la válvula de control (líquido: Coriolis → LV; gas: placa de orificio → PV),
  para medir a presión del separador y sin vaporización en el medidor.
* **Lazos de control** (`WT.data.funciones`): nivel TN → LIC (en el RTU) → LV y presión
  TPS → PIC (en el RTU) → PV. Si la PV es una válvula de contrapresión autorregulada o los
  controladores son neumáticos locales, ajustar `funciones`. El gasto de gas (FQI en el RTU) se
  calcula con el ΔP de la placa (TDG) compensado por presión (TPS) y temperatura (TT).
* **Montaje del TN** (sonda superior), toma del TDP (línea lateral TP, aguas arriba del
  estrangulador), ubicación del manómetro local, PSV hacia el extremo de entrada y registro en la
  tapa de salida (según la foto del FA-02), enlace RTU → SCADA por Ethernet y diámetro nominal de
  4 in (rotulado en la tubería del equipo de la foto).
* **Cabezal / manifold**: se dibujó como arreglo de válvulas que alinea el pozo en prueba hacia el
  separador, entre el estrangulador y la línea de entrada; los demás pozos de la macropera siguen
  produciendo a batería por su línea.
* Los valores del SCADA son **simulados** y así se rotulan.

## Video (HyperFrames)

El video se genera con [HyperFrames](https://github.com/heygen-com/hyperframes) a partir de HTML
en `video/`: `index.html` es la versión 16:9 (1920×1080) y `vertical.html` la 9:16 (1080×1920);
ambas usan `video/src/film.js` y los mismos módulos de `js/` mediante los enlaces simbólicos
`video/lib → ../js` y `video/assets → ../assets`. La música (`assets/audio/`) se genera con
`tools/make-music.py` y está sincronizada con los cortes de `video/STORYBOARD.md`.

Requiere Node 22+ y FFmpeg (en Linux sin Chrome puede indicarse un navegador con
`HYPERFRAMES_BROWSER_PATH`). La versión de HyperFrames está fijada en `video/package.json`.

```bash
cd well-testing/video
npx --yes hyperframes@0.8.143 render -o renders/master-16x9.mp4                  # 16:9
npx --yes hyperframes@0.8.143 render -c vertical.html -o renders/master-9x16.mp4 # 9:16
# Compresión para entrega (los másters salen a ~20 Mbps; los entregables, ~3.5 Mbps):
ffmpeg -i renders/master-16x9.mp4 -c:v libx264 -b:v 3500k -maxrate 5M -bufsize 7M -preset slow \
  -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k ../entregables/well-testing-16x9.mp4
```

Notas:

* El render es lento en equipos sin GPU (la escena 3D se dibuja por software): ~1 h por formato.
* `hyperframes lint` sobre la carpeta reporta `multiple_root_compositions` porque hay dos
  composiciones raíz (16:9 y 9:16); es esperado. Cada archivo pasa la validación por separado.
* En Windows, clone con `git clone -c core.symlinks=true` (y modo desarrollador) para que los
  enlaces `video/lib` y `video/assets` funcionen, o copie `js/` y `assets/` dentro de `video/`.

## Estructura

Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
