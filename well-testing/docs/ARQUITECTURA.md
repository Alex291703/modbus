# Arquitectura del material Well Testing

Todo el material (páginas interactivas, infografía del DTI y video) comparte los
mismos módulos y la misma fuente de datos, para que una corrección se propague a
todas las vistas.

```
well-testing/
  index.html            Portada (hub): entregables, videos, descargas, fotos de campo
  proceso.html          Entregable 1 interactivo: recorrido 3D pozo → separador → batería + SCADA
  separador.html        Entregable 2 interactivo: corte interno paso a paso
  macropera.html        Entregable 3 interactivo: vista aérea con capas
  dti.html              Entregable 4: DTI (P&ID) horizontal / vertical, imprimible
  css/wt.css            Marca, fuentes locales, componentes comunes (.wt-topbar, .wt-btn, .wt-card…)
  js/data.js            FUENTE ÚNICA: tags, equipos, instrumentos, variables, separador, macropera
  js/scene3d.js         Escena 3D de la macropera (Three.js)            → WT.Scene3D
  js/cutaway.js         Corte interno del separador (Canvas 2D/SVG)     → WT.Cutaway
  js/pid.js             DTI con simbología ISA (SVG)                    → WT.PID
  js/scada.js           Simulación determinista + pantalla SCADA SAF-900 → WT.SCADA
  js/vendor/            three.min.js (r170, global THREE + OrbitControls, RoundedBoxGeometry,
                        mergeGeometries, RoomEnvironment), gsap.min.js + plugins
  assets/               logos, fuentes woff2, fotos de campo
  video/                Proyecto HyperFrames (lib → ../js, assets → ../assets por enlace simbólico)
  entregables/          MP4, PNG y PDF generados
  tools/                shot.mjs (capturas), exportadores
```

## Reglas comunes

* **Scripts clásicos, sin módulos ES ni compilación**: cada archivo es una IIFE que
  cuelga su API de `window.WT`. Las páginas deben abrir con doble clic (`file://`).
* **Sin red en tiempo de ejecución**: todo local (three, gsap, fuentes, imágenes).
* **Deterministas**: todo lo que se dibuja depende solo de `t` (segundos) y de un
  objeto de estado. Nada de `Math.random()` sin semilla (usar `WT.util.rng(seed)`),
  `Date.now()` ni `performance.now()` dentro de `renderAt`. Las páginas interactivas
  pueden usar `requestAnimationFrame` para *avanzar* `t`, pero el dibujo sale de
  `renderAt(t, estado)`; así el video HyperFrames puede buscar cualquier cuadro.
* **Datos desde `WT.data`**: nunca escribir a mano un tag, nombre de equipo o color
  de corriente que ya exista en `data.js`. Si un dato es `null`, no se muestra.
* **Colores de corriente**: mezcla = café, gas = amarillo, líquido = negro con
  resalte ámbar, señal de instrumento = azul claro (`WT.data.colores`).
* **No inventar equipos de proceso**. El proceso es: árbol de válvulas → estrangulador
  TP/TR → cabezal/manifold → línea de entrada → separador bifásico → (líquido: LV +
  Coriolis Promass 300) y (gas: PV + placa de orificio con transmisor de presión
  diferencial) → reincorporación → línea de salida → línea a batería. Instrumentos:
  los 8 tags de `WT.data.instrumentos`, todos al RTU Honeywell ControlEdge 2020 →
  SCADA SAF-900 en la PC de campo. Accesorios visibles en fotos: PSV, manómetro,
  registro bridado. Circuito cerrado: **no hay quemador ni venteo**.
* Separador **bifásico**: el líquido sale como una sola corriente (aceite + agua); no
  se dibuja interfase aceite/agua ni salida de agua separada.
* Español de campo (México): TP, TR, estrangulador, cabezal, batería, aforo,
  kg/cm², bpd, MMpcd, °C.

## Contratos de módulos

### `WT.Scene3D` (js/scene3d.js)

```js
const s = WT.Scene3D.create({
  canvas,                 // HTMLCanvasElement (obligatorio)
  width, height,          // px de render; las páginas llaman s.resize(w, h)
  pixelRatio: 1,          // el video usa 1
  quality: 'high',        // 'high' | 'medium' | 'low' (sombras, antialias, densidad de partículas)
  separatorTag: 'FA-06'
});
s.renderAt(t, estado);    // dibuja el cuadro del tiempo t (s). Determinista.
s.resize(w, h);
s.project([x, y, z]);     // → { x, y, visible } en px del canvas (para etiquetas HTML)
s.anchors;                // { arbol, estrangulador, manifold, lineaEntrada, separador, coriolis,
                          //   placa, recombinacion, lineaBateria, caseta, rtu, zonaSeguridad,
                          //   acceso, puntoReunion, deflector, extractor, nivel, psv,
                          //   TDP, TPS, TT, TN, CORIOLIS, TDG, TDM, TPL }  → [x, y, z] en metros
s.shots;                  // poses de cámara con nombre: { aerea, establecimiento, arbol, estrangulador,
                          //   lineaEntrada, separador, separadorCorte, medicionLiquido, medicionGas,
                          //   recombinacion, bateria, caseta } → { pos:[x,y,z], target:[x,y,z], fov }
s.lerpShot(a, b, k);      // interpola dos poses (posición, objetivo, fov) → pose
s.camera; s.scene; s.renderer;   // acceso directo a Three.js si hace falta
s.dispose();
```

`estado` (todos opcionales):

```js
{
  camera: { pos:[x,y,z], target:[x,y,z], fov:40 },   // pose de cámara de este cuadro
  flujo: { mezcla:0..1, gas:0..1, liquido:0..1, salida:0..1 }, // intensidad de partículas por corriente
  rayosX: 0..1,           // tuberías translúcidas para ver las partículas dentro
  corte: 0..1,            // plano de corte que abre el separador y muestra internos y nivel
  nivel: 0..1,            // nivel de líquido dentro del separador (cuando corte > 0)
  resaltar: 'separador',  // id de equipo/ancla a resaltar (contorno/emisivo); null = nada
  capas: { zonaSeguridad:true, acceso:true, cotas:false, cinta:true, entorno:true },
  ortho: 0..1             // mezcla hacia vista cenital (1 = planta, para la vista aérea)
}
```

### `WT.Cutaway` (js/cutaway.js)

```js
const c = WT.Cutaway.create(container, { width, height, layout: 'landscape' | 'portrait',
                                         labels: true, tag: 'FA-06' });
c.renderAt(t, { paso: 0..6, progreso: 0..1, etiquetas: true, resaltar: 'deflector' });
  // paso 0 = vista general con todo funcionando; 1..6 = WT.data.pasosSeparacion
  // progreso = avance dentro del paso (para animar la aparición de flechas/rótulos)
c.resize(w, h);
c.pasos;   // = WT.data.pasosSeparacion
c.el;      // nodo raíz insertado en container
```

### `WT.PID` (js/pid.js)

```js
const p = WT.PID.render(container, { orientacion: 'horizontal' | 'vertical',
                                     tema: 'papel' | 'pantalla', tag: 'FA-06' });
p.svg;                       // <svg> generado (viewBox fijo, escalable)
p.lineas;                    // { mezcla:[path…], gas:[…], liquido:[…], salida:[…], senal:[…] }
p.instrumentos;              // { TDP: <g>, TPS: <g>, … }   burbujas ISA (arriba ISA, abajo tag)
p.equipos;                   // { arbol:<g>, estrangulador:<g>, manifold:<g>, separador:<g>, … }
p.setTema(tema);
```

### `WT.SCADA` (js/scada.js)

```js
WT.SCADA.sim(h);     // h = horas simuladas desde que se abre el pozo (0 → 28)
  // → { estado:'estabilizacion'|'en-curso'|'finalizado', estadoNombre, hMedicion (0..24),
  //     pPozo, pSep, pSalida, pBateria, tSep, nivel, pctAgua, pctAceite, densidad, masico,
  //     qMezcla, qAceite, qAgua, qGas, acumMezcla, acumAceite, acumAgua, acumGas }
const v = WT.SCADA.create(container, { width, height, layout: 'landscape' | 'portrait', compacto: false });
v.renderAt(h, { resaltar: 'TPS' });   // pinta la pantalla SAF-900 para la hora simulada h
v.resize(w, h);
```

## Video (HyperFrames)

`video/` es un proyecto HyperFrames independiente. Los módulos se cargan desde
`lib/` (enlace a `../js`) y la marca desde `assets/` (enlace a `../assets`), porque
HyperFrames no permite rutas `../`. Composiciones: `index.html` (16:9, 1920×1080) y
`vertical.html` (9:16, 1080×1920).
