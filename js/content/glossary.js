/*!
 * Academia Modbus — glosario.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const g = (term, def, aka) => ({ term, def, aka });

  MB.GLOSSARY = [
    g('ADU', 'Application Data Unit. La trama completa que viaja por el medio: la PDU más la dirección o cabecera y la comprobación de errores.'),
    g('Big-endian', 'Orden en el que el byte más significativo va primero. Es el orden de los registros Modbus.'),
    g('Bobina', 'Elemento de 1 bit de lectura y escritura. Suele representar una salida digital. Notación 0xxxx.', 'coil'),
    g('Broadcast', 'Petición con dirección 0 que ejecutan todos los esclavos sin responder. Solo tiene sentido para escrituras.'),
    g('Carga unitaria', 'Consumo de referencia de un receptor RS-485. Un segmento admite 32 cargas unitarias; con transceptores de 1/8 de carga caben más equipos.'),
    g('Cliente', 'El equipo que inicia las peticiones. Es el nombre actual del maestro.', 'client'),
    g('Contador de bytes', 'Campo que indica cuántos bytes de datos siguen, en respuestas de lectura y en escrituras múltiples.', 'byte count'),
    g('CRC-16', 'Comprobación de redundancia cíclica de Modbus RTU: valor inicial 0xFFFF, polinomio reflejado 0xA001 y byte bajo primero.'),
    g('Daisy chain', 'Cableado en cadena, de equipo en equipo. Es la topología correcta para RS-485.'),
    g('Dirección de protocolo', 'Número de 0 a 65535 que viaja en la trama para indicar un bit o un registro. Empieza en 0 y no lleva prefijo de tabla.'),
    g('Entrada discreta', 'Elemento de 1 bit de solo lectura, como un sensor o un pulsador. Notación 1xxxx.', 'discrete input'),
    g('Esclavo', 'Equipo que responde a las peticiones del maestro. Hoy se llama servidor.', 'slave'),
    g('Excepción', 'Respuesta que indica que el esclavo no puede cumplir la petición: el código de función + 0x80 seguido de un código de excepción.'),
    g('Float32', 'Número en coma flotante IEEE 754 de 32 bits. En Modbus ocupa dos registros.'),
    g('Función', 'Primer byte de la PDU. Indica la operación: leer, escribir, diagnosticar…', 'function code'),
    g('Holding register', 'Registro de retención: 16 bits de lectura y escritura. Consignas y parámetros. Notación 4xxxx.', 'registro de retención'),
    g('IEEE 754', 'Norma que define los números en coma flotante: 1 bit de signo, 8 de exponente y 23 de mantisa en la versión de 32 bits.'),
    g('Input register', 'Registro de entrada: 16 bits de solo lectura. Normalmente medidas. Notación 3xxxx.', 'registro de entrada'),
    g('LRC', 'Comprobación de redundancia longitudinal de Modbus ASCII: complemento a dos de la suma de los bytes.'),
    g('Maestro', 'Equipo que dirige la comunicación en un bus serie. Hoy se llama cliente.', 'master'),
    g('Mapa de registros', 'Documento del fabricante que dice qué significa cada dirección: nombre, tipo, escala, unidades y acceso.'),
    g('MBAP', 'Cabecera de 7 bytes de Modbus TCP: Transaction ID, Protocol ID, Length y Unit ID.'),
    g('MEI', 'Modbus Encapsulated Interface, función 43 (0x2B). Con el tipo 14 (0x0E) lee la identificación del equipo.'),
    g('Paridad', 'Bit de comprobación de cada carácter serie: par, impar o ninguna. En Modbus, la par es la opción por defecto.', 'parity'),
    g('Pasarela', 'Equipo que traduce entre Modbus TCP y Modbus serie. Usa el Unit ID para elegir el esclavo del bus.', 'gateway'),
    g('PDU', 'Protocol Data Unit: código de función y datos. Es igual en todas las variantes y ocupa como máximo 253 bytes.'),
    g('Polarización', 'Resistencias que fijan el estado de reposo de un bus RS-485 cuando nadie transmite. Van en un único punto.', 'bias'),
    g('Puerto 502', 'Puerto TCP estándar de Modbus TCP. Modbus/TCP Security usa el 802.'),
    g('RS-232', 'Interfaz serie punto a punto con tensiones referidas a masa. Solo para distancias cortas.'),
    g('RS-485', 'Interfaz serie diferencial y multipunto. Es el medio más habitual de Modbus RTU.'),
    g('RTU', 'Remote Terminal Unit. Variante serie binaria de Modbus, delimitada por silencios y protegida por CRC.'),
    g('Servidor', 'El equipo que atiende las peticiones. Es el nombre actual del esclavo.', 'server'),
    g('Sondeo', 'Ciclo en el que el maestro pregunta a los esclavos uno tras otro, una y otra vez.', 'polling'),
    g('t1,5 y t3,5', 'Tiempos de 1,5 y 3,5 caracteres. Un silencio de t3,5 separa las tramas RTU; un hueco mayor que t1,5 dentro de una trama la invalida.'),
    g('Terminación', 'Resistencia de 120 Ω entre A y B en los dos extremos de un bus RS-485 para evitar reflexiones.'),
    g('Timeout', 'Tiempo máximo que el maestro espera una respuesta antes de darla por perdida.'),
    g('Transaction ID', 'Campo de la cabecera MBAP que elige el cliente y copia el servidor, para emparejar peticiones y respuestas.'),
    g('Unit ID', 'Último campo de la cabecera MBAP. Identifica al esclavo serie detrás de una pasarela; vale 255 si no se usa.'),
    g('Word swap', 'Orden CDAB en valores de 32 bits: las dos palabras de 16 bits van intercambiadas.'),
  ];
})(typeof window !== 'undefined' ? window : globalThis);
