# Well Testing · Aforo de pozos — R.B. Tec México

Material técnico-visual del servicio de aforo de pozos con separador bifásico de circuito cerrado, para presentaciones a PEMEX / clientes y para capacitar personal nuevo.

## Cómo abrirlo

Abre `well-testing/index.html` con doble clic en Chrome, Edge o Firefox. No necesita internet ni instalación: Three.js y las tipografías vienen incluidas en `vendor/` y `fonts/`, así que funciona en la PC de campo sin red.

| Pestaña | Qué muestra |
| --- | --- |
| **Inicio** | Resumen del servicio, estados de la medición y ruta del fluido |
| **1 · Proceso** | Animación 3D de ~84 s: árbol de válvulas → estrangulador → línea de entrada → separador (con corte) → Coriolis / placa de orificio → reincorporación → cabezal → RTU → SCADA. Flechas de flujo por color, etiquetas de equipos e instrumentos y SCADA simulado. Formato 16:9 o 9:16, modo «Explorar 3D» para girar la cámara |
| **2 · Separador** | Corte interno paso a paso: deflector, liberación de gas, asentamiento, extractor de niebla, lazo de nivel (TN → válvula de líquido) y salida de gas. Burbujas y gotas en movimiento, ficha técnica y foto del equipo real |
| **3 · Macropera** | Vista aérea 3D / planta: pozos, pozo en aforo, cabezal, separador, líneas temporales con flujo, caseta de medición, zona de seguridad, punto de reunión, ruta de acceso y cotas. Al elegir otro pozo se vuelven a trazar las líneas |
| **4 · DTI** | DTI simplificado con simbología ISA, tags de campo y lazos de control, en horizontal (pantalla) y vertical (impresión A3) |

Atajos: `espacio` reproduce/pausa, `F` pantalla completa.

**Colores de corriente** (iguales en todas las vistas): mezcla = café · gas = amarillo · líquido = negro/ámbar · señal de instrumento = azul claro.

## Entregables listos (`entregables/`)

| Archivo | Uso |
| --- | --- |
| `aforo-proceso-16x9.mp4` | Animación del proceso para presentación (1920×1080, 30 fps) |
| `aforo-proceso-9x16.mp4` | La misma animación para redes / celular (1080×1920) |
| `separador-corte-16x9.mp4`, `separador-corte-9x16.mp4` | Corte interno del separador paso a paso |
| `dti-horizontal.png` / `.pdf`, `dti-vertical.png` / `.pdf` (y `@2x.png`) | Infografía DTI para pantalla (horizontal) e impresión A3 (vertical) |
| `macropera-planta.png`, `macropera-3d.png` | Layout de la macropera |

Los videos no tienen audio: el texto en pantalla narra cada capítulo.

## Adaptarlo a otro pozo o equipo

Todo lo editable está en **`js/config.js`**:

- **Logo**: guarda el logo de la empresa como `assets/logo.png` (fondo transparente) y aparecerá en la barra, en las esquinas de las animaciones, en los títulos y en el DTI. Mientras no exista se usa el logotipo tipográfico «R.B. TEC MÉXICO».
- **Equipo** (`equipo`): FA-06 / FA-08 / FA-09 y datos de placa (diámetro, longitud, presión y temperatura de diseño). Los campos en `null` aparecen como «Por confirmar» en la ficha técnica.
- **Pozo** (`pozo`): nombre, cabezal, diámetro del estrangulador, duración de la prueba.
- **Instrumentos** (`instrumentos`): tag de campo, equivalente ISA, descripción y ubicación. Todas las vistas y el DTI se generan desde esta lista.
- **Simulación** (`simulacion`): valores ilustrativos del SCADA (presiones, temperatura, gastos, % de agua).
- **Macropera** (`macropera`): coordenadas en metros de los pozos, cabezal, separador y caseta, y el margen de la zona de seguridad.

### Interpretación de los tags de campo

| Tag | ISA | Interpretación usada |
| --- | --- | --- |
| TDP | PIT-101 | Presión en boca de pozo (árbol, aguas arriba del estrangulador) |
| TPL | PIT-102 | Presión de línea de salida (aguas abajo del estrangulador) |
| TPS | PIT-103 | Presión del separador → lazo PIC-103 → válvula de control de gas |
| TT | TIT-104 | Temperatura del separador |
| TN | LIT-105 | Nivel del separador → lazo LIC-105 → válvula de control de líquido |
| CORIOLIS | FIT-106 | Promass 300: flujo másico, densidad y % de agua del líquido |
| TDG | PDIT-107 | Presión diferencial en la placa de orificio (gasto de gas) |
| TDM | PIT-108 | Presión de la línea a batería (después de reincorporar gas y líquido) |

Si en sus procedimientos algún tag significa otra cosa, cámbielo en `config.js` y regenere los entregables.

## Regenerar videos e imágenes

Requiere Node, Playwright (Chromium) y ffmpeg:

```bash
node well-testing/tools/render.mjs                 # todo
node well-testing/tools/render.mjs proceso         # solo la animación del proceso
node well-testing/tools/render.mjs separador --fmt 16x9
node well-testing/tools/render.mjs dti macropera   # solo imágenes
```

El render es cuadro por cuadro y determinista (las animaciones son función del tiempo), así que funciona igual sin GPU, aunque tarda: en un servidor sin tarjeta gráfica cuenta alrededor de 1 a 2 s por cuadro.

## Notas

- Las lecturas del SCADA son **simuladas e ilustrativas**; no corresponden a un aforo real.
- El modelo 3D del separador es representativo (proporciones tomadas de la fotografía del equipo).
- Las medidas de la macropera son aproximadas, estimadas de la imagen satelital. La ubicación del separador, la caseta, la zona de seguridad y el punto de reunión es una propuesta para este material: debe definirse en campo según el análisis de riesgo y la normativa aplicable.
- El DTI es simplificado: no incluye válvulas de bloqueo, desvíos ni dispositivos de alivio; verificar contra el DTI de ingeniería del equipo.

## Estructura

```
index.html              Página con las cinco pestañas
css/wt.css, dti.css     Sistema visual
js/config.js            Datos editables
js/core.js              Renderizador, cámara, etiquetas, tuberías con flujo, partículas
js/models.js            Modelos 3D de equipos
js/separator.js         Separador con corte, internos y partículas
js/scada.js             SCADA simulado
js/scene-*.js           Animación del proceso, corte del separador, macropera
js/dti.js               DTI en SVG
js/app.js               Navegación y modo captura
tools/render.mjs        Exporta MP4, PNG y PDF
vendor/                 three.js r149 (MIT)
fonts/                  Barlow, Barlow Condensed, JetBrains Mono (SIL OFL)
assets/                 Foto del equipo (y logo.png si se agrega)
entregables/            Archivos generados
```
