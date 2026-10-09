/* =====================================================================
   WT.Cutaway — Corte interno del separador bifásico horizontal
   ---------------------------------------------------------------------
   Ilustración técnica en corte (Canvas 2D) con partículas deterministas.
   Contrato (docs/ARQUITECTURA.md):
     const c = WT.Cutaway.create(container, { width, height,
                 layout: 'landscape' | 'portrait', labels: true, tag: 'FA-06',
                 pixelRatio, aviso: true });
       aviso: false oculta la nota "Ilustración esquemática · valores simulados…" de la
       esquina (el video pone su propio aviso); las tarjetas con valores conservan el suyo.
     c.renderAt(t, { paso: 0..6, progreso: 0..1, etiquetas: true, resaltar: 'deflector' });
     c.resize(w, h);  c.pasos;  c.el;
   Extensiones (opcionales, no rompen el contrato):
     estado.apertura 0..1  → animación de "abrir en corte" (1 = corte completo, por defecto)
     estado.texto  bool    → incluye el texto del paso en el rótulo (útil en video)
     estado.rotuloPaso bool → muestra el rótulo numerado del paso (por defecto = etiquetas)
     estado.tag    string  → tag del equipo (FA-06/FA-08/FA-09) para este cuadro
     estado.layout string  → fuerza 'landscape' | 'portrait' en este cuadro
     estado.desde  0..6    → paso del que viene la cámara (por defecto paso − 1)
     estado.instantaneo    → sin transiciones (prefers-reduced-motion / cuadros fijos)
     estado.lecturas bool  → tarjeta de lectura del medidor en los pasos 5 y 6 (por defecto = etiquetas;
                             la tarjeta de presiones del paso 2 se dibuja siempre, como antes)
     estado.orden  bool    → insignias "1 Medición → 2 Control" bajo medidor y válvula en los
                             pasos 5 y 6 (por defecto = etiquetas)
     estado.aviso  bool    → nota de la esquina en este cuadro (por defecto = opts.aviso)
     c.setTag(tag); c.setLayout(layout); c.anchor(id) → { x, y } px del último cuadro
       (anclas: 'placa' / 'FE' = la placa de orificio; 'TDG' = su transmisor de presión diferencial)
     c.zonas; c.canvas; c.dispose()
     WT.Cutaway.cargarFuentes() → Promise (precarga Barlow / JetBrains Mono para el lienzo)
   Orden en las salidas (WT.data.valvulasControl): primero se mide y
   después se controla. Gas: boquilla superior → placa de orificio (FE,
   con su transmisor de presión diferencial TDG) → PV (contrapresión, PIC).
   Líquido: boquilla inferior → Coriolis Promass 300 → LV (control de nivel,
   LIC). LIC y PIC son funciones en el RTU (WT.data.funciones).
   Accesorios como en la foto del FA-02: PSV arriba, hacia el extremo de
   entrada; registro / tapa bridada en la tapa del extremo de salida.
   Todo lo que se dibuja depende solo de (t, estado): sin Math.random,
   Date.now ni performance.now. Mismo t → mismo cuadro.
   ===================================================================== */
(function () {
  'use strict';
  var WT = (window.WT = window.WT || {});

  /* ------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------ */
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function easeInOut(k) { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function easeOut(k) { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }
  function frac(x) { return x - Math.floor(x); }
  function hexRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(h, a) { var c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  function mix(h1, h2, k) {
    var a = hexRgb(h1), b = hexRgb(h2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], k)) + ',' + Math.round(lerp(a[1], b[1], k)) + ',' + Math.round(lerp(a[2], b[2], k)) + ')';
  }
  function fmt(v, d) { return (WT.util && WT.util.fmt) ? WT.util.fmt(v, d) : Number(v).toFixed(d || 0); }
  function mixHex(h1, h2, k) {
    var a = hexRgb(h1), b = hexRgb(h2), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(lerp(a[i], b[i], k)); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o;
  }
  function isHex(h) { return typeof h === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h); }

  /* ------------------------------------------------------------------
     Colores: corrientes y marca desde WT.data.colores; los colores de
     equipo (verde del recipiente, bridas, remolque, cabezales E+H, PSV,
     placa del tag) desde WT.data.colores.equipo (tomados de las fotos de
     campo). Las constantes de abajo son el respaldo y sus tonos de luz y
     sombra ya ajustados; si data.js trae otro color se derivan los tonos.
     ------------------------------------------------------------------ */
  var EQ0 = {
    verde: '#24513b', verdeLuz: '#4d8a66', verdeSombra: '#0f2a1e',   // recipiente (foto 05)
    acero: '#9fb2c6', aceroLuz: '#d6e1ec', aceroOsc: '#4b5f78',        // cortes de sección
    interior: '#5c7290', interiorOsc: '#1c2b40', interiorLuz: '#8fa6c0',
    brida: '#7a4a8f', bridaLuz: '#a774bd', bridaOsc: '#3f2150',          // bridas moradas (fotos)
    remolque: '#f0a51f', remolqueOsc: '#a8670c',                          // bastidor amarillo/naranja
    llanta: '#15181d', rin: '#e9edf1',
    eh: '#1f63b3', ehLuz: '#5d9be0', ehOsc: '#0f3a6e',                    // cabezales E+H (azules)
    psv: '#c9252f', psvLuz: '#f0646b', psvOsc: '#7d0f17',
    placa: '#f28c1b',                                                     // placa naranja del tag
    actuador: '#6d8199', actuadorLuz: '#b8c7d8'
  };
  var EQ = {};
  /* llave de WT.data.colores.equipo → [color base, { tono: [hacia, k] }] */
  var EQ_DATA = {
    recipiente: ['verde', { verdeLuz: ['#ffffff', 0.22], verdeSombra: ['#000000', 0.58] }],
    brida: ['brida', { bridaLuz: ['#ffffff', 0.28], bridaOsc: ['#000000', 0.48] }],
    remolque: ['remolque', { remolqueOsc: ['#000000', 0.32] }],
    cabezalEH: ['eh', { ehLuz: ['#ffffff', 0.3], ehOsc: ['#000000', 0.42] }],
    psv: ['psv', { psvLuz: ['#ffffff', 0.3], psvOsc: ['#000000', 0.42] }],
    placaTag: ['placa', {}]
  };
  var C = {};
  function loadColors() {
    var c = (WT.data && WT.data.colores) || {}, k, j;
    C.marino = c.marino || '#0b2545'; C.marino900 = c.marino900 || '#061631'; C.marino700 = c.marino700 || '#13315c';
    C.amarillo = c.amarillo || '#ffc20e'; C.celeste = c.celeste || '#4fb3e8'; C.celeste200 = c.celeste200 || '#a9dcf7';
    C.mezcla = c.mezcla || '#8a5a2b'; C.mezclaClaro = c.mezclaClaro || '#b9824a';
    C.gas = c.gas || '#ffd23f'; C.liquido = c.liquido || '#1c140c'; C.ambar = c.liquidoAmbar || '#e8971e';
    C.salida = c.salida || '#7a5233'; C.senal = c.senal || '#4fb3e8';
    for (k in EQ0) EQ[k] = EQ0[k];
    var e = c.equipo || {};
    for (k in EQ_DATA) {
      var v = e[k], base = EQ_DATA[k][0], tonos = EQ_DATA[k][1];
      if (!isHex(v)) continue;
      v = v.charAt(0) === '#' ? v : '#' + v;
      if (v.toLowerCase() === EQ0[base].toLowerCase()) continue; // mismo color: se quedan los tonos ajustados
      EQ[base] = v;
      for (j in tonos) EQ[j] = mixHex(v, tonos[j][0], tonos[j][1]);
    }
  }

  /* Textos y lazos desde WT.data (con respaldo) */
  var FUNC0 = [
    { tag: 'LIC', en: 'RTU', mide: 'TN', actua: 'LV', desc: 'Control de nivel del separador' },
    { tag: 'PIC', en: 'RTU', mide: 'TPS', actua: 'PV', desc: 'Control de presión del separador (contrapresión)' }
  ];
  var VALV0 = [
    { tag: 'LV', nombre: 'Válvula de control de nivel', corriente: 'liquido', lazo: 'LIC' },
    { tag: 'PV', nombre: 'Válvula de control de presión (contrapresión)', corriente: 'gas', lazo: 'PIC' }
  ];
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* 'Válvula de control de nivel' → 'Control de nivel'; '… (contrapresión)' → 'Contrapresión' */
  function nombreCorto(n) {
    n = String(n || '');
    var m = /\(([^)]+)\)\s*$/.exec(n);
    return cap(m ? m[1] : n.replace(/^v[aá]lvula\s+de\s+/i, ''));
  }
  function valvula(corriente) {
    var L = (WT.data && WT.data.valvulasControl) || VALV0, i;
    for (i = 0; i < L.length; i++) if (L[i].corriente === corriente) return L[i];
    for (i = 0; i < VALV0.length; i++) if (VALV0[i].corriente === corriente) return VALV0[i];
    return null;
  }
  /* función de control que actúa sobre la válvula `tag` (LIC → LV, PIC → PV) */
  function funcionDe(tag, lazo) {
    var D = WT.data || {}, L = D.funciones, i;
    if (L && L.length) {
      for (i = 0; i < L.length; i++) if (L[i].actua === tag || (lazo && L[i].tag === lazo && L[i].actua)) return L[i];
      return null; // data.js lista funciones y ninguna actúa sobre esta válvula: no se dibuja el lazo
    }
    for (i = 0; i < FUNC0.length; i++) if (FUNC0[i].actua === tag) return FUNC0[i];
    return null;
  }
  function funcionQueMide(tag) {
    var L = (WT.data && WT.data.funciones) || [];
    for (var i = 0; i < L.length; i++) if (L[i].mide === tag && !L[i].actua) return L[i];
    return null;
  }

  /* ------------------------------------------------------------------
     Geometría (unidades de dibujo ≈ px a escala 1). y positivo hacia abajo.
     Corte longitudinal por el plano z = 0; la mitad trasera se ve desde
     arriba con una ligera elevación: la profundidad d (hacia atrás) sube
     en pantalla d·K. Así se ven el espejo del líquido y las caras superiores.
     ------------------------------------------------------------------ */
  var G = {
    xT: 470,          // líneas de tangencia ±xT
    A: 85, R: 165,    // tapas semielípticas 2:1 (profundidad A = R/2) y radio exterior
    th: 9,            // espesor de pared
    Ri: 156, Ai: 77,  // interior
    K: 0.3,           // proyección de profundidad
    inlet: { y: -55, r: 21, wall: 6, xFl: -650, xEdge: -805, xIn: -541 },
    defl: { x: -432, y0: -134, y1: -4, th: 7, bow: 13 },
    pad: { x0: 298, x1: 342, y0: -150, y1: -34 },
    gasOut: { x: 405, r: 23, wall: 6, yFl: -228, yH: -282 },
    liqOut: { x: 400, r: 21, wall: 6, yFl: 214, yH: 256 },
    xEdge: 805,
    spY: 26,          // nivel de consigna (SP) en y (se recalcula con WT.data.separador.nivelSP)
    psv: -250, tt: -118, tps: 32, tn: 190,
    // Salidas: primero el medidor y después la válvula de control (WT.data.valvulasControl)
    ori: 565, pv: 720,   // gas: placa de orificio (TDG) → PV
    cor: 575, lv: 720,   // líquido: Coriolis Promass 300 → LV
    lic: { x: 720, y: 30 },     // LIC en el RTU (arriba de la LV)
    pic: { x: 720, y: -452 },   // PIC en el RTU (arriba de la PV)
    xBajada: 640,               // bajada de la señal TN → LIC (libre del registro y de la PV)
    ySenalTPS: -452,            // tendido de la señal TPS → PIC (sobre la tubería de gas)
    saddles: [-300, 262],
    frameY: 286, wheels: [-40, 104], wheelR: 54,
    manway: { y: 0, r: 58 }
  };
  G.yShellTop = -G.R; G.yShellBot = G.R;
  /* Ajustes desde WT.data.separador: consigna de nivel y montaje del TN */
  function pctToY(p) { return G.Ri - p / 100 * 2 * G.Ri; }
  function loadConfig() {
    var sep = (WT.data && WT.data.separador) || {}, sp = +sep.nivelSP;
    G.spY = (isFinite(sp) && sp >= 15 && sp <= 75) ? pctToY(sp) : 26;
    var tm = sep.tnMontaje, v = tm && typeof tm === 'object' ? tm.valor : tm;
    // 'Superior (sonda)' (o sin dato) → sonda por la parte superior; 'lateral' / 'costado' / 'cámara' → cámara externa en la tapa
    G.tnLateral = !!v && /lateral|costado|c[aá]mara|externa|bridle|jaula/i.test(String(v)) && !/superior/i.test(String(v));
    G.tnMontaje = v ? String(v) : '';
  }
  G.cage = { x: 650, y0: -104, y1: 112, r: 15, nozA: -80, nozB: 92 }; // cámara externa del TN (solo si es lateral)
  function headX(y, a, r) { var k = 1 - (y * y) / (r * r); return k > 0 ? a * Math.sqrt(k) : 0; }
  function innerRight(y) { return G.xT + headX(y, G.Ai, G.Ri); }
  function depthAt(y) { var k = G.Ri * G.Ri - y * y; return k > 0 ? Math.sqrt(k) : 0; }

  /* Contorno tipo "estadio" con tapas elípticas (radio superior/inferior distintos) */
  function stadium(ctx, xT, a, rT, rB) {
    ctx.beginPath();
    ctx.moveTo(-xT, -rT);
    ctx.lineTo(xT, -rT);
    ctx.ellipse(xT, 0, a, rT, 0, -PI / 2, 0);
    ctx.ellipse(xT, 0, a, rB, 0, 0, PI / 2);
    ctx.lineTo(-xT, rB);
    ctx.ellipse(-xT, 0, a, rB, 0, PI / 2, PI);
    ctx.ellipse(-xT, 0, a, rT, 0, PI, PI * 1.5);
    ctx.closePath();
  }

  /* Polilínea suave (Catmull-Rom) → puntos + longitudes acumuladas */
  function spline(pts, perSeg) {
    var out = [], n = pts.length, i, s;
    for (i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (s = 0; s < perSeg; s++) {
        var u = s / perSeg, u2 = u * u, u3 = u2 * u;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
        ]);
      }
    }
    out.push(pts[n - 1].slice());
    return withLengths(out);
  }
  function withLengths(pts) {
    var L = [0];
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts: pts, L: L, len: L[L.length - 1] };
  }
  /* Punto y tangente a la distancia s de una polilínea */
  function along(path, s) {
    var L = path.L, P = path.pts, n = P.length;
    s = clamp(s, 0, path.len);
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (L[mid] < s) lo = mid; else hi = mid; }
    var d = (L[hi] - L[lo]) || 1, k = (s - L[lo]) / d;
    var dx = P[hi][0] - P[lo][0], dy = P[hi][1] - P[lo][1], m = Math.hypot(dx, dy) || 1;
    return { x: P[lo][0] + dx * k, y: P[lo][1] + dy * k, tx: dx / m, ty: dy / m };
  }
  function strokePath(ctx, path) {
    var P = path.pts;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    for (var i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
  }
  /* Polilínea con esquinas redondeadas (tuberías) */
  function roundedPolyline(pts, r) {
    var out = [pts[0].slice()];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var d1 = Math.hypot(b[0] - a[0], b[1] - a[1]), d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      var rr = Math.min(r, d1 / 2, d2 / 2);
      var p1 = [b[0] - (b[0] - a[0]) / d1 * rr, b[1] - (b[1] - a[1]) / d1 * rr];
      var p2 = [b[0] + (c[0] - b[0]) / d2 * rr, b[1] + (c[1] - b[1]) / d2 * rr];
      for (var s = 0; s <= 8; s++) { // bezier cuadrática p1 → b → p2
        var u = s / 8, iu = 1 - u;
        out.push([iu * iu * p1[0] + 2 * iu * u * b[0] + u * u * p2[0], iu * iu * p1[1] + 2 * iu * u * b[1] + u * u * p2[1]]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return withLengths(out);
  }

  /* Tiempos de cada paso dentro de `progreso` */
  var PT = { cam: [0, 0.2], linea: [0.06, 0.24], titulo: [0.14, 0.3], extra: [0.2, 0.4], kb: [0.2, 1] };

  /* ------------------------------------------------------------------
     Pasos: encuadre de cámara (L = landscape, P = portrait), zonas de
     resaltado [cx, cy, rx, ry] y ancla del rótulo. Se asocian por `id`
     con WT.data.pasosSeparacion (el texto y el título salen de data.js).
     ------------------------------------------------------------------ */
  var VIEW0 = { L: { cx: 0, cy: -50, w: 1700, h: 940 }, P: { cx: 10, cy: 0, w: 1210, h: 1400 } };
  var STEP = {
    choque: { L: { cx: -470, cy: -70, w: 620, h: 400 }, P: { cx: -478, cy: -62, w: 430, h: 470 },
      zonas: [[-484, -60, 120, 112]], ancla: [-447, -60] },
    liberacion: { L: { cx: -250, cy: 18, w: 820, h: 460 }, P: { cx: -300, cy: 34, w: 560, h: 520 },
      zonas: [[-285, 78, 235, 100]], ancla: [-318, 96] },
    // la guía del rótulo termina en el extremo izquierdo de la cota de la sección
    // (así no atraviesa el texto de la cota ni los instrumentos)
    asentamiento: { L: { cx: -30, cy: -8, w: 1080, h: 560 }, P: { cx: -50, cy: 0, w: 780, h: 640 },
      zonas: [[-40, -8, 385, 172]], ancla: [-412, -124] },
    niebla: { L: { cx: 330, cy: -96, w: 580, h: 390 }, P: { cx: 330, cy: -96, w: 410, h: 470 },
      zonas: [[320, -92, 66, 92]], ancla: [320, -112] },
    // nivel: TN → LIC (RTU) → LV; el líquido sale por el fondo, Coriolis y después LV
    nivel: { L: { cx: 500, cy: 62, w: 900, h: 690 }, P: { cx: 470, cy: 40, w: 720, h: 900 },
      zonas: null, ancla: null },
    // gas: boquilla superior → placa de orificio (TDG) → PV; TPS → PIC (RTU) → PV
    gas: { L: { cx: 575, cy: -300, w: 740, h: 470 }, P: { cx: 585, cy: -235, w: 560, h: 640 },
      zonas: null, ancla: [405, -236] }
  };
  /* Zonas para `resaltar` (ids de internos/accesorios/instrumentos/equipos).
     Se rellenan en buildZones() porque dependen del montaje del TN. */
  var RES = {};
  var Z = {};
  function buildZones() {
    var tnZ = G.tnLateral ? [G.cage.x - 8, (G.cage.y0 + G.cage.y1) / 2 - 22, 62, 168] : [G.tn, -76, 66, 212];
    Z.tn = tnZ;
    Z.lic = [G.lic.x, G.lic.y, 54, 42];
    Z.pic = [G.pic.x, G.pic.y, 54, 42];
    Z.cor = [G.cor, 232, 80, 66];
    Z.lv = [G.lv, 214, 70, 98];
    Z.liq = [(G.liqOut.x + G.lv) / 2 + 5, 222, (G.lv - G.liqOut.x) / 2 + 48, 100];  // boquilla → Coriolis → LV
    Z.ori = [G.ori, -326, 56, 88];
    Z.pv = [G.pv, -326, 70, 92];
    Z.gasLinea = [(G.ori + G.pv) / 2, -322, (G.pv - G.ori) / 2 + 78, 96];          // placa → PV
    Z.gasBoq = [G.gasOut.x, -212, 62, 104];
    STEP.nivel.zonas = [tnZ, Z.liq, Z.lic];
    STEP.gas.zonas = [Z.gasBoq, Z.gasLinea, Z.pic];
    var R = {
      deflector: [[-440, -66, 52, 98]], entrada: [[-700, -70, 150, 80]], lineaEntrada: [[-700, -70, 150, 80]],
      asentamiento: STEP.asentamiento.zonas, extractor: [[320, -92, 66, 92]], niebla: [[320, -92, 66, 92]],
      nivel: [tnZ, Z.lic], valvulas: [Z.lv, Z.pv],
      psv: [[-250, -232, 50, 70]], manometro: [[-712, -128, 46, 64]], registro: [[590, 0, 46, 84]],
      TN: [tnZ], TPS: [[G.tps, -228, 46, 66]], TT: [[G.tt, -150, 46, 140]],
      LV: [Z.lv], PV: [Z.pv], LIC: [Z.lic], PIC: [Z.pic], rtu: [Z.lic, Z.pic],
      CORIOLIS: [Z.cor], coriolis: [Z.cor], TDG: [Z.ori], placa: [Z.ori], FE: [Z.ori],
      liquido: [Z.liq], salidaLiq: [Z.liq], salidaGas: [Z.gasBoq, Z.gasLinea],
      gas: STEP.gas.zonas, separador: [[0, 0, 640, 220]]
    };
    for (var k in RES) if (!(k in R)) delete RES[k];
    for (k in R) RES[k] = R[k];
  }
  function stepId(p) {
    var ps = (WT.data && WT.data.pasosSeparacion) || [];
    return p >= 1 && p <= ps.length ? ps[p - 1].id : null;
  }
  function stepInfo(p) {
    var ps = (WT.data && WT.data.pasosSeparacion) || [];
    return p >= 1 && p <= ps.length ? ps[p - 1] : null;
  }

  /* ------------------------------------------------------------------
     Partículas: parámetros fijos con semilla (WT.util.rng); su posición
     en cada cuadro es f(t) pura.
     ------------------------------------------------------------------ */
  function initParticles() {
    var rng = (WT.util && WT.util.rng) || function (s) { var a = s >>> 0; return function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
    var P = {}, i, r;
    r = rng(1101); P.bubbles = [];
    for (i = 0; i < 130; i++) {
      var nearInlet = r() < 0.58;
      P.bubbles.push({ x0: nearInlet ? lerp(-452, -150, r()) : lerp(-150, 330, r()), d0: lerp(0.22, 1, r()),
        T: lerp(2.4, 5.2, r()), ph: r(), r0: lerp(1.5, 5.4, Math.pow(r(), 1.6)), wob: lerp(1.5, 5, r()), wf: lerp(5, 11, r()), inlet: nearInlet });
    }
    r = rng(2202); P.drops = [];
    for (i = 0; i < 44; i++) P.drops.push({ x0: lerp(-412, 272, r()), y0: lerp(-142, -52, r()), T: lerp(1.5, 3.1, r()), ph: r(), r0: lerp(1.4, 3.2, r()) });
    r = rng(3303); P.mist = [];
    for (i = 0; i < 170; i++) P.mist.push({ line: Math.floor(r() * 7), ph: r(), T: lerp(5.2, 8.4, r()), r: lerp(0.7, 1.6, r()), j: lerp(-6, 6, r()), pen: r() });
    r = rng(4404); P.coal = [];
    for (i = 0; i < 14; i++) P.coal.push({ x: lerp(G.pad.x0 + 7, G.pad.x1 - 7, r()), y0: lerp(-140, -62, r()), T: lerp(3.6, 5.8, r()), ph: r(), rMax: lerp(3, 5.4, r()) });
    r = rng(5505); P.splash = [];
    for (i = 0; i < 76; i++) {
      var liq = r() < 0.66;
      P.splash.push(liq
        ? { liq: true, ph: r(), T: lerp(0.8, 1.35, r()), vx: lerp(-160, -25, r()), vy: lerp(-180, 100, r()), r: lerp(1.1, 3, r()) }
        : { liq: false, ph: r(), T: lerp(1.0, 1.7, r()), vx: lerp(-30, 60, r()), vy: lerp(-160, -60, r()), r: lerp(3, 7.5, r()) });
    }
    r = rng(6606); P.slugs = [];
    for (i = 0; i < 30; i++) P.slugs.push({ ph: r(), yo: lerp(-0.75, 0.75, r()), len: lerp(5, 18, r()), T: lerp(0.8, 1.25, r()) });
    r = rng(7707); P.liqStreak = [];
    for (i = 0; i < 30; i++) P.liqStreak.push({ yf: lerp(0.12, 0.92, r()), ph: r(), len: lerp(18, 60, r()), T: lerp(6, 11, r()) });
    r = rng(8808); P.film = [];
    for (i = 0; i < 8; i++) P.film.push({ ph: r(), T: lerp(0.7, 1.2, r()), xo: lerp(-6, 2, r()), r: lerp(1.6, 2.8, r()) });
    r = rng(9909); P.lupa = [];
    for (i = 0; i < 46; i++) P.lupa.push({ y: r(), ph: r(), T: lerp(1.6, 3, r()), r: lerp(0.8, 1.8, r()), stick: r() });
    return P;
  }

  /* Líneas de corriente del gas (deflector → extractor → boquilla → tubería) */
  function buildStreams() {
    var out = [], pad = G.pad, go = G.gasOut;
    for (var i = 0; i < 7; i++) {
      var f = i / 6, lane = lerp(-13, 13, f);
      var pts = [
        [-426, lerp(-150, -42, f)], [-330, lerp(-133, -38, f)], [-60, lerp(-127, -30, f)],
        [210, lerp(-133, -38, f)], [pad.x0, lerp(-143, -46, f)], [pad.x1, lerp(-143, -46, f)],
        [376, lerp(-152, -110, f)], [go.x + lane, -174], [go.x + lane, -262]
      ];
      var s = spline(pts, 12);
      var sPad = 0;
      for (var k = 0; k < s.pts.length; k++) if (s.pts[k][0] >= pad.x0) { sPad = s.L[k]; break; }
      var rad = 40 - lane, xA = G.ori - 80;
      var tail = roundedPolyline([[go.x + lane, -262], [go.x + lane, go.yH + lane], [xA, go.yH + lane]], rad);
      // paso por la placa de orificio: las líneas se juntan en el orificio (vena contracta, un poco
      // aguas abajo de la placa) y se recuperan antes de llegar a la PV
      var pinch = [];
      for (var xx = xA + 4; xx <= G.xEdge; xx += 4) {
        var dx = xx - (G.ori + 10), wpk = dx < 0 ? 26 : 44;
        pinch.push([xx, go.yH + lane * (1 - 0.66 * Math.exp(-(dx * dx) / (wpk * wpk)))]);
      }
      var all = s.pts.concat(tail.pts.slice(1), pinch);
      var path = withLengths(all);
      path.sPad = sPad; path.sOut = s.len; path.f = f;
      out.push(path);
    }
    return out;
  }
  /* posición del sensado de nivel y de la cabeza del TN (según montaje) */
  function tnX() { return G.tnLateral ? G.cage.x : G.tn; }
  function tnHead() { return G.tnLateral ? [G.cage.x, G.cage.y0 - 62] : [G.tn, -243]; }
  function buildPipes() {
    var go = G.gasOut, lo = G.liqOut, inl = G.inlet, lic = G.lic, pic = G.pic;
    var aLV = lo.yH - 92 - 24, aPV = go.yH - 92 - 24;   // parte superior del actuador de cada válvula
    var tnS = G.tnLateral
      ? [[G.cage.x + 22, G.cage.y0 - 40], [lic.x, G.cage.y0 - 40], [lic.x, lic.y - 28]]
      : [[G.tn + 24, -196], [G.xBajada, -196], [G.xBajada, lic.y], [lic.x - 36, lic.y]];
    return {
      gas: roundedPolyline([[go.x, -G.Ri + 4], [go.x, go.yH], [G.xEdge + 40, go.yH]], 40),
      liq: roundedPolyline([[lo.x, G.Ri - 4], [lo.x, lo.yH], [G.xEdge + 40, lo.yH]], 36),
      inlet: withLengths([[inl.xEdge - 40, inl.y], [inl.xIn + 2, inl.y]]),
      // lazo de nivel: TN → LIC (RTU) → LV
      senal: withLengths(tnS),
      senal2: withLengths([[lic.x, lic.y + 28], [G.lv, aLV]]),
      // lazo de presión: TPS → PIC (RTU) → PV
      senalP1: withLengths([[G.tps, -246], [G.tps, G.ySenalTPS], [pic.x - 36, G.ySenalTPS]]),
      senalP2: withLengths([[pic.x, pic.y + 28], [G.pv, aPV]])
    };
  }

  /* ==================================================================
     DIBUJO — fondo, remolque, recipiente
     ================================================================== */
  function drawBackground(ctx, S) {
    var W = S.W, H = S.H;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a2142'); g.addColorStop(0.55, '#081b38'); g.addColorStop(1, '#050f22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var c = S.toScreen(0, -20), rr = Math.max(W, H) * 0.7;
    var rg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr);
    rg.addColorStop(0, 'rgba(79,179,232,0.16)'); rg.addColorStop(0.5, 'rgba(79,179,232,0.05)'); rg.addColorStop(1, 'rgba(79,179,232,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    // retícula tipo plano (se mueve con la cámara)
    S.world(ctx);
    var x0 = S.view.x0, x1 = S.view.x1, y0 = S.view.y0, y1 = S.view.y1, step = 50;
    ctx.lineWidth = 1 / S.scale;
    for (var x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      ctx.strokeStyle = (Math.round(x) % 250 === 0) ? 'rgba(127,202,242,0.075)' : 'rgba(127,202,242,0.035)';
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    }
    for (var y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      ctx.strokeStyle = (Math.round(y) % 250 === 0) ? 'rgba(127,202,242,0.075)' : 'rgba(127,202,242,0.035)';
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
  }

  function drawGroundAndTrailer(ctx, S) {
    var fy = G.frameY, wr = G.wheelR, wy = fy + 40;
    // sombra en el piso
    ctx.save(); ctx.translate(30, wy + wr + 4); ctx.scale(1, 0.05);
    var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(0.7, 'rgba(0,0,0,0.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 760, 0, TAU); ctx.fill(); ctx.restore();
    // línea de piso (grava / caliche)
    var gg = ctx.createLinearGradient(-800, 0, 800, 0);
    gg.addColorStop(0, 'rgba(214,196,160,0)'); gg.addColorStop(0.2, 'rgba(214,196,160,0.22)'); gg.addColorStop(0.8, 'rgba(214,196,160,0.22)'); gg.addColorStop(1, 'rgba(214,196,160,0)');
    ctx.fillStyle = gg; ctx.fillRect(-820, wy + wr + 2, 1640, 2);
    // suspensión (muelles) entre llantas
    ctx.fillStyle = '#20262e';
    ctx.fillRect(G.wheels[0] - 30, fy + 26, G.wheels[1] - G.wheels[0] + 60, 8);
    // llantas doble eje (rin blanco, como en la foto 05)
    for (var i = 0; i < G.wheels.length; i++) drawWheel(ctx, G.wheels[i], wy, wr);
    // lanza / enganche
    ctx.fillStyle = EQ.remolqueOsc;
    ctx.beginPath(); ctx.moveTo(-650, fy + 2); ctx.lineTo(-770, fy + 16); ctx.lineTo(-770, fy + 24); ctx.lineTo(-650, fy + 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b3138'; ctx.fillRect(-792, fy + 12, 26, 14);
    // silletas
    for (i = 0; i < G.saddles.length; i++) drawSaddle(ctx, G.saddles[i]);
    // bastidor (cara superior + cara frontal)
    ctx.fillStyle = mix(EQ.remolque, '#ffffff', 0.25);
    ctx.beginPath(); ctx.moveTo(-650, fy); ctx.lineTo(700, fy); ctx.lineTo(708, fy - 7); ctx.lineTo(-642, fy - 7); ctx.closePath(); ctx.fill();
    var fg = ctx.createLinearGradient(0, fy, 0, fy + 26);
    fg.addColorStop(0, EQ.remolque); fg.addColorStop(0.55, mix(EQ.remolque, EQ.remolqueOsc, 0.35)); fg.addColorStop(1, EQ.remolqueOsc);
    ctx.fillStyle = fg; ctx.fillRect(-650, fy, 1350, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-650, fy, 1350, 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (var x = -600; x < 700; x += 150) ctx.fillRect(x, fy + 3, 2, 20);
  }
  function drawWheel(ctx, x, y, r) {
    var tg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r);
    tg.addColorStop(0, '#3a4049'); tg.addColorStop(0.7, EQ.llanta); tg.addColorStop(1, '#07090b');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    for (var k = 0; k < 24; k++) { var a = k / 24 * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6)); ctx.lineTo(x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1)); ctx.stroke(); }
    var rg = ctx.createRadialGradient(x - 8, y - 10, 2, x, y, r * 0.6);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.6, EQ.rin); rg.addColorStop(1, '#9aa5b1');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r * 0.58, 0, TAU); ctx.fill();
    ctx.fillStyle = '#56606b';
    for (k = 0; k < 6; k++) { var b = k / 6 * TAU + 0.3; ctx.beginPath(); ctx.ellipse(x + Math.cos(b) * r * 0.4, y + Math.sin(b) * r * 0.4, 4.2, 6, b, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#2b3138'; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c9d1da';
    for (k = 0; k < 6; k++) { var c2 = k / 6 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(c2) * r * 0.13, y + Math.sin(c2) * r * 0.13, 1.6, 0, TAU); ctx.fill(); }
  }
  function drawSaddle(ctx, x) {
    var top = G.R - 3, bot = G.frameY - 7, i;
    // silleta curva bajo el casco
    var sg = ctx.createLinearGradient(0, top, 0, top + 18);
    sg.addColorStop(0, EQ.verdeLuz); sg.addColorStop(1, EQ.verdeSombra);
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(x - 62, top); ctx.lineTo(x + 62, top); ctx.lineTo(x + 54, top + 18); ctx.lineTo(x - 54, top + 18); ctx.closePath(); ctx.fill();
    // postes (perfil I) y contraviento
    for (i = -1; i <= 1; i += 2) {
      var px = x + i * 40;
      var pg = ctx.createLinearGradient(px - 8, 0, px + 8, 0);
      pg.addColorStop(0, EQ.verdeSombra); pg.addColorStop(0.4, EQ.verdeLuz); pg.addColorStop(1, EQ.verde);
      ctx.fillStyle = pg; ctx.fillRect(px - 8, top + 18, 16, bot - top - 18);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px - 2, top + 18, 4, bot - top - 18);
    }
    ctx.strokeStyle = EQ.verde; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x - 36, top + 24); ctx.lineTo(x + 36, bot - 8); ctx.stroke();
    ctx.fillStyle = '#1b2228'; ctx.fillRect(x - 56, bot - 5, 112, 6);
  }

  /* Recipiente: franja exterior superior, pared trasera interior, achurado */
  function drawShellBack(ctx, S) {
    // franja exterior visible por la elevación (parte superior de la mitad trasera)
    stadium(ctx, G.xT, G.A, G.R + 9, G.R);
    var eg = ctx.createLinearGradient(0, -G.R - 9, 0, -G.R + 6);
    eg.addColorStop(0, EQ.verdeLuz); eg.addColorStop(1, EQ.verde);
    ctx.fillStyle = eg; ctx.fill();
    // pared interior trasera (sombreado cilíndrico cóncavo)
    stadium(ctx, G.xT, G.Ai, G.Ri, G.Ri);
    var ig = ctx.createLinearGradient(0, -G.Ri, 0, G.Ri);
    ig.addColorStop(0, EQ.interiorOsc); ig.addColorStop(0.16, EQ.interior); ig.addColorStop(0.46, EQ.interiorLuz);
    ig.addColorStop(0.78, EQ.interior); ig.addColorStop(1, EQ.interiorOsc);
    ctx.fillStyle = ig; ctx.fill();
    ctx.save(); ctx.clip();
    var hg = ctx.createLinearGradient(-G.xT - G.Ai, 0, G.xT + G.Ai, 0);
    hg.addColorStop(0, 'rgba(6,14,28,0.6)'); hg.addColorStop(0.1, 'rgba(6,14,28,0.15)'); hg.addColorStop(0.5, 'rgba(6,14,28,0)');
    hg.addColorStop(0.9, 'rgba(6,14,28,0.15)'); hg.addColorStop(1, 'rgba(6,14,28,0.6)');
    ctx.fillStyle = hg; ctx.fillRect(-G.xT - G.Ai, -G.Ri, 2 * (G.xT + G.Ai), 2 * G.Ri);
    var lg = ctx.createRadialGradient(-180, -90, 10, -180, -90, 520);
    lg.addColorStop(0, 'rgba(220,236,255,0.16)'); lg.addColorStop(1, 'rgba(220,236,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(-G.xT - G.Ai, -G.Ri, 2 * (G.xT + G.Ai), 2 * G.Ri);
    // sombra bajo el corte superior
    var sg = ctx.createLinearGradient(0, -G.Ri, 0, -G.Ri + 26);
    sg.addColorStop(0, 'rgba(3,8,18,0.55)'); sg.addColorStop(1, 'rgba(3,8,18,0)');
    ctx.fillStyle = sg; ctx.fillRect(-G.xT - G.Ai, -G.Ri, 2 * (G.xT + G.Ai), 26);
    // costuras de soldadura (circunferenciales y tapa-cuerpo)
    var seams = [-G.xT, -150, 160, G.xT];
    for (var i = 0; i < seams.length; i++) {
      ctx.strokeStyle = 'rgba(8,16,30,0.35)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(seams[i], -G.Ri); ctx.quadraticCurveTo(seams[i] + 10, 0, seams[i], G.Ri); ctx.stroke();
      ctx.strokeStyle = 'rgba(220,236,255,0.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(seams[i] + 2, -G.Ri); ctx.quadraticCurveTo(seams[i] + 12, 0, seams[i] + 2, G.Ri); ctx.stroke();
    }
    // costura longitudinal y anillos concéntricos de las tapas
    ctx.strokeStyle = 'rgba(8,16,30,0.22)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-G.xT, -G.Ri * 0.62); ctx.lineTo(G.xT, -G.Ri * 0.62); ctx.stroke();
    for (var k = 1; k <= 3; k++) {
      ctx.strokeStyle = 'rgba(8,16,30,' + (0.1 + k * 0.03) + ')';
      ctx.beginPath(); ctx.ellipse(-G.xT, 0, G.Ai * k / 4, G.Ri * (0.35 + k * 0.17), 0, PI / 2, PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(G.xT, 0, G.Ai * k / 4, G.Ri * (0.35 + k * 0.17), 0, -PI / 2, PI / 2); ctx.stroke();
    }
    ctx.restore();
  }

  /* Gas en el espacio superior (tinte leve) y turbulencia junto a la entrada */
  function drawGasSpace(ctx, S) {
    ctx.save();
    stadium(ctx, G.xT, G.Ai, G.Ri, G.Ri); ctx.clip();
    var g = ctx.createLinearGradient(0, -G.Ri, 0, S.lvl);
    g.addColorStop(0, rgba(C.gas, 0.07)); g.addColorStop(1, rgba(C.gas, 0.015));
    ctx.fillStyle = g; ctx.fillRect(-G.xT - G.Ai, -G.Ri, 2 * (G.xT + G.Ai), S.lvl + G.Ri);
    var m = ctx.createRadialGradient(-470, -60, 4, -470, -60, 170);
    m.addColorStop(0, rgba(C.mezclaClaro, 0.22 + 0.12 * S.em.choque)); m.addColorStop(1, rgba(C.mezclaClaro, 0));
    ctx.fillStyle = m; ctx.fillRect(-G.xT - G.Ai, -G.Ri, 330, 2 * G.Ri);
    ctx.restore();
  }

  /* Corte de la pared (sección achurada) y franjas de luz */
  function drawShellCut(ctx, S) {
    ctx.save();
    ctx.beginPath();
    stadiumSub(ctx, G.xT, G.A, G.R, G.R);
    stadiumSub(ctx, G.xT, G.Ai, G.Ri, G.Ri);
    ctx.fillStyle = EQ.acero; ctx.fill('evenodd');
    ctx.clip('evenodd');
    hatch(ctx, -G.xT - G.A - 10, -G.R - 10, 2 * (G.xT + G.A) + 20, 2 * G.R + 20, 6.5, 'rgba(40,58,82,0.55)', 0.9);
    ctx.restore();
    ctx.lineWidth = 1.4; ctx.strokeStyle = EQ.aceroLuz;
    stadium(ctx, G.xT, G.A, G.R, G.R); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = EQ.aceroOsc;
    stadium(ctx, G.xT, G.Ai, G.Ri, G.Ri); ctx.stroke();
  }
  function stadiumSub(ctx, xT, a, rT, rB) { // subtrayecto sin beginPath
    ctx.moveTo(-xT, -rT); ctx.lineTo(xT, -rT);
    ctx.ellipse(xT, 0, a, rT, 0, -PI / 2, 0); ctx.ellipse(xT, 0, a, rB, 0, 0, PI / 2);
    ctx.lineTo(-xT, rB);
    ctx.ellipse(-xT, 0, a, rB, 0, PI / 2, PI); ctx.ellipse(-xT, 0, a, rT, 0, PI, PI * 1.5);
    ctx.closePath();
  }
  function hatch(ctx, x, y, w, h, gap, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1;
    ctx.beginPath();
    for (var d = -h; d < w; d += gap) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); }
    ctx.stroke();
  }

  /* ==================================================================
     FLUIDOS
     ================================================================== */
  function waveAmp(x, S) { var d = Math.max(0, x + G.xT); return 0.9 + (3.2 + 2.6 * S.em.choque) * Math.exp(-d / 230); }
  function waveY(x, d, S) {
    var a = waveAmp(x, S);
    return a * (Math.sin(x * 0.052 - S.t * 3.1 + d * 0.04) + 0.45 * Math.sin(x * 0.113 + S.t * 2.2 + 0.7 + d * 0.07));
  }
  function deflFaceX(y) { // cara izquierda (cóncava hacia la entrada) del deflector
    var d = G.defl, ym = (d.y0 + d.y1) / 2, hh = (d.y1 - d.y0) / 2, q = (y - ym) / hh;
    return d.x - d.th / 2 + d.bow * (1 - q * q);
  }

  function liquidFront(S) {
    var yL = S.lvl, ex0 = headX(yL, G.Ai, G.Ri), xa = -G.xT - ex0, xb = G.xT + ex0, pts = [];
    for (var x = xa; x < xb; x += 8) pts.push([x, yL + waveY(x, 0, S)]);
    pts.push([xb, yL + waveY(xb, 0, S)]);
    return pts;
  }

  function drawLiquidSurface(ctx, S) {
    var yL = S.lvl, w = depthAt(yL), front = S.front, N = 14, i, d, ex;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(front[0][0], front[0][1]);
    for (i = 1; i < front.length; i++) ctx.lineTo(front[i][0], front[i][1]);
    for (i = 1; i <= N; i++) { d = w * i / N; ex = G.Ai * Math.sqrt(Math.max(0, 1 - (yL * yL + d * d) / (G.Ri * G.Ri))); ctx.lineTo(G.xT + ex, yL - d * G.K); }
    for (i = N; i >= 0; i--) { d = w * i / N; ex = G.Ai * Math.sqrt(Math.max(0, 1 - (yL * yL + d * d) / (G.Ri * G.Ri))); ctx.lineTo(-G.xT - ex, yL - d * G.K); }
    ctx.closePath();
    ctx.fillStyle = C.liquido; ctx.fill();
    ctx.clip();
    var top = yL - w * G.K;
    var g = ctx.createLinearGradient(0, top, 0, yL + 4);
    g.addColorStop(0, 'rgba(120,150,190,0.10)'); g.addColorStop(0.45, rgba(C.ambar, 0.08)); g.addColorStop(1, rgba(C.ambar, 0.30));
    ctx.fillStyle = g; ctx.fillRect(-G.xT - G.Ai, top - 4, 2 * (G.xT + G.Ai), yL - top + 12);
    // ondas (más agitadas junto a la entrada, calmas en la sección de asentamiento)
    for (var k = 1; k <= 7; k++) {
      d = w * k / 8;
      var y0 = yL - d * G.K, fade = 1 - d / w;
      ex = G.Ai * Math.sqrt(Math.max(0, 1 - (yL * yL + d * d) / (G.Ri * G.Ri)));
      ctx.beginPath();
      for (var x = -G.xT - ex; x <= G.xT + ex; x += 10) {
        var yy = y0 + waveY(x, d, S) * (0.35 + 0.5 * fade);
        if (x === -G.xT - ex) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = rgba(C.ambar, 0.08 + 0.26 * fade); ctx.lineWidth = 1.1; ctx.stroke();
      ctx.translate(0, 1.6); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.9; ctx.stroke(); ctx.translate(0, -1.6);
    }
    // reflejos especulares que se deslizan
    for (var j = 0; j < 7; j++) {
      var xs = -430 + frac(j * 0.173 + S.t * 0.018) * 860, ys = yL - w * G.K * (0.25 + 0.1 * (j % 3));
      var hl = ctx.createRadialGradient(xs, ys, 0, xs, ys, 46);
      hl.addColorStop(0, 'rgba(255,214,150,0.20)'); hl.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.save(); ctx.translate(xs, ys); ctx.scale(1, 0.12); ctx.translate(-xs, -ys);
      ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(xs, ys, 46, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  function liquidSectionPath(ctx, S) {
    var front = S.front, aL = Math.asin(clamp(S.lvl / G.Ri, -1, 1));
    ctx.beginPath(); ctx.moveTo(front[0][0], front[0][1]);
    for (var i = 1; i < front.length; i++) ctx.lineTo(front[i][0], front[i][1]);
    ctx.ellipse(G.xT, 0, G.Ai, G.Ri, 0, aL, PI / 2);
    ctx.lineTo(-G.xT, G.Ri);
    ctx.ellipse(-G.xT, 0, G.Ai, G.Ri, 0, PI / 2, PI - aL);
    ctx.closePath();
  }

  function drawLiquidSection(ctx, S) {
    var yL = S.lvl, t = S.t, P = S.P, i;
    ctx.save();
    liquidSectionPath(ctx, S);
    var g = ctx.createLinearGradient(0, yL - 4, 0, G.Ri);
    g.addColorStop(0, '#3d2814'); g.addColorStop(0.07, '#24170b'); g.addColorStop(0.55, C.liquido); g.addColorStop(1, '#060302');
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    var gl = ctx.createLinearGradient(0, yL, 0, yL + 40);
    gl.addColorStop(0, rgba(C.ambar, 0.28)); gl.addColorStop(1, rgba(C.ambar, 0));
    ctx.fillStyle = gl; ctx.fillRect(-G.xT - G.Ai, yL - 6, 2 * (G.xT + G.Ai), 50);
    // corrientes internas del líquido hacia la salida
    ctx.lineCap = 'round';
    for (i = 0; i < P.liqStreak.length; i++) {
      var s = P.liqStreak[i], u = frac(s.ph + t / s.T), y = lerp(yL + 12, G.Ri - 10, s.yf);
      var x = -500 + u * 900, a = Math.sin(u * PI) * 0.16;
      ctx.strokeStyle = rgba(C.ambar, a); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s.len, y + Math.sin(x * 0.02 + t) * 1.5); ctx.stroke();
    }
    // convergencia hacia la boquilla de salida de líquido (velocidad ∝ apertura LV)
    ctx.setLineDash([7, 9]); ctx.lineDashOffset = -t * 34;
    ctx.strokeStyle = rgba(C.ambar, 0.18 + 0.4 * S.open / 100); ctx.lineWidth = 1.4;
    var lx = G.liqOut.x;
    for (i = 0; i < 4; i++) {
      var sx = lx - 150 + i * 34, sy = lerp(yL + 30, G.Ri - 30, i / 3);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(lx - 10 + i * 4, sy + 10, lx - 8 + i * 5, G.Ri + 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    // burbujas de gas liberadas que suben (aceleran y crecen al bajar la presión)
    var nB = Math.round(70 + 60 * S.em.liberacion);
    for (i = 0; i < Math.min(nB, P.bubbles.length); i++) {
      var b = P.bubbles[i], ub = frac(b.ph + t / b.T);
      var y0 = lerp(yL + 16, G.Ri - 8, b.d0);
      if (y0 < yL + 8) continue;
      var k = Math.min(1, ub / 0.86), yb = y0 - (y0 - yL - 2) * Math.pow(k, 1.7);
      if (ub > 0.86) continue;
      var xb = b.x0 + 22 * k + b.wob * Math.sin(k * b.wf + b.ph * 6);
      var rb = b.r0 * (0.65 + 0.6 * k) * (1 + 0.25 * S.em.liberacion * (b.inlet ? 1 : 0));
      var ab = seg(ub, 0, 0.1) * (b.inlet ? 1 : 0.75);
      drawBubble(ctx, xb, yb, rb, ab);
    }
    ctx.restore();
    // anillos en la superficie: burbujas que revientan y gotas que llegan
    for (i = 0; i < Math.min(nB, P.bubbles.length); i++) {
      var bb = P.bubbles[i], uu = frac(bb.ph + t / bb.T);
      if (uu <= 0.86) continue;
      var y00 = lerp(yL + 16, G.Ri - 8, bb.d0); if (y00 < yL + 8) continue;
      var kk = seg(uu, 0.86, 1), xr = bb.x0 + 22 + bb.wob * Math.sin(bb.wf + bb.ph * 6);
      ring(ctx, xr, yL + waveY(xr, 0, S), 2 + kk * 10 * (0.6 + bb.r0 / 5), C.gas, (1 - kk) * 0.75);
    }
    // menisco (borde frontal del corte)
    var front = S.front;
    ctx.beginPath(); ctx.moveTo(front[0][0], front[0][1]);
    for (i = 1; i < front.length; i++) ctx.lineTo(front[i][0], front[i][1]);
    ctx.strokeStyle = rgba(C.ambar, 0.9); ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = 0.6; ctx.stroke();
  }
  function drawBubble(ctx, x, y, r, a) {
    if (a <= 0.01) return;
    ctx.fillStyle = rgba(C.gas, 0.14 * a + 0.04);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,232,160,' + (0.8 * a).toFixed(3) + ')'; ctx.lineWidth = Math.max(0.6, r * 0.18);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.38, Math.max(0.5, r * 0.28), 0, TAU); ctx.fill();
  }
  function ring(ctx, x, y, r, col, a) {
    if (a <= 0.01) return;
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.28, 0, 0, TAU); ctx.stroke();
  }
  function drawDrop(ctx, x, y, r, a, stretch) {
    if (a <= 0.01) return;
    var s = 1 + (stretch || 0);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = C.liquido;
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.6 * s);
    ctx.bezierCurveTo(x + r * 0.9, y - r * 0.4 * s, x + r, y + r * 0.7, x, y + r);
    ctx.bezierCurveTo(x - r, y + r * 0.7, x - r * 0.9, y - r * 0.4 * s, x, y - r * 1.6 * s);
    ctx.fill();
    ctx.strokeStyle = rgba(C.ambar, 0.9); ctx.lineWidth = Math.max(0.5, r * 0.22); ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,190,0.85)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y + r * 0.05, Math.max(0.4, r * 0.25), 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* Gotas que caen por gravedad en el espacio de gas */
  function drawFallingDrops(ctx, S) {
    var P = S.P, t = S.t, n = Math.round(24 + 20 * S.em.asentamiento);
    for (var i = 0; i < Math.min(n, P.drops.length); i++) {
      var d = P.drops[i], u = frac(d.ph + t / d.T), k = Math.min(1, u / 0.82);
      var x = d.x0 + 34 * k, y = d.y0 + (S.lvl - d.y0) * k * k;
      if (u < 0.82) {
        var a = seg(u, 0, 0.12) * (0.85 + 0.15 * S.em.asentamiento);
        ctx.strokeStyle = rgba(C.ambar, 0.25 * a); ctx.lineWidth = d.r0 * 0.5;
        ctx.beginPath(); ctx.moveTo(x - 6 * k, y - 12 * k - 2); ctx.lineTo(x, y - d.r0); ctx.stroke();
        drawDrop(ctx, x, y, d.r0, a, k * 0.6);
      } else {
        var kk = seg(u, 0.82, 1), xr = d.x0 + 34;
        ring(ctx, xr, S.lvl + waveY(xr, 0, S), 2 + kk * 9, C.ambar, (1 - kk) * 0.7);
      }
    }
  }

  /* Chorro de entrada, choque contra el deflector y salpicadura */
  function drawInletJet(ctx, S) {
    var t = S.t, y = G.inlet.y, x0 = G.inlet.xIn, xI = deflFaceX(y) - 1, P = S.P, i, x;
    ctx.save();
    stadium(ctx, G.xT, G.Ai, G.Ri, G.Ri); ctx.clip();
    // pluma del chorro (se abre al salir de la boquilla)
    function hw(xx) { return 17 + 13 * Math.pow((xx - x0) / (xI - x0), 1.3); }
    ctx.beginPath();
    for (x = x0; x <= xI; x += 4) ctx.lineTo(x, y - hw(x) + 1.8 * Math.sin(x * 0.21 - t * 22));
    for (x = xI; x >= x0; x -= 4) ctx.lineTo(x, y + hw(x) + 1.8 * Math.sin(x * 0.19 - t * 19 + 1));
    ctx.closePath();
    var jg = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    jg.addColorStop(0, rgba(C.mezclaClaro, 0.55)); jg.addColorStop(0.5, rgba(C.mezcla, 0.95)); jg.addColorStop(1, rgba(C.mezcla, 0.7));
    ctx.fillStyle = jg; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.setLineDash([12, 14]); ctx.lineDashOffset = -t * 260; ctx.lineWidth = 1.4;
    for (i = -3; i <= 3; i++) {
      ctx.strokeStyle = rgba(C.mezclaClaro, 0.75 - Math.abs(i) * 0.08);
      ctx.beginPath(); ctx.moveTo(x0, y + i * 5); ctx.lineTo(xI, y + i * 8.5); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (i = 0; i < P.slugs.length; i++) { // bolsas de gas dentro de la mezcla
      var sl = P.slugs[i], u = frac(sl.ph + t / sl.T * 0.5), xs = lerp(x0 - 20, xI, u);
      if (i % 2) continue;
      ctx.fillStyle = rgba(C.gas, 0.45 * Math.sin(u * PI));
      ctx.beginPath(); ctx.ellipse(xs, y + sl.yo * hw(xs), sl.len * 0.6, 1.3, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // corona de salpicadura en la placa
    ctx.lineCap = 'round';
    for (i = 0; i < 15; i++) {
      var f = i / 14 - 0.5, a = PI + f * PI * 0.92, len = (12 + 14 * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.7))) * (1 + 0.4 * S.em.choque);
      var px = deflFaceX(y + f * 46) - 1, py = y + f * 46;
      ctx.strokeStyle = rgba(i % 3 === 0 ? C.gas : C.mezclaClaro, 0.7); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len * 1.3); ctx.stroke();
    }
    // película de líquido que escurre por la cara del deflector
    ctx.setLineDash([6, 7]); ctx.lineDashOffset = -t * 70;
    ctx.strokeStyle = rgba(C.ambar, 0.8); ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (var yy = y + 18; yy <= G.defl.y1; yy += 4) { var fx = deflFaceX(yy) - 2.5; if (yy === y + 18) ctx.moveTo(fx, yy); else ctx.lineTo(fx, yy); }
    ctx.stroke(); ctx.setLineDash([]);
    for (i = 0; i < P.film.length; i++) {
      var fm = P.film[i], uf = frac(fm.ph + t / fm.T), yf = G.defl.y1 + (S.lvl - G.defl.y1) * uf * uf;
      if (yf < S.lvl) drawDrop(ctx, deflFaceX(G.defl.y1) + fm.xo, yf, fm.r, 0.95, uf);
    }
    // partículas de salpicadura: gotas (balísticas) y bocanadas de gas (suben)
    var nS = Math.round(46 + 30 * S.em.choque);
    for (i = 0; i < Math.min(nS, P.splash.length); i++) {
      var sp = P.splash[i], us = frac(sp.ph + t / sp.T), tau = us * sp.T;
      if (sp.liq) {
        var lx = xI - 2 + sp.vx * tau, ly = y + sp.vy * tau + 260 * tau * tau;
        if (ly > S.lvl || lx < -G.xT - headX(ly, G.Ai, G.Ri) + 3) continue;
        drawDrop(ctx, lx, ly, sp.r, 1 - us * 0.4, 0.3);
      } else {
        var gx = xI + sp.vx * tau * 0.6, gy = y + sp.vy * tau;
        var gr = sp.r * (1 + us * 1.8);
        var pg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        pg.addColorStop(0, rgba(C.gas, 0.45 * (1 - us))); pg.addColorStop(1, rgba(C.gas, 0));
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* Líneas de corriente del gas: discontinuas que avanzan + flechas */
  function gasClip(ctx) {
    var go = G.gasOut;
    ctx.beginPath();
    stadiumSub(ctx, G.xT, G.Ai, G.Ri, G.Ri);
    ctx.rect(go.x - go.r, go.yH - go.r, 2 * go.r, (-G.Ri + 6) - (go.yH - go.r));
    ctx.rect(go.x - go.r, go.yH - go.r, G.xEdge + 60 - (go.x - go.r), 2 * go.r);
    ctx.clip();
  }
  function drawStreams(ctx, S) {
    var t = S.t, e = S.em.gas, a = 0.42 + 0.48 * e + 0.15 * S.em.niebla, i, j;
    ctx.save(); gasClip(ctx);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (i = 0; i < S.streams.length; i++) {
      var p = S.streams[i];
      strokePath(ctx, p);
      ctx.strokeStyle = rgba(C.gas, 0.05 + 0.08 * e); ctx.lineWidth = 7; ctx.stroke();
      ctx.setLineDash([16, 18]); ctx.lineDashOffset = -t * (62 + 30 * e) - i * 9;
      ctx.strokeStyle = rgba(C.gas, a); ctx.lineWidth = 1.5 + 0.9 * e; ctx.stroke();
      ctx.setLineDash([]);
      for (j = 0; j < 3; j++) {
        var q = along(p, frac(t * 0.05 + i * 0.137 + j / 3) * p.len);
        chevron(ctx, q.x, q.y, q.tx, q.ty, 5 + 2 * e, rgba(C.gas, Math.min(1, a + 0.25)));
      }
    }
    ctx.restore();
  }
  function chevron(ctx, x, y, tx, ty, s, col) {
    var nx = -ty, ny = tx;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - tx * s + nx * s * 0.7, y - ty * s + ny * s * 0.7); ctx.lineTo(x, y);
    ctx.lineTo(x - tx * s - nx * s * 0.7, y - ty * s - ny * s * 0.7);
    ctx.stroke();
  }

  /* Niebla arrastrada → atrapada en la malla */
  function drawMist(ctx, S) {
    var P = S.P, t = S.t, n = Math.round(90 + 80 * S.em.niebla), pad = G.pad;
    ctx.save(); stadium(ctx, G.xT, G.Ai, G.Ri, G.Ri); ctx.clip();
    for (var i = 0; i < Math.min(n, P.mist.length); i++) {
      var m = P.mist[i], path = S.streams[m.line], u = frac(m.ph + t / m.T), x, y, a, col;
      if (u < 0.72) {
        var q = along(path, (u / 0.72) * path.sPad);
        x = q.x - q.ty * m.j; y = q.y + q.tx * m.j; a = seg(u, 0, 0.08) * 0.85;
        col = C.ambar;
        if (y > S.lvl - 3) continue;
      } else {
        var k = seg(u, 0.72, 0.8), q2 = along(path, path.sPad);
        x = pad.x0 + 3 + (pad.x1 - pad.x0 - 8) * m.pen * k; y = q2.y + q2.tx * m.j + 10 * seg(u, 0.72, 1);
        a = 1 - seg(u, 0.86, 1); col = '#ffd27a';
      }
      ctx.fillStyle = rgba(col, a);
      ctx.beginPath(); ctx.arc(x, y, m.r * (u < 0.72 ? 1 : 1.25), 0, TAU); ctx.fill();
      if (u >= 0.72) { ctx.fillStyle = rgba(C.ambar, a * 0.25); ctx.beginPath(); ctx.arc(x, y, m.r * 3, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }
  /* Gotas que coalescen en la malla y escurren al líquido */
  function drawCoalescence(ctx, S) {
    var P = S.P, t = S.t, pad = G.pad;
    for (var i = 0; i < P.coal.length; i++) {
      var c = P.coal[i], u = frac(c.ph + t / c.T), x = c.x, y, r;
      if (u < 0.55) { r = lerp(0.8, c.rMax, easeOut(u / 0.55)); y = c.y0; drawDrop(ctx, x, y, r, seg(u, 0, 0.1), 0); }
      else if (u < 0.8) {
        var k = (u - 0.55) / 0.25; r = c.rMax; y = lerp(c.y0, pad.y1 + 2, k * k);
        ctx.strokeStyle = rgba(C.ambar, 0.35); ctx.lineWidth = r * 0.6;
        ctx.beginPath(); ctx.moveTo(x, c.y0); ctx.lineTo(x, y - r); ctx.stroke();
        drawDrop(ctx, x, y, r, 1, 0.3);
      } else {
        var kk = (u - 0.8) / 0.2; y = pad.y1 + 2 + (S.lvl - pad.y1) * kk * kk; r = c.rMax;
        if (y < S.lvl) drawDrop(ctx, x, y, r, 1, kk);
        else ring(ctx, x, S.lvl, 4 + 8 * kk, C.ambar, 0.6);
      }
    }
  }

  /* Deflector de entrada (placa de choque cóncava, en sección) */
  function drawDeflector(ctx, S) {
    var d = G.defl, y;
    ctx.strokeStyle = EQ.aceroOsc; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x - 2, d.y0 - 18); ctx.lineTo(d.x - 34, -G.Ri + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(d.x + 2, d.y0 - 18); ctx.lineTo(d.x + 30, -G.Ri + 2); ctx.stroke();
    // cara superior (profundidad hacia atrás)
    var top = d.y0 - depthAt(d.y0) * G.K, fx = deflFaceX(d.y0);
    var tg = ctx.createLinearGradient(0, top, 0, d.y0);
    tg.addColorStop(0, EQ.aceroOsc); tg.addColorStop(1, EQ.aceroLuz);
    ctx.fillStyle = tg; ctx.fillRect(fx, top, d.th, d.y0 - top);
    // sección
    ctx.save();
    ctx.beginPath();
    for (y = d.y0; y <= d.y1; y += 3) ctx.lineTo(deflFaceX(y), y);
    for (y = d.y1; y >= d.y0; y -= 3) ctx.lineTo(deflFaceX(y) + d.th, y);
    ctx.closePath();
    ctx.fillStyle = EQ.acero; ctx.fill();
    ctx.strokeStyle = EQ.aceroOsc; ctx.lineWidth = 1; ctx.stroke();
    ctx.clip(); hatch(ctx, d.x - 20, d.y0, 40, d.y1 - d.y0, 5, 'rgba(40,58,82,0.6)', 0.8);
    ctx.restore();
    ctx.strokeStyle = EQ.aceroLuz; ctx.lineWidth = 0.8;
    ctx.beginPath(); for (y = d.y0; y <= d.y1; y += 3) ctx.lineTo(deflFaceX(y), y); ctx.stroke();
  }

  /* Extractor de niebla (malla tejida: achurado fino) */
  function drawPad(ctx, S) {
    var p = G.pad, w = p.x1 - p.x0, h = p.y1 - p.y0, e = S.em.niebla;
    ctx.save();
    ctx.fillStyle = rgba(EQ.acero, 0.26 + 0.12 * e); ctx.fillRect(p.x0, p.y0, w, h);
    ctx.beginPath(); ctx.rect(p.x0, p.y0, w, h); ctx.clip();
    hatch(ctx, p.x0, p.y0, w, h, 4.2, 'rgba(225,236,248,0.42)', 0.55);
    ctx.save(); ctx.translate(p.x0 + w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(p.x0 + w / 2), 0);
    hatch(ctx, p.x0, p.y0, w, h, 4.2, 'rgba(225,236,248,0.30)', 0.55);
    ctx.restore();
    ctx.strokeStyle = 'rgba(30,45,66,0.35)'; ctx.lineWidth = 0.7;
    for (var yy = p.y0 + 6; yy < p.y1; yy += 9) {
      ctx.beginPath();
      for (var xx = p.x0; xx <= p.x1; xx += 3) ctx.lineTo(xx, yy + 1.4 * Math.sin(xx * 0.9 + yy));
      ctx.stroke();
    }
    ctx.restore();
    // rejillas soporte
    ctx.fillStyle = EQ.aceroOsc; ctx.fillRect(p.x0 - 3, p.y0 - 3, w + 6, 5); ctx.fillRect(p.x0 - 3, p.y1 - 2, w + 6, 5);
    ctx.fillStyle = EQ.aceroLuz; ctx.fillRect(p.x0 - 3, p.y0 - 3, w + 6, 1.2); ctx.fillRect(p.x0 - 3, p.y1 - 2, w + 6, 1.2);
    ctx.strokeStyle = EQ.aceroLuz; ctx.lineWidth = 1;
    ctx.strokeRect(p.x0, p.y0, w, h);
    if (e > 0) {
      ctx.strokeStyle = rgba(C.celeste, 0.7 * e); ctx.lineWidth = 2;
      ctx.strokeRect(p.x0 - 5, p.y0 - 5, w + 10, h + 10);
    }
  }

  /* Sonda del TN (pulso que baja hasta la superficie) y termopozo del TT */
  function probePulse(ctx, S, x, yTop, rr) {
    var k = frac(S.t / 1.15), yp = lerp(yTop + 8, S.lvl, easeInOut(k)), ap = (0.55 + 0.45 * S.em.nivel) * (1 - seg(k, 0.85, 1) * 0.5);
    var pg = ctx.createRadialGradient(x, yp, 0, x, yp, 12);
    pg.addColorStop(0, rgba(C.celeste, ap)); pg.addColorStop(1, rgba(C.celeste, 0));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, yp, 12, 0, TAU); ctx.fill();
    if (k > 0.8) ring(ctx, x, S.lvl, 4 + (rr || 22) * seg(k, 0.8, 1), C.celeste, (1 - seg(k, 0.8, 1)) * (0.6 + 0.4 * S.em.nivel));
  }
  function drawProbes(ctx, S) {
    var x = G.tn, yTop = -G.R, yBot = 136;
    ctx.save(); stadium(ctx, G.xT, G.Ai, G.Ri, G.Ri); ctx.clip();
    if (!G.tnLateral) {
      rod(ctx, x, yTop, yBot, 4.4, S);
      ctx.fillStyle = EQ.aceroOsc; ctx.fillRect(x - 4, yBot - 2, 8, 12);
      probePulse(ctx, S, x, yTop);
    }
    // termopozo TT (cónico)
    var tx = G.tt, tb = 64;
    ctx.beginPath(); ctx.moveTo(tx - 5, yTop); ctx.lineTo(tx + 5, yTop); ctx.lineTo(tx + 3.2, tb); ctx.arc(tx, tb, 3.2, 0, PI); ctx.closePath();
    var tg = ctx.createLinearGradient(tx - 5, 0, tx + 5, 0);
    tg.addColorStop(0, EQ.aceroOsc); tg.addColorStop(0.4, EQ.aceroLuz); tg.addColorStop(1, EQ.aceroOsc);
    ctx.fillStyle = tg; ctx.fill();
    ctx.fillStyle = 'rgba(10,6,3,0.55)'; ctx.fillRect(tx - 6, S.lvl + 2, 12, tb + 4 - S.lvl);
    ctx.restore();
  }
  function rod(ctx, x, y0, y1, w, S) {
    var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, EQ.aceroOsc); g.addColorStop(0.45, EQ.aceroLuz); g.addColorStop(1, EQ.aceroOsc);
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y0, w, y1 - y0);
    ctx.fillStyle = 'rgba(10,6,3,0.55)'; ctx.fillRect(x - w / 2 - 1, S.lvl + 2, w + 2, y1 - S.lvl);
  }

  /* ==================================================================
     TUBERÍAS (en sección), BRIDAS, VÁLVULAS E INSTRUMENTOS
     ================================================================== */
  function pipeSection(ctx, path, r, wall, interior) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    strokePath(ctx, path);
    ctx.lineWidth = 2 * (r + wall); ctx.strokeStyle = EQ.aceroOsc; ctx.stroke();
    ctx.lineWidth = 2 * (r + wall) - 2.4; ctx.strokeStyle = EQ.acero; ctx.stroke();
    ctx.lineWidth = 2 * r + 1.6; ctx.strokeStyle = EQ.aceroOsc; ctx.stroke();
    ctx.lineWidth = 2 * r; ctx.strokeStyle = interior; ctx.stroke();
  }
  function flangeV(ctx, x, y, r, fr) { // brida en tubo vertical (plano horizontal)
    flangeHalf(ctx, x - fr, y - 7, fr - r, 14, true); flangeHalf(ctx, x + r, y - 7, fr - r, 14, true);
    ctx.fillStyle = '#20262e'; ctx.fillRect(x - fr, y - 0.6, fr - r, 1.2); ctx.fillRect(x + r, y - 0.6, fr - r, 1.2);
    bolt(ctx, x - fr + 6, y, true); bolt(ctx, x + fr - 6, y, true);
  }
  function flangeH(ctx, x, y, r, fr) { // brida en tubo horizontal (plano vertical)
    flangeHalf(ctx, x - 7, y - fr, 14, fr - r, false); flangeHalf(ctx, x - 7, y + r, 14, fr - r, false);
    ctx.fillStyle = '#20262e'; ctx.fillRect(x - 0.6, y - fr, 1.2, fr - r); ctx.fillRect(x - 0.6, y + r, 1.2, fr - r);
    bolt(ctx, x, y - fr + 6, false); bolt(ctx, x, y + fr - 6, false);
  }
  function flangeHalf(ctx, x, y, w, h, vert) {
    var g = vert ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, EQ.bridaLuz); g.addColorStop(0.5, EQ.brida); g.addColorStop(1, EQ.bridaOsc);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  function bolt(ctx, x, y, vert) {
    ctx.fillStyle = '#c9d2dc';
    if (vert) { ctx.fillRect(x - 1.6, y - 12, 3.2, 24); ctx.fillStyle = '#56616e'; ctx.fillRect(x - 3.2, y - 12, 6.4, 4); ctx.fillRect(x - 3.2, y + 8, 6.4, 4); }
    else { ctx.fillRect(x - 12, y - 1.6, 24, 3.2); ctx.fillStyle = '#56616e'; ctx.fillRect(x - 12, y - 3.2, 4, 6.4); ctx.fillRect(x + 8, y - 3.2, 4, 6.4); }
  }
  function greenStub(ctx, x, y0, y1, r) { // cuello de boquilla (exterior, verde)
    var g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, EQ.verdeSombra); g.addColorStop(0.35, EQ.verdeLuz); g.addColorStop(1, EQ.verde);
    ctx.fillStyle = g; ctx.fillRect(x - r, Math.min(y0, y1), 2 * r, Math.abs(y1 - y0));
  }

  function drawPipes(ctx, S) {
    var t = S.t, pp = S.pipes, inl = G.inlet, go = G.gasOut, lo = G.liqOut, i;
    // --- línea de entrada (mezcla) ---
    pipeSection(ctx, pp.inlet, inl.r, inl.wall, C.mezcla);
    ctx.save();
    ctx.beginPath(); ctx.rect(inl.xEdge - 40, inl.y - inl.r, inl.xIn - inl.xEdge + 42, 2 * inl.r); ctx.clip();
    var ig = ctx.createLinearGradient(0, inl.y - inl.r, 0, inl.y + inl.r);
    ig.addColorStop(0, rgba(C.mezclaClaro, 0.9)); ig.addColorStop(0.5, C.mezcla); ig.addColorStop(1, '#5a3a1a');
    ctx.fillStyle = ig; ctx.fillRect(inl.xEdge - 40, inl.y - inl.r, inl.xIn - inl.xEdge + 42, 2 * inl.r);
    ctx.setLineDash([14, 12]); ctx.lineDashOffset = -t * 240; ctx.lineWidth = 1.3;
    for (i = -2; i <= 2; i++) { ctx.strokeStyle = rgba(C.mezclaClaro, 0.7); ctx.beginPath(); ctx.moveTo(inl.xEdge - 40, inl.y + i * 7); ctx.lineTo(inl.xIn, inl.y + i * 7); ctx.stroke(); }
    ctx.setLineDash([]);
    for (i = 0; i < S.P.slugs.length; i++) {
      var sl = S.P.slugs[i], u = frac(sl.ph + t / sl.T * 0.5), xs = lerp(inl.xEdge - 40, inl.xIn, u);
      if (i % 2) continue;
      ctx.fillStyle = rgba(C.gas, 0.4); ctx.beginPath(); ctx.ellipse(xs, inl.y + sl.yo * 13, sl.len * 0.6, 1.2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    flangeH(ctx, inl.xFl, inl.y, inl.r + inl.wall, 44);
    // --- salida de gas ---
    pipeSection(ctx, pp.gas, go.r, go.wall, '#0d1f38');
    ctx.save(); gasClip(ctx);
    ctx.fillStyle = rgba(C.gas, 0.08); ctx.fillRect(go.x - go.r, go.yH - go.r, 500, 2 * go.r);
    ctx.restore();
    // --- salida de líquido ---
    pipeSection(ctx, pp.liq, lo.r, lo.wall, C.liquido);
    ctx.save();
    strokePath(ctx, pp.liq); ctx.lineJoin = 'round';
    ctx.setLineDash([10, 12]); ctx.lineDashOffset = -t * (40 + 90 * S.open / 100);
    ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(C.ambar, 0.45 + 0.4 * S.open / 100); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    for (i = 0; i < 4; i++) {
      var q = along(pp.liq, frac(t * 0.09 * (0.6 + S.open / 100) + i / 4) * pp.liq.len);
      chevron(ctx, q.x, q.y, q.tx, q.ty, 6, rgba(C.ambar, 0.95));
    }
    flangeV(ctx, go.x, go.yFl, go.r + go.wall, 46);
    flangeV(ctx, lo.x, lo.yFl, lo.r + lo.wall, 44);
  }
  function drawGasPipeArrows(ctx, S) {
    var pp = S.pipes;
    for (var i = 0; i < 4; i++) {
      var q = along(pp.gas, frac(S.t * 0.12 + i / 4) * pp.gas.len);
      if (q.y > -G.R - 4) continue;
      chevron(ctx, q.x, q.y, q.tx, q.ty, 7, rgba(C.gas, 0.95));
    }
  }

  /* Válvula de control en sección (cuerpo globo + actuador de diafragma) */
  function drawControlValve(ctx, x, y, open, fluid, S, glow) {
    var lift = open / 100 * 9, i;
    flangeH(ctx, x - 40, y, 27, 40); flangeH(ctx, x + 40, y, 27, 40);
    // cuerpo en sección
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, 34, 30, 0, 0, TAU);
    ctx.fillStyle = EQ.acero; ctx.fill(); ctx.strokeStyle = EQ.aceroOsc; ctx.lineWidth = 1; ctx.stroke();
    ctx.clip(); hatch(ctx, x - 40, y - 34, 80, 68, 5, 'rgba(40,58,82,0.5)', 0.8);
    ctx.restore();
    // paso interior, asiento y obturador (sube con la apertura)
    ctx.fillStyle = fluid; ctx.fillRect(x - 34, y - 13, 68, 26);
    ctx.fillStyle = EQ.aceroLuz; ctx.fillRect(x - 15, y + 10, 30, 3.5);
    var pb = y + 10 - lift * 1.9;
    var pgr = ctx.createLinearGradient(x - 9, 0, x + 9, 0);
    pgr.addColorStop(0, EQ.aceroOsc); pgr.addColorStop(0.45, '#eef3f8'); pgr.addColorStop(1, EQ.aceroOsc);
    ctx.fillStyle = pgr;
    ctx.beginPath(); ctx.moveTo(x - 9, y - 16); ctx.lineTo(x + 9, y - 16); ctx.lineTo(x + 9, pb - 6); ctx.lineTo(x + 5, pb); ctx.lineTo(x - 5, pb); ctx.lineTo(x - 9, pb - 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c3ced9'; ctx.fillRect(x - 1.8, y - 86 - lift, 3.6, 72);
    // flujo bajo el obturador (∝ apertura)
    var fa = open / 100;
    ctx.strokeStyle = glow; ctx.lineWidth = 1.4; ctx.setLineDash([4, 5]); ctx.lineDashOffset = -S.t * 60;
    ctx.globalAlpha = clamp(fa * 1.3, 0.2, 1);
    for (i = -1; i <= 1; i++) {
      var ly = y - 3 + i * 5;
      ctx.beginPath(); ctx.moveTo(x - 33, ly); ctx.quadraticCurveTo(x, Math.max(ly, pb + 3 + (i + 1) * 2.2) + 4, x + 33, ly); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    // bonete y yugo
    var bg = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
    bg.addColorStop(0, EQ.aceroOsc); bg.addColorStop(0.45, EQ.aceroLuz); bg.addColorStop(1, EQ.aceroOsc);
    ctx.fillStyle = bg; ctx.fillRect(x - 10, y - 50, 20, 22);
    ctx.fillStyle = EQ.aceroOsc; ctx.fillRect(x - 13, y - 82, 4, 32); ctx.fillRect(x + 9, y - 82, 4, 32);
    ctx.fillStyle = C.amarillo; ctx.fillRect(x - 6, y - 66 - lift, 12, 3); // indicador de carrera
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8;
    for (i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(x + 13, y - 56 - i * 3); ctx.lineTo(x + 17, y - 56 - i * 3); ctx.stroke(); }
    // actuador de diafragma
    var ay = y - 92;
    var ag = ctx.createLinearGradient(0, ay - 18, 0, ay + 14);
    ag.addColorStop(0, EQ.actuadorLuz); ag.addColorStop(0.5, EQ.actuador); ag.addColorStop(1, '#2e3c4d');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.moveTo(x - 38, ay); ctx.quadraticCurveTo(x - 36, ay - 22, x, ay - 24); ctx.quadraticCurveTo(x + 36, ay - 22, x + 38, ay);
    ctx.quadraticCurveTo(x + 34, ay + 12, x, ay + 13); ctx.quadraticCurveTo(x - 34, ay + 12, x - 38, ay); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#26323f'; ctx.fillRect(x - 39, ay - 1.5, 78, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(x - 12, ay - 14, 14, 4, -0.15, 0, TAU); ctx.fill();
    // barra de % apertura
    var bx = x - 56, by0 = ay - 22, bh = 56;
    ctx.fillStyle = 'rgba(6,22,49,0.85)'; ctx.fillRect(bx, by0, 9, bh);
    ctx.fillStyle = C.amarillo; ctx.fillRect(bx + 1.5, by0 + bh - (bh - 3) * fa - 1.5, 6, (bh - 3) * fa);
    ctx.strokeStyle = rgba(C.celeste200, 0.6); ctx.lineWidth = 0.8; ctx.strokeRect(bx, by0, 9, bh);
  }

  /* Cabezal tipo transmisor E+H (carcasa azul con mirilla) */
  function drawEH(ctx, x, yb, s) {
    ctx.save(); ctx.translate(x, yb); ctx.scale(s, s);
    var ng = ctx.createLinearGradient(-6, 0, 6, 0);
    ng.addColorStop(0, EQ.aceroOsc); ng.addColorStop(0.45, EQ.aceroLuz); ng.addColorStop(1, EQ.aceroOsc);
    ctx.fillStyle = ng; ctx.fillRect(-6, -14, 12, 14);
    var hg = ctx.createLinearGradient(-17, 0, 17, 0);
    hg.addColorStop(0, EQ.ehOsc); hg.addColorStop(0.35, EQ.ehLuz); hg.addColorStop(1, EQ.eh);
    ctx.fillStyle = hg; roundRect(ctx, -17, -44, 34, 31, 7); ctx.fill();
    ctx.fillStyle = '#c3ced9'; ctx.fillRect(17, -32, 6, 8); // prensaestopas
    var gg = ctx.createRadialGradient(-3, -32, 1, 0, -29, 11);
    gg.addColorStop(0, '#f4fbff'); gg.addColorStop(0.6, '#a9c7e3'); gg.addColorStop(1, '#3a6c9e');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, -29, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#16324f'; ctx.fillRect(-6, -32, 12, 5);
    ctx.fillStyle = C.celeste; ctx.fillRect(-5, -31, 7, 1.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; roundRect(ctx, -17, -44, 34, 31, 7); ctx.stroke();
    ctx.restore();
  }
  /* rectángulo en espacio de dibujo → rectángulo en px de pantalla (para reservar espacio a los rótulos) */
  function worldRect(S, x, y, w, h) {
    var a = S.toScreen(x, y), b = S.toScreen(x + w, y + h);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawTopAccessories(ctx, S) {
    var top = -G.R - 4;
    // PSV (roja) — foto 05
    var x = G.psv;
    greenStub(ctx, x, top, -192, 10); flangeV(ctx, x, -194, 10, 22);
    var rg = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
    rg.addColorStop(0, EQ.psvOsc); rg.addColorStop(0.4, EQ.psvLuz); rg.addColorStop(1, EQ.psv);
    ctx.fillStyle = rg;
    roundRect(ctx, x - 17, -232, 34, 32, 8); ctx.fill();
    ctx.fillRect(x - 32, -224, 18, 14); flangeH(ctx, x - 34, -217, 7, 15);
    ctx.beginPath(); ctx.moveTo(x - 11, -232); ctx.lineTo(x - 7, -268); ctx.lineTo(x + 7, -268); ctx.lineTo(x + 11, -232); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 6, -282, 12, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x - 9, -228, 3, 24);
    // TT (termopozo + cabezal)
    x = G.tt; greenStub(ctx, x, top, -186, 8); flangeV(ctx, x, -188, 8, 18); drawEH(ctx, x, -195, 0.8);
    // TPS (válvula de bloqueo + transmisor)
    x = G.tps; greenStub(ctx, x, top, -186, 7); flangeV(ctx, x, -188, 7, 16);
    ctx.fillStyle = '#9aa7b5'; ctx.fillRect(x - 9, -206, 18, 12); ctx.fillStyle = '#4c5866'; ctx.fillRect(x - 2, -216, 4, 10); ctx.fillRect(x - 12, -218, 24, 3.5);
    drawEH(ctx, x, -206, 0.85);
    // TN (brida + cabezal) — montaje superior con sonda; si es lateral se dibuja la cámara externa
    if (!G.tnLateral) { x = G.tn; greenStub(ctx, x, top, -186, 10); flangeV(ctx, x, -188, 10, 24); drawEH(ctx, x, -195, 1.05); }
    // registro / tapa bridada en la tapa del extremo de salida (derecha), como en la foto del FA-02
    var mw = G.manway, xe = G.xT + G.A - 3;
    var mg = ctx.createLinearGradient(0, -mw.r, 0, mw.r);
    mg.addColorStop(0, EQ.verdeLuz); mg.addColorStop(0.45, EQ.verde); mg.addColorStop(1, EQ.verdeSombra);
    ctx.fillStyle = mg; ctx.fillRect(xe, -mw.r + 12, 34, 2 * mw.r - 24);
    ctx.fillRect(xe + 34, -mw.r, 15, 2 * mw.r);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(xe + 34, -mw.r, 15, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(xe + 34, -mw.r, 2, 2 * mw.r);
    for (var k = 0; k < 7; k++) {
      var by = -mw.r + 9 + k * (2 * mw.r - 18) / 6;
      ctx.fillStyle = '#39424c'; ctx.fillRect(xe + 49, by - 4, 6, 8);
      ctx.fillStyle = '#8b96a3'; ctx.fillRect(xe + 49, by - 4, 6, 2);
      ctx.fillStyle = '#39424c'; ctx.fillRect(xe + 28, by - 4, 6, 8);
    }
    ctx.fillStyle = '#5a646f'; ctx.fillRect(xe + 55, -10, 10, 20); // asa del registro
    if (G.tnLateral) drawCage(ctx, S);
  }

  /* Cámara externa del TN (solo si WT.data.separador.tnMontaje indica montaje lateral):
     dos boquillas en la tapa derecha, cámara en sección con el mismo nivel que el
     recipiente (vasos comunicantes) y sonda de onda guiada con el cabezal E+H arriba. */
  function drawCage(ctx, S) {
    var cg = G.cage, x = cg.x, r = cg.r, w = 5, y0 = cg.y0, y1 = cg.y1, i;
    for (i = 0; i < 2; i++) {
      var ny = i ? cg.nozB : cg.nozA, xh = G.xT + headX(ny, G.A, G.R) - 4, xc = x - r - w;
      var ng = ctx.createLinearGradient(0, ny - 7, 0, ny + 7);
      ng.addColorStop(0, EQ.verdeLuz); ng.addColorStop(0.5, EQ.verde); ng.addColorStop(1, EQ.verdeSombra);
      ctx.fillStyle = ng; ctx.fillRect(xh, ny - 7, xc - xh, 14);
      flangeH(ctx, xh + (xc - xh) * 0.55, ny, 7, 17);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x - r - w, y0, 2 * (r + w), y1 - y0);
    ctx.fillStyle = EQ.acero; ctx.fill(); ctx.clip();
    hatch(ctx, x - r - w - 4, y0, 2 * (r + w) + 8, y1 - y0, 5, 'rgba(40,58,82,0.55)', 0.8);
    ctx.restore();
    var yl = clamp(S.lvl, y0 + 10, y1 - 10);
    ctx.fillStyle = '#0d1f38'; ctx.fillRect(x - r, y0 + 6, 2 * r, yl - y0 - 6);
    ctx.fillStyle = rgba(C.gas, 0.07); ctx.fillRect(x - r, y0 + 6, 2 * r, yl - y0 - 6);
    var lg = ctx.createLinearGradient(0, yl, 0, y1);
    lg.addColorStop(0, '#3d2814'); lg.addColorStop(0.15, C.liquido); lg.addColorStop(1, '#060302');
    ctx.fillStyle = lg; ctx.fillRect(x - r, yl, 2 * r, y1 - 6 - yl);
    ctx.strokeStyle = rgba(C.ambar, 0.9); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - r, yl + 0.8 * Math.sin(S.t * 3)); ctx.lineTo(x + r, yl - 0.8 * Math.sin(S.t * 3)); ctx.stroke();
    ctx.strokeStyle = EQ.aceroOsc; ctx.lineWidth = 1; ctx.strokeRect(x - r - w, y0, 2 * (r + w), y1 - y0);
    rod(ctx, x, y0 - 2, y1 - 14, 3.6, S);
    ctx.save(); ctx.beginPath(); ctx.rect(x - r, y0, 2 * r, y1 - y0); ctx.clip();
    probePulse(ctx, S, x, y0, 9);
    ctx.restore();
    flangeV(ctx, x, y0 - 2, r + w, r + w + 11);
    flangeV(ctx, x, y1 + 2, r + w, r + w + 11);
    ctx.fillStyle = EQ.aceroOsc; ctx.fillRect(x - 5, y1 + 9, 10, 18);  // dren
    greenStub(ctx, x, y0 - 9, y0 - 16, 7);
    drawEH(ctx, x, y0 - 16, 1.05);
  }

  /* Pulso de "medición" en la pantalla de un transmisor (pasos 5 y 6) */
  function measurePulse(ctx, x, y, k, t) {
    if (k <= 0.01) return;
    for (var i = 0; i < 2; i++) {
      var u = frac(t / 1.6 + i * 0.5);
      ctx.strokeStyle = rgba(C.celeste, k * 0.75 * (1 - u)); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, 14 + 26 * u, 0, TAU); ctx.stroke();
    }
  }
  function drawLineDevices(ctx, S) {
    var go = G.gasOut, lo = G.liqOut;
    // Válvulas de control aguas abajo de cada medidor: LV (líquido) y PV (gas)
    drawControlValve(ctx, G.lv, lo.yH, S.open, C.liquido, S, rgba(C.ambar, 1));
    drawControlValve(ctx, G.pv, go.yH, S.openPV, '#0d1f38', S, rgba(C.gas, 1));
    // Coriolis Promass 300: primero en la salida de líquido (aguas arriba de la LV)
    var x = G.cor, y = lo.yH;
    flangeH(ctx, x - 52, y, lo.r + lo.wall, 40); flangeH(ctx, x + 52, y, lo.r + lo.wall, 40);
    var cg = ctx.createLinearGradient(0, y - 26, 0, y + 30);
    cg.addColorStop(0, '#e9eef3'); cg.addColorStop(0.45, '#b9c5d1'); cg.addColorStop(1, '#6b7a8b');
    ctx.fillStyle = cg; roundRect(ctx, x - 44, y - 24, 88, 52, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#9aa7b5'; ctx.fillRect(x - 6, y - 42, 12, 18);
    var tg = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
    tg.addColorStop(0, '#8d9aa8'); tg.addColorStop(0.4, '#eef2f6'); tg.addColorStop(1, '#a9b5c2');
    ctx.fillStyle = tg; roundRect(ctx, x - 26, -0 + y - 76, 52, 36, 8); ctx.fill();
    ctx.fillStyle = '#16324f'; roundRect(ctx, x - 15, y - 69, 30, 18, 3); ctx.fill();
    ctx.fillStyle = C.celeste; ctx.fillRect(x - 11, y - 64, 16, 2); ctx.fillRect(x - 11, y - 59, 10, 2);
    ctx.fillStyle = EQ.eh; ctx.fillRect(x - 26, y - 76, 52, 5);
    measurePulse(ctx, x, y - 60, S.em.nivel * S.kx, S.t);
    // Placa de orificio + transmisor de presión diferencial (TDG): primero en la salida de gas (aguas arriba de la PV)
    x = G.ori; y = go.yH;
    flangeH(ctx, x - 8, y, go.r + go.wall, 46); flangeH(ctx, x + 8, y, go.r + go.wall, 46);
    ctx.fillStyle = '#d7dee6'; ctx.fillRect(x - 1.6, y - go.r - 22, 3.2, go.r * 0.55 + 22); ctx.fillRect(x - 1.6, y + go.r * 0.45, 3.2, go.r * 0.55);
    ctx.fillStyle = C.amarillo; ctx.fillRect(x - 4, y - go.r - 34, 8, 14); // paleta de la placa
    ctx.strokeStyle = '#9aa7b5'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(x - 10, y - go.r - 6); ctx.lineTo(x - 10, y - 66); ctx.lineTo(x - 14, y - 72); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 10, y - go.r - 6); ctx.lineTo(x + 10, y - 66); ctx.lineTo(x + 14, y - 72); ctx.stroke();
    ctx.fillStyle = '#9aa7b5'; roundRect(ctx, x - 20, y - 82, 40, 14, 3); ctx.fill();
    drawEH(ctx, x, y - 80, 0.85);
    // tomas de alta (H, aguas arriba) y baja presión (L, aguas abajo) en el paso de gas
    var kg = S.em.gas * S.kx;
    if (kg > 0.01) {
      ctx.save(); ctx.globalAlpha = kg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 11px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(6,22,49,0.9)'; roundRect(ctx, x - 29, y - 58, 12, 13, 3); ctx.fill(); roundRect(ctx, x + 17, y - 58, 12, 13, 3); ctx.fill();
      ctx.fillStyle = C.celeste200; ctx.fillText('H', x - 23, y - 51); ctx.fillText('L', x + 23, y - 51);
      ctx.restore();
      if (kg > 0.3) S.extraReserved.push(worldRect(S, x - 29, y - 58, 58, 13));   // los rótulos no tapan las tomas
    }
    measurePulse(ctx, x, y - 109, kg, S.t);
    // Manómetro local (PI) en la línea de entrada
    x = -712; y = G.inlet.y - G.inlet.r - G.inlet.wall;
    ctx.fillStyle = '#9aa7b5'; ctx.fillRect(x - 2, y - 30, 4, 30); ctx.fillRect(x - 6, y - 14, 12, 7);
    var dy = y - 50;
    ctx.fillStyle = '#2a323c'; ctx.beginPath(); ctx.arc(x, dy, 20, 0, TAU); ctx.fill();
    var fg = ctx.createRadialGradient(x - 5, dy - 6, 2, x, dy, 17);
    fg.addColorStop(0, '#ffffff'); fg.addColorStop(1, '#cfd8e2');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x, dy, 16.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a323c'; ctx.lineWidth = 0.8;
    for (var k = 0; k <= 10; k++) { var a = PI * 0.75 + k / 10 * PI * 1.5; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 12.5, dy + Math.sin(a) * 12.5); ctx.lineTo(x + Math.cos(a) * 15.5, dy + Math.sin(a) * 15.5); ctx.stroke(); }
    var na = PI * 0.75 + (0.38 + 0.01 * Math.sin(S.t * 3)) * PI * 1.5;
    ctx.strokeStyle = '#c9252f'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, dy); ctx.lineTo(x + Math.cos(na) * 12, dy + Math.sin(na) * 12); ctx.stroke();
    ctx.fillStyle = '#2a323c'; ctx.beginPath(); ctx.arc(x, dy, 2, 0, TAU); ctx.fill();
  }

  /* Lazos de control (señal eléctrica, ISA: discontinua), funciones en el RTU
     (WT.data.funciones): TN → LIC → LV (nivel) y TPS → PIC → PV (contrapresión).
     Cada lazo se enfatiza en su paso; en los demás queda tenue. */
  function loopsOf(S) {
    var out = [], pp = S.pipes, vl = valvula('liquido'), vg = valvula('gas');
    var fl = vl ? funcionDe(vl.tag, vl.lazo) : null, fg = vg ? funcionDe(vg.tag, vg.lazo) : null;
    if (fl) out.push({ id: 'LIC', f: fl, box: G.lic, paths: [pp.senal, pp.senal2], e: S.em.nivel, base: 0.55, ph: 0 });
    if (fg) out.push({ id: 'PIC', f: fg, box: G.pic, paths: [pp.senalP1, pp.senalP2], e: S.em.gas, base: 0.4, ph: 0.37 });
    return out;
  }
  function drawSignals(ctx, S) {
    var t = S.t, loops = S.loops, i, j, l;
    ctx.save(); ctx.lineCap = 'round';
    for (l = 0; l < loops.length; l++) {
      var L = loops[l], e = L.e, a = L.base + (1 - L.base) * e;
      for (i = 0; i < L.paths.length; i++) {
        var pth = L.paths[i];
        strokePath(ctx, pth);
        ctx.strokeStyle = rgba(C.senal, 0.1 + 0.14 * e); ctx.lineWidth = 6; ctx.stroke();
        ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 24;
        ctx.strokeStyle = rgba(C.senal, a); ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]);
        var sp = 0.35 * Math.min(1, 520 / pth.len);   // misma velocidad aparente en tramos largos
        for (j = 0; j < 2; j++) {
          var q = along(pth, frac(t * sp + j / 2 + i * 0.25 + L.ph) * pth.len);
          var g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 9);
          g.addColorStop(0, rgba('#ffffff', 0.9 * a)); g.addColorStop(0.4, rgba(C.senal, 0.8 * a)); g.addColorStop(1, rgba(C.senal, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, TAU); ctx.fill();
        }
      }
      // función compartida en el RTU (ISA: círculo inscrito en un cuadro)
      var x = L.box.x, y = L.box.y;
      ctx.fillStyle = 'rgba(6,22,49,0.92)'; ctx.fillRect(x - 36, y - 28, 72, 56);
      ctx.strokeStyle = rgba(C.celeste, Math.max(a, 0.75)); ctx.lineWidth = 1.6; ctx.strokeRect(x - 36, y - 28, 72, 56);
      ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 26, y); ctx.lineTo(x + 26, y); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 15px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; ctx.fillText(String(L.f.tag), x, y - 11);
      ctx.fillStyle = C.celeste200; ctx.font = '600 11px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; ctx.fillText(String(L.f.en || 'RTU'), x, y + 11);
    }
    ctx.restore();
  }

  /* Placa naranja del tag y rombo NFPA en las silletas (foto 05) */
  function drawTagPlate(ctx, S) {
    var x = G.saddles[0], y = 226;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 41, y - 15, 84, 34);
    ctx.fillStyle = EQ.placa; ctx.fillRect(x - 43, y - 17, 84, 34);
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1.4; ctx.strokeRect(x - 40, y - 14, 78, 28);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 23px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; ctx.fillText(S.tag, x - 1, y + 1);
    var nf = WT.data && WT.data.separador && WT.data.separador.nfpa;
    if (nf) {
      x = G.saddles[1]; y = 228; var s = 15;
      var q = [[0, -s, '#d32f2f', nf.inflamabilidad], [-s, 0, '#1f5fbf', nf.salud], [s, 0, '#f6c21b', nf.reactividad], [0, s, '#ffffff', '']];
      for (var i = 0; i < q.length; i++) {
        ctx.fillStyle = q[i][2];
        ctx.beginPath(); ctx.moveTo(x + q[i][0], y + q[i][1] - s / 2 - 1); ctx.lineTo(x + q[i][0] + s / 2 + 1, y + q[i][1]);
        ctx.lineTo(x + q[i][0], y + q[i][1] + s / 2 + 1); ctx.lineTo(x + q[i][0] - s / 2 - 1, y + q[i][1]); ctx.closePath(); ctx.fill();
        ctx.fillStyle = q[i][2] === '#f6c21b' || q[i][2] === '#ffffff' ? '#111' : '#fff';
        ctx.font = '700 9px "Barlow Condensed", Arial, sans-serif'; ctx.fillText(String(q[i][3]), x + q[i][0], y + q[i][1] + 0.5);
      }
    }
  }

  /* Exterior del recipiente (para la animación de apertura en corte) */
  function drawExterior(ctx, S, cutX) {
    ctx.save();
    ctx.beginPath(); ctx.rect(cutX, -G.R - 20, 1400, 2 * G.R + 40); ctx.clip();
    stadium(ctx, G.xT, G.A, G.R, G.R);
    var g = ctx.createLinearGradient(0, -G.R, 0, G.R);
    g.addColorStop(0, EQ.verdeSombra); g.addColorStop(0.18, EQ.verdeLuz); g.addColorStop(0.32, EQ.verde);
    g.addColorStop(0.75, '#173727'); g.addColorStop(1, '#0a1c13');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    var hl = ctx.createLinearGradient(0, -G.R, 0, -G.R + 60);
    hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.45, 'rgba(255,255,255,0.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(-700, -G.R, 1400, 60);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
    [-G.xT, G.xT, -150, 160].forEach(function (sx) { ctx.beginPath(); ctx.moveTo(sx, -G.R); ctx.lineTo(sx, G.R); ctx.stroke(); });
    ctx.restore();
    // rotulado del recipiente (como en el equipo de campo)
    ctx.fillStyle = EQ.placa; ctx.fillRect(-250, -70, 150, 64);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 44px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; ctx.fillText(S.tag, -175, -37);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
    ctx.font = '700 22px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    var sep = (WT.data && WT.data.separador) || {};
    ctx.fillText(String(sep.servicio || '').toUpperCase(), -80, -52);
    ctx.fillText(String(sep.tipo || '').split(' (')[0].toUpperCase(), -80, -24);
    ctx.restore();
  }

  /* ==================================================================
     RESALTADO, SOBREPOSICIONES DE PASO, RÓTULOS
     ================================================================== */
  function drawHighlight(ctx, S, vig) {
    if (S.dim <= 0.002 || !S.zonas.length) return;
    var v = vig.getContext('2d'), dpr = S.dpr, i;
    if (vig.width !== ctx.canvas.width || vig.height !== ctx.canvas.height) { vig.width = ctx.canvas.width; vig.height = ctx.canvas.height; }
    v.setTransform(1, 0, 0, 1, 0, 0); v.globalCompositeOperation = 'source-over';
    v.clearRect(0, 0, vig.width, vig.height);
    v.fillStyle = 'rgba(3,9,22,' + (0.66 * S.dim).toFixed(3) + ')'; v.fillRect(0, 0, vig.width, vig.height);
    v.globalCompositeOperation = 'destination-out';
    for (i = 0; i < S.zonas.length; i++) {
      var z = S.zonas[i], p = S.toScreen(z[0], z[1]), w = z[4] == null ? 1 : z[4];
      if (w <= 0.001) continue;
      v.save(); v.translate(p.x * dpr, p.y * dpr); v.scale(z[2] * S.scale * dpr, z[3] * S.scale * dpr);
      var g = v.createRadialGradient(0, 0, 0, 0, 0, 1.3);
      g.addColorStop(0, 'rgba(0,0,0,' + w + ')'); g.addColorStop(0.72, 'rgba(0,0,0,' + w + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      v.fillStyle = g; v.beginPath(); v.arc(0, 0, 1.3, 0, TAU); v.fill(); v.restore();
    }
    v.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(vig, 0, 0); ctx.restore();
    // contorno animado de las zonas
    S.world(ctx);
    ctx.save(); ctx.setLineDash([10, 8]); ctx.lineDashOffset = -S.t * 18; ctx.lineWidth = 1.6 / Math.max(0.5, S.scale) ;
    for (i = 0; i < S.zonas.length; i++) {
      var zz = S.zonas[i], ww = zz[4] == null ? 1 : zz[4];
      ctx.strokeStyle = rgba(C.celeste, 0.55 * ww * S.dim);
      ctx.beginPath(); ctx.ellipse(zz[0], zz[1], zz[2] * 1.08, zz[3] * 1.08, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function arrow(ctx, pts, col, w, a, head) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 3) ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
    else for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    var n = pts.length, b = pts[n - 1], c = pts[n - 2], ang = Math.atan2(b[1] - c[1], b[0] - c[0]), h = head || w * 3.2;
    ctx.beginPath(); ctx.moveTo(b[0] + Math.cos(ang) * h * 0.6, b[1] + Math.sin(ang) * h * 0.6);
    ctx.lineTo(b[0] + Math.cos(ang + 2.5) * h, b[1] + Math.sin(ang + 2.5) * h);
    ctx.lineTo(b[0] + Math.cos(ang - 2.5) * h, b[1] + Math.sin(ang - 2.5) * h); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function worldTextRaw(ctx, txt, x, y, size, col, a, align, plate) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = a; ctx.font = '700 ' + size + 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (plate) {   // placa de fondo: ninguna varilla ni línea atraviesa el texto
      var tw = ctx.measureText(txt).width, ph = size * 1.35, pw = tw + size * 0.9;
      var px = align === 'left' ? x - size * 0.45 : align === 'right' ? x - tw - size * 0.45 : x - pw / 2;
      ctx.fillStyle = 'rgba(6,22,49,0.8)'; roundRect(ctx, px, y - ph / 2, pw, ph, ph / 2); ctx.fill();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(6,22,49,0.85)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.restore();
  }

  /* Flechas y textos propios de cada paso (espacio de dibujo) */
  function drawStepOverlays(ctx, S) {
    var em = S.em, t = S.t, k, i;
    function worldText(c, txt, x, y, size, col, a, align, plate) { worldTextRaw(c, txt, x, y, Math.max(size, 12 / S.scale), col, a, align, plate); }
    if ((k = em.choque * S.kx) > 0.01) {
      arrow(ctx, [[-640, -55], [-560, -55]], C.mezclaClaro, 5, k);
      arrow(ctx, [[-452, -96], [-456, -146], [-380, -146]], C.gas, 3.5, k);
      arrow(ctx, [[-450, -14], [-452, 8], [-450, S.lvl + 26]], C.ambar, 3.5, k);
      worldText(ctx, 'gas', -370, -146, 17, C.gas, k, 'left');
      worldText(ctx, 'líquido', -438, S.lvl + 44, 17, C.ambar, k, 'left');
    }
    if ((k = em.liberacion * S.kx) > 0.01) {
      for (i = 0; i < 4; i++) {
        var bx = -420 + i * 70, by = G.Ri - 30 - 18 * Math.sin(t * 2.2 + i);
        arrow(ctx, [[bx, by], [bx, Math.max(S.lvl + 14, by - 54)]], C.gas, 2.6, k * 0.95);
      }
      worldText(ctx, 'burbujas de gas', -315, G.Ri - 14, 16, C.gas, k);
    }
    if ((k = em.asentamiento * S.kx) > 0.01) {
      for (i = 0; i < 4; i++) {
        var ax = -300 + i * 150, ay = -96 + 6 * Math.sin(t * 2 + i);
        arrow(ctx, [[ax, ay], [ax, ay + 46]], C.ambar, 2.6, k);
        var ux = -260 + i * 150, uy = G.Ri - 34 - 6 * Math.sin(t * 2 + i);
        arrow(ctx, [[ux, uy], [ux, uy - 44]], C.gas, 2.6, k);
      }
      // cota de la sección de asentamiento
      var y = -124;
      ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = C.celeste200; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-412, y); ctx.lineTo(292, y); ctx.moveTo(-412, y - 8); ctx.lineTo(-412, y + 8); ctx.moveTo(292, y - 8); ctx.lineTo(292, y + 8); ctx.stroke();
      ctx.restore();
      arrow(ctx, [[-60, y], [-404, y]], C.celeste200, 1.4, k, 7); arrow(ctx, [[-60, y], [284, y]], C.celeste200, 1.4, k, 7);
      worldText(ctx, S.long ? 'baja velocidad · tiempo de residencia' : 'tiempo de residencia', -60, y - 15, 16, C.celeste200, k, 'center', true);
      worldText(ctx, 'gotas ↓', -232, -44, 16, C.ambar, k);
      worldText(ctx, 'burbujas ↑', 110, G.Ri - 18, 16, C.gas, k);
    }
    if ((k = em.nivel * S.kx) > 0.01) {
      var x0 = -G.xT - headX(G.spY, G.Ai, G.Ri) + 4, x1 = G.xT + headX(G.spY, G.Ai, G.Ri) - 4;
      ctx.save(); ctx.globalAlpha = k; ctx.setLineDash([9, 6]); ctx.strokeStyle = C.celeste; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x0, G.spY); ctx.lineTo(x1, G.spY); ctx.stroke(); ctx.restore();
      var up = S.lvlTrend > 0;
      arrow(ctx, up ? [[262, S.lvl + 34], [262, S.lvl - 8]] : [[262, S.lvl - 34], [262, S.lvl + 8]], C.celeste, 3, k);
      // el líquido sale por el fondo: primero se mide (Coriolis) y después pasa por la LV
      arrow(ctx, [[G.liqOut.x, 150], [G.liqOut.x, 226]], C.ambar, 4, k);
      var vl = valvula('liquido');
      if (S.orden) orderPair(ctx, S, G.cor, G.lv, G.frameY + 52, vl ? nombreCorto(vl.nombre) : 'Control de nivel', k, 'Control');
    }
    if ((k = em.gas * S.kx) > 0.01) {
      // el gas sale por arriba: primero se mide (placa de orificio FE + transmisor TDG) y después pasa por la PV
      arrow(ctx, [[G.gasOut.x, -150], [G.gasOut.x, -214]], C.gas, 4, k);
      var vg = valvula('gas'), yb = G.gasOut.yH + 60;
      if (S.orden) orderPair(ctx, S, G.ori, G.pv, yb, vg ? nombreCorto(vg.nombre) : 'Contrapresión', k, 'Control');
    }
  }
  /* Par de insignias "1 Medición → 2 Control" bajo el medidor y la válvula de una salida.
     Siempre quedan dentro del cuadro visible: se recorren, se usa el texto corto y, si aun
     así no caben lado a lado, se apilan. */
  function orderPair(ctx, S, xa, xb, y, txtB, a, txtCorto) {
    if (a <= 0.01) return;
    var gap = 30 / S.scale, mg = 12 / S.scale, vx0 = S.view.x0 + mg, vx1 = S.view.x1 - mg, avail = vx1 - vx0;
    var wa = orderBadge(ctx, S, xa, y, 1, 'Medición', 0), wb = orderBadge(ctx, S, xb, y, 2, txtB, 0);
    if (txtCorto && wa + wb + gap > avail) { txtB = txtCorto; wb = orderBadge(ctx, S, xb, y, 2, txtB, 0); }
    var stack = wa + wb + gap > avail, ya = y, yb = y;
    if (stack) {
      var cxs = clamp((xa + xb) / 2, vx0 + Math.max(wa, wb) / 2, vx1 - Math.max(wa, wb) / 2), dy = 26 * Math.max(1, 0.92 / S.scale);
      xa = xb = cxs; ya = y - dy * 0.55; yb = y + dy * 0.75;
    } else {
      // si no caben centradas bajo cada equipo, se separan alrededor del punto medio
      if ((xb - xa) < (wa + wb) / 2 + gap) { var mid = (xa + xb) / 2 + (wa - wb) / 4; xa = mid - gap / 2 - wa / 2; xb = mid + gap / 2 + wb / 2; }
      var over = xb + wb / 2 - vx1; if (over > 0) { xa -= over; xb -= over; }
      var under = vx0 - (xa - wa / 2); if (under > 0) { xa += under; xb += under; }
    }
    var ra = orderBadge(ctx, S, xa, ya, 1, 'Medición', a), rb = orderBadge(ctx, S, xb, yb, 2, txtB, a);
    if (ra && rb) {
      var hs = 14 * Math.max(1, 0.92 / S.scale);
      S.extraReserved.push(worldRect(S, ra.x0, ya - hs, ra.x1 - ra.x0, 2 * hs), worldRect(S, rb.x0, yb - hs, rb.x1 - rb.x0, 2 * hs));
      if (!stack && rb.x0 - ra.x1 > 22 / S.scale) arrow(ctx, [[ra.x1 + 5 / S.scale, y], [rb.x0 - 5 / S.scale, y]], C.celeste200, 1.6 / Math.max(0.6, S.scale), a * 0.9, 7 / Math.max(0.6, S.scale));
    }
  }
  /* Insignia numerada (espacio de dibujo; tamaño mínimo legible en pantalla) → { x0, x1 };
     con a = 0 solo mide y devuelve el ancho total */
  function orderBadge(ctx, S, x, y, n, txt, a) {
    var s = Math.max(1, 0.92 / S.scale), fs = 14 * s, r = 10.5 * s;
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = '700 ' + fs.toFixed(1) + 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    var tw = ctx.measureText(txt).width, w = r * 2 + 6 * s + tw + 10 * s, x0 = x - w / 2;
    if (a <= 0.01) { ctx.restore(); return w + 6 * s; }
    ctx.fillStyle = 'rgba(6,22,49,0.9)'; roundRect(ctx, x0 - 3 * s, y - r - 3 * s, w + 6 * s, 2 * r + 6 * s, r + 3 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(169,220,247,0.35)'; ctx.lineWidth = 1 * s; ctx.stroke();
    ctx.fillStyle = C.amarillo; ctx.beginPath(); ctx.arc(x0 + r, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = C.marino; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + (fs * 1.02).toFixed(1) + 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    ctx.fillText(String(n), x0 + r, y + 0.5 * s);
    ctx.fillStyle = '#eef5fb'; ctx.textAlign = 'left';
    ctx.font = '700 ' + fs.toFixed(1) + 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    ctx.fillText(txt, x0 + 2 * r + 6 * s, y + 0.5 * s);
    ctx.restore();
    return { x0: x0 - 3 * s, x1: x0 + w + 3 * s };
  }

  /* ---------- texto en pantalla ---------- */
  function font(w, px, fam) {
    return w + ' ' + px.toFixed(1) + 'px ' + (fam === 'mono' ? '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace'
      : fam === 'cond' ? '"Barlow Condensed", "Arial Narrow", Arial, sans-serif' : '"Barlow", "Segoe UI", Arial, sans-serif');
  }
  function chip(ctx, x, y, parts, fs, a, opt) {
    // parts: [{t, mono, col}] ; (x, y) = centro
    opt = opt || {};
    var padX = fs * 0.62, gap = fs * 0.42, w = 0, i, widths = [];
    for (i = 0; i < parts.length; i++) {
      ctx.font = parts[i].mono ? font('700', fs * 0.88, 'mono') : font(parts[i].w || '600', fs, parts[i].cond ? 'cond' : 'body');
      widths.push(ctx.measureText(parts[i].t).width); w += widths[i] + (i ? gap : 0);
    }
    var h = fs * 1.75, bw = w + padX * 2, bx = x - bw / 2, by = y - h / 2;
    if (opt.measure) return { w: bw, h: h };
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = opt.bg || 'rgba(6,22,49,0.88)'; roundRect(ctx, bx, by, bw, h, h * 0.22); ctx.fill();
    ctx.strokeStyle = opt.border || 'rgba(79,179,232,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    if (opt.accent) { ctx.fillStyle = opt.accent; ctx.fillRect(bx, by + 3, 2.5, h - 6); }
    var cx = bx + padX; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (i = 0; i < parts.length; i++) {
      ctx.font = parts[i].mono ? font('700', fs * 0.88, 'mono') : font(parts[i].w || '600', fs, parts[i].cond ? 'cond' : 'body');
      ctx.fillStyle = parts[i].col || '#eef5fb'; ctx.fillText(parts[i].t, cx, y + fs * 0.04);
      cx += widths[i] + gap;
    }
    ctx.restore();
    return { x: bx, y: by, w: bw, h: h };
  }
  function wrap(ctx, txt, maxW) {
    var words = String(txt).split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function edgePoint(r, px, py) { // punto del rectángulo más cercano a (px, py)
    return { x: clamp(px, r.x, r.x + r.w), y: clamp(py, r.y, r.y + r.h) };
  }
  function overlap(a, b, m) { return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m; }

  /* ---------- rótulos de equipos e instrumentos (desde WT.data) ---------- */
  function buildLabels() {
    var D = WT.data || {}, U = WT.util || {}, sep = D.separador || {}, out = [];
    function byId(list, id) { list = list || []; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
    function nombre(o, d) { return o && o.nombre ? o.nombre : d; }
    function corto(o, d) { return o && (o.corto || o.nombre) ? (o.corto || o.nombre) : d; }
    function inst(tag) { return U.instrumento ? U.instrumento(tag) : null; }
    function eq(id) { return U.equipo ? U.equipo(id) : null; }
    function add(o) { out.push(o); }
    var go = G.gasOut, lo = G.liqOut;
    var tTN = inst('TN'), tTPS = inst('TPS'), tTT = inst('TT'), tCOR = inst('CORIOLIS'), tTDG = inst('TDG');
    var rtu = eq('rtu'), placa = eq('placa'), cor = eq('coriolis'), rtuTxt = 'en ' + corto(rtu, 'RTU');
    var vl = valvula('liquido'), vg = valvula('gas');
    var fl = vl ? funcionDe(vl.tag, vl.lazo) : null, fg = vg ? funcionDe(vg.tag, vg.lazo) : null;
    var corTxt = tCOR && tCOR.marca ? String(tCOR.marca).replace('Endress+Hauser', 'E+H') : String(corto(cor, 'Coriolis')).replace(/^coriolis\s+/i, '');
    var placaTxt = placa ? (placa.corto || String(placa.nombre).split(' + ')[0]) : 'Placa de orificio';
    // 'Placa de orificio + transmisor de presión diferencial E+H' → 'Transmisor de presión diferencial'
    var trNom = placa && / \+ /.test(placa.nombre || '') ? String(placa.nombre).split(' + ')[1].replace(/\s*(E\+H|Endress\+Hauser)\s*$/i, '') : 'transmisor de presión diferencial';
    var tdgIsa = tTDG && tTDG.isa ? tTDG.isa : '';
    add({ id: 'entrada', sec: true, at: [-768, G.inlet.y + 28], long: nombre(eq('lineaEntrada'), 'Línea de entrada') + ' · mezcla', short: 'Mezcla',
      col: C.mezclaClaro, L: [20, 66], P: [70, 70], steps: ['choque', 'liberacion'] });
    add({ id: 'manometro', sec: true, at: [-712, -126], long: nombre(byId(sep.accesorios, 'manometro'), 'Manómetro'), short: 'PI', L: [-10, -52], P: [40, -60], steps: ['choque'] });
    add({ id: 'deflector', at: [-432, -160], long: nombre(byId(sep.internos, 'deflector'), 'Deflector'), short: 'Deflector', col: C.amarillo,
      L: [-30, -112], P: [10, -130], steps: ['choque'] });
    add({ id: 'psv', at: [G.psv, -284], long: nombre(byId(sep.accesorios, 'psv'), 'PSV'), short: 'PSV', col: EQ.psvLuz, L: [-30, -44], P: [-20, -150], steps: [] });
    if (tTT) add({ id: 'TT', at: [G.tt, -232], tag: tTT.tag, long: tTT.variable, short: '', L: [0, -86], P: [0, -110], steps: [] });
    if (tTPS) add({ id: 'TPS', at: [G.tps, -246], tag: tTPS.tag, long: tTPS.variable, short: '', L: [0, -44], P: [10, -170], steps: ['liberacion', 'gas'] });
    if (tTN) add({ id: 'TN', at: tnHead(), tag: tTN.tag, long: tTN.variable, short: '', L: G.tnLateral ? [60, -40] : [-50, -90], P: G.tnLateral ? [40, -60] : [-60, -240], steps: ['nivel'] });
    if (fl) add({ id: 'LIC', sec: true, solo: true, at: [G.lic.x - 36, G.lic.y], tag: fl.tag, long: rtuTxt, short: 'RTU', L: [-110, 0], P: [-90, 0], steps: ['nivel'] });
    if (fg) add({ id: 'PIC', sec: true, solo: true, at: [G.pic.x - 36, G.pic.y - 20], tag: fg.tag, long: rtuTxt, short: 'RTU', L: [-104, -12], P: [-70, -40], steps: ['gas'] });
    add({ id: 'extractor', at: [G.pad.x0 + 22, G.pad.y0 + 10], long: nombre(byId(sep.internos, 'extractor'), 'Extractor de niebla'), short: 'Extractor',
      col: C.amarillo, L: [-150, 34], P: [-100, -70], steps: ['niebla'] });
    add({ id: 'salidaGas', sec: true, at: [go.x + go.r + 8, -214], long: 'Salida de gas', short: 'Gas', col: C.gas, L: [-120, -30], P: [-110, -120], steps: ['niebla', 'gas'] });
    // placa de orificio = elemento primario (FE); el tag TDG es su transmisor de presión diferencial (ISA FIT)
    add({ id: 'placa', sec: true, at: [G.ori - 4, go.yH - go.r - 27], tag: 'FE', long: placaTxt, short: 'Placa',
      L: [-128, 8], P: [-70, 16], L0: [-118, 10], steps: ['gas'] });
    if (tTDG) add({ id: 'TDG', sec: true, at: [G.ori - 14, go.yH - 112], tag: tTDG.tag, long: (tdgIsa ? tdgIsa + ' · ' : '') + cap(trNom), short: tdgIsa,
      L: [-96, -26], P: [-40, -50], L0: [-70, -36], steps: ['gas'] });
    if (vg) add({ id: 'PV', at: [G.pv + 38, go.yH - 98], tag: vg.tag,
      dyn: function (S) { return (S.long ? nombreCorto(vg.nombre) + ' · ' : '') + Math.round(S.openPV) + ' %'; }, short: '',
      L: [72, 36], P: [20, 70], steps: ['gas'] });
    add({ id: 'registro', sec: true, at: [G.xT + G.A + 52, -G.manway.r + 6], long: nombre(byId(sep.accesorios, 'registro'), 'Registro'), short: 'Registro', L: [96, -36], P: [-60, -330], steps: [] });
    add({ id: 'salidaLiq', sec: true, at: [lo.x - lo.r - 6, 200], long: 'Salida de líquido (aceite + agua)', short: 'Líquido', col: C.ambar, L: [-150, 70], P: [-140, 150], steps: ['nivel'] });
    if (vl) add({ id: 'LV', at: [G.lv - 38, lo.yH - 98], tag: vl.tag,
      dyn: function (S) { return (S.long ? nombreCorto(vl.nombre) + ' · ' : '') + Math.round(S.open) + ' %'; }, short: '',
      L: [-72, -52], P: [-40, -70], at0: [G.lv + 38, lo.yH - 92], L0: [60, 112], P0: [20, 150], steps: ['nivel'] });
    add({ id: 'coriolis', sec: true, at: [G.cor - 22, lo.yH - 78], tag: tCOR ? tCOR.tag : 'CORIOLIS', long: corTxt, short: '',
      L: [-96, -46], P: [-60, -60], at0: [G.cor, lo.yH + 30], L0: [-20, 58], P0: [-40, 100], steps: ['nivel'] });
    add({ id: 'nivel', at: function (S) { return [G.tnLateral ? G.xT - 60 : tnX() + 4, S.lvl]; },
      dyn: function (S) { return 'Nivel ' + Math.round(S.lvlPct) + ' %' + (S.em.nivel > 0.3 ? ' · SP ' + Math.round(S.spPct) + ' %' : ''); },
      col: C.celeste, L: [110, 40], P: [90, 40], steps: ['nivel'] });
    // entre el termopozo (TT) y la sonda del TN, bajo las flechas de las gotas
    add({ id: 'asentamiento', zona: true, at: [(G.tt + G.tn) / 2, -22], long: nombre(byId(sep.internos, 'asentamiento'), 'Sección de asentamiento'), short: 'Asentamiento', steps: ['asentamiento'] });
    return out;
  }

  /* Acomoda un rótulo que choca con otro (o con una tarjeta): prueba arriba / abajo del
     estorbo y luego a sus lados; nunca lo deja fuera del lienzo. */
  function placeLabel(r, placed, up, W, H, m) {
    function inside(c) { return c.x >= m - 0.5 && c.y >= m - 0.5 && c.x + c.w <= W - m + 0.5 && c.y + c.h <= H - m + 0.5; }
    function hitOf(c) { for (var j = 0; j < placed.length; j++) if (overlap(c, placed[j], 3)) return placed[j]; return null; }
    for (var tries = 0; tries < 14; tries++) {
      var hit = hitOf(r); if (!hit) return r;
      var a = { x: r.x, y: hit.y - r.h - 5, w: r.w, h: r.h }, b = { x: r.x, y: hit.y + hit.h + 5, w: r.w, h: r.h };
      var c = { x: hit.x + hit.w + 6, y: r.y, w: r.w, h: r.h }, d = { x: hit.x - r.w - 6, y: r.y, w: r.w, h: r.h };
      var cands = up ? [a, b, c, d] : [b, a, c, d], next = null, i;
      for (i = 0; i < cands.length && !next; i++) if (inside(cands[i]) && !hitOf(cands[i])) next = cands[i];
      for (i = 0; i < cands.length && !next; i++) if (inside(cands[i])) next = cands[i];
      if (!next) { r.x = clamp(r.x, m, W - m - r.w); r.y = clamp(r.y, m, H - m - r.h); return r; }
      r = next;
    }
    return r;
  }

  function drawLabels(ctx, S, labels) {
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var fs = S.fs, placed = S.reserved.slice(), W = S.W, H = S.H, m = 6;
    for (var i = 0; i < labels.length; i++) {
      var lab = labels[i], rel = !S.stepId || lab.steps.indexOf(S.stepId) >= 0 || S.resaltar === lab.id;
      if (lab.sec && S.small && !(S.stepId && rel)) continue;
      if (lab.solo && !((S.stepId && lab.steps.indexOf(S.stepId) >= 0) || S.resaltar === lab.id)) continue; // solo en su paso
      var a = (rel ? 1 : 1 - S.dimLabels) * S.labelAlpha;
      if (a < 0.03) continue;
      var ov = S.paso === 0 && !S.resaltar, at = (ov && lab.at0) || lab.at;  // en la vista general algunos rótulos van en otro lado
      var w = typeof at === 'function' ? at(S) : at, p = S.toScreen(w[0], w[1]);
      if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) continue;
      if (lab.zona) {
        var zs = fs * 1.05;
        ctx.save(); ctx.globalAlpha = a * 0.92; ctx.font = font('700', zs, 'cond'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var txt = (S.long ? lab.long : lab.short).toUpperCase();
        if ('letterSpacing' in ctx) ctx.letterSpacing = (zs * 0.12).toFixed(1) + 'px';
        var tw = ctx.measureText(txt).width;
        if (p.x - tw / 2 < m || p.x + tw / 2 > W - m) { ctx.restore(); continue; }
        var zh = zs * 1.6, zw = tw + zs * 1.1;   // placa de fondo: las varillas de TT / TN no atraviesan el texto
        ctx.fillStyle = 'rgba(6,22,49,0.78)'; roundRect(ctx, p.x - zw / 2, p.y - zh / 2, zw, zh, zh / 2); ctx.fill();
        ctx.strokeStyle = 'rgba(169,220,247,0.22)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(6,22,49,0.7)'; ctx.strokeText(txt, p.x, p.y);
        ctx.fillStyle = C.celeste200; ctx.fillText(txt, p.x, p.y);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        ctx.restore();
        continue;
      }
      var parts = [];
      if (lab.tag) parts.push({ t: lab.tag, mono: true, col: C.amarillo });
      var name = lab.dyn ? lab.dyn(S) : (S.long ? lab.long : lab.short);
      if (name) parts.push({ t: name, col: '#eef5fb', w: '600' });
      if (!parts.length) continue;
      var off = (ov && lab[S.lay + '0']) || lab[S.lay] || [0, -40], c = { x: p.x + off[0] * S.ui, y: p.y + off[1] * S.ui };
      var mm = chip(ctx, 0, 0, parts, fs, 1, { measure: true });
      var r = { x: c.x - mm.w / 2, y: c.y - mm.h / 2, w: mm.w, h: mm.h };
      r.x = clamp(r.x, m, W - m - r.w); r.y = clamp(r.y, m, H - m - r.h);
      r = placeLabel(r, placed, off[1] <= 0, W, H, m);
      placed.push(r);
      var e = edgePoint(r, p.x, p.y);
      ctx.save(); ctx.globalAlpha = a;
      ctx.strokeStyle = rgba(C.celeste200, 0.85); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      ctx.fillStyle = C.marino900; ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = lab.col || C.celeste; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
      chip(ctx, r.x + r.w / 2, r.y + r.h / 2, parts, fs, a, { accent: lab.col || C.celeste });
    }
  }

  /* Rótulo numerado del paso con línea guía que se "dibuja" */
  function drawCallout(ctx, S) {
    var info = stepInfo(S.paso); if (!info) return null;
    var st = STEP[info.id], k1 = smooth(seg(S.prog, PT.titulo[0], PT.titulo[1])), kl = easeInOut(seg(S.prog, PT.linea[0], PT.linea[1]));
    if (S.instant) { k1 = 1; kl = 1; }
    var W = S.W, H = S.H, ui = S.ui, m = Math.round(16 * ui + 4), fs = S.fs;
    var cw = S.lay === 'P' ? W - 2 * m : Math.min(W * 0.36, 470 * ui);
    var tfs = clamp(fs * 1.55, 15, 46), pad = fs * 0.9, nr = tfs * 0.78;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.font = font('700', tfs, 'cond');
    if (!S.texto && S.lay === 'L') cw = Math.min(cw, ctx.measureText(info.titulo).width + pad * 2.6 + nr * 2 + 4);
    var tl = wrap(ctx, info.titulo, cw - pad * 2 - nr * 2 - pad * 0.6);
    var bl = [];
    if (S.texto) { ctx.font = font('400', fs * 1.02, 'body'); bl = wrap(ctx, (S.small && info.textoCorto) || info.texto, cw - pad * 2); }
    var eh = fs * 1.2, ch = pad * 2 + eh + tl.length * tfs * 1.08 + (bl.length ? fs * 0.6 + bl.length * fs * 1.42 : 0);
    ch = Math.max(ch, pad * 2 + nr * 2);
    var r = { x: m, y: m + (1 - k1) * -10, w: cw, h: ch };
    var anc = info.id === 'nivel' ? [tnX(), S.lvl] : st.ancla, p = S.toScreen(anc[0], anc[1]);
    // línea guía
    var e, mid;
    if (S.lay === 'L' && p.x > r.x + r.w + 12) { e = { x: r.x + r.w, y: r.y + r.h / 2 }; mid = { x: p.x, y: e.y }; }
    else { e = { x: clamp(p.x, r.x + 16, r.x + r.w - 16), y: r.y + r.h }; mid = { x: e.x, y: lerp(e.y, p.y, 0.5) }; }
    var seg1 = Math.hypot(mid.x - e.x, mid.y - e.y), seg2 = Math.hypot(p.x - mid.x, p.y - mid.y), L = (seg1 + seg2) * kl;
    ctx.save(); ctx.strokeStyle = C.amarillo; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    if (L <= seg1) ctx.lineTo(lerp(e.x, mid.x, L / (seg1 || 1)), lerp(e.y, mid.y, L / (seg1 || 1)));
    else { ctx.lineTo(mid.x, mid.y); ctx.lineTo(lerp(mid.x, p.x, (L - seg1) / (seg2 || 1)), lerp(mid.y, p.y, (L - seg1) / (seg2 || 1))); }
    ctx.stroke();
    if (kl > 0.98) {
      var pr = 7 + 5 * (0.5 + 0.5 * Math.sin(S.t * 4));
      ctx.strokeStyle = rgba(C.amarillo, 0.7); ctx.beginPath(); ctx.arc(p.x, p.y, pr * ui * 1.1 + 2, 0, TAU); ctx.stroke();
      ctx.fillStyle = C.amarillo; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (k1 <= 0.01) return r;
    // tarjeta
    ctx.save(); ctx.globalAlpha = k1;
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(6,22,49,0.93)'; roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(169,220,247,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = C.amarillo; ctx.fillRect(r.x, r.y + 10, 3, r.h - 20);
    var nx = r.x + pad + nr, ny = r.y + pad + nr;
    ctx.fillStyle = C.amarillo; ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fill();
    ctx.fillStyle = C.marino; ctx.font = font('800', nr * 1.25, 'cond'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(info.n), nx, ny + nr * 0.05);
    var tx = nx + nr + pad * 0.6, ty = r.y + pad;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = C.amarillo; ctx.font = font('700', fs * 0.78, 'mono');
    ctx.fillText('PASO ' + info.n + ' DE ' + ((WT.data && WT.data.pasosSeparacion) || []).length, tx, ty);
    ctx.fillStyle = '#ffffff'; ctx.font = font('700', tfs, 'cond');
    for (var i = 0; i < tl.length; i++) ctx.fillText(tl[i], tx, ty + eh + i * tfs * 1.08);
    if (bl.length) {
      var by = ty + eh + tl.length * tfs * 1.08 + fs * 0.6;
      ctx.fillStyle = '#c8d8e8'; ctx.font = font('400', fs * 1.02, 'body');
      for (i = 0; i < bl.length; i++) ctx.fillText(bl[i], r.x + pad, by + i * fs * 1.42);
    }
    ctx.restore();
    return r;
  }

  /* Lupa: detalle de la malla del extractor (paso 4) */
  function drawMagnifier(ctx, S) {
    var k = S.em.niebla * S.kx; if (k < 0.02) return null;
    var ui = S.ui, anc = S.toScreen(G.pad.x0, -60), R = (S.lay === 'P' ? 84 : 92) * ui;
    var c = S.lay === 'P' ? { x: S.W * 0.3, y: S.H - R - S.fs * 2.6 - Math.max(10, S.fs * 0.78) * 2.2 } : { x: anc.x - 240 * ui, y: anc.y + 90 * ui };
    c.x = clamp(c.x, R + 8, S.W - R - 8); c.y = clamp(c.y, R + 8, S.H - R - S.fs * 2.6 - 8);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.save(); ctx.globalAlpha = k;
    ctx.strokeStyle = rgba(C.celeste200, 0.8); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(anc.x, anc.y); ctx.lineTo(c.x + (anc.x - c.x) / Math.hypot(anc.x - c.x, anc.y - c.y) * R, c.y + (anc.y - c.y) / Math.hypot(anc.x - c.x, anc.y - c.y) * R); ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#1b2a40'; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, R - 1, 0, TAU); ctx.clip();
    var bg = ctx.createLinearGradient(0, c.y - R, 0, c.y + R);
    bg.addColorStop(0, '#3a5272'); bg.addColorStop(1, '#16243a');
    ctx.fillStyle = bg; ctx.fillRect(c.x - R, c.y - R, 2 * R, 2 * R);
    var gap = R / 3.2, i, j, t = S.t;
    // alambres de la malla (tejido)
    for (i = -4; i <= 4; i++) {
      var wx = c.x + i * gap * 0.9;
      ctx.lineWidth = 3.2 * ui; ctx.strokeStyle = '#7f93ab';
      ctx.beginPath(); for (j = -R; j <= R; j += 4) ctx.lineTo(wx + Math.sin((j + i * 13) * 0.08) * 3 * ui, c.y + j); ctx.stroke();
      ctx.lineWidth = 1 * ui; ctx.strokeStyle = 'rgba(230,240,250,0.65)';
      ctx.beginPath(); for (j = -R; j <= R; j += 4) ctx.lineTo(wx - 0.8 * ui + Math.sin((j + i * 13) * 0.08) * 3 * ui, c.y + j); ctx.stroke();
    }
    for (i = -4; i <= 4; i++) {
      var wy = c.y + i * gap;
      ctx.lineWidth = 2.4 * ui; ctx.strokeStyle = 'rgba(127,147,171,0.85)';
      ctx.beginPath(); for (j = -R; j <= R; j += 4) ctx.lineTo(c.x + j, wy + Math.sin((j + i * 7) * 0.1) * 2.5 * ui); ctx.stroke();
    }
    // niebla que llega, se pega, coalesce y escurre
    for (i = 0; i < S.P.lupa.length; i++) {
      var d = S.P.lupa[i], u = frac(d.ph + t / d.T), col = Math.round(lerp(-3, 3, d.stick)), sx = c.x + col * gap * 0.9, y0 = c.y + lerp(-R * 0.85, R * 0.5, d.y);
      var x, y, rr;
      if (u < 0.35) { x = lerp(c.x - R - 10, sx - 2 * ui, u / 0.35); y = y0; rr = d.r * ui * 1.2; }
      else if (u < 0.7) { x = sx; y = y0; rr = lerp(d.r, d.r * 3.4, easeOut((u - 0.35) / 0.35)) * ui; }
      else { x = sx; rr = d.r * 3.4 * ui; y = y0 + Math.pow((u - 0.7) / 0.3, 2) * (R * 1.6); }
      drawDrop(ctx, x, y, rr, u < 0.04 ? u / 0.04 : 1, u >= 0.7 ? 0.5 : 0);
    }
    ctx.restore();
    ctx.strokeStyle = C.celeste; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(c.x, c.y, R - 4, PI * 1.1, PI * 1.45); ctx.stroke();
    ctx.restore();
    chip(ctx, c.x, c.y + R + S.fs * 0.6, [{ t: 'Detalle de la malla · coalescencia', w: '600' }], S.fs * 0.9, k, { accent: C.celeste });
    return { x: c.x - R, y: c.y - R, w: 2 * R, h: 2 * R + S.fs * 1.8 };
  }

  /* Tarjeta de presiones (paso 2) con valores de demostración. La caída de presión
     principal ocurre en el estrangulador, antes del separador: TDP (boca de pozo) →
     estrangulador TP / TR → TPS (separador). La mezcla llega con gas libre y, dentro
     del separador, se libera el gas que aún viene disuelto (burbujas del dibujo). */
  function drawPressureCard(ctx, S) {
    var k = S.em.liberacion * S.kx; if (k < 0.02) return null;
    var D = WT.data || {}, demo = D.demo || {}, U = WT.util || {}, i;
    var a = U.instrumento ? U.instrumento('TDP') : null, b = U.instrumento ? U.instrumento('TPS') : null;
    if (!a || !b || demo.pPozo == null || demo.pSep == null) return null;
    var est = U.equipo ? U.equipo('estrangulador') : null, estN = est ? (est.nombre || est.corto) : 'Estrangulador';
    var fs = S.fs, m = Math.round(16 * S.ui + 4), pad = fs * 0.8, lh = fs * 1.7, lm = lh * 1.45;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var rows = [[a.tag, a.variable, fmt(demo.pPozo, 1) + ' ' + a.unidad], [b.tag, b.variable, fmt(demo.pSep, 1) + ' ' + b.unidad]];
    var mid1 = 'Caída de presión principal', mid2 = 'en el ' + estN.charAt(0).toLowerCase() + estN.slice(1);
    var vMid = '\u2212' + fmt(demo.pPozo - demo.pSep, 1) + ' ' + a.unidad;
    ctx.font = font('600', fs, 'body');
    var w0 = 0; for (i = 0; i < rows.length; i++) w0 = Math.max(w0, ctx.measureText(rows[i][1]).width);
    ctx.font = font('700', fs * 0.95, 'body'); w0 = Math.max(w0, ctx.measureText(mid1).width);
    ctx.font = font('600', fs * 0.9, 'body'); w0 = Math.max(w0, ctx.measureText(mid2).width);
    ctx.font = font('700', fs * 1.1, 'mono'); var w1 = Math.max(ctx.measureText(rows[0][2]).width, ctx.measureText(rows[1][2]).width);
    ctx.font = font('700', fs * 0.95, 'mono'); w1 = Math.max(w1, ctx.measureText(vMid).width);
    var cw = pad * 2 + fs * 4 + w0 + fs + w1, ch = pad * 2 + lh * 2 + lm + fs * 1.1;
    var x = S.lay === 'P' ? (S.W - cw) / 2 : m, y = S.H - m - ch;
    if (S.lay === 'P' && S.aviso) y -= Math.max(10, fs * 0.78) * 1.4;   // deja libre la nota de la esquina
    var showMidVal = true;
    if (cw > S.W - 2 * m) { cw = S.W - 2 * m; x = m; showMidVal = pad * 2 + fs * 4 + w0 + fs * 0.6 + w1 <= cw; }
    var tx = x + pad + fs * 4, vx = x + cw - pad;
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(6,22,49,0.92)'; roundRect(ctx, x, y, cw, ch, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(169,220,247,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textBaseline = 'middle';
    var ys = [y + pad + lh / 2, y + pad + lh + lm + lh / 2];
    for (i = 0; i < 2; i++) {
      ctx.textAlign = 'left'; ctx.fillStyle = C.amarillo; ctx.font = font('700', fs * 0.9, 'mono'); ctx.fillText(rows[i][0], x + pad, ys[i]);
      ctx.fillStyle = '#dfe9f3'; ctx.font = font('600', fs, 'body'); ctx.fillText(rows[i][1], tx, ys[i]);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = font('700', fs * 1.1, 'mono'); ctx.fillText(rows[i][2], vx, ys[i]);
    }
    // tramo intermedio: el estrangulador (flecha café → amarilla: la mezcla sale con gas libre)
    var my = y + pad + lh + lm / 2, ax = x + pad + fs * 1.2;
    var gr = ctx.createLinearGradient(0, my - lm * 0.5, 0, my + lm * 0.5);
    gr.addColorStop(0, C.mezclaClaro); gr.addColorStop(1, C.gas);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(ax - fs * 0.5, my - lm * 0.48); ctx.lineTo(ax + fs * 0.5, my - lm * 0.48); ctx.lineTo(ax + fs * 0.5, my + lm * 0.08);
    ctx.lineTo(ax + fs * 0.9, my + lm * 0.08); ctx.lineTo(ax, my + lm * 0.5); ctx.lineTo(ax - fs * 0.9, my + lm * 0.08); ctx.lineTo(ax - fs * 0.5, my + lm * 0.08); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(169,220,247,0.16)'; ctx.beginPath(); ctx.moveTo(tx, y + pad + lh + 1); ctx.lineTo(vx, y + pad + lh + 1); ctx.moveTo(tx, y + pad + lh + lm - 1); ctx.lineTo(vx, y + pad + lh + lm - 1); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = C.celeste200; ctx.font = font('700', fs * 0.95, 'body'); ctx.fillText(mid1, tx, my - fs * 0.5);
    ctx.fillStyle = '#ffffff'; ctx.font = font('600', fs * 0.9, 'body'); ctx.fillText(mid2, tx, my + fs * 0.55);
    if (showMidVal) { ctx.textAlign = 'right'; ctx.fillStyle = C.celeste200; ctx.font = font('700', fs * 0.95, 'mono'); ctx.fillText(vMid, vx, my); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#7f97b3'; ctx.font = font('500', fs * 0.78, 'body');
    ctx.fillText(demo.aviso || 'Valores simulados', x + pad, y + ch - pad - fs * 0.3);
    ctx.restore();
    return { x: x, y: y, w: cw, h: ch };
  }

  /* Tarjeta de lectura del medidor (pasos 5 y 6): lo que mide el Coriolis en la
     salida de líquido y la placa de orificio (FE, con su transmisor TDG) en la de
     gas, ANTES de la válvula de control. Valores de WT.data.demo (simulados, con aviso). */
  function readingRows(S) {
    var D = WT.data || {}, demo = D.demo || {}, U = WT.util || {};
    function inst(tag) { return U.instrumento ? U.instrumento(tag) : null; }
    function vr(id) { var L = D.variables || []; for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
    var rows = [], head = null, k = 0;
    if (S.em.nivel > 0.01 && S.em.nivel >= S.em.gas) {
      var ic = inst('CORIOLIS'), eqc = U.equipo ? U.equipo('coriolis') : null, qv = vr('qMezcla'), av = vr('pctAgua');
      if (!ic || demo.qMezcla == null) return null;
      k = S.em.nivel;
      head = [ic.tag, ic.marca ? String(ic.marca).replace('Endress+Hauser', 'E+H') : (eqc && eqc.corto) || 'Coriolis'];
      var q = demo.qMezcla * (1 + 0.18 * (S.open - 50) / 46);   // sigue a la apertura de la LV (aguas abajo)
      rows.push(['', qv ? qv.nombre : 'Q líquido', fmt(q, 0) + ' ' + (qv ? qv.unidad : 'bpd')]);
      if (demo.densidad != null && !S.small) rows.push(['', 'Densidad', fmt(demo.densidad, 0) + ' kg/m³']);
      if (demo.pctAgua != null) rows.push(['', av ? av.nombre : '% Agua', fmt(demo.pctAgua, 1) + ' %']);
    } else if (S.em.gas > 0.01) {
      // la placa de orificio (FE) es el elemento primario; el TDG (FIT) mide su presión diferencial
      // y el FQI del RTU calcula el gasto compensado por presión y temperatura (WT.data.funciones)
      var it = inst('TDG'), gv = vr('qGas'), fq = funcionQueMide(it ? it.tag : 'TDG');
      var placa = U.equipo ? U.equipo('placa') : null;
      if (!it || demo.dpGas == null) return null;
      k = S.em.gas;
      head = ['FE', (placa && placa.corto) || 'Placa de orificio'];
      var dp = demo.dpGas * (1 + 0.035 * Math.sin(S.t * 0.9) + 0.02 * Math.sin(S.t * 2.3 + 1));
      rows.push([it.tag, 'Presión diferencial', fmt(dp, 0) + ' ' + it.unidad]);
      if (demo.qGas != null) rows.push([fq ? fq.tag : '', gv ? gv.nombre : 'Q gas', fmt(demo.qGas * Math.sqrt(dp / demo.dpGas), 2) + ' ' + (gv ? gv.unidad : 'MMpcd')]);
      var comp = fq && fq.compensa ? fq.compensa : ['TPS'];
      for (var c = 0; c < comp.length && !S.small; c++) {
        var ic2 = inst(comp[c]), L = D.variables || [], v2 = null;
        for (var j = 0; j < L.length; j++) if (L[j].tag === comp[c]) { v2 = L[j]; break; }
        if (ic2 && v2 && demo[v2.id] != null) rows.push([ic2.tag, ic2.variable, fmt(demo[v2.id], 1) + ' ' + ic2.unidad]);
      }
    }
    return head ? { head: head, rows: rows, k: k, aviso: demo.aviso || 'Valores simulados' } : null;
  }
  function drawReadingCard(ctx, S) {
    if (!S.lecturas || S.small) return null;   // en pantallas chicas taparía el medidor y la válvula
    var R = readingRows(S); if (!R) return null;
    var k = R.k * S.kx; if (k < 0.02) return null;
    var fs = S.fs, m = Math.round(16 * S.ui + 4), pad = fs * 0.8, lh = fs * 1.62, i;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var wt = 0, wn = 0, wv = 0;
    ctx.font = font('700', fs * 0.86, 'mono');
    for (i = 0; i < R.rows.length; i++) if (R.rows[i][0]) wt = Math.max(wt, ctx.measureText(R.rows[i][0]).width + fs * 0.6);
    ctx.font = font('600', fs, 'body');
    for (i = 0; i < R.rows.length; i++) wn = Math.max(wn, ctx.measureText(R.rows[i][1]).width);
    ctx.font = font('700', fs * 1.08, 'mono');
    for (i = 0; i < R.rows.length; i++) wv = Math.max(wv, ctx.measureText(R.rows[i][2]).width);
    ctx.font = font('700', fs * 0.86, 'mono'); var wh = ctx.measureText(R.head[0]).width;
    ctx.font = font('700', fs * 1.12, 'cond'); wh += fs * 0.5 + ctx.measureText(R.head[1]).width;
    var cw = Math.max(pad * 2 + wt + wn + fs * 1.2 + wv, pad * 2 + wh), hh = fs * 1.7;
    var ch = pad * 2 + hh + lh * R.rows.length + fs * 1.15;
    var x = S.lay === 'P' ? (S.W - cw) / 2 : m, y = S.H - m - ch - (S.lay === 'P' ? Math.max(10, fs * 0.78) * 1.2 : 0);
    if (cw > S.W - 2 * m) { cw = S.W - 2 * m; x = m; }
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(6,22,49,0.92)'; roundRect(ctx, x, y, cw, ch, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(169,220,247,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = C.celeste; ctx.fillRect(x, y + 10, 3, ch - 20);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var hy = y + pad + hh / 2;
    ctx.fillStyle = C.amarillo; ctx.font = font('700', fs * 0.86, 'mono'); ctx.fillText(R.head[0], x + pad, hy);
    var hx = x + pad + ctx.measureText(R.head[0]).width + fs * 0.5;
    ctx.fillStyle = '#ffffff'; ctx.font = font('700', fs * 1.12, 'cond'); ctx.fillText(R.head[1], hx, hy);
    ctx.strokeStyle = 'rgba(169,220,247,0.18)'; ctx.beginPath(); ctx.moveTo(x + pad, y + pad + hh); ctx.lineTo(x + cw - pad, y + pad + hh); ctx.stroke();
    for (i = 0; i < R.rows.length; i++) {
      var ry = y + pad + hh + lh * i + lh / 2 + 2;
      if (R.rows[i][0]) { ctx.textAlign = 'left'; ctx.fillStyle = C.amarillo; ctx.font = font('700', fs * 0.86, 'mono'); ctx.fillText(R.rows[i][0], x + pad, ry); }
      ctx.textAlign = 'left'; ctx.fillStyle = '#dfe9f3'; ctx.font = font('600', fs, 'body'); ctx.fillText(R.rows[i][1], x + pad + wt, ry);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = font('700', fs * 1.08, 'mono'); ctx.fillText(R.rows[i][2], x + cw - pad, ry);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = '#7f97b3'; ctx.font = font('500', fs * 0.78, 'body');
    ctx.fillText(R.aviso, x + pad, y + ch - pad - fs * 0.2);
    ctx.restore();
    return { x: x, y: y, w: cw, h: ch };
  }

  function drawHeaderAndNote(ctx, S) {
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var fs = S.fs, m = Math.round(16 * S.ui + 4), out = [];
    var a = (1 - S.dimLabels) * S.labelAlpha * (S.etiquetas ? 1 : 0);
    if (a > 0.02 && S.paso === 0) {
      var sep = (WT.data && WT.data.separador) || {};
      var parts = [{ t: S.tag, mono: true, col: C.amarillo }, { t: S.long ? String(sep.tipo || '').split(' (')[0] + ' · corte longitudinal' : 'Corte', w: '600' }];
      var mm = chip(ctx, 0, 0, parts, fs * 1.1, 1, { measure: true });
      var rr = chip(ctx, m + mm.w / 2, m + mm.h / 2, parts, fs * 1.1, a, { accent: C.amarillo });
      out.push(rr);
    }
    if (!S.aviso) return out;   // create({ aviso: false }): el video pone su propio aviso
    var note = ((WT.data && WT.data.demo && WT.data.demo.aviso) || 'Valores simulados');
    ctx.save(); ctx.globalAlpha = 0.75 * S.labelAlpha; ctx.font = font('500', Math.max(10, fs * 0.78), 'body'); ctx.fillStyle = '#8fa6c0';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('Ilustración esquemática · ' + note.charAt(0).toLowerCase() + note.slice(1), S.W - m, S.H - m * 0.6);
    ctx.restore();
    var nh = Math.max(10, fs * 0.78) * 1.6;
    out.push({ x: S.W * 0.45, y: S.H - m * 0.6 - nh, w: S.W * 0.55, h: nh });
    return out;
  }

  /* ==================================================================
     API
     ================================================================== */
  function levelY(t, amp) { return G.spY - amp * (Math.sin(t * TAU / 14) + 0.3 * Math.sin(t * TAU / 5.3 + 1.1)); }
  function pct(y) { return (G.Ri - y) / (2 * G.Ri) * 100; }
  /* Anclas para c.anchor(id) (coordenadas de dibujo; se actualizan en create según el montaje del TN) */
  var ANCH = {};
  function buildAnchors() {
    var A = {
      deflector: [-432, -69], extractor: [320, -92], asentamiento: [-20, -40], TN: tnHead(), TPS: [G.tps, -246], TT: [G.tt, -232],
      psv: [G.psv, -280], LV: [G.lv, G.liqOut.yH], PV: [G.pv, G.gasOut.yH], coriolis: [G.cor, G.liqOut.yH], CORIOLIS: [G.cor, G.liqOut.yH],
      placa: [G.ori, G.gasOut.yH], FE: [G.ori, G.gasOut.yH], TDG: [G.ori, G.gasOut.yH - 110], entrada: [-700, G.inlet.y], manometro: [-712, -126],
      registro: [G.xT + G.A + 40, 0], LIC: [G.lic.x, G.lic.y], PIC: [G.pic.x, G.pic.y], rtu: [G.lic.x, G.lic.y],
      salidaGas: [G.gasOut.x, -200], salidaLiq: [G.liqOut.x, 200], separador: [0, 0]
    };
    for (var k in A) ANCH[k] = A[k];
  }

  WT.Cutaway = {
    create: function (container, opts) {
      opts = opts || {};
      loadColors(); loadConfig(); buildZones(); buildAnchors();
      var sep = (WT.data && WT.data.separador) || {};
      var root = document.createElement('div');
      root.className = 'wt-cutaway';
      root.style.position = 'relative'; root.style.overflow = 'hidden';
      var canvas = document.createElement('canvas');
      canvas.className = 'wt-cutaway-canvas';
      canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
      canvas.setAttribute('role', 'img');
      root.appendChild(canvas);
      if (container) container.appendChild(root);
      var ctx = canvas.getContext('2d');
      var vig = document.createElement('canvas');
      var state = {
        W: 0, H: 0, dpr: 1, layout: opts.layout === 'portrait' ? 'portrait' : 'landscape',
        labels: opts.labels !== false, aviso: opts.aviso !== false, tag: opts.tag || sep.tagDefault || 'FA-06', last: null, aria: ''
      };
      var P = initParticles(), streams = buildStreams(), pipes = buildPipes(), labels = buildLabels();

      function resize(w, h) {
        state.W = Math.max(1, Math.round(w || (container && container.clientWidth) || 1280));
        state.H = Math.max(1, Math.round(h || (container && container.clientHeight) || 720));
        state.dpr = opts.pixelRatio || Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(state.W * state.dpr); canvas.height = Math.round(state.H * state.dpr);
        root.style.width = state.W + 'px'; root.style.height = state.H + 'px';
      }

      function renderAt(t, st) {
        st = st || {}; t = +t || 0;
        var W = state.W, H = state.H, dpr = state.dpr, nP = self.pasos.length;
        var lay = ((st.layout || state.layout) === 'portrait') ? 'P' : 'L';
        var paso = clamp(Math.round(+st.paso || 0), 0, nP);
        var prog = st.progreso == null ? 1 : clamp(+st.progreso, 0, 1);
        var desde = st.desde == null ? (paso > 0 ? paso - 1 : 0) : clamp(Math.round(+st.desde), 0, nP);
        var ap = st.apertura == null ? 1 : clamp(+st.apertura, 0, 1);
        var instant = !!st.instantaneo;
        var id = stepId(paso), idPrev = stepId(desde);
        var tag = st.tag || state.tag;

        // ---- cámara 2D: encuadre previo → encuadre del paso (+ acercamiento lento)
        function camOf(z, p) {
          var s = Math.min(W / z.w, H / z.h), cx = z.cx, cy = z.cy;
          if (p > 0) { if (lay === 'L') cx -= (W / s) * 0.12; else cy -= (H / s) * 0.1; }
          return { s: s, cx: cx, cy: cy };
        }
        var za = idPrev ? STEP[idPrev][lay] : VIEW0[lay], zb = id ? STEP[id][lay] : VIEW0[lay];
        var ca = camOf(za, desde), cb = camOf(zb, paso);
        var kc = (desde === paso || instant) ? 1 : easeInOut(seg(prog, PT.cam[0], PT.cam[1]));
        var scale = Math.exp(lerp(Math.log(ca.s), Math.log(cb.s), kc));
        var cx = lerp(ca.cx, cb.cx, kc), cy = lerp(ca.cy, cb.cy, kc);
        if (paso > 0) scale *= 1 + 0.045 * smooth(seg(prog, PT.kb[0], PT.kb[1]));
        else scale *= 1 + 0.012 * Math.sin(t * 0.21);
        scale *= lerp(0.93, 1, easeOut(ap));

        // ---- énfasis por paso y resaltado
        var em = { choque: 0, liberacion: 0, asentamiento: 0, niebla: 0, nivel: 0, gas: 0 };
        var kin = instant ? 1 : smooth(seg(prog, 0.04, 0.3));
        if (id) em[id] = kin;
        if (idPrev && idPrev !== id) em[idPrev] = Math.max(em[idPrev], 1 - smooth(seg(prog, 0, 0.15)));
        var kd = (desde === paso || instant) ? 1 : smooth(seg(prog, 0.02, 0.22));
        var dim = lerp(idPrev ? 1 : 0, id ? 1 : 0, kd), zonas = [], i;
        if (id) for (i = 0; i < STEP[id].zonas.length; i++) zonas.push(STEP[id].zonas[i].concat([kd]));
        if (idPrev && idPrev !== id) for (i = 0; i < STEP[idPrev].zonas.length; i++) zonas.push(STEP[idPrev].zonas[i].concat([1 - kd]));
        if (st.resaltar && RES[st.resaltar]) { zonas = RES[st.resaltar].map(function (z) { return z.concat([1]); }); dim = 1; }

        // ---- lazo de nivel (simulado): nivel oscila; LV abre con retardo
        // en el paso "nivel" el nivel sube (según progreso), la LV abre y el nivel regresa al SP
        var amp = lerp(7, 5, em.nivel), spPct = pct(G.spY);
        function hump(pp) { return smooth(seg(pp, 0.1, 0.4)) * (1 - 0.75 * smooth(seg(pp, 0.55, 0.95))); }
        function lvlAt(tt, pp) { return levelY(tt, amp) - 30 * em.nivel * hump(pp); }
        var pr = instant ? 0.5 : prog, lvl = lvlAt(t, pr);
        var open = clamp(50 + 5.5 * (pct(lvlAt(t - 1.4, pr - 0.05)) - spPct), 6, 96);
        var ui = lay === 'L' ? clamp(Math.min(W / 1280, H / 720), 0.55, 2.2) : clamp(W / 600, 0.55, 2.2);

        var S = {
          t: t, W: W, H: H, dpr: dpr, scale: scale, cx: cx, cy: cy, lay: lay, paso: paso, prog: prog, stepId: id,
          P: P, streams: streams, pipes: pipes, tag: tag, em: em, dim: dim, zonas: zonas, resaltar: st.resaltar || null,
          dimLabels: dim, kx: instant ? 1 : smooth(seg(prog, PT.extra[0], PT.extra[1])), instant: instant,
          lvl: lvl, lvlPct: pct(lvl), spPct: spPct, lvlTrend: lvl - lvlAt(t + 0.1, Math.min(1, pr + 0.014)), open: open,
          openPV: 48 + 7 * Math.sin(t * 0.37 + 0.6), ui: ui, fs: clamp(12.5 * ui, 10.5, 30),
          long: lay === 'L' ? W >= 760 : W >= 520, small: Math.min(W, H) < 480, etiquetas: st.etiquetas == null ? state.labels : !!st.etiquetas,
          texto: !!st.texto, labelAlpha: smooth(seg(ap, 0.75, 1)), aviso: st.aviso == null ? state.aviso : !!st.aviso, extraReserved: [],
          lecturas: st.lecturas == null ? (st.etiquetas == null ? state.labels : !!st.etiquetas) : !!st.lecturas,
          orden: st.orden == null ? (st.etiquetas == null ? state.labels : !!st.etiquetas) : !!st.orden,
          cutX: ap < 1 ? lerp(-G.xT - G.A - 14, G.xT + G.A + 14, easeInOut(seg(ap, 0.08, 0.92))) : Infinity
        };
        S.toScreen = function (x, y) { return { x: W / 2 + (x - cx) * scale, y: H / 2 + (y - cy) * scale }; };
        S.world = function (c) { c.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - cx * scale), dpr * (H / 2 - cy * scale)); };
        S.view = { x0: cx - W / 2 / scale, x1: cx + W / 2 / scale, y0: cy - H / 2 / scale, y1: cy + H / 2 / scale };
        S.front = liquidFront(S);
        S.loops = loopsOf(S);

        // ---- dibujo
        ctx.save();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        drawBackground(ctx, S);
        drawGroundAndTrailer(ctx, S);
        drawShellBack(ctx, S);
        drawGasSpace(ctx, S);
        drawLiquidSurface(ctx, S);
        drawLiquidSection(ctx, S);
        drawMist(ctx, S);
        drawFallingDrops(ctx, S);
        drawInletJet(ctx, S);
        drawPad(ctx, S);
        drawCoalescence(ctx, S);
        drawDeflector(ctx, S);
        drawProbes(ctx, S);
        drawShellCut(ctx, S);
        if (S.cutX < Infinity) drawExterior(ctx, S, S.cutX);
        drawPipes(ctx, S);
        ctx.save();
        if (S.cutX < Infinity) { ctx.beginPath(); ctx.rect(-3000, -3000, S.cutX + 3000, 6000); ctx.clip(); }
        drawStreams(ctx, S);
        ctx.restore();
        drawGasPipeArrows(ctx, S);
        drawTopAccessories(ctx, S);
        drawTagPlate(ctx, S);
        drawLineDevices(ctx, S);
        drawSignals(ctx, S);
        if (S.cutX < Infinity && ap > 0.06 && ap < 0.96) drawSweep(ctx, S);
        drawHighlight(ctx, S, vig);
        S.world(ctx);
        drawStepOverlays(ctx, S);
        var reserved = [];
        if (S.etiquetas || S.paso > 0) reserved = reserved.concat(drawHeaderAndNote(ctx, S));
        var rc = (st.rotuloPaso == null ? S.etiquetas : !!st.rotuloPaso) ? drawCallout(ctx, S) : null; if (rc) reserved.push(rc);
        var rm = drawMagnifier(ctx, S); if (rm) reserved.push(rm);
        var rp = drawPressureCard(ctx, S); if (rp) reserved.push(rp);
        var rl = drawReadingCard(ctx, S); if (rl) reserved.push(rl);
        S.reserved = reserved.concat(S.extraReserved);
        if (S.etiquetas) drawLabels(ctx, S, labels);
        ctx.restore();

        state.last = S;
        var info = stepInfo(paso);
        var aria = 'Corte interno del separador bifásico horizontal ' + tag + (info ? ' — paso ' + info.n + ': ' + info.titulo + '. ' + info.texto : ' — vista general con todo funcionando.');
        if (aria !== state.aria) { canvas.setAttribute('aria-label', aria); state.aria = aria; }
        return self;
      }

      var self = {
        el: root, canvas: canvas, pasos: (WT.data && WT.data.pasosSeparacion) || [], zonas: RES,
        renderAt: renderAt, resize: resize,
        setTag: function (tag) { if (tag) state.tag = tag; return self; },
        setLayout: function (l) { state.layout = l === 'portrait' ? 'portrait' : 'landscape'; return self; },
        anchor: function (name) {
          var S = state.last; if (!S) return null;
          var w = name === 'nivel' ? [tnX(), S.lvl] : ANCH[name]; if (!w) return null;
          return S.toScreen(w[0], w[1]);
        },
        dispose: function () { if (root.parentNode) root.parentNode.removeChild(root); state.last = null; }
      };
      resize(opts.width, opts.height);
      return self;
    }
  };

  /* Fuentes que usa el lienzo (para precargarlas antes de capturar cuadros de video) */
  WT.Cutaway.fuentes = ['600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"', '800 20px "Barlow Condensed"', '400 20px "Barlow"',
    '500 20px "Barlow"', '600 20px "Barlow"', '700 20px "JetBrains Mono"'];
  WT.Cutaway.cargarFuentes = function () {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(WT.Cutaway.fuentes.map(function (f) { return document.fonts.load(f).catch(function () { return null; }); }));
  };

  /* Línea de barrido que "abre" el recipiente en corte */
  function drawSweep(ctx, S) {
    var x = S.cutX, g = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
    g.addColorStop(0, rgba(C.celeste, 0)); g.addColorStop(0.5, rgba(C.celeste, 0.55)); g.addColorStop(1, rgba(C.celeste, 0));
    ctx.fillStyle = g; ctx.fillRect(x - 26, -G.R - 30, 52, 2 * G.R + 60);
    ctx.fillStyle = 'rgba(235,248,255,0.95)'; ctx.fillRect(x - 1.2, -G.R - 30, 2.4, 2 * G.R + 60);
    for (var i = 0; i < 9; i++) {
      var y = -G.R + (i + 0.5) * (2 * G.R / 9) + 8 * Math.sin(S.t * 13 + i * 2.1);
      ctx.fillStyle = rgba(C.amarillo, 0.8); ctx.beginPath(); ctx.arc(x + 4 * Math.sin(S.t * 17 + i), y, 1.8, 0, TAU); ctx.fill();
    }
  }
})();
