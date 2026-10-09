/* =====================================================================
   Well Testing · R.B. Tec México — ESCENA 3D DE LA MACROPERA (WT.Scene3D)
   ---------------------------------------------------------------------
   Escena Three.js (r170, global THREE) de la locación de aforo:
   árbol de válvulas → estrangulador TP/TR → cabezal/manifold → línea de
   entrada → separador bifásico (remolque) → líquido (Coriolis → LV) y gas
   (placa de orificio + TDG → PV) → reincorporación → línea de salida → batería.
   En cada salida primero se mide y después pasa por la válvula de control.

   Contrato (docs/ARQUITECTURA.md):
     var s = WT.Scene3D.create({ canvas, width, height, pixelRatio, quality, separatorTag });
     s.renderAt(t, estado)   determinista: el cuadro depende solo de (t, estado)
     s.resize(w, h) · s.project([x,y,z]) · s.anchors · s.shots · s.lerpShot(a,b,k)
     s.camera · s.scene · s.renderer · s.dispose()

   Opciones extra de create():
     quality: 'ultra' | 'high' | 'medium' | 'low'   ('ultra' = reflejos PMREM también en pintura)
     antialias: bool (forzar MSAA)   fitPortrait: true (aleja la cámara en relaciones verticales)
     preserveDrawingBuffer: bool

   Extensiones (opcionales):
     s.ready                     Promesa: fuentes cargadas y rótulos 3D redibujados (esperarla antes de capturar)
     s.setSeparatorTag(tag)      cambia la placa naranja del separador
     s.lerpShot(a, b, k, { ease:false, hop:0.28 })  k se suaviza (smootherstep) salvo ease:false; hop eleva la cámara en traslados largos
     s.tour(u, nombres?)         pose continua (Catmull-Rom) por varias tomas, u = 0..1 (s.tourDefault)
     s.poseFor(id)               toma sugerida para cualquier equipo/ancla
     s.planPose(estado)          pose cenital calculada (la que usa ortho = 1)
     s.cameraPose()              pose efectiva del último renderAt
     s.metersPerPixel()          escala en el objetivo de la cámara (barra de escala)
     s.cotas                     [{ de, a, m, p:[x,y,z] }]  para rotular cotas en HTML
     s.ids                       ids resaltables (equipos, instrumentos, internos, LV, PV…)
     estado.planta = { centro:[x,z], ancho:m, padding:{left,right,top,bottom} (px) }
     estado.encuadre = { left,right,top,bottom } (px ocupados por la interfaz; desplaza el centro óptico en 3D)
     estado.capas.lineas = true  cintas de flujo animadas sobre el piso (más visibles en planta)
     estado.nivel                nivel de líquido 0..1 (también actualiza anchors.nivel)
     estado.ajusteVertical=false desactiva el ajuste automático de cámara en pantallas verticales

   Sistema de coordenadas: metros, x = este, y = arriba, z = sur, origen = pozo en prueba.
   ===================================================================== */
(function () {
  'use strict';
  var WT = (window.WT = window.WT || {});
  if (typeof THREE === 'undefined') { if (window.console) console.error('WT.Scene3D: falta js/vendor/three.min.js'); return; }

  var V3 = THREE.Vector3;
  var PI = Math.PI, TAU = PI * 2;
  var FONT_D = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  var FONT_B = 'Barlow, "Segoe UI", Arial, sans-serif';

  var QUALITY = {
    // gloss = reflejo PMREM también en pintura (solo 'ultra'; caro en SwiftShader)
    ultra:  { aa: true,  shadow: 2048, soft: true,  dens: 1.0,  veg: 1.0,  seg: 1.0, env: true,  gloss: true },
    high:   { aa: true,  shadow: 2048, soft: false, dens: 1.0,  veg: 1.0,  seg: 1.0, env: true,  gloss: false },
    medium: { aa: true,  shadow: 2048, soft: false, dens: 0.6,  veg: 0.7,  seg: 0.8, env: true,  gloss: false },
    low:    { aa: false, shadow: 1024, soft: false, dens: 0.35, veg: 0.45, seg: 0.6, env: false, gloss: false }
  };

  /* ---------- utilidades puras ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smoother(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function frac(x) { return x - Math.floor(x); }
  function v3(a) { return new V3(a[0], a[1], a[2]); }
  function angDiff(a, b) { var d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; }
  function hexA(hex, a) {
    var c = new THREE.Color(hex);
    return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + a + ')';
  }

  var _q = new THREE.Quaternion(), _e = new THREE.Euler(), _Y = new V3(0, 1, 0);
  function mat(x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'XYZ');
    _q.setFromEuler(_e);
    var u = sx == null ? 1 : sx;
    return new THREE.Matrix4().compose(new V3(x || 0, y || 0, z || 0), _q.clone(),
      new V3(u, sy == null ? u : sy, sz == null ? u : sz));
  }

  /* Geometrías básicas (todas indexadas tras prep) */
  function gBox(w, h, d, r) { return r ? new THREE.RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d); }
  function gCyl(rt, rb, h, seg, open, ts, tl) { return new THREE.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open, ts || 0, tl == null ? TAU : tl); }
  /* cilindro alineado con dir (vector unitario) centrado en c */
  function orient(g, c, dir) {
    _q.setFromUnitVectors(_Y, dir.clone().normalize());
    g.applyQuaternion(_q); g.translate(c.x, c.y, c.z); return g;
  }
  function gCylAB(a, b, r, seg, open, r2) {
    var d = new V3().subVectors(b, a), L = d.length();
    var g = new THREE.CylinderGeometry(r2 == null ? r : r2, r, L, seg || 16, 1, !!open);
    g.translate(0, L / 2, 0);
    _q.setFromUnitVectors(_Y, d.normalize());
    g.applyQuaternion(_q); g.translate(a.x, a.y, a.z);
    return g;
  }

  function prep(g) {
    if (g.index === null) {
      var n = g.attributes.position.count, idx = new Uint32Array(n);
      for (var i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    var keep = { position: 1, normal: 1, uv: 1 };
    Object.keys(g.attributes).forEach(function (k) { if (!keep[k]) g.deleteAttribute(k); });
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  }

  /* Normales suaves para geometrías no indexadas (une vértices coincidentes) */
  function smoothNormals(g) {
    if (g.index) g = g.toNonIndexed();
    var p = g.attributes.position, n = p.count, map = {}, acc = [], key = new Int32Array(n), i;
    for (i = 0; i < n; i++) {
      var k = Math.round(p.getX(i) * 1e4) + '_' + Math.round(p.getY(i) * 1e4) + '_' + Math.round(p.getZ(i) * 1e4);
      if (map[k] === undefined) { map[k] = acc.length; acc.push(new V3()); }
      key[i] = map[k];
    }
    var a = new V3(), b = new V3(), c = new V3(), cb = new V3(), ab = new V3();
    for (i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab);
      acc[key[i]].add(cb); acc[key[i + 1]].add(cb); acc[key[i + 2]].add(cb);
    }
    var nn = new Float32Array(n * 3);
    for (i = 0; i < n; i++) { var v = acc[key[i]]; var l = v.length() || 1; nn[i * 3] = v.x / l; nn[i * 3 + 1] = v.y / l; nn[i * 3 + 2] = v.z / l; }
    g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    return g;
  }

  /* Ruta de tubería con codos (filetes) → segmentos + CurvePath */
  function route(pts, bendR) {
    var P = pts.map(function (p) { return p.isVector3 ? p.clone() : v3(p); });
    var segs = [], path = new THREE.CurvePath(), cur = P[0].clone();
    for (var i = 1; i < P.length; i++) {
      var b = P[i];
      if (i < P.length - 1) {
        var a = P[i - 1], c = P[i + 1];
        var din = new V3().subVectors(b, a), dout = new V3().subVectors(c, b);
        var lin = din.length(), lout = dout.length();
        din.normalize(); dout.normalize();
        if (din.dot(dout) > 0.9995 || lin < 1e-5 || lout < 1e-5) continue;
        var r = Math.min(bendR, lin * 0.45, lout * 0.45);
        var a1 = b.clone().addScaledVector(din, -r), a2 = b.clone().addScaledVector(dout, r);
        if (cur.distanceTo(a1) > 1e-4) { segs.push({ type: 'line', a: cur.clone(), b: a1.clone() }); path.add(new THREE.LineCurve3(cur.clone(), a1.clone())); }
        segs.push({ type: 'bend', a: a1.clone(), c: b.clone(), b: a2.clone() });
        path.add(new THREE.QuadraticBezierCurve3(a1.clone(), b.clone(), a2.clone()));
        cur = a2;
      } else {
        segs.push({ type: 'line', a: cur.clone(), b: b.clone() });
        path.add(new THREE.LineCurve3(cur.clone(), b.clone()));
      }
    }
    return { segs: segs, path: path, pts: P };
  }

  /* Muestreo por longitud de arco para partículas (sin objetos en renderAt) */
  function sampler(path, step) {
    var L = path.getLength();
    var n = Math.max(8, Math.ceil(L / (step || 0.03)));
    var pts = path.getSpacedPoints(n);
    var arr = new Float32Array((n + 1) * 3);
    for (var i = 0; i <= n; i++) { arr[i * 3] = pts[i].x; arr[i * 3 + 1] = pts[i].y; arr[i * 3 + 2] = pts[i].z; }
    return {
      L: L, n: n, a: arr,
      at: function (s, out) {
        s = clamp(s, 0, 1) * n; var i = Math.min(n - 1, Math.floor(s)), f = s - i, k = i * 3;
        out.set(lerp(arr[k], arr[k + 3], f), lerp(arr[k + 1], arr[k + 4], f), lerp(arr[k + 2], arr[k + 5], f));
        return out;
      },
      tan: function (s, out) {
        s = clamp(s, 0, 1) * n; var i = Math.min(n - 1, Math.floor(s)), k = i * 3;
        out.set(arr[k + 3] - arr[k], arr[k + 4] - arr[k + 1], arr[k + 5] - arr[k + 2]);
        var l = out.length(); if (l > 1e-9) out.multiplyScalar(1 / l); else out.set(1, 0, 0);
        return out;
      }
    };
  }

  /* =================================================================== */
  function create(opts) {
    opts = opts || {};
    var D = WT.data, U = WT.util, C = D.colores, MP = D.macropera, PL = MP.plataforma;
    // Colores de equipo y de capas desde WT.data.colores (con respaldo si faltan)
    var EQC = C.equipo || {};
    var COL = {
      recipiente: EQC.recipiente || '#2c4b3b', brida: EQC.brida || '#7b4f8a', remolque: EQC.remolque || '#f0a21b',
      cabezalEH: EQC.cabezalEH || '#1f72c8', psv: EQC.psv || '#c81f2a', placaTag: EQC.placaTag || '#f39a1e',
      zona: C.zonaSeguridad || '#d6262e', camino: C.camino || '#b9a888',
      liquido: C.liquido || '#1c140c', ambar: C.liquidoAmbar || '#e8971e'
    };
    var canvas = opts.canvas;
    if (!canvas) throw new Error('WT.Scene3D.create: falta { canvas }');
    var W = Math.max(2, opts.width || canvas.clientWidth || 1280);
    var H = Math.max(2, opts.height || canvas.clientHeight || 720);
    var Q = QUALITY[opts.quality] || QUALITY.high;
    var sepTag = opts.separatorTag || D.separador.tagDefault;
    var fitPortrait = opts.fitPortrait !== false; // en pantallas verticales aleja la cámara para conservar el encuadre horizontal

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: opts.antialias != null ? !!opts.antialias : Q.aa, alpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer
    });
    renderer.setPixelRatio(opts.pixelRatio || 1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.localClippingEnabled = true;
    var maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 3000);
    var rng = U.rng(20240917);

    /* ---------------- texturas procedurales ---------------- */
    var textTextures = [];
    function canvasTex(w, h, draw, o) {
      o = o || {};
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d');
      draw(g, w, h);
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = o.aniso || maxAniso;
      if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      if (o.wrapS) t.wrapS = THREE.RepeatWrapping;
      if (o.text) { t.userData.redraw = function () { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; }; textTextures.push(t); }
      return t;
    }

    // Plataforma de caliche (una imagen para toda la pera: manchas, huellas, pasto en bordes)
    var platW = PL.x1 - PL.x0, platD = PL.z1 - PL.z0;
    var texPlat = canvasTex(2048, Math.round(2048 * platD / platW), function (g, w, h) {
      var r = U.rng(11), sx = w / platW, sz = h / platD;
      function X(x) { return (x - PL.x0) * sx; } function Z(z) { return (z - PL.z0) * sz; }
      g.fillStyle = '#d4c8ab'; g.fillRect(0, 0, w, h);
      var i, x, y, rad, gr;
      for (i = 0; i < 520; i++) {
        x = r() * w; y = r() * h; rad = 18 + r() * 150;
        var light = r() < 0.55;
        gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, light ? 'rgba(242,236,220,0.24)' : 'rgba(150,128,96,0.18)');
        gr.addColorStop(1, light ? 'rgba(242,236,220,0)' : 'rgba(150,128,96,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // huellas de llantas: acceso → caseta y alrededor del separador
      g.lineCap = 'round';
      function track(pts, wdt, a) {
        [-0.95, 0.95].forEach(function (off) {
          g.strokeStyle = 'rgba(122,104,78,' + a + ')'; g.lineWidth = wdt * sx;
          g.beginPath();
          for (var k = 0; k < pts.length; k++) {
            var p = pts[k], q = pts[Math.min(pts.length - 1, k + 1)], pp = pts[Math.max(0, k - 1)];
            var dx = q[0] - pp[0], dz = q[1] - pp[1], l = Math.hypot(dx, dz) || 1;
            var px = X(p[0] - dz / l * off), py = Z(p[1] + dx / l * off);
            if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.stroke();
        });
      }
      track([[56, 30], [50, 30], [46, 27], [44, 22], [40, 18], [34, 16], [27, 16], [24, 18]], 0.35, 0.16);
      track([[56, 31], [44, 31], [30, 30], [12, 27], [0, 24], [-20, 24], [-38, 20]], 0.35, 0.10);
      track([[24, 18], [18, 19], [12, 16], [10, 10]], 0.35, 0.10);
      // manchas de aceite junto al contrapozo y bajo el remolque
      function stain(cx, cz, rr, a) {
        for (var k = 0; k < 7; k++) {
          var ox = (r() - 0.5) * rr, oz = (r() - 0.5) * rr, q = rr * (0.3 + r() * 0.5) * sx;
          gr = g.createRadialGradient(X(cx + ox), Z(cz + oz), 0, X(cx + ox), Z(cz + oz), q);
          gr.addColorStop(0, 'rgba(70,58,44,' + a + ')'); gr.addColorStop(1, 'rgba(70,58,44,0)');
          g.fillStyle = gr; g.fillRect(X(cx + ox) - q, Z(cz + oz) - q, q * 2, q * 2);
        }
      }
      MP.pozos.forEach(function (p) { stain(p.x, p.z, 4.2, p.enPrueba ? 0.22 : 0.12); });
      stain(MP.separador.x, MP.separador.z, 4, 0.16);
      stain(MP.manifold.x, MP.manifold.z, 2.2, 0.15);
      // pasto ralo: más denso en bordes y en parches
      var patches = [];
      for (i = 0; i < 26; i++) patches.push([PL.x0 + r() * platW, PL.z0 + r() * platD, 2 + r() * 6]);
      MP.pozos.forEach(function (p) { patches.push([p.x, p.z + 2.6, 3.2]); patches.push([p.x - 2.4, p.z - 2, 2.4]); });
      var greens = ['#7c8a42', '#6b7a36', '#8f944d', '#a19a5c', '#5e6c2f', '#99a35a'];
      for (i = 0; i < 70000; i++) {
        var wx = PL.x0 + r() * platW, wz = PL.z0 + r() * platD;
        var de = Math.min(wx - PL.x0, PL.x1 - wx, wz - PL.z0, PL.z1 - wz);
        var p = Math.exp(-de / 3.2) * 0.95;
        for (var k = 0; k < patches.length; k++) {
          var pc = patches[k], dd = Math.hypot(wx - pc[0], wz - pc[1]);
          if (dd < pc[2]) p = Math.max(p, 0.35 * (1 - dd / pc[2]));
        }
        if (r() > p) continue;
        var cx = X(wx), cy = Z(wz);
        g.strokeStyle = greens[(r() * greens.length) | 0];
        g.globalAlpha = 0.55 + r() * 0.45; g.lineWidth = 1 + r() * 1.2;
        g.beginPath();
        for (var s = 0; s < 4; s++) { var an = -PI / 2 + (r() - 0.5) * 1.6, ln = 2 + r() * 5; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * ln, cy + Math.sin(an) * ln); }
        g.stroke();
      }
      g.globalAlpha = 1;
    }, { aniso: maxAniso });

    // Detalle de grava (lineal, media 0.5) que se multiplica ×2 sobre la plataforma
    var texGravel = canvasTex(512, 512, function (g, w, h) {
      var r = U.rng(5);
      g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 9000; i++) {
        var x = r() * w, y = r() * h, rr = 0.6 + r() * r() * 4.2, v = 80 + r() * 140 | 0;
        g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 6) + ',' + (0.35 + r() * 0.6) + ')';
        g.beginPath(); g.ellipse(x, y, rr, rr * (0.6 + r() * 0.4), r() * PI, 0, TAU); g.fill();
        if (x < 6 || x > w - 6 || y < 6 || y > h - 6) { // envolver bordes
          g.beginPath(); g.ellipse((x + w / 2) % w, y, 0.1, 0.1, 0, 0, TAU); g.fill();
        }
      }
    }, { linear: true, repeat: true });

    var texGrass = canvasTex(512, 512, function (g, w, h) {
      var r = U.rng(7);
      g.fillStyle = '#5d6b36'; g.fillRect(0, 0, w, h);
      var cols = ['#4f5f2a', '#6d7c3c', '#839048', '#43532a', '#9a9a5a', '#62743a', '#7a7a46'];
      for (var i = 0; i < 16000; i++) {
        var x = r() * w, y = r() * h;
        g.strokeStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.5 + r() * 0.5; g.lineWidth = 1 + r();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 7); g.stroke();
      }
      g.globalAlpha = 1;
    }, { repeat: true });

    var texLeaf = canvasTex(256, 256, function (g, w, h) {
      var r = U.rng(17);
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = r() * w, y = r() * h, v = 90 + r() * 165 | 0, rr = 1.5 + r() * 4;
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        g.beginPath(); g.ellipse(x, y, rr, rr * 0.55, r() * PI, 0, TAU); g.fill();
        if (x < 6 || y < 6) { g.beginPath(); g.ellipse(x + w, y + h, rr, rr * 0.55, 0, 0, TAU); g.fill(); }
      }
    }, { repeat: true });
    texLeaf.repeat.set(3, 3);
    var texHatch = canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#d6cfbf'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7d7563'; g.lineWidth = 7;
      for (var i = -w; i < w * 2; i += 32) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    }, { repeat: true });

    var texZone = canvasTex(128, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = hexA(COL.zona, 0.55); g.fillRect(0, 0, w, h);
      g.fillStyle = hexA(C.amarillo || '#ffc20e', 0.65);
      for (var i = -w; i < w * 2; i += 64) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 32, h); g.lineTo(i + 32 + h, 0); g.lineTo(i + h, 0); g.closePath(); g.fill(); }
    }, { repeat: true });

    var texMesh = canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#4b5056'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(205,210,214,0.85)'; g.lineWidth = 1.5;
      for (var i = 0; i < w; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, h); g.stroke(); g.beginPath(); g.moveTo(i + 20, 0); g.lineTo(i, h); g.stroke(); }
    }, { repeat: true });

    var texGrating = canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#2b2e30'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6d7377';
      for (var i = 0; i < w; i += 8) g.fillRect(i, 0, 3, h);
      for (i = 0; i < h; i += 32) g.fillRect(0, i, w, 2);
    }, { repeat: true });

    var texTrunk = canvasTex(64, 256, function (g, w, h) {
      var r = U.rng(9);
      g.fillStyle = '#8a7a62'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < h; i += 6 + (r() * 4 | 0)) { g.fillStyle = 'rgba(70,58,44,' + (0.35 + r() * 0.3) + ')'; g.fillRect(0, i, w, 2); }
    }, { repeat: true });

    var texFrond = canvasTex(512, 128, function (g, w, h) {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineCap = 'round';
      g.lineWidth = 5; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      for (var x = 10; x < w - 6; x += 9) {
        var tp = Math.sin(PI * Math.min(1, x / w * 1.08)), L = 58 * tp + 6;
        g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 26 * tp, h / 2 - L); g.stroke();
        g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 26 * tp, h / 2 + L); g.stroke();
      }
    }, { linear: true });

    // Rótulos (dependen de fuentes → se redibujan al cargar)
    function drawSepDecal(g, w, h) {
      // w ↔ eje del recipiente (oeste→este, 1.6 m), h ↔ contorno (arriba→abajo, ~0.57 m)
      g.clearRect(0, 0, w, h);
      var px = w / 1.6;
      // placa naranja con el tag (como la placa "FA-02" de la foto 05)
      var x0 = 0.1 * px, y0 = 0.1 * h, pw = 0.56 * px, ph = 0.36 * h;
      g.fillStyle = COL.placaTag; g.fillRect(x0, y0, pw, ph);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.strokeRect(x0 + 8, y0 + 8, pw - 16, ph - 16);
      g.fillStyle = '#141414'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 ' + Math.round(ph * 0.78) + 'px ' + FONT_D;
      g.fillText(sepTag, x0 + pw / 2, y0 + ph / 2 + 4);
      g.fillStyle = '#f4f4ef'; g.textAlign = 'left';
      g.font = '700 ' + Math.round(0.085 * h) + 'px ' + FONT_D;
      g.fillText('SEPARADOR BIFÁSICO', x0, y0 + ph + 0.075 * h);
      var tx = 0.78 * px;
      g.font = '800 ' + Math.round(0.085 * h) + 'px ' + FONT_D;
      String(D.separador.servicio || '').toUpperCase().split(' ').forEach(function (wd, k) { g.fillText(wd, tx, 0.17 * h + k * 0.095 * h); });
      g.font = '600 ' + Math.round(0.066 * h) + 'px ' + FONT_D;
      g.fillText('CIRCUITO CERRADO', tx, 0.4 * h);
      // rombo NFPA 704
      var n = D.separador.nfpa || {}, cx = 1.36 * px, cy = 0.29 * h, s = 0.34 * h;
      var cells = [[0, -1, '#d62b2b', n.inflamabilidad], [-1, 0, '#2b62c9', n.salud], [1, 0, '#f2d21b', n.reactividad], [0, 1, '#ffffff', '']];
      cells.forEach(function (c) {
        var x = cx + c[0] * s * 0.25, y = cy + c[1] * s * 0.25;
        g.beginPath(); g.moveTo(x, y - s * 0.25); g.lineTo(x + s * 0.25, y); g.lineTo(x, y + s * 0.25); g.lineTo(x - s * 0.25, y); g.closePath();
        g.fillStyle = c[2]; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 3; g.stroke();
        if (c[3] !== '' && c[3] != null) { g.fillStyle = c[2] === '#f2d21b' ? '#111' : '#fff'; g.font = '800 ' + Math.round(s * 0.22) + 'px ' + FONT_D; g.textAlign = 'center'; g.fillText(String(c[3]), x, y + 2); g.textAlign = 'left'; }
      });
    }
    var texSepDecal = canvasTex(1024, 384, drawSepDecal, { text: true });

    // Atlas de letreros: [id, x, y, w, h] en px dentro de 2048×1024
    var SIGNS = {
      peligro: [0, 0, 512, 360], amargo: [512, 0, 512, 360], epp: [1024, 0, 512, 360], fumar: [1536, 0, 512, 360],
      reunion: [0, 360, 512, 512], bateria: [512, 360, 768, 256], velocidad: [1280, 360, 384, 512], rtu: [1664, 360, 384, 256],
      livery: [0, 1024 - 152, 2048, 152]
    };
    function drawSigns(g, w, h) {
      g.clearRect(0, 0, w, h);
      function panel(r, bg) { g.fillStyle = bg; g.fillRect(r[0], r[1], r[2], r[3]); }
      function text(str, x, y, px, col, weight, align) { g.fillStyle = col; g.font = (weight || 800) + ' ' + px + 'px ' + FONT_D; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillText(str, x, y); }
      var r = SIGNS.peligro;
      panel(r, '#ffffff'); g.fillStyle = '#d0202a'; g.fillRect(r[0] + 14, r[1] + 14, r[2] - 28, 120);
      g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(r[0] + 6, r[1] + 6, r[2] - 12, r[3] - 12);
      text('PELIGRO', r[0] + r[2] / 2, r[1] + 76, 96, '#fff');
      text('ÁREA DE AFORO', r[0] + r[2] / 2, r[1] + 190, 66, '#111');
      text('SOLO PERSONAL AUTORIZADO', r[0] + r[2] / 2, r[1] + 270, 44, '#111', 700);
      r = SIGNS.amargo;
      panel(r, '#f6c400'); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(r[0] + 8, r[1] + 8, r[2] - 16, r[3] - 16);
      g.beginPath(); g.moveTo(r[0] + 90, r[1] + 50); g.lineTo(r[0] + 150, r[1] + 160); g.lineTo(r[0] + 30, r[1] + 160); g.closePath(); g.fillStyle = '#111'; g.fill();
      text('!', r[0] + 90, r[1] + 120, 70, '#f6c400');
      text('PRECAUCIÓN', r[0] + 330, r[1] + 105, 74, '#111');
      text('HIDROCARBURO AMARGO', r[0] + r[2] / 2, r[1] + 225, 52, '#111');
      text('PRESENCIA DE H₂S', r[0] + r[2] / 2, r[1] + 290, 46, '#111', 700);
      r = SIGNS.epp;
      panel(r, '#1d5fb8'); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(r[0] + 10, r[1] + 10, r[2] - 20, r[3] - 20);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(r[0] + 110, r[1] + 120, 70, 0, TAU); g.fill();
      g.fillStyle = '#1d5fb8'; g.beginPath(); g.ellipse(r[0] + 110, r[1] + 128, 50, 36, 0, PI, TAU); g.fill(); g.fillRect(r[0] + 50, r[1] + 126, 120, 12);
      text('USO', r[0] + 340, r[1] + 80, 64, '#fff'); text('OBLIGATORIO', r[0] + 340, r[1] + 145, 58, '#fff');
      text('DE EPP', r[0] + r[2] / 2, r[1] + 270, 82, '#fff');
      r = SIGNS.fumar;
      panel(r, '#ffffff'); g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(r[0] + 6, r[1] + 6, r[2] - 12, r[3] - 12);
      g.strokeStyle = '#d0202a'; g.lineWidth = 22; g.beginPath(); g.arc(r[0] + r[2] / 2, r[1] + 135, 95, 0, TAU); g.stroke();
      g.fillStyle = '#111'; g.fillRect(r[0] + r[2] / 2 - 70, r[1] + 125, 120, 22); g.fillStyle = '#d0202a'; g.fillRect(r[0] + r[2] / 2 + 52, r[1] + 125, 18, 22);
      g.beginPath(); g.moveTo(r[0] + r[2] / 2 - 67, r[1] + 68); g.lineTo(r[0] + r[2] / 2 + 67, r[1] + 202); g.stroke();
      text('PROHIBIDO FUMAR', r[0] + r[2] / 2, r[1] + 300, 60, '#111');
      r = SIGNS.reunion;
      panel(r, '#139a4a'); g.strokeStyle = '#fff'; g.lineWidth = 12; g.strokeRect(r[0] + 14, r[1] + 14, r[2] - 28, r[3] - 28);
      var cx = r[0] + r[2] / 2, cy = r[1] + 200;
      g.fillStyle = '#fff';
      for (var k = 0; k < 4; k++) {
        g.save(); g.translate(cx, cy); g.rotate(k * PI / 2);
        g.beginPath(); g.moveTo(0, -28); g.lineTo(-30, -78); g.lineTo(-12, -78); g.lineTo(-12, -128); g.lineTo(12, -128); g.lineTo(12, -78); g.lineTo(30, -78); g.closePath(); g.fill();
        g.restore();
      }
      for (k = 0; k < 4; k++) { var an = PI / 4 + k * PI / 2; g.beginPath(); g.arc(cx + Math.cos(an) * 105, cy + Math.sin(an) * 105, 16, 0, TAU); g.fill(); }
      text('PUNTO DE', cx, r[1] + 380, 74, '#fff'); text('REUNIÓN', cx, r[1] + 450, 74, '#fff');
      r = SIGNS.bateria;
      panel(r, C.marino); g.fillStyle = C.amarillo; g.fillRect(r[0], r[1] + r[3] - 26, r[2], 26);
      text('A BATERÍA', r[0] + 300, r[1] + 92, 112, '#fff');
      text('LÍNEA DE PRODUCCIÓN', r[0] + 300, r[1] + 182, 48, C.celeste200, 700);
      g.fillStyle = C.amarillo; g.beginPath(); g.moveTo(r[0] + 590, r[1] + 70); g.lineTo(r[0] + 680, r[1] + 70); g.lineTo(r[0] + 680, r[1] + 30); g.lineTo(r[0] + 748, r[1] + 115); g.lineTo(r[0] + 680, r[1] + 200); g.lineTo(r[0] + 680, r[1] + 160); g.lineTo(r[0] + 590, r[1] + 160); g.closePath(); g.fill();
      r = SIGNS.velocidad;
      panel(r, '#ffffff'); g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(r[0] + 6, r[1] + 6, r[2] - 12, r[3] - 12);
      g.strokeStyle = '#d0202a'; g.lineWidth = 26; g.beginPath(); g.arc(r[0] + r[2] / 2, r[1] + 190, 130, 0, TAU); g.stroke();
      text('10', r[0] + r[2] / 2, r[1] + 182, 150, '#111');
      text('km/h', r[0] + r[2] / 2, r[1] + 268, 46, '#111', 700);
      text('VELOCIDAD', r[0] + r[2] / 2, r[1] + 395, 60, '#111'); text('MÁXIMA', r[0] + r[2] / 2, r[1] + 455, 60, '#111');
      r = SIGNS.rtu;
      panel(r, '#d9dde0'); text('MEDICIÓN', r[0] + r[2] / 2, r[1] + 80, 66, '#1a1a1a'); text('RTU · 24 VCD', r[0] + r[2] / 2, r[1] + 160, 48, '#1a1a1a', 700);
      r = SIGNS.livery;
      g.fillStyle = C.marino; g.fillRect(r[0], r[1] + 26, r[2], 100);
      g.fillStyle = C.amarillo; g.fillRect(r[0], r[1] + 6, r[2], 16);
      g.fillStyle = C.celeste; g.fillRect(r[0], r[1] + 128, r[2], 10);
      text(D.empresa.nombre.toUpperCase(), r[0] + 60, r[1] + 78, 76, '#fff', 800, 'left');
      text((D.empresa.servicio + ' · ' + D.empresa.servicioEs).toUpperCase(), r[0] + 680, r[1] + 80, 52, C.amarillo, 700, 'left');
      text('CASETA DE MEDICIÓN', r[0] + r[2] - 60, r[1] + 80, 52, '#fff', 700, 'right');
    }
    var texSigns = canvasTex(2048, 1024, drawSigns, { text: true });
    function signUV(id) { var r = SIGNS[id]; return [r[0] / 2048, 1 - (r[1] + r[3]) / 1024, (r[0] + r[2]) / 2048, 1 - r[1] / 1024]; }

    var texTape = canvasTex(512, 32, function (g, w, h) {
      g.fillStyle = COL.zona; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = '800 22px ' + FONT_D; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('PELIGRO', w * 0.25, h / 2 + 1); g.fillText('PELIGRO', w * 0.75, h / 2 + 1);
    }, { repeat: true, text: true });

    var texSock = canvasTex(256, 32, function (g, w, h) {
      for (var i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#ff5a14'; g.fillRect(i * w / 5, 0, w / 5, h); }
    });

    function chevronTex(fill) {
      return canvasTex(128, 128, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        g.beginPath(); g.moveTo(18, 14); g.lineTo(70, 14); g.lineTo(114, 64); g.lineTo(70, 114); g.lineTo(18, 114); g.lineTo(62, 64); g.closePath();
        g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(8,16,32,0.85)'; g.stroke();
        g.fillStyle = fill; g.fill();
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
      }, { aniso: 4 });
    }
    function ribbonTex(fill, arrow) {
      return canvasTex(256, 64, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        g.fillStyle = hexA(fill, 0.9); g.fillRect(0, 10, w, h - 20);
        g.fillStyle = 'rgba(8,16,32,0.55)'; g.fillRect(0, 6, w, 4); g.fillRect(0, h - 10, w, 4);
        g.fillStyle = arrow;
        for (var x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x + 14, 16); g.lineTo(x + 34, 16); g.lineTo(x + 50, 32); g.lineTo(x + 34, 48); g.lineTo(x + 14, 48); g.lineTo(x + 30, 32); g.closePath(); g.fill(); }
      }, { wrapS: true, aniso: 4 });
    }

    /* ---------------- materiales ---------------- */
    var MAT = {};
    function std(key, hex, rough, metal, extra) {
      var m = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(hex), roughness: rough, metalness: metal || 0 }, extra || {}));
      m.name = key; MAT[key] = m; return m;
    }
    function lam(key, hex, extra) { // Lambert: más barato para superficies mate grandes (piso, vegetación)
      var m = new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(hex) }, extra || {}));
      m.name = key; MAT[key] = m; return m;
    }
    function addDetail(m, tex, rep) { // multiplica un mapa de detalle de grava sobre el mapa base
      m.onBeforeCompile = function (sh) {
        sh.uniforms.tDetail = { value: tex };
        sh.uniforms.uDetailRep = { value: rep };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D tDetail; uniform vec2 uDetailRep;')
          .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= texture2D(tDetail, vMapUv * uDetailRep).rgb * 2.0;');
      };
      m.customProgramCacheKey = function () { return 'detail' + rep.x.toFixed(2); };
    }
    var detailRep = new THREE.Vector2(platW / 2, platD / 2);
    lam('ground', '#ffffff', { map: texPlat }); addDetail(MAT.ground, texGravel, detailRep);
    lam('talud', '#f4e6c6', { map: texGravel });
    texGravel.repeat.set(1, 1);
    lam('grass', '#ffffff', { map: texGrass, vertexColors: true });
    std('concrete', '#b9b3a6', 0.92, 0);
    std('pit', '#3a332b', 1, 0);
    std('treeGreen', '#4d7d5b', 0.5, 0.25);
    std('treeGray', '#7c8288', 0.55, 0.3);
    std('steelDark', '#2e3134', 0.55, 0.55);
    std('galv', '#a3a8ab', 0.42, 0.75);
    std('grating', '#ffffff', 0.7, 0.45, { map: texGrating });
    std('railYellow', '#f2b51c', 0.5, 0.1);
    std('pipeGreen', '#2f4c3c', 0.48, 0.25);
    std('lineBlack', '#2a2d2f', 0.6, 0.3);
    std('flange', COL.brida, 0.5, 0.2);
    std('trailer', COL.remolque, 0.55, 0.15);
    std('tire', '#1c1c1c', 0.92, 0);
    std('rim', '#ecece6', 0.4, 0.3);
    std('psv', COL.psv, 0.45, 0.2);
    std('ehBlue', COL.cabezalEH, 0.35, 0.25);
    std('ehBody', '#b8bdc1', 0.35, 0.8);
    std('ehGlass', '#203a52', 0.1, 0.5);
    std('stainless', '#c9cdd0', 0.25, 0.95);
    std('black', '#151515', 0.85, 0);
    std('white', '#f1f1ec', 0.55, 0.05);
    std('camperTrim', '#9aa0a6', 0.45, 0.5);
    std('glass', '#243444', 0.08, 0.7);
    std('umbrella', '#2f5a45', 0.85, 0, { side: THREE.DoubleSide });
    std('cone', '#ff5b1a', 0.5, 0, { emissive: new THREE.Color('#ff5b1a'), emissiveIntensity: 0.08 });
    std('reflWhite', '#f5f5f5', 0.3, 0.1);
    std('tape', '#ffffff', 0.6, 0, { map: texTape, side: THREE.DoubleSide });
    std('actuator', '#3d5f4b', 0.45, 0.2);
    std('gaugeFace', '#f7f7f2', 0.3, 0);
    lam('palmTrunk', '#ffffff', { map: texTrunk });
    lam('palmFrond', '#4f7a37', { alphaMap: texFrond, alphaTest: 0.45, side: THREE.DoubleSide });
    lam('bush', '#ffffff', { map: texLeaf });
    std('sphereWhite', '#e7e9e6', 0.5, 0.2);
    std('signs', '#ffffff', 0.55, 0, { map: texSigns });
    std('steelInt', '#9ea3a7', 0.45, 0.7);
    std('meshPad', '#ffffff', 0.6, 0.6, { map: texMesh });
    std('choke', '#596069', 0.45, 0.6);
    texMesh.repeat.set(14, 14);

    // Corte del separador: planos locales que se transforman al mundo en cada cuadro
    var sepM = new THREE.Matrix4().compose(new V3(MP.separador.x, 0, MP.separador.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -(MP.separador.rot || 0) * PI / 180, 0)), new V3(1, 1, 1));
    var clipZ = new THREE.Plane(new V3(0, 0, -1), 0), clipX = new THREE.Plane(new V3(1, 0, 0), 1e5);
    var clipCapX = new THREE.Plane(new V3(-1, 0, 0), -1e5), clipLevel = new THREE.Plane(new V3(0, -1, 0), 1.9);
    var CLIP_SEP = [clipZ, clipX];
    std('vesselOut', COL.recipiente, 0.4, 0.22, { clippingPlanes: CLIP_SEP, clipIntersection: true, side: THREE.FrontSide });
    std('vesselIn', '#8a8478', 0.85, 0.05, { clippingPlanes: CLIP_SEP, clipIntersection: true, side: THREE.BackSide, emissive: new THREE.Color('#4a453b'), emissiveIntensity: 0.55 });
    std('decal', '#ffffff', 0.45, 0.1, { map: texSepDecal, transparent: true, clippingPlanes: CLIP_SEP, clipIntersection: true, polygonOffset: true, polygonOffsetFactor: -2 });
    std('darkClip', '#2e3134', 0.55, 0.55, { clippingPlanes: CLIP_SEP, clipIntersection: true });
    std('section', '#ffffff', 0.4, 0.4, { map: texHatch, clippingPlanes: [clipCapX], side: THREE.DoubleSide, emissive: new THREE.Color('#3a3326'), emissiveIntensity: 0.4 });
    std('sectionFront', '#ffffff', 0.4, 0.4, { map: texHatch, side: THREE.DoubleSide, emissive: new THREE.Color('#3a3326'), emissiveIntensity: 0.4 });
    texHatch.repeat.set(9, 9);
    /* Líquido separado (aceite + agua) en el corte: NEGRO (colores.liquido). El ámbar
       (colores.liquidoAmbar) es solo brillo/reflejo: una línea de menisco en la cara de corte
       que se desvanece hacia abajo y los reflejos de la superficie. Café = solo el chorro de mezcla. */
    var liqU = { level: { value: 1.95 }, amber: { value: new THREE.Color(COL.ambar) }, t: { value: 0 } };
    std('liqBody', new THREE.Color(COL.liquido).multiplyScalar(0.45), 0.2, 0.15, { side: THREE.DoubleSide, clippingPlanes: [clipLevel] });
    std('liqFace', COL.liquido, 0.3, 0.1, { side: THREE.DoubleSide, clippingPlanes: [clipLevel], transparent: true, opacity: 0.92, depthWrite: false });
    std('liqTop', new THREE.Color(COL.liquido).multiplyScalar(0.3), 0.1, 0.2, { side: THREE.DoubleSide });
    MAT.liqFace.onBeforeCompile = function (sh) {
      sh.uniforms.uLevel = liqU.level; sh.uniforms.uAmber = liqU.amber;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY; uniform float uLevel; uniform vec3 uAmber;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float dL = max(uLevel - vWY, 0.0); totalEmissiveRadiance += uAmber * (0.5 * exp(-dL / 0.01) + 0.022 * exp(-dL / 0.05));');
    };
    MAT.liqFace.customProgramCacheKey = function () { return 'liqFaceMenisco'; };
    MAT.liqTop.onBeforeCompile = function (sh) {
      // superficie negra con destellos ámbar que se desplazan (ondas); coordenadas locales del remolque y t → determinista
      sh.uniforms.uAmber = liqU.amber; sh.uniforms.uT = liqU.t;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = transformed.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uAmber; uniform float uT; varying vec2 vLP;')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n float gl1 = 0.5 + 0.5 * sin(vLP.x * 19.0 - uT * 1.2 + 2.2 * sin(vLP.x * 4.7 + uT * 0.5 + vLP.y * 11.0));\n'
          + ' float glint = 0.12 + 2.4 * pow(gl1, 6.0);\n reflectedLight.indirectSpecular *= uAmber * glint; reflectedLight.directSpecular *= uAmber * 1.3;');
    };
    MAT.liqTop.customProgramCacheKey = function () { return 'liqTopAmbar'; };
    ['ground', 'grass', 'talud', 'tape', 'liqTop', 'liqFace', 'liqBody', 'decal', 'section', 'sectionFront'].forEach(function (k) { MAT[k].userData.noCast = true; });

    // Materiales "rayos X" (fantasma) para tuberías
    var GHOST = {};
    ['pipeGreen', 'lineBlack', 'flange', 'steelDark', 'galv'].forEach(function (k) {
      var g = MAT[k].clone(); g.transparent = true; g.opacity = 0.2; g.depthWrite = false; g.name = k + 'Ghost'; GHOST[k] = g;
    });
    var rimMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uI: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 2.2); gl_FragColor = vec4(uColor * (0.12 + 1.35 * f) * uI, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    var hullMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(C.amarillo) }, uO: { value: 0.9 }, uT: { value: 0.03 } },
      vertexShader: 'uniform float uT; void main(){ vec3 p = position + normalize(normal) * uT; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uO; void main(){ gl_FragColor = vec4(uColor, uO); }',
      side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false
    });
    var glowMat = rimMat.clone(); glowMat.uniforms.uColor.value = new THREE.Color(C.amarillo);

    /* ---------------- Builder: fusiona geometría por material ---------------- */
    var ID = {};       // id → [meshes] (para resaltar)
    var STREAM = { mezcla: [], gas: [], liquido: [], salida: [] };
    var root = new THREE.Group(); scene.add(root);
    var layers = { zona: new THREE.Group(), cinta: new THREE.Group(), acceso: new THREE.Group(), cotas: new THREE.Group(), entorno: new THREE.Group(), lineas: new THREE.Group(), interior: new THREE.Group() };
    Object.keys(layers).forEach(function (k) { root.add(layers[k]); });

    function Builder(base) { this.map = {}; this.base = base || null; }
    Builder.prototype.add = function (key, g, m) {
      if (!MAT[key]) throw new Error('material ' + key);
      if (m) g.applyMatrix4(m);
      if (this.base) g.applyMatrix4(this.base);
      (this.map[key] || (this.map[key] = [])).push(prep(g));
      return g;
    };
    Builder.prototype.flush = function (id, parent, o) {
      o = o || {}; var out = [];
      for (var key in this.map) {
        var list = this.map[key]; if (!list.length) continue;
        var g = list.length === 1 ? list[0] : THREE.mergeGeometries(list, false);
        if (list.length > 1) list.forEach(function (x) { x.dispose(); });
        g.computeBoundingSphere();
        var mesh = new THREE.Mesh(g, MAT[key]);
        mesh.castShadow = o.cast !== false && !MAT[key].userData.noCast;
        mesh.receiveShadow = o.receive !== false;
        mesh.userData.matKey = key;
        mesh.matrixAutoUpdate = false;
        (parent || root).add(mesh); out.push(mesh);
        if (id) (ID[id] || (ID[id] = [])).push(mesh);
        if (o.stream) STREAM[o.stream].push(mesh);
      }
      this.map = {};
      return out;
    };

    function L2W(x, y, z) { return new V3(x, y, z).applyMatrix4(sepM); }

    /* ---------- piezas reutilizables ---------- */
    function flangePair(b, key, c, dir, rp, o) {
      o = o || {};
      var rf = rp * (o.k || 2.3), th = o.th || 0.045, n = o.bolts || 8;
      var d = dir.clone().normalize();
      b.add(key, orient(gCyl(rf, rf, th, 20), c.clone().addScaledVector(d, -(th / 2 + 0.003)), d));
      b.add(key, orient(gCyl(rf, rf, th, 20), c.clone().addScaledVector(d, th / 2 + 0.003), d));
      var g = gCyl(rp * 1.25, rp * 1.25, th * 2 + 0.07, 16); b.add(key, orient(g, c.clone(), d));
      if (o.boltKey !== false) {
        var bolts = [], rb = (rf + rp) / 2 * 1.06;
        for (var i = 0; i < n; i++) { var a = (i + 0.5) / n * TAU; var bg = gCyl(0.011, 0.011, th * 2 + 0.06, 6); bg.translate(Math.cos(a) * rb, 0, Math.sin(a) * rb); bolts.push(bg); }
        var bm = THREE.mergeGeometries(bolts.map(prep)); b.add(o.boltKey || 'steelDark', orient(bm, c.clone(), d));
      }
    }
    function blindFlange(b, key, c, dir, rp) {
      var d = dir.clone().normalize(), rf = rp * 2.3;
      b.add(key, orient(gCyl(rf, rf, 0.05, 20), c.clone(), d));
      var bolts = [];
      for (var i = 0; i < 8; i++) { var a = (i + 0.5) / 8 * TAU; var bg = gCyl(0.011, 0.011, 0.09, 6); bg.translate(Math.cos(a) * (rf + rp) / 2, 0, Math.sin(a) * (rf + rp) / 2); bolts.push(bg); }
      b.add('steelDark', orient(THREE.mergeGeometries(bolts.map(prep)), c.clone(), d));
    }
    function hammerUnion(b, c, dir, rp) {
      var d = dir.clone().normalize();
      b.add('steelDark', orient(gCyl(rp * 1.6, rp * 1.6, 0.11, 14), c.clone(), d));
      b.add('steelDark', orient(gCyl(rp * 1.3, rp * 1.3, 0.2, 14), c.clone(), d));
      for (var i = 0; i < 3; i++) {
        var a = i / 3 * TAU, lug = gBox(0.035, 0.08, 0.05);
        lug.translate(Math.cos(a) * rp * 1.85, 0, Math.sin(a) * rp * 1.85);
        b.add('steelDark', orient(lug, c.clone(), d));
      }
    }
    function handwheel(b, key, c, axis, R) {
      // volante en el plano perpendicular a axis
      var parts = [];
      parts.push(new THREE.TorusGeometry(R, R * 0.09, 6, 22));
      for (var i = 0; i < 3; i++) { var s = gBox(R * 2 * 0.95, R * 0.1, R * 0.08); s.rotateZ(i * PI / 3); parts.push(s); }
      parts.push(gCyl(R * 0.22, R * 0.22, R * 0.3, 10).rotateX(PI / 2));
      var g = THREE.mergeGeometries(parts.map(prep));
      // el toro está en XY (eje z); llevar eje z → axis
      _q.setFromUnitVectors(new V3(0, 0, 1), axis.clone().normalize());
      g.applyQuaternion(_q); g.translate(c.x, c.y, c.z);
      b.add(key, g);
    }
    function gateValve(b, key, c, dir, rp, stemDir, o) {
      o = o || {};
      var d = dir.clone().normalize(), s = (stemDir || new V3(0, 1, 0)).clone().normalize();
      var body = gBox(rp * 4.2, rp * 4.6, rp * 4.2, rp * 0.6);
      _q.setFromUnitVectors(_Y, d); body.applyQuaternion(_q); body.translate(c.x, c.y, c.z); b.add(key, body);
      flangePair(b, o.flangeKey || key, c.clone().addScaledVector(d, -rp * 2.5), d, rp, { bolts: 8 });
      flangePair(b, o.flangeKey || key, c.clone().addScaledVector(d, rp * 2.5), d, rp, { bolts: 8 });
      var bon0 = c.clone().addScaledVector(s, rp * 1.8), bon1 = c.clone().addScaledVector(s, rp * 5.2);
      b.add(key, gCylAB(bon0, bon1, rp * 1.05, 14));
      b.add(key, orient(gCyl(rp * 1.7, rp * 1.7, rp * 0.5, 14), c.clone().addScaledVector(s, rp * 2.2), s));
      var stem1 = c.clone().addScaledVector(s, rp * (o.stem || 7.2));
      b.add('galv', gCylAB(bon1, stem1, rp * 0.22, 6));
      handwheel(b, o.wheelKey || key, c.clone().addScaledVector(s, rp * (o.wheelAt || 6.2)), s, rp * (o.wheelR || 2.4));
    }
    function controlValve(b, c, dir, rp, up, sideSign) { // sideSign = -1 pasa el posicionador al otro costado
      var d = dir.clone().normalize(), u = (up || new V3(0, 1, 0)).clone().normalize();
      b.add('pipeGreen', orient(new THREE.SphereGeometry(rp * 1.9, 16, 12), c.clone(), d));
      flangePair(b, 'flange', c.clone().addScaledVector(d, -rp * 2.4), d, rp);
      flangePair(b, 'flange', c.clone().addScaledVector(d, rp * 2.4), d, rp);
      b.add('pipeGreen', gCylAB(c.clone().addScaledVector(u, rp * 1.5), c.clone().addScaledVector(u, rp * 3.2), rp * 1.1, 12));
      b.add('flange', orient(gCyl(rp * 1.9, rp * 1.9, 0.03, 16), c.clone().addScaledVector(u, rp * 3.2), u));
      // yugo
      var side = new V3().crossVectors(d, u).normalize().multiplyScalar(sideSign || 1);
      [-1, 1].forEach(function (k) {
        b.add('galv', gCylAB(c.clone().addScaledVector(u, rp * 3.2).addScaledVector(d, k * rp * 0.9), c.clone().addScaledVector(u, rp * 5.6).addScaledVector(d, k * rp * 0.9), rp * 0.18, 6));
      });
      b.add('galv', gCylAB(c.clone().addScaledVector(u, rp * 3.2), c.clone().addScaledVector(u, rp * 5.8), rp * 0.12, 6));
      // actuador de diafragma (domo)
      var dome = new THREE.SphereGeometry(rp * 2.5, 20, 10, 0, TAU, 0, PI / 2); dome.scale(1, 0.55, 1);
      var bot = new THREE.SphereGeometry(rp * 2.5, 20, 10, 0, TAU, PI / 2, PI / 2); bot.scale(1, 0.32, 1);
      var ring = gCyl(rp * 2.9, rp * 2.9, rp * 0.3, 24);
      var ac = c.clone().addScaledVector(u, rp * 6.3);
      [dome, bot, ring].forEach(function (g) { orient(g, ac, u); b.add('actuator', g); });
      // tornillería de la brida de la carcasa y tapón del domo (se lee como actuador aun visto de frente)
      var abolts = [];
      for (var i = 0; i < 14; i++) { var an = (i + 0.5) / 14 * TAU, bt = gCyl(rp * 0.13, rp * 0.13, rp * 0.62, 6); bt.translate(Math.cos(an) * rp * 2.7, 0, Math.sin(an) * rp * 2.7); abolts.push(prep(bt)); }
      b.add('galv', orient(THREE.mergeGeometries(abolts), ac, u));
      b.add('galv', orient(gCyl(rp * 0.38, rp * 0.38, rp * 0.3, 12), ac.clone().addScaledVector(u, rp * 2.5 * 0.55 + rp * 0.1), u));
      // posicionador
      var pos = gBox(rp * 1.6, rp * 1.8, rp * 1.2, rp * 0.2);
      pos.translate(0, 0, 0); orient(pos, c.clone().addScaledVector(u, rp * 4.4).addScaledVector(side, rp * 1.4), u); b.add('ehBody', pos);
      var cap = gCyl(rp * 0.6, rp * 0.6, rp * 0.4, 12); orient(cap, c.clone().addScaledVector(u, rp * 4.4).addScaledVector(side, rp * 2.25), side); b.add('ehBlue', cap);
    }
    /* Transmisor E+H (carcasa con tapas azules) sobre una conexión que apunta a 'up' */
    function transmitter(b, base, up, o) {
      o = o || {}; var u = (up || new V3(0, 1, 0)).clone().normalize();
      var face = (o.face || new V3(0, 0, 1)).clone(); face.addScaledVector(u, -face.dot(u)).normalize();
      var k = o.k || 1;
      var p0 = base.clone(), p1 = base.clone().addScaledVector(u, 0.07 * k);
      b.add('stainless', gCylAB(p0, p1, 0.014 * k, 8));
      var blk = gBox(0.055 * k, 0.045 * k, 0.055 * k, 0.006 * k); orient(blk, base.clone().addScaledVector(u, 0.085 * k), u); b.add('stainless', blk);
      var hc = base.clone().addScaledVector(u, 0.165 * k);
      b.add('ehBody', orient(gCyl(0.058 * k, 0.058 * k, 0.085 * k, 18), hc.clone(), face));
      b.add('ehBlue', orient(gCyl(0.06 * k, 0.06 * k, 0.03 * k, 18), hc.clone().addScaledVector(face, 0.055 * k), face));
      b.add('ehBlue', orient(gCyl(0.06 * k, 0.06 * k, 0.03 * k, 18), hc.clone().addScaledVector(face, -0.055 * k), face));
      b.add('ehGlass', orient(gCyl(0.036 * k, 0.036 * k, 0.006 * k, 16), hc.clone().addScaledVector(face, 0.072 * k), face));
      var side = new V3().crossVectors(u, face).normalize();
      b.add('black', gCylAB(hc.clone().addScaledVector(side, 0.05 * k), hc.clone().addScaledVector(side, 0.085 * k), 0.012 * k, 8));
      return hc;
    }
    function gauge(b, c, face, stemFrom) {
      if (stemFrom) b.add('stainless', gCylAB(stemFrom, c, 0.012, 6));
      var f = face.clone().normalize();
      b.add('galv', orient(gCyl(0.065, 0.065, 0.035, 20), c.clone(), f));
      b.add('gaugeFace', orient(gCyl(0.055, 0.055, 0.004, 20), c.clone().addScaledVector(f, 0.019), f));
      var needle = gBox(0.006, 0.045, 0.003); needle.rotateZ(-0.6); needle.translate(0.012, 0.012, 0);
      _q.setFromUnitVectors(new V3(0, 0, 1), f); needle.applyQuaternion(_q); needle.translate(c.x + f.x * 0.022, c.y + f.y * 0.022, c.z + f.z * 0.022);
      b.add('black', needle);
    }
    function pipeRoute(b, key, rt, rp, o) {
      o = o || {}; var seg = Math.max(8, Math.round((o.seg || 16) * Q.seg));
      rt.segs.forEach(function (s) {
        if (s.type === 'line') { if (s.a.distanceTo(s.b) > 1e-4) b.add(key, gCylAB(s.a, s.b, rp, seg, true)); }
        else b.add(key, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(s.a, s.c, s.b), 8, rp, seg, false));
      });
    }
    /* Uniones de golpe y burros a lo largo de tramos rectos al ras de piso */
    function lineDressing(b, rt, rp, o) {
      o = o || {};
      rt.segs.forEach(function (s) {
        if (s.type !== 'line') return;
        var d = new V3().subVectors(s.b, s.a), L = d.length(); if (L < 1.2) return;
        d.normalize();
        var horizontal = Math.abs(d.y) < 0.05, low = s.a.y < 0.6 && s.b.y < 0.6;
        if (o.unions !== false && L > 4) {
          for (var x = 3.05; x < L - 1.0; x += 6.1) hammerUnion(b, s.a.clone().addScaledVector(d, x), d, rp);
        }
        if (horizontal && low && o.supports !== false) {
          for (var y = 1.3; y < L - 0.6; y += 3.0) {
            var p = s.a.clone().addScaledVector(d, y), side = new V3(-d.z, 0, d.x);
            if (o.sleepers) { var sl = gBox(0.25, p.y - rp, 0.5, 0.02); sl.rotateY(Math.atan2(d.x, d.z)); sl.translate(p.x, (p.y - rp) / 2, p.z); b.add('concrete', sl); continue; }
            var top = p.y - rp - 0.005;
            [-1, 1].forEach(function (k) { b.add('steelDark', gCylAB(new V3(p.x + side.x * 0.28 * k, 0, p.z + side.z * 0.28 * k), new V3(p.x, top - 0.02, p.z), 0.016, 6)); });
            var cr = gBox(0.08, 0.04, 0.24); cr.rotateY(Math.atan2(d.x, d.z) + PI / 2); cr.rotateY(PI / 2); cr.translate(p.x, top - 0.02, p.z); b.add('steelDark', cr);
            var foot = gBox(0.62, 0.02, 0.1); foot.rotateY(-Math.atan2(side.z, side.x)); foot.translate(p.x, 0.01, p.z); b.add('steelDark', foot);
          }
        }
      });
    }

    /* =========================== TERRENO =========================== */
    (function buildGround() {
      var b = new Builder();
      // plataforma con huecos de contrapozos
      var sh = new THREE.Shape();
      sh.moveTo(PL.x0, -PL.z1); sh.lineTo(PL.x1, -PL.z1); sh.lineTo(PL.x1, -PL.z0); sh.lineTo(PL.x0, -PL.z0); sh.closePath();
      MP.pozos.forEach(function (p) {
        var a = p.enPrueba ? 1.3 : 1.1, hole = new THREE.Path();
        hole.moveTo(p.x - a, -(p.z + a)); hole.lineTo(p.x - a, -(p.z - a)); hole.lineTo(p.x + a, -(p.z - a)); hole.lineTo(p.x + a, -(p.z + a)); hole.closePath();
        sh.holes.push(hole);
      });
      var g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2);
      var pos = g.attributes.position, uv = g.attributes.uv;
      for (var i = 0; i < pos.count; i++) { uv.setXY(i, (pos.getX(i) - PL.x0) / platW, 1 - (pos.getZ(i) - PL.z0) / platD); }
      var gm = new THREE.Mesh(g, MAT.ground); gm.receiveShadow = true; root.add(gm); ID.plataforma = [gm];
      // talud perimetral
      var e = 1.4, hT = -0.32, inr = [[PL.x0, PL.z0], [PL.x1, PL.z0], [PL.x1, PL.z1], [PL.x0, PL.z1]], out = [[PL.x0 - e, PL.z0 - e], [PL.x1 + e, PL.z0 - e], [PL.x1 + e, PL.z1 + e], [PL.x0 - e, PL.z1 + e]];
      var tp = [], tuv = [];
      for (i = 0; i < 4; i++) {
        var j = (i + 1) % 4, A = inr[i], B = inr[j], A2 = out[i], B2 = out[j];
        [[A, 0], [A2, hT], [B2, hT], [A, 0], [B2, hT], [B, 0]].forEach(function (v) { tp.push(v[0][0], v[1], v[0][1]); tuv.push(v[0][0] / 2, v[0][1] / 2); });
      }
      var tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2)); tg.computeVertexNormals();
      var tm = new THREE.Mesh(tg, MAT.talud); tm.receiveShadow = true; root.add(tm);
      MAT.talud.side = THREE.DoubleSide;
      // terreno exterior con variación de color (sin repetir el patrón)
      var gg = new THREE.PlaneGeometry(2600, 2600, 80, 80); gg.rotateX(-PI / 2); gg.translate(5, hT - 0.02, 0);
      var cols = new Float32Array(gg.attributes.position.count * 3), gp = gg.attributes.position, r2 = U.rng(21);
      var ph = [r2() * 10, r2() * 10, r2() * 10, r2() * 10];
      for (i = 0; i < gp.count; i++) {
        var x = gp.getX(i), z = gp.getZ(i);
        var n = 0.5 + 0.22 * Math.sin(x * 0.021 + ph[0]) * Math.cos(z * 0.017 + ph[1]) + 0.14 * Math.sin(x * 0.067 + z * 0.043 + ph[2]) + 0.08 * Math.cos(z * 0.11 - x * 0.05 + ph[3]);
        cols[i * 3] = 0.66 + n * 0.34; cols[i * 3 + 1] = 0.7 + n * 0.26; cols[i * 3 + 2] = 0.6 + n * 0.2;
      }
      gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      for (i = 0; i < gp.count; i++) { // hundir el pasto bajo la pera para que no se vea dentro de los contrapozos
        if (gp.getX(i) > PL.x0 + 0.5 && gp.getX(i) < PL.x1 - 0.5 && gp.getZ(i) > PL.z0 + 0.5 && gp.getZ(i) < PL.z1 - 0.5) gp.setY(i, -4);
      }
      texGrass.repeat.set(2600 / 5, 2600 / 5);
      var gmesh = new THREE.Mesh(gg, MAT.grass); gmesh.receiveShadow = true; root.add(gmesh);
      // contrapozos (paredes, piso y brocal de concreto)
      MP.pozos.forEach(function (p) {
        var a = p.enPrueba ? 1.3 : 1.1, dpt = p.enPrueba ? 1.3 : 1.1;
        b.add('pit', gBox(a * 2, 0.06, a * 2), mat(p.x, -dpt, p.z));
        [[0, -a], [0, a], [-a, 0], [a, 0]].forEach(function (o, k) {
          var wv = k < 2 ? gBox(a * 2, dpt, 0.12) : gBox(0.12, dpt, a * 2);
          b.add('concrete', wv, mat(p.x + o[0] * 1.0 + (k === 2 ? 0.06 : k === 3 ? -0.06 : 0), -dpt / 2, p.z + o[1] + (k === 0 ? 0.06 : k === 1 ? -0.06 : 0)));
          var rim = k < 2 ? gBox(a * 2 + 0.4, 0.1, 0.2, 0.02) : gBox(0.2, 0.1, a * 2 + 0.4, 0.02);
          b.add('concrete', rim, mat(p.x + o[0] + (k === 2 ? -0.1 : k === 3 ? 0.1 : 0), 0.04, p.z + o[1] + (k === 0 ? -0.1 : k === 1 ? 0.1 : 0)));
        });
      });
      b.flush('contrapozos');
    })();

    /* =========================== ÁRBOLES DE VÁLVULAS =========================== */
    function buildTree(b, x, z, active) {
      var K = active ? 'treeGreen' : 'treeGray', KF = active ? 'flange' : 'treeGray';
      function spool(y0, y1, r, rf) {
        b.add(K, gCyl(r, r, y1 - y0, 20), mat(x, (y0 + y1) / 2, z));
        b.add(K, gCyl(rf, rf, 0.07, 22), mat(x, y0 + 0.035, z));
        b.add(K, gCyl(rf, rf, 0.07, 22), mat(x, y1 - 0.035, z));
        var bolts = [];
        [y0 + 0.035, y1 - 0.035].forEach(function (yy) { for (var i = 0; i < 12; i++) { var a = i / 12 * TAU; var g = gCyl(0.016, 0.016, 0.12, 6); g.translate(x + Math.cos(a) * (rf - 0.045), yy, z + Math.sin(a) * (rf - 0.045)); bolts.push(prep(g)); } });
        b.add('steelDark', THREE.mergeGeometries(bolts));
      }
      function valveV(yc, wheel, s) { // válvula de compuerta en línea vertical, volante al sur
        s = s || 1;
        b.add(K, gBox(0.3 * s, 0.34 * s, 0.3 * s, 0.03), mat(x, yc, z));
        b.add(K, gCyl(0.19 * s, 0.19 * s, 0.05, 20), mat(x, yc - 0.19 * s, z));
        b.add(K, gCyl(0.19 * s, 0.19 * s, 0.05, 20), mat(x, yc + 0.19 * s, z));
        b.add(K, gCylAB(new V3(x, yc, z + 0.14 * s), new V3(x, yc, z + 0.32 * s), 0.065 * s, 12));
        b.add('galv', gCylAB(new V3(x, yc, z + 0.32 * s), new V3(x, yc, z + 0.46 * s), 0.014, 6));
        if (wheel) handwheel(b, active ? 'black' : 'treeGray', new V3(x, yc, z + 0.42 * s), new V3(0, 0, 1), 0.17 * s);
      }
      function sideValve(yc, dir, len, blind, key) {
        var d = new V3(dir, 0, 0), c = new V3(x + dir * (len * 0.5 + 0.2), yc, z);
        b.add(K, gCylAB(new V3(x + dir * 0.15, yc, z), new V3(x + dir * (len + 0.2), yc, z), 0.055, 12));
        gateValve(b, key || K, c, d, 0.05, new V3(0, 0, 1), { flangeKey: KF, wheelKey: active ? 'black' : 'treeGray', wheelR: 2.6, wheelAt: 5.5, stem: 6 });
        if (blind) blindFlange(b, KF, new V3(x + dir * (len + 0.22), yc, z), d, 0.05);
      }
      var s = active ? 1 : 0.9;
      // cabezal TR (en el contrapozo) y cabezal de producción
      spool(-1.15 * s, -0.6 * s, 0.3, 0.37);
      sideValve(-0.86 * s, 1, 0.42, true, active ? 'flange' : K); sideValve(-0.86 * s, -1, 0.42, true, active ? 'flange' : K);
      spool(-0.55 * s, -0.05 * s, 0.24, 0.32);
      sideValve(-0.3 * s, 1, 0.36, true, active ? 'flange' : K); sideValve(-0.3 * s, -1, 0.36, true, active ? 'flange' : K);
      b.add(K, gCyl(0.2, 0.22, 0.14, 20), mat(x, 0.02, z));
      valveV(0.33 * s, true, s);          // maestra inferior
      valveV(0.8 * s, true, s);           // maestra superior
      // cruz
      var yc = 1.25 * s;
      b.add(K, gBox(0.28, 0.3, 0.28, 0.03), mat(x, yc, z));
      b.add(K, gCyl(0.17, 0.17, 0.05, 18), mat(x, yc - 0.17, z));
      b.add(K, gCyl(0.17, 0.17, 0.05, 18), mat(x, yc + 0.17, z));
      [-1, 1].forEach(function (dir) {
        b.add(K, gCylAB(new V3(x + dir * 0.14, yc, z), new V3(x + dir * 0.3, yc, z), 0.065, 14));
        flangePair(b, KF, new V3(x + dir * 0.3, yc, z), new V3(dir, 0, 0), 0.06, { k: 2.3 });
      });
      // válvulas laterales (TP): este = producción, oeste = cerrada con brida ciega
      gateValve(b, K, new V3(x + 0.55, yc, z), new V3(1, 0, 0), 0.058, new V3(0, 0, 1), { flangeKey: KF, wheelKey: active ? 'black' : 'treeGray', wheelR: 2.6 });
      gateValve(b, K, new V3(x - 0.55, yc, z), new V3(-1, 0, 0), 0.058, new V3(0, 0, 1), { flangeKey: KF, wheelKey: active ? 'black' : 'treeGray', wheelR: 2.6 });
      if (!active) { blindFlange(b, KF, new V3(x + 0.72, yc, z), new V3(1, 0, 0), 0.058); }
      blindFlange(b, KF, new V3(x - 0.72, yc, z), new V3(-1, 0, 0), 0.058);
      // válvula de sondeo + tapa + manómetro
      valveV(1.68 * s, true, 0.85 * s);
      b.add(K, gCyl(0.12, 0.15, 0.16, 18), mat(x, 1.98 * s, z));
      b.add(K, gCyl(0.16, 0.16, 0.04, 18), mat(x, 1.89 * s, z));
      gauge(b, new V3(x, 2.24 * s, z + 0.02), new V3(0, 0.25, 1), new V3(x, 2.06 * s, z));
    }

    (function buildWells() {
      var bA = new Builder(), bI = new Builder(), bP = new Builder();
      MP.pozos.forEach(function (p) {
        if (p.enPrueba) buildTree(bA, p.x, p.z, true);
        else {
          buildTree(bI, p.x, p.z, false);
          // barricada de tubo alrededor del contrapozo inactivo (foto 01)
          var a = 1.7;
          [[-a, -a], [a, -a], [a, a], [-a, a]].forEach(function (c) { bI.add('railYellow', gCyl(0.035, 0.035, 0.9, 8), mat(p.x + c[0], 0.45, p.z + c[1])); });
          [[[-a, -a], [a, -a]], [[a, -a], [a, a]], [[a, a], [-a, a]], [[-a, a], [-a, -a]]].forEach(function (s) {
            bI.add('railYellow', gCylAB(new V3(p.x + s[0][0], 0.85, p.z + s[0][1]), new V3(p.x + s[1][0], 0.85, p.z + s[1][1]), 0.03, 8));
            bI.add('railYellow', gCylAB(new V3(p.x + s[0][0], 0.45, p.z + s[0][1]), new V3(p.x + s[1][0], 0.45, p.z + s[1][1]), 0.025, 8));
          });
        }
      });
      bA.flush('arbol'); bI.flush('pozosInactivos');
      // plataforma de trabajo con barandal amarillo y escalera (foto 03)
      var p = MP.pozos[0], x = p.x, z = p.z, dk = 0.95, hx = 1.6, hz = 1.5, ho = 0.42;
      [[-hx, -hz, hx, -ho], [-hx, ho, hx, hz], [-hx, -ho, -ho, ho], [ho, -ho, hx, ho]].forEach(function (r) {
        var g = gBox(r[2] - r[0], 0.05, r[3] - r[1]);
        var uvA = g.attributes.uv; for (var i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * (r[2] - r[0]) * 4, uvA.getY(i) * (r[3] - r[1]) * 4);
        bP.add('grating', g, mat(x + (r[0] + r[2]) / 2, dk, z + (r[1] + r[3]) / 2));
      });
      texGrating.repeat.set(1, 1);
      // vigas perimetrales y postes
      [[-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [-hx, -hz, -hx, hz], [hx, -hz, hx, hz]].forEach(function (s) {
        bP.add('steelDark', gCylAB(new V3(x + s[0], dk - 0.09, z + s[1]), new V3(x + s[2], dk - 0.09, z + s[3]), 0.06, 4));
      });
      [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].forEach(function (c) { bP.add('steelDark', gBox(0.1, dk, 0.1), mat(x + c[0], dk / 2, z + c[1])); bP.add('steelDark', gBox(0.3, 0.02, 0.3), mat(x + c[0], 0.01, z + c[1])); });
      // barandal: postes y pasamanos
      var top = dk + 1.0, mid = dk + 0.52;
      function rail(a, bb) {
        bP.add('railYellow', gCylAB(new V3(x + a[0], top, z + a[1]), new V3(x + bb[0], top, z + bb[1]), 0.026, 8));
        bP.add('railYellow', gCylAB(new V3(x + a[0], mid, z + a[1]), new V3(x + bb[0], mid, z + bb[1]), 0.022, 8));
        bP.add('railYellow', gBox(Math.abs(bb[0] - a[0]) + 0.01, 0.1, Math.abs(bb[1] - a[1]) + 0.01), mat(x + (a[0] + bb[0]) / 2, dk + 0.08, z + (a[1] + bb[1]) / 2));
      }
      rail([-hx, -hz], [hx, -hz]); rail([-hx, -hz], [-hx, hz]); rail([hx, -hz], [hx, hz]);
      rail([-hx, hz], [0.15, hz]); rail([1.05, hz], [hx, hz]);
      [[-hx, -hz], [0, -hz], [hx, -hz], [-hx, 0], [hx, 0], [-hx, hz], [0.15, hz], [1.05, hz], [hx, hz]].forEach(function (c) { bP.add('railYellow', gCyl(0.028, 0.028, 1.0, 8), mat(x + c[0], dk + 0.5, z + c[1])); });
      // escalera hacia el sur
      var z0 = hz, z1 = hz + 1.3, nS = 5;
      [0.18, 1.02].forEach(function (sx) {
        bP.add('steelDark', gCylAB(new V3(x + sx, dk, z + z0), new V3(x + sx, 0.02, z + z1), 0.05, 4));
        bP.add('railYellow', gCylAB(new V3(x + sx, top, z + z0), new V3(x + sx, 0.95, z + z1), 0.024, 8));
        bP.add('railYellow', gCyl(0.026, 0.026, 0.95, 8), mat(x + sx, 0.475, z + z1));
      });
      for (var i = 1; i <= nS; i++) { var f = i / (nS + 1); bP.add('grating', gBox(0.82, 0.035, 0.24), mat(x + 0.6, lerp(dk, 0, f), z + lerp(z0, z1, f))); }
      bP.flush('plataformaArbol');
    })();

    /* =========================== RUTAS DE PROCESO =========================== */
    var RP = 0.058;           // radio de tubería de 4 in (DE 114 mm)
    var BEND = 0.2;
    var sp = MP.separador, mf = MP.manifold, pz = MP.pozos[0];
    var choke = new V3(pz.x + 2.15, 1.25, pz.z);
    var inEnd = L2W(-3.1, 0.35, -0.45);
    var diagA = new V3(inEnd.x - 1.5 - (inEnd.z - mf.z), 0.35, mf.z);
    var R_MEZCLA = [
      [pz.x, 0.3, pz.z], [pz.x, 1.25, pz.z], [choke.x, 1.25, choke.z], [choke.x, 0.35, choke.z],
      [mf.x - 0.7, 0.35, choke.z], [mf.x - 0.7, 0.35, mf.z - 0.8], [mf.x - 0.7, 0.62, mf.z - 0.8], [mf.x - 0.7, 0.62, mf.z],
      [mf.x + 1.3, 0.62, mf.z], [mf.x + 1.3, 0.35, mf.z], [diagA.x, 0.35, diagA.z], [inEnd.x - 1.5, 0.35, inEnd.z],
      inEnd, L2W(-3.1, 1.0, -0.45), L2W(-2.4, 1.0, -0.45), L2W(-2.4, 1.0, 0), L2W(-2.4, 2.05, 0), L2W(-1.98, 2.05, 0), L2W(-1.86, 2.05, 0)
    ];
    /* Patín del separador (coordenadas locales del remolque, x = eje largo):
       gas y líquido se miden bajo el recipiente (como en el FA-02 de la foto 05) y se
       reincorporan en el extremo oeste, junto a las conexiones de entrada/salida.
       Ambas corridas fluyen de este a oeste (de la boquilla hacia la te), así que en cada
       una el medidor queda al este (aguas arriba) y la válvula de control al oeste:
         líquido: boquilla inferior → Coriolis (xCor) → LV (xLV) → te
         gas:     boquilla superior → bajante (xGd) → placa + TDG (xOri) → PV (xPV) → te
       Cada válvula queda junto a su medidor: el par de gas en la mitad este y el de líquido en
       la oeste. La PV va en tramo horizontal bajo el recipiente, con el actuador hacia el sur (+z). */
    var SK = { yG: 1.36, zG: -0.17, yL: 0.98, zL: 0.18, xTe: -2.1, xGd: 1.25, xOri: 0.85, xPV: 0.1, xCor: -0.45, xLV: -1.2, xTDM: -2.52 };
    var R_GAS = [L2W(0.7, 2.12, 0), L2W(0.7, 2.55, 0), L2W(SK.xGd, 2.55, SK.zG), L2W(SK.xGd, SK.yG, SK.zG), L2W(SK.xTe, SK.yG, SK.zG), L2W(SK.xTe, SK.yL, SK.zG), L2W(SK.xTe, SK.yL, SK.zL)];
    var R_LIQ = [L2W(0.55, 1.7, 0), L2W(0.55, SK.yL, 0), L2W(0.55, SK.yL, SK.zL), L2W(SK.xTe, SK.yL, SK.zL)];
    var BX = MP.lineaBateria.desdeX, BZ = MP.lineaBateria.z, BX1 = MP.lineaBateria.haciaX;
    var teOut = L2W(-3.25, 0.35, 0.6), southZ = L2W(0, 0, 2.15).z;
    var R_SAL = [L2W(SK.xTe, SK.yL, SK.zL), L2W(-2.75, SK.yL, SK.zL), L2W(-2.75, SK.yL, 0.6), L2W(-3.25, SK.yL, 0.6), teOut, [teOut.x, 0.35, southZ], [30, 0.35, southZ], [30, 0.35, BZ], [BX, 0.35, BZ], [BX1 + 2.6, 0.35, BZ], [BX1 + 2.6, -1.0, BZ]];

    var RT = {
      mezcla: route(R_MEZCLA, BEND), gas: route(R_GAS, 0.12), liquido: route(R_LIQ, 0.12), salida: route(R_SAL, BEND)
    };
    var RT_PIPE = {
      mezclaPozo: route(R_MEZCLA.slice(0, 6), BEND),
      manifold: route(R_MEZCLA.slice(4, 10), BEND),
      lineaEntrada: route(R_MEZCLA.slice(8, 18), BEND),
      gas: route([L2W(0.7, 2.26, 0)].concat(R_GAS.slice(1)), 0.12),
      liquido: route([L2W(0.55, 1.64, 0)].concat(R_LIQ.slice(1)), 0.12),
      salida: route(R_SAL.slice(0, 9), BEND),
      bateria: route([[BX - 0.35, 0.35, BZ], [BX1 + 2.6, 0.35, BZ], [BX1 + 2.6, -1.0, BZ]], BEND)
    };

    (function buildPipes() {
      // Pozo → estrangulador → manifold
      var b = new Builder();
      pipeRoute(b, 'pipeGreen', RT_PIPE.mezclaPozo, RP);
      lineDressing(b, RT_PIPE.mezclaPozo, RP);
      flangePair(b, 'flange', new V3(pz.x + 0.95, 1.25, pz.z), new V3(1, 0, 0), RP);
      hammerUnion(b, new V3(pz.x + 1.55, 1.25, pz.z), new V3(1, 0, 0), RP);
      b.flush('mezclaPozo', null, { stream: 'mezcla' });
      // Estrangulador (cuerpo en ángulo, bonete y volante al este)
      var bc = new Builder();
      bc.add('choke', gBox(0.26, 0.26, 0.26, 0.03), mat(choke.x, choke.y, choke.z));
      flangePair(bc, 'flange', new V3(choke.x - 0.18, choke.y, choke.z), new V3(1, 0, 0), RP);
      flangePair(bc, 'flange', new V3(choke.x, choke.y - 0.18, choke.z), new V3(0, 1, 0), RP);
      bc.add('choke', gCylAB(new V3(choke.x + 0.12, choke.y, choke.z), new V3(choke.x + 0.4, choke.y, choke.z), 0.07, 14));
      bc.add('choke', gCylAB(new V3(choke.x + 0.4, choke.y, choke.z), new V3(choke.x + 0.5, choke.y, choke.z), 0.05, 12));
      bc.add('galv', gCylAB(new V3(choke.x + 0.5, choke.y, choke.z), new V3(choke.x + 0.62, choke.y, choke.z), 0.012, 6));
      handwheel(bc, 'black', new V3(choke.x + 0.6, choke.y, choke.z), new V3(1, 0, 0), 0.13);
      bc.add('galv', gBox(0.16, 0.05, 0.004), mat(choke.x + 0.32, choke.y + 0.075, choke.z + 0.03));
      bc.add('steelDark', gBox(0.08, 0.6, 0.08), mat(choke.x + 0.18, 0.3, choke.z - 0.2));
      bc.add('steelDark', gBox(0.4, 0.02, 0.3), mat(choke.x + 0.1, 0.01, choke.z - 0.15));
      bc.flush('estrangulador');
      // Manifold sobre patín
      var bm = new Builder(), mx = mf.x, mz = mf.z;
      [-0.65, 0.65].forEach(function (dz) { bm.add('steelDark', gBox(2.8, 0.14, 0.12), mat(mx + 0.3, 0.07, mz + dz)); });
      [-1.0, -0.2, 0.6, 1.6].forEach(function (dx) { bm.add('steelDark', gBox(0.1, 0.12, 1.4), mat(mx + dx, 0.08, mz)); });
      var deck = gBox(2.7, 0.025, 1.3); var uvd = deck.attributes.uv; for (var i = 0; i < uvd.count; i++) uvd.setXY(i, uvd.getX(i) * 10, uvd.getY(i) * 5);
      bm.add('grating', deck, mat(mx + 0.3, 0.155, mz));
      pipeRoute(bm, 'pipeGreen', RT_PIPE.manifold, RP);
      gateValve(bm, 'pipeGreen', new V3(mx - 0.7, 0.62, mz - 0.4), new V3(0, 0, 1), RP, null, { flangeKey: 'flange', wheelKey: 'black' });
      gateValve(bm, 'pipeGreen', new V3(mx + 0.55, 0.62, mz), new V3(1, 0, 0), RP, null, { flangeKey: 'flange', wheelKey: 'black' });
      // derivación con válvula cerrada y brida ciega
      bm.add('pipeGreen', gCylAB(new V3(mx - 0.1, 0.62, mz), new V3(mx - 0.1, 0.62, mz + 0.42), RP, 14));
      bm.add('pipeGreen', new THREE.SphereGeometry(RP * 1.35, 12, 8), mat(mx - 0.1, 0.62, mz));
      gateValve(bm, 'pipeGreen', new V3(mx - 0.1, 0.62, mz + 0.5), new V3(0, 0, 1), RP * 0.9, null, { flangeKey: 'flange', wheelKey: 'black' });
      blindFlange(bm, 'flange', new V3(mx - 0.1, 0.62, mz + 0.68), new V3(0, 0, 1), RP * 0.9);
      // soportes del cabezal
      [[mx - 0.7, mz - 0.75], [mx + 1.0, mz], [mx - 0.1, mz + 0.2]].forEach(function (c) { bm.add('steelDark', gBox(0.06, 0.4, 0.06), mat(c[0], 0.36, c[1])); });
      gauge(bm, new V3(mx + 1.1, 0.86, mz), new V3(0, 0.2, 1), new V3(mx + 1.1, 0.62, mz));
      bm.flush('manifold', null, { stream: 'mezcla' });
      // Línea de entrada (manifold → separador)
      var bl = new Builder();
      pipeRoute(bl, 'pipeGreen', RT_PIPE.lineaEntrada, RP);
      lineDressing(bl, RT_PIPE.lineaEntrada, RP);
      flangePair(bl, 'flange', L2W(-2.24, 2.05, 0), new V3(1, 0, 0).transformDirection(sepM), RP);
      flangePair(bl, 'flange', L2W(-2.4, 1.3, 0), new V3(0, 1, 0), RP);
      flangePair(bl, 'flange', L2W(-2.85, 1.0, -0.45), new V3(1, 0, 0).transformDirection(sepM), RP);
      gauge(bl, L2W(-2.4, 1.72, 0.22), new V3(0, 0.1, 1).transformDirection(sepM), L2W(-2.4, 1.72, 0));
      bl.flush('lineaEntrada', null, { stream: 'mezcla' });
      // Salida → línea a batería
      var bs = new Builder();
      pipeRoute(bs, 'pipeGreen', RT_PIPE.salida, RP);
      lineDressing(bs, RT_PIPE.salida, RP);
      bs.flush('lineaSalida', null, { stream: 'salida' });
      var bb = new Builder();
      pipeRoute(bb, 'lineBlack', RT_PIPE.bateria, RP * 1.05);
      lineDressing(bb, RT_PIPE.bateria, RP * 1.05, { unions: false, sleepers: true });
      blindFlange(bb, 'lineBlack', new V3(BX - 0.38, 0.35, BZ), new V3(-1, 0, 0), RP);
      gateValve(bb, 'lineBlack', new V3(BX + 0.6, 0.35, BZ), new V3(1, 0, 0), RP, null, { flangeKey: 'lineBlack', wheelKey: 'railYellow' });
      // anillos amarillos de identificación
      for (var xx = BX + 4; xx < BX1; xx += 6) bb.add('railYellow', gCyl(RP * 1.08, RP * 1.08, 0.12, 14), mat(xx, 0.35, BZ, 0, 0, PI / 2));
      bb.flush('lineaBateria', null, { stream: 'salida' });
    })();

    /* =========================== SEPARADOR (remolque) =========================== */
    var SEP = { R: 0.33, wall: 0.03, xw: -1.9, xe: 0.8, hd: 0.165, cy: 1.95 };
    SEP.Ri = SEP.R - SEP.wall; SEP.hdi = SEP.hd - SEP.wall * 0.8;
    function headProfile(R, hd, xw, xe, nH) {
      // perfil (r, x) del oeste al este con cabezas semielípticas 2:1
      var pts = [], i, th;
      for (i = 0; i <= nH; i++) { th = i / nH * PI / 2; pts.push(new THREE.Vector2(R * Math.sin(th) + (i === 0 ? 1e-4 : 0), xw - hd * Math.cos(th))); }
      for (i = 0; i <= nH; i++) { th = i / nH * PI / 2; pts.push(new THREE.Vector2(R * Math.cos(th) + (i === nH ? 1e-4 : 0), xe + hd * Math.sin(th))); }
      return pts;
    }
    function rAt(x, R, hd) { // radio del casco en la coordenada axial x
      if (x < SEP.xw) { var u = (SEP.xw - x) / hd; return u >= 1 ? 0 : R * Math.sqrt(1 - u * u); }
      if (x > SEP.xe) { var v = (x - SEP.xe) / hd; return v >= 1 ? 0 : R * Math.sqrt(1 - v * v); }
      return R;
    }
    function latheX(R, hd, phi0, phiL, seg) {
      var g = new THREE.LatheGeometry(headProfile(R, hd, SEP.xw, SEP.xe, 10), seg, phi0 || 0, phiL == null ? TAU : phiL);
      g.rotateZ(-PI / 2); // eje Y → eje X
      return g;
    }
    function sectionContour(R, hd, n) { // contorno longitudinal (x, y) en el plano z = 0
      var pts = [], i, th;
      for (i = 0; i <= n; i++) { th = PI / 2 + i / n * PI; pts.push([SEP.xw + hd * Math.cos(th), SEP.cy + R * Math.sin(th)]); } // oeste (arriba → abajo)
      for (i = 0; i <= n; i++) { th = -PI / 2 + i / n * PI; pts.push([SEP.xe + hd * Math.cos(th), SEP.cy + R * Math.sin(th)]); } // este (abajo → arriba)
      return pts;
    }
    var sepGroup = new THREE.Group(); root.add(sepGroup);

    (function buildSeparator() {
      var b = new Builder(sepM);
      // ---- remolque ----
      [-0.95, 0.95].forEach(function (z) { b.add('trailer', gBox(6.0, 0.17, 0.1, 0.012), mat(0, 0.695, z)); });
      [-2.95, -2.0, -1.0, 0, 1.0, 2.0, 2.95].forEach(function (x) { b.add('trailer', gBox(0.08, 0.12, 1.9), mat(x, 0.7, 0)); });
      var tongue = function (z) { var a = new V3(-2.95, 0.68, z), c = new V3(-4.3, 0.6, 0); b.add('trailer', gCylAB(a, c, 0.055, 4)); };
      tongue(-0.95); tongue(0.95);
      b.add('steelDark', gBox(0.35, 0.12, 0.16, 0.02), mat(-4.4, 0.6, 0));
      b.add('steelDark', gCyl(0.045, 0.045, 0.62, 10), mat(-3.9, 0.33, 0.22));
      b.add('steelDark', gBox(0.2, 0.03, 0.2), mat(-3.9, 0.015, 0.22));
      handwheel(b, 'steelDark', new V3(-3.9, 0.72, 0.22), new V3(0, 1, 0), 0.08);
      [0.15, 1.05].forEach(function (ax) {
        b.add('steelDark', gCylAB(new V3(ax, 0.37, -1.1), new V3(ax, 0.37, 1.1), 0.04, 10));
        [-0.95, 0.95].forEach(function (z) { b.add('steelDark', gBox(0.7, 0.05, 0.07), mat(ax, 0.55, z)); });
        [-1.13, 1.13].forEach(function (z) {
          var tire = new THREE.LatheGeometry([new THREE.Vector2(0.21, -0.11), new THREE.Vector2(0.33, -0.115), new THREE.Vector2(0.37, -0.09), new THREE.Vector2(0.375, 0), new THREE.Vector2(0.37, 0.09), new THREE.Vector2(0.33, 0.115), new THREE.Vector2(0.21, 0.11)], 28);
          tire.rotateX(PI / 2); b.add('tire', tire, mat(ax, 0.375, z));
          var rim = gCyl(0.215, 0.215, 0.2, 22); rim.rotateX(PI / 2); b.add('rim', rim, mat(ax, 0.375, z));
          var hub = gCyl(0.075, 0.075, 0.24, 12); hub.rotateX(PI / 2); b.add('steelDark', hub, mat(ax, 0.375, z));
          for (var k = 0; k < 6; k++) { var a = k / 6 * TAU, hole = gCyl(0.026, 0.026, 0.205, 8); hole.rotateX(PI / 2); b.add('steelDark', hole, mat(ax + Math.cos(a) * 0.14, 0.375 + Math.sin(a) * 0.14, z)); }
        });
      });
      [-1.13, 1.13].forEach(function (z) { var f = gCyl(0.5, 0.5, 0.28, 18, true, -PI / 2, PI); f.rotateX(PI / 2); f.rotateY(0); b.add('black', f, mat(0.6, 0.4, z, 0, 0, 0, 1.55, 1, 1)); });
      [[-2.8, -1.0], [-2.8, 1.0], [2.8, -1.0], [2.8, 1.0]].forEach(function (c) {
        b.add('black', gBox(0.08, 0.62, 0.08), mat(c[0], 0.31, c[1])); b.add('black', gBox(0.24, 0.03, 0.24), mat(c[0], 0.015, c[1]));
      });
      // ---- recipiente ----
      var shell = latheX(SEP.R, SEP.hd, 0, TAU, 44); b.add('vesselOut', shell, mat(0, SEP.cy, 0));
      var inner = latheX(SEP.Ri, SEP.hdi, 0, TAU, 44); b.add('vesselIn', inner, mat(0, SEP.cy, 0));
      // calcomanía (placa naranja + rótulos + NFPA) en el costado sur
      var dg = gCyl(SEP.R + 0.004, SEP.R + 0.004, 1.6, 28, true, -0.85, 1.7);
      var duv = dg.attributes.uv; for (var i = 0; i < duv.count; i++) { var u0 = duv.getX(i), v0 = duv.getY(i); duv.setXY(i, v0, 1 - u0); }
      dg.rotateZ(-PI / 2); b.add('decal', dg, mat(-0.75, SEP.cy, 0));
      // registro bridado
      b.add('vesselOut', gCylAB(new V3(0.3, SEP.cy, 0.2), new V3(0.3, SEP.cy, SEP.R + 0.07), 0.15, 22));
      b.add('vesselOut', orient(gCyl(0.205, 0.205, 0.05, 26), new V3(0.3, SEP.cy, SEP.R + 0.095), new V3(0, 0, 1)));
      b.add('vesselOut', orient(gCyl(0.205, 0.205, 0.035, 26), new V3(0.3, SEP.cy, SEP.R + 0.05), new V3(0, 0, 1)));
      for (i = 0; i < 16; i++) { var a = i / 16 * TAU; b.add('darkClip', orient(gCyl(0.012, 0.012, 0.12, 6), new V3(0.3 + Math.cos(a) * 0.178, SEP.cy + Math.sin(a) * 0.178, SEP.R + 0.08), new V3(0, 0, 1))); }
      b.add('darkClip', orient(gCyl(0.045, 0.045, 0.03, 12), new V3(0.3, SEP.cy, SEP.R + 0.13), new V3(0, 0, 1)));
      // silletas (patas abiertas para dejar pasar las corridas de medición)
      [-1.45, 0.35].forEach(function (x) {
        var sad = gCyl(SEP.R + 0.012, SEP.R + 0.012, 0.18, 20, true, PI / 2 + 0.45, PI - 0.9); sad.rotateZ(-PI / 2); b.add('pipeGreen', sad, mat(x, SEP.cy, 0));
        [-0.42, 0.42].forEach(function (z) {
          b.add('pipeGreen', gBox(0.1, SEP.cy - 0.78 - 0.12, 0.1), mat(x, (SEP.cy - 0.12 + 0.78) / 2, z));
          b.add('pipeGreen', gCylAB(new V3(x, SEP.cy - 0.18, z), new V3(x, SEP.cy - SEP.R * 0.72, z * 0.55), 0.03, 6));
        });
        b.add('pipeGreen', gBox(0.16, 0.02, 1.0), mat(x, 0.79, 0));
      });
      // boquillas
      b.add('vesselOut', gCylAB(new V3(0.7, SEP.cy + SEP.R - 0.04, 0), new V3(0.7, SEP.cy + SEP.R + 0.05, 0), RP * 1.1, 14));
      b.add('vesselOut', gCylAB(new V3(0.55, SEP.cy - SEP.R + 0.04, 0), new V3(0.55, SEP.cy - SEP.R - 0.05, 0), RP * 1.1, 14));
      b.add('vesselOut', gCylAB(new V3(SEP.xw - SEP.hd + 0.03, 2.05, 0), new V3(SEP.xw - SEP.hd - 0.1, 2.05, 0), RP * 1.1, 14));
      flangePair(b, 'flange', new V3(0.7, SEP.cy + SEP.R + 0.09, 0), new V3(0, 1, 0), RP);
      flangePair(b, 'flange', new V3(0.55, SEP.cy - SEP.R - 0.1, 0), new V3(0, 1, 0), RP);
      // piso de lámina antiderrapante en el extremo este y caja de conexiones de señales
      var deck = gBox(1.5, 0.02, 1.86); var duv2 = deck.attributes.uv; for (i = 0; i < duv2.count; i++) duv2.setXY(i, duv2.getX(i) * 6, duv2.getY(i) * 7);
      b.add('grating', deck, mat(2.2, 0.79, 0));
      b.add('galv', gBox(0.28, 0.34, 0.16, 0.02), mat(2.55, 1.28, -0.86));
      b.add('steelDark', gBox(0.05, 0.5, 0.05), mat(2.55, 0.98, -0.86));
      b.add('black', gCylAB(new V3(2.48, 1.1, -0.86), new V3(2.3, 0.02, -1.2), 0.016, 6));
      // soportes de las corridas bajo el recipiente
      [-1.95, -0.95].forEach(function (x) {
        b.add('steelDark', gBox(0.06, SK.yG - RP - 0.76, 0.06), mat(x, (SK.yG - RP + 0.76) / 2, SK.zG));
        b.add('steelDark', gBox(0.06, SK.yL - RP - 0.76, 0.06), mat(x, (SK.yL - RP + 0.76) / 2, SK.zL));
      });
      // sombrillas verdes (fotos 02 y 05)
      function umbrella(base, topP, R) {
        b.add('galv', gCylAB(base, topP, 0.016, 6));
        var can = new THREE.ConeGeometry(R, R * 0.3, 10, 2, true), cp = can.attributes.position;
        for (var q = 0; q < cp.count; q++) { var yy = cp.getY(q); if (yy < 0) { var ang = Math.atan2(cp.getZ(q), cp.getX(q)); cp.setY(q, yy - 0.02 * Math.cos(ang * 10)); } }
        can.computeVertexNormals(); can.translate(0, -R * 0.15, 0);
        var up = new V3(0, 1, 0);
        b.add('umbrella', orient(can, topP.clone().addScaledVector(up, 0.02), up));
        for (var k = 0; k < 10; k++) { var a = k / 10 * TAU; b.add('galv', gCylAB(topP, topP.clone().add(new V3(Math.cos(a) * R * 0.93, -R * 0.29, Math.sin(a) * R * 0.93)), 0.005, 4)); }
        b.add('white', gCyl(0.02, 0.03, 0.08, 8), mat(topP.x, topP.y + 0.05, topP.z));
      }
      umbrella(new V3(2.05, 0.78, 0.98), new V3(1.9, 2.75, 0.45), 1.15);
      var tri = new V3(-3.2, 0, -1.75);
      for (i = 0; i < 3; i++) { var a2 = i / 3 * TAU; b.add('steelDark', gCylAB(new V3(tri.x + Math.cos(a2) * 0.35, 0, tri.z + Math.sin(a2) * 0.35), new V3(tri.x, 0.45, tri.z), 0.014, 5)); }
      umbrella(new V3(tri.x, 0.0, tri.z), new V3(-2.75, 2.6, -1.05), 1.1);
      b.flush('separador', sepGroup);

      // ---- corridas de gas y líquido (bajo el recipiente) ----
      var bg = new Builder();
      pipeRoute(bg, 'pipeGreen', RT_PIPE.gas, RP);
      flangePair(bg, 'flange', L2W(SK.xGd, 2.32, SK.zG), new V3(0, 1, 0), RP);
      flangePair(bg, 'flange', L2W(SK.xGd, 1.72, SK.zG), new V3(0, 1, 0), RP);
      flangePair(bg, 'flange', L2W(-0.75, SK.yG, SK.zG), new V3(1, 0, 0).transformDirection(sepM), RP);
      bg.flush('lineaGas', sepGroup, { stream: 'gas' });
      var bq = new Builder();
      pipeRoute(bq, 'pipeGreen', RT_PIPE.liquido, RP);
      flangePair(bq, 'flange', L2W(0.2, SK.yL, SK.zL), new V3(1, 0, 0).transformDirection(sepM), RP);
      flangePair(bq, 'flange', L2W(-1.65, SK.yL, SK.zL), new V3(1, 0, 0).transformDirection(sepM), RP);
      bq.flush('lineaLiquido', sepGroup, { stream: 'liquido' });

      // ---- válvulas de control, aguas abajo de cada medidor ----
      // LV (nivel): después del Coriolis, actuador hacia arriba.
      // PV (contrapresión): después de la placa; bajo el recipiente no cabe el actuador vertical,
      // así que se monta con el actuador horizontal hacia el sur (+z), visible desde el frente.
      var X = new V3(1, 0, 0).transformDirection(sepM), Yv = new V3(0, 1, 0), Zs = new V3(0, 0, 1).transformDirection(sepM);
      var bLV = new Builder(); controlValve(bLV, L2W(SK.xLV, SK.yL, SK.zL), X, RP, Yv); bLV.flush('LV', sepGroup);
      var bPV = new Builder(); controlValve(bPV, L2W(SK.xPV, SK.yG, SK.zG), X, RP, Zs, -1); bPV.flush('PV', sepGroup); // posicionador arriba
      // ---- Coriolis Promass 300 (salida de líquido, aguas arriba de la LV) ----
      var cx = SK.xCor, yl = SK.yL, zl = SK.zL;
      var bc = new Builder(sepM);
      flangePair(bc, 'flange', new V3(cx - 0.32, yl, zl), new V3(1, 0, 0), RP);
      flangePair(bc, 'flange', new V3(cx + 0.32, yl, zl), new V3(1, 0, 0), RP);
      bc.add('stainless', gCylAB(new V3(cx - 0.28, yl, zl), new V3(cx + 0.28, yl, zl), RP * 1.05, 16));
      bc.add('stainless', gBox(0.46, 0.15, 0.13, 0.05), mat(cx, yl - 0.05, zl));
      var arc = new THREE.TorusGeometry(0.19, 0.042, 10, 20, PI); arc.rotateX(PI); arc.scale(1.1, 0.5, 1); bc.add('stainless', arc, mat(cx, yl - 0.05, zl));
      bc.flush('coriolis', sepGroup);
      var bct = new Builder(sepM);
      bct.add('stainless', gCyl(0.03, 0.03, 0.12, 10), mat(cx, yl + 0.1, zl));
      bct.add('ehBody', gBox(0.13, 0.12, 0.14, 0.03), mat(cx, yl + 0.22, zl));
      bct.add('ehBody', orient(gCyl(0.062, 0.062, 0.05, 18), new V3(cx, yl + 0.25, zl + 0.08), new V3(0, 0, 1)));
      bct.add('ehGlass', orient(gCyl(0.045, 0.045, 0.006, 18), new V3(cx, yl + 0.25, zl + 0.108), new V3(0, 0, 1)));
      bct.add('ehBlue', orient(gCyl(0.062, 0.062, 0.03, 18), new V3(cx, yl + 0.25, zl - 0.08), new V3(0, 0, 1)));
      bct.add('black', gCylAB(new V3(cx + 0.07, yl + 0.2, zl), new V3(cx + 0.12, yl + 0.2, zl), 0.012, 8));
      bct.flush('CORIOLIS', sepGroup);
      // ---- placa de orificio (portaplaca) + transmisor de presión diferencial (aguas arriba de la PV) ----
      var ox = SK.xOri, yg = SK.yG, zg = SK.zG;
      var bo = new Builder(sepM);
      flangePair(bo, 'flange', new V3(ox, yg, zg), new V3(1, 0, 0), RP, { k: 2.4, th: 0.055, bolts: 8 });
      bo.add('stainless', gBox(0.01, 0.2, 0.07), mat(ox, yg + 0.11, zg));
      bo.add('stainless', gBox(0.012, 0.045, 0.12), mat(ox, yg + 0.2, zg));
      [ox - 0.035, ox + 0.035].forEach(function (x) {
        bo.add('stainless', gCylAB(new V3(x, yg + 0.02, zg + RP * 1.9), new V3(x, yg + 0.02, zg + 0.27), 0.007, 6));
      });
      bo.add('stainless', gBox(0.11, 0.035, 0.07, 0.006), mat(ox, yg + 0.02, zg + 0.3));
      bo.flush('placa', sepGroup);
      var btg = new Builder(sepM);
      btg.add('stainless', gBox(0.08, 0.05, 0.08, 0.008), mat(ox, yg + 0.06, zg + 0.3));
      transmitter(btg, new V3(ox, yg + 0.08, zg + 0.3), new V3(0, 1, 0), { face: new V3(0, 0, 1), k: 0.95 });
      btg.flush('TDG', sepGroup);
      // ---- reincorporación (te) y TDM en la línea de salida ----
      var tx = SK.xTe;
      var br = new Builder(sepM);
      br.add('pipeGreen', new THREE.SphereGeometry(RP * 1.5, 14, 10), mat(tx, yl, zl));
      br.add('pipeGreen', gCylAB(new V3(tx, yl, zl - 0.14), new V3(tx, yl, zl + 0.1), RP * 1.25, 14));
      br.add('pipeGreen', gCylAB(new V3(tx - 0.14, yl, zl), new V3(tx + 0.14, yl, zl), RP * 1.25, 14));
      flangePair(br, 'flange', new V3(tx, yl, zl - 0.18), new V3(0, 0, 1), RP);
      flangePair(br, 'flange', new V3(tx - 0.2, yl, zl), new V3(1, 0, 0), RP);
      flangePair(br, 'flange', new V3(tx + 0.2, yl, zl), new V3(1, 0, 0), RP);
      br.add('steelDark', gBox(0.08, yl - RP - 0.76, 0.08), mat(tx, (yl - RP + 0.76) / 2, zl));
      br.flush('recombinacion', sepGroup);
      var btm = new Builder(sepM); transmitter(btm, new V3(SK.xTDM, yl + RP, zl), new V3(0, 1, 0), { face: new V3(0, 0, 1) }); btm.flush('TDM', sepGroup);
      // ---- instrumentos en el domo ----
      var top = SEP.cy + SEP.R;
      var bps = new Builder(sepM);
      bps.add('vesselOut', gCylAB(new V3(-1.2, top - 0.04, 0), new V3(-1.2, top + 0.1, 0), 0.045, 12));
      flangePair(bps, 'flange', new V3(-1.2, top + 0.12, 0), new V3(0, 1, 0), 0.04, { k: 2.2, th: 0.03, bolts: 6 });
      bps.add('psv', gCyl(0.06, 0.06, 0.14, 14), mat(-1.2, top + 0.24, 0));
      bps.add('psv', gCyl(0.03, 0.055, 0.24, 14), mat(-1.2, top + 0.43, 0));
      bps.add('psv', gCyl(0.024, 0.024, 0.08, 10), mat(-1.2, top + 0.59, 0));
      bps.add('psv', gBox(0.04, 0.02, 0.16), mat(-1.2, top + 0.5, -0.06, 0.4, 0, 0));
      bps.add('psv', gCylAB(new V3(-1.2, top + 0.24, 0), new V3(-1.2, top + 0.24, -0.16), 0.045, 12));
      flangePair(bps, 'railYellow', new V3(-1.2, top + 0.24, -0.18), new V3(0, 0, -1), 0.04, { k: 2.1, th: 0.03, bolts: 6 });
      var dis = route([[-1.2, top + 0.24, -0.2], [-1.2, top + 0.24, -0.26], [0.45, top + 0.24, -0.26], [0.45, top + 0.24, -0.04], [0.62, top + 0.24, -0.04]], 0.07);
      dis.segs.forEach(function (s) { if (s.type === 'line') bps.add('pipeGreen', gCylAB(s.a, s.b, 0.04, 10, true)); else bps.add('pipeGreen', new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(s.a, s.c, s.b), 6, 0.04, 10)); });
      bps.add('steelDark', gBox(0.04, 0.24, 0.04), mat(-0.3, top + 0.1, -0.26));
      bps.flush('psv', sepGroup);
      var btt = new Builder(sepM);
      btt.add('vesselOut', gCylAB(new V3(-0.55, top - 0.03, 0), new V3(-0.55, top + 0.06, 0), 0.03, 10));
      btt.add('stainless', gCylAB(new V3(-0.55, top - 0.05, 0), new V3(-0.55, SEP.cy - 0.22, 0), 0.011, 8));
      transmitter(btt, new V3(-0.55, top + 0.06, 0), new V3(0, 1, 0), { face: new V3(0, 0, 1) });
      btt.flush('TT', sepGroup);
      var btn = new Builder(sepM);
      btn.add('vesselOut', gCylAB(new V3(0.05, top - 0.03, 0), new V3(0.05, top + 0.08, 0), 0.05, 12));
      flangePair(btn, 'flange', new V3(0.05, top + 0.1, 0), new V3(0, 1, 0), 0.05, { k: 2.1, th: 0.028, bolts: 6 });
      btn.add('stainless', gCylAB(new V3(0.05, top - 0.04, 0), new V3(0.05, SEP.cy - SEP.Ri + 0.04, 0), 0.007, 8));
      btn.add('stainless', gCyl(0.018, 0.018, 0.04, 8), mat(0.05, SEP.cy - SEP.Ri + 0.04, 0));
      transmitter(btn, new V3(0.05, top + 0.13, 0), new V3(0, 1, 0), { face: new V3(0, 0, 1), k: 1.1 });
      btn.flush('TN', sepGroup);
      var btp = new Builder(sepM);
      btp.add('vesselOut', gCylAB(new V3(0.4, top - 0.03, 0), new V3(0.4, top + 0.05, 0), 0.025, 10));
      gateValve(btp, 'galv', new V3(0.4, top + 0.1, 0), new V3(0, 1, 0), 0.022, new V3(0, 0, 1), { flangeKey: 'galv', wheelKey: 'black', wheelR: 1.8 });
      transmitter(btp, new V3(0.4, top + 0.17, 0), new V3(0, 1, 0), { face: new V3(0, 0, 1) });
      btp.flush('TPS', sepGroup);
    })();

    /* ---------- internos del separador (visibles con corte) ---------- */
    var interior = layers.interior;
    var liq = {};
    (function buildInternals() {
      var b = new Builder(sepM);
      // deflector de entrada (media placa cóncava, cortada en z = 0)
      var defl = gCyl(0.24, 0.24, 0.34, 16, true, PI, PI / 2); // cuarto de cilindro → media placa
      defl.translate(0, 0, 0); defl.rotateZ(PI / 2);
      b.add('steelInt', new THREE.BoxGeometry(0.014, 0.36, 0.2).translate(0, 0, -0.1), mat(SEP.xw + 0.2, SEP.cy + 0.06, 0, 0, 0, -0.12));
      b.add('steelInt', gCylAB(new V3(SEP.xw + 0.22, SEP.cy + 0.22, -0.05), new V3(SEP.xw + 0.24, SEP.cy + SEP.Ri - 0.01, -0.05), 0.008, 6));
      b.add('steelInt', gCylAB(new V3(SEP.xw + 0.22, SEP.cy + 0.22, -0.16), new V3(SEP.xw + 0.24, SEP.cy + SEP.Ri - 0.05, -0.16), 0.008, 6));
      b.add('steelInt', gCylAB(new V3(SEP.xw - SEP.hd + 0.02, 2.05, 0), new V3(SEP.xw + 0.02, 2.05, 0), RP * 0.98, 14, true));
      b.flush('deflector', interior, { cast: false });
      // extractor de niebla: medio sector circular extruido (cortado en z = 0)
      var y0 = SEP.cy + 0.07 - SEP.cy, Ri = SEP.Ri - 0.004, shp = new THREE.Shape();
      var a0 = Math.asin(y0 / Ri);
      shp.moveTo(0, y0);
      for (var i = 0; i <= 16; i++) { var a = a0 + (PI / 2 - a0) * i / 16; shp.lineTo(Math.cos(a) * Ri, Math.sin(a) * Ri); }
      shp.lineTo(0, Ri); shp.closePath();
      var pad = new THREE.ExtrudeGeometry(shp, { depth: 0.11, bevelEnabled: false, curveSegments: 16 });
      pad.rotateY(PI / 2); // shape x → -z ; extrusión → +x
      var bm = new Builder(sepM);
      bm.add('meshPad', pad, mat(0.42, SEP.cy, 0));
      bm.add('steelInt', gBox(0.02, 0.02, Ri), mat(0.42, SEP.cy + y0, -Ri / 2));
      bm.add('steelInt', gBox(0.02, 0.02, Ri), mat(0.53, SEP.cy + y0, -Ri / 2));
      bm.flush('extractor', interior, { cast: false });
      // rompe-vórtice sobre la salida de líquido
      var bv = new Builder(sepM);
      bv.add('steelInt', gBox(0.16, 0.06, 0.01), mat(0.55, SEP.cy - SEP.Ri + 0.05, -0.003));
      bv.add('steelInt', gBox(0.01, 0.06, 0.08), mat(0.55, SEP.cy - SEP.Ri + 0.05, -0.04));
      bv.flush('vortice', interior, { cast: false });
      // sección del casco en z = 0 (anillo con achurado)
      var oc = sectionContour(SEP.R, SEP.hd, 14), ic = sectionContour(SEP.Ri, SEP.hdi, 14);
      var cs = new THREE.Shape(); oc.forEach(function (p, k) { if (k) cs.lineTo(p[0], p[1]); else cs.moveTo(p[0], p[1]); }); cs.closePath();
      var hole = new THREE.Path(); ic.slice().reverse().forEach(function (p, k) { if (k) hole.lineTo(p[0], p[1]); else hole.moveTo(p[0], p[1]); }); hole.closePath();
      cs.holes.push(hole);
      var capG = new THREE.ShapeGeometry(cs, 4); capG.applyMatrix4(sepM);
      liq.cap = new THREE.Mesh(capG, MAT.section); interior.add(liq.cap);
      liq.front = new THREE.Mesh(new THREE.RingGeometry(SEP.Ri, SEP.R, 28, 1, -PI / 2, PI), MAT.sectionFront);
      liq.front.geometry.rotateY(-PI / 2); interior.add(liq.front);
      // cuerpo de líquido (media lata interior) + cara de corte + superficie ondulada
      var body = latheX(SEP.Ri - 0.003, SEP.hdi - 0.003, PI / 2, PI, 36); body.translate(0, SEP.cy, 0); body.applyMatrix4(sepM);
      liq.body = new THREE.Mesh(body, MAT.liqBody); interior.add(liq.body);
      var fs = new THREE.Shape(); ic.forEach(function (p, k) { if (k) fs.lineTo(p[0], p[1]); else fs.moveTo(p[0], p[1]); }); fs.closePath();
      var faceG = new THREE.ShapeGeometry(fs, 4); faceG.translate(0, 0, -0.002); faceG.applyMatrix4(sepM);
      liq.face = new THREE.Mesh(faceG, MAT.liqFace); liq.face.renderOrder = 2; interior.add(liq.face);
      liq.NX = 64; liq.NZ = 7;
      var sg = new THREE.PlaneGeometry(1, 1, liq.NX, liq.NZ);
      liq.surf = new THREE.Mesh(sg, MAT.liqTop); liq.surf.frustumCulled = false; interior.add(liq.surf);
      liq.surf.matrixAutoUpdate = false; liq.surf.matrix.copy(sepM);
    })();

    /* =========================== CASETA, RTU Y CABLES =========================== */
    var CABLES = [];
    (function buildCaseta() {
      var cs = MP.caseta, cm = new THREE.Matrix4().compose(new V3(cs.x, 0, cs.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -(cs.rot || 0) * PI / 180, 0)), new V3(1, 1, 1));
      var b = new Builder(cm), L = 8, Wd = 2.6, Hh = 2.55, y0 = 0.78;
      b.add('white', gBox(L, Hh, Wd, 0.07), mat(0, y0 + Hh / 2, 0));
      b.add('white', gBox(L - 0.1, 0.12, Wd - 0.1, 0.05), mat(0, y0 + Hh + 0.03, 0));
      // nervaduras verticales del forro
      for (var x = -L / 2 + 0.3; x < L / 2 - 0.1; x += 0.4) {
        [Wd / 2 + 0.004, -Wd / 2 - 0.004].forEach(function (z) { b.add('white', gBox(0.03, Hh - 0.24, 0.012), mat(x, y0 + Hh / 2, z)); });
      }
      // chasis, llantas y faldón
      [-0.9, 0.9].forEach(function (z) { b.add('steelDark', gBox(L - 0.2, 0.2, 0.1), mat(0, y0 - 0.1, z)); });
      b.add('black', gBox(L - 0.3, 0.32, Wd - 0.25), mat(0, y0 - 0.18, 0));
      [0.7, 1.6].forEach(function (ax) {
        [-1.05, 1.05].forEach(function (z) {
          var tire = gCyl(0.37, 0.37, 0.22, 22); tire.rotateX(PI / 2); b.add('tire', tire, mat(ax, 0.37, z));
          var rim = gCyl(0.2, 0.2, 0.23, 16); rim.rotateX(PI / 2); b.add('rim', rim, mat(ax, 0.37, z));
        });
      });
      b.add('steelDark', gCylAB(new V3(-L / 2, 0.62, -0.9), new V3(-L / 2 - 1.2, 0.55, 0), 0.05, 4));
      b.add('steelDark', gCylAB(new V3(-L / 2, 0.62, 0.9), new V3(-L / 2 - 1.2, 0.55, 0), 0.05, 4));
      [[-3.5, -1.1], [-3.5, 1.1], [3.5, -1.1], [3.5, 1.1]].forEach(function (c) { b.add('black', gBox(0.1, 0.6, 0.1), mat(c[0], 0.3, c[1])); });
      // puerta, ventanas, escalón, A/C
      var front = Wd / 2 + 0.01;
      b.add('camperTrim', gBox(0.95, 2.05, 0.04), mat(2.6, y0 + 1.1, front));
      b.add('white', gBox(0.85, 1.95, 0.05), mat(2.6, y0 + 1.08, front + 0.01));
      b.add('glass', gBox(0.45, 0.35, 0.03), mat(2.6, y0 + 1.6, front + 0.04));
      b.add('galv', gBox(0.03, 0.18, 0.05), mat(2.95, y0 + 1.0, front + 0.05));
      [[-2.4, 0], [0.4, 0], [-0.9, 0]].forEach(function (w) {
        b.add('camperTrim', gBox(1.06, 0.84, 0.05), mat(w[0], y0 + 1.55, front));
        b.add('glass', gBox(0.96, 0.74, 0.05), mat(w[0], y0 + 1.55, front + 0.015));
        b.add('camperTrim', gBox(0.02, 0.74, 0.06), mat(w[0], y0 + 1.55, front + 0.02));
      });
      [[-2.0], [1.4]].forEach(function (w) {
        b.add('camperTrim', gBox(1.06, 0.84, 0.05), mat(w[0], y0 + 1.55, -front));
        b.add('glass', gBox(0.96, 0.74, 0.05), mat(w[0], y0 + 1.55, -front - 0.015));
      });
      for (var s = 0; s < 3; s++) b.add('grating', gBox(0.9, 0.04, 0.28), mat(2.6, y0 - 0.22 - s * 0.24, front + 0.2 + s * 0.26));
      [2.12, 3.08].forEach(function (sx) { b.add('steelDark', gCylAB(new V3(sx, y0, front + 0.08), new V3(sx, 0.02, front + 0.85), 0.03, 4)); b.add('galv', gCylAB(new V3(sx, y0 + 0.9, front + 0.1), new V3(sx, 0.9, front + 0.88), 0.02, 6)); b.add('galv', gCyl(0.02, 0.02, 0.9, 6), mat(sx, 0.45, front + 0.88)); });
      b.add('white', gBox(0.9, 0.38, 0.7, 0.05), mat(-1.6, y0 + Hh + 0.24, 0));
      b.add('camperTrim', gBox(0.7, 0.02, 0.5), mat(-1.6, y0 + Hh + 0.44, 0));
      b.add('white', gBox(0.6, 0.55, 0.45, 0.04), mat(-L / 2 + 0.5, y0 + 1.7, -Wd / 2 - 0.25));
      // rótulo corporativo en el costado (atlas de letreros)
      var lv = new THREE.PlaneGeometry(5.7, 5.7 * 152 / 2048); var uvr = signUV('livery'), uvL = lv.attributes.uv;
      for (var i = 0; i < uvL.count; i++) uvL.setXY(i, lerp(uvr[0], uvr[2], uvL.getX(i)), lerp(uvr[1], uvr[3], uvL.getY(i)));
      b.add('signs', lv, mat(-0.95, y0 + 0.5, front + 0.012));
      var lv2 = lv.clone(); b.add('signs', lv2, mat(0.4, y0 + 0.5, -front - 0.012, 0, PI, 0));
      b.flush('caseta');
      // RTU (gabinete de acero inoxidable sobre pedestal, foto 04)
      var r = MP.rtu, br = new Builder();
      br.add('galv', gCyl(0.045, 0.045, 1.3, 10), mat(r.x - 0.2, 0.65, r.z));
      br.add('galv', gCyl(0.045, 0.045, 1.3, 10), mat(r.x + 0.2, 0.65, r.z));
      br.add('concrete', gBox(0.7, 0.12, 0.4), mat(r.x, 0.06, r.z));
      br.add('galv', gBox(0.62, 0.04, 0.12), mat(r.x, 0.75, r.z));
      br.add('stainless', gBox(0.5, 0.62, 0.26, 0.015), mat(r.x, 1.25, r.z + 0.05));
      br.add('stainless', gBox(0.46, 0.58, 0.02, 0.008), mat(r.x, 1.25, r.z + 0.19));
      br.add('galv', gBox(0.03, 0.1, 0.03), mat(r.x + 0.18, 1.25, r.z + 0.21));
      br.add('galv', gBox(0.72, 0.03, 0.5), mat(r.x, 1.66, r.z + 0.08, -0.12, 0, 0));
      var pl = new THREE.PlaneGeometry(0.26, 0.26 * 256 / 384), uvs = signUV('rtu'), uvp = pl.attributes.uv;
      for (i = 0; i < uvp.count; i++) uvp.setXY(i, lerp(uvs[0], uvs[2], uvp.getX(i)), lerp(uvs[1], uvs[3], uvp.getY(i)));
      br.add('signs', pl, mat(r.x, 1.42, r.z + 0.202));
      br.add('galv', gCylAB(new V3(r.x - 0.1, 0.94, r.z + 0.05), new V3(r.x - 0.1, 0.05, r.z + 0.05), 0.025, 8));
      br.flush('rtu');
      // cables de señal tendidos en el piso (negros)
      var bk = new Builder();
      function cable(pts, seed) {
        var rr = U.rng(seed), P = [];
        for (var k = 0; k < pts.length; k++) { var p = pts[k]; P.push(new V3(p[0] + (k && k < pts.length - 1 ? (rr() - 0.5) * 0.5 : 0), p[1], p[2] + (k && k < pts.length - 1 ? (rr() - 0.5) * 0.5 : 0))); }
        var cv = new THREE.CatmullRomCurve3(P, false, 'centripetal');
        bk.add('black', new THREE.TubeGeometry(cv, Math.max(12, Math.round(cv.getLength() * 3)), 0.02, 5, false));
        return cv;
      }
      var jb = L2W(2.42, 1.1, -0.86), jb0 = L2W(2.3, 0.02, -1.2);
      CABLES.push(cable([[jb0.x, 0.02, jb0.z], [jb0.x + 2.5, 0.02, jb0.z + 1.6], [27, 0.02, 16.5], [31, 0.02, 19.6], [r.x - 0.6, 0.02, r.z - 0.3], [r.x - 0.1, 0.02, r.z + 0.05], [r.x - 0.1, 0.05, r.z + 0.05]], 31));
      CABLES.push(cable([[pz.x + 1.05, 1.42, pz.z - 0.08], [pz.x + 1.3, 1.0, pz.z - 0.3], [pz.x + 1.62, 0.6, pz.z - 1.45], [pz.x + 1.8, 0.02, pz.z - 1.7], [pz.x + 4.6, 0.02, pz.z - 1.0], [mf.x - 1.4, 0.02, mf.z - 1.2], [diagA.x + 0.4, 0.02, diagA.z - 1.0], [inEnd.x - 1.6, 0.02, inEnd.z - 1.1], [jb0.x - 2.5, 0.02, jb0.z - 0.3], [jb0.x, 0.02, jb0.z]], 37));
      CABLES.push(cable([[BX + 1.2, 0.6, BZ + 0.1], [BX + 1.4, 0.02, BZ + 0.5], [r.x + 0.6, 0.02, BZ + 6], [r.x + 0.9, 0.02, r.z - 6], [r.x + 0.3, 0.02, r.z - 0.2], [r.x + 0.1, 0.02, r.z + 0.05], [r.x + 0.1, 0.05, r.z + 0.05]], 41));
      CABLES.push(cable([[r.x, 0.05, r.z + 0.05], [r.x + 0.6, 0.02, r.z + 0.7], [cs.x - L / 2 + 0.3, 0.02, cs.z - Wd / 2 - 0.4], [cs.x - L / 2 + 0.6, 0.9, cs.z - Wd / 2 - 0.02]], 43));
      bk.flush('cables', null, { cast: false });
    })();

    /* ---------- transmisores en árbol (TDP) y línea a batería (TPL) ---------- */
    (function buildFieldInstruments() {
      var b1 = new Builder();
      b1.add('pipeGreen', new THREE.SphereGeometry(RP * 1.15, 10, 8), mat(pz.x + 1.12, 1.25, pz.z));
      transmitter(b1, new V3(pz.x + 1.12, 1.25 + RP, pz.z), new V3(0, 1, 0), { face: new V3(0, 0, 1) });
      b1.flush('TDP');
      var b2 = new Builder();
      transmitter(b2, new V3(BX + 1.25, 0.35 + RP, BZ), new V3(0, 1, 0), { face: new V3(0, 0, 1) });
      b2.add('galv', gCyl(0.03, 0.03, 0.35, 8), mat(BX + 1.25, 0.15, BZ - 0.12));
      b2.flush('TPL');
    })();

    /* =========================== SEGURIDAD =========================== */
    var zoneFillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COL.zona), transparent: true, opacity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
    var zoneEdgeMat = new THREE.MeshBasicMaterial({ map: texZone, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, toneMapped: false });
    var signPoles = [];
    function signBoard(b, id, cx, cz, wdt, hgt, yaw, postH) {
      var m = mat(cx, 0, cz, 0, yaw, 0), r = SIGNS[id];
      var ph = postH || 1.5;
      [-wdt * 0.32, wdt * 0.32].forEach(function (dx) { b.add('galv', gCyl(0.025, 0.025, ph + hgt, 6), mat(dx, (ph + hgt) / 2, -0.03).premultiply(m)); });
      b.add('galv', gBox(wdt + 0.04, hgt + 0.04, 0.03), mat(0, ph + hgt / 2, -0.005).premultiply(m));
      var pl = new THREE.PlaneGeometry(wdt, hgt), uv = pl.attributes.uv, q = signUV(id);
      for (var i = 0; i < uv.count; i++) uv.setXY(i, lerp(q[0], q[2], uv.getX(i)), lerp(q[1], q[3], uv.getY(i)));
      b.add('signs', pl, mat(0, ph + hgt / 2, 0.012).premultiply(m));
      signPoles.push([cx, cz]);
    }
    (function buildSafety() {
      var zs = MP.zonaSeguridad, zw = zs.x1 - zs.x0, zd = zs.z1 - zs.z0;
      var fg = new THREE.PlaneGeometry(zw, zd); fg.rotateX(-PI / 2);
      var uvf = fg.attributes.uv; for (var i = 0; i < uvf.count; i++) uvf.setXY(i, uvf.getX(i) * zw / 3, uvf.getY(i) * zd / 3);
      var fill = new THREE.Mesh(fg, zoneFillMat); fill.position.set((zs.x0 + zs.x1) / 2, 0.025, (zs.z0 + zs.z1) / 2); fill.renderOrder = 1; layers.zona.add(fill);
      var e = 0.7, strips = [];
      [[zs.x0, zs.z0, zs.x1, zs.z0], [zs.x1, zs.z0, zs.x1, zs.z1], [zs.x1, zs.z1, zs.x0, zs.z1], [zs.x0, zs.z1, zs.x0, zs.z0]].forEach(function (s) {
        var L = Math.hypot(s[2] - s[0], s[3] - s[1]) + e, g = new THREE.PlaneGeometry(L, e); g.rotateX(-PI / 2);
        var uv = g.attributes.uv; for (var k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * L / 1.6, uv.getY(k) * e / 1.6);
        g.rotateY(-Math.atan2(s[3] - s[1], s[2] - s[0])); g.translate((s[0] + s[2]) / 2, 0.03, (s[1] + s[3]) / 2);
        strips.push(prep(g));
      });
      var edge = new THREE.Mesh(THREE.mergeGeometries(strips), zoneEdgeMat); edge.renderOrder = 1; layers.zona.add(edge);
      ID.zonaSeguridadPiso = [fill, edge];
      // delineadores naranjas con base trípode + cinta roja (foto 02)
      var per = [[zs.x0, zs.z0], [zs.x1, zs.z0], [zs.x1, zs.z1], [zs.x0, zs.z1]], posts = [];
      for (i = 0; i < 4; i++) {
        var a = per[i], c = per[(i + 1) % 4], L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(2, Math.round(L / 3.2));
        for (var k = 0; k < n; k++) posts.push([lerp(a[0], c[0], k / n), lerp(a[1], c[1], k / n)]);
      }
      // hueco de acceso en el lado sur, junto a la caseta
      var gapA = [zs.x1 - 3.4, zs.z1];
      var b = new Builder(), cones = [];
      posts.forEach(function (p, idx) {
        if (Math.abs(p[1] - zs.z1) < 0.01 && p[0] > gapA[0] - 0.2 && p[0] < zs.x1 - 0.2) return;
        cones.push(p);
      });
      var post = gCyl(0.035, 0.05, 0.95, 10); post.translate(0, 0.52, 0);
      var bands = THREE.mergeGeometries([gCyl(0.044, 0.046, 0.07, 10).translate(0, 0.78, 0), gCyl(0.047, 0.049, 0.07, 10).translate(0, 0.62, 0)].map(prep));
      var base = THREE.mergeGeometries([0, 1, 2].map(function (k) { var an = k / 3 * TAU; return prep(gCylAB(new V3(Math.cos(an) * 0.3, 0.01, Math.sin(an) * 0.3), new V3(0, 0.12, 0), 0.016, 5)); }).concat([prep(gCyl(0.06, 0.07, 0.08, 10).translate(0, 0.1, 0))]));
      var nC = cones.length;
      var iPost = new THREE.InstancedMesh(post, MAT.cone, nC), iBand = new THREE.InstancedMesh(bands, MAT.reflWhite, nC), iBase = new THREE.InstancedMesh(base, MAT.black, nC);
      var mm = new THREE.Matrix4();
      cones.forEach(function (p, k) { mm.makeRotationY(k * 1.3); mm.setPosition(p[0], 0, p[1]); iPost.setMatrixAt(k, mm); iBand.setMatrixAt(k, mm); iBase.setMatrixAt(k, mm); });
      [iPost, iBand, iBase].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; layers.cinta.add(m); });
      ID.conos = [iPost, iBand, iBase];
      // cinta con catenaria entre delineadores consecutivos
      var tp = [], tuv = [], ti = [], vi = 0;
      for (k = 0; k < cones.length; k++) {
        var p0 = cones[k], p1 = cones[(k + 1) % cones.length], d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (d > 4.5) continue;
        for (var s = 0; s <= 6; s++) {
          var f = s / 6, x = lerp(p0[0], p1[0], f), z = lerp(p0[1], p1[1], f), y = 0.86 - 0.07 * 4 * f * (1 - f);
          tp.push(x, y + 0.025, z, x, y - 0.025, z); tuv.push(f * d / 1.4, 1, f * d / 1.4, 0);
          if (s) { ti.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi); }
          vi += 2;
        }
      }
      var tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2)); tg.setIndex(ti); tg.computeVertexNormals();
      var tape = new THREE.Mesh(tg, MAT.tape); tape.castShadow = false; layers.cinta.add(tape);
      ID.cinta = [tape];
      // letreros de seguridad sobre el lado sur de la zona y junto a la caseta
      var bs = new Builder();
      signBoard(bs, 'peligro', zs.x1 - 6.2, zs.z1 + 0.6, 0.9, 0.63, 0);
      signBoard(bs, 'amargo', zs.x1 - 8.0, zs.z1 + 0.6, 0.9, 0.63, 0);
      signBoard(bs, 'epp', zs.x1 - 9.8, zs.z1 + 0.6, 0.9, 0.63, 0);
      signBoard(bs, 'fumar', zs.x1 + 0.6, zs.z0 + 8, 0.9, 0.63, PI / 2);
      signBoard(bs, 'peligro', zs.x0 + 4, zs.z0 - 0.6, 0.9, 0.63, PI);
      bs.flush('letreros');
      // punto de reunión: letrero + piso pintado
      var pr = MP.puntoReunion, bp = new Builder();
      signBoard(bp, 'reunion', pr.x, pr.z + 1.8, 0.8, 0.8, -PI * 0.25, 1.4);
      var pad = new THREE.PlaneGeometry(4, 4), uvp = pad.attributes.uv, q = signUV('reunion');
      for (i = 0; i < uvp.count; i++) uvp.setXY(i, lerp(q[0], q[2], uvp.getX(i)), lerp(q[1], q[3], uvp.getY(i)));
      pad.rotateX(-PI / 2); pad.rotateY(-PI * 0.25);
      var padM = new THREE.MeshStandardMaterial({ map: texSigns, roughness: 0.9, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false });
      var padMesh = new THREE.Mesh(pad, padM); padMesh.position.set(pr.x, 0.02, pr.z); padMesh.receiveShadow = true; root.add(padMesh);
      bp.flush('puntoReunion'); ID.puntoReunion.push(padMesh);
      // "A batería" en el lindero, velocidad máxima en el acceso
      var bb = new Builder();
      signBoard(bb, 'bateria', BX1 - 1.2, BZ + 1.3, 1.5, 0.5, 0, 1.2);
      bb.flush('letreroBateria');
      var bv = new Builder(), ac = MP.acceso.puntos;
      signBoard(bv, 'velocidad', ac[1][0] + 1.5, ac[1][1] - 4.2, 0.6, 0.8, PI / 2, 1.3);
      bv.flush('letreroAcceso');
    })();

    /* =========================== ACCESO (camino de terracería) =========================== */
    var accesoArrowsMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.amarillo), transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, toneMapped: false });
    function groundY(x, z) {
      var dx = Math.max(PL.x0 - x, 0, x - PL.x1), dz = Math.max(PL.z0 - z, 0, z - PL.z1), d = Math.max(dx, dz);
      return d <= 0 ? 0 : d >= 1.4 ? -0.32 : -0.32 * d / 1.4;
    }
    (function buildAccess() {
      var pts = MP.acceso.puntos.map(function (p) { return new V3(p[0], 0, p[1]); });
      var far = pts[0].clone().add(new V3(60, 0, 8));
      var all = [far].concat(pts);
      var cr = new THREE.CatmullRomCurve3(all, false, 'centripetal', 0.3);
      var L = cr.getLength(), n = Math.ceil(L / 0.8), P = cr.getSpacedPoints(n);
      var w = 6.2, pos = [], uv = [], idx = [], acc = 0;
      for (var i = 0; i <= n; i++) {
        var p = P[i], q = P[Math.min(n, i + 1)], o = P[Math.max(0, i - 1)];
        var tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
        if (i) acc += P[i].distanceTo(P[i - 1]);
        var ww = w * (i > n - 6 ? lerp(1, 0.7, (i - n + 6) / 6) : 1);
        for (var s = 0; s <= 4; s++) {
          var f = s / 4 - 0.5, x = p.x + nx * ww * f, z = p.z + nz * ww * f;
          pos.push(x, groundY(x, z) + 0.025, z); uv.push(acc / 4, s / 4);
        }
        if (i) for (s = 0; s < 4; s++) { var a = (i - 1) * 5 + s, c = i * 5 + s; idx.push(a, c, a + 1, a + 1, c, c + 1); }
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      var edgeA = canvasTex(4, 64, function (gg, ww2, hh) { var gr = gg.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#000'); gr.addColorStop(0.18, '#fff'); gr.addColorStop(0.82, '#fff'); gr.addColorStop(1, '#000'); gg.fillStyle = gr; gg.fillRect(0, 0, ww2, hh); }, { linear: true });
      // colores.camino es el tono final: la textura de grava (lineal, media 0.5) lo multiplica por ~0.5
      var roadMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(COL.camino).multiplyScalar(2), side: THREE.DoubleSide, map: texGravel.clone(), alphaMap: edgeA, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      roadMat.map.repeat.set(1, 3); roadMat.map.needsUpdate = true;
      var road = new THREE.Mesh(g, roadMat); road.receiveShadow = true; road.renderOrder = 0; root.add(road);
      ID.acceso = [road];
      // flechas pintadas (capa acceso) hacia la caseta
      var sh = new THREE.Shape(); sh.moveTo(-1.6, -0.35); sh.lineTo(0.3, -0.35); sh.lineTo(0.3, -0.9); sh.lineTo(1.6, 0); sh.lineTo(0.3, 0.9); sh.lineTo(0.3, 0.35); sh.lineTo(-1.6, 0.35); sh.closePath();
      var arrows = [];
      [0.12, 0.3, 0.48, 0.64, 0.8, 0.92].forEach(function (u) {
        var p = cr.getPointAt(u), t = cr.getTangentAt(u);
        var ag = new THREE.ShapeGeometry(sh); ag.rotateX(-PI / 2); ag.rotateY(Math.atan2(-t.z, t.x)); ag.translate(p.x, groundY(p.x, p.z) + 0.05, p.z);
        arrows.push(prep(ag));
      });
      var am = new THREE.Mesh(THREE.mergeGeometries(arrows), accesoArrowsMat); am.renderOrder = 2; layers.acceso.add(am);
      ID.accesoFlechas = [am];
    })();

    /* =========================== PERÍMETRO, MANGA DE VIENTO =========================== */
    (function buildPerimeter() {
      var inset = 0.7, x0 = PL.x0 + inset, x1 = PL.x1 - inset, z0 = PL.z0 + inset, z1 = PL.z1 - inset;
      var acc = MP.acceso.puntos[1][1];
      var runs = [[[x0, z0], [x1, z0]], [[x1, z0], [x1, acc - 3.8]], [[x1, acc + 3.8], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]];
      var b = new Builder(), postsP = [];
      runs.forEach(function (r) {
        var a = new V3(r[0][0], 0, r[0][1]), c = new V3(r[1][0], 0, r[1][1]), L = a.distanceTo(c), n = Math.max(1, Math.round(L / 3));
        for (var k = 0; k <= n; k++) postsP.push(a.clone().lerp(c, k / n));
        [0.55, 0.95].forEach(function (y) { b.add('galv', gCylAB(new V3(a.x, y, a.z), new V3(c.x, y, c.z), y > 0.7 ? 0.03 : 0.024, 8, true)); });
      });
      b.flush('barandal', null, { cast: true });
      var pg = gCyl(0.035, 0.035, 1.0, 8); pg.translate(0, 0.5, 0);
      var ip = new THREE.InstancedMesh(pg, MAT.galv, postsP.length), mm = new THREE.Matrix4();
      postsP.forEach(function (p, k) { mm.makeTranslation(p.x, 0, p.z); ip.setMatrixAt(k, mm); });
      ip.castShadow = true; ip.receiveShadow = true; root.add(ip);
      // manga de viento en poste
      var mv = MP.mangaViento, bw = new Builder();
      bw.add('galv', gCyl(0.05, 0.07, 6.2, 10), mat(mv.x, 3.1, mv.z));
      bw.add('concrete', gBox(0.6, 0.2, 0.6, 0.03), mat(mv.x, 0.1, mv.z));
      bw.flush('mangaViento');
    })();
    var sock = (function () {
      var g = new THREE.CylinderGeometry(0.11, 0.24, 1.7, 16, 6, true); g.rotateZ(PI / 2); g.translate(0.85 + 0.1, 0, 0);
      var m = new THREE.MeshStandardMaterial({ map: texSock, roughness: 0.8, side: THREE.DoubleSide });
      var me = new THREE.Mesh(g, m); var grp = new THREE.Group(); grp.add(me);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.015, 6, 20), MAT.galv); ring.rotation.y = PI / 2; ring.position.x = 0.1; grp.add(ring);
      grp.position.set(MP.mangaViento.x, 6.05, MP.mangaViento.z); root.add(grp);
      return grp;
    })();

    /* =========================== ENTORNO: palmeras, arbustos, esferas =========================== */
    (function buildEnv() {
      var r = U.rng(77), env = layers.entorno;
      function free(x, z, m) {
        if (x > PL.x0 - m && x < PL.x1 + m && z > PL.z0 - m && z < PL.z1 + m) return false;
        if (x > PL.x1 - 2 && Math.abs(z - (MP.acceso.puntos[0][1] + (x - PL.x1) * 0.12)) < 7) return false;
        if (x > PL.x1 - 2 && x < PL.x1 + 14 && Math.abs(z - BZ) < 3) return false;
        return true;
      }
      // palmera: tronco curvo + penacho de hojas (alphaMap con foliolos)
      var trunk = new THREE.CylinderGeometry(0.12, 0.2, 8, 7, 8, true); trunk.translate(0, 4, 0);
      var tpos = trunk.attributes.position;
      for (var i = 0; i < tpos.count; i++) { var y = tpos.getY(i); tpos.setX(i, tpos.getX(i) + 0.75 * Math.pow(y / 8, 2)); }
      trunk.computeVertexNormals();
      var tuv = trunk.attributes.uv; for (i = 0; i < tuv.count; i++) tuv.setY(i, tuv.getY(i) * 6);
      var fr = [];
      for (var k = 0; k < 12; k++) {
        var f = new THREE.PlaneGeometry(3.6, 1.1, 10, 1), fp = f.attributes.position;
        for (var j = 0; j < fp.count; j++) {
          var u = (fp.getX(j) + 1.8) / 3.6, wv = fp.getY(j);
          fp.setXYZ(j, u * 3.6, 0.9 * u - 1.9 * u * u + (k % 2 ? 0.15 : 0), wv * (0.35 + 0.65 * Math.sin(PI * Math.min(1, u * 1.1 + 0.05))));
        }
        f.rotateX(-0.25 + (k % 3) * 0.12); f.rotateY(k / 12 * TAU + (k % 2) * 0.2); f.translate(0.75, 7.9, 0);
        fr.push(prep(f));
      }
      var crownG = THREE.mergeGeometries(fr); crownG.computeVertexNormals();
      var nP = Math.round(150 * Q.veg), P = { near: [], far: [] };
      var mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), sv = new V3(), pv = new V3(), cnt = 0, tries = 0;
      var fc = new THREE.Color();
      while (cnt < nP && tries < 20000) {
        tries++;
        var x = -170 + r() * 360, z = -110 + r() * 250;
        var dEdge = Math.max(PL.x0 - x, x - PL.x1, PL.z0 - z, z - PL.z1);
        if (dEdge < 6 || !free(x, z, 6)) continue;
        var dens = (z > 0 ? 1 : 0.55) * (x < 0 ? 1 : 0.8) * clamp(1.3 - dEdge / 90, 0.15, 1);
        if (r() > dens) continue;
        var s = 0.75 + r() * 0.55;
        qq.setFromEuler(new THREE.Euler((r() - 0.5) * 0.12, r() * TAU, (r() - 0.5) * 0.12));
        mm.compose(pv.set(x, -0.32, z), qq, sv.set(s, s * (0.85 + r() * 0.35), s));
        fc.setHSL(0.22 + r() * 0.06, 0.38 + r() * 0.18, 0.3 + r() * 0.1, THREE.SRGBColorSpace);
        (dEdge < 22 ? P.near : P.far).push([mm.clone(), fc.clone()]);
        cnt++;
      }
      // solo las palmeras cercanas a la pera proyectan sombra (ahorra el pase de sombras)
      ['near', 'far'].forEach(function (k) {
        var L = P[k]; if (!L.length) return;
        var iT = new THREE.InstancedMesh(trunk, MAT.palmTrunk, L.length), iF = new THREE.InstancedMesh(crownG, MAT.palmFrond, L.length);
        L.forEach(function (o, j) { iT.setMatrixAt(j, o[0]); iF.setMatrixAt(j, o[0]); iF.setColorAt(j, o[1]); });
        [iT, iF].forEach(function (m) { m.castShadow = k === 'near'; m.receiveShadow = k === 'near'; env.add(m); });
      });
      // arbustos y monte bajo
      function blobCluster(seed, lobes) {
        var rb = U.rng(seed), parts = [], nrm = new V3();
        for (var l = 0; l < lobes; l++) {
          var rad = l ? 0.55 + rb() * 0.35 : 1, g = new THREE.IcosahedronGeometry(rad, 1), gp = g.attributes.position;
          var ph1 = rb() * 6, ph2 = rb() * 6;
          for (var q = 0; q < gp.count; q++) {
            nrm.fromBufferAttribute(gp, q).normalize();
            var dd = rad * (1 + 0.16 * Math.sin(nrm.x * 6.1 + ph1) * Math.cos(nrm.z * 5.3 + ph2) + 0.09 * Math.sin(nrm.y * 9.7 + ph1));
            gp.setXYZ(q, nrm.x * dd, Math.max(-0.25, nrm.y * dd * 0.78), nrm.z * dd);
          }
          var an = rb() * TAU, off = l ? 0.55 + rb() * 0.35 : 0;
          g.translate(Math.cos(an) * off, l ? -0.12 - rb() * 0.15 : 0, Math.sin(an) * off);
          parts.push(prep(smoothNormals(g)));
        }
        return THREE.mergeGeometries(parts);
      }
      var bush = blobCluster(13, 4);
      var nB = Math.round(320 * Q.veg), iB = new THREE.InstancedMesh(bush, MAT.bush, nB);
      cnt = 0; tries = 0;
      while (cnt < nB && tries < 30000) {
        tries++;
        x = -180 + r() * 380; z = -120 + r() * 270;
        dEdge = Math.max(PL.x0 - x, x - PL.x1, PL.z0 - z, z - PL.z1);
        if (dEdge < 3.5 || !free(x, z, 3.5)) continue;
        if (r() > clamp(1.2 - dEdge / 120, 0.2, 1)) continue;
        s = 0.8 + r() * 2.4;
        qq.setFromEuler(new THREE.Euler(0, r() * TAU, 0));
        mm.compose(pv.set(x, -0.32 + s * 0.1, z), qq, sv.set(s * (1 + r() * 0.8), s * (0.7 + r() * 0.5), s));
        iB.setMatrixAt(cnt, mm);
        fc.setHSL(0.2 + r() * 0.08, 0.32 + r() * 0.2, 0.2 + r() * 0.1, THREE.SRGBColorSpace); iB.setColorAt(cnt, fc);
        cnt++;
      }
      iB.count = cnt; iB.castShadow = false; iB.receiveShadow = false; env.add(iB);
      // árboles de copa ancha (monte) formando la línea de vegetación del fondo
      var crown = blobCluster(29, 5), tk = gCyl(0.12, 0.2, 1, 6); tk.translate(0, 0.5, 0);
      var nA = Math.round(140 * Q.veg), iA = new THREE.InstancedMesh(crown, MAT.bush, nA), iK = new THREE.InstancedMesh(tk, MAT.palmTrunk, nA);
      cnt = 0; tries = 0;
      while (cnt < nA && tries < 30000) {
        tries++;
        x = -230 + r() * 480; z = -170 + r() * 360;
        dEdge = Math.max(PL.x0 - x, x - PL.x1, PL.z0 - z, z - PL.z1);
        if (dEdge < 28 || !free(x, z, 28)) continue;
        if (r() > clamp((dEdge - 20) / 40, 0, 1) * (z > 0 || x < -60 ? 1 : 0.5)) continue;
        s = 2.4 + r() * 2.6; var th = 2.5 + r() * 3;
        qq.setFromEuler(new THREE.Euler(0, r() * TAU, 0));
        mm.compose(pv.set(x, -0.32 + th + s * 0.25, z), qq, sv.set(s * (1 + r() * 0.5), s * (0.7 + r() * 0.3), s * (1 + r() * 0.4)));
        iA.setMatrixAt(cnt, mm);
        fc.setHSL(0.22 + r() * 0.07, 0.3 + r() * 0.2, 0.16 + r() * 0.09, THREE.SRGBColorSpace); iA.setColorAt(cnt, fc);
        mm.compose(pv.set(x, -0.32, z), qq, sv.set(1, th + s * 0.3, 1)); iK.setMatrixAt(cnt, mm);
        cnt++;
      }
      iA.count = iK.count = cnt;
      [iA, iK].forEach(function (m) { m.castShadow = false; m.receiveShadow = false; env.add(m); });
      // esferas de almacenamiento al fondo (foto 01)
      var sp = [prep(new THREE.SphereGeometry(10, 28, 18).translate(0, 13, 0))];
      for (k = 0; k < 8; k++) { var an = k / 8 * TAU; sp.push(prep(gCylAB(new V3(Math.cos(an) * 9.2, 0, Math.sin(an) * 9.2), new V3(Math.cos(an) * 9.2, 12.5, Math.sin(an) * 9.2), 0.4, 8))); }
      sp.push(prep(gCyl(10.05, 10.05, 0.3, 28).translate(0, 13, 0)));
      var sg = THREE.mergeGeometries(sp), nS = 9, iS = new THREE.InstancedMesh(sg, MAT.sphereWhite, nS);
      for (k = 0; k < nS; k++) { mm.makeTranslation(-210 + k * 27 + (k > 5 ? 40 : 0), -0.32, -430 - (k % 2) * 8); iS.setMatrixAt(k, mm); }
      iS.receiveShadow = true; env.add(iS);
    })();

    /* =========================== COTAS =========================== */
    var cotaMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, toneMapped: false, transparent: true });
    var cotaDark = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.marino900), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7, toneMapped: false, transparent: true, opacity: 0.75 });
    var COTAS = [];
    function anchorPos(id) {
      if (id === 'arbol') return new V3(pz.x, 0, pz.z);
      if (id === 'separador') return new V3(sp.x, 0, sp.z);
      if (id === 'caseta') return new V3(MP.caseta.x, 0, MP.caseta.z);
      if (id === 'manifold') return new V3(mf.x, 0, mf.z);
      if (id === 'rtu') return new V3(MP.rtu.x, 0, MP.rtu.z);
      if (id === 'puntoReunion') return new V3(MP.puntoReunion.x, 0, MP.puntoReunion.z);
      return null;
    }
    (function buildCotas() {
      var wl = [], wd = [];
      function strip(a, c, w, list, y) {
        var d = new V3().subVectors(c, a), L = d.length(); if (L < 1e-3) return;
        var g = new THREE.PlaneGeometry(L, w); g.rotateX(-PI / 2); g.rotateY(-Math.atan2(d.z, d.x)); g.translate((a.x + c.x) / 2, y, (a.z + c.z) / 2); list.push(prep(g));
      }
      function head(p, dir, list, y, s) {
        var sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(-1.1 * s, 0.38 * s); sh.lineTo(-1.1 * s, -0.38 * s); sh.closePath();
        var g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2); g.rotateY(Math.atan2(-dir.z, dir.x)); g.translate(p.x, y, p.z); list.push(prep(g));
      }
      (MP.distancias || []).forEach(function (dd, k) {
        var a = anchorPos(dd.de), c = anchorPos(dd.a); if (!a || !c) return;
        var d = new V3().subVectors(c, a).normalize(), nrm = new V3(d.z, 0, -d.x), off = 3.2 * (k % 2 ? -1 : 1);
        var a2 = a.clone().addScaledVector(nrm, off), c2 = c.clone().addScaledVector(nrm, off);
        var y = 0.07;
        strip(a2, c2, 0.36, wd, y - 0.005); strip(a2, c2, 0.16, wl, y);
        strip(a.clone().addScaledVector(nrm, off * 0.15), a2.clone().addScaledVector(nrm, off * 0.1), 0.1, wl, y);
        strip(c.clone().addScaledVector(nrm, off * 0.15), c2.clone().addScaledVector(nrm, off * 0.1), 0.1, wl, y);
        head(a2, d.clone().negate(), wl, y + 0.002, 1); head(c2, d, wl, y + 0.002, 1);
        var mid = a2.clone().add(c2).multiplyScalar(0.5);
        COTAS.push({ de: dd.de, a: dd.a, m: dd.m, confirmar: !!dd.confirmar, p: [mid.x, 0.3, mid.z] });
      });
      if (wl.length) {
        var m1 = new THREE.Mesh(THREE.mergeGeometries(wd), cotaDark), m2 = new THREE.Mesh(THREE.mergeGeometries(wl), cotaMat);
        m1.renderOrder = 3; m2.renderOrder = 4; layers.cotas.add(m1); layers.cotas.add(m2);
      }
    })();

    /* =========================== FLUJOS =========================== */
    var STREAMS = ['mezcla', 'gas', 'liquido', 'salida'];
    var SPEED = { mezcla: 1.7, gas: 2.6, liquido: 0.9, salida: 1.5 };
    var CHEV_FILL = { mezcla: C.mezclaClaro, gas: C.gas, liquido: C.liquidoAmbar, salida: '#a8754a' };
    var FLOW = {};
    var _p = new V3(), _t = new V3(), _n1 = new V3(), _n2 = new V3(), _w = new V3(), _yb = new V3(), _m4 = new THREE.Matrix4(), _sv = new V3();
    function nearestS(smp, p) {
      var best = 0, bd = 1e9;
      for (var i = 0; i <= smp.n; i++) { var dx = smp.a[i * 3] - p.x, dy = smp.a[i * 3 + 1] - p.y, dz = smp.a[i * 3 + 2] - p.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
      return best / smp.n;
    }
    (function buildFlows() {
      var partGeo = new THREE.IcosahedronGeometry(1, 1);
      var chevGeo = new THREE.PlaneGeometry(1, 1);
      var ranges = {
        mezcla: [nearestS(sampler(RT.mezcla.path, 0.03), new V3(pz.x + 0.95, 1.25, pz.z)), nearestS(sampler(RT.mezcla.path, 0.03), L2W(-2.3, 2.05, 0))],
        gas: [nearestS(sampler(RT.gas.path, 0.03), L2W(0.7, 2.42, 0)), 1],
        liquido: [nearestS(sampler(RT.liquido.path, 0.03), L2W(0.55, 1.5, 0)), 1],
        salida: [0, nearestS(sampler(RT.salida.path, 0.03), new V3(BX1 + 2.4, 0.35, BZ))]
      };
      STREAMS.forEach(function (k, si) {
        var smp = sampler(RT[k].path, 0.025), r = U.rng(100 + si);
        var N = Math.max(12, Math.round(smp.L * 30 * Q.dens));
        var pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: k === 'liquido' ? 0.12 : 0.45, metalness: k === 'liquido' ? 0.35 : 0.05,
          emissive: new THREE.Color(k === 'gas' ? '#ffcf3a' : k === 'liquido' ? C.liquidoAmbar : '#000000'), emissiveIntensity: k === 'gas' ? 0.55 : k === 'liquido' ? 0.08 : 0 });
        var im = new THREE.InstancedMesh(partGeo, pm, N);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
        var ph = new Float32Array(N), oa = new Float32Array(N), ob = new Float32Array(N), sz = new Float32Array(N), sp2 = new Float32Array(N);
        var colA = { mezcla: [C.mezcla, '#6e4520', C.mezclaClaro, '#e9dcc0'], gas: [C.gas, '#ffe680', '#fff3c4', C.gas], liquido: [C.liquido, '#2a1c10', C.liquido, C.liquidoAmbar], salida: [C.salida, '#5a3a20', '#9b6a40', C.gas] }[k];
        var cc = new THREE.Color();
        for (var i = 0; i < N; i++) {
          ph[i] = (i + r() * 0.8) / N;
          var bub = r(), isB = (k === 'mezcla' && bub < 0.28) || (k === 'salida' && bub < 0.22) || (k === 'liquido' && bub < 0.1);
          sz[i] = isB ? 0.009 + r() * 0.008 : 0.014 + r() * 0.012;
          if (k === 'gas') sz[i] = 0.01 + r() * 0.01;
          var rr = (RP - 0.006 - sz[i]) * Math.sqrt(r()), an = r() * TAU; oa[i] = Math.cos(an) * rr; ob[i] = Math.sin(an) * rr;
          sp2[i] = 0.85 + r() * 0.3;
          cc.set(isB ? colA[3] : colA[(r() * 3) | 0]); im.setColorAt(i, cc);
        }
        im.visible = false; root.add(im);
        var nc = Math.max(4, Math.round(smp.L * (ranges[k][1] - ranges[k][0]) / 0.9));
        var cm = new THREE.MeshBasicMaterial({ map: chevronTex(CHEV_FILL[k]), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
        var ci = new THREE.InstancedMesh(chevGeo, cm, nc); ci.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ci.frustumCulled = false; ci.castShadow = false; ci.renderOrder = 5;
        root.add(ci);
        FLOW[k] = { smp: smp, N: N, im: im, ph: ph, oa: oa, ob: ob, sz: sz, sp: sp2, nc: nc, ci: ci, range: ranges[k], speed: SPEED[k] };
      });
    })();

    // Cintas de flujo sobre el piso (capa "lineas", vista en planta)
    var RIBBON = [];
    (function buildRibbons() {
      function ribbon(pts3, w, fill, arrow, speed, y, off) {
        var P = [];
        pts3.forEach(function (p) { var q = new V3(p.x, 0, p.z); if (!P.length || P[P.length - 1].distanceTo(q) > 0.05) P.push(q); });
        if (P.length < 2) return;
        var pos = [], uv = [], idx = [], acc = 0;
        for (var i = 0; i < P.length; i++) {
          var a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
          var d1 = new V3().subVectors(P[i], a), d2 = new V3().subVectors(c, P[i]);
          if (d1.lengthSq() < 1e-8) d1.copy(d2); if (d2.lengthSq() < 1e-8) d2.copy(d1);
          d1.normalize(); d2.normalize();
          var tn = d1.clone().add(d2).normalize(), nrm = new V3(-tn.z, 0, tn.x), miter = 1 / Math.max(0.5, nrm.dot(new V3(-d1.z, 0, d1.x)));
          if (i) acc += P[i].distanceTo(P[i - 1]);
          var cx = P[i].x + nrm.x * (off || 0), cz = P[i].z + nrm.z * (off || 0);
          pos.push(cx - nrm.x * w / 2 * miter, y, cz - nrm.z * w / 2 * miter, cx + nrm.x * w / 2 * miter, y, cz + nrm.z * w / 2 * miter);
          uv.push(acc / 4, 0, acc / 4, 1);
          if (i) { var b0 = (i - 1) * 2; idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); }
        }
        var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        var tex = ribbonTex(fill, arrow);
        var m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -9, side: THREE.DoubleSide });
        var me = new THREE.Mesh(g, m); me.renderOrder = 6; layers.lineas.add(me);
        RIBBON.push({ tex: tex, speed: speed, mat: m });
      }
      var mz = RT.mezcla.path.getSpacedPoints(400).filter(function (p, i, arr) { return i < arr.length - 6; });
      ribbon(mz, 1.1, C.mezcla, '#f3dfc0', SPEED.mezcla, 0.05);
      ribbon(RT.gas.path.getSpacedPoints(60), 0.6, '#d9a90a', '#3a2a00', SPEED.gas, 0.06, -0.5);
      ribbon(RT.liquido.path.getSpacedPoints(60), 0.6, '#2a1d12', C.liquidoAmbar, SPEED.liquido, 0.065, 0.55);
      ribbon(RT.salida.path.getSpacedPoints(500), 1.1, C.salida, '#f3dfc0', SPEED.salida, 0.055);
      CABLES.forEach(function (cv, k) { ribbon(cv.getSpacedPoints(120), 0.42, C.senal, '#ffffff', 1.2, 0.07 + k * 0.002); });
    })();

    /* ---------- partículas internas del separador (corte) ---------- */
    var inDyn = new THREE.Group(); inDyn.matrixAutoUpdate = false; inDyn.matrix.copy(sepM); layers.interior.add(inDyn);
    var IN = {};
    (function buildInternalParticles() {
      var geo = new THREE.IcosahedronGeometry(1, 1);
      function sys(name, n, colors, mopts, seed) {
        var m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.4, metalness: 0.05 }, mopts || {}));
        var im = new THREE.InstancedMesh(geo, m, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
        var r = U.rng(seed), c = new THREE.Color(), d = { im: im, n: n, a: new Float32Array(n), b: new Float32Array(n), c: new Float32Array(n), d: new Float32Array(n) };
        for (var i = 0; i < n; i++) { d.a[i] = r(); d.b[i] = r(); d.c[i] = r(); d.d[i] = r(); c.set(colors[(r() * colors.length) | 0]); im.setColorAt(i, c); }
        inDyn.add(im); IN[name] = d; return d;
      }
      sys('jet', Math.round(110 * Q.dens + 30), [C.mezcla, C.mezclaClaro, '#6e4520'], { roughness: 0.35 }, 201);
      sys('bubble', Math.round(170 * Q.dens + 40), ['#f4ead2', '#fff6dd', '#e6d4a8'], { roughness: 0.15, metalness: 0.1, emissive: new THREE.Color('#ffe9b0'), emissiveIntensity: 0.25 }, 202);
      sys('gas', Math.round(46 * Q.dens + 16), [C.gas, '#ffe680'], { emissive: new THREE.Color('#ffcf3a'), emissiveIntensity: 0.7, transparent: true, opacity: 0.7, depthWrite: false }, 203);
      sys('drop', Math.round(60 * Q.dens + 16), [C.liquidoAmbar, '#b86a10', C.liquido], { roughness: 0.12, metalness: 0.3, emissive: new THREE.Color(C.liquidoAmbar), emissiveIntensity: 0.15 }, 204);
    })();

    /* =========================== RESALTADO =========================== */
    function rimShader(clip) {
      return new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(C.amarillo) }, uI: { value: 0 }, uT: { value: 0 }, uMode: { value: 0 } },
        vertexShader: '#include <common>\n#include <clipping_planes_pars_vertex>\nuniform float uT; varying vec3 vN; varying vec3 vV;\nvoid main(){ vec3 p = position + normalize(normal) * uT; vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz); gl_Position = projectionMatrix * mvPosition;\n#include <clipping_planes_vertex>\n}',
        fragmentShader: '#include <clipping_planes_pars_fragment>\nuniform vec3 uColor; uniform float uI; uniform float uMode; varying vec3 vN; varying vec3 vV;\nvoid main(){\n#include <clipping_planes_fragment>\n float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 2.0); vec3 c = uMode > 0.5 ? uColor * uI : uColor * (0.1 + 1.4 * f) * uI; gl_FragColor = vec4(c, 1.0); }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        clipping: !!clip, clippingPlanes: clip ? CLIP_SEP : null, clipIntersection: true
      });
    }
    var HLM = { glow: rimShader(false), glowC: rimShader(true), hull: rimShader(false), hullC: rimShader(true) };
    [HLM.hull, HLM.hullC].forEach(function (m) { m.side = THREE.BackSide; m.blending = THREE.NormalBlending; m.uniforms.uMode.value = 1; });
    var XR = {}; STREAMS.forEach(function (k) { XR[k] = rimShader(false); XR[k].uniforms.uColor.value = new THREE.Color(k === 'liquido' ? C.liquidoAmbar : k === 'salida' ? '#c08850' : C[k]); });
    var HL = {};      // id → [{mesh, hull, glow}]
    var XRAY = {};    // stream → [{mesh, rim, key}]
    function isClip(m) { return m.material && m.material.clippingPlanes && m.material.clippingPlanes.length && m.material !== MAT.section; }
    Object.keys(ID).forEach(function (id) {
      HL[id] = [];
      ID[id].forEach(function (m) {
        if (m.isInstancedMesh || !m.geometry || !m.geometry.attributes.normal) return;
        var c = isClip(m);
        var h = new THREE.Mesh(m.geometry, c ? HLM.hullC : HLM.hull), g = new THREE.Mesh(m.geometry, c ? HLM.glowC : HLM.glow);
        [h, g].forEach(function (x) { x.matrixAutoUpdate = false; x.matrix.copy(m.matrix); x.visible = false; x.renderOrder = 8; x.frustumCulled = false; m.parent.add(x); });
        HL[id].push({ mesh: m, hull: h, glow: g });
      });
    });
    STREAMS.forEach(function (k) {
      XRAY[k] = STREAM[k].map(function (m) {
        var rim = new THREE.Mesh(m.geometry, XR[k]); rim.matrixAutoUpdate = false; rim.visible = false; rim.renderOrder = 7; m.parent.add(rim);
        return { mesh: m, rim: rim, key: m.userData.matKey };
      });
    });
    var HLGROUPS = {
      arbol: ['arbol'], estrangulador: ['estrangulador'], manifold: ['manifold'], lineaEntrada: ['lineaEntrada'],
      separador: ['separador'], coriolis: ['coriolis', 'CORIOLIS'], placa: ['placa', 'TDG'], recombinacion: ['recombinacion'],
      lineaSalida: ['lineaSalida'], lineaBateria: ['lineaBateria', 'letreroBateria'], caseta: ['caseta'], scada: ['caseta'], rtu: ['rtu'],
      psv: ['psv'], deflector: ['deflector'], extractor: ['extractor'], nivel: ['TN'], puntoReunion: ['puntoReunion'],
      zonaSeguridad: ['letreros'], acceso: ['letreroAcceso'], mangaViento: ['mangaViento'], pozosInactivos: ['pozosInactivos'],
      LV: ['LV'], PV: ['PV'], TDP: ['TDP'], TPS: ['TPS'], TT: ['TT'], TN: ['TN'], CORIOLIS: ['CORIOLIS'], TDG: ['TDG'], TDM: ['TDM'], TPL: ['TPL'],
      cables: ['cables'], gas: ['lineaGas'], liquido: ['lineaLiquido'], lineas: ['mezclaPozo', 'lineaEntrada', 'lineaSalida', 'lineaGas', 'lineaLiquido']
    };
    // listas aplanadas para que renderAt no cree arreglos ni funciones
    var HL_ALL = [], HL_BY_ID = {}, EMPTY_ARR = [];
    Object.keys(HL).forEach(function (k) { HL_ALL.push.apply(HL_ALL, HL[k]); });
    Object.keys(HLGROUPS).forEach(function (id) { HL_BY_ID[id] = []; HLGROUPS[id].forEach(function (gid) { HL_BY_ID[id].push.apply(HL_BY_ID[id], HL[gid] || []); }); });
    var RING_R = { arbol: 2.6, estrangulador: 0.9, manifold: 2.0, separador: 4.4, caseta: 5.6, scada: 5.6, rtu: 0.9, puntoReunion: 2.8, mangaViento: 1.2, recombinacion: 0.7, coriolis: 0.8, placa: 0.8, pozosInactivos: 0 };
    var ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.amarillo), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    var ring1 = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), ringMat), ring2 = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), ringMat.clone());
    [ring1, ring2].forEach(function (m) { m.visible = false; m.renderOrder = 9; m.frustumCulled = false; root.add(m); });
    var bill = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), ringMat.clone()); bill.visible = false; bill.renderOrder = 9; bill.frustumCulled = false; root.add(bill);

    /* =========================== CIELO, LUCES, ENTORNO PMREM =========================== */
    // Cielo: degradado + nubes horneados en una textura equirectangular (una sola lectura por píxel,
    // se dibuja después de lo opaco para que solo se sombreen los píxeles libres)
    var texSky = canvasTex(2048, 512, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h); // v: 0 = cenit … 0.5 = horizonte … 1 = nadir
      gr.addColorStop(0.0, '#1b55aa'); gr.addColorStop(0.2, '#2c6bbf'); gr.addColorStop(0.36, '#5895d6');
      gr.addColorStop(0.46, '#a3c4e4'); gr.addColorStop(0.5, '#c9dbe8'); gr.addColorStop(0.52, '#a9b597'); gr.addColorStop(1, '#8f9c78');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var r = U.rng(3);
      function blob(x, y, rx, ry, a) {
        [x - w, x, x + w].forEach(function (xx) {
          g.save(); g.translate(xx, y); g.scale(1, ry / rx);
          var q = g.createRadialGradient(0, 0, 0, 0, 0, rx); q.addColorStop(0, 'rgba(255,253,248,' + a + ')'); q.addColorStop(1, 'rgba(255,253,248,0)');
          g.fillStyle = q; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
        });
      }
      for (var i = 0; i < 70; i++) { var cx = r() * w, cy = h * 0.5 - 5 - r() * 44; for (var k = 0; k < 7; k++) blob(cx + (r() - 0.5) * 120, cy + (r() - 0.5) * 12, 22 + r() * 46, 6 + r() * 10, 0.22 + r() * 0.32); }
      for (i = 0; i < 34; i++) { var x0 = r() * w, y0 = h * 0.08 + r() * h * 0.3; for (k = 0; k < 10; k++) blob(x0 + k * 22 + r() * 10, y0 + (r() - 0.5) * 6, 30 + r() * 40, 3 + r() * 4, 0.1 + r() * 0.12); }
    }, { wrapS: true });
    var sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.MeshBasicMaterial({ map: texSky, side: THREE.BackSide, depthWrite: false, fog: false }));
    sky.frustumCulled = false; sky.renderOrder = 1000; scene.add(sky);
    scene.fog = new THREE.Fog(new THREE.Color('#c9dbe8'), 200, 1200);
    var hemi = new THREE.HemisphereLight(new THREE.Color('#d4e6f7'), new THREE.Color('#b59f78'), 1.05); scene.add(hemi);
    var sun = new THREE.DirectionalLight(new THREE.Color('#fff0d8'), 3.1);
    sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 600;
    scene.add(sun); scene.add(sun.target);
    var SUN_DIR = new V3(-0.42, 0.78, 0.47).normalize();
    var pmrem = new THREE.PMREMGenerator(renderer);
    var envRT = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04);
        // Reflejos del entorno PMREM solo en materiales metálicos (y un toque en pintura brillante):
    // el resto usa la luz hemisférica, lo que reduce mucho el costo en SwiftShader.
    var GLOSS = Q.gloss ? { vesselOut: 0.35, pipeGreen: 0.3, treeGreen: 0.3, flange: 0.25, psv: 0.3, ehBlue: 0.35, actuator: 0.3, trailer: 0.2, liqTop: 0.8 } : { liqTop: 0.8 };
    Object.keys(MAT).concat(Object.keys(GHOST).map(function (k) { return '#' + k; })).forEach(function (k) {
      var m = k[0] === '#' ? GHOST[k.slice(1)] : MAT[k], base = k[0] === '#' ? k.slice(1) : k;
      if (!m || !m.isMeshStandardMaterial) return;
      if (m.metalness >= 0.3 && Q.env) { m.envMap = envRT.texture; m.envMapIntensity = 0.75; }
      else if (GLOSS[base]) { m.envMap = envRT.texture; m.envMapIntensity = GLOSS[base]; }
    });
    pmrem.dispose();

    /* =========================== ANCLAS Y TOMAS =========================== */
    var top = SEP.cy + SEP.R;
    function arr(v) { return [Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000, Math.round(v.z * 1000) / 1000]; }
    var A = {
      arbol: [pz.x, 1.55, pz.z],
      estrangulador: arr(choke),
      manifold: [mf.x + 0.2, 0.75, mf.z],
      lineaEntrada: [lerp(diagA.x, inEnd.x - 1.5, 0.5), 0.45, lerp(diagA.z, inEnd.z, 0.5)],
      separador: arr(L2W(-0.55, 2.05, 0)),
      coriolis: arr(L2W(SK.xCor, SK.yL, SK.zL)),
      placa: arr(L2W(SK.xOri, SK.yG, SK.zG)),
      recombinacion: arr(L2W(SK.xTe, SK.yL, SK.zL)),
      lineaBateria: [(BX + BX1) / 2 + 2, 0.45, BZ],
      caseta: [MP.caseta.x, 2.3, MP.caseta.z],
      rtu: [MP.rtu.x, 1.3, MP.rtu.z + 0.05],
      zonaSeguridad: [MP.zonaSeguridad.x1 - 8, 1.6, MP.zonaSeguridad.z1 + 0.6],
      acceso: [PL.x1 + 5, 0.1, MP.acceso.puntos[1][1]],
      puntoReunion: [MP.puntoReunion.x, 1.6, MP.puntoReunion.z + 1.8],
      deflector: arr(L2W(SEP.xw + 0.2, SEP.cy + 0.06, -0.1)),
      extractor: arr(L2W(0.47, SEP.cy + 0.18, -0.12)),
      nivel: arr(L2W(-0.7, SEP.cy - SEP.Ri + 0.45 * 2 * SEP.Ri, -0.12)),
      psv: arr(L2W(-1.2, top + 0.45, 0)),
      TDP: [pz.x + 1.12, 1.25 + RP + 0.165, pz.z],
      TPS: arr(L2W(0.4, top + 0.335, 0)),
      TT: arr(L2W(-0.55, top + 0.225, 0)),
      TN: arr(L2W(0.05, top + 0.31, 0)),
      CORIOLIS: arr(L2W(SK.xCor, SK.yL + 0.25, SK.zL)),
      TDG: arr(L2W(SK.xOri, SK.yG + 0.237, SK.zG + 0.3)),
      TDM: arr(L2W(SK.xTDM, SK.yL + RP + 0.165, SK.zL)),
      TPL: [BX + 1.25, 0.35 + RP + 0.165, BZ],
      // extensiones
      LV: arr(L2W(SK.xLV, SK.yL + 0.38, SK.zL)), PV: arr(L2W(SK.xPV, SK.yG, SK.zG + RP * 6.3)), lineaSalida: [30, 0.45, (southZ + BZ) / 2],
      mangaViento: [MP.mangaViento.x, 6.1, MP.mangaViento.z], pozosInactivos: [MP.pozos[2].x, 1.4, MP.pozos[2].z], scada: [MP.caseta.x, 2.3, MP.caseta.z]
    };
    var S = function (pos, target, fov) { return { pos: pos, target: target, fov: fov || 40 }; };
    var sx = sp.x, sz = sp.z;
    var mLiq = (SK.xCor + SK.xLV) / 2, mGas = (SK.xOri + SK.xPV) / 2;
    var SHOTS = {
      aerea: S([sx + 46, 62, sz + 74], [sx - 8, 0, sz - 9], 40),
      establecimiento: S([pz.x - 16, 5.2, pz.z + 21], [pz.x + 9, 1.2, pz.z + 6.5], 36),
      arbol: S([pz.x + 3.6, 2.9, pz.z + 5.4], [pz.x + 0.5, 1.15, pz.z], 40),
      estrangulador: S([choke.x + 2.6, 2.1, choke.z + 3.0], [choke.x - 0.1, 0.95, choke.z], 38),
      lineaEntrada: S([mf.x - 3.0, 3.6, mf.z + 9.5], [mf.x + 6.5, 0.6, mf.z + 3.5], 42),
      separador: S([sx - 2.6, 3.4, sz + 7.6], [sx + 0.1, 1.45, sz], 40),
      separadorCorte: S([sx - 0.6, 2.45, sz + 3.7], [sx - 0.6, 1.85, sz], 42),
      // medidor (este, a la derecha) → válvula de control (oeste, a la izquierda) en el mismo cuadro
      medicionLiquido: S(arr(L2W(mLiq - 0.5, 1.6, 2.3)), arr(L2W(mLiq + 0.12, 1.04, SK.zL)), 40),
      medicionGas: S(arr(L2W(mGas + 0.82, 2.1, 2.4)), arr(L2W(mGas - 0.08, 1.4, -0.05)), 42),
      recombinacion: S(arr(L2W(SK.xTe - 2.0, 1.85, 2.6)), arr(L2W(SK.xTe - 0.3, 1.0, SK.zL)), 40),
      bateria: S([BX - 3, 6.5, BZ + 12], [BX + 6, 0.3, BZ], 42),
      caseta: S([MP.caseta.x - 9.5, 4.2, MP.caseta.z + 10.5], [MP.caseta.x - 1.5, 1.5, MP.caseta.z], 40),
      // extras
      rtu: S([MP.rtu.x - 1.5, 2.0, MP.rtu.z + 2.4], [MP.rtu.x, 1.2, MP.rtu.z], 40),
      manifold: S([mf.x - 2.2, 2.6, mf.z + 3.6], [mf.x + 0.3, 0.5, mf.z], 40),
      zonaSeguridad: S([MP.zonaSeguridad.x1 + 10, 14, MP.zonaSeguridad.z1 + 16], [(MP.zonaSeguridad.x0 + MP.zonaSeguridad.x1) / 2 + 3, 0, (MP.zonaSeguridad.z0 + MP.zonaSeguridad.z1) / 2], 42),
      acceso: S([PL.x1 + 18, 10, MP.acceso.puntos[0][1] + 14], [PL.x1 - 6, 0, MP.acceso.puntos[1][1] - 3], 42),
      puntoReunion: S([MP.puntoReunion.x - 6, 4, MP.puntoReunion.z + 8], [MP.puntoReunion.x, 0.9, MP.puntoReunion.z + 0.6], 40),
      lineaBateria: S([BX + 4, 5.5, BZ + 10], [BX + 12, 0.3, BZ], 42),
      planta: null
    };
    function poseFor(id) {
      if (SHOTS[id]) return SHOTS[id];
      var a = A[id]; if (!a) return SHOTS.aerea;
      var rr = { separador: 8, caseta: 12, arbol: 6, lineaEntrada: 14, zonaSeguridad: 30, acceso: 20, lineaSalida: 16, mangaViento: 10, pozosInactivos: 16, scada: 12, cables: 18 }[id] || 2.6;
      return S([a[0] + rr * 0.55, a[1] + rr * 0.45, a[2] + rr * 0.75], a.slice(), 40);
    }

    /* =========================== CÁMARA =========================== */
    var PLAN_FOV = 4;
    function Sph() { return { t0: 0, t1: 0, t2: 0, r: 1, az: 0, el: 0.5, fov: 40 }; }
    var s3 = Sph(), sPl = Sph(), sB = Sph(), sA = Sph(), sC = Sph();
    var lastPose = { pos: [0, 0, 0], target: [0, 0, 0], fov: 40 }, lastR = 10, lastOrtho = 0;
    function toSph(p, o) {
      var dx = p.pos[0] - p.target[0], dy = p.pos[1] - p.target[1], dz = p.pos[2] - p.target[2];
      var r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      o.t0 = p.target[0]; o.t1 = p.target[1]; o.t2 = p.target[2]; o.r = r;
      o.az = Math.atan2(dx, dz); o.el = Math.asin(clamp(dy / r, -1, 1)); o.fov = p.fov || 40; return o;
    }
    function planSph(st, o) {
      var pl = st.planta || {}, c = pl.centro || [(PL.x0 + PL.x1) / 2 + 5, (PL.z0 + PL.z1) / 2 + 1];
      var pad = pl.padding || st.encuadre || {}, pL = pad.left || 0, pR = pad.right || 0, pT = pad.top || 0, pB = pad.bottom || 0;
      var aw = Math.max(40, W - pL - pR), ah = Math.max(40, H - pT - pB);
      var mpp = pl.ancho ? pl.ancho / aw : Math.max((PL.x1 - PL.x0 + 24) / aw, (PL.z1 - PL.z0 + 12) / ah);
      var halfH = mpp * H / 2;
      o.t0 = c[0] - (pL - pR) / 2 * mpp; o.t1 = 0; o.t2 = c[1] - (pT - pB) / 2 * mpp;
      o.fov = PLAN_FOV; o.r = halfH / Math.tan(PLAN_FOV * PI / 360); o.az = 0; o.el = PI / 2 - 0.0012;
      return o;
    }
    function blendSph(a, b, k, o) {
      o.t0 = lerp(a.t0, b.t0, k); o.t1 = lerp(a.t1, b.t1, k); o.t2 = lerp(a.t2, b.t2, k);
      var ta = Math.tan(a.fov * PI / 360), tb = Math.tan(b.fov * PI / 360);
      var h = Math.exp(lerp(Math.log(a.r * ta), Math.log(b.r * tb), k));
      o.fov = Math.exp(lerp(Math.log(a.fov), Math.log(b.fov), k));
      o.r = h / Math.tan(o.fov * PI / 360);
      o.az = a.az + angDiff(a.az, b.az) * k; o.el = lerp(a.el, b.el, k);
      return o;
    }
    var _tgt = new V3();
    var viewOff = { x: 0, y: 0 };
    function applySph(s) {
      var el = clamp(s.el, -0.2, PI / 2 - 0.0008), ce = Math.cos(el);
      camera.position.set(s.t0 + s.r * ce * Math.sin(s.az), s.t1 + s.r * Math.sin(el), s.t2 + s.r * ce * Math.cos(s.az));
      _tgt.set(s.t0, s.t1, s.t2); camera.up.set(0, 1, 0); camera.lookAt(_tgt);
      camera.fov = s.fov; camera.aspect = W / H;
      camera.near = Math.max(0.03, s.r * 0.015); camera.far = s.r + 2200;
      if (viewOff.x || viewOff.y) camera.setViewOffset(W, H, viewOff.x, viewOff.y, W, H); else camera.clearViewOffset();
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      lastPose.pos[0] = camera.position.x; lastPose.pos[1] = camera.position.y; lastPose.pos[2] = camera.position.z;
      lastPose.target[0] = s.t0; lastPose.target[1] = s.t1; lastPose.target[2] = s.t2; lastPose.fov = s.fov; lastR = s.r;
    }
    function lerpShot(a, b, k, o) {
      o = o || {};
      var ease = o.ease === false ? clamp(k, 0, 1) : smoother(k);
      toSph(a, sA); toSph(b, sC);
      var dT = Math.hypot(sC.t0 - sA.t0, sC.t1 - sA.t1, sC.t2 - sA.t2);
      blendSph(sA, sC, ease, sB);
      var hop = (o.hop == null ? 0.28 : o.hop) * dT * Math.sin(PI * ease);
      sB.r += hop; sB.el += (o.hop == null ? 0.18 : 0) * Math.sin(PI * ease) * clamp(dT / 20, 0, 1);
      var el = clamp(sB.el, -0.2, PI / 2 - 0.0008), ce = Math.cos(el);
      var out = o.out || { pos: [0, 0, 0], target: [0, 0, 0], fov: 40 };
      out.pos = [sB.t0 + sB.r * ce * Math.sin(sB.az), sB.t1 + sB.r * Math.sin(el), sB.t2 + sB.r * ce * Math.cos(sB.az)];
      out.target = [sB.t0, sB.t1, sB.t2]; out.fov = sB.fov;
      return out;
    }
    var TOUR_DEF = ['establecimiento', 'arbol', 'estrangulador', 'lineaEntrada', 'separador', 'separadorCorte', 'medicionLiquido', 'medicionGas', 'recombinacion', 'bateria', 'caseta', 'aerea'];
    function tour(u, names) {
      names = names || TOUR_DEF;
      var P = names.map(function (n) { return toSph(typeof n === 'string' ? (SHOTS[n] || poseFor(n)) : n, Sph()); });
      for (var i = 1; i < P.length; i++) P[i].az = P[i - 1].az + angDiff(P[i - 1].az, P[i].az);
      var n = P.length - 1, x = clamp(u, 0, 1) * n, i0 = Math.min(n - 1, Math.floor(x)), f = x - i0;
      var p0 = P[Math.max(0, i0 - 1)], p1 = P[i0], p2 = P[i0 + 1], p3 = P[Math.min(n, i0 + 2)];
      function cr(a, b, c, d) { var t2 = f * f, t3 = t2 * f; return 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); }
      var s = { t0: cr(p0.t0, p1.t0, p2.t0, p3.t0), t1: cr(p0.t1, p1.t1, p2.t1, p3.t1), t2: cr(p0.t2, p1.t2, p2.t2, p3.t2),
        r: Math.exp(cr(Math.log(p0.r), Math.log(p1.r), Math.log(p2.r), Math.log(p3.r))), az: cr(p0.az, p1.az, p2.az, p3.az), el: cr(p0.el, p1.el, p2.el, p3.el), fov: cr(p0.fov, p1.fov, p2.fov, p3.fov) };
      var el = clamp(s.el, -0.2, PI / 2 - 0.0008), ce = Math.cos(el);
      return { pos: [s.t0 + s.r * ce * Math.sin(s.az), s.t1 + s.r * Math.sin(el), s.t2 + s.r * ce * Math.cos(s.az)], target: [s.t0, s.t1, s.t2], fov: s.fov };
    }
    function planPose(st) { planSph(st || {}, sA); var ce = Math.cos(sA.el); return { pos: [sA.t0 + sA.r * ce * Math.sin(sA.az), sA.t1 + sA.r * Math.sin(sA.el), sA.t2 + sA.r * ce * Math.cos(sA.az)], target: [sA.t0, sA.t1, sA.t2], fov: sA.fov }; }

    /* =========================== renderAt =========================== */
    var EMPTY = {}, FLUJO_DEF = { mezcla: 1, gas: 1, liquido: 1, salida: 1 };
    var shadowKey = new Float64Array(8), shadowKeyPrev = new Float64Array(8).fill(NaN);
    var _cam = new V3(), _loc = new V3(), _q2 = new THREE.Quaternion();
    var sepInv = new THREE.Matrix4().copy(sepM).invert();
    var LP = { z: new THREE.Plane(new V3(0, 0, -1), 0), x: new THREE.Plane(new V3(1, 0, 0), 0), cx: new THREE.Plane(new V3(-1, 0, 0), 0) };
    var xW = SEP.xw - SEP.hd, xE = SEP.xe + SEP.hd;

    var GHOST_KEYS = Object.keys(GHOST);
    function updateFlows(t, st) {
      var fl = st.flujo || FLUJO_DEF, rx = clamp(st.rayosX || 0, 0, 1);
      rxFlag = rx > 0.001 ? 1 : 0;
      var tanHalf = Math.tan(camera.fov * PI / 360);
      for (var si = 0; si < STREAMS.length; si++) {
        var k = STREAMS[si], F = FLOW[k], I = clamp(fl[k] == null ? 1 : +fl[k], 0, 1), smp = F.smp;
        // partículas dentro de la tubería
        var showP = I > 0.001 && rx > 0.01;
        F.im.visible = showP;
        if (showP) {
          var n = Math.max(1, Math.round(F.N * I));
          for (var i = 0; i < n; i++) {
            var s = frac(F.ph[i] + F.speed * F.sp[i] * t / smp.L);
            smp.at(s, _p); smp.tan(s, _t);
            if (Math.abs(_t.y) > 0.9) _n1.set(1, 0, 0); else _n1.set(0, 1, 0);
            _n2.crossVectors(_t, _n1).normalize(); _n1.crossVectors(_n2, _t).normalize();
            var wob = Math.sin(t * 3.1 + i * 1.7) * 0.15;
            _p.addScaledVector(_n1, F.oa[i] * (1 + wob)).addScaledVector(_n2, F.ob[i] * (1 - wob));
            var sc = F.sz[i] * (s < 0.01 ? s / 0.01 : 1);
            _m4.makeScale(sc, sc, sc); _m4.setPosition(_p); F.im.setMatrixAt(i, _m4);
          }
          F.im.count = n; F.im.instanceMatrix.needsUpdate = true;
        }
        // chevrons sobre la tubería (siempre que haya flujo)
        F.ci.visible = I > 0.001;
        if (F.ci.visible) {
          var r0 = F.range[0], r1 = F.range[1], Lr = smp.L * (r1 - r0);
          var mpp = 2 * lastR * tanHalf / H, sizeT = clamp(15 * mpp, 0.12, 2.6);
          var step = 1; while (step < 64 && (Lr / F.nc) * step < sizeT * 2.4) step *= 2;
          var fade = smooth(I * 1.4);
          for (var j = 0; j < F.nc; j++) {
            if (j % step) { _m4.makeScale(0, 0, 0); F.ci.setMatrixAt(j, _m4); continue; }
            var u = frac(j / F.nc + F.speed * t / Lr), s2 = r0 + (r1 - r0) * u;
            smp.at(s2, _p); smp.tan(s2, _t);
            _w.subVectors(camera.position, _p); var dist = _w.length();
            _w.addScaledVector(_t, -_w.dot(_t)); if (_w.lengthSq() < 1e-8) _w.set(0, 1, 0); _w.normalize();
            var size = clamp(15 * 2 * dist * tanHalf / H, 0.12, 2.6) * fade * smooth(Math.min(u, 1 - u) / 0.03);
            _yb.crossVectors(_w, _t).normalize();
            _p.addScaledVector(_w, RP + 0.02 + size * 0.12);
            _m4.makeBasis(_t, _yb, _w); _sv.set(size, size, size); _m4.scale(_sv); _m4.setPosition(_p);
            F.ci.setMatrixAt(j, _m4);
          }
          F.ci.instanceMatrix.needsUpdate = true;
        }
        // rayos X: tuberías translúcidas con borde brillante
        var XL = XRAY[k];
        for (var xi = 0; xi < XL.length; xi++) {
          var o = XL[xi], key = o.key;
          if (rx > 0.001 && GHOST[key]) { o.mesh.material = GHOST[key]; o.mesh.castShadow = false; }
          else { o.mesh.material = MAT[key]; o.mesh.castShadow = !MAT[key].userData.noCast; }
          o.rim.visible = rx > 0.001; o.rim.matrix.copy(o.mesh.matrix);
        }
        XR[k].uniforms.uI.value = rx * 0.9;
      }
      for (var gi = 0; gi < GHOST_KEYS.length; gi++) { var gm = GHOST[GHOST_KEYS[gi]]; gm.opacity = lerp(1, 0.14, smooth(rx * 1.6)); gm.depthWrite = rx < 0.15; }
      var ro = lerp(0.4, 1, smooth(lastOrtho));
      for (var ri = 0; ri < RIBBON.length; ri++) { RIBBON[ri].tex.offset.x = -frac(t * RIBBON[ri].speed / 4); RIBBON[ri].mat.opacity = ro; }
    }

    var _bub = new V3();
    function updateCut(t, st) {
      var c = clamp(st.corte || 0, 0, 1), on = c > 0.0005;
      var nivel = clamp(st.nivel == null ? 0.45 : +st.nivel, 0.05, 0.92);
      var h = SEP.cy - SEP.Ri + nivel * 2 * SEP.Ri;
      A.nivel[1] = Math.round(h * 1000) / 1000;
      liqU.level.value = h; liqU.t.value = t; // el remolque solo gira en y: la altura local es la del mundo
      var xs = on ? lerp(xW - 0.02, xE + 0.02, smoother(c)) : -1e4;
      LP.z.set(_loc.set(0, 0, -1), 0); clipZ.copy(LP.z).applyMatrix4(sepM);
      LP.x.set(_loc.set(1, 0, 0), -xs); clipX.copy(LP.x).applyMatrix4(sepM);
      LP.cx.set(_loc.set(-1, 0, 0), xs); clipCapX.copy(LP.cx).applyMatrix4(sepM);
      clipLevel.set(_loc.set(0, -1, 0), h);
      layers.interior.visible = on;
      if (!on) return;
      // tapa frontal móvil (sección perpendicular al eje)
      var rr = rAt(xs, SEP.R, SEP.hd) / SEP.R;
      liq.front.visible = xs > xW + 0.01 && xs < xE - 0.01 && rr > 0.05;
      liq.front.position.copy(L2Wf(xs, SEP.cy, 0)); liq.front.scale.set(1, rr, rr); liq.front.quaternion.setFromRotationMatrix(sepM);
      // superficie del líquido ondulada (determinista)
      var g = liq.surf.geometry, P = g.attributes.position, NX = liq.NX, NZ = liq.NZ, dy = h - SEP.cy;
      var fl = st.flujo || FLUJO_DEF, mz = clamp(fl.mezcla == null ? 1 : fl.mezcla, 0, 1);
      for (var ix = 0; ix <= NX; ix++) {
        var x = lerp(SEP.xw - SEP.hdi, SEP.xe + SEP.hdi, ix / NX), ri = rAt(x, SEP.Ri, SEP.hdi) - 0.004, wv = ri > Math.abs(dy) ? Math.sqrt(ri * ri - dy * dy) : 0;
        for (var iz = 0; iz <= NZ; iz++) {
          var zf = iz / NZ, z = -wv * zf;
          var turb = Math.exp(-Math.pow((x - (SEP.xw + 0.25)) / 0.35, 2)) * mz;
          var y = h + 0.006 * Math.sin(x * 9 - t * 2.6) + 0.004 * Math.sin(x * 17 + z * 21 + t * 3.7) + turb * 0.012 * Math.sin(t * 7 + x * 30 + z * 13);
          P.setXYZ(ix * (NZ + 1) + iz, x, y, z);
        }
      }
      P.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
      // partículas internas
      var sepLen = SEP.xe - SEP.xw;
      var mg = clamp(fl.gas == null ? 1 : fl.gas, 0, 1), ml = clamp(fl.liquido == null ? 1 : fl.liquido, 0, 1);
      var J = IN.jet, nJ = Math.round(J.n * mz), xn = SEP.xw - SEP.hd + 0.02, xd = SEP.xw + 0.18, yIn = 2.05;
      for (var i = 0; i < J.n; i++) {
        if (i >= nJ) { _m4.makeScale(0, 0, 0); J.im.setMatrixAt(i, _m4); continue; }
        var u = frac(J.a[i] + t * (0.9 + J.b[i] * 0.5)), sc = 0.006 + J.c[i] * 0.01, px, py, pz2;
        var zz = -0.02 - J.d[i] * 0.2;
        if (u < 0.3) { var f = u / 0.3; px = lerp(xn, xd - 0.02, f); py = yIn + (J.c[i] - 0.5) * 0.04; pz2 = lerp(-0.01 - J.d[i] * 0.03, zz * 0.4, f); }
        else {
          var f2 = (u - 0.3) / 0.7, vx = 0.04 + J.b[i] * 0.22, up = J.c[i] < 0.12;
          px = xd + 0.01 + vx * f2 - (up ? 0.05 * f2 : 0); py = yIn + (up ? 0.16 * f2 : -0.9 * f2 * f2 - 0.08 * f2) + (J.c[i] - 0.5) * 0.08; pz2 = zz;
          if (py < h || py > SEP.cy + SEP.Ri - 0.02) { sc = 0; }
        }
        _m4.makeScale(sc, sc, sc); _m4.setPosition(px, py, pz2); J.im.setMatrixAt(i, _m4);
      }
      J.im.instanceMatrix.needsUpdate = true;
      var B = IN.bubble, nB = Math.round(B.n * Math.max(mz, ml * 0.6));
      for (i = 0; i < B.n; i++) {
        if (i >= nB) { _m4.makeScale(0, 0, 0); B.im.setMatrixAt(i, _m4); continue; }
        var bx = SEP.xw + Math.pow(B.a[i], 1.6) * (sepLen - 0.1), life = frac(B.b[i] + t * (0.18 + B.c[i] * 0.25));
        var y0 = SEP.cy - SEP.Ri + 0.02 + B.d[i] * 0.06, by = lerp(y0, h - 0.004, life);
        var bz = -0.006 - B.c[i] * 0.06, bs = (0.004 + B.d[i] * 0.007) * (0.6 + life * 0.6);
        var rx2 = bx + Math.sin(t * 4 + i) * 0.01;
        if (h - y0 < 0.02) bs = 0;
        _m4.makeScale(bs, bs, bs); _m4.setPosition(rx2, by, bz); B.im.setMatrixAt(i, _m4);
      }
      B.im.instanceMatrix.needsUpdate = true;
      var G = IN.gas, nG = Math.round(G.n * mg), xPad = 0.42, yTop = SEP.cy + SEP.Ri - 0.03;
      for (i = 0; i < G.n; i++) {
        if (i >= nG) { _m4.makeScale(0, 0, 0); G.im.setMatrixAt(i, _m4); continue; }
        var gu = frac(G.a[i] + t * (0.35 + G.b[i] * 0.2)), gx, gy, gz = -0.03 - G.d[i] * 0.2, gs = 0.005 + G.c[i] * 0.005;
        var ylo = Math.min(yTop - 0.02, h + 0.04);
        if (gu < 0.85) { var g1 = gu / 0.85; gx = lerp(xd + 0.05, xPad + 0.1, g1); gy = lerp(ylo, yTop, G.c[i]) + Math.sin(t * 2 + i) * 0.01; }
        else { var g2 = (gu - 0.85) / 0.15; gx = lerp(xPad + 0.1, 0.7, g2); gy = lerp(lerp(ylo, yTop, G.c[i]), yTop + 0.06, g2 * g2); gz = gz * (1 - g2); }
        _m4.makeScale(gs, gs, gs); _m4.setPosition(gx, gy, gz); G.im.setMatrixAt(i, _m4);
      }
      G.im.instanceMatrix.needsUpdate = true;
      var Dd = IN.drop, nD = Math.round(Dd.n * mg);
      for (i = 0; i < Dd.n; i++) {
        if (i >= nD) { _m4.makeScale(0, 0, 0); Dd.im.setMatrixAt(i, _m4); continue; }
        var du = frac(Dd.a[i] + t * (0.22 + Dd.b[i] * 0.12)), dx, dy2, dz = -0.03 - Dd.d[i] * 0.2, ds = 0.004 + Dd.c[i] * 0.004;
        var yl = Math.min(SEP.cy + SEP.Ri - 0.05, h + 0.06);
        if (du < 0.6) { var d1 = du / 0.6; dx = lerp(xd + 0.1, xPad - 0.005, d1); dy2 = lerp(yl, SEP.cy + SEP.Ri - 0.05, Dd.c[i]) - d1 * 0.02; }
        else { var d2 = (du - 0.6) / 0.4; dx = xPad - 0.01; dy2 = lerp(lerp(yl, SEP.cy + SEP.Ri - 0.05, Dd.c[i]), h, d2 * d2); ds *= 1 + d2 * 0.8; }
        _m4.makeScale(ds, ds, ds); _m4.setPosition(dx, dy2, dz); Dd.im.setMatrixAt(i, _m4);
      }
      Dd.im.instanceMatrix.needsUpdate = true;
    }
    function L2Wf(x, y, z) { return _bub.set(x, y, z).applyMatrix4(sepM); }

    var _a = new V3();
    function updateHighlight(t, st) {
      var id = st.resaltar || null;
      for (var hi = 0; hi < HL_ALL.length; hi++) { HL_ALL[hi].hull.visible = false; HL_ALL[hi].glow.visible = false; }
      ring1.visible = ring2.visible = bill.visible = false;
      var zf = smooth((lastR - 10) / 45); zoneFillMat.opacity = lerp(0.015, 0.045, zf) + 0.07 * lastOrtho; zoneEdgeMat.opacity = lerp(0.5, 0.82, zf); accesoArrowsMat.opacity = 0.85;
      if (!id) return;
      var pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      var a = A[id];
      var dist = a ? _a.set(a[0], a[1], a[2]).distanceTo(camera.position) : lastR;
      var thick = clamp(dist * 0.0032 * camera.fov / 40, 0.004, 0.5);
      HLM.hull.uniforms.uT.value = HLM.hullC.uniforms.uT.value = thick;
      HLM.hull.uniforms.uI.value = HLM.hullC.uniforms.uI.value = 0.65 + 0.35 * pulse;
      HLM.glow.uniforms.uI.value = HLM.glowC.uniforms.uI.value = 0.07 + 0.14 * pulse;
      HLM.glow.uniforms.uT.value = HLM.glowC.uniforms.uT.value = 0;
      var HG = HL_BY_ID[id] || HL[id] || EMPTY_ARR;
      for (var hj = 0; hj < HG.length; hj++) { var ho = HG[hj]; ho.hull.visible = ho.mesh.visible !== false; ho.glow.visible = ho.hull.visible; ho.hull.matrix.copy(ho.mesh.matrix); ho.glow.matrix.copy(ho.mesh.matrix); }
      if (id === 'zonaSeguridad') { zoneFillMat.opacity = 0.12 + 0.16 * pulse; zoneEdgeMat.opacity = 0.75 + 0.25 * pulse; }
      if (id === 'acceso') accesoArrowsMat.opacity = 0.5 + 0.5 * pulse;
      if (!a) return;
      var R = RING_R[id];
      if (R) {
        ring1.visible = ring2.visible = true;
        ring1.position.set(a[0], 0.06, a[2]); ring1.rotation.set(-PI / 2, 0, 0); var s1 = R * (1 + 0.05 * pulse); ring1.scale.set(s1, s1, s1);
        var w = frac(t * 0.7); ring2.position.set(a[0], 0.065, a[2]); ring2.rotation.set(-PI / 2, 0, 0); var s2 = R * (1 + 0.8 * w); ring2.scale.set(s2, s2, s2);
        ring2.material.opacity = 0.8 * (1 - w); ring1.material.opacity = 0.85;
      } else if (R !== 0) {
        bill.visible = true; bill.position.set(a[0], a[1], a[2]); bill.quaternion.copy(camera.quaternion);
        var bs = clamp(dist * 0.035, 0.08, 6) * (1 + 0.12 * pulse); bill.scale.set(bs, bs, bs); bill.material.opacity = 0.75 + 0.25 * pulse;
      }
    }

    var rxFlag = 0;
    function updateShadow(k) {
      var half = clamp(lastR * 0.75, 6, 95);
      if (k > 0) half = lerp(half, Math.max(lastR * Math.tan(camera.fov * PI / 360) * camera.aspect, lastR * Math.tan(camera.fov * PI / 360)) * 1.08, smooth(k));
      var fx = lastPose.target[0], fz = lastPose.target[2];
      var tex = half * 2 / Q.shadow; fx = Math.round(fx / tex) * tex; fz = Math.round(fz / tex) * tex;
      sun.target.position.set(fx, 0, fz); sun.position.set(fx + SUN_DIR.x * 260, SUN_DIR.y * 260, fz + SUN_DIR.z * 260);
      var sc = sun.shadow.camera; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 20; sc.far = 520;
      sc.updateProjectionMatrix(); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
      shadowKey[0] = fx; shadowKey[1] = fz; shadowKey[2] = half; shadowKey[3] = clipX.constant; shadowKey[4] = layers.entorno.visible ? 1 : 0; shadowKey[5] = layers.cinta.visible ? 1 : 0; shadowKey[6] = clipZ.constant; shadowKey[7] = rxFlag;
      var same = true; for (var i = 0; i < 8; i++) if (shadowKey[i] !== shadowKeyPrev[i]) { same = false; shadowKeyPrev[i] = shadowKey[i]; }
      renderer.shadowMap.needsUpdate = !same;
    }

    function renderAt(t, st) {
      t = +t || 0; st = st || EMPTY;
      var capas = st.capas || EMPTY, ortho = clamp(+st.ortho || 0, 0, 1);
      // encuadre: márgenes (px) ocupados por la interfaz; en 3D se desplaza el centro óptico
      var enc = st.encuadre, k3 = 1 - ortho;
      viewOff.x = enc ? -((enc.left || 0) - (enc.right || 0)) / 2 * k3 : 0;
      viewOff.y = enc ? -((enc.top || 0) - (enc.bottom || 0)) / 2 * k3 : 0;
      toSph(st.camera || SHOTS.aerea, s3);
      var asp = W / H;
      if (fitPortrait && asp < 1.25 && st.ajusteVertical !== false) s3.r *= Math.pow(1.25 / asp, 0.85);
      if (ortho > 0) { planSph(st, sPl); blendSph(s3, sPl, ortho, sB); applySph(sB); } else applySph(s3);
      lastOrtho = ortho;
      sky.position.copy(camera.position); var ks = camera.far * 0.92 / 1500; sky.scale.set(ks, ks, ks);
      texSky.offset.x = -frac(t * 0.0006);
      scene.fog.near = lastR + 140; scene.fog.far = lastR + 1700;
      var hl = st.resaltar;
      layers.zona.visible = capas.zonaSeguridad !== false || hl === 'zonaSeguridad';
      layers.cinta.visible = capas.cinta !== false;
      layers.acceso.visible = capas.acceso !== false || hl === 'acceso';
      layers.cotas.visible = capas.cotas === true;
      layers.entorno.visible = capas.entorno !== false;
      layers.lineas.visible = capas.lineas === true;
      // manga de viento (balanceo determinista)
      sock.rotation.set(0, -0.6 + 0.22 * Math.sin(t * 0.7) + 0.08 * Math.sin(t * 1.9), -0.18 + 0.05 * Math.sin(t * 1.3));
      updateCut(t, st);
      updateFlows(t, st);
      updateHighlight(t, st);
      updateShadow(ortho);
      renderer.render(scene, camera);
    }

    /* =========================== API =========================== */
    var _pv = new V3();
    function project(p) {
      _pv.set(p[0], p[1], p[2]).project(camera);
      var inFront = _pv.z > -1 && _pv.z < 1;
      var x = (_pv.x + 1) / 2 * W, y = (1 - _pv.y) / 2 * H;
      return { x: x, y: y, visible: inFront && x >= -2 && x <= W + 2 && y >= -2 && y <= H + 2, inFront: inFront, z: _pv.z };
    }
    function resize(w, h) {
      W = Math.max(2, Math.round(w)); H = Math.max(2, Math.round(h));
      renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    }
    function metersPerPixel() { return 2 * lastR * Math.tan(camera.fov * PI / 360) / H; }
    function setSeparatorTag(tag) { sepTag = tag || D.separador.tagDefault; texSepDecal.userData.redraw(); }
    function dispose() {
      scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach(function (m) { Object.keys(m).forEach(function (k) { if (m[k] && m[k].isTexture) m[k].dispose(); }); m.dispose(); });
      });
      envRT.dispose(); renderer.dispose();
    }
    var ready = (function () {
      var fonts = document.fonts;
      if (!fonts || !fonts.load) return Promise.resolve();
      var loads = ['800 64px "Barlow Condensed"', '700 64px "Barlow Condensed"', '600 64px "Barlow Condensed"'].map(function (f) { return fonts.load(f).catch(function () { return null; }); });
      return Promise.all(loads).then(function () { return fonts.ready; }).then(function () { textTextures.forEach(function (t) { t.userData.redraw(); }); });
    })();

    var api = {
      renderAt: renderAt, resize: resize, project: project, anchors: A, shots: SHOTS, lerpShot: lerpShot,
      camera: camera, scene: scene, renderer: renderer, dispose: dispose,
      ready: ready.then(function () { return api; }), setSeparatorTag: setSeparatorTag, tour: tour, poseFor: poseFor,
      planPose: planPose, cameraPose: function () { return { pos: lastPose.pos.slice(), target: lastPose.target.slice(), fov: lastPose.fov }; },
      metersPerPixel: metersPerPixel, cotas: COTAS, ids: Object.keys(HLGROUPS), tourDefault: TOUR_DEF.slice(),
      separador: { tag: function () { return sepTag; }, geom: SEP }
    };
    SHOTS.planta = planPose({});
    return api;
  }

  WT.Scene3D = { create: create, version: '1.0.0' };
})();
