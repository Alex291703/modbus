/* =====================================================================
   Well Testing · R.B. Tec México — DTI simplificado (ISA-5.1)
   ---------------------------------------------------------------------
   Diagrama de Tubería e Instrumentación del aforo con separador
   bifásico de circuito cerrado. Todo se dibuja como SVG a partir de
   WT.config (instrumentos, colores, equipo, pozo, sistema): si cambia un
   tag, un nombre o un color en config.js, el dibujo se actualiza solo.

   API pública
     WT.dti.mount(rootEl, { layout: 'h' | 'v', capture: bool })
     WT.dti.svgMarkup(layout)   → <svg> autónomo (para descargas)

   Hojas
     'h' → 1920 × 1080  (pantalla / presentación)
     'v' → 1123 × 1587  (A3 vertical a 96 dpi, para imprimir)

   Capas (en pantalla se encienden y apagan sin redibujar):
     ly-sig   señales de instrumentos al RTU
     ly-loop  lazos de control (controladores y sus señales)
     ly-table tabla de instrumentos
     ly-anim  flujo animado (solo en pantalla)
   ===================================================================== */
(function () {
  'use strict';

  const WT = (window.WT = window.WT || {});

  /* ================================================================
     1 · Constantes de dibujo
     ================================================================ */
  const INK = '#1b1b1b';
  const SIG = '#1E8FC4'; // azul de señal apto para impresión
  const NAVY = '#0A2240';
  const YELLOW = '#FFC20E';
  const SKY = '#4CC3F0';
  const GREY = '#5b6573';
  const FONT = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  const MONO = "'JetBrains Mono', monospace";
  const R = 23; // radio de las burbujas ISA
  const SHEET = { h: { w: 1920, h: 1080 }, v: { w: 1123, h: 1587 } };
  // La zona de proceso vertical se dibuja en unidades «virtuales» y se
  // escala: así los símbolos miden lo mismo en ambas hojas y el texto
  // de 13 u queda en ≥ 11 px impresos.
  const V_K = 0.85;
  const V_ORIGIN = [30, 40];

  const cfg = () => WT.config || {};
  const insts = () => cfg().instrumentos || [];

  function streamColors() {
    const c = cfg().colores || {};
    return {
      mezcla: c.mezcla || '#8B5A2B',
      gas: c.gas || '#FFD400',
      liquido: c.liquidoAmbar || '#F29F05',
    };
  }

  /* ================================================================
     2 · Utilidades de texto
     ================================================================ */
  const f = (n) => String(Math.round(n * 10) / 10);
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const dPath = (p) => 'M' + p.map((q) => f(q[0]) + ' ' + f(q[1])).join('L');

  // Anchos de glifo de Barlow Condensed 600 (medidos en Chromium, en
  // centésimas de em, codificados como carácter − 23). Sirven para partir
  // líneas sin depender del DOM: el SVG sale idéntico en pantalla,
  // captura y descarga.
  const GLYPH = (() => {
    let chars = '';
    for (let i = 32; i < 127; i++) chars += String.fromCharCode(i);
    chars += 'áéíóúÁÉÍÓÚñÑüÜ°²³·→ΔµÓ–—…«»¿¡';
    const code =
      '+26TBdQ&33;C+7,>D2ABEBB>BA0-CCC@cEEEFB@EG-CG@MJFEDEBDGFYEE@8>8@?,BCACB4BC,,B+YCBCC6?3C@RA?<7(7GBB)BCEB-FGCJCG;12,{VCF=R[EE@2';
    const g = {};
    for (let i = 0; i < chars.length; i++) g[chars[i]] = (code.charCodeAt(i) - 23) / 100;
    return g;
  })();

  function textW(s, size, weight) {
    if (weight === 'mono') return String(s).length * 0.6 * size;
    let w = 0;
    for (const ch of String(s)) w += GLYPH[ch] != null ? GLYPH[ch] : 0.5;
    const k = weight >= 700 ? 1.03 : weight <= 500 ? 0.975 : 1;
    return w * size * k;
  }

  // Parte un texto en líneas que no excedan maxW (estimación + 3 % de holgura).
  function wrap(s, maxW, size, weight) {
    const words = String(s == null ? '' : s).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (!cur || textW(t, size, weight) * 1.03 <= maxW) cur = t;
      else {
        lines.push(cur);
        cur = wd;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  // En las descargas (SVG/PNG) la hoja no tiene acceso a las fuentes de la
  // página: cada texto lleva textLength con el ancho de Barlow Condensed para
  // que una fuente sustituta más ancha se ajuste a la misma caja y no se encime.
  let FIT_TEXT = false;

  // <text> con los valores por omisión del <svg> raíz (Barlow Condensed 13/500).
  function T(x, y, s, o) {
    o = o || {};
    let a = `<text x="${f(x)}" y="${f(y)}"`;
    const str = String(s == null ? '' : s);
    if (FIT_TEXT && !o.mono && str.length > 1) {
      const tl = textW(str, Number(o.size) || 13, o.w || 500) + (Number(o.ls) || 0) * [...str].length;
      a += ` textLength="${f(tl)}" lengthAdjust="spacingAndGlyphs"`;
    }
    if (o.size && o.size !== 13) a += ` font-size="${o.size}"`;
    if (o.w && o.w !== 500) a += ` font-weight="${o.w}"`;
    if (o.mono) a += ` font-family="${MONO}"`;
    if (o.a) a += ` text-anchor="${o.a}"`;
    if (o.fill) a += ` fill="${o.fill}"`;
    if (o.ls) a += ` letter-spacing="${o.ls}"`;
    if (o.cls) a += ` class="${o.cls}"`;
    return a + `>${esc(s)}</text>`;
  }
  // Varias líneas con interlineado lh.
  function TL(x, y, lines, lh, o) {
    return lines.map((ln, i) => T(x, y + i * lh, ln, o)).join('');
  }

  function splitIsa(isa) {
    const m = /^([A-Za-z]+)[-\s]?(.*)$/.exec(String(isa || ''));
    return m ? { letters: m[1].toUpperCase(), num: m[2] || '' } : { letters: String(isa), num: '' };
  }

  function fecha() {
    try {
      return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
  }

  /* ================================================================
     3 · Símbolos ISA-5.1 (cadenas SVG)
     ================================================================ */
  // Punta de flecha rellena: punta en (x, y), dirección (dx, dy).
  function arrowHead(x, y, dx, dy, len, half) {
    const n = Math.hypot(dx, dy) || 1;
    const ux = dx / n;
    const uy = dy / n;
    const bx = x - ux * len;
    const by = y - uy * len;
    return `M${f(x)} ${f(y)}L${f(bx - uy * half)} ${f(by + ux * half)}L${f(bx + uy * half)} ${f(by - ux * half)}Z`;
  }

  // Flecha de dirección de flujo sobre una línea de proceso.
  function flowArrow(x, y, dir) {
    const v = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] }[dir] || [1, 0];
    return `<path d="${arrowHead(x + v[0] * 6.5, y + v[1] * 6.5, v[0], v[1], 13, 6.5)}" fill="${INK}"/>`;
  }

  // Válvula de compuerta (moño). closed → normalmente cerrada (rellena).
  function gateValve(x, y, o) {
    o = o || {};
    const L = 14;
    const H = 9;
    const back = o.vert
      ? `<rect x="${f(x - 3.5)}" y="${f(y - L)}" width="7" height="${2 * L}" fill="#fff"/>`
      : `<rect x="${f(x - L)}" y="${f(y - 3.5)}" width="${2 * L}" height="7" fill="#fff"/>`;
    const d = o.vert
      ? `M${f(x - H)} ${f(y - L)}L${f(x + H)} ${f(y - L)}L${f(x - H)} ${f(y + L)}L${f(x + H)} ${f(y + L)}Z`
      : `M${f(x - L)} ${f(y - H)}L${f(x - L)} ${f(y + H)}L${f(x + L)} ${f(y - H)}L${f(x + L)} ${f(y + H)}Z`;
    return (o.noBack ? '' : back) + `<path d="${d}" class="d-sym${o.closed ? ' d-shut' : ''}"/>`;
  }

  // Válvula de control con actuador de diafragma. act: up | right | left.
  // Devuelve también el punto donde llega la señal del controlador.
  function controlValve(x, y, o) {
    o = o || {};
    const act = o.act || 'up';
    let s = gateValve(x, y, { vert: o.vert, noBack: o.noBack });
    if (act === 'up') {
      s += `<path d="M${f(x)} ${f(y)}V${f(y - 26)}" class="d-ln"/>`;
      s += `<path d="M${f(x - 13)} ${f(y - 26)}A13 13 0 0 1 ${f(x + 13)} ${f(y - 26)}Z" class="d-sym"/>`;
    } else if (act === 'right') {
      s += `<path d="M${f(x)} ${f(y)}H${f(x + 26)}" class="d-ln"/>`;
      s += `<path d="M${f(x + 26)} ${f(y - 13)}A13 13 0 0 1 ${f(x + 26)} ${f(y + 13)}Z" class="d-sym"/>`;
    } else {
      s += `<path d="M${f(x)} ${f(y)}H${f(x - 26)}" class="d-ln"/>`;
      s += `<path d="M${f(x - 26)} ${f(y + 13)}A13 13 0 0 1 ${f(x - 26)} ${f(y - 13)}Z" class="d-sym"/>`;
    }
    return s;
  }

  // Estrangulador ajustable: válvula con flecha diagonal.
  function choke(x, y, o) {
    o = o || {};
    return (
      gateValve(x, y, { noBack: o.noBack }) +
      `<path d="M${f(x - 17)} ${f(y + 15)}L${f(x + 12)} ${f(y - 14)}" class="d-ln"/>` +
      `<path d="${arrowHead(x + 19, y - 21, 1, -1, 11, 4.5)}" fill="${INK}"/>`
    );
  }

  // Placa de orificio: par de barras transversales a la tubería.
  function orifice(x, y, vert) {
    if (vert) {
      return (
        `<rect x="${f(x - 3.5)}" y="${f(y - 4)}" width="7" height="8" fill="#fff"/>` +
        `<path d="M${f(x - 15)} ${f(y - 4)}H${f(x + 15)}M${f(x - 15)} ${f(y + 4)}H${f(x + 15)}" class="d-ln d-thk"/>`
      );
    }
    return (
      `<rect x="${f(x - 4)}" y="${f(y - 3.5)}" width="8" height="7" fill="#fff"/>` +
      `<path d="M${f(x - 4)} ${f(y - 15)}V${f(y + 15)}M${f(x + 4)} ${f(y - 15)}V${f(y + 15)}" class="d-ln d-thk"/>`
    );
  }

  // Elemento de flujo Coriolis: cuerpo en línea con los dos tubos curvos.
  function coriolis(x, y, vert) {
    const g =
      `<rect x="${f(x - 23)}" y="${f(y - 14)}" width="46" height="28" rx="2" class="d-sym"/>` +
      `<path d="M${f(x - 16)} ${f(y + 9)}C${f(x - 16)} ${f(y - 12)} ${f(x + 16)} ${f(y - 12)} ${f(x + 16)} ${f(y + 9)}` +
      `M${f(x - 9)} ${f(y + 9)}C${f(x - 9)} ${f(y - 3)} ${f(x + 9)} ${f(y - 3)} ${f(x + 9)} ${f(y + 9)}" class="d-ln"/>`;
    return vert ? `<g transform="rotate(90 ${f(x)} ${f(y)})">${g}</g>` : g;
  }

  // Brida ciega al final de un tramo (dir: hacia dónde termina la línea).
  function blind(x, y, vert) {
    return vert
      ? `<path d="M${f(x - 11)} ${f(y)}H${f(x + 11)}" class="d-ln d-blind"/>`
      : `<path d="M${f(x)} ${f(y - 11)}V${f(y + 11)}" class="d-ln d-blind"/>`;
  }

  // Enlace de datos ISA (línea con círculos).
  function dataLink(x1, y, x2) {
    const a = x1 + (x2 - x1) / 3;
    const b = x1 + ((x2 - x1) * 2) / 3;
    return (
      `<path d="M${f(x1)} ${f(y)}H${f(x2)}" class="d-ln d-dl"/>` +
      `<circle cx="${f(a)}" cy="${f(y)}" r="3.2" class="d-sym d-dlc"/><circle cx="${f(b)}" cy="${f(y)}" r="3.2" class="d-sym d-dlc"/>`
    );
  }

  // Conector fuera de hoja (pentágono). dir: r | d.
  function offSheet(x, y, w, h, label, dir, fs) {
    let d;
    let tx;
    let ty;
    if (dir === 'd') {
      const t = h * 0.38;
      d = `M${f(x - w / 2)} ${f(y)}H${f(x + w / 2)}V${f(y + h - t)}L${f(x)} ${f(y + h)}L${f(x - w / 2)} ${f(y + h - t)}Z`;
      tx = x;
      ty = y + (h - t) / 2 + fs * 0.36;
    } else {
      const t = h * 0.6;
      d = `M${f(x)} ${f(y - h / 2)}H${f(x + w - t)}L${f(x + w)} ${f(y)}L${f(x + w - t)} ${f(y + h / 2)}H${f(x)}Z`;
      tx = x + (w - t * 0.6) / 2;
      ty = y + fs * 0.36;
    }
    return (
      `<path d="${d}" fill="${NAVY}" stroke="${INK}" stroke-width="1.6"/>` +
      (label ? T(tx, ty, label, { size: fs, w: 700, a: 'middle', fill: '#fff', ls: 0.6 }) : '')
    );
  }

  // Etiqueta amarilla con el tag de campo, tocando la burbuja.
  function tagLabel(x, y, tag, pos) {
    const fs = 12.5;
    const w = textW(tag, fs, 'mono') + 10;
    const h = 18;
    const c = R * 0.707;
    let lx;
    let ly;
    switch (pos) {
      case 'w': lx = x - R + 1 - w; ly = y - h / 2; break;
      case 'n': lx = x - w / 2; ly = y - R + 1 - h; break;
      case 's': lx = x - w / 2; ly = y + R - 1; break;
      case 'ne': lx = x + c - 3; ly = y - c - h + 3; break;
      case 'se': lx = x + c - 3; ly = y + c - 3; break;
      case 'nw': lx = x - c + 3 - w; ly = y - c - h + 3; break;
      case 'sw': lx = x - c + 3 - w; ly = y + c - 3; break;
      default: lx = x + R - 1; ly = y - h / 2;
    }
    return (
      `<g class="d-tag"><rect x="${f(lx)}" y="${f(ly)}" width="${f(w)}" height="${h}" rx="4" fill="${YELLOW}" stroke="${INK}" stroke-width="0.9"/>` +
      T(lx + w / 2, ly + h / 2 + 4.4, tag, { size: fs, w: 700, mono: true, a: 'middle', fill: NAVY }) +
      '</g>'
    );
  }

  // Burbuja ISA. shared → función en RTU/SCADA (círculo en cuadro con línea).
  function bubble(x, y, isa, o) {
    o = o || {};
    const sp = splitIsa(isa);
    const loop = o.loop != null ? o.loop : sp.num;
    // plain → muestra de la leyenda: sin lazo ni interacción
    let s = o.plain ? '<g class="d-ib">' : `<g class="d-ib lp${o.cls ? ' ' + o.cls : ''}" data-loop="${esc(loop)}" data-isa="${esc(isa)}"`;
    if (o.ix && !o.plain) s += ` tabindex="0" role="button" aria-label="${esc(o.aria || isa)}"`;
    if (!o.plain) s += '>';
    if (o.ix) s += `<circle cx="${f(x)}" cy="${f(y)}" r="${o.shared ? 33 : 29}" class="d-ring"/>`;
    if (o.tag) s += tagLabel(x, y, o.tag, o.tp);
    if (o.shared) s += `<rect x="${f(x - 24)}" y="${f(y - 24)}" width="48" height="48" class="d-sym"/>`;
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${R}" class="d-sym d-bc"/>`;
    if (o.shared) s += `<path d="M${f(x - R)} ${f(y)}H${f(x + R)}" class="d-ln"/>`;
    s += T(x, y - 2.5, sp.letters, { w: 700, mono: true, a: 'middle', cls: 'd-bt' });
    s += T(x, y + 14.5, sp.num, { w: 700, mono: true, a: 'middle', cls: 'd-bt' });
    return s + '</g>';
  }

  // Recipiente horizontal (cabezas semielípticas) con nivel de líquido.
  function vesselShape(id, L, Rr, Tt, B, rx, nll, liq) {
    const ry = (B - Tt) / 2;
    const d = `M${f(L + rx)} ${f(Tt)}H${f(Rr - rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(Rr - rx)} ${f(B)}H${f(L + rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(L + rx)} ${f(Tt)}Z`;
    return {
      d,
      fill:
        `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>` +
        `<path d="${d}" fill="#fff"/>` +
        `<rect x="${f(L)}" y="${f(nll)}" width="${f(Rr - L)}" height="${f(B - nll)}" fill="${liq}" fill-opacity="0.17" clip-path="url(#${id})"/>` +
        `<path d="M${f(L)} ${f(nll)}H${f(Rr)}" class="d-int" clip-path="url(#${id})"/>`,
      outline:
        `<path d="M${f(L + rx)} ${f(Tt)}V${f(B)}M${f(Rr - rx)} ${f(Tt)}V${f(B)}" class="d-ln d-seam"/>` +
        `<path d="${d}" class="d-vessel"/>`,
    };
  }

  /* ================================================================
     4 · Contexto de dibujo del proceso (capas en orden z)
     ================================================================ */
  function newBuckets() {
    return { conn: [], case: [], core: [], anim: [], arr: [], sym: [], txt: [], sig: [], loop: [], sys: [], inst: [] };
  }

  function pipe(b, p, kind, flow) {
    const d = dPath(p);
    b.case.push(`<path d="${d}" class="d-pc"/>`);
    b.core.push(`<path d="${d}" class="d-core" stroke="${streamColors()[kind]}"/>`);
    if (flow !== false) b.anim.push(`<path d="${d}" class="d-fa d-fa-${kind}"/>`);
  }
  const arrows = (b, list) => list.forEach((a) => b.arr.push(flowArrow(a[0], a[1], a[2])));
  const sigLine = (b, p, loops, bucket) =>
    b[bucket || 'sig'].push(`<path d="${dPath(p)}" class="d-sg lp" data-loop="${esc(loops)}"/>`);
  const sigDot = (b, x, y, loops, bucket) =>
    b[bucket || 'sig'].push(`<circle cx="${f(x)}" cy="${f(y)}" r="3.2" fill="${SIG}" class="lp" data-loop="${esc(loops)}"/>`);
  const connLine = (b, p, loop) => b.conn.push(`<path d="${dPath(p)}" class="d-cn lp" data-loop="${esc(loop)}"/>`);
  const lpWrap = (loop, inner) => `<g class="lp" data-loop="${esc(loop)}">${inner}</g>`;

  // Ranuras de transmisores: se buscan en WT.config por ISA y, si no
  // aparecen, por tag de campo. El número de lazo sale del ISA configurado.
  const SLOTS = [
    ['PIT-101', 'TDP'],
    ['PIT-102', 'TPL'],
    ['PIT-103', 'TPS'],
    ['TIT-104', 'TT'],
    ['LIT-105', 'TN'],
    ['FIT-106', 'CORIOLIS'],
    ['PDIT-107', 'TDG'],
    ['PIT-108', 'TDM'],
  ];
  function resolveInstruments() {
    const list = insts();
    const out = {};
    SLOTS.forEach(([key, tag]) => {
      const it = list.find((i) => i.isa === key) || list.find((i) => i.tag === tag) || null;
      const isa = it ? it.isa : key;
      out[key] = { it, isa, tag: it ? it.tag : tag, num: splitIsa(isa).num || splitIsa(key).num };
    });
    return out;
  }

  // Dibuja un transmisor de campo según su ranura.
  //   s = { x, y, tp, conn: [[...]], sig: [[...]] | null }
  function transmitter(b, I, key, s, ix) {
    const r = I[key];
    if (!r || !r.it) return; // eliminado de config → no se dibuja
    const it = r.it;
    (s.conn || []).forEach((c) => connLine(b, c, r.num));
    if (s.sig) sigLine(b, s.sig, r.num);
    b.inst.push(
      bubble(s.x, s.y, r.isa, {
        tag: it.tag,
        tp: s.tp,
        ix,
        aria: `${it.tag} · ${r.isa} · ${it.nombre || ''}`,
      })
    );
  }

  // Árbol de válvulas (ala de producción a la derecha). Devuelve nada:
  // escribe en los cubos. cx = eje, yW = altura de las alas.
  function tree(b, cx, yW) {
    const pz = cfg().pozo || {};
    const viaTR = String(pz.aparejo || 'TP').toUpperCase() === 'TR';
    // Cuerpo: cabezal TR → maestras → cruz → sondeo → tapa
    pipe(b, [[cx, yW + 133], [cx, yW]], 'mezcla', !viaTR);
    pipe(b, [[cx, yW], [cx, yW - 90]], 'mezcla', false);
    pipe(b, [[cx, yW], [cx - 80, yW]], 'mezcla', false);
    // Salida TR (alterna) → se une al ala TP antes del estrangulador
    pipe(b, [[cx + 42, yW + 148], [cx + 92, yW + 148], [cx + 92, yW]], 'mezcla', viaTR);
    // Pozo y terreno
    let ground = `<path d="M${f(cx - 9)} ${f(yW + 163)}V${f(yW + 212)}M${f(cx + 9)} ${f(yW + 163)}V${f(yW + 212)}" class="d-ln"/>`;
    ground += `<path d="M${f(cx - 62)} ${f(yW + 187)}H${f(cx + 62)}" class="d-ln d-thk"/>`;
    let hatch = '';
    for (let x = cx - 58; x <= cx + 54; x += 9) {
      if (Math.abs(x - cx) < 14) continue;
      hatch += `M${f(x)} ${f(yW + 188)}l-7 9`;
    }
    ground += `<path d="${hatch}" class="d-ln d-hair"/>`;
    b.sym.push(`<g class="nl">${ground}</g>`);
    // Cabezal TR, tapa y cruz
    let s = '';
    s += `<rect x="${f(cx - 42)}" y="${f(yW + 133)}" width="84" height="30" class="d-sym d-eq"/>`;
    s += `<rect x="${f(cx - 15)}" y="${f(yW - 104)}" width="30" height="14" class="d-sym d-eq"/>`;
    s += gateValve(cx, yW - 62, { vert: true }); // sondeo
    s += gateValve(cx, yW + 55, { vert: true }); // maestra superior
    s += gateValve(cx, yW + 107, { vert: true }); // maestra inferior
    s += gateValve(cx - 48, yW, { closed: true }); // lateral (matar)
    s += gateValve(cx + 48, yW, { closed: viaTR }); // lateral de producción (TP)
    s += gateValve(cx + 66, yW + 148, { closed: !viaTR }); // salida TR
    s += blind(cx - 80, yW);
    s += `<rect x="${f(cx - 9)}" y="${f(yW - 9)}" width="18" height="18" class="d-sym d-eq"/>`;
    b.sym.push(`<g class="nl">${s}</g>`);
    // Rótulos del árbol
    let t = '';
    const g = { fill: GREY, a: 'end' };
    t += T(cx - 22, yW - 93, 'Tapa', g);
    t += T(cx - 20, yW - 57, 'Sondeo', g);
    t += T(cx - 64, yW - 17, 'Lateral', { fill: GREY, a: 'middle' });
    t += T(cx - 20, yW + 60, 'Maestra sup.', g);
    t += T(cx - 20, yW + 112, 'Maestra inf.', g);
    t += T(cx - 50, yW + 153, 'Cabezal TR', g);
    t += T(cx + 48, yW - 15, 'TP', { w: 700, a: 'middle' });
    t += T(cx + 66, yW + 177, 'TR', { w: 700, a: 'middle' });
    t += T(cx, yW + 232, ('Pozo ' + (pz.nombre || '')).toUpperCase(), { size: 15, w: 700, a: 'middle', ls: 0.3 });
    t += T(cx, yW + 250, 'Árbol de válvulas', { a: 'middle', fill: GREY });
    b.txt.push(t);
    return viaTR;
  }

  // Internos del separador (línea discontinua) + rótulos.
  function internals(o) {
    // o: { defl: [x, y1, y2], mist: [x, y, w, h], gasLbl, liqLbl, nllLbl }
    let s = '';
    const [dx, dy1, dy2] = o.defl;
    s += `<path d="M${f(dx)} ${f(dy1)}V${f(dy2)}M${f(dx)} ${f(dy1)}l-10 -8" class="d-int d-int2"/>`;
    const [mx, my, mw, mh] = o.mist;
    s += `<rect x="${f(mx)}" y="${f(my)}" width="${f(mw)}" height="${f(mh)}" class="d-int"/>`;
    let z = `M${f(mx)} ${f(my + mh)}`;
    for (let i = 1; i <= 8; i++) z += `L${f(mx + (mw * i) / 8)} ${f(i % 2 ? my : my + mh)}`;
    s += `<path d="${z}" class="d-int d-hair"/>`;
    return s;
  }

  /* ================================================================
     5 · Proceso — hoja horizontal (coordenadas de hoja 1920 × 1080)
     ================================================================ */
  function processH(ix, keep) {
    const b = newBuckets();
    const I = resolveInstruments();
    const pz = cfg().pozo || {};
    const eq = cfg().equipo || {};
    const col = streamColors();
    const yW = 385;
    const cx = 170;
    const nP = I['PIT-103'].num;
    const nL = I['LIT-105'].num;
    const nF = I['FIT-106'].num;
    const nG = I['PDIT-107'].num;
    const ALL = SLOTS.map(([k]) => I[k].num).join(' ');

    /* --- 1. Árbol, estrangulador y línea de entrada --- */
    const viaTR = tree(b, cx, yW);
    pipe(b, [[cx, yW], [542, yW]], 'mezcla');
    if (viaTR) arrows(b, [[cx + 92, yW + 90, 'u']]);
    else arrows(b, [[cx, yW + 82, 'u']]);
    arrows(b, [[281, yW, 'r'], [415, yW, 'r'], [516, yW, 'r']]);
    b.sym.push(`<g class="nl">${choke(350, yW)}</g>`);
    b.txt.push(
      T(350, yW + 29, 'ESTRANGULADOR TP/TR', { w: 700, a: 'middle' }) +
        T(350, yW + 46, 'Ø ' + (pz.estrangulador || '—'), { a: 'middle', fill: GREY }) +
        T(480, yW + 29, 'LÍNEA DE ENTRADA', { w: 700, a: 'middle' }) +
        T(480, yW + 46, 'Mezcla multifásica', { a: 'middle', fill: GREY })
    );
    transmitter(b, I, 'PIT-101', { x: 300, y: 280, tp: 'w', conn: [[[300, yW], [300, 303]]], sig: [[300, 257], [300, 108]] }, ix);
    transmitter(b, I, 'PIT-102', { x: 470, y: 280, tp: 'w', conn: [[[470, yW], [470, 303]]], sig: [[470, 257], [470, 108]] }, ix);

    /* --- 2. Separador bifásico horizontal --- */
    const V = vesselShape('dti-h-ves', 540, 960, 330, 490, 42, 425, col.liquido);
    b.sym.push(`<g class="nl">${V.fill}${internals({ defl: [576, 362, 412], mist: [860, 340, 56, 24] })}${V.outline}</g>`);
    b.txt.push(
      T(588, 378, 'Deflector', { fill: GREY }) +
        T(852, 357, 'Extractor de niebla', { fill: GREY, a: 'end' }) +
        T(590, 420, 'NLL', { w: 700, mono: true }) +
        T(750, 380, 'Gas', { fill: GREY, a: 'middle' }) +
        T(750, 465, 'Líquido (aceite + agua)', { fill: GREY, a: 'middle' }) +
        T(750, 522, eq.seleccionado || '', { size: 22, w: 800, a: 'middle', ls: 0.5 }) +
        T(750, 541, 'SEPARADOR BIFÁSICO HORIZONTAL', { w: 700, a: 'middle', ls: 0.3 })
    );
    transmitter(b, I, 'TIT-104', { x: 640, y: 280, tp: 'w', conn: [[[640, 330], [640, 303]]], sig: [[640, 257], [640, 108]] }, ix);
    transmitter(b, I, 'PIT-103', { x: 770, y: 280, tp: 'w', conn: [[[770, 330], [770, 303]]], sig: [[770, 257], [770, 108]] }, ix);

    /* --- 3. Salida de gas: FE-107 / PDIT-107 → PCV-103 --- */
    pipe(b, [[888, 330], [888, 225], [1440, 225], [1440, 450]], 'gas');
    arrows(b, [[888, 288, 'u'], [945, 225, 'r'], [1205, 225, 'r'], [1350, 225, 'r'], [1440, 330, 'd']]);
    b.sym.push(lpWrap(nG, orifice(1020, 225)));
    b.txt.push(
      `<g class="lp" data-loop="${nG}">${T(1020, 200, 'FE-' + nG, { w: 700, mono: true, a: 'middle' })}</g>` +
        T(1155, 212, 'SALIDA DE GAS', { w: 700, a: 'middle' })
    );
    transmitter(
      b, I, 'PDIT-107',
      { x: 1020, y: 292, tp: 'w', conn: [[[1012, 225], [1012, 270.6]], [[1028, 225], [1028, 270.6]]], sig: [[1043, 292], [1390, 292]] },
      ix
    );
    b.sym.push(lpWrap(nP, controlValve(1290, 225)));
    b.txt.push(`<g class="lp" data-loop="${nP}">${T(1290, 256, 'PCV-' + nP, { w: 700, mono: true, a: 'middle' })}</g>`);
    // Lazo de presión: PIT-103 → PIC-103 → PCV-103
    if (I['PIT-103'].it) sigLine(b, [[793, 280], [810, 280], [810, 150], [1267, 150]], nP, 'loop');
    sigLine(b, [[1290, 173], [1290, 186]], nP, 'loop');
    b.loop.push(bubble(1290, 150, 'PIC-' + nP, { ix, aria: `PIC-${nP} · controlador de presión` }));

    /* --- 4. Salida de líquido: Coriolis FIT-106 → LCV-105 --- */
    pipe(b, [[888, 490], [888, 560], [1440, 560], [1440, 450]], 'liquido');
    arrows(b, [[888, 530, 'd'], [1180, 560, 'r'], [1352, 560, 'r'], [1440, 510, 'u']]);
    b.sym.push(lpWrap(nF, coriolis(1080, 560)));
    b.txt.push(
      `<g class="lp" data-loop="${nF}">` +
        T(1112, 529, 'Promass 300 · E+H', { w: 700 }) +
        T(1112, 545, 'masa · densidad · % agua', { fill: GREY }) +
        '</g>' +
        T(900, 592, 'SALIDA DE LÍQUIDO', { w: 700 })
    );
    transmitter(b, I, 'FIT-106', { x: 1080, y: 625, tp: 'w', conn: [[[1080, 574], [1080, 602]]], sig: [[1103, 625], [1390, 625]] }, ix);
    b.sym.push(lpWrap(nL, controlValve(1290, 560)));
    b.txt.push(`<g class="lp" data-loop="${nL}">${T(1290, 592, 'LCV-' + nL, { w: 700, mono: true, a: 'middle' })}</g>`);
    // Cámara de nivel en la cabeza derecha: LG y LIT
    let ch = `<path d="M952.7 365H985M945.8 470H985" class="d-cn"/>`;
    ch += `<rect x="985" y="356" width="10" height="124" class="d-sym"/>`;
    ch += `<path d="M995 365H1027M995 470H1027" class="d-cn"/>`;
    b.conn.push(lpWrap(nL, ch));
    b.inst.push(bubble(1050, 365, 'LG-' + nL, { ix, aria: `LG-${nL} · indicador de nivel local` }));
    transmitter(b, I, 'LIT-105', { x: 1050, y: 470, tp: 's', conn: [], sig: [[1050, 447], [1050, 420], [1390, 420]] }, ix);
    // Lazo de nivel: LIT-105 → LIC-105 → LCV-105
    if (I['LIT-105'].it) sigLine(b, [[1073, 470], [1267, 470]], nL, 'loop');
    sigLine(b, [[1290, 493], [1290, 521]], nL, 'loop');
    b.loop.push(bubble(1290, 470, 'LIC-' + nL, { ix, aria: `LIC-${nL} · controlador de nivel` }));

    /* --- 5. Reincorporación y línea a batería --- */
    pipe(b, [[1440, 450], [1765, 450]], 'mezcla');
    arrows(b, [[1490, 450, 'r'], [1660, 450, 'r']]);
    b.sym.push(`<g class="nl">${offSheet(1765, 450, 115, 36, 'A BATERÍA', 'r', 14)}</g>`);
    b.txt.push(
      T(1452, 478, 'LÍNEA DE SALIDA HACIA BATERÍA', { w: 700 }) +
        T(1452, 495, 'Gas y líquido reincorporados (tee)', { fill: GREY }) +
        `<rect x="1600" y="514" width="280" height="56" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` +
        `<rect x="1600" y="514" width="7" height="56" fill="${YELLOW}"/>` +
        T(1620, 537, 'CIRCUITO CERRADO', { size: 16, w: 800, ls: 0.6 }) +
        T(1620, 557, 'No se ventea a la atmósfera', { size: 14, w: 600 })
    );
    transmitter(b, I, 'PIT-108', { x: 1540, y: 375, tp: 'e', conn: [[[1540, 450], [1540, 398]]], sig: [[1540, 352], [1540, 300]] }, ix);

    /* --- 6. Señales: troncal superior + bajante interior → RTU --- */
    // Solo se dibujan las derivaciones de los transmisores presentes en config.
    const has = (k) => !!I[k].it;
    const inner = [['FIT-106', 625], ['LIT-105', 420], ['PDIT-107', 292]].filter(([k]) => has(k));
    const drops = [['PIT-101', 300], ['PIT-102', 470], ['TIT-104', 640], ['PIT-103', 770]].filter(([k]) => has(k)).map((d) => d[1]);
    if (inner.length) drops.push(1390);
    if (drops.length) {
      sigLine(b, [[drops[0], 108], [1520, 108], [1520, 124]], ALL);
      drops.slice(1).forEach((x) => sigDot(b, x, 108, ALL));
    }
    if (inner.length) {
      const loops = inner.map(([k]) => I[k].num).join(' ');
      sigLine(b, [[1390, inner[0][1]], [1390, 108]], loops);
      inner.slice(1).forEach(([, y]) => sigDot(b, 1390, y, loops));
    }
    b.txt.push(T(318, 100, 'SEÑALES DE CAMPO AL RTU', { w: 700, fill: SIG, ls: 0.5 }));

    /* --- 7. RTU y SCADA --- */
    b.sys.push(systemBlocks({
      rtu: [1470, 124, 180, 176],
      scada: [1690, 124, 190, 176],
      fy: [1503, 230],
      fq6: [1723, 202],
      fq7: [1723, 266],
      link: [1650, 230, 1690],
      loops: { all: ALL, gas: nG, liq: nF },
      ix,
      sig: keep.sig,
    }));
    return b;
  }

  /* ================================================================
     6 · Proceso — hoja vertical (unidades virtuales, escala V_K)
     ================================================================ */
  function processV(ix, keep) {
    const b = newBuckets();
    const I = resolveInstruments();
    const pz = cfg().pozo || {};
    const eq = cfg().equipo || {};
    const col = streamColors();
    const yW = 260;
    const cx = 130;
    const nP = I['PIT-103'].num;
    const nL = I['LIT-105'].num;
    const nF = I['FIT-106'].num;
    const nG = I['PDIT-107'].num;
    const ALL = SLOTS.map(([k]) => I[k].num).join(' ');

    /* --- 1. Árbol, estrangulador y línea de entrada --- */
    const viaTR = tree(b, cx, yW);
    pipe(b, [[cx, yW], [501, yW]], 'mezcla');
    if (viaTR) arrows(b, [[cx + 92, yW + 90, 'u']]);
    else arrows(b, [[cx, yW + 82, 'u']]);
    arrows(b, [[300, yW, 'r'], [385, yW, 'r'], [476, yW, 'r']]);
    b.sym.push(`<g class="nl">${choke(335, yW)}</g>`);
    b.txt.push(
      T(340, yW + 31, 'ESTRANGULADOR TP/TR', { w: 700, a: 'middle' }) +
        T(340, yW + 48, 'Ø ' + (pz.estrangulador || '—'), { a: 'middle', fill: GREY }) +
        T(412, yW - 27, 'LÍNEA DE ENTRADA', { w: 700, a: 'middle' }) +
        T(412, yW - 11, 'Mezcla multifásica', { a: 'middle', fill: GREY })
    );
    transmitter(b, I, 'PIT-101', { x: 262, y: 370, tp: 'e', conn: [[[262, yW], [262, 347]]], sig: [[262, 393], [262, 570]] }, ix);
    transmitter(b, I, 'PIT-102', { x: 430, y: 370, tp: 'w', conn: [[[430, yW], [430, 347]]], sig: [[430, 393], [430, 570]] }, ix);

    /* --- 2. Separador --- */
    const V = vesselShape('dti-v-ves', 500, 920, 195, 355, 42, 300, col.liquido);
    b.sym.push(`<g class="nl">${V.fill}${internals({ defl: [534, 236, 288], mist: [832, 205, 56, 24] })}${V.outline}</g>`);
    b.txt.push(
      T(546, 252, 'Deflector', { fill: GREY }) +
        T(824, 222, 'Extractor de niebla', { fill: GREY, a: 'end' }) +
        T(548, 295, 'NLL', { w: 700, mono: true }) +
        T(710, 250, 'Gas', { fill: GREY, a: 'middle' }) +
        T(710, 337, 'Líquido (aceite + agua)', { fill: GREY, a: 'middle' }) +
        T(735, 161, eq.seleccionado || '', { size: 22, w: 800, a: 'middle', ls: 0.5 }) +
        T(735, 181, 'SEPARADOR BIFÁSICO HORIZONTAL', { w: 700, a: 'middle', ls: 0.3 })
    );
    transmitter(b, I, 'PIT-103', { x: 590, y: 125, tp: 'e', conn: [[[590, 195], [590, 148]]], sig: [[567, 125], [478, 125], [478, 570]] }, ix);
    transmitter(b, I, 'TIT-104', { x: 600, y: 420, tp: 'e', conn: [[[600, 355], [600, 397]]], sig: [[600, 443], [600, 570]] }, ix);

    /* --- 3. Gas: sube, cruza y baja por la derecha --- */
    pipe(b, [[860, 195], [860, 90], [1120, 90], [1120, 740], [860, 740]], 'gas');
    arrows(b, [[860, 150, 'u'], [990, 90, 'r'], [1120, 330, 'd'], [1120, 640, 'd'], [990, 740, 'l']]);
    b.sym.push(lpWrap(nG, orifice(1120, 190, true)));
    b.txt.push(
      `<g class="lp" data-loop="${nG}">${T(1140, 195, 'FE-' + nG, { w: 700, mono: true })}</g>` +
        `<g transform="translate(1146 330) rotate(90)">${T(0, 0, 'SALIDA DE GAS', { w: 700, a: 'middle' })}</g>`
    );
    transmitter(
      b, I, 'PDIT-107',
      { x: 1040, y: 180, tp: 'w', conn: [[[1120, 172], [1061.6, 172]], [[1120, 188], [1061.6, 188]]], sig: [[1040, 203], [1040, 214], [1075, 214]] },
      ix
    );
    b.sym.push(lpWrap(nP, controlValve(1120, 470, { vert: true, act: 'right' })));
    b.txt.push(`<g class="lp" data-loop="${nP}">${T(1138, 506, 'PCV-' + nP, { w: 700, mono: true })}</g>`);
    if (I['PIT-103'].it) sigLine(b, [[590, 102], [590, 50], [1210, 50], [1210, 447]], nP, 'loop');
    sigLine(b, [[1187, 470], [1159, 470]], nP, 'loop');
    b.loop.push(bubble(1210, 470, 'PIC-' + nP, { ix, aria: `PIC-${nP} · controlador de presión` }));

    /* --- 4. Líquido: baja por el eje x = 860 --- */
    pipe(b, [[860, 355], [860, 740]], 'liquido');
    arrows(b, [[860, 425, 'd'], [860, 568, 'd'], [860, 690, 'd']]);
    b.sym.push(lpWrap(nF, coriolis(860, 500, true)));
    b.txt.push(
      `<g class="lp" data-loop="${nF}">` +
        T(842, 549, 'Promass 300 · E+H', { w: 700, a: 'end' }) +
        T(842, 565, 'masa · densidad · % agua', { fill: GREY, a: 'end' }) +
        '</g>' +
        `<g transform="translate(846 420) rotate(-90)">${T(0, 0, 'SALIDA DE LÍQUIDO', { w: 700, a: 'middle' })}</g>`
    );
    transmitter(b, I, 'FIT-106', { x: 775, y: 500, tp: 'n', conn: [[[846, 500], [798, 500]]], sig: [[752, 500], [690, 500], [690, 570]] }, ix);
    b.sym.push(lpWrap(nL, controlValve(860, 620, { vert: true, act: 'right' })));
    b.txt.push(`<g class="lp" data-loop="${nL}">${T(838, 625, 'LCV-' + nL, { w: 700, mono: true, a: 'end' })}</g>`);
    // Cámara de nivel en la cabeza derecha
    let ch = `<path d="M915.8 240H950M908.5 330H950" class="d-cn"/>`;
    ch += `<rect x="950" y="230" width="10" height="110" class="d-sym"/>`;
    ch += `<path d="M960 250H982M960 330H982" class="d-cn"/>`;
    b.conn.push(lpWrap(nL, ch));
    b.inst.push(bubble(1005, 250, 'LG-' + nL, { ix, aria: `LG-${nL} · indicador de nivel local` }));
    transmitter(b, I, 'LIT-105', { x: 1005, y: 330, tp: 'se', conn: [], sig: [[1028, 330], [1075, 330]] }, ix);
    if (I['LIT-105'].it) sigLine(b, [[1005, 353], [1005, 597]], nL, 'loop');
    sigLine(b, [[982, 620], [899, 620]], nL, 'loop');
    b.loop.push(bubble(1005, 620, 'LIC-' + nL, { ix, aria: `LIC-${nL} · controlador de nivel` }));

    /* --- 5. Reincorporación (tee en x = 860) y línea a batería --- */
    pipe(b, [[860, 740], [860, 945]], 'mezcla');
    arrows(b, [[860, 783, 'd'], [860, 905, 'd']]);
    b.sym.push(`<g class="nl">${offSheet(860, 945, 118, 56, 'A BATERÍA', 'd', 14)}</g>`);
    b.txt.push(
      T(880, 784, 'LÍNEA DE SALIDA HACIA BATERÍA', { w: 700 }) +
        T(880, 801, 'Gas y líquido reincorporados (tee)', { fill: GREY }) +
        `<rect x="905" y="866" width="300" height="58" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` +
        `<rect x="905" y="866" width="7" height="58" fill="${YELLOW}"/>` +
        T(925, 890, 'CIRCUITO CERRADO', { size: 16, w: 800, ls: 0.6 }) +
        T(925, 911, 'No se ventea a la atmósfera', { size: 14, w: 600 })
    );
    transmitter(b, I, 'PIT-108', { x: 775, y: 830, tp: 'n', conn: [[[860, 830], [798, 830]]], sig: [[752, 830], [720, 830]] }, ix);

    /* --- 6. Señales: colector inferior + bajante interior → RTU --- */
    // Solo se dibujan las derivaciones de los transmisores presentes en config.
    const has = (k) => !!I[k].it;
    const xs = [['PIT-101', 262], ['PIT-102', 430], ['PIT-103', 478], ['TIT-104', 600], ['FIT-106', 690]].filter(([k]) => has(k)).map((d) => d[1]);
    const x0 = Math.min.apply(null, xs.concat(540));
    const x1 = Math.max.apply(null, xs.concat(540));
    sigLine(b, [[x0, 570], [x1, 570]], ALL);
    sigLine(b, [[540, 570], [540, 640]], ALL);
    xs.concat(540).filter((x) => x !== x0 && x !== x1).forEach((x) => sigDot(b, x, 570, ALL));
    const inner = [['PDIT-107', 214], ['LIT-105', 330]].filter(([k]) => has(k));
    if (inner.length) {
      const loops = inner.map(([k]) => I[k].num).join(' ');
      sigLine(b, [[1075, inner[0][1]], [1075, 700], [720, 700]], loops);
      inner.slice(1).forEach(([, y]) => sigDot(b, 1075, y, loops));
    }
    b.txt.push(T(272, 562, 'SEÑALES DE CAMPO AL RTU', { w: 700, fill: SIG, ls: 0.5 }));

    /* --- 7. RTU y SCADA --- */
    b.sys.push(systemBlocks({
      rtu: [380, 640, 340, 200],
      scada: [40, 640, 300, 200],
      fy: [430, 756],
      fq6: [86, 728],
      fq7: [86, 798],
      link: [340, 740, 380],
      loops: { all: ALL, gas: nG, liq: nF },
      ix,
      sig: keep.sig,
    }));
    return b;
  }

  // Bloques RTU (con FY) y SCADA (con FQI) + enlace de datos.
  function systemBlocks(o) {
    const sys = cfg().sistema || {};
    const nG = o.loops.gas;
    const nF = o.loops.liq;
    let s = '';
    const block = (r, t1, t2) => {
      const [x, y, w, h] = r;
      return (
        `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#fff" stroke="${INK}" stroke-width="1.8"/>` +
        `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="44" fill="${NAVY}"/>` +
        `<rect x="${f(x)}" y="${f(y + 44)}" width="${f(w)}" height="3" fill="${YELLOW}"/>` +
        T(x + 12, y + 19, t1, { size: 16, w: 800, fill: YELLOW, ls: 0.6 }) +
        T(x + 12, y + 37, t2, { w: 600, fill: '#fff' })
      );
    };
    // RTU
    const [rx, , rw] = o.rtu;
    s += `<g class="lp" data-loop="${esc(o.loops.all)}">${block(o.rtu, 'RTU', sys.rtu || 'RTU')}</g>`;
    const fyx = o.fy[0];
    const fyy = o.fy[1];
    s += bubble(fyx, fyy, 'FY-' + nG, { shared: true, ix: o.ix, loop: nG, aria: `FY-${nG} · cálculo de gasto de gas` });
    s += `<g class="lp" data-loop="${nG}">${TL(fyx + 34, fyy - 4, wrap('Cálculo de gasto de gas por placa de orificio', rx + rw - fyx - 44, 13, 500), 16, {})}</g>`;
    // SCADA
    const [sx, , sw] = o.scada;
    s += `<g class="lp" data-loop="${esc(o.loops.all)}">${block(o.scada, 'SCADA ' + (sys.scada || ''), sys.pc || 'PC de medición en campo')}</g>`;
    const tw = sx + sw - o.fq6[0] - 44;
    s += bubble(o.fq6[0], o.fq6[1], 'FQI-' + nF, { shared: true, ix: o.ix, loop: nF, aria: `FQI-${nF} · acumulados de líquido` });
    s += `<g class="lp" data-loop="${nF}">${TL(o.fq6[0] + 34, o.fq6[1] - 4, wrap('Acumulados Q mezcla / aceite / agua', tw, 13, 500), 16, {})}</g>`;
    s += bubble(o.fq7[0], o.fq7[1], 'FQI-' + nG, { shared: true, ix: o.ix, loop: nG, aria: `FQI-${nG} · acumulado de gas` });
    s += `<g class="lp" data-loop="${nG}">${TL(o.fq7[0] + 34, o.fq7[1] + 4, wrap('Acumulado Q gas', tw, 13, 500), 16, {})}</g>`;
    // Enlace RTU ↔ SCADA
    if (o.sig) s += `<g class="ly-sig lp" data-loop="${esc(o.loops.all)}">${dataLink(o.link[0], o.link[1], o.link[2])}</g>`;
    return s;
  }

  // Ensambla los cubos del proceso en orden z. keep: capas que se incluyen
  // (en pantalla van todas y se encienden/apagan con clases).
  function assembleProcess(b, keep) {
    return (
      `<g class="nl">${b.conn.join('')}</g>` +
      `<g class="nl">${b.case.join('')}${b.core.join('')}</g>` +
      (keep.anim ? `<g class="ly-anim nl">${b.anim.join('')}</g>` : '') +
      `<g class="nl">${b.arr.join('')}</g>` +
      `<g>${b.sym.join('')}</g>` +
      `<g class="nl">${b.txt.join('')}</g>` +
      (keep.sig ? `<g class="ly-sig">${b.sig.join('')}</g>` : '') +
      (keep.loop ? `<g class="ly-loop">${b.loop.join('')}</g>` : '') +
      `<g>${b.sys.join('')}</g>` +
      `<g>${b.inst.join('')}</g>`
    );
  }

  /* ================================================================
     7 · Mobiliario de la hoja: marco, zonas, encabezado, leyenda,
         tabla, notas y cajetín
     ================================================================ */
  function frame(W, H, o) {
    // o: { out, inn, cols, rows, fs, head, headFs }
    const { out, inn, cols, rows, fs } = o;
    let s = `<rect width="${W}" height="${H}" fill="#fff"/>`;
    s += `<rect x="${out}" y="${out}" width="${W - 2 * out}" height="${H - 2 * out}" fill="none" stroke="${INK}" stroke-width="1"/>`;
    s += `<rect x="${inn}" y="${inn}" width="${W - 2 * inn}" height="${H - 2 * inn}" fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    const iw = W - 2 * inn;
    const ih = H - 2 * inn;
    const mid = (out + inn) / 2;
    let ticks = '';
    let labels = '';
    for (let i = 0; i < cols; i++) {
      const x0 = inn + (iw * i) / cols;
      const xc = x0 + iw / cols / 2;
      if (i) ticks += `M${f(x0)} ${out}V${inn}M${f(x0)} ${H - inn}V${H - out}`;
      labels += T(xc, mid + fs * 0.36, String(i + 1), { size: fs, w: 600, a: 'middle', fill: GREY });
      labels += T(xc, H - mid + fs * 0.36, String(i + 1), { size: fs, w: 600, a: 'middle', fill: GREY });
    }
    for (let j = 0; j < rows; j++) {
      const y0 = inn + (ih * j) / rows;
      const yc = y0 + ih / rows / 2;
      const L = String.fromCharCode(65 + j);
      if (j) ticks += `M${out} ${f(y0)}H${inn}M${W - inn} ${f(y0)}H${W - out}`;
      labels += T(mid, yc + fs * 0.36, L, { size: fs, w: 600, a: 'middle', fill: GREY });
      labels += T(W - mid, yc + fs * 0.36, L, { size: fs, w: 600, a: 'middle', fill: GREY });
    }
    s += `<path d="${ticks}" stroke="${INK}" stroke-width="1"/>` + labels;
    return s;
  }

  function header(W, inn, h, o) {
    const sys = cfg().empresa || {};
    let s = `<rect x="${inn}" y="${inn}" width="${W - 2 * inn}" height="${h}" fill="${NAVY}"/>`;
    s += `<rect x="${inn}" y="${inn + h}" width="200" height="4" fill="${YELLOW}"/>`;
    s += `<rect x="${inn + 200}" y="${inn + h}" width="64" height="4" fill="${SKY}"/>`;
    const y = inn + h / 2 + o.fs1 * 0.36;
    const t1 = 'DTI SIMPLIFICADO';
    s += T(inn + 16, y, t1, { size: o.fs1, w: 800, fill: YELLOW, ls: 0.8 });
    const x2 = inn + 16 + textW(t1, o.fs1, 800) + 0.8 * t1.length + 14;
    s += T(x2, y, o.title, { size: o.fs2, w: 600, fill: '#fff', ls: 0.4 });
    s += T(W - inn - 16, y, `${(sys.servicio || 'Well Testing').toUpperCase()} · ${(sys.servicioEs || 'Aforo de pozos').toUpperCase()}`, {
      size: o.fs3, w: 700, fill: SKY, a: 'end', ls: 1.2,
    });
    return s;
  }

  // Caja de sección con franja de título.
  function sectionBox(x, y, w, h, title, fs) {
    const th = Math.round(fs * 1.9);
    return {
      th,
      s:
        `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` +
        `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${th}" fill="${NAVY}"/>` +
        `<rect x="${f(x)}" y="${f(y)}" width="5" height="${th}" fill="${YELLOW}"/>` +
        T(x + 14, y + th / 2 + fs * 0.36, title.toUpperCase(), { size: fs, w: 700, fill: '#fff', ls: 1.2 }),
    };
  }

  // Símbolos de la leyenda dibujados alrededor de (0, 0).
  function legendItems(id) {
    const c = streamColors();
    const smp = (kind) =>
      `<path d="M-28 0H28" class="d-pc"/><path d="M-28 0H28" class="d-core" stroke="${c[kind]}"/>`;
    return [
      ['Válvula de compuerta abierta / cerrada', () => gateValve(-16, 0, { noBack: true }) + gateValve(16, 0, { closed: true, noBack: true })],
      ['Válvula de control (actuador de diafragma)', () => controlValve(0, 12, { noBack: true })],
      ['Estrangulador ajustable', () => choke(-1, 2, { noBack: true })],
      ['Placa de orificio', () => `<path d="M-28 0H28" class="d-ln"/>` + orifice(0, 0)],
      ['Medidor másico Coriolis', () => `<path d="M-30 0H30" class="d-ln"/>` + coriolis(0, 0)],
      ['Instrumento discreto en campo', () => bubble(0, 0, 'PIT-101', { plain: true })],
      ['Función en RTU / SCADA', () => bubble(0, 0, 'FY-107', { shared: true, plain: true })],
      ['Recipiente a presión con internos', () => {
        const v = vesselShape('dti-lg-ves-' + id, -30, 30, -14, 14, 9, 3, c.liquido);
        return v.fill + v.outline;
      }],
      ['Línea de mezcla multifásica', () => smp('mezcla')],
      ['Línea de gas', () => smp('gas')],
      ['Línea de líquido (aceite + agua)', () => smp('liquido')],
      ['Señal eléctrica', () => `<path d="M-28 0H28" class="d-sg"/>`],
      ['Conexión a proceso', () => `<path d="M-28 0H28" class="d-cn"/>`],
      ['Enlace de datos', () => dataLink(-28, 0, 28)],
      ['Dirección de flujo', () => `<path d="M-28 0H28" class="d-ln"/>` + flowArrow(2, 0, 'r')],
      ['Conector fuera de hoja', () => offSheet(-26, 0, 52, 22, '', 'r', 11)],
      ['Tag de campo (SCADA)', () => tagLabel(-22, 0, 'TDP', 'e')],
      ['Brida ciega', () => `<path d="M-28 0H8" class="d-ln d-thk"/>` + blind(8, 0)],
    ];
  }

  function legend(x, y, w, h, o) {
    // o: { cols, rowH, fs, k, symW }
    const box = sectionBox(x, y, w, h, 'Simbología ISA-5.1', o.fs);
    let s = box.s;
    const items = legendItems(o.id);
    const rows = Math.ceil(items.length / o.cols);
    const colW = (w - 16) / o.cols;
    const top = y + box.th + 8;
    items.forEach((it, i) => {
      const c = Math.floor(i / rows);
      const r = i % rows;
      const x0 = x + 8 + c * colW;
      const cy = top + r * o.rowH + o.rowH / 2;
      const sym = it[1]();
      s += `<g transform="translate(${f(x0 + o.symW / 2)} ${f(cy)}) scale(${o.k})">${sym}</g>`;
      const lines = wrap(it[0], colW - o.symW - 10, o.fs, 500);
      const lh = o.fs + 2;
      const ty = cy - ((lines.length - 1) * lh) / 2 + o.fs * 0.36;
      s += TL(x0 + o.symW + 6, ty, lines, lh, { size: o.fs });
    });
    return s;
  }

  // Tabla de instrumentos (desde WT.config.instrumentos).
  function instTable(x, y, w, o) {
    // o: { fs, cols: [fracciones], lh, pad, h }
    const heads = ['Tag campo', 'ISA', 'Instrumento', 'Variable', 'Unidad', 'Ubicación'];
    const fr = o.cols;
    const sum = fr.reduce((a, b) => a + b, 0);
    const cw = fr.map((v) => (v / sum) * w);
    const cx = [];
    cw.reduce((acc, v, i) => ((cx[i] = acc), acc + v), x);
    const box = sectionBox(x, y, w, o.h, 'Tabla de instrumentos', o.fs);
    let s = box.s;
    let yy = y + box.th;
    // Encabezados
    const hh = o.fs + 12;
    s += `<rect x="${f(x)}" y="${f(yy)}" width="${f(w)}" height="${hh}" fill="#e8eef5"/>`;
    heads.forEach((hd, i) => {
      s += T(cx[i] + 8, yy + hh / 2 + o.fs * 0.36, hd.toUpperCase(), { size: o.fs, w: 700, ls: 0.6 });
    });
    yy += hh;
    s += `<path d="M${f(x)} ${f(yy)}H${f(x + w)}" stroke="${INK}" stroke-width="1"/>`;
    // Se parte cada celda y, si sobra alto en la caja, se reparte entre las filas.
    const rowsData = insts().map((it) => {
      const cells = [null, it.isa, it.nombre, it.variable, it.unidad, it.ubicacion];
      const lines = cells.map((c, i) => (i < 1 ? [''] : wrap(c || '—', cw[i] - 14, o.fs, i === 1 ? 'mono' : 500)));
      return { it, cells, lines, n: Math.max.apply(null, lines.map((l) => l.length)) };
    });
    // Si config.js trae más instrumentos de los previstos, se reduce el
    // relleno de las filas para que la tabla siga cabiendo en su caja.
    const avail = y + o.h - 2 - yy;
    const textH = rowsData.reduce((a, r) => a + r.n * o.lh, 0);
    const nRows = rowsData.length || 1;
    const basePad = Math.max(2, Math.min(o.pad, (avail - textH) / (2 * nRows)));
    const spare = Math.max(0, avail - textH - basePad * 2 * nRows);
    const extra = Math.min(spare / nRows, o.lh * 1.4);
    rowsData.forEach((row, ri) => {
      const { it, cells, lines, n } = row;
      const pad = basePad + extra / 2;
      const rh = n * o.lh + pad * 2;
      if (ri % 2) s += `<rect x="${f(x)}" y="${f(yy)}" width="${f(w)}" height="${f(rh)}" fill="#f4f7fa"/>`;
      // Tag de campo como etiqueta amarilla (igual que en el dibujo)
      const tw = textW(it.tag || '', 12, 'mono') + 10;
      s += `<rect x="${f(cx[0] + 8)}" y="${f(yy + pad - 2)}" width="${f(tw)}" height="17" rx="4" fill="${YELLOW}" stroke="${INK}" stroke-width="0.8"/>`;
      s += T(cx[0] + 8 + tw / 2, yy + pad + 10.4, it.tag || '', { size: 12, w: 700, mono: true, a: 'middle', fill: NAVY });
      for (let i = 1; i < cells.length; i++) {
        s += TL(cx[i] + 8, yy + pad + o.fs * 0.82, lines[i], o.lh, i === 1 ? { size: o.fs, w: 700, mono: true } : { size: o.fs });
      }
      yy += rh;
      s += `<path d="M${f(x)} ${f(yy)}H${f(x + w)}" stroke="#c3ccd6" stroke-width="0.8"/>`;
    });
    // Separadores de columna
    let v = '';
    for (let i = 1; i < cx.length; i++) v += `M${f(cx[i])} ${f(y + box.th)}V${f(yy)}`;
    s += `<path d="${v}" stroke="#c3ccd6" stroke-width="0.8"/>`;
    return { s, bottom: yy };
  }

  function notesBlock(x, y, w, h, o) {
    const pz = cfg().pozo || {};
    const sys = cfg().sistema || {};
    const notes = [
      'Circuito cerrado: el gas y el líquido se reincorporan a la línea a batería; no se ventea a la atmósfera.',
      `Instrumentación Endress+Hauser; señales al RTU ${sys.rtu || ''}; visualización en SCADA ${sys.scada || ''}.`,
      `Medición de ${pz.duracionPrueba || 24} h: Estabilización → En curso → Finalizado.`,
      'Diagrama simplificado: no incluye válvulas de bloqueo, desvíos ni dispositivos de alivio; verificar contra el DTI de ingeniería del equipo.',
      'Interpretación de tags de campo según WT.config — confirmar.',
    ];
    const box = sectionBox(x, y, w, h, 'Notas', o.fs);
    let s = box.s;
    let yy = y + box.th + o.fs + 8;
    notes.forEach((n, i) => {
      const lines = wrap(n, w - 44, o.fs, 500);
      s += `<circle cx="${f(x + 18)}" cy="${f(yy - o.fs * 0.36)}" r="${f(o.fs * 0.62)}" fill="${NAVY}"/>`;
      s += T(x + 18, yy, String(i + 1), { size: o.fs - 2, w: 700, a: 'middle', fill: '#fff' });
      s += TL(x + 34, yy, lines, o.lh, { size: o.fs });
      yy += lines.length * o.lh + o.gap;
    });
    return s;
  }

  // Logotipo: imagen de marca si existe, si no el logotipo tipográfico.
  function logo(x, y, h, forExport) {
    const url = WT.brand && WT.brand.logoURL;
    if (url && (!forExport || /^data:/.test(url))) {
      return `<image href="${esc(url)}" x="${f(x)}" y="${f(y)}" width="${f(h * 3)}" height="${f(h)}" preserveAspectRatio="xMinYMid meet"/>`;
    }
    const k = h / 44;
    const a = 56 * k;
    const bw = 74 * k;
    return (
      `<g>` +
      `<rect x="${f(x)}" y="${f(y)}" width="${f(a)}" height="${f(h)}" rx="${f(4 * k)}" fill="${YELLOW}"/>` +
      `<rect x="${f(x + a)}" y="${f(y)}" width="${f(bw)}" height="${f(h)}" rx="${f(4 * k)}" fill="${NAVY}"/>` +
      `<rect x="${f(x + a)}" y="${f(y)}" width="${f(6 * k)}" height="${f(h)}" fill="${NAVY}"/>` +
      T(x + a / 2, y + h * 0.66, 'R.B.', { size: f(23 * k), w: 800, a: 'middle', fill: NAVY, ls: 0.4 }) +
      T(x + a + bw / 2, y + h * 0.56, 'TEC', { size: f(23 * k), w: 800, a: 'middle', fill: '#fff', ls: 1 }) +
      T(x + a + bw / 2, y + h * 0.86, 'MÉXICO', { size: f(9.5 * k), w: 700, a: 'middle', fill: SKY, ls: f(2.2 * k) }) +
      `</g>`
    );
  }

  function titleBlock(x, y, w, h, o) {
    const pz = cfg().pozo || {};
    const eq = cfg().equipo || {};
    const fs = o.fs;
    const lab = (lx, ly, k) => T(lx, ly, k.toUpperCase(), { size: fs, w: 700, fill: GREY, ls: 0.6 });
    const labW = (k) => textW(k.toUpperCase(), fs, 700) + 0.6 * k.length;
    let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#fff" stroke="${INK}" stroke-width="2"/>`;
    // Fila 1: logotipo + título
    const r1 = o.r1;
    const lw = o.logoW;
    s += logo(x + 12, y + (r1 - o.logoH) / 2, o.logoH, o.forExport);
    s += `<path d="M${f(x + lw)} ${f(y)}V${f(y + r1)}M${f(x)} ${f(y + r1)}H${f(x + w)}" stroke="${INK}" stroke-width="1.2"/>`;
    const title = 'DTI simplificado — Aforo de pozo con separador bifásico de circuito cerrado';
    const tl = wrap(title, w - lw - 24, fs + 1, 700);
    const tlh = fs + 4;
    s += TL(x + lw + 12, y + r1 / 2 - ((tl.length - 1) * tlh) / 2 + fs * 0.38, tl, tlh, { size: fs + 1, w: 700 });
    // Filas de datos
    const rows = [
      ['Equipo', `${eq.seleccionado || '—'} · ${eq.tipo || ''}`],
      ['Pozo', pz.nombre || '—'],
      ['Macropera', pz.macropera || '—'],
    ];
    let yy = y + r1;
    const rh = o.rh;
    rows.forEach(([k, v]) => {
      const by = yy + rh / 2 + fs * 0.36;
      s += lab(x + 12, by, k);
      s += T(x + o.kw, by, v, { size: fs, w: 600 });
      yy += rh;
      s += `<path d="M${f(x)} ${f(yy)}H${f(x + w)}" stroke="#c3ccd6" stroke-width="0.8"/>`;
    });
    // Revisión · fecha · escala · hoja (etiqueta y valor en la misma línea)
    const cells = [['Rev.', '0'], ['Fecha', fecha()], ['Escala', 'S/E'], ['Hoja', '1 de 1']];
    const cw = [0.17, 0.35, 0.23, 0.25].map((v) => v * w);
    const r3 = o.r3;
    const by = yy + r3 / 2 + fs * 0.36;
    let cx = x;
    cells.forEach(([k, v], i) => {
      if (i) s += `<path d="M${f(cx)} ${f(yy)}V${f(yy + r3)}" stroke="${INK}" stroke-width="1"/>`;
      s += lab(cx + 10, by, k);
      s += T(cx + 10 + labW(k) + 6, by, v, { size: fs, w: 700, mono: i === 1 });
      cx += cw[i];
    });
    s += `<path d="M${f(x)} ${f(yy)}H${f(x + w)}M${f(x)} ${f(yy + r3)}H${f(x + w)}" stroke="${INK}" stroke-width="1.2"/>`;
    yy += r3;
    // Uso del material
    const disc = 'Material de presentación y capacitación — no para construcción';
    const dh = y + h - yy;
    s += `<rect x="${f(x + 1)}" y="${f(yy + 0.6)}" width="${f(w - 2)}" height="${f(dh - 1.6)}" fill="${YELLOW}"/>`;
    const dl = wrap(disc, w - 24, fs, 700);
    s += TL(x + w / 2, yy + dh / 2 - ((dl.length - 1) * (fs + 3)) / 2 + fs * 0.36, dl, fs + 3, { size: fs, w: 700, a: 'middle', fill: NAVY });
    return s;
  }

  /* ================================================================
     8 · Ensamble de la hoja completa
     ================================================================ */
  const SVG_STYLE =
    '.d-pc{fill:none;stroke:#1b1b1b;stroke-width:5;stroke-linejoin:miter}' +
    '.d-core{fill:none;stroke-width:3;stroke-linejoin:miter}' +
    '.d-sym{fill:#fff;stroke:#1b1b1b;stroke-width:1.6;stroke-linejoin:miter}' +
    '.d-shut{fill:#1b1b1b}' +
    '.d-eq{stroke-width:1.8}' +
    '.d-vessel{fill:none;stroke:#1b1b1b;stroke-width:2.4}' +
    '.d-ln{fill:none;stroke:#1b1b1b;stroke-width:1.6}' +
    '.d-thk{stroke-width:2.4}' +
    '.d-blind{stroke-width:4}' +
    '.d-hair{stroke-width:1}' +
    '.d-seam{stroke-width:1;stroke:#6b7480}' +
    '.d-cn{fill:none;stroke:#1b1b1b;stroke-width:1.3}' +
    '.d-sg{fill:none;stroke:#1E8FC4;stroke-width:1.7;stroke-dasharray:9 5}' +
    '.d-dl{stroke:#1E8FC4;stroke-width:1.7}' +
    '.d-dlc{stroke:#1E8FC4}' +
    '.d-int{fill:none;stroke:#1b1b1b;stroke-width:1.3;stroke-dasharray:6 4}' +
    '.d-int2{stroke-width:2}' +
    '.d-ring{fill:none;stroke:none}' +
    '.d-fa{fill:none}';

  function svgMarkup(layout, opts) {
    FIT_TEXT = !!(opts && opts.forExport);
    try {
      return buildSvg(layout, opts || {});
    } finally {
      FIT_TEXT = false;
    }
  }

  function buildSvg(layout, opts) {
    const L = layout === 'v' ? 'v' : 'h';
    const { w: W, h: H } = SHEET[L];
    const layers = Object.assign({ sig: true, loop: true, table: true, anim: false }, opts.layers || {});
    const ix = !!opts.interactive;
    const pz = cfg().pozo || {};
    const eq = cfg().equipo || {};
    // En pantalla se incluye todo; en captura/descarga solo las capas visibles.
    const keep = ix ? { sig: true, loop: true, table: true, anim: true } : Object.assign({}, layers, { anim: false });
    let body = '';

    if (L === 'h') {
      body += frame(W, H, { out: 10, inn: 30, cols: 8, rows: 6, fs: 13 });
      body += header(W, 30, 42, {
        fs1: 21, fs2: 18, fs3: 14,
        title: '· AFORO DE POZO CON SEPARADOR BIFÁSICO DE CIRCUITO CERRADO',
      });
      body += `<g class="proc">${assembleProcess(processH(ix, keep), keep)}</g>`;
      // Mobiliario inferior
      if (keep.table) body += `<g class="ly-table">${instTable(40, 668, 940, { fs: 13, cols: [84, 78, 226, 236, 112, 270], lh: 15.5, pad: 7, h: 372 }).s}</g>`;
      body += legend(992, 668, 456, 372, { cols: 2, rowH: 35.5, fs: 13, k: 0.72, symW: 62, id: 'h' });
      body += notesBlock(1460, 668, 420, 184, { fs: 13, lh: 15.5, gap: 5 });
      body += titleBlock(1460, 862, 420, 178, { fs: 13, r1: 54, logoW: 150, logoH: 38, rh: 20, kw: 98, r3: 28, forExport: opts.forExport });
    } else {
      body += frame(W, H, { out: 8, inn: 24, cols: 6, rows: 8, fs: 11 });
      body += header(W, 24, 34, { fs1: 17, fs2: 14, fs3: 11, title: '· AFORO DE POZO · SEPARADOR BIFÁSICO DE CIRCUITO CERRADO' });
      body += `<g class="proc" transform="translate(${V_ORIGIN[0]} ${V_ORIGIN[1]}) scale(${V_K})">${assembleProcess(processV(ix, keep), keep)}</g>`;
      body += legend(34, 908, 1055, 176, { cols: 4, rowH: 30, fs: 12, k: 0.62, symW: 52, id: 'v' });
      if (keep.table) body += `<g class="ly-table">${instTable(34, 1094, 1055, { fs: 12, cols: [80, 68, 232, 256, 104, 330], lh: 14, pad: 5, h: 252 }).s}</g>`;
      body += notesBlock(34, 1356, 512, 197, { fs: 12, lh: 15, gap: 7 });
      body += titleBlock(556, 1356, 533, 197, { fs: 12, r1: 58, logoW: 150, logoH: 38, rh: 23, kw: 92, r3: 32, forExport: opts.forExport });
    }

    const cls = ['dti-svg'];
    if (ix) ['sig', 'loop', 'table', 'anim'].forEach((k) => !layers[k] && cls.push('hide-' + k));
    const title = `DTI simplificado — ${eq.seleccionado || ''} · ${pz.nombre || ''}`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" class="${cls.join(' ')}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"` +
      ` font-family="${FONT}" font-size="13" font-weight="500" role="img" aria-label="${esc(title)}">` +
      `<title>${esc(title)}</title><style>${SVG_STYLE}</style>${body}</svg>`
    );
  }

  /* ================================================================
     9 · Información para la ficha flotante
     ================================================================ */
  function infoFor(isa) {
    const it = insts().find((i) => i.isa === isa);
    if (it) {
      return {
        tag: it.tag, isa, nombre: it.nombre, variable: it.variable, unidad: it.unidad, ubicacion: it.ubicacion,
        extra: [it.marca, it.lazo ? 'Lazo: ' + it.lazo : ''].filter(Boolean).join(' · '),
      };
    }
    const sp = splitIsa(isa);
    const I = resolveInstruments();
    const sys = cfg().sistema || {};
    const byNum = (key) => (I[key] && I[key].it) || {};
    const pres = byNum('PIT-103');
    const niv = byNum('LIT-105');
    const gas = byNum('PDIT-107');
    const cor = byNum('FIT-106');
    const gasUnit = String(gas.unidad || '').split('→').pop().trim();
    const D = {
      PIC: { nombre: 'Controlador indicador de presión (montado en campo)', variable: pres.variable, unidad: pres.unidad,
        ubicacion: 'Campo, junto a la válvula de gas', extra: `Recibe ${pres.tag || 'TPS'} (${I['PIT-103'].isa}) y posiciona PCV-${sp.num}` },
      PCV: { nombre: 'Válvula de control de presión (gas)', variable: 'Presión del separador', unidad: pres.unidad,
        ubicacion: 'Salida de gas, aguas abajo de la placa de orificio', extra: 'Actuador de diafragma' },
      LIC: { nombre: 'Controlador indicador de nivel (montado en campo)', variable: niv.variable, unidad: niv.unidad,
        ubicacion: 'Campo, junto a la válvula de líquido', extra: `Recibe ${niv.tag || 'TN'} (${I['LIT-105'].isa}) y posiciona LCV-${sp.num}` },
      LCV: { nombre: 'Válvula de control de nivel (líquido)', variable: 'Nivel de líquido', unidad: niv.unidad,
        ubicacion: 'Salida de líquido, aguas abajo del Coriolis', extra: 'Actuador de diafragma' },
      LG: { nombre: 'Indicador de nivel local (mirilla)', variable: 'Nivel de líquido', unidad: 'lectura local',
        ubicacion: 'Cámara de nivel del separador', extra: 'Sin señal: verificación visual del TN' },
      FY: { nombre: 'Cálculo de gasto de gas por placa de orificio', variable: 'Gasto de gas desde ΔP', unidad: gasUnit || '—',
        ubicacion: `RTU ${sys.rtu || ''}`, extra: `Entrada: ${gas.tag || 'TDG'} (${I['PDIT-107'].isa})` },
      FQI: sp.num === I['FIT-106'].num
        ? { nombre: 'Totalizador de líquido', variable: 'Acumulados Q mezcla / aceite / agua', unidad: '—',
            ubicacion: `SCADA ${sys.scada || ''}`, extra: `Desde ${cor.tag || 'CORIOLIS'} (${I['FIT-106'].isa})` }
        : { nombre: 'Totalizador de gas', variable: 'Acumulado Q gas', unidad: gasUnit || '—',
            ubicacion: `SCADA ${sys.scada || ''}`, extra: `Desde FY-${sp.num}` },
    };
    const d = D[sp.letters] || { nombre: isa };
    return Object.assign({ tag: null, isa }, d);
  }

  /* ================================================================
     10 · Montaje interactivo
     ================================================================ */
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function whenFontsReady() {
    const fonts = document.fonts;
    if (!fonts || !fonts.load) return Promise.resolve();
    const specs = ['500 13px "Barlow Condensed"', '600 13px "Barlow Condensed"', '700 13px "Barlow Condensed"', '800 13px "Barlow Condensed"', '700 13px "JetBrains Mono"'];
    const all = Promise.all(specs.map((s) => fonts.load(s).catch(() => null))).then(() => fonts.ready);
    return Promise.race([all, new Promise((r) => setTimeout(r, 2500))]);
  }

  function markReady() {
    whenFontsReady().then(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.documentElement.dataset.dtiReady = '1';
      }))
    );
  }

  // Estilo @page temporal (respaldo de las páginas con nombre de dti.css).
  function pageStyle(css) {
    const el = document.createElement('style');
    el.setAttribute('data-dti-page', '');
    el.textContent = css;
    document.head.appendChild(el);
    return el;
  }

  function fileBase(layout) {
    const pz = cfg().pozo || {};
    const eq = cfg().equipo || {};
    const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `DTI-${slug(eq.seleccionado)}-${slug(pz.nombre)}-${layout === 'v' ? 'A3-vertical' : 'horizontal'}`;
  }

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  function mountCapture(root, layout) {
    const { w, h } = SHEET[layout];
    const html = document.documentElement;
    html.classList.add('dti-capture');
    root.classList.add('dti-root', 'is-capture');
    root.style.width = w + 'px';
    root.style.height = h + 'px';
    root.innerHTML = svgMarkup(layout, { layers: { anim: false } });
    const ps = pageStyle(layout === 'v' ? '@page{size:297mm 420mm;margin:0}' : `@page{size:${w}px ${h}px;margin:0}`);
    markReady();
    return {
      layout,
      destroy() {
        ps.remove();
        html.classList.remove('dti-capture');
        root.classList.remove('is-capture');
        root.style.width = '';
        root.style.height = '';
      },
    };
  }

  function mountInteractive(root, layout) {
    const st = {
      layout,
      layers: { sig: true, loop: true, table: true, anim: !reducedMotion() },
      z: 1, x: 0, y: 0, fitZ: 1, fitted: true,
      pin: null,
    };
    root.classList.add('dti-root');
    root.classList.remove('is-capture');
    const chk = (k, label, color, extra) =>
      `<label class="wt-check"><input type="checkbox" data-layer="${k}"${st.layers[k] ? ' checked' : ''}><i style="--c:${color}"${extra || ''}></i>${label}</label>`;
    root.innerHTML =
      `<div class="dti-toolbar" role="toolbar" aria-label="Herramientas del DTI">` +
      `<div class="wt-seg dti-seg" role="group" aria-label="Formato de hoja">` +
      `<button type="button" data-layout="h">Horizontal · pantalla</button>` +
      `<button type="button" data-layout="v">Vertical · impresión</button></div>` +
      `<div class="dti-layers" role="group" aria-label="Capas">` +
      chk('sig', 'Señales', SIG, ' class="dash"') +
      chk('loop', 'Lazos de control', SIG) +
      chk('table', 'Tabla de instrumentos', YELLOW) +
      chk('anim', 'Flujo animado', 'linear-gradient(90deg,#8B5A2B,#FFD400,#F29F05)') +
      `</div>` +
      `<div class="dti-actions">` +
      `<button type="button" class="wt-btn" data-act="svg">Descargar SVG</button>` +
      `<button type="button" class="wt-btn" data-act="png">Descargar PNG</button>` +
      `<button type="button" class="wt-btn primary" data-act="print">Imprimir / PDF</button>` +
      `</div></div>` +
      `<div class="dti-viewport" tabindex="0" aria-label="Hoja del DTI. Ctrl más rueda o pellizco para acercar; arrastra para mover.">` +
      `<div class="dti-sheet"></div>` +
      `<div class="dti-zoom" role="group" aria-label="Zoom">` +
      `<button type="button" class="wt-btn icon" data-zoom="out" aria-label="Alejar" title="Alejar (−)">−</button>` +
      `<span class="dti-zval" aria-live="polite">100%</span>` +
      `<button type="button" class="wt-btn icon" data-zoom="in" aria-label="Acercar" title="Acercar (+)">+</button>` +
      `<button type="button" class="wt-btn" data-zoom="fit" title="Ajustar a la vista (0)">Ajustar</button>` +
      `</div>` +
      `<div class="dti-tip" role="tooltip" hidden></div>` +
      `<div class="dti-toast" role="status" hidden></div>` +
      `<p class="dti-hint">Ctrl + rueda o pellizco: zoom · arrastrar: mover · clic en una burbuja: fijar lazo</p>` +
      `</div>`;

    const vp = root.querySelector('.dti-viewport');
    const sheet = root.querySelector('.dti-sheet');
    const tip = root.querySelector('.dti-tip');
    const zoomBar = root.querySelector('.dti-zoom');
    const toast = root.querySelector('.dti-toast');
    const zval = root.querySelector('.dti-zval');
    let svg = null;

    /* --- Render de la hoja --- */
    function render() {
      sheet.innerHTML = svgMarkup(st.layout, { interactive: true, layers: st.layers });
      svg = sheet.firstElementChild;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      st.pin = null;
      hideTip();
      root.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === st.layout)));
      fit();
    }
    function applyLayers() {
      if (!svg) return;
      ['sig', 'loop', 'table', 'anim'].forEach((k) => svg.classList.toggle('hide-' + k, !st.layers[k]));
    }

    /* --- Zoom y desplazamiento --- */
    const PAD = 18;
    const dims = () => SHEET[st.layout];
    function fit() {
      const r = vp.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const { w, h } = dims();
      st.fitZ = Math.max(0.05, Math.min((r.width - PAD * 2) / w, (r.height - PAD * 2) / h));
      st.z = st.fitZ;
      st.fitted = true;
      clampPan();
      apply();
    }
    function clampPan() {
      const r = vp.getBoundingClientRect();
      const { w, h } = dims();
      const sw = w * st.z;
      const sh = h * st.z;
      st.x = sw + PAD * 2 <= r.width ? (r.width - sw) / 2 : Math.min(PAD, Math.max(r.width - sw - PAD, st.x));
      st.y = sh + PAD * 2 <= r.height ? (r.height - sh) / 2 : Math.min(PAD, Math.max(r.height - sh - PAD, st.y));
    }
    function canPan() {
      const r = vp.getBoundingClientRect();
      const { w, h } = dims();
      return w * st.z + PAD * 2 > r.width + 1 || h * st.z + PAD * 2 > r.height + 1;
    }
    function apply() {
      if (!svg) return;
      const { w, h } = dims();
      svg.style.width = w * st.z + 'px';
      svg.style.height = h * st.z + 'px';
      sheet.style.transform = `translate(${st.x}px, ${st.y}px)`;
      zval.textContent = Math.round(st.z * 100) + '%';
      vp.classList.toggle('can-pan', canPan());
      if (st.pin) placeTip(st.pin);
    }
    function zoomAt(z, px, py) {
      const nz = Math.max(st.fitZ * 0.6, Math.min(5, z));
      st.x = px - (px - st.x) * (nz / st.z);
      st.y = py - (py - st.y) * (nz / st.z);
      st.z = nz;
      st.fitted = Math.abs(nz - st.fitZ) < 1e-3;
      clampPan();
      apply();
    }
    const center = () => {
      const r = vp.getBoundingClientRect();
      return [r.width / 2, r.height / 2];
    };

    /* --- Resaltado de lazos y ficha --- */
    function highlight(g) {
      if (!svg) return;
      const loop = g ? g.getAttribute('data-loop') : '';
      svg.querySelectorAll('.lp.on').forEach((el) => el.classList.remove('on'));
      if (!g || !loop) {
        svg.classList.remove('is-focus');
        return;
      }
      svg.classList.add('is-focus');
      svg.querySelectorAll(`[data-loop~="${CSS && CSS.escape ? CSS.escape(loop) : loop}"]`).forEach((el) => el.classList.add('on'));
    }
    function tipHTML(info) {
      const row = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');
      return (
        `<div class="hd">${info.tag ? `<span class="tag">${esc(info.tag)}</span>` : ''}<span class="isa">${esc(info.isa)}</span></div>` +
        `<h4>${esc(info.nombre || '')}</h4>` +
        `<dl>${row('Variable', info.variable)}${row('Unidad', info.unidad)}${row('Ubicación', info.ubicacion)}${row('Tag de campo', info.tag)}</dl>` +
        (info.extra ? `<p>${esc(info.extra)}</p>` : '')
      );
    }
    // Rectángulo (en pantalla) de los elementos propios del lazo; los
    // compartidos (troncal, RTU) no cuentan.
    function loopRect(g) {
      const loop = g.getAttribute('data-loop');
      let r = null;
      svg.querySelectorAll(`[data-loop="${loop}"]`).forEach((el) => {
        const b = el.getBoundingClientRect();
        if (!b.width && !b.height) return;
        r = r
          ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
          : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      });
      return r || g.getBoundingClientRect();
    }
    function placeTip(g) {
      // Se busca un lugar fuera del lazo resaltado (derecha, izquierda,
      // abajo, arriba); si no cabe, junto a la burbuja. Siempre en el visor.
      const vr = vp.getBoundingClientRect();
      const br = g.getBoundingClientRect();
      const lr = loopRect(g);
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const M = 8;
      const G = 12;
      const W = vr.width;
      const H = vr.height - zoomBar.offsetHeight - 12; // sin tapar los controles de zoom
      const bx = br.left - vr.left + br.width / 2;
      const by = br.top - vr.top + br.height / 2;
      const L = { l: lr.left - vr.left, t: lr.top - vr.top, r: lr.right - vr.left, b: lr.bottom - vr.top };
      const clampY = (y) => Math.max(M, Math.min(H - th - M, y));
      const clampX = (x) => Math.max(M, Math.min(W - tw - M, x));
      const cands = [
        [L.r + G, clampY(by - th / 2)],
        [L.l - tw - G, clampY(by - th / 2)],
        [clampX(bx - tw / 2), L.b + G],
        [clampX(bx - tw / 2), L.t - th - G],
      ];
      let pos = cands.find(([x, y]) => x >= M && x + tw <= W - M && y >= M && y + th <= H - M);
      if (!pos) {
        let x = br.right - vr.left + 10;
        if (x + tw > W - M) x = br.left - vr.left - tw - 10;
        pos = [clampX(x), clampY(by - th / 2)];
      }
      tip.style.transform = `translate(${Math.round(pos[0])}px, ${Math.round(pos[1])}px)`;
    }
    function showTip(g) {
      tip.innerHTML = tipHTML(infoFor(g.getAttribute('data-isa')));
      tip.hidden = false;
      tip.classList.toggle('pinned', st.pin === g);
      placeTip(g);
    }
    function hideTip() {
      tip.hidden = true;
    }
    function preview(g) {
      if (st.pin) return;
      highlight(g);
      if (g) showTip(g);
      else hideTip();
    }
    function setPin(g) {
      if (st.pin) st.pin.classList.remove('pin');
      st.pin = g || null;
      if (g) {
        g.classList.add('pin');
        highlight(g);
        showTip(g);
      } else {
        highlight(null);
        hideTip();
      }
    }

    /* --- Eventos de la hoja --- */
    sheet.addEventListener('pointerover', (e) => {
      const g = e.target.closest && e.target.closest('.d-ib[tabindex]');
      if (g && e.pointerType === 'mouse') preview(g);
    });
    sheet.addEventListener('pointerout', (e) => {
      const g = e.target.closest && e.target.closest('.d-ib[tabindex]');
      if (g && !(e.relatedTarget && g.contains(e.relatedTarget))) preview(null);
    });
    sheet.addEventListener('focusin', (e) => {
      const g = e.target.closest && e.target.closest('.d-ib[tabindex]');
      if (g) preview(g);
    });
    sheet.addEventListener('focusout', () => preview(null));
    sheet.addEventListener('click', (e) => {
      const g = e.target.closest && e.target.closest('.d-ib[tabindex]');
      if (g) setPin(st.pin === g ? null : g);
      else if (st.pin) setPin(null);
    });
    sheet.addEventListener('keydown', (e) => {
      const g = e.target.closest && e.target.closest('.d-ib[tabindex]');
      if (g && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setPin(st.pin === g ? null : g);
      }
    });
    vp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setPin(null);
      else if (e.key === '+' || e.key === '=') zoomAt(st.z * 1.25, ...center());
      else if (e.key === '-' || e.key === '_') zoomAt(st.z / 1.25, ...center());
      else if (e.key === '0') fit();
      else return;
      e.preventDefault();
    });

    // Rueda: Ctrl/⌘ (o pellizco de trackpad) = zoom; sin Ctrl desplaza si hay zoom.
    vp.addEventListener('wheel', (e) => {
      const r = vp.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(st.z * Math.exp(-Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode ? 33 : 1))) * 0.0028), e.clientX - r.left, e.clientY - r.top);
      } else if (canPan()) {
        e.preventDefault();
        st.x -= e.deltaX;
        st.y -= e.deltaY;
        st.fitted = false;
        clampPan();
        apply();
      }
    }, { passive: false });

    // Arrastre y pellizco con Pointer Events.
    const ptrs = new Map();
    let drag = null;
    let pinch = null;
    let moved = false;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    vp.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.dti-zoom, .dti-tip')) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) {
        drag = { sx: e.clientX, sy: e.clientY, x0: st.x, y0: st.y, id: e.pointerId };
        moved = false;
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const r = vp.getBoundingClientRect();
        pinch = { d: dist(a, b) || 1, z0: st.z, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, x0: st.x, y0: st.y };
        drag = null;
        moved = true;
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const r = vp.getBoundingClientRect();
        const nz = Math.max(st.fitZ * 0.6, Math.min(5, pinch.z0 * (dist(a, b) / pinch.d)));
        const mx = (a.x + b.x) / 2 - r.left;
        const my = (a.y + b.y) / 2 - r.top;
        st.x = mx - (pinch.mx - pinch.x0) * (nz / pinch.z0);
        st.y = my - (pinch.my - pinch.y0) * (nz / pinch.z0);
        st.z = nz;
        st.fitted = false;
        clampPan();
        apply();
      } else if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (!moved && Math.hypot(dx, dy) > 5) {
          moved = true;
          if (canPan()) {
            vp.classList.add('panning');
            try { vp.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
          }
        }
        if (moved && canPan()) {
          st.x = drag.x0 + dx;
          st.y = drag.y0 + dy;
          st.fitted = false;
          clampPan();
          apply();
        }
      }
    });
    const endPtr = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (!ptrs.size) {
        drag = null;
        vp.classList.remove('panning');
      }
    };
    vp.addEventListener('pointerup', endPtr);
    vp.addEventListener('pointercancel', endPtr);
    // Un arrastre no debe contar como clic sobre una burbuja.
    vp.addEventListener('click', (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    }, true);

    /* --- Barra de herramientas --- */
    root.querySelector('.dti-toolbar').addEventListener('click', (e) => {
      const lb = e.target.closest('[data-layout]');
      if (lb && lb.dataset.layout !== st.layout) {
        st.layout = lb.dataset.layout;
        render();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'svg') downloadSVG();
      else if (act.dataset.act === 'png') downloadPNG(act);
      else if (act.dataset.act === 'print') doPrint();
    });
    root.querySelector('.dti-layers').addEventListener('change', (e) => {
      const k = e.target.getAttribute('data-layer');
      if (!k) return;
      st.layers[k] = e.target.checked;
      applyLayers();
    });
    root.querySelector('.dti-zoom').addEventListener('click', (e) => {
      const b = e.target.closest('[data-zoom]');
      if (!b) return;
      if (b.dataset.zoom === 'fit') fit();
      else zoomAt(st.z * (b.dataset.zoom === 'in' ? 1.25 : 0.8), ...center());
    });

    /* --- Descargas --- */
    const exportMarkup = () =>
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      svgMarkup(st.layout, { forExport: true, layers: Object.assign({}, st.layers, { anim: false }) });
    function downloadSVG() {
      saveBlob(new Blob([exportMarkup()], { type: 'image/svg+xml;charset=utf-8' }), fileBase(st.layout) + '.svg');
    }
    let toastT = 0;
    function say(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      clearTimeout(toastT);
      toastT = setTimeout(() => (toast.hidden = true), 7000);
    }
    function downloadPNG(btn) {
      const { w, h } = dims();
      const fail = () => say('No se pudo generar el PNG en este navegador (archivo abierto localmente). Usa «Imprimir / PDF» para obtener la hoja.');
      btn.disabled = true;
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = w * 2;
          c.height = h * 2;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob((blob) => {
            btn.disabled = false;
            if (blob) saveBlob(blob, fileBase(st.layout) + '.png');
            else fail();
          }, 'image/png');
        } catch (err) {
          btn.disabled = false;
          fail();
        }
      };
      img.onerror = () => {
        btn.disabled = false;
        fail();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(exportMarkup());
    }

    /* --- Impresión: solo la hoja, A3 vertical u horizontal --- */
    const html = document.documentElement;
    let printStyle = null;
    function preparePrint() {
      if (html.classList.contains('dti-printing')) return;
      setPin(null);
      html.classList.add('dti-printing', 'dti-print-' + st.layout);
      printStyle = pageStyle(st.layout === 'v' ? '@page{size:A3 portrait;margin:5mm}' : '@page{size:A3 landscape;margin:8mm}');
    }
    function endPrint() {
      html.classList.remove('dti-printing', 'dti-print-h', 'dti-print-v');
      if (printStyle) printStyle.remove();
      printStyle = null;
    }
    function doPrint() {
      preparePrint();
      window.print();
    }
    // También al imprimir con Ctrl+P mientras el DTI está visible.
    const onBefore = () => {
      if (root.isConnected && root.offsetParent !== null) preparePrint();
    };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', endPrint);

    /* --- Ajuste al tamaño del contenedor --- */
    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => {
        if (st.fitted) fit();
        else {
          clampPan();
          apply();
        }
      });
      ro.observe(vp);
    } else {
      window.addEventListener('resize', fit);
    }

    // La pista de uso se retira sola o con la primera interacción.
    const hint = root.querySelector('.dti-hint');
    const dropHint = () => hint && hint.classList.add('gone');
    const hintT = setTimeout(dropHint, 6000);
    vp.addEventListener('pointerdown', dropHint, { once: true });
    vp.addEventListener('wheel', dropHint, { once: true, passive: true });

    render();
    applyLayers();
    markReady();

    return {
      get layout() { return st.layout; },
      setLayout(l) {
        st.layout = l === 'v' ? 'v' : 'h';
        render();
      },
      fit,
      destroy() {
        clearTimeout(hintT);
        if (ro) ro.disconnect();
        else window.removeEventListener('resize', fit);
        window.removeEventListener('beforeprint', onBefore);
        window.removeEventListener('afterprint', endPrint);
        endPrint();
        root.innerHTML = '';
      },
    };
  }

  function mount(rootEl, opts) {
    if (!rootEl) return null;
    opts = opts || {};
    if (rootEl._dti && rootEl._dti.destroy) rootEl._dti.destroy();
    const layout = opts.layout === 'v' ? 'v' : 'h';
    const inst = opts.capture ? mountCapture(rootEl, layout) : mountInteractive(rootEl, layout);
    rootEl._dti = inst;
    return inst;
  }

  WT.dti = {
    mount,
    svgMarkup: (layout) => svgMarkup(layout, { forExport: true }),
  };
})();
