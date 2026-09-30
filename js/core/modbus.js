/*!
 * Academia Modbus — núcleo del protocolo.
 * CRC-16, LRC, construcción y decodificación de tramas RTU / ASCII / TCP,
 * un servidor (esclavo) Modbus en memoria y utilidades de tipos de datos.
 * Sin dependencias: funciona en el navegador y en Node.
 */
(function (global) {
  'use strict';
  const MB = (global.MB = global.MB || {});

  /* ------------------------------------------------------------------
   * Bytes y hexadecimal
   * ------------------------------------------------------------------ */
  const hex2 = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
  const hex4 = (n) => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const toHex = (bytes, sep = ' ') => Array.from(bytes, hex2).join(sep);
  const u16 = (v) => [(v >> 8) & 0xff, v & 0xff];
  const rd16 = (b, i) => (((b[i] & 0xff) << 8) | (b[i + 1] & 0xff)) >>> 0;
  const s16 = (v) => (v & 0x8000 ? v - 0x10000 : v);

  /** Convierte "01 03 00 6B", "0x01,0x03" o "01036B" en un array de bytes. */
  function parseHex(input) {
    const s = String(input).trim();
    if (!s) return [];
    const tokens = s.split(/[\s,;]+/).filter(Boolean).map((t) => t.replace(/^0x/i, ''));
    const out = [];
    for (const t of tokens) {
      if (!/^[0-9a-f]+$/i.test(t)) throw new Error(`«${t}» no es un valor hexadecimal válido`);
      if (t.length <= 2) out.push(parseInt(t, 16));
      else {
        if (t.length % 2) throw new Error(`«${t}» tiene un número impar de dígitos hexadecimales`);
        for (let i = 0; i < t.length; i += 2) out.push(parseInt(t.substr(i, 2), 16));
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * Comprobación de errores
   * ------------------------------------------------------------------ */
  /** CRC-16/MODBUS: polinomio 0x8005 reflejado (0xA001), valor inicial 0xFFFF. */
  function crc16(bytes) {
    let crc = 0xffff;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i] & 0xff;
      for (let b = 0; b < 8; b++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc;
  }

  /** Igual que crc16 pero registrando cada paso, para animarlo. */
  function crc16Trace(bytes) {
    const steps = [];
    let crc = 0xffff;
    steps.push({ type: 'init', crc, byteIndex: -1, bit: -1 });
    bytes.forEach((byte, i) => {
      const before = crc;
      crc ^= byte & 0xff;
      steps.push({ type: 'xor-byte', byteIndex: i, bit: -1, byte, before, crc });
      for (let b = 0; b < 8; b++) {
        const lsb = crc & 1;
        const pre = crc;
        crc = crc >>> 1;
        steps.push({ type: 'shift', byteIndex: i, bit: b, lsb, before: pre, crc });
        if (lsb) {
          const pre2 = crc;
          crc ^= 0xa001;
          steps.push({ type: 'xor-poly', byteIndex: i, bit: b, before: pre2, crc });
        }
      }
    });
    steps.push({ type: 'done', crc, byteIndex: bytes.length, bit: -1 });
    return steps;
  }

  /** LRC de Modbus ASCII: complemento a dos de la suma de bytes (sin acarreo). */
  function lrc(bytes) {
    let sum = 0;
    for (const b of bytes) sum = (sum + (b & 0xff)) & 0xff;
    return -sum & 0xff;
  }

  /* ------------------------------------------------------------------
   * Modelo de datos
   * ------------------------------------------------------------------ */
  const TABLES = {
    coils: { key: 'coils', name: 'Coils', es: 'Bobinas', prefix: 0, bits: 1, access: 'rw', read: [0x01], write: [0x05, 0x0f] },
    discrete: { key: 'discrete', name: 'Discrete Inputs', es: 'Entradas discretas', prefix: 1, bits: 1, access: 'r', read: [0x02], write: [] },
    input: { key: 'input', name: 'Input Registers', es: 'Registros de entrada', prefix: 3, bits: 16, access: 'r', read: [0x04], write: [] },
    holding: { key: 'holding', name: 'Holding Registers', es: 'Registros de retención', prefix: 4, bits: 16, access: 'rw', read: [0x03, 0x17], write: [0x06, 0x10, 0x16, 0x17] },
  };
  const TABLE_BY_PREFIX = { 0: 'coils', 1: 'discrete', 3: 'input', 4: 'holding' };
  const TABLE_OF_FC = { 1: 'coils', 2: 'discrete', 3: 'holding', 4: 'input', 5: 'coils', 6: 'holding', 15: 'coils', 16: 'holding', 22: 'holding', 23: 'holding' };

  /** Dirección de protocolo (0–65535) → notación clásica (40001, 400001…). */
  function classicAddress(table, addr) {
    const p = TABLES[table].prefix;
    const n = addr + 1;
    return n <= 9999 ? `${p}${String(n).padStart(4, '0')}` : `${p}${String(n).padStart(5, '0')}`;
  }

  /** Notación clásica → { table, addr } o null. Acepta 5 y 6 dígitos. */
  function parseClassic(str) {
    const s = String(str).trim();
    if (!/^\d{5,6}$/.test(s)) return null;
    const table = TABLE_BY_PREFIX[s[0]];
    if (!table) return null;
    const n = parseInt(s.slice(1), 10);
    const max = s.length === 5 ? 9999 : 65536;
    if (n < 1 || n > max) return null;
    return { table, addr: n - 1, digits: s.length };
  }

  /* ------------------------------------------------------------------
   * Funciones y excepciones
   * ------------------------------------------------------------------ */
  const FUNCTIONS = {
    0x01: { name: 'Read Coils', es: 'Leer bobinas', table: 'coils' },
    0x02: { name: 'Read Discrete Inputs', es: 'Leer entradas discretas', table: 'discrete' },
    0x03: { name: 'Read Holding Registers', es: 'Leer registros de retención', table: 'holding' },
    0x04: { name: 'Read Input Registers', es: 'Leer registros de entrada', table: 'input' },
    0x05: { name: 'Write Single Coil', es: 'Escribir una bobina', table: 'coils' },
    0x06: { name: 'Write Single Register', es: 'Escribir un registro', table: 'holding' },
    0x07: { name: 'Read Exception Status', es: 'Leer estado de excepción', serial: true },
    0x08: { name: 'Diagnostics', es: 'Diagnóstico', serial: true },
    0x0b: { name: 'Get Comm Event Counter', es: 'Contador de eventos de comunicación', serial: true },
    0x0c: { name: 'Get Comm Event Log', es: 'Registro de eventos de comunicación', serial: true },
    0x0f: { name: 'Write Multiple Coils', es: 'Escribir múltiples bobinas', table: 'coils' },
    0x10: { name: 'Write Multiple Registers', es: 'Escribir múltiples registros', table: 'holding' },
    0x11: { name: 'Report Server ID', es: 'Informe de ID del servidor', serial: true },
    0x14: { name: 'Read File Record', es: 'Leer registro de fichero' },
    0x15: { name: 'Write File Record', es: 'Escribir registro de fichero' },
    0x16: { name: 'Mask Write Register', es: 'Escritura con máscara', table: 'holding' },
    0x17: { name: 'Read/Write Multiple Registers', es: 'Leer y escribir múltiples registros', table: 'holding' },
    0x18: { name: 'Read FIFO Queue', es: 'Leer cola FIFO' },
    0x2b: { name: 'Encapsulated Interface Transport', es: 'Transporte de interfaz encapsulada (MEI)' },
  };

  const EXCEPTIONS = {
    0x01: {
      name: 'ILLEGAL FUNCTION',
      es: 'Función ilegal',
      cause: 'El servidor no implementa ese código de función o no lo admite en su estado actual.',
      fix: 'Consulta el manual del equipo: quizá el dato se lee con 03 y no con 04, o el equipo no admite escrituras múltiples (usa 06 en lugar de 16).',
    },
    0x02: {
      name: 'ILLEGAL DATA ADDRESS',
      es: 'Dirección de datos ilegal',
      cause: 'La dirección inicial, o la dirección inicial más la cantidad, queda fuera del mapa del servidor.',
      fix: 'Revisa el desfase de uno (40001 es la dirección 0), la tabla usada y que el bloque no atraviese huecos del mapa.',
    },
    0x03: {
      name: 'ILLEGAL DATA VALUE',
      es: 'Valor de datos ilegal',
      cause: 'Un campo de la petición tiene un valor no permitido: cantidad fuera de rango, contador de bytes incoherente o un valor que el equipo rechaza.',
      fix: 'Comprueba los límites (máx. 125 registros por lectura, 123 por escritura) y el rango válido del parámetro que escribes.',
    },
    0x04: {
      name: 'SERVER DEVICE FAILURE',
      es: 'Fallo del dispositivo servidor',
      cause: 'Ocurrió un error irrecuperable mientras el servidor ejecutaba la acción pedida.',
      fix: 'Revisa el estado y las alarmas del equipo. Puede necesitar un reinicio o servicio técnico.',
    },
    0x05: {
      name: 'ACKNOWLEDGE',
      es: 'Reconocido, en proceso',
      cause: 'El servidor aceptó la petición pero tardará en completarla. Se usa con operaciones largas, como la programación.',
      fix: 'Consulta más tarde si terminó. Evita que el cliente dé timeout mientras tanto.',
    },
    0x06: {
      name: 'SERVER DEVICE BUSY',
      es: 'Servidor ocupado',
      cause: 'El servidor está procesando una orden larga y no puede atender esta petición ahora.',
      fix: 'Reintenta la petición más tarde.',
    },
    0x08: {
      name: 'MEMORY PARITY ERROR',
      es: 'Error de paridad de memoria',
      cause: 'Con las funciones 20 y 21 (registros de fichero), el servidor detectó un error de consistencia en su memoria.',
      fix: 'Puede requerir servicio técnico del equipo.',
    },
    0x0a: {
      name: 'GATEWAY PATH UNAVAILABLE',
      es: 'Ruta de pasarela no disponible',
      cause: 'La pasarela no pudo asignar una ruta interna hacia el destino. Suele estar mal configurada o sobrecargada.',
      fix: 'Revisa la tabla de rutas de la pasarela y el Unit ID que envías.',
    },
    0x0b: {
      name: 'GATEWAY TARGET DEVICE FAILED TO RESPOND',
      es: 'El destino no respondió a la pasarela',
      cause: 'La pasarela reenvió la petición al bus serie y el esclavo no contestó a tiempo.',
      fix: 'Comprueba que existe un esclavo con ese Unit ID, su cableado y sus parámetros serie.',
    },
  };

  /* ------------------------------------------------------------------
   * Construcción de peticiones (PDU)
   * ------------------------------------------------------------------ */
  function packBits(bits) {
    const out = new Array(Math.ceil(bits.length / 8)).fill(0);
    bits.forEach((b, i) => {
      if (b) out[i >> 3] |= 1 << (i & 7);
    });
    return out;
  }
  function unpackBits(bytes, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push((bytes[i >> 3] >> (i & 7)) & 1);
    return out;
  }

  const Req = {
    readCoils: (a, q) => [0x01, ...u16(a), ...u16(q)],
    readDiscreteInputs: (a, q) => [0x02, ...u16(a), ...u16(q)],
    readHolding: (a, q) => [0x03, ...u16(a), ...u16(q)],
    readInput: (a, q) => [0x04, ...u16(a), ...u16(q)],
    writeCoil: (a, on) => [0x05, ...u16(a), on ? 0xff : 0x00, 0x00],
    writeRegister: (a, v) => [0x06, ...u16(a), ...u16(v)],
    writeCoils: (a, bits) => {
      const bytes = packBits(bits);
      return [0x0f, ...u16(a), ...u16(bits.length), bytes.length, ...bytes];
    },
    writeRegisters: (a, vals) => [0x10, ...u16(a), ...u16(vals.length), vals.length * 2, ...vals.flatMap(u16)],
    maskWrite: (a, andMask, orMask) => [0x16, ...u16(a), ...u16(andMask), ...u16(orMask)],
    readWrite: (ra, rq, wa, vals) => [0x17, ...u16(ra), ...u16(rq), ...u16(wa), ...u16(vals.length), vals.length * 2, ...vals.flatMap(u16)],
    diagnostics: (sub, data) => [0x08, ...u16(sub), ...u16(data)],
    readDeviceId: (code = 1, obj = 0) => [0x2b, 0x0e, code, obj],
  };

  /* ------------------------------------------------------------------
   * Unidades de datos de aplicación (ADU)
   * ------------------------------------------------------------------ */
  function rtuADU(unit, pdu) {
    const body = [unit & 0xff, ...pdu];
    const c = crc16(body);
    return [...body, c & 0xff, (c >> 8) & 0xff];
  }
  function asciiADU(unit, pdu) {
    const body = [unit & 0xff, ...pdu];
    return ':' + toHex([...body, lrc(body)], '') + '\r\n';
  }
  function tcpADU(tid, unit, pdu) {
    return [...u16(tid), 0x00, 0x00, ...u16(pdu.length + 1), unit & 0xff, ...pdu];
  }

  /* ------------------------------------------------------------------
   * Servidor (esclavo) en memoria
   * ------------------------------------------------------------------ */
  class Server {
    constructor(opts = {}) {
      const sizes = Object.assign({ coils: 0, discrete: 0, input: 0, holding: 0 }, opts.sizes);
      this.sizes = sizes;
      this.coils = new Uint8Array(sizes.coils);
      this.discrete = new Uint8Array(sizes.discrete);
      this.input = new Uint16Array(sizes.input);
      this.holding = new Uint16Array(sizes.holding);
      this.supports = new Set(opts.supports || [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x08, 0x0f, 0x10, 0x16, 0x17, 0x2b]);
      this.info = opts.info || { vendor: 'Academia Modbus', product: 'SIM-1', revision: '1.0' };
      this.validate = opts.validate || null;
      this.fault = false;
    }

    inRange(table, addr, qty) {
      return qty >= 1 && addr + qty <= this.sizes[table];
    }

    /** Procesa una PDU de petición y devuelve { pdu, exception, touched }. */
    process(req) {
      const touched = [];
      const fc = req[0] & 0xff;
      const out = (pdu) => ({ pdu, touched, exception: 0 });
      const ex = (code) => ({ pdu: [(fc | 0x80) & 0xff, code], touched, exception: code });
      if (!this.supports.has(fc)) return ex(0x01);
      if (this.fault) return ex(0x04);
      const n = req.length;
      const r = (i) => rd16(req, i);
      const check = (table, addr, vals) => {
        if (!this.validate) return 0;
        for (let k = 0; k < vals.length; k++) {
          const bad = this.validate(table, addr + k, vals[k]);
          if (bad) return bad;
        }
        return 0;
      };

      switch (fc) {
        case 0x01:
        case 0x02: {
          if (n !== 5) return ex(0x03);
          const addr = r(1), qty = r(3);
          if (qty < 1 || qty > 2000) return ex(0x03);
          const t = fc === 1 ? 'coils' : 'discrete';
          if (!this.inRange(t, addr, qty)) return ex(0x02);
          const bytes = packBits(Array.from(this[t].subarray(addr, addr + qty)));
          touched.push({ table: t, addr, qty, write: false });
          return out([fc, bytes.length, ...bytes]);
        }
        case 0x03:
        case 0x04: {
          if (n !== 5) return ex(0x03);
          const addr = r(1), qty = r(3);
          if (qty < 1 || qty > 125) return ex(0x03);
          const t = fc === 3 ? 'holding' : 'input';
          if (!this.inRange(t, addr, qty)) return ex(0x02);
          const data = [];
          for (let k = 0; k < qty; k++) data.push(...u16(this[t][addr + k]));
          touched.push({ table: t, addr, qty, write: false });
          return out([fc, qty * 2, ...data]);
        }
        case 0x05: {
          if (n !== 5) return ex(0x03);
          const addr = r(1), val = r(3);
          if (val !== 0xff00 && val !== 0x0000) return ex(0x03);
          if (!this.inRange('coils', addr, 1)) return ex(0x02);
          this.coils[addr] = val ? 1 : 0;
          touched.push({ table: 'coils', addr, qty: 1, write: true });
          return out(req.slice(0, 5));
        }
        case 0x06: {
          if (n !== 5) return ex(0x03);
          const addr = r(1), val = r(3);
          if (!this.inRange('holding', addr, 1)) return ex(0x02);
          const bad = check('holding', addr, [val]);
          if (bad) return ex(bad);
          this.holding[addr] = val;
          touched.push({ table: 'holding', addr, qty: 1, write: true });
          return out(req.slice(0, 5));
        }
        case 0x0f: {
          if (n < 6) return ex(0x03);
          const addr = r(1), qty = r(3), bc = req[5];
          if (qty < 1 || qty > 0x07b0 || bc !== Math.ceil(qty / 8) || n !== 6 + bc) return ex(0x03);
          if (!this.inRange('coils', addr, qty)) return ex(0x02);
          unpackBits(req.slice(6), qty).forEach((b, k) => (this.coils[addr + k] = b));
          touched.push({ table: 'coils', addr, qty, write: true });
          return out([0x0f, ...u16(addr), ...u16(qty)]);
        }
        case 0x10: {
          if (n < 6) return ex(0x03);
          const addr = r(1), qty = r(3), bc = req[5];
          if (qty < 1 || qty > 0x7b || bc !== qty * 2 || n !== 6 + bc) return ex(0x03);
          if (!this.inRange('holding', addr, qty)) return ex(0x02);
          const vals = [];
          for (let k = 0; k < qty; k++) vals.push(r(6 + 2 * k));
          const bad = check('holding', addr, vals);
          if (bad) return ex(bad);
          vals.forEach((v, k) => (this.holding[addr + k] = v));
          touched.push({ table: 'holding', addr, qty, write: true });
          return out([0x10, ...u16(addr), ...u16(qty)]);
        }
        case 0x16: {
          if (n !== 7) return ex(0x03);
          const addr = r(1), andM = r(3), orM = r(5);
          if (!this.inRange('holding', addr, 1)) return ex(0x02);
          const nv = ((this.holding[addr] & andM) | (orM & ~andM)) & 0xffff;
          const bad = check('holding', addr, [nv]);
          if (bad) return ex(bad);
          this.holding[addr] = nv;
          touched.push({ table: 'holding', addr, qty: 1, write: true });
          return out(req.slice(0, 7));
        }
        case 0x17: {
          if (n < 10) return ex(0x03);
          const ra = r(1), rq = r(3), wa = r(5), wq = r(7), bc = req[9];
          if (rq < 1 || rq > 0x7d || wq < 1 || wq > 0x79 || bc !== wq * 2 || n !== 10 + bc) return ex(0x03);
          if (!this.inRange('holding', ra, rq) || !this.inRange('holding', wa, wq)) return ex(0x02);
          const vals = [];
          for (let k = 0; k < wq; k++) vals.push(r(10 + 2 * k));
          const bad = check('holding', wa, vals);
          if (bad) return ex(bad);
          vals.forEach((v, k) => (this.holding[wa + k] = v));
          touched.push({ table: 'holding', addr: wa, qty: wq, write: true });
          const data = [];
          for (let k = 0; k < rq; k++) data.push(...u16(this.holding[ra + k]));
          touched.push({ table: 'holding', addr: ra, qty: rq, write: false });
          return out([0x17, rq * 2, ...data]);
        }
        case 0x08: {
          if (n < 3) return ex(0x03);
          if (r(1) !== 0x0000) return ex(0x01);
          return out(req.slice());
        }
        case 0x2b: {
          if (req[1] !== 0x0e) return ex(0x01);
          if (n !== 4) return ex(0x03);
          const code = req[2], obj = req[3];
          if (code < 1 || code > 4) return ex(0x03);
          const objs = [this.info.vendor, this.info.product, this.info.revision];
          let list;
          if (code === 4) {
            if (obj > 2) return ex(0x02);
            list = [[obj, objs[obj]]];
          } else {
            const start = obj > 2 ? 0 : obj;
            list = objs.slice(start).map((s, k) => [start + k, s]);
          }
          const data = [];
          list.forEach(([id, s]) => {
            const bytes = Array.from(s, (c) => c.charCodeAt(0) & 0x7f);
            data.push(id, bytes.length, ...bytes);
          });
          return out([0x2b, 0x0e, code, 0x81, 0x00, 0x00, list.length, ...data]);
        }
        default:
          return ex(0x01);
      }
    }
  }

  /* ------------------------------------------------------------------
   * Decodificación campo a campo
   * ------------------------------------------------------------------ */
  function guessDir(pdu) {
    const fc = pdu[0];
    const n = pdu.length;
    if (fc & 0x80) return 'resp';
    switch (fc) {
      case 0x01:
      case 0x02:
      case 0x03:
      case 0x04:
        return n === 5 ? 'req' : 'resp';
      case 0x0f:
      case 0x10:
        return n === 5 ? 'resp' : 'req';
      case 0x17:
        return n >= 10 && n === 10 + pdu[9] ? 'req' : 'resp';
      case 0x2b:
        return n === 4 ? 'req' : 'resp';
      default:
        return 'req';
    }
  }

  const bitsText = (byte) =>
    Array.from({ length: 8 }, (_, k) => (byte >> k) & 1).join(' ');

  /**
   * Describe una PDU campo a campo.
   * Cada campo: { start, len, kind, label, short, value, note, bad }.
   */
  function describePDU(pdu, dir) {
    const F = [];
    const n = pdu.length;
    let i = 0;
    const add = (len, kind, label, short, value, note) => {
      const avail = Math.max(0, Math.min(len, n - i));
      if (!avail) return false;
      F.push({ start: i, len: avail, kind, label, short, value, note, bad: avail < len });
      i += avail;
      return avail === len;
    };
    const v16 = () => (i + 1 < n ? rd16(pdu, i) : pdu[i] || 0);
    const rest = () => {
      if (i < n) add(n - i, 'unk', 'Bytes sin interpretar', '?', toHex(pdu.slice(i)), 'No encajan en la estructura esperada para esta función');
    };
    const addrField = (label, table) => {
      const a = v16();
      const note = table ? `Notación clásica ${classicAddress(table, a)}` : '';
      add(2, 'reg', label, 'Dir.', `0x${hex4(a)} · ${a}`, note);
      return a;
    };
    const regs = (count, base = 0) => {
      for (let k = 0; k < count && i < n; k++) {
        const v = v16();
        add(2, 'data', `Registro ${base + k}`, `R${base + k}`, `0x${hex4(v)}`, `${v} sin signo · ${s16(v)} con signo`);
      }
    };
    if (!n) return F;

    const fc = pdu[0];
    if (fc & 0x80) {
      const base = fc & 0x7f;
      const m = FUNCTIONS[base];
      add(1, 'exc', 'Función + 0x80', 'Exc.', `0x${hex2(fc)}`, `Excepción a la función 0x${hex2(base)}${m ? ' · ' + m.name : ''}`);
      const code = pdu[1];
      const e = EXCEPTIONS[code];
      add(1, 'exc', 'Código de excepción', 'Código', `0x${hex2(code)}`, e ? `${e.name} · ${e.es}` : 'Código no estándar');
      rest();
      return F;
    }

    const meta = FUNCTIONS[fc];
    add(1, 'fc', 'Código de función', 'Función', `0x${hex2(fc)} · ${fc}`, meta ? `${meta.name} · ${meta.es}` : 'Función no reconocida');
    const table = TABLE_OF_FC[fc];

    switch (fc) {
      case 0x01:
      case 0x02:
      case 0x03:
      case 0x04:
        if (dir === 'req') {
          addrField('Dirección inicial', table);
          const q = v16();
          add(2, 'qty', 'Cantidad', 'Cant.', `${q}`, fc <= 2 ? `${q} ${fc === 1 ? 'bobinas' : 'entradas'}` : `${q} registros`);
        } else {
          const bc = pdu[i];
          add(1, 'bc', 'Contador de bytes', 'Bytes', `${bc}`, `${bc} bytes de datos a continuación`);
          if (fc <= 2) {
            for (let k = 0; i < n; k++) {
              const b = pdu[i];
              add(1, 'data', `Estados ${k * 8}–${k * 8 + 7}`, `b${k * 8}–${k * 8 + 7}`, `0x${hex2(b)}`, `Bits (del primero al octavo): ${bitsText(b)}`);
            }
          } else regs(Math.ceil((n - i) / 2));
        }
        break;
      case 0x05: {
        addrField('Dirección de la bobina', 'coils');
        const v = v16();
        add(2, 'data', 'Valor', 'Valor', `0x${hex4(v)}`, v === 0xff00 ? 'ON: encender la bobina' : v === 0 ? 'OFF: apagar la bobina' : 'No válido: solo se admite 0xFF00 o 0x0000');
        break;
      }
      case 0x06: {
        addrField('Dirección del registro', 'holding');
        const v = v16();
        add(2, 'data', 'Valor', 'Valor', `0x${hex4(v)}`, `${v} sin signo · ${s16(v)} con signo`);
        break;
      }
      case 0x0f:
      case 0x10: {
        addrField('Dirección inicial', table);
        const q = v16();
        add(2, 'qty', 'Cantidad', 'Cant.', `${q}`, fc === 0x0f ? `${q} bobinas` : `${q} registros`);
        if (dir === 'req') {
          const bc = pdu[i];
          add(1, 'bc', 'Contador de bytes', 'Bytes', `${bc}`, `${bc} bytes de valores a continuación`);
          if (fc === 0x0f) {
            for (let k = 0; i < n; k++) {
              const b = pdu[i];
              add(1, 'data', `Valores ${k * 8}–${k * 8 + 7}`, `b${k * 8}–${k * 8 + 7}`, `0x${hex2(b)}`, `Bits (del primero al octavo): ${bitsText(b)}`);
            }
          } else regs(Math.ceil((n - i) / 2));
        }
        break;
      }
      case 0x16: {
        addrField('Dirección del registro', 'holding');
        const a = v16();
        add(2, 'qty', 'Máscara AND', 'AND', `0x${hex4(a)}`, 'Bits a 1 = se conservan');
        const o = v16();
        add(2, 'data', 'Máscara OR', 'OR', `0x${hex4(o)}`, 'Bits que se fuerzan donde AND vale 0');
        break;
      }
      case 0x17:
        if (dir === 'req') {
          addrField('Dirección de lectura', 'holding');
          const rq = v16();
          add(2, 'qty', 'Cantidad a leer', 'Cant. L', `${rq}`, `${rq} registros`);
          addrField('Dirección de escritura', 'holding');
          const wq = v16();
          add(2, 'qty', 'Cantidad a escribir', 'Cant. E', `${wq}`, `${wq} registros`);
          const bc = pdu[i];
          add(1, 'bc', 'Contador de bytes', 'Bytes', `${bc}`, `${bc} bytes de valores a continuación`);
          regs(Math.ceil((n - i) / 2));
        } else {
          const bc = pdu[i];
          add(1, 'bc', 'Contador de bytes', 'Bytes', `${bc}`, `${bc} bytes leídos`);
          regs(Math.ceil((n - i) / 2));
        }
        break;
      case 0x08: {
        const sub = v16();
        add(2, 'qty', 'Subfunción', 'Sub', `0x${hex4(sub)}`, sub === 0 ? 'Return Query Data: el esclavo devuelve el eco' : 'Subfunción de diagnóstico');
        while (i < n) {
          const d = v16();
          add(2, 'data', 'Datos', 'Datos', `0x${hex4(d)}`, 'Se devuelven sin cambios');
        }
        break;
      }
      case 0x2b: {
        const mei = pdu[i];
        add(1, 'qty', 'Tipo MEI', 'MEI', `0x${hex2(mei)}`, mei === 0x0e ? 'Read Device Identification' : 'Tipo MEI');
        if (dir === 'req') {
          const c = pdu[i];
          add(1, 'bc', 'Código de lectura', 'Código', `0x${hex2(c)}`, ['', 'Básica (flujo)', 'Regular (flujo)', 'Extendida (flujo)', 'Un objeto concreto'][c] || '');
          const o = pdu[i];
          add(1, 'reg', 'Id. de objeto', 'Objeto', `0x${hex2(o)}`, ['VendorName', 'ProductCode', 'MajorMinorRevision'][o] || 'Objeto');
        } else {
          add(1, 'bc', 'Código de lectura', 'Código', `0x${hex2(pdu[i])}`, 'Copia del de la petición');
          add(1, 'qty', 'Nivel de conformidad', 'Conf.', `0x${hex2(pdu[i])}`, 'Qué categorías y accesos admite el equipo');
          add(1, 'qty', 'Hay más', 'Más', `0x${hex2(pdu[i])}`, pdu[i] ? 'Faltan objetos: pide otra vez' : 'No quedan objetos');
          add(1, 'reg', 'Siguiente objeto', 'Sig.', `0x${hex2(pdu[i])}`, '');
          const count = pdu[i];
          add(1, 'bc', 'Número de objetos', 'Nº obj', `${count}`, '');
          for (let k = 0; k < count && i < n; k++) {
            const id = pdu[i];
            add(1, 'reg', 'Id. de objeto', 'Id', `0x${hex2(id)}`, ['VendorName', 'ProductCode', 'MajorMinorRevision'][id] || '');
            const len = pdu[i];
            add(1, 'bc', 'Longitud', 'Long.', `${len}`, `${len} caracteres`);
            const txt = String.fromCharCode(...pdu.slice(i, i + len));
            add(len, 'data', 'Valor', 'Texto', `«${txt}»`, 'Texto ASCII');
          }
        }
        break;
      }
      default:
        break;
    }
    rest();
    return F;
  }

  /**
   * Decodifica una ADU completa.
   * mode: 'rtu' | 'ascii' | 'tcp'. input: array de bytes (rtu/tcp) o texto (ascii).
   * Devuelve { mode, dir, unit, pdu, cells, fields, ok, checks, error }.
   */
  function describeADU(mode, input, dirWanted = 'auto') {
    const res = { mode, dir: null, unit: null, pdu: [], cells: [], fields: [], ok: true, checks: [], error: null };
    try {
      if (mode === 'ascii') {
        const raw = String(input);
        const m = raw.replace(/^\s+/, '').match(/^(:)?([0-9A-Fa-f\s]*?)(\\r\\n|\r\n|<CR><LF>|CRLF)?\s*$/);
        if (!m) throw new Error('Una trama ASCII solo contiene «:», dígitos hexadecimales y CR LF al final.');
        const hexStr = m[2].replace(/\s+/g, '');
        if (!m[1]) res.checks.push({ ok: false, label: 'Inicio «:»', detail: 'Falta el carácter de inicio «:» (0x3A)' });
        if (!m[3]) res.checks.push({ ok: false, label: 'Final CR LF', detail: 'Falta el final CR LF (0x0D 0x0A)' });
        if (hexStr.length % 2) throw new Error('El número de caracteres hexadecimales debe ser par: cada byte son dos caracteres.');
        const bytes = [];
        for (let k = 0; k < hexStr.length; k += 2) bytes.push(parseInt(hexStr.substr(k, 2), 16));
        if (bytes.length < 3) throw new Error('Una trama ASCII necesita al menos dirección, función y LRC.');
        const body = bytes.slice(0, -1);
        const rx = bytes[bytes.length - 1];
        const calc = lrc(body);
        res.unit = bytes[0];
        res.pdu = body.slice(1);
        res.dir = dirWanted === 'auto' ? guessDir(res.pdu) : dirWanted;
        res.cells = [':', ...bytes.map(hex2), 'CR', 'LF'];
        res.fields.push({ start: 0, len: 1, kind: 'delim', label: 'Inicio', short: 'Inicio', value: '«:» 0x3A', note: 'Marca el comienzo de la trama' });
        res.fields.push(unitField(1, res.unit, 'Dirección de esclavo'));
        describePDU(res.pdu, res.dir).forEach((f) => res.fields.push({ ...f, start: f.start + 2 }));
        const lrcOk = rx === calc;
        res.fields.push({ start: bytes.length, len: 1, kind: 'crc', label: 'LRC', short: 'LRC', value: `0x${hex2(rx)}`, note: lrcOk ? 'Correcto' : `Incorrecto: se esperaba 0x${hex2(calc)}`, bad: !lrcOk });
        res.fields.push({ start: bytes.length + 1, len: 2, kind: 'delim', label: 'Final', short: 'Fin', value: 'CR LF · 0x0D 0x0A', note: 'Marca el final de la trama' });
        res.checks.unshift({ ok: lrcOk, label: 'LRC', detail: lrcOk ? `LRC 0x${hex2(rx)} correcto` : `LRC recibido 0x${hex2(rx)}, calculado 0x${hex2(calc)}` });
        res.lrc = { rx, calc };
      } else {
        const bytes = Array.isArray(input) ? input.slice() : parseHex(input);
        res.cells = bytes.map(hex2);
        if (mode === 'tcp') {
          if (bytes.length < 8) throw new Error('Una trama Modbus TCP tiene al menos 8 bytes: 7 de cabecera MBAP y 1 de función.');
          const tid = rd16(bytes, 0), pid = rd16(bytes, 2), len = rd16(bytes, 4);
          res.unit = bytes[6];
          res.pdu = bytes.slice(7);
          res.dir = dirWanted === 'auto' ? guessDir(res.pdu) : dirWanted;
          const lenOk = len === bytes.length - 6;
          res.fields.push({ start: 0, len: 2, kind: 'mbap', label: 'Transaction ID', short: 'Trans.', value: `0x${hex4(tid)} · ${tid}`, note: 'Lo elige el cliente; el servidor lo copia en la respuesta' });
          res.fields.push({ start: 2, len: 2, kind: 'mbap', label: 'Protocol ID', short: 'Proto.', value: `0x${hex4(pid)}`, note: pid === 0 ? '0 = Modbus' : 'Debe valer 0', bad: pid !== 0 });
          res.fields.push({ start: 4, len: 2, kind: 'mbap', label: 'Longitud', short: 'Long.', value: `${len}`, note: lenOk ? `${len} bytes siguen: Unit ID + PDU` : `No cuadra: siguen ${bytes.length - 6} bytes`, bad: !lenOk });
          res.fields.push(unitField(6, res.unit, 'Unit ID', true));
          describePDU(res.pdu, res.dir).forEach((f) => res.fields.push({ ...f, start: f.start + 7 }));
          res.checks.push({ ok: pid === 0, label: 'Protocol ID', detail: pid === 0 ? 'Protocol ID = 0' : `Protocol ID = ${pid}, debería ser 0` });
          res.checks.push({ ok: lenOk, label: 'Longitud', detail: lenOk ? `Longitud ${len} coherente` : `El campo dice ${len} pero siguen ${bytes.length - 6} bytes` });
        } else {
          if (bytes.length < 4) throw new Error('Una trama RTU tiene al menos 4 bytes: dirección, función y 2 de CRC.');
          const body = bytes.slice(0, -2);
          const rx = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
          const calc = crc16(body);
          res.unit = bytes[0];
          res.pdu = body.slice(1);
          res.dir = dirWanted === 'auto' ? guessDir(res.pdu) : dirWanted;
          res.fields.push(unitField(0, res.unit, 'Dirección de esclavo'));
          describePDU(res.pdu, res.dir).forEach((f) => res.fields.push({ ...f, start: f.start + 1 }));
          const ok = rx === calc;
          res.fields.push({
            start: bytes.length - 2,
            len: 2,
            kind: 'crc',
            label: 'CRC-16',
            short: 'CRC',
            value: `0x${hex4(rx)}`,
            note: ok ? 'Correcto · byte bajo primero' : `Incorrecto: se esperaba ${hex2(calc)} ${hex2(calc >> 8)}`,
            bad: !ok,
          });
          res.checks.push({ ok, label: 'CRC', detail: ok ? `CRC 0x${hex4(rx)} correcto` : `CRC recibido ${hex2(rx)} ${hex2(rx >> 8)}, calculado ${hex2(calc)} ${hex2(calc >> 8)}` });
          res.crc = { rx, calc };
        }
      }
      res.ok = res.checks.every((c) => c.ok) && !res.fields.some((f) => f.bad);
    } catch (e) {
      res.error = e.message;
      res.ok = false;
    }
    return res;
  }

  function unitField(start, unit, label, tcp) {
    let note;
    if (tcp) note = unit === 0xff || unit === 0 ? 'Servidor TCP directo (valor sin uso)' : 'Esclavo detrás de una pasarela, o equipo que lo exige';
    else note = unit === 0 ? 'Broadcast: todos escuchan, nadie responde' : unit <= 247 ? `Esclavo ${unit}` : 'Reservada (248–255)';
    return { start, len: 1, kind: 'addr', label, short: tcp ? 'Unit' : 'Esclavo', value: `${unit} · 0x${hex2(unit)}`, note };
  }

  /** Autodetección de modo a partir del texto pegado. */
  function detectMode(text) {
    const t = String(text).trim();
    if (t.startsWith(':')) return 'ascii';
    let bytes;
    try {
      bytes = parseHex(t);
    } catch (e) {
      return 'rtu';
    }
    if (bytes.length >= 8 && bytes[2] === 0 && bytes[3] === 0 && rd16(bytes, 4) === bytes.length - 6) {
      const body = bytes.slice(0, -2);
      const crcOk = crc16(body) === (bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8));
      if (!crcOk) return 'tcp';
    }
    return 'rtu';
  }

  /** Resumen en una frase de una PDU. */
  function summarize(unit, pdu, dir) {
    if (!pdu || !pdu.length) return 'Trama vacía';
    const fc = pdu[0];
    const who = unit === 0 ? 'todos los esclavos (broadcast)' : `el esclavo ${unit}`;
    const whoFrom = `El esclavo ${unit}`;
    if (fc & 0x80) {
      const e = EXCEPTIONS[pdu[1]];
      return `${whoFrom} rechaza la función 0x${hex2(fc & 0x7f)} con la excepción ${pdu[1]}${e ? ` (${e.es})` : ''}.`;
    }
    const a = pdu.length >= 3 ? rd16(pdu, 1) : 0;
    const q = pdu.length >= 5 ? rd16(pdu, 3) : 0;
    const t = TABLE_OF_FC[fc];
    const at = t ? `${a} (${classicAddress(t, a)})` : a;
    if (dir === 'req') {
      switch (fc) {
        case 0x01: return `Pide a ${who} leer ${q} bobinas desde la dirección ${at}.`;
        case 0x02: return `Pide a ${who} leer ${q} entradas discretas desde la dirección ${at}.`;
        case 0x03: return `Pide a ${who} leer ${q} registros de retención desde la dirección ${at}.`;
        case 0x04: return `Pide a ${who} leer ${q} registros de entrada desde la dirección ${at}.`;
        case 0x05: return `Ordena a ${who} ${q === 0xff00 ? 'encender' : 'apagar'} la bobina ${at}.`;
        case 0x06: return `Ordena a ${who} escribir ${q} en el registro ${at}.`;
        case 0x0f: return `Ordena a ${who} escribir ${q} bobinas desde la dirección ${at}.`;
        case 0x10: return `Ordena a ${who} escribir ${q} registros desde la dirección ${at}.`;
        case 0x16: return `Ordena a ${who} modificar bits del registro ${at} con máscaras AND/OR.`;
        case 0x17: return `Pide a ${who} escribir ${pdu.length >= 9 ? rd16(pdu, 7) : '?'} registros y leer ${q}.`;
        case 0x08: return `Envía a ${who} un diagnóstico (subfunción ${a}).`;
        case 0x2b: return `Pide a ${who} su identificación (fabricante, modelo, versión).`;
        default: return `Petición con función 0x${hex2(fc)} para ${who}.`;
      }
    }
    switch (fc) {
      case 0x01:
      case 0x02: return `${whoFrom} devuelve ${pdu[1]} byte(s) con estados de ${fc === 1 ? 'bobinas' : 'entradas'}.`;
      case 0x03:
      case 0x04:
      case 0x17: {
        const vals = [];
        for (let k = 2; k + 1 < pdu.length; k += 2) vals.push(rd16(pdu, k));
        return `${whoFrom} devuelve ${vals.length} registro(s): ${vals.slice(0, 6).join(', ')}${vals.length > 6 ? '…' : ''}.`;
      }
      case 0x05: return `${whoFrom} confirma: bobina ${at} ${q === 0xff00 ? 'encendida' : 'apagada'}.`;
      case 0x06: return `${whoFrom} confirma: registro ${at} = ${q}.`;
      case 0x0f: return `${whoFrom} confirma la escritura de ${q} bobinas desde ${at}.`;
      case 0x10: return `${whoFrom} confirma la escritura de ${q} registros desde ${at}.`;
      case 0x16: return `${whoFrom} confirma la escritura con máscara en el registro ${at}.`;
      case 0x08: return `${whoFrom} devuelve el eco del diagnóstico.`;
      case 0x2b: return `${whoFrom} envía su identificación.`;
      default: return `Respuesta con función 0x${hex2(fc)}.`;
    }
  }

  /* ------------------------------------------------------------------
   * Tipos de datos
   * ------------------------------------------------------------------ */
  const ORDERS = {
    ABCD: { perm: [0, 1, 2, 3], es: 'Big-endian (estándar Modbus)' },
    CDAB: { perm: [2, 3, 0, 1], es: 'Palabras intercambiadas' },
    BADC: { perm: [1, 0, 3, 2], es: 'Bytes intercambiados' },
    DCBA: { perm: [3, 2, 1, 0], es: 'Little-endian' },
  };
  const TYPES = {
    int16: { size: 2, es: 'Entero con signo 16 bits', min: -32768, max: 32767 },
    uint16: { size: 2, es: 'Entero sin signo 16 bits', min: 0, max: 65535 },
    int32: { size: 4, es: 'Entero con signo 32 bits', min: -2147483648, max: 2147483647 },
    uint32: { size: 4, es: 'Entero sin signo 32 bits', min: 0, max: 4294967295 },
    float32: { size: 4, es: 'Coma flotante IEEE 754', min: -3.4028234663852886e38, max: 3.4028234663852886e38 },
  };

  /** Valor → bytes en orden big-endian (A = más significativo). */
  function valueToBytes(value, type) {
    const dv = new DataView(new ArrayBuffer(4));
    switch (type) {
      case 'int16': dv.setInt16(0, value); return [dv.getUint8(0), dv.getUint8(1)];
      case 'uint16': dv.setUint16(0, value); return [dv.getUint8(0), dv.getUint8(1)];
      case 'int32': dv.setInt32(0, value); break;
      case 'uint32': dv.setUint32(0, value); break;
      case 'float32': dv.setFloat32(0, value); break;
      default: throw new Error('Tipo desconocido');
    }
    return [0, 1, 2, 3].map((k) => dv.getUint8(k));
  }
  function bytesToValue(bytes, type) {
    const dv = new DataView(new ArrayBuffer(4));
    bytes.forEach((b, k) => dv.setUint8(k, b));
    switch (type) {
      case 'int16': return dv.getInt16(0);
      case 'uint16': return dv.getUint16(0);
      case 'int32': return dv.getInt32(0);
      case 'uint32': return dv.getUint32(0);
      case 'float32': return dv.getFloat32(0);
      default: throw new Error('Tipo desconocido');
    }
  }
  /** Reordena bytes (las cuatro permutaciones son su propia inversa). */
  function reorder(bytes, order) {
    if (bytes.length === 2) return order === 'BADC' || order === 'DCBA' ? [bytes[1], bytes[0]] : bytes.slice();
    return ORDERS[order].perm.map((k) => bytes[k]);
  }
  const bytesToRegs = (bytes) => {
    const r = [];
    for (let k = 0; k < bytes.length; k += 2) r.push(((bytes[k] << 8) | bytes[k + 1]) >>> 0);
    return r;
  };
  const regsToBytes = (regs) => regs.flatMap(u16);
  function encodeValue(value, type, order = 'ABCD') {
    return bytesToRegs(reorder(valueToBytes(value, type), order));
  }
  function decodeRegs(regs, type, order = 'ABCD') {
    return bytesToValue(reorder(regsToBytes(regs), order), type);
  }
  function floatBits(value) {
    const dv = new DataView(new ArrayBuffer(4));
    dv.setFloat32(0, value);
    const u = dv.getUint32(0);
    return { u, sign: u >>> 31, exp: (u >>> 23) & 0xff, mant: u & 0x7fffff };
  }
  function floatFromBits(u) {
    const dv = new DataView(new ArrayBuffer(4));
    dv.setUint32(0, u >>> 0);
    return dv.getFloat32(0);
  }

  /* ------------------------------------------------------------------
   * Tiempos de línea serie
   * ------------------------------------------------------------------ */
  function serialTiming(baud, bitsPerChar = 11) {
    const charMs = (bitsPerChar * 1000) / baud;
    const fixed = baud > 19200;
    return {
      charMs,
      bitUs: 1e6 / baud,
      t15: fixed ? 0.75 : 1.5 * charMs,
      t35: fixed ? 1.75 : 3.5 * charMs,
      fixed,
    };
  }
  const fmtNum = (v, dec) => v.toFixed(dec).replace('.', ',');
  const fmtMs = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${fmtNum(ms, ms < 10 ? 2 : 1)} ms`);

  Object.assign(MB, {
    hex2, hex4, toHex, u16, rd16, s16, parseHex,
    crc16, crc16Trace, lrc,
    TABLES, TABLE_OF_FC, classicAddress, parseClassic,
    FUNCTIONS, EXCEPTIONS,
    packBits, unpackBits, Req,
    rtuADU, asciiADU, tcpADU,
    Server,
    guessDir, describePDU, describeADU, detectMode, summarize,
    ORDERS, TYPES, valueToBytes, bytesToValue, reorder, bytesToRegs, regsToBytes, encodeValue, decodeRegs, floatBits, floatFromBits,
    serialTiming, fmtMs, fmtNum,
  });
})(typeof window !== 'undefined' ? window : globalThis);
