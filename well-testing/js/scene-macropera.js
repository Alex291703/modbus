/* =====================================================================
   3 · Vista aérea de la macropera
   Layout 3D / planta con árbol (pozo en aforo), cabezal, separador,
   líneas temporales con flujo animado, caseta de medición, zona de
   seguridad, ruta de acceso y cotas aproximadas. Medidas estimadas de la
   imagen satelital (config.macropera): verificar en campo.
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const THREE = window.THREE;
  const U = WT.util;
  const M = WT.mats;
  const cfg = WT.config;
  const MP = cfg.macropera;

  const ROAD = [
    [92, 0.03, 31.5],
    [60, 0.03, 31.5],
    [44, 0.03, 31],
    [36, 0.03, 29.5],
    [31, 0.03, 26],
  ];
  const ROAD_N = [
    [33, 0.03, -27],
    [42, 0.03, -26],
    [48.5, 0.03, -21],
    [51, 0.03, -10],
    [51.5, 0.03, 12],
    [49.5, 0.03, 25],
    [44, 0.03, 31],
  ];
  const ROAD_UP = [
    [42, 0.03, -26],
    [40, 0.03, -42],
    [38, 0.03, -70],
  ];

  class MacroperaScene {
    constructor(stageEl, overlayEl, sideEl, opts = {}) {
      this.stageEl = stageEl;
      this.overlayEl = overlayEl;
      this.sideEl = sideEl;
      this.stage = new WT.Stage(stageEl, { fov: 40 });
      this.stage.camera.far = 3000;
      this.stage.camera.updateProjectionMatrix();
      this.t = 0;
      this.mode = opts.view || new URLSearchParams(location.search).get("view") || "3d";
      this.layers = { lines: true, zone: true, road: true, dims: true, labels: true };
      this.wellId = MP.pozoEnAforo;
      this._build();
      this._buildOverlay();
      if (sideEl) this._buildSide();
      this.orbit = new WT.Orbit(this.stage.camera, this.stage.canvas, { minR: 12, maxR: 420, maxPhi: 1.35 });
      this.orbit.bounds = [-70, 90, -70, 70];
      this.setMode(this.mode, true);
      this.stage.onResize = () => this.renderAt(this.t);
      this.renderAt(0);
    }

    /* ============================== Mundo ============================== */
    _build() {
      const S = this.stage.scene;
      S.add(WT.sky("#5A8FC8", "#DCE7EE", "#CDD9E0"));
      S.fog = new THREE.Fog("#DCE6EC", 260, 900);
      S.add(new THREE.HemisphereLight("#DCEBFA", "#7E7458", 0.8));
      const sun = new THREE.DirectionalLight("#FFF3E0", 2.0);
      sun.position.set(60, 110, 50);
      sun.castShadow = true;
      sun.shadow.mapSize.set(4096, 4096);
      Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 20, far: 320 });
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.05;
      S.add(sun);

      // Terreno
      const grass = WT.noiseTex("#557A3E", 0.14, 256, 4, 500);
      grass.repeat.set(120, 120);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      S.add(ground);
      // Pera (plataforma de grava compactada)
      const W = MP.ancho;
      const D = MP.largo;
      const padShape = WT.roundedRect(-W / 2, -D / 2, W, D, 5);
      const pg = new THREE.ShapeGeometry(padShape, 8);
      pg.rotateX(-Math.PI / 2);
      const grav = WT.noiseTex("#C2B497", 0.12, 256, 9, 1200);
      grav.repeat.set(1 / 6, 1 / 6);
      const pad = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: grav, roughness: 1 }));
      pad.position.y = 0.02;
      pad.receiveShadow = true;
      S.add(pad);
      // Zonas con rebrote de vegetación (como en la imagen satelital)
      const veg = new THREE.MeshStandardMaterial({ color: "#7D8A55", roughness: 1, transparent: true, opacity: 0.55 });
      [
        [-20, 18, 22, 14],
        [-28, 0, 8, 22],
      ].forEach(([x, z, w, d]) => {
        const g = new THREE.ShapeGeometry(WT.roundedRect(x - w / 2, z - d / 2, w, d, 4));
        g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, veg);
        m.position.y = 0.03;
        m.receiveShadow = true;
        S.add(m);
      });

      // Pozos: contrapozo + árbol simplificado + parche de vegetación
      this.wells = {};
      const vegDisc = new THREE.MeshStandardMaterial({ color: "#5D7A3E", roughness: 1 });
      MP.pozos.forEach((w, i) => {
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(3.6 + U.rand(i, 3) * 0.8, 24), vegDisc);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.035;
        disc.receiveShadow = true;
        g.add(disc);
        g.add(WT.cellar(2.4, 1.0));
        const tr = WT.christmasTree();
        tr.rotation.y = Math.PI / 2;
        g.add(tr);
        g.position.set(w.x, 0, w.z);
        S.add(g);
        this.wells[w.id] = { ...w, group: g };
      });
      // Anillo pulsante en el pozo en aforo
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(2.6, 3.2, 48),
        new THREE.MeshBasicMaterial({ color: "#FFC20E", transparent: true, opacity: 0.8, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }),
      );
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.08;
      S.add(this.ring);

      // Cabezal de recolección (cercado)
      const C = MP.cabezal;
      const cab = new THREE.Group();
      const cabPad = WT.box(C.ancho, 0.12, C.largo, M.concrete);
      cabPad.position.y = 0.06;
      cab.add(cabPad);
      cab.add(WT.fence(C.ancho, C.largo, 2.0));
      const manifold = WT.cabezal(4.2);
      manifold.position.set(0, 0.12, 1.7);
      cab.add(manifold);
      // Línea a batería saliendo del cercado hacia el norte (enterrada)
      const bat = WT.pipe(
        [
          [2.4, 0.42, 1.7],
          [2.4, 0.42, -C.largo / 2 - 3],
        ],
        { r: 0.12, mat: M.pipe, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 2, spacing: 1.2 } },
      );
      cab.add(bat.group);
      this.batFlow = bat.flow;
      cab.position.set(C.x, 0, C.z);
      S.add(cab);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 1.1),
        new THREE.MeshBasicMaterial({ map: WT.textTex([{ t: cfg.pozo.cabezal, color: "#0A2240" }], { w: 1024, h: 244, bg: "#FFC20E" }), toneMapped: false, side: THREE.DoubleSide }),
      );
      sign.position.set(C.x - 3, 2.4, C.z + C.largo / 2 + 0.2);
      S.add(sign);

      // Separador sobre remolque (orientado norte-sur: entrada al sur)
      const sp = MP.separador;
      this.sepRoot = new THREE.Group();
      this.sepRoot.position.set(sp.x, 0, sp.z);
      this.sepRoot.rotation.y = sp.rot;
      const sep = new WT.Separator({ tag: cfg.equipo.seleccionado });
      sep.group.position.set(0, 1.78, 0);
      sep.setOpen(0);
      this.sepRoot.add(sep.group);
      const trailer = WT.trailer(7.4, 2.3, 0.78);
      trailer.position.set(1.4, 0, 0);
      this.sepRoot.add(trailer);
      S.add(this.sepRoot);
      this.sep = sep;
      this.sepRoot.updateMatrixWorld(true);
      const toW = (v) => this.sepRoot.localToWorld(v.clone().add(new THREE.Vector3(0, 1.78, 0)));
      this.sepIn = toW(sep.ports.inlet);
      this.sepOut = toW(sep.ports.outlet);

      // Caseta de medición + RTU
      const k = MP.caseta;
      const cabin = WT.cabin();
      cabin.position.set(k.x, 0, k.z);
      cabin.rotation.y = k.rot;
      S.add(cabin);
      this.cabin = cabin;
      const rtu = WT.rtuCabinet();
      rtu.position.set(k.x + 3.4, 0, k.z - 1.1);
      S.add(rtu);
      this.screenTex = cabin.userData.screenTex;

      // Punto de reunión (sugerido) junto al acceso
      const assembly = new THREE.Group();
      const ap = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshStandardMaterial({ color: "#2FA864", roughness: 0.8 }));
      ap.rotation.x = -Math.PI / 2;
      ap.position.y = 0.05;
      assembly.add(ap);
      const apSign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4),
        new THREE.MeshBasicMaterial({
          map: WT.canvasTex(256, 256, (g) => {
            g.fillStyle = "#1E9E57";
            g.fillRect(0, 0, 256, 256);
            g.strokeStyle = "#fff";
            g.lineWidth = 14;
            g.strokeRect(14, 14, 228, 228);
            g.fillStyle = "#fff";
            [
              [128, 70],
              [70, 170],
              [186, 170],
              [128, 140],
            ].forEach(([x, y]) => {
              g.beginPath();
              g.arc(x, y, 20, 0, 6.3);
              g.fill();
            });
          }),
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      );
      apSign.position.set(0, 2.2, 0);
      assembly.add(apSign);
      assembly.add(WT.at(WT.box(0.08, 1.6, 0.08, M.darkSteel), 0, 0.8, -0.02));
      assembly.position.set(36.5, 0, 33);
      S.add(assembly);
      this.assembly = assembly;

      // Ruta de acceso (cinta de grava con flechas animadas)
      this.roads = new THREE.Group();
      const roadMat = new THREE.MeshStandardMaterial({ color: "#B7A887", roughness: 1, side: THREE.DoubleSide });
      [ROAD, ROAD_N, ROAD_UP].forEach((pts) => this.roads.add(ribbon(pts, 6.5, roadMat, 0.025)));
      this.arrowMat = arrowMaterial();
      [ROAD, ROAD_N].forEach((pts) => {
        const r = ribbon(pts, 2.2, this.arrowMat, 0.06);
        r.renderOrder = 2;
        this.roads.add(r);
      });
      S.add(this.roads);
      this.truck = WT.pickup("#F4F6F7");
      S.add(this.truck);
      this.truckPath = WT.pipePath(ROAD.map((p) => [p[0], 0, p[2] + 1.6]).concat([[27, 0, 27.5]]), 4);

      // Vegetación perimetral
      const trees = [];
      for (let i = 0; i < 900; i++) {
        const x = -150 + U.rand(i, 21) * 300;
        const z = -150 + U.rand(i, 22) * 300;
        const inPad = Math.abs(x) < W / 2 + 4 && Math.abs(z) < D / 2 + 4;
        const inCab = Math.abs(x - C.x) < C.ancho / 2 + 3 && Math.abs(z - C.z) < C.largo / 2 + 3;
        const nearRoad = [ROAD, ROAD_N, ROAD_UP].some((r) => distToPolyline(x, z, r) < 6);
        if (inPad || inCab || nearRoad) continue;
        if (U.rand(i, 23) < 0.35 && Math.hypot(x, z) < 60) continue;
        const near = Math.hypot(x - 8, z) < 70;
        trees.push([x, z, (near ? 1.2 : 1.6) + U.rand(i, 24) * (near ? 1.1 : 1.8)]);
      }
      this.trees = WT.trees(trees);
      S.add(this.trees);

      // Líneas temporales, zona de seguridad y cotas (dependen del pozo)
      this.dyn = new THREE.Group();
      S.add(this.dyn);
      this.labelsDyn = [];
      this._route();
    }

    /** Traza líneas temporales, zona y cotas para el pozo seleccionado. */
    _route() {
      const g = this.dyn;
      while (g.children.length) {
        const c = g.children.pop();
        c.traverse((o) => o.geometry && o.geometry.dispose());
      }
      const w = this.wells[this.wellId];
      const si = this.sepIn;
      const so = this.sepOut;
      const lane = 24.5;
      const edge = w.z < 0 ? -27 : 27;
      const riserX = si.x - 1.7;
      const inPts = [
        [w.x + 0.62, 1.1, w.z],
        [w.x + 1.1, 1.1, w.z],
        [w.x + 1.1, 0.45, w.z],
        [w.x + 1.1, 0.45, edge],
        [lane, 0.45, edge],
        [lane, 0.45, si.z],
        [riserX, 0.45, si.z],
        [riserX, 2.95, si.z],
        [si.x, 2.95, si.z],
        [si.x, si.y + 0.02, si.z],
      ];
      const C = MP.cabezal;
      const outPts = [
        [so.x, so.y, so.z],
        [so.x + 0.6, so.y, so.z],
        [so.x + 0.6, 0.45, so.z],
        [so.x + 0.6, 0.45, C.z + C.largo / 2 + 2],
        [C.x - 2.1 - 1.2, 0.45, C.z + C.largo / 2 + 2],
        [C.x - 2.1 - 1.2, 0.45, C.z + 1.7],
        [C.x - 2.1, 0.67, C.z + 1.7],
      ];
      this.inLine = WT.pipe(inPts, { r: 0.07, mat: M.pipe, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 2.4, spacing: 1.2 }, flowScale: 1.6 });
      this.outLine = WT.pipe(outPts, { r: 0.07, mat: M.pipe, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 2.4, spacing: 1.2 }, flowScale: 1.6 });
      g.add(this.inLine.group, this.outLine.group);
      // Soportes cada ~4 m en los tramos a nivel de piso
      [this.inLine, this.outLine].forEach((ln) => {
        for (let d = 2; d < ln.length - 2; d += 4) {
          const p = ln.path.getPointAt(d / ln.length);
          if (p.y > 0.6) continue;
          const st = WT.pipeStand(0.4);
          st.position.set(p.x, 0, p.z);
          const tg = ln.path.getTangentAt(d / ln.length);
          st.rotation.y = Math.atan2(tg.x, tg.z);
          g.add(st);
        }
      });
      this.ring.position.set(w.x, 0.08, w.z);

      // Zona de seguridad: unión de radios alrededor del pozo, líneas y separador
      const margin = MP.margenSeguridad;
      const ext = { x0: -45, x1: 55, z0: -45, z1: 45 };
      const res = 6; // px por metro
      const zoneTex = WT.canvasTex((ext.x1 - ext.x0) * res, (ext.z1 - ext.z0) * res, (cx, Wpx, Hpx) => {
        const X = (x) => (x - ext.x0) * res;
        const Z = (z) => (z - ext.z0) * res;
        cx.clearRect(0, 0, Wpx, Hpx);
        cx.fillStyle = "#fff";
        cx.strokeStyle = "#fff";
        cx.lineCap = "round";
        cx.lineJoin = "round";
        cx.lineWidth = margin * 2 * res * 0.7;
        cx.beginPath();
        inPts.forEach((p, i) => (i ? cx.lineTo(X(p[0]), Z(p[2])) : cx.moveTo(X(p[0]), Z(p[2]))));
        cx.stroke();
        cx.beginPath();
        cx.arc(X(w.x), Z(w.z), (margin + 4) * res, 0, 6.283);
        cx.fill();
        cx.beginPath();
        const sx = this.sepRoot.position.x;
        const sz = this.sepRoot.position.z;
        cx.ellipse(X(sx), Z(sz - 1.4), (margin - 1) * res, (margin + 3.2) * res, 0, 0, 6.283);
        cx.fill();
        // Rayado diagonal (rojo/amarillo) recortado a la unión
        const pat = document.createElement("canvas");
        pat.width = Wpx;
        pat.height = Hpx;
        const pg = pat.getContext("2d");
        pg.fillStyle = "rgba(220,38,38,0.42)";
        pg.fillRect(0, 0, Wpx, Hpx);
        pg.strokeStyle = "rgba(255,196,14,0.9)";
        pg.lineWidth = res * 0.55;
        for (let k = -Hpx; k < Wpx; k += res * 2.6) {
          pg.beginPath();
          pg.moveTo(k, 0);
          pg.lineTo(k + Hpx, Hpx);
          pg.stroke();
        }
        cx.globalCompositeOperation = "source-in";
        cx.drawImage(pat, 0, 0);
        cx.globalCompositeOperation = "source-over";
      });
      const zone = new THREE.Mesh(
        new THREE.PlaneGeometry(ext.x1 - ext.x0, ext.z1 - ext.z0),
        new THREE.MeshBasicMaterial({ map: zoneTex, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }),
      );
      zone.rotation.x = -Math.PI / 2;
      zone.position.set((ext.x0 + ext.x1) / 2, 0.06, (ext.z0 + ext.z1) / 2);
      zone.renderOrder = 1;
      g.add(zone);
      this.zone = zone;

      // Cotas
      this.dims = new THREE.Group();
      const W = MP.ancho;
      const D = MP.largo;
      const dimDefs = [
        [[-W / 2, -D / 2 - 4], [W / 2, -D / 2 - 4], `≈ ${W} m`],
        [[-W / 2 - 4, -D / 2], [-W / 2 - 4, D / 2], `≈ ${D} m`],
      ];
      const lenIn = Math.round(this.inLine.length);
      const lenOut = Math.round(this.outLine.length);
      const dCab = Math.round(Math.hypot(MP.caseta.x - this.sepRoot.position.x, MP.caseta.z - this.sepRoot.position.z));
      this.dimText = { lenIn, lenOut, dCab };
      dimDefs.push([[this.sepRoot.position.x + 2.2, this.sepRoot.position.z + 2], [MP.caseta.x + 2.2, MP.caseta.z - 1.4], `≈ ${dCab} m`]);
      this.dimLabels = dimDefs.map(([a, b, txt]) => {
        this.dims.add(dimLine(a, b));
        return { pos: new THREE.Vector3((a[0] + b[0]) / 2, 0.3, (a[1] + b[1]) / 2), txt };
      });
      g.add(this.dims);
      this._labels();
      if (this.sideEl) this._updateSideInfo();
    }

    /* ============================== Etiquetas ============================== */
    _labels() {
      const L = this.stage.labels;
      L.clear();
      const lab = (id, anchor, off, d, layer) => {
        const it = L.add({ id, anchor, off, offP: off, ...d });
        it.layer = layer || "labels";
        return it;
      };
      const w = this.wells[this.wellId];
      this.labelDefs = [];
      MP.pozos.forEach((p) => {
        const sel = p.id === this.wellId;
        if (sel) return;
        const named = !/^P-/.test(p.id);
        this.labelDefs.push(lab("w-" + p.id, new THREE.Vector3(p.x, 2.4, p.z), [1.2, -1.6], { cls: "small", title: named ? p.nombre : p.nombre, sub: named ? "Pozo" : "" }));
      });
      const C = MP.cabezal;
      const s = this.sepRoot.position;
      const k = MP.caseta;
      const midIn = this.inLine.path.getPointAt(0.45);
      const midOut = this.outLine.path.getPointAt(0.55);
      this.labelDefs.push(
        lab("tree", new THREE.Vector3(w.x, 2.6, w.z), [-3, -3.5], { title: "Árbol de válvulas · pozo en aforo", sub: w.nombre }),
        lab("sep", new THREE.Vector3(s.x, 3.2, s.z), [3, -3], { title: `Separador ${cfg.equipo.seleccionado}`, sub: "Remolque de aforo" }),
        lab("cab", new THREE.Vector3(C.x, 2.6, C.z), [3, -2], { title: "Cabezal / manifold", sub: `${cfg.pozo.cabezal} → batería` }),
        lab("caseta", new THREE.Vector3(k.x, 3.2, k.z), [3, 2.5], { title: "Caseta de medición", sub: `PC · SCADA ${cfg.sistema.scada} · RTU` }),
        lab("lin", midIn, [-2, 2.8], { cls: "small", title: "Línea temporal de entrada", sub: `≈ ${this.dimText.lenIn} m · mezcla` }, "lines"),
        lab("lout", midOut, [2, 2.4], { cls: "small", title: "Línea temporal de retorno", sub: `≈ ${this.dimText.lenOut} m · a cabezal` }, "lines"),
        lab("zone", new THREE.Vector3(w.x - 6, 0.2, w.z + 8), [-3, 2.5], { cls: "small", title: "Zona de seguridad", sub: "Acceso restringido (aprox.)" }, "zone"),
        lab("road", new THREE.Vector3(62, 0.2, 31.5), [0, -3], { cls: "small", title: "Ruta de acceso", sub: "Entrada principal" }, "road"),
        lab("ap", new THREE.Vector3(36.5, 2.6, 33), [2.5, 2], { cls: "small", title: "Punto de reunión", sub: "Sugerido" }, "zone"),
      );
      this.dimLabels.forEach((d, i) => {
        this.labelDefs.push(lab("dim" + i, d.pos, [0.01, 0], { cls: "small dim", html: `<span class="t">${d.txt}</span>` }, "dims"));
      });
    }

    /* ============================== UI ============================== */
    _buildOverlay() {
      const o = this.overlayEl;
      o.innerHTML = `
        <div class="wt-toolbar-float">
          <div class="wt-seg" role="group" aria-label="Vista"><button data-m="3d">3D</button><button data-m="plan">Planta</button></div>
          <button class="wt-btn" data-a="fit" title="Reencuadrar">Encuadrar</button>
        </div>
        <svg class="wt-compass" viewBox="0 0 64 64" aria-label="Norte"><circle cx="32" cy="32" r="29" fill="rgba(5,18,36,0.75)" stroke="rgba(255,255,255,0.35)"/><g class="needle"><path d="M32 8 L40 34 L32 29 L24 34 Z" fill="#FFC20E"/><path d="M32 56 L40 34 L32 39 L24 34 Z" fill="#7590AE"/></g><text x="32" y="22" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="11" fill="#0A2240" class="nlabel">N</text></svg>
        <div class="wt-scalebar"><span class="txt">20 m</span><div class="b" style="width:100px"></div></div>
        <div class="wt-corner-logo" style="left:auto;right:96px;top:20px"><span class="wt-logo" data-logo></span></div>
        <div class="wt-hint">Arrastra para girar · clic derecho o Shift para desplazar · rueda para acercar · clic en un pozo para elegirlo</div>`;
      WT.brand.paint(o);
      this.ui = {
        segs: [...o.querySelectorAll("[data-m]")],
        needle: o.querySelector(".needle"),
        nlabel: o.querySelector(".nlabel"),
        scale: o.querySelector(".wt-scalebar"),
        scaleTxt: o.querySelector(".wt-scalebar .txt"),
        scaleBar: o.querySelector(".wt-scalebar .b"),
        hint: o.querySelector(".wt-hint"),
      };
      this.ui.segs.forEach((b) => (b.onclick = () => this.setMode(b.dataset.m)));
      o.querySelector('[data-a="fit"]').onclick = () => this.setMode(this.mode);
      if (WT.capture) {
        o.querySelector(".wt-toolbar-float").style.display = "none";
        this.ui.hint.style.display = "none";
      }
      // Selección de pozo con clic
      const ray = new THREE.Raycaster();
      let down = null;
      this.stage.canvas.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
      this.stage.canvas.addEventListener("pointerup", (e) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
        const r = this.stage.canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.stage.camera);
        const p = new THREE.Vector3();
        if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
        let best = null;
        let bd = 4;
        MP.pozos.forEach((w) => {
          const d = Math.hypot(w.x - p.x, w.z - p.z);
          if (d < bd) {
            bd = d;
            best = w.id;
          }
        });
        if (best && best !== this.wellId) this.selectWell(best);
      });
    }

    _buildSide() {
      const opts = MP.pozos.map((w) => `<option value="${w.id}" ${w.id === this.wellId ? "selected" : ""}>${w.nombre}</option>`).join("");
      this.sideEl.innerHTML = `
        <h2>${cfg.pozo.macropera}</h2>
        <p>Distribución del equipo de aforo en la pera. Elige el pozo en aforo y las líneas temporales se trazan de nuevo.</p>
        <label class="wt-note" for="mac-well">Pozo en aforo</label>
        <select class="wt-select" id="mac-well">${opts}</select>
        <h3>Capas</h3>
        <label class="wt-check"><input type="checkbox" data-l="lines" checked><i style="--c:#C98A55"></i>Líneas temporales (flujo)</label>
        <label class="wt-check"><input type="checkbox" data-l="zone" checked><i style="--c:repeating-linear-gradient(45deg,#E62828 0 4px,#FFC20E 4px 7px)"></i>Zona de seguridad</label>
        <label class="wt-check"><input type="checkbox" data-l="road" checked><i style="--c:#B7A887"></i>Ruta de acceso</label>
        <label class="wt-check"><input type="checkbox" data-l="dims" checked><i style="--c:#FFFFFF"></i>Cotas aproximadas</label>
        <label class="wt-check"><input type="checkbox" data-l="labels" checked><i style="--c:#4CC3F0"></i>Etiquetas</label>
        <h3>Medidas aproximadas</h3>
        <table class="wt-spec" id="mac-info"></table>
        <p class="wt-note" style="margin-top:10px">Medidas estimadas a partir de imagen satelital. La posición del separador, la caseta y la zona de seguridad es una propuesta para este material: definir en campo según el análisis de riesgo y la normativa aplicable.</p>
        <h3>Exportar</h3>
        <button class="wt-btn" id="mac-png">Descargar imagen (PNG)</button>`;
      this.sideEl.querySelector("#mac-well").onchange = (e) => this.selectWell(e.target.value);
      this.sideEl.querySelectorAll("[data-l]").forEach((c) => {
        c.onchange = () => {
          this.layers[c.dataset.l] = c.checked;
        };
      });
      this.sideEl.querySelector("#mac-png").onclick = () => this.download();
      this._updateSideInfo();
    }
    _updateSideInfo() {
      const tb = this.sideEl && this.sideEl.querySelector("#mac-info");
      if (!tb) return;
      const d = this.dimText;
      tb.innerHTML = `
        <tr><th>Pera (este-oeste × norte-sur)</th><td>≈ ${MP.ancho} × ${MP.largo} m</td></tr>
        <tr><th>Pozos en la pera</th><td>${MP.pozos.length}</td></tr>
        <tr><th>Línea temporal de entrada</th><td>≈ ${d.lenIn} m</td></tr>
        <tr><th>Línea temporal de retorno</th><td>≈ ${d.lenOut} m</td></tr>
        <tr><th>Separador → caseta</th><td>≈ ${d.dCab} m</td></tr>
        <tr><th>Margen de zona de seguridad</th><td>≈ ${MP.margenSeguridad} m</td></tr>`;
    }

    selectWell(id) {
      this.wellId = id;
      const sel = this.sideEl && this.sideEl.querySelector("#mac-well");
      if (sel) sel.value = id;
      this._route();
    }

    setMode(m, instant) {
      this.mode = m;
      if (this.ui) this.ui.segs.forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === m));
      const cam = this.stage.camera;
      const portrait = this.stage.portrait;
      if (m === "plan") {
        this.orbit.minPhi = 0.0001;
        this.orbit.maxPhi = 0.0002;
        cam.fov = 30;
        cam.updateProjectionMatrix();
        const span = portrait ? 150 : 104;
        const r = span / 2 / Math.tan((cam.fov * Math.PI) / 360);
        const pos = new THREE.Vector3(9, r, 0.001);
        const tgt = new THREE.Vector3(9, 0, 0);
        if (instant) this.orbit.setFrom(pos, tgt);
        else this.orbit.flyTo(pos, tgt);
        this.orbit.goal.theta = 0;
      } else {
        this.orbit.minPhi = 0.05;
        this.orbit.maxPhi = 1.35;
        cam.fov = 40;
        cam.updateProjectionMatrix();
        const pos = portrait ? new THREE.Vector3(46, 150, 105) : new THREE.Vector3(38, 92, 78);
        const tgt = new THREE.Vector3(8, 0, -2);
        if (instant) this.orbit.setFrom(pos, tgt);
        else this.orbit.flyTo(pos, tgt);
      }
    }

    /* ============================== Render ============================== */
    renderAt(t, dt = 1 / 60) {
      this.t = t;
      this.orbit.update(dt);
      const cam = this.stage.camera;
      const plan = this.mode === "plan";
      // Flujo y animaciones
      [this.inLine, this.outLine].forEach((l) => {
        l.flow.uniforms.uTime.value = t;
        l.group.visible = true;
        l.flow.uniforms.uOpacity.value = this.layers.lines ? 1 : 0;
      });
      this.batFlow.uniforms.uTime.value = t;
      this.zone.visible = this.layers.zone;
      this.assembly.visible = this.layers.zone;
      this.roads.visible = this.layers.road;
      this.arrowMat.uniforms.uTime.value = t;
      this.dims.visible = this.layers.dims;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      this.ring.scale.setScalar(1 + pulse * 0.35);
      this.ring.material.opacity = 0.9 - pulse * 0.5;
      // Camioneta recorriendo el acceso
      const u = (t * 0.045) % 1.25;
      const q = U.clamp(u, 0, 1);
      const p = this.truckPath.getPointAt(q);
      const tg = this.truckPath.getTangentAt(Math.min(0.999, q));
      this.truck.position.copy(p);
      this.truck.rotation.y = Math.atan2(-tg.z, tg.x);
      this.truck.visible = this.layers.road;
      // Pantalla de la caseta
      if (!this._scr || t - this._scr > 0.5) {
        this._scr = t;
        WT.scada.drawScreen(this.screenTex.userData.ctx, 1024, 620, WT.scada.compute(8 + t / 60));
        this.screenTex.needsUpdate = true;
      }
      // Etiquetas por capa
      const narrow = this.stage.w < 700;
      this.labelDefs.forEach((d) => {
        const on = this.layers.labels && (d.layer === "labels" || this.layers[d.layer]);
        d.opacity = on && !(narrow && /small/.test(d.cls || "")) ? 1 : 0;
      });
      // Brújula y escala
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const ang = plan ? -this.orbit.sph.theta : Math.atan2(dir.x, -dir.z);
      this.ui.needle.setAttribute("transform", `rotate(${(-ang * 180) / Math.PI} 32 32)`);
      const dist = cam.position.distanceTo(this.orbit.target);
      const mPerPx = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / this.stage.h;
      const nice = [5, 10, 20, 25, 50, 100].find((v) => v / mPerPx > 70) || 100;
      this.ui.scaleTxt.textContent = `${nice} m${plan ? "" : " (aprox. al centro)"}`;
      this.ui.scaleBar.style.width = `${nice / mPerPx}px`;
      this.stage.render(this.stage.rectsOf([this.overlayEl.querySelector(".wt-toolbar-float"), this.overlayEl.querySelector(".wt-compass"), this.ui.scale, this.overlayEl.querySelector(".wt-corner-logo")]));
    }

    /** PNG con la vista actual y sus etiquetas. */
    download() {
      this.renderAt(this.t);
      const src = this.stage.canvas;
      const out = document.createElement("canvas");
      out.width = src.width;
      out.height = src.height;
      const g = out.getContext("2d");
      g.drawImage(src, 0, 0);
      const k = src.width / this.stage.w;
      const base = this.stage.el.getBoundingClientRect();
      g.scale(k, k);
      this.stage.labels.items.forEach((it) => {
        if (it._op < 0.5) return;
        const l = it.line;
        g.strokeStyle = "rgba(255,255,255,0.8)";
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(+l.getAttribute("x1"), +l.getAttribute("y1"));
        g.lineTo(+l.getAttribute("x2"), +l.getAttribute("y2"));
        g.stroke();
        const r = it.card.getBoundingClientRect();
        const x = r.left - base.left;
        const y = r.top - base.top;
        g.fillStyle = "rgba(8,24,46,0.88)";
        g.fillRect(x, y, r.width, r.height);
        g.fillStyle = "#FFC20E";
        g.fillRect(x, y, 3, r.height);
        const t = it.card.querySelector(".t");
        const s = it.card.querySelector(".s");
        g.fillStyle = "#fff";
        g.font = '700 13px "Barlow Condensed", sans-serif';
        g.textBaseline = "top";
        g.fillText((t ? t.textContent : "").toUpperCase(), x + 10, y + 5);
        if (s && s.textContent) {
          g.fillStyle = "#AFC3D8";
          g.font = '400 11.5px "Barlow", sans-serif';
          g.fillText(s.textContent, x + 10, y + 21);
        }
      });
      try {
        const a = document.createElement("a");
        a.download = `macropera-${this.mode}.png`;
        a.href = out.toDataURL("image/png");
        a.click();
      } catch (e) {
        alert("El navegador bloqueó la descarga de la imagen. Ábrela desde un servidor local o usa una captura de pantalla.");
      }
    }

    activate() {
      let t0 = performance.now();
      this.stage.start((dt) => {
        this.t = (performance.now() - t0) / 1000;
        this.renderAt(this.t, dt);
      });
    }
    deactivate() {
      this.stage.stop();
    }
  }

  /* ----------------------------- Utilidades ----------------------------- */
  function ribbon(pts, width, mat, y) {
    const path = WT.pipePath(pts, 8);
    const n = Math.ceil(path.getLength() / 1.5);
    const pos = [];
    const uv = [];
    const idx = [];
    const L = path.getLength();
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = path.getPointAt(u);
      const t = path.getTangentAt(u);
      const nx = -t.z;
      const nz = t.x;
      const l = Math.hypot(nx, nz) || 1;
      pos.push(p.x + (nx / l) * width * 0.5, y, p.z + (nz / l) * width * 0.5, p.x - (nx / l) * width * 0.5, y, p.z - (nz / l) * width * 0.5);
      uv.push(u * L, 0, u * L, 1);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  function arrowMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float w = abs(vUv.y - 0.5) * 2.0;
          float ph = fract((-vUv.x + uTime * 4.0) / 6.0 + w * 0.12);
          float a = smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.1, 0.14, ph)) * (1.0 - smoothstep(0.85, 1.0, w));
          gl_FragColor = vec4(1.0, 0.86, 0.3, a * 0.85);
          #include <encodings_fragment>
        }`,
    });
  }

  function dimLine(a, b) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", toneMapped: false });
    const A = new THREE.Vector3(a[0], 0.25, a[1]);
    const B = new THREE.Vector3(b[0], 0.25, b[1]);
    const len = A.distanceTo(B);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, len), mat);
    bar.position.copy(A).add(B).multiplyScalar(0.5);
    bar.lookAt(B);
    g.add(bar);
    const dir = B.clone().sub(A).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    [A, B].forEach((P, i) => {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 2.4), mat);
      tick.position.copy(P);
      tick.lookAt(P.clone().add(perp));
      g.add(tick);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 12), mat);
      cone.position.copy(P).addScaledVector(dir, i ? -0.7 : 0.7);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), i ? dir : dir.clone().negate());
      g.add(cone);
    });
    return g;
  }

  function distToPolyline(x, z, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, , az] = pts[i];
      const [bx, , bz] = pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = U.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
    return best;
  }

  WT.MacroperaScene = MacroperaScene;
})();
