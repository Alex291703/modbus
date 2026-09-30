# Academia Modbus

Curso interactivo para aprender el protocolo **Modbus desde cero**, en español. Explica cada concepto con figuras que se pueden manipular e incluye un laboratorio con una planta simulada donde tú haces de maestro del bus.

## Cómo abrirlo

No necesita instalación ni servidor: abre `index.html` con doble clic en cualquier navegador moderno.

Si prefieres servirlo por HTTP:

```bash
npx serve .
```

## Progreso en varios dispositivos

El progreso (lecciones completadas, retos del laboratorio, mejor nota del examen y lista de comprobación) se guarda siempre en el navegador. Si abres la **versión publicada en claude.ai** con tu cuenta, además se sincroniza en un espacio privado de tu cuenta: el móvil y el ordenador muestran el mismo progreso y los cambios de uno aparecen en el otro al momento. La barra lateral indica en cada caso dónde se está guardando.

Al abrir `index.html` como archivo local, el progreso queda solo en ese navegador.

## Contenido

| Módulo | Lecciones |
| --- | --- |
| Fundamentos | ¿Qué es Modbus? · Cliente y servidor · El modelo de datos |
| Capa física | RS-485, RS-232 y Ethernet |
| Tramas | Modbus RTU · CRC-16 paso a paso · Modbus ASCII · Modbus TCP/IP |
| Protocolo de aplicación | Códigos de función · Respuestas de excepción · Tipos de datos y orden de bytes |
| Práctica | Laboratorio · Analizador de tramas · Diagnóstico y buenas prácticas |
| Evaluación | Examen final (15 preguntas al azar de un banco de 43) · Glosario |

### Figuras interactivas

- **Bus animado** con maestro y esclavos: sondeo, broadcast y timeouts.
- **Conversor de direcciones** entre la notación de manual (40001) y la dirección de protocolo.
- **Osciloscopio** de un carácter UART y del par diferencial RS-485, con ruido de modo común.
- **Terminación y polarización** del bus: reflexiones y falsos bits de inicio.
- **Constructores de tramas** RTU, ASCII y TCP con cada byte coloreado y explicado.
- **CRC-16 paso a paso**, bit a bit, con implementaciones en C, Python y JavaScript.
- **Explorador de funciones** (01–06, 08, 15, 16, 22, 23, 43) y de **excepciones**.
- **Conversor de tipos**: int16/32, float32 IEEE 754 y los cuatro órdenes de bytes.
- **Laboratorio**: un PLC, un variador y un medidor de energía con física simulada, fallos, ruido, monitor de tráfico y 12 retos que se detectan solos.
- **Analizador de tramas**: pega cualquier trama y obtén su disección y la validez del CRC/LRC.

## Estructura

```
index.html            Punto de entrada
css/styles.css        Sistema visual (tema oscuro y claro)
js/core/modbus.js     Núcleo del protocolo: CRC, LRC, tramas, servidor, decodificador, tipos
js/core/sim.js        Planta simulada del laboratorio
js/ui/ui.js           Utilidades de interfaz, visor de tramas y bus animado
js/widgets/*.js       Figuras interactivas
js/content/*.js       Lecciones, banco de preguntas y glosario
js/app.js             Navegación, progreso, búsqueda (Ctrl+K) y tema
tests/                Pruebas
```

Sin dependencias ni paso de compilación. Los ejemplos de tramas coinciden con los de la especificación *Modbus Application Protocol v1.1b3*.

## Pruebas

```bash
npm test              # núcleo del protocolo (Node, sin dependencias)
npm run test:smoke    # recorre todas las lecciones en Chromium (requiere Playwright)
npm run test:sync     # simula dos dispositivos compartiendo el progreso (requiere Playwright)
```
