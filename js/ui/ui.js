/*!
 * Academia Modbus — utilidades de interfaz: DOM, iconos, almacenamiento,
 * visor de tramas y vista animada de bus.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const UI = (MB.ui = {});
  MB.widgets = MB.widgets || {};
  MB.state = MB.state || {};

  /* ---------------- DOM ---------------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') {
          // Las variables CSS (--x) solo se pueden fijar con setProperty
          for (const [p, val] of Object.entries(v)) {
            if (p.startsWith('--')) el.style.setProperty(p, val);
            else el.style[p] = val;
          }
        }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const kid of [kids].flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : String(kid));
    }
    return el;
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const reducedMotion = () => global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

  /* ---------------- Almacenamiento: navegador y cuenta ---------------- */
  // El progreso se guarda siempre en este navegador (respuesta inmediata y sin
  // conexión). Cuando la página se abre publicada en claude.ai, además se
  // replica en un documento privado de la cuenta del usuario, de modo que el
  // móvil y el ordenador comparten el mismo progreso.
  const KEY = 'academia-modbus:v1';
  const SYNCED = ['done', 'challenges', 'examBest', 'checklist'];
  let memory = {};
  const readAll = () => {
    try {
      const raw = global.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : memory;
    } catch (e) {
      return memory;
    }
  };
  const writeAll = (all) => {
    memory = all;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {
      /* sin almacenamiento: seguimos en memoria */
    }
  };
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  const store = {
    all: readAll,
    get(k, def) {
      const v = readAll()[k];
      return v === undefined ? def : v;
    },
    set(k, v) {
      const all = readAll();
      all[k] = v;
      writeAll(all);
      emit('mb:store', { key: k });
      if (SYNCED.includes(k)) sync.push();
    },
  };

  /** Solo las claves sincronizadas, en forma canónica para comparar. */
  const pickSynced = (obj) => {
    const out = {};
    SYNCED.forEach((k) => {
      const v = obj ? obj[k] : undefined;
      if (v === undefined || v === null) return;
      out[k] = v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((x) => v[x]).map((x) => [x, v[x]])) : v;
    });
    return out;
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** Primera vez en este dispositivo: se suma lo hecho aquí a lo guardado en la cuenta. */
  const union = (local, remote) => {
    const out = { ...remote };
    ['done', 'challenges', 'checklist'].forEach((k) => {
      if (local[k] || remote[k]) out[k] = { ...(remote[k] || {}), ...(local[k] || {}) };
    });
    const best = Math.max(local.examBest ?? -1, remote.examBest ?? -1);
    if (best >= 0) out.examBest = best;
    return pickSynced(out);
  };

  const sync = {
    status: 'local',
    ref: null,
    uid: null,
    ready: false,
    timer: null,
    writing: false,
    again: false,
    setStatus(s) {
      if (sync.status === s) return;
      sync.status = s;
      emit('mb:sync-status', { status: s });
    },
    async start() {
      const c = global.claude;
      if (!c || typeof c.use !== 'function') return; // abierto como archivo: solo navegador
      sync.setStatus('connecting');
      let db = null;
      let user = null;
      try {
        [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      } catch (e) {
        /* sin capacidades */
      }
      const uid = user ? await user.id() : null;
      if (!db || !uid) return sync.setStatus('local');
      sync.uid = uid;
      sync.ref = db.doc(`data/users/${uid}/progress`);
      sync.ref.onSnapshot(sync.onRemote, () => sync.setStatus('error'));
    },
    onRemote(snap) {
      if (snap.metadata.hasPendingWrites) return; // eco de nuestra propia escritura
      if (!sync.ready && snap.metadata.fromCache && !snap.exists) return; // esperar al dato definitivo
      const remote = pickSynced(snap.exists ? snap.data() : {});
      const all = readAll();
      const local = pickSynced(all);
      if (!sync.ready) {
        sync.ready = true;
        const next = all.syncedWith === sync.uid ? remote : union(local, remote);
        all.syncedWith = sync.uid;
        sync.apply(all, next);
        if (!snap.exists || !same(next, remote)) sync.push();
        sync.setStatus('synced');
        return;
      }
      // Cambios desde otro dispositivo. Si hay una escritura nuestra en camino, gana la nuestra.
      if (sync.timer || sync.writing) return;
      if (!same(remote, local)) sync.apply(all, remote);
    },
    apply(all, next) {
      SYNCED.forEach((k) => delete all[k]);
      Object.assign(all, next);
      writeAll(all);
      emit('mb:sync', {});
    },
    push() {
      if (!sync.ref || !sync.ready) return;
      clearTimeout(sync.timer);
      sync.timer = setTimeout(sync.flush, 500);
    },
    async flush() {
      sync.timer = null;
      if (sync.writing) {
        sync.again = true;
        return;
      }
      sync.writing = true;
      try {
        await sync.ref.set(pickSynced(readAll()));
        sync.setStatus('synced');
      } catch (e) {
        if (e && e.code === 'unavailable' && !sync.retried) {
          sync.retried = true;
          setTimeout(sync.push, 1000 + Math.random() * 1500);
        } else sync.setStatus('error');
      }
      sync.retried = false;
      sync.writing = false;
      if (sync.again) {
        sync.again = false;
        sync.flush();
      }
    },
  };

  /* ---------------- Iconos ---------------- */
  const P = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    pause: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>',
    step: '<path d="M6 5.5v13l9-6.5z" fill="currentColor"/><path d="M18 5v14"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
    pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    plc: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h8M8 11h1.5M11.25 11h1.5M14.5 11h1.5M8 15h1.5M11.25 15h1.5M14.5 15h1.5"/>',
    vfd: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><circle cx="12" cy="13" r="4"/><path d="M12 13l2.2-2.2M8.5 6.5h7"/>',
    meter: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 15l4-5"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/><path d="M4 20h16"/>',
    ghost: '<rect x="5" y="5" width="14" height="14" rx="1.5" stroke-dasharray="3 3"/><path d="M10 10l4 4M14 10l-4 4"/>',
    lab: '<path d="M9 3h6M10 3v6l-5.2 9.3A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.7L14 9V3"/><path d="M7.5 15h9"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M7 12h10"/>',
    wrench: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L21 12l-2 2-1.6-1.6a4 4 0 0 1-4.9-4.9L6 14l-2 2 4 4 2-2 6.5-6.5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    wave: '<path d="M3 12h3V6h4v12h4V6h4v6h3"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    cable: '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><path d="M4 6c4 0 4 12 8 12s4-12 8-12"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l3.5-5"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3 8-7.5 9.5-4.5-1.5-7.5-5-7.5-9.5V6z"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 10.8a3.9 3.9 0 0 1-.5 7.7z"/>',
    network: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  };
  function icon(name, cls = '') {
    const span = document.createElement('span');
    span.className = `ic ${cls}`.trim();
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
    return span;
  }
  const iconHTML = (name, cls = '') => icon(name, cls).outerHTML;

  /* ---------------- Aviso flotante ---------------- */
  function toast(msg, kind = 'info') {
    let host = $('.toasts');
    if (!host) {
      host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.append(host);
    }
    const t = h('div', { class: `toast toast-${kind}` }, icon(kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'bolt'), h('span', null, msg));
    host.append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copiado al portapapeles', 'ok');
    } catch (e) {
      if (btn) {
        const sel = global.getSelection();
        const range = document.createRange();
        const target = btn.closest('[data-copy-root]') || btn.parentElement;
        range.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      toast('Selecciona el texto y cópialo con Ctrl+C', 'info');
    }
  }

  /* ---------------- Visor de tramas ---------------- */
  const KIND_LABEL = {
    addr: 'Dirección / Unit ID',
    fc: 'Función',
    reg: 'Dirección de dato',
    qty: 'Cantidad / control',
    bc: 'Contador de bytes',
    data: 'Datos',
    crc: 'Comprobación',
    mbap: 'Cabecera MBAP',
    exc: 'Excepción',
    delim: 'Delimitador',
    unk: 'Sin interpretar',
  };

  /**
   * Dibuja una trama coloreada a partir del resultado de MB.describeADU.
   * opts: { table: bool, animate: bool, compact: bool, caption: string }
   */
  function frameView(res, opts = {}) {
    const wrap = h('div', { class: `frame${opts.compact ? ' frame-compact' : ''}${opts.animate ? ' frame-anim' : ''}` });
    if (res.error) {
      wrap.append(h('div', { class: 'frame-error' }, icon('alert'), res.error));
      return wrap;
    }
    const strip = h('div', { class: 'frame-strip', role: 'list' });
    let n = 0;
    res.fields.forEach((f, i) => {
      const g = h('div', {
        class: `fgroup k-${f.kind}${f.bad ? ' bad' : ''}`,
        'data-i': i,
        role: 'listitem',
        title: `${f.label}: ${f.value}${f.note ? ' — ' + f.note : ''}`,
      });
      const bytes = h('div', { class: 'fbytes' });
      for (let j = 0; j < f.len; j++) {
        bytes.append(h('span', { class: 'byte', style: { '--i': n++ } }, res.cells[f.start + j]));
      }
      g.append(bytes, h('div', { class: 'flabel' }, f.short || f.label));
      strip.append(g);
    });
    wrap.append(h('div', { class: 'frame-scroll' }, strip));

    if (opts.table !== false) {
      const tb = h('table', { class: 'ftable' });
      tb.append(h('thead', null, h('tr', null, h('th', null, 'Campo'), h('th', null, 'Bytes'), h('th', null, 'Valor'), h('th', null, 'Significado'))));
      const body = h('tbody');
      res.fields.forEach((f, i) => {
        body.append(
          h(
            'tr',
            { class: `k-${f.kind}${f.bad ? ' bad' : ''}`, 'data-i': i },
            h('td', null, h('span', { class: 'kdot' }), f.label),
            h('td', { class: 'mono' }, res.cells.slice(f.start, f.start + f.len).join(' ')),
            h('td', { class: 'mono' }, f.value),
            h('td', null, f.note || '')
          )
        );
      });
      tb.append(body);
      wrap.append(h('div', { class: 'table-wrap' }, tb));
    }

    // Resaltado cruzado entre la tira y la tabla
    const hot = (i) => {
      wrap.classList.toggle('has-hot', i != null);
      $$('[data-i]', wrap).forEach((el) => el.classList.toggle('hot', el.dataset.i === String(i)));
    };
    wrap.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-i]');
      hot(t ? t.dataset.i : null);
    });
    wrap.addEventListener('pointerleave', () => hot(null));
    return wrap;
  }

  /** Leyenda de colores de campo. */
  function legend(kinds) {
    return h(
      'div',
      { class: 'legend' },
      kinds.map((k) => h('span', { class: `legend-item k-${k}` }, h('span', { class: 'kdot' }), KIND_LABEL[k]))
    );
  }

  /* ---------------- Lienzo con alta densidad ---------------- */
  function fitCanvas(canvas) {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: hgt };
  }

  /* ---------------- Vista de bus ---------------- */
  const KIND_ICON = { plc: 'plc', vfd: 'vfd', meter: 'meter', master: 'pc', ghost: 'ghost' };

  class BusView {
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = opts;
      this.devices = opts.devices || [];
      this.mode = opts.mode || 'rtu';
      el.classList.add('bus');
      if (opts.compact) el.classList.add('bus-compact');
      this.track = h('div', { class: 'bus-track' }, h('div', { class: 'bus-wire a' }), h('div', { class: 'bus-wire b' }));
      this.termL = h('div', { class: 'bus-term l', title: 'Resistencia de terminación de 120 Ω' }, '120Ω');
      this.termR = h('div', { class: 'bus-term r', title: 'Resistencia de terminación de 120 Ω' }, '120Ω');
      this.tag = h('div', { class: 'bus-tag' });
      this.layer = h('div', { class: 'bus-layer' });
      el.append(this.track, this.termL, this.termR, this.tag, this.layer);
      this.nodes = new Map();
      const all = [{ id: 'master', name: opts.masterName || 'Maestro', sub: opts.masterSub || 'SCADA', kind: 'master' }, ...this.devices];
      const span = all.length - 1;
      all.forEach((d, k) => {
        const x = k === 0 ? 9 : 34 + ((k - 1) * 58) / Math.max(1, span - 1);
        d._x = span === 1 && k === 1 ? 62 : x;
        const sub = h('small', { class: 'node-sub' });
        const node = h(
          'div',
          { class: `bus-node${d.kind === 'master' ? ' master' : ''}`, style: { '--x': `${d._x}%` }, 'data-id': d.id },
          h('div', { class: 'node-stub' }),
          h('div', { class: 'node-box' }, icon(KIND_ICON[d.kind] || 'chip', 'node-ic'), h('div', { class: 'node-txt' }, h('b', null, d.name), sub)),
          h('div', { class: 'node-badge' })
        );
        node._sub = sub;
        node._dev = d;
        this.nodes.set(String(d.id), node);
        el.append(node);
      });
      this.setMode(this.mode);
    }

    x(id) {
      const n = this.nodes.get(String(id));
      return n ? n._dev._x : 97;
    }

    setMode(mode, tag) {
      this.mode = mode;
      this.el.classList.toggle('is-tcp', mode === 'tcp');
      this.nodes.forEach((node) => {
        const d = node._dev;
        if (d.kind === 'master') node._sub.textContent = mode === 'tcp' ? 'Cliente' : d.sub;
        else node._sub.textContent = mode === 'tcp' ? d.ip || `ID ${d.id}` : `ID ${d.id}`;
      });
      this.tag.textContent = tag || (mode === 'tcp' ? 'Ethernet · TCP 502' : 'RS-485 · 19200 8E1');
    }

    setTag(text) {
      this.tag.textContent = text;
    }

    setOnline(id, online) {
      const n = this.nodes.get(String(id));
      if (n) n.classList.toggle('offline', !online);
    }

    flash(id, cls, ms = 900) {
      const n = this.nodes.get(String(id));
      if (!n) return;
      n.classList.remove(cls);
      void n.offsetWidth;
      n.classList.add(cls);
      clearTimeout(n['_t' + cls]);
      n['_t' + cls] = setTimeout(() => n.classList.remove(cls), ms);
    }

    badge(id, text, kind = 'info', ms = 1600) {
      const n = this.nodes.get(String(id));
      if (!n) return;
      const b = $('.node-badge', n);
      b.textContent = text;
      b.className = `node-badge show ${kind}`;
      clearTimeout(n._tb);
      n._tb = setTimeout(() => (b.className = 'node-badge'), ms);
    }

    /** Anima un paquete a lo largo del bus. to: id | 'master' | 'all' | 'none'. */
    async send({ from = 'master', to, text = '', kind = 'req', duration = 900 }) {
      const rm = reducedMotion();
      const dur = rm ? 120 : duration;
      const x1 = this.x(from);
      const x2 = to === 'all' || to === 'none' ? 97 : this.x(to);
      const pkt = h('div', { class: `pkt pkt-${kind}` }, h('span', { class: 'pkt-dot' }), h('span', { class: 'pkt-txt' }, text));
      const trail = h('div', { class: `trail trail-${kind}` });
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      trail.style.left = `${lo}%`;
      trail.style.width = `${hi - lo}%`;
      trail.style.transformOrigin = x2 >= x1 ? 'left center' : 'right center';
      this.layer.append(trail, pkt);
      this.flash(from, 'tx', 500);
      const easing = 'cubic-bezier(.45,.05,.3,1)';
      const a = pkt.animate(
        [
          { left: `${x1}%`, opacity: 0 },
          { left: `${x1 + (x2 - x1) * 0.06}%`, opacity: 1, offset: 0.06 },
          { left: `${x2}%`, opacity: 1, offset: 0.94 },
          { left: `${x2}%`, opacity: to === 'none' ? 0 : 0.2 },
        ],
        { duration: dur, easing, fill: 'forwards' }
      );
      trail.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.94 }, { transform: 'scaleX(1)', opacity: 0 }], {
        duration: dur + 350,
        easing,
        fill: 'forwards',
      });
      if (to === 'all') {
        this.nodes.forEach((n, id) => {
          if (id === 'master' || n.classList.contains('offline')) return;
          const t = ((n._dev._x - x1) / (x2 - x1)) * dur;
          setTimeout(() => this.flash(id, 'rx'), Math.max(0, t));
        });
      }
      try {
        await a.finished;
      } catch (e) {
        /* animación cancelada */
      }
      pkt.remove();
      setTimeout(() => trail.remove(), 400);
      if (to !== 'all' && to !== 'none') this.flash(to, kind === 'err' ? 'err' : 'rx');
    }

    /** Muestra la espera del maestro hasta el timeout. */
    async wait(ms, label = 'Esperando respuesta…') {
      const n = this.nodes.get('master');
      n.classList.add('waiting');
      n.style.setProperty('--wait', `${ms}ms`);
      this.badge('master', label, 'info', ms);
      await sleep(reducedMotion() ? Math.min(ms, 200) : ms);
      n.classList.remove('waiting');
    }
  }

  /* ---------------- Controles pequeños ---------------- */
  /** Control segmentado. items: [{value,label}] */
  function segmented(items, value, onChange, opts = {}) {
    const el = h('div', { class: `seg${opts.small ? ' seg-sm' : ''}`, role: 'group', 'aria-label': opts.label || '' });
    const set = (v) => {
      $$('button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
    };
    items.forEach((it) => {
      el.append(
        h(
          'button',
          {
            type: 'button',
            'data-v': it.value,
            onclick: () => {
              set(it.value);
              onChange(it.value);
            },
          },
          it.label
        )
      );
    });
    set(value);
    el.setValue = set;
    return el;
  }

  function field(label, control, hint) {
    const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
    control.id = id;
    return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
  }

  function select(id, options, value) {
    const s = h('select', { id });
    options.forEach((o) => s.append(h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
    return s;
  }

  function switchCtl(id, label, checked, onChange) {
    const input = h('input', { type: 'checkbox', id, checked: !!checked, onchange: (e) => onChange(e.target.checked) });
    return h('label', { class: 'switch', for: id }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })), h('span', { class: 'switch-label' }, label));
  }

  /** Lanza confeti sobre la página (se usa al aprobar el examen). */
  function confetti() {
    if (reducedMotion()) return;
    const c = h('canvas', { class: 'confetti' });
    document.body.append(c);
    const { ctx, w, h: H } = fitCanvas(c);
    const colors = ['--f-addr', '--f-fc', '--f-reg', '--f-qty', '--f-bc', '--f-data', '--f-crc'].map((v) => cssVar(v));
    const parts = Array.from({ length: 160 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      s: 5 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frames = 0;
    (function loop() {
      ctx.clearRect(0, 0, w, H);
      parts.forEach((p) => {
        p.vy += 0.28;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (++frames < 200) requestAnimationFrame(loop);
      else c.remove();
    })();
  }

  Object.assign(UI, {
    h, append, $, $$, esc, icon, iconHTML, toast, copyText, store, sync, frameView, legend, KIND_LABEL,
    fitCanvas, BusView, segmented, field, select, switchCtl, confetti, reducedMotion, sleep, cssVar,
  });
})(typeof window !== 'undefined' ? window : globalThis);
