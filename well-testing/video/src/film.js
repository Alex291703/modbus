/* =====================================================================
   Well Testing · R.B. Tec México — VIDEO "Animación del proceso"
   ---------------------------------------------------------------------
   Código compartido por las dos composiciones HyperFrames:
     index.html     16:9  1920×1080  WTFilm.boot({ id, layout: 'landscape' })
     vertical.html   9:16 1080×1920  WTFilm.boot({ id, layout: 'portrait' })
   Duración fija: 90 s, cortes en 0 · 6 · 15 · 24 · 31 · 52 · 64 · 71 · 83 · 90
   (la música ya está sincronizada a esos cortes).

   Cómo se dibuja cada cuadro (determinista, función pura de t):
     · GSAP (línea de tiempo raíz pausada) anima rótulos, tarjetas, leyenda,
       logo y las capas (opacidad / clip-path / escala).
     · El manejador del evento hf-seek (lo dispara el runtime DESPUÉS de
       posicionar la línea GSAP) dibuja:
         - la escena 3D (WT.Scene3D) en un canvas WebGL FUERA del DOM y la
           copia a un <canvas> 2D visible (evita los "huecos" invertidos que
           produce la captura beginframe + SwiftShader con WebGL + overlays);
         - el corte del separador (WT.Cutaway), el SCADA (WT.SCADA) y el
           DTI (WT.PID);
         - las etiquetas ancladas a equipos (project()/anchor()), las líneas
           guía, los pulsos de señal y los valores numéricos.
     Ninguna capa se dibuja si GSAP la tiene oculta (opacidad 0).
   Todo dato (tags, nombres, colores, valores de demostración) sale de
   WT.data / WT.util / WT.SCADA.sim. Sin Math.random, Date.now ni red.
   ===================================================================== */
(function () {
  'use strict';
  var WT = (window.WT = window.WT || {});
  var F = (window.WTFilm = window.WTFilm || {});

  /* ------------------------------------------------------------------ util */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function smr(k) { k = clamp(k, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); }
  function eio(k) { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function eo(k) { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }
  function ei(k) { k = clamp(k, 0, 1); return k * k * k; }
  function frac(x) { return x - Math.floor(x); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hx(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function px(n) { return Math.round(n * 10) / 10 + 'px'; }

  /* LABEL_OFFSETS:BEGIN — generado por el solucionador de etiquetas + ajustes revisados a mano */
  F.LABEL_OFFSETS = {
    h: {
      '3d:arbol:11.90': [80, -80],
      '3d:manifold:12.10': [80, -80],
      '3d:lineaEntrada:12.30': [-80, 80],
      '3d:separador:12.50': [80, -80],
      '3d:rtu:12.70': [80, -80],
      '3d:caseta:12.90': [80, 80],
      '3d:zonaSeguridad:13.10': [-80, -80],
      '3d:acceso:13.30': [-80, -130],
      '3d:lineaBateria:13.50': [-80, -80],
      '3d:arbol:17.00': [80, -80],
      '3d:TDP:17.90': [-80, 80],
      '3d:estrangulador:19.70': [140, 260],
      '3d:manifold:22.00': [-80, -80],
      '3d:lineaEntrada:25.00': [80, -80],
      '3d:deflector:28.90': [80, -80],
      '3d:deflector:33.30': [80, 130],
      '3d:extractor:33.55': [-140, -260],
      '3d:nivel:33.80': [-80, -80],
      'cut:deflector:36.05': [-80, -80],
      'cut:extractor:44.52': [-80, -80],
      'cut:CORIOLIS:47.05': [80, -80],
      'cut:LV:47.27': [-80, 80],
      'cut:TN:47.49': [80, 80],
      'cut:PV:49.80': [80, 130],
      'cut:placa:50.24': [-80, -80],
      'L:CORIOLIS:53.20': [-80, -80],
      'L:LV:53.60': [80, 130],
      'R:placa:54.30': [-80, 130],
      'R:TDG:54.60': [80, 190],
      'R:PV:54.90': [-80, -80],
      '3d:recombinacion:64.60': [-80, -80],
      '3d:TDM:65.50': [80, -130],
      '3d:TPL:67.90': [-80, -80],
      '3d:lineaBateria:68.60': [80, 260],
      '3d:rtu:72.30': [-80, -80],
      '3d:scada:72.80': [-140, 190]
    },
    v: {
      '3d:arbol:11.90': [-80, 80],
      '3d:manifold:12.10': [80, 80],
      '3d:lineaEntrada:12.30': [-80, -80],
      '3d:separador:12.50': [80, -80],
      '3d:rtu:12.70': [80, -190],
      '3d:caseta:12.90': [80, 190],
      '3d:zonaSeguridad:13.10': [-80, -80],
      '3d:acceso:13.30': [80, -130],
      '3d:lineaBateria:13.50': [-80, 130],
      '3d:arbol:17.00': [80, -80],
      '3d:TDP:17.90': [80, 0],
      '3d:estrangulador:19.70': [80, 80],
      '3d:manifold:22.00': [-80, -80],
      '3d:lineaEntrada:25.00': [80, -80],
      '3d:deflector:28.90': [80, -80],
      '3d:deflector:33.30': [80, -80],
      '3d:extractor:33.55': [-80, 80],
      '3d:nivel:33.80': [140, -190],
      'cut:deflector:36.05': [-80, -80],
      'cut:extractor:44.52': [80, -80],
      'cut:CORIOLIS:47.05': [-80, 80],
      'cut:LV:47.27': [-80, 190],
      'cut:TN:47.49': [140, -190],
      'cut:PV:49.80': [-80, 80],
      'cut:placa:50.24': [80, -80],
      'L:CORIOLIS:53.20': [80, 110],
      'L:LV:53.60': [-80, 140],
      'R:placa:54.30': [80, 100],
      'R:TDG:54.60': [80, -130],
      'R:PV:54.90': [-80, -110],
      '3d:recombinacion:64.60': [80, -190],
      '3d:TDM:65.50': [-80, -260],
      '3d:TPL:67.90': [80, -130],
      '3d:lineaBateria:68.60': [-80, -260],
      '3d:rtu:72.30': [80, -80],
      '3d:scada:72.80': [80, -80]
    }
  };
  /* LABEL_OFFSETS:END */

  /* ------------------------------------------------------------ tiempos */
  var CUT = [0, 6, 15, 24, 31, 52, 64, 71, 83, 90];
  var STEP_T = [35.6, 38.35, 41.1, 43.85, 46.6, 49.35, 52.1];   // pasos 1..6 del corte

  /* ================================================================== */
  F.boot = function (cfg) {
    var D = WT.data, U = WT.util, COL = D.colores;
    var V = cfg.layout === 'portrait';
    var W = V ? 1080 : 1920, H = V ? 1920 : 1080;
    var TAG = D.separador.tagDefault;
    var root = document.getElementById('root');
    var $ = function (id) { return document.getElementById(id); };
    var tl = gsap.timeline({ paused: true });

    function eqp(id) { return U.equipo(id) || { nombre: id, desc: '' }; }
    function corto(id) { var e = eqp(id); return e.corto || e.nombre; }
    function ins(tag) { return U.instrumento(tag) || { variable: tag, unidad: '' }; }
    function vc(tag) { for (var i = 0; i < D.valvulasControl.length; i++) if (D.valvulasControl[i].tag === tag) return D.valvulasControl[i]; return { tag: tag, nombre: tag }; }
    function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
    function num(v, d) { return U.fmt(v, d); }
    var sim = WT.SCADA && WT.SCADA.sim;

    /* ---- animación: helpers sobre la línea de tiempo raíz ---- */
    function init(el, vars) { gsap.set(el, vars); tl.set(el, vars, 0); }
    function ft(el, from, to, at) { to.immediateRender = false; tl.fromTo(el, from, to, at); }
    function fadeIn(el, at, d, extra) { var f = { autoAlpha: 0 }, o = { autoAlpha: 1, duration: d || 0.5, ease: 'power2.out' }; for (var k in extra) { f[k] = extra[k][0]; o[k] = extra[k][1]; } ft(el, f, o, at); }
    function fadeOut(el, at, d, extra) { var f = { autoAlpha: 1 }, o = { autoAlpha: 0, duration: d || 0.35, ease: 'power2.in' }; for (var k in extra) { f[k] = extra[k][0]; o[k] = extra[k][1]; } ft(el, f, o, at); }

    /* ================================================================
       CAPAS FIJAS
       ================================================================ */
    var bg = $('f-bg'), glWrap = $('f-gl'), cutWrap = $('f-cut'), scadaWrap = $('f-scada'), pidWrap = $('f-pid');
    var lead = $('f-lead'), anch = $('f-anch'), hud = $('f-hud'), fx = $('f-fx');
    lead.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    lead.setAttribute('width', W); lead.setAttribute('height', H);

    // fondo: retícula técnica + brillo + texto fantasma
    var grid = sv('svg', { 'class': 'grid', viewBox: '0 0 ' + Math.round(W * 1.2) + ' ' + Math.round(H * 1.2), preserveAspectRatio: 'none' }, bg);
    var defs = sv('defs', null, grid);
    var pat = sv('pattern', { id: 'f-gp', width: 160, height: 160, patternUnits: 'userSpaceOnUse' }, defs);
    sv('path', { d: 'M40 0V160M80 0V160M120 0V160M0 40H160M0 80H160M0 120H160', stroke: 'rgba(169,220,247,0.07)', 'stroke-width': 1.5, fill: 'none' }, pat);
    sv('path', { d: 'M0 0V160M0 0H160', stroke: 'rgba(169,220,247,0.16)', 'stroke-width': 2, fill: 'none' }, pat);
    sv('rect', { width: '100%', height: '100%', fill: 'url(#f-gp)' }, grid);
    var glow = hx('div', 'glow', bg);
    var ghost = hx('div', 'ghost', bg, 'AFORO');
    ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('data-layout-ignore', '');   // texto fantasma decorativo
    init(grid, { x: 0, y: 0 });
    tl.to(grid, { x: -160, y: -80, duration: 90, ease: 'none' }, 0);
    init(glow, { scale: 0.9, opacity: 0.75 });
    tl.to(glow, { scale: 1.12, opacity: 1, duration: 3, ease: 'sine.inOut', yoyo: true, repeat: 28 }, 0);
    init(ghost, { autoAlpha: 0, x: 0 });

    // 3D: canvas WebGL fuera del DOM → canvas 2D visible
    var vis = glWrap.querySelector('canvas'); vis.width = W; vis.height = H;
    var vctx = vis.getContext('2d');
    var off = document.createElement('canvas'); off.width = W; off.height = H;
    var s3 = WT.Scene3D.create({ canvas: off, width: W, height: H, pixelRatio: 1, quality: cfg.quality || (/[#&]q=(high|medium|low)/.exec(location.hash) || [])[1] || 'high', separatorTag: TAG, preserveDrawingBuffer: true });
    var curW = W, curH = H;
    function size3(w, h) { if (w !== curW || h !== curH) { s3.resize(w, h); curW = w; curH = h; } }

    // corte del separador
    // si un módulo 2D falla al crearse, el video sigue (esa capa queda vacía y el error se registra)
    function make(name, fn, stub) {
      try { return fn(); } catch (err) { if (window.console) console.error('WTFilm: no se pudo crear ' + name + ': ' + (err && err.message)); return stub; }
    }
    var CUTH = V ? 1610 : H - 130;
    var cut = make('corte', function () { return WT.Cutaway.create(cutWrap, { width: W, height: CUTH, layout: V ? 'portrait' : 'landscape', labels: false, tag: TAG, pixelRatio: 1 }); },
      { renderAt: function () {}, anchor: function () { return null; } });

    // SCADA dentro de un monitor
    var SC = V ? { x: 52, y: 380, w: 952, h: 536, pad: 12 } : { x: 80, y: 262, w: 1184, h: 666, pad: 16 };
    var mon = hx('div', 'mon', scadaWrap);
    // la pantalla SAF-900 es un módulo con odómetros y capas propias: sus traslapes internos son intencionales
    mon.setAttribute('data-layout-allow-occlusion', ''); mon.setAttribute('data-layout-allow-overlap', '');
    mon.style.left = px(SC.x); mon.style.top = px(SC.y); mon.style.padding = px(SC.pad);
    var scr = hx('div', 'scr', mon); scr.style.width = px(SC.w); scr.style.height = px(SC.h);
    hx('div', 'stand', mon);
    var scada = make('SCADA', function () { return WT.SCADA.create(scr, { width: SC.w, height: SC.h, layout: 'landscape', tag: TAG, logo: 'assets/logo-rbtec-blanco.svg' }); },
      { renderAt: function () {} });

    // DTI
    var PIDL = V ? { x: 72, y: 214, w: 936, h: 1324, o: 'vertical' } : { x: 100, y: 150, w: 1720, h: 967, o: 'horizontal' };
    var sheet = hx('div', 'sheet', pidWrap);
    sheet.setAttribute('data-layout-allow-overflow', '');
    sheet.style.left = px(PIDL.x); sheet.style.top = px(PIDL.y); sheet.style.width = px(PIDL.w); sheet.style.height = px(PIDL.h);
    var pid = make('DTI', function () { return WT.PID.render(sheet, { orientacion: PIDL.o, tema: 'pantalla', tag: TAG, assets: 'assets/' }); },
      { renderAt: function () {} });
    // Los textos para cliente no llevan notas internas ("por confirmar / por validar"):
    // si algún módulo aún las trae, se depuran aquí sin tocar el módulo.
    function depurar(rootEl) {
      var tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null), n, out = [];
      while ((n = tw.nextNode())) out.push(n);
      out.forEach(function (tn) {
        var v = tn.nodeValue, o = v;
        if (!/por (confirmar|validar)/i.test(v)) return;
        if (/^\s*Documento ilustrativo/i.test(v)) v = 'Documento ilustrativo · sin escala';
        else v = v.replace(/\s*·?\s*[^·.]*por (confirmar|validar)( con el área técnica)?\.?/gi, '');
        if (v !== o) tn.nodeValue = v;
      });
    }
    depurar(scr); depurar(sheet);
    // en video (texto pequeño, compresión H.264) se aclaran los textos secundarios del DTI
    (function () {
      var LIFT = { 'rgb(127, 151, 179)': '#aebfd2', 'rgb(159, 186, 213)': '#dde8f2' };
      var tx = sheet.querySelectorAll('text');
      for (var i = 0; i < tx.length; i++) { var f = getComputedStyle(tx[i]).fill; if (LIFT[f]) tx[i].style.fill = LIFT[f]; }
    })();

    /* ================================================================
       HUD: logo en esquina, leyenda de corrientes, ruta del fluido
       ================================================================ */
    var LOGO = 'assets/logo-rbtec-blanco.svg';
    var cornerLogo = hx('img', 'f-logo', hud); cornerLogo.src = LOGO; cornerLogo.alt = D.empresa.nombre;
    // geometría del logo (viewBox 360×96) para los vuelos esquina ↔ centro
    var LG = V
      ? { corner: { cx: 64 + 76 * 3.75 / 2, cy: 92 + 38, w: 76 * 3.75 }, big: { cx: 540, cy: 640, w: 840 }, close: { cx: 540, cy: 560, w: 820 } }
      : { corner: { cx: 1920 - 80 - 72 * 3.75 / 2, cy: 64 + 36, w: 72 * 3.75 }, big: { cx: 960, cy: 300, w: 720 }, close: { cx: 960, cy: 300, w: 760 } };
    init(cornerLogo, { autoAlpha: 0 });

    var legend = hx('div', 'f-legend', hud);
    hx('span', 'lg-t', legend, 'Corrientes');
    var LEG = {};
    [['mezcla', 'Mezcla'], ['gas', 'Gas'], ['liquido', 'Líquido'], ['salida', 'Reincorporada'], ['senal', 'Señal']].forEach(function (p) {
      var it = hx('span', 'it', legend, '<i class="sw ' + p[0] + '"></i>' + esc(p[1]));
      LEG[p[0]] = it;
    });
    init(legend, { autoAlpha: 0, y: 20 });
    fadeIn(legend, 11.4, 0.6, { y: [20, 0] });
    fadeOut(legend, 74.6, 0.4);
    // énfasis por tramo: activo = 1, inactivo = 0.32
    var LO = 0.45;
    var LEG_K = [
      [11.4, { mezcla: 1, gas: 1, liquido: 1, salida: 1, senal: 1 }],
      [16.3, { mezcla: 1, gas: LO, liquido: LO, salida: LO, senal: LO }],
      [30.4, { mezcla: 1, gas: 1, liquido: 1, salida: LO, senal: LO }],
      [46.6, { mezcla: LO, gas: 1, liquido: 1, salida: LO, senal: 1 }],
      [52.0, { mezcla: LO, gas: 1, liquido: 1, salida: LO, senal: LO }],
      [64.2, { mezcla: LO, gas: 1, liquido: 1, salida: 1, senal: LO }],
      [71.2, { mezcla: LO, gas: LO, liquido: LO, salida: LO, senal: 1 }]
    ];
    Object.keys(LEG).forEach(function (k) { init(LEG[k], { opacity: LEG_K[0][1][k] }); });
    for (var li = 1; li < LEG_K.length; li++) {
      Object.keys(LEG).forEach(function (k) {
        var a = LEG_K[li - 1][1][k], b = LEG_K[li][1][k];
        if (a !== b) ft(LEG[k], { opacity: a }, { opacity: b, duration: 0.5, ease: 'power1.inOut' }, LEG_K[li][0]);
      });
    }

    // ruta del fluido (solo 16:9)
    var RAIL = [['Pozo', 15.0], ['Estrangulador', 19.6], ['Cabezal', 21.9], ['Entrada', 24.2], ['Separador', 30.6], ['Medición', 52.0], ['Batería', 64.4]];
    var RW = 800;
    var rail = hx('div', 'f-rail', hud);
    hx('div', 'plate', rail); hx('div', 'track', rail);
    var railFill = hx('div', 'fill', rail);
    var railN = RAIL.map(function (r, i) {
      var n = hx('div', 'nd', rail, '<b></b><span>' + esc(r[0]) + '</span>');
      n.style.left = px(12 + i * ((RW - 24) / (RAIL.length - 1)));
      return n;
    });
    init(rail, { autoAlpha: 0, y: 20 });
    init(railFill, { scaleX: 0 });
    if (!V) {
      fadeIn(rail, 16.5, 0.6, { y: [20, 0] });
      fadeOut(rail, 71.0, 0.4);
      for (var ri = 0; ri < RAIL.length; ri++) {
        var on = { backgroundColor: COL.amarillo, borderColor: COL.amarillo, scale: 1.25, duration: 0.35, ease: 'back.out(2)' };
        init(railN[ri].querySelector('b'), { backgroundColor: '#0a1f3d', borderColor: 'rgba(169,220,247,0.55)', scale: 1 });
        ft(railN[ri].querySelector('b'), { backgroundColor: '#0a1f3d', borderColor: 'rgba(169,220,247,0.55)', scale: 1 }, on, Math.max(16.6, RAIL[ri][1]));
        if (ri > 0) ft(railFill, { scaleX: (ri - 1) / (RAIL.length - 1) }, { scaleX: ri / (RAIL.length - 1), duration: 0.8, ease: 'power2.inOut' }, RAIL[ri][1] - 0.4);
        if (ri < RAIL.length - 1) ft(railN[ri].querySelector('b'), { scale: 1.25 }, { scale: 1, duration: 0.3, ease: 'power1.out' }, RAIL[ri + 1][1]);
      }
    }

    // nota de valores simulados (lugar fijo por formato)
    var simNote = hx('div', 'f-sim', hud, '<b>●</b> ' + esc(D.demo.aviso));
    if (V) { simNote.style.left = '50%'; simNote.style.bottom = px(270 + 82); simNote.style.transform = 'translateX(-50%)'; }
    else { simNote.style.right = '80px'; simNote.style.top = '152px'; }
    init(simNote, { autoAlpha: 0 });
    (V ? [[17.8, 21.6], [65.4, 71.0], [75.4, 82.45]] : [[17.8, 21.6], [52.6, 63.8], [65.4, 71.0], [75.4, 82.45]]).forEach(function (w) { fadeIn(simNote, w[0], 0.4); fadeOut(simNote, w[1], 0.3); });

    /* ================================================================
       RÓTULOS DE CAPÍTULO (entran grandes y se compactan a la esquina)
       ================================================================ */
    function chapter(scene, n, ttl, sub, t0, t1, hold) {
      var c = hx('div', 'f-chapter', scene);
      var plate = hx('div', 'plate', c);
      var nn = n ? hx('span', 'num', c, '<i></i>' + esc(n)) : null;
      var tt = hx('span', 'ttl', c, esc(ttl));
      var ss = hx('span', 'sub', c, esc(sub));
      init(c, { autoAlpha: 0, scale: 1, x: 0, y: 0 });
      init(plate, { autoAlpha: 0, scaleX: 0.3, transformOrigin: '0% 50%' });
      if (nn) init(nn, { autoAlpha: 0, x: -30 });
      init(tt, { autoAlpha: 0, y: 40, clipPath: 'inset(0% 0% 100% 0%)' });
      init(ss, { autoAlpha: 0, y: 16 });
      ft(c, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t0);
      ft(plate, { autoAlpha: 0, scaleX: 0.3 }, { autoAlpha: 1, scaleX: 1, duration: 0.6, ease: 'expo.out' }, t0);
      if (nn) ft(nn, { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'power3.out' }, t0 + 0.05);
      ft(tt, { autoAlpha: 0, y: 40, clipPath: 'inset(0% 0% 100% 0%)' }, { autoAlpha: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'power4.out' }, t0 + 0.12);
      ft(ss, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, t0 + 0.4);
      // compactar
      var kc = V ? 0.62 : 0.56, tc = t0 + (hold || 2.3);
      ft(c, { scale: 1 }, { scale: kc, duration: 0.7, ease: 'power3.inOut' }, tc);
      ft(ss, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.35, ease: 'power1.in' }, tc);
      ft(c, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, t1 - 0.3);
      return c;
    }

    /* ================================================================
       ETIQUETAS ANCLADAS (posición por cuadro desde project()/anchor())
       ================================================================ */
    var LABELS = [];
    // Desplazamientos de las etiquetas: calculados fuera de línea (muestreo de la trayectoria
    // del ancla + rectángulos ocupados por la interfaz) y fijados aquí como constantes.
    // Si una etiqueta no aparece en la tabla se usa spec.o (16:9) / spec.ov (9:16).
    var LOFF = F.LABEL_OFFSETS || {};
    // o = [dx, dy] 16:9 ; ov = [dx, dy] 9:16
    function label(spec) {
      var el = hx('div', 'alab' + (spec.y ? ' y' : ''), anch);
      var bx = hx('div', 'bx', el);
      var l1 = hx('div', 'ln1', bx);
      if (spec.tg) hx('span', 'tg' + (spec.tgc ? ' c' : ''), l1, esc(spec.tg));
      if (spec.nm) hx('span', 'nm', l1, esc(spec.nm));
      if (spec.ds) hx('span', 'ds', bx, esc(spec.ds));
      var vl = spec.val ? hx('span', 'vl', bx, '') : null;
      var g = sv('g', null, lead);
      var path = sv('path', { 'class': 'ld' + (spec.y ? ' y' : '') }, g);
      var ring = sv('circle', { 'class': 'ring' + (spec.y ? '' : ' c'), r: 10 }, g);
      var dot = sv('circle', { 'class': 'dot' + (spec.y ? '' : ' c'), r: 7 }, g);
      el.style.opacity = '0'; g.style.opacity = '0';
      var key = spec.view + ':' + spec.a + ':' + spec.t0.toFixed(2);
      var o = (LOFF[V ? 'v' : 'h'] || {})[key] || (V ? spec.ov : spec.o) || spec.o || [120, -80];
      var L = { key: key, s: spec, el: el, bx: bx, vl: vl, g: g, path: path, ring: ring, dot: dot, dx: o[0], dy: o[1], w: 0, hh: 0, lastV: null, on: false };
      LABELS.push(L);
      return L;
    }

    /* ================================================================
       ESCENA 1 — APERTURA (0–6 s)
       ================================================================ */
    var s1 = $('s1');
    var s1in = hx('div', 's1-stage', s1);
    // trazos de corriente que cruzan el fondo
    var STR = V ? [
      ['mezcla', 'M-120 1500 C 200 1380, 420 1660, 700 1460 S 1000 1300, 1200 1380'],
      ['gas', 'M-120 330 C 180 420, 520 250, 760 340 S 1060 430, 1200 360'],
      ['liquido', 'M-120 1660 C 260 1600, 560 1760, 820 1640 S 1080 1580, 1200 1640']
    ] : [
      ['mezcla', 'M-120 900 C 360 820, 720 1010, 1120 880 S 1700 780, 2040 850'],
      ['gas', 'M-120 120 C 300 40, 760 150, 1160 70 S 1720 20, 2040 110'],
      ['liquido', 'M-120 990 C 480 930, 920 1060, 1420 950 S 1800 900, 2040 1000']
    ];
    var STRC = { mezcla: [COL.mezclaClaro, COL.mezcla], gas: [COL.gas, COL.amarillo], liquido: [COL.liquidoAmbar, COL.liquido] };
    var strSvg = sv('svg', { 'class': 's1-streams', viewBox: '0 0 ' + W + ' ' + H, 'data-layout-allow-overflow': '', 'aria-hidden': 'true' }, s1in);
    STR.forEach(function (sd, i) {
      var c = STRC[sd[0]];
      var g1 = sv('path', { d: sd[1], pathLength: 1, stroke: c[0], 'stroke-width': 22, opacity: 0.16, 'stroke-dasharray': '1 1' }, strSvg);
      var g2 = sv('path', { d: sd[1], pathLength: 1, stroke: c[0], 'stroke-width': 5, 'stroke-dasharray': '1 1' }, strSvg);
      var g3 = sv('path', { d: sd[1], pathLength: 1, stroke: '#ffffff', 'stroke-width': 7, opacity: 0.85, 'stroke-dasharray': '0.004 0.046' }, strSvg);
      init([g1, g2], { strokeDashoffset: 1 });
      init(g3, { strokeDashoffset: 0, autoAlpha: 0 });
      var a = 0.25 + i * 0.22;
      tl.to([g1, g2], { strokeDashoffset: 0, duration: 1.9, ease: 'power2.inOut' }, a);
      ft(g3, { autoAlpha: 0 }, { autoAlpha: 0.85, duration: 0.6 }, a + 1.2);
      ft(g3, { strokeDashoffset: 0 }, { strokeDashoffset: -0.5, duration: 5.4 - a, ease: 'none' }, a + 0.6);
    });
    init(strSvg, { autoAlpha: 1, scale: 1, transformOrigin: '50% 50%' });

    // logotipo: hexágono que se dibuja, monograma que se revela, wordmark que entra
    var mark = hx('div', 's1-mark', s1in);
    var MK = V ? { x: 120, y: 528, w: 840, h: 224 } : { x: 600, y: 204, w: 720, h: 192 };
    mark.style.position = 'absolute'; mark.style.left = px(MK.x); mark.style.top = px(MK.y);
    var imA = hx('img', '', mark); imA.src = LOGO; imA.alt = '';
    var imB = hx('img', '', mark); imB.src = LOGO; imB.alt = D.empresa.nombre;
    var hexSvg = sv('svg', { viewBox: '0 0 360 96' }, mark);
    var hexP = sv('path', { d: 'M48 4 86 26v44L48 92 10 70V26Z', fill: 'none', stroke: COL.amarillo, 'stroke-width': 3, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-linejoin': 'round' }, hexSvg);
    var hexG = sv('path', { d: 'M48 4 86 26v44L48 92 10 70V26Z', fill: 'none', stroke: COL.celeste, 'stroke-width': 9, opacity: 0.35, pathLength: 1, 'stroke-dasharray': '1 1' }, hexSvg);
    init([hexP, hexG], { strokeDashoffset: 1 });
    init(hexSvg, { autoAlpha: 1 });
    init(imA, { clipPath: 'circle(0% at 13.3% 50%)' });
    init(imB, { clipPath: 'inset(0% 100% 0% 24%)' });
    tl.to([hexP, hexG], { strokeDashoffset: 0, duration: 0.95, ease: 'power2.inOut' }, 0.35);
    ft(imA, { clipPath: 'circle(0% at 13.3% 50%)' }, { clipPath: 'circle(20% at 13.3% 50%)', duration: 0.6, ease: 'power3.out' }, 1.05);
    ft(imB, { clipPath: 'inset(0% 100% 0% 24%)' }, { clipPath: 'inset(0% 0% 0% 24%)', duration: 0.75, ease: 'power3.inOut' }, 1.45);
    ft(hexSvg, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5 }, 1.7);
    init(mark, { x: 0, y: 0, scale: 1, transformOrigin: '50% 50%' });

    // títulos
    var tx = hx('div', '', s1in);
    tx.style.position = 'absolute'; tx.style.left = '0'; tx.style.right = '0'; tx.style.top = px(V ? 800 : 440);
    tx.style.display = 'flex'; tx.style.flexDirection = 'column'; tx.style.alignItems = 'center';
    var t1 = hx('div', 's1-t1', tx);
    var chars = [];
    String(D.empresa.servicio).split('').forEach(function (ch) {
      var s = hx('span', 's1-ch', t1, ch === ' ' ? '&nbsp;' : esc(ch)); chars.push(s);
    });
    t1.style.perspective = '900px';
    var t2 = hx('div', 's1-t2', tx, esc(D.empresa.servicioEs));
    var rule = hx('div', 's1-rule', tx);
    var sub = hx('div', 's1-sub', tx, '<span class="a">' + esc(cap(D.separador.tipo.split(' (')[0].toLowerCase())) + ' de circuito cerrado</span><span class="b"> · </span><span class="c">Medición de ' + D.medicion.horasMedicion + ' h</span>');
    init(chars, { autoAlpha: 0, y: 70, rotationX: -80, transformOrigin: '50% 100%' });
    ft(chars, { autoAlpha: 0, y: 70, rotationX: -80 }, { autoAlpha: 1, y: 0, rotationX: 0, duration: 0.7, ease: 'power4.out', stagger: 0.035 }, 1.9);
    init(t2, { autoAlpha: 0, letterSpacing: '0.42em' });
    ft(t2, { autoAlpha: 0, letterSpacing: '0.42em' }, { autoAlpha: 1, letterSpacing: '0.04em', duration: 0.9, ease: 'expo.out' }, 2.45);
    init(rule, { scaleX: 0 });
    ft(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power3.inOut' }, 2.8);
    init(sub, { autoAlpha: 0, y: 18 });
    ft(sub, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' }, 3.05);
    init(tx, { scale: 1, autoAlpha: 1, transformOrigin: '50% 30%' });
    // ambiente: empuje lento
    init(s1in, { scale: 1, transformOrigin: '50% 45%' });
    ft(s1in, { scale: 1 }, { scale: 1.035, duration: 4.6, ease: 'sine.inOut' }, 0.3);
    ft(ghost, { autoAlpha: 0, x: 60 }, { autoAlpha: 1, x: -40, duration: 5, ease: 'none' }, 0.1);
    ft(ghost, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.6 }, 4.9);

    // salida: zoom a través + iris hacia la escena 3D; el logo vuela a la esquina
    ft(tx, { scale: 1, autoAlpha: 1 }, { scale: 1.9, autoAlpha: 0, duration: 0.75, ease: 'power2.in' }, 5.0);
    ft(strSvg, { scale: 1, autoAlpha: 1 }, { scale: 1.6, autoAlpha: 0, duration: 0.8, ease: 'power2.in' }, 4.95);
    var fl = { x: LG.corner.cx - (MK.x + MK.w / 2), y: LG.corner.cy - (MK.y + MK.h / 2), s: LG.corner.w / MK.w };
    ft(mark, { x: 0, y: 0, scale: 1 }, { x: fl.x, y: fl.y, scale: fl.s, duration: 0.85, ease: 'power3.inOut' }, 4.95);
    ft(cornerLogo, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, 5.8);
    ft(mark, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.05 }, 5.82);
    init(mark, { autoAlpha: 1 });
    // iris
    init(glWrap, { autoAlpha: 0, clipPath: 'circle(0% at 50% 50%)' });
    ft(glWrap, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 4.98);
    ft(glWrap, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: 1.0, ease: 'power3.inOut' }, 5.0);
    ft(glWrap, { clipPath: 'circle(75% at 50% 50%)' }, { clipPath: 'none', duration: 0.01 }, 6.02);
    var iris = hx('div', 'f-iris', fx);
    init(iris, { autoAlpha: 0, scale: 0 });
    ft(iris, { autoAlpha: 0, scale: 0 }, { autoAlpha: 1, scale: (V ? 6 : 6.2), duration: 1.0, ease: 'power3.inOut' }, 5.0);
    ft(iris, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.25 }, 5.8);
    init(bg, { autoAlpha: 1 });
    ft(bg, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 5.8);

    var flash = hx('div', 'flash', fx), vig = hx('div', 'vig', fx);
    init(flash, { autoAlpha: 0 });
    init(vig, { autoAlpha: 0 });
    fadeIn(vig, 5.6, 0.8);
    function flashAt(t, k) { ft(flash, { autoAlpha: 0 }, { autoAlpha: k || 0.8, duration: 0.12, ease: 'power1.out' }, t); ft(flash, { autoAlpha: k || 0.8 }, { autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, t + 0.12); }

    /* ================================================================
       ESCENA 2 — LOCACIÓN (6–15 s)
       ================================================================ */
    var s2 = $('s2');
    chapter(s2, '01', 'Locación', 'Macropera · distribución de equipos de aforo', 6.15, 15.05);
    var LOC = [
      ['arbol', eqp('arbol').nombre, [-250, -110], [-60, -170]],
      ['manifold', eqp('manifold').nombre, [-300, 70], [-150, 150]],
      ['lineaEntrada', 'Líneas temporales', [-120, 150], [-40, 250]],
      ['separador', 'Separador ' + TAG, [190, 130], [140, 190], true],
      ['rtu', corto('rtu'), [210, -120], [120, -210]],
      ['caseta', 'Caseta · PC de medición', [180, 70], [-40, 170]],
      ['zonaSeguridad', 'Zona de seguridad', [-330, 140], [-120, 330]],
      ['acceso', 'Ruta de acceso', [60, 110], [-220, 120]],
      ['lineaBateria', eqp('lineaBateria').nombre, [140, -110], [-80, -140]]
    ];
    LOC.forEach(function (r, i) {
      var t0 = 11.9 + i * 0.2;
      label({ view: '3d', a: r[0], t0: t0, t1: 15.0, nm: r[1], o: r[2], ov: r[3], y: !!r[4] });
    });

    /* ================================================================
       ESCENA 3 — POZO Y ESTRANGULADOR (15–24 s)
       ================================================================ */
    var s3s = $('s3');
    chapter(s3s, '02', 'Pozo', eqp('arbol').nombre + ' · ' + corto('estrangulador') + ' · cabezal', 15.15, 24.05);
    label({ view: '3d', a: 'arbol', t0: 17.0, t1: 19.5, nm: eqp('arbol').nombre, ds: 'Salida por TP o TR', o: [-420, -150], ov: [-120, -330] });
    label({ view: '3d', a: 'TDP', t0: 17.9, t1: 21.5, tg: 'TDP', nm: ins('TDP').variable, val: 'pPozo', dec: 1, u: ins('TDP').unidad, y: true, o: [170, -190], ov: [-60, -300] });
    label({ view: '3d', a: 'estrangulador', t0: 19.7, t1: 22.0, nm: corto('estrangulador'), o: [-380, -140], ov: [-60, -280] });
    label({ view: '3d', a: 'manifold', t0: 22.0, t1: 24.2, nm: eqp('manifold').nombre, o: [-360, -170], ov: [-80, -300] });
    var CARD = V ? { x: 64, y: 1236, w: 952 } : { x: 1300, y: 300, w: 540 };
    function infoCard(scene, ey, ttl, txt, t0, t1) {
      var c = hx('div', 'f-card', scene, '<span class="ey">' + esc(ey) + '</span><span class="ct">' + esc(ttl) + '</span><span class="cx">' + esc(txt) + '</span>');
      c.style.left = px(CARD.x); c.style.top = px(CARD.y); c.style.width = px(CARD.w);
      init(c, { autoAlpha: 0, x: V ? 0 : 60, y: V ? 40 : 0 });
      ft(c, { autoAlpha: 0, x: V ? 0 : 60, y: V ? 40 : 0 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.55, ease: 'power3.out' }, t0);
      ft(c, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, t1 - 0.3);
      return c;
    }
    infoCard(s3s, 'Control del pozo', corto('estrangulador'), eqp('estrangulador').desc, 19.8, 22.0);
    infoCard(s3s, 'Alineación', eqp('manifold').nombre, eqp('manifold').desc, 22.1, 24.1);

    /* ================================================================
       ESCENA 4 — LÍNEA DE ENTRADA (24–31 s)
       ================================================================ */
    var s4 = $('s4');
    chapter(s4, '', eqp('lineaEntrada').nombre, 'Mezcla multifásica: aceite + agua + gas', 24.15, 31.05);
    label({ view: '3d', a: 'lineaEntrada', t0: 25.0, t1: 28.8, nm: eqp('lineaEntrada').nombre, ds: 'Línea temporal · Ø ' + D.lineas.diametroNominal, o: [-200, -170], ov: [-120, -260] });
    label({ view: '3d', a: 'deflector', t0: 28.9, t1: 31.3, nm: 'Entrada al separador ' + TAG, y: true, o: [-260, -190], ov: [-100, -300] });
    infoCard(s4, 'Corriente de entrada', 'Mezcla multifásica', eqp('lineaEntrada').desc, 25.4, 30.9);

    /* ================================================================
       ESCENA 5 — SEPARACIÓN (31–52 s)
       ================================================================ */
    var s5 = $('s5');
    chapter(s5, '03', 'Separación', 'Separador bifásico horizontal · gas / líquido', 31.15, 52.05);
    // tarjeta de equipo con rombo NFPA
    var SEPD = D.separador, NF = SEPD.nfpa || {};
    var spec = hx('div', 'f-card', s5,
      '<span class="ey">Equipo de prueba</span>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:20px">' +
      '<span class="ct" style="font-size:' + (V ? 64 : 60) + 'px"><span style="color:' + COL.amarillo + '">' + esc(TAG) + '</span></span>' +
      '<div class="nfpa"><i class="f"><span>' + NF.inflamabilidad + '</span></i><i class="h"><span>' + NF.salud + '</span></i><i class="r"><span>' + NF.reactividad + '</span></i><i class="e"><span></span></i></div></div>' +
      '<span class="cx" style="margin-top:4px;color:#fff;font-weight:600">' + esc(SEPD.tipo) + '</span>' +
      '<div class="row"><span class="k">Orientación</span>' + esc(SEPD.orientacion) + '</div>' +
      '<div class="row"><span class="k">Montaje</span>' + esc(SEPD.montaje) + '</div>' +
      '<div class="row"><span class="k">Servicio</span>' + esc(SEPD.servicio) + '</div>');
    var SPEC = V ? { x: 64, y: 1150, w: 952 } : { x: 80, y: 300, w: 560 };
    spec.style.left = px(SPEC.x); spec.style.top = px(SPEC.y); spec.style.width = px(SPEC.w);
    init(spec, { autoAlpha: 0, x: V ? 0 : -60, y: V ? 40 : 0 });
    ft(spec, { autoAlpha: 0, x: V ? 0 : -60, y: V ? 40 : 0 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.6, ease: 'power3.out' }, 31.7);
    ft(spec, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.35, ease: 'power2.in' }, 34.3);
    var INT = {}; (SEPD.internos || []).forEach(function (x) { INT[x.id] = x; });
    label({ view: '3d', a: 'deflector', t0: 33.3, t1: 34.7, nm: INT.deflector ? INT.deflector.nombre : 'Deflector', o: [-200, -240], ov: [-60, -300] });
    label({ view: '3d', a: 'extractor', t0: 33.55, t1: 34.7, nm: INT.extractor ? INT.extractor.nombre : 'Extractor de niebla', o: [160, -250], ov: [40, -360] });
    label({ view: '3d', a: 'nivel', t0: 33.8, t1: 34.7, nm: 'Nivel de líquido', o: [180, 150], ov: [60, 260] });

    // transición 3D → corte (zoom a través)
    init(cutWrap, { autoAlpha: 0, scale: 1.18, transformOrigin: '50% 50%' });
    ft(cutWrap, { autoAlpha: 0, scale: 1.18 }, { autoAlpha: 1, scale: 1, duration: 0.85, ease: 'power3.out' }, 34.9);
    ft(glWrap, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5, ease: 'power1.in' }, 35.1);
    flashAt(34.95, 0.55);

    // tarjeta de pasos
    var STEP = V ? { x: 64, y: 396, w: 952 } : { x: 80, y: 292, w: 560 };
    var stepBox = hx('div', '', s5); stepBox.style.position = 'absolute'; stepBox.style.left = px(STEP.x); stepBox.style.top = px(STEP.y); stepBox.style.width = px(STEP.w);
    var stepPlate = hx('div', 'f-card', stepBox); stepPlate.style.position = 'absolute'; stepPlate.style.left = '0'; stepPlate.style.top = '0'; stepPlate.style.width = '100%'; stepPlate.style.height = px(V ? 360 : 470);
    var bar = hx('div', 'f-steps-bar', stepBox); bar.style.left = '30px'; bar.style.right = '30px'; bar.style.top = px(V ? 326 : 434);
    var barI = [];
    for (var b = 0; b < 6; b++) { var bi = hx('i', '', bar); barI.push(hx('em', '', bi)); }
    init(stepBox, { autoAlpha: 0, x: V ? 0 : -50, y: V ? -30 : 0 });
    ft(stepBox, { autoAlpha: 0, x: V ? 0 : -50, y: V ? -30 : 0 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.6, ease: 'power3.out' }, STEP_T[0] - 0.2);
    ft(stepBox, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 51.7);
    var PASOS = D.pasosSeparacion;
    PASOS.forEach(function (p, i) {
      var st = hx('div', 'f-step', stepBox,
        '<div class="pn"><b>' + p.n + '</b><span>Paso ' + p.n + ' de ' + PASOS.length + '</span></div>' +
        '<span class="st">' + esc(p.titulo) + '</span><span class="sx">' + esc(p.texto) + '</span>');
      st.style.left = '30px'; st.style.top = '28px'; st.style.width = px(STEP.w - 60);
      var a = STEP_T[i], z = STEP_T[i + 1];
      init(st, { autoAlpha: 0, y: 24 });
      ft(st, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, a + 0.05);
      if (i < PASOS.length - 1) ft(st, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -16, duration: 0.25, ease: 'power2.in' }, z - 0.22);
      init(barI[i], { scaleX: 0 });
      ft(barI[i], { scaleX: 0 }, { scaleX: 1, duration: z - a, ease: 'none' }, a);
    });
    // etiquetas sobre el corte (anclas de WT.Cutaway)
    var CL = [
      [0, 'deflector', '', INT.deflector ? INT.deflector.nombre : 'Deflector', [-60, -230], [-80, -260]],
      [3, 'extractor', '', INT.extractor ? INT.extractor.nombre : 'Extractor de niebla', [-120, -250], [-140, -300]],
      [4, 'TN', 'TN', 'Nivel', [-150, -150], [-100, -200]],
      [4, 'CORIOLIS', 'CORIOLIS', 'Promass 300', [-300, -40], [-180, -120]],
      [4, 'LV', 'LV', 'Control de nivel', [120, 110], [-40, 140]],
      [5, 'placa', 'TDG', 'Placa de orificio', [-330, -110], [-160, -180]],
      [5, 'PV', 'PV', 'Contrapresión', [140, -150], [40, -200]]
    ];
    CL.forEach(function (r, i) {
      var a = STEP_T[r[0]];
      label({ view: 'cut', a: r[1], t0: a + 0.45 + (i % 3) * 0.22, t1: Math.min(STEP_T[r[0] + 1] - 0.15, 51.25), tg: r[2], tgc: r[2] === 'TN' || r[2] === 'CORIOLIS' || r[2] === 'TDG', nm: r[3], o: r[4], ov: r[5], y: !r[2] });
    });

    /* ================================================================
       ESCENA 6 — MEDICIÓN (52–64 s): pantalla dividida
       ================================================================ */
    var s6 = $('s6');
    chapter(s6, '04', 'Medición', 'Cada fase se mide por separado', 52.15, 64.05, 1.0);
    // salida del corte: se cierra hacia la línea divisoria
    ft(cutWrap, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: V ? 'inset(50% 0% 50% 0%)' : 'inset(0% 50% 0% 50%)', duration: 0.7, ease: 'power3.inOut' }, 51.55);
    ft(cutWrap, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.01 }, 52.3);
    init(cutWrap, { clipPath: 'inset(0% 0% 0% 0%)' });
    ft(glWrap, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 51.55);
    var div = hx('div', 'f-split-div', s6);
    init(div, V ? { scaleX: 0 } : { scaleY: 0 });
    ft(div, V ? { scaleX: 0 } : { scaleY: 0 }, V ? { scaleX: 1, duration: 0.6, ease: 'power3.inOut' } : { scaleY: 1, duration: 0.6, ease: 'power3.inOut' }, 51.6);
    ft(div, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.4 }, 63.3);
    var cor = eqp('coriolis'), plc = eqp('placa');
    var HALF = V
      ? { L: { x: 64, y: 346 }, R: { x: 64, y: 984 }, KL: { x: 64, y: 784 }, KR: { x: 64, y: 1486 } }
      : { L: { x: 80, y: 250 }, R: { x: 1040, y: 250 }, KL: { x: 80, y: 760 }, KR: { x: 1040, y: 760 } };
    function halfHead(pos, sw, ttl, chain, t0) {
      var hd = hx('div', 'f-half-h', s6, '<div class="hh"><i class="sw ' + sw + '"></i>' + esc(ttl) + '</div><div class="chain">' + chain + '</div>');
      hd.style.left = px(pos.x); hd.style.top = px(pos.y);
      hd.querySelector('.sw').style.background = sw === 'gas' ? COL.gas : 'linear-gradient(90deg,' + COL.liquido + ' 0 50%,' + COL.liquidoAmbar + ' 50% 100%)';
      init(hd, { autoAlpha: 0, x: -40 });
      ft(hd, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.55, ease: 'power3.out' }, t0);
      ft(hd, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 63.4);
    }
    var ar = ' <span class="ar">→</span> ';
    if (V) HALF.L.y = 420;
    halfHead(HALF.L, 'liquido', 'Líquido · aceite + agua', 'Separador' + ar + '<span class="hl">' + esc(cor.corto || cor.nombre) + '</span>' + ar + '<span class="hl">LV</span>', 53.35);
    halfHead(HALF.R, 'gas', 'Gas', 'Separador' + ar + '<span class="hl">' + esc(plc.corto || plc.nombre) + ' + TDG</span>' + ar + '<span class="hl">PV</span>', 54.2);
    var COUNTERS = [];
    if (V) {
      // 9:16: durante la pantalla dividida la leyenda cede su lugar a la nota de valores simulados
      ft(legend, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 51.7);
      ft(legend, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 63.6);
      var sim6 = hx('div', 'f-sim', s6, '<b>●</b> ' + esc(D.demo.aviso));
      sim6.style.right = '64px'; sim6.style.top = '360px';
      init(sim6, { autoAlpha: 0 }); fadeIn(sim6, 52.6, 0.4); fadeOut(sim6, 63.4, 0.3);
    }
    function kpis(pos, cls, list, t0) {
      var box = hx('div', 'f-kpis', s6); box.style.left = px(pos.x); box.style.top = px(pos.y);
      list.forEach(function (k, i) {
        var c = hx('div', 'f-kpi ' + cls, box, '<span class="kk">' + esc(k[1]) + '</span><span class="kv">0</span><span class="ku">' + esc(k[2]) + '</span>');
        if (V) c.style.width = '296px';
        init(c, { autoAlpha: 0, y: 30, scale: 0.94 });
        ft(c, { autoAlpha: 0, y: 30, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)' }, t0 + i * 0.12);
        ft(c, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 63.35);
        COUNTERS.push({ el: c.querySelector('.kv'), key: k[0], dec: k[3], t0: t0 + i * 0.12 + 0.1, dur: 1.4, h0: 9.2, rate: 0.06, w0: t0 - 0.5, w1: 64.2 });
      });
    }
    kpis(HALF.KL, 'l', [['masico', 'Flujo másico', 'kg/h', 0], ['densidad', 'Densidad', 'kg/m³', 1], ['pctAgua', '% agua', '% en volumen', 1]], 53.5);
    kpis(HALF.KR, 'g', [['dpGas', 'Presión diferencial', 'inH₂O · TDG', 1], ['qGas', 'Q gas', 'MMpcd', 3], ['pSep', 'Presión separador', 'kg/cm² · TPS', 2]], 54.6);
    label({ view: 'L', a: 'CORIOLIS', t0: 53.2, t1: 63.3, tg: 'CORIOLIS', tgc: true, nm: 'Promass 300', o: [-60, -150], ov: [-120, -140] });
    label({ view: 'L', a: 'LV', t0: 53.6, t1: 63.3, tg: 'LV', nm: vc('LV').nombre.replace('Válvula de control', 'Control'), o: [60, -120], ov: [80, -110] });
    label({ view: 'R', a: 'placa', t0: 54.3, t1: 63.3, nm: plc.corto || 'Placa de orificio', y: true, o: [-100, 120], ov: [-140, 120] });
    label({ view: 'R', a: 'TDG', t0: 54.6, t1: 63.3, tg: 'TDG', tgc: true, nm: 'Presión diferencial', o: [-60, -140], ov: [-120, -130] });
    label({ view: 'R', a: 'PV', t0: 54.9, t1: 63.3, tg: 'PV', nm: 'Contrapresión', o: [60, -120], ov: [80, -110] });

    /* ================================================================
       ESCENA 7 — CIRCUITO CERRADO (64–71 s)
       ================================================================ */
    var s7 = $('s7');
    chapter(s7, '', 'Circuito cerrado', 'Gas y líquido medidos se reincorporan hacia batería', 64.15, 71.05);
    var badge = hx('div', 'f-badge', s7,
      '<svg viewBox="0 0 96 96"><g fill="none" stroke="' + COL.amarillo + '" stroke-width="7" stroke-linecap="round">' +
      '<path d="M78 40A32 32 0 0 0 22 30"/><path d="M18 56A32 32 0 0 0 74 66"/></g>' +
      '<path d="M14 18 30 34 10 38Z" fill="' + COL.amarillo + '"/><path d="M82 78 66 62 86 58Z" fill="' + COL.amarillo + '"/>' +
      '<circle cx="48" cy="48" r="9" fill="' + COL.celeste + '"/></svg>' +
      '<div><span class="bt">Circuito cerrado</span><span class="bs">No se ventea · no se quema</span></div>');
    var BG = V ? { x: 64, y: 1290 } : { x: 1150, y: 300 };
    badge.style.left = px(BG.x); badge.style.top = px(BG.y);
    var bIcon = badge.querySelector('svg');
    init(badge, { autoAlpha: 0, scale: 0.6, transformOrigin: '50% 50%' });
    ft(badge, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'back.out(2.2)' }, 64.9);
    ft(badge, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 70.7);
    init(bIcon, { rotation: 0, transformOrigin: '50% 50%' });
    ft(bIcon, { rotation: 0 }, { rotation: 360, duration: 5.8, ease: 'none' }, 64.9);
    label({ view: '3d', a: 'recombinacion', t0: 64.6, t1: 67.6, nm: eqp('recombinacion').nombre, y: true, o: [-320, -150], ov: [-100, -260] });
    label({ view: '3d', a: 'TDM', t0: 65.5, t1: 68.4, tg: 'TDM', tgc: true, nm: 'Línea de salida', val: 'pSalida', dec: 2, u: 'kg/cm²', o: [150, -170], ov: [-60, -330] });
    label({ view: '3d', a: 'TPL', t0: 67.9, t1: 71.1, tg: 'TPL', tgc: true, nm: 'Línea a batería', val: 'pBateria', dec: 2, u: 'kg/cm²', o: [-360, -160], ov: [-80, -300] });
    label({ view: '3d', a: 'lineaBateria', t0: 68.6, t1: 71.1, nm: 'A batería →', ds: eqp('lineaBateria').desc, o: [80, 120], ov: [-300, 160] });

    /* ================================================================
       ESCENA 8 — MONITOREO (71–83 s)
       ================================================================ */
    var s8 = $('s8');
    chapter(s8, '05', 'Monitoreo', 'Instrumentos → ' + corto('rtu') + ' → ' + corto('scada'), 71.15, 83.05);
    label({ view: '3d', a: 'rtu', t0: 72.3, t1: 74.25, nm: D.rtu.modelo, ds: 'Concentra las 8 señales 4–20 mA HART', y: true, o: [120, -170], ov: [-200, -260] });
    label({ view: '3d', a: 'scada', t0: 72.8, t1: 74.25, nm: corto('scada'), ds: 'PC de campo en la caseta', o: [80, -230], ov: [-280, -220] });
    var SIG = ['TDP', 'TPS', 'TT', 'TN', 'CORIOLIS', 'TDG', 'TDM', 'TPL'];
    var sigG = sv('g', null, lead); sigG.style.opacity = '0';
    var SIGP = SIG.map(function () {
      var p = sv('path', { 'class': 'sg' }, sigG);
      var d1 = sv('circle', { 'class': 'sgd', r: 7 }, sigG), d2 = sv('circle', { 'class': 'sgd', r: 5 }, sigG);
      var tgx = sv('text', { 'font-family': 'JetBrains Mono', 'font-weight': 700, 'font-size': V ? 24 : 22, fill: '#ffffff', stroke: '#061631', 'stroke-width': 6, 'paint-order': 'stroke' }, sigG);
      return { p: p, d1: d1, d2: d2, tx: tgx };
    });
    SIG.forEach(function (tg, i) { SIGP[i].tx.textContent = tg; });

    // 3D → SCADA (zoom a través)
    init(scadaWrap, { autoAlpha: 0 });
    init(mon, { scale: 0.42, y: 120, rotationY: 0, transformPerspective: 1600, transformOrigin: '50% 50%' });
    ft(scadaWrap, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.out' }, 74.55);
    ft(mon, { scale: 0.42, y: 120, rotationY: 0 }, { scale: 1, y: 0, rotationY: V ? 0 : 7, duration: 0.95, ease: 'power3.out' }, 74.55);
    ft(glWrap, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5 }, 74.8);
    init(bg, { autoAlpha: 1 });
    ft(bg, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 74.4);
    flashAt(74.6, 0.45);
    // panel de lectura grande
    var HUDP = V ? { x: 64, y: 1000, w: 952 } : { x: 1340, y: 262, w: 500 };
    var hp = hx('div', 'f-hudp', s8); hp.style.left = px(HUDP.x); hp.style.top = px(HUDP.y); hp.style.width = px(HUDP.w);
    var stE = hx('div', 'f-state', hp, '<i></i><div><small>Estado de la medición</small><span></span></div>');
    var clk = hx('div', 'f-clock', hp, '<small>Reloj de medición · ' + D.medicion.horasMedicion + ' h</small><span class="hms"></span><div class="bar"><em></em></div>');
    var tots = hx('div', 'f-tots', hp);
    var TOT = [
      ['acumMezcla', 'Q mezcla', 'bls', 1, 'linear-gradient(90deg,' + COL.liquido + ' 0 50%,' + COL.liquidoAmbar + ' 50% 100%)'],
      ['acumAceite', 'Q aceite', 'bls', 1, COL.liquidoAmbar],
      ['acumAgua', 'Q agua', 'bls', 1, COL.agua || WT.SCADA.colorAgua],
      ['acumGas', 'Q gas', 'MMpc', 3, COL.gas]
    ].map(function (r) {
      var e = hx('div', 'f-tot', tots, '<span class="tk"><i style="background:' + r[4] + '"></i>' + esc(r[1]) + '</span><span class="tv"></span>');
      return { el: e.querySelector('.tv'), k: r[0], u: r[2], d: r[3] };
    });
    [stE, clk, tots].forEach(function (e, i) {
      init(e, { autoAlpha: 0, x: V ? 0 : 50, y: V ? 30 : 0 });
      ft(e, { autoAlpha: 0, x: V ? 0 : 50, y: V ? 30 : 0 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.55, ease: 'power3.out' }, 75.3 + i * 0.15);
    });
    init(hp, { autoAlpha: 1 });
    ft(hp, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.4 }, 82.7);
    var stSpan = stE.querySelector('span'), hmsEl = clk.querySelector('.hms'), barEm = clk.querySelector('.bar em');

    /* ================================================================
       ESCENA 9 — DTI Y CIERRE (83–90 s)
       ================================================================ */
    var s9 = $('s9');
    init(pidWrap, { autoAlpha: 0 });
    init(sheet, { scale: 0.9, y: 60, rotationX: 22, transformPerspective: 1800, transformOrigin: '50% 100%', filter: 'blur(0px)' });
    ft(scadaWrap, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5, ease: 'power1.in' }, 82.7);
    ft(mon, { scale: 1 }, { scale: 0.92, duration: 0.6, ease: 'power2.in' }, 82.6);
    ft(pidWrap, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 82.75);
    ft(sheet, { scale: 0.9, y: 60, rotationX: 22 }, { scale: 1, y: 0, rotationX: 0, duration: 1.1, ease: 'power3.out' }, 82.75);
    ft(sheet, { scale: 1 }, { scale: 1.04, duration: 3.0, ease: 'sine.inOut' }, 83.85);
    var cap = hx('div', 'f-dti-cap', s9, '<b>DTI simplificado</b><span>Simbología ISA · Documento ilustrativo · sin escala</span>');
    if (V) { cap.style.left = '64px'; cap.style.top = px(1560); cap.style.flexDirection = 'column'; cap.style.alignItems = 'flex-start'; cap.style.gap = '4px'; }
    else { cap.style.left = '50%'; cap.style.top = '930px'; cap.style.transform = 'translateX(-50%)'; }
    init(cap, { autoAlpha: 0 });
    fadeIn(cap, 83.3, 0.5);
    fadeOut(cap, 86.4, 0.3);
    // cierre
    ft(sheet, { filter: 'blur(0px)' }, { filter: 'blur(7px)', duration: 0.8, ease: 'power2.inOut' }, 86.5);
    ft(pidWrap, { autoAlpha: 1 }, { autoAlpha: 0.16, duration: 0.8, ease: 'power2.inOut' }, 86.5);
    var close = hx('div', 'f-close', s9);
    var clLogo = hx('img', 'cl-logo', close); clLogo.src = LOGO; clLogo.alt = D.empresa.nombre;
    clLogo.style.position = 'absolute'; clLogo.style.left = px(LG.close.cx - LG.close.w / 2); clLogo.style.top = px(LG.close.cy - LG.close.w * 96 / 360 / 2);
    var clTxt = hx('div', '', close);
    clTxt.style.position = 'absolute'; clTxt.style.left = '0'; clTxt.style.right = '0'; clTxt.style.top = px(LG.close.cy + LG.close.w * 96 / 360 / 2 + (V ? 30 : 10));
    clTxt.style.display = 'flex'; clTxt.style.flexDirection = 'column'; clTxt.style.alignItems = 'center';
    var clT = hx('div', 'cl-t', clTxt, esc(D.empresa.nombre) + ' · <span>' + esc(D.empresa.servicio) + '</span>');
    var clA = hx('div', 'cl-attrs', clTxt);
    var ICON = {
      reloj: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="' + COL.amarillo + '" stroke-width="4"/><path d="M20 10v11l7 5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
      lazo: '<svg viewBox="0 0 40 40"><path d="M32 17A13 13 0 0 0 9 13M8 24a13 13 0 0 0 23 4" fill="none" stroke="' + COL.amarillo + '" stroke-width="4" stroke-linecap="round"/><path d="M5 6l7 7-9 2zM35 34l-7-7 9-2z" fill="' + COL.amarillo + '"/></svg>',
      scada: '<svg viewBox="0 0 40 40"><rect x="4" y="7" width="32" height="21" rx="3" fill="none" stroke="' + COL.celeste + '" stroke-width="4"/><path d="M14 34h12M20 28v6" stroke="' + COL.celeste + '" stroke-width="4" stroke-linecap="round"/><path d="M9 22l6-6 5 4 7-8" fill="none" stroke="' + COL.amarillo + '" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };
    var attrs = [['reloj', 'Medición en sitio ' + D.medicion.horasMedicion + ' h'], ['lazo', 'Circuito cerrado'], ['scada', 'Monitoreo SCADA']].map(function (a) {
      return hx('div', 'cl-a', clA, ICON[a[0]] + '<span>' + esc(a[1]) + '</span>');
    });
    var clL = hx('div', 'cl-lema', clTxt, esc(D.empresa.lema));
    // el logo de la esquina vuela al centro
    var fc = { x: LG.close.cx - LG.corner.cx, y: LG.close.cy - LG.corner.cy, s: LG.close.w / LG.corner.w };
    init(cornerLogo, { x: 0, y: 0, scale: 1, transformOrigin: '50% 50%' });
    ft(cornerLogo, { x: 0, y: 0, scale: 1 }, { x: fc.x, y: fc.y, scale: fc.s, duration: 0.9, ease: 'power3.inOut' }, 86.55);
    init(clLogo, { autoAlpha: 0 });
    ft(clLogo, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, 87.45);
    ft(cornerLogo, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.05 }, 87.47);
    init(clT, { autoAlpha: 0, y: 30 });
    ft(clT, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 87.3);
    attrs.forEach(function (a, i) {
      init(a, { autoAlpha: 0, y: 24, scale: 0.92 });
      ft(a, { autoAlpha: 0, y: 24, scale: 0.92 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.8)' }, 87.65 + i * 0.16);
    });
    init(clL, { autoAlpha: 0 });
    ft(clL, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power1.out' }, 88.25);
    ft(ghost, { autoAlpha: 0, x: -40 }, { autoAlpha: 0.8, x: 20, duration: 3.4, ease: 'none' }, 86.6);

    // viñeta solo sobre la parte 3D / corte / SCADA
    ft(vig, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5 }, 82.6);

    /* ================================================================
       CÁMARA 3D (función pura de t)
       Todas las poses se ajustan aquí a la relación de aspecto de la vista
       (fitK) y se pasan con ajusteVertical:false: así el encuadre vertical
       y las mitades de la pantalla dividida quedan bajo control del video.
       ================================================================ */
    var SH = s3.shots, A3 = s3.anchors;
    function P(pos, tgt, fov) { return { pos: pos, target: tgt, fov: fov || 40 }; }
    function push(p, f, fov) {
      var q = { pos: [0, 0, 0], target: p.target.slice(), fov: fov || p.fov };
      for (var i = 0; i < 3; i++) q.pos[i] = p.target[i] + (p.pos[i] - p.target[i]) * f;
      return q;
    }
    function orbit(p, da, de) {
      var dx = p.pos[0] - p.target[0], dy = p.pos[1] - p.target[1], dz = p.pos[2] - p.target[2];
      var r = Math.sqrt(dx * dx + dy * dy + dz * dz), az = Math.atan2(dx, dz) + da, el = Math.asin(dy / r) + (de || 0), ce = Math.cos(el);
      return { pos: [p.target[0] + r * ce * Math.sin(az), p.target[1] + r * Math.sin(el), p.target[2] + r * ce * Math.cos(az)], target: p.target.slice(), fov: p.fov };
    }
    function fitK(asp) { return asp < 1.25 ? Math.pow(1.25 / asp, 0.85) : 1; }
    var KF = fitK(W / H);                                   // cuadro completo
    var KH = fitK(V ? W / (H / 2) : (W / 2) / H);           // mitades de la pantalla dividida
    function fit(p, k) { k = k == null ? KF : k; return k === 1 ? p : push(p, k); }
    var sp = D.macropera.separador, cs = D.macropera.caseta;
    var DR0 = P([150, 15, 128], [10, 0, 4], 36), DR1 = P([100, 30, 98], [10, 0, 4], 40), AER = SH.aerea;
    var PLANTA = { centro: [26, 11], ancho: 92, padding: { left: 80, right: 80, top: 190, bottom: 160 } };
    // 9:16: planta girada 90° (el pozo arriba, la batería abajo) para llenar el cuadro vertical
    var PV_R = 236, PV_EL = 1.545, PV_T = [27.5, 0, 12.5];
    var PLAN_V = P([PV_T[0] + PV_R * Math.cos(PV_EL), PV_R * Math.sin(PV_EL), PV_T[2]], PV_T, 24);
    var SC_POSE = V ? P([19.6, 2.9, 18.6], [19.6, 1.75, 13], 42) : P([19.0, 2.75, 17.6], [19.1, 1.85, 13], 42);
    var TOUR = [SH.arbol, SH.estrangulador, SH.manifold, SH.lineaEntrada, SH.separador, SC_POSE];
    var TOUR_T = [17.8, 20.3, 22.75, 25.7, 29.9, 32.7];
    // circuito cerrado: reincorporación → vista alta del trailer y la línea de salida → línea a batería
    var CC_A = P([14, 9, 26], [26, 0.5, 6], 42), CC_B = P([30, 8, 10], [44, 0.4, -6], 42);
    var TOUR2 = [SH.recombinacion, push(SH.recombinacion, 0.86), CC_A, CC_B];
    var TOUR2_T = [63.2, 65.4, 68.2, 70.6];
    var RTU_OV = V ? P([12, 11, 4], [31, 1.0, 20], 40) : P([15, 9.5, 35], [28.5, 1.5, 18], 42);
    function tourU(t, T) {
      var n = T.length - 1;
      if (t <= T[0]) return 0; if (t >= T[n]) return 1;
      for (var i = 0; i < n; i++) if (t < T[i + 1]) { var l = seg(t, T[i], T[i + 1]); return (i + lerp(l, eio(l), 0.6)) / n; }
      return 1;
    }
    var TOURF = TOUR.map(function (p) { return fit(p); }), TOUR2F = TOUR2.map(function (p) { return fit(p); });
    var RTU_F = V ? RTU_OV : fit(RTU_OV);
    var HLW = [[17.0, 19.2, 'arbol'], [19.6, 21.8, 'estrangulador'], [24.8, 28.6, 'lineaEntrada'], [29.6, 31.9, 'separador'],
      [65.0, 67.2, 'recombinacion'], [68.4, 70.8, 'lineaBateria'], [72.4, 74.6, 'rtu']];
    function hlAt(t) { for (var i = 0; i < HLW.length; i++) if (t >= HLW[i][0] && t < HLW[i][1]) return HLW[i][2]; return null; }
    function baseState(t) {
      var mz = seg(t, 16.2, 17.3), gl = seg(t, 29.6, 31.0);
      var lin = (t >= 10.4 && t < 15.6) || (t >= 71.0 && t < 76.0);
      return {
        flujo: { mezcla: mz, gas: gl, liquido: gl, salida: gl },
        rayosX: t < 15 ? 0 : seg(t, 16.5, 17.6),
        corte: t >= 31.5 && t < 36 ? eio(seg(t, 32.1, 34.0)) : 0,
        nivel: D.separador.nivelSP / 100 + 0.02 * Math.sin(t * 0.6),
        resaltar: hlAt(t),
        capas: { zonaSeguridad: true, acceso: true, cinta: true, entorno: true, lineas: lin },
        ortho: 0,
        ajusteVertical: false
      };
    }
    // 3D principal (cuadro completo); devuelve { st, zoom }
    function full3D(t) {
      var st = baseState(t), zoom = null;
      if (t < 15.0) {
        var flyC = t < 10.6 ? fit(s3.tour(eo(seg(t, 4.9, 10.6)), [DR0, DR1, AER])) : fit(AER);
        if (V) {
          st.camera = s3.lerpShot(flyC, PLAN_V, smr(seg(t, 9.5, 12.2)), { ease: false, hop: 0 });
          if (t >= 12.2) st.camera = push(PLAN_V, 1 - 0.07 * seg(t, 12.2, 15.0));
        } else {
          st.camera = flyC;
          st.ortho = smr(seg(t, 9.7, 12.0));
          st.planta = { centro: PLANTA.centro, ancho: PLANTA.ancho * (1 - 0.06 * seg(t, 11.5, 15.0)), padding: PLANTA.padding };
        }
      } else if (t < 17.8) {
        if (V) st.camera = s3.lerpShot(push(PLAN_V, 0.93), TOURF[0], smr(seg(t, 15.0, 17.8)), { ease: false, hop: 0 });
        else {
          st.camera = TOURF[0];
          st.ortho = 1 - smr(seg(t, 15.0, 17.8));
          st.planta = { centro: PLANTA.centro, ancho: PLANTA.ancho * 0.94, padding: PLANTA.padding };
        }
      } else if (t < 32.7) {
        st.camera = s3.tour(tourU(t, TOUR_T), TOURF);
      } else if (t < 40) {
        var k = seg(t, 34.55, 35.6), sc = TOURF[5];
        st.camera = push(sc, 1 - 0.07 * seg(t, 32.7, 34.55) - 0.5 * ei(k), lerp(sc.fov, 30, ei(k)));
        if (k > 0) zoom = { k: 0.7 * ei(k), a: 'separador', blur: 9 * ei(k) };
      } else if (t < 70.6) {
        st.camera = s3.tour(tourU(t, TOUR2_T), TOUR2F);
      } else if (t < 72.8) {
        st.camera = s3.lerpShot(TOUR2F[3], RTU_F, seg(t, 70.6, 72.8));
      } else {
        var k2 = seg(t, 74.35, 75.3);
        var base = orbit(RTU_F, -0.05 * seg(t, 72.8, 74.35), 0);
        st.camera = k2 > 0 ? s3.lerpShot(base, fit(P([cs.x - 3, 3.0, cs.z + 6], [cs.x, 2.0, cs.z], 34)), ei(k2) * 0.75, { ease: false, hop: 0 }) : base;
        if (k2 > 0) zoom = { k: 0.9 * ei(k2), a: 'scada', blur: 8 * ei(k2) };
      }
      // 16:9: durante la tarjeta del separador el centro óptico se corre a la derecha
      if (!V && t >= 30.6 && t < 34.6) st.encuadre = { left: 560 * smr(seg(t, 30.8, 31.9)) * (1 - smr(seg(t, 34.0, 34.6))) };
      return { st: st, zoom: zoom };
    }
    // vistas de la pantalla dividida
    // poses calculadas desde las anclas (medidor → válvula), por si cambia la geometría
    function lookPose(ids, az, el, minSpan, fov, asp, fill, dy) {
      var c = [0, 0, 0], n = ids.length, i, j;
      for (i = 0; i < n; i++) for (j = 0; j < 3; j++) c[j] += A3[ids[i]][j] / n;
      c[1] += dy || 0;
      var span = minSpan;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) span = Math.max(span, Math.hypot(A3[ids[i]][0] - A3[ids[j]][0], A3[ids[i]][2] - A3[ids[j]][2]));
      var vw = 2 * Math.tan(fov * Math.PI / 360) * Math.min(1, asp), r = span * fill / vw, ce = Math.cos(el);
      return P([c[0] + r * ce * Math.sin(az), c[1] + r * Math.sin(el), c[2] + r * ce * Math.cos(az)], c, fov);
    }
    var HASP = V ? W / (H / 2) : (W / 2) / H;
    var MLIQ = lookPose(['CORIOLIS', 'LV'], -0.28, 0.2, 1.5, 40, HASP, 1.9, -0.12);
    var MGAS = V ? lookPose(['placa', 'PV'], 0.1, 0.42, 1.5, 42, HASP, 2.1, 0.1) : lookPose(['placa', 'PV'], 0.12, 0.24, 1.5, 42, HASP, 1.55, -0.05);
    function splitState(t, side) {
      var st = baseState(t);
      st.flujo = { mezcla: 1, gas: 1, liquido: 1, salida: 1 };
      st.rayosX = 1; st.corte = 0;
      var u = seg(t, 51.6, 64.0);
      if (side === 'L') {
        st.camera = orbit(MLIQ, lerp(-0.08, 0.1, u), 0); st.resaltar = t > 53.0 ? 'coriolis' : null;
        if (V) st.encuadre = { top: 300 };      // 9:16: baja el Coriolis y la LV por debajo del encabezado
      }
      else {
        st.camera = orbit(MGAS, lerp(0.08, -0.08, u), 0); st.resaltar = t > 54.2 ? 'placa' : null;
        if (V) st.encuadre = { bottom: 260 };   // 9:16: sube la línea de gas por encima de las tarjetas
      }
      return st;
    }

    /* ================================================================
       DIBUJO POR CUADRO
       ================================================================ */
    var PROJ = { '3d': { _t: -1 }, L: { _t: -1 }, R: { _t: -1 }, cut: { _t: -1 } };
    var ANCH_IDS = Object.keys(A3);
    function collect(view, ox, oy, z) {
      var o = PROJ[view]; o._t = curT;
      for (var i = 0; i < ANCH_IDS.length; i++) {
        var id = ANCH_IDS[i], p = s3.project(A3[id]);
        var x = ox + p.x, y = oy + p.y;
        if (z) { x = (x - z.sx) * z.f; y = (y - z.sy) * z.f; }
        var q = o[id] || (o[id] = {});
        q.x = x; q.y = y; q.v = p.visible && p.inFront; q.f = p.inFront;
      }
    }
    function layerOn(el) {
      if (el.style.visibility === 'hidden') return false;
      var o = parseFloat(el.style.opacity);
      return !(o <= 0.002);
    }
    function blit(ox, oy, w, h) { vctx.drawImage(off, 0, 0, w, h, ox, oy, w, h); }
    function render3D(t) {
      var splitOn = t >= 51.55 && t < 64.0;
      var fullOn = !splitOn || t >= 63.15;
      if (splitOn) {
        var hw = V ? W : W / 2, hh = V ? H / 2 : H;
        var k = eo(seg(t, 51.6, 52.3));
        size3(hw, hh);
        vctx.fillStyle = '#061631'; vctx.fillRect(0, 0, W, H);
        var oxL = V ? 0 : -hw * (1 - k), oyL = V ? -hh * (1 - k) : 0;
        var oxR = V ? 0 : hw + hw * (1 - k), oyR = V ? hh + hh * (1 - k) : 0;
        s3.renderAt(t, splitState(t, 'L')); collect('L', oxL, oyL); blit(oxL, oyL, hw, hh);
        s3.renderAt(t, splitState(t, 'R')); collect('R', oxR, oyR); blit(oxR, oyR, hw, hh);
      }
      if (fullOn) {
        var f = full3D(t);
        size3(W, H);
        s3.renderAt(t, f.st);
        var z = null;
        if (f.zoom) {
          var a = s3.project(A3[f.zoom.a]), zf = 1 + f.zoom.k;
          var cx = clamp(a.x, W * 0.2, W * 0.8), cy = clamp(a.y, H * 0.2, H * 0.8);
          z = { f: zf, sx: cx - cx / zf, sy: cy - cy / zf };
        }
        collect('3d', 0, 0, z);
        if (splitOn) {
          // la vista completa entra como una franja que crece desde el centro
          var bk = eio(seg(t, 63.15, 63.95));
          vctx.save(); vctx.beginPath();
          if (V) vctx.rect(0, H / 2 * (1 - bk), W, H * bk); else vctx.rect(W / 2 * (1 - bk), 0, W * bk, H);
          vctx.clip(); vctx.drawImage(off, 0, 0); vctx.restore();
        } else if (z) {
          vctx.save();
          if (f.zoom.blur > 0.3) vctx.filter = 'blur(' + f.zoom.blur.toFixed(1) + 'px)';
          vctx.drawImage(off, z.sx, z.sy, W / z.f, H / z.f, 0, 0, W, H);
          vctx.restore();
        } else {
          vctx.drawImage(off, 0, 0);
        }
      }
    }
    function cutState(t) {
      if (t < STEP_T[0]) return { paso: 0, progreso: 1, etiquetas: false, rotuloPaso: false };
      for (var i = 0; i < 6; i++) if (t < STEP_T[i + 1]) return { paso: i + 1, progreso: seg(t, STEP_T[i], STEP_T[i + 1]), etiquetas: false, rotuloPaso: false };
      return { paso: 6, progreso: 1, etiquetas: false, rotuloPaso: false };
    }
    var CUT_IDS = ['deflector', 'extractor', 'asentamiento', 'TN', 'TPS', 'TT', 'psv', 'LV', 'PV', 'coriolis', 'CORIOLIS', 'placa', 'TDG', 'entrada', 'LIC', 'separador'];
    function renderCut(t) {
      cut.renderAt(t, cutState(t));
      var o = PROJ.cut; o._t = curT;
      for (var i = 0; i < CUT_IDS.length; i++) {
        var p = cut.anchor(CUT_IDS[i]); var q = o[CUT_IDS[i]] || (o[CUT_IDS[i]] = {});
        if (p) { q.x = p.x; q.y = p.y; q.v = p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20; } else q.v = false;
      }
    }
    function hScada(t) {
      if (t < 75.0) return 0;
      if (t < 76.6) return 2 * eio(seg(t, 75.0, 76.6));
      if (t < 81.0) return 2 + 24 * seg(t, 76.6, 81.0);
      return 26 + 1.6 * eo(seg(t, 81.0, 82.2));
    }
    var lastState = '';
    function renderScada(t) {
      var hh = hScada(t), S = sim(hh);
      scada.renderAt(hh, { t: t, resaltar: hh < 2 ? 'estado' : hh < 26 ? 'acumulados' : 'estado' });
      var idx = S.estado === 'estabilizacion' ? 0 : S.estado === 'en-curso' ? 1 : 2;
      if (lastState !== S.estado) { stE.className = 'f-state c' + idx; stSpan.textContent = S.estadoNombre; lastState = S.estado; }
      hmsEl.textContent = WT.SCADA.formato.hms(S.hMedicion);
      barEm.style.transform = 'scaleX(' + (S.hMedicion / D.medicion.horasMedicion).toFixed(4) + ')';
      for (var i = 0; i < TOT.length; i++) TOT[i].el.innerHTML = num(S[TOT[i].k], TOT[i].d) + '<u>' + TOT[i].u + '</u>';
    }
    function renderPid(t) {
      pid.renderAt(t, { trazo: eio(seg(t, 82.85, 86.3)), marco: 0, pulsos: seg(t, 85.6, 86.6) });
    }

    // zona permitida para la caja de cada vista (en la pantalla dividida, su mitad)
    function bounds(view) {
      var b = V ? [40, 200, W - 40, H - 280] : [60, 60, W - 60, H - 60];
      if (view === 'L') { if (V) b[3] = H / 2 - 16; else b[2] = W / 2 - 16; }
      if (view === 'R') { if (V) b[1] = H / 2 + 16; else b[0] = W / 2 + 16; }
      return b;
    }
    F.bounds = bounds;
    // etiquetas ancladas + líneas guía
    function measure(L) { if (!L.w) { L.w = L.el.offsetWidth; L.hh = L.el.offsetHeight / 2; } }
    function updateLabels(t) {
      for (var i = 0; i < LABELS.length; i++) {
        var L = LABELS[i], s = L.s;
        var live = t >= s.t0 && t < s.t1 + 0.3;
        var q = live && PROJ[s.view]._t === t ? PROJ[s.view][s.a] : null;
        if (!live || !q || !q.v) {
          if (L.on) { L.el.style.opacity = '0'; L.g.style.opacity = '0'; L.on = false; }
          continue;
        }
        L.on = true; measure(L);
        var kin = eo(seg(t, s.t0, s.t0 + 0.45)), kbox = eo(seg(t, s.t0 + 0.2, s.t0 + 0.65)), kout = 1 - seg(t, s.t1, s.t1 + 0.3);
        var ax = q.x, ay = q.y, sgn = L.dx >= 0 ? 1 : -1;
        var bx = ax + L.dx, by = ay + L.dy;
        // mantener la caja dentro del cuadro (márgenes seguros)
        var BD = bounds(s.view);
        var x0 = sgn > 0 ? bx : bx - L.w;
        if (x0 < BD[0]) { bx += BD[0] - x0; } else if (x0 + L.w > BD[2]) { bx -= x0 + L.w - BD[2]; }
        by = clamp(by, BD[1] + L.hh, BD[3] - L.hh);
        var ex = bx - sgn * 26;
        var len = Math.hypot(ex - ax, by - ay) + Math.abs(bx - ex);
        L.path.setAttribute('d', 'M' + ax.toFixed(1) + ' ' + ay.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + by.toFixed(1) + 'L' + bx.toFixed(1) + ' ' + by.toFixed(1));
        L.path.style.strokeDasharray = len.toFixed(1);
        L.path.style.strokeDashoffset = (len * (1 - kin)).toFixed(1);
        L.dot.setAttribute('cx', ax.toFixed(1)); L.dot.setAttribute('cy', ay.toFixed(1));
        L.dot.setAttribute('r', (7 * eo(seg(t, s.t0, s.t0 + 0.25))).toFixed(2));
        var w = frac((t - s.t0) * 0.8);
        L.ring.setAttribute('cx', ax.toFixed(1)); L.ring.setAttribute('cy', ay.toFixed(1));
        L.ring.setAttribute('r', (9 + 18 * w).toFixed(1)); L.ring.style.opacity = ((1 - w) * 0.9).toFixed(3);
        L.g.style.opacity = kout.toFixed(3);
        var slide = (1 - kbox) * 14 * sgn;
        L.el.style.transform = 'translate(' + (bx + slide).toFixed(1) + 'px,' + by.toFixed(1) + 'px) translate(' + (sgn > 0 ? '0' : '-100%') + ',-50%)';
        L.el.style.opacity = (kbox * kout).toFixed(3);
        if (L.vl) {
          var S = sim(9.0 + (t - 17) * 0.05);
          var v = S[s.val] * eo(seg(t, s.t0 + 0.35, s.t0 + 1.6));
          var txt = num(v, s.dec) + '<u>' + esc(s.u) + '</u>';
          if (txt !== L.lastV) { L.vl.innerHTML = txt; L.lastV = txt; }
        }
      }
    }
    function updateSignals(t) {
      var on = t >= 71.4 && t < 74.6;
      if (!on) { sigG.style.opacity = '0'; return; }
      var o = PROJ['3d'], r = o.rtu;
      sigG.style.opacity = (seg(t, 71.4, 71.9) * (1 - seg(t, 74.15, 74.5))).toFixed(3);
      if (!r) return;
      for (var i = 0; i < SIG.length; i++) {
        var q = o[SIG[i]], g = SIGP[i];
        var k = eo(seg(t, 71.6 + i * 0.12, 72.6 + i * 0.12));
        if (!q || !q.f || k <= 0) { g.p.style.opacity = '0'; g.d1.style.opacity = '0'; g.d2.style.opacity = '0'; g.tx.style.opacity = '0'; continue; }
        var mx = (q.x + r.x) / 2, my = Math.min(q.y, r.y) - (V ? 160 : 110) - (i % 4) * 18;
        g.p.setAttribute('d', 'M' + q.x.toFixed(1) + ' ' + q.y.toFixed(1) + 'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + r.x.toFixed(1) + ' ' + r.y.toFixed(1));
        g.p.style.opacity = k.toFixed(3);
        g.p.style.strokeDashoffset = (-t * 60).toFixed(1);
        for (var j = 0; j < 2; j++) {
          var u = frac(t * 0.7 + i * 0.13 + j * 0.5), d = j ? g.d2 : g.d1;
          var x = (1 - u) * (1 - u) * q.x + 2 * (1 - u) * u * mx + u * u * r.x, y = (1 - u) * (1 - u) * q.y + 2 * (1 - u) * u * my + u * u * r.y;
          d.setAttribute('cx', x.toFixed(1)); d.setAttribute('cy', y.toFixed(1)); d.style.opacity = (k * Math.sin(Math.PI * u)).toFixed(3);
        }
        // el tag solo se rotula dentro de la zona segura (no sobre la leyenda ni la franja de interfaz)
        var txOk = q.v && q.y > (V ? 240 : 120) && q.y < H - (V ? 380 : 170) && q.x > 40 && q.x < W - 140;
        g.tx.setAttribute('x', (q.x + 10).toFixed(1)); g.tx.setAttribute('y', (q.y - 12).toFixed(1)); g.tx.style.opacity = txOk ? k.toFixed(3) : '0';
      }
    }
    function updateCounters(t) {
      for (var i = 0; i < COUNTERS.length; i++) {
        var c = COUNTERS[i];
        if (t < c.w0 || t > c.w1) continue;
        var S = sim(c.h0 + (t - c.t0) * c.rate);
        var v = S[c.key] * eo(seg(t, c.t0, c.t0 + c.dur));
        var txt = num(v, c.dec);
        if (txt !== c.last) { c.el.textContent = txt; c.last = txt; }
      }
    }

    var lastT = -1, curT = -1;
    function safe(fn, t, name) {
      try { fn(t); } catch (err) { if (window.console) console.error('WTFilm: error al dibujar ' + name + ' en t=' + t + ': ' + (err && err.message)); }
    }
    function frame(t) {
      t = +t || 0; lastT = t; curT = t;
      // cada módulo se dibuja por separado: si uno falla, el resto del cuadro se completa
      if (layerOn(glWrap)) safe(render3D, t, '3D');
      if (layerOn(cutWrap)) safe(renderCut, t, 'corte');
      if (layerOn(scadaWrap)) safe(renderScada, t, 'SCADA');
      if (layerOn(pidWrap)) safe(renderPid, t, 'DTI');
      updateLabels(t);
      updateSignals(t);
      updateCounters(t);
    }

    /* ---------------- preparación (fuentes + compilación de shaders) ---------------- */
    var ready = Promise.all([
      s3.ready,
      WT.Cutaway.cargarFuentes ? WT.Cutaway.cargarFuentes() : null,
      document.fonts && document.fonts.load ? Promise.all(['800 64px "Barlow Condensed"', '700 64px "Barlow Condensed"', '500 30px "Barlow"', '600 30px "Barlow"', '700 30px "JetBrains Mono"'].map(function (f) { return document.fonts.load(f).catch(function () { return null; }); })) : null
    ]).then(function () { return document.fonts ? document.fonts.ready : null; }).then(function () {
      // calentamiento: compila los programas de cada modo (corte, rayos X, resaltado, planta, vista dividida)
      function warm(fn) { try { fn(); } catch (err) { if (window.console) console.error('WTFilm: calentamiento: ' + (err && err.message)); } }
      warm(function () { s3.renderAt(8, full3D(8).st); });
      warm(function () { s3.renderAt(33.5, full3D(33.5).st); });
      warm(function () { s3.renderAt(18, full3D(18).st); });
      warm(function () { s3.renderAt(12, full3D(12).st); });
      warm(function () { size3(V ? W : W / 2, V ? H / 2 : H); s3.renderAt(58, splitState(58, 'L')); });
      warm(function () { size3(W, H); s3.renderAt(73, full3D(73).st); });
      warm(function () { cut.renderAt(40, cutState(40)); });
      LABELS.forEach(function (L) {
        L.w = 0; L.el.style.opacity = '0'; L.el.style.transform = 'translate(-4000px,0)';
        if (L.vl) L.vl.innerHTML = '000.00<u>' + esc(L.s.u) + '</u>';
        measure(L);
        if (L.vl) { L.vl.innerHTML = ''; L.lastV = null; }
      });
      if (lastT >= 0) frame(lastT);
      return true;
    });
    window.__hf = window.__hf || {};
    window.__hf.buildReady = window.__hf.buildReady || {};
    window.__hf.buildReady['wt-film-3d'] = ready;

    var OFF = +cfg.offset || 0;   // solo para cortes de prueba (render de un tramo)
    window.addEventListener('hf-seek', function (e) { frame((e && e.detail ? e.detail.time : 0) + OFF); });
    F.tl = tl; F.frame = frame; F.proj = PROJ; F.labels = LABELS; F.ready = ready; F.s3 = s3; F.cut = cut; F.scada = scada; F.pid = pid;
    F.seek = function (t) { tl.seek(t, false); frame(t); return t; };

    // la composición registra la línea en window.__timelines[id] con el valor devuelto
    if (OFF) { tl.seek(OFF, false); return gsap.timeline({ paused: true }).add(tl.tweenFromTo(OFF, OFF + (cfg.length || 8), { ease: 'none' }), 0); }
    return tl;
  };
})();
