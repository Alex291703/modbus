/*!
 * Academia Modbus — widgets de capa física (lienzos animados).
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const { h, icon, fitCanvas, segmented, switchCtl, select, cssVar, reducedMotion } = MB.ui;
  const W = MB.widgets;

  /** Paleta leída de los tokens CSS, refrescada cada medio segundo. */
  function palette() {
    let cache = null;
    let t = 0;
    return () => {
      const now = performance.now();
      if (!cache || now - t > 500) {
        t = now;
        cache = {
          bg: cssVar('--bg'),
          grid: cssVar('--line'),
          gridStrong: cssVar('--line-strong'),
          fg: cssVar('--fg'),
          fg2: cssVar('--fg-2'),
          muted: cssVar('--muted'),
          t1: cssVar('--trace-1'),
          t2: cssVar('--trace-2'),
          t3: cssVar('--trace-3'),
          accent: cssVar('--accent'),
          err: cssVar('--err'),
          ok: cssVar('--ok'),
          start: cssVar('--f-exc'),
          data: cssVar('--f-data'),
          parity: cssVar('--f-reg'),
          stop: cssVar('--f-addr'),
          mono: cssVar('--font-mono'),
        };
      }
      return cache;
    };
  }

  function graticule(ctx, w, hh, col, step = 32) {
    ctx.save();
    ctx.strokeStyle = col.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0.5; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, hh);
    }
    for (let y = 0.5; y < hh; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------
   * Osciloscopio: un carácter UART y el par diferencial RS-485
   * ------------------------------------------------------------------ */
  W.uartScope = function (body) {
    const st = { byte: 0x41, data: 8, parity: 'E', stop: 1, baud: 19200, noise: true };
    const col = palette();
    const hexIn = h('input', { type: 'text', id: 'uart-byte', value: '41', maxlength: 4, autocomplete: 'off', spellcheck: 'false' });
    const baudSel = select('uart-baud', [9600, 19200, 38400, 115200].map((b) => ({ value: b, label: `${b} bit/s` })), st.baud);
    const bitsRow = h('div', { class: 'bitrow' });
    const info = h('div', { class: 'stat-line' });
    const canvas = h('canvas', { class: 'scope', role: 'img', 'aria-label': 'Osciloscopio con la señal UART y el par diferencial RS-485' });
    let bits = [];

    function compute() {
      const v = st.byte & (st.data === 7 ? 0x7f : 0xff);
      const out = [{ v: 0, k: 'start', l: 'S' }];
      let ones = 0;
      for (let i = 0; i < st.data; i++) {
        const b = (v >> i) & 1;
        ones += b;
        out.push({ v: b, k: 'data', l: `D${i}` });
      }
      if (st.parity !== 'N') out.push({ v: st.parity === 'E' ? ones & 1 : (ones & 1) ^ 1, k: 'parity', l: 'P' });
      for (let i = 0; i < st.stop; i++) out.push({ v: 1, k: 'stop', l: 'T' });
      bits = out;
      const colorOf = { start: 'var(--f-exc)', data: 'var(--f-data)', parity: 'var(--f-reg)', stop: 'var(--f-addr)' };
      bitsRow.replaceChildren(...bits.map((b, i) => h('div', { class: 'bitcell', 'data-i': i, style: { '--c': colorOf[b.k] } }, String(b.v), h('small', null, b.l))));
      const t = MB.serialTiming(st.baud, bits.length);
      const ch = v >= 32 && v < 127 ? `«${String.fromCharCode(v)}»` : '';
      info.replaceChildren(
        h('span', null, h('small', null, 'Byte'), h('b', null, `0x${MB.hex2(v)} ${ch}`)),
        h('span', null, h('small', null, 'Bits por carácter'), h('b', null, bits.length)),
        h('span', null, h('small', null, 'Tiempo de bit'), h('b', null, MB.fmtMs(t.bitUs / 1000))),
        h('span', null, h('small', null, 'Tiempo de carácter'), h('b', null, MB.fmtMs(t.charMs))),
        h('span', null, h('small', null, 't3,5'), h('b', null, MB.fmtMs(t.t35)))
      );
    }

    hexIn.addEventListener('input', () => {
      const raw = hexIn.value.trim().replace(/^0x/i, '');
      const ok = /^[0-9a-f]{1,2}$/i.test(raw);
      hexIn.classList.toggle('invalid', !ok);
      if (ok) {
        st.byte = parseInt(raw, 16);
        compute();
      }
    });
    baudSel.addEventListener('change', () => {
      st.baud = +baudSel.value;
      compute();
    });

    const controls = h(
      'div',
      { class: 'toolbar' },
      h('div', { class: 'field', style: { width: '110px' } }, h('label', { for: 'uart-byte' }, 'Byte (hex)'), hexIn),
      h('div', { class: 'field' }, h('label', null, 'Datos'), segmented([{ value: 8, label: '8 bits' }, { value: 7, label: '7 bits' }], 8, (v) => ((st.data = +v), compute()), { small: true })),
      h(
        'div',
        { class: 'field' },
        h('label', null, 'Paridad'),
        segmented(
          [
            { value: 'E', label: 'Par' },
            { value: 'O', label: 'Impar' },
            { value: 'N', label: 'Ninguna' },
          ],
          'E',
          (v) => ((st.parity = v), compute()),
          { small: true }
        )
      ),
      h('div', { class: 'field' }, h('label', null, 'Stop'), segmented([{ value: 1, label: '1' }, { value: 2, label: '2' }], 1, (v) => ((st.stop = +v), compute()), { small: true })),
      h('div', { class: 'field', style: { width: '150px' } }, h('label', { for: 'uart-baud' }, 'Velocidad'), baudSel),
      h('div', { class: 'field' }, h('label', null, 'Interferencia'), switchCtl('uart-noise', 'Ruido de modo común', st.noise, (v) => (st.noise = v)))
    );
    body.append(controls, bitsRow, canvas, info);
    compute();

    let alive = true;
    const t0 = performance.now();
    function draw(now) {
      if (!alive || !canvas.isConnected) return;
      const c = col();
      const { ctx, w, h: H } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, H);
      graticule(ctx, w, H, c);
      const padL = 64, padR = 16;
      const n = bits.length + 2; // un bit de reposo a cada lado
      const bw = (w - padL - padR) / n;
      const time = (now - t0) / 1000;
      const levelAt = (i) => (i <= 0 || i > bits.length ? 1 : bits[i - 1].v);
      const lanes = [
        { y: 46, amp: 26, label: 'TX UART' },
        { y: 136, amp: 20, label: 'A · B' },
        { y: 214, amp: 24, label: 'B − A' },
      ];
      // Separadores de bit
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = c.gridStrong;
      ctx.beginPath();
      for (let i = 1; i < n; i++) {
        const x = Math.round(padL + i * bw) + 0.5;
        ctx.moveTo(x, 14);
        ctx.lineTo(x, H - 6);
      }
      ctx.stroke();
      ctx.restore();
      // Etiquetas de bit
      ctx.font = `600 10px ${c.mono}`;
      ctx.textAlign = 'center';
      for (let i = 0; i < n; i++) {
        const b = i === 0 || i === n - 1 ? null : bits[i - 1];
        ctx.fillStyle = b ? c[b.k] : c.muted;
        ctx.fillText(b ? b.l : 'reposo', padL + (i + 0.5) * bw, 11);
      }
      // Nombres de las trazas
      ctx.textAlign = 'left';
      ctx.font = `600 10px ${c.mono}`;
      lanes.forEach((ln) => {
        ctx.fillStyle = c.muted;
        ctx.fillText(ln.label, 8, ln.y + 4);
      });
      const noiseAt = (x) =>
        st.noise ? 9 * Math.sin(x * 0.045 + time * 3.1) + 6 * Math.sin(x * 0.13 - time * 5.3) + 3 * Math.sin(x * 0.37 + time * 9) : 0;
      const trace = (color, fy, width = 2, glow = true) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        if (glow) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        for (let x = padL; x <= w - padR; x += 2) {
          const i = Math.floor((x - padL) / bw);
          const y = fy(levelAt(i), x);
          if (x === padL) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      };
      // TX lógico: 1 arriba, 0 abajo
      trace(c.t1, (v) => lanes[0].y + (v ? -lanes[0].amp : lanes[0].amp));
      // A y B: con 1 lógico, B queda por encima de A
      trace(c.t2, (v, x) => lanes[1].y + (v ? -lanes[1].amp : lanes[1].amp) * 0.55 - 8 + noiseAt(x), 1.6);
      trace(c.t1, (v, x) => lanes[1].y + (v ? lanes[1].amp : -lanes[1].amp) * 0.55 + 8 + noiseAt(x), 1.6);
      // Diferencial: el ruido común se cancela
      trace(c.t3, (v) => lanes[2].y + (v ? -lanes[2].amp : lanes[2].amp));
      // Barrido
      const period = reducedMotion() ? 1e9 : 3.2;
      const phase = (time % period) / period;
      const sx = padL + phase * (w - padL - padR);
      ctx.save();
      ctx.strokeStyle = c.accent;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, 16);
      ctx.lineTo(sx, H - 4);
      ctx.stroke();
      ctx.restore();
      const cur = Math.floor((sx - padL) / bw) - 1;
      bitsRow.querySelectorAll('.bitcell').forEach((el, i) => el.classList.toggle('on-cursor', i === cur));
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    return () => (alive = false);
  };

  /* ------------------------------------------------------------------
   * Terminación y polarización del bus RS-485
   * ------------------------------------------------------------------ */
  W.termination = function (body) {
    const st = { term: false, bias: false };
    const col = palette();
    const canvas = h('canvas', { class: 'rs485-canvas', style: { height: '300px' }, role: 'img', 'aria-label': 'Bus RS-485 con reflexiones y señal en el receptor' });
    const verdict = h('div', { class: 'callout' });
    const drawVerdict = () => {
      const ok = st.term && st.bias;
      verdict.className = `callout ${ok ? 'ok' : 'warn'}`;
      const items = [];
      if (!st.term) items.push('Sin terminación, el pulso rebota en el extremo abierto y vuelve como eco: aparecen oscilaciones (ringing) en cada flanco.');
      if (!st.bias) items.push('Sin polarización, cuando nadie transmite la línea queda flotando cerca de 0 V y el ruido cruza el umbral de ±200 mV: el receptor ve falsos bits de inicio.');
      if (ok) items.push('Terminado en ambos extremos y polarizado en un punto: flancos limpios y reposo estable por encima del umbral.');
      verdict.replaceChildren(h('span', { class: 'callout-tag' }, icon(ok ? 'check' : 'alert'), ok ? 'Bus sano' : 'Problemas en el bus'), ...items.map((t) => h('span', null, t)));
    };
    body.append(
      h(
        'div',
        { class: 'btn-row', style: { gap: '22px' } },
        switchCtl('rs-term', 'Terminación de 120 Ω en ambos extremos', st.term, (v) => ((st.term = v), drawVerdict())),
        switchCtl('rs-bias', 'Resistencias de polarización (bias)', st.bias, (v) => ((st.bias = v), drawVerdict()))
      ),
      canvas,
      verdict
    );
    drawVerdict();

    let alive = true;
    const t0 = performance.now();
    function resistor(ctx, x, y, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x, y - 12);
      for (let k = 0; k < 6; k++) ctx.lineTo(x + (k % 2 ? -6 : 6), y - 10 + k * 4);
      ctx.lineTo(x, y + 14);
      ctx.lineTo(x, y + 18);
      ctx.stroke();
      ctx.restore();
    }
    function draw(now) {
      if (!alive || !canvas.isConnected) return;
      const c = col();
      const { ctx, w, h: H } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, H);
      const time = (now - t0) / 1000;
      const x0 = 50, x1 = w - 50, yA = 50, yB = 70;
      // Cable
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.t2;
      ctx.beginPath();
      ctx.moveTo(x0, yA);
      ctx.lineTo(x1, yA);
      ctx.stroke();
      ctx.strokeStyle = c.t1;
      ctx.beginPath();
      ctx.moveTo(x0, yB);
      ctx.lineTo(x1, yB);
      ctx.stroke();
      // Nodos
      ctx.font = `600 10px ${c.mono}`;
      ctx.textAlign = 'center';
      [0, 0.36, 0.66, 1].forEach((f, k) => {
        const x = x0 + (x1 - x0) * f;
        ctx.fillStyle = c.gridStrong;
        ctx.fillRect(x - 1, yB, 2, 16);
        ctx.fillStyle = k === 0 ? c.accent : c.fg2;
        ctx.fillRect(x - 16, yB + 16, 32, 16);
        ctx.fillStyle = c.muted;
        ctx.fillText(k === 0 ? 'Maestro' : `Esclavo ${k}`, x, yB + 46);
      });
      // Terminadores
      if (st.term) {
        resistor(ctx, x0 - 18, (yA + yB) / 2, c.ok);
        resistor(ctx, x1 + 18, (yA + yB) / 2, c.ok);
        ctx.strokeStyle = c.ok;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, yA); ctx.lineTo(x0 - 18, yA); ctx.lineTo(x0 - 18, yA + 2);
        ctx.moveTo(x0, yB); ctx.lineTo(x0 - 18, yB); ctx.lineTo(x0 - 18, yB - 2);
        ctx.moveTo(x1, yA); ctx.lineTo(x1 + 18, yA); ctx.lineTo(x1 + 18, yA + 2);
        ctx.moveTo(x1, yB); ctx.lineTo(x1 + 18, yB); ctx.lineTo(x1 + 18, yB - 2);
        ctx.stroke();
        ctx.fillStyle = c.ok;
        ctx.fillText('120 Ω', x1 + 18, yA - 14);
        ctx.fillText('120 Ω', x0 - 18, yA - 14);
      } else {
        ctx.fillStyle = c.err;
        ctx.fillText('extremo abierto', x1 - 30, yA - 14);
      }
      // Pulso viajero y reflexiones
      const L = x1 - x0;
      const speed = L / 1.1;
      const period = 4;
      const tt = reducedMotion() ? 0.5 : time % period;
      let dist = tt * speed;
      let amp = 1;
      let pos = null;
      let bounces = 0;
      while (dist > L && bounces < 6) {
        if (st.term) {
          amp = 0;
          break;
        }
        dist -= L;
        amp *= 0.62;
        bounces++;
      }
      if (amp > 0.05) {
        const dir = bounces % 2 === 0 ? 1 : -1;
        pos = dir === 1 ? x0 + dist : x1 - dist;
        const color = bounces ? c.err : c.accent;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35 + amp * 0.65;
        ctx.beginPath();
        ctx.ellipse(pos, (yA + yB) / 2, 16 * amp + 4, 6 + 6 * amp, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (bounces) {
          ctx.fillStyle = c.err;
          ctx.fillText(`eco ${bounces}`, pos, yA - 14);
        }
      }
      // Señal diferencial en el esclavo más lejano
      const sy = 170, sh = H - sy - 12, mid = sy + sh / 2;
      const sx0 = 64, sx1 = w - 16;
      ctx.save();
      ctx.strokeStyle = c.grid;
      ctx.strokeRect(sx0 + 0.5, sy + 0.5, sx1 - sx0, sh);
      ctx.restore();
      const thr = sh * 0.14;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c.gridStrong;
      ctx.beginPath();
      ctx.moveTo(sx0, mid - thr);
      ctx.lineTo(sx1, mid - thr);
      ctx.moveTo(sx0, mid + thr);
      ctx.lineTo(sx1, mid + thr);
      ctx.stroke();
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = c.muted;
      ctx.fillText('+200 mV', 6, mid - thr + 4);
      ctx.fillText('−200 mV', 6, mid + thr + 4);
      ctx.fillText('B − A', 6, sy + 12);
      const bitsPat = [0, 1, 0, 0, 1, 1, 0, 1, 0, 1];
      const idleEnd = 0.2, busyEnd = 0.8;
      const span = sx1 - sx0;
      const bw = ((busyEnd - idleEnd) * span) / bitsPat.length;
      const high = -sh * 0.36;
      ctx.save();
      ctx.strokeStyle = c.t3;
      ctx.lineWidth = 2;
      ctx.shadowColor = c.t3;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      let falseStarts = 0;
      for (let x = sx0; x <= sx1; x += 1.5) {
        const f = (x - sx0) / span;
        let y;
        if (f < idleEnd || f > busyEnd) {
          const n = Math.sin(x * 0.21 + time * 7) * 0.5 + Math.sin(x * 0.07 - time * 3) * 0.6 + Math.sin(x * 0.53 + time * 13) * 0.3;
          y = st.bias ? mid + high * 0.55 + n * 2 : mid + n * thr * 1.25;
          if (!st.bias && n * 1.25 > 1) falseStarts++;
        } else {
          const i = Math.floor((x - sx0 - idleEnd * span) / bw);
          const v = bitsPat[Math.min(i, bitsPat.length - 1)];
          const prev = i > 0 ? bitsPat[i - 1] : 1;
          y = mid + (v ? high : -high);
          const since = (x - sx0 - idleEnd * span) - i * bw;
          if (!st.term && v !== prev) {
            const ring = Math.exp(-since / (bw * 0.28)) * Math.cos(since * 0.55) * sh * 0.22;
            y += v ? -ring : ring;
          }
        }
        if (x === sx0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = c.muted;
      ctx.textAlign = 'center';
      ctx.fillText('reposo', sx0 + span * idleEnd * 0.5, sy + 12);
      ctx.fillText('trama', sx0 + span * 0.5, sy + 12);
      ctx.fillText('reposo', sx0 + span * (busyEnd + (1 - busyEnd) * 0.5), sy + 12);
      if (!st.bias && falseStarts) {
        ctx.fillStyle = c.err;
        ctx.fillText('falsos bits de inicio', sx0 + span * 0.9, sy + sh - 6);
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    return () => (alive = false);
  };
})(typeof window !== 'undefined' ? window : globalThis);
