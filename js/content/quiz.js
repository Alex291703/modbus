/*!
 * Academia Modbus — banco de preguntas. La primera opción no es siempre la
 * correcta: `answer` indica el índice y el examen baraja el orden.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const q = (tag, text, options, answer, explain) => ({ tag, q: text, options, answer, explain });

  MB.QUIZ = [
    /* ¿Qué es Modbus? */
    q('intro', '¿Qué define exactamente el protocolo Modbus?', ['El significado de cada registro de cada equipo', 'Cómo se piden y se devuelven datos entre equipos', 'El tipo de cable y de conectores', 'La programación interna del PLC'], 1, 'Modbus es un protocolo de aplicación: define peticiones, respuestas y errores. Qué significa cada registro lo fija el fabricante en su mapa.'),
    q('intro', '¿Qué forma la PDU de Modbus?', ['Dirección + función + CRC', 'La cabecera MBAP y la función', 'Código de función + datos', 'Solo los datos'], 2, 'La PDU es el núcleo común a todas las variantes: un byte de función y sus datos. Dirección, cabecera y comprobación forman parte de la ADU.'),
    q('intro', '¿Qué tienen en común Modbus RTU, ASCII y TCP?', ['Transportan la misma PDU', 'Usan el mismo cable', 'Usan la misma comprobación de errores', 'Tienen el mismo tamaño máximo de trama'], 0, 'Cambia el envoltorio (ADU), pero la función y los datos son idénticos. Por eso una pasarela puede traducir entre ellas.'),

    /* Cliente y servidor */
    q('arquitectura', 'En un bus RS-485 Modbus, ¿quién puede iniciar una comunicación?', ['Cualquier esclavo cuando tiene datos nuevos', 'El esclavo con la dirección más baja', 'Solo el maestro', 'Cualquiera, detectando colisiones'], 2, 'Los esclavos solo responden a las peticiones del maestro. No transmiten por iniciativa propia ni hablan entre ellos.'),
    q('arquitectura', '¿Qué ocurre cuando el maestro envía una petición con dirección 0?', ['Todos los esclavos la ejecutan y ninguno responde', 'Responde el esclavo con la dirección más baja', 'Todos responden por turnos', 'Es una dirección inválida y se ignora'], 0, 'La dirección 0 es broadcast. Solo tiene sentido para escrituras, porque nadie contesta.'),
    q('arquitectura', '¿Cuál es el rango de direcciones individuales de esclavo?', ['0 a 255', '1 a 247', '1 a 255', '0 a 247'], 1, 'Del 1 al 247. El 0 es broadcast y del 248 al 255 están reservadas.'),
    q('arquitectura', '¿Qué permite a un cliente Modbus TCP emparejar cada respuesta con su petición?', ['El Unit ID', 'El Protocol ID', 'El puerto de origen', 'El Transaction ID'], 3, 'El cliente pone un Transaction ID en cada petición y el servidor lo copia en la respuesta.'),

    /* Modelo de datos */
    q('datos', 'Un manual indica el registro <code>40001</code>. ¿Qué dirección viaja en la trama?', ['1', '0', '40001', '40000'], 1, 'Se quita el prefijo 4 (que indica la tabla) y se resta 1: la dirección de protocolo es 0.'),
    q('datos', '¿Con qué función se leen los registros de entrada (3xxxx)?', ['03', '02', '04', '01'], 2, 'La 04 lee registros de entrada; la 03, registros de retención.'),
    q('datos', '¿En qué tabla pondrías una consigna de velocidad que el SCADA debe poder cambiar?', ['Registros de entrada', 'Registros de retención', 'Entradas discretas', 'Bobinas'], 1, 'Es un valor de 16 bits que se lee y se escribe: un registro de retención (4xxxx).'),
    q('datos', 'La notación <code>30010</code> corresponde a…', ['Registro de retención, dirección 10', 'Entrada discreta, dirección 9', 'Registro de entrada, dirección 9', 'Registro de entrada, dirección 10'], 2, 'El 3 indica registros de entrada; 0010 − 1 = 9.'),

    /* Capa física */
    q('fisica', '¿Por qué RS-485 resiste bien el ruido eléctrico?', ['Porque usa tensiones de ±15 V', 'Porque mide la diferencia de tensión entre dos hilos', 'Porque transmite más despacio', 'Porque cada bit se envía dos veces'], 1, 'El ruido afecta por igual a A y a B, así que la diferencia entre ambos apenas cambia.'),
    q('fisica', '¿Dónde van las resistencias de terminación de 120 Ω?', ['En cada equipo', 'Solo en el maestro', 'En los dos extremos del bus', 'En el punto medio del cable'], 2, 'Una en cada extremo físico del bus, y solo ahí. Absorben la señal y evitan reflexiones.'),
    q('fisica', '¿Cuántos bits tiene cada carácter en Modbus RTU?', ['8', '11', '10', '9'], 1, '1 de inicio, 8 de datos, 1 de paridad y 1 de stop. Sin paridad, se usan 2 de stop para mantener los 11.'),
    q('fisica', 'Un equipo nuevo no responde. Velocidad, paridad y dirección son correctas. ¿Qué prueba rápida harías en el cableado?', ['Quitar la pantalla del cable', 'Intercambiar A y B', 'Añadir una terminación en cada equipo', 'Conectarlo en estrella'], 1, 'La nomenclatura A/B está invertida en muchos equipos. Cruzar los dos hilos no daña nada.'),

    /* RTU */
    q('rtu', '¿Cuál es la longitud máxima de una trama RTU?', ['253 bytes', '260 bytes', '256 bytes', '513 bytes'], 2, '1 de dirección + 253 de PDU + 2 de CRC = 256 bytes. 260 es el máximo en TCP y 513 caracteres en ASCII.'),
    q('rtu', '¿Cómo sabe un esclavo RTU dónde empieza una trama?', ['Por el carácter «:»', 'Por un silencio de al menos 3,5 caracteres', 'Por una cabecera de 7 bytes', 'Por el bit de paridad'], 1, 'RTU se delimita por tiempos: un silencio de 3,5 tiempos de carácter separa las tramas.'),
    q('rtu', '¿Cómo viaja el valor de 16 bits <code>0x006B</code> en una trama RTU?', ['6B 00', '00 6B', 'Depende del esclavo', 'Como un solo byte, 6B'], 1, 'Los campos de 16 bits van big-endian: primero el byte alto. Solo el CRC va al revés.'),
    q('rtu', 'Un esclavo recibe una trama con el CRC incorrecto. ¿Qué hace?', ['Responde con la excepción 03', 'Pide que se repita', 'La descarta sin responder', 'La ejecuta igualmente'], 2, 'No puede fiarse de ningún byte, ni siquiera de la dirección, así que la descarta. El maestro verá un timeout.'),

    /* CRC */
    q('crc', '¿Con qué valor se inicializa el registro del CRC-16 de Modbus?', ['0x0000', '0xFFFF', '0xA001', '0x8005'], 1, 'El registro empieza a 0xFFFF. 0xA001 es el polinomio reflejado.'),
    q('crc', 'El CRC calculado es <code>0x0BC4</code>. ¿Cómo se transmite?', ['0B C4', 'C4 0B', 'Solo C4', 'Como texto «0BC4»'], 1, 'El CRC es la excepción al big-endian: primero el byte bajo (C4) y luego el alto (0B).'),
    q('crc', 'En el algoritmo del CRC, ¿cuándo se hace XOR con 0xA001?', ['Siempre, después de cada byte', 'Cuando el registro supera 0x8000', 'Cuando el bit que sale al desplazar es 1', 'Solo al final'], 2, 'En cada uno de los 8 desplazamientos por byte: si el bit que sale por la derecha es 1, se aplica el XOR con el polinomio.'),

    /* ASCII */
    q('ascii', '¿Con qué carácter empieza una trama Modbus ASCII?', ['«$»', '«:»', 'STX (0x02)', '«#»'], 1, 'Los dos puntos (0x3A) marcan el inicio, y CR LF el final.'),
    q('ascii', '¿Qué comprobación de errores usa Modbus ASCII?', ['CRC-16', 'La de TCP', 'LRC', 'Ninguna'], 2, 'LRC: el complemento a dos de la suma de los bytes.'),
    q('ascii', 'La suma de los bytes de una trama ASCII es <code>0x06</code>. ¿Cuánto vale el LRC?', ['0x06', '0xF9', '0xFA', '0x60'], 2, 'Complemento a dos: 0x100 − 0x06 = 0xFA. Sumando 0x06 + 0xFA se obtiene 0x00.'),

    /* TCP */
    q('tcp', '¿Cuántos bytes tiene la cabecera MBAP?', ['6', '7', '8', '4'], 1, 'Transaction ID (2) + Protocol ID (2) + Length (2) + Unit ID (1) = 7.'),
    q('tcp', '¿Por qué Modbus TCP no lleva CRC?', ['Porque va dentro de la cabecera MBAP', 'Porque TCP ya garantiza la integridad de los datos', 'Porque en Ethernet no hay ruido', 'Porque es opcional'], 1, 'TCP detecta los errores y retransmite, así que un CRC propio sería redundante.'),
    q('tcp', '¿Qué puerto usa por defecto un servidor Modbus TCP?', ['80', '102', '502', '44818'], 2, 'El 502. Modbus/TCP Security, con TLS, usa el 802.'),
    q('tcp', 'En la trama TCP <code>00 01 00 00 00 06 01 03 00 00 00 02</code>, ¿qué indica <code>00 06</code>?', ['Que se piden 6 registros', 'Que siguen 6 bytes: Unit ID y PDU', 'La longitud total de la trama', 'El número de transacción'], 1, 'El campo Length cuenta los bytes que vienen detrás: 1 de Unit ID y 5 de PDU.'),

    /* Funciones */
    q('funciones', '¿Cuántos registros se pueden leer como máximo con una sola petición 03?', ['256', '2000', '125', '123'], 2, '125 registros = 250 bytes de datos, lo que cabe en una PDU de 253 bytes. 123 es el máximo para escribir.'),
    q('funciones', '¿Qué valor enciende una bobina con la función 05?', ['0x0001', '0xFF00', '0xFFFF', '0x0100'], 1, 'Solo se aceptan 0xFF00 (ON) y 0x0000 (OFF). Cualquier otro valor provoca la excepción 03.'),
    q('funciones', '¿Qué devuelve un esclavo tras una escritura correcta con la función 06?', ['Solo el código de función', 'El valor anterior del registro', 'Un eco exacto de la petición', 'Nada'], 2, 'Las escrituras simples (05 y 06) responden repitiendo la petición.'),
    q('funciones', 'Quieres activar solo el bit 3 de un registro sin tocar los demás y sin leerlo antes. ¿Qué función usas?', ['06', '05', '22 (0x16), escritura con máscara', '23'], 2, 'La 22 aplica una máscara AND y otra OR sobre el valor actual, en una sola operación.'),

    /* Excepciones */
    q('excepciones', 'Recibes la PDU <code>83 02</code>. ¿Qué significa?', ['Función 83 con 2 registros', 'Excepción a la función 03: dirección ilegal', 'Excepción 83 en el esclavo 2', 'Lectura de 2 registros desde 83'], 1, '0x83 = 0x03 + 0x80: excepción a la lectura de registros. El código 02 es ILLEGAL DATA ADDRESS.'),
    q('excepciones', 'Pides 200 registros con la función 03. ¿Qué excepción esperas?', ['02, dirección ilegal', '01, función ilegal', '03, valor ilegal', '04, fallo del dispositivo'], 2, 'La cantidad está fuera del rango permitido (1–125): es un valor ilegal.'),
    q('excepciones', '¿Qué indica recibir una excepción en lugar de un timeout?', ['Que el cableado está mal', 'Que la comunicación funciona y el problema está en la petición', 'Que el CRC es incorrecto', 'Que el esclavo está apagado'], 1, 'Para enviar una excepción el esclavo tuvo que recibir y entender la trama.'),

    /* Tipos de datos */
    q('tipos', 'Un registro con escala 0,1 °C vale 235. ¿Qué temperatura indica?', ['235 °C', '2,35 °C', '23,5 °C', '0,235 °C'], 2, '235 × 0,1 = 23,5 °C.'),
    q('tipos', 'Un registro vale <code>0xFFFF</code> y el manual dice int16. ¿Qué valor es?', ['65535', '−1', '−32768', '0'], 1, 'En complemento a dos de 16 bits, 0xFFFF es −1. Sin signo sería 65535.'),
    q('tipos', '¿Cuántos registros ocupa un float32?', ['Uno', 'Dos consecutivos', 'Cuatro', 'Medio registro'], 1, '32 bits = 2 registros de 16 bits.'),
    q('tipos', 'Lees la tensión de red como float y obtienes 2,7 × 10²³ en lugar de unos 230 V. ¿Qué sospechas primero?', ['Un fallo del medidor', 'El orden de las palabras', 'La paridad', 'La terminación del bus'], 1, '230,4 V guardado como CDAB y leído como ABCD da exactamente ese disparate. Prueba los cuatro órdenes.'),

    /* Diagnóstico */
    q('diagnostico', 'Hay errores de CRC esporádicos en un bus largo. ¿Qué revisas primero?', ['El mapa de registros', 'Terminación, polarización y apantallamiento', 'La función que usas', 'El Unit ID'], 1, 'Los errores de CRC son síntoma de una señal degradada: reflexiones, reposo flotante o ruido.'),
    q('diagnostico', 'Recibes la excepción 02 al leer el último registro de un equipo pidiendo la dirección 40 para el «40040». ¿Causa más probable?', ['El cableado', 'El desfase de uno: 40040 es la dirección 39', 'La velocidad del bus', 'El CRC'], 1, 'Al no restar 1, pides un registro más allá del final del mapa.'),
    q('diagnostico', '¿Qué medida de seguridad es la más importante en Modbus TCP?', ['Usar paridad par', 'No exponer el puerto 502 a Internet y segmentar la red', 'Cambiar el Transaction ID a menudo', 'Usar la función 16 en lugar de la 06'], 1, 'Modbus TCP no autentica: la protección tiene que venir de la arquitectura de red.'),
  ];
})(typeof window !== 'undefined' ? window : globalThis);
