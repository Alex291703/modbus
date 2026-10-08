/* =====================================================================
   Well Testing — modelos 3D de equipos (unidades: metros)
   Geometría procedimental de bajo costo, pensada para verse limpia en
   render: árbol de válvulas, estrangulador, válvulas, transmisores E+H,
   Coriolis, placa de orificio, remolque, caseta, RTU, cabezal, etc.
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const THREE = window.THREE;
  const U = WT.util;

  const std = (color, rough = 0.5, metal = 0.1, extra = {}) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra));

  const M = (WT.mats = {
    pipe: std("#9AA2AA", 0.36, 0.6),
    pipeGreen: std("#2F5B3B", 0.45, 0.25),
    flange: std("#2F64B0", 0.45, 0.3),
    flangeSteel: std("#7E878F", 0.35, 0.65),
    vessel: std("#2C5A39", 0.42, 0.25),
    vesselInner: std("#BFC6CC", 0.75, 0.15, { side: THREE.BackSide }),
    yellow: std("#E2AC0B", 0.5, 0.2),
    tire: std("#191919", 0.92, 0),
    rim: std("#E9EBEC", 0.35, 0.45),
    steel: std("#AEB6BD", 0.3, 0.75),
    darkSteel: std("#4A5157", 0.45, 0.6),
    red: std("#C42A2E", 0.45, 0.2),
    concrete: std("#B8B3A9", 0.95, 0),
    concreteDark: std("#8F8A81", 0.95, 0),
    ehBody: std("#D3D9DF", 0.35, 0.55),
    ehBlue: std("#2E73B8", 0.4, 0.25),
    white: std("#EEF1F3", 0.6, 0.05),
    navy: std("#0A2240", 0.55, 0.1),
    rbYellow: std("#FFC20E", 0.5, 0.1),
    glass: std("#1A2B3A", 0.1, 0.4, { transparent: true, opacity: 0.55 }),
    black: std("#121417", 0.6, 0.2),
    cable: std("#4CC3F0", 0.4, 0.0, { emissive: new THREE.Color("#1F6E91"), emissiveIntensity: 0.6 }),
    rtu: std("#B9BEC3", 0.5, 0.3),
    module: std("#2B2F33", 0.5, 0.3),
    green: std("#3DDC97", 0.4, 0, { emissive: new THREE.Color("#3DDC97"), emissiveIntensity: 2 }),
    fence: std("#9EA6AD", 0.4, 0.6),
    gravelPath: std("#B9A98E", 0.95, 0),
  });

  const box = (w, h, d, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const cyl = (rt, rb, h, mat, seg = 20) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const at = (obj, x, y, z) => {
    obj.position.set(x, y, z);
    return obj;
  };
  WT.box = box;
  WT.cyl = cyl;
  WT.at = at;

  /* ----------------------------- Válvula de compuerta ----------------------------- */
  /** Eje de flujo en X local, bonete hacia +Y. r = radio de la tubería. */
  WT.gateValve = function (r = 0.05, o = {}) {
    const g = new THREE.Group();
    const L = r * 7;
    g.add(box(L * 0.5, r * 3.0, r * 2.5, o.body || M.darkSteel));
    [-1, 1].forEach((s) => {
      const f = cyl(r * 2.3, r * 2.3, r * 0.7, o.flange || M.flangeSteel);
      f.rotation.z = Math.PI / 2;
      f.position.x = (s * L) / 2 - s * r * 0.35;
      g.add(f);
      const n = cyl(r * 1.15, r * 1.15, L * 0.25, o.body || M.darkSteel, 14);
      n.rotation.z = Math.PI / 2;
      n.position.x = s * L * 0.32;
      g.add(n);
    });
    g.add(at(cyl(r * 1.05, r * 1.35, r * 3.2, o.body || M.darkSteel), 0, r * 3.0, 0));
    g.add(at(cyl(r * 0.22, r * 0.22, r * 2.8, M.steel, 8), 0, r * 5.6, 0));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(r * 1.9, r * 0.24, 8, 28), o.wheel || M.red);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.y = r * 6.4;
    wheel.castShadow = true;
    g.add(wheel);
    const sp = box(r * 3.8, r * 0.3, r * 0.3, o.wheel || M.red);
    sp.position.y = r * 6.4;
    g.add(sp);
    const sp2 = sp.clone();
    sp2.rotation.y = Math.PI / 2;
    g.add(sp2);
    g.userData.length = L;
    return g;
  };

  /* ----------------------------- Válvula de control ----------------------------- */
  /** Cuerpo globo + actuador de diafragma. userData.stem se desplaza con la apertura. */
  WT.controlValve = function (r = 0.05, o = {}) {
    const g = new THREE.Group();
    const L = r * 7.5;
    const body = new THREE.Mesh(new THREE.SphereGeometry(r * 1.9, 20, 14), o.body || M.darkSteel);
    body.scale.set(1.25, 1, 1);
    body.castShadow = true;
    g.add(body);
    [-1, 1].forEach((s) => {
      const f = cyl(r * 2.2, r * 2.2, r * 0.65, M.flangeSteel);
      f.rotation.z = Math.PI / 2;
      f.position.x = (s * L) / 2;
      g.add(f);
      const n = cyl(r * 1.1, r * 1.1, L * 0.3, o.body || M.darkSteel, 14);
      n.rotation.z = Math.PI / 2;
      n.position.x = s * L * 0.33;
      g.add(n);
    });
    g.add(at(cyl(r * 1.2, r * 1.6, r * 1.6, o.body || M.darkSteel), 0, r * 2.2, 0));
    // Yugo
    [-1, 1].forEach((s) => g.add(at(box(r * 0.35, r * 3.6, r * 0.5, M.darkSteel), s * r * 1.05, r * 4.5, 0)));
    const stem = at(cyl(r * 0.2, r * 0.2, r * 3.4, M.steel, 8), 0, r * 4.6, 0);
    g.add(stem);
    const ind = at(box(r * 0.9, r * 0.25, r * 0.25, M.rbYellow), 0, r * 4.4, 0);
    g.add(ind);
    // Actuador de diafragma
    const act = new THREE.Group();
    act.add(at(cyl(r * 3.2, r * 3.2, r * 0.5, o.act || M.ehBlue, 32), 0, 0, 0));
    act.add(at(cyl(r * 2.2, r * 3.2, r * 1.3, o.act || M.ehBlue, 32), 0, r * 0.9, 0));
    act.add(at(cyl(r * 3.2, r * 2.2, r * 0.9, o.act || M.ehBlue, 32), 0, -r * 0.65, 0));
    act.position.y = r * 7.0;
    g.add(act);
    g.userData = { length: L, stem, ind, r, actY: r * 7.0 };
    return g;
  };
  /** Apertura 0–1: mueve vástago e indicador. */
  WT.setValveOpen = function (v, open) {
    const d = v.userData;
    d.stem.position.y = d.r * 4.6 + open * d.r * 1.0;
    d.ind.position.y = d.r * 4.0 + open * d.r * 1.0;
  };

  /* ----------------------------- Transmisores E+H ----------------------------- */
  /** Transmisor de presión: carcasa de doble compartimento con display, sobre niple y válvula. */
  WT.pressureTx = function (o = {}) {
    const g = new THREE.Group();
    g.add(at(cyl(0.012, 0.012, 0.12, M.steel, 8), 0, 0.06, 0));
    g.add(at(box(0.05, 0.04, 0.05, M.darkSteel), 0, 0.12, 0));
    g.add(at(cyl(0.025, 0.03, 0.08, M.ehBody, 16), 0, 0.18, 0));
    const head = new THREE.Group();
    const h1 = cyl(0.055, 0.055, 0.075, M.ehBody, 24);
    h1.rotation.x = Math.PI / 2;
    head.add(h1);
    const cap = cyl(0.058, 0.058, 0.025, M.ehBlue, 24);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.05;
    head.add(cap);
    const disp = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 24),
      std("#9FD7F0", 0.2, 0, { emissive: new THREE.Color("#4CC3F0"), emissiveIntensity: 0.5 }),
    );
    disp.position.z = 0.0635;
    head.add(disp);
    const cap2 = cap.clone();
    cap2.position.z = -0.05;
    head.add(cap2);
    head.position.y = 0.27;
    g.add(head);
    g.userData.display = disp;
    if (o.scale) g.scale.setScalar(o.scale);
    return g;
  };

  /** Transmisor de temperatura: termopozo + cabezal. Eje del termopozo en +Z local (hacia el equipo: -Z). */
  WT.tempTx = function () {
    const g = new THREE.Group();
    const well = cyl(0.012, 0.012, 0.22, M.steel, 8);
    well.rotation.x = Math.PI / 2;
    well.position.z = -0.08;
    g.add(well);
    const hd = cyl(0.045, 0.045, 0.07, M.ehBody, 20);
    hd.rotation.x = Math.PI / 2;
    hd.position.z = 0.07;
    g.add(hd);
    const cap = cyl(0.047, 0.047, 0.02, M.ehBlue, 20);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.11;
    g.add(cap);
    return g;
  };

  /** Transmisor de presión diferencial con manifold de 3 válvulas. */
  WT.dpTx = function () {
    const g = new THREE.Group();
    g.add(at(box(0.16, 0.05, 0.08, M.darkSteel), 0, 0, 0)); // manifold
    [-0.05, 0.05].forEach((x) => g.add(at(cyl(0.012, 0.012, 0.05, M.red, 8), x, 0.0, 0.06)));
    g.add(at(box(0.11, 0.08, 0.09, M.ehBody), 0, 0.065, 0));
    [-0.065, 0.065].forEach((x) => {
      const f = cyl(0.035, 0.035, 0.02, M.steel, 16);
      f.rotation.z = Math.PI / 2;
      f.position.set(x, 0.065, 0);
      g.add(f);
    });
    g.add(at(cyl(0.02, 0.02, 0.05, M.ehBody, 12), 0, 0.13, 0));
    const h1 = cyl(0.055, 0.055, 0.075, M.ehBody, 24);
    h1.rotation.x = Math.PI / 2;
    h1.position.y = 0.2;
    g.add(h1);
    const cap = cyl(0.058, 0.058, 0.025, M.ehBlue, 24);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 0.2, 0.05);
    g.add(cap);
    const disp = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 24),
      std("#9FD7F0", 0.2, 0, { emissive: new THREE.Color("#4CC3F0"), emissiveIntensity: 0.5 }),
    );
    disp.position.set(0, 0.2, 0.0635);
    g.add(disp);
    return g;
  };

  /** Coriolis Promass 300: sensor con carcasa curva bajo el eje y transmisor arriba. Eje en X. */
  WT.coriolis = function (r = 0.05) {
    const g = new THREE.Group();
    const L = 0.7;
    [-1, 1].forEach((s) => {
      const f = cyl(r * 2.3, r * 2.3, r * 0.7, M.flange);
      f.rotation.z = Math.PI / 2;
      f.position.x = (s * L) / 2;
      g.add(f);
    });
    const tube = cyl(r * 1.25, r * 1.25, L * 0.92, M.steel, 18);
    tube.rotation.z = Math.PI / 2;
    g.add(tube);
    // Carcasa del sensor (tubos de medición curvos)
    const shape = new THREE.Shape();
    shape.moveTo(-L * 0.36, 0);
    shape.quadraticCurveTo(-L * 0.36, -0.2, -L * 0.12, -0.22);
    shape.lineTo(L * 0.12, -0.22);
    shape.quadraticCurveTo(L * 0.36, -0.2, L * 0.36, 0);
    shape.lineTo(-L * 0.36, 0);
    const hs = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3, curveSegments: 16 }),
      M.steel,
    );
    hs.position.z = -0.05;
    hs.castShadow = true;
    g.add(hs);
    // Cuello y transmisor Proline 300
    g.add(at(cyl(0.03, 0.035, 0.12, M.steel, 14), 0, 0.1, 0));
    const tx = new THREE.Group();
    const body = box(0.2, 0.14, 0.14, M.ehBody);
    tx.add(body);
    const front = cyl(0.068, 0.068, 0.03, M.ehBlue, 28);
    front.rotation.x = Math.PI / 2;
    front.position.z = 0.08;
    tx.add(front);
    const disp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.075, 0.05),
      std("#BDE9FA", 0.2, 0, { emissive: new THREE.Color("#4CC3F0"), emissiveIntensity: 0.9 }),
    );
    disp.position.z = 0.0965;
    tx.add(disp);
    tx.position.y = 0.23;
    g.add(tx);
    g.userData = { length: L, display: disp };
    return g;
  };

  /** Porta-placa de orificio: bridas + placa con paleta (manija) y tomas. Eje X. */
  WT.orifice = function (r = 0.05) {
    const g = new THREE.Group();
    [-1, 1].forEach((s) => {
      const f = cyl(r * 2.4, r * 2.4, r * 0.8, M.flangeSteel, 24);
      f.rotation.z = Math.PI / 2;
      f.position.x = s * r * 0.55;
      g.add(f);
      // Tomas de presión
      g.add(at(cyl(0.01, 0.01, r * 2.6, M.steel, 8), s * r * 0.55, r * 2.4, 0));
    });
    const plate = box(0.012, r * 5.6, r * 2.2, M.rbYellow);
    plate.position.y = r * 1.2;
    g.add(plate);
    // Pernos
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = cyl(0.008, 0.008, r * 2.2, M.darkSteel, 6);
      b.rotation.z = Math.PI / 2;
      b.position.set(0, Math.cos(a) * r * 1.95, Math.sin(a) * r * 1.95);
      g.add(b);
    }
    g.userData.length = r * 2;
    return g;
  };

  /* ----------------------------- Árbol de válvulas ----------------------------- */
  /** Árbol con cabezales TR/TP, válvulas maestras, cruz, válvulas laterales y de sondeo. */
  WT.christmasTree = function () {
    const g = new THREE.Group();
    const r = 0.06;
    const vert = (y) => {
      const outer = new THREE.Group();
      const inner = WT.gateValve(r);
      inner.rotation.z = Math.PI / 2;
      outer.add(inner);
      outer.rotation.y = Math.PI / 2;
      outer.position.y = y;
      return outer;
    };
    // Cabezal de TR
    g.add(at(cyl(0.3, 0.3, 0.08, M.flangeSteel, 28), 0, -0.86, 0));
    g.add(at(cyl(0.24, 0.26, 0.36, M.darkSteel, 28), 0, -0.65, 0));
    g.add(at(cyl(0.3, 0.3, 0.07, M.flangeSteel, 28), 0, -0.44, 0));
    // Salidas laterales de TR (válvula en lado -X)
    const trOut = new THREE.Group();
    const trv = WT.gateValve(0.04);
    trv.position.x = -0.42;
    trOut.add(trv);
    const trn = cyl(0.04, 0.04, 0.22, M.darkSteel, 12);
    trn.rotation.z = Math.PI / 2;
    trn.position.x = -0.24;
    trOut.add(trn);
    trOut.position.y = -0.65;
    g.add(trOut);
    // Cabezal de TP
    g.add(at(cyl(0.21, 0.23, 0.3, M.darkSteel, 28), 0, -0.25, 0));
    g.add(at(cyl(0.28, 0.28, 0.07, M.flangeSteel, 28), 0, -0.07, 0));
    // Válvulas maestras
    g.add(vert(0.24));
    g.add(vert(0.7));
    // Cruz
    g.add(at(box(0.26, 0.28, 0.26, M.darkSteel), 0, 1.1, 0));
    [-1, 1].forEach((s) => {
      const f = cyl(0.15, 0.15, 0.05, M.flangeSteel, 24);
      f.rotation.z = Math.PI / 2;
      f.position.set(s * 0.155, 1.1, 0);
      g.add(f);
    });
    // Válvulas laterales (la derecha es la de producción)
    [-1, 1].forEach((s) => {
      const v = WT.gateValve(r);
      v.position.set(s * 0.39, 1.1, 0);
      v.rotation.x = Math.PI / 2;
      g.add(v);
    });
    // Válvula de sondeo y tapa del árbol
    g.add(vert(1.52));
    g.add(at(cyl(0.11, 0.13, 0.12, M.darkSteel, 20), 0, 1.84, 0));
    g.add(at(cyl(0.14, 0.14, 0.04, M.flangeSteel, 20), 0, 1.92, 0));
    // Manómetro en la tapa
    const gauge = new THREE.Group();
    gauge.add(at(cyl(0.01, 0.01, 0.1, M.steel, 8), 0, 0.05, 0));
    const face = cyl(0.055, 0.055, 0.03, M.steel, 24);
    face.rotation.x = Math.PI / 2;
    face.position.y = 0.14;
    gauge.add(face);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.048, 24), M.white);
    dial.position.set(0, 0.14, 0.016);
    gauge.add(dial);
    gauge.position.set(-0.07, 1.94, 0.02);
    g.add(gauge);
    g.userData.wingOut = new THREE.Vector3(0.39 + 0.21, 1.1, 0); // brida de salida de la lateral de producción
    g.userData.capTop = new THREE.Vector3(0.05, 1.94, 0);
    return g;
  };

  /** Estrangulador ajustable tipo ángulo: entrada en -X, salida hacia abajo. */
  WT.choke = function (r = 0.055) {
    const g = new THREE.Group();
    g.add(box(0.2, 0.2, 0.2, M.darkSteel));
    const fin = cyl(r * 2.2, r * 2.2, 0.05, M.flangeSteel, 20);
    fin.rotation.z = Math.PI / 2;
    fin.position.x = -0.12;
    g.add(fin);
    g.add(at(cyl(r * 2.2, r * 2.2, 0.05, M.flangeSteel, 20), 0, -0.12, 0));
    // Bonete con indicador de apertura y volante
    const bon = cyl(0.06, 0.07, 0.22, M.darkSteel, 18);
    bon.rotation.z = Math.PI / 2;
    bon.position.x = 0.2;
    g.add(bon);
    const sleeve = cyl(0.045, 0.045, 0.12, M.rbYellow, 18);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.x = 0.36;
    g.add(sleeve);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 28), M.red);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.x = 0.44;
    g.add(wheel);
    const sp = box(0.012, 0.2, 0.02, M.red);
    sp.position.x = 0.44;
    g.add(sp);
    return g;
  };

  /* ----------------------------- Contrapozo ----------------------------- */
  WT.cellar = function (size = 2.4, depth = 1.0) {
    const g = new THREE.Group();
    const t = 0.15;
    const mat = M.concrete;
    // Muros
    [
      [0, -size / 2, size + t, t],
      [0, size / 2, size + t, t],
    ].forEach(([x, z, w, d]) => g.add(at(box(w, depth + 0.12, d, mat), x, -depth / 2 + 0.06, z)));
    [
      [-size / 2, 0],
      [size / 2, 0],
    ].forEach(([x, z]) => g.add(at(box(t, depth + 0.12, size, mat), x, -depth / 2 + 0.06, z)));
    const floor = box(size, 0.05, size, M.concreteDark);
    floor.position.y = -depth;
    g.add(floor);
    // Barandal
    const rail = std("#E8B800", 0.5, 0.2);
    const H = 0.9;
    const s = size / 2 + 0.25;
    [
      [-s, -s],
      [s, -s],
      [s, s],
      [-s, s],
    ].forEach(([x, z]) => g.add(at(cyl(0.025, 0.025, H, rail, 8), x, H / 2, z)));
    const rails = [
      [0, -s, size + 0.5, 0],
      [0, s, size + 0.5, 0],
      [-s, 0, size + 0.5, Math.PI / 2],
      [s, 0, size + 0.5, Math.PI / 2],
    ];
    rails.forEach(([x, z, L, ry]) => {
      [H, H * 0.5].forEach((y) => {
        const b = cyl(0.02, 0.02, L, rail, 8);
        b.rotation.z = Math.PI / 2;
        b.rotation.y = ry;
        b.position.set(x, y, z);
        g.add(b);
      });
    });
    return g;
  };

  /** Soporte de tubería temporal ("burro"). */
  WT.pipeStand = function (h = 0.45) {
    const g = new THREE.Group();
    g.add(at(box(0.5, 0.05, 0.3, M.darkSteel), 0, 0.025, 0));
    g.add(at(box(0.06, h - 0.05, 0.06, M.darkSteel), 0, h / 2, 0));
    g.add(at(box(0.3, 0.04, 0.12, M.darkSteel), 0, h - 0.07, 0));
    return g;
  };

  /* ----------------------------- Remolque ----------------------------- */
  /** Remolque tándem. Largo L en X, cubierta a la altura bedY. */
  WT.trailer = function (L = 7.4, W = 2.3, bedY = 0.78) {
    const g = new THREE.Group();
    const y = M.yellow;
    // Largueros y travesaños
    [-1, 1].forEach((s) => g.add(at(box(L, 0.2, 0.12, y), 0, bedY - 0.1, (s * W) / 2)));
    for (let i = 0; i <= 6; i++) g.add(at(box(0.1, 0.12, W, y), -L / 2 + (i / 6) * L, bedY - 0.12, 0));
    // Piso (rejilla)
    const deck = box(L - 0.1, 0.03, W - 0.1, std("#2E5A3A", 0.6, 0.2));
    deck.position.y = bedY + 0.005;
    g.add(deck);
    // Lanza y enganche
    const tongue = new THREE.Group();
    [-1, 1].forEach((s) => {
      const b = box(1.6, 0.12, 0.1, y);
      b.position.set(-0.75, 0, s * 0.45);
      b.rotation.y = -s * 0.5;
      tongue.add(b);
    });
    tongue.add(at(box(0.3, 0.12, 0.2, M.darkSteel), -1.55, 0, 0));
    tongue.position.set(-L / 2, bedY - 0.1, 0);
    g.add(tongue);
    // Gatos estabilizadores
    [
      [-L / 2 + 0.25, W / 2 + 0.05],
      [L / 2 - 0.25, W / 2 + 0.05],
      [-L / 2 + 0.25, -W / 2 - 0.05],
      [L / 2 - 0.25, -W / 2 - 0.05],
    ].forEach(([x, z]) => {
      g.add(at(box(0.09, bedY, 0.09, y), x, bedY / 2, z));
      g.add(at(box(0.22, 0.03, 0.22, y), x, 0.015, z));
    });
    // Ejes tándem y llantas
    const wheel = () => {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 14, 28), M.tire);
      tire.castShadow = true;
      w.add(tire);
      const rim = cyl(0.22, 0.22, 0.18, M.rim, 24);
      rim.rotation.x = Math.PI / 2;
      w.add(rim);
      const hub = cyl(0.07, 0.07, 0.22, M.darkSteel, 12);
      hub.rotation.x = Math.PI / 2;
      w.add(hub);
      return w;
    };
    [-0.48, 0.48].forEach((dx) => {
      const ax = cyl(0.04, 0.04, W + 0.3, M.darkSteel, 10);
      ax.rotation.x = Math.PI / 2;
      ax.position.set(L * 0.06 + dx, 0.41, 0);
      g.add(ax);
      [-1, 1].forEach((s) => {
        const w = wheel();
        w.position.set(L * 0.06 + dx, 0.41, s * (W / 2 + 0.12));
        g.add(w);
      });
    });
    // Salpicaderas
    [-1, 1].forEach((s) => {
      const f = box(1.9, 0.04, 0.32, y);
      f.position.set(L * 0.06, bedY + 0.02, s * (W / 2 + 0.13));
      g.add(f);
    });
    // Extintor
    const ext = cyl(0.07, 0.07, 0.42, M.red, 14);
    ext.position.set(L / 2 - 0.3, bedY + 0.24, -W / 2 + 0.18);
    g.add(ext);
    return g;
  };

  /* ----------------------------- Caseta de medición ----------------------------- */
  /**
   * Caseta con ventana hacia -Z. La pantalla de la PC es una textura de canvas
   * que la escena actualiza con lecturas del SCADA simulado.
   */
  WT.cabin = function (o = {}) {
    const g = new THREE.Group();
    const L = 5.2;
    const W = 2.5;
    const H = 2.6;
    const wall = M.white;
    // Base y muros (muro frontal con hueco de ventana)
    g.add(at(box(L + 0.1, 0.25, W + 0.1, M.darkSteel), 0, 0.2, 0));
    g.add(at(box(L, H, 0.08, wall), 0, 0.32 + H / 2, W / 2));
    [-1, 1].forEach((s) => g.add(at(box(0.08, H, W, wall), (s * L) / 2, 0.32 + H / 2, 0)));
    // Muro frontal (-Z) en piezas alrededor de la ventana
    const wy0 = 0.32;
    const winX = -0.6;
    const winW = 1.8;
    const winY = 1.25;
    const winH = 1.0;
    const fz = -W / 2;
    g.add(at(box(L / 2 + winX - winW / 2, H, 0.08, wall), (-L / 2 + (winX - winW / 2)) / 2, wy0 + H / 2, fz));
    g.add(at(box(L / 2 - winX - winW / 2, H, 0.08, wall), (L / 2 + (winX + winW / 2)) / 2, wy0 + H / 2, fz));
    g.add(at(box(winW, winY - wy0 + 0.01, 0.08, wall), winX, wy0 + (winY - wy0) / 2, fz));
    g.add(at(box(winW, wy0 + H - winY - winH, 0.08, wall), winX, (winY + winH + wy0 + H) / 2, fz));
    // Marco y vidrio
    const frame = M.navy;
    g.add(at(box(winW + 0.08, 0.06, 0.12, frame), winX, winY, fz));
    g.add(at(box(winW + 0.08, 0.06, 0.12, frame), winX, winY + winH, fz));
    [-1, 1].forEach((s) => g.add(at(box(0.06, winH, 0.12, frame), winX + (s * winW) / 2, winY + winH / 2, fz)));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), std("#9EC7E0", 0.05, 0.2, { transparent: true, opacity: 0.18 }));
    glass.position.set(winX, winY + winH / 2, fz - 0.01);
    glass.rotation.y = Math.PI;
    g.add(glass);
    // Techo
    g.add(at(box(L + 0.3, 0.1, W + 0.3, std("#D5DADF", 0.6, 0.2)), 0, wy0 + H + 0.05, 0));
    // Franja corporativa
    g.add(at(box(L + 0.02, 0.28, 0.02, M.navy), 0, wy0 + H - 0.28, fz - 0.045));
    g.add(at(box(L + 0.02, 0.06, 0.02, M.rbYellow), 0, wy0 + H - 0.46, fz - 0.045));
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.22),
      new THREE.MeshBasicMaterial({
        map: WT.textTex([{ t: "R.B. TEC · MEDICIÓN", color: "#ffffff" }], { w: 512, h: 66 }),
        transparent: true,
        toneMapped: false,
      }),
    );
    sign.position.set(1.4, wy0 + H - 0.28, fz - 0.06);
    sign.rotation.y = Math.PI;
    g.add(sign);
    // Puerta y escalón
    g.add(at(box(0.9, 2.0, 0.04, std("#D9DEE2", 0.5, 0.3)), 1.6, wy0 + 1.0, fz - 0.03));
    g.add(at(box(0.04, 0.04, 0.12, M.darkSteel), 1.25, wy0 + 1.0, fz - 0.08));
    g.add(at(box(1.1, 0.18, 0.5, M.darkSteel), 1.6, 0.09, fz - 0.35));
    // Aire acondicionado
    g.add(at(box(0.7, 0.45, 0.5, std("#E6E9EC", 0.4, 0.3)), -1.9, wy0 + 2.0, fz - 0.3));
    // Interior: escritorio, PC y pantalla
    g.add(at(box(1.6, 0.05, 0.7, std("#6B5B4A", 0.7, 0)), winX, 1.05, fz + 0.55));
    g.add(at(box(0.08, 0.75, 0.6, M.darkSteel), winX - 0.7, 0.68, fz + 0.55));
    g.add(at(box(0.08, 0.75, 0.6, M.darkSteel), winX + 0.7, 0.68, fz + 0.55));
    const monitor = new THREE.Group();
    monitor.add(at(box(0.72, 0.44, 0.04, M.black), 0, 0, 0));
    const screenTex = WT.canvasTex(1024, 620, () => {});
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.41), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    screen.position.z = -0.021;
    screen.rotation.y = Math.PI;
    monitor.add(screen);
    monitor.add(at(box(0.06, 0.18, 0.06, M.black), 0, -0.3, 0.02));
    monitor.add(at(box(0.3, 0.02, 0.2, M.black), 0, -0.39, 0.02));
    monitor.position.set(winX, 1.47, fz + 0.5);
    g.add(monitor);
    // Luz interior cálida
    const lamp = new THREE.PointLight("#FFF1D6", 0.6, 4);
    lamp.position.set(winX, wy0 + H - 0.3, 0);
    g.add(lamp);
    g.userData = { screen, screenTex, screenWorld: monitor, L, W, H };
    return g;
  };

  /** Gabinete del RTU sobre base, con puerta abierta y módulos ControlEdge. Frente hacia -Z. */
  WT.rtuCabinet = function () {
    const g = new THREE.Group();
    g.add(at(box(0.08, 1.0, 0.08, M.darkSteel), 0, 0.5, 0.12));
    g.add(at(box(0.5, 0.05, 0.4, M.darkSteel), 0, 0.025, 0.12));
    const bx = new THREE.Group();
    // Gabinete abierto (caja con fondo y laterales)
    const W = 0.8;
    const H = 1.0;
    const D = 0.32;
    bx.add(at(box(W, H, 0.03, M.rtu), 0, 0, D / 2));
    [-1, 1].forEach((s) => bx.add(at(box(0.03, H, D, M.rtu), (s * W) / 2, 0, 0)));
    [-1, 1].forEach((s) => bx.add(at(box(W, 0.03, D, M.rtu), 0, (s * H) / 2, 0)));
    // Puerta abierta
    const door = box(W, H, 0.03, M.rtu);
    door.geometry.translate(W / 2, 0, 0);
    door.position.set(-W / 2, 0, -D / 2);
    door.rotation.y = -1.9;
    bx.add(door);
    // Placa de montaje + riel DIN con módulos ControlEdge 2020
    bx.add(at(box(W - 0.08, H - 0.08, 0.01, std("#E9ECEF", 0.6, 0.1)), 0, 0, D / 2 - 0.02));
    const leds = [];
    for (let i = 0; i < 6; i++) {
      const m = box(0.085, 0.2, 0.12, M.module);
      m.position.set(-0.28 + i * 0.095, 0.22, D / 2 - 0.09);
      bx.add(m);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.005), M.green.clone());
      led.position.set(-0.28 + i * 0.095, 0.29, D / 2 - 0.152);
      bx.add(led);
      leds.push(led);
    }
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.07),
      new THREE.MeshBasicMaterial({ map: WT.textTex([{ t: "ControlEdge 2020 · RTU", color: "#0A2240" }], { w: 512, h: 64 }), transparent: true, toneMapped: false }),
    );
    label.position.set(-0.04, 0.38, D / 2 - 0.15);
    label.rotation.y = Math.PI;
    bx.add(label);
    // Borneras
    for (let i = 0; i < 12; i++) bx.add(at(box(0.03, 0.08, 0.05, std(i % 3 ? "#7A8590" : "#2E73B8", 0.6, 0.1)), -0.3 + i * 0.05, -0.12, D / 2 - 0.05));
    // Fuente
    bx.add(at(box(0.18, 0.16, 0.1, M.module), 0.22, -0.32, D / 2 - 0.07));
    bx.position.set(0, 1.4, 0);
    g.add(bx);
    g.userData = { leds };
    return g;
  };

  /* ----------------------------- Cabezal de recolección ----------------------------- */
  WT.cabezal = function (L = 4.2) {
    const g = new THREE.Group();
    const hdr = cyl(0.1, 0.1, L, M.pipe, 18);
    hdr.rotation.z = Math.PI / 2;
    hdr.position.y = 0.55;
    g.add(hdr);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.6 + (i * (L - 1.2)) / (n - 1);
      g.add(at(cyl(0.05, 0.05, 0.5, M.pipe, 12), x, 0.85, 0));
      const v = WT.gateValve(0.05);
      v.rotation.z = Math.PI / 2;
      const o = new THREE.Group();
      o.add(v);
      o.rotation.y = Math.PI / 2;
      o.position.set(x, 1.2, 0);
      g.add(o);
      g.add(at(cyl(0.05, 0.05, 0.3, M.pipe, 12), x, 1.55, 0));
      g.add(at(box(0.25, 0.4, 0.25, M.darkSteel), x, 0.2, 0));
    }
    // Salida a batería (bajante a enterrado)
    const out = cyl(0.12, 0.12, 0.6, M.pipe, 16);
    out.position.set(L / 2 + 0.3, 0.3, 0);
    g.add(out);
    g.add(at(box(0.6, 0.06, 0.6, M.concrete), L / 2 + 0.3, 0.03, 0));
    return g;
  };

  /** Malla ciclónica perimetral (rectángulo w×d). */
  WT.fence = function (w, d, h = 2) {
    const g = new THREE.Group();
    const mesh = WT.canvasTex(
      64,
      64,
      (c) => {
        c.clearRect(0, 0, 64, 64);
        c.strokeStyle = "rgba(200,210,218,0.9)";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(64, 64);
        c.moveTo(64, 0);
        c.lineTo(0, 64);
        c.stroke();
      },
      { repeat: [1, 1] },
    );
    const sides = [
      [0, -d / 2, w, 0],
      [0, d / 2, w, 0],
      [-w / 2, 0, d, Math.PI / 2],
      [w / 2, 0, d, Math.PI / 2],
    ];
    sides.forEach(([x, z, L, ry]) => {
      const t = mesh.clone();
      t.needsUpdate = true;
      t.repeat.set(L / 0.12, h / 0.12);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.4 }));
      p.position.set(x, h / 2, z);
      p.rotation.y = ry;
      g.add(p);
      for (let i = 0; i <= Math.round(L / 2.5); i++) {
        const u = -L / 2 + (i * L) / Math.round(L / 2.5);
        const post = cyl(0.03, 0.03, h + 0.1, M.fence, 8);
        if (ry) post.position.set(x, (h + 0.1) / 2, u);
        else post.position.set(u, (h + 0.1) / 2, z);
        g.add(post);
      }
    });
    return g;
  };

  /* ----------------------------- Vegetación ----------------------------- */
  /** Árboles instanciados (tronco + copa) en posiciones dadas [[x,z,s],...]. */
  WT.trees = function (list) {
    const g = new THREE.Group();
    const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6);
    trunkG.translate(0, 0.8, 0);
    const crownG = new THREE.IcosahedronGeometry(1.4, 1);
    crownG.translate(0, 2.6, 0);
    const trunks = new THREE.InstancedMesh(trunkG, std("#5B4632", 0.9, 0), list.length);
    const crowns = new THREE.InstancedMesh(crownG, std("#3E7A3A", 0.85, 0, { flatShading: true }), list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    list.forEach(([x, z, s], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), U.rand(i, 2) * 6.28);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.9 + U.rand(i, 5) * 0.4), s));
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
      c.setHSL(0.27 + U.rand(i, 7) * 0.07, 0.45, 0.24 + U.rand(i, 8) * 0.1);
      crowns.setColorAt(i, c);
    });
    trunks.castShadow = crowns.castShadow = true;
    crowns.receiveShadow = true;
    g.add(trunks, crowns);
    return g;
  };

  /** Camioneta sencilla (para la ruta de acceso). Frente hacia +X. */
  WT.pickup = function (color = "#F2F4F5") {
    const g = new THREE.Group();
    const paint = std(color, 0.35, 0.4);
    g.add(at(box(4.6, 0.55, 1.8, paint), 0, 0.75, 0));
    g.add(at(box(1.9, 0.6, 1.7, paint), 0.35, 1.3, 0));
    g.add(at(box(1.85, 0.5, 1.72, M.glass), 0.36, 1.32, 0));
    g.add(at(box(0.05, 0.25, 1.4, M.black), 2.31, 0.75, 0));
    [-1.4, 1.4].forEach((x) =>
      [-1, 1].forEach((s) => {
        const w = cyl(0.36, 0.36, 0.26, M.tire, 18);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.36, s * 0.85);
        g.add(w);
      }),
    );
    // Torreta (señalización)
    g.add(at(box(0.9, 0.08, 0.2, std("#FFB020", 0.3, 0, { emissive: new THREE.Color("#FF9900"), emissiveIntensity: 1.2 })), 0.35, 1.65, 0));
    return g;
  };
})();
