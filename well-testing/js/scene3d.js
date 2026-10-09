/* =====================================================================
   Well Testing · R.B. Tec México — ESCENA 3D DE LA MACROPERA (WT.Scene3D)
   ---------------------------------------------------------------------
   Escena Three.js (r170, global THREE) de la locación de aforo:
   árbol de válvulas → estrangulador TP/TR → cabezal/manifold → línea de
   entrada → separador bifásico (remolque) → líquido (LV + Coriolis) y gas
   (PV + placa de orificio) → reincorporación → línea de salida → batería.

   Contrato (docs/ARQUITECTURA.md):
     var s = WT.Scene3D.create({ canvas, width, height, pixelRatio, quality, separatorTag });
     s.renderAt(t, estado)   determinista: el cuadro depende solo de (t, estado)
     s.resize(w, h) · s.project([x,y,z]) · s.anchors · s.shots · s.lerpShot(a,b,k)
     s.camera · s.scene · s.renderer · s.dispose()

   Extensiones (opcionales):
     s.ready                     Promesa: fuentes cargadas y rótulos 3D redibujados
     s.setSeparatorTag(tag)      cambia la placa naranja del separador
     s.tour(u, nombres?)         pose continua (Catmull-Rom) por varias tomas, u = 0..1
     s.poseFor(id)               toma sugerida para cualquier equipo/ancla
     s.planPose(estado)          pose cenital calculada (la que usa ortho = 1)
     s.cameraPose()              pose efectiva del último renderAt
     s.metersPerPixel()          escala en el objetivo de la cámara (barra de escala)
     s.cotas                     [{ de, a, m, p:[x,y,z] }]  para rotular cotas en HTML
     s.ids                       ids resaltables
     estado.planta = { centro:[x,z], ancho:m, padding:{left,right,top,bottom} (px) }
     estado.capas.lineas = true  cintas de flujo animadas sobre el piso (vista en planta)
     estado.nivel                nivel de líquido 0..1 (también mueve anchors.nivel)

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
    high:   { aa: true,  shadow: 2048, soft: true,  dens: 1.0,  veg: 1.0,  seg: 1.0 },
    medium: { aa: true,  shadow: 2048, soft: false, dens: 0.6,  veg: 0.7,  seg: 0.8 },
    low:    { aa: false, shadow: 1024, soft: false, dens: 0.35, veg: 0.45, seg: 0.6 }
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
  function getHexSRGB(hex) { return hex; }

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
    var canvas = opts.canvas;
    if (!canvas) throw new Error('WT.Scene3D.create: falta { canvas }');
    var W = Math.max(2, opts.width || canvas.clientWidth || 1280);
    var H = Math.max(2, opts.height || canvas.clientHeight || 720);
    var Q = QUALITY[opts.quality] || QUALITY.high;
    var sepTag = opts.separatorTag || D.separador.tagDefault;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: Q.aa, alpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer
    });
    renderer.setPixelRatio(opts.pixelRatio || 1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
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
      g.fillStyle = '#dcd1b7'; g.fillRect(0, 0, w, h);
      var i, x, y, rad, gr;
      for (i = 0; i < 520; i++) {
        x = r() * w; y = r() * h; rad = 18 + r() * 150;
        var light = r() < 0.55;
        gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, light ? 'rgba(246,240,226,0.22)' : 'rgba(160,140,108,0.13)');
        gr.addColorStop(1, light ? 'rgba(246,240,226,0)' : 'rgba(160,140,108,0)');
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
      g.fillStyle = '#66773a'; g.fillRect(0, 0, w, h);
      var cols = ['#5a6b30', '#7a8a44', '#8c9550', '#4e5f28', '#a3a25e', '#6f8239'];
      for (var i = 0; i < 16000; i++) {
        var x = r() * w, y = r() * h;
        g.strokeStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.5 + r() * 0.5; g.lineWidth = 1 + r();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 7); g.stroke();
      }
      g.globalAlpha = 1;
    }, { repeat: true });

    var texClouds = canvasTex(1024, 256, function (g, w, h) {
      var r = U.rng(3);
      g.clearRect(0, 0, w, h);
      function blob(x, y, rx, ry, a) {
        [x - w, x, x + w].forEach(function (xx) {
          var gr = g.createRadialGradient(xx, y, 0, xx, y, rx);
          gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.save(); g.translate(xx, y); g.scale(1, ry / rx); g.translate(-xx, -y);
          g.fillStyle = gr; g.beginPath(); g.arc(xx, y, rx, 0, TAU); g.fill(); g.restore();
        });
      }
      for (var i = 0; i < 46; i++) { // cúmulos bajos sobre el horizonte
        var cx = r() * w, cy = h - 8 - r() * 40;
        for (var k = 0; k < 7; k++) blob(cx + (r() - 0.5) * 70, cy + (r() - 0.5) * 12, 16 + r() * 34, 7 + r() * 9, 0.28 + r() * 0.35);
      }
      for (i = 0; i < 26; i++) { // cirros altos
        var x0 = r() * w, y0 = 40 + r() * 150;
        for (k = 0; k < 9; k++) blob(x0 + k * 14 + r() * 8, y0 + (r() - 0.5) * 6, 20 + r() * 26, 2.5 + r() * 3, 0.12 + r() * 0.12);
      }
    }, { wrapS: true });

    var texHatch = canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#d6cfbf'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7d7563'; g.lineWidth = 7;
      for (var i = -w; i < w * 2; i += 32) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    }, { repeat: true });

    var texZone = canvasTex(128, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(214,38,46,0.55)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,194,14,0.65)';
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
      // w ↔ eje del recipiente (oeste→este), h ↔ contorno (arriba→abajo)
      g.clearRect(0, 0, w, h);
      var px = w / 1.6; // px por metro a lo largo
      // placa naranja con el tag
      g.fillStyle = '#f08a1c'; g.fillRect(0.12 * px, 0.08 * h, 0.5 * px, 0.36 * h);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.strokeRect(0.12 * px + 6, 0.08 * h + 6, 0.5 * px - 12, 0.36 * h - 12);
      g.fillStyle = '#141414'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 ' + Math.round(0.27 * h) + 'px ' + FONT_D;
      g.fillText(sepTag, 0.37 * px, 0.27 * h);
      g.fillStyle = '#f4f4f0'; g.textAlign = 'left';
      g.font = '700 ' + Math.round(0.11 * h) + 'px ' + FONT_D;
      g.fillText('SEPARADOR BIFÁSICO', 0.13 * px, 0.56 * h);
      g.font = '700 ' + Math.round(0.1 * h) + 'px ' + FONT_D;
      g.fillText((D.separador.servicio || '').toUpperCase(), 0.72 * px, 0.14 * h);
      g.font = '600 ' + Math.round(0.085 * h) + 'px ' + FONT_D;
      g.fillText('CIRCUITO CERRADO', 0.72 * px, 0.27 * h);
      // rombo NFPA
      var n = D.separador.nfpa || {}, cx = 1.36 * px, cy = 0.3 * h, s = 0.2 * h;
      var cells = [[0, -1, '#d62b2b', n.inflamabilidad], [-1, 0, '#2b62c9', n.salud], [1, 0, '#f2d21b', n.reactividad], [0, 1, '#ffffff', '']];
      cells.forEach(function (c) {
        var x = cx + c[0] * s * 0.5, y = cy + c[1] * s * 0.5;
        g.beginPath(); g.moveTo(x, y - s * 0.5); g.lineTo(x + s * 0.5, y); g.lineTo(x, y + s * 0.5); g.lineTo(x - s * 0.5, y); g.closePath();
        g.fillStyle = c[2]; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke();
        if (c[3] !== '' && c[3] != null) { g.fillStyle = c[2] === '#f2d21b' || c[2] === '#ffffff' ? '#111' : '#fff'; g.font = '800 ' + Math.round(s * 0.42) + 'px ' + FONT_D; g.textAlign = 'center'; g.fillText(String(c[3]), x, y + 1); }
      });
    }
    var texSepDecal = canvasTex(1024, 256, drawSepDecal, { text: true });

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
      text('R.B. TEC MÉXICO', r[0] + 60, r[1] + 78, 76, '#fff', 800, 'left');
      text('WELL TESTING · AFORO DE POZOS', r[0] + 680, r[1] + 80, 52, C.amarillo, 700, 'left');
      text('CASETA DE MEDICIÓN', r[0] + r[2] - 60, r[1] + 80, 52, '#fff', 700, 'right');
    }
    var texSigns = canvasTex(2048, 1024, drawSigns, { text: true });
    function signUV(id) { var r = SIGNS[id]; return [r[0] / 2048, 1 - (r[1] + r[3]) / 1024, (r[0] + r[2]) / 2048, 1 - r[1] / 1024]; }

    var texTape = canvasTex(512, 32, function (g, w, h) {
      g.fillStyle = '#d4232c'; g.fillRect(0, 0, w, h);
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
    std('ground', '#ffffff', 0.97, 0, { map: texPlat }); addDetail(MAT.ground, texGravel, detailRep);
    std('talud', '#cdbf9c', 1, 0, { map: texGravel });
    texGravel.repeat.set(1, 1);
    std('grass', '#ffffff', 1, 0, { map: texGrass, vertexColors: true });
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
    std('flange', '#7b4f8a', 0.5, 0.2);
    std('trailer', '#f0a21b', 0.55, 0.15);
    std('tire', '#1c1c1c', 0.92, 0);
    std('rim', '#ecece6', 0.4, 0.3);
    std('psv', '#c81f2a', 0.45, 0.2);
    std('ehBlue', '#1f72c8', 0.35, 0.25);
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
    std('palmTrunk', '#ffffff', 0.95, 0, { map: texTrunk });
    std('palmFrond', '#4f7a37', 0.85, 0, { alphaMap: texFrond, alphaTest: 0.45, side: THREE.DoubleSide });
    std('bush', '#ffffff', 0.95, 0);
    std('sphereWhite', '#e7e9e6', 0.5, 0.2);
    std('signs', '#ffffff', 0.55, 0, { map: texSigns });
    std('steelInt', '#9ea3a7', 0.45, 0.7);
    std('meshPad', '#ffffff', 0.6, 0.6, { map: texMesh });
    std('choke', '#596069', 0.45, 0.6);
    std('caliche2', '#c9bb98', 1, 0, { map: texGravel });
    std('road', '#b8a888', 1, 0, { map: texGravel });
    texMesh.repeat.set(14, 14);
    MAT.road.map = texGravel.clone(); MAT.road.map.repeat.set(1, 1); MAT.road.map.needsUpdate = true;

    // Corte del separador: planos locales que se transforman al mundo en cada cuadro
    var sepM = new THREE.Matrix4().compose(new V3(MP.separador.x, 0, MP.separador.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -(MP.separador.rot || 0) * PI / 180, 0)), new V3(1, 1, 1));
    var clipZ = new THREE.Plane(new V3(0, 0, -1), 0), clipX = new THREE.Plane(new V3(1, 0, 0), 1e5);
    var clipCapX = new THREE.Plane(new V3(-1, 0, 0), -1e5), clipLevel = new THREE.Plane(new V3(0, -1, 0), 1.9);
    var CLIP_SEP = [clipZ, clipX];
    std('vesselOut', '#2c4b3b', 0.4, 0.22, { clippingPlanes: CLIP_SEP, clipIntersection: true, side: THREE.FrontSide });
    std('vesselIn', '#a49d8c', 0.75, 0.1, { clippingPlanes: CLIP_SEP, clipIntersection: true, side: THREE.BackSide });
    std('decal', '#ffffff', 0.45, 0.1, { map: texSepDecal, transparent: true, clippingPlanes: CLIP_SEP, clipIntersection: true, polygonOffset: true, polygonOffsetFactor: -2 });
    std('darkClip', '#2e3134', 0.55, 0.55, { clippingPlanes: CLIP_SEP, clipIntersection: true });
    std('section', '#ffffff', 0.4, 0.4, { map: texHatch, clippingPlanes: [clipCapX], side: THREE.DoubleSide, emissive: new THREE.Color('#3a3326'), emissiveIntensity: 0.4 });
    std('sectionFront', '#ffffff', 0.4, 0.4, { map: texHatch, side: THREE.DoubleSide, emissive: new THREE.Color('#3a3326'), emissiveIntensity: 0.4 });
    texHatch.repeat.set(9, 9);
    std('liqBody', '#1f150c', 0.25, 0.1, { side: THREE.DoubleSide, clippingPlanes: [clipLevel], emissive: new THREE.Color(C.liquidoAmbar), emissiveIntensity: 0.05 });
    std('liqFace', '#2a1a0b', 0.35, 0.05, { side: THREE.DoubleSide, clippingPlanes: [clipLevel], transparent: true, opacity: 0.78, emissive: new THREE.Color(C.liquidoAmbar), emissiveIntensity: 0.12, depthWrite: false });
    std('liqTop', '#2b1b0c', 0.1, 0.15, { side: THREE.DoubleSide, emissive: new THREE.Color(C.liquidoAmbar), emissiveIntensity: 0.14 });
    ['ground', 'grass', 'talud', 'tape', 'liqTop', 'liqFace', 'liqBody', 'decal', 'section', 'sectionFront', 'road', 'caliche2'].forEach(function (k) { MAT[k].userData.noCast = true; });

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
    function controlValve(b, c, dir, rp, up) {
      var d = dir.clone().normalize(), u = (up || new V3(0, 1, 0)).clone().normalize();
      b.add('pipeGreen', orient(new THREE.SphereGeometry(rp * 1.9, 16, 12), c.clone(), d));
      flangePair(b, 'flange', c.clone().addScaledVector(d, -rp * 2.4), d, rp);
      flangePair(b, 'flange', c.clone().addScaledVector(d, rp * 2.4), d, rp);
      b.add('pipeGreen', gCylAB(c.clone().addScaledVector(u, rp * 1.5), c.clone().addScaledVector(u, rp * 3.2), rp * 1.1, 12));
      b.add('flange', orient(gCyl(rp * 1.9, rp * 1.9, 0.03, 16), c.clone().addScaledVector(u, rp * 3.2), u));
      // yugo
      var side = new V3().crossVectors(d, u).normalize();
      [-1, 1].forEach(function (k) {
        b.add('galv', gCylAB(c.clone().addScaledVector(u, rp * 3.2).addScaledVector(d, k * rp * 0.9), c.clone().addScaledVector(u, rp * 5.6).addScaledVector(d, k * rp * 0.9), rp * 0.18, 6));
      });
      b.add('galv', gCylAB(c.clone().addScaledVector(u, rp * 3.2), c.clone().addScaledVector(u, rp * 5.8), rp * 0.12, 6));
      // actuador de diafragma (domo)
      var dome = new THREE.SphereGeometry(rp * 2.5, 20, 10, 0, TAU, 0, PI / 2); dome.scale(1, 0.55, 1);
      var bot = new THREE.SphereGeometry(rp * 2.5, 20, 10, 0, TAU, PI / 2, PI / 2); bot.scale(1, 0.32, 1);
      var ring = gCyl(rp * 2.6, rp * 2.6, rp * 0.25, 20);
      [dome, bot, ring].forEach(function (g) { orient(g, c.clone().addScaledVector(u, rp * 6.3), u); b.add('actuator', g); });
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
        cols[i * 3] = 0.82 + n * 0.32; cols[i * 3 + 1] = 0.86 + n * 0.25; cols[i * 3 + 2] = 0.75 + n * 0.22;
      }
      gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
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
    var R_GAS = [L2W(0.7, 2.12, 0), L2W(0.7, 2.55, 0), L2W(1.25, 2.55, 0), L2W(1.25, 1.45, 0), L2W(2.75, 1.45, 0), L2W(2.75, 1.0, 0), L2W(2.75, 1.0, 0.3)];
    var R_LIQ = [L2W(0.55, 1.7, 0), L2W(0.55, 1.0, 0), L2W(0.55, 1.0, 0.3), L2W(2.75, 1.0, 0.3)];
    var BX = MP.lineaBateria.desdeX, BZ = MP.lineaBateria.z, BX1 = MP.lineaBateria.haciaX;
    var teOut = L2W(3.4, 1.0, 0.3);
    var R_SAL = [L2W(2.75, 1.0, 0.3), teOut, L2W(3.4, 0.35, 0.3), [30, 0.35, teOut.z], [30, 0.35, BZ], [BX, 0.35, BZ], [BX1 + 2.6, 0.35, BZ], [BX1 + 2.6, -1.0, BZ]];

    var RT = {
      mezcla: route(R_MEZCLA, BEND), gas: route(R_GAS, 0.12), liquido: route(R_LIQ, 0.12), salida: route(R_SAL, BEND)
    };
    var RT_PIPE = {
      mezclaPozo: route(R_MEZCLA.slice(0, 6), BEND),
      manifold: route(R_MEZCLA.slice(4, 10), BEND),
      lineaEntrada: route(R_MEZCLA.slice(8, 18), BEND),
      gas: route([L2W(0.7, 2.26, 0)].concat(R_GAS.slice(1)), 0.12),
      liquido: route([L2W(0.55, 1.64, 0)].concat(R_LIQ.slice(1)), 0.12),
      salida: route(R_SAL.slice(0, 6), BEND),
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
      var dg = gCyl(SEP.R + 0.004, SEP.R + 0.004, 1.6, 24, true, -0.62, 1.24);
      var duv = dg.attributes.uv; for (var i = 0; i < duv.count; i++) { var u0 = duv.getX(i), v0 = duv.getY(i); duv.setXY(i, 1 - v0, 1 - u0); }
      dg.rotateZ(-PI / 2); b.add('decal', dg, mat(-0.75, SEP.cy, 0));
      // registro bridado
      b.add('vesselOut', gCylAB(new V3(0.3, SEP.cy, 0.2), new V3(0.3, SEP.cy, SEP.R + 0.07), 0.15, 22));
      b.add('vesselOut', orient(gCyl(0.205, 0.205, 0.05, 26), new V3(0.3, SEP.cy, SEP.R + 0.095), new V3(0, 0, 1)));
      b.add('vesselOut', orient(gCyl(0.205, 0.205, 0.035, 26), new V3(0.3, SEP.cy, SEP.R + 0.05), new V3(0, 0, 1)));
      for (i = 0; i < 16; i++) { var a = i / 16 * TAU; b.add('darkClip', orient(gCyl(0.012, 0.012, 0.12, 6), new V3(0.3 + Math.cos(a) * 0.178, SEP.cy + Math.sin(a) * 0.178, SEP.R + 0.08), new V3(0, 0, 1))); }
      b.add('darkClip', orient(gCyl(0.045, 0.045, 0.03, 12), new V3(0.3, SEP.cy, SEP.R + 0.13), new V3(0, 0, 1)));
      // silletas
      [-1.45, 0.35].forEach(function (x) {
        var sad = gCyl(SEP.R + 0.012, SEP.R + 0.012, 0.18, 20, true, PI / 2 + 0.55, PI - 1.1); sad.rotateZ(-PI / 2); b.add('pipeGreen', sad, mat(x, SEP.cy, 0));
        b.add('pipeGreen', gBox(0.16, 0.012, 0.52), mat(x, SEP.cy - SEP.R - 0.05, 0));
        [-0.24, 0.24].forEach(function (z) { b.add('pipeGreen', gBox(0.1, SEP.cy - SEP.R - 0.78, 0.1), mat(x, (SEP.cy - SEP.R + 0.78) / 2 - 0.02, z)); });
        b.add('pipeGreen', gBox(0.14, 0.02, 0.62), mat(x, 0.79, 0));
      });
      // boquillas
      b.add('vesselOut', gCylAB(new V3(0.7, SEP.cy + SEP.R - 0.04, 0), new V3(0.7, SEP.cy + SEP.R + 0.05, 0), RP * 1.1, 14));
      b.add('vesselOut', gCylAB(new V3(0.55, SEP.cy - SEP.R + 0.04, 0), new V3(0.55, SEP.cy - SEP.R - 0.05, 0), RP * 1.1, 14));
      b.add('vesselOut', gCylAB(new V3(SEP.xw - SEP.hd + 0.03, 2.05, 0), new V3(SEP.xw - SEP.hd - 0.1, 2.05, 0), RP * 1.1, 14));
      flangePair(b, 'flange', new V3(0.7, SEP.cy + SEP.R + 0.09, 0), new V3(0, 1, 0), RP);
      flangePair(b, 'flange', new V3(0.55, SEP.cy - SEP.R - 0.1, 0), new V3(0, 1, 0), RP);
      // cable/caja de conexiones de señales
      b.add('galv', gBox(0.28, 0.34, 0.16, 0.02), mat(2.55, 1.28, -0.86));
      b.add('steelDark', gBox(0.05, 0.5, 0.05), mat(2.55, 0.98, -0.86));
      b.add('black', gCylAB(new V3(2.48, 1.1, -0.86), new V3(2.3, 0.02, -1.2), 0.016, 6));
      // sombrillas verdes (fotos 02 y 05)
      function umbrella(base, topP, R) {
        b.add('galv', gCylAB(base, topP, 0.016, 6));
        var can = new THREE.ConeGeometry(R, R * 0.32, 8, 1, true); can.translate(0, -R * 0.16, 0);
        var up = new V3(0, 1, 0);
        b.add('umbrella', orient(can, topP.clone().addScaledVector(up, 0.02), up));
        for (var k = 0; k < 8; k++) { var a = k / 8 * TAU + PI / 8; b.add('galv', gCylAB(topP, topP.clone().add(new V3(Math.cos(a) * R * 0.92, -R * 0.3, Math.sin(a) * R * 0.92)), 0.005, 4)); }
        b.add('white', gCyl(0.02, 0.03, 0.08, 8), mat(topP.x, topP.y + 0.05, topP.z));
      }
      umbrella(new V3(2.05, 0.78, 0.98), new V3(1.95, 2.72, 0.55), 1.15);
      var tri = new V3(-2.75, 0, 1.75);
      for (i = 0; i < 3; i++) { var a2 = i / 3 * TAU; b.add('steelDark', gCylAB(new V3(tri.x + Math.cos(a2) * 0.35, 0, tri.z + Math.sin(a2) * 0.35), new V3(tri.x, 0.45, tri.z), 0.014, 5)); }
      umbrella(new V3(tri.x, 0.0, tri.z), new V3(-2.45, 2.55, 1.15), 1.1);
      b.flush('separador', sepGroup);

      // ---- tuberías del patín: gas y líquido ----
      var bg = new Builder();
      pipeRoute(bg, 'pipeGreen', RT_PIPE.gas, RP);
      flangePair(bg, 'flange', L2W(1.25, 2.1, 0), new V3(0, 1, 0), RP);
      bg.add('pipeGreen', gBox(0.08, 1.45 - 0.78, 0.08), mat(2.75, (1.45 + 0.78) / 2 - 0.25, -0.0), sepM);
      bg.flush('lineaGas', sepGroup, { stream: 'gas' });
      var bq = new Builder();
      pipeRoute(bq, 'pipeGreen', RT_PIPE.liquido, RP);
      [0.95, 1.75].forEach(function (x) { bq.add('pipeGreen', gBox(0.08, 0.17, 0.08), mat(x, 0.86, 0.3), sepM); });
      bq.flush('lineaLiquido', sepGroup, { stream: 'liquido' });

      // ---- válvulas de control ----
      var X = new V3(1, 0, 0).transformDirection(sepM), Yv = new V3(0, 1, 0), Zs = new V3(0, 0, 1).transformDirection(sepM);
      var bLV = new Builder(); controlValve(bLV, L2W(1.15, 1.0, 0.3), X, RP, Yv); bLV.flush('LV', sepGroup);
      var bPV = new Builder(); controlValve(bPV, L2W(1.6, 1.45, 0), X, RP, Yv); bPV.flush('PV', sepGroup);
      // ---- Coriolis Promass 300 ----
      var bc = new Builder(sepM);
      flangePair(bc, 'flange', new V3(1.55, 1.0, 0.3), new V3(1, 0, 0), RP);
      flangePair(bc, 'flange', new V3(2.25, 1.0, 0.3), new V3(1, 0, 0), RP);
      bc.add('stainless', gCylAB(new V3(1.6, 1.0, 0.3), new V3(2.2, 1.0, 0.3), RP * 1.05, 16));
      bc.add('stainless', gBox(0.5, 0.16, 0.13, 0.05), mat(1.9, 0.94, 0.3));
      var arc = new THREE.TorusGeometry(0.2, 0.045, 10, 20, PI); arc.rotateX(PI); arc.scale(1.1, 0.55, 1); bc.add('stainless', arc, mat(1.9, 0.94, 0.3));
      bc.flush('coriolis', sepGroup);
      var bct = new Builder(sepM);
      bct.add('stainless', gCyl(0.03, 0.03, 0.12, 10), mat(1.9, 1.1, 0.3));
      bct.add('ehBody', gBox(0.13, 0.12, 0.14, 0.03), mat(1.9, 1.22, 0.3));
      bct.add('ehBody', orient(gCyl(0.062, 0.062, 0.05, 18), new V3(1.9, 1.25, 0.38), new V3(0, 0, 1)));
      bct.add('ehGlass', orient(gCyl(0.045, 0.045, 0.006, 18), new V3(1.9, 1.25, 0.408), new V3(0, 0, 1)));
      bct.add('ehBlue', orient(gCyl(0.062, 0.062, 0.03, 18), new V3(1.9, 1.25, 0.22), new V3(0, 0, 1)));
      bct.add('black', gCylAB(new V3(1.97, 1.2, 0.3), new V3(2.02, 1.2, 0.3), 0.012, 8));
      bct.flush('CORIOLIS', sepGroup);
      // ---- placa de orificio (portaplaca) ----
      var bo = new Builder(sepM);
      flangePair(bo, 'flange', new V3(2.2, 1.45, 0), new V3(1, 0, 0), RP, { k: 2.4, th: 0.055, bolts: 8 });
      bo.add('stainless', gBox(0.01, 0.2, 0.07), mat(2.2, 1.56, 0));
      bo.add('stainless', gBox(0.012, 0.05, 0.12), mat(2.2, 1.66, 0));
      [2.165, 2.235].forEach(function (x) { bo.add('stainless', gCylAB(new V3(x, 1.45 + RP * 2.2, 0.02), new V3(x, 1.67, 0.02), 0.007, 6)); });
      bo.add('stainless', gBox(0.11, 0.035, 0.07, 0.006), mat(2.2, 1.685, 0.02));
      bo.flush('placa', sepGroup);
      var btg = new Builder(sepM);
      btg.add('stainless', gBox(0.08, 0.05, 0.08, 0.008), mat(2.2, 1.73, 0.02));
      transmitter(btg, new V3(2.2, 1.75, 0.02), new V3(0, 1, 0), { face: new V3(0, 0, 1) });
      btg.flush('TDG', sepGroup);
      // ---- reincorporación (te) y TDM ----
      var br = new Builder(sepM);
      br.add('pipeGreen', new THREE.SphereGeometry(RP * 1.5, 14, 10), mat(2.75, 1.0, 0.3));
      br.add('pipeGreen', gCylAB(new V3(2.75, 1.0, 0.18), new V3(2.75, 1.0, 0.42), RP * 1.25, 14));
      flangePair(br, 'flange', new V3(2.75, 1.0, 0.12), new V3(0, 0, 1), RP);
      flangePair(br, 'flange', new V3(2.6, 1.0, 0.3), new V3(1, 0, 0), RP);
      flangePair(br, 'flange', new V3(2.92, 1.0, 0.3), new V3(1, 0, 0), RP);
      br.add('steelDark', gBox(0.08, 0.2, 0.08), mat(2.75, 0.86, 0.3));
      br.flush('recombinacion', sepGroup);
      var btm = new Builder(sepM); transmitter(btm, new V3(3.12, 1.0 + RP, 0.3), new V3(0, 1, 0), { face: new V3(0, 0, 1) }); btm.flush('TDM', sepGroup);
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
      liq.light = new THREE.PointLight(0xfff2dd, 0, 3.2, 1.6); liq.light.position.copy(L2W(-0.5, SEP.cy + 0.15, -0.12)); scene.add(liq.light);
    })();

    /* =========================== CASETA, RTU Y CABLES =========================== */
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
      var lv = new THREE.PlaneGeometry(6.6, 6.6 * 152 / 2048); var uvr = signUV('livery'), uvL = lv.attributes.uv;
      for (var i = 0; i < uvL.count; i++) uvL.setXY(i, lerp(uvr[0], uvr[2], uvL.getX(i)), lerp(uvr[1], uvr[3], uvL.getY(i)));
      b.add('signs', lv, mat(-0.55, y0 + 0.5, front + 0.012));
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
    var CABLES; // (declarado arriba por hoisting de la IIFE)
  }

  WT.Scene3D = { create: create, version: '1.0.0' };
})();
