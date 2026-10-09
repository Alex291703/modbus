---
format: 1920x1080
format_alt: 1080x1920
duration: 90s
message: "Aforo de pozos en sitio, 24 h, con separador bifásico de circuito cerrado"
arc: Apertura → Locación → Pozo → Línea de entrada → Separación → Medición → Circuito cerrado → Monitoreo → DTI y cierre
audience: PEMEX / clientes y personal de nuevo ingreso
mode: autonomous
---

Tiempos de corte (s): 0 · 6 · 15 · 24 · 31 · 52 · 64 · 71 · 83 · 90.
Los cortes son fijos (la música se sincroniza con ellos); el ritmo interno de cada escena es libre.
Todas las escenas llevan el logo en una esquina, un rótulo de capítulo y la leyenda de colores
de corriente cuando hay flujo.

## Frame 1 — Apertura

- scene: Logo R.B. Tec se ensambla sobre retícula técnica marina; título "Well Testing · Aforo de pozos"
- duration: 6s
- transition_in: cut
- poster: 4s

Hexágono que se dibuja, monograma que se rellena, wordmark que entra. Subtítulo: "Separador
bifásico de circuito cerrado · Medición de 24 h". Trazos de corriente café/amarillo/ámbar
cruzan el fondo. Salida: zoom/iris hacia la escena 3D.

## Frame 2 — Locación (macropera)

- scene: Vuelo de dron sobre palmeras hasta la macropera; la cámara sube a planta y aparecen etiquetas del layout
- duration: 9s
- transition_in: zoom-through
- poster: 12s

Rótulo "01 · Locación". Etiquetas escalonadas: árbol de válvulas, cabezal/manifold, separador
FA, líneas temporales, caseta/PC de medición, RTU, zona de seguridad, ruta de acceso.

## Frame 3 — Pozo y estrangulador

- scene: La cámara baja al árbol de válvulas; arranca la corriente café; TDP y estrangulador TP/TR
- duration: 9s
- transition_in: camera-move
- poster: 20s

Rótulo "02 · Pozo". Tuberías en rayos X con partículas café. Burbuja TDP con presión en boca
de pozo (valor simulado). Tarjeta: el estrangulador TP/TR controla gasto y presión; el
cabezal/manifold alinea el pozo al separador.

## Frame 4 — Línea de entrada

- scene: Dolly siguiendo la mezcla por la línea temporal hasta la boquilla del separador
- duration: 7s
- transition_in: camera-move
- poster: 27s

Rótulo "Línea de entrada · mezcla multifásica". Flechas café sobre la línea.

## Frame 5 — Separación (corte interno)

- scene: El separador 3D se abre en corte; transición a la ilustración del corte con los 6 pasos
- duration: 21s
- transition_in: camera-move
- poster: 40s

Rótulo "03 · Separación". Placa del equipo y rombo NFPA visibles. Corte 3D (≈3 s) y luego
WT.Cutaway con los pasos 1–6 (~3 s c/u): choque contra el deflector, caída de presión y
liberación de gas, asentamiento por gravedad, extractor de niebla, control de nivel (TN → LV),
salida de gas por arriba (PV). Burbujas y gotas en movimiento.

## Frame 6 — Medición

- scene: Pantalla dividida: líquido por LV → Coriolis Promass 300 / gas por PV → placa de orificio + TDG
- duration: 12s
- transition_in: split
- poster: 58s

Rótulo "04 · Medición". Lado líquido (negro/ámbar): flujo másico, densidad, % agua. Lado gas
(amarillo): presión diferencial → gasto de gas. Valores simulados en vivo.

## Frame 7 — Circuito cerrado

- scene: Las corrientes medidas se reincorporan y la cámara sigue la línea hasta "A batería"
- duration: 7s
- transition_in: camera-move
- poster: 67s

Insignia "Circuito cerrado · no se ventea". Burbujas TDM (línea de salida) y TPL (línea a batería).

## Frame 8 — Monitoreo (RTU → SCADA)

- scene: Pulsos de señal azul de los instrumentos al RTU ControlEdge 2020 y pantalla SAF-900 en time-lapse de 24 h
- duration: 12s
- transition_in: zoom-through
- poster: 78s

Rótulo "05 · Monitoreo". Estados Estabilización → En curso → Finalizado; reloj de 24 h;
acumulados Q mezcla / aceite / agua / gas que cuentan; aviso de valores simulados.

## Frame 9 — DTI y cierre

- scene: El DTI se traza solo y se resuelve en el cierre con logo y lema
- duration: 7s
- transition_in: crossfade
- poster: 88s

Trazado rápido del DTI (simbología ISA). Cierre: logo, "R.B. Tec México · Well Testing",
tres atributos: Medición en sitio 24 h · Circuito cerrado · Monitoreo SCADA.
