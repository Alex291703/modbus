/*!
 * Academia Modbus — widgets de fundamentos.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const { h, icon, BusView, frameView, segmented, sleep, legend } = MB.ui;
  const W = MB.widgets;

  const DEMO_DEVICES = [
    { id: 1, name: 'PLC', kind: 'plc', ip: '192.168.1.11' },
    { id: 2, name: 'Variador', kind: 'vfd', ip: '192.168.1.12' },
    { id: 3, name: 'Medidor', kind: 'meter', ip: '192.168.1.13' },
  ];

  /* ------------------------------------------------------------------
   * Portada: transacciones reales circulando por un bus
   * ------------------------------------------------------------------ */
  W.heroLive = function (body) {
    const busEl = h('div');
    const bus = new BusView(busEl, { devices: DEMO_DEVICES, masterName: 'Maestro', masterSub: 'SCADA' });
    const cap = h('div', { class: 'live-caption' });
    const frameHost = h('div', { class: 'live-frame' });
    body.append(h('div', { class: 'lab-bus' }, busEl), cap, frameHost);

    const u16 = MB.u16;
    const script = [
      {
        unit: 1,
        req: MB.Req.readHolding(0, 2),
        resp: [0x03, 0x04, ...u16(235), ...u16(500)],
        say: ['Lee 2 registros desde 40001 del esclavo 1.', 'El PLC responde: 235 (23,5 °C) y 500.'],
      },
      {
        unit: 2,
        req: MB.Req.writeRegister(1, 4500),
        resp: MB.Req.writeRegister(1, 4500),
        say: ['Escribe 4500 (45,00 Hz) en el registro 40002 del variador.', 'El variador confirma repitiendo la petición (eco).'],
      },
      {
        unit: 3,
        req: MB.Req.readInput(0, 2),
        resp: [0x04, 0x04, ...MB.encodeValue(230.4, 'float32').flatMap(u16)],
        say: ['Lee 2 registros de entrada del medidor: un float de 32 bits.', 'El medidor devuelve 43 66 66 66 → 230,4 V.'],
      },
      {
        unit: 1,
        req: MB.Req.readHolding(200, 1),
        resp: [0x83, 0x02],
        say: ['Pide el registro 40201, que el PLC no tiene.', 'Respuesta de excepción: función 0x83, código 02 (dirección ilegal).'],
      },
    ];
    let k = 0;
    const show = (kind, text, adu) => {
      cap.replaceChildren(
        h('span', { class: `step ${kind}` }, kind === 'req' ? 'PETICIÓN' : kind === 'exc' ? 'EXCEPCIÓN' : 'RESPUESTA'),
        h('span', null, text)
      );
      frameHost.replaceChildren(frameView(MB.describeADU('rtu', adu, kind === 'req' ? 'req' : 'resp'), { table: false, compact: true, animate: true }));
    };
    let alive = true;
    (async function loop() {
      await sleep(400);
      while (alive && body.isConnected) {
        const s = script[k++ % script.length];
        const req = MB.rtuADU(s.unit, s.req);
        show('req', s.say[0], req);
        await sleep(900);
        await bus.send({ to: s.unit, text: MB.toHex(req), kind: 'req', duration: 1300 });
        await sleep(350);
        const resp = MB.rtuADU(s.unit, s.resp);
        const isExc = s.resp[0] & 0x80;
        show(isExc ? 'exc' : 'resp', s.say[1], resp);
        await bus.send({ from: s.unit, to: 'master', text: MB.toHex(resp), kind: isExc ? 'err' : 'resp', duration: 1300 });
        bus.badge('master', isExc ? 'Excepción 02' : 'OK', isExc ? 'err' : 'ok', 1400);
        await sleep(2400);
      }
    })();
    return () => (alive = false);
  };

  /* ------------------------------------------------------------------
   * Historia
   * ------------------------------------------------------------------ */
  W.timeline = function (body) {
    const items = [
      ['1979', 'Modicon publica Modbus para comunicar sus PLC por línea serie.'],
      ['1999', 'Aparece Modbus TCP: la misma PDU viaja sobre Ethernet, puerto 502.'],
      ['2004', 'Los derechos pasan a la organización de usuarios: protocolo abierto y sin licencias.'],
      ['2006', 'Se publica «Modbus over Serial Line» v1.02, la guía de RTU y ASCII.'],
      ['2012', 'Especificación del protocolo de aplicación v1.1b3, la vigente.'],
      ['2018', 'Modbus/TCP Security: TLS y certificados en el puerto 802.'],
    ];
    body.append(h('div', { class: 'timeline' }, items.map(([y, t]) => h('div', { class: 'tl-item' }, h('b', null, y), h('span', null, t)))));
  };

  /* ------------------------------------------------------------------
   * PDU y ADU según la variante
   * ------------------------------------------------------------------ */
  W.adu = function (body) {
    const variants = {
      rtu: {
        label: 'RTU',
        blocks: [
          ['addr', 'Dirección', '1 byte'],
          ['fc', 'Función', '1 byte'],
          ['data', 'Datos', '0–252 bytes'],
          ['crc', 'CRC', '2 bytes'],
        ],
        note: 'Máximo 256 bytes. Binario puro. El silencio de 3,5 caracteres separa las tramas.',
        layers: [['Aplicación', 'Protocolo Modbus (PDU)', 'fc'], ['Enlace', 'Modbus serie: dirección + CRC', 'addr'], ['Física', 'RS-485 o RS-232', 'mbap']],
      },
      ascii: {
        label: 'ASCII',
        blocks: [
          ['delim', 'Inicio «:»', '1 carácter'],
          ['addr', 'Dirección', '2 caracteres'],
          ['fc', 'Función', '2 caracteres'],
          ['data', 'Datos', '0–504 caracteres'],
          ['crc', 'LRC', '2 caracteres'],
          ['delim', 'CR LF', '2 caracteres'],
        ],
        note: 'Máximo 513 caracteres. Cada byte viaja como dos caracteres hexadecimales legibles.',
        layers: [['Aplicación', 'Protocolo Modbus (PDU)', 'fc'], ['Enlace', 'Modbus serie: «:», dirección, LRC, CR LF', 'addr'], ['Física', 'RS-485 o RS-232', 'mbap']],
      },
      tcp: {
        label: 'TCP/IP',
        blocks: [
          ['mbap', 'Cabecera MBAP', '7 bytes'],
          ['fc', 'Función', '1 byte'],
          ['data', 'Datos', '0–252 bytes'],
        ],
        note: 'Máximo 260 bytes. Sin CRC: TCP ya garantiza la integridad. El Unit ID va dentro de la MBAP.',
        layers: [['Aplicación', 'Protocolo Modbus (PDU)', 'fc'], ['Transporte', 'MBAP sobre TCP, puerto 502', 'mbap'], ['Red y física', 'IP sobre Ethernet', 'addr']],
      },
    };
    const out = h('div');
    const draw = (key) => {
      const v = variants[key];
      const pduKinds = new Set(['fc', 'data']);
      out.replaceChildren(
        h(
          'div',
          { class: 'frame-scroll' },
          h(
            'div',
            { class: 'frame-strip' },
            v.blocks.map(([k, name, size]) =>
              h(
                'div',
                { class: `fgroup k-${k}` },
                h('div', { class: 'fbytes' }, h('span', { class: 'byte', style: { width: 'auto', padding: '10px 14px', fontSize: '.9rem' } }, name)),
                h('div', { class: 'flabel' }, size)
              )
            )
          )
        ),
        h(
          'div',
          { class: 'stat-line' },
          h('span', null, h('small', null, 'PDU'), h('b', null, v.blocks.filter((b) => pduKinds.has(b[0])).map((b) => b[1]).join(' + '))),
          h('span', null, h('small', null, 'ADU'), h('b', null, `PDU + ${v.blocks.filter((b) => !pduKinds.has(b[0])).map((b) => b[1]).join(' + ')}`))
        ),
        h('p', { class: 'fig-note' }, v.note),
        h(
          'div',
          { class: 'stack' },
          v.layers.map(([lvl, txt, k]) => h('div', { class: 'stack-row' }, h('span', null, lvl), h('div', { class: `layer k-${k}` }, h('span', null, txt))))
        )
      );
    };
    body.append(
      h('div', { class: 'toolbar' }, segmented(Object.entries(variants).map(([value, v]) => ({ value, label: v.label })), 'rtu', draw, { label: 'Variante' })),
      out
    );
    draw('rtu');
  };

  /* ------------------------------------------------------------------
   * Ciclo de sondeo maestro/esclavo
   * ------------------------------------------------------------------ */
  W.polling = function (body) {
    const busEl = h('div');
    const bus = new BusView(busEl, { devices: DEMO_DEVICES });
    const cap = h('div', { class: 'live-caption' }, h('span', { class: 'step' }, 'LISTO'), h('span', null, 'Elige a quién pregunta el maestro. Solo habla quien recibe una pregunta con su dirección.'));
    const frameHost = h('div');
    const stats = { tx: 0, ok: 0, to: 0 };
    const statLine = h('div', { class: 'stat-line' });
    const drawStats = () =>
      statLine.replaceChildren(
        h('span', null, h('small', null, 'Peticiones'), h('b', null, stats.tx)),
        h('span', null, h('small', null, 'Respuestas'), h('b', null, stats.ok)),
        h('span', null, h('small', null, 'Timeouts'), h('b', null, stats.to))
      );
    drawStats();
    const values = { 1: 231, 2: 4500, 3: 2304 };
    let busy = false;
    let cycling = false;
    const buttons = [];

    const say = (kind, text, adu, dir) => {
      cap.replaceChildren(h('span', { class: `step ${kind}` }, { req: 'PETICIÓN', resp: 'RESPUESTA', exc: 'TIMEOUT', info: 'BROADCAST' }[kind] || kind), h('span', null, text));
      if (adu) frameHost.replaceChildren(frameView(MB.describeADU('rtu', adu, dir), { table: false, compact: true, animate: true }));
    };

    async function transact(id) {
      busy = true;
      buttons.forEach((b) => (b.disabled = true));
      stats.tx++;
      drawStats();
      const exists = DEMO_DEVICES.some((d) => d.id === id);
      const pdu = id === 0 ? MB.Req.writeRegister(9, 1) : MB.Req.readHolding(0, 1);
      const req = MB.rtuADU(id, pdu);
      say(
        id === 0 ? 'info' : 'req',
        id === 0 ? 'Dirección 0: todos los esclavos reciben la orden de escribir 1 en 40010.' : `El maestro pregunta al esclavo ${id}: «dame el registro 40001».`,
        req,
        'req'
      );
      await bus.send({ to: id === 0 ? 'all' : exists ? id : 'none', text: MB.toHex(req), kind: 'req', duration: 1100 });
      if (id === 0) {
        say('info', 'Nadie responde a un broadcast. El maestro espera un retardo de cambio (típicamente 100–200 ms) antes de seguir.');
        await bus.wait(900, 'Retardo de broadcast');
      } else if (!exists) {
        await bus.wait(1600, 'Esperando respuesta…');
        stats.to++;
        bus.badge('master', 'TIMEOUT', 'err', 1800);
        bus.flash('master', 'err');
        say('exc', `No hay ningún esclavo con dirección ${id}. Nadie contesta y el maestro agota su tiempo de espera (timeout).`);
      } else {
        await sleep(300);
        const resp = MB.rtuADU(id, [0x03, 0x02, ...MB.u16(values[id])]);
        say('resp', `El esclavo ${id} responde con el valor ${values[id]}. Los demás han ignorado la trama.`, resp, 'resp');
        await bus.send({ from: id, to: 'master', text: MB.toHex(resp), kind: 'resp', duration: 1100 });
        bus.flash('master', 'ok');
        stats.ok++;
      }
      drawStats();
      busy = false;
      buttons.forEach((b) => (b.disabled = false));
    }

    const mk = (label, id) => {
      const b = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => !busy && transact(id) }, label);
      buttons.push(b);
      return b;
    };
    const cycleBtn = h(
      'button',
      {
        class: 'btn btn-sm btn-primary',
        type: 'button',
        onclick: async () => {
          cycling = !cycling;
          cycleBtn.replaceChildren(icon(cycling ? 'pause' : 'play'), cycling ? 'Detener sondeo' : 'Sondeo cíclico');
          let k = 0;
          while (cycling && body.isConnected) {
            if (!busy) await transact([1, 2, 3][k++ % 3]);
            await sleep(500);
          }
        },
      },
      icon('play'),
      'Sondeo cíclico'
    );
    body.append(
      h('div', { class: 'btn-row' }, cycleBtn, mk('Esclavo 1', 1), mk('Esclavo 2', 2), mk('Esclavo 3', 3), mk('Broadcast (0)', 0), mk('Dirección 9 (no existe)', 9)),
      h('div', { class: 'lab-bus' }, busEl),
      cap,
      frameHost,
      statLine
    );
    return () => (cycling = false);
  };

  /* ------------------------------------------------------------------
   * Modelo de datos: las cuatro tablas y el conversor de direcciones
   * ------------------------------------------------------------------ */
  const TABLE_INFO = {
    coils: {
      c: 'var(--f-fc)',
      big: '0x',
      what: '1 bit · lectura y escritura',
      uses: 'Salidas digitales: arrancar un motor, abrir una válvula, encender un piloto.',
      analogy: 'Un interruptor que el maestro puede leer y accionar.',
      fcs: [0x01, 0x05, 0x0f],
    },
    discrete: {
      c: 'var(--f-addr)',
      big: '1x',
      what: '1 bit · solo lectura',
      uses: 'Entradas digitales: finales de carrera, pulsadores, sensores de presencia, alarmas.',
      analogy: 'Un piloto que el maestro solo puede mirar.',
      fcs: [0x02],
    },
    input: {
      c: 'var(--f-qty)',
      big: '3x',
      what: '16 bits · solo lectura',
      uses: 'Medidas: temperatura, presión, corriente, frecuencia de salida, contadores.',
      analogy: 'Un instrumento de aguja: se lee, no se ajusta.',
      fcs: [0x04],
    },
    holding: {
      c: 'var(--f-reg)',
      big: '4x',
      what: '16 bits · lectura y escritura',
      uses: 'Consignas y parámetros: velocidad de referencia, rampas, modos de trabajo. Muchos equipos lo publican todo aquí.',
      analogy: 'Un potenciómetro: se lee y se ajusta.',
      fcs: [0x03, 0x06, 0x10, 0x16, 0x17],
    },
  };

  W.datamodel = function (body) {
    const detail = h('div');
    const cards = {};
    const pick = (key) => {
      Object.entries(cards).forEach(([k, c]) => c.setAttribute('aria-pressed', String(k === key)));
      const t = MB.TABLES[key];
      const i = TABLE_INFO[key];
      detail.replaceChildren(
        h(
          'div',
          { class: 'detail', style: { '--c': i.c } },
          h('h4', null, `${t.es} (${t.name})`),
          h(
            'dl',
            { class: 'kv' },
            h('dt', null, 'Tamaño'),
            h('dd', null, i.what),
            h('dt', null, 'Para qué'),
            h('dd', null, i.uses),
            h('dt', null, 'Piénsalo como'),
            h('dd', null, i.analogy),
            h('dt', null, 'Notación'),
            h('dd', { class: 'mono' }, `${MB.classicAddress(key, 0)}–${MB.classicAddress(key, 9998)}  ·  ampliada ${MB.classicAddress(key, 9999).slice(0, 1)}00001–${t.prefix}65536`),
            h('dt', null, 'Funciones'),
            h('dd', null, i.fcs.map((f) => h('span', { class: 'tag', style: { marginRight: '6px' } }, `${String(f).padStart(2, '0')} · ${MB.FUNCTIONS[f].es}`)))
          )
        )
      );
    };
    const grid = h(
      'div',
      { class: 'cards-4' },
      Object.keys(TABLE_INFO).map((key) => {
        const t = MB.TABLES[key];
        const i = TABLE_INFO[key];
        const c = h(
          'button',
          { class: 'tcard', type: 'button', style: { '--c': i.c }, onclick: () => pick(key) },
          h('span', { class: 'big' }, i.big),
          h('b', null, t.es),
          h('small', null, i.what),
          h('span', { class: 'tags' }, h('span', { class: `tag ${t.access === 'rw' ? 'rw' : 'ro'}` }, t.access === 'rw' ? 'L/E' : 'Solo L'), h('span', { class: 'tag' }, t.bits === 1 ? 'bit' : 'registro'))
        );
        cards[key] = c;
        return c;
      })
    );
    body.append(grid, detail);
    pick('holding');
  };

  W.addressConverter = function (body) {
    const input = h('input', { type: 'text', id: 'addr-classic', value: '40001', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' });
    const out = h('div');
    const samples = ['40001', '40108', '30001', '10005', '00001', '400300'];
    const draw = () => {
      const p = MB.parseClassic(input.value);
      input.classList.toggle('invalid', !p);
      if (!p) {
        out.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), 'Escribe 5 o 6 dígitos que empiecen por 0, 1, 3 o 4. Ejemplos: 40001, 30010, 400300.'));
        return;
      }
      const t = MB.TABLES[p.table];
      const fc = t.read[0];
      const from = Math.max(0, p.addr - 2);
      const ruler = h(
        'div',
        { class: 'frame-scroll' },
        h(
          'div',
          { class: 'frame-strip' },
          Array.from({ length: 6 }, (_, k) => {
            const a = from + k;
            const cur = a === p.addr;
            return h(
              'div',
              { class: `fgroup ${cur ? 'k-fc' : 'k-unk'}` },
              h('div', { class: 'flabel', style: { borderTop: 0, borderBottom: '2px solid var(--c)', paddingTop: 0, paddingBottom: '5px' } }, MB.classicAddress(p.table, a)),
              h('div', { class: 'fbytes' }, h('span', { class: 'byte', style: { width: '4.2em' } }, String(a))),
              h('div', { class: 'flabel' }, `0x${MB.hex4(a)}`)
            );
          })
        )
      );
      const req = MB.rtuADU(1, [fc, ...MB.u16(p.addr), 0, 1]);
      out.replaceChildren(
        h(
          'div',
          { class: 'split' },
          h(
            'div',
            { class: 'panel' },
            h('div', { class: 'panel-title' }, icon('table'), 'Resultado'),
            h('div', { class: 'big-readout' }, `${p.addr}`, h('small', null, `= 0x${MB.hex4(p.addr)} en la trama`)),
            h(
              'dl',
              { class: 'kv', style: { marginTop: '14px' } },
              h('dt', null, 'Tabla'),
              h('dd', null, `${t.es} (${t.name})`),
              h('dt', null, 'Leer con'),
              h('dd', null, `Función ${String(fc).padStart(2, '0')} · ${MB.FUNCTIONS[fc].es}`),
              h('dt', null, 'Regla'),
              h('dd', null, `Quita el prefijo «${t.prefix}» y resta 1`)
            )
          ),
          h(
            'div',
            { class: 'panel' },
            h('div', { class: 'panel-title' }, icon('layers'), 'Documentación arriba, trama abajo'),
            ruler,
            h('p', { class: 'fig-note', style: { marginTop: '10px' } }, 'La fila superior es lo que ves en los manuales; la inferior, lo que viaja en el cable.')
          )
        ),
        h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('send'), `Petición RTU para leer ${MB.classicAddress(p.table, p.addr)} del esclavo 1`), frameView(MB.describeADU('rtu', req, 'req'), { table: false, compact: true }))
      );
    };
    input.addEventListener('input', draw);
    body.append(
      h(
        'div',
        { class: 'toolbar' },
        h('div', { class: 'field', style: { width: '180px' } }, h('label', { for: 'addr-classic' }, 'Dirección de manual'), input),
        h('div', { class: 'btn-row' }, samples.map((s) => h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => ((input.value = s), draw()) }, s)))
      ),
      out
    );
    draw();
  };

  W.legendAll = function (body) {
    body.append(legend(['addr', 'mbap', 'fc', 'reg', 'qty', 'bc', 'data', 'crc', 'exc']));
  };
})(typeof window !== 'undefined' ? window : globalThis);
