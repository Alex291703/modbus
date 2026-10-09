---
workflow: general-video
flow: automation
storyboard: no
message: "R.B. Tec mide la producción del pozo en sitio, 24 h, con un separador bifásico de circuito cerrado e instrumentación E+H monitoreada en SCADA"
destination: presentacion
aspect: 1920x1080
aspect_alt: 1080x1920
language: es-MX
audience: "PEMEX / clientes y personal de nuevo ingreso"
length: 90s
angle: how-to
---

## Intent

Video técnico-visual del servicio de Well Testing (aforo de pozos) de R.B. Tec México.
La cámara recorre la ruta del fluido pozo → estrangulador → línea de entrada → separador →
medición (Coriolis para líquido, placa de orificio para gas) → reincorporación → batería, con
flechas de flujo por colores (mezcla café, gas amarillo, líquido negro/ámbar), etiquetas de cada
equipo e instrumento y lectura simulada de variables en el SCADA SAF-900. Ingeniería limpia tipo
render 3D, colores corporativos (azul marino, amarillo, azul claro), logo en esquina, muchas
animaciones y efectos 3D. Dos formatos: 16:9 (presentación) y 9:16 (redes).

## Assets

- assets/logo-rbtec.svg, assets/logo-rbtec-blanco.svg — logo PROVISIONAL (se reemplaza en el mismo archivo).
- assets/fotos/*.jpg — fotos de campo, referencia visual del separador FA, camper, árbol, RTU.
- lib/data.js — fuente única de tags, equipos y textos; lib/scene3d.js, lib/cutaway.js, lib/pid.js, lib/scada.js — módulos visuales compartidos con las páginas interactivas.

## Customizations

- Escena 3D real (Three.js) de la macropera con recorrido de cámara.
- Corte interno del separador paso a paso con burbujas y gotas.
- SCADA SAF-900 simulado con estados Estabilización → En curso → Finalizado y acumulados.
- Trazado animado del DTI con simbología ISA al cierre.
- Música ambiental discreta (opcional, se puede silenciar).

## Notes

- No inventar equipos de proceso; circuito cerrado (sin quemador ni venteo).
- Los valores del SCADA son simulados y se rotulan como tales.
