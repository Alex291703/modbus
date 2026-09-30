/*!
 * Academia Modbus — widgets de referencia: funciones, excepciones y tipos de datos.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const { h, icon, frameView, segmented, select } = MB.ui;
  const W = MB.widgets;

  /* ------------------------------------------------------------------
   * Documentación de cada función (ejemplos de la especificación)
   * ------------------------------------------------------------------ */
  const FC_DOC = {
    0x01: {
      access: 'Lectura · bits',
      limit: '1–2000 bobinas',
      desc: 'Lee el estado ON/OFF de bobinas contiguas. La respuesta empaqueta 8 estados por byte: el bit menos significativo del primer byte es la primera bobina pedida y los bits sobrantes del último byte se rellenan con ceros.',
      req: [['Función', '1', '0x01'], ['Dirección inicial', '2', '0x0000–0xFFFF'], ['Cantidad de bobinas', '2', '1–2000 (0x07D0)']],
      resp: [['Función', '1', '0x01'], ['Contador de bytes', '1', 'N = cantidad ÷ 8, redondeado arriba'], ['Estados', 'N', '8 bobinas por byte']],
      example: () => MB.Req.readCoils(19, 19),
      exampleText: 'Leer las bobinas 20 a 38 (direcciones 19 a 37).',
      preset: { fc: 1, addr: '0', qty: '6' },
    },
    0x02: {
      access: 'Lectura · bits',
      limit: '1–2000 entradas',
      desc: 'Igual que la 01 pero sobre las entradas discretas, que son de solo lectura: pulsadores, finales de carrera, sensores.',
      req: [['Función', '1', '0x02'], ['Dirección inicial', '2', '0x0000–0xFFFF'], ['Cantidad de entradas', '2', '1–2000 (0x07D0)']],
      resp: [['Función', '1', '0x02'], ['Contador de bytes', '1', 'N = cantidad ÷ 8, redondeado arriba'], ['Estados', 'N', '8 entradas por byte']],
      example: () => MB.Req.readDiscreteInputs(196, 22),
      exampleText: 'Leer las entradas 10197 a 10218.',
      preset: { fc: 2, addr: '0', qty: '7' },
    },
    0x03: {
      access: 'Lectura · registros',
      limit: '1–125 registros',
      desc: 'La función más usada de Modbus. Lee registros de retención contiguos de 16 bits. Cada registro viaja en dos bytes, primero el alto.',
      req: [['Función', '1', '0x03'], ['Dirección inicial', '2', '0x0000–0xFFFF'], ['Cantidad de registros', '2', '1–125 (0x7D)']],
      resp: [['Función', '1', '0x03'], ['Contador de bytes', '1', '2 × cantidad'], ['Valores', '2 × N', 'Byte alto, byte bajo']],
      example: () => MB.Req.readHolding(107, 3),
      exampleText: 'Leer los registros 40108 a 40110 (ejemplo de la especificación).',
      preset: { fc: 3, addr: '0', qty: '5' },
    },
    0x04: {
      access: 'Lectura · registros',
      limit: '1–125 registros',
      desc: 'Lee registros de entrada, de solo lectura: normalmente medidas. Misma estructura que la 03 pero sobre otra tabla.',
      req: [['Función', '1', '0x04'], ['Dirección inicial', '2', '0x0000–0xFFFF'], ['Cantidad de registros', '2', '1–125 (0x7D)']],
      resp: [['Función', '1', '0x04'], ['Contador de bytes', '1', '2 × cantidad'], ['Valores', '2 × N', 'Byte alto, byte bajo']],
      example: () => MB.Req.readInput(8, 1),
      exampleText: 'Leer el registro de entrada 30009.',
      preset: { fc: 4, addr: '0', qty: '5' },
    },
    0x05: {
      access: 'Escritura · 1 bit',
      limit: 'Valor 0xFF00 u 0x0000',
      desc: 'Enciende o apaga una sola bobina. Solo se aceptan dos valores: 0xFF00 = ON y 0x0000 = OFF; cualquier otro provoca la excepción 03. La respuesta normal es un eco exacto de la petición.',
      req: [['Función', '1', '0x05'], ['Dirección de la bobina', '2', '0x0000–0xFFFF'], ['Valor', '2', '0xFF00 u 0x0000']],
      resp: [['Función', '1', '0x05'], ['Dirección de la bobina', '2', 'Eco'], ['Valor', '2', 'Eco']],
      example: () => MB.Req.writeCoil(172, true),
      exampleText: 'Encender la bobina 173.',
      preset: { fc: 5, addr: '0', on: 'ff00' },
    },
    0x06: {
      access: 'Escritura · 1 registro',
      limit: 'Valor de 16 bits',
      desc: 'Escribe un único registro de retención. La respuesta normal es un eco de la petición.',
      req: [['Función', '1', '0x06'], ['Dirección del registro', '2', '0x0000–0xFFFF'], ['Valor', '2', '0x0000–0xFFFF']],
      resp: [['Función', '1', '0x06'], ['Dirección del registro', '2', 'Eco'], ['Valor', '2', 'Eco']],
      example: () => MB.Req.writeRegister(1, 3),
      exampleText: 'Escribir 3 en el registro 40002.',
      preset: { fc: 6, addr: '0', value: '270' },
    },
    0x08: {
      access: 'Diagnóstico · solo serie',
      limit: 'Subfunción 0x0000 = eco',
      desc: 'Familia de pruebas de la línea serie. La subfunción 00 (Return Query Data) devuelve exactamente lo que se envía: ideal para comprobar la comunicación sin tocar datos. Otras subfunciones leen contadores de errores o reinician el puerto.',
      req: [['Función', '1', '0x08'], ['Subfunción', '2', '0x0000'], ['Datos', '2 × N', 'Cualquier valor']],
      resp: [['Función', '1', '0x08'], ['Subfunción', '2', 'Eco'], ['Datos', '2 × N', 'Eco']],
      example: () => MB.Req.diagnostics(0, 0xa537),
      exampleText: 'Eco de 0xA537.',
      preset: { fc: 8, data: '0xA537' },
    },
    0x0f: {
      access: 'Escritura · bits',
      limit: '1–1968 bobinas',
      desc: 'Escribe varias bobinas contiguas. Los estados van empaquetados como en la lectura: bit menos significativo primero. La respuesta confirma la dirección y la cantidad.',
      req: [['Función', '1', '0x0F'], ['Dirección inicial', '2', '0x0000–0xFFFF'], ['Cantidad de bobinas', '2', '1–1968 (0x07B0)'], ['Contador de bytes', '1', 'N = cantidad ÷ 8, redondeado arriba'], ['Estados', 'N', '8 por byte']],
      resp: [['Función', '1', '0x0F'], ['Dirección inicial', '2', 'Eco'], ['Cantidad de bobinas', '2', 'Eco']],
      example: () => MB.Req.writeCoils(19, [1, 0, 1, 1, 0, 0, 1, 1, 1, 0]),
      exampleText: 'Escribir 10 bobinas desde la 20 (bytes CD 01, como en la especificación).',
      preset: { fc: 15, addr: '0', bits: '1 1 0 0 0 1' },
    },
    0x10: {
      access: 'Escritura · registros',
      limit: '1–123 registros',
      desc: 'Escribe varios registros contiguos en una sola trama. Es la forma de escribir valores de 32 bits (dos registros) de forma atómica. La respuesta confirma dirección y cantidad.',
      req: [['Función', '1', '0x10'], ['Dirección inicial', '2', '0x0000–0xFFFF'], ['Cantidad de registros', '2', '1–123 (0x7B)'], ['Contador de bytes', '1', '2 × cantidad'], ['Valores', '2 × N', 'Byte alto, byte bajo']],
      resp: [['Función', '1', '0x10'], ['Dirección inicial', '2', 'Eco'], ['Cantidad de registros', '2', 'Eco']],
      example: () => MB.Req.writeRegisters(1, [0x000a, 0x0102]),
      exampleText: 'Escribir 0x000A y 0x0102 en 40002 y 40003.',
      preset: { fc: 16, addr: '1', values: '4500, 30, 30' },
    },
    0x16: {
      access: 'Escritura · bits de un registro',
      limit: 'Un registro',
      desc: 'Cambia bits concretos de un registro sin tocar los demás. Resultado = (actual AND máscara_AND) OR (máscara_OR AND NOT máscara_AND). Evita el «leer, modificar, escribir» y sus carreras entre clientes.',
      req: [['Función', '1', '0x16'], ['Dirección', '2', '0x0000–0xFFFF'], ['Máscara AND', '2', '1 = conservar el bit'], ['Máscara OR', '2', 'Bits a forzar']],
      resp: [['Función', '1', '0x16'], ['Dirección', '2', 'Eco'], ['Máscara AND', '2', 'Eco'], ['Máscara OR', '2', 'Eco']],
      example: () => MB.Req.maskWrite(4, 0x00f2, 0x0025),
      exampleText: 'Con el registro a 0x12, AND 0xF2 y OR 0x25 dan 0x17.',
      preset: { fc: 22, addr: '0', andMask: '0xFFFE', orMask: '0x0001' },
    },
    0x17: {
      access: 'Lectura y escritura',
      limit: 'Leer 1–125 · escribir 1–121',
      desc: 'Escribe y lee registros en una sola transacción. La escritura se hace antes que la lectura. Ahorra una vuelta completa de petición y respuesta.',
      req: [['Función', '1', '0x17'], ['Dirección de lectura', '2', ''], ['Cantidad a leer', '2', '1–125 (0x7D)'], ['Dirección de escritura', '2', ''], ['Cantidad a escribir', '2', '1–121 (0x79)'], ['Contador de bytes', '1', '2 × cantidad a escribir'], ['Valores', '2 × N', '']],
      resp: [['Función', '1', '0x17'], ['Contador de bytes', '1', '2 × cantidad leída'], ['Valores leídos', '2 × N', '']],
      example: () => MB.Req.readWrite(3, 6, 14, [0x00ff, 0x00ff, 0x00ff]),
      exampleText: 'Leer 6 registros desde 40004 y escribir 3 desde 40015.',
      preset: { fc: 23, raddr: '0', rqty: '4', waddr: '1', wvalues: '3000' },
    },
    0x2b: {
      access: 'Identificación',
      limit: 'MEI tipo 0x0E',
      desc: 'Con el tipo MEI 0x0E (Read Device Identification) el equipo devuelve textos: fabricante, modelo y versión. Útil para inventario y para confirmar que hablas con el equipo correcto.',
      req: [['Función', '1', '0x2B'], ['Tipo MEI', '1', '0x0E'], ['Código de lectura', '1', '01 básica · 04 un objeto'], ['Id. de objeto', '1', '00 fabricante, 01 modelo, 02 versión']],
      resp: [['Función', '1', '0x2B'], ['Tipo MEI', '1', '0x0E'], ['Código de lectura', '1', 'Eco'], ['Conformidad', '1', ''], ['Hay más', '1', '0x00 / 0xFF'], ['Siguiente objeto', '1', ''], ['Número de objetos', '1', ''], ['Lista de objetos', 'N', 'Id, longitud, texto']],
      example: () => MB.Req.readDeviceId(1, 0),
      exampleText: 'Pedir la identificación básica completa.',
      preset: { fc: 43, code: '1', objId: '0' },
    },
  };
  MB.FC_DOC = FC_DOC;

  const layoutTable = (rows) =>
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data layout-table' },
        h('thead', null, h('tr', null, h('th', null, 'Campo'), h('th', null, 'Bytes'), h('th', null, 'Valores'))),
        h('tbody', null, rows.map(([a, b, c]) => h('tr', null, h('td', null, a), h('td', null, b), h('td', null, c))))
      )
    );

  W.fcExplorer = function (body) {
    const list = h('div', { class: 'fc-list', role: 'tablist' });
    const detail = h('div');
    let mode = 'rtu';
    let cur = 0x03;
    const buttons = {};
    const show = (fc) => {
      cur = fc;
      Object.entries(buttons).forEach(([k, b]) => b.setAttribute('aria-pressed', String(+k === fc)));
      const d = FC_DOC[fc];
      const meta = MB.FUNCTIONS[fc];
      const pdu = d.example();
      const r = MB.demoResponse(pdu);
      const wrap = (p, tid) => (mode === 'tcp' ? MB.tcpADU(tid, 1, p) : MB.rtuADU(1, p));
      const table = meta.table ? MB.TABLES[meta.table] : null;
      detail.replaceChildren(
        h(
          'div',
          { class: 'detail', style: { display: 'grid', gap: '16px' } },
          h('div', null, h('div', { class: 'eyebrow' }, `Función ${fc} · 0x${MB.hex2(fc)}`), h('h4', { style: { fontSize: '1.45rem', marginTop: '8px' } }, meta.name), h('div', { style: { color: 'var(--fg-2)' } }, meta.es)),
          h(
            'div',
            { class: 'btn-row', style: { gap: '6px' } },
            h('span', { class: 'tag rw' }, d.access),
            h('span', { class: 'tag' }, d.limit),
            table ? h('span', { class: 'tag' }, `Tabla: ${table.es}`) : null,
            meta.serial ? h('span', { class: 'tag ro' }, 'Solo línea serie') : null
          ),
          h('p', null, d.desc),
          h('div', { class: 'split' }, h('div', null, h('div', { class: 'panel-title' }, 'Petición'), layoutTable(d.req)), h('div', null, h('div', { class: 'panel-title' }, 'Respuesta normal'), layoutTable(d.resp))),
          h(
            'div',
            { class: 'toolbar', style: { justifyContent: 'space-between', alignItems: 'center' } },
            h('div', { class: 'panel-title', style: { margin: 0 } }, icon('send'), `Ejemplo: ${d.exampleText}`),
            segmented(
              [
                { value: 'rtu', label: 'RTU' },
                { value: 'tcp', label: 'TCP' },
              ],
              mode,
              (v) => ((mode = v), show(cur)),
              { small: true }
            )
          ),
          frameView(MB.describeADU(mode, wrap(pdu, 7), 'req'), { table: false, compact: true, animate: true }),
          frameView(MB.describeADU(mode, wrap(r.pdu, 7), 'resp'), { table: false, compact: true, animate: true }),
          h(
            'div',
            { class: 'btn-row' },
            h(
              'a',
              {
                class: 'btn btn-primary btn-sm',
                href: '#laboratorio',
                onclick: () => {
                  MB.state.labPreset = { unit: fc === 0x2b || fc === 0x08 ? 3 : fc <= 0x02 || fc === 0x05 || fc === 0x0f ? 1 : 2, form: d.preset };
                },
              },
              icon('lab'),
              'Probar en el laboratorio'
            )
          )
        )
      );
    };
    Object.keys(FC_DOC).forEach((k) => {
      const fc = +k;
      const b = h('button', { type: 'button', onclick: () => show(fc) }, h('span', { class: 'fc-code' }, `0x${MB.hex2(fc)}`), h('span', null, MB.FUNCTIONS[fc].es));
      buttons[fc] = b;
      list.append(b);
    });
    body.append(h('div', { class: 'fc-layout' }, list, detail));
    show(0x03);
  };

  /* ------------------------------------------------------------------
   * Excepciones: provocarlas y entenderlas
   * ------------------------------------------------------------------ */
  function scenarioServer() {
    return new MB.Server({
      sizes: { holding: 8, input: 8 },
      supports: [0x03, 0x04, 0x06, 0x10, 0x2b],
      validate: (t, a, v) => (a === 1 && v > 6000 ? 0x03 : 0),
    });
  }
  const SCENARIOS = [
    { title: 'Leer bobinas de un variador que no tiene', pdu: () => MB.Req.readCoils(0, 8), why: 'El variador no implementa la función 01.' },
    { title: 'Leer 40101 en un equipo con 8 registros', pdu: () => MB.Req.readHolding(100, 1), why: 'La dirección 100 no existe en su mapa.' },
    { title: 'Leer 6 registros empezando en 40005', pdu: () => MB.Req.readHolding(4, 6), why: 'Existen 40005–40008, pero el bloque se sale del mapa por el final.' },
    { title: 'Pedir 200 registros de una vez', pdu: () => MB.Req.readHolding(0, 200), why: 'La especificación limita la lectura a 125 registros.' },
    { title: 'Escribir 70,00 Hz en una consigna de máx. 60 Hz', pdu: () => MB.Req.writeRegister(1, 7000), why: 'La trama es correcta, pero el valor está fuera del rango que acepta el equipo.' },
    { title: 'El equipo tiene un fallo interno', pdu: () => MB.Req.readHolding(0, 2), fault: true, why: 'El servidor no puede completar la acción.' },
  ];

  W.exceptionExplorer = function (body) {
    const out = h('div');
    const run = (i) => {
      const sc = SCENARIOS[i];
      const srv = scenarioServer();
      srv.fault = !!sc.fault;
      const pdu = sc.pdu();
      const r = srv.process(pdu);
      const e = MB.EXCEPTIONS[r.exception];
      out.replaceChildren(
        h(
          'div',
          { class: 'detail', style: { display: 'grid', gap: '14px' } },
          h('div', { class: 'panel-title', style: { margin: 0 } }, icon('send'), 'Petición del maestro'),
          frameView(MB.describeADU('rtu', MB.rtuADU(2, pdu), 'req'), { table: false, compact: true, animate: true }),
          h('div', { class: 'panel-title', style: { margin: 0 } }, icon('alert'), 'Respuesta de excepción'),
          frameView(MB.describeADU('rtu', MB.rtuADU(2, r.pdu), 'resp'), { table: false, compact: true, animate: true }),
          h(
            'dl',
            { class: 'kv' },
            h('dt', null, 'Código'),
            h('dd', { class: 'mono' }, `0x${MB.hex2(r.exception)} · ${e.name}`),
            h('dt', null, 'Qué pasó'),
            h('dd', null, sc.why),
            h('dt', null, 'Cómo se arregla'),
            h('dd', null, e.fix)
          )
        )
      );
    };
    const sel = segmented(SCENARIOS.map((s, i) => ({ value: i, label: s.title })), 0, (v) => run(+v));
    sel.classList.add('seg-stack');
    body.append(sel, out);
    run(0);
  };

  /* ------------------------------------------------------------------
   * Conversor de tipos de datos y orden de bytes
   * ------------------------------------------------------------------ */
  const LETTER_KIND = ['addr', 'fc', 'reg', 'data'];

  W.dataConverter = function (body) {
    const st = { mode: 'enc', type: 'float32', value: '230.5', r0: '0x4366', r1: '0x8000' };
    const out = h('div');
    const inputs = h('div', { class: 'form-grid' });
    const valIn = h('input', { type: 'text', id: 'dt-value', value: st.value, autocomplete: 'off', spellcheck: 'false' });
    const typeSel = select('dt-type', Object.entries(MB.TYPES).map(([k, t]) => ({ value: k, label: `${k} · ${t.es}` })), st.type);
    const r0 = h('input', { type: 'text', id: 'dt-r0', value: st.r0, autocomplete: 'off' });
    const r1 = h('input', { type: 'text', id: 'dt-r1', value: st.r1, autocomplete: 'off' });
    const ieee = h('div');

    const chipsFor = (perm) =>
      h(
        'div',
        { class: 'fbytes' },
        perm.map((k, i) => h('span', { class: `byte k-${LETTER_KIND[k]}`, style: { width: '2.2em', marginLeft: i === 2 ? '10px' : 0 } }, 'ABCD'[k]))
      );

    function renderIEEE(value) {
      if (st.type !== 'float32' || st.mode !== 'enc') {
        ieee.replaceChildren();
        return;
      }
      const fb = MB.floatBits(value);
      const cells = [];
      for (let k = 31; k >= 0; k--) {
        const bit = (fb.u >>> k) & 1;
        const kind = k === 31 ? 'var(--f-crc)' : k >= 23 ? 'var(--f-reg)' : 'var(--f-data)';
        cells.push(
          h(
            'button',
            {
              type: 'button',
              class: 'bitcell',
              style: { '--c': kind, minWidth: '24px', padding: '5px 2px' },
              title: `Bit ${k}: pulsa para cambiarlo`,
              onclick: () => {
                const nv = MB.floatFromBits(fb.u ^ (1 << k));
                valIn.value = String(Number.isFinite(nv) ? +nv.toPrecision(9) : nv);
                st.value = valIn.value;
                draw();
              },
            },
            String(bit),
            h('small', null, k)
          )
        );
      }
      const e = fb.exp - 127;
      const mant = 1 + fb.mant / 2 ** 23;
      const formula =
        fb.exp === 0
          ? 'Exponente 0: número subnormal o cero.'
          : fb.exp === 255
            ? 'Exponente 255: infinito o NaN.'
            : `(−1)^${fb.sign} × ${mant.toFixed(7)} × 2^(${fb.exp} − 127) = ${value}`;
      ieee.replaceChildren(
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'panel-title' }, icon('chip'), 'IEEE 754 · pulsa un bit para cambiarlo'),
          h('div', { class: 'bitrow', style: { gap: '3px' } }, cells),
          h(
            'div',
            { class: 'legend', style: { marginTop: '12px' } },
            h('span', { class: 'legend-item k-crc' }, h('span', { class: 'kdot' }), `Signo: ${fb.sign}`),
            h('span', { class: 'legend-item k-reg' }, h('span', { class: 'kdot' }), `Exponente: ${fb.exp} (2^${e})`),
            h('span', { class: 'legend-item k-data' }, h('span', { class: 'kdot' }), `Mantisa: 0x${fb.mant.toString(16).toUpperCase().padStart(6, '0')}`)
          ),
          h('div', { class: 'op-line', style: { marginTop: '10px' } }, formula)
        )
      );
    }

    const encGroup = h('div', { class: 'form-grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' } }, MB.ui.field('Tipo', typeSel), MB.ui.field('Valor', valIn, 'Entero o decimal según el tipo'));
    const decGroup = h('div', { class: 'form-grid' }, MB.ui.field('Registro N', r0, 'Hex 0x… o decimal'), MB.ui.field('Registro N+1', r1, 'Hex 0x… o decimal'));
    inputs.append(encGroup, decGroup);
    inputs.className = '';

    function draw() {
      encGroup.hidden = st.mode !== 'enc';
      decGroup.hidden = st.mode === 'enc';
      if (st.mode === 'enc') {
        const t = MB.TYPES[st.type];
        const raw = valIn.value.trim().replace(',', '.');
        const v = Number(raw);
        const intType = st.type !== 'float32';
        const bad = raw === '' || !Number.isFinite(v) || (intType && !Number.isInteger(v)) || v < t.min || v > t.max;
        valIn.classList.toggle('invalid', bad);
        if (bad) {
          out.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), `Escribe un ${intType ? 'entero' : 'número'} entre ${t.min} y ${t.max}.`));
          ieee.replaceChildren();
          return;
        }
        const orders = t.size === 2 ? ['ABCD', 'BADC'] : Object.keys(MB.ORDERS);
        const stored = st.type === 'float32' ? Math.fround(v) : v;
        const rows = orders.map((o) => {
          const regs = MB.encodeValue(v, st.type, o);
          const perm = t.size === 2 ? (o === 'ABCD' ? [0, 1] : [1, 0]) : MB.ORDERS[o].perm;
          return h(
            'tr',
            { class: o === 'ABCD' ? 'hot' : '' },
            h('td', null, t.size === 2 ? (o === 'ABCD' ? 'AB' : 'BA') : o, o === 'ABCD' ? h('span', { class: 'tag ok', style: { marginLeft: '8px' } }, 'estándar') : null),
            h('td', null, t.size === 2 ? (o === 'ABCD' ? 'Big-endian (estándar)' : 'Bytes intercambiados') : MB.ORDERS[o].es),
            h('td', null, chipsFor(perm)),
            h('td', { class: 'mono' }, regs.map((r) => `0x${MB.hex4(r)}`).join('  ')),
            h('td', { class: 'mono' }, regs.join('  '))
          );
        });
        out.replaceChildren(
          h(
            'div',
            { class: 'panel' },
            h('div', { class: 'panel-title' }, icon('layers'), 'Bytes del valor (A = más significativo)'),
            h('div', { class: 'fbytes' }, MB.valueToBytes(v, st.type).map((b, k) => h('span', { class: `byte k-${LETTER_KIND[k]}`, style: { width: '3.6em' } }, `${'ABCD'[k]} ${MB.hex2(b)}`))),
            st.type === 'float32' && stored !== v ? h('p', { class: 'fig-note', style: { marginTop: '10px' } }, `En float32 se guarda como ${stored}: la precisión es de unos 7 dígitos.`) : null
          ),
          h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('thead', null, h('tr', null, h('th', null, 'Orden'), h('th', null, 'Nombre'), h('th', null, 'En el cable'), h('th', null, 'Registros (hex)'), h('th', null, 'Registros (dec)'))),
              h('tbody', null, rows)
            )
          )
        );
        renderIEEE(stored);
      } else {
        let a, b;
        try {
          a = MB.ui.parseNum(r0.value);
          b = MB.ui.parseNum(r1.value);
          r0.classList.remove('invalid');
          r1.classList.remove('invalid');
        } catch (e) {
          out.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), e.message));
          return;
        }
        const plausible = (x) => Number.isFinite(x) && (x === 0 || (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e7));
        const fmt = (x) => (Number.isFinite(x) ? String(+x.toPrecision(8)) : String(x));
        const rows = Object.keys(MB.ORDERS).map((o) => {
          const f = MB.decodeRegs([a, b], 'float32', o);
          return h(
            'tr',
            null,
            h('td', null, o),
            h('td', { class: 'mono' }, String(MB.decodeRegs([a, b], 'int32', o))),
            h('td', { class: 'mono' }, String(MB.decodeRegs([a, b], 'uint32', o))),
            h('td', { class: 'mono' }, fmt(f), plausible(f) ? h('span', { class: 'tag ok', style: { marginLeft: '8px' } }, 'razonable') : null)
          );
        });
        out.replaceChildren(
          h(
            'div',
            { class: 'stat-line' },
            h('span', null, h('small', null, 'N como int16'), h('b', null, MB.s16(a))),
            h('span', null, h('small', null, 'N como uint16'), h('b', null, a)),
            h('span', null, h('small', null, 'N+1 como int16'), h('b', null, MB.s16(b))),
            h('span', null, h('small', null, 'N+1 como uint16'), h('b', null, b))
          ),
          h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('thead', null, h('tr', null, h('th', null, 'Orden'), h('th', null, 'int32'), h('th', null, 'uint32'), h('th', null, 'float32'))),
              h('tbody', null, rows)
            )
          ),
          h('p', { class: 'fig-note' }, 'Truco de campo: si no sabes el orden, prueba los cuatro. Casi siempre solo uno da un valor con sentido físico.')
        );
        ieee.replaceChildren();
      }
    }
    valIn.addEventListener('input', () => ((st.value = valIn.value), draw()));
    typeSel.addEventListener('change', () => {
      st.type = typeSel.value;
      if (st.type !== 'float32' && !Number.isInteger(Number(valIn.value))) valIn.value = st.type.startsWith('u') ? '4500' : '-1234';
      draw();
    });
    [r0, r1].forEach((i) => i.addEventListener('input', draw));
    body.append(
      segmented(
        [
          { value: 'enc', label: 'Valor → registros' },
          { value: 'dec', label: 'Registros → valor' },
        ],
        'enc',
        (v) => ((st.mode = v), draw())
      ),
      inputs,
      out,
      ieee
    );
    draw();
  };
})(typeof window !== 'undefined' ? window : globalThis);
