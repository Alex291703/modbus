/*!
 * Academia Modbus — widgets de tramas: RTU, CRC, ASCII y TCP.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const { h, icon, frameView, segmented, select, switchCtl, copyText, esc, sleep } = MB.ui;
  const W = MB.widgets;

  /* ------------------------------------------------------------------
   * Servidor de demostración con datos reconocibles
   * ------------------------------------------------------------------ */
  let demo = null;
  function demoServer() {
    if (demo) return demo;
    demo = new MB.Server({ sizes: { coils: 2000, discrete: 2000, input: 1000, holding: 1000 } });
    for (let k = 0; k < 1000; k++) {
      demo.holding[k] = (k * 37 + 100) & 0xffff;
      demo.input[k] = (k * 11 + 230) & 0xffff;
    }
    for (let k = 0; k < 2000; k++) {
      demo.coils[k] = (k * 7) % 3 === 0 ? 1 : 0;
      demo.discrete[k] = k % 4 === 1 ? 1 : 0;
    }
    demo.holding[0] = 235;
    demo.holding[1] = 500;
    return demo;
  }
  /** Ejecuta la PDU en una copia para no alterar el servidor de ejemplo. */
  function demoResponse(pdu) {
    const s = demoServer();
    const snap = { c: s.coils.slice(), h: s.holding.slice() };
    const r = s.process(pdu);
    s.coils.set(snap.c);
    s.holding.set(snap.h);
    return r;
  }
  MB.demoResponse = demoResponse;

  /* ------------------------------------------------------------------
   * Formulario de petición reutilizable
   * ------------------------------------------------------------------ */
  function parseNum(str, { min = 0, max = 0xffff, signed16 = false } = {}) {
    const s = String(str).trim();
    let v;
    if (/^0x[0-9a-f]+$/i.test(s)) v = parseInt(s, 16);
    else if (/^-?\d+$/.test(s)) v = parseInt(s, 10);
    else throw new Error(`«${s || ' '}» no es un número (usa decimal o 0x hexadecimal)`);
    if (signed16 && v < 0 && v >= -32768) v &= 0xffff;
    if (v < min || v > max) throw new Error(`${s} está fuera del rango ${min}–${max}`);
    return v;
  }
  const parseList = (str, opts) =>
    String(str)
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((t) => parseNum(t, opts));

  const FC_LABEL = (fc) => `${MB.hex2(fc)} · ${MB.FUNCTIONS[fc].es}`;

  /**
   * Crea un formulario de petición. opts.fcs: funciones ofrecidas.
   * Devuelve { el, get() → { pdu, error }, set(state), onChange }.
   */
  function requestForm(opts = {}) {
    const fcs = opts.fcs || [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0f, 0x10];
    const uid = opts.id || `rf${Math.random().toString(36).slice(2, 7)}`;
    const st = Object.assign(
      { fc: 0x03, addr: '0', qty: '2', on: 'ff00', value: '4500', bits: '1 0 1 1', values: '4500, 50', andMask: '0x00F2', orMask: '0x0025', raddr: '0', rqty: '2', waddr: '1', wvalues: '4500', data: '0xA537', objId: '0', code: '1' },
      opts.init || {}
    );
    const listeners = [];
    const fcSel = select(`${uid}-fc`, fcs.map((f) => ({ value: f, label: FC_LABEL(f) })), st.fc);
    const params = h('div', { class: 'form-grid' });
    const el = h('div', { class: 'rf' }, h('div', { class: 'form-grid' }, h('div', { class: 'field', style: { gridColumn: '1 / -1' } }, h('label', { for: fcSel.id }, 'Código de función'), fcSel)), params);
    el.style.display = 'grid';
    el.style.gap = '14px';

    const inp = (key, label, hint, type = 'text') => {
      const i = h('input', { type, id: `${uid}-${key}`, value: st[key], autocomplete: 'off', spellcheck: 'false' });
      i.addEventListener('input', () => {
        st[key] = i.value;
        emit();
      });
      return MB.ui.field(label, i, hint);
    };
    const sel = (key, label, options) => {
      const s = select(`${uid}-${key}`, options, st[key]);
      s.addEventListener('change', () => {
        st[key] = s.value;
        emit();
      });
      return MB.ui.field(label, s);
    };

    function renderParams() {
      const fc = +st.fc;
      const f = [];
      switch (fc) {
        case 0x01:
        case 0x02:
          f.push(inp('addr', 'Dirección inicial', '0–65535'), inp('qty', 'Cantidad', 'Máx. 2000'));
          break;
        case 0x03:
        case 0x04:
          f.push(inp('addr', 'Dirección inicial', '0–65535'), inp('qty', 'Cantidad', 'Máx. 125'));
          break;
        case 0x05:
          f.push(
            inp('addr', 'Dirección de la bobina', '0–65535'),
            sel('on', 'Estado', [
              { value: 'ff00', label: 'ON · 0xFF00' },
              { value: '0000', label: 'OFF · 0x0000' },
              { value: '1234', label: 'No válido · 0x1234' },
            ])
          );
          break;
        case 0x06:
          f.push(inp('addr', 'Dirección del registro', '0–65535'), inp('value', 'Valor', '−32768…65535 o 0x…'));
          break;
        case 0x0f:
          f.push(inp('addr', 'Dirección inicial', '0–65535'), inp('bits', 'Estados (0/1)', 'Separados por espacios'));
          break;
        case 0x10:
          f.push(inp('addr', 'Dirección inicial', '0–65535'), inp('values', 'Valores', 'Separados por comas'));
          break;
        case 0x16:
          f.push(inp('addr', 'Dirección del registro', '0–65535'), inp('andMask', 'Máscara AND', '16 bits'), inp('orMask', 'Máscara OR', '16 bits'));
          break;
        case 0x17:
          f.push(inp('raddr', 'Leer desde', '0–65535'), inp('rqty', 'Cantidad a leer', 'Máx. 125'), inp('waddr', 'Escribir en', '0–65535'), inp('wvalues', 'Valores a escribir', 'Separados por comas'));
          break;
        case 0x08:
          f.push(inp('data', 'Datos de prueba', 'Subfunción 00: eco'));
          break;
        case 0x2b:
          f.push(
            sel('code', 'Código de lectura', [
              { value: '1', label: '01 · Básica (flujo)' },
              { value: '4', label: '04 · Un objeto' },
            ]),
            sel('objId', 'Objeto', [
              { value: '0', label: '00 · Fabricante' },
              { value: '1', label: '01 · Modelo' },
              { value: '2', label: '02 · Versión' },
            ])
          );
          break;
        default:
          break;
      }
      params.replaceChildren(...f);
    }

    function get() {
      const fc = +st.fc;
      try {
        const a = () => parseNum(st.addr);
        let pdu;
        switch (fc) {
          case 0x01:
          case 0x02:
          case 0x03:
          case 0x04:
            pdu = [fc, ...MB.u16(a()), ...MB.u16(parseNum(st.qty))];
            break;
          case 0x05:
            pdu = [0x05, ...MB.u16(a()), ...MB.u16(parseInt(st.on, 16))];
            break;
          case 0x06:
            pdu = MB.Req.writeRegister(a(), parseNum(st.value, { min: 0, signed16: true }));
            break;
          case 0x0f: {
            const bits = parseList(st.bits, { max: 1 });
            if (!bits.length) throw new Error('Escribe al menos un estado (0 o 1)');
            pdu = MB.Req.writeCoils(a(), bits);
            break;
          }
          case 0x10: {
            const vals = parseList(st.values, { signed16: true });
            if (!vals.length) throw new Error('Escribe al menos un valor');
            pdu = MB.Req.writeRegisters(a(), vals);
            break;
          }
          case 0x16:
            pdu = MB.Req.maskWrite(a(), parseNum(st.andMask), parseNum(st.orMask));
            break;
          case 0x17: {
            const vals = parseList(st.wvalues, { signed16: true });
            if (!vals.length) throw new Error('Escribe al menos un valor a escribir');
            pdu = MB.Req.readWrite(parseNum(st.raddr), parseNum(st.rqty), parseNum(st.waddr), vals);
            break;
          }
          case 0x08:
            pdu = MB.Req.diagnostics(0, parseNum(st.data));
            break;
          case 0x2b:
            pdu = MB.Req.readDeviceId(+st.code, +st.objId);
            break;
          default:
            pdu = [fc];
        }
        return { pdu, error: null, state: { ...st } };
      } catch (e) {
        return { pdu: null, error: e.message, state: { ...st } };
      }
    }
    function emit() {
      const r = get();
      listeners.forEach((fn) => fn(r));
    }
    fcSel.addEventListener('change', () => {
      st.fc = +fcSel.value;
      renderParams();
      emit();
    });
    renderParams();
    return {
      el,
      get,
      onChange: (fn) => listeners.push(fn),
      set(patch) {
        Object.assign(st, patch);
        fcSel.value = String(st.fc);
        renderParams();
        emit();
      },
    };
  }
  MB.ui.requestForm = requestForm;
  MB.ui.parseNum = parseNum;

  /* ------------------------------------------------------------------
   * Constructor de tramas RTU
   * ------------------------------------------------------------------ */
  W.rtuBuilder = function (body) {
    const unit = h('input', { type: 'text', id: 'rtu-unit', value: '17', autocomplete: 'off' });
    const form = requestForm({ id: 'rtu', init: { fc: 3, addr: '107', qty: '3' } });
    const reqHost = h('div');
    const respHost = h('div');
    const stats = h('div', { class: 'stat-line' });
    const draw = () => {
      let u;
      try {
        u = parseNum(unit.value, { max: 255 });
        unit.classList.remove('invalid');
      } catch (e) {
        unit.classList.add('invalid');
        reqHost.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), 'La dirección de esclavo va de 0 a 247 (0 = broadcast).'));
        respHost.replaceChildren();
        return;
      }
      const { pdu, error } = form.get();
      if (error) {
        reqHost.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), error));
        respHost.replaceChildren();
        stats.replaceChildren();
        return;
      }
      const adu = MB.rtuADU(u, pdu);
      reqHost.replaceChildren(h('div', { class: 'panel-title' }, icon('send'), 'Petición del maestro'), frameView(MB.describeADU('rtu', adu, 'req'), { animate: true }));
      const t = MB.serialTiming(19200);
      const cells = [
        h('span', null, h('small', null, 'Longitud'), h('b', null, `${adu.length} bytes`)),
        h('span', null, h('small', null, 'En la línea a 19200 8E1'), h('b', null, MB.fmtMs(adu.length * t.charMs))),
        h('span', null, h('small', null, 'CRC'), h('b', null, `0x${MB.hex4(MB.crc16(adu.slice(0, -2)))}`)),
      ];
      stats.replaceChildren(...cells);
      if (u === 0) {
        respHost.replaceChildren(h('div', { class: 'callout info' }, h('span', { class: 'callout-tag' }, icon('bolt'), 'Broadcast'), 'Con dirección 0 ningún esclavo responde. Solo tiene sentido con funciones de escritura.'));
        return;
      }
      const r = demoResponse(pdu);
      const radu = MB.rtuADU(u, r.pdu);
      respHost.replaceChildren(
        h('div', { class: 'panel-title' }, icon(r.exception ? 'alert' : 'check'), r.exception ? 'Respuesta de excepción' : 'Respuesta del esclavo'),
        frameView(MB.describeADU('rtu', radu, 'resp'), { table: false, compact: true })
      );
    };
    unit.addEventListener('input', draw);
    form.onChange(draw);
    body.append(
      h('div', { class: 'split' }, h('div', null, MB.ui.field('Dirección de esclavo', unit, '1–247 · 0 = broadcast')), h('div')),
      form.el,
      reqHost,
      stats,
      respHost
    );
    draw();
  };

  /* ------------------------------------------------------------------
   * Tiempos en la línea: t1,5 y t3,5
   * ------------------------------------------------------------------ */
  W.rtuTiming = function (body) {
    const st = { baud: 19200, gap: false };
    const baudSel = select('tim-baud', [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => ({ value: b, label: `${b} bit/s` })), st.baud);
    const stats = h('div', { class: 'stat-line' });
    const lane = h('div', { class: 'timing-lane' });
    const note = h('div');
    const frame = MB.rtuADU(1, MB.Req.readHolding(0, 2));
    const draw = () => {
      const t = MB.serialTiming(st.baud);
      stats.replaceChildren(
        h('span', null, h('small', null, 'Carácter (11 bits)'), h('b', null, MB.fmtMs(t.charMs))),
        h('span', null, h('small', null, 't1,5'), h('b', null, MB.fmtMs(t.t15))),
        h('span', null, h('small', null, 't3,5'), h('b', null, MB.fmtMs(t.t35))),
        h('span', null, h('small', null, 'Trama de 8 bytes'), h('b', null, MB.fmtMs(8 * t.charMs))),
        t.fixed ? h('span', { class: 'tag rw' }, 'Valores fijos por encima de 19200') : null
      );
      const seg = [];
      const unit = t.charMs;
      const push = (kind, ms, label) => seg.push({ kind, ms, label });
      push('idle', t.t35, 'silencio ≥ 3,5 car.');
      frame.forEach((b, i) => {
        push(i >= 6 ? 'crc' : i === 0 ? 'addr' : i === 1 ? 'fc' : 'data', unit, MB.hex2(b));
        if (st.gap && i === 3) push('gap', unit * 2, 'pausa de 2 car.');
      });
      push('idle', t.t35, 'silencio ≥ 3,5 car.');
      const total = seg.reduce((a, s) => a + s.ms, 0);
      lane.replaceChildren(
        ...seg.map((s) =>
          h(
            'div',
            { class: `tl-seg tl-${s.kind}`, style: { flexGrow: String(s.ms / total) }, title: `${s.label} · ${MB.fmtMs(s.ms)}` },
            h('span', null, s.label)
          )
        )
      );
      note.replaceChildren(
        st.gap
          ? h(
              'div',
              { class: 'callout warn' },
              h('span', { class: 'callout-tag' }, icon('alert'), 'Trama descartada'),
              `La pausa entre el 4.º y el 5.º byte dura ${MB.fmtMs(2 * unit)}, más que t1,5 (${MB.fmtMs(t.t15)}). El receptor da la trama por incompleta y la descarta: el maestro verá un timeout.`
            )
          : h(
              'div',
              { class: 'callout ok' },
              h('span', { class: 'callout-tag' }, icon('check'), 'Trama válida'),
              `Los 8 bytes salen seguidos y la trama queda rodeada por silencios de al menos ${MB.fmtMs(t.t35)}. Así sabe el receptor dónde empieza y dónde acaba.`
            )
      );
    };
    baudSel.addEventListener('change', () => {
      st.baud = +baudSel.value;
      draw();
    });
    body.append(
      h('div', { class: 'toolbar' }, h('div', { class: 'field', style: { width: '170px' } }, h('label', { for: 'tim-baud' }, 'Velocidad'), baudSel), switchCtl('tim-gap', 'Meter una pausa dentro de la trama', false, (v) => ((st.gap = v), draw()))),
      h('div', { class: 'frame-scroll' }, lane),
      stats,
      note
    );
    draw();
  };

  /* ------------------------------------------------------------------
   * CRC-16 paso a paso
   * ------------------------------------------------------------------ */
  W.crcStepper = function (body) {
    const input = h('input', { type: 'text', id: 'crc-in', value: '01 03 00 00 00 02', autocomplete: 'off', spellcheck: 'false' });
    const bytesRow = h('div', { class: 'crc-bytes' });
    const reg = h('div', { class: 'reg16' });
    const regLegend = h('div', { class: 'reg-legend' }, Array.from({ length: 16 }, (_, k) => h('span', null, 15 - k)));
    const op = h('div', { class: 'op-line' });
    const progress = h('div', { class: 'stat-line' });
    const result = h('div');
    const cells = Array.from({ length: 16 }, () => h('span', null, '1'));
    reg.append(...cells);
    let bytes = [];
    let steps = [];
    let p = 0;
    let playing = false;
    let speed = 260;

    const playBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, icon('play'), 'Reproducir');
    const setPlaying = (v) => {
      playing = v;
      playBtn.replaceChildren(icon(v ? 'pause' : 'play'), v ? 'Pausa' : 'Reproducir');
    };

    function load() {
      try {
        bytes = MB.parseHex(input.value);
        if (!bytes.length) throw new Error('Escribe al menos un byte');
        input.classList.remove('invalid');
      } catch (e) {
        input.classList.add('invalid');
        op.textContent = e.message;
        return;
      }
      steps = MB.crc16Trace(bytes);
      p = 0;
      bytesRow.replaceChildren(...bytes.map((b) => h('span', null, MB.hex2(b))));
      render();
    }

    function render() {
      const s = steps[p];
      if (!s) return;
      const prev = s.before != null ? s.before : s.crc;
      cells.forEach((c, k) => {
        const bit = 15 - k;
        const v = (s.crc >> bit) & 1;
        c.textContent = v;
        c.classList.toggle('one', !!v);
        c.classList.toggle('chg', ((prev >> bit) & 1) !== v && s.type !== 'init');
        c.classList.toggle('lsb', bit === 0 && s.type !== 'done');
      });
      Array.from(bytesRow.children).forEach((el, i) => {
        el.classList.toggle('cur', i === s.byteIndex);
        el.classList.toggle('done', i < s.byteIndex);
      });
      const hx = (v) => `0x${MB.hex4(v)}`;
      const m = (t) => h('span', { class: 'muted' }, t);
      switch (s.type) {
        case 'init':
          op.replaceChildren('Se carga el registro con ', h('b', null, '0xFFFF'), m(' · todos los bits a 1.'));
          break;
        case 'xor-byte':
          op.replaceChildren(`Byte ${s.byteIndex + 1}: XOR con 0x${MB.hex2(s.byte)} → ${hx(s.before)} ⊕ 0x00${MB.hex2(s.byte)} = `, h('b', null, hx(s.crc)));
          break;
        case 'shift':
          op.replaceChildren(`Desplazamiento ${s.bit + 1}/8 a la derecha. Sale un `, h('b', null, String(s.lsb)), ` → ${hx(s.before)} » 1 = `, h('b', null, hx(s.crc)), m(s.lsb ? ' · salió 1: toca XOR' : ' · salió 0: nada más'));
          break;
        case 'xor-poly':
          op.replaceChildren(`XOR con el polinomio 0xA001 → ${hx(s.before)} ⊕ 0xA001 = `, h('b', null, hx(s.crc)));
          break;
        case 'done':
          op.replaceChildren('CRC final ', h('b', null, hx(s.crc)), ` → se envía ${MB.hex2(s.crc)} ${MB.hex2(s.crc >> 8)}: primero el byte bajo, después el alto.`);
          break;
        default:
          break;
      }
      progress.replaceChildren(
        h('span', null, h('small', null, 'Paso'), h('b', null, `${p + 1} / ${steps.length}`)),
        h('span', null, h('small', null, 'Registro'), h('b', null, hx(s.crc))),
        h('span', null, h('small', null, 'Byte'), h('b', null, s.byteIndex >= 0 && s.byteIndex < bytes.length ? `${s.byteIndex + 1} de ${bytes.length}` : '—'))
      );
      if (s.type === 'done') {
        const adu = [...bytes, s.crc & 0xff, s.crc >> 8];
        const res = MB.describeADU('rtu', adu);
        result.replaceChildren(
          h('div', { class: 'panel-title' }, icon('check'), 'Trama completa con su CRC'),
          frameView(res.error ? { cells: adu.map(MB.hex2), fields: [{ start: 0, len: adu.length - 2, kind: 'data', label: 'Datos', short: 'Datos' }, { start: adu.length - 2, len: 2, kind: 'crc', label: 'CRC', short: 'CRC' }] } : res, { table: false, compact: true, animate: true })
        );
      } else result.replaceChildren();
    }

    const step = () => {
      if (p < steps.length - 1) {
        p++;
        render();
      } else setPlaying(false);
    };
    const nextByte = () => {
      const cur = steps[p].byteIndex;
      while (p < steps.length - 1 && steps[p].byteIndex <= cur) p++;
      render();
    };
    playBtn.addEventListener('click', async () => {
      if (playing) return setPlaying(false);
      if (p >= steps.length - 1) p = 0;
      setPlaying(true);
      while (playing && body.isConnected) {
        step();
        await sleep(speed);
      }
    });
    input.addEventListener('input', () => {
      setPlaying(false);
      load();
    });

    body.append(
      h(
        'div',
        { class: 'toolbar' },
        h('div', { class: 'field grow' }, h('label', { for: 'crc-in' }, 'Bytes de la trama (sin CRC)'), input),
        h('div', { class: 'field' }, h('label', null, 'Velocidad'), segmented(
          [
            { value: 600, label: 'Lenta' },
            { value: 260, label: 'Normal' },
            { value: 60, label: 'Rápida' },
          ],
          260,
          (v) => (speed = +v),
          { small: true }
        ))
      ),
      h(
        'div',
        { class: 'btn-row' },
        playBtn,
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => (setPlaying(false), step()) }, icon('step'), 'Un paso'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => (setPlaying(false), nextByte()) }, 'Siguiente byte'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => (setPlaying(false), (p = steps.length - 1), render()) }, 'Ir al resultado'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => (setPlaying(false), (p = 0), render()) }, icon('reset'), 'Reiniciar')
      ),
      bytesRow,
      h('div', null, h('div', { class: 'panel-title' }, icon('chip'), 'Registro CRC de 16 bits'), reg, regLegend),
      op,
      progress,
      result
    );
    load();
    return () => setPlaying(false);
  };

  /* ------------------------------------------------------------------
   * Código de ejemplo con resaltado mínimo
   * ------------------------------------------------------------------ */
  function highlight(code) {
    const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*")|\b(0x[0-9A-Fa-f]+|\d+)\b|\b(uint16_t|uint8_t|size_t|const|for|int|if|else|return|def|in|range|function|let|of|bytes|while)\b/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  const CRC_CODE = {
    C: `uint16_t crc16_modbus(const uint8_t *buf, size_t len)
{
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; i++) {
        crc ^= buf[i];
        for (int b = 0; b < 8; b++) {
            if (crc & 1) crc = (crc >> 1) ^ 0xA001;
            else         crc >>= 1;
        }
    }
    return crc;  /* enviar: crc & 0xFF, después crc >> 8 */
}`,
    Python: `def crc16_modbus(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc

trama = bytes([0x01, 0x03, 0x00, 0x00, 0x00, 0x02])
trama += crc16_modbus(trama).to_bytes(2, "little")  # ... C4 0B`,
    JavaScript: `function crc16Modbus(bytes) {
  let crc = 0xFFFF;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
    }
  }
  return crc; // bytes a enviar: [crc & 0xFF, crc >> 8]
}`,
  };

  W.crcCode = function (body) {
    const pre = h('pre', { class: 'code' });
    const show = (lang) => (pre.innerHTML = highlight(CRC_CODE[lang]));
    let cur = 'C';
    body.append(
      h(
        'div',
        { class: 'toolbar', style: { justifyContent: 'space-between' } },
        segmented(Object.keys(CRC_CODE).map((k) => ({ value: k, label: k })), 'C', (v) => show((cur = v)), { small: true }),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => copyText(CRC_CODE[cur], e.currentTarget) }, icon('copy'), 'Copiar')
      ),
      h('div', { class: 'code-wrap', 'data-copy-root': '' }, pre)
    );
    show('C');
  };

  /* ------------------------------------------------------------------
   * RTU → ASCII y cálculo del LRC
   * ------------------------------------------------------------------ */
  W.asciiConverter = function (body) {
    const unit = h('input', { type: 'text', id: 'asc-unit', value: '1', autocomplete: 'off' });
    const form = requestForm({ id: 'asc', init: { fc: 3, addr: '0', qty: '2' } });
    const out = h('div');
    const draw = () => {
      let u;
      try {
        u = parseNum(unit.value, { max: 255 });
        unit.classList.remove('invalid');
      } catch (e) {
        unit.classList.add('invalid');
        return;
      }
      const { pdu, error } = form.get();
      if (error) {
        out.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), error));
        return;
      }
      const body8 = [u, ...pdu];
      const sum = body8.reduce((a, b) => a + b, 0);
      const l = MB.lrc(body8);
      const str = MB.asciiADU(u, pdu);
      const wire = Array.from(str, (c) => c.charCodeAt(0));
      const rtu = MB.rtuADU(u, pdu);
      const tR = MB.serialTiming(9600, 11);
      const tA = MB.serialTiming(9600, 10);
      out.replaceChildren(
        frameView(MB.describeADU('ascii', str), { animate: true }),
        h(
          'div',
          { class: 'split' },
          h(
            'div',
            { class: 'panel' },
            h('div', { class: 'panel-title' }, icon('chip'), 'Cálculo del LRC'),
            h(
              'div',
              { class: 'op-line' },
              `Suma: ${body8.map(MB.hex2).join(' + ')} = 0x${sum.toString(16).toUpperCase()}`,
              h('br'),
              `Nos quedamos con el byte bajo: 0x${MB.hex2(sum)}`,
              h('br'),
              `Complemento a dos: 0x100 − 0x${MB.hex2(sum)} = `,
              h('b', null, `0x${MB.hex2(l)}`)
            )
          ),
          h(
            'div',
            { class: 'panel' },
            h('div', { class: 'panel-title' }, icon('clock'), 'RTU frente a ASCII a 9600 bit/s'),
            h(
              'dl',
              { class: 'kv' },
              h('dt', null, 'RTU'),
              h('dd', { class: 'mono' }, `${rtu.length} bytes × 11 bits = ${MB.fmtMs(rtu.length * tR.charMs)}`),
              h('dt', null, 'ASCII'),
              h('dd', { class: 'mono' }, `${wire.length} caracteres × 10 bits = ${MB.fmtMs(wire.length * tA.charMs)}`)
            )
          )
        ),
        h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('cable'), 'Lo que viaja por el cable (códigos ASCII)'), h('div', { class: 'hexline' }, wire.map(MB.hex2).join(' ')))
      );
    };
    unit.addEventListener('input', draw);
    form.onChange(draw);
    body.append(h('div', { class: 'split' }, MB.ui.field('Dirección de esclavo', unit, '1–247'), h('div')), form.el, out);
    draw();
  };

  /* ------------------------------------------------------------------
   * Constructor Modbus TCP
   * ------------------------------------------------------------------ */
  W.tcpBuilder = function (body) {
    const tid = h('input', { type: 'text', id: 'tcp-tid', value: '1', autocomplete: 'off' });
    const unit = h('input', { type: 'text', id: 'tcp-unit', value: '255', autocomplete: 'off' });
    const form = requestForm({ id: 'tcp', init: { fc: 3, addr: '0', qty: '2' } });
    const out = h('div');
    const draw = () => {
      let t, u;
      try {
        t = parseNum(tid.value);
        u = parseNum(unit.value, { max: 255 });
        tid.classList.remove('invalid');
        unit.classList.remove('invalid');
      } catch (e) {
        out.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), e.message));
        return;
      }
      const { pdu, error } = form.get();
      if (error) {
        out.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), error));
        return;
      }
      const adu = MB.tcpADU(t, u, pdu);
      const r = demoResponse(pdu);
      const radu = MB.tcpADU(t, u, r.pdu);
      out.replaceChildren(
        h('div', { class: 'panel-title' }, icon('send'), 'Petición del cliente'),
        frameView(MB.describeADU('tcp', adu, 'req'), { animate: true }),
        h('div', { class: 'panel-title' }, icon(r.exception ? 'alert' : 'check'), 'Respuesta del servidor (mismo Transaction ID)'),
        frameView(MB.describeADU('tcp', radu, 'resp'), { table: false, compact: true })
      );
    };
    [tid, unit].forEach((i) => i.addEventListener('input', draw));
    form.onChange(draw);
    body.append(
      h(
        'div',
        { class: 'form-grid' },
        MB.ui.field('Transaction ID', tid, '0–65535'),
        MB.ui.field('Unit ID', unit, '255 si no hay pasarela'),
        h('div', { class: 'field', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', type: 'button', onclick: () => ((tid.value = String((+tid.value + 1) & 0xffff)), draw()) }, 'Nueva transacción +1'))
      ),
      form.el,
      out
    );
    draw();
  };

  /* ------------------------------------------------------------------
   * La misma PDU en tres envoltorios
   * ------------------------------------------------------------------ */
  W.encapsulation = function (body) {
    const form = requestForm({ id: 'enc', init: { fc: 3, addr: '0', qty: '2' } });
    const out = h('div');
    const draw = () => {
      const { pdu, error } = form.get();
      if (error) {
        out.replaceChildren(h('div', { class: 'frame-error' }, icon('alert'), error));
        return;
      }
      const rows = [
        ['Modbus RTU', 'rtu', MB.rtuADU(1, pdu), 'Dirección + PDU + CRC'],
        ['Modbus ASCII', 'ascii', MB.asciiADU(1, pdu), '«:» + texto hexadecimal + LRC + CR LF'],
        ['Modbus TCP', 'tcp', MB.tcpADU(1, 1, pdu), 'Cabecera MBAP + PDU'],
      ];
      out.replaceChildren(
        ...rows.map(([name, mode, adu, sub]) =>
          h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, h('b', { style: { color: 'var(--fg)' } }, name), '·', sub), frameView(MB.describeADU(mode, adu, 'req'), { table: false, compact: true, animate: true }))
        )
      );
    };
    form.onChange(draw);
    body.append(form.el, out);
    draw();
  };
})(typeof window !== 'undefined' ? window : globalThis);
