/* =====================================================================
   2 · Corte interno del separador — paso a paso
   La mitad frontal de la envolvente se retira y la sección muestra cómo
   se separa la mezcla. Recorrido guiado de ~62 s (también exportable a
   MP4) o pasos individuales desde el panel lateral.
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const THREE = window.THREE;
  const U = WT.util;
  const cfg = WT.config;
  const SIM = cfg.simulacion;

  const Y0 = 1.78; // altura del eje del recipiente sobre el piso
  const STEPS = [
    {
      t: 0,
      n: 0,
      title: "El separador por dentro",
      short: "Vista general",
      text: "Separador bifásico horizontal en circuito cerrado. Retiramos la mitad frontal de la envolvente para ver la sección.",
      cam: { p: [0.9, 3.0, 7.0], l: [0.7, 1.4, 0] },
    },
    {
      t: 6,
      n: 1,
      title: "Entrada y choque contra el deflector",
      short: "Deflector de entrada",
      text: "La mezcla entra a alta velocidad y choca contra el deflector: cambia de dirección, pierde cantidad de movimiento y ocurre la separación primaria.",
      cam: { p: [-0.95, 2.55, 2.35], l: [-1.12, 1.98, 0] },
    },
    {
      t: 14,
      n: 2,
      title: "Caída de presión y liberación de gas",
      short: "Liberación de gas",
      text: "Al pasar de la presión de línea a la presión del separador, el gas disuelto se libera y forma burbujas que suben a la superficie.",
      cam: { p: [-0.35, 2.15, 2.9], l: [-0.45, 1.62, 0] },
    },
    {
      t: 22,
      n: 3,
      title: "Asentamiento del líquido por gravedad",
      short: "Asentamiento",
      text: "El líquido, más denso, se acumula abajo; las gotas arrastradas por el gas caen por gravedad mientras recorren la sección de asentamiento.",
      cam: { p: [0.1, 2.3, 3.7], l: [0.05, 1.7, 0] },
    },
    {
      t: 30,
      n: 4,
      title: "Extractor de niebla",
      short: "Extractor de niebla",
      text: "Las gotas finas que siguen en el gas chocan con la malla, coalescen en gotas grandes y escurren de regreso al líquido.",
      cam: { p: [1.2, 2.3, 2.15], l: [0.86, 2.02, 0] },
    },
    {
      t: 38,
      n: 5,
      title: "Control de nivel",
      short: "Control de nivel (TN)",
      text: "Cuando el nivel sube, el transmisor TN lo detecta y el lazo abre la válvula de control de líquido; el líquido sale hacia el Coriolis y el nivel regresa a su punto.",
      cam: { p: [2.5, 2.0, 4.8], l: [1.9, 1.25, 0.2] },
    },
    {
      t: 48,
      n: 6,
      title: "Salida de gas por arriba",
      short: "Salida de gas",
      text: "El gas seco sale por la boquilla superior hacia la placa de orificio (TDG). La válvula de control de gas mantiene la presión del separador.",
      cam: { p: [2.3, 3.45, 4.1], l: [2.0, 2.55, 0] },
    },
    {
      t: 56,
      n: 7,
      title: "Ciclo completo",
      short: "Todo junto",
      text: "Entrada, separación, medición y reincorporación ocurren de forma continua durante las 24 h del aforo.",
      cam: { p: [1.5, 3.4, 8.2], l: [1.2, 1.3, 0] },
    },
  ];
  const DURATION = 64;

  class SeparadorScene {
    constructor(stageEl, overlayEl, transportEl, sideEl, opts = {}) {
      this.stageEl = stageEl;
      this.overlayEl = overlayEl;
      this.transportEl = transportEl;
      this.sideEl = sideEl;
      this.stage = new WT.Stage(stageEl, { fov: 38 });
      this.t = 0;
      this.playing = !opts.paused;
      this.loopStep = null;
      this.free = false;
      this.showLabels = true;
      const keys = [];
      STEPS.forEach((s, i) => {
        const nx = STEPS[i + 1] ? STEPS[i + 1].t : DURATION;
        keys.push({ t: s.t + (i ? 0.2 : 0), p: s.cam.p, l: s.cam.l });
        // ligera deriva dentro del paso para que la cámara "respire"
        const p2 = s.cam.p.slice();
        p2[0] += 0.25;
        p2[1] += 0.05;
        keys.push({ t: nx - 1.6, p: p2, l: s.cam.l });
      });
      keys[0] = { t: 0, p: [3.2, 4.2, 9.5], l: [0.9, 1.4, 0] };
      this.rig = new WT.CameraRig(keys.map((k) => ({ ...k, p: [k.p[0], k.p[1], k.p[2]], l: [k.l[0], k.l[1], k.l[2]] })));
      this._cam = {};
      this._build();
      this._buildLabels();
      this._buildOverlay();
      if (transportEl) this._buildTransport();
      if (sideEl) this._buildSide();
      this.orbit = new WT.Orbit(this.stage.camera, this.stage.canvas, { minR: 1, maxR: 30 });
      this.orbit.onUser = () => {
        if (!this.free) this.setFree(true);
      };
      this.stage.onResize = () => this.renderAt(this.t);
      this.renderAt(0);
    }

    _build() {
      const S = this.stage.scene;
      S.add(WT.sky("#16406F", "#0E2A4C", "#06142A"));
      S.add(new THREE.HemisphereLight("#BFE3FF", "#0A1A30", 0.65));
      const key = new THREE.DirectionalLight("#FFF4E6", 1.9);
      key.position.set(4, 8, 7);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -6, right: 8, top: 6, bottom: -4, near: 1, far: 30 });
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.025;
      S.add(key);
      const rim = new THREE.DirectionalLight("#4CC3F0", 0.9);
      rim.position.set(-6, 4, -6);
      S.add(rim);
      const inner = new THREE.PointLight("#FFE2B0", 0.7, 4.5);
      inner.position.set(0, Y0 + 0.25, 0.8);
      S.add(inner);

      // Piso de estudio con retícula
      const grid = WT.canvasTex(
        512,
        512,
        (g, w, h) => {
          const rg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
          rg.addColorStop(0, "#15385F");
          rg.addColorStop(1, "#071A30");
          g.fillStyle = rg;
          g.fillRect(0, 0, w, h);
          g.strokeStyle = "rgba(76,195,240,0.16)";
          g.lineWidth = 1;
          for (let i = 0; i <= 512; i += 16) {
            g.beginPath();
            g.moveTo(i, 0);
            g.lineTo(i, h);
            g.moveTo(0, i);
            g.lineTo(w, i);
            g.stroke();
          }
        },
        {},
      );
      const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ map: grid, roughness: 0.85, metalness: 0.1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      S.add(floor);

      // Separador + patín
      const sep = new WT.Separator({ tag: cfg.equipo.seleccionado });
      sep.group.position.set(0, Y0, 0);
      S.add(sep.group);
      this.sep = sep;
      const base = WT.box(7.4, 0.78, 2.3, new THREE.MeshStandardMaterial({ color: "#2B5A3A", roughness: 0.6, metalness: 0.2 }));
      base.position.set(1.4, 0.39, 0);
      S.add(base);
      const trim = WT.box(7.44, 0.1, 2.34, WT.mats.yellow);
      trim.position.set(1.4, 0.68, 0);
      S.add(trim);
      // Entrada desde el estrangulador y salida a batería
      this.inPipe = WT.pipe(
        [
          [-3.4, Y0 + 1.15, 0],
          [-1.2, Y0 + 1.15, 0],
          [-1.2, Y0 + 0.76, 0],
        ],
        { r: 0.055, mat: WT.mats.pipe, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 1.4 } },
      );
      S.add(this.inPipe.group);
      const o = sep.ports.outlet.clone().add(new THREE.Vector3(0, Y0, 0));
      this.outPipe = WT.pipe(
        [
          [o.x, o.y, o.z],
          [o.x + 0.5, o.y, o.z],
          [o.x + 0.5, o.y, o.z + 1.4],
        ],
        { r: 0.058, mat: WT.mats.pipe, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 1.4 } },
      );
      S.add(this.outPipe.group);
      const W = (v) => v.clone().add(new THREE.Vector3(0, Y0, 0));
      const a = sep.anchors;
      this.A = {
        inlet: W(new THREE.Vector3(-1.2, 0.95, 0)),
        defl: W(a.deflector),
        gasSpace: W(a.gasSpace),
        liquid: W(a.liquid),
        nll: W(new THREE.Vector3(0.3, sep.NLL, -0.05)),
        mist: W(a.mist),
        tps: W(a.tps),
        tt: W(a.tt),
        tn: W(a.tn),
        lg: W(a.lg),
        lcv: W(a.lcv),
        coriolis: W(a.coriolis),
        gasOut: W(new THREE.Vector3(1.15, 0.85, 0)),
        pcv: W(a.pcv),
        tdg: W(a.tdg),
        outlet: new THREE.Vector3(o.x + 0.5, o.y, o.z + 1.0),
      };
      // Integral de la apertura de la LCV → fase del flujo de líquido
      this._liq = [];
      let acc = 0;
      for (let i = 0; i <= DURATION * 20; i++) {
        this._liq.push(acc);
        acc += this.lcvOpen(i / 20) * 0.05 * 1.6;
      }
    }

    /* Nivel y válvulas en el tiempo (paso 5 = dinámica del lazo de nivel) */
    level(t) {
      const sep = this.sep;
      const s5 = STEPS[5].t;
      if (t < s5 || t > s5 + 10) return sep.NLL + Math.sin(t * 0.8) * 0.012;
      const x = t - s5;
      const rise = U.smooth(0.5, 4.2, x) * (sep.HLL - sep.NLL + 0.01);
      const fall = U.smooth(4.6, 8.6, x) * (sep.HLL - sep.NLL + 0.01);
      return sep.NLL + rise - fall + Math.sin(t * 0.8) * 0.012 * U.smooth(8.6, 10, x);
    }
    lcvOpen(t) {
      const s5 = STEPS[5].t;
      const base = 0.45 + 0.05 * Math.sin(t * 0.7);
      if (t < s5 || t > s5 + 10) return base;
      const x = t - s5;
      return U.lerp(base, 0.12, U.smooth(0.2, 1.2, x) * (1 - U.smooth(3.4, 4.4, x))) + 0.45 * U.smooth(3.6, 4.8, x) * (1 - U.smooth(8.0, 9.6, x));
    }
    pcvOpen(t) {
      return 0.42 + 0.06 * Math.sin(t * 1.3) + 0.1 * U.win(t, STEPS[6].t + 1, STEPS[6].t + 6, 1);
    }

    _buildLabels() {
      const L = this.stage.labels;
      const A = this.A;
      const lab = (id, anchor, steps, off, offP, d) => L.add({ id, anchor, steps, off, offP, ...d });
      this.labelDefs = [
        lab("inlet", A.inlet, [1], [-8, -6], [-8, -14], { title: "Entrada de mezcla", sub: "Desde el estrangulador" }),
        lab("defl", A.defl, [1, 7], [-6, 8], [-6, 18], { title: "Deflector de entrada", sub: "Placa de choque" }),
        lab("gas2", A.gasSpace, [2], [4, -9], [4, -20], { title: "Gas liberado", sub: "Burbujas que suben a la superficie" }),
        lab("tps", A.tps, [2], [-6, -6], [-8, -14], { cls: "inst", tag: "TPS", title: "Presión del separador", val: "" }),
        lab("liq3", A.liquid, [3, 7], [-6, 8], [-6, 18], { title: "Líquido (aceite + agua)", sub: "Se asienta por gravedad" }),
        lab("nll", A.nll, [3, 5], [8, 5], [8, 12], { title: "Nivel normal (NLL)", sub: "Interfase gas-líquido" }),
        lab("gas3", A.gasSpace, [3, 7], [-4, -9], [-4, -20], { title: "Sección de asentamiento", sub: "Las gotas caen por gravedad" }),
        lab("tt", A.tt, [3], [6, -6], [6, -14], { cls: "inst", tag: "TT", title: "Temperatura", val: "" }),
        lab("mist", A.mist, [4, 7], [5, -9], [4, -20], { title: "Extractor de niebla", sub: "Coalescencia de gotas finas" }),
        lab("tn", A.tn, [5], [5, -6], [4, -14], { cls: "inst", tag: "TN", title: "Nivel del separador", val: "" }),
        lab("lg", A.lg, [5], [6, 4], [6, 10], { cls: "small", title: "Indicador magnético", sub: "Lectura local de nivel" }),
        lab("lcv", A.lcv, [5], [-6, -6], [-8, -16], { title: "Válvula de control de líquido", val: "" }),
        lab("cor", A.coriolis, [5], [-7, 5], [-6, 14], { cls: "inst", tag: "CORIOLIS", title: "Promass 300", sub: "Medición del líquido" }),
        lab("gasout", A.gasOut, [6, 7], [-7, -6], [-8, -14], { title: "Salida de gas", sub: "Hacia la placa de orificio" }),
        lab("tdg", A.tdg, [6], [-6, -5], [-8, -12], { cls: "inst", tag: "TDG", title: "ΔP placa de orificio", val: "" }),
        lab("pcv", A.pcv, [6], [5, -6], [4, -14], { title: "Válvula de control de gas", val: "" }),
        lab("out", A.outlet, [6, 7], [5, 5], [-6, 10], { title: "A línea a batería", sub: "Gas y líquido reincorporados" }),
      ];
    }

    _buildOverlay() {
      const o = this.overlayEl;
      o.innerHTML = `
        <div class="wt-corner-logo"><span class="wt-logo" data-logo></span></div>
        <div class="wt-sim-tag">Representación ilustrativa</div>
        <div class="wt-step-dots">${STEPS.slice(1).map(() => "<i></i>").join("")}</div>
        <div class="wt-step-hud"><div class="n"></div><h3></h3><p></p><div class="gauge"></div></div>
        <div class="wt-flow-legend">
          <span><i style="--c:#C98A55"></i>Mezcla</span><span><i style="--c:#FFD400"></i>Gas</span>
          <span><i class="liq"></i>Líquido</span><span><i style="--c:#FFF2C2"></i>Burbujas</span>
        </div>`;
      WT.brand.paint(o);
      this.ui = {
        dots: [...o.querySelectorAll(".wt-step-dots i")],
        hud: o.querySelector(".wt-step-hud"),
        n: o.querySelector(".wt-step-hud .n"),
        h: o.querySelector(".wt-step-hud h3"),
        p: o.querySelector(".wt-step-hud p"),
        g: o.querySelector(".wt-step-hud .gauge"),
        logo: o.querySelector(".wt-corner-logo"),
        legend: o.querySelector(".wt-flow-legend"),
        sim: o.querySelector(".wt-sim-tag"),
      };
      // En esta vista la leyenda va arriba a la derecha
      this.ui.legend.style.cssText = "left:auto;right:1.6cqw;top:4cqw;bottom:auto;";
    }

    _buildTransport() {
      const tr = this.transportEl;
      tr.innerHTML = `
        <button class="wt-btn primary icon" data-a="play" aria-label="Reproducir o pausar"></button>
        <button class="wt-btn icon" data-a="restart" title="Reiniciar" aria-label="Reiniciar"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg></button>
        <span class="wt-time">00:00 / 01:04</span>
        <div class="wt-timeline" tabindex="0" role="slider" aria-label="Línea de tiempo"><div class="track"><div class="fill"></div></div><div class="head"></div></div>
        <div class="wt-seg" role="group" aria-label="Formato"><button data-fmt="16x9" aria-pressed="true">16:9</button><button data-fmt="9x16" aria-pressed="false">9:16</button></div>
        <button class="wt-btn" data-a="loop" title="Repetir el paso actual">Repetir paso</button>
        <button class="wt-btn" data-a="cam" title="Volver a la cámara guiada">Cámara guiada</button>`;
      const q = (s) => tr.querySelector(s);
      this.tui = { play: q('[data-a="play"]'), time: q(".wt-time"), tl: q(".wt-timeline"), fill: q(".fill"), head: q(".head"), loop: q('[data-a="loop"]'), cam: q('[data-a="cam"]') };
      STEPS.slice(1).forEach((s, i) => {
        const d = U.el("div", "chap", `<span>${s.n}. ${s.short}</span>`);
        d.style.left = `${(s.t / DURATION) * 100}%`;
        d.style.width = `${(((STEPS[i + 2] || { t: DURATION }).t - s.t) / DURATION) * 100}%`;
        this.tui.tl.appendChild(d);
      });
      this.tui.chaps = [...this.tui.tl.querySelectorAll(".chap")];
      this.tui.play.onclick = () => this.toggle();
      q('[data-a="restart"]').onclick = () => {
        this.loopStep = null;
        this.t = 0;
        this.playing = true;
        this.setFree(false);
        this._sync();
      };
      this.tui.loop.onclick = () => {
        this.loopStep = this.loopStep == null ? this.stepAt(this.t) : null;
        this._sync();
      };
      this.tui.cam.onclick = () => this.setFree(false);
      tr.querySelectorAll(".wt-seg button").forEach((b) => {
        b.onclick = () => {
          this.stageEl.dataset.fmt = b.dataset.fmt;
          tr.querySelectorAll(".wt-seg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
          requestAnimationFrame(() => {
            this.stage.resize();
            this.renderAt(this.t);
          });
        };
      });
      let drag = false;
      const seek = (e) => {
        const r = this.tui.tl.getBoundingClientRect();
        this.t = U.clamp(((e.clientX - r.left) / r.width) * DURATION, 0, DURATION - 0.01);
        if (this.loopStep != null) this.loopStep = this.stepAt(this.t);
        this.renderAt(this.t);
      };
      this.tui.tl.addEventListener("pointerdown", (e) => {
        drag = true;
        this.tui.tl.setPointerCapture(e.pointerId);
        seek(e);
      });
      this.tui.tl.addEventListener("pointermove", (e) => drag && seek(e));
      this.tui.tl.addEventListener("pointerup", () => (drag = false));
      this._sync();
    }

    _buildSide() {
      const e = cfg.equipo;
      const pc = (v) => (v == null ? '<td class="pc">Por confirmar</td>' : `<td>${v}</td>`);
      this.sideEl.innerHTML = `
        <h2>Corte del separador</h2>
        <p>Recorre los pasos de la separación. Arrastra para girar la vista y usa la rueda para acercarte.</p>
        <ol class="wt-steps">${STEPS.slice(1)
          .map((s) => `<li><button data-step="${s.n}"><span class="n">${s.n}</span><span><b>${s.title}</b><small>${s.text}</small></span></button></li>`)
          .join("")}</ol>
        <h3>Ficha del equipo</h3>
        <label class="wt-note" for="sep-eq">Equipo de aforo</label>
        <select class="wt-select" id="sep-eq">${e.opciones.map((o) => `<option ${o === e.seleccionado ? "selected" : ""}>${o}</option>`).join("")}</select>
        <table class="wt-spec" style="margin-top:10px">
          <tr><th>Tipo</th><td>${e.tipo}</td></tr>
          <tr><th>Orientación</th><td>${e.orientacion}</td></tr>
          <tr><th>Montaje</th><td>${e.montaje}</td></tr>
          <tr><th>Diámetro</th>${pc(e.diametro)}</tr>
          <tr><th>Longitud</th>${pc(e.largo)}</tr>
          <tr><th>Presión de diseño</th>${pc(e.presionDiseno)}</tr>
          <tr><th>Temperatura de diseño</th>${pc(e.temperaturaDiseno)}</tr>
          <tr><th>Internos</th><td>${e.internos.join("<br>")}</td></tr>
        </table>
        <h3>Equipo real</h3>
        <img class="wt-photo-mini" src="assets/separador-fa.webp" alt="Separador de aforo en remolque">
        <p class="wt-note">Modelo 3D representativo: proporciones aproximadas tomadas de la fotografía. Los datos «Por confirmar» se llenan en <code>js/config.js</code>.</p>`;
      this.sideEl.querySelectorAll("[data-step]").forEach((b) => {
        b.onclick = () => this.goStep(+b.dataset.step);
      });
      this.sideEl.querySelector("#sep-eq").onchange = (ev) => {
        cfg.equipo.seleccionado = ev.target.value;
        this.sep.setTag(ev.target.value);
      };
      this.sideBtns = [...this.sideEl.querySelectorAll("[data-step]")];
    }

    stepAt(t) {
      let i = 0;
      while (i < STEPS.length - 1 && t >= STEPS[i + 1].t) i++;
      return i;
    }
    goStep(n) {
      this.t = STEPS[n].t;
      this.loopStep = n;
      this.playing = true;
      this.setFree(false);
      this._sync();
    }
    toggle() {
      this.playing = !this.playing;
      if (this.playing && this.t >= DURATION - 0.05) this.t = 0;
      this._sync();
    }
    setFree(on) {
      this.free = on;
      if (on) this.orbit.setFrom(this.stage.camera.position.clone(), this._cam.l.clone());
      this._sync();
    }
    _sync() {
      if (!this.tui) return;
      this.tui.play.innerHTML = this.playing
        ? '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
      this.tui.loop.classList.toggle("on", this.loopStep != null);
      this.tui.cam.classList.toggle("on", !this.free);
      this.tui.cam.textContent = this.free ? "Cámara guiada" : "Cámara guiada ✓";
    }

    /* ============================== Render ============================== */
    renderAt(t) {
      this.t = t;
      const cam = this.stage.camera;
      const portrait = this.stage.portrait;
      const si = this.stepAt(t);
      const step = STEPS[si];
      if (!this.free) {
        this.rig.sample(t, this._cam);
        const c = this._cam;
        if (portrait) {
          c.p.sub(c.l).multiplyScalar(1.55).add(c.l);
          c.fov += 14;
        }
        cam.position.copy(c.p);
        cam.lookAt(c.l);
        if (Math.abs(cam.fov - c.fov) > 0.01) {
          cam.fov = c.fov;
          cam.updateProjectionMatrix();
        }
      } else this.orbit.update(1 / 60);
      if (portrait) cam.setViewOffset(this.stage.w, this.stage.h, 0, this.stage.h * 0.09, this.stage.w, this.stage.h);
      else if (cam.view && cam.view.enabled) cam.clearViewOffset();
      cam.updateProjectionMatrix();

      // Estado de la separación según el paso
      const w = (n) => U.win(t, STEPS[n].t, (STEPS[n + 1] || { t: DURATION + 1 }).t, 0.8);
      const all = U.smooth(STEPS[7].t, STEPS[7].t + 1, t);
      const open = U.smooth(2.2, 5.2, t);
      this.sep.setOpen(open);
      const after = (n) => U.smooth(STEPS[n].t, STEPS[n].t + 1.2, t);
      const lcv = this.lcvOpen(t);
      const li = Math.min(this._liq.length - 1, Math.floor(t * 20));
      const st = {
        inflow: U.smooth(4.2, 6.5, t),
        splash: 0.55 + 0.45 * w(1),
        flash: Math.max(0.25 * after(1), w(2), 0.6 * after(3), all),
        settle: Math.max(0.25 * after(1), w(3), w(4), 0.7 * after(5), all),
        mist: Math.max(w(4), all),
        gasOut: Math.max(0.5 * after(1), w(4), w(6), 0.8 * after(5), all),
        liqOut: 0.35 + 0.65 * Math.max(after(5) * (lcv > 0.3 ? 1 : lcv / 0.3), all),
        liqPhase: this._liq[li],
        level: this.level(t),
        lcvOpen: lcv,
        pcvOpen: this.pcvOpen(t),
        hl: { deflector: w(1), mist: w(4), level: Math.max(w(3), w(5)), tn: w(5), lcv: w(5), pcv: w(6) },
        flowT: t,
        liqProg: 1,
        gasProg: 1,
        outProg: 1,
        skidFlow: U.smooth(4.5, 7, t),
      };
      this.sep.pr = this.stage.renderer.getPixelRatio();
      this.sep.update(t, st, cam, this.stage.h);
      this.inPipe.flow.uniforms.uTime.value = t;
      this.inPipe.flow.uniforms.uProgress.value = U.inv(3.4, 5.4, t);
      this.outPipe.flow.uniforms.uTime.value = t;
      this.outPipe.flow.uniforms.uOpacity.value = U.smooth(4.5, 7, t);

      // Etiquetas
      const L = this.stage.labels;
      const v = WT.scada.compute(10 + t * 0.05);
      const levelPct = U.clamp(((st.level + this.sep.Ri) / (2 * this.sep.Ri)) * 100, 0, 100);
      L.set("tps", WT.labelHTML({ tag: "TPS", title: "Presión del separador", val: `${U.fmt(v.pSep, 1)} kg/cm²` }));
      L.set("tt", WT.labelHTML({ tag: "TT", title: "Temperatura", val: `${U.fmt(v.temp, 1)} °C` }));
      L.set("tn", WT.labelHTML({ tag: "TN", title: "Nivel del separador", val: `${U.fmt(levelPct, 0)} %` }));
      L.set("lcv", WT.labelHTML({ title: "Válvula de control de líquido", val: `Apertura ${U.fmt(lcv * 100, 0)} %` }));
      L.set("pcv", WT.labelHTML({ title: "Válvula de control de gas", val: `Apertura ${U.fmt(st.pcvOpen * 100, 0)} %` }));
      L.set("tdg", WT.labelHTML({ tag: "TDG", title: "ΔP placa de orificio", val: `Q gas ${U.fmt(v.qGas, 2)} MMpcd` }));
      this.labelDefs.forEach((d) => {
        const on = d.steps.some((n) => n === si) ? U.win(t, step.t + 0.9, (STEPS[si + 1] || { t: DURATION + 1 }).t - 0.2, 0.4) : 0;
        d.opacity = this.showLabels ? on : 0;
      });

      // HUD del paso
      if (this._si !== si) {
        this._si = si;
        this.ui.n.textContent = si === 0 ? "SEPARADOR BIFÁSICO" : si === 7 ? "RESUMEN" : `PASO ${si} DE 6`;
        this.ui.h.textContent = step.title;
        this.ui.p.textContent = step.text;
        this.ui.dots.forEach((d, i) => d.classList.toggle("on", i + 1 <= si));
        if (this.sideBtns) this.sideBtns.forEach((b) => (+b.dataset.step === si ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
        if (this.tui) this.tui.chaps.forEach((d, i) => d.classList.toggle("cur", i + 1 === si));
      }
      let gauge = "";
      if (si === 2) gauge = `<div>Línea (TPL)<b>${U.fmt(v.pLin, 1)} kg/cm²</b></div><div>→</div><div>Separador (TPS)<b>${U.fmt(v.pSep, 1)} kg/cm²</b></div>`;
      else if (si === 5) gauge = `<div>Nivel (TN)<b>${U.fmt(levelPct, 0)} %</b></div><div>Válvula de líquido<b>${U.fmt(lcv * 100, 0)} %</b></div>`;
      else if (si === 6) gauge = `<div>Presión (TPS)<b>${U.fmt(v.pSep, 1)} kg/cm²</b></div><div>Válvula de gas<b>${U.fmt(st.pcvOpen * 100, 0)} %</b></div>`;
      if (gauge !== this._gauge) {
        this._gauge = gauge;
        this.ui.g.innerHTML = gauge;
        this.ui.g.style.display = gauge ? "" : "none";
      }
      this.ui.hud.style.opacity = U.win(t, step.t + 0.3, (STEPS[si + 1] || { t: DURATION + 1 }).t - 0.05, 0.4);

      if (this.tui) {
        const f = t / DURATION;
        this.tui.fill.style.width = `${f * 100}%`;
        this.tui.head.style.left = `${f * 100}%`;
        const ss = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
        this.tui.time.textContent = `${ss(t)} / ${ss(DURATION)}`;
      }
      const ui = this.ui;
      this.stage.render(this.stage.rectsOf([ui.logo, ui.hud, ui.legend, ui.sim]));
    }

    tick(dt) {
      if (this.playing) {
        this.t += dt;
        if (this.loopStep != null) {
          const a = STEPS[this.loopStep].t;
          const b = (STEPS[this.loopStep + 1] || { t: DURATION }).t;
          if (this.t >= b - 0.05) this.t = a + 0.9;
        }
        if (this.t >= DURATION) this.t = STEPS[7].t + 0.5;
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
  SeparadorScene.DURATION = DURATION;
  SeparadorScene.STEPS = STEPS;
  WT.SeparadorScene = SeparadorScene;
})();
