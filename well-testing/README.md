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
`assets/logo-rbtec-blanco.svg` (fondos oscuros) por el oficial, con el mismo nombre de archivo.

### Puntos por confirmar con el área técnica

* **Asignación tag ↔ variable** (`WT.data.instrumentos`). Se interpretó así a partir de las
  variables reportadas y de los rótulos del cableado del RTU:
  TDP = presión en boca de pozo · TPS = presión del separador · TT = temperatura del separador ·
  TN = nivel del separador · CORIOLIS = Promass 300 (másico, densidad, % agua) ·
  TDG = presión diferencial en la placa de orificio (gas) · TDM = presión de la línea de salida
  (mezcla reincorporada) · TPL = presión de la línea a batería.
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
  controladores son neumáticos locales, ajustar `funciones`.
* **Montaje del TN** (sonda superior), ubicación del manómetro local, enlace RTU → SCADA por
  Ethernet y diámetro nominal de 4 in (rotulado en la tubería del equipo de la foto).
* Los valores del SCADA son **simulados** y así se rotulan.

## Video (HyperFrames)

El video se genera con [HyperFrames](https://github.com/heygen-com/hyperframes) a partir de HTML
en `video/` (usa los mismos módulos de `js/` mediante el enlace `video/lib`).

```bash
cd well-testing/video
npx hyperframes check                                  # validación
npx hyperframes render -o ../entregables/well-testing-16x9.mp4                 # 16:9
npx hyperframes render -c vertical.html -o ../entregables/well-testing-9x16.mp4 # 9:16
```

Requiere Node 22+ y FFmpeg. En Linux sin Chrome instalado puede indicarse un navegador con
`HYPERFRAMES_BROWSER_PATH`.

## Estructura

Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
