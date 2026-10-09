/* =====================================================================
   Well Testing · R.B. Tec México — WT.SCADA
   ---------------------------------------------------------------------
   1) WT.SCADA.sim(h): simulación DETERMINISTA y plausible del aforo
      (h = horas desde que se abre el pozo al separador, 0 → 28):
        Estabilización (0 → horasEstabilizacion): las variables convergen
          con oscilación amortiguada desde los valores de arranque.
        En curso (24 h): valores alrededor de WT.data.demo con ruido suave
          determinista y derivas lentas; los acumulados son la integral
          (trapecios, tabla precalculada) de los gastos.
        Finalizado: acumulados congelados.
   2) WT.SCADA.create(container, opts): pantalla HMI "SAF-900" de alto
      desempeño (ISA-101: fondo gris pizarra, color solo donde informa).
      renderAt(h, { resaltar, t, rueda }) pinta la hora simulada h; no
      depende del cuadro anterior (el video HyperFrames busca cuadros
      arbitrarios). rueda:true anima el giro de los odómetros entre dígitos
      (solo mientras la vista avanza; en pausa se omite para que ningún
      dígito quede a medio giro).
      Mímico en el orden del proceso: gas → placa de orificio (TDG) → PV;
      líquido → Coriolis → LV; ambas corrientes se reincorporan a batería.
      El gasto de gas (MMpcd) lo calcula la función FQI del RTU con el ΔP
      del TDG: se rotula «FQI (TDG)».
   Todos los valores son SIMULADOS (WT.data.demo.aviso).
   ===================================================================== */
(function () {
  'use strict';
  var WT = (window.WT = window.WT || {});
  var D = WT.data, U = WT.util, C = D.colores, DM = D.demo;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var PI2 = Math.PI * 2;

  /* ------------------------------------------------------------------
     Tiempos de la medición
     ------------------------------------------------------------------ */
  var HS = D.medicion.horasEstabilizacion;   // fin de estabilización
  var HM = D.medicion.horasMedicion;         // 24 h de medición
  var HEND = HS + HM;                        // fin de la medición
  var HTOT = HEND + 2;                       // horizonte de la simulación (28 h con los valores actuales)
  var BBL_M3 = 0.158987294928;               // m³ por barril

  /* Color del agua (% agua / Q agua) desde WT.data.colores, con respaldo */
  var AGUA = C.agua || '#3d8fd1';
  /* Plumas de tendencia: 3 tonos categóricos validados (all-pairs, modo oscuro, fondo #1e2328) */
  var PEN = ['#3987e5', '#d95926', '#199e70'];

  /* ------------------------------------------------------------------
     Ruido suave determinista (value noise con WT.util.rng)
     ------------------------------------------------------------------ */
  function valueNoise(seed, step) {
    var r = U.rng(seed), n = Math.ceil((HTOT + 12) / step) + 4, a = new Float32Array(n), i;
    for (i = 0; i < n; i++) a[i] = r() * 2 - 1;
    return function (h) {
      var x = (h + 4) / step, k = Math.floor(x), f = x - k;
      if (k < 0) { k = 0; f = 0; } else if (k > n - 2) { k = n - 2; f = 1; }
      f = f * f * (3 - 2 * f);
      return a[k] + (a[k + 1] - a[k]) * f;
    };
  }
  // tres octavas: rápida (≈1.5 min), media (≈12 min) y lenta (≈1.3 h)
  function canal(seed, amp) {
    var a = valueNoise(seed, 0.025), b = valueNoise(seed + 101, 0.2), c = valueNoise(seed + 211, 1.3);
    return function (h) { return amp * (0.18 * a(h) + 0.52 * b(h) + 0.30 * c(h)); };
  }
  var N = {
    pPozo: canal(11, 0.55), pSep: canal(23, 0.11), pBat: canal(37, 0.05), pSal: canal(41, 0.04),
    tSep: canal(53, 0.5), agua: canal(67, 0.9), qM: canal(71, 0.04), qG: canal(83, 0.045),
    niv: canal(97, 4.0), rho: canal(101, 1.1)
  };

  /* Respuesta de 2.º orden subamortiguada: envolvente que va de 1 → 0 */
  function env(t, z, wn) {
    if (t <= 0) return 1;
    var s = Math.sqrt(1 - z * z), wd = wn * s;
    return Math.exp(-z * wn * t) * (Math.cos(wd * t) + (z / s) * Math.sin(wd * t));
  }
  function slug(h) { return 1 + 1.6 * Math.exp(-h / 0.55); }                 // agitación al abrir el pozo
  function deriva(h) { return U.clamp((h - HS) / HM, 0, 1) - 0.5; }          // −0.5 → +0.5 durante la medición

  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  var RHO_AGUA = num(DM.densidadAgua, 1030);                                  // kg/m³ agua de formación
  var PA0 = DM.pctAgua / 100;
  var RHO_ACEITE = (DM.densidad - PA0 * RHO_AGUA) / (1 - PA0);               // aceite coherente con demo.densidad
  var P_LINEA = DM.pBateria - 0.3;                                            // presión estática de la línea antes de abrir
  var P_CIERRE = DM.pPozo * 1.34;                                             // presión en boca de pozo cerrado
  var T_AMB = num(DM.tAmbiente, 29);                                          // °C ambiente al arrancar
  var AGUA_INI = Math.min(95, DM.pctAgua + 17);                               // limpieza: fluidos de control al inicio
  var DP_GAS = num(DM.dpGas, 64);                                             // inH₂O en la placa con el gasto de demo
  var NIVEL_SP = U.clamp(num(D.separador.nivelSP, 50), 10, 90);               // % consigna del lazo de nivel (LIC)
  var NIVEL_INI = Math.max(5, NIVEL_SP - 25);                                 // nivel al abrir el pozo
  var LV_BASE = 42;                                                           // % apertura típica de la LV en régimen
  var K_SAL = (DM.pSalida - DM.pBateria) / (DM.pSep - DM.pBateria);

  /* Valores instantáneos (sin acumulados) */
  function vivos(h) {
    if (!(h > 0)) h = 0;
    var s = slug(h), d = deriva(h);
    var kQ = 1 - env(h, 0.38, 6.8), kG = 1 - env(h, 0.45, 5.8);
    var qM = Math.max(0, DM.qMezcla * kQ * (1 + N.qM(h) * s - 0.024 * d + 0.012 * Math.sin(PI2 * h / 7.3 + 0.4)));
    var qG = Math.max(0, DM.qGas * kG * (1 + N.qG(h) * s + 0.018 * Math.sin(PI2 * h / 9.5 + 0.7)));
    var pBat = P_LINEA + (DM.pBateria - P_LINEA) * (1 - Math.exp(-h / 0.45)) + N.pBat(h) + 0.03 * Math.sin(PI2 * h / 13 + 1.1);
    var pSep = DM.pSep + (P_LINEA - DM.pSep) * env(h, 0.42, 6.2) + N.pSep(h) * s + 0.05 * Math.sin(PI2 * h / 11 + 0.3);
    if (pSep < pBat + 0.08) pSep = pBat + 0.08;
    var pSal = U.clamp(pBat + (pSep - pBat) * K_SAL + N.pSal(h), pBat + 0.03, pSep - 0.03);
    var pPozo = DM.pPozo + (P_CIERRE - DM.pPozo) * env(h, 0.5, 5.0) + N.pPozo(h) * s - 0.9 * d;
    var tSep = DM.tSep + (T_AMB - DM.tSep) * env(h, 0.85, 3.0) + N.tSep(h) + 0.9 * Math.sin(PI2 * (h - 4) / 24);
    var pctAgua = U.clamp(DM.pctAgua + (AGUA_INI - DM.pctAgua) * Math.exp(-h / 0.5) + N.agua(h) * s + 0.6 * d, 0, 100);
    var nivel = U.clamp(NIVEL_SP + (NIVEL_INI - NIVEL_SP) * env(h, 0.5, 5.2) + N.niv(h) * s, 3, 97);
    var pa = pctAgua / 100;
    var densidad = pa * RHO_AGUA + (1 - pa) * RHO_ACEITE - 0.65 * (tSep - DM.tSep) + N.rho(h);
    var masico = qM * BBL_M3 / 24 * densidad;
    var dpGas = DP_GAS * Math.pow(qG / DM.qGas, 2) * (DM.pSep + 1.033) / (pSep + 1.033);
    var lv = U.clamp(LV_BASE + 1.9 * (nivel - NIVEL_SP) + 30 * (qM / DM.qMezcla - 1), 0, 100);
    var pv = U.clamp(46 + 34 * (qG / DM.qGas - 1) + 28 * (pSep - DM.pSep), 0, 100);
    if (qM < 1) lv = 0;
    if (qG < 0.005) pv = 0;
    return {
      pPozo: pPozo, pSep: pSep, pSalida: pSal, pBateria: pBat, tSep: tSep, nivel: nivel,
      pctAgua: pctAgua, pctAceite: 100 - pctAgua, densidad: densidad, masico: masico,
      qMezcla: qM, qAceite: qM * (1 - pa), qAgua: qM * pa, qGas: qG,
      dpGas: dpGas, aperturaLV: lv, aperturaPV: pv
    };
  }

  /* ------------------------------------------------------------------
     Tabla de acumulados (integral por trapecios, paso 30 s)
     ------------------------------------------------------------------ */
  var ACC_DT = 1 / 120, ACC_N = Math.round(HM / ACC_DT);
  var QM = new Float64Array(ACC_N + 1), QA = new Float64Array(ACC_N + 1), QW = new Float64Array(ACC_N + 1), QG = new Float64Array(ACC_N + 1);
  var AM = new Float64Array(ACC_N + 1), AA = new Float64Array(ACC_N + 1), AW = new Float64Array(ACC_N + 1), AG = new Float64Array(ACC_N + 1);
  (function () {
    var i, v, k = ACC_DT / 24 * 0.5; // bpd·h → bls  (½ por trapecio)
    for (i = 0; i <= ACC_N; i++) { v = vivos(HS + i * ACC_DT); QM[i] = v.qMezcla; QA[i] = v.qAceite; QW[i] = v.qAgua; QG[i] = v.qGas; }
    for (i = 1; i <= ACC_N; i++) {
      AM[i] = AM[i - 1] + (QM[i - 1] + QM[i]) * k;
      AA[i] = AA[i - 1] + (QA[i - 1] + QA[i]) * k;
      AW[i] = AW[i - 1] + (QW[i - 1] + QW[i]) * k;
      AG[i] = AG[i - 1] + (QG[i - 1] + QG[i]) * k;
    }
  })();
  function acumulados(hm, v) {
    if (hm <= 0) return [0, 0, 0, 0];
    if (hm >= HM) return [AM[ACC_N], AA[ACC_N], AW[ACC_N], AG[ACC_N]];
    var i = Math.min(ACC_N - 1, Math.floor(hm / ACC_DT)), r = (hm - i * ACC_DT) / 24 * 0.5;
    return [AM[i] + (QM[i] + v.qMezcla) * r, AA[i] + (QA[i] + v.qAceite) * r, AW[i] + (QW[i] + v.qAgua) * r, AG[i] + (QG[i] + v.qGas) * r];
  }

  var ESTADOS = D.estados;
  function estadoIdx(h) { return h < HS ? 0 : h < HEND ? 1 : 2; }

  function sim(h) {
    h = +h; if (!(h > 0)) h = 0;
    var v = vivos(h), ei = estadoIdx(h);
    var hm = ei === 0 ? 0 : ei === 1 ? h - HS : HM;
    var a = acumulados(hm, v);
    v.h = h;
    v.estado = ESTADOS[ei].id;
    v.estadoNombre = ESTADOS[ei].nombre;
    v.estadoIdx = ei;
    v.hMedicion = hm;
    v.hEstabilizacion = Math.min(h, HS);
    v.acumMezcla = a[0]; v.acumAceite = a[1]; v.acumAgua = a[2]; v.acumGas = a[3];
    return v;
  }

  /* ------------------------------------------------------------------
     Muestras para tendencias (cada 3 min de 0 a HTOT)
     ------------------------------------------------------------------ */
  var TR_DT = 0.05, TR_N = Math.round(HTOT / TR_DT);
  var TR_KEYS = ['pPozo', 'pSep', 'pSalida', 'pBateria', 'qMezcla', 'qAceite', 'qGas'];
  var TR = {};
  (function () {
    var i, j, v;
    for (j = 0; j < TR_KEYS.length; j++) TR[TR_KEYS[j]] = new Float32Array(TR_N + 1);
    for (i = 0; i <= TR_N; i++) { v = vivos(i * TR_DT); for (j = 0; j < TR_KEYS.length; j++) TR[TR_KEYS[j]][i] = v[TR_KEYS[j]]; }
  })();
  function trendRange(keys) {
    var lo = Infinity, hi = -Infinity, i, j, a;
    for (j = 0; j < keys.length; j++) { a = TR[keys[j]]; for (i = 0; i <= TR_N; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; } }
    return niceRange(lo, hi);
  }
  function niceStep(span) {
    var raw = span / 3, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function niceRange(lo, hi) {
    var pad = (hi - lo) * 0.06 || 1, st = niceStep(hi - lo + 2 * pad);
    var a = Math.floor((lo - pad) / st) * st, b = Math.ceil((hi + pad) / st) * st;
    if (lo >= 0 && a < 0) a = 0;
    return { min: a, max: b, step: st };
  }

  /* ------------------------------------------------------------------
     Bitácora determinista
     ------------------------------------------------------------------ */
  var SEP_TAG = D.separador.tagDefault;
  function eventos(tag) {
    tag = tag || SEP_TAG;
    var mitad = sim(HS + HM / 2), fin = sim(HEND);
    return [
      { h: 0, estado: ESTADOS[0].id, texto: 'Pozo alineado al separador ' + tag + ' · inicio de ' + ESTADOS[0].nombre.toLowerCase() },
      { h: HS * 0.8, estado: ESTADOS[0].id, texto: 'Presión, temperatura y gasto estables (' + ['TPS', 'TT', 'CORIOLIS'].filter(function (t) { return U.instrumento(t); }).join(' · ') + ')' },
      { h: HS, estado: ESTADOS[1].id, texto: 'Inicio de medición de ' + HM + ' h · reloj en 00:00:00' },
      { h: HS + HM / 2, estado: ESTADOS[1].id, texto: 'Medición al 50 % · Q mezcla acumulado ' + fmt(mitad.acumMezcla, 1) + ' bls' },
      { h: HEND, estado: ESTADOS[2].id, texto: 'Fin de medición · acumulados congelados · ' + fmt(fin.acumMezcla, 1) + ' bls / ' + fmt(fin.acumGas, 3) + ' MMpc' }
    ];
  }

  /* ------------------------------------------------------------------
     Formatos (es-MX: coma de miles, punto decimal) — rápidos, sin Intl por cuadro
     ------------------------------------------------------------------ */
  function fmt(v, d) {
    d = d || 0;
    var s = Math.abs(v).toFixed(d), neg = v < 0 && +s !== 0, p = s.split('.');
    return (neg ? '−' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + p[1] : '');
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function hms(hours) {
    var s = Math.floor(hours * 3600 + 1e-6), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss);
  }
  function hm_(hours) { var m = Math.floor(hours * 60 + 1e-6); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }

  /* ------------------------------------------------------------------
     Nombres desde WT.data (sin duplicar a mano)
     ------------------------------------------------------------------ */
  function eqNombre(id, fb) { var e = U.equipo(id); return e ? e.nombre : fb; }
  function eqCorto(id, fb) { var e = U.equipo(id); return e ? (e.corto || e.nombre) : fb; }
  var NOMBRE_SCADA = eqCorto('scada', '').replace(/^SCADA\s*/i, '') || (eqNombre('scada', '').match(/SAF-?\s?\d+/) || ['SAF-900'])[0];
  var NOMBRE_RTU = eqNombre('rtu', (D.rtu && D.rtu.modelo) ? 'RTU ' + D.rtu.modelo : 'RTU');
  var CORTO_RTU = eqCorto('rtu', 'RTU');
  var NOMBRE_CORIOLIS = eqCorto('coriolis', 'Coriolis');
  var NOMBRE_PLACA = eqCorto('placa', 'Placa de orificio');
  function isa(tag) { var i = U.instrumento(tag); return i ? i.isa : ''; }

  /* Válvulas de control y funciones del RTU (lazos) desde WT.data.
     Orden en cada salida: primero el medidor y después la válvula de control. */
  function valvula(corriente, fb) {
    var vc = D.valvulasControl || [], i;
    for (i = 0; i < vc.length; i++) if (vc[i].corriente === corriente) return vc[i];
    return { tag: fb, nombre: '', corriente: corriente, lazo: null, ubicacion: '' };
  }
  function funcion(tag) {
    var f = D.funciones || [], i;
    for (i = 0; i < f.length; i++) if (f[i].tag === tag) return f[i];
    return null;
  }
  var V_GAS = valvula('gas', 'PV'), V_LIQ = valvula('liquido', 'LV');
  /* Función del RTU que entrega una variable calculada a partir de un instrumento
     (p. ej. FQI ← TDG): aplica cuando la unidad mostrada no es la del transmisor
     (MMpcd frente a inH₂O). Si no hay función, se rotula con el tag del instrumento. */
  function funcionDe(tag, unidad) {
    var ins = U.instrumento(tag), f = D.funciones || [], i;
    if (!ins || !unidad || ins.unidad === unidad) return null;
    for (i = 0; i < f.length; i++) if (f[i].mide === tag) return f[i];
    return null;
  }
  function rotulo(tag, unidad) { var f = funcionDe(tag, unidad); return f ? f.tag : tag; }
  /* resaltar por lazo: LIC → TN, PIC → TPS, FQI → TDG */
  var ALIAS = {};
  (D.funciones || []).forEach(function (f) { if (f.mide) ALIAS[f.tag] = f.mide; });
  function descValvula(vc) {
    var f = vc.lazo ? funcion(vc.lazo) : null, s = vc.tag + (vc.nombre ? ' · ' + vc.nombre : '');
    if (f) s += ' · lazo ' + f.tag + (f.mide ? ' (' + f.mide + ' → ' + (f.actua || vc.tag) + ')' : '') + ' en el ' + CORTO_RTU;
    if (vc.ubicacion) s += ' · ' + vc.ubicacion;
    return s;
  }

  /* Valor mostrado por cada tag en el mímico */
  var TAGVAL = {
    TDP: { k: 'pPozo', u: 'kg/cm²', d: 1 },
    TPS: { k: 'pSep', u: 'kg/cm²', d: 2 },
    TT: { k: 'tSep', u: '°C', d: 1 },
    TN: { k: 'nivel', u: '%', d: 0 },
    CORIOLIS: { k: 'qMezcla', u: 'bpd', d: 0, sub: function (v) { return 'ρ ' + fmt(v.densidad, 1) + ' · ' + fmt(v.pctAgua, 1) + ' % agua'; } },
    TDG: { k: 'qGas', u: 'MMpcd', d: 3, sub: function (v) { return 'ΔP ' + fmt(v.dpGas, 1) + ' inH₂O'; } },
    TDM: { k: 'pSalida', u: 'kg/cm²', d: 2 },
    TPL: { k: 'pBateria', u: 'kg/cm²', d: 2 }
  };
  var DEC = { pPozo: 1, pSep: 2, pSalida: 2, pBateria: 2, tSep: 1, pctAgua: 1, pctAceite: 1, qMezcla: 0, qAceite: 0, qAgua: 0, qGas: 3 };

  /* ------------------------------------------------------------------
     Distribución de paneles por formato (px de diseño)
     ------------------------------------------------------------------ */
  var LAYOUTS = {
    landscape: { W: 1920, H: 1080, mim: 'wide', trendW: 8,
      head: [18, 14, 1884, 56], banner: [18, 80, 1884, 112], mimico: [18, 206, 1120, 500], trends: [18, 720, 1120, 318],
      acum: [1152, 206, 750, 250], vars: [1152, 470, 476, 400], cor: [1642, 470, 260, 400], log: [1152, 884, 750, 154], foot: [18, 1046, 1884, 26] },
    portrait: { W: 1080, H: 1920, mim: 'wide', trendW: 8,
      head: [24, 20, 1032, 64], banner: [24, 96, 1032, 160], mimico: [24, 268, 1032, 450], acum: [24, 730, 1032, 240],
      vars: [24, 982, 620, 410], cor: [658, 982, 398, 410], trends: [24, 1404, 1032, 286], log: [24, 1702, 1032, 154], foot: [24, 1866, 1032, 30] },
    landscapeC: { W: 960, H: 540, mim: 'compact',
      head: [12, 10, 936, 38], banner: [12, 56, 936, 72], mimico: [12, 136, 600, 376], acum: [622, 136, 326, 236], cor: [622, 380, 326, 132], foot: [12, 518, 936, 18] },
    portraitC: { W: 540, H: 960, mim: 'compact',
      head: [12, 10, 516, 42], banner: [12, 60, 516, 120], mimico: [12, 188, 516, 324], acum: [12, 520, 516, 240], cor: [12, 768, 516, 148], foot: [12, 924, 516, 26] }
  };

  /* Geometrías del mímico (viewBox propio, ajustado a la proporción del panel).
     TDP en la línea lateral (TP) entre el árbol y el estrangulador; TN con sonda
     superior (WT.data.separador.tnMontaje) en tnX.
     Orden del proceso en cada salida del separador (izquierda → derecha):
       gas:     placa de orificio (FE, con TDG) → PV (contrapresión) → reincorporación
       líquido: Coriolis (CORIOLIS)             → LV (control de nivel) → reincorporación
     feX/corX = medidor, pvX/lvX = válvula de control (siempre feX < pvX y corX < lvX). */
  var MIM = {
    wide: {
      VW: 1100, VH: 480, bw: 132, bh: 60, bhx: 84, bwx: 182, fTag: 14, fVal: 26, fSub: 12.5, fLbl: 13.5,
      tree: { x: 70, top: 150, base: 430, wingY: 235 }, chokeX: 160,
      ves: { xa: 250, xb: 640, cy: 250, r: 80 },
      gasX: 590, gasY: 92, feX: 750, pvX: 872, liqX: 585, liqY: 392, corX: 750, lvX: 872, recX: 930, endX: 1090, tnX: 528,
      box: { TDP: [118, 95], TPS: [330, 116], TT: [330, 424], TN: [474, 116], TDG: [750, 166], CORIOLIS: [750, 302], TDM: [950, 442], TPL: [1028, 330] },
      lbl: [
        { k: 'arbol', x: 70, y: 458 }, { k: 'estrangulador', x: 160, y: 268 }, { k: 'placa', x: 750, y: 58 }, { k: 'pv', x: 872, y: 56 },
        { k: 'coriolis', x: 750, y: 430 }, { k: 'lv', x: 872, y: 355 }, { k: 'bateria', x: 1090, y: 420, a: 'end' }
      ],
      legend: [16, 26], badge: [1088, 26]
    },
    compact: {
      VW: 900, VH: 540, bw: 148, bh: 70, bhx: 96, bwx: 190, fTag: 16, fVal: 31, fSub: 14, fLbl: 16,
      tree: { x: 62, top: 172, base: 490, wingY: 262 }, chokeX: 146,
      ves: { xa: 200, xb: 490, cy: 282, r: 82 },
      gasX: 446, gasY: 108, feX: 604, pvX: 682, liqX: 442, liqY: 426, corX: 604, lvX: 682, recX: 726, endX: 894, tnX: 400,
      box: { TDP: [107, 88], TPS: [300, 142], TT: [252, 478], TN: [410, 478], TDG: [604, 190], CORIOLIS: [604, 330], TDM: [814, 492], TPL: [814, 344] },
      lbl: [
        { k: 'pv', x: 682, y: 70 }, { k: 'lv', x: 682, y: 462 }, { k: 'bateria', x: 894, y: 414, a: 'end' }
      ],
      legend: [14, 28], badge: [888, 28]
    }
  };

  /* ------------------------------------------------------------------
     Estilos (una vez por documento)
     ------------------------------------------------------------------ */
  var CSS = [
    '.saf{position:relative;overflow:hidden;background:#15191d;contain:layout paint;}',
    '.saf[data-auto]{width:100%;}',
    '.saf-screen{position:absolute;left:0;top:0;transform-origin:0 0;background:#15191d;color:#c5cdd5;font-family:var(--font-body,"Barlow",Arial,sans-serif);line-height:1.2;',
    '  --s-bg:#15191d;--s-panel:#1e2328;--s-head:#1a1f24;--s-inset:#171b1f;--s-line:#343c44;--s-grid:#2b3239;--s-text:#c5cdd5;--s-dim:#8794a1;--s-val:#f3f6f9;',
    '  --s-hl:#ffc20e;--s-ok:#3ccf8e;--s-warn:#ffb020;--s-info:#4fb3e8;--st:#ffb020;--mono:var(--font-mono,"JetBrains Mono",monospace);--cond:var(--font-display,"Barlow Condensed",Arial,sans-serif);}',
    '.saf-screen[data-estado="en-curso"]{--st:var(--s-ok);}',
    '.saf-screen[data-estado="finalizado"]{--st:var(--s-info);}',
    '.saf-screen *{box-sizing:border-box;}',
    '.saf-p{position:absolute;background:var(--s-panel);border:1px solid var(--s-line);border-radius:6px;overflow:hidden;transition:none;}',
    '.saf-p.is-hl{border-color:var(--s-hl);box-shadow:0 0 0 2px var(--s-hl),0 0 28px rgba(255,194,14,.28);}',
    '.saf-pt{height:34px;display:flex;align-items:center;gap:10px;padding:0 14px;font:700 15px/1 var(--cond);letter-spacing:.09em;text-transform:uppercase;color:var(--s-dim);border-bottom:1px solid var(--s-line);background:var(--s-head);white-space:nowrap;}',
    '.saf-pt b{color:var(--s-text);font-weight:700;}',
    '.saf-pt .saf-chip{margin-left:auto;}',
    '.saf-pb{position:absolute;left:0;right:0;bottom:0;top:34px;}',
    '.saf-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:3px;font:700 12px/1 var(--mono);letter-spacing:.06em;border:1px solid var(--s-line);color:var(--s-dim);background:var(--s-inset);text-transform:uppercase;}',
    '.saf-chip.st{color:var(--st);border-color:var(--st);}',
    '.saf-chip.sim{color:#e7c35a;border-color:rgba(231,195,90,.5);}',
    /* encabezado */
    '.saf-head{position:absolute;display:flex;align-items:center;gap:18px;padding:0 16px 0 0;background:#1a1f24;border:1px solid var(--s-line);border-radius:6px;overflow:hidden;white-space:nowrap;}',
    '.saf-brand{align-self:stretch;display:flex;align-items:center;gap:10px;padding:0 18px 0 16px;background:#0b2545;border-right:3px solid var(--s-hl);font:800 26px/1 var(--cond);letter-spacing:.06em;color:#fff;}',
    '.saf-brand small{font:600 12px/1.15 var(--font-body,Barlow,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:#a9dcf7;}',
    '.saf-hmain{display:flex;flex-direction:column;gap:3px;min-width:0;}',
    '.saf-hsub{font:500 13.5px/1.25 var(--font-body,Barlow,sans-serif);color:var(--s-dim);overflow:hidden;text-overflow:ellipsis;}',
    '.saf-screen.c .saf-hmain{gap:3px;}',
    '.saf-screen.c .saf-hsub{font-size:10.5px;}',
    '.saf-title{font:700 22px/1 var(--cond);letter-spacing:.03em;color:var(--s-val);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;min-width:0;}',
    '.saf-title span{color:var(--s-dim);font-weight:600;}',
    '.saf-rtu{margin-left:auto;display:flex;align-items:center;gap:10px;font:600 15px/1 var(--font-body,Barlow,sans-serif);color:var(--s-text);}',
    '.saf-rtu .com{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border:1px solid rgba(60,207,142,.45);border-radius:3px;font:700 13px/1 var(--mono);color:var(--s-ok);letter-spacing:.04em;}',
    '.saf-led{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--s-ok);box-shadow:0 0 8px rgba(60,207,142,.7);}',
    '.saf-logo{height:34px;width:auto;display:block;opacity:.95;}',
    /* banner de estado */
    '.saf-banner{display:grid;align-items:center;gap:0 28px;padding:12px 22px;background:linear-gradient(90deg,color-mix(in srgb,var(--st) 14%,var(--s-panel)) 0%,var(--s-panel) 46%);border-left:6px solid var(--st);}',
    '.saf-lbl{font:700 13px/1 var(--cond);letter-spacing:.12em;text-transform:uppercase;color:var(--s-dim);}',
    '.saf-st{grid-area:st;display:flex;flex-direction:column;gap:9px;min-width:0;}',
    '.saf-pill{display:flex;align-items:center;gap:14px;font:800 46px/1 var(--cond);letter-spacing:.03em;text-transform:uppercase;color:var(--st);white-space:nowrap;}',
    '.saf-tp{font:500 13px/1 var(--mono);color:var(--s-dim);white-space:nowrap;}',
    '.saf-progrow{display:flex;align-items:center;gap:12px;}',
    '.saf-progrow .saf-prog{flex:1 1 auto;}',
    '.saf-progrow b{font:700 14px/1 var(--mono);color:var(--s-text);min-width:58px;text-align:right;}',
    '.saf-pill .saf-led{width:18px;height:18px;background:var(--st);box-shadow:0 0 14px var(--st);}',
    '.saf-steps{grid-area:steps;list-style:none;margin:0;padding:0;display:flex;align-items:center;gap:0;min-width:0;}',
    '.saf-steps li{display:flex;align-items:center;gap:10px;font:600 19px/1 var(--font-body,Barlow,sans-serif);color:var(--s-dim);white-space:nowrap;}',
    '.saf-steps li+li::before{content:"";display:block;width:44px;height:2px;background:var(--s-line);margin:0 14px 0 4px;}',
    '.saf-steps li.is-done+li::before{background:var(--s-dim);}',
    '.saf-steps b{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;border:2px solid var(--s-line);font:700 16px/1 var(--mono);color:var(--s-dim);flex:none;}',
    '.saf-steps li.is-done b{border-color:var(--s-dim);color:var(--s-text);}',
    '.saf-steps li.is-done{color:var(--s-text);}',
    '.saf-steps li.is-cur{color:var(--s-val);font-weight:700;}',
    '.saf-steps li.is-cur b{border-color:var(--st);background:var(--st);color:#15191d;}',
    '.saf-clock{grid-area:clock;display:flex;flex-direction:column;gap:6px;min-width:0;}',
    '.saf-clock .saf-lbl{display:flex;justify-content:space-between;gap:12px;}',
    '.saf-clock .saf-lbl span{font:500 13px/1 var(--mono);letter-spacing:0;text-transform:none;color:var(--s-dim);}',
    '.saf-time{display:flex;align-items:baseline;gap:12px;font-family:var(--mono);white-space:nowrap;}',
    '.saf-hms{font-size:46px;font-weight:700;color:var(--s-val);letter-spacing:-.01em;line-height:1;}',
    '.saf-of{font-size:24px;color:var(--s-dim);}',
    '.saf-prog{position:relative;height:10px;border-radius:2px;background:var(--s-inset);border:1px solid var(--s-line);overflow:hidden;}',
    '.saf-prog i{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:0 50%;transform:scaleX(0);background:var(--st);}',
    '.saf-prog-l{display:flex;justify-content:space-between;gap:10px;font:500 13px/1 var(--mono);color:var(--s-dim);white-space:nowrap;}',
    '.saf-prog-l b{color:var(--s-text);font-weight:700;}',
    /* mímico */
    '.saf-mim svg{position:absolute;inset:0;width:100%;height:100%;}',
    '.saf-mim text{font-family:var(--font-body,Barlow,sans-serif);}',
    '.saf-mim .lbl{fill:#8794a1;font-weight:600;}',
    '.saf-mim .eq{fill:#2a3138;stroke:#8a96a3;stroke-width:2;}',
    '.saf-mim .eq-d{fill:#20262c;stroke:#6b7680;stroke-width:1.6;}',
    '.saf-mim .vlv{stroke:#aab4bf;stroke-width:2;stroke-linejoin:round;}',
    '.saf-mim .vlv.open{fill:#aab4bf;}.saf-mim .vlv.closed{fill:#20262c;}',
    '.saf-box-bg{fill:#14181c;stroke:#4a545e;stroke-width:1.5;}',
    '.saf-box-hd{fill:#262d34;}',
    '.saf-box-tag{fill:#e6ebf0;font-weight:700;font-family:var(--mono)!important;}',
    '.saf-box-tag tspan{fill:#8794a1;font-weight:500;}',
    '.saf-box-unit{fill:#8794a1;font-family:var(--mono)!important;}',
    '.saf-box-val{fill:#f3f6f9;font-weight:700;font-family:var(--mono)!important;}',
    '.saf-box-sub{fill:#aeb8c2;font-family:var(--mono)!important;}',
    '.saf-box-ring{fill:none;stroke:#ffc20e;stroke-width:3;opacity:0;}',
    '.saf-box.is-hl .saf-box-bg{stroke:#ffc20e;stroke-width:2.5;}',
    '.saf-box.is-hl .saf-box-hd{fill:#ffc20e;}',
    '.saf-box.is-hl .saf-box-tag,.saf-box.is-hl .saf-box-tag tspan,.saf-box.is-hl .saf-box-unit{fill:#0b2545;}',
    '.saf-ldr{stroke:#5d6873;stroke-width:1.4;fill:none;}',
    '.saf-box.is-hl+.saf-ldr,.saf-ldr.is-hl{stroke:#ffc20e;stroke-width:2;}',
    /* acumulados (odómetro) */
    '.saf-acc{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:1px;background:var(--s-line);}',
    '.saf-ctr{background:var(--s-panel);padding:12px 16px;display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0;}',
    '.saf-ctr-h{display:flex;align-items:center;gap:8px;font:600 17px/1 var(--font-body,Barlow,sans-serif);color:var(--s-text);white-space:nowrap;}',
    '.saf-ctr-h .nm{display:inline-flex;align-items:center;gap:8px;}',
    '.saf-ctr-h .saf-ctr-r{margin-left:auto;}',
    '.saf-ctr-h small{font-size:13px;color:var(--s-dim);font-weight:500;}',
    '.saf-sw{display:inline-block;width:14px;height:14px;border-radius:3px;flex:none;}',
    '.saf-ctr-m{display:flex;align-items:flex-end;gap:10px;}',
    '.saf-odo{display:flex;align-items:stretch;gap:3px;padding:4px;background:#0f1215;border:1px solid var(--s-line);border-radius:4px;}',
    '.saf-dig{position:relative;width:var(--cw,36px);height:var(--ch,52px);overflow:hidden;border-radius:2px;background:linear-gradient(180deg,#1b2025 0%,#262c32 50%,#1b2025 100%);}',
    '.saf-dig::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,transparent 26%,transparent 74%,rgba(0,0,0,.45) 100%);pointer-events:none;}',
    '.saf-dig.dec{background:linear-gradient(180deg,#2a2115 0%,#3a2d1a 50%,#2a2115 100%);}',
    '.saf-strip{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;will-change:transform;}',
    '.saf-strip span{display:block;height:var(--ch,52px);line-height:var(--ch,52px);text-align:center;font:700 var(--cf,42px)/var(--ch,52px) var(--mono);color:var(--s-val);}',
    '.saf-dig.lead span{color:#4a545e;}',
    '.saf-dot{align-self:flex-end;width:7px;height:7px;margin:0 1px 6px;border-radius:50%;background:var(--s-text);}',
    '.saf-ctr-u{font:600 18px/1 var(--mono);color:var(--s-dim);padding-bottom:4px;}',
    '.saf-ctr-r{font:500 14px/1 var(--mono);color:var(--s-dim);white-space:nowrap;}',
    '.saf-ctr-r b{color:var(--s-text);font-weight:700;}',
    /* tabla de variables */
    '.saf-tbl{position:absolute;inset:0;width:100%;border-collapse:collapse;font-size:16px;table-layout:fixed;}',
    '.saf-tbl th{font:700 12px/1 var(--cond);letter-spacing:.1em;text-transform:uppercase;color:var(--s-dim);text-align:left;padding:8px 10px;border-bottom:1px solid var(--s-line);background:var(--s-inset);}',
    '.saf-tbl td{padding:0 10px;border-bottom:1px solid #2a3037;color:var(--s-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.saf-tbl td.v{text-align:right;font:700 17px/1 var(--mono);color:var(--s-val);font-variant-numeric:tabular-nums;}',
    '.saf-tbl td.u{font:500 13px/1 var(--mono);color:var(--s-dim);}',
    '.saf-tbl td.t span{font:700 12px/1 var(--mono);padding:3px 6px;border-radius:3px;border:1px solid var(--s-line);color:var(--s-text);}',
    '.saf-tbl td.t i{font:500 11px/1 var(--mono);font-style:normal;color:var(--s-dim);margin-left:5px;}',
    '.saf-tbl tr.is-hl td{background:rgba(255,194,14,.12);color:var(--s-val);}',
    '.saf-tbl tr.is-hl td.t span{background:#ffc20e;border-color:#ffc20e;color:#0b2545;}',
    '.saf-tbl th.v{text-align:right;}',
    /* Coriolis / % agua */
    '.saf-cor{position:absolute;inset:0;padding:16px 18px;display:flex;flex-direction:column;gap:14px;}',
    '.saf-split{display:flex;height:24px;gap:2px;border-radius:3px;overflow:hidden;}',
    '.saf-split i{display:block;height:100%;}',
    '.saf-leg{display:flex;justify-content:space-between;gap:10px;font:600 15px/1.2 var(--font-body,Barlow,sans-serif);color:var(--s-text);}',
    '.saf-leg span{display:flex;align-items:center;gap:7px;white-space:nowrap;}',
    '.saf-leg b{font:700 17px/1 var(--mono);color:var(--s-val);}',
    '.saf-stat{display:flex;flex-direction:column;gap:5px;padding-top:12px;border-top:1px solid #2a3037;}',
    '.saf-stat .k{font:700 12px/1 var(--cond);letter-spacing:.1em;text-transform:uppercase;color:var(--s-dim);}',
    '.saf-stat .val{font:700 32px/1 var(--mono);color:var(--s-val);white-space:nowrap;}',
    '.saf-stat .val small{font:500 14px/1 var(--mono);color:var(--s-dim);margin-left:6px;}',
    '.saf-note{font-size:13px;line-height:1.35;color:var(--s-dim);margin-top:auto;}',
    /* bitácora */
    '.saf-log{list-style:none;margin:0;padding:4px 0;position:absolute;inset:0;overflow:hidden;}',
    '.saf-log li{display:flex;align-items:center;gap:12px;padding:0 14px;height:38px;border-bottom:1px solid #2a3037;font-size:15px;color:var(--s-text);white-space:nowrap;}',
    '.saf-log li:first-child{background:rgba(255,255,255,.03);color:var(--s-val);}',
    '.saf-log time{font:700 14px/1 var(--mono);color:var(--s-dim);flex:none;}',
    '.saf-log .saf-chip{flex:none;min-width:132px;justify-content:center;}',
    '.saf-log .saf-chip[data-e="estabilizacion"]{color:var(--s-warn);border-color:rgba(255,176,32,.55);}',
    '.saf-log .saf-chip[data-e="en-curso"]{color:var(--s-ok);border-color:rgba(60,207,142,.55);}',
    '.saf-log .saf-chip[data-e="finalizado"]{color:var(--s-info);border-color:rgba(79,179,232,.55);}',
    '.saf-log span.x{overflow:hidden;text-overflow:ellipsis;}',
    /* tendencias */
    '.saf-tr{position:absolute;inset:0;display:flex;gap:14px;padding:6px 10px 6px 6px;}',
    '.saf-tr svg{flex:1 1 0;min-width:0;height:100%;}',
    '.saf-tr text{font-family:var(--mono);}',
    '.saf-tr .ct{font-family:var(--cond);font-weight:700;letter-spacing:.08em;fill:#8794a1;}',
    '.saf-tr .sn{font-family:var(--font-body,Barlow,sans-serif);font-weight:600;fill:#c5cdd5;}',
    '.saf-tr .tk{fill:#8794a1;}',
    '.saf-tr .gv{fill:#f3f6f9;font-weight:700;}',
    '.saf-tr .grid{stroke:#2b3239;stroke-width:1;}',
    '.saf-tr .axis{stroke:#46505a;stroke-width:1;}',
    '.saf-tr .mk{stroke:#6b7680;stroke-width:1;}',
    '.saf-tr .band{fill:rgba(255,176,32,.09);}',
    '.saf-tr .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;}',
    '.saf-tr .is-hl .ln{stroke-width:3;}',
    '.saf-tr .strip-hl{fill:rgba(255,194,14,.07);stroke:#ffc20e;stroke-width:1.5;opacity:0;}',
    '.saf-tr .is-hl .strip-hl{opacity:1;}',
    /* pie */
    '.saf-foot{position:absolute;display:flex;align-items:center;justify-content:space-between;gap:16px;font:500 14px/1 var(--font-body,Barlow,sans-serif);color:var(--s-dim);white-space:nowrap;}',
    '.saf-foot b{color:#e7c35a;font-weight:700;}',
    /* ---------- compacto ---------- */
    '.saf-screen.c .saf-pt{height:28px;font-size:13px;padding:0 10px;}',
    '.saf-screen.c .saf-pb{top:28px;}',
    '.saf-screen.c .saf-head{gap:12px;padding-right:10px;}',
    '.saf-screen.c .saf-brand{font-size:20px;padding:0 12px;gap:8px;}',
    '.saf-screen.c .saf-title{font-size:17px;}',
    '.saf-screen.c .saf-rtu{font-size:13px;gap:8px;}',
    '.saf-screen.c .saf-rtu .com{font-size:11px;padding:4px 7px;}',
    '.saf-screen.c .saf-logo{height:24px;}',
    '.saf-screen.c .saf-chip{font-size:10.5px;padding:3px 6px;}',
    '.saf-screen.c .saf-banner{padding:8px 14px;gap:0 18px;border-left-width:5px;}',
    '.saf-screen.c .saf-lbl{font-size:11px;}',
    '.saf-screen.c .saf-st{gap:6px;}',
    '.saf-screen.c .saf-pill{font-size:30px;gap:10px;}',
    '.saf-screen.c .saf-pill .saf-led{width:12px;height:12px;}',
    '.saf-screen.c .saf-steps li{font-size:13px;gap:6px;}',
    '.saf-screen.c .saf-steps li+li::before{width:16px;margin:0 7px 0 2px;}',
    '.saf-screen.c .saf-steps b{width:24px;height:24px;font-size:12px;}',
    '.saf-screen.c .saf-clock{gap:4px;}',
    '.saf-screen.c .saf-clock .saf-lbl span{font-size:11px;}',
    '.saf-screen.c .saf-hms{font-size:30px;}',
    '.saf-screen.c .saf-of{font-size:15px;}',
    '.saf-screen.c .saf-prog{height:7px;}',
    '.saf-screen.c .saf-progrow{gap:8px;}',
    '.saf-screen.c .saf-progrow b{font-size:11px;min-width:44px;}',
    '.saf-screen.c .saf-tp{font-size:10.5px;}',
    '.saf-screen.c .saf-ctr{padding:6px 12px;gap:5px;}',
    '.saf-screen.c .saf-ctr-h{font-size:14px;gap:6px;}',
    '.saf-screen.c .saf-ctr-h small{font-size:11px;}',
    '.saf-screen.c .saf-sw{width:11px;height:11px;}',
    '.saf-screen.c .saf-odo{gap:2px;padding:3px;}',
    '.saf-screen.c .saf-dot{width:5px;height:5px;margin:0 1px 4px;}',
    '.saf-screen.c .saf-ctr-u{font-size:13px;padding-bottom:2px;}',
    '.saf-screen.c .saf-ctr-r{font-size:11.5px;}',
    '.saf-screen.c .saf-cor{padding:10px 12px;gap:8px;}',
    '.saf-screen.c .saf-split{height:16px;}',
    '.saf-screen.c .saf-leg{font-size:13px;}',
    '.saf-screen.c .saf-leg b{font-size:14px;}',
    '.saf-screen.c .saf-stat{padding-top:6px;gap:3px;}',
    '.saf-screen.c .saf-stat .k{font-size:10.5px;}',
    '.saf-screen.c .saf-stat .val{font-size:19px;}',
    '.saf-screen.c .saf-stat .val small{font-size:11px;margin-left:4px;}',
    '.saf-screen.c .saf-foot{font-size:11px;}',
    '.saf-screen.c .saf-stats{display:flex;gap:14px;}',
    '.saf-screen.c .saf-stats .saf-stat{flex:1 1 0;}',
    /* variantes de distribución */
    '.saf-screen.L .saf-leg{flex-direction:column;gap:8px;}',
    '.saf-screen.L .saf-banner{grid-template-columns:330px minmax(0,1fr) 640px;grid-template-areas:"st steps clock";}',
    '.saf-screen.P .saf-banner{grid-template-columns:minmax(0,1fr) 560px;grid-template-rows:auto auto;grid-template-areas:"st clock" "steps steps";gap:14px 24px;}',
    '.saf-screen.P .saf-steps li{font-size:18px;}',
    '.saf-screen.P .saf-steps li+li::before{width:36px;}',
    '.saf-screen.LC .saf-banner{grid-template-columns:200px minmax(0,1fr) 300px;grid-template-areas:"st steps clock";}',
    '.saf-screen.PC .saf-banner{grid-template-columns:minmax(0,1fr) 246px;grid-template-rows:auto auto;grid-template-areas:"st clock" "steps steps";gap:8px 14px;}',
    '.saf-screen.PC .saf-acc{grid-template-columns:1fr 1fr;}',
    '.saf-screen.LC .saf-tp{display:none;}',
    '.saf-screen.PC .saf-clock .saf-lbl span,.saf-screen.PC .saf-logo{display:none;}',
    '.saf-screen.LC .saf-acc{grid-template-columns:1fr;grid-template-rows:repeat(4,1fr);}',
    '.saf-screen.LC .saf-ctr{flex-direction:row;align-items:center;justify-content:space-between;padding:4px 10px;}',
    '.saf-screen.LC .saf-ctr-r{display:none;}',
    '.saf-screen.LC .saf-ctr-h{flex-direction:column;align-items:flex-start;gap:3px;}',
    '.saf-screen.LC .saf-ctr-h .nm{display:flex;align-items:center;gap:6px;}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('saf-style')) return;
    var st = document.createElement('style');
    st.id = 'saf-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------------
     Utilidades DOM
     ------------------------------------------------------------------ */
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag), k;
    if (attrs) for (k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function hx(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function setT(e, s) { if (e && e._s !== s) { e.textContent = s; e._s = s; } }
  function setA(e, k, v) { var c = '_a' + k; if (e[c] !== v) { e.setAttribute(k, v); e[c] = v; } }
  function setCls(e, c, on) { on = !!on; var k = '_c' + c; if (e[k] !== on) { e.classList.toggle(c, on); if (!on && e.getAttribute('class') === '') e.removeAttribute('class'); e[k] = on; } }
  function place(e, r) { e.style.left = r[0] + 'px'; e.style.top = r[1] + 'px'; e.style.width = r[2] + 'px'; e.style.height = r[3] + 'px'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var uid = 0;

  /* ------------------------------------------------------------------
     Mímico del proceso (SVG)
     ------------------------------------------------------------------ */
  function buildMimico(svg, G, compacto, tag) {
    var id = 'saf' + (++uid), v = G.ves, rx = v.r * 0.55, T = G.tree, defs = sv('defs', null, svg);
    var refs = { boxes: {}, flows: [] };
    svg.setAttribute('viewBox', '0 0 ' + G.VW + ' ' + G.VH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // patrones / gradientes
    var pat = sv('pattern', { id: id + 'mesh', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    sv('rect', { width: 6, height: 6, fill: '#20262c' }, pat);
    sv('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#7d8995', 'stroke-width': 1.6 }, pat);
    var lg = sv('linearGradient', { id: id + 'liq', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    sv('stop', { offset: 0, 'stop-color': '#3a2812' }, lg);
    sv('stop', { offset: 0.18, 'stop-color': C.liquido }, lg);
    sv('stop', { offset: 1, 'stop-color': '#0d0905' }, lg);
    var cp = sv('clipPath', { id: id + 'ves' }, defs);
    sv('rect', { x: v.xa, y: v.cy - v.r, width: v.xb - v.xa, height: 2 * v.r, rx: rx, ry: v.r }, cp);

    // leyenda de corrientes + insignia de circuito cerrado
    var lgG = sv('g', { transform: 'translate(' + G.legend[0] + ',' + G.legend[1] + ')' }, svg);
    var items = compacto
      ? [['Mezcla', C.mezcla], ['Gas', C.gas], ['Líquido', C.liquidoAmbar], ['A batería', C.salida]]
      : [['Mezcla (pozo)', C.mezcla], ['Gas', C.gas], ['Líquido (aceite + agua)', C.liquidoAmbar], ['Salida a batería', C.salida]];
    var lx = 0, fs = G.fLbl;
    items.forEach(function (it) {
      sv('rect', { x: lx, y: -fs * 0.45, width: fs * 1.6, height: fs * 0.42, rx: 1.5, fill: it[1] }, lgG);
      var tx = sv('text', { x: lx + fs * 2.0, y: 0, 'font-size': fs, class: 'lbl', 'dominant-baseline': 'middle' }, lgG);
      tx.textContent = it[0];
      lx += fs * 2.0 + it[0].length * fs * 0.5 + fs * 1.3;
    });
    var bd = sv('g', { transform: 'translate(' + G.badge[0] + ',' + G.badge[1] + ')' }, svg);
    var btxt = compacto ? 'Circuito cerrado' : 'Circuito cerrado · no se ventea';
    var bw = btxt.length * fs * 0.46 + fs * 1.6;
    sv('rect', { x: -bw, y: -fs * 0.95, width: bw, height: fs * 1.9, rx: 3, fill: 'none', stroke: '#4a545e', 'stroke-width': 1.2 }, bd);
    var bt = sv('text', { x: -bw / 2, y: 0, 'font-size': fs * 0.92, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'lbl' }, bd);
    bt.textContent = btxt;

    // ---- tuberías (base + flujo animado) ----
    var pipes = {
      mezcla: 'M' + (T.x + 22) + ',' + T.wingY + 'H' + v.xa,
      gas: 'M' + G.gasX + ',' + (v.cy - v.r) + 'V' + G.gasY + 'H' + G.recX + 'V' + G.liqY,
      liquido: 'M' + G.liqX + ',' + (v.cy + v.r) + 'V' + G.liqY + 'H' + G.recX,
      salida: 'M' + G.recX + ',' + G.liqY + 'H' + (G.endX - 14)
    };
    var pw = compacto ? 8 : 7;
    var gP = sv('g', null, svg);
    // líquido: borde ámbar + núcleo negro
    sv('path', { d: pipes.liquido, stroke: C.liquidoAmbar, 'stroke-opacity': 0.55, 'stroke-width': pw + 4, fill: 'none', 'stroke-linejoin': 'round' }, gP);
    sv('path', { d: pipes.liquido, stroke: C.liquido, 'stroke-width': pw, fill: 'none', 'stroke-linejoin': 'round' }, gP);
    sv('path', { d: pipes.gas, stroke: C.gas, 'stroke-opacity': 0.42, 'stroke-width': pw, fill: 'none', 'stroke-linejoin': 'round' }, gP);
    sv('path', { d: pipes.mezcla, stroke: C.mezcla, 'stroke-width': pw, fill: 'none' }, gP);
    sv('path', { d: pipes.salida, stroke: C.salida, 'stroke-width': pw, fill: 'none' }, gP);
    // flecha a batería
    var ah = pw * 1.6;
    sv('path', { d: 'M' + (G.endX - 16) + ',' + (G.liqY - ah) + 'L' + G.endX + ',' + G.liqY + 'L' + (G.endX - 16) + ',' + (G.liqY + ah) + 'Z', fill: C.salida }, gP);
    var flowCol = { mezcla: C.mezclaClaro, gas: C.gas, liquido: C.liquidoAmbar, salida: C.mezclaClaro };
    ['mezcla', 'gas', 'liquido', 'salida'].forEach(function (k) {
      var f = sv('path', { d: pipes[k], stroke: flowCol[k], 'stroke-width': pw * 0.45, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': '2 16', 'stroke-linejoin': 'round' }, gP);
      refs.flows.push({ el: f, k: k });
    });
    // nodo de reincorporación
    sv('circle', { cx: G.recX, cy: G.liqY, r: pw * 0.95, fill: C.salida, stroke: '#c5cdd5', 'stroke-width': 1.5 }, gP);

    // ---- árbol de válvulas ----
    var gT = sv('g', null, svg), x = T.x;
    sv('line', { x1: x - 54, y1: T.base, x2: x + 54, y2: T.base, stroke: '#4a545e', 'stroke-width': 2 }, gT);
    sv('rect', { x: x - 30, y: T.base - 16, width: 60, height: 16, rx: 2, class: 'eq' }, gT);
    sv('rect', { x: x - 10, y: T.top + 8, width: 20, height: T.base - T.top - 24, class: 'eq' }, gT);
    [T.base - 60, T.base - 120].forEach(function (yy) {
      sv('rect', { x: x - 16, y: yy - 14, width: 32, height: 28, rx: 3, class: 'eq' }, gT);
      sv('line', { x1: x - 16, y1: yy, x2: x - 30, y2: yy, stroke: '#8a96a3', 'stroke-width': 2 }, gT);
      sv('circle', { cx: x - 40, cy: yy, r: 10, fill: 'none', stroke: '#8a96a3', 'stroke-width': 2.5 }, gT);
      sv('path', { d: 'M' + (x - 50) + ',' + yy + 'h20M' + (x - 40) + ',' + (yy - 10) + 'v20', stroke: '#8a96a3', 'stroke-width': 1.5 }, gT);
    });
    sv('rect', { x: x - 30, y: T.wingY - 10, width: 52, height: 20, rx: 2, class: 'eq' }, gT);           // cruz
    sv('path', { d: 'M' + (x - 30) + ',' + (T.wingY - 9) + 'l-14,9l14,9z', class: 'vlv closed' }, gT);    // lateral cerrada
    sv('rect', { x: x - 13, y: T.top, width: 26, height: 12, rx: 2, class: 'eq' }, gT);                 // tapa / brida superior
    // ---- estrangulador ----
    var cx_ = G.chokeX, cy_ = T.wingY;
    sv('path', { d: 'M' + (cx_ - 15) + ',' + (cy_ - 11) + 'L' + (cx_ + 15) + ',' + (cy_ + 11) + 'V' + (cy_ - 11) + 'L' + (cx_ - 15) + ',' + (cy_ + 11) + 'Z', class: 'vlv open' }, svg);
    sv('path', { d: 'M' + (cx_ - 14) + ',' + (cy_ + 20) + 'L' + (cx_ + 14) + ',' + (cy_ - 20) + 'm-9,1l9,-1l-1,9', stroke: '#e6ebf0', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }, svg);
    // toma del TDP en la línea lateral (TP), aguas arriba del estrangulador
    if (U.instrumento('TDP')) {
      var tdx = tdpX(G);
      sv('line', { x1: tdx, y1: cy_ - 4, x2: tdx, y2: cy_ - 16, stroke: '#aab4bf', 'stroke-width': 2 }, svg);
      sv('circle', { cx: tdx, cy: cy_ - 22, r: 6, fill: '#2f5f8f', stroke: '#8fc4ea', 'stroke-width': 1.5 }, svg);
    }

    // ---- separador ----
    var gV = sv('g', null, svg);
    sv('rect', { x: v.xa, y: v.cy - v.r, width: v.xb - v.xa, height: 2 * v.r, rx: rx, ry: v.r, fill: '#20262c' }, gV);
    var gIn = sv('g', { 'clip-path': 'url(#' + id + 'ves)' }, gV);
    sv('rect', { x: v.xa, y: v.cy - v.r, width: v.xb - v.xa, height: 2 * v.r, fill: C.gas, 'fill-opacity': 0.05 }, gIn);
    refs.liq = sv('rect', { x: v.xa, y: v.cy, width: v.xb - v.xa, height: v.r * 2, fill: 'url(#' + id + 'liq)' }, gIn);
    refs.surf = sv('line', { x1: v.xa, y1: v.cy, x2: v.xb, y2: v.cy, stroke: C.liquidoAmbar, 'stroke-width': 2.5 }, gIn);
    // consigna (SP) del lazo de nivel: WT.data.separador.nivelSP
    var spY = v.cy + v.r - 2 * v.r * NIVEL_SP / 100;
    sv('line', { x1: v.xb - rx - 30, y1: spY, x2: v.xb - rx + 6, y2: spY, stroke: '#c5cdd5', 'stroke-width': 1.2, 'stroke-dasharray': '4 3', opacity: 0.6 }, gIn);
    if (!compacto) {
      var tSP = sv('text', { x: v.xb - rx - 34, y: spY + 4, 'text-anchor': 'end', 'font-size': G.fLbl * 0.8, class: 'lbl', 'font-family': 'var(--mono)', opacity: 0.8 }, gIn);
      tSP.textContent = 'SP';
    }
    // extractor de niebla
    sv('rect', { x: G.gasX - 32, y: v.cy - v.r + 8, width: 64, height: v.r * 0.3, fill: 'url(#' + id + 'mesh)', stroke: '#7d8995', 'stroke-width': 1.2 }, gIn);
    // deflector
    sv('path', { d: 'M' + (v.xa + rx + 6) + ',' + (v.cy - v.r * 0.7) + 'q-10,' + (v.r * 0.45) + ' 0,' + (v.r * 0.95), stroke: '#c5cdd5', 'stroke-width': 4.5, fill: 'none', 'stroke-linecap': 'round' }, gIn);
    // TN: sonda de nivel montada en la parte superior (varilla hacia el líquido)
    if (U.instrumento('TN')) sv('line', { x1: G.tnX, y1: v.cy - v.r, x2: G.tnX, y2: v.cy + v.r * 0.72, stroke: '#aab4bf', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, gIn);
    sv('rect', { x: v.xa, y: v.cy - v.r, width: v.xb - v.xa, height: 2 * v.r, rx: rx, ry: v.r, fill: 'none', stroke: '#9aa5b1', 'stroke-width': 2.5 }, gV);
    if (U.instrumento('TN')) {
      sv('line', { x1: G.tnX, y1: v.cy - v.r, x2: G.tnX, y2: v.cy - v.r - 10, stroke: '#aab4bf', 'stroke-width': 2 }, gV);
      sv('circle', { cx: G.tnX, cy: v.cy - v.r - 16, r: 6, fill: '#2f5f8f', stroke: '#8fc4ea', 'stroke-width': 1.5 }, gV);
    }
    var tSep = sv('text', { x: (v.xa + v.xb) / 2 - (compacto ? 10 : 30), y: v.cy - v.r * 0.42, 'text-anchor': 'middle', 'font-size': G.fLbl * 1.05, class: 'lbl' }, gV);
    tSep.textContent = compacto ? tag : tag + ' · ' + eqNombre('separador', 'Separador');
    tSep.setAttribute('fill', '#aeb8c2');
    refs.sepTxt = tSep;

    // ---- medidores (primero) y válvulas de control (después) en cada salida ----
    function titulo(g, s) { if (s) { var t = sv('title', null, g); t.textContent = s; } }
    // gas: placa de orificio (FE) con el transmisor de presión diferencial TDG
    var gF = sv('g', { 'data-eq': 'placa' }, svg);
    titulo(gF, eqNombre('placa', NOMBRE_PLACA) + ' · salida de gas, aguas arriba de la ' + V_GAS.tag);
    sv('rect', { x: G.feX - 9, y: G.gasY - 15, width: 6, height: 30, rx: 1, class: 'eq' }, gF);
    sv('rect', { x: G.feX + 3, y: G.gasY - 15, width: 6, height: 30, rx: 1, class: 'eq' }, gF);
    sv('line', { x1: G.feX, y1: G.gasY - 19, x2: G.feX, y2: G.gasY + 19, stroke: '#e6ebf0', 'stroke-width': 2 }, gF);
    // líquido: medidor Coriolis
    var gC = sv('g', { 'data-eq': 'coriolis' }, svg);
    titulo(gC, eqNombre('coriolis', NOMBRE_CORIOLIS) + ' · salida de líquido, aguas arriba de la ' + V_LIQ.tag);
    sv('rect', { x: G.corX - 36, y: G.liqY - 13, width: 72, height: 26, rx: 6, class: 'eq' }, gC);
    sv('path', { d: 'M' + (G.corX - 22) + ',' + (G.liqY - 13) + 'q22,-16 44,0', fill: 'none', stroke: '#8a96a3', 'stroke-width': 2 }, gC);
    sv('line', { x1: G.corX, y1: G.liqY - 19, x2: G.corX, y2: G.liqY - 28, stroke: '#8a96a3', 'stroke-width': 3 }, gC);
    sv('circle', { cx: G.corX, cy: G.liqY - 34, r: 8, fill: '#2f5f8f', stroke: '#8fc4ea', 'stroke-width': 1.5 }, gC);
    // válvulas de control aguas abajo de cada medidor (PV gas, LV líquido)
    function ctrlValve(xv, yv, vc) {
      var g = sv('g', { 'data-tag': vc.tag }, svg);
      titulo(g, descValvula(vc));
      sv('line', { x1: xv, y1: yv, x2: xv, y2: yv - 22, stroke: '#aab4bf', 'stroke-width': 2 }, g);
      sv('path', { d: 'M' + (xv - 12) + ',' + (yv - 22) + 'a12,10 0 0 1 24,0z', fill: '#2a3138', stroke: '#aab4bf', 'stroke-width': 2 }, g);
      var b = sv('path', { d: 'M' + (xv - 15) + ',' + (yv - 11) + 'L' + (xv + 15) + ',' + (yv + 11) + 'V' + (yv - 11) + 'L' + (xv - 15) + ',' + (yv + 11) + 'Z', class: 'vlv open' }, g);
      return b;
    }
    refs.pv = ctrlValve(G.pvX, G.gasY, V_GAS);
    refs.lv = ctrlValve(G.lvX, G.liqY, V_LIQ);

    // ---- rótulos de equipo ----
    var LBL = {
      arbol: eqNombre('arbol', 'Árbol de válvulas'), estrangulador: compacto ? 'Estrangulador' : eqNombre('estrangulador', 'Estrangulador'),
      pv: V_GAS.tag, lv: V_LIQ.tag, placa: NOMBRE_PLACA + ' (FE)', coriolis: NOMBRE_CORIOLIS, bateria: 'A batería'
    };
    refs.lblTxt = {};
    G.lbl.forEach(function (l) {
      var tx = sv('text', { x: l.x, y: l.y, 'text-anchor': l.a || 'middle', 'font-size': G.fLbl, class: 'lbl' }, svg);
      tx.textContent = LBL[l.k];
      if (l.k === 'pv' || l.k === 'lv') { var ts = sv('tspan', { fill: '#c5cdd5', 'font-family': 'var(--mono)' }, tx); refs.lblTxt[l.k] = ts; }
    });

    // ---- cajas de valor por tag + líneas guía ----
    Object.keys(G.box).forEach(function (tg) {
      if (!U.instrumento(tg)) return;
      var spec = TAGVAL[tg], b = G.box[tg], sub = !!spec.sub;
      var w = sub ? G.bwx : G.bw, h = sub ? G.bhx : G.bh, bx = b[0] - w / 2, by = b[1] - h / 2, hh = G.fTag + 10;
      var anc = ancla(G, tg);
      var g = sv('g', { class: 'saf-box', 'data-tag': tg }, svg);
      var ring = sv('rect', { x: bx - 6, y: by - 6, width: w + 12, height: h + 12, rx: 8, class: 'saf-box-ring' }, g);
      sv('rect', { x: bx, y: by, width: w, height: h, rx: 4, class: 'saf-box-bg' }, g);
      sv('path', { d: 'M' + bx + ',' + (by + 4) + 'a4,4 0 0 1 4,-4h' + (w - 8) + 'a4,4 0 0 1 4,4v' + (hh - 4) + 'h' + (-w) + 'z', class: 'saf-box-hd' }, g);
      var tt = sv('text', { x: bx + 8, y: by + hh - 5.5, 'font-size': G.fTag, class: 'saf-box-tag' }, g);
      var fn = funcionDe(tg, spec.u);   // gasto de gas: FQI (TDG)
      tt.appendChild(document.createTextNode(fn ? fn.tag : tg));
      var ti = sv('tspan', { dx: 6, 'font-size': G.fTag * 0.82 }, tt); ti.textContent = fn ? '(' + tg + ')' : isa(tg);
      if (fn) { var tl = sv('title', null, g); tl.textContent = fn.tag + ' · ' + (fn.desc || '') + ' · ' + tg + ' ' + isa(tg); }
      var tu = sv('text', { x: bx + w - 8, y: by + hh - 5.5, 'text-anchor': 'end', 'font-size': G.fTag * 0.85, class: 'saf-box-unit' }, g);
      tu.textContent = spec.u;
      var tv = sv('text', { x: bx + w - 9, y: by + hh + G.fVal + 4, 'text-anchor': 'end', 'font-size': G.fVal, class: 'saf-box-val' }, g);
      var ts = sub ? sv('text', { x: bx + w - 9, y: by + h - 9, 'text-anchor': 'end', 'font-size': G.fSub, class: 'saf-box-sub' }, g) : null;
      // guía
      var y0 = anc[1] > by + h ? by + h : by, x0 = U.clamp(anc[0], bx + 12, bx + w - 12);
      var ldr = sv('path', { d: 'M' + x0 + ',' + y0 + 'L' + anc[0] + ',' + anc[1], class: 'saf-ldr' }, svg);
      var dot = sv('circle', { cx: anc[0], cy: anc[1], r: 3.6, fill: '#c5cdd5' }, svg);
      refs.boxes[tg] = { g: g, v: tv, s: ts, ring: ring, ldr: ldr, dot: dot, spec: spec };
    });
    return refs;
  }
  // x de la toma del TDP: en la línea lateral, entre el árbol y el estrangulador
  function tdpX(G) { return Math.round((G.tree.x + 22 + G.chokeX - 15) / 2); }
  // punto del proceso al que apunta cada tag
  function ancla(G, tg) {
    var v = G.ves, b = G.box[tg], T = G.tree;
    switch (tg) {
      case 'TDP': return [tdpX(G), T.wingY - 28];
      case 'TPS': return [b[0] + 6, v.cy - v.r + 1];
      case 'TT': return [b[0], v.cy + v.r - 1];
      // sonda superior: si la caja está arriba apunta al cabezal; si está abajo, a la punta de la varilla
      case 'TN': return b[1] < v.cy ? [G.tnX, v.cy - v.r - 22] : [G.tnX, v.cy + v.r * 0.72];
      case 'TDG': return [G.feX, G.gasY + 10];
      case 'CORIOLIS': return [G.corX, G.liqY - 13];
      case 'TDM': return [b[0], G.liqY + 5];
      case 'TPL': return [b[0], G.liqY - 5];
    }
    return b;
  }

  /* ------------------------------------------------------------------
     Tendencias (SVG, pequeños múltiplos: un eje por franja)
     ------------------------------------------------------------------ */
  var CHARTS = [
    { titulo: 'Presiones', unidad: 'kg/cm²', strips: [
      { nombre: 'Boca de pozo', unidad: '', dec: 1, series: [{ k: 'pPozo', tag: 'TDP' }] },
      { nombre: 'Separador · salida · batería', corto: 'Sep. · salida · bat.', unidad: '', dec: 2, series: [{ k: 'pSep', tag: 'TPS' }, { k: 'pSalida', tag: 'TDM' }, { k: 'pBateria', tag: 'TPL' }] }
    ] },
    { titulo: 'Gastos', strips: [
      { nombre: 'Líquido', unidad: 'bpd', dec: 0, series: [{ k: 'qMezcla', tag: 'CORIOLIS', nm: 'Q mezcla' }, { k: 'qAceite', tag: 'CORIOLIS', nm: 'Q aceite' }] },
      { nombre: 'Gas', unidad: 'MMpcd', dec: 3, series: [{ k: 'qGas', tag: 'TDG' }] }
    ] }
  ];
  CHARTS.forEach(function (ch) { ch.strips.forEach(function (s) { s.rng = trendRange(s.series.map(function (x) { return x.k; })); }); });

  function buildTrend(svg, w, h, chart, sc) {
    var id = 'saft' + (++uid), defs = sv('defs', null, svg);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    var fT = 14 * sc, fS = 14 * sc, fK = 12 * sc;
    var padL = 54 * sc, padR = 10 * sc, top = 22 * sc, hdr = 24 * sc, axisH = 26 * sc, gap = 10 * sc;
    var ph = (h - top - axisH - 2 * hdr - gap) / 2, pw = w - padL - padR;
    var t = sv('text', { x: 2, y: 15 * sc, 'font-size': fT, class: 'ct' }, svg); t.textContent = chart.titulo.toUpperCase();
    if (chart.unidad) { var tu = sv('tspan', { 'font-family': 'var(--mono)', 'font-weight': 500, 'letter-spacing': 0 }, t); tu.textContent = ' · ' + chart.unidad; }
    var R = { strips: [], pw: pw, padL: padL, ph: ph, axis: null, ticks: [], marks: [], bands: [] };
    var y = top;
    chart.strips.forEach(function (s, si) {
      var g = sv('g', { class: 'strip' }, svg), py = y + hdr, st = { g: g, s: s, py: py, lines: [], dots: [], vals: [] };
      sv('rect', { x: padL - 4, y: y + 2, width: pw + 8, height: hdr + ph + 2, rx: 4, class: 'strip-hl' }, g);
      var nm = sv('text', { x: padL, y: y + hdr - 8 * sc, 'font-size': fS, class: 'sn' }, g);
      var single = s.series.length === 1;
      nm.textContent = (w < 470 && s.corto ? s.corto : s.nombre) + (single ? ' · ' + rotulo(s.series[0].tag, s.unidad) : '') + (s.unidad ? ' · ' + s.unidad : '');
      if (single) {
        st.vals.push(sv('text', { x: padL + pw, y: y + hdr - 8 * sc, 'text-anchor': 'end', 'font-size': fS, class: 'gv' }, g));
      } else {
        // leyenda con valores (derecha → izquierda)
        var xr = padL + pw;
        for (var i = s.series.length - 1; i >= 0; i--) {
          var se = s.series[i], lab = (se.nm || se.tag);
          var tv = sv('text', { x: xr, y: y + hdr - 8 * sc, 'text-anchor': 'end', 'font-size': fK * 1.05, class: 'gv' }, g);
          st.vals[i] = tv;
          var wv = (s.dec === 0 ? 5 : s.dec + 2) * fK * 0.63 + 2 * sc;
          var tl = sv('text', { x: xr - wv - 4 * sc, y: y + hdr - 8 * sc, 'text-anchor': 'end', 'font-size': fK, class: 'tk' }, g);
          tl.textContent = lab;
          var wl = lab.length * fK * 0.62;
          sv('rect', { x: xr - wv - wl - 24 * sc, y: y + hdr - 14 * sc, width: 14 * sc, height: 3 * sc, rx: 1, fill: PEN[i] }, g);
          xr -= wv + wl + 40 * sc;
        }
      }
      // rejilla y marcas del eje Y
      var r = s.rng, k;
      for (k = r.min; k <= r.max + r.step * 0.01; k += r.step) {
        var yy = py + ph - (k - r.min) / (r.max - r.min) * ph;
        sv('line', { x1: padL, y1: yy, x2: padL + pw, y2: yy, class: 'grid' }, g);
        var tk = sv('text', { x: padL - 8 * sc, y: yy + 4 * sc, 'text-anchor': 'end', 'font-size': fK, class: 'tk' }, g);
        tk.textContent = fmt(k, r.step < 0.1 ? 2 : r.step < 1 ? 1 : 0);
      }
      sv('line', { x1: padL, y1: py + ph, x2: padL + pw, y2: py + ph, class: 'axis' }, g);
      var cpth = sv('clipPath', { id: id + 'c' + si }, defs);
      sv('rect', { x: padL, y: py - 2, width: pw, height: ph + 4 }, cpth);
      var gc = sv('g', { 'clip-path': 'url(#' + id + 'c' + si + ')' }, g);
      st.band = sv('rect', { x: padL, y: py, width: 0, height: ph, class: 'band' }, gc);
      st.mk1 = sv('line', { x1: 0, y1: py, x2: 0, y2: py + ph, class: 'mk' }, gc);
      st.mk2 = sv('line', { x1: 0, y1: py, x2: 0, y2: py + ph, class: 'mk' }, gc);
      s.series.forEach(function (se, i) {
        st.lines.push(sv('path', { class: 'ln', stroke: PEN[i] }, gc));
      });
      s.series.forEach(function (se, i) {
        st.dots.push(sv('circle', { r: 4 * sc, fill: PEN[i], stroke: '#1e2328', 'stroke-width': 2 * sc }, g));
      });
      if (si === 0) {
        st.bandLbl = sv('text', { x: padL + 4, y: py + 13 * sc, 'font-size': fK * 0.95, class: 'tk' }, gc);
        st.bandLbl.textContent = 'Estab.';
        st.mk1Lbl = sv('text', { x: 0, y: py + 13 * sc, 'font-size': fK * 0.95, class: 'tk' }, gc);
        st.mk1Lbl.textContent = 'Inicio ' + HM + ' h';
        st.mk2Lbl = sv('text', { x: 0, y: py + 13 * sc, 'font-size': fK * 0.95, class: 'tk', 'text-anchor': 'end' }, gc);
        st.mk2Lbl.textContent = 'Fin';
      }
      R.strips.push(st);
      y = py + ph + gap;
    });
    // eje X (marcas cada 2 h)
    R.axisY = y - gap + 20 * sc;
    R.xt = [];
    for (var j = 0; j < 6; j++) {
      var xt = sv('text', { y: R.axisY, 'font-size': fK, class: 'tk', 'text-anchor': 'middle' }, svg);
      R.xt.push(xt);
    }
    return R;
  }

  function drawTrend(R, h, win, resaltar) {
    var h1 = Math.max(h, win), h0 = h1 - win, pw = R.pw, x0 = R.padL;
    function X(t) { return x0 + (t - h0) / win * pw; }
    var i0 = Math.max(0, Math.ceil(h0 / TR_DT - 1e-9)), i1 = Math.min(TR_N, Math.floor(h / TR_DT + 1e-9));
    var vNow = vivos(h);
    R.strips.forEach(function (st) {
      var s = st.s, r = s.rng, ph = R.ph, py = st.py, hl = false;
      function Y(v) { return py + ph - (v - r.min) / (r.max - r.min) * ph; }
      s.series.forEach(function (se, k) {
        var a = TR[se.k], d = '', i, first = true;
        for (i = i0; i <= i1; i++) { d += (first ? 'M' : 'L') + X(i * TR_DT).toFixed(1) + ',' + Y(a[i]).toFixed(1); first = false; }
        var vn = vNow[se.k];
        d += (first ? 'M' : 'L') + X(h).toFixed(1) + ',' + Y(vn).toFixed(1);
        setA(st.lines[k], 'd', d);
        setA(st.dots[k], 'cx', X(h).toFixed(1));
        setA(st.dots[k], 'cy', Y(U.clamp(vn, r.min, r.max)).toFixed(1));
        var txt = fmt(vn, s.dec);
        setT(st.vals[k], txt);
        if (resaltar && se.tag === resaltar) hl = true;
      });
      setCls(st.g, 'is-hl', hl);
      // banda de estabilización y marcas inicio/fin
      var bx0 = X(Math.max(0, h0)), bx1 = X(Math.min(HS, h1));
      setA(st.band, 'x', bx0.toFixed(1));
      setA(st.band, 'width', Math.max(0, bx1 - bx0).toFixed(1));
      var m1 = X(HS), m2 = X(HEND);
      var v1 = HS >= h0 && HS <= h, v2 = HEND >= h0 && HEND <= h;
      setA(st.mk1, 'x1', m1.toFixed(1)); setA(st.mk1, 'x2', m1.toFixed(1)); setA(st.mk1, 'opacity', v1 ? 1 : 0);
      setA(st.mk2, 'x1', m2.toFixed(1)); setA(st.mk2, 'x2', m2.toFixed(1)); setA(st.mk2, 'opacity', v2 ? 1 : 0);
      if (st.bandLbl) {
        setA(st.bandLbl, 'opacity', (bx1 - bx0) > 44 ? 1 : 0);
        setA(st.mk1Lbl, 'x', (m1 + 5).toFixed(1)); setA(st.mk1Lbl, 'opacity', v1 && (x0 + pw - m1) > 80 ? 1 : 0);
        setA(st.mk2Lbl, 'x', (m2 - 5).toFixed(1)); setA(st.mk2Lbl, 'opacity', v2 ? 1 : 0);
      }
    });
    // marcas del eje X cada 2 h
    var first = Math.ceil(h0 / 2) * 2;
    R.xt.forEach(function (tx, k) {
      var tt = first + k * 2, on = tt <= h1 + 1e-6, xx = X(tt);
      setA(tx, 'x', xx.toFixed(1));
      setA(tx, 'text-anchor', xx > x0 + pw - 24 ? 'end' : xx < x0 + 24 ? 'start' : 'middle');
      setA(tx, 'opacity', on ? 1 : 0);
      setT(tx, 'T+' + pad2(tt) + ' h');
    });
  }

  /* ------------------------------------------------------------------
     Odómetro
     ------------------------------------------------------------------ */
  function buildOdo(parent, nInt, nDec) {
    var o = { nInt: nInt, nDec: nDec, cells: [], strips: [] }, box = hx('div', 'saf-odo', parent), i, j;
    var strip = ''; for (j = 0; j <= 10; j++) strip += '<span>' + (j % 10) + '</span>';
    for (i = 0; i < nInt + nDec; i++) {
      if (i === nInt) hx('i', 'saf-dot', box);
      var c = hx('span', 'saf-dig' + (i >= nInt ? ' dec' : ''), box);
      var s = hx('span', 'saf-strip', c, strip);
      o.cells.push(c); o.strips.push(s);
    }
    box.setAttribute('aria-hidden', 'true');
    return o;
  }
  function setOdo(o, v, ch, rueda) {
    // +0.5: cada dígito muestra el valor REDONDEADO (igual que fmt). Con rueda (vista en marcha, medición en curso)
    // el dígito gira en el último 15 % antes del cambio; sin rueda salta entero y nunca queda a medio giro.
    var n = o.nInt + o.nDec, x = Math.max(0, v) * Math.pow(10, o.nDec) + 0.5, lim = Math.pow(10, n) - 1e-6, k;
    if (x > lim) x = lim;
    for (k = 0; k < n; k++) {
      var p = Math.pow(10, k), dgt = Math.floor(x / p) % 10, lower = x % p;
      var roll = !rueda ? 0 : k === 0 ? U.clamp(((x % 1) - 0.85) / 0.15, 0, 1) : U.clamp((lower - (p - 0.15)) / 0.15, 0, 1);
      var pos = dgt + roll, idx = n - 1 - k;
      var tr = 'translateY(' + (-pos * ch).toFixed(2) + 'px)';
      var st = o.strips[idx];
      if (st._t !== tr) { st.style.transform = tr; st._t = tr; }
      setCls(o.cells[idx], 'lead', k > o.nDec && x < p);
    }
  }

  /* ------------------------------------------------------------------
     Pantalla SAF-900
     ------------------------------------------------------------------ */
  function create(container, opts) {
    opts = opts || {};
    injectCSS();
    var root = document.createElement('div');
    root.className = 'saf';
    root.setAttribute('role', 'group');
    container.appendChild(root);
    var auto = !(opts.width > 0 && opts.height > 0);
    var view = { el: root, layout: null, compacto: null };
    var S = null, lastH = 0, lastO = null, ro = null;

    function build(layout, compacto) {
      layout = layout === 'portrait' ? 'portrait' : 'landscape';
      compacto = !!compacto;
      view.layout = layout; view.compacto = compacto;
      var key = layout + (compacto ? 'C' : ''), L = LAYOUTS[key], G = MIM[L.mim];
      var tag = opts.tag || SEP_TAG;
      root.innerHTML = '';
      root.setAttribute('aria-label', 'Pantalla ' + NOMBRE_SCADA + ' simulada: aforo de pozo con separador ' + tag + '. ' + DM.aviso + '.');
      root.style.aspectRatio = auto ? (L.W + ' / ' + L.H) : '';
      if (auto) root.setAttribute('data-auto', ''); else root.removeAttribute('data-auto');
      var scr = hx('div', 'saf-screen ' + ({ landscape: 'L', portrait: 'P', landscapeC: 'LC c', portraitC: 'PC c' })[key], root);
      scr.style.width = L.W + 'px'; scr.style.height = L.H + 'px';
      S = { L: L, G: G, scr: scr, tag: tag, compacto: compacto, layout: layout, panels: {} };

      // --- encabezado ---
      var head = hx('header', 'saf-head', scr); place(head, L.head);
      var logo = opts.logo === false ? '' : '<img class="saf-logo" alt="" src="' + esc(opts.logo || D.empresa.logoBlanco) + '">';
      head.innerHTML =
        '<div class="saf-brand">' + esc(NOMBRE_SCADA) + (compacto ? '' : '<small>PC de<br>campo</small>') + '</div>' +
        '<div class="saf-hmain"><div class="saf-title">Aforo de pozo <span>· Separador</span> ' + esc(tag) + '</div>' +
        '<div class="saf-hsub">' + esc(NOMBRE_RTU) + (compacto ? '' : ' · PC de campo') + '</div></div>' +
        '<div class="saf-rtu"><span class="com"><i class="saf-led"></i>' + (compacto ? 'COM OK' : 'COMUNICACIÓN OK') + '</span>' +
        '<span class="saf-chip sim" title="' + esc(DM.aviso) + '">Simulado</span></div>' + logo;
      S.led = head.querySelector('.com .saf-led');

      // --- banner de estado ---
      var bn = hx('section', 'saf-p saf-banner', scr); place(bn, L.banner);
      S.panels.estado = bn;
      var steps = ESTADOS.map(function (e, i) { return '<li data-i="' + i + '"><b>' + (i + 1) + '</b><span>' + esc(e.nombre) + '</span></li>'; }).join('');
      bn.innerHTML =
        '<div class="saf-st"><div class="saf-lbl">Estado de la medición</div><div class="saf-pill"><i class="saf-led"></i><span></span></div><div class="saf-tp tp"></div></div>' +
        '<ol class="saf-steps" aria-label="Etapas">' + steps + '</ol>' +
        '<div class="saf-clock"><div class="saf-lbl">Reloj de medición <span class="msg"></span></div>' +
        '<div class="saf-time"><span class="saf-hms">00:00:00</span><span class="saf-of">/ ' + pad2(HM) + ':00:00</span></div>' +
        '<div class="saf-progrow"><div class="saf-prog"><i></i></div><b class="pct"></b></div></div>';
      S.pill = bn.querySelector('.saf-pill span'); S.pillLed = bn.querySelector('.saf-pill .saf-led');
      S.steps = [].slice.call(bn.querySelectorAll('.saf-steps li'));
      S.hms = bn.querySelector('.saf-hms'); S.tp = bn.querySelector('.tp');
      S.prog = bn.querySelector('.saf-prog i'); S.msg = bn.querySelector('.msg'); S.pct = bn.querySelector('.pct');

      // --- mímico ---
      var pm = panel('mimico', 'Mímico de proceso', compacto ? '' : 'Pozo → separador → batería');
      pm.el.classList.add('saf-mim');
      var svg = sv('svg', { role: 'img', 'aria-label': 'Mímico: árbol de válvulas, estrangulador, separador ' + tag + '; gas: ' + NOMBRE_PLACA.toLowerCase() + ' y después ' + V_GAS.tag + '; líquido: ' + NOMBRE_CORIOLIS + ' y después ' + V_LIQ.tag + '; reincorporación a batería, con los ' + D.instrumentos.length + ' instrumentos' }, pm.body);
      S.mim = buildMimico(svg, G, compacto, tag);

      // --- acumulados ---
      var pa = panel('acum', 'Acumulados', '');
      S.accChip = pa.chip;
      var acc = hx('div', 'saf-acc', pa.body);
      var cw = compacto ? (layout === 'portrait' ? [26, 40, 33] : [21, 32, 26]) : [34, 48, 40];
      acc.style.setProperty('--cw', cw[0] + 'px'); acc.style.setProperty('--ch', cw[1] + 'px'); acc.style.setProperty('--cf', cw[2] + 'px');
      S.ch = cw[1];
      var CTR = [
        { k: 'acumMezcla', q: 'qMezcla', nm: 'Q mezcla', sub: 'aceite + agua', u: 'bls', ru: 'bpd', i: 4, d: 1, sw: 'linear-gradient(90deg,' + C.liquido + ' 50%,' + C.liquidoAmbar + ' 50%)' },
        { k: 'acumAceite', q: 'qAceite', nm: 'Q aceite', sub: '', u: 'bls', ru: 'bpd', i: 4, d: 1, sw: C.liquidoAmbar },
        { k: 'acumAgua', q: 'qAgua', nm: 'Q agua', sub: '', u: 'bls', ru: 'bpd', i: 4, d: 1, sw: AGUA },
        { k: 'acumGas', q: 'qGas', nm: 'Q gas', sub: '', u: 'MMpc', ru: 'MMpcd', i: 2, d: 3, sw: C.gas }
      ];
      S.ctr = CTR.map(function (c) {
        var box = hx('div', 'saf-ctr', acc);
        var h = hx('div', 'saf-ctr-h', box, '<span class="nm"><i class="saf-sw" style="background:' + c.sw + '"></i>' + esc(c.nm) + '</span>' + (c.sub && !compacto ? '<small>' + esc(c.sub) + '</small>' : ''));
        var r = hx('div', 'saf-ctr-r', h, '<b></b> ' + esc(c.ru));
        var m = hx('div', 'saf-ctr-m', box);
        var o = buildOdo(m, c.i, c.d);
        hx('span', 'saf-ctr-u', m, esc(c.u));
        var sr = document.createElement('span'); sr.className = 'wt-visually-hidden'; box.appendChild(sr);
        return { c: c, o: o, r: r.querySelector('b'), sr: sr, h: h };
      });

      // --- Coriolis / % agua ---
      var pc = panel('cor', NOMBRE_CORIOLIS, '');
      var cor = hx('div', 'saf-cor', pc.body);
      cor.innerHTML =
        '<div class="saf-lbl">% agua / % aceite</div>' +
        '<div class="saf-split"><i class="ac" style="background:' + C.liquidoAmbar + '"></i><i class="ag" style="background:' + AGUA + '"></i></div>' +
        '<div class="saf-leg"><span><i class="saf-sw" style="background:' + C.liquidoAmbar + '"></i>Aceite <b class="pa"></b></span><span><i class="saf-sw" style="background:' + AGUA + '"></i>Agua <b class="pw"></b></span></div>' +
        '<div class="saf-stats"><div class="saf-stat"><span class="k">Densidad</span><span class="val"><span class="de"></span><small>kg/m³</small></span></div>' +
        '<div class="saf-stat"><span class="k">Flujo másico</span><span class="val"><span class="ma"></span><small>kg/h</small></span></div></div>' +
        (compacto ? '' : '<p class="saf-note">Separador bifásico: el líquido sale como una sola corriente (aceite + agua); el Coriolis, aguas arriba de la ' + esc(V_LIQ.tag) + ', mide masa, densidad y % agua.</p>');
      S.cAc = cor.querySelector('.ac'); S.cAg = cor.querySelector('.ag');
      S.cPa = cor.querySelector('.pa'); S.cPw = cor.querySelector('.pw'); S.cDe = cor.querySelector('.de'); S.cMa = cor.querySelector('.ma');

      // --- variables ---
      if (L.vars) {
        var pv = panel('vars', 'Variables reportadas', '');
        var tb = hx('table', 'saf-tbl', pv.body);
        var rowH = Math.floor((L.vars[3] - 34 - 30) / D.variables.length);
        tb.innerHTML = '<colgroup><col><col style="width:' + (L.vars[2] > 500 ? 116 : 96) + 'px"><col style="width:' + (L.vars[2] > 500 ? 120 : 84) + 'px"><col style="width:' + (L.vars[2] > 500 ? 84 : 74) + 'px"></colgroup>' +
          '<thead><tr><th>Variable</th><th>Tag</th><th class="v">Valor</th><th>Unidad</th></tr></thead><tbody>' +
          D.variables.map(function (vr) {
            var fn = funcionDe(vr.tag, vr.unidad);   // Q gas: FQI (TDG)
            return '<tr data-tag="' + esc(vr.tag) + '" style="height:' + rowH + 'px"><td>' + esc(vr.nombre) + '</td><td class="t"><span>' + esc(fn ? fn.tag : vr.tag) + '</span>' + (fn ? '<i>(' + esc(vr.tag) + ')</i>' : '') + '</td><td class="v" data-k="' + esc(vr.id) + '"></td><td class="u">' + esc(vr.unidad) + '</td></tr>';
          }).join('') + '</tbody>';
        S.rows = [].slice.call(tb.querySelectorAll('tbody tr')).map(function (tr) { return { tr: tr, tag: tr.getAttribute('data-tag'), td: tr.querySelector('td.v'), k: tr.querySelector('td.v').getAttribute('data-k') }; });
      }

      // --- tendencias ---
      if (L.trends) {
        var pt = panel('tendencias', 'Tendencias', 'Últimas ' + L.trendW + ' h simuladas');
        var trw = hx('div', 'saf-tr', pt.body);
        var bw = (L.trends[2] - 16 - 14) / 2, bh = L.trends[3] - 34 - 12;
        S.trends = CHARTS.map(function (ch) { var s = sv('svg', { role: 'img', 'aria-label': 'Tendencia de ' + ch.titulo.toLowerCase() }, trw); return buildTrend(s, Math.floor(bw), Math.floor(bh), ch, 1); });
      }

      // --- bitácora ---
      if (L.log) {
        var pl = panel('bitacora', 'Bitácora de eventos', '');
        S.log = hx('ol', 'saf-log', pl.body);
        S.logMax = Math.max(1, Math.floor((L.log[3] - 34 - 6) / 38));
        S.ev = eventos(tag);
        S.logN = -1;
      }

      // --- pie ---
      if (L.foot) {
        var ft = hx('footer', 'saf-foot', scr); place(ft, L.foot);
        ft.innerHTML = '<span><b>' + esc(DM.aviso) + '</b></span>' +
          '<span>' + (compacto ? 'kg/cm² · °C · bpd · MMpcd' : 'Unidades de campo: kg/cm² · °C · bpd · MMpcd · bls · MMpc') + '</span>';
      }
      fit();
    }

    function panel(name, title, sub) {
      var L = S.L, r = L[name === 'tendencias' ? 'trends' : name === 'bitacora' ? 'log' : name];
      var el = hx('section', 'saf-p', S.scr); place(el, r);
      var t = hx('div', 'saf-pt', el, esc(title) + (sub ? ' <b>· ' + esc(sub) + '</b>' : ''));
      var chip = hx('span', 'saf-chip', t); chip.style.display = 'none';
      var body = hx('div', 'saf-pb', el);
      S.panels[name] = el;
      return { el: el, body: body, chip: chip, title: t };
    }

    function fit(w, h) {
      if (!S) return;
      var L = S.L;
      if (w > 0 && h > 0) { root.style.width = w + 'px'; root.style.height = h + 'px'; }
      else if (!auto) { root.style.width = opts.width + 'px'; root.style.height = opts.height + 'px'; w = opts.width; h = opts.height; }
      if (!(w > 0 && h > 0)) { w = root.clientWidth || container.clientWidth || L.W; h = root.clientHeight || w * L.H / L.W; }
      var s = Math.min(w / L.W, h / L.H), ox = (w - L.W * s) / 2, oy = (h - L.H * s) / 2;
      S.scr.style.transform = 'translate(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px) scale(' + s.toFixed(5) + ')';
    }

    function renderAt(h, o) {
      if (!S) return;
      o = o || {};
      h = +h; if (!(h > 0)) h = 0;
      lastH = h; lastO = o;
      var v = sim(h), t = o.t != null ? +o.t : h * 2.2, res = o.resaltar || null, ei = v.estadoIdx;
      if (res && ALIAS[res]) res = ALIAS[res];
      var scr = S.scr;
      if (scr._e !== v.estado) { scr.setAttribute('data-estado', v.estado); scr._e = v.estado; }

      // encabezado: LED de comunicación (parpadeo de sondeo)
      setA(S.led, 'style', 'opacity:' + ((t * 1.25) % 1 < 0.72 ? 1 : 0.35));
      // banner
      setT(S.pill, v.estadoNombre);
      setA(S.pillLed, 'style', 'opacity:' + (ei === 2 ? 1 : (0.55 + 0.45 * Math.cos(t * PI2 * 0.6) * 0.5 + 0.225).toFixed(3)));
      S.steps.forEach(function (li, i) { setCls(li, 'is-done', i < ei || ei === 2); setCls(li, 'is-cur', i === ei); });
      setT(S.hms, hms(v.hMedicion));
      setT(S.tp, 'T+' + hm_(h) + ' desde la apertura del pozo');
      var pr = v.hMedicion / HM;
      var trp = 'scaleX(' + pr.toFixed(4) + ')';
      if (S.prog._t !== trp) { S.prog.style.transform = trp; S.prog._t = trp; }
      setT(S.pct, fmt(pr * 100, 1) + ' %');
      setT(S.msg, ei === 0 ? 'Inicia medición en ' + hms(HS - h) : ei === 1 ? 'Restan ' + hms(HM - v.hMedicion) : 'Medición completa · acumulados congelados');

      // mímico
      var M = S.mim, G = S.G, ves = G.ves, k;
      var ly = ves.cy + ves.r - 2 * ves.r * v.nivel / 100;
      setA(M.liq, 'y', ly.toFixed(1));
      setA(M.surf, 'y1', ly.toFixed(1)); setA(M.surf, 'y2', ly.toFixed(1));
      var rate = { mezcla: v.qMezcla / DM.qMezcla, gas: v.qGas / DM.qGas, liquido: (v.aperturaLV > 0 ? 1 : 0) * v.qMezcla / DM.qMezcla, salida: v.qMezcla / DM.qMezcla };
      M.flows.forEach(function (f) {
        var on = U.smooth(rate[f.k] * 3);
        setA(f.el, 'stroke-dashoffset', (-(t * 46) % 18).toFixed(1));
        setA(f.el, 'opacity', on.toFixed(2));
      });
      setCls(M.pv, 'open', v.aperturaPV > 2); setCls(M.pv, 'closed', v.aperturaPV <= 2);
      setCls(M.lv, 'open', v.aperturaLV > 2); setCls(M.lv, 'closed', v.aperturaLV <= 2);
      if (M.lblTxt.pv) setT(M.lblTxt.pv, ' ' + fmt(v.aperturaPV, 0) + ' %');
      if (M.lblTxt.lv) setT(M.lblTxt.lv, ' ' + fmt(v.aperturaLV, 0) + ' %');
      var pulse = 0.55 + 0.45 * Math.sin(t * PI2 * 0.9);
      for (k in M.boxes) {
        var b = M.boxes[k], hl = res === k;
        setT(b.v, fmt(v[b.spec.k], b.spec.d));
        if (b.s) setT(b.s, b.spec.sub(v));
        setCls(b.g, 'is-hl', hl);
        setCls(b.ldr, 'is-hl', hl);
        setA(b.ring, 'opacity', hl ? pulse.toFixed(2) : '0');
      }

      // acumulados
      S.ctr.forEach(function (c) {
        setOdo(c.o, v[c.c.k], S.ch, ei === 1 && o.rueda === true);
        setT(c.r, fmt(v[c.c.q], c.c.ru === 'bpd' ? 0 : 3));
        setT(c.sr, c.c.nm + ': ' + fmt(v[c.c.k], c.c.d) + ' ' + c.c.u);
      });
      var chip = S.accChip;
      if (chip._e !== v.estado) {
        chip.style.display = '';
        chip.className = 'saf-chip st';
        chip.textContent = ei === 0 ? 'En espera' : ei === 1 ? 'Integrando' : 'Congelados';
        chip._e = v.estado;
      }

      // Coriolis
      var trA = 'flex:' + v.pctAceite.toFixed(2) + ' 1 0', trW = 'flex:' + v.pctAgua.toFixed(2) + ' 1 0';
      setA(S.cAc, 'style', 'background:' + C.liquidoAmbar + ';' + trA);
      setA(S.cAg, 'style', 'background:' + AGUA + ';' + trW);
      setT(S.cPa, fmt(v.pctAceite, 1) + ' %'); setT(S.cPw, fmt(v.pctAgua, 1) + ' %');
      setT(S.cDe, fmt(v.densidad, 1)); setT(S.cMa, fmt(v.masico, 0));

      // tabla
      if (S.rows) S.rows.forEach(function (r) { setT(r.td, fmt(v[r.k], DEC[r.k])); setCls(r.tr, 'is-hl', res && r.tag === res); });

      // tendencias
      if (S.trends) S.trends.forEach(function (R) { drawTrend(R, h, S.L.trendW, res); });

      // bitácora
      if (S.log) {
        var vis = S.ev.filter(function (e) { return e.h <= h + 1e-9; });
        if (vis.length !== S.logN) {
          S.logN = vis.length;
          S.log.innerHTML = vis.slice(-S.logMax).reverse().map(function (e) {
            var nm = ESTADOS.filter(function (x) { return x.id === e.estado; })[0];
            return '<li><time>T+' + hm_(e.h) + '</time><span class="saf-chip" data-e="' + e.estado + '">' + esc(nm ? nm.nombre : '') + '</span><span class="x">' + esc(e.texto) + '</span></li>';
          }).join('');
        }
      }

      // resaltado de paneles
      var PMAP = { estado: 'estado', acumulados: 'acum', acum: 'acum', tendencias: 'tendencias', bitacora: 'bitacora', coriolis: 'cor', agua: 'cor', variables: 'vars', mimico: 'mimico' };
      for (k in S.panels) setCls(S.panels[k], 'is-hl', res && PMAP[res] === k);
      if (res === 'CORIOLIS' && S.panels.cor) setCls(S.panels.cor, 'is-hl', true);
      return v;
    }

    view.renderAt = renderAt;
    view.resize = function (w, h) { if (w > 0 && h > 0) { auto = false; opts.width = w; opts.height = h; root.style.aspectRatio = ''; root.removeAttribute('data-auto'); } fit(w, h); };
    view.setLayout = function (layout, compacto) { build(layout, compacto == null ? view.compacto : compacto); renderAt(lastH, lastO); };
    view.dispose = function () { if (ro) ro.disconnect(); if (root.parentNode) root.parentNode.removeChild(root); S = null; };
    view.sim = sim;

    build(opts.layout, opts.compacto);
    if (auto && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(function () { if (auto) fit(); }); ro.observe(root); }
    renderAt(opts.h != null ? opts.h : 0, {});
    return view;
  }

  WT.SCADA = {
    sim: sim,
    create: create,
    /* extensiones (documentadas en el informe) */
    horas: { estabilizacion: HS, medicion: HM, fin: HEND, total: HTOT },
    estadoEn: function (h) { return ESTADOS[estadoIdx(+h || 0)]; },
    eventos: eventos,
    formato: { num: fmt, hms: hms },
    colorAgua: AGUA
  };
})();
