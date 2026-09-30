/*!
 * Academia Modbus — laboratorio: maestro, bus y tres esclavos simulados.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const { h, icon, BusView, frameView, segmented, select, switchCtl, store, toast, sleep } = MB.ui;
  const W = MB.widgets;

  const READ_FCS = new Set([0x01, 0x02, 0x03, 0x04, 0x17]);
  const WRITE_FCS = new Set([0x05, 0x06, 0x0f, 0x10, 0x16, 0x17]);
  const ALL_FCS = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x08, 0x0f, 0x10, 0x16, 0x17, 0x2b];

  /* ------------------------------------------------------------------
   * Retos: se marcan solos al detectar la transacción adecuada
   * ------------------------------------------------------------------ */
  const covers = (req, a0, a1) => {
    const a = MB.rd16(req, 1), q = MB.rd16(req, 3);
    return a <= a0 && a + q - 1 >= a1;
  };
  const CHALLENGES = [
    {
      id: 'read-temp',
      title: 'Lee la temperatura del PLC',
      hint: 'Función 04, esclavo 1, dirección 0, cantidad 1. Divide el valor entre 10.',
      preset: { unit: 1, form: { fc: 4, addr: '0', qty: '1' } },
      check: (e) => e.ok && e.unit === 1 && e.req[0] === 4 && covers(e.req, 0, 0),
    },
    {
      id: 'motor-on',
      title: 'Arranca el motor de la cinta',
      hint: 'Función 05 sobre la bobina 0 del PLC con el valor ON (0xFF00).',
      preset: { unit: 1, form: { fc: 5, addr: '0', on: 'ff00' } },
      check: (e, plant) => e.ok && (e.unit === 1 || e.broadcast) && [5, 15].includes(e.req[0]) && plant.byId(1).server.coils[0] === 1,
    },
    {
      id: 'vfd-ref',
      title: 'Pon la consigna del variador a 45,00 Hz',
      hint: 'Escribe 4500 en el registro 1 del variador (40002). Escala: 0,01 Hz.',
      preset: { unit: 2, form: { fc: 6, addr: '1', value: '4500' } },
      check: (e, plant) => e.ok && e.unit === 2 && WRITE_FCS.has(e.req[0]) && plant.byId(2).server.holding[1] === 4500,
    },
    {
      id: 'vfd-run',
      title: 'Arranca el variador y míralo acelerar',
      hint: 'Pon a 1 el bit 0 de la palabra de control (registro 0). Luego lee los registros de entrada 0 a 5.',
      preset: { unit: 2, form: { fc: 6, addr: '0', value: '1' } },
      check: (e, plant) => e.ok && e.unit === 2 && WRITE_FCS.has(e.req[0]) && (plant.byId(2).server.holding[0] & 1) === 1,
    },
    {
      id: 'meter-float',
      title: 'Lee la tensión del medidor',
      hint: 'Función 04, esclavo 3, dirección 0, cantidad 2: es un float de 32 bits en dos registros.',
      preset: { unit: 3, form: { fc: 4, addr: '0', qty: '2' } },
      check: (e) => e.ok && e.unit === 3 && e.req[0] === 4 && covers(e.req, 0, 1),
    },
    {
      id: 'exc-01',
      title: 'Provoca la excepción 01',
      hint: 'Pide bobinas (función 01) al variador, que no tiene.',
      preset: { unit: 2, form: { fc: 1, addr: '0', qty: '8' } },
      check: (e) => e.exception === 1,
    },
    {
      id: 'exc-02',
      title: 'Provoca la excepción 02',
      hint: 'Lee un registro que no exista, por ejemplo el 100 del medidor.',
      preset: { unit: 3, form: { fc: 3, addr: '100', qty: '1' } },
      check: (e) => e.exception === 2,
    },
    {
      id: 'exc-03',
      title: 'Provoca la excepción 03',
      hint: 'Pide al variador una consigna de 70 Hz (7000): su máximo es 60 Hz.',
      preset: { unit: 2, form: { fc: 6, addr: '1', value: '7000' } },
      check: (e) => e.exception === 3,
    },
    {
      id: 'timeout',
      title: 'Provoca un timeout',
      hint: 'Pregunta a la dirección 9, apaga un equipo o activa el ruido.',
      preset: { unit: 9, form: { fc: 3, addr: '0', qty: '1' } },
      check: (e) => e.timeout,
    },
    {
      id: 'broadcast',
      title: 'Envía un broadcast',
      hint: 'Dirección 0 con una escritura: todos la ejecutan y nadie responde.',
      preset: { unit: 0, form: { fc: 5, addr: '0', on: '0000' } },
      check: (e) => e.broadcast && WRITE_FCS.has(e.req[0]),
    },
    {
      id: 'devid',
      title: 'Identifica un equipo',
      hint: 'Función 43 con MEI 14 (0x2B / 0x0E): fabricante, modelo y versión.',
      preset: { unit: 3, form: { fc: 43, code: '1', objId: '0' } },
      check: (e) => e.ok && e.req[0] === 0x2b,
    },
    {
      id: 'tcp',
      title: 'Haz una lectura por Modbus TCP',
      hint: 'Cambia el modo a TCP y repite cualquier lectura.',
      preset: { mode: 'tcp', unit: 1, form: { fc: 3, addr: '0', qty: '5' } },
      check: (e) => e.ok && e.mode === 'tcp' && READ_FCS.has(e.req[0]),
    },
  ];
  MB.CHALLENGES = CHALLENGES;

  /** Valor de ingeniería a partir de valores recibidos. */
  function engFrom(dev, table, addr, vals, k) {
    const lab = dev.labels[table] && dev.labels[table][addr];
    const raw = vals[k];
    if (!lab) {
      const prev = dev.labels[table] && dev.labels[table][addr - 1];
      if (prev && prev.f32) return null;
      return { name: `${MB.classicAddress(table, addr)} · libre`, val: String(raw) };
    }
    if (lab.f32) {
      if (k + 1 >= vals.length) return { name: lab.name, val: `0x${MB.hex4(raw)} (falta la otra mitad)` };
      const f = MB.decodeRegs([raw, vals[k + 1]], 'float32', 'ABCD');
      return { name: lab.name, val: `${MB.fmtNum(f, Math.abs(f) < 10 ? 3 : 2)} ${lab.unit}`.trim() };
    }
    if (lab.enum) return { name: lab.name, val: lab.enum[raw] || String(raw) };
    if (lab.bits) return { name: lab.name, val: `0b${raw.toString(2).padStart(8, '0')}` };
    const v = lab.scale ? raw * lab.scale : raw;
    const dec = lab.scale ? Math.max(0, -Math.floor(Math.log10(lab.scale))) : 0;
    return { name: lab.name, val: `${MB.fmtNum(v, dec)} ${lab.unit || ''}`.trim() };
  }

  W.lab = function (body) {
    const plant = MB.sim.createPlant();
    const st = {
      mode: 'rtu',
      baud: 19200,
      noise: false,
      auto: false,
      busy: false,
      tid: 1,
      view: { dev: 1, table: 'input' },
      log: [],
      t0: performance.now(),
    };
    const done = { ...store.get('challenges', {}) };

    /* ---------- Bus ---------- */
    const busEl = h('div');
    const bus = new BusView(busEl, { devices: plant.devices, masterName: 'Maestro', masterSub: 'SCADA' });
    const busTag = () => (st.mode === 'tcp' ? 'Ethernet · TCP 502' : `RS-485 · ${st.baud} ${st.mode === 'ascii' ? '7E1' : '8E1'} · ${st.mode.toUpperCase()}`);

    /* ---------- Barra superior ---------- */
    const baudSel = select('lab-baud', [9600, 19200, 38400, 115200].map((b) => ({ value: b, label: `${b} bit/s` })), st.baud);
    baudSel.addEventListener('change', () => {
      st.baud = +baudSel.value;
      bus.setTag(busTag());
      preview();
    });
    const noiseSw = switchCtl('lab-noise', 'Ruido: corromper peticiones', false, (v) => {
      st.noise = v;
      if (v) toast('Las próximas peticiones llegarán con un bit cambiado', 'info');
    });
    const autoSw = switchCtl('lab-auto', 'Repetir cada 1,5 s', false, (v) => {
      st.auto = v;
      if (v) autoLoop();
    });
    const modeSeg = segmented(
      [
        { value: 'rtu', label: 'RTU' },
        { value: 'ascii', label: 'ASCII' },
        { value: 'tcp', label: 'TCP/IP' },
      ],
      st.mode,
      (v) => setMode(v),
      { label: 'Variante de Modbus' }
    );
    const serialOnly = h('div', { class: 'btn-row', style: { gap: '18px' } }, h('div', { class: 'field', style: { width: '150px' } }, h('label', { for: 'lab-baud' }, 'Velocidad'), baudSel), noiseSw);

    /* ---------- Formulario ---------- */
    const unitSel = h('select', { id: 'lab-unit' });
    const fillUnits = () => {
      const prev = unitSel.value || '1';
      unitSel.replaceChildren();
      const opts =
        st.mode === 'tcp'
          ? [...plant.devices.map((d) => ({ value: d.id, label: `${d.ip} · ${d.name} (Unit ${d.id})` })), { value: 9, label: '192.168.1.19 · sin equipo' }]
          : [...plant.devices.map((d) => ({ value: d.id, label: `${d.id} · ${d.name}` })), { value: 0, label: '0 · Broadcast (todos)' }, { value: 9, label: '9 · Sin dispositivo' }];
      opts.forEach((o) => unitSel.append(h('option', { value: o.value }, o.label)));
      unitSel.value = opts.some((o) => String(o.value) === prev) ? prev : '1';
    };
    fillUnits();
    unitSel.addEventListener('change', preview);
    const form = MB.ui.requestForm({ id: 'lab', fcs: ALL_FCS, init: { fc: 4, addr: '0', qty: '5' } });
    form.onChange(preview);
    const previewHost = h('div');
    const sendBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => send() }, icon('send'), 'Enviar petición');
    const result = h('div', { class: 'result-box' }, h('div', { class: 'fig-note' }, 'Aquí aparecerá la respuesta decodificada.'));

    function currentADU() {
      const { pdu, error } = form.get();
      if (error) return { error };
      const unit = +unitSel.value;
      if (st.mode === 'tcp') return { pdu, unit, adu: MB.tcpADU(st.tid, unit, pdu) };
      if (st.mode === 'ascii') return { pdu, unit, adu: MB.asciiADU(unit, pdu) };
      return { pdu, unit, adu: MB.rtuADU(unit, pdu) };
    }
    function preview() {
      const c = currentADU();
      if (c.error) {
        previewHost.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), c.error));
        sendBtn.disabled = true;
        return;
      }
      sendBtn.disabled = st.busy;
      const wire = wireInfo(c.adu);
      previewHost.replaceChildren(
        h('div', { class: 'panel-title' }, icon('layers'), `Trama a enviar · ${wire.text}`),
        frameView(MB.describeADU(st.mode, c.adu, 'req'), { table: false, compact: true })
      );
    }
    function wireInfo(adu) {
      if (st.mode === 'tcp') return { ms: 0.05, text: `${adu.length} bytes · < 0,1 ms en la LAN` };
      const n = adu.length;
      const t = MB.serialTiming(st.baud, st.mode === 'ascii' ? 10 : 11);
      const ms = n * t.charMs;
      return { ms, text: `${n} ${st.mode === 'ascii' ? 'caracteres' : 'bytes'} · ${MB.fmtMs(ms)} a ${st.baud} bit/s` };
    }

    /* ---------- Memoria de los esclavos ---------- */
    const devSeg = h('div');
    const tableSeg = h('div');
    const devCtl = h('div', { class: 'btn-row', style: { gap: '18px' } });
    const memScroll = h('div', { class: 'mem-scroll' });
    let rows = [];
    function renderMem() {
      const dev = plant.byId(st.view.dev);
      const tables = Object.keys(MB.TABLES).filter((t) => dev.server.sizes[t] > 0);
      if (!tables.includes(st.view.table)) st.view.table = tables[0];
      devSeg.replaceChildren(
        segmented(
          plant.devices.map((d) => ({ value: d.id, label: `${d.id} · ${d.name}` })),
          st.view.dev,
          (v) => {
            st.view.dev = +v;
            renderMem();
          },
          { small: true, label: 'Esclavo' }
        )
      );
      tableSeg.replaceChildren(
        segmented(
          tables.map((t) => ({ value: t, label: MB.TABLES[t].es })),
          st.view.table,
          (v) => {
            st.view.table = v;
            renderMem();
          },
          { small: true, label: 'Tabla' }
        )
      );
      devCtl.replaceChildren(
        switchCtl(`lab-on-${dev.id}`, 'En línea', dev.online, (v) => {
          dev.online = v;
          bus.setOnline(dev.id, v);
        }),
        switchCtl(`lab-fault-${dev.id}`, 'Fallo interno (exc. 04)', dev.server.fault, (v) => (dev.server.fault = v)),
        h('span', { class: 'tag' }, `Funciones: ${[...dev.server.supports].map((f) => MB.hex2(f)).join(' ')}`)
      );
      const t = st.view.table;
      const isBit = MB.TABLES[t].bits === 1;
      const tbody = h('tbody');
      rows = [];
      for (let a = 0; a < dev.server.sizes[t]; a++) {
        const lab = dev.labels[t] && dev.labels[t][a];
        const prev = dev.labels[t] && dev.labels[t][a - 1];
        const name = lab ? lab.name : prev && prev.f32 ? `↳ ${prev.name} (palabra baja)` : 'Libre';
        const raw = h('td', { class: 'mono' });
        const val = h('td', { class: 'val' });
        const tr = h('tr', null, h('td', { class: 'mono' }, a), h('td', { class: 'mono' }, MB.classicAddress(t, a)), h('td', { class: `name${lab || (prev && prev.f32) ? '' : ' free'}` }, name), raw, val);
        tr._raw = raw;
        tr._val = val;
        rows.push(tr);
        tbody.append(tr);
      }
      memScroll.replaceChildren(
        h(
          'table',
          { class: 'mem-table' },
          h('thead', null, h('tr', null, h('th', null, 'Dir.'), h('th', null, 'Manual'), h('th', null, 'Significado'), h('th', null, isBit ? 'Bit' : 'Crudo'), h('th', null, 'Valor'))),
          tbody
        )
      );
      refreshMem();
    }
    function refreshMem() {
      const dev = plant.byId(st.view.dev);
      const t = st.view.table;
      const isBit = MB.TABLES[t].bits === 1;
      rows.forEach((tr, a) => {
        const v = dev.server[t][a];
        if (isBit) {
          tr._raw.replaceChildren(h('span', { class: `bitdot${v ? ' on' : ''}` }), String(v));
          tr._val.textContent = v ? 'ON' : 'OFF';
        } else {
          const txt = `0x${MB.hex4(v)}`;
          if (tr._raw.textContent !== txt) tr._raw.textContent = txt;
          const e = MB.sim.engValue(dev, t, a);
          if (tr._val.textContent !== e) tr._val.textContent = e;
        }
      });
    }
    function flashRows(devId, touched) {
      if (!touched || !touched.length) return;
      const last = touched[touched.length - 1];
      if (st.view.dev !== devId || st.view.table !== last.table) {
        st.view.dev = devId;
        st.view.table = last.table;
        renderMem();
      }
      touched.forEach((t) => {
        if (t.table !== st.view.table) return;
        for (let a = t.addr; a < t.addr + t.qty && a < rows.length; a++) {
          const tr = rows[a];
          tr.classList.remove('flash-r', 'flash-w');
          void tr.offsetWidth;
          tr.classList.add(t.write ? 'flash-w' : 'flash-r');
        }
      });
      const first = rows[touched[0].addr];
      if (first) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      refreshMem();
    }

    /* ---------- Registro de tráfico ---------- */
    const logEl = h('div', { class: 'log', role: 'log', 'aria-live': 'off' });
    function renderLog(fresh) {
      if (!st.log.length) {
        logEl.replaceChildren(h('div', { class: 'log-empty' }, 'El monitor de tráfico está vacío. Envía una petición para ver las tramas pasar. Pulsa una fila para abrirla en el analizador.'));
        return;
      }
      logEl.replaceChildren(
        ...st.log.map((e, i) => {
          const row = h(
            'div',
            {
              class: `log-row ${e.dir}${i === 0 && fresh ? ' new' : ''}`,
              title: e.text ? 'Abrir en el analizador de tramas' : '',
              onclick: () => {
                if (!e.text) return;
                MB.state.analyzerInput = { mode: e.mode, text: e.text };
                location.hash = '#analizador';
              },
            },
            h('span', { class: 't' }, `${(e.t / 1000).toFixed(3)} s`),
            h('span', { class: 'd' }, { tx: 'TX →', rx: '← RX', ex: '← EXC', to: '⌛ T/O', info: 'INFO' }[e.dir]),
            h('span', null, e.text ? h('span', { class: 'hex' }, e.text) : null, h('span', { class: 'sum' }, e.sum))
          );
          return row;
        })
      );
    }
    function log(dir, adu, sum) {
      // En ASCII, CR LF se muestra como \r\n para que se vea y se pueda volver a pegar
      const text = adu == null ? '' : typeof adu === 'string' ? adu.replace(/\r\n$/, '\\r\\n') : MB.toHex(adu);
      st.log.unshift({ t: performance.now() - st.t0, dir, text, mode: st.mode, sum });
      if (st.log.length > 80) st.log.pop();
      renderLog(true);
    }

    /* ---------- Retos ---------- */
    const chHost = h('div', { class: 'challenges' });
    const chCount = h('b');
    function renderChallenges() {
      const n = CHALLENGES.filter((c) => done[c.id]).length;
      chCount.textContent = `${n} de ${CHALLENGES.length}`;
      chHost.replaceChildren(
        ...CHALLENGES.map((c) =>
          h(
            'div',
            { class: `challenge${done[c.id] ? ' done' : ''}`, 'data-id': c.id },
            h('span', { class: 'ck' }, icon('check')),
            h('div', null, h('b', null, c.title), h('small', null, c.hint)),
            h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => applyPreset(c.preset) }, 'Rellenar')
          )
        )
      );
    }
    function checkChallenges(ev) {
      let fresh = 0;
      CHALLENGES.forEach((c) => {
        if (!done[c.id] && c.check(ev, plant)) {
          done[c.id] = true;
          fresh++;
          toast(`Reto conseguido: ${c.title}`, 'ok');
        }
      });
      if (fresh) {
        // Se suma a lo guardado, por si otro dispositivo consiguió retos mientras tanto
        Object.assign(done, store.get('challenges', {}), done);
        store.set('challenges', { ...done });
        renderChallenges();
        if (CHALLENGES.every((c) => done[c.id])) MB.ui.confetti();
      }
    }
    function applyPreset(p) {
      if (!p) return;
      if (p.mode && p.mode !== st.mode) setMode(p.mode);
      if (p.unit != null) unitSel.value = String(p.unit);
      if (p.form) form.set(p.form);
      preview();
      sendBtn.focus({ preventScroll: true });
      sendBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /* ---------- Resultado ---------- */
    function showResult({ unit, reqPdu, respAdu, respPdu, exception, timeout, reason, broadcast, rtt }) {
      const parts = [];
      if (timeout) {
        parts.push(h('div', { class: 'callout warn', style: { margin: 0 } }, h('span', { class: 'callout-tag' }, icon('clock'), 'Sin respuesta'), reason));
      } else if (broadcast) {
        parts.push(h('div', { class: 'callout info', style: { margin: 0 } }, h('span', { class: 'callout-tag' }, icon('bolt'), 'Broadcast enviado'), reason));
      } else if (exception) {
        const e = MB.EXCEPTIONS[exception];
        parts.push(
          h('div', { class: 'sumline' }, icon('alert'), h('span', null, MB.summarize(unit, respPdu, 'resp'))),
          h('div', { class: 'callout warn', style: { margin: 0 } }, h('span', { class: 'callout-tag' }, `Excepción 0x${MB.hex2(exception)} · ${e ? e.name : ''}`), e ? e.cause : '', e ? h('span', null, h('b', null, 'Solución: '), e.fix) : null)
        );
      } else {
        const dev = plant.byId(unit);
        const fc = respPdu[0];
        parts.push(h('div', { class: 'sumline' }, icon('check'), h('span', null, MB.summarize(unit, respPdu, 'resp'))));
        const readings = [];
        if (fc === 0x01 || fc === 0x02) {
          const table = fc === 1 ? 'coils' : 'discrete';
          const a = MB.rd16(reqPdu, 1), q = MB.rd16(reqPdu, 3);
          const bits = MB.unpackBits(respPdu.slice(2), q);
          bits.slice(0, 24).forEach((b, k) => {
            const lab = dev.labels[table] && dev.labels[table][a + k];
            readings.push(h('div', { class: 'reading' }, h('small', null, lab ? lab.name : `${MB.classicAddress(table, a + k)} · libre`), h('b', null, h('span', { class: `bitdot${b ? ' on' : ''}` }), b ? 'ON' : 'OFF')));
          });
        } else if (fc === 0x03 || fc === 0x04 || fc === 0x17) {
          const table = fc === 4 ? 'input' : 'holding';
          const a = MB.rd16(reqPdu, 1);
          const vals = [];
          for (let k = 2; k + 1 < respPdu.length; k += 2) vals.push(MB.rd16(respPdu, k));
          vals.slice(0, 24).forEach((v, k) => {
            const e = engFrom(dev, table, a + k, vals, k);
            if (e) readings.push(h('div', { class: 'reading' }, h('small', { title: e.name }, e.name), h('b', null, e.val)));
          });
        } else if (fc === 0x2b) {
          const res = MB.describeADU('rtu', MB.rtuADU(unit, respPdu), 'resp');
          res.fields.filter((f) => f.short === 'Texto').forEach((f, k) => readings.push(h('div', { class: 'reading' }, h('small', null, ['Fabricante', 'Modelo', 'Versión'][k] || 'Objeto'), h('b', { style: { fontSize: '.95rem' } }, f.value))));
        }
        if (readings.length) parts.push(h('div', { class: 'readings' }, readings));
      }
      if (respAdu) parts.push(h('div', { style: { marginTop: '14px' } }, frameView(MB.describeADU(st.mode, respAdu, 'resp'), { table: false, compact: true, animate: true })));
      if (rtt) parts.push(h('div', { class: 'stat-line', style: { marginTop: '12px' } }, h('span', null, h('small', null, 'Ida y vuelta estimada'), h('b', null, MB.fmtMs(rtt)))));
      result.replaceChildren(...parts);
    }

    /* ---------- Transacción ---------- */
    function corrupt(adu) {
      if (typeof adu === 'string') {
        const chars = adu.split('');
        const i = 3 + Math.floor(Math.random() * Math.max(1, chars.length - 7));
        const hex = '0123456789ABCDEF';
        chars[i] = hex[(hex.indexOf(chars[i]) + 1 + Math.floor(Math.random() * 14)) % 16];
        return chars.join('');
      }
      const out = adu.slice();
      const i = 1 + Math.floor(Math.random() * (out.length - 1));
      out[i] ^= 1 << Math.floor(Math.random() * 8);
      return out;
    }
    function integrityOk(adu) {
      if (st.mode === 'tcp') return true;
      const res = MB.describeADU(st.mode, adu);
      return !res.error && res.checks.every((c) => c.ok || c.label.startsWith('Inicio') || c.label.startsWith('Final'));
    }

    async function send() {
      if (st.busy) return;
      const c = currentADU();
      if (c.error) return;
      st.busy = true;
      sendBtn.disabled = true;
      const { unit, pdu } = c;
      let adu = c.adu;
      const serial = st.mode !== 'tcp';
      const noisy = serial && st.noise;
      if (noisy) adu = corrupt(adu);
      const reqWire = wireInfo(adu);
      const hexOf = (a) => (typeof a === 'string' ? a.trim() : MB.toHex(a));
      log('tx', adu, `${MB.summarize(unit, pdu, 'req')}${noisy ? ' (con ruido)' : ''} · ${reqWire.text}`);
      const dev = plant.byId(unit);
      const ev = { mode: st.mode, unit, req: pdu, ok: false, exception: 0, timeout: false, broadcast: false };
      const dur = 1000;
      try {
        if (serial && unit === 0) {
          await bus.send({ to: 'all', text: hexOf(adu), kind: 'req', duration: dur });
          const isWrite = WRITE_FCS.has(pdu[0]) && pdu[0] !== 0x17;
          if (!noisy && isWrite) {
            plant.devices.forEach((d) => {
              if (!d.online) return;
              const r = d.server.process(pdu);
              if (!r.exception && d.id === st.view.dev) flashRows(d.id, r.touched);
            });
          }
          ev.broadcast = true;
          ev.ok = !noisy;
          const reason = isWrite
            ? 'Todos los esclavos en línea ejecutan la escritura y ninguno responde. El maestro espera el retardo de cambio antes de la siguiente petición.'
            : 'Los esclavos no responden a un broadcast, así que una lectura por broadcast no sirve para nada. Usa broadcast solo para escribir.';
          log('info', null, 'Broadcast: no se espera respuesta');
          await bus.wait(600, 'Retardo de broadcast');
          showResult({ unit, reqPdu: pdu, broadcast: true, reason });
        } else if (!dev || !dev.online) {
          await bus.send({ to: dev ? dev.id : 'none', text: hexOf(adu), kind: 'req', duration: dur });
          await bus.wait(1300);
          bus.badge('master', 'TIMEOUT', 'err', 1800);
          bus.flash('master', 'err');
          const reason =
            st.mode === 'tcp'
              ? dev
                ? `${dev.ip} no contesta: el equipo está apagado o desconectado de la red.`
                : 'No hay ningún equipo en esa IP: la conexión TCP no llega a establecerse.'
              : dev
                ? `El esclavo ${unit} está apagado o desconectado: nadie contesta.`
                : `No hay ningún esclavo con la dirección ${unit}. La trama recorre el bus y nadie la reconoce como suya.`;
          ev.timeout = true;
          log('to', null, `Timeout: ${reason}`);
          showResult({ unit, timeout: true, reason });
        } else {
          await bus.send({ to: unit, text: hexOf(adu), kind: 'req', duration: dur });
          if (!integrityOk(adu)) {
            bus.flash(unit, 'err');
            bus.badge(unit, st.mode === 'ascii' ? 'LRC ✗ descartada' : 'CRC ✗ descartada', 'err', 1800);
            await bus.wait(1300);
            bus.badge('master', 'TIMEOUT', 'err', 1600);
            const reason = `El ruido cambió un bit. El esclavo ${unit} recalculó el ${st.mode === 'ascii' ? 'LRC' : 'CRC'}, no coincidía, y descartó la trama sin responder.`;
            ev.timeout = true;
            log('to', null, `Timeout: el esclavo ${unit} descartó una trama corrupta`);
            showResult({ unit, timeout: true, reason });
          } else {
            const r = dev.server.process(pdu);
            bus.badge(unit, r.exception ? `Excepción ${MB.hex2(r.exception)}` : 'Procesando…', r.exception ? 'err' : 'info', 900);
            if (!r.exception) flashRows(unit, r.touched);
            await sleep(280);
            const respAdu = st.mode === 'tcp' ? MB.tcpADU(st.tid, unit, r.pdu) : st.mode === 'ascii' ? MB.asciiADU(unit, r.pdu) : MB.rtuADU(unit, r.pdu);
            const respWire = wireInfo(respAdu);
            await bus.send({ from: unit, to: 'master', text: hexOf(respAdu), kind: r.exception ? 'err' : 'resp', duration: dur });
            bus.flash('master', r.exception ? 'err' : 'ok');
            log(r.exception ? 'ex' : 'rx', respAdu, `${MB.summarize(unit, r.pdu, 'resp')} · ${respWire.text}`);
            ev.ok = !r.exception;
            ev.exception = r.exception;
            ev.resp = r.pdu;
            showResult({ unit, reqPdu: pdu, respPdu: r.pdu, respAdu, exception: r.exception, rtt: reqWire.ms + 2 + respWire.ms });
          }
        }
      } finally {
        if (st.mode === 'tcp') st.tid = (st.tid + 1) & 0xffff;
        st.busy = false;
        preview();
      }
      checkChallenges(ev);
    }

    async function autoLoop() {
      while (st.auto && body.isConnected) {
        if (!st.busy) await send();
        await sleep(1500);
      }
    }

    function setMode(m) {
      st.mode = m;
      modeSeg.setValue(m);
      serialOnly.hidden = m === 'tcp';
      bus.setMode(m === 'tcp' ? 'tcp' : 'rtu', busTag());
      fillUnits();
      preview();
    }

    /* ---------- Montaje ---------- */
    body.append(
      h('div', { class: 'lab-top' }, h('div', { class: 'field' }, h('label', null, 'Variante'), modeSeg), serialOnly, autoSw),
      h('div', { class: 'lab-bus' }, busEl),
      h(
        'div',
        { class: 'lab-grid' },
        h(
          'div',
          { style: { display: 'grid', gap: '18px', minWidth: 0 } },
          h(
            'div',
            { class: 'panel' },
            h('div', { class: 'panel-title' }, icon('send'), 'Petición del maestro'),
            h('div', { style: { display: 'grid', gap: '14px' } }, MB.ui.field('Destino', unitSel), form.el, previewHost, h('div', { class: 'btn-row' }, sendBtn))
          ),
          h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('check'), 'Última respuesta'), result)
        ),
        h(
          'div',
          { class: 'panel', style: { display: 'grid', gap: '12px' } },
          h('div', { class: 'panel-title', style: { margin: 0 } }, icon('table'), 'Memoria de los esclavos'),
          devSeg,
          devCtl,
          tableSeg,
          memScroll,
          h('p', { class: 'fig-note' }, 'Azul: celdas leídas. Ámbar: celdas escritas. Los valores cambian solos: la planta está funcionando.')
        )
      ),
      h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('wave'), 'Monitor de tráfico'), logEl),
      h('div', { class: 'panel' }, h('div', { class: 'panel-title', style: { justifyContent: 'space-between' } }, h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } }, icon('target'), 'Retos del laboratorio'), chCount), chHost)
    );
    bus.setTag(busTag());
    renderMem();
    renderLog();
    renderChallenges();
    preview();
    if (MB.state.labPreset) {
      applyPreset(MB.state.labPreset);
      MB.state.labPreset = null;
    }

    let alive = true;
    const timer = setInterval(() => {
      if (!alive || !body.isConnected) return clearInterval(timer);
      plant.tick(0.25);
      refreshMem();
    }, 250);
    // Retos conseguidos en otro dispositivo
    const onSync = () => {
      const remote = store.get('challenges', {});
      Object.keys(done).forEach((k) => delete done[k]);
      Object.assign(done, remote);
      renderChallenges();
    };
    document.addEventListener('mb:sync', onSync);
    return () => {
      alive = false;
      st.auto = false;
      clearInterval(timer);
      document.removeEventListener('mb:sync', onSync);
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
