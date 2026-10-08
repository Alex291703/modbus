/* =====================================================================
   1 · Animación del proceso: pozo → separador → batería
   Recorrido de cámara de ~84 s con flechas de flujo por color, etiquetas
   de equipos e instrumentos y SCADA simulado. renderAt(t) es función pura
   del tiempo (se usa también para exportar MP4 cuadro por cuadro).
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const THREE = window.THREE;
  const U = WT.util;
  const M = WT.mats;
  const cfg = WT.config;

  const DURATION = 84;
  const CHAPTERS = [
    { t: 0, id: "intro", name: "Inicio", cap: `Aforo de pozos: medición de aceite, agua y gas en <b>circuito cerrado</b> durante 24 h.` },
    { t: 6, id: "pozo", name: "Pozo", cap: `El fluido sale por el <b>árbol de válvulas</b>. El transmisor <b>TDP</b> mide la presión en boca de pozo.` },
    { t: 15, id: "estr", name: "Estrangulador", cap: `El <b>estrangulador</b> (TP/TR) regula el gasto: la presión cae de la boca de pozo a la presión de línea.` },
    { t: 23.5, id: "linea", name: "Línea de entrada", cap: `La mezcla viaja por la <b>línea de entrada</b> temporal; <b>TPL</b> mide la presión de la línea de salida.` },
    { t: 29, id: "sep", name: "Separador bifásico", cap: `En el <b>separador</b> la mezcla choca con el deflector, libera el gas y el líquido se asienta por gravedad.` },
    { t: 41, id: "liq", name: "Líquido · Coriolis", cap: `El líquido (aceite + agua) pasa por el <b>Coriolis Promass 300</b>: flujo másico, densidad y % de agua.` },
    { t: 49, id: "gas", name: "Gas · Placa de orificio", cap: `El gas se mide con <b>placa de orificio</b> y el transmisor de presión diferencial <b>TDG</b>.` },
    { t: 57, id: "bat", name: "Línea a batería", cap: `Gas y líquido se <b>reincorporan</b> y regresan a la línea hacia batería: <b>no se ventea</b>.` },
    { t: 64, id: "scada", name: "RTU · SCADA", cap: `Todas las señales llegan al <b>RTU ${cfg.sistema.rtu}</b> y se visualizan en el <b>SCADA ${cfg.sistema.scada}</b>.` },
    { t: 77.6, id: "cierre", name: "Cierre", cap: "" },
  ];

  // Cámara (16:9). En vertical se aleja y abre el campo de visión.
  const KEYS = [
    { t: 0, p: [58, 46, 60], l: [14, 0, 0], fov: 38 },
    { t: 5.2, p: [6, 9, 15], l: [2, 1, 0], fov: 40 },
    { t: 7, p: [-5.6, 3.4, 6.6], l: [0.3, 1.2, 0] },
    { t: 11, p: [-3.0, 2.6, 5.0], l: [0.3, 1.25, 0] },
    { t: 14.5, p: [2.2, 3.0, 4.6], l: [0.6, 1.15, 0] },
    { t: 17, p: [2.9, 1.95, 2.7], l: [1.0, 0.95, 0] },
    { t: 21.5, p: [3.6, 1.7, 2.9], l: [1.6, 0.7, 0] },
    { t: 24.5, p: [5.4, 2.6, 6.2], l: [7.6, 0.6, 0] },
    { t: 27.3, p: [9.6, 3.2, 6.6], l: [11.8, 1.5, 0] },
    { t: 30, p: [15.4, 3.4, 7.4], l: [15.9, 1.6, 0] },
    { t: 35, p: [16.2, 2.5, 5.3], l: [15.7, 1.7, 0] },
    { t: 39.5, p: [17.2, 2.2, 5.0], l: [16.6, 1.5, 0] },
    { t: 42, p: [18.4, 2.3, 4.6], l: [18.4, 1.0, 0.6] },
    { t: 46.5, p: [19.6, 2.1, 4.3], l: [19.0, 1.0, 0.6] },
    { t: 50, p: [18.6, 3.9, 3.9], l: [18.4, 2.7, 0] },
    { t: 54.5, p: [19.8, 3.7, 4.0], l: [19.2, 2.6, 0] },
    { t: 58, p: [21.6, 2.7, 5.0], l: [20.6, 1.0, 0.6] },
    { t: 61.5, p: [29.5, 4.6, 9.0], l: [34.5, 0.7, 0.6] },
    { t: 65, p: [25, 10.5, 9.5], l: [12.0, 0.6, -5.5] },
    { t: 68.5, p: [13.5, 2.4, -4.5], l: [12.6, 1.35, -8.0] },
    { t: 71, p: [10.1, 1.75, -5.4], l: [10.1, 1.55, -8.75] },
    { t: 72.8, p: [10.1, 1.5, -7.85], l: [10.1, 1.47, -8.75], e: "lin" },
    { t: 77.6, p: [10.1, 1.49, -7.8], l: [10.1, 1.47, -8.75] },
    { t: 78.4, p: [24, 20, 34], l: [14, 0.5, 0] },
    { t: 84, p: [34, 27, 44], l: [14, 0, 0] },
  ];

  const SEP_POS = new THREE.Vector3(15.9, 1.78, 0);

  class ProcesoScene {
    constructor(stageEl, overlayEl, transportEl, opts = {}) {
      this.stageEl = stageEl;
      this.overlayEl = overlayEl;
      this.transportEl = transportEl;
      this.stage = new WT.Stage(stageEl, { fov: 40 });
      this.t = 0;
      this.playing = !opts.paused;
      this.showLabels = true;
      this.explore = false;
      this.rig = new WT.CameraRig(KEYS);
      this._cam = {};
      this.flows = [];
      this._buildWorld();
      this._buildLabels();
      this._buildOverlay();
      if (transportEl) this._buildTransport();
      this.orbit = new WT.Orbit(this.stage.camera, this.stage.canvas, { minR: 1.5, maxR: 120 });
      this.orbit.enabled = false;
      this.stage.onResize = () => this.renderAt(this.t);
      this.renderAt(0);
    }

    /* ============================== Mundo ============================== */
    _buildWorld() {
      const S = this.stage.scene;
      S.add(WT.sky("#4F86C2", "#DDE8EF", "#C9D6DE"));
      S.fog = new THREE.Fog("#DCE6EC", 70, 320);
      S.add(new THREE.HemisphereLight("#DCEBFA", "#8B7B5E", 0.75));
      const sun = new THREE.DirectionalLight("#FFF3E0", 2.1);
      sun.position.set(26, 42, 26);
      sun.target.position.set(16, 0, 2);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -27;
      sc.right = 27;
      sc.top = 20;
      sc.bottom = -20;
      sc.near = 10;
      sc.far = 110;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
      S.add(sun, sun.target);

      // Terreno: pasto + pera de grava
      const grass = WT.noiseTex("#5E7F45", 0.12, 256, 3, 400);
      grass.repeat.set(80, 80);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      S.add(ground);
      const grav = WT.noiseTex("#BFB093", 0.1, 256, 7, 900);
      grav.repeat.set(18, 10);
      const padG = new THREE.ShapeGeometry(roundedRect(-14, -16, 60, 34, 4));
      padG.rotateX(-Math.PI / 2);
      const pad = new THREE.Mesh(padG, new THREE.MeshStandardMaterial({ map: grav, roughness: 1 }));
      pad.position.y = 0.012;
      pad.receiveShadow = true;
      // UV de ShapeGeometry = coordenadas: escalar textura
      grav.repeat.set(1 / 3.5, 1 / 3.5);
      S.add(pad);

      // Pozo en aforo + contrapozo
      const tree = WT.christmasTree();
      S.add(tree);
      S.add(WT.cellar(2.4, 1.0));
      this.tree = tree;
      // Otros pozos de la macropera (contexto)
      [
        [-9, -8],
        [3.0, -13],
        [-11, 6],
        [-3, 11.5],
      ].forEach(([x, z]) => {
        const c = WT.cellar(2.4, 1.0);
        c.position.set(x, 0, z);
        const tr = WT.christmasTree();
        tr.position.set(x, 0, z);
        tr.rotation.y = U.rand(x, z) * 3;
        S.add(c, tr);
      });

      // Estrangulador en la lateral de producción
      const choke = WT.choke();
      choke.position.set(0.82, 1.1, 0);
      S.add(choke);
      this.choke = choke;

      // Línea de entrada (mezcla): árbol → estrangulador → separador
      const inPts = [
        [0.18, 1.1, 0],
        [0.82, 1.1, 0],
        [0.82, 0.45, 0],
        [11.2, 0.45, 0],
        [11.2, 2.95, 0],
        [14.7, 2.95, 0],
        [14.7, 2.55, 0],
      ];
      this.inLine = WT.pipe(inPts, { r: 0.055, mat: M.pipe, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 1.5, spacing: 0.7 } });
      S.add(this.inLine.group);
      for (let x = 2.5; x < 10.8; x += 2.6) {
        const st = WT.pipeStand(0.4);
        st.position.set(x, 0, 0);
        S.add(st);
      }
      // TDP (tapa del árbol) y TPL (línea aguas abajo del estrangulador)
      const tdp = WT.pressureTx({ scale: 1.2 });
      tdp.position.set(0.05, 1.96, 0);
      S.add(tdp);
      const tpl = WT.pressureTx({ scale: 1.2 });
      tpl.position.set(2.0, 0.5, 0);
      S.add(tpl);

      // Separador sobre remolque
      const sep = new WT.Separator({ tag: cfg.equipo.seleccionado });
      sep.group.position.copy(SEP_POS);
      S.add(sep.group);
      this.sep = sep;
      const trailer = WT.trailer(7.4, 2.3, 0.78);
      trailer.position.set(SEP_POS.x + 1.4, 0, 0);
      S.add(trailer);
      const W = (v) => v.clone().add(SEP_POS);
      this.A = {
        tdp: new THREE.Vector3(0.05, 2.38, 0),
        tpl: new THREE.Vector3(2.0, 0.92, 0),
        tree: new THREE.Vector3(0, 2.15, 0),
        masters: new THREE.Vector3(0, 0.55, 0.2),
        wing: new THREE.Vector3(0.42, 1.25, 0.15),
        choke: new THREE.Vector3(0.95, 1.25, 0.05),
        line: new THREE.Vector3(8.6, 0.5, 0),
        sep: W(new THREE.Vector3(-0.4, 0.5, 0)),
        defl: W(sep.anchors.deflector),
        mist: W(sep.anchors.mist),
        gasSpace: W(sep.anchors.gasSpace),
        liquid: W(sep.anchors.liquid),
        tps: W(sep.anchors.tps),
        tt: W(sep.anchors.tt),
        tn: W(sep.anchors.tn),
        coriolis: W(sep.anchors.coriolis),
        lcv: W(sep.anchors.lcv),
        tdg: W(sep.anchors.tdg),
        orifice: W(sep.anchors.orifice),
        pcv: W(sep.anchors.pcv),
        tee: W(sep.anchors.tee),
        tdm: W(sep.anchors.tdm),
      };

      // Línea de salida a batería: T del patín → cabezal
      const o = W(sep.ports.outlet);
      this.outLine = WT.pipe(
        [
          [o.x, o.y, o.z],
          [o.x + 0.5, o.y, o.z],
          [o.x + 0.5, 0.45, o.z],
          [33.0, 0.45, o.z],
          [33.0, 0.55, o.z],
        ],
        { r: 0.06, mat: M.pipe, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 1.5, spacing: 0.75 } },
      );
      S.add(this.outLine.group);
      for (let x = 23.5; x < 32.5; x += 2.6) {
        const st = WT.pipeStand(0.4);
        st.position.set(x, 0, o.z);
        S.add(st);
      }
      const cab = WT.cabezal(4.2);
      cab.position.set(35.1, 0, o.z);
      S.add(cab);
      const fence = WT.fence(8, 5, 1.8);
      fence.position.set(35.6, 0, o.z);
      S.add(fence);
      this.A.cabezal = new THREE.Vector3(35.1, 1.9, o.z);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.55),
        new THREE.MeshBasicMaterial({ map: WT.textTex([{ t: "A BATERÍA →", color: "#0A2240" }], { w: 512, h: 128, bg: "#FFC20E" }), toneMapped: false }),
      );
      sign.position.set(38.4, 1.3, o.z + 0.3);
      S.add(sign);
      S.add(WT.at(WT.box(0.08, 1.2, 0.08, M.darkSteel), 38.4, 0.6, o.z + 0.25));

      // Caseta de medición + RTU
      const cabin = WT.cabin();
      cabin.position.set(9.5, 0, -9.5);
      cabin.rotation.y = Math.PI;
      S.add(cabin);
      this.cabin = cabin;
      const rtu = WT.rtuCabinet();
      rtu.position.set(12.6, 0, -8.0);
      rtu.rotation.y = Math.PI;
      S.add(rtu);
      this.rtu = rtu;
      this.A.rtu = new THREE.Vector3(12.6, 2.0, -8.0);
      this.A.cabin = new THREE.Vector3(9.5, 3.1, -9.5);
      this.A.trunk = new THREE.Vector3(12.6, 0.1, -4.6);

      // Cableado de señales: bajan por detrás de los equipos a una charola
      // a nivel de piso (z = -1.7) y de ahí al RTU junto a la caseta.
      const trunkZ = -1.7;
      const rtuIn = [12.6, 0.85, -7.9];
      const cablePts = (p, back) => {
        const pts = [[p.x, p.y, p.z]];
        pts.push([p.x, p.y, back]);
        pts.push([p.x, 0.06, back]);
        pts.push([p.x, 0.06, trunkZ]);
        pts.push([12.6, 0.06, trunkZ]);
        pts.push([12.6, 0.06, -7.5]);
        pts.push(rtuIn);
        return pts;
      };
      const inst = [
        ["TDP", new THREE.Vector3(0.05, 2.2, -0.04), 8.5, -0.3],
        ["TPL", new THREE.Vector3(2.0, 0.66, -0.05), 11, -0.35],
        ["TPS", W(new THREE.Vector3(-0.3, 0.72, -0.25)), 30, -1.32],
        ["TT", W(new THREE.Vector3(0.35, 0.6, -0.45)), 31, -1.32],
        ["TN", W(new THREE.Vector3(1.97, 0.62, -0.05)), 31, -1.32],
        ["CORIOLIS", W(new THREE.Vector3(2.2, -0.62, 0.5)), 39, -1.32],
        ["TDG", W(new THREE.Vector3(2.2, 1.45, -0.05)), 37, -1.32],
        ["TDM", W(new THREE.Vector3(4.58, -0.45, 0.5)), 42, -1.32],
      ];
      this.cables = inst.map(([tag, p, t0, back], i) => {
        const pts = cablePts(p, back);
        const path = WT.pipePath(pts, 0.08);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(path, Math.ceil(path.getLength() * 6), 0.01, 6, false), M.cable);
        S.add(tube);
        return { tag, path, len: path.getLength(), t0, i };
      });
      this.pulses = new WT.Particles(this.cables.length * 4, { additive: true, renderOrder: 6 });
      S.add(this.pulses.points);

      // Vegetación alrededor de la pera
      const trees = [];
      for (let i = 0; i < 170; i++) {
        const a = U.rand(i, 11) * Math.PI * 2;
        const r = 34 + U.rand(i, 12) * 70;
        const x = 16 + Math.cos(a) * r * 1.2;
        const z = Math.sin(a) * r;
        if (x > -18 && x < 50 && z > -20 && z < 20) continue;
        trees.push([x, z, 1.2 + U.rand(i, 13) * 1.5]);
      }
      S.add(WT.trees(trees));

      // Pantalla de la PC (textura viva)
      this.screen = cabin.userData.screenTex;
      this.ledMats = rtu.userData.leds.map((l) => l.material);
    }

    /* ============================== Etiquetas ============================== */
    _buildLabels() {
      const L = this.stage.labels;
      const A = this.A;
      const I = (tag) => cfg.instrumentos.find((i) => i.tag === tag) || {};
      const lab = (id, anchor, win, off, offP, d) => L.add({ id, anchor, win, off, offP, ...d });
      const sepName = `${cfg.equipo.tipo.replace(" de circuito cerrado", "")} ${cfg.equipo.seleccionado}`;
      this.labelDefs = [
        lab("tree", A.tree, [6.6, 14.8], [-7, -6], [-10, -16], { title: "Árbol de válvulas", sub: `Pozo ${cfg.pozo.nombre}` }),
        lab("masters", A.masters, [8.2, 14.6], [-9, 4], [-12, 12], { title: "Válvulas maestras", sub: "Aíslan el pozo" }),
        lab("wing", A.wing, [9.2, 14.6], [8, 6], [6, 22], { title: "Válvula lateral", sub: "Producción (TP)" }),
        lab("tdp", A.tdp, [7.6, 15.2], [6, -5], [8, -14], { cls: "inst", tag: "TDP", title: I("TDP").variable, val: "" }),
        lab("choke", A.choke, [15.4, 23.8], [6, -8], [6, -18], { title: "Estrangulador (TP/TR)", sub: `Diámetro ${cfg.pozo.estrangulador} · controla el gasto` }),
        lab("dp", new THREE.Vector3(1.6, 0.48, 0.1), [17.2, 23.8], [7, 6], [4, 18], { title: "Caída de presión", val: "" }),
        lab("tpl", A.tpl, [18.4, 28.6], [-6, -7], [-6, -16], { cls: "inst", tag: "TPL", title: I("TPL").variable, val: "" }),
        lab("line", A.line, [24, 28.4], [-3, -7], [-4, -18], { title: "Línea de entrada (temporal)", sub: "Mezcla multifásica · café" }),
        lab("sep", A.sep, [29.4, 40.4], [-11, -11], [-6, -30], { title: sepName, sub: "Separación gas / líquido por gravedad" }),
        lab("defl", A.defl, [31.6, 35.6], [-9, 5], [-4, 20], { title: "Deflector de entrada", sub: "Choque y cambio de dirección" }),
        lab("gasz", A.gasSpace, [32.2, 36.2], [-4, -10], [-4, -30], { cls: "small", title: "Gas", sub: "se libera y sube" }),
        lab("liqz", A.liquid, [32.6, 36.2], [-6, 8], [-6, 22], { cls: "small", title: "Líquido (aceite + agua)", sub: "se asienta por gravedad" }),
        lab("mist", A.mist, [33.2, 37.6], [4, -11], [2, -26], { title: "Extractor de niebla", sub: "Atrapa gotas finas del gas" }),
        lab("tps", A.tps, [36.2, 40.6], [-3, -9], [-6, -20], { cls: "inst", tag: "TPS", title: I("TPS").variable, val: "" }),
        lab("tt", A.tt, [36.8, 40.6], [7, -7], [10, -14], { cls: "inst", tag: "TT", title: I("TT").variable, val: "" }),
        lab("tn", A.tn, [37.4, 47.5], [6, -3], [4, -12], { cls: "inst", tag: "TN", title: I("TN").variable, val: "" }),
        lab("cor", A.coriolis, [41.4, 48.6], [-5, -9], [-12, -22], { cls: "inst", tag: "CORIOLIS", title: "Promass 300 (E+H)", sub: "Flujo másico · densidad · % agua", val: "" }),
        lab("lcv", A.lcv, [43, 48.6], [5, -8], [4, -22], { title: "Válvula de control de líquido", sub: "Mantiene el nivel (lazo TN)", val: "" }),
        lab("ori", A.orifice, [49.6, 56.6], [-6, 7], [-10, 18], { title: "Placa de orificio", sub: "Elemento primario de gas" }),
        lab("tdg", A.tdg, [49.4, 56.6], [-6, -7], [-12, -18], { cls: "inst", tag: "TDG", title: "Presión diferencial de gas", val: "" }),
        lab("pcv", A.pcv, [51.4, 56.6], [6, -7], [6, -20], { title: "Válvula de control de gas", sub: "Mantiene la presión (lazo TPS)" }),
        lab("tee", A.tee, [57.6, 63], [6, 7], [6, 16], { title: "Reincorporación", sub: "Gas + líquido → línea a batería" }),
        lab("tdm", A.tdm, [58.2, 63], [5, -7], [4, -18], { cls: "inst", tag: "TDM", title: I("TDM").variable, val: "" }),
        lab("cab", A.cabezal, [60, 64.6], [-4, -8], [-12, -22], { title: "Cabezal → Batería", sub: "Circuito cerrado · no se ventea" }),
        lab("rtu", A.rtu, [65, 71], [-8, -7], [-10, -26], { title: `RTU ${cfg.sistema.rtu}`, sub: "Recibe todas las señales" }),
        lab("cabin", A.cabin, [65, 70.5], [-6, -6], [-10, -16], { title: "Caseta · PC de medición", sub: `SCADA ${cfg.sistema.scada}` }),
        lab("trunk", A.trunk, [65.4, 69.6], [-6, 5], [-4, 14], { cls: "inst", title: "Señales de instrumentos", sub: "8 transmisores → RTU" }),
      ];
    }

    /* ============================== Overlays ============================== */
    _buildOverlay() {
      const o = this.overlayEl;
      o.innerHTML = `
        <div class="wt-corner-logo"><span class="wt-logo" data-logo></span></div>
        <div class="wt-chapter"><b>01</b><span></span></div>
        <div class="wt-sim-tag">Simulación · valores ilustrativos</div>
        <div class="wt-flow-legend">
          <span><i style="--c:#C98A55"></i>Mezcla</span><span><i style="--c:#FFD400"></i>Gas</span>
          <span><i class="liq"></i>Líquido</span><span><i style="--c:#4CC3F0"></i>Señal</span>
        </div>
        <div class="wt-caption"></div>
        <div class="wt-scada-backdrop"></div>
        <div class="wt-titlecard intro"><div class="in"><span class="wt-logo" data-logo></span>
          <h1>Well Testing<br><em>Aforo de pozos</em></h1><div class="bar"></div>
          <p>Separador bifásico de circuito cerrado · medición de 24 h</p></div></div>
        <div class="wt-titlecard outro"><div class="in"><span class="wt-logo" data-logo></span>
          <h1>${cfg.empresa.lema.replace(" en ", "<br><em>en ")}</em></h1><div class="bar"></div>
          <p>Estabilización → En curso → Finalizado · ${cfg.equipo.seleccionado} · RTU ${cfg.sistema.rtu} · SCADA ${cfg.sistema.scada}</p></div></div>`;
      WT.brand.paint(o);
      this.ui = {
        chapter: o.querySelector(".wt-chapter"),
        chapNum: o.querySelector(".wt-chapter b"),
        chapName: o.querySelector(".wt-chapter span"),
        caption: o.querySelector(".wt-caption"),
        intro: o.querySelector(".intro"),
        outro: o.querySelector(".outro"),
        backdrop: o.querySelector(".wt-scada-backdrop"),
        logo: o.querySelector(".wt-corner-logo"),
        legend: o.querySelector(".wt-flow-legend"),
        sim: o.querySelector(".wt-sim-tag"),
      };
      this.mini = new WT.scada.Panel(o, "mini");
      this.full = new WT.scada.Panel(o, "full");
    }

    _buildTransport() {
      const tr = this.transportEl;
      tr.innerHTML = `
        <button class="wt-btn primary icon" data-a="play" title="Reproducir / pausa (espacio)" aria-label="Reproducir o pausar"></button>
        <button class="wt-btn icon" data-a="restart" title="Reiniciar" aria-label="Reiniciar"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg></button>
        <span class="wt-time">00:00 / 01:24</span>
        <div class="wt-timeline" role="slider" aria-label="Línea de tiempo" tabindex="0"><div class="track"><div class="fill"></div></div><div class="head"></div></div>
        <div class="wt-seg" role="group" aria-label="Formato"><button data-fmt="16x9" aria-pressed="true">16:9</button><button data-fmt="9x16" aria-pressed="false">9:16</button></div>
        <button class="wt-btn on" data-a="labels" title="Mostrar etiquetas">Etiquetas</button>
        <button class="wt-btn" data-a="explore" title="Pausar y girar la cámara libremente">Explorar 3D</button>`;
      this.tui = {
        play: tr.querySelector('[data-a="play"]'),
        time: tr.querySelector(".wt-time"),
        tl: tr.querySelector(".wt-timeline"),
        fill: tr.querySelector(".fill"),
        head: tr.querySelector(".head"),
        labels: tr.querySelector('[data-a="labels"]'),
        explore: tr.querySelector('[data-a="explore"]'),
      };
      CHAPTERS.slice(1).forEach((c, i) => {
        const d = U.el("div", "chap", `<span>${c.name}</span>`);
        d.style.left = `${(c.t / DURATION) * 100}%`;
        d.style.width = `${(((CHAPTERS[i + 2] || { t: DURATION }).t - c.t) / DURATION) * 100}%`;
        d.dataset.t = c.t;
        this.tui.tl.appendChild(d);
      });
      this.tui.chaps = [...this.tui.tl.querySelectorAll(".chap")];
      tr.querySelector('[data-a="play"]').onclick = () => this.toggle();
      tr.querySelector('[data-a="restart"]').onclick = () => {
        this.setExplore(false);
        this.t = 0;
        this.playing = true;
        this._syncPlay();
      };
      this.tui.labels.onclick = () => {
        this.showLabels = !this.showLabels;
        this.tui.labels.classList.toggle("on", this.showLabels);
      };
      this.tui.explore.onclick = () => this.setExplore(!this.explore);
      tr.querySelectorAll(".wt-seg button").forEach((b) => {
        b.onclick = () => this.setFormat(b.dataset.fmt);
      });
      const seek = (e) => {
        const r = this.tui.tl.getBoundingClientRect();
        this.t = U.clamp(((e.clientX - r.left) / r.width) * DURATION, 0, DURATION - 0.01);
        this.setExplore(false);
        this.renderAt(this.t);
      };
      let drag = false;
      this.tui.tl.addEventListener("pointerdown", (e) => {
        drag = true;
        this.tui.tl.setPointerCapture(e.pointerId);
        seek(e);
      });
      this.tui.tl.addEventListener("pointermove", (e) => drag && seek(e));
      this.tui.tl.addEventListener("pointerup", () => (drag = false));
      this.tui.tl.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") this.t = Math.min(DURATION - 0.01, this.t + 2);
        else if (e.key === "ArrowLeft") this.t = Math.max(0, this.t - 2);
        else return;
        e.preventDefault();
        this.renderAt(this.t);
      });
      this._syncPlay();
    }
    _syncPlay() {
      if (!this.tui) return;
      this.tui.play.innerHTML = this.playing
        ? '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
    toggle() {
      if (this.explore) this.setExplore(false);
      this.playing = !this.playing;
      if (this.playing && this.t >= DURATION - 0.05) this.t = 0;
      this._syncPlay();
    }
    setExplore(on) {
      this.explore = on;
      this.orbit.enabled = on;
      if (this.tui) this.tui.explore.classList.toggle("on", on);
      if (on) {
        this.playing = false;
        this._syncPlay();
        this.orbit.setFrom(this.stage.camera.position.clone(), this._cam.l.clone());
      }
    }
    setFormat(f) {
      this.stageEl.dataset.fmt = f;
      if (this.tui) this.tui.tl.parentElement.querySelectorAll(".wt-seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.fmt === f));
      requestAnimationFrame(() => {
        this.stage.resize();
        this.renderAt(this.t);
      });
    }

    /* ============================== Animación ============================== */
    /** Horas de prueba correspondientes al segundo t del video. */
    testHours(t) {
      if (t < 8) return (t - 8) / 16;
      if (t < 40) return ((t - 8) / 32) * 2;
      if (t < 76) return 2 + ((t - 40) / 36) * 24;
      return 26 + (t - 76) * 0.02;
    }

    renderAt(t) {
      this.t = t;
      const cam = this.stage.camera;
      const portrait = this.stage.portrait;
      // Cámara
      if (!this.explore) {
        this.rig.sample(t, this._cam);
        const c = this._cam;
        if (portrait) {
          const k = t > 72 && t < 77.7 ? 1.0 : 1.75;
          c.p.sub(c.l).multiplyScalar(k).add(c.l);
          c.fov = Math.min(70, c.fov + 16);
        }
        cam.position.copy(c.p);
        cam.lookAt(c.l);
        if (Math.abs(cam.fov - c.fov) > 0.01) {
          cam.fov = c.fov;
          cam.updateProjectionMatrix();
        }
      } else {
        this.orbit.update(1 / 60);
      }

      // Flujo en tuberías
      const inFront =
        t < 8.5 ? 0 : t < 10 ? U.lerp(0, 1.3, U.inv(8.5, 10, t)) : t < 20 ? U.lerp(1.3, 3.0, U.inv(10, 20, t)) : U.lerp(3.0, this.inLine.length + 0.6, U.inv(20, 29, t));
      this.inLine.flow.uniforms.uProgress.value = U.clamp(inFront / (this.inLine.length + 0.6), 0, 1);
      this.inLine.flow.uniforms.uTime.value = t;
      const outP = t < 41.5 ? 0 : t < 56 ? U.lerp(0, 0.16, U.inv(41.5, 56, t)) : U.lerp(0.16, 1, U.inv(56, 61, t));
      this.outLine.flow.uniforms.uProgress.value = outP;
      this.outLine.flow.uniforms.uTime.value = t;

      // Separador: apertura del corte e internos
      const sep = this.sep;
      sep.pr = this.stage.renderer.getPixelRatio();
      const open = U.smooth(30, 32.2, t) * (1 - U.smooth(39.6, 41.4, t));
      sep.setOpen(open);
      const inSep = U.smooth(29.4, 31, t);
      const pulseWin = (a, b) => U.win(t, a, b, 0.4);
      sep.update(
        t,
        {
          inflow: inSep,
          splash: 1,
          flash: U.smooth(31.5, 33, t),
          settle: U.smooth(32, 33.5, t),
          mist: pulseWin(32.6, 38),
          gasOut: U.smooth(31, 33, t),
          liqOut: U.smooth(33, 35, t),
          liqPhase: t * 0.5,
          level: sep.NLL + Math.sin(t * 0.9) * 0.025,
          lcvOpen: 0.5 + 0.12 * Math.sin(t * 0.9 - 0.6),
          pcvOpen: 0.45 + 0.05 * Math.sin(t * 0.7),
          hl: { deflector: pulseWin(31.6, 35), mist: pulseWin(32.6, 38), level: pulseWin(33.6, 37), tn: pulseWin(35.4, 39), lcv: pulseWin(43, 48.5), pcv: pulseWin(51.4, 56.5) },
          flowT: t,
          liqProg: U.inv(34, 40, t),
          gasProg: U.inv(33.5, 38.5, t),
          outProg: U.inv(40, 41.5, t),
          skidFlow: 1,
        },
        cam,
        this.stage.h,
      );

      // Señales: pulsos viajando por los cables
      const ps = this.pulses;
      ps.setScale(WT.pointScale(cam, this.stage.h), this.stage.renderer.getPixelRatio());
      const boost = U.win(t, 64, 72, 0.8);
      const sig = new THREE.Color("#4CC3F0");
      const p = new THREE.Vector3();
      let k = 0;
      this.cables.forEach((c) => {
        for (let j = 0; j < 4; j++, k++) {
          if (t < c.t0) {
            ps.hide(k);
            continue;
          }
          const u = ((t - c.t0) * (4 / c.len) + j / 4 + c.i * 0.13) % 1;
          c.path.getPointAt(u, p);
          ps.set(k, p.x, p.y + 0.02, p.z, 0.09 + 0.16 * boost, sig, 0.75 + 0.25 * boost, 2);
        }
      });
      ps.commit();
      this.ledMats.forEach((m, i) => {
        m.emissiveIntensity = (Math.floor(t * 6 + i * 1.7) % 3 === 0 ? 0.4 : 3) * (t > 8 ? 1 : 0.2);
      });

      // SCADA
      const th = this.testHours(t);
      const v = WT.scada.compute(th);
      const showMini = U.win(t, 6, 64.4, 0.6);
      this.mini.el.style.opacity = showMini;
      this.mini.visible = showMini > 0.01;
      if (showMini > 0.01) this.mini.update(v);
      const showFull = U.win(t, 72.3, 77.7, 0.5);
      this.full.el.style.opacity = showFull;
      this.full.el.style.transform = `translate(-50%, -50%) scale(${0.92 + 0.08 * showFull})`;
      this.full.visible = showFull > 0.01;
      this.ui.backdrop.style.opacity = U.win(t, 72.1, 77.8, 0.5) * 0.92;
      if (showFull > 0.01) this.full.update(v);
      if (!this._lastScreen || Math.abs(this._lastScreen - t) > 0.12 || WT.capture) {
        this._lastScreen = t;
        const tex = this.screen;
        WT.scada.drawScreen(tex.userData.ctx, 1024, 620, v);
        tex.needsUpdate = true;
      }

      // Etiquetas con valores vivos
      const L = this.stage.labels;
      const kg = (x) => `${U.fmt(x, 1)} kg/cm²`;
      L.set("tdp", WT.labelHTML({ tag: "TDP", title: "Presión boca de pozo", val: v.flowing ? kg(v.pPozo) : kg(v.pPozo) }));
      L.set("tpl", WT.labelHTML({ tag: "TPL", title: "Presión línea de salida", val: kg(v.pLin) }));
      L.set("dp", WT.labelHTML({ title: "Caída de presión", val: `${U.fmt(v.pPozo, 1)} → ${U.fmt(v.pLin, 1)} kg/cm²` }));
      L.set("tps", WT.labelHTML({ tag: "TPS", title: "Presión del separador", val: kg(v.pSep) }));
      L.set("tt", WT.labelHTML({ tag: "TT", title: "Temperatura", val: `${U.fmt(v.temp, 1)} °C` }));
      L.set("tn", WT.labelHTML({ tag: "TN", title: "Nivel del separador", val: `${U.fmt(v.level, 0)} %` }));
      L.set("cor", WT.labelHTML({ tag: "CORIOLIS", title: "Promass 300 (E+H)", sub: "Flujo másico · densidad · % agua", val: `${U.fmt(v.mass, 0)} kg/h · ${U.fmt(v.dens, 3)} g/cm³ · ${U.fmt(v.wc, 1)} %` }));
      L.set("lcv", WT.labelHTML({ title: "Válvula de control de líquido", sub: "Mantiene el nivel (lazo TN)", val: `Apertura ${U.fmt((0.5 + 0.12 * Math.sin(t * 0.9 - 0.6)) * 100, 0)} %` }));
      L.set("tdg", WT.labelHTML({ tag: "TDG", title: "ΔP placa de orificio", val: `Q gas ${U.fmt(v.qGas, 2)} MMpcd` }));
      L.set("tdm", WT.labelHTML({ tag: "TDM", title: "Presión línea a batería", val: kg(v.pBat) }));
      this.labelDefs.forEach((d) => {
        d.opacity = this.showLabels ? U.win(t, d.win[0], d.win[1], 0.45) : 0;
      });

      // Capítulo, subtítulo, títulos
      let ci = 0;
      while (ci < CHAPTERS.length - 1 && t >= CHAPTERS[ci + 1].t) ci++;
      const ch = CHAPTERS[ci];
      if (this._ci !== ci) {
        this._ci = ci;
        this.ui.chapNum.textContent = String(ci).padStart(2, "0");
        this.ui.chapName.textContent = ch.name;
        this.ui.caption.innerHTML = ch.cap;
        if (this.tui) this.tui.chaps.forEach((d, i) => d.classList.toggle("cur", i + 1 === ci));
      }
      const next = CHAPTERS[ci + 1] ? CHAPTERS[ci + 1].t : DURATION;
      const capOp = ci > 0 && ch.cap && !(t > 72.1 && t < 77.8) ? U.win(t, ch.t + 0.3, next - 0.1, 0.4) : 0;
      this.ui.caption.style.opacity = capOp;
      this.ui.chapter.style.opacity = ci > 0 && ci < CHAPTERS.length - 1 ? U.win(t, ch.t + 0.1, next, 0.3) : 0;
      const intro = 1 - U.smooth(4.3, 5.4, t);
      const outro = U.smooth(78.2, 79.4, t);
      this.ui.intro.style.opacity = intro;
      this.ui.intro.style.visibility = intro > 0.01 ? "visible" : "hidden";
      this.ui.outro.style.opacity = outro;
      this.ui.outro.style.visibility = outro > 0.01 ? "visible" : "hidden";
      this.ui.intro.querySelector(".in").style.transform = `translateY(${(1 - intro) * -20}px) scale(${1 + (1 - intro) * 0.05})`;
      this.ui.outro.querySelector(".in").style.transform = `translateY(${(1 - outro) * 20}px)`;
      const chrome = Math.min(1 - intro, 1 - outro);
      this.ui.logo.style.opacity = chrome;
      this.ui.legend.style.opacity = chrome * (1 - U.win(t, 72.1, 77.8, 0.5));
      this.ui.sim.style.opacity = chrome;

      // Desplaza el encuadre para dejar libre el panel SCADA
      const vo = showMini * (1 - (this.explore ? 1 : 0));
      const W0 = this.stage.w;
      const H0 = this.stage.h;
      if (vo > 0.001) {
        if (portrait) cam.setViewOffset(W0, H0, 0, H0 * 0.1 * vo, W0, H0);
        else cam.setViewOffset(W0, H0, W0 * 0.1 * vo, 0, W0, H0);
      } else if (cam.view && cam.view.enabled) cam.clearViewOffset();
      cam.updateProjectionMatrix();

      // Transporte
      if (this.tui) {
        const f = t / DURATION;
        this.tui.fill.style.width = `${f * 100}%`;
        this.tui.head.style.left = `${f * 100}%`;
        const ss = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
        this.tui.time.textContent = `${ss(t)} / ${ss(DURATION)}`;
      }
      const ui = this.ui;
      this.stage.render(this.stage.rectsOf([ui.logo, ui.chapter, ui.caption, ui.legend, ui.sim, this.mini.el]));
    }

    tick(dt) {
      if (this.playing) {
        this.t += dt;
        if (this.t >= DURATION) {
          this.t = DURATION - 0.01;
          this.playing = false;
          this._syncPlay();
        }
      }
      this.renderAt(this.t);
    }
    activate() {
      this.stage.start((dt) => this.tick(dt));
    }
    deactivate() {
      this.stage.stop();
    }
  }

  function roundedRect(x, z, w, d, r) {
    const s = new THREE.Shape();
    // En el plano XY; al girar -90° en X, y → -z
    const y0 = -z - d;
    s.moveTo(x + r, y0);
    s.lineTo(x + w - r, y0);
    s.quadraticCurveTo(x + w, y0, x + w, y0 + r);
    s.lineTo(x + w, y0 + d - r);
    s.quadraticCurveTo(x + w, y0 + d, x + w - r, y0 + d);
    s.lineTo(x + r, y0 + d);
    s.quadraticCurveTo(x, y0 + d, x, y0 + d - r);
    s.lineTo(x, y0 + r);
    s.quadraticCurveTo(x, y0, x + r, y0);
    return s;
  }
  WT.roundedRect = roundedRect;

  ProcesoScene.DURATION = DURATION;
  ProcesoScene.CHAPTERS = CHAPTERS;
  WT.ProcesoScene = ProcesoScene;
})();
