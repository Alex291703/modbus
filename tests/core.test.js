/* Pruebas del núcleo del protocolo: node tests/core.test.js */
'use strict';
require('../js/core/modbus.js');
const MB = globalThis.MB;
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   obtenido: ${g}\n   esperado: ${w}`); }
}

// CRC-16/MODBUS: vectores conocidos
eq('crc 01 03 00 00 00 02', MB.toHex(MB.rtuADU(1, MB.Req.readHolding(0, 2))), '01 03 00 00 00 02 C4 0B');
eq('crc ejemplo especificación 11 03 00 6B 00 03', MB.toHex(MB.rtuADU(0x11, MB.Req.readHolding(0x6b, 3))), '11 03 00 6B 00 03 76 87');
eq('crc "123456789"', MB.crc16([...'123456789'].map(c => c.charCodeAt(0))), 0x4b37);
eq('crc trace coincide', MB.crc16Trace([1, 3, 0, 0, 0, 2]).at(-1).crc, MB.crc16([1, 3, 0, 0, 0, 2]));

// LRC y ASCII
eq('lrc', MB.lrc([1, 3, 0, 0, 0, 2]), 0xfa);
eq('ascii', MB.asciiADU(1, MB.Req.readHolding(0, 2)), ':010300000002FA\r\n');

// TCP
eq('tcp', MB.toHex(MB.tcpADU(1, 1, MB.Req.readHolding(0, 2))), '00 01 00 00 00 06 01 03 00 00 00 02');

// Notación clásica
eq('classic 40001', MB.classicAddress('holding', 0), '40001');
eq('classic 6 dígitos', MB.classicAddress('holding', 9999), '410000');
eq('parse 40001', MB.parseClassic('40001'), { table: 'holding', addr: 0, digits: 5 });
eq('parse 300010', MB.parseClassic('300010'), { table: 'input', addr: 9, digits: 6 });
eq('parse inválido', MB.parseClassic('20001'), null);

// Servidor
const s = new MB.Server({ sizes: { coils: 16, discrete: 16, input: 16, holding: 16 } });
s.holding[0] = 0x00eb; s.holding[1] = 0x01f4;
eq('FC03', MB.toHex(s.process(MB.Req.readHolding(0, 2)).pdu), '03 04 00 EB 01 F4');
eq('FC03 fuera de rango', s.process(MB.Req.readHolding(15, 2)).pdu, [0x83, 0x02]);
eq('FC03 cantidad 0', s.process(MB.Req.readHolding(0, 0)).pdu, [0x83, 0x03]);
eq('FC05 valor ilegal', s.process([0x05, 0, 1, 0x12, 0x34]).pdu, [0x85, 0x03]);
s.process(MB.Req.writeCoils(0, [1, 0, 1, 1, 0, 0, 0, 0, 1]));
eq('FC0F + FC01', MB.toHex(s.process(MB.Req.readCoils(0, 9)).pdu), '01 02 0D 01');
s.holding[4] = 0x0012;
s.process(MB.Req.maskWrite(4, 0x00f2, 0x0025));
eq('FC16 ejemplo especificación', s.holding[4], 0x0017);
eq('FC17', MB.toHex(s.process(MB.Req.readWrite(0, 2, 2, [7, 8])).pdu), '17 04 00 EB 01 F4');
eq('FC08 eco', s.process(MB.Req.diagnostics(0, 0xa537)).pdu, [0x08, 0, 0, 0xa5, 0x37]);
eq('función no soportada', s.process([0x07]).pdu, [0x87, 0x01]);
eq('FC2B', s.process(MB.Req.readDeviceId(1, 0)).pdu.slice(0, 7), [0x2b, 0x0e, 1, 0x81, 0, 0, 3]);

// Decodificación
const d = MB.describeADU('rtu', '01 03 04 00 EB 01 F4 CA 67'.replace('CA 67', MB.toHex(MB.rtuADU(1, [3, 4, 0, 0xeb, 1, 0xf4]).slice(-2))));
eq('describe rtu resp ok', [d.ok, d.dir, d.unit], [true, 'resp', 1]);
const bad = MB.describeADU('rtu', '01 03 00 00 00 02 C4 0C');
eq('crc malo detectado', bad.ok, false);
const t = MB.describeADU('tcp', '00 01 00 00 00 06 01 03 00 00 00 02');
eq('describe tcp', [t.ok, t.dir, t.fields.length], [true, 'req', 7]);
const a = MB.describeADU('ascii', ':010300000002FA\r\n');
eq('describe ascii', [a.ok, a.cells.length, a.fields.at(-2).kind], [true, 10, 'crc']);
eq('detectMode tcp', MB.detectMode('00 01 00 00 00 06 01 03 00 00 00 02'), 'tcp');
eq('detectMode rtu', MB.detectMode('01 03 00 00 00 02 C4 0B'), 'rtu');
eq('detectMode ascii', MB.detectMode(':010300000002FA'), 'ascii');
eq('campos cubren toda la trama', (() => { let n = 0; d.fields.forEach(f => n += f.len); return n; })(), d.cells.length);

// Tipos de datos
eq('float 230.5 ABCD', MB.encodeValue(230.5, 'float32', 'ABCD').map(MB.hex4), ['4366', '8000']);
eq('float 230.5 CDAB', MB.encodeValue(230.5, 'float32', 'CDAB').map(MB.hex4), ['8000', '4366']);
eq('float roundtrip BADC', MB.decodeRegs(MB.encodeValue(-12.25, 'float32', 'BADC'), 'float32', 'BADC'), -12.25);
eq('int32', MB.encodeValue(-2, 'int32', 'ABCD').map(MB.hex4), ['FFFF', 'FFFE']);
eq('int16', MB.encodeValue(-1, 'int16').map(MB.hex4), ['FFFF']);
eq('timing 9600', +MB.serialTiming(9600).t35.toFixed(3), 4.01);
eq('timing 115200 fijo', MB.serialTiming(115200).t35, 1.75);

console.log(`${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
