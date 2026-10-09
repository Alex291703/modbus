/* =====================================================================
   WT.PID — DTI (P&ID) simplificado con simbología ISA-5.1 (SVG)
   ---------------------------------------------------------------------
   Contrato (docs/ARQUITECTURA.md):
     const p = WT.PID.render(container, { orientacion: 'horizontal' | 'vertical',
                                          tema: 'papel' | 'pantalla', tag: 'FA-06' });
     p.svg            <svg> generado (viewBox fijo, escalable)
     p.lineas         { mezcla:[path…], gas:[…], liquido:[…], salida:[…], senal:[…] }
     p.instrumentos   { TDP:<g>, TPS:<g>, … }   burbujas ISA (arriba ISA, abajo tag)
     p.equipos        { arbol:<g>, estrangulador:<g>, manifold:<g>, separador:<g>, … }
     p.setTema(tema)
   Extensiones (opcionales, no rompen el contrato):
     p.renderAt(t, estado)  dibuja el cuadro del tiempo t (s). Determinista:
        estado.trazo   0..1  avance del trazado en el orden del flujo (1 = completo, por defecto)
        estado.pulsos  0..1  intensidad de los pulsos de flujo / señal (por defecto 1)
        estado.resaltar      corriente ('mezcla'|'gas'|'liquido'|'salida'|'senal'),
                             tag ('TDG'…), función ('LIC'|'PIC'|'FQI') o equipo ('separador'…)
        estado.marco   0..1  opacidad de encabezado, simbología, lista y cuadro de referencia
     p.funciones     { LIC:<g>, PIC:<g>, FQI:<g> }  funciones en el RTU (círculo en cuadro)
     p.lineasPorId   { m1:{stream,paths,len,a,b}, … }   p.orden: ids en el orden del flujo
     p.orientacion, p.tema, p.tag, p.W, p.H
     p.toSVGString({ fontCSS, logoHref }) SVG del trazado completo, sin pulsos; con fontCSS/logoHref
                     (data:) queda autónomo. WT.PID.FUENTES lista las fuentes usadas (rutas bajo assets/).
     p.overlay       <svg> de pulsos aparte cuando se pide { overlay: true } (rendimiento en páginas)
     p.destroy()
   Opciones extra de render(): interactivo (tabindex/aria en burbujas y líneas),
     capa ('proceso'|'instrumentacion'|'control') para vistas por capas,
     assets (prefijo de ruta, por defecto 'assets/').
   Nada de Math.random / Date.now / performance.now: mismo (t, estado) → mismo cuadro.
   ===================================================================== */
(function () {
  'use strict';
  var WT = (window.WT = window.WT || {});
  var NS = 'http://www.w3.org/2000/svg';
  var nInst = 0;

  /* ------------------------------------------------------------------
     Constantes de presentación propias del DTI (no son datos de proceso)
     ------------------------------------------------------------------ */
  /* Respaldos: solo se usan si WT.data no trae el campo (la fuente única manda) */
  var RTU_MODULO = 'Controller & Mixed I/O SC-UCMX02';   // WT.data.rtu.modulo
  var RTU_ENLACE = 'Ethernet';                             // WT.data.rtu.enlaceScada
  var DIAM_NOMINAL = '4"';                                 // WT.data.lineas.diametroNominal
  var SENAL_PAPEL = '#2a8fd0';                             // WT.data.colores.senalPapel
  var FUNCIONES = [                                        // WT.data.funciones
    { tag: 'LIC', mide: 'TN', actua: 'LV', desc: 'Control de nivel del separador' },
    { tag: 'PIC', mide: 'TPS', actua: 'PV', desc: 'Control de presión del separador (contrapresión)' },
    { tag: 'FQI', mide: 'TDG', compensa: ['TPS', 'TT'], desc: 'Gasto de gas (MMpcd) y acumulado (MMpc) con el ΔP de la placa, compensado por presión y temperatura' }
  ];
  var LOGO_AR = 256 / 96;                                  // proporción del logotipo (assets/logo-rbtec*.svg)
  var VALVULAS = [                                         // WT.data.valvulasControl
    { tag: 'LV', nombre: 'Válvula de control de nivel', corriente: 'liquido', lazo: 'LIC' },
    { tag: 'PV', nombre: 'Válvula de control de presión (contrapresión)', corriente: 'gas', lazo: 'PIC' }
  ];
  /* Rótulo corto bajo cada válvula de control (el nombre largo va en la ficha / aria) */
  var VALV_CORTO = { LV: ['Control de nivel', 'Nivel del separador'], PV: ['Contrapresión', 'P del separador'] };
  var STREAMS = ['mezcla', 'gas', 'liquido', 'salida'];
  var STREAM_EQ = {
    mezcla: ['arbol', 'estrangulador', 'manifold', 'lineaEntrada', 'separador'],
    gas: ['separador', 'extractor', 'placa', 'pv', 'psv'],
    liquido: ['separador', 'coriolis', 'lv'],
    salida: ['recombinacion', 'lineaBateria', 'circuito']
  };

  /* Ventanas de trazado (0..1) por línea, en el orden del flujo */
  var TL = {
    m1: [0.02, 0.075], m2: [0.075, 0.12], m3: [0.12, 0.25],
    g1: [0.34, 0.54], l1: [0.34, 0.54], s1: [0.54, 0.60], s2: [0.60, 0.68]
  };

  /* Lectura de WT.data con respaldo */
  function pick(v, d) { return v != null && v !== '' ? v : d; }
  function cfg(data) {
    var rtu = data.rtu || {}, lin = data.lineas || {}, C = data.colores || {};
    var fx = (data.funciones && data.funciones.length ? data.funciones : FUNCIONES);
    var vc = (data.valvulasControl && data.valvulasControl.length ? data.valvulasControl : VALVULAS);
    var byTag = function (arr, t) { for (var i = 0; i < arr.length; i++) if (arr[i].tag === t) return arr[i]; return null; };
    var dn = pick(lin.diametroNominal, DIAM_NOMINAL);
    var modulo = pick(rtu.modulo, RTU_MODULO);
    var sen = [];   // tipos de señal de los instrumentos (p. ej. '4–20 mA HART / Modbus')
    (data.instrumentos || []).forEach(function (i) { String(i.senal || '').split(/\s*\/\s*/).forEach(function (t) { if (t && sen.indexOf(t) < 0) sen.push(t); }); });
    return {
      senales: sen.length ? sen.join(' / ') : '4–20 mA HART',
      rtuModelo: pick(rtu.modelo, null),
      rtuModulo: modulo,
      rtuModuloCorto: (String(modulo).match(/[A-Z]{2,}-[A-Z0-9]+/) || [modulo])[0],
      enlace: pick(rtu.enlaceScada, RTU_ENLACE),
      dn: dn,                                           // '4"' (rótulo de línea)
      dnTexto: String(dn).replace(/\s*(?:"|”|″|in\.?)\s*$/, ' in'), // '4 in' (para notas)
      senalPapel: pick(C.senalPapel, SENAL_PAPEL),
      fn: function (t) { return byTag(fx, t) || byTag(FUNCIONES, t) || { tag: t }; },
      valvula: function (t) { return byTag(vc, t) || byTag(VALVULAS, t) || { tag: t }; }
    };
  }
  var T_SEP = 0.25, T_FUNC = 0.70, T_SIG0 = 0.68, T_SIG1 = 0.90, T_SCADA = 0.93;

  /* ------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function easeOut(k) { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function up(s) { return String(s).toLocaleUpperCase('es-MX'); }

  function E(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* Ancho aproximado de texto (em) para decidir cortes de línea sin medir el DOM */
  var W_UP = /[A-ZÁÉÍÓÚÑÜ]/, W_DIG = /[0-9]/, W_NAR = /[iljI.,:;'|!·()\-–]/, W_WIDE = /[mwMW]/;
  function textW(str, size, font, ls) {
    var w = 0, s = String(str), i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s[i];
      if (font === 'm') { w += 0.6; continue; }
      var c = font === 'c';
      if (ch === ' ') w += c ? 0.2 : 0.25;
      else if (W_WIDE.test(ch)) w += c ? 0.66 : 0.8;
      else if (W_NAR.test(ch)) w += c ? 0.24 : 0.27;
      else if (W_UP.test(ch)) w += c ? 0.5 : 0.62;
      else if (W_DIG.test(ch)) w += c ? 0.47 : 0.56;
      else w += c ? 0.43 : 0.5;
    }
    return w * size + (ls || 0) * s.length;
  }
  function wrap(str, maxW, size, font) {
    var words = String(str).split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var tryS = cur ? cur + ' ' + words[i] : words[i];
      if (cur && textW(tryS, size, font) > maxW) { lines.push(cur); cur = words[i]; } else cur = tryS;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* Geometría de polilíneas ortogonales */
  function cum(pts) {
    var acc = [0];
    for (var i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return acc;
  }
  function pointAt(pts, acc, s) {
    var n = pts.length - 1;
    if (s <= 0) return { x: pts[0][0], y: pts[0][1], a: Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) };
    for (var i = 1; i <= n; i++) {
      if (s <= acc[i] || i === n) {
        var L = acc[i] - acc[i - 1] || 1, k = clamp((s - acc[i - 1]) / L, 0, 1);
        return {
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
          y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
          a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
        };
      }
    }
  }
  function projectS(pts, acc, x, y) {
    var best = 0, bd = Infinity;
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      var k = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
      var px = ax + dx * k, py = ay + dy * k, d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = acc[i - 1] + Math.sqrt(L2) * k; }
    }
    return best;
  }
  /* Saltos (cruce sin conexión): semicírculo de radio HOP_R sobre los puntos `hops` que caen en un tramo recto */
  var HOP_R = 6;
  function hopsOn(p, q, hops) {
    if (!hops || !hops.length) return '';
    var L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L, list = [];
    hops.forEach(function (h) {
      var t = (h[0] - p[0]) * ux + (h[1] - p[1]) * uy, off = Math.abs((h[0] - p[0]) * uy - (h[1] - p[1]) * ux);
      if (off < 0.6 && t > HOP_R + 2 && t < L - HOP_R - 2) list.push({ h: h, t: t });
    });
    list.sort(function (a, b) { return a.t - b.t; });
    var sweep = ux > 0.5 ? 1 : ux < -0.5 ? 0 : uy > 0 ? 1 : 0;   // horizontal: arco hacia arriba; vertical: hacia la derecha
    return list.map(function (o) {
      var h = o.h;
      return 'L' + r1(h[0] - ux * HOP_R) + ' ' + r1(h[1] - uy * HOP_R) + 'A' + HOP_R + ' ' + HOP_R + ' 0 0 ' + sweep + ' ' + r1(h[0] + ux * HOP_R) + ' ' + r1(h[1] + uy * HOP_R);
    }).join('');
  }
  function pathD(pts, rad, hops) {
    var d = 'M' + r1(pts[0][0]) + ' ' + r1(pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i - 1], c = pts[i], q = pts[i + 1];
      d += hopsOn(p, c, hops);
      var l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
      var rr = Math.min(rad || 0, l1 / 2, l2 / 2);
      if (rr < 0.5) { d += 'L' + r1(c[0]) + ' ' + r1(c[1]); continue; }
      var ax = c[0] - (c[0] - p[0]) / l1 * rr, ay = c[1] - (c[1] - p[1]) / l1 * rr;
      var bx = c[0] + (q[0] - c[0]) / l2 * rr, by = c[1] + (q[1] - c[1]) / l2 * rr;
      d += 'L' + r1(ax) + ' ' + r1(ay) + 'Q' + r1(c[0]) + ' ' + r1(c[1]) + ' ' + r1(bx) + ' ' + r1(by);
    }
    var z = pts[pts.length - 1];
    return d + hopsOn(pts[pts.length - 2], z, hops) + 'L' + r1(z[0]) + ' ' + r1(z[1]);
  }

  /* Montaje del TN desde WT.data.separador.tnMontaje (mismo criterio que js/cutaway.js) */
  function tnEsLateral(sep) {
    var tm = sep && sep.tnMontaje, v = tm && typeof tm === 'object' ? tm.valor : tm;
    return !!v && /lateral|costado|c[aá]mara|externa|bridle|jaula/i.test(String(v)) && !/superior/i.test(String(v));
  }

  /* ------------------------------------------------------------------
     Temas (tokens de presentación). Corrientes desde WT.data.colores.
     ------------------------------------------------------------------ */
  function temas(C, K) {
    return {
      pantalla: {
        bg: C.marino900, sheet0: '#0d2a4d', sheet1: C.marino900, grid: 'rgba(79,179,232,0.06)', grid2: 'rgba(79,179,232,0.12)',
        frame: 'rgba(169,220,247,0.55)', frame2: 'rgba(169,220,247,0.20)',
        ink: '#dcebf8', ink2: '#9fbad5', muted: '#7f97b3',
        symFill: C.marino, boxFill: 'rgba(11,37,69,0.78)', boxHead: 'rgba(79,179,232,0.13)', boxStroke: 'rgba(169,220,247,0.28)',
        accent: C.amarillo, accentText: C.amarillo, onAccent: C.marino,
        senal: C.senal, bandFill: 'rgba(79,179,232,0.07)', bandStroke: 'rgba(79,179,232,0.6)',
        vessel0: '#2a5a8c', vessel1: '#0b2545', vesselHi: 'rgba(255,255,255,0.10)',
        gasZone: 'rgba(255,210,63,0.08)', liq0: 'rgba(232,151,30,0.55)', liq1: 'rgba(28,20,12,0.95)', liqText: '#f4d7a8',
        bubFill: C.marino, ring: C.amarillo, row: 'rgba(169,220,247,0.05)',
        stream: {
          mezcla: { edge: C.mezclaClaro, core: C.mezcla, sheen: 'rgba(255,230,200,0.35)', pulse: '#ffd9a8' },
          gas: { edge: '#fff1b8', core: C.gas, sheen: 'rgba(255,255,255,0.55)', pulse: '#ffffff' },
          liquido: { edge: C.liquidoAmbar, core: C.liquido, sheen: 'rgba(232,151,30,0.40)', pulse: '#ffc46b' },
          salida: { edge: '#b0855c', core: C.salida, sheen: 'rgba(255,230,200,0.30)', pulse: '#ffd9a8' }
        },
        arrow: '#eef5fb', arrowEdge: C.marino900, glow: true, logo: 'logo-rbtec-blanco.svg'
      },
      papel: {
        bg: '#ffffff', sheet0: '#ffffff', sheet1: '#f7f9fc', grid: '#eef3f8', grid2: '#e1e9f2',
        frame: C.marino, frame2: '#9fb3c8',
        ink: C.marino, ink2: '#3d5675', muted: '#647a94',
        symFill: '#ffffff', boxFill: '#ffffff', boxHead: '#eaf2fa', boxStroke: '#9fb3c8',
        accent: C.amarillo, accentText: C.marino, onAccent: C.marino,
        senal: K.senalPapel, bandFill: 'rgba(79,179,232,0.07)', bandStroke: K.senalPapel,
        vessel0: '#ffffff', vessel1: '#dbe5f0', vesselHi: 'rgba(255,255,255,0.0)',
        gasZone: 'rgba(255,210,63,0.13)', liq0: 'rgba(232,151,30,0.30)', liq1: 'rgba(138,90,43,0.34)', liqText: '#3b2408',
        bubFill: '#ffffff', ring: '#e0a800', row: '#f3f7fb',
        stream: {
          mezcla: { edge: '#5a3818', core: C.mezcla, sheen: 'rgba(255,255,255,0.22)', pulse: '#5a3818' },
          gas: { edge: '#a07800', core: C.gas, sheen: 'rgba(255,255,255,0.55)', pulse: '#8a6700' },
          liquido: { edge: C.liquidoAmbar, core: C.liquido, sheen: 'rgba(232,151,30,0.35)', pulse: C.liquidoAmbar },
          salida: { edge: '#4a2f1a', core: C.salida, sheen: 'rgba(255,255,255,0.20)', pulse: '#4a2f1a' }
        },
        arrow: C.marino, arrowEdge: '#ffffff', glow: false, logo: 'logo-rbtec.svg'
      }
    };
  }

  function themeCSS(u, T) {
    var s = '.' + u, out = [];
    function r(sel, body) { out.push(sel.split(',').map(function (x) { return s + ' ' + x.trim(); }).join(',') + '{' + body + '}'); }
    out.push(s + '{background:' + T.bg + '}');
    out.push(s + '.pid-ov{background:transparent}');
    r('text', 'font-family:"Barlow","Segoe UI",Arial,sans-serif;fill:' + T.ink + ';font-kerning:normal');
    r('.fc', 'font-family:"Barlow Condensed","Arial Narrow",Arial,sans-serif');
    r('.fm', 'font-family:"JetBrains Mono",Consolas,monospace');
    r('.ti2', 'fill:' + T.ink2);
    r('.tmu', 'fill:' + T.muted);
    r('.tac', 'fill:' + T.accentText);
    r('.ton', 'fill:' + T.onAccent);
    r('.tliq', 'fill:' + T.liqText);
    r('.sheet-bg', 'fill:url(#' + u + '-gsheet)');
    r('.grid', 'stroke:' + T.grid + ';stroke-width:1;fill:none');
    r('.grid2', 'stroke:' + T.grid2 + ';stroke-width:1;fill:none');
    r('.frame', 'fill:none;stroke:' + T.frame + ';stroke-width:2');
    r('.frame2', 'fill:none;stroke:' + T.frame2 + ';stroke-width:1');
    r('.zone-t', 'fill:' + T.muted + ';font-size:11px');
    r('.acc-f', 'fill:' + T.accent);
    r('.ink-f', 'fill:' + T.ink);
    r('.box', 'fill:' + T.boxFill + ';stroke:' + T.boxStroke + ';stroke-width:1.2');
    r('.box-h', 'fill:' + T.boxHead);
    r('.rule', 'stroke:' + T.boxStroke + ';stroke-width:1;fill:none');
    r('.row-f', 'fill:' + T.row);
    r('.sym', 'fill:' + T.symFill + ';stroke:' + T.ink + ';stroke-width:1.7;stroke-linejoin:round');
    r('.sym-nc', 'fill:' + T.ink);
    r('.sym-l', 'fill:none;stroke:' + T.ink + ';stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round');
    r('.sym-t', 'fill:none;stroke:' + T.ink + ';stroke-width:1.1');
    r('.sym-d', 'fill:none;stroke:' + T.ink2 + ';stroke-width:1.5;stroke-dasharray:6 4');
    r('.sym-acc', 'fill:' + T.accent + ';stroke:' + T.ink + ';stroke-width:1.4');
    r('.plate', 'stroke:' + T.accent + ';stroke-width:3.4;fill:none');
    r('.ground', 'stroke:' + T.ink2 + ';stroke-width:1.4;fill:none');
    r('.vessel', 'fill:url(#' + u + '-gves);stroke:' + T.ink + ';stroke-width:2.4');
    r('.vessel-hi', 'fill:' + T.vesselHi);
    r('.v-shadow', 'fill:#000;opacity:' + (T.glow ? 0.55 : 0.16));
    r('.gas-z', 'fill:' + T.gasZone);
    r('.liq-z', 'fill:url(#' + u + '-gliq)');
    r('.nll', 'stroke:' + T.stream.liquido.edge + ';stroke-width:1.6;stroke-dasharray:10 5;fill:none');
    r('.mesh', 'fill:none;stroke:' + T.ink2 + ';stroke-width:1.2');
    r('.pkg', 'fill:none;stroke:' + T.ink2 + ';stroke-width:1.4;stroke-dasharray:18 5 3 5;opacity:.75');
    r('.band', 'fill:' + T.bandFill + ';stroke:' + T.bandStroke + ';stroke-width:1.6');
    r('.band-t', 'fill:' + T.senal);
    r('.imp', 'fill:none;stroke:' + T.ink2 + ';stroke-width:1.4');
    r('.sig', 'fill:none;stroke:' + T.senal + ';stroke-width:2;stroke-dasharray:9 6;stroke-linecap:butt');
    r('.dl', 'fill:none;stroke:' + T.senal + ';stroke-width:2');
    r('.dl-o', 'fill:' + T.bg + ';stroke:' + T.senal + ';stroke-width:1.6');
    r('.mk', 'fill:' + T.senal);
    r('.sig-rv', 'fill:none;stroke:#fff;stroke-width:16;stroke-linecap:round;stroke-linejoin:round');
    r('.b', 'fill:' + T.bubFill + ';stroke:' + T.ink + ';stroke-width:1.8');
    r('.b-sq', 'fill:' + T.bubFill + ';stroke:' + T.ink + ';stroke-width:1.6');
    r('.b-l', 'stroke:' + T.ink + ';stroke-width:1.6');
    r('.ring', 'fill:none;stroke:' + T.ring + ';stroke-width:3;opacity:0');
    r('.inst.is-hl .ring,.inst.is-hover .ring', 'opacity:1');
    r('.arw', 'fill:' + T.arrow + ';stroke:' + T.arrowEdge + ';stroke-width:1.2;stroke-linejoin:round');
    r('.pl-c,.pl-k,.pl-s', 'fill:none;stroke-linecap:butt;stroke-linejoin:round');
    r('.pl-c', 'stroke-width:10');
    r('.pl-k', 'stroke-width:5.6');
    r('.pl-s', 'stroke-width:1.6');
    r('.pl-off .pl-k', 'stroke-width:3;stroke-dasharray:10 6');
    r('.pl-hit', 'fill:none;stroke:transparent;stroke-width:22;pointer-events:stroke;cursor:pointer');
    STREAMS.forEach(function (st) {
      var c = T.stream[st];
      r('[data-stream="' + st + '"] .pl-c', 'stroke:' + c.edge);
      r('[data-stream="' + st + '"] .pl-k', 'stroke:' + c.core);
      r('[data-stream="' + st + '"] .pl-s', 'stroke:' + c.sheen);
      r('.pu[data-stream="' + st + '"]', 'fill:' + c.pulse);
      r('.lg-' + st + '-c', 'stroke:' + c.edge + ';stroke-width:9;fill:none');
      r('.lg-' + st + '-k', 'stroke:' + c.core + ';stroke-width:5;fill:none');
    });
    r('.pu-s', 'fill:' + (T.glow ? '#d6f0ff' : T.senal));
    r('.pu-h', 'fill-opacity:' + (T.glow ? 0.22 : 0.14));
    r('.pu-s.pu-h', 'fill:' + T.senal);
    r('.pl-off', 'opacity:.85');
    r('.nfpa-h', 'fill:#2f6fd0'); r('.nfpa-f', 'fill:#e53935'); r('.nfpa-r', 'fill:#ffd23f'); r('.nfpa-s', 'fill:#ffffff');
    r('.nfpa-t', 'fill:#0b2545;font-weight:700');
    r('.nfpa-tw', 'fill:#ffffff;font-weight:700');
    /* Resaltado: atenúa todo lo que no pertenece al elemento elegido */
    r('.hl', 'transition:none');
    var leaves = ':is(path,line,rect,circle,ellipse,text,image)';
    var dimL = [':is(.L-lines,.L-arw,.L-pu,.L-eq,.L-imp,.L-sig,.L-spu,.L-inst,.L-zone,.L-ctl) ' + leaves, '.L-lbl text'];
    out.push(s + '.is-dim ' + dimL[0] + ':not(.is-hl):not(.is-hl *){opacity:.14}');
    out.push(s + '.is-dim ' + dimL[1] + ':not(.is-hl *){opacity:.28}');
    out.push(s + '.pid-ui ' + leaves + '{transition:opacity .25s ease}');
    out.push(s + '.pid-ui .inst{cursor:pointer}');
    out.push(s + '.pid-ui .inst:focus{outline:none}');
    out.push(s + '.pid-ui .inst:focus-visible .ring{opacity:1;stroke:' + T.senal + '}');
    /* Vistas por capas (efecto 3D de la página) */
    out.push(s + '.capa-proceso .L-sig,' + s + '.capa-proceso .L-inst,' + s + '.capa-proceso .L-imp,' + s + '.capa-proceso .L-ctl,' + s + '.capa-proceso .L-spu{display:none}');
    out.push(s + '.capa-instrumentacion .L-sheet,' + s + '.capa-instrumentacion .L-chrome,' + s + '.capa-instrumentacion .L-lines,' + s + '.capa-instrumentacion .L-arw,' + s + '.capa-instrumentacion .L-pu,' + s + '.capa-instrumentacion .L-eq,' + s + '.capa-instrumentacion .L-zone,' + s + '.capa-instrumentacion .L-sig,' + s + '.capa-instrumentacion .L-ctl,' + s + '.capa-instrumentacion .L-spu,' + s + '.capa-instrumentacion .L-lbl{display:none}');
    out.push(s + '.capa-control .L-sheet,' + s + '.capa-control .L-chrome,' + s + '.capa-control .L-lines,' + s + '.capa-control .L-arw,' + s + '.capa-control .L-pu,' + s + '.capa-control .L-eq,' + s + '.capa-control .L-zone,' + s + '.capa-control .L-inst,' + s + '.capa-control .L-imp,' + s + '.capa-control .L-lbl{display:none}');
    return out.join('\n');
  }

  /* ==================================================================
     render()
     ================================================================== */
  function render(container, opts) {
    opts = opts || {};
    var data = WT.data, C = data.colores, util = WT.util;
    var orient = opts.orientacion === 'vertical' ? 'vertical' : 'horizontal';
    var tema = opts.tema === 'papel' ? 'papel' : 'pantalla';
    var tag = opts.tag || data.separador.tagDefault;
    var assets = opts.assets != null ? opts.assets : 'assets/';
    var u = 'pid' + (++nInst);
    var K = cfg(data);
    var THEMES = temas(C, K);
    var LAY = LAYOUTS[orient];
    var W = LAY.W, H = LAY.H;

    var svg = E('svg', {
      xmlns: NS, viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
      class: 'pid ' + u + (opts.interactivo ? ' pid-ui' : '') + (opts.capa ? ' capa-' + opts.capa : ''),
      role: 'img', 'aria-labelledby': u + '-title ' + u + '-desc', 'data-orientacion': orient, 'data-tema': tema,
      preserveAspectRatio: 'xMidYMid meet'
    });
    svg.style.width = '100%'; svg.style.height = '100%';
    E('title', { id: u + '-title' }, svg).textContent = 'DTI simplificado – Aforo de pozo con separador bifásico de circuito cerrado (' + tag + ')';
    E('desc', { id: u + '-desc' }, svg).textContent = 'Árbol de válvulas, estrangulador TP/TR, cabezal / manifold, línea de entrada, separador bifásico; en paralelo, salida de líquido con medidor Coriolis y después la LV, y salida de gas con placa de orificio y después la PV; reincorporación y línea a batería. Transmisores al ' + (util.equipo('rtu') || { nombre: 'RTU' }).nombre + ' y ' + (util.equipo('scada') || { nombre: 'SCADA' }).nombre + '.';
    var styleEl = E('style', null, svg);
    var defs = E('defs', null, svg);

    /* gradientes y filtros (colores vía CSS stop-color → cambian con el tema) */
    function grad(id, stops, vertical) {
      var g = E('linearGradient', { id: u + '-' + id, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0 }, defs);
      stops.forEach(function (s) { E('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] != null ? s[2] : 1, class: s[3] }, g); });
      return g;
    }
    grad('gsheet', [[0, '#000', 1, 'st-s0'], [1, '#000', 1, 'st-s1']], true);
    grad('gves', [[0, '#000', 1, 'st-v1'], [0.32, '#000', 1, 'st-v0'], [1, '#000', 1, 'st-v1']], true);
    grad('gliq', [[0, '#000', 1, 'st-l0'], [0.18, '#000', 1, 'st-l1'], [1, '#000', 1, 'st-l1']], true);
    var shadow = E('filter', { id: u + '-sh', x: '-20%', y: '-200%', width: '140%', height: '500%' }, defs);
    E('feGaussianBlur', { stdDeviation: 9 }, shadow);
    var mk = E('marker', { id: u + '-ah', viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
    E('path', { d: 'M0 1L9 5L0 9Z', class: 'mk' }, mk);
    var sigMask = E('mask', { id: u + '-sm', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);

    /* capas (orden z) */
    function layer(name) { return E('g', { class: 'L-' + name }, svg); }
    var Ls = {
      sheet: layer('sheet'), zone: layer('zone'), lines: layer('lines'), pu: layer('pu'), arw: layer('arw'),
      eq: layer('eq'), imp: layer('imp'), ctl: layer('ctl'), sig: layer('sig'), spu: layer('spu'),
      inst: layer('inst'), lbl: layer('lbl'), chrome: layer('chrome')
    };
    Ls.sig.setAttribute('mask', 'url(#' + u + '-sm)');
    /* overlay: pulsos en un SVG aparte (capa propia del navegador → el DTI no se repinta en cada cuadro) */
    var ov = null;
    if (opts.overlay) {
      ov = E('svg', { xmlns: NS, viewBox: '0 0 ' + W + ' ' + H, class: 'pid-ov ' + u + (opts.capa ? ' capa-' + opts.capa : ''), 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
      ov.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;background:transparent';
      ov.appendChild(Ls.pu); ov.appendChild(Ls.spu);
    }

    var api = {
      svg: svg, orientacion: orient, tema: tema, tag: tag, W: W, H: H,
      lineas: { mezcla: [], gas: [], liquido: [], salida: [], senal: [] },
      instrumentos: {}, equipos: {}, funciones: {}, lineasPorId: {}, orden: []
    };
    var lines = [], signals = [], reveals = [], pulses = [], sigPulses = [];

    /* ---------------- primitivas ---------------- */
    function T(parent, x, y, str, o) {
      o = o || {};
      var size = o.size || 12, font = o.font || 'b';
      var cls = (font === 'c' ? 'fc ' : font === 'm' ? 'fm ' : '') + (o.cls || '');
      var n = E('text', {
        x: r1(x), y: r1(y), class: cls.trim() || null, 'font-size': size, 'font-weight': o.weight || null,
        'text-anchor': o.anchor || null, 'letter-spacing': o.ls || null, transform: o.rot ? 'rotate(' + o.rot + ' ' + r1(x) + ' ' + r1(y) + ')' : null
      }, parent);
      n.textContent = str;
      if (o.maxW) {
        var w = textW(str, size, font, o.ls);
        if (w > o.maxW) { n.setAttribute('textLength', r1(o.maxW)); n.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
      }
      return n;
    }
    function TL_(parent, x, y, linesArr, o) { // varias líneas
      var lh = o.lh || (o.size || 12) * 1.25;
      linesArr.forEach(function (s, i) { T(parent, x, y + i * lh, s, o); });
      return linesArr.length * lh;
    }
    function rg(parent, at, cx, cy, dur) { // grupo con aparición
      var g = E('g', null, parent);
      if (at != null && at > 0) reveals.push({ g: g, at: at, cx: cx, cy: cy, dur: dur || 0.035 });
      return g;
    }
    function eqGroup(id, parent, at, cx, cy) {
      var g = rg(parent, at, cx, cy);
      var inner = E('g', { class: 'eq hl', 'data-eq': id }, g);
      if (!api.equipos[id]) api.equipos[id] = inner;
      return inner;
    }
    function line(id, stream, pts, o) {
      o = o || {};
      var acc = cum(pts), len = acc[acc.length - 1];
      var d = pathD(pts, o.rad != null ? o.rad : 12);
      var g = E('g', { class: 'pl hl' + (o.off ? ' pl-off' : ''), 'data-stream': stream, 'data-line': id }, Ls.lines);
      var paths = [];
      if (!o.off) paths.push(E('path', { d: d, class: 'pl-c', pathLength: 1 }, g));
      paths.push(E('path', { d: d, class: 'pl-k', pathLength: o.off ? null : 1 }, g));
      if (!o.off) paths.push(E('path', { d: d, class: 'pl-s', pathLength: 1 }, g));
      if (opts.interactivo) {
        var hit = E('path', { d: d, class: 'pl-hit', 'data-stream': stream, tabindex: o.off ? null : 0, role: o.off ? null : 'button', 'aria-label': o.aria || null }, g);
        hit.setAttribute('focusable', 'true');
      }
      var w = TL[id] || [0, 1];
      var L = { id: id, stream: stream, pts: pts, acc: acc, len: len, a: w[0], b: w[1], paths: paths, g: g, off: !!o.off };
      if (o.eq) { g.setAttribute('data-eq', o.eq); if (!api.equipos[o.eq]) api.equipos[o.eq] = g; }
      lines.push(L); api.lineasPorId[id] = { stream: stream, paths: paths, len: len, a: L.a, b: L.b };
      api.orden.push(id);
      paths.forEach(function (p) { api.lineas[stream].push(p); });
      if (o.off) reveals.push({ g: g, at: L.a, cx: pts[0][0], cy: pts[0][1], dur: L.b - L.a });
      // flechas de dirección
      var arr = o.arrows;
      if (!arr) {
        arr = [];
        for (var i = 1; i < pts.length; i++) {
          var sl = acc[i] - acc[i - 1];
          if (sl > (o.minArrow || 150)) arr.push((acc[i - 1] + sl * 0.5) / len);
        }
      }
      arr.forEach(function (f) {
        var p = pointAt(pts, acc, f * len);
        var ag = rg(Ls.arw, L.a + (L.b - L.a) * f, p.x, p.y, 0.02);
        var a = E('path', { d: 'M7 0L-6 -7L-3 0L-6 7Z', class: 'arw hl', 'data-stream': stream, transform: 'translate(' + r1(p.x) + ' ' + r1(p.y) + ') rotate(' + r1(p.a * 180 / Math.PI) + ')' }, ag);
        a.setAttribute('data-line', id);
      });
      // pulsos de flujo
      if (!o.off) {
        var sp = o.spacing || 44, n = Math.max(2, Math.floor(len / sp));
        var gp = E('g', { class: 'hl', 'data-stream': stream }, Ls.pu);
        for (var j = 0; j < n; j++) {
          var h = E('circle', { r: stream === 'gas' ? 6.5 : 7, class: 'pu pu-h', 'data-stream': stream, cx: -99, cy: -99 }, gp);
          var c = E('circle', { r: stream === 'gas' ? 2.6 : 3, class: 'pu', 'data-stream': stream, cx: -99, cy: -99 }, gp);
          pulses.push({ c: c, h: h, L: L, off: j * len / n, speed: o.speed || (stream === 'gas' ? 92 : stream === 'liquido' ? 46 : 62) });
        }
      }
      return L;
    }
    function at(lineId, x, y) {
      var L = lines.filter(function (l) { return l.id === lineId; })[0];
      if (!L) return 0;
      var f = projectS(L.pts, L.acc, x, y) / L.len;
      return L.a + (L.b - L.a) * f;
    }
    function signal(id, pts, o) {
      o = o || {};
      var d = pathD(pts, o.rad != null ? o.rad : 6, o.hops);
      var acc = cum(pts), len = acc[acc.length - 1];
      var p = E('path', { d: d, class: 'sig hl', 'data-tag': o.tag || null, 'data-stream': 'senal', 'marker-end': o.arrow === false ? null : 'url(#' + u + '-ah)' }, Ls.sig);
      if (o.tags) p.setAttribute('data-tags', o.tags.join(' '));
      // derivación (la misma señal va a dos funciones): punto de conexión
      (o.dots || []).forEach(function (q) {
        var dot = E('circle', { cx: r1(q[0]), cy: r1(q[1]), r: 4, class: 'mk hl', 'data-tag': o.tag || null }, Ls.sig);
        if (o.tags) dot.setAttribute('data-tags', o.tags.join(' '));
      });
      var rv = E('path', { d: d, class: 'sig-rv', pathLength: 1 }, sigMask);
      var S = { id: id, p: p, rv: rv, pts: pts, acc: acc, len: len, a: o.a, b: o.b, tag: o.tag };
      signals.push(S); api.lineas.senal.push(p);
      // pulsos de señal (viajan hacia el RTU / hacia la válvula)
      var np = Math.max(1, Math.round(len / 260));
      for (var j = 0; j < np; j++) {
        var hh = E('circle', { r: 7, class: 'pu-s pu-h hl', 'data-tag': o.tag || null, cx: -99, cy: -99 }, Ls.spu);
        var c = E('circle', { r: 2.8, class: 'pu-s hl', 'data-tag': o.tag || null, cx: -99, cy: -99 }, Ls.spu);
        if (o.tags) { c.setAttribute('data-tags', o.tags.join(' ')); hh.setAttribute('data-tags', o.tags.join(' ')); }
        sigPulses.push({ c: c, h: hh, S: S, off: j / np });
      }
      return S;
    }
    function imp(pts, parent, o) {
      o = o || {};
      var p = E('path', { d: pathD(pts, 0), class: 'imp' + (o.cls ? ' ' + o.cls : '') }, parent || Ls.imp);
      return p;
    }

    /* símbolos ISA */
    function gate(g, x, y, o) {
      o = o || {};
      var a = o.s || 11, b = a * 0.7, d;
      if (o.v) d = 'M' + (x - b) + ' ' + (y - a) + 'L' + x + ' ' + y + 'L' + (x + b) + ' ' + (y - a) + 'Z M' + (x - b) + ' ' + (y + a) + 'L' + x + ' ' + y + 'L' + (x + b) + ' ' + (y + a) + 'Z';
      else d = 'M' + (x - a) + ' ' + (y - b) + 'L' + x + ' ' + y + 'L' + (x - a) + ' ' + (y + b) + 'Z M' + (x + a) + ' ' + (y - b) + 'L' + x + ' ' + y + 'L' + (x + a) + ' ' + (y + b) + 'Z';
      return E('path', { d: d, class: 'sym' + (o.nc ? ' sym-nc' : '') }, g);
    }
    function controlValve(g, x, y, o) { // actuador de diafragma; o.side: 'up' (por defecto) | 'right' | 'left'
      o = o || {};
      gate(g, x, y, { v: o.v });
      var side = o.side || 'up', L = 20, R = 13;
      if (side === 'up') {
        E('line', { x1: x, y1: y, x2: x, y2: y - L, class: 'sym-l' }, g);
        E('path', { d: 'M' + (x - R) + ' ' + (y - L) + 'A' + R + ' ' + R + ' 0 0 1 ' + (x + R) + ' ' + (y - L) + 'Z', class: 'sym' }, g);
        return { x: x, y: y - L - R };
      }
      var sx = side === 'right' ? 1 : -1;
      E('line', { x1: x, y1: y, x2: x + sx * L, y2: y, class: 'sym-l' }, g);
      E('path', { d: 'M' + (x + sx * L) + ' ' + (y - R) + 'A' + R + ' ' + R + ' 0 0 ' + (sx > 0 ? 1 : 0) + ' ' + (x + sx * L) + ' ' + (y + R) + 'Z', class: 'sym' }, g);
      return { x: x + sx * (L + R), y: y };
    }
    function choke(g, x, y, o) {
      o = o || {};
      gate(g, x, y, { v: o.v, s: 12 });
      E('line', { x1: x - 15, y1: y + 14, x2: x + 12, y2: y - 13, class: 'sym-l' }, g);
      E('path', { d: 'M' + (x + 16) + ' ' + (y - 17) + 'l-10 2.5l7.5 7.5Z', class: 'ink-f' }, g);
    }
    function psv(g, x, y, dir) { // base en (x,y) sobre el recipiente, sube; descarga hacia dir
      dir = dir || 1;
      var c = y - 24;
      E('line', { x1: x, y1: y, x2: x, y2: y - 10, class: 'sym-l' }, g);
      E('path', { d: 'M' + (x - 8) + ' ' + (y - 10) + 'L' + (x + 8) + ' ' + (y - 10) + 'L' + x + ' ' + c + 'Z', class: 'sym' }, g);
      E('path', { d: 'M' + (x + dir * 14) + ' ' + (c - 8) + 'L' + (x + dir * 14) + ' ' + (c + 8) + 'L' + x + ' ' + c + 'Z', class: 'sym' }, g);
      E('path', { d: 'M' + x + ' ' + c + 'L' + x + ' ' + (c - 6) + 'l-5 -3l10 -4l-10 -4l10 -4l-5 -3', class: 'sym-l' }, g);
      E('line', { x1: x - 6, y1: c - 25, x2: x + 6, y2: c - 25, class: 'sym-l' }, g);
      E('line', { x1: x + dir * 14, y1: c, x2: x + dir * 26, y2: c, class: 'sym-l' }, g);
      E('line', { x1: x + dir * 26, y1: c - 6, x2: x + dir * 26, y2: c + 6, class: 'sym-l' }, g);
      return c;
    }
    function orifice(g, x, y, o) {
      o = o || {};
      if (o.v) {
        E('line', { x1: x - 13, y1: y - 6, x2: x + 13, y2: y - 6, class: 'sym-l' }, g);
        E('line', { x1: x - 13, y1: y + 6, x2: x + 13, y2: y + 6, class: 'sym-l' }, g);
        E('line', { x1: x - 17, y1: y, x2: x + 17, y2: y, class: 'plate' }, g);
      } else {
        E('line', { x1: x - 6, y1: y - 13, x2: x - 6, y2: y + 13, class: 'sym-l' }, g);
        E('line', { x1: x + 6, y1: y - 13, x2: x + 6, y2: y + 13, class: 'sym-l' }, g);
        E('line', { x1: x, y1: y - 17, x2: x, y2: y + 17, class: 'plate' }, g);
      }
    }
    function coriolis(g, x, y) {
      E('rect', { x: x - 32, y: y - 15, width: 64, height: 30, rx: 5, class: 'sym' }, g);
      E('path', { d: 'M' + (x - 25) + ' ' + (y - 3) + 'q6 -10 12 0t12 0t12 0t12 0', class: 'sym-l' }, g);
      E('path', { d: 'M' + (x - 25) + ' ' + (y + 4) + 'q6 -10 12 0t12 0t12 0t12 0', class: 'sym-l' }, g);
    }
    function offPage(g, x, y, w, h, dir, label, o) { // conector fuera de hoja (pentágono)
      o = o || {};
      var p;
      if (dir === 'right') p = [[x, y - h / 2], [x + w - h / 2, y - h / 2], [x + w, y], [x + w - h / 2, y + h / 2], [x, y + h / 2]];
      else if (dir === 'down') { var dp = Math.min(w / 2, h * 0.42); p = [[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + h - dp], [x, y + h], [x - w / 2, y + h - dp]]; }
      E('path', { d: 'M' + p.map(function (q) { return r1(q[0]) + ' ' + r1(q[1]); }).join('L') + 'Z', class: o.acc ? 'sym-acc' : 'sym' }, g);
      if (label) {
        if (dir === 'right') T(g, x + (w - h / 2) / 2 + 2, y + (o.size || 14) * 0.36, label, { font: 'c', size: o.size || 14, weight: 700, anchor: 'middle', cls: o.acc ? 'ton' : '', ls: 0.5 });
        else T(g, x, y + (h - w / 2) / 2 + 5, label, { font: 'c', size: o.size || 12, weight: 700, anchor: 'middle', cls: o.acc ? 'ton' : '' });
      }
    }
    function bubble(tg, x, y, kind, o) {
      o = o || {};
      var r = o.r || 25;
      var inst = util.instrumento(tg);
      var top = o.isa || (inst ? inst.isa : tg), bot = o.sub != null ? o.sub : tg;
      if (o.imp || o.deco) {
        var gi0 = rg(Ls.imp, o.at, x, y, 0.03);
        var gi = E('g', { class: 'hl', 'data-tag': o.key || tg, 'data-stream': o.stream || null }, gi0);
        (o.imp || []).forEach(function (pts) { E('path', { d: pathD(pts, 0), class: 'imp' }, gi); });
        if (o.deco) o.deco(gi);
      }
      var g0 = rg(Ls.inst, o.at, x, y, 0.03);
      var g = E('g', { class: 'inst hl', 'data-tag': o.key || tg, 'data-kind': kind, 'data-stream': o.stream || null }, g0);
      if (opts.interactivo) {
        g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
        g.setAttribute('aria-label', (kind === 'funcion' ? 'Función ' : 'Instrumento ') + top + ' ' + bot + (inst ? ': ' + inst.variable : o.aria ? ': ' + o.aria : ''));
      }
      E('circle', { cx: x, cy: y, r: r + 7, class: 'ring' }, g);
      if (kind === 'funcion') E('rect', { x: x - r - 3, y: y - r - 3, width: 2 * r + 6, height: 2 * r + 6, class: 'b-sq' }, g);
      E('circle', { cx: x, cy: y, r: r, class: 'b' }, g);
      if (kind === 'funcion') E('line', { x1: x - r, y1: y, x2: x + r, y2: y, class: 'b-l' }, g);
      var s = r / 25;
      T(g, x, y - 5 * s, top, { font: 'c', size: 15 * s, weight: 700, anchor: 'middle', maxW: 1.6 * r });
      if (bot) {
        // tag inferior: si no cabe en la cuerda del círculo se reduce el cuerpo de letra (no se deforma)
        var bs = 11.5 * s, bw = textW(bot, bs, 'c'), lim = 1.24 * r;
        if (bw > lim) bs = Math.max(8 * s, bs * lim / bw);
        T(g, x, y + 15 * s - (11.5 * s - bs) * 0.6, bot, { font: 'c', size: Math.round(bs * 10) / 10, weight: 600, anchor: 'middle', cls: kind === 'local' ? 'tmu' : 'tac' });
      }
      if (o.key && !api.funciones[o.key] && kind === 'funcion') api.funciones[o.key] = g;
      else if (inst && kind !== 'funcion') api.instrumentos[tg] = g;
      if (kind === 'local') { g.setAttribute('data-eq', 'manometro'); api.equipos.manometro = g; }
      return g;
    }
    function eqLabel(parent, x, y, title, sub, o) {
      o = o || {};
      var g = E('g', { class: 'lbl hl', 'data-eq': o.eq || null }, parent);
      var anchor = o.anchor || 'middle';
      var lines1 = o.wrap ? wrap(up(title), o.wrap, o.size || 14, 'c') : [up(title)];
      var h = TL_(g, x, y, lines1, { font: 'c', size: o.size || 14, weight: 700, anchor: anchor, ls: 0.6, lh: (o.size || 14) * 1.1 });
      if (sub) {
        var subs = o.subWrap ? wrap(sub, o.subWrap, o.subSize || 11.5, 'b') : [sub];
        TL_(g, x, y + h + 1, subs, { size: o.subSize || 11.5, weight: 500, anchor: anchor, cls: 'ti2', lh: (o.subSize || 11.5) * 1.25 });
      }
      return g;
    }
    function tagBox(parent, x, y, txt, o) { // rótulo tipo placa (LV, PV, FE…)
      o = o || {};
      var w = textW(txt, 12, 'm') + 10;
      var g = E('g', null, parent);
      E('rect', { x: r1(x - (o.anchor === 'start' ? 0 : w / 2)), y: y - 10, width: r1(w), height: 16, rx: 3, class: o.acc ? 'sym-acc' : 'sym' }, g);
      T(g, x + (o.anchor === 'start' ? w / 2 : 0), y + 2.5, txt, { font: 'm', size: 11, weight: 700, anchor: 'middle', cls: o.acc ? 'ton' : '' });
      return g;
    }

    /* árbol de válvulas: (x, g = nivel de terreno); dir = lado de la producción (1 der, -1 izq) */
    function tree(g, x, gy, dir) {
      var eqg = g;
      // subsuelo: TR y TP
      E('line', { x1: x - 74, y1: gy, x2: x + 74, y2: gy, class: 'ground' }, eqg);
      for (var i = -70; i <= 64; i += 12) E('line', { x1: x + i, y1: gy + 9, x2: x + i + 8, y2: gy + 1, class: 'ground' }, eqg);
      E('path', { d: 'M' + (x - 19) + ' ' + gy + 'v40M' + (x + 19) + ' ' + gy + 'v40', class: 'sym-d' }, eqg);
      E('path', { d: 'M' + (x - 7) + ' ' + gy + 'v48M' + (x + 7) + ' ' + gy + 'v48', class: 'sym-d' }, eqg);
      // cuerpo vertical
      E('rect', { x: x - 7, y: gy - 158, width: 14, height: 128, class: 'sym' }, eqg);
      // cabezal de TR con laterales (cerradas)
      E('rect', { x: x - 26, y: gy - 30, width: 52, height: 28, rx: 2, class: 'sym' }, eqg);
      [-1, 1].forEach(function (s) {
        E('line', { x1: x + s * 26, y1: gy - 16, x2: x + s * 56, y2: gy - 16, class: 'sym-l' }, eqg);
        gate(eqg, x + s * 43, gy - 16, { nc: true, s: 9 });
        E('line', { x1: x + s * 56, y1: gy - 23, x2: x + s * 56, y2: gy - 9, class: 'sym-l' }, eqg);
      });
      // maestras
      gate(eqg, x, gy - 50, { v: true, s: 11 });
      gate(eqg, x, gy - 76, { v: true, s: 11 });
      // cruz
      E('rect', { x: x - 13, y: gy - 115, width: 26, height: 26, rx: 2, class: 'sym' }, eqg);
      // ala de producción (abierta) y ala opuesta (cerrada)
      E('line', { x1: x + dir * 13, y1: gy - 102, x2: x + dir * 62, y2: gy - 102, class: 'sym-l' }, eqg);
      gate(eqg, x + dir * 38, gy - 102, { s: 11 });
      E('line', { x1: x - dir * 13, y1: gy - 102, x2: x - dir * 52, y2: gy - 102, class: 'sym-l' }, eqg);
      gate(eqg, x - dir * 34, gy - 102, { nc: true, s: 10 });
      E('line', { x1: x - dir * 52, y1: gy - 109, x2: x - dir * 52, y2: gy - 95, class: 'sym-l' }, eqg);
      // sondeo y tapa
      gate(eqg, x, gy - 132, { v: true, s: 10 });
      E('rect', { x: x - 12, y: gy - 166, width: 24, height: 12, rx: 2, class: 'sym' }, eqg);
      E('rect', { x: x - 5, y: gy - 172, width: 10, height: 6, class: 'sym' }, eqg);
      return { wingX: x + dir * 62, wingY: gy - 102, capY: gy - 166, capX: x };
    }

    /* separador horizontal: (cx, cy, largo, r, hr), dir = 1 entrada a la izquierda, -1 a la derecha */
    function vessel(g, V) {
      var x0 = V.cx - V.L / 2, x1 = V.cx + V.L / 2, r = V.r, hr = V.hr, cy = V.cy;
      var d = 'M' + (x0 + hr) + ' ' + (cy - r) + 'H' + (x1 - hr) + 'A' + hr + ' ' + r + ' 0 0 1 ' + (x1 - hr) + ' ' + (cy + r) + 'H' + (x0 + hr) + 'A' + hr + ' ' + r + ' 0 0 1 ' + (x0 + hr) + ' ' + (cy - r) + 'Z';
      var cp = E('clipPath', { id: u + '-vclip' }, defs);
      E('path', { d: d }, cp);
      // silletas
      E('ellipse', { cx: V.cx, cy: cy + r + 20, rx: V.L * 0.46, ry: 9, class: 'v-shadow', filter: 'url(#' + u + '-sh)' }, g);
      (V.saddles || [x0 + hr + 34, x1 - hr - 34]).forEach(function (sx) {
        E('path', { d: 'M' + (sx - 20) + ' ' + (cy + r + 18) + 'L' + (sx - 12) + ' ' + (cy + r - 8) + 'H' + (sx + 12) + 'L' + (sx + 20) + ' ' + (cy + r + 18) + 'Z', class: 'sym' }, g);
      });
      E('path', { d: d, class: 'vessel' }, g);
      var inner = E('g', { 'clip-path': 'url(#' + u + '-vclip)' }, g);
      var yN = cy + r * 0.22;
      E('rect', { x: x0, y: cy - r, width: V.L, height: yN - (cy - r), class: 'gas-z' }, inner);
      E('rect', { x: x0, y: yN, width: V.L, height: cy + r - yN, class: 'liq-z' }, inner);
      E('ellipse', { cx: V.cx, cy: cy - r * 0.55, rx: V.L * 0.42, ry: r * 0.18, class: 'vessel-hi' }, inner);
      E('line', { x1: x0, y1: yN, x2: x1, y2: yN, class: 'nll' }, inner);
      // líneas de tangencia
      E('path', { d: 'M' + (x0 + hr) + ' ' + (cy - r) + 'V' + (cy + r) + 'M' + (x1 - hr) + ' ' + (cy - r) + 'V' + (cy + r), class: 'sym-t', opacity: 0.5 }, g);
      return { x0: x0, x1: x1, yN: yN, d: d, headX: function (y, side) {
        var k = Math.sqrt(Math.max(0, 1 - Math.pow((y - cy) / r, 2)));
        return side < 0 ? x0 + hr - hr * k : x1 - hr + hr * k;
      } };
    }

    function nfpa(g, x, y, s) {
      var n = data.separador.nfpa; if (!n) return;
      var h = s / 2;
      var gg = E('g', { transform: 'translate(' + x + ' ' + y + ') rotate(45)' }, g);
      E('rect', { x: -h, y: -h, width: h, height: h, class: 'nfpa-f' }, gg);
      E('rect', { x: 0, y: -h, width: h, height: h, class: 'nfpa-r' }, gg);
      E('rect', { x: -h, y: 0, width: h, height: h, class: 'nfpa-h' }, gg);
      E('rect', { x: 0, y: 0, width: h, height: h, class: 'nfpa-s' }, gg);
      E('rect', { x: -h, y: -h, width: s, height: s, fill: 'none', stroke: '#0b2545', 'stroke-width': 1 }, gg);
      var q = s * 0.36;
      T(g, x, y - q + 4, String(n.inflamabilidad), { size: 11, anchor: 'middle', cls: 'nfpa-tw' });
      T(g, x - q, y + 4, String(n.salud), { size: 11, anchor: 'middle', cls: 'nfpa-tw' });
      T(g, x + q, y + 4, String(n.reactividad), { size: 11, anchor: 'middle', cls: 'nfpa-t' });
    }

    /* ---------------- marco de hoja, encabezado, cajas ---------------- */
    function sheet() {
      var g = Ls.sheet;
      E('rect', { x: 0, y: 0, width: W, height: H, class: 'sheet-bg' }, g);
      var gr = E('g', null, g), x, y;
      for (x = 28; x <= W - 28; x += 24) E('line', { x1: x, y1: 28, x2: x, y2: H - 28, class: (x - 28) % 120 === 0 ? 'grid2' : 'grid' }, gr);
      for (y = 28; y <= H - 28; y += 24) E('line', { x1: 28, y1: y, x2: W - 28, y2: y, class: (y - 28) % 120 === 0 ? 'grid2' : 'grid' }, gr);
      E('rect', { x: 12, y: 12, width: W - 24, height: H - 24, class: 'frame2' }, g);
      E('rect', { x: 28, y: 28, width: W - 56, height: H - 56, class: 'frame' }, g);
      // zonas tipo plano (1..n / A..)
      var nx = Math.round((W - 56) / 240), ny = Math.round((H - 56) / 240), i;
      for (i = 0; i < nx; i++) {
        var cx = 28 + (W - 56) * (i + 0.5) / nx;
        T(g, cx, 24, String(i + 1), { font: 'm', size: 10, anchor: 'middle', cls: 'tmu' });
        T(g, cx, H - 15, String(i + 1), { font: 'm', size: 10, anchor: 'middle', cls: 'tmu' });
        if (i > 0) { var xx = 28 + (W - 56) * i / nx; E('line', { x1: xx, y1: 12, x2: xx, y2: 28, class: 'frame2' }, g); E('line', { x1: xx, y1: H - 28, x2: xx, y2: H - 12, class: 'frame2' }, g); }
      }
      for (i = 0; i < ny; i++) {
        var cy = 28 + (H - 56) * (i + 0.5) / ny, L = String.fromCharCode(65 + i);
        T(g, 20, cy + 4, L, { font: 'm', size: 10, anchor: 'middle', cls: 'tmu' });
        T(g, W - 20, cy + 4, L, { font: 'm', size: 10, anchor: 'middle', cls: 'tmu' });
        if (i > 0) { var yy = 28 + (H - 56) * i / ny; E('line', { x1: 12, y1: yy, x2: 28, y2: yy, class: 'frame2' }, g); E('line', { x1: W - 28, y1: yy, x2: W - 12, y2: yy, class: 'frame2' }, g); }
      }
    }
    function box(x, y, w, h, title, o) {
      o = o || {};
      var g = E('g', { class: 'lbl', 'data-box': o.id || null }, Ls.chrome);
      E('rect', { x: x, y: y, width: w, height: h, rx: 6, class: 'box' }, g);
      if (title) {
        E('path', { d: 'M' + (x + 6) + ' ' + y + 'H' + (x + w - 6) + 'a6 6 0 0 1 6 6V' + (y + 28) + 'H' + x + 'V' + (y + 6) + 'a6 6 0 0 1 6 -6Z', class: 'box-h' }, g);
        E('rect', { x: x, y: y + 6, width: 4, height: 18, class: 'acc-f' }, g);
        T(g, x + 14, y + 19, up(title), { font: 'm', size: 12, weight: 700, ls: 1.6, cls: 'tac' });
        if (o.sub) T(g, x + w - 12, y + 19, o.sub, { size: 11, anchor: 'end', cls: 'tmu' });
      }
      return g;
    }
    function header(o) {
      var g = E('g', { class: 'lbl' }, Ls.chrome);
      E('rect', { x: o.x, y: o.y + 2, width: 6, height: o.barH, class: 'acc-f' }, g);
      T(g, o.x + 20, o.y + 14, up('Entregable 4 · Infografía del DTI (P&ID)'), { font: 'm', size: 13, weight: 700, ls: 2.2, cls: 'tac' });
      var yy = o.y + 14 + o.t1;
      o.titles.forEach(function (t) {
        var tx = T(g, o.x + 20, yy, '', { font: 'c', size: t.size, weight: 800, ls: 0.4 });
        t.parts.forEach(function (p) { var ts = E('tspan', { class: p.acc ? 'tac' : null }, tx); ts.textContent = up(p.s); });
        yy += t.lh;
      });
      // recorrido completo desde WT.data.equipos; las dos salidas medidas van en paralelo (no en serie)
      var vcs = data.valvulasControl && data.valvulasControl.length ? data.valvulasControl : VALVULAS;
      var vDe = function (st) { for (var i = 0; i < vcs.length; i++) if (vcs[i].corriente === st) return vcs[i].tag; return ''; };
      var corto = function (id, def) { var e = util.equipo(id); return e ? String(e.corto || e.nombre).split(' ')[0] : def; };
      var route = [];
      data.equipos.forEach(function (e) {
        if (['rtu', 'scada', 'placa'].indexOf(e.id) >= 0) return;
        if (e.id === 'coriolis') {
          route.push('líquido (' + corto('coriolis', 'Coriolis') + ' → ' + vDe('liquido') + ')  /  gas (' + corto('placa', 'Placa').toLowerCase() + ' → ' + vDe('gas') + ')');
          return;
        }
        route.push(e.nombre.split(' + ')[0]);
      });
      var rs = route.join('  →  ');
      if (o.routeW) {
        // corte solo entre etapas (nunca dentro de un paréntesis): la línea termina en «→» y la siguiente sigue con la etapa
        var lns = [], cur = '';
        route.forEach(function (pt) {
          var tryS = cur ? cur + '  →  ' + pt : pt;
          if (cur && textW(tryS, 14, 'b') > o.routeW) { lns.push(cur + '  →'); cur = pt; } else cur = tryS;
        });
        if (cur) lns.push(cur);
        TL_(g, o.x + 20, yy + o.routeDy, lns, { size: 14, weight: 500, cls: 'ti2', lh: 19 });
      } else T(g, o.x + 20, yy + o.routeDy, rs, { size: 14, weight: 500, cls: 'ti2' });
      return g;
    }
    function scadaBox(x, y, w, h) {
      var eq = util.equipo('scada');
      var g0 = rg(Ls.ctl, T_SCADA, x + w / 2, y + h / 2, 0.04);
      var g = E('g', { class: 'eq hl', 'data-eq': 'scada' }, g0);
      api.equipos.scada = g;
      E('rect', { x: x, y: y, width: w, height: h, rx: 8, class: 'box' }, g);
      // monitor
      var mx = x + 14, my = y + 16;
      E('rect', { x: mx, y: my, width: 66, height: 44, rx: 4, class: 'sym' }, g);
      E('rect', { x: mx + 5, y: my + 5, width: 56, height: 30, rx: 2, class: 'band' }, g);
      E('path', { d: 'M' + (mx + 9) + ' ' + (my + 28) + 'l10 -8l8 5l10 -12l9 7l10 -6', class: 'sig', 'stroke-dasharray': 'none' }, g);
      E('path', { d: 'M' + (mx + 25) + ' ' + (my + 44) + 'h16l4 9h-24Z', class: 'sym' }, g);
      var nm = eq.nombre.replace(/\s*\(.*\)/, ''), pc = (eq.nombre.match(/\(([^)]+)\)/) || [])[1] || '';
      T(g, x + 94, y + 30, up(nm), { font: 'c', size: 19, weight: 800, ls: 0.6 });
      T(g, x + 94, y + 48, pc + ' · HMI de medición', { size: 12, weight: 600, cls: 'ti2' });
      // estados de la medición
      var sx = x + 94, sy = y + 62, i;
      var est = data.estados;
      var avail = w - 94 - 12, gap = 14;
      var tot = 0, ws = est.map(function (e) { var ww = textW(e.nombre, 11, 'c') + 14; tot += ww; return ww; });
      var sc = Math.min(1, (avail - gap * (est.length - 1)) / tot);
      for (i = 0; i < est.length; i++) {
        var ww = ws[i] * sc;
        E('rect', { x: r1(sx), y: sy, width: r1(ww), height: 18, rx: 9, class: i === 1 ? 'sym-acc' : 'sym' }, g);
        T(g, sx + ww / 2, sy + 13, est[i].nombre, { font: 'c', size: 11, weight: 700, anchor: 'middle', cls: i === 1 ? 'ton' : '', maxW: ww - 8 });
        if (i < est.length - 1) T(g, sx + ww + gap / 2, sy + 13, '→', { size: 11, anchor: 'middle', cls: 'tmu' });
        sx += ww + gap;
      }
      T(g, x + 14, y + h - 12, 'Medición ' + data.medicion.horasMedicion + ' h · acumulados Q mezcla / aceite / agua / gas', { size: 11.5, weight: 600, cls: 'ti2', maxW: w - 28 });
      return g;
    }
    function rtuIcon(g, x, y) { // módulo ControlEdge (foto 04)
      E('rect', { x: x, y: y, width: 24, height: 56, rx: 7, class: 'sym' }, g);
      E('rect', { x: x + 3, y: y + 4, width: 18, height: 9, rx: 2, class: 'band' }, g);
      for (var i = 0; i < 4; i++) E('line', { x1: x + 7, y1: y + 19 + i * 5, x2: x + 17, y2: y + 19 + i * 5, class: 'sym-t' }, g);
      E('circle', { cx: x + 12, cy: y + 44, r: 3.4, fill: '#3ccf8e' }, g);
    }

    /* Leyenda (simbología) */
    function legend(x, y, w, h, cols) {
      var g = box(x, y, w, h, 'Simbología', { sub: 'ISA-5.1 simplificada', id: 'simbologia' });
      var rowH = cols.rowH || 23, rowHS = cols.rowHS || rowH, cy0 = y + 46;
      var itemsL = [
        ['mezcla', 'Mezcla del pozo (multifásica)'],
        ['gas', 'Gas separado'],
        ['liquido', 'Líquido: aceite + agua'],
        ['salida', 'Mezcla reincorporada → batería'],
        ['sig', 'Señal eléctrica 4–20 mA / HART'],
        ['dl', 'Enlace de datos RTU → SCADA'],
        ['imp', 'Conexión a proceso'],
        ['pkg', 'Límite del equipo en remolque']
      ];
      if (cols.sinPaquete) itemsL.pop();
      var itemsR = [
        ['campo', 'Instrumento de campo'],
        ['funcion', 'Función en RTU (control / cálculo)'],
        ['na', 'Válvula de bloqueo abierta'],
        ['nc', 'Válvula de bloqueo cerrada (NC)'],
        ['cv', 'Válvula de control (diafragma)'],
        ['psv', 'Válvula de seguridad (PSV)'],
        ['ck', 'Estrangulador'],
        ['fe', 'Placa de orificio (FE)'],
        ['cor', 'Medidor Coriolis']
      ];
      function swatch(k, sx, sy) {
        var gg = E('g', null, g);
        if (STREAMS.indexOf(k) >= 0) {
          E('path', { d: 'M' + sx + ' ' + sy + 'h46', class: 'lg-' + k + '-c' }, gg);
          E('path', { d: 'M' + sx + ' ' + sy + 'h46', class: 'lg-' + k + '-k' }, gg);
          E('path', { d: 'M' + (sx + 28) + ' ' + sy + 'm5 0l-9 -5l2 5l-2 5Z', class: 'arw' }, gg);
        } else if (k === 'sig') E('path', { d: 'M' + sx + ' ' + sy + 'h44', class: 'sig' }, gg);
        else if (k === 'dl') { E('path', { d: 'M' + sx + ' ' + sy + 'h46', class: 'dl' }, gg); [10, 23, 36].forEach(function (o) { E('circle', { cx: sx + o, cy: sy, r: 3.2, class: 'dl-o' }, gg); }); }
        else if (k === 'imp') E('path', { d: 'M' + sx + ' ' + sy + 'h46', class: 'imp' }, gg);
        else if (k === 'pkg') E('path', { d: 'M' + sx + ' ' + sy + 'h46', class: 'pkg' }, gg);
        else {
          // símbolos: cada uno se escala y se centra en su renglón (caja local conocida) → no se tocan entre sí
          var S = SYM[k]; if (!S) return;
          var maxH = rowHS - 5 + (S.dh || 0), bb = S.bb, kk = Math.min(S.k, maxH / (bb[3] - bb[1]), 40 / (bb[2] - bb[0]));
          var tx = sx + 23 - (bb[0] + bb[2]) / 2 * kk, ty = sy - (bb[1] + bb[3]) / 2 * kk;
          if (S.pipe) E('line', { x1: sx + (k === 'cor' ? 0 : 4), y1: r1(ty), x2: sx + (k === 'cor' ? 46 : 42), y2: r1(ty), class: 'sym-l' }, gg);
          S.draw(E('g', { transform: 'translate(' + r1(tx) + ' ' + r1(ty) + ') scale(' + (Math.round(kk * 1000) / 1000) + ')' }, gg));
        }
      }
      var SYM = {   // bb = caja local [x0, y0, x1, y1]; k = escala máxima; pipe = tubería a través del símbolo (y local 0)
        campo: { bb: [-9.5, -9.5, 9.5, 9.5], k: 1, draw: function (q) { E('circle', { cx: 0, cy: 0, r: 9.5, class: 'b' }, q); } },
        funcion: { bb: [-11, -11, 11, 11], k: 1, draw: function (q) { E('rect', { x: -11, y: -11, width: 22, height: 22, class: 'b-sq' }, q); E('circle', { cx: 0, cy: 0, r: 9.5, class: 'b' }, q); E('line', { x1: -9.5, y1: 0, x2: 9.5, y2: 0, class: 'b-l' }, q); } },
        na: { bb: [-9, -6.3, 9, 6.3], k: 1, pipe: true, draw: function (q) { gate(q, 0, 0, { s: 9 }); } },
        nc: { bb: [-9, -6.3, 9, 6.3], k: 1, pipe: true, draw: function (q) { gate(q, 0, 0, { s: 9, nc: true }); } },
        cv: { bb: [-13, -33, 13, 7.7], k: 0.62, pipe: true, draw: function (q) { controlValve(q, 0, 0); } },
        psv: { bb: [-8, -49, 26, 0], k: 0.55, dh: 3, draw: function (q) { psv(q, 0, 0, 1); } },
        ck: { bb: [-15, -17, 16, 14], k: 0.72, pipe: true, draw: function (q) { choke(q, 0, 0); } },
        fe: { bb: [-6, -17, 6, 17], k: 0.7, pipe: true, draw: function (q) { orifice(q, 0, 0); } },
        cor: { bb: [-32, -15, 32, 15], k: 0.6, pipe: true, draw: function (q) { coriolis(q, 0, 0); } }
      };
      var colW = (w - 28) / 2;
      [[itemsL, x + 14, 'Líneas', rowH], [itemsR, x + 14 + colW, 'Símbolos', rowHS]].forEach(function (col, ci) {
        T(g, col[1], cy0 - 4, up(col[2]), { font: 'c', size: 12, weight: 700, ls: 1.2, cls: 'tmu' });
        col[0].forEach(function (it, i) {
          var yy = cy0 + 14 + i * col[3];
          swatch(it[0], col[1], yy);
          T(g, col[1] + 58, yy + 4.5, it[1], { size: 12.5, weight: 500, maxW: colW - 64 });
        });
      });
      return g;
    }

    /* Lista de instrumentos desde WT.data.instrumentos */
    function instList(x, y, w, h, colsW) {
      var marca = data.instrumentos.length ? String(data.instrumentos[0].marca || '').split(' ')[0] : '';
      var g = box(x, y, w, h, 'Lista de instrumentos', { sub: (marca ? marca + ' → ' : '') + 'RTU', id: 'lista' });
      var cols = [['Tag', 'tag'], ['ISA', 'isa'], ['Variable', 'variable'], ['Punto de medición', 'punto'], ['Señal', 'senal']];
      var hy = y + 48, cx = x + 12;
      var rowsN = data.instrumentos.length;
      var rowH = (h - 62) / rowsN;
      var xs = [], acc = cx;
      colsW.forEach(function (cw) { xs.push(acc); acc += cw; });
      cols.forEach(function (c, i) { T(g, xs[i] + 4, hy, up(c[0]), { font: 'c', size: 12, weight: 700, ls: 1, cls: 'tmu' }); });
      E('line', { x1: x + 10, y1: hy + 6, x2: x + w - 10, y2: hy + 6, class: 'rule' }, g);
      data.instrumentos.forEach(function (ins, r) {
        var ry = hy + 8 + r * rowH;
        if (r % 2 === 0) E('rect', { x: x + 8, y: ry, width: w - 16, height: rowH, rx: 3, class: 'row-f' }, g);
        var by = ry + rowH / 2 + 4.5;
        var rowG = E('g', { class: 'lst hl', 'data-tag': ins.tag }, g);
        T(rowG, xs[0] + 4, by, ins.tag, { font: 'm', size: 12, weight: 700, cls: 'tac' });
        T(rowG, xs[1] + 4, by, ins.isa, { font: 'c', size: 13, weight: 700 });
        T(rowG, xs[2] + 4, by, ins.variable, { font: 'c', size: 13, weight: 500, maxW: colsW[2] - 10 });
        T(rowG, xs[3] + 4, by, ins.punto, { font: 'c', size: 13, weight: 500, cls: 'ti2', maxW: colsW[3] - 10 });
        T(rowG, xs[4] + 4, by, ins.senal, { font: 'c', size: 13, weight: 500, cls: 'ti2', maxW: colsW[4] - 8 });
      });
      return g;
    }

    function titleBlock(x, y, w, h, formato) {
      var g = box(x, y, w, h, null, { id: 'cuadro' });
      var logoH = Math.max(34, Math.min(58, h - 126 - 2 * 42)), logoW = logoH * LOGO_AR;
      var img = E('image', { x: x + 14, y: y + 12, width: r1(logoW), height: r1(logoH), class: 'logo', preserveAspectRatio: 'xMinYMid meet' }, g);
      img.setAttribute('href', assets + THEMES[tema].logo);
      api._logo = img;
      var ex = x + 14 + logoW + 14;
      T(g, x + w - 14, y + 12 + logoH / 2 - 1, up(data.empresa.servicio), { font: 'c', size: 18, weight: 800, anchor: 'end', ls: 1 });
      T(g, x + w - 14, y + 12 + logoH / 2 + 16, data.empresa.servicioEs, { size: 12.5, weight: 600, anchor: 'end', cls: 'ti2' });
      var y1 = y + logoH + 24;
      E('line', { x1: x, y1: y1, x2: x + w, y2: y1, class: 'rule' }, g);
      T(g, x + 14, y1 + 17, 'TÍTULO', { font: 'm', size: 10, weight: 700, ls: 1.4, cls: 'tmu' });
      var tl = wrap('DTI simplificado – Aforo de pozo con separador bifásico de circuito cerrado', w - 28, 18, 'c');
      var th = TL_(g, x + 14, y1 + 38, tl, { font: 'c', size: 18, weight: 700, lh: 20 });
      var y2 = y1 + 38 + th - 6;
      E('line', { x1: x, y1: y2, x2: x + w, y2: y2, class: 'rule' }, g);
      var cells = [
        ['Equipo', tag], ['Servicio', data.empresa.servicio], ['Revisión', 'Rev. 0'],
        ['Escala', 'Sin escala'], ['Formato', formato], ['Hoja', '1 de 1']
      ];
      var cw = w / 3, ch = Math.min(44, (y + h - 30 - y2) / 2);
      cells.forEach(function (c, i) {
        var cx = x + (i % 3) * cw, cy = y2 + Math.floor(i / 3) * ch;
        if (i % 3) E('line', { x1: cx, y1: cy, x2: cx, y2: cy + ch, class: 'rule' }, g);
        T(g, cx + 12, cy + 15, up(c[0]), { font: 'm', size: 9.5, weight: 700, ls: 1.2, cls: 'tmu' });
        T(g, cx + 12, cy + ch - 9, c[1], { font: c[0] === 'Equipo' ? 'm' : 'c', size: c[0] === 'Equipo' ? 14 : 15, weight: 700, cls: c[0] === 'Equipo' ? 'tac' : '', maxW: cw - 20 });
      });
      var y3 = y2 + 2 * ch;
      E('line', { x1: x, y1: y2 + ch, x2: x + w, y2: y2 + ch, class: 'rule' }, g);
      E('line', { x1: x, y1: y3, x2: x + w, y2: y3, class: 'rule' }, g);
      T(g, x + 14, y3 + (y + h - y3) / 2 + 4.5, 'Documento ilustrativo · sin escala', { size: 12.5, weight: 700 });
      T(g, x + w - 14, y3 + (y + h - y3) / 2 + 4.5, data.empresa.nombre, { size: 12, weight: 600, anchor: 'end', cls: 'ti2' });
      return g;
    }

    function notes(x, y, w, h, o) {
      o = o || {};
      var g = box(x, y, w, h, 'Notas', { id: 'notas' });
      var items = (o.extra || []).concat([
        'Separador bifásico: aceite y agua salen juntos en una sola corriente de líquido; el % de agua lo mide el Coriolis.',
        'Documento ilustrativo, sin escala. Diámetro nominal de líneas: ' + K.dnTexto + '.'
      ]);
      if (!o.compacto) items.unshift(data.separador.circuito + '.');
      var yy = y + 46, size = o.size || 12.2, lh = o.lh || 15.5;
      items.forEach(function (s, i) {
        T(g, x + 14, yy, (i + 1) + '.', { font: 'm', size: 11, weight: 700, cls: 'tac' });
        var ls = wrap(s, w - 48, size, 'b');
        TL_(g, x + 32, yy, ls, { size: size, weight: 500, cls: 'ti2', lh: lh });
        yy += ls.length * lh + 6;
      });
      return g;
    }

    function closedCard(x, y, w, h) {
      var g0 = rg(Ls.chrome, TL.s2[1], x + w / 2, y + h / 2, 0.05);
      var g = E('g', { class: 'lbl hl', 'data-eq': 'circuito' }, g0);
      E('rect', { x: x, y: y, width: w, height: h, rx: 10, class: 'box' }, g);
      E('rect', { x: x, y: y, width: 6, height: h, rx: 3, class: 'acc-f' }, g);
      // icono: lazo cerrado con flechas de colores de corriente
      var cx = x + 44, cy = y + 46, R = 22;
      E('circle', { cx: cx, cy: cy, r: R, class: 'lg-salida-c' }, g);
      E('path', { d: 'M' + (cx - R) + ' ' + cy + 'A' + R + ' ' + R + ' 0 0 1 ' + cx + ' ' + (cy - R), class: 'lg-gas-k', 'stroke-width': 5 }, g);
      E('path', { d: 'M' + cx + ' ' + (cy + R) + 'A' + R + ' ' + R + ' 0 0 1 ' + (cx - R) + ' ' + cy, class: 'lg-liquido-k', 'stroke-width': 5 }, g);
      E('path', { d: 'M' + (cx + R) + ' ' + cy + 'A' + R + ' ' + R + ' 0 0 1 ' + cx + ' ' + (cy + R), class: 'lg-mezcla-k', 'stroke-width': 5 }, g);
      E('path', { d: 'M' + (cx + R + 7) + ' ' + (cy - 3) + 'l-7 9l-7 -9Z', class: 'arw' }, g);
      T(g, x + 80, y + 40, 'CIRCUITO', { font: 'c', size: 20, weight: 800, ls: 1 });
      T(g, x + 80, y + 60, 'CERRADO', { font: 'c', size: 20, weight: 800, ls: 1, cls: 'tac' });
      E('rect', { x: x + 16, y: y + 84, width: w - 32, height: 26, rx: 13, class: 'sym-acc' }, g);
      T(g, x + w / 2, y + 101.5, 'NO SE VENTEA NI SE QUEMA', { font: 'c', size: 13.5, weight: 800, anchor: 'middle', cls: 'ton', ls: 0.8, maxW: w - 48 });
      var txt = 'Gas y líquido, ya medidos, se reincorporan a la línea de salida y continúan a la batería de separación.';
      var ls = wrap(txt, w - 34, 12.5, 'b');
      TL_(g, x + 16, y + 132, ls, { size: 12.5, weight: 500, cls: 'ti2', lh: 16.5 });
      var yy = y + 132 + ls.length * 16.5 + 10;
      if (yy + 40 < y + h) {
        E('line', { x1: x + 16, y1: yy - 6, x2: x + w - 16, y2: yy - 6, class: 'rule' }, g);
        T(g, x + 16, yy + 10, up('Medición de ' + data.medicion.horasMedicion + ' h'), { font: 'm', size: 10.5, weight: 700, ls: 1.2, cls: 'tmu' });
        data.estados.forEach(function (e, i) {
          var ey = yy + 30 + i * 22;
          if (ey > y + h - 8) return;
          E('circle', { cx: x + 24, cy: ey - 4, r: 6, class: i === 1 ? 'sym-acc' : 'sym' }, g);
          T(g, x + 24, ey - 0.5, String(i + 1), { font: 'm', size: 8.5, weight: 700, anchor: 'middle', cls: i === 1 ? 'ton' : '' });
          T(g, x + 38, ey, e.nombre, { font: 'c', size: 14, weight: 700 });
        });
      }
      return g;
    }

    /* contexto para los layouts */
    var ctx = {
      W: W, H: H, data: data, util: util, Ls: Ls, api: api, tag: tag, opts: opts, K: K,
      E: E, T: T, TL: TL_, rg: rg, eqGroup: eqGroup, line: line, at: at, signal: signal, imp: imp,
      gate: gate, controlValve: controlValve, choke: choke, psv: psv, orifice: orifice, coriolis: coriolis,
      offPage: offPage, bubble: bubble, eqLabel: eqLabel, tagBox: tagBox, tree: tree, vessel: vessel, nfpa: nfpa,
      sheet: sheet, box: box, header: header, scadaBox: scadaBox, rtuIcon: rtuIcon, legend: legend,
      instList: instList, titleBlock: titleBlock, notes: notes, closedCard: closedCard, wrap: wrap, textW: textW, up: up
    };
    LAY.build(ctx);

    /* ventanas de señales: escalonadas en el orden en que se registraron */
    var nS = signals.length;
    signals.forEach(function (S, i) {
      if (S.a == null) { S.a = T_SIG0 + (T_SIG1 - T_SIG0 - 0.05) * (nS > 1 ? i / (nS - 1) : 0); S.b = S.a + 0.05; }
    });

    /* ---------------- tema ---------------- */
    function applyTema(t) {
      tema = t === 'papel' ? 'papel' : 'pantalla';
      var Th = THEMES[tema];
      styleEl.textContent = themeCSS(u, Th);
      svg.setAttribute('data-tema', tema);
      api.tema = tema;
      var st = function (cls, col) { var n = svg.querySelectorAll('.' + cls); for (var i = 0; i < n.length; i++) n[i].setAttribute('stop-color', col); };
      st('st-s0', Th.sheet0); st('st-s1', Th.sheet1);
      st('st-v0', Th.vessel0); st('st-v1', Th.vessel1);
      st('st-l0', Th.liq0); st('st-l1', Th.liq1);
      if (api._logo) api._logo.setAttribute('href', assets + Th.logo);
    }
    applyTema(tema);
    api.setTema = function (t) { applyTema(t); };

    /* ---------------- renderAt (determinista) ---------------- */
    var lastHl = [], lastFrame = [0, {}];
    api.renderAt = function (t, estado) {
      estado = estado || {};
      lastFrame = [t, estado];
      t = +t || 0;
      var tr = estado.trazo == null ? 1 : clamp(+estado.trazo, 0, 1);
      var pk = estado.pulsos == null ? 1 : clamp(+estado.pulsos, 0, 1);
      var marco = estado.marco == null ? 1 : clamp(+estado.marco, 0, 1);
      var i, k;
      // líneas de proceso (trazo con pathLength = 1). Siempre se escriben los mismos atributos → mismo DOM.
      for (i = 0; i < lines.length; i++) {
        var L = lines[i];
        k = clamp((tr - L.a) / (L.b - L.a), 0, 1);
        L.k = k;
        if (L.off) continue;
        var dash = k >= 1 ? 'none' : '1 1', doff = k >= 1 ? 0 : r1((1 - k) * 1000) / 1000, vis = k <= 0 ? 'hidden' : 'visible';
        for (var j = 0; j < L.paths.length; j++) {
          var p = L.paths[j];
          p.setAttribute('visibility', vis); p.setAttribute('stroke-dasharray', dash); p.setAttribute('stroke-dashoffset', doff);
        }
      }
      // apariciones
      for (i = 0; i < reveals.length; i++) {
        var R = reveals[i];
        k = smooth((tr - R.at) / R.dur);
        var sc = k >= 1 ? 1 : 0.82 + 0.18 * easeOut(k);
        R.g.setAttribute('visibility', k <= 0 ? 'hidden' : 'visible');
        R.g.setAttribute('opacity', r1(k * 100) / 100);
        R.g.setAttribute('transform', k >= 1 ? 'translate(0 0)' : 'translate(' + r1(R.cx) + ' ' + r1(R.cy) + ') scale(' + (Math.round(sc * 1000) / 1000) + ') translate(' + r1(-R.cx) + ' ' + r1(-R.cy) + ')');
      }
      // señales (máscara de revelado)
      var allSig = true;
      for (i = 0; i < signals.length; i++) {
        var S = signals[i];
        k = clamp((tr - S.a) / (S.b - S.a), 0, 1);
        S.k = k;
        if (k < 1) allSig = false;
        var sv = k <= 0 ? 'hidden' : 'visible';
        S.p.setAttribute('visibility', sv);
        S.rv.setAttribute('visibility', sv);
        S.rv.setAttribute('stroke-dasharray', '1 1');
        S.rv.setAttribute('stroke-dashoffset', k >= 1 ? 0 : r1((1 - k) * 1000) / 1000);
      }
      Ls.sig.setAttribute('mask', allSig ? 'none' : 'url(#' + u + '-sm)');
      // pulsos de flujo
      for (i = 0; i < pulses.length; i++) {
        var P = pulses[i], LL = P.L;
        var sPos = ((P.off + P.speed * t) % LL.len + LL.len) % LL.len;
        var vis2 = pk > 0 && LL.k > 0 && sPos <= LL.k * LL.len;
        var pt = vis2 ? pointAt(LL.pts, LL.acc, sPos) : { x: -99, y: -99 };
        var edge = Math.min(sPos, LL.k * LL.len - sPos, LL.len - sPos) / 26;
        var op = vis2 ? r1(clamp(edge, 0, 1) * pk * 100) / 100 : 0;
        P.c.setAttribute('cx', r1(pt.x)); P.c.setAttribute('cy', r1(pt.y)); P.c.setAttribute('opacity', op);
        P.h.setAttribute('cx', r1(pt.x)); P.h.setAttribute('cy', r1(pt.y)); P.h.setAttribute('opacity', op);
      }
      for (i = 0; i < sigPulses.length; i++) {
        var SP = sigPulses[i], SS = SP.S;
        var cyc = 1.6 + SS.len / 240;
        var ph = ((t / cyc + SP.off) % 1 + 1) % 1;
        var on = pk > 0 && SS.k >= 1 && ph < 0.72;
        var q = ph / 0.72;
        var pp = on ? pointAt(SS.pts, SS.acc, q * SS.len) : { x: -99, y: -99 };
        var so = on ? r1(Math.sin(q * Math.PI) * pk * 100) / 100 : 0;
        SP.c.setAttribute('cx', r1(pp.x)); SP.c.setAttribute('cy', r1(pp.y)); SP.c.setAttribute('opacity', so);
        SP.h.setAttribute('cx', r1(pp.x)); SP.h.setAttribute('cy', r1(pp.y)); SP.h.setAttribute('opacity', so);
      }
      // marco (encabezado, simbología, lista, cuadro)
      Ls.chrome.setAttribute('opacity', r1(marco * 100) / 100);
      // resaltado
      setHl(estado.resaltar || null);
    };

    function setHl(id) {
      var i;
      for (i = 0; i < lastHl.length; i++) lastHl[i].classList.remove('is-hl');
      lastHl = [];
      if (!id) { svg.classList.remove('is-dim'); if (ov) ov.classList.remove('is-dim'); return; }
      var root = [svg].concat(ov ? [ov] : []);
      var sel;
      if (STREAMS.indexOf(id) >= 0) {
        sel = '.pl[data-stream="' + id + '"], .arw[data-stream="' + id + '"], g.hl[data-stream="' + id + '"], .inst[data-stream="' + id + '"], [data-eq="' + id + '"]';
        (STREAM_EQ[id] || []).forEach(function (e) { sel += ', [data-eq="' + e + '"]'; });
      }
      else if (id === 'senal') sel = '.sig, .pu-s, .inst, .eq[data-eq="rtu"], .eq[data-eq="scada"], .lbl[data-eq="rtu"]';
      else if (api.instrumentos[id] || api.funciones[id]) {
        sel = '[data-tag="' + id + '"], [data-tags~="' + id + '"]';
        var act = api.funciones[id] && K.fn(id).actua;      // el lazo resalta también su válvula (LV / PV)
        if (act && api.equipos[act.toLowerCase()]) sel += ', [data-eq="' + act.toLowerCase() + '"]';
      }
      else sel = '[data-eq="' + id + '"]';
      root.forEach(function (rt) {
        var nodes = rt.querySelectorAll(sel);
        for (var j = 0; j < nodes.length; j++) { nodes[j].classList.add('is-hl'); lastHl.push(nodes[j]); }
      });
      if (lastHl.length) svg.classList.add('is-dim'); else svg.classList.remove('is-dim');
      if (ov) ov.classList.toggle('is-dim', svg.classList.contains('is-dim'));
    }
    api.resaltar = function (id) { setHl(id); };

    api.toSVGString = function (o) {
      o = o || {};
      var keep = lastFrame;
      api.renderAt(0, { trazo: 1, pulsos: 0, resaltar: null });
      var clone = svg.cloneNode(true);
      api.renderAt(keep[0], keep[1]);
      clone.removeAttribute('style');
      clone.setAttribute('width', W); clone.setAttribute('height', H);
      clone.classList.remove('pid-ui', 'is-dim');
      var rm = clone.querySelectorAll('.L-pu, .L-spu, .pl-hit, mask');
      for (var i = 0; i < rm.length; i++) rm[i].parentNode.removeChild(rm[i]);
      var g = clone.querySelector('.L-sig'); if (g) g.removeAttribute('mask');
      var all = clone.querySelectorAll('[style]');
      for (i = 0; i < all.length; i++) all[i].removeAttribute('style');
      all = clone.querySelectorAll('[transform="translate(0 0)"]');
      for (i = 0; i < all.length; i++) all[i].removeAttribute('transform');
      all = clone.querySelectorAll('[visibility="visible"]');
      for (i = 0; i < all.length; i++) all[i].removeAttribute('visibility');
      all = clone.querySelectorAll('[opacity="1"]');
      for (i = 0; i < all.length; i++) all[i].removeAttribute('opacity');
      all = clone.querySelectorAll('[stroke-dasharray="none"]');
      for (i = 0; i < all.length; i++) { all[i].removeAttribute('stroke-dasharray'); all[i].removeAttribute('stroke-dashoffset'); }
      var hl = clone.querySelectorAll('.is-hl');
      for (i = 0; i < hl.length; i++) hl[i].classList.remove('is-hl');
      // opcional: fuentes incrustadas (@font-face con data:) y logo como data: para un SVG autónomo
      if (o.fontCSS) { var stl = clone.querySelector('style'); if (stl) stl.textContent = o.fontCSS + '\n' + stl.textContent; }
      // logotipo como data: (por defecto WT.logo de js/logo.js, si la página lo cargó) → el SVG no depende de rutas locales
      var logoHref = o.logoHref || (WT.logo ? (tema === 'papel' ? WT.logo.color : WT.logo.blanco) : null);
      if (logoHref) { var lg = clone.querySelector('image.logo'); if (lg) lg.setAttribute('href', logoHref); }
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    };
    api.destroy = function () { if (svg.parentNode) svg.parentNode.removeChild(svg); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); };
    api.overlay = ov;

    if (container) { container.appendChild(svg); if (ov) container.appendChild(ov); }
    api.renderAt(0, { trazo: 1, pulsos: 0 });
    return api;
  }

  /* Datos del separador para rótulos (solo valores no nulos) */
  function sepInfo(sep) {
    var out = [sep.tipo, sep.montaje + ' · servicio ' + sep.servicio.toLowerCase()];
    var extra = [];
    // La capacidad de data.js es la placa de otro equipo (referencia): solo se rotula cuando ya es dato propio
    if (sep.capacidad && sep.capacidad.valor && !sep.capacidad.confirmar) extra.push('Cap. ' + sep.capacidad.valor);
    var nom = { diametro: 'Ø', longitud: 'L', presionDiseno: 'P diseño', temperaturaDiseno: 'T diseño' };
    ['diametro', 'longitud', 'presionDiseno', 'temperaturaDiseno'].forEach(function (k) { if (sep[k]) extra.push(nom[k] + ' ' + sep[k]); });
    if (extra.length) out.push(extra.join(' · '));
    return out;
  }

  /* ==================================================================
     LAYOUT HORIZONTAL — pantalla 16:9 (1920 × 1080)
     ================================================================== */
  function buildH(c) {
    var d = c.data, Ls = c.Ls, E = c.E, T = c.T;
    var eqN = function (id) { return c.util.equipo(id).nombre; };
    c.sheet();
    c.header({ x: 44, y: 44, barH: 92, t1: 34, titles: [{ size: 38, lh: 0, parts: [{ s: 'DTI simplificado · ', acc: true }, { s: 'Aforo de pozo con separador bifásico' }] }], routeDy: 28 });

    /* ---- coordenadas ---- */
    var yIn = 498, TR = { x: 150, g: 600 }, yG = 392, yL = 690, yB1 = 336, yB2 = 626;
    var V = { cx: 857, cy: 530, L: 470, r: 86, hr: 46, dir: 1 };
    var xCk = 316, xMan = 448, xPI = 610, xPkg = 584;
    var xGasN = V.cx + V.L / 2 - V.hr - 40;   // boquilla de gas / líquido
    V.saddles = [V.cx - V.L / 2 + V.hr + 40, xGasN - 56];
    var hx0 = V.cx - V.L / 2; // x0 del recipiente (tapa de entrada)
    // Accesorios en el domo, de la entrada a la salida (foto del FA-02): PSV hacia la entrada · TPS · TN (sonda, lejos
    // de la entrada) · TT · boquilla de gas. El registro bridado va en la tapa de salida.
    var xPSV = hx0 + 63, xTPS = hx0 + 138, xTNs = hx0 + 250, xTT = hx0 + 328;
    // Orden de medición en cada salida: primero el medidor y después la válvula de control
    //   gas:     placa de orificio (FE + TDG) → PV       líquido: Coriolis (FIT) → LV
    var xFE = 1320, xPV = 1462, xCor = 1250, xLV = 1400, xTee = 1544;
    var xTDM = 1588, xLim = 1628, xTPL = 1668, xOff = 1752;
    var band = { x0: 196, x1: 1880, y0: 170, y1: 298 };
    var bcy = (band.y0 + band.y1) / 2;
    var fcy = 230;                                  // centro de las funciones (LIC, PIC, FQI) en la banda
    var laneP = band.y0 + 9, laneL = band.y0 + 24;  // carriles de salida de control: PIC → PV (arriba), LIC → LV
    var rF = 21, sqb = fcy + rF + 3, sqt = fcy - rF - 3;
    var yC1 = sqb + 18, yC2 = sqb + 31;             // carriles de compensación del FQI (TPS, TT) bajo las funciones
    var sc = { x: 1598, y: 38, w: 282, h: 114 };
    var tnLat = tnEsLateral(d.separador);

    /* ---- límite del paquete (remolque) ---- */
    var pk = E('g', { class: 'hl', 'data-eq': 'paquete' }, Ls.zone);
    E('rect', { x: xPkg, y: 304, width: xLim - xPkg, height: 450, rx: 10, class: 'pkg' }, pk);
    T(pk, xPkg + 14, 744, c.up('Equipo de aforo ' + c.tag + ' · ' + d.separador.montaje.split(' (')[0]), { font: 'c', size: 12, weight: 700, ls: 1, cls: 'tmu' });

    /* ---- banda RTU ---- */
    var bandG0 = c.rg(Ls.ctl, 0.64, (band.x0 + band.x1) / 2, bcy, 0.05);
    var bandG = E('g', { class: 'eq hl', 'data-eq': 'rtu' }, bandG0);
    c.api.equipos.rtu = bandG;
    E('rect', { x: band.x0, y: band.y0, width: band.x1 - band.x0, height: band.y1 - band.y0, rx: 8, class: 'band' }, bandG);
    c.rtuIcon(bandG, band.x0 + 24, bcy - 28);
    T(bandG, band.x0 + 60, bcy - 14, c.up(eqN('rtu')), { font: 'c', size: 18, weight: 800, ls: 0.8 });
    T(bandG, band.x0 + 60, bcy + 5, c.K.rtuModulo + ' · concentra todas las señales', { size: 12.5, weight: 600, cls: 'ti2' });
    T(bandG, band.x0 + 60, bcy + 23, 'Entradas ' + c.K.senales + ' · lazos de nivel y presión · cálculo de gas', { size: 12, weight: 500, cls: 'tmu', maxW: xTPS - rF - 3 - 16 - (band.x0 + 60) });

    /* ---- SCADA + enlace de datos ---- */
    c.scadaBox(sc.x, sc.y, sc.w, sc.h);
    var dlY = (band.y0 + sc.y + sc.h) / 2;
    var dlG0 = c.rg(Ls.ctl, 0.9, 1820, dlY, 0.03);
    var dlG = E('g', { class: 'hl', 'data-eq': 'scada' }, dlG0);
    E('path', { d: 'M1820 ' + band.y0 + 'V' + (sc.y + sc.h), class: 'dl' }, dlG);
    E('circle', { cx: 1820, cy: dlY, r: 4, class: 'dl-o' }, dlG);
    T(dlG, 1830, dlY + 4, c.K.enlace, { font: 'c', size: 11.5, weight: 600, cls: 'ti2' });

    /* ---- árbol de válvulas ---- */
    var gA = c.eqGroup('arbol', Ls.eq, 0.02, TR.x, TR.g - 90);
    var tr = c.tree(gA, TR.x, TR.g, 1);
    var lA = c.rg(Ls.lbl, 0.02, TR.x, TR.g - 200);
    c.eqLabel(lA, TR.x - 10, TR.g - 206, eqN('arbol'), 'Pozo en prueba', { eq: 'arbol' });
    var lp = c.rg(Ls.lbl, 0.03, TR.x, TR.g);
    [['Sondeo', TR.g - 128], ['Maestras', TR.g - 60], ['TR', TR.g - 12]].forEach(function (q) { T(lp, TR.x - 60, q[1], q[0], { font: 'c', size: 11.5, weight: 600, anchor: 'end', cls: 'tmu' }); });
    T(lp, TR.x + 28, TR.g + 40, 'TP', { font: 'c', size: 11.5, weight: 600, cls: 'tmu' });
    T(lp, TR.x - 46, TR.g + 40, 'TR', { font: 'c', size: 11.5, weight: 600, cls: 'tmu' });

    /* ---- línea pozo → estrangulador → cabezal / manifold → separador ---- */
    var xInlet = hx0 + V.hr - V.hr * Math.sqrt(1 - Math.pow((yIn - V.cy) / V.r, 2));
    var xTDP = 272;                                 // toma del TDP en la línea lateral (TP), aguas arriba del estrangulador
    c.line('m1', 'mezcla', [[tr.wingX, yIn], [xCk - 14, yIn]], { arrows: [0.25] });
    c.line('m2', 'mezcla', [[xCk + 14, yIn], [xMan - 48 - 11, yIn]], { arrows: [0.5] });
    c.line('m3', 'mezcla', [[xMan + 48 + 11, yIn], [xInlet + 2, yIn]], { arrows: [0.2, 0.62], eq: 'lineaEntrada' });
    // estrangulador
    var gK = c.eqGroup('estrangulador', Ls.eq, c.at('m1', xCk, yIn), xCk, yIn);
    E('line', { x1: xCk - 15, y1: yIn, x2: xCk + 15, y2: yIn, class: 'sym-l' }, gK);
    c.choke(gK, xCk, yIn);
    c.eqLabel(c.rg(Ls.lbl, c.at('m1', xCk, yIn), xCk, yIn + 30), xCk, yIn + 36, 'Estrangulador', 'TP / TR', { eq: 'estrangulador' });
    // cabezal / manifold
    var tMan = c.at('m2', xMan, yIn);
    var gM = c.eqGroup('manifold', Ls.eq, tMan, xMan, yIn);
    E('line', { x1: xMan - 60, y1: yIn, x2: xMan + 60, y2: yIn, class: 'sym-l' }, gM);
    E('rect', { x: xMan - 10, y: yIn - 28, width: 20, height: 56, rx: 4, class: 'sym' }, gM);
    c.gate(gM, xMan - 48, yIn, {});
    c.gate(gM, xMan + 48, yIn, {});
    c.eqLabel(c.rg(Ls.lbl, tMan, xMan, yIn - 60), xMan, yIn - 64, eqN('manifold'), 'Alinea el pozo al separador', { eq: 'manifold' });
    // línea de entrada
    var lIn = c.rg(Ls.lbl, c.at('m3', 520, yIn), 520, yIn);
    c.eqLabel(lIn, xPkg - 60, yIn + 26, eqN('lineaEntrada'), c.K.dn + ' · mezcla del pozo', { eq: 'lineaEntrada', size: 12.5, subSize: 11 });
    // PI local
    c.bubble('PI', xPI, 438, 'local', { isa: 'PI', sub: 'local', r: 17, at: c.at('m3', xPI, yIn), key: 'PI', aria: 'Manómetro local', imp: [[[xPI, yIn], [xPI, 438 + 17]]] });

    /* ---- separador ---- */
    var gS = c.eqGroup('separador', Ls.eq, T_SEP, V.cx, V.cy);
    var vs = c.vessel(gS, V);
    // boquilla de entrada + deflector
    var xDef = hx0 + V.hr + 16;
    var gDef = E('g', { class: 'eq hl', 'data-eq': 'deflector' }, gS); c.api.equipos.deflector = gDef;
    E('path', { d: 'M' + xDef + ' ' + (yIn - 30) + 'Q' + (xDef + 12) + ' ' + yIn + ' ' + xDef + ' ' + (yIn + 32), class: 'sym-d', 'stroke-width': 3, 'stroke-dasharray': '7 4' }, gDef);
    T(gDef, xDef + 10, yIn + 44, 'Deflector', { font: 'c', size: 11.5, weight: 600, cls: 'ti2' });
    // extractor de niebla
    var gMe = E('g', { class: 'eq hl', 'data-eq': 'extractor' }, gS); c.api.equipos.extractor = gMe;
    var mx0 = xGasN - 44, mx1 = xGasN + 34, my0 = V.cy - V.r + 9, my1 = my0 + 20;
    E('rect', { x: mx0, y: my0, width: mx1 - mx0, height: my1 - my0, class: 'sym-d' }, gMe);
    var mesh = 'M' + mx0 + ' ' + my1;
    for (var mxi = mx0; mxi < mx1; mxi += 8) mesh += 'L' + (mxi + 4) + ' ' + my0 + 'L' + (mxi + 8) + ' ' + my1;
    E('path', { d: mesh, class: 'mesh' }, gMe);
    T(gMe, (mx0 + mx1) / 2, my1 + 16, 'Extractor de niebla', { font: 'c', size: 11.5, weight: 600, anchor: 'middle', cls: 'ti2' });
    // nivel normal
    E('path', { d: 'M' + (V.cx + 128) + ' ' + (vs.yN - 12) + 'l7 10l7 -10Z', class: 'sym', 'stroke-width': 1.2 }, gS);
    T(gS, V.cx + 146, vs.yN - 3, 'NNL', { font: 'm', size: 10, weight: 700, cls: 'ti2' });
    T(gS, V.cx - 67, V.cy + 52, 'Líquido (aceite + agua)', { font: 'c', size: 13, weight: 700, anchor: 'middle', cls: 'tliq' });
    T(gS, V.cx + 40, V.cy - 64, 'Gas', { font: 'c', size: 13, weight: 700, anchor: 'middle', cls: 'ti2' });
    // placa del equipo (a la izquierda de la sonda del TN)
    var tbx = hx0 + 78, tby = V.cy - 48;
    E('rect', { x: tbx, y: tby, width: 88, height: 30, rx: 3, class: 'sym-acc' }, gS);
    T(gS, tbx + 44, tby + 22, c.tag, { font: 'c', size: 22, weight: 800, anchor: 'middle', cls: 'ton', ls: 1 });
    var nmL = c.wrap(c.up(eqN('separador')), 72, 13, 'c');
    nmL.forEach(function (s, i) { T(gS, tbx + 96, tby + 12 + i * 14, s, { font: 'c', size: 13, weight: 800, ls: 0.6 }); });
    T(gS, tbx + 96, tby + 12 + nmL.length * 14, d.separador.orientacion, { size: 11.5, weight: 500, cls: 'ti2' });
    // registro bridado en la tapa de salida
    var yReg = tnLat ? V.cy : V.cy + V.r * 0.5, xReg = vs.headX(yReg, 1);
    var gR = E('g', { class: 'eq hl', 'data-eq': 'registro' }, gS); c.api.equipos.registro = gR;
    E('line', { x1: xReg, y1: yReg, x2: xReg + 16, y2: yReg, class: 'sym-l', 'stroke-width': 5 }, gR);
    E('line', { x1: xReg + 17, y1: yReg - 11, x2: xReg + 17, y2: yReg + 11, class: 'sym-l', 'stroke-width': 3 }, gR);
    T(gS, tnLat ? xReg + 2 : xReg + 26, tnLat ? yReg + 26 : yReg + 4, 'Registro', { font: 'c', size: 11.5, weight: 600, cls: 'ti2' }).setAttribute('data-eq', 'registro');
    // datos del separador (solo los no nulos)
    var sd = c.rg(Ls.lbl, T_SEP + 0.03, V.cx, V.cy + V.r + 40);
    var sep = d.separador, info = sepInfo(sep);
    c.nfpa(sd, hx0 + 22, V.cy + V.r + 52, 30);
    info.forEach(function (s, i) { T(sd, hx0 + 52, V.cy + V.r + 38 + i * 16, s, { size: 12, weight: i ? 500 : 600, cls: i ? 'ti2' : '', maxW: xGasN - hx0 - 70 }); });

    /* ---- PSV en el domo, hacia el extremo de entrada (descarga hacia afuera) ---- */
    var gP = c.eqGroup('psv', Ls.eq, T_SEP + 0.02, xPSV, V.cy - V.r - 20);
    var pcY = c.psv(gP, xPSV, V.cy - V.r, -1);
    T(gP, xPSV + 12, pcY - 14, 'PSV', { font: 'm', size: 11, weight: 700 });

    /* ---- salida de gas ---- */
    var gasPts = [[xGasN, V.cy - V.r + 2], [xGasN, yG], [xTee, yG], [xTee, yL - 6]];
    c.line('g1', 'gas', gasPts, { arrows: [0.06, 0.3, 0.62, 0.9] });
    // placa de orificio
    var tFE = c.at('g1', xFE, yG);
    var gFE = c.eqGroup('placa', Ls.eq, tFE, xFE, yG);
    c.orifice(gFE, xFE, yG);
    c.tagBox(gFE, xFE, yG + 34, 'FE');
    c.eqLabel(c.rg(Ls.lbl, tFE, xFE, yG + 60), xFE - 2, yG + 62, 'Placa de orificio', '+ transmisor ΔP E+H', { eq: 'placa', size: 12.5, subSize: 11 });
    // PV (aguas abajo de la placa)
    var vPV = c.K.valvula('PV'), rPV = VALV_CORTO[vPV.tag] || [vPV.nombre, null];
    var tPV = c.at('g1', xPV, yG);
    var gPV = c.eqGroup('pv', Ls.eq, tPV, xPV, yG);
    var aPV = c.controlValve(gPV, xPV, yG);
    c.tagBox(gPV, xPV + 20, yG - 20, vPV.tag, { anchor: 'start' });
    c.eqLabel(c.rg(Ls.lbl, tPV, xPV, yG + 40), xPV, yG + 36, rPV[0], rPV[1], { eq: 'pv', size: 12.5, subSize: 11 });
    c.eqLabel(c.rg(Ls.lbl, c.at('g1', 1100, yG), 1100, yG), 1098, yG - 14, 'Salida de gas', null, { eq: 'gas', size: 13 });

    /* ---- salida de líquido: Coriolis (FIT) → LV ---- */
    var liqPts = [[xGasN, V.cy + V.r - 2], [xGasN, yL], [xTee - 7, yL]];
    c.line('l1', 'liquido', liqPts, { arrows: [0.1, 0.4, 0.667, 0.9] });
    var tCo = c.at('l1', xCor, yL);
    var gCo = c.eqGroup('coriolis', Ls.eq, tCo, xCor, yL);
    c.coriolis(gCo, xCor, yL);
    c.eqLabel(c.rg(Ls.lbl, tCo, xCor, yL + 40), xCor, yL + 36, 'Coriolis E+H Promass 300', 'Flujo másico · densidad · % agua', { eq: 'coriolis', size: 12.5, subSize: 11 });
    var vLV = c.K.valvula('LV'), rLV = VALV_CORTO[vLV.tag] || [vLV.nombre, null];
    var tLV = c.at('l1', xLV, yL);
    var gLV = c.eqGroup('lv', Ls.eq, tLV, xLV, yL);
    var aLV = c.controlValve(gLV, xLV, yL);
    c.tagBox(gLV, xLV + 20, yL - 20, vLV.tag, { anchor: 'start' });
    c.eqLabel(c.rg(Ls.lbl, tLV, xLV, yL + 40), xLV, yL + 36, rLV[0], rLV[1], { eq: 'lv', size: 12.5, subSize: 11 });
    c.eqLabel(c.rg(Ls.lbl, c.at('l1', xGasN, yL), xGasN, yL), xGasN + 18, yL + 36, 'Salida de líquido', 'aceite + agua', { eq: 'liquido', size: 12.5, subSize: 11, anchor: 'start' });

    /* ---- reincorporación y salida ---- */
    c.line('s1', 'salida', [[xTee, yL], [xLim, yL]], { arrows: [0.3] });
    c.line('s2', 'salida', [[xLim, yL], [xOff, yL]], { arrows: [0.68] });
    var gTee = c.eqGroup('recombinacion', Ls.eq, TL.s1[0], xTee, yL);
    E('circle', { cx: xTee, cy: yL, r: 7.5, class: 'sym-acc' }, gTee);
    c.eqLabel(c.rg(Ls.lbl, TL.s1[0], xTee, yL + 40), xTee + 12, yL + 36, 'Reincorporación', 'gas + líquido', { eq: 'recombinacion', size: 12.5, subSize: 11 });
    var gLim = c.rg(Ls.zone, TL.s1[1], xLim, yL);
    E('line', { x1: xLim, y1: yL - 22, x2: xLim, y2: yL + 22, class: 'sym-l', 'stroke-width': 2.2 }, gLim);
    c.T(gLim, xLim + 7, yL + 32, 'Empate', { size: 10.5, anchor: 'start', cls: 'tmu' });
    var gBat = c.eqGroup('lineaBateria', Ls.eq, TL.s2[1] - 0.01, xOff + 60, yL);
    c.offPage(gBat, xOff, yL, 126, 36, 'right', 'A BATERÍA', { acc: true, size: 15 });
    c.eqLabel(c.rg(Ls.lbl, TL.s2[0] + 0.03, xOff, yL + 40), xOff + 63, yL + 40, eqN('lineaBateria'), c.K.dn + ' · circuito cerrado', { eq: 'lineaBateria', size: 12.5, subSize: 11 });

    /* ---- instrumentos (burbujas + conexiones a proceso) ---- */
    // TDP en la línea lateral (TP), entre la válvula lateral del árbol y el estrangulador
    var yTDP = yIn - 70;
    c.bubble('TDP', xTDP, yTDP, 'campo', { at: 0.04, stream: 'mezcla', imp: [[[xTDP, yIn], [xTDP, yTDP + 25]]] });
    // TT (termopozo) y TPS en el domo
    var yDome = V.cy - V.r;
    c.bubble('TT', xTT, yB1, 'campo', { at: T_SEP + 0.04, stream: 'gas', imp: [[[xTT, yB1 + 25], [xTT, yDome]]], deco: function (gi) { E('rect', { x: xTT - 4, y: yDome - 2, width: 8, height: 14, rx: 2, class: 'sym' }, gi); } });
    c.bubble('TPS', xTPS, yB1, 'campo', { at: T_SEP + 0.05, stream: 'gas', imp: [[[xTPS, yB1 + 25], [xTPS, yDome]]] });
    // TN según WT.data.separador.tnMontaje: sonda superior en el domo (lejos de la entrada) o cámara externa en la tapa de salida
    var xTN, yTN;
    if (!tnLat) {
      xTN = xTNs; yTN = yB1;
      c.bubble('TN', xTN, yTN, 'campo', { at: T_SEP + 0.06, stream: 'liquido', imp: [[[xTN, yDome - 10], [xTN, yTN + 25]]], deco: function (gi) {
        E('line', { x1: xTN, y1: yDome, x2: xTN, y2: vs.yN + 14, class: 'imp', 'stroke-width': 2.4 }, gi);            // sonda
        E('rect', { x: xTN - 2.5, y: vs.yN + 10, width: 5, height: 8, rx: 1.2, class: 'sym' }, gi);
        E('rect', { x: xTN - 7, y: yDome - 10, width: 14, height: 10, rx: 1.5, class: 'sym' }, gi);                   // boquilla
        T(gi, xTN + 10, yDome - 22, 'sonda', { size: 10.5, weight: 600, cls: 'tmu' });
      } });
    } else {
      var yT1 = V.cy - 50, yT2 = V.cy + 56, xBr = vs.x1 + 54;
      xTN = xBr + 46; yTN = V.cy + 3;
      c.bubble('TN', xTN, yTN, 'campo', { at: T_SEP + 0.06, stream: 'liquido', imp: [[[vs.headX(yT1, 1), yT1], [xBr, yT1], [xBr, yT2], [vs.headX(yT2, 1), yT2]], [[xBr, yTN], [xTN - 25, yTN]]] });
    }
    // TDG en la placa (dos tomas)
    c.bubble('TDG', xFE, yB1, 'campo', { at: tFE + 0.01, stream: 'gas', imp: [[[xFE - 6, yG - 13], [xFE - 6, yB1 + 21]], [[xFE + 6, yG - 13], [xFE + 6, yB1 + 21]]] });
    // Coriolis (FIT)
    c.bubble('CORIOLIS', xCor, yB2, 'campo', { at: tCo + 0.01, stream: 'liquido', imp: [[[xCor, yL - 15], [xCor, yB2 + 25]]] });
    // TDM, TPL
    c.bubble('TDM', xTDM, yB2, 'campo', { at: TL.s1[0] + 0.02, stream: 'salida', imp: [[[xTDM, yL], [xTDM, yB2 + 25]]] });
    c.bubble('TPL', xTPL, yB2, 'campo', { at: TL.s2[0] + 0.01, stream: 'salida', imp: [[[xTPL, yL], [xTPL, yB2 + 25]]] });

    /* ---- funciones en el RTU (WT.data.funciones) ---- */
    var fP = c.K.fn('PIC'), fL = c.K.fn('LIC'), fQ = c.K.fn('FQI');
    c.bubble(fP.tag, xTPS, fcy, 'funcion', { isa: fP.tag, sub: fP.mide, key: fP.tag, r: rF, at: T_FUNC, aria: fP.desc });
    c.bubble(fL.tag, xTN, fcy, 'funcion', { isa: fL.tag, sub: fL.mide, key: fL.tag, r: rF, at: T_FUNC + 0.01, aria: fL.desc });
    c.bubble(fQ.tag, xFE, fcy, 'funcion', { isa: fQ.tag, sub: fQ.mide, key: fQ.tag, r: rF, at: T_FUNC + 0.02, aria: fQ.desc });

    /* ---- señales (orden = orden de aparición) ----
       Salidas de control: PIC por el carril superior (pasa sobre LIC y FQI) y LIC por el inferior → no se cruzan.
       Compensación del FQI (WT.data.funciones FQI.compensa): TPS se deriva (punto) y TT llega directo, por carriles
       bajo las funciones; el único cruce sin conexión (sobre la señal del TN) se marca con un salto. */
    var bb = band.y1, xFQl = xFE - rF - 3;
    var hopTN = function (x0, x1, y) { return xTN > Math.min(x0, x1) && xTN < Math.max(x0, x1) && y > sqb && y < yTN - 25 ? [[xTN, y]] : []; };
    var comp = fQ.compensa || [];
    c.signal('sTDP', [[xTDP, yTDP - 25], [xTDP, bb]], { tag: 'TDP' });
    c.signal('sTPS', [[xTPS, yB1 - 25], [xTPS, sqb]], { tag: fP.mide, tags: [fP.mide, fP.tag] });
    c.signal('sTN', [[xTN, yTN - 25], [xTN, sqb]], { tag: fL.mide, tags: [fL.mide, fL.tag] });
    if (comp.indexOf('TT') >= 0) c.signal('sTT', [[xTT, yB1 - 25], [xTT, yC2], [xFE - 38, yC2], [xFE - 38, fcy + 7], [xFQl, fcy + 7]], { tag: 'TT', tags: ['TT', fQ.tag], hops: hopTN(xTT, xFE - 38, yC2) });
    else c.signal('sTT', [[xTT, yB1 - 25], [xTT, bb]], { tag: 'TT' });
    c.signal('sTDG', [[xFE, yB1 - 25], [xFE, sqb]], { tag: fQ.mide, tags: [fQ.mide, fQ.tag] });
    if (comp.indexOf(fP.mide) >= 0) c.signal('sTPSq', [[xTPS, yC1], [xFE - 52, yC1], [xFE - 52, fcy - 7], [xFQl, fcy - 7]], { tag: fP.mide, tags: [fP.mide, fQ.tag], dots: [[xTPS, yC1]], hops: hopTN(xTPS, xFE - 52, yC1) });
    c.signal('sCOR', [[xCor, yB2 - 25], [xCor, bb]], { tag: 'CORIOLIS' });
    c.signal('sTDM', [[xTDM, yB2 - 25], [xTDM, bb]], { tag: 'TDM' });
    c.signal('sTPL', [[xTPL, yB2 - 25], [xTPL, bb]], { tag: 'TPL' });
    c.signal('sPIC', [[xTPS, sqt], [xTPS, laneP], [xPV, laneP], [xPV, aPV.y]], { tag: fP.tag, tags: [fP.tag, fP.mide] });
    c.signal('sLIC', [[xTN, sqt], [xTN, laneL], [xLV, laneL], [xLV, aLV.y]], { tag: fL.tag, tags: [fL.tag, fL.mide] });

    /* ---- tarjeta circuito cerrado ---- */
    c.closedCard(1700, 310, 180, 294);

    /* ---- notas, simbología, lista, cuadro ---- */
    c.notes(44, 662, 496, 98, { compacto: true, size: 11.6, lh: 14.4 });
    var by = 772, bh = 1052 - by;
    c.legend(44, by, 598, bh, { rowH: 23.5, rowHS: 25 });
    c.instList(654, by, 790, bh, [74, 46, 270, 250, 122]);
    c.titleBlock(1456, by, 424, bh, '16:9 · 420 × 236 mm');
  }

  /* ==================================================================
     LAYOUT VERTICAL — impresión A3 vertical (1240 × 1754 ≈ 1:√2)
     El flujo se reorganiza en serpentina: pozo → (derecha) → bajada →
     separador (entrada por la derecha) → gas por la izquierda y líquido
     abajo → medición (izquierda → derecha) → reincorporación → batería.
     ================================================================== */
  function buildV(c) {
    var d = c.data, Ls = c.Ls, E = c.E, T = c.T;
    var eqN = function (id) { return c.util.equipo(id).nombre; };
    c.sheet();
    c.header({ x: 44, y: 44, barH: 128, t1: 40, titles: [
      { size: 46, lh: 38, parts: [{ s: 'DTI simplificado', acc: true }] },
      { size: 30, lh: 0, parts: [{ s: 'Aforo de pozo con separador bifásico' }] }
    ], routeDy: 30, routeW: 790 });

    /* ---- coordenadas ---- */
    var TR = { x: 132, g: 438 }, yIn = TR.g - 102;
    var V = { cx: 565, cy: 650, L: 470, r: 86, hr: 46, dir: -1 };
    var hx0 = V.cx - V.L / 2, hx1 = V.cx + V.L / 2;
    var xCk = 292, xMan = 430, xDrop = 1040;
    var yInV = V.cy - Math.round(V.r * 0.37);
    var xGasN = hx0 + V.hr + 40, yGh = V.cy - V.r - 44, xGm = 90;
    V.saddles = [xGasN + 50, hx1 - V.hr - 40];
    // Accesorios en el domo (espejo del horizontal: la entrada queda a la derecha), de la salida a la entrada:
    // boquilla de gas · TT · TN (sonda, lejos de la entrada) · TPS · PSV hacia la entrada. Registro en la tapa de salida.
    var xTT = xGasN + 52, xTNs = xGasN + 124, xTPS = xGasN + 206, xPSV = xGasN + 304;
    // Orden de medición: gas placa (FE + TDG) → PV; líquido Coriolis (FIT) → LV
    var yLq = 868, yGs = 980, xTee = 900;
    var xCor = 560, xLV = 780, xFE = 300, xPV = 650;
    var xSal = 990, yTDM = 1084, yLim = 1120, yTPL = 1154, yOff = 1182;
    var band = { x0: 1100, x1: 1200, y0: 200, y1: 1172 };
    var bcx = 1138, rF = 21;
    var laneP = 1172, laneQP = 1182, laneQT = 1192;    // carriles a la derecha de las funciones: PIC → PV, TPS → FQI, TT → FQI
    var sc = { x: 868, y: 40, w: 330, h: 122 };
    var tnLat = tnEsLateral(d.separador);

    /* ---- banda RTU vertical ---- */
    var bandG0 = c.rg(Ls.ctl, 0.64, bcx, (band.y0 + band.y1) / 2, 0.05);
    var bandG = E('g', { class: 'eq hl', 'data-eq': 'rtu' }, bandG0);
    c.api.equipos.rtu = bandG;
    E('rect', { x: band.x0, y: band.y0, width: band.x1 - band.x0, height: band.y1 - band.y0, rx: 8, class: 'band' }, bandG);
    c.rtuIcon(bandG, 1138, band.y0 + 20);
    var bx = 1150, bty = band.y0 + 98;
    T(bandG, bx, bty, 'RTU', { font: 'c', size: 24, weight: 800, anchor: 'middle', ls: 1 });
    var rtuPal = String(c.K.rtuModelo || eqN('rtu').replace(/^RTU\s+/, '')).split(/\s+/).slice(0, 3);
    rtuPal.forEach(function (s, i) { T(bandG, bx, bty + 18 + i * 15, c.up(s), { font: 'c', size: 13, weight: 700, anchor: 'middle', ls: 0.6, maxW: 92 }); });
    T(bandG, bx, bty + 18 + rtuPal.length * 15 + 3, c.K.rtuModuloCorto, { font: 'm', size: 10, weight: 700, anchor: 'middle', cls: 'ti2', maxW: 92 });

    /* ---- SCADA + enlace ---- */
    c.scadaBox(sc.x, sc.y, sc.w, sc.h);
    var dlG0 = c.rg(Ls.ctl, 0.9, 1170, 180, 0.03);
    var dlG = E('g', { class: 'hl', 'data-eq': 'scada' }, dlG0);
    E('path', { d: 'M1170 ' + band.y0 + 'V' + (sc.y + sc.h), class: 'dl' }, dlG);
    E('circle', { cx: 1170, cy: (band.y0 + sc.y + sc.h) / 2, r: 4, class: 'dl-o' }, dlG);
    T(dlG, 1160, (band.y0 + sc.y + sc.h) / 2 + 4, c.K.enlace, { font: 'c', size: 11.5, weight: 600, anchor: 'end', cls: 'ti2' });

    /* ---- árbol (producción hacia la derecha) ---- */
    var gA = c.eqGroup('arbol', Ls.eq, 0.02, TR.x, TR.g - 90);
    var tr = c.tree(gA, TR.x, TR.g, 1);
    c.eqLabel(c.rg(Ls.lbl, 0.02, TR.x, TR.g - 200), TR.x - 12, TR.g - 208, eqN('arbol'), 'Pozo en prueba', { eq: 'arbol' });
    var lp = c.rg(Ls.lbl, 0.03, TR.x, TR.g);
    [['Sondeo', TR.g - 128], ['Maestras', TR.g - 60]].forEach(function (q) { T(lp, TR.x - 20, q[1], q[0], { font: 'c', size: 11.5, weight: 600, anchor: 'end', cls: 'tmu' }); });
    T(lp, TR.x + 28, TR.g + 40, 'TP', { font: 'c', size: 11.5, weight: 600, cls: 'tmu' });
    T(lp, TR.x - 46, TR.g + 40, 'TR', { font: 'c', size: 11.5, weight: 600, cls: 'tmu' });

    /* ---- producción → estrangulador → cabezal / manifold → bajada → separador (entra por la derecha) ---- */
    var xInlet = hx1 - V.hr + V.hr * Math.sqrt(1 - Math.pow((yInV - V.cy) / V.r, 2));
    var xTDP = 250;                                 // toma del TDP en la línea lateral (TP), aguas arriba del estrangulador
    c.line('m1', 'mezcla', [[tr.wingX, yIn], [xCk - 14, yIn]], { arrows: [0.2] });
    c.line('m2', 'mezcla', [[xCk + 14, yIn], [xMan - 48 - 11, yIn]], { arrows: [0.5] });
    c.line('m3', 'mezcla', [[xMan + 48 + 11, yIn], [xDrop, yIn], [xDrop, yInV], [xInlet - 2, yInV]], { arrows: [0.3, 0.62, 0.92], eq: 'lineaEntrada' });
    var gK = c.eqGroup('estrangulador', Ls.eq, c.at('m1', xCk, yIn), xCk, yIn);
    E('line', { x1: xCk - 15, y1: yIn, x2: xCk + 15, y2: yIn, class: 'sym-l' }, gK);
    c.choke(gK, xCk, yIn);
    c.eqLabel(c.rg(Ls.lbl, c.at('m1', xCk, yIn), xCk, yIn + 30), xCk, yIn + 36, 'Estrangulador', 'TP / TR', { eq: 'estrangulador' });
    var tMan = c.at('m2', xMan, yIn);
    var gM = c.eqGroup('manifold', Ls.eq, tMan, xMan, yIn);
    E('line', { x1: xMan - 60, y1: yIn, x2: xMan + 60, y2: yIn, class: 'sym-l' }, gM);
    E('rect', { x: xMan - 10, y: yIn - 28, width: 20, height: 56, rx: 4, class: 'sym' }, gM);
    c.gate(gM, xMan - 48, yIn, {});
    c.gate(gM, xMan + 48, yIn, {});
    c.eqLabel(c.rg(Ls.lbl, tMan, xMan, yIn - 60), xMan, yIn - 64, eqN('manifold'), 'Alinea el pozo al separador', { eq: 'manifold' });
    c.eqLabel(c.rg(Ls.lbl, c.at('m3', 760, yIn), 760, yIn), 770, yIn - 16, eqN('lineaEntrada'), null, { eq: 'lineaEntrada', size: 13 });
    T(c.rg(Ls.lbl, c.at('m3', 760, yIn), 760, yIn), 770, yIn + 26, c.K.dn + ' · mezcla del pozo', { size: 11.5, weight: 500, anchor: 'middle', cls: 'ti2' });
    // PI local en la entrada
    var xPI = 948;
    c.bubble('PI', xPI, yInV - 61, 'local', { isa: 'PI', sub: 'local', r: 17, at: c.at('m3', xPI, yInV), key: 'PI', aria: 'Manómetro local', imp: [[[xPI, yInV], [xPI, yInV - 44]]] });

    /* ---- separador (espejo: entrada por la tapa derecha) ---- */
    var gS = c.eqGroup('separador', Ls.eq, T_SEP, V.cx, V.cy);
    var vs = c.vessel(gS, V);
    var xDef = hx1 - V.hr - 16;
    var gDef = E('g', { class: 'eq hl', 'data-eq': 'deflector' }, gS); c.api.equipos.deflector = gDef;
    E('path', { d: 'M' + xDef + ' ' + (yInV - 30) + 'Q' + (xDef - 12) + ' ' + yInV + ' ' + xDef + ' ' + (yInV + 32), class: 'sym-d', 'stroke-width': 3, 'stroke-dasharray': '7 4' }, gDef);
    T(gDef, xDef + 12, yInV - 36, 'Deflector', { font: 'c', size: 11.5, weight: 600, anchor: 'end', cls: 'ti2' });
    var gMe = E('g', { class: 'eq hl', 'data-eq': 'extractor' }, gS); c.api.equipos.extractor = gMe;
    var mx0 = xGasN - 30, mx1 = xGasN + 30, my0 = V.cy - V.r + 9, my1 = my0 + 20;
    E('rect', { x: mx0, y: my0, width: mx1 - mx0, height: my1 - my0, class: 'sym-d' }, gMe);
    var mesh = 'M' + mx0 + ' ' + my1;
    for (var mxi = mx0; mxi < mx1; mxi += 8) mesh += 'L' + Math.min(mxi + 4, mx1) + ' ' + my0 + 'L' + Math.min(mxi + 8, mx1) + ' ' + my1;
    E('path', { d: mesh, class: 'mesh' }, gMe);
    T(gMe, (mx0 + mx1) / 2, my1 + 16, 'Extractor de niebla', { font: 'c', size: 11.5, weight: 600, anchor: 'middle', cls: 'ti2' });
    E('path', { d: 'M' + (V.cx - 142) + ' ' + (vs.yN - 12) + 'l7 10l7 -10Z', class: 'sym', 'stroke-width': 1.2 }, gS);
    T(gS, V.cx - 124, vs.yN - 3, 'NNL', { font: 'm', size: 10, weight: 700, cls: 'ti2' });
    T(gS, V.cx + 55, V.cy + 52, 'Líquido (aceite + agua)', { font: 'c', size: 13, weight: 700, anchor: 'middle', cls: 'tliq' });
    T(gS, V.cx + 35, V.cy - 56, 'Gas', { font: 'c', size: 13, weight: 700, anchor: 'middle', cls: 'ti2' });
    // placa del equipo (a la derecha de la sonda del TN)
    var tbx = xTNs + 16, tby = V.cy - 44;
    E('rect', { x: tbx, y: tby, width: 88, height: 30, rx: 3, class: 'sym-acc' }, gS);
    T(gS, tbx + 44, tby + 22, c.tag, { font: 'c', size: 22, weight: 800, anchor: 'middle', cls: 'ton', ls: 1 });
    var nmL = c.wrap(c.up(eqN('separador')), 72, 13, 'c');
    nmL.forEach(function (s, i) { T(gS, tbx + 96, tby + 12 + i * 14, s, { font: 'c', size: 13, weight: 800, ls: 0.6 }); });
    T(gS, tbx + 96, tby + 12 + nmL.length * 14, d.separador.orientacion, { size: 11.5, weight: 500, cls: 'ti2' });
    // registro bridado en la tapa de salida (izquierda)
    var yReg = tnLat ? V.cy : V.cy + V.r * 0.5, xReg = vs.headX(yReg, -1);
    var gR = E('g', { class: 'eq hl', 'data-eq': 'registro' }, gS); c.api.equipos.registro = gR;
    E('line', { x1: xReg, y1: yReg, x2: xReg - 16, y2: yReg, class: 'sym-l', 'stroke-width': 5 }, gR);
    E('line', { x1: xReg - 17, y1: yReg - 11, x2: xReg - 17, y2: yReg + 11, class: 'sym-l', 'stroke-width': 3 }, gR);
    T(gS, xReg - 22, V.cy + V.r + 14, 'Registro', { font: 'c', size: 11.5, weight: 600, cls: 'ti2' }).setAttribute('data-eq', 'registro');
    var sd = c.rg(Ls.lbl, T_SEP + 0.03, V.cx, V.cy + V.r + 40);
    c.nfpa(sd, xGasN + 50, V.cy + V.r + 46, 26);

    /* ---- PSV en el domo, hacia el extremo de entrada (derecha) ---- */
    var gP = c.eqGroup('psv', Ls.eq, T_SEP + 0.02, xPSV, V.cy - V.r - 20);
    var pcY = c.psv(gP, xPSV, V.cy - V.r, 1);
    T(gP, xPSV - 12, pcY - 14, 'PSV', { font: 'm', size: 11, weight: 700, anchor: 'end' });

    /* ---- salida de gas: por la izquierda hacia abajo ---- */
    var gasPts = [[xGasN, V.cy - V.r + 2], [xGasN, yGh], [xGm, yGh], [xGm, yGs], [xTee - 7, yGs]];
    c.line('g1', 'gas', gasPts, { arrows: [0.03, 0.12, 0.42, 0.68, 0.94] });
    c.eqLabel(c.rg(Ls.lbl, c.at('g1', 250, yGh), 250, yGh), tnLat ? 170 : 250, yGh - 14, 'Salida de gas', null, { eq: 'gas', size: 13 });
    var tFE = c.at('g1', xFE, yGs);
    var gFE = c.eqGroup('placa', Ls.eq, tFE, xFE, yGs);
    c.orifice(gFE, xFE, yGs);
    c.tagBox(gFE, xFE - 26, yGs - 18, 'FE');
    c.eqLabel(c.rg(Ls.lbl, tFE, xFE, yGs + 60), xFE - 40, yGs + 56, 'Placa de orificio', '+ transmisor ΔP E+H', { eq: 'placa', size: 12.5, subSize: 11, anchor: 'end' });
    var vPV = c.K.valvula('PV'), rPV = VALV_CORTO[vPV.tag] || [vPV.nombre, null];
    var tPV = c.at('g1', xPV, yGs);
    var gPV = c.eqGroup('pv', Ls.eq, tPV, xPV, yGs);
    var aPV = c.controlValve(gPV, xPV, yGs);
    c.tagBox(gPV, xPV + 20, yGs - 20, vPV.tag, { anchor: 'start' });
    c.eqLabel(c.rg(Ls.lbl, tPV, xPV, yGs + 36), xPV, yGs + 32, rPV[0], rPV[1], { eq: 'pv', size: 12.5, subSize: 11 });

    /* ---- salida de líquido: Coriolis (FIT) → LV ---- */
    var liqPts = [[xGasN, V.cy + V.r - 2], [xGasN, yLq], [xTee, yLq], [xTee, yGs - 8]];
    c.line('l1', 'liquido', liqPts, { arrows: [0.1, 0.27, 0.6, 0.8], minArrow: 90 });
    c.eqLabel(c.rg(Ls.lbl, c.at('l1', xGasN, yLq), xGasN, yLq), xGasN - 14, yLq + 16, 'Salida de líquido', 'aceite + agua', { eq: 'liquido', size: 12.5, subSize: 11, anchor: 'end' });
    var tCo = c.at('l1', xCor, yLq);
    var gCo = c.eqGroup('coriolis', Ls.eq, tCo, xCor, yLq);
    c.coriolis(gCo, xCor, yLq);
    c.eqLabel(c.rg(Ls.lbl, tCo, xCor, yLq + 30), xCor, yLq + 31, 'Coriolis E+H Promass 300', 'Flujo másico · densidad · % agua', { eq: 'coriolis', size: 12.5, subSize: 11 });
    var vLV = c.K.valvula('LV'), rLV = VALV_CORTO[vLV.tag] || [vLV.nombre, null];
    var tLV = c.at('l1', xLV, yLq);
    var gLV = c.eqGroup('lv', Ls.eq, tLV, xLV, yLq);
    var aLV = c.controlValve(gLV, xLV, yLq);
    c.tagBox(gLV, xLV + 20, yLq - 20, vLV.tag, { anchor: 'start' });
    c.eqLabel(c.rg(Ls.lbl, tLV, xLV, yLq + 30), xLV, yLq + 31, rLV[0], rLV[1], { eq: 'lv', size: 12.5, subSize: 11 });

    /* ---- reincorporación → salida → batería ---- */
    c.line('s1', 'salida', [[xTee, yGs], [xSal, yGs], [xSal, yLim]], { arrows: [0.22, 0.75], minArrow: 60 });
    c.line('s2', 'salida', [[xSal, yLim], [xSal, yOff]], { arrows: [], minArrow: 999 });
    var gTee = c.eqGroup('recombinacion', Ls.eq, TL.s1[0], xTee, yGs);
    E('circle', { cx: xTee, cy: yGs, r: 7.5, class: 'sym-acc' }, gTee);
    c.eqLabel(c.rg(Ls.lbl, TL.s1[0], xTee, yGs + 40), xTee - 6, yGs + 30, 'Reincorporación', 'gas + líquido → línea de salida', { eq: 'recombinacion', size: 12.5, subSize: 11, anchor: 'end' });
    var gLim = c.rg(Ls.zone, TL.s1[1], xSal, yLim);
    E('line', { x1: xSal - 22, y1: yLim, x2: xSal + 22, y2: yLim, class: 'sym-l', 'stroke-width': 2.2 }, gLim);
    c.T(gLim, xSal - 28, yLim + 4, 'Empate', { size: 10.5, anchor: 'end', cls: 'tmu' });
    var gBat = c.eqGroup('lineaBateria', Ls.eq, TL.s2[1] - 0.01, xSal, yOff + 24);
    c.offPage(gBat, xSal, yOff, 108, 44, 'down', '', { acc: true });
    T(gBat, xSal, yOff + 19, 'A BATERÍA', { font: 'c', size: 15, weight: 800, anchor: 'middle', cls: 'ton', ls: 0.5 });
    c.eqLabel(c.rg(Ls.lbl, TL.s2[0] + 0.03, xSal, yOff), xSal - 66, yOff + 12, eqN('lineaBateria'), c.K.dn + ' · circuito cerrado', { eq: 'lineaBateria', size: 12.5, subSize: 11, anchor: 'end' });

    /* ---- instrumentos ---- */
    // TDP en la línea lateral (TP), entre la válvula lateral del árbol y el estrangulador
    var yTDP = yIn - 62;
    c.bubble('TDP', xTDP, yTDP, 'campo', { at: 0.04, stream: 'mezcla', imp: [[[xTDP, yIn], [xTDP, yTDP + 25]]] });
    var yB1 = V.cy - V.r - 70, yDome = V.cy - V.r;
    c.bubble('TT', xTT, yB1, 'campo', { at: T_SEP + 0.04, stream: 'gas', imp: [[[xTT, yB1 + 25], [xTT, yDome]]], deco: function (gi) { E('rect', { x: xTT - 4, y: yDome - 2, width: 8, height: 14, rx: 2, class: 'sym' }, gi); } });
    c.bubble('TPS', xTPS, yB1, 'campo', { at: T_SEP + 0.05, stream: 'gas', imp: [[[xTPS, yB1 + 25], [xTPS, yDome]]] });
    // TN según WT.data.separador.tnMontaje
    var xTN, yTN;
    if (!tnLat) {
      xTN = xTNs; yTN = yB1;
      c.bubble('TN', xTN, yTN, 'campo', { at: T_SEP + 0.06, stream: 'liquido', imp: [[[xTN, yDome - 10], [xTN, yTN + 25]]], deco: function (gi) {
        E('line', { x1: xTN, y1: yDome, x2: xTN, y2: vs.yN + 14, class: 'imp', 'stroke-width': 2.4 }, gi);            // sonda
        E('rect', { x: xTN - 2.5, y: vs.yN + 10, width: 5, height: 8, rx: 1.2, class: 'sym' }, gi);
        E('rect', { x: xTN - 7, y: yDome - 10, width: 14, height: 10, rx: 1.5, class: 'sym' }, gi);                   // boquilla
        T(gi, xTN + 10, yDome - 22, 'sonda', { size: 10.5, weight: 600, cls: 'tmu' });
      } });
    } else {
      var yT1 = V.cy - 46, yT2 = V.cy + 50, xBr = hx0 - 30;
      xTN = xBr - 52; yTN = V.cy + 2;
      c.bubble('TN', xTN, yTN, 'campo', { at: T_SEP + 0.06, stream: 'liquido', imp: [[[vs.headX(yT1, -1), yT1], [xBr, yT1], [xBr, yT2], [vs.headX(yT2, -1), yT2]], [[xBr, yTN], [xTN + 25, yTN]]] });
    }
    var yTDG = yGs + 60;
    c.bubble('TDG', xFE, yTDG, 'campo', { at: tFE + 0.01, stream: 'gas', imp: [[[xFE - 6, yGs + 13], [xFE - 6, yTDG - 21]], [[xFE + 6, yGs + 13], [xFE + 6, yTDG - 21]]] });
    var yFIT = yLq - 80;
    c.bubble('CORIOLIS', xCor, yFIT, 'campo', { at: tCo + 0.01, stream: 'liquido', imp: [[[xCor, yLq - 15], [xCor, yFIT + 25]]] });
    var xTDM = xSal + 58;
    c.bubble('TDM', xTDM, yTDM, 'campo', { at: TL.s1[0] + 0.03, stream: 'salida', imp: [[[xSal, yTDM], [xTDM - 25, yTDM]]] });
    c.bubble('TPL', xTDM, yTPL, 'campo', { at: TL.s2[0] + 0.01, stream: 'salida', imp: [[[xSal, yTPL], [xTDM - 25, yTPL]]] });

    /* ---- funciones en el RTU (WT.data.funciones) ---- */
    var yPIC = yB1, yLIC = V.cy + 30, yFQI = yTDG, sqL = bcx - rF - 3, sqR = bcx + rF + 3;
    var fP = c.K.fn('PIC'), fL = c.K.fn('LIC'), fQ = c.K.fn('FQI');
    c.bubble(fP.tag, bcx, yPIC, 'funcion', { isa: fP.tag, sub: fP.mide, key: fP.tag, r: rF, at: T_FUNC, aria: fP.desc });
    c.bubble(fL.tag, bcx, yLIC, 'funcion', { isa: fL.tag, sub: fL.mide, key: fL.tag, r: rF, at: T_FUNC + 0.01, aria: fL.desc });
    c.bubble(fQ.tag, bcx, yFQI, 'funcion', { isa: fQ.tag, sub: fQ.mide, key: fQ.tag, r: rF, at: T_FUNC + 0.02, aria: fQ.desc });

    /* ---- señales ----
       Bajo el separador, de arriba abajo: señal del FIT → carril LIC → LV → (línea de líquido) → carril PIC → PV; así el
       FIT (antes) y la LV (después) quedan en el orden del flujo sin cruzar señales. Arriba del domo: TT por el carril más
       alto hasta el FQI (por la derecha de la banda), la derivación de TPS (punto) al FQI por un carril paralelo y el TN
       al LIC; su único cruce sin conexión (con la señal del TPS) se marca con un salto. */
    var bl = band.x0, yTTh = yB1 - 114, yTPSh = yB1 - 98, yTNh = yB1 - 82, xJ = bl - 10, xTNd = bl - 40;
    var yLICr = yFIT + 28, yPICr = yLq + 60;
    var comp = fQ.compensa || [];
    var tnHops = [[xTNd, yPIC]];
    if (tnLat && xTN < xTT) tnHops.push([xTT, yTNh]);
    c.signal('sTDP', [[xTDP, yTDP - 25], [xTDP, band.y0 + 14], [bl, band.y0 + 14]], { tag: 'TDP' });
    if (comp.indexOf('TT') >= 0) c.signal('sTT', [[xTT, yB1 - 25], [xTT, yTTh], [laneQT, yTTh], [laneQT, yFQI + 8], [sqR, yFQI + 8]], { tag: 'TT', tags: ['TT', fQ.tag] });
    else c.signal('sTT', [[xTT, yB1 - 25], [xTT, yTTh], [bl, yTTh]], { tag: 'TT' });
    c.signal('sTPS', [[xTPS + 25, yB1], [sqL, yPIC]], { tag: fP.mide, tags: [fP.mide, fP.tag] });
    c.signal('sTN', [[xTN, yTN - 25], [xTN, yTNh], [xTNd, yTNh], [xTNd, yLIC], [sqL, yLIC]], { tag: fL.mide, tags: [fL.mide, fL.tag], hops: tnHops });
    c.signal('sTDG', [[xFE + 25, yTDG], [sqL, yFQI]], { tag: fQ.mide, tags: [fQ.mide, fQ.tag] });
    if (comp.indexOf(fP.mide) >= 0) c.signal('sTPSq', [[xJ, yPIC], [xJ, yTPSh], [laneQP, yTPSh], [laneQP, yFQI - 8], [sqR, yFQI - 8]], { tag: fP.mide, tags: [fP.mide, fQ.tag], dots: [[xJ, yPIC]] });
    c.signal('sCOR', [[xCor + 25, yFIT], [bl, yFIT]], { tag: 'CORIOLIS' });
    c.signal('sTDM', [[xTDM + 25, yTDM], [bl, yTDM]], { tag: 'TDM' });
    c.signal('sTPL', [[xTDM + 25, yTPL], [bl, yTPL]], { tag: 'TPL' });
    c.signal('sPIC', [[sqR, yPIC], [laneP, yPIC], [laneP, yPICr], [xPV, yPICr], [xPV, aPV.y]], { tag: fP.tag, tags: [fP.tag, fP.mide] });
    c.signal('sLIC', [[bcx, yLIC + rF + 3], [bcx, yLICr], [xLV, yLICr], [xLV, aLV.y]], { tag: fL.tag, tags: [fL.tag, fL.mide] });

    /* ---- tarjeta circuito cerrado y notas ---- */
    if (!tnLat) c.closedCard(110, V.cy - V.r - 20, 184, 316);
    else c.closedCard(110, V.cy + 72, 176, 224);
    var sp = d.separador;
    c.notes(110, 1090, 690, 112, { compacto: true, size: 12, lh: 15, extra: ['Equipo ' + c.tag + ': ' + sepInfo(sp).map(function (q) { return q.charAt(0).toLowerCase() + q.slice(1); }).join(', ').replace(' · servicio', ', servicio') + '.'] });

    /* ---- lista, simbología, cuadro ---- */
    c.instList(44, 1238, 1152, 228, [96, 62, 410, 400, 170]);
    c.legend(44, 1478, 712, 248, { rowH: 21, rowHS: 22, sinPaquete: true });
    c.titleBlock(770, 1478, 426, 248, 'A3 vertical');
  }

  var LAYOUTS = {
    horizontal: { W: 1920, H: 1080, build: buildH },
    vertical: { W: 1240, H: 1754, build: buildV }
  };

  /* Fuentes que usa el SVG (para incrustarlas al exportar un SVG autónomo) */
  var FUENTES = [
    ['Barlow', 400, 'barlow-latin-400-normal.woff2'], ['Barlow', 500, 'barlow-latin-500-normal.woff2'],
    ['Barlow', 600, 'barlow-latin-600-normal.woff2'], ['Barlow', 700, 'barlow-latin-700-normal.woff2'],
    ['Barlow Condensed', 500, 'barlow-condensed-latin-500-normal.woff2'], ['Barlow Condensed', 600, 'barlow-condensed-latin-600-normal.woff2'],
    ['Barlow Condensed', 700, 'barlow-condensed-latin-700-normal.woff2'], ['Barlow Condensed', 800, 'barlow-condensed-latin-800-normal.woff2'],
    ['JetBrains Mono', 400, 'jetbrains-mono-latin-400-normal.woff2'], ['JetBrains Mono', 700, 'jetbrains-mono-latin-700-normal.woff2']
  ].map(function (f) { return { family: f[0], weight: f[1], file: 'fonts/' + f[2] }; });

  WT.PID = {
    FUENTES: FUENTES,
    render: render,
    layouts: { horizontal: { W: 1920, H: 1080 }, vertical: { W: 1240, H: 1754 } },
    ventanas: TL
  };
})();
