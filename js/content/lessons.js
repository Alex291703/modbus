/*!
 * Academia Modbus — contenido del curso.
 * Cada lección es HTML con marcadores [data-widget] que la aplicación
 * sustituye por figuras interactivas.
 */
(function (global) {
  'use strict';
  const MB = global.MB;

  /* Pequeños ayudantes para escribir el contenido con menos ruido */
  const T = (head, rows) =>
    `<div class="table-wrap"><table class="data"><thead><tr>${head.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;
  const C = (kind, tag, html) => `<div class="callout ${kind}"><span class="callout-tag">${tag}</span><div>${html}</div></div>`;
  const F = (widget, title, extra = '') => `<div data-widget="${widget}" data-title="${title}" ${extra}></div>`;

  MB.MODULES = [
    { id: 'fundamentos', title: 'Fundamentos', icon: 'book', lessons: ['intro', 'arquitectura', 'datos'] },
    { id: 'fisica', title: 'Capa física', icon: 'cable', lessons: ['fisica'] },
    { id: 'tramas', title: 'Tramas', icon: 'layers', lessons: ['rtu', 'crc', 'ascii', 'tcp'] },
    { id: 'aplicacion', title: 'Protocolo de aplicación', icon: 'chip', lessons: ['funciones', 'excepciones', 'tipos'] },
    { id: 'practica', title: 'Práctica', icon: 'lab', lessons: ['laboratorio', 'analizador', 'diagnostico'] },
    { id: 'evaluacion', title: 'Evaluación', icon: 'trophy', lessons: ['examen', 'glosario'] },
  ];

  MB.LESSONS = [
    /* ================================================================ */
    {
      id: 'intro',
      title: '¿Qué es Modbus?',
      minutes: 8,
      lead: 'El idioma más extendido de la automatización industrial: sencillo, abierto y con más de cuarenta años en servicio. Antes de ver bytes, entiende qué problema resuelve.',
      html: `
<h2>Un idioma común para las máquinas</h2>
<p>Imagina una planta con un PLC, tres variadores de frecuencia, un medidor de energía y un SCADA que lo supervisa todo. Cada equipo es de un fabricante distinto. Para que el SCADA lea la temperatura del PLC o cambie la velocidad de un variador, todos necesitan hablar el mismo idioma. <strong>Modbus es ese idioma.</strong></p>
<p>Modbus es un <strong>protocolo de comunicación de capa de aplicación</strong>: define cómo se pide un dato, cómo se responde y qué pasa si algo va mal. No define qué significa cada dato; eso lo decide cada fabricante en su <strong>mapa de registros</strong>.</p>
${C('key', 'Idea clave', '<p>Modbus solo sabe mover <strong>bits</strong> y <strong>registros de 16 bits</strong>. Que el registro 40001 sea una temperatura en décimas de grado lo dice el manual del equipo, no el protocolo.</p>')}
<h2>Por qué sigue en todas partes</h2>
<ul>
<li><strong>Abierto y gratuito:</strong> la especificación es pública y no hay licencias que pagar.</li>
<li><strong>Sencillo:</strong> un microcontrolador de pocos euros lo implementa en unos cientos de líneas.</li>
<li><strong>Universal:</strong> prácticamente todos los PLC, HMI, SCADA, variadores y medidores lo admiten.</li>
<li><strong>Fácil de depurar:</strong> las tramas son cortas y se leen a simple vista en hexadecimal.</li>
</ul>
<h2>Dónde lo encontrarás</h2>
<p>Fábricas, tratamiento de aguas, climatización y gestión de edificios, inversores solares y baterías, subestaciones, medición de consumo, bombas, compresores y grupos electrógenos. Si un equipo industrial tiene un puerto RS-485 o Ethernet, lo más probable es que hable Modbus.</p>
<h2>Las variantes</h2>
${T(['Variante', 'Medio', 'Codificación', 'Comprobación'], [
  ['Modbus RTU', 'RS-485 o RS-232', 'Binaria, compacta', 'CRC-16'],
  ['Modbus ASCII', 'RS-485 o RS-232', 'Texto hexadecimal', 'LRC'],
  ['Modbus TCP/IP', 'Ethernet', 'Binaria', 'La propia de TCP/IP'],
])}
<p>Las tres transportan <strong>exactamente el mismo mensaje</strong>; solo cambia el envoltorio. Cuando entiendas una, entenderás las tres.</p>
${F('adu', 'PDU y ADU: el mensaje y su envoltorio')}
<p>A ese mensaje común se le llama <strong>PDU</strong> (<em>Protocol Data Unit</em>): un código de función y sus datos. Al añadirle la dirección y la comprobación de errores propias de cada variante se obtiene la <strong>ADU</strong> (<em>Application Data Unit</em>), que es lo que viaja por el cable.</p>
<h2>Un poco de historia</h2>
${F('timeline', 'Cuatro décadas de Modbus', 'data-static')}
<p>En 2020 la Modbus Organization sustituyó los términos maestro y esclavo por <strong>cliente y servidor</strong>. En este curso usaremos ambos: en el mundo serie verás «maestro» y «esclavo» en casi todos los manuales.</p>
<h2>Sus límites</h2>
<ul>
<li><strong>Sin seguridad nativa:</strong> no hay autenticación ni cifrado. Quien llegue a la red puede leer y escribir.</li>
<li><strong>Sin tipos de datos:</strong> un número decimal o un texto se reparten en varios registros y cada fabricante los ordena a su manera.</li>
<li><strong>Solo pregunta y respuesta:</strong> los equipos no avisan cuando algo cambia; el maestro tiene que preguntar.</li>
<li><strong>Mensajes cortos:</strong> la PDU tiene como máximo 253 bytes.</li>
</ul>
<p>Ninguno de estos límites le ha impedido convertirse en el estándar de hecho. Conocerlos te ayudará a diseñar instalaciones robustas.</p>`,
      summary: [
        'Modbus es un protocolo de aplicación: define peticiones y respuestas, no el significado de los datos.',
        'Hay tres variantes principales, RTU, ASCII y TCP, que transportan la misma PDU.',
        'PDU = función + datos. ADU = PDU + dirección o cabecera + comprobación de errores.',
        'Es abierto, sencillo y universal, pero no tiene seguridad ni tipos de datos propios.',
      ],
    },

    /* ================================================================ */
    {
      id: 'arquitectura',
      title: 'Cliente y servidor',
      minutes: 9,
      lead: 'En Modbus nadie habla sin que le pregunten. Un maestro dirige la conversación y los esclavos contestan. Ese modelo explica casi todo lo demás.',
      html: `
<h2>Maestro y esclavo, cliente y servidor</h2>
<p>En una red Modbus serie hay <strong>un único maestro</strong> (el cliente) y <strong>hasta 247 esclavos</strong> (los servidores). El maestro envía una petición; el esclavo al que va dirigida la procesa y responde. Los esclavos <strong>nunca transmiten por iniciativa propia</strong> ni hablan entre ellos.</p>
<p>El maestro suele ser un PLC, un SCADA, un HMI o un PC. Los esclavos son los equipos de campo: variadores, medidores, módulos de entradas y salidas, sensores.</p>
${F('polling', 'Sondeo del bus: pregunta y respuesta')}
<p>Todos los esclavos escuchan todas las tramas, pero solo contesta aquel cuya dirección coincide. Prueba el broadcast y la dirección 9, que no existe, y compara lo que ocurre.</p>
<h2>Direcciones</h2>
${T(['Dirección', 'Uso'], [
  ['0', 'Broadcast: todos los esclavos la ejecutan y ninguno responde'],
  ['1 – 247', 'Direcciones individuales de esclavo'],
  ['248 – 255', 'Reservadas'],
])}
<p>Cada esclavo del bus debe tener una dirección única. Dos esclavos con la misma dirección responderían a la vez y sus respuestas colisionarían.</p>
<h2>Tres finales posibles</h2>
<p>Cada petición termina de una de estas tres formas:</p>
<ol>
<li><strong>Respuesta normal:</strong> el esclavo ejecuta la orden y devuelve los datos o una confirmación.</li>
<li><strong>Respuesta de excepción:</strong> el esclavo recibió bien la trama pero no puede cumplirla (función desconocida, dirección inexistente…). Lo verás en la lección de excepciones.</li>
<li><strong>Sin respuesta:</strong> la trama llegó corrupta, iba a otra dirección o el esclavo está apagado. El maestro espera hasta agotar su <strong>timeout</strong> y decide si reintenta.</li>
</ol>
${C('warn', 'Cuidado', '<p>Un broadcast solo tiene sentido con funciones de escritura. Como nadie responde, el maestro no sabe si la orden llegó a todos: úsalo con prudencia.</p>')}
<h2>El ciclo de sondeo</h2>
<p>Como los esclavos no avisan, el maestro recorre la lista una y otra vez: pregunta al 1, espera, pregunta al 2… A esto se le llama <strong>sondeo</strong> o <em>polling</em>. El tiempo de ciclo depende de la velocidad del bus, del número de esclavos, del tamaño de las peticiones y de lo que tarda cada equipo en contestar.</p>
${C('info', 'En la práctica', '<p>Si un esclavo no responde, el maestro pierde un timeout completo en cada ciclo. Un solo equipo apagado con un timeout de 1 s puede ralentizar todo el bus. Ajusta timeouts y reintentos con cabeza.</p>')}
<h2>¿Y en Modbus TCP?</h2>
<p>En Ethernet cambia la topología pero no la filosofía. Un <strong>cliente</strong> abre una conexión TCP con un <strong>servidor</strong> en el puerto 502 y le envía peticiones. Varios clientes pueden hablar con el mismo servidor, y un cliente puede tener varias peticiones en curso a la vez: el <strong>Transaction ID</strong> empareja cada respuesta con su petición.</p>`,
      summary: [
        'Un solo maestro por bus serie; los esclavos solo responden a lo que se les pregunta.',
        'Direcciones 1–247 para esclavos; 0 es broadcast y no tiene respuesta; 248–255 están reservadas.',
        'Toda petición termina en respuesta normal, excepción o timeout.',
        'En TCP hablamos de cliente y servidor, y puede haber varios clientes.',
      ],
    },

    /* ================================================================ */
    {
      id: 'datos',
      title: 'El modelo de datos',
      minutes: 10,
      lead: 'Todo lo que un equipo Modbus expone cabe en cuatro tablas. Dominar esas tablas y su forma de numerarse te ahorrará el error más común de todos.',
      html: `
<h2>Cuatro tablas</h2>
<p>Modbus organiza los datos de un equipo en cuatro tablas, que se diferencian por el tamaño de cada elemento (1 bit o 16 bits) y por si el maestro puede escribir en ellas.</p>
${F('datamodel', 'Las cuatro tablas del modelo de datos')}
${T(['Tabla', 'Elemento', 'Acceso', 'Leer', 'Escribir'], [
  ['Bobinas <em>(coils)</em>', '1 bit', 'Lectura y escritura', '01', '05, 15'],
  ['Entradas discretas', '1 bit', 'Solo lectura', '02', '—'],
  ['Registros de entrada', '16 bits', 'Solo lectura', '04', '—'],
  ['Registros de retención', '16 bits', 'Lectura y escritura', '03, 23', '06, 16, 22, 23'],
])}
<p>Los nombres vienen del mundo de los PLC: una <strong>bobina</strong> era la salida de un relé en la lógica de escalera, y un <em>holding register</em> era una posición de memoria que «retenía» un valor.</p>
<h2>Dos formas de numerar</h2>
<p>Aquí está la trampa. Los manuales suelen usar una <strong>notación de manual</strong> de 5 dígitos: el primero indica la tabla y los cuatro siguientes empiezan en 1.</p>
<ul>
<li><code>00001</code>–<code>09999</code>: bobinas</li>
<li><code>10001</code>–<code>19999</code>: entradas discretas</li>
<li><code>30001</code>–<code>39999</code>: registros de entrada</li>
<li><code>40001</code>–<code>49999</code>: registros de retención</li>
</ul>
<p>Pero en la trama viaja la <strong>dirección de protocolo</strong>: un número de 0 a 65535 <strong>que empieza en 0</strong> y no lleva prefijo. La tabla no se indica con el prefijo sino con el <strong>código de función</strong>.</p>
${C('key', 'Regla de oro', '<p>Para pasar de notación de manual a dirección de protocolo, <strong>quita el primer dígito y resta 1</strong>. 40001 → 0. 40108 → 107. 30005 → 4.</p>')}
${F('addressConverter', 'Conversor de direcciones')}
<p>Cuando cuatro cifras se quedan cortas se usa la notación ampliada de 6 dígitos, de 400001 a 465536. La regla es la misma.</p>
${C('warn', 'El error más común', '<p>Leer el registro de al lado. Si el manual habla de 40001 y pides la dirección 1, obtendrás el dato vecino, que a menudo «casi» tiene sentido y cuesta detectar. Algunos manuales dan directamente direcciones de protocolo (empezando en 0) y otros las dan en hexadecimal. Comprueba siempre con un valor conocido.</p>')}
<h2>Lo que decide el fabricante</h2>
<p>El protocolo no impone cuántos registros tiene un equipo ni qué significan. Cada fabricante publica un <strong>mapa de registros</strong>: una tabla con dirección, nombre, unidades, escala, tipo de dato y acceso. Verás cosas como estas:</p>
<ul>
<li>Muchos equipos modernos colocan <strong>todo en registros de retención</strong> y no usan las demás tablas.</li>
<li>Las tablas pueden <strong>solaparse</strong>: el mismo dato accesible como bobina y como bit de un registro.</li>
<li>Los mapas suelen tener <strong>huecos</strong>: direcciones sin definir que devuelven error si se leen.</li>
</ul>`,
      summary: [
        'Cuatro tablas: bobinas y entradas discretas (bits); registros de entrada y de retención (16 bits).',
        'La función elige la tabla; la dirección es un desplazamiento de 0 a 65535.',
        'Notación de manual 4xxxx: quita el prefijo y resta 1.',
        'El significado de cada registro está en el mapa del fabricante.',
      ],
    },

    /* ================================================================ */
    {
      id: 'fisica',
      title: 'Capa física: RS-485, RS-232 y Ethernet',
      short: 'Capa física',
      minutes: 12,
      lead: 'Antes de ser bytes, Modbus es tensión en un cable. Entender cómo viaja cada bit explica la mitad de las averías que encontrarás en campo.',
      html: `
<h2>Tres medios físicos</h2>
${T(['Característica', 'RS-232', 'RS-485', 'Ethernet'], [
  ['Topología', 'Punto a punto', 'Bus multipunto', 'Estrella con switches'],
  ['Equipos', '2', '32 cargas unitarias por segmento', 'Sin límite práctico'],
  ['Distancia', 'Unos 15 m', 'Hasta 1200 m', '100 m por tramo de cobre'],
  ['Señal', 'Tensión respecto a masa', 'Diferencial (A/B)', 'Diferencial'],
  ['Variante Modbus', 'RTU o ASCII', 'RTU o ASCII', 'TCP'],
])}
<p>RS-485 es con diferencia el medio serie más usado en Modbus: admite muchos equipos en un solo par de hilos y distancias largas. La distancia máxima baja cuando sube la velocidad.</p>
<h2>Cómo viaja un byte</h2>
<p>En la línea serie cada byte se envía como un <strong>carácter</strong>: un <strong>bit de inicio</strong> (0), los <strong>bits de datos</strong> empezando por el menos significativo, un <strong>bit de paridad</strong> opcional y uno o dos <strong>bits de stop</strong> (1). En reposo la línea está a 1.</p>
${F('uartScope', 'Un carácter en el osciloscopio')}
<p>En Modbus RTU cada carácter tiene <strong>11 bits</strong>: 1 de inicio, 8 de datos, 1 de paridad y 1 de stop. Si no se usa paridad, la especificación pide <strong>2 bits de stop</strong> para mantener los 11 bits (8N2). En la práctica verás muchos equipos configurados como 8N1: lo importante es que <strong>todos los del bus usen lo mismo</strong>.</p>
<ul>
<li>Velocidades habituales: 9600 y 19200 bit/s. La especificación exige ambas y fija 19200 por defecto. También son comunes 38400 y 115200.</li>
<li>Paridad por defecto: <strong>par</strong> (<em>even</em>).</li>
<li>Modbus ASCII usa 7 bits de datos: 10 bits por carácter.</li>
</ul>
<h2>La señal diferencial</h2>
<p>RS-485 no mide la tensión de un hilo respecto a masa, sino la <strong>diferencia entre dos hilos</strong>, A y B. Un ruido inducido en el cable afecta por igual a los dos, así que la diferencia apenas cambia. Por eso RS-485 funciona en naves llenas de motores y variadores. En la figura de arriba, activa el ruido: las trazas A y B se agitan, pero B − A sigue limpia.</p>
<p>El receptor decide si hay un 1 o un 0 cuando la diferencia supera <strong>±200 mV</strong>. En reposo (1 lógico), la línea que la especificación llama D1 queda por encima de D0.</p>
${C('warn', 'A y B', '<p>Los fabricantes no se ponen de acuerdo en qué hilo es A y cuál es B: unos siguen la norma y otros la invierten. Si un equipo no responde, <strong>intercambiar los dos hilos</strong> es una prueba rápida que no daña nada.</p>')}
<h2>Terminación y polarización</h2>
${F('termination', 'Terminación y polarización del bus')}
<ul>
<li><strong>Bus lineal:</strong> el cable va de equipo en equipo (<em>daisy chain</em>). Nada de estrellas ni derivaciones largas.</li>
<li><strong>Terminación:</strong> una resistencia de <strong>120 Ω</strong> entre A y B en los <strong>dos extremos</strong> del bus, y solo ahí. Absorbe la señal y evita ecos.</li>
<li><strong>Polarización:</strong> resistencias que mantienen la línea en un estado definido cuando nadie transmite. Van en <strong>un solo punto</strong> del bus, normalmente en el maestro.</li>
<li><strong>Común:</strong> además de A y B, conecta el 0 V de referencia entre equipos.</li>
<li><strong>Cable:</strong> par trenzado y apantallado, con la pantalla a tierra en un único punto.</li>
</ul>
${C('info', 'En la práctica', '<p>Muchos equipos traen la terminación y la polarización integradas, activables con un microinterruptor. Revisa que solo estén activas donde corresponde: terminadores de más cargan el bus tanto como uno de menos.</p>')}
<h2>Ethernet</h2>
<p>Modbus TCP usa la infraestructura Ethernet estándar: cable de par trenzado, switches e IP. No hay terminadores ni bits de stop que ajustar; los problemas pasan a ser de red: direcciones IP, máscaras, cortafuegos y número de conexiones.</p>`,
      summary: [
        'RS-485: diferencial, multipunto, hasta 1200 m y 32 cargas unitarias por segmento.',
        'Un carácter RTU son 11 bits. Todos los equipos del bus comparten velocidad, paridad y stop.',
        'Bus lineal, 120 Ω en los dos extremos y polarización en un solo punto.',
        'Si no hay comunicación, prueba a intercambiar A y B.',
      ],
    },

    /* ================================================================ */
    {
      id: 'rtu',
      title: 'Modbus RTU',
      minutes: 12,
      lead: 'La variante más usada en campo. Compacta, binaria y delimitada por silencios. Aquí aprenderás a leer una trama RTU byte a byte.',
      html: `
<h2>Anatomía de una trama</h2>
${T(['Campo', 'Tamaño', 'Contenido'], [
  ['Dirección', '1 byte', 'El esclavo destino, o el que responde'],
  ['Función', '1 byte', 'Qué hay que hacer'],
  ['Datos', '0 a 252 bytes', 'Direcciones, cantidades, valores'],
  ['CRC', '2 bytes', 'Comprobación de errores, byte bajo primero'],
])}
<p>En total, como máximo <strong>256 bytes</strong>. El constructor arranca con el ejemplo de la especificación: el maestro pide al esclavo 17 (0x11) tres registros de retención a partir de 40108, que es la dirección de protocolo 107 (0x6B).</p>
${F('rtuBuilder', 'Constructor de tramas RTU')}
<p>Cambia los campos y observa cómo se recalcula el CRC. Pasa el puntero por encima de cada grupo de bytes para ver qué significa. Debajo aparece la respuesta que daría un esclavo.</p>
<h2>Primero el byte alto</h2>
<p>Direcciones, cantidades y valores de registro ocupan 2 bytes y se envían en orden <strong>big-endian</strong>: primero el byte más significativo. La dirección 107 (0x006B) viaja como <code>00 6B</code>. La única excepción es el <strong>CRC, que va con el byte bajo primero</strong>.</p>
<h2>Delimitación por silencio</h2>
<p>RTU no tiene caracteres de inicio ni de fin. El receptor sabe que empieza una trama porque antes ha habido un <strong>silencio de al menos 3,5 tiempos de carácter</strong> (t3,5). Dentro de la trama los caracteres deben ir seguidos: si entre dos caracteres pasan más de <strong>1,5 tiempos de carácter</strong> (t1,5), la trama se da por incompleta y se descarta.</p>
${F('rtuTiming', 'Tiempos en la línea')}
<p>Por encima de 19200 bit/s esos tiempos serían tan cortos que la especificación fija valores constantes: <strong>750 µs para t1,5 y 1,75 ms para t3,5</strong>.</p>
${C('info', 'En la práctica', '<p>Los PC con Windows y algunos adaptadores USB pueden meter pausas dentro de una trama. Si ves respuestas cortadas o errores de CRC esporádicos, sospecha de la latencia del puerto serie.</p>')}
<h2>Qué hace el esclavo al recibir</h2>
<ol>
<li>Detecta el silencio y empieza a guardar bytes.</li>
<li>Al detectar el siguiente silencio, da la trama por terminada.</li>
<li>Comprueba la <strong>dirección</strong>: si no es la suya ni 0, la ignora.</li>
<li>Comprueba el <strong>CRC</strong>: si no coincide, la descarta <strong>sin responder</strong>.</li>
<li>Ejecuta la función y responde, salvo en broadcast.</li>
</ol>`,
      summary: [
        'Trama RTU = dirección (1) + función (1) + datos (0–252) + CRC (2). Máximo 256 bytes.',
        'Los valores de 16 bits van big-endian; el CRC, con el byte bajo primero.',
        'Silencio de al menos 3,5 caracteres entre tramas; un hueco de más de 1,5 caracteres invalida la trama.',
        'Un error de CRC no genera respuesta: el maestro ve un timeout.',
      ],
    },

    /* ================================================================ */
    {
      id: 'crc',
      title: 'CRC-16 paso a paso',
      minutes: 10,
      lead: 'Dos bytes al final de cada trama RTU detectan casi cualquier error de transmisión. Vamos a calcularlos bit a bit hasta que no tengan misterio.',
      html: `
<h2>Para qué sirve</h2>
<p>El ruido eléctrico puede cambiar un bit durante la transmisión. El <strong>CRC</strong> (comprobación de redundancia cíclica) es una huella de 16 bits calculada sobre todos los bytes de la trama. El emisor la añade al final; el receptor la recalcula y, si no coincide, sabe que la trama llegó dañada.</p>
<p>El CRC-16 de Modbus detecta todos los errores de uno o dos bits, todos los que cambian un número impar de bits y cualquier ráfaga de errores de hasta 16 bits.</p>
<h2>El algoritmo</h2>
<ol>
<li>Carga un registro de 16 bits con <code>0xFFFF</code>.</li>
<li>Haz XOR del byte con la parte baja del registro.</li>
<li>Desplaza el registro un bit a la derecha. Si el bit que sale es 1, haz XOR con <code>0xA001</code>.</li>
<li>Repite el paso 3 hasta completar 8 desplazamientos.</li>
<li>Vuelve al paso 2 con el siguiente byte.</li>
<li>Al terminar, el registro es el CRC. Se transmite <strong>primero el byte bajo</strong>.</li>
</ol>
<p><code>0xA001</code> es el polinomio x¹⁶ + x¹⁵ + x² + 1 (<code>0x8005</code>) con los bits en orden inverso, porque Modbus procesa los bits del menos al más significativo.</p>
${F('crcStepper', 'Calculadora de CRC paso a paso')}
${C('key', 'Compruébalo', '<p>Para <code>01 03 00 00 00 02</code> el CRC es <code>0x0BC4</code>, que viaja como <code>C4 0B</code>. Es una de las tramas más conocidas de Modbus: «lee dos registros desde 40001 del esclavo 1».</p>')}
<h2>En tu código</h2>
${F('crcCode', 'Implementación de referencia')}
<p>En equipos con poca potencia se usa una versión con dos tablas precalculadas de 256 entradas que procesa un byte entero de una vez. El resultado es idéntico.</p>
${C('info', 'Un atajo para validar', '<p>Si calculas el CRC sobre la trama completa, incluidos sus dos bytes de CRC, el resultado es 0 cuando la trama es correcta. Muchas implementaciones validan así.</p>')}`,
      summary: [
        'CRC-16/MODBUS: valor inicial 0xFFFF y polinomio reflejado 0xA001.',
        'Se calcula sobre dirección, función y datos.',
        'Se envía con el byte bajo primero.',
        'Un CRC incorrecto hace que el esclavo descarte la trama en silencio.',
      ],
    },

    /* ================================================================ */
    {
      id: 'ascii',
      title: 'Modbus ASCII',
      minutes: 7,
      lead: 'La misma información, escrita como texto legible. Más lenta que RTU, pero tolerante a pausas y fácil de leer en un terminal.',
      html: `
<h2>Cada byte, dos caracteres</h2>
<p>En Modbus ASCII cada byte se escribe como <strong>dos caracteres hexadecimales</strong>, de <code>0</code> a <code>9</code> y de <code>A</code> a <code>F</code>. El byte 0x03 viaja como los caracteres «0» y «3», es decir, 0x30 y 0x33. La trama se delimita con caracteres explícitos:</p>
${T(['Campo', 'Caracteres', 'Contenido'], [
  ['Inicio', '1', '«:» (0x3A)'],
  ['Dirección', '2', 'Esclavo destino'],
  ['Función', '2', 'Código de función'],
  ['Datos', '0 a 504', 'Dos caracteres por byte'],
  ['LRC', '2', 'Comprobación de errores'],
  ['Fin', '2', 'CR LF (0x0D 0x0A)'],
])}
<p>Cada carácter lleva <strong>7 bits de datos</strong>: con el de inicio, la paridad y el de stop suman 10 bits.</p>
${F('asciiConverter', 'De bytes a texto ASCII')}
<h2>El LRC</h2>
<p>ASCII no usa CRC sino <strong>LRC</strong> (comprobación de redundancia longitudinal), mucho más simple: se <strong>suman todos los bytes</strong> (dirección, función y datos; los bytes, no los caracteres), se descarta el acarreo y se toma el <strong>complemento a dos</strong>. Si sumas todos los bytes más el LRC, el resultado es 0x00.</p>
<h2>Cuándo se usa</h2>
<ul>
<li><strong>Ventajas:</strong> se lee en un terminal, admite pausas de hasta 1 segundo entre caracteres (útil con módems o radioenlaces) y la delimitación no depende de tiempos.</li>
<li><strong>Inconvenientes:</strong> casi el doble de caracteres que RTU y una comprobación de errores más débil.</li>
</ul>
<p>Hoy es poco habitual. Lo encontrarás en equipos antiguos y en enlaces donde no se pueden garantizar los tiempos de RTU.</p>
${C('warn', 'No se mezclan', '<p>Todos los equipos de un bus deben usar el mismo modo. RTU y ASCII no pueden convivir en el mismo bus.</p>')}`,
      summary: [
        'Trama ASCII: «:» + dirección + función + datos + LRC + CR LF, todo como texto hexadecimal.',
        '7 bits de datos por carácter; hasta 1 s de pausa entre caracteres.',
        'LRC = complemento a dos de la suma de los bytes.',
        'Casi el doble de largo que RTU. RTU y ASCII no se mezclan en un bus.',
      ],
    },

    /* ================================================================ */
    {
      id: 'tcp',
      title: 'Modbus TCP/IP',
      minutes: 11,
      lead: 'La misma PDU, ahora sobre Ethernet. Siete bytes de cabecera sustituyen a la dirección y al CRC, y la red IP se encarga del resto.',
      html: `
<h2>La cabecera MBAP</h2>
<p>En Modbus TCP la ADU es la PDU precedida por una cabecera de 7 bytes llamada <strong>MBAP</strong> (<em>Modbus Application Protocol header</em>):</p>
${T(['Campo', 'Bytes', 'Contenido'], [
  ['Transaction ID', '2', 'Número elegido por el cliente. El servidor lo copia en la respuesta.'],
  ['Protocol ID', '2', 'Siempre 0 para Modbus.'],
  ['Length', '2', 'Bytes que siguen: Unit ID + PDU.'],
  ['Unit ID', '1', 'Esclavo detrás de una pasarela. Si el servidor es el propio equipo, suele valer 255 (0xFF).'],
])}
<p>No hay CRC: TCP ya garantiza que los datos llegan íntegros y en orden. Y no hay silencios: el campo Length indica dónde termina cada mensaje dentro del flujo TCP. El tamaño máximo es <strong>260 bytes</strong>: 7 de cabecera y 253 de PDU.</p>
${F('tcpBuilder', 'Constructor Modbus TCP')}
<h2>La misma PDU, tres envoltorios</h2>
${F('encapsulation', 'Encapsulado de una misma PDU')}
<p>Compara las tres tramas: la parte central, función y datos, es idéntica. Por eso una <strong>pasarela</strong> puede traducir de TCP a RTU sin entender los datos: quita la cabecera MBAP, pone el Unit ID como dirección de esclavo y calcula el CRC.</p>
<h2>Conexiones y puerto</h2>
<ul>
<li>El servidor escucha en el <strong>puerto TCP 502</strong>.</li>
<li>El cliente abre la conexión y la mantiene para muchas peticiones; abrir y cerrar en cada una es lento.</li>
<li>Varios clientes pueden conectarse al mismo servidor, hasta el límite de conexiones del equipo.</li>
<li>Gracias al Transaction ID un cliente puede enviar varias peticiones sin esperar respuesta y emparejarlas después.</li>
</ul>
<h2>Pasarelas y Unit ID</h2>
<p>Una pasarela Modbus TCP ↔ RTU conecta una red Ethernet con un bus RS-485. El cliente habla TCP con la IP de la pasarela y usa el <strong>Unit ID</strong> para indicar a qué esclavo del bus serie va la petición.</p>
${C('warn', 'RTU sobre TCP no es Modbus TCP', '<p>Algunos convertidores serie-Ethernet envían la trama RTU tal cual, con dirección y CRC, dentro de TCP. Se llama «RTU over TCP». No lleva cabecera MBAP y no es compatible con Modbus TCP: los dos extremos deben configurarse igual.</p>')}
<h2>Seguridad</h2>
<p>Modbus TCP no autentica ni cifra: cualquier equipo que llegue al puerto 502 puede leer y escribir. Las defensas habituales son redes industriales separadas, cortafuegos que filtran el puerto 502, VPN para los accesos remotos y cortafuegos industriales que inspeccionan qué funciones se permiten. La especificación <strong>Modbus/TCP Security</strong> añade TLS con certificados sobre el puerto <strong>802</strong>.</p>`,
      summary: [
        'ADU TCP = MBAP (7 bytes) + PDU. Sin CRC. Máximo 260 bytes.',
        'MBAP: Transaction ID, Protocol ID = 0, Length y Unit ID.',
        'Puerto 502 (802 con TLS). Mantén las conexiones abiertas.',
        'El Unit ID sirve para llegar a esclavos serie a través de una pasarela.',
      ],
    },

    /* ================================================================ */
    {
      id: 'funciones',
      title: 'Códigos de función',
      minutes: 14,
      lead: 'El código de función es el verbo de cada mensaje. Con una docena de ellos se hace casi todo el trabajo en cualquier instalación.',
      html: `
<h2>Qué es un código de función</h2>
<p>El primer byte de la PDU indica la operación. Los códigos válidos van de 1 a 127; del 128 al 255 se reservan para las respuestas de excepción (función + 0x80). Hay tres categorías:</p>
<ul>
<li><strong>Públicas:</strong> definidas y documentadas por la especificación.</li>
<li><strong>Definidas por el usuario:</strong> los rangos 65–72 y 100–110, que cada fabricante puede usar a su manera.</li>
<li><strong>Reservadas:</strong> usadas por productos antiguos y no disponibles para uso público.</li>
</ul>
<h2>Las funciones principales</h2>
${F('fcExplorer', 'Explorador de códigos de función')}
<p>Elige una función para ver la estructura de la petición y de la respuesta, sus límites y un ejemplo real en RTU o TCP. El botón «Probar en el laboratorio» carga la petición en el simulador.</p>
<h2>Límites de cantidad</h2>
${T(['Función', 'Máximo', 'Por qué'], [
  ['01, 02 · leer bits', '2000', '250 bytes de datos en la respuesta'],
  ['03, 04 · leer registros', '125', '250 bytes de datos en la respuesta'],
  ['15 · escribir bobinas', '1968', '246 bytes de datos en la petición'],
  ['16 · escribir registros', '123', '246 bytes de datos en la petición'],
  ['23 · leer y escribir', '125 y 121', 'Los dos límites a la vez'],
])}
<p>Todos se derivan del tamaño máximo de la PDU: 253 bytes.</p>
<h2>Otras funciones que verás</h2>
${T(['Código', 'Nombre', 'Uso'], [
  ['07 · 0x07', 'Read Exception Status', 'Lee 8 bits de estado. Solo serie.'],
  ['11 · 0x0B', 'Get Comm Event Counter', 'Contador de eventos de comunicación. Solo serie.'],
  ['12 · 0x0C', 'Get Comm Event Log', 'Historial de eventos. Solo serie.'],
  ['17 · 0x11', 'Report Server ID', 'Descripción del equipo. Solo serie.'],
  ['20, 21 · 0x14, 0x15', 'Read / Write File Record', 'Acceso a registros de fichero.'],
  ['24 · 0x18', 'Read FIFO Queue', 'Lee una cola de hasta 31 registros.'],
])}
${C('key', 'Consejo', '<p>Antes de programar, busca en el manual del equipo qué funciones admite. Muchos equipos solo implementan 03, 06 y 16. Si pides otra, recibirás la excepción 01.</p>')}`,
      summary: [
        '01–04 leen; 05, 06, 15 y 16 escriben; 22 y 23 combinan lectura y escritura.',
        'Leer: máximo 125 registros o 2000 bits. Escribir: máximo 123 registros o 1968 bits.',
        'La 05 solo acepta 0xFF00 (ON) y 0x0000 (OFF).',
        'Las escrituras simples responden con un eco; las múltiples, con dirección y cantidad.',
      ],
    },

    /* ================================================================ */
    {
      id: 'excepciones',
      title: 'Respuestas de excepción',
      minutes: 8,
      lead: 'Cuando un esclavo entiende la petición pero no puede cumplirla, lo dice con una respuesta de excepción. Saber leerlas es saber diagnosticar.',
      html: `
<h2>Cómo se reconoce</h2>
<p>Una respuesta de excepción tiene siempre dos bytes de PDU:</p>
<ol>
<li>El <strong>código de función con el bit más alto a 1</strong>: la función original + 0x80. Una excepción a la 03 llega como <code>0x83</code>; a la 16 (0x10), como <code>0x90</code>.</li>
<li>Un <strong>código de excepción</strong> que explica el motivo.</li>
</ol>
<p>En RTU se añaden la dirección y el CRC: <code>01 83 02 C0 F1</code> significa «el esclavo 1 rechaza la función 03 con el código 02».</p>
<h2>Los códigos</h2>
${T(['Código', 'Nombre', 'Significado'], [
  ['01', 'ILLEGAL FUNCTION', 'El equipo no admite esa función'],
  ['02', 'ILLEGAL DATA ADDRESS', 'La dirección, o dirección + cantidad, no existe'],
  ['03', 'ILLEGAL DATA VALUE', 'Un valor de la petición no es válido'],
  ['04', 'SERVER DEVICE FAILURE', 'Error interno irrecuperable'],
  ['05', 'ACKNOWLEDGE', 'Aceptada, pero tardará: consulta más tarde'],
  ['06', 'SERVER DEVICE BUSY', 'Ocupado con una orden larga: reintenta'],
  ['08', 'MEMORY PARITY ERROR', 'Error de memoria con registros de fichero'],
  ['0A', 'GATEWAY PATH UNAVAILABLE', 'La pasarela no tiene ruta hacia el destino'],
  ['0B', 'GATEWAY TARGET DEVICE FAILED TO RESPOND', 'El esclavo detrás de la pasarela no contestó'],
])}
<h2>Provócalas tú</h2>
${F('exceptionExplorer', 'Seis errores típicos y su excepción')}
${C('info', 'Excepción frente a timeout', '<p>Una excepción es una buena noticia a medias: la comunicación funciona, el cableado está bien y el esclavo te ha entendido. El problema está en lo que pides. Un timeout, en cambio, apunta a la comunicación: cableado, parámetros serie, dirección de esclavo o CRC.</p>')}
<p>Las excepciones 0A y 0B las generan las pasarelas en nombre del esclavo. Si ves una 0B, el problema está en el bus serie que hay detrás de la pasarela.</p>`,
      summary: [
        'Excepción = función + 0x80, seguida de un código.',
        '01 función, 02 dirección, 03 valor y 04 fallo del equipo son las más habituales.',
        'Una excepción demuestra que la comunicación funciona; un timeout, que algo falla en ella.',
        '0A y 0B vienen de pasarelas.',
      ],
    },

    /* ================================================================ */
    {
      id: 'tipos',
      title: 'Tipos de datos y orden de bytes',
      short: 'Tipos de datos',
      minutes: 12,
      lead: 'Modbus solo conoce registros de 16 bits. Temperaturas con decimales, contadores de 32 bits o textos se construyen encima, y cada fabricante lo hace a su manera.',
      html: `
<h2>El registro de 16 bits</h2>
<p>Un registro guarda 16 bits y viaja en <strong>big-endian</strong>: primero el byte alto. Cómo se interpretan esos bits lo dice el mapa del fabricante:</p>
<ul>
<li><strong>Entero sin signo</strong> (uint16): de 0 a 65535.</li>
<li><strong>Entero con signo</strong> (int16): de −32768 a 32767, en complemento a dos. <code>0xFFFF</code> es 65535 sin signo o −1 con signo.</li>
<li><strong>Campo de bits:</strong> cada bit es una señal (marcha, fallo, alarma…). Típico de las palabras de control y de estado.</li>
</ul>
<h2>Escalado</h2>
<p>Para transmitir decimales con enteros se usa un <strong>factor de escala</strong>. Si el manual dice «temperatura, 0,1 °C» y lees 235, la temperatura es 23,5 °C. Una frecuencia de 4500 con escala 0,01 Hz son 45,00 Hz. Algunos equipos añaden un desplazamiento o publican la escala en otro registro.</p>
<h2>Valores de 32 bits</h2>
<p>Los enteros de 32 bits y los números en coma flotante (<strong>float32, IEEE 754</strong>) ocupan <strong>dos registros consecutivos</strong>. La especificación no dice en qué orden van las dos mitades, así que conviven cuatro variantes. Si llamamos A, B, C y D a los bytes del valor, de más a menos significativo:</p>
${T(['Orden', 'Registro N', 'Registro N+1', 'Nombre habitual'], [
  ['ABCD', 'A B', 'C D', 'Big-endian. El más lógico y el más común'],
  ['CDAB', 'C D', 'A B', 'Palabras intercambiadas (<em>word swap</em>)'],
  ['BADC', 'B A', 'D C', 'Bytes intercambiados (<em>byte swap</em>)'],
  ['DCBA', 'D C', 'B A', 'Little-endian'],
])}
${F('dataConverter', 'Conversor de tipos y orden de bytes')}
${C('key', 'Truco de campo', '<p>Si no sabes el orden, lee un valor que conozcas (una tensión de red de unos 230 V, por ejemplo) y prueba las cuatro combinaciones en el modo «Registros → valor». Solo una dará un número con sentido.</p>')}
<h2>Otros tipos</h2>
<ul>
<li><strong>64 bits</strong> (enteros o double): cuatro registros, con aún más combinaciones de orden.</li>
<li><strong>Textos:</strong> dos caracteres ASCII por registro. Números de serie o nombres de modelo.</li>
<li><strong>BCD:</strong> cada grupo de 4 bits es una cifra decimal. Aparece en relojes y equipos antiguos.</li>
</ul>
${C('warn', 'Escribe los 32 bits de una vez', '<p>Si escribes un valor de 32 bits con dos peticiones de la función 06, durante un instante el equipo tiene una mitad nueva y otra vieja. Usa la función 16 para escribir los dos registros en la misma petición.</p>')}`,
      summary: [
        'Un registro son 16 bits big-endian: int16, uint16 o un campo de bits.',
        'Los decimales se transmiten como enteros escalados.',
        '32 bits = 2 registros, en uno de cuatro órdenes: ABCD, CDAB, BADC o DCBA.',
        'Escribe los valores de 32 bits con la función 16.',
      ],
    },

    /* ================================================================ */
    {
      id: 'laboratorio',
      title: 'Laboratorio',
      minutes: 20,
      wide: true,
      lead: 'Una planta pequeña funcionando en tu navegador: un PLC, un variador y un medidor de energía en un bus. Tú eres el maestro.',
      html: `
<p>Construye peticiones, envíalas y observa cómo viajan por el bus, cómo reaccionan los esclavos y qué responden. Puedes cambiar entre RTU, ASCII y TCP, apagar equipos, forzar fallos o meter ruido en la línea. Los retos del final se marcan solos cuando los consigues.</p>
${F('lab', 'Planta simulada')}
${C('info', 'Cómo leer la memoria', '<p>La tabla de la derecha muestra el mapa de registros de cada esclavo: dirección de protocolo, notación de manual, significado, valor crudo y valor ya escalado. Pulsa una fila del monitor de tráfico para abrir esa trama en el analizador.</p>')}
<h2>Mapa de la planta</h2>
${T(['Esclavo', 'Tabla', 'Dirección', 'Contenido'], [
  ['1 · PLC', 'Bobinas', '0–5', 'Motor de la cinta, válvula de llenado, pilotos verde y rojo, sirena, extractor'],
  ['1 · PLC', 'Entradas discretas', '0–6', 'Presencia, pulsadores de marcha y paro, emergencia, niveles, puerta'],
  ['1 · PLC', 'Registros de entrada', '0–4', 'Temperatura (0,1 °C), presión (0,01 bar), nivel (0,1 %), piezas, velocidad (0,1 m/min)'],
  ['1 · PLC', 'Registros de retención', '0–4', 'Consigna de temperatura, objetivo, tiempo de llenado, consigna de velocidad, modo (0 o 1)'],
  ['2 · Variador', 'Registros de retención', '0–3', 'Palabra de control (bit 0 = marcha), frecuencia (0,01 Hz, máx. 6000), rampas (0,1 s)'],
  ['2 · Variador', 'Registros de entrada', '0–5', 'Frecuencia de salida, corriente, bus de continua, temperatura, estado, rpm'],
  ['3 · Medidor', 'Registros de entrada', '0–11', 'Tensión, corriente, potencia, factor de potencia, frecuencia y energía en float32 ABCD'],
  ['3 · Medidor', 'Registros de retención', '0–2', 'Relación del transformador de corriente, periodo de integración, dirección'],
])}`,
      summary: [
        'Una petición bien formada puede terminar en respuesta, excepción o timeout.',
        'Cada esclavo solo responde a su dirección; el broadcast no tiene respuesta.',
        'El ruido provoca errores de CRC que el maestro percibe como timeouts.',
        'Los mismos datos se leen igual por RTU, ASCII o TCP.',
      ],
    },

    /* ================================================================ */
    {
      id: 'analizador',
      title: 'Analizador de tramas',
      minutes: 6,
      lead: 'Pega cualquier trama Modbus y obtén su disección completa: variante, sentido, cada campo y la validez de su CRC o LRC.',
      html: `
<p>Es la herramienta que usarás cuando tengas delante el volcado de un sniffer, el log de un SCADA o una trama copiada de un foro. Detecta sola si es RTU, ASCII o TCP y si es una petición o una respuesta; si se equivoca, fíjalo a mano.</p>
${F('analyzer', 'Analizador')}
<h2>Cómo distingue las variantes</h2>
<ul>
<li>Si empieza por <strong>«:»</strong>, es ASCII.</li>
<li>Si los bytes 3 y 4 son <code>00 00</code> y el campo de longitud coincide con el resto de la trama, es TCP.</li>
<li>En otro caso es RTU, y se comprueba el CRC.</li>
</ul>
<p>Distinguir petición de respuesta es más delicado: una petición de lectura siempre tiene 5 bytes de PDU, y una respuesta lleva un contador de bytes que debe cuadrar con la longitud. En las escrituras simples (05 y 06), petición y respuesta son idénticas.</p>
${C('info', 'Para practicar', '<p>En el laboratorio, pulsa cualquier fila del monitor de tráfico y se abrirá aquí.</p>')}`,
      summary: [
        '«:» indica ASCII; Protocol ID 0 y una longitud coherente indican TCP.',
        'Un CRC incorrecto significa trama dañada: el esclavo la ignoraría.',
        'En 05 y 06, la petición y la respuesta normal son iguales.',
      ],
    },

    /* ================================================================ */
    {
      id: 'diagnostico',
      title: 'Diagnóstico y buenas prácticas',
      short: 'Diagnóstico',
      minutes: 10,
      lead: 'Lo que diferencia a quien sabe Modbus de quien solo lo ha leído: encontrar por qué no funciona. Una guía por síntomas y una lista de buenas prácticas.',
      html: `
<h2>Primero, el síntoma</h2>
<p>Cada síntoma apunta a un grupo distinto de causas. Elige el que ves:</p>
${F('troubleshoot', 'Diagnóstico por síntomas')}
<h2>Método de trabajo</h2>
<ol>
<li><strong>Aísla:</strong> prueba con un solo esclavo y un cable corto antes de culpar al bus entero.</li>
<li><strong>Usa una petición conocida:</strong> lee un registro cuyo valor sepas, como el modelo o una tensión.</li>
<li><strong>Mira las tramas:</strong> un adaptador USB-RS485 y un programa que muestre el tráfico en hexadecimal te dicen quién habla y qué dice.</li>
<li><strong>Cambia una cosa cada vez:</strong> velocidad, paridad, A/B, dirección. Si cambias tres a la vez, no sabrás cuál era.</li>
</ol>
<h2>Buenas prácticas</h2>
${F('checklist', 'Lista de comprobación de una instalación')}
<h2>Seguridad</h2>
<p>Modbus nació para redes aisladas. Hoy, con Modbus TCP, un equipo accesible desde Internet puede recibir órdenes de cualquiera. Estos son los mínimos razonables:</p>
<ul>
<li>Nunca expongas el puerto 502 a Internet. Usa VPN para los accesos remotos.</li>
<li>Segmenta: la red de control separada de la de oficina, con un cortafuegos entre ambas.</li>
<li>Si el equipo lo permite, limita qué IP pueden conectarse y qué registros se pueden escribir.</li>
<li>Valora los cortafuegos industriales que entienden Modbus y bloquean escrituras no autorizadas.</li>
<li>Donde sea posible, usa Modbus/TCP Security (TLS, puerto 802).</li>
</ul>`,
      summary: [
        'Timeout apunta a la comunicación; excepción, a la petición; valores raros, a la interpretación.',
        'Aísla, usa valores conocidos, mira las tramas y cambia una cosa cada vez.',
        'Documenta el mapa de registros y la convención de direcciones.',
        'No expongas Modbus TCP a Internet.',
      ],
    },

    /* ================================================================ */
    {
      id: 'examen',
      title: 'Examen final',
      minutes: 15,
      lead: 'Quince preguntas al azar sobre todo el curso, con la explicación de cada respuesta. Se aprueba con el 80 %.',
      html: `${F('exam', 'Examen', 'data-plain')}`,
      summary: [],
      noCheck: true,
    },

    /* ================================================================ */
    {
      id: 'glosario',
      title: 'Glosario',
      minutes: 5,
      lead: 'Los términos que encontrarás en manuales, foros y especificaciones, explicados en una o dos frases.',
      html: `${F('glossary', 'Glosario', 'data-plain')}`,
      summary: [],
      noCheck: true,
      noProgress: true,
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
