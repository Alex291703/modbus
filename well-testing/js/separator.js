/* =====================================================================
   Well Testing — separador bifásico horizontal (modelo + internos +
   simulación visual de partículas). Lo usan la animación del proceso y
   el corte interno.

   Ejes locales: X = eje del recipiente (entrada a la izquierda, salidas a
   la derecha), Y = arriba, Z = hacia el observador. El corte es el plano
   z = 0: la mitad frontal de la envolvente puede retirarse (setOpen) y
   deja ver la sección.
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const THREE = window.THREE;
  const U = WT.util;
  const M = WT.mats;

  const C = {
    mix: new THREE.Color("#B07040"),
    mixDark: new THREE.Color("#6B3F1D"),
    gas: new THREE.Color("#FFD400"),
    gasWet: new THREE.Color("#D9B25A"),
    amber: new THREE.Color("#F29F05"),
    amberDeep: new THREE.Color("#B86E00"),
    oil: new THREE.Color("#3A2408"),
    bubble: new THREE.Color("#FFF2C2"),
    white: new THREE.Color("#FFFFFF"),
  };
  // [color de flecha, color base del tubo]
  WT.flowColors = {
    mezcla: ["#D9955A", "#4A2810"],
    gas: ["#FFD400", "#5E4E00"],
    liquido: ["#F29F05", "#100A04"],
  };

  /** Contorno (x, y) de un recipiente con cabezas semielípticas 2:1. */
  function capsule(R, Ls, hd, n = 28) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = -Math.PI / 2 + (i / n) * Math.PI;
      pts.push(new THREE.Vector2(Ls / 2 + hd * Math.cos(th), R * Math.sin(th)));
    }
    for (let i = 0; i <= n; i++) {
      const th = Math.PI / 2 + (i / n) * Math.PI;
      pts.push(new THREE.Vector2(-Ls / 2 + hd * Math.cos(th), R * Math.sin(th)));
    }
    return pts;
  }

  class Separator {
    constructor(opts = {}) {
      this.R = 0.45;
      this.Ls = 3.0;
      this.hd = 0.225;
      this.t = 0.028;
      this.Ri = this.R - this.t;
      this.saddleH = 0.55;
      this.NLL = -0.05;
      this.HLL = 0.1;
      this.LLL = -0.2;
      this.h = this.NLL;
      this.tag = opts.tag || WT.config.equipo.seleccionado;
      this.group = new THREE.Group();
      this.back = new THREE.Group();
      this.front = new THREE.Group();
      this.group.add(this.back, this.front);
      this.planes = {
        back: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
        front: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      };
      this._local = {
        back: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
        front: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      };
      this.anchors = {};
      this.open = 0;
      this._buildShell();
      this._buildInternals();
      this._buildExternals();
      if (opts.skid !== false) this._buildSkid();
      this._buildParticles();
      this.setLevel(this.NLL);
      this.setOpen(0);
    }

    /* ------------------------------ Envolvente ------------------------------ */
    _shellGeo(R, Ls, hd) {
      const prof = [];
      const n = 20;
      for (let i = 0; i <= n; i++) {
        const th = -Math.PI / 2 + (i / n) * (Math.PI / 2);
        prof.push(new THREE.Vector2(R * Math.cos(th), -Ls / 2 + hd * Math.sin(th)));
      }
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * (Math.PI / 2);
        prof.push(new THREE.Vector2(R * Math.cos(th), Ls / 2 + hd * Math.sin(th)));
      }
      const g = new THREE.LatheGeometry(prof, 72);
      g.rotateZ(-Math.PI / 2);
      return g;
    }
    _buildShell() {
      const { R, Ls, hd, t } = this;
      const outerG = this._shellGeo(R, Ls, hd);
      const innerG = this._shellGeo(R - t, Ls, hd - t * 0.6);
      this.frontMats = [];
      const mk = (side) => {
        const g = side === "back" ? this.back : this.front;
        const planes = [this.planes[side]];
        const mo = M.vessel.clone();
        mo.clippingPlanes = planes;
        mo.clipShadows = true;
        const mi = new THREE.MeshStandardMaterial({ color: "#3B4A57", roughness: 0.7, metalness: 0.2, side: THREE.BackSide, clippingPlanes: planes });
        const o = new THREE.Mesh(outerG, mo);
        o.castShadow = o.receiveShadow = true;
        const i = new THREE.Mesh(innerG, mi);
        i.receiveShadow = true;
        g.add(o, i);
        // Boquillas (cortadas también por el plano)
        const nz = (x, y0, y1, r) => {
          const mm = M.pipeGreen.clone();
          mm.clippingPlanes = planes;
          mm.side = THREE.DoubleSide;
          const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.abs(y1 - y0), 24, 1, true), mm);
          c.position.set(x, (y0 + y1) / 2, 0);
          const fm = M.flange.clone();
          fm.clippingPlanes = planes;
          fm.side = THREE.DoubleSide;
          const f = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.9, r * 1.9, 0.045, 28, 1, false), fm);
          f.position.set(x, y1, 0);
          c.castShadow = f.castShadow = true;
          g.add(c, f);
          if (side === "front") this.frontMats.push(mm, fm);
        };
        nz(-1.2, 0.3, 0.72, 0.065); // entrada
        nz(1.15, 0.3, 0.72, 0.065); // salida de gas
        nz(1.0, -0.3, -0.68, 0.058); // salida de líquido
        if (side === "front") this.frontMats.push(mo, mi);
      };
      mk("back");
      mk("front");
      // Banda de sección (espesor de pared en el plano de corte)
      const outer = capsule(R, Ls, hd);
      const inner = capsule(R - t, Ls, hd - t * 0.6);
      const sh = new THREE.Shape(outer);
      sh.holes.push(new THREE.Path(inner.slice().reverse()));
      const band = new THREE.Mesh(
        new THREE.ShapeGeometry(sh, 4),
        new THREE.MeshBasicMaterial({ color: "#FFC20E", toneMapped: false, side: THREE.DoubleSide }),
      );
      band.position.z = 0.001;
      this.back.add(band);
      this.band = band;
      // Rótulos sobre la mitad frontal (envolvente curva)
      const decal = (lines, x, w, h, ang, opts = {}) => {
        const tex = WT.textTex(lines, { w: 1024, h: Math.round((1024 * h) / w), ...opts });
        const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5 });
        const arc = w / (R + 0.004);
        const geo = new THREE.CylinderGeometry(R + 0.004, R + 0.004, h, 24, 1, true, -arc / 2, arc);
        // Mapeo: cilindro en eje Y → se gira a eje X
        geo.rotateZ(Math.PI / 2);
        geo.rotateX(Math.PI / 2 + ang);
        const d = new THREE.Mesh(geo, m);
        d.position.x = x;
        this.front.add(d);
        this.frontMats.push(m);
        return d;
      };
      this.tagDecal = decal([{ t: this.tag, color: "#111", size: 150 }], -0.55, 0.62, 0.22, -0.15, { bg: "#FFC20E" });
      decal([{ t: "SEPARADOR BIFÁSICO", color: "#ffffff", size: 74 }], 0.45, 0.95, 0.12, -0.12);
      this.frontMats.forEach((m) => {
        m.transparent = true;
      });
    }

    /** Cambia el rótulo del equipo (FA-06 / FA-08 / FA-09). */
    setTag(tag) {
      this.tag = tag;
      const m = this.tagDecal.material;
      const old = m.map;
      m.map = WT.textTex([{ t: tag, color: "#111", size: 150 }], { w: 1024, h: Math.round((1024 * 0.22) / 0.62), bg: "#FFC20E" });
      m.needsUpdate = true;
      if (old) old.dispose();
    }

    /* ------------------------------ Internos ------------------------------ */
    _buildInternals() {
      const { Ri } = this;
      const backPlanes = [this.planes.back];
      // Deflector de entrada: placa curva cóncava bajo la boquilla
      const arc = new THREE.Shape();
      const cx = -1.2;
      const cy = 0.36;
      const r1 = 0.16;
      const r0 = 0.145;
      const a0 = (205 * Math.PI) / 180;
      const a1 = (335 * Math.PI) / 180;
      arc.absarc(cx, cy, r1, a0, a1, false);
      arc.absarc(cx, cy, r0, a1, a0, true);
      const dg = new THREE.ExtrudeGeometry(arc, { depth: 0.7, bevelEnabled: false, curveSegments: 24 });
      dg.translate(0, 0, -0.35);
      this.deflMat = new THREE.MeshStandardMaterial({ color: "#C7CED4", metalness: 0.6, roughness: 0.3, emissive: new THREE.Color("#FFC20E"), emissiveIntensity: 0, clippingPlanes: backPlanes, side: THREE.DoubleSide });
      const defl = new THREE.Mesh(dg, this.deflMat);
      defl.castShadow = true;
      this.back.add(defl);
      // Soportes del deflector
      [-0.2, 0.2].forEach((dx) => {
        const s = WT.box(0.015, 0.18, 0.015, M.steel);
        s.position.set(cx + dx * 0.6, cy + 0.08, -0.15);
        this.back.add(s);
      });
      this.anchors.deflector = new THREE.Vector3(cx, cy - 0.15, -0.05);

      // Extractor de niebla: paquete vertical en la zona de gas
      const yMin = 0.12;
      const segShape = new THREE.Shape();
      const aS = Math.asin(yMin / Ri);
      const n = 32;
      for (let i = 0; i <= n; i++) {
        const a = aS + (i / n) * (Math.PI - 2 * aS);
        const p = [Math.cos(a) * (Ri - 0.004), Math.sin(a) * (Ri - 0.004)];
        if (i === 0) segShape.moveTo(p[0], p[1]);
        else segShape.lineTo(p[0], p[1]);
      }
      segShape.lineTo(Math.cos(aS) * (Ri - 0.004), yMin);
      const mg = new THREE.ExtrudeGeometry(segShape, { depth: 0.12, bevelEnabled: false });
      mg.rotateY(Math.PI / 2);
      mg.translate(0.79, 0, 0);
      const meshTex = WT.canvasTex(
        64,
        64,
        (g) => {
          g.fillStyle = "#6F7C88";
          g.fillRect(0, 0, 64, 64);
          g.strokeStyle = "#D7DEE4";
          g.lineWidth = 3;
          for (let k = -64; k < 128; k += 10) {
            g.beginPath();
            g.moveTo(k, 0);
            g.lineTo(k + 64, 64);
            g.stroke();
            g.beginPath();
            g.moveTo(k + 64, 0);
            g.lineTo(k, 64);
            g.stroke();
          }
        },
        { repeat: [1, 1] },
      );
      meshTex.repeat.set(14, 14);
      this.mistMat = new THREE.MeshStandardMaterial({ map: meshTex, metalness: 0.5, roughness: 0.45, emissive: new THREE.Color("#4CC3F0"), emissiveIntensity: 0, clippingPlanes: backPlanes, side: THREE.DoubleSide });
      const mist = new THREE.Mesh(mg, this.mistMat);
      mist.castShadow = true;
      this.back.add(mist);
      this.anchors.mist = new THREE.Vector3(0.85, 0.3, -0.02);

      // Rompe-vórtice / marcas de nivel en la pared posterior
      const mark = (y, color, dash) => {
        const half = Math.sqrt(Math.max(0, Ri * Ri - y * y));
        const pts = [];
        for (let x = -1.45; x <= 1.45; x += 0.02) pts.push(new THREE.Vector3(x, y, -half + 0.01));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = dash
          ? new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.04, toneMapped: false, transparent: true })
          : new THREE.LineBasicMaterial({ color, toneMapped: false, transparent: true });
        const l = new THREE.Line(geo, mat);
        if (dash) l.computeLineDistances();
        this.back.add(l);
        return l;
      };
      this.levelMarks = [mark(this.HLL, "#FF5C6C", true), mark(this.NLL, "#FFC20E", false), mark(this.LLL, "#FF5C6C", true)];
      this.anchors.nll = new THREE.Vector3(-0.2, this.NLL, -0.02);

      // Líquido: cara de corte (z = 0) y superficie (y = h)
      this.oilSection = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uH: { value: 0 }, uR: { value: Ri }, uA: { value: 0.93 } },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uT; uniform float uH; uniform float uR; uniform float uA; varying vec3 vP;
          void main(){
            float k = smoothstep(-uR, uH, vP.y);
            vec3 deep = vec3(0.022, 0.013, 0.004);
            vec3 amb = vec3(0.34, 0.15, 0.008);
            vec3 c = mix(deep, amb, pow(k, 1.9));
            float sw = sin(vP.x * 9.0 - uT * 1.2 + sin(vP.y * 16.0 + uT * 0.7) * 1.1);
            c *= 1.0 + 0.16 * sw;
            float edge = smoothstep(0.03, 0.0, uH - vP.y);
            c = mix(c, vec3(0.95, 0.55, 0.04), edge * 0.6);
            gl_FragColor = vec4(c, uA);
            #include <tonemapping_fragment>
            #include <encodings_fragment>
          }`,
      });
      this.oilTop = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uA: { value: 0.72 } },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uT; uniform float uA; varying vec3 vP;
          void main(){
            float r = sin(vP.x * 26.0 - uT * 3.0) * sin(vP.z * 30.0 + uT * 1.7);
            vec3 c = mix(vec3(0.16, 0.08, 0.008), vec3(0.62, 0.33, 0.03), 0.45 + 0.35 * r);
            gl_FragColor = vec4(c, uA);
            #include <tonemapping_fragment>
            #include <encodings_fragment>
          }`,
      });
      this.oilFace = new THREE.Mesh(new THREE.BufferGeometry(), this.oilSection);
      this.oilFace.renderOrder = 4;
      this.oilSurf = new THREE.Mesh(new THREE.BufferGeometry(), this.oilTop);
      this.oilSurf.renderOrder = 4;
      this.back.add(this.oilFace, this.oilSurf);
      this.anchors.liquid = new THREE.Vector3(-0.4, -0.25, 0);
      this.anchors.gasSpace = new THREE.Vector3(-0.2, 0.25, -0.05);
    }

    setLevel(h) {
      if (Math.abs(h - this._lastH) < 0.002) return;
      this._lastH = h;
      this.h = h;
      const Ri = this.Ri;
      const Ls = this.Ls;
      const hdi = this.hd - this.t * 0.6;
      // Cara frontal: contorno interior ∩ y ≤ h
      const th = Math.asin(U.clamp(h / Ri, -0.99, 0.99));
      const pts = [];
      const n = 20;
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (i / n) * (th + Math.PI / 2);
        pts.push(new THREE.Vector2(Ls / 2 + hdi * Math.cos(a), Ri * Math.sin(a)));
      }
      for (let i = 0; i <= n; i++) {
        const a = Math.PI - th + (i / n) * (Math.PI / 2 + th);
        pts.push(new THREE.Vector2(-Ls / 2 + hdi * Math.cos(a), Ri * Math.sin(a)));
      }
      this.oilFace.geometry.dispose();
      this.oilFace.geometry = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
      this.oilFace.position.z = -0.002;
      // Superficie: sección horizontal a la altura h (mitad posterior)
      const rho = Math.sqrt(Math.max(0.0001, Ri * Ri - h * h));
      const a = (hdi * rho) / Ri;
      const sp = [];
      for (let i = 0; i <= n; i++) {
        const f = (i / n) * (Math.PI / 2);
        sp.push(new THREE.Vector2(Ls / 2 + a * Math.cos(f), rho * Math.sin(f)));
      }
      for (let i = 0; i <= n; i++) {
        const f = Math.PI / 2 + (i / n) * (Math.PI / 2);
        sp.push(new THREE.Vector2(-Ls / 2 + a * Math.cos(f), rho * Math.sin(f)));
      }
      const sg = new THREE.ShapeGeometry(new THREE.Shape(sp), 1);
      sg.rotateX(-Math.PI / 2);
      sg.translate(0, h, 0);
      this.oilSurf.geometry.dispose();
      this.oilSurf.geometry = sg;
      this.oilSection.uniforms.uH.value = h;
      if (this.lgTex) this._drawLG();
    }

    /* ------------------------------ Exterior ------------------------------ */
    _buildExternals() {
      const { R } = this;
      // Silletas
      [-1.05, 1.05].forEach((x) => {
        const s = new THREE.Group();
        s.add(WT.at(WT.box(0.16, this.saddleH, 0.7, M.pipeGreen), 0, -R - this.saddleH / 2 + 0.06, 0));
        s.add(WT.at(WT.box(0.34, 0.04, 0.8, M.pipeGreen), 0, -R - this.saddleH + 0.02, 0));
        s.position.x = x;
        this.group.add(s);
      });
      // Transmisor de presión del separador (TPS), arriba, ligeramente atrás
      const tps = WT.pressureTx();
      tps.position.set(-0.3, R * Math.cos(0.3) - 0.02, -R * Math.sin(0.3));
      tps.rotation.x = -0.3;
      this.group.add(tps);
      this.anchors.tps = new THREE.Vector3(-0.3, R + 0.3, -0.12);
      // Termopozo (TT) arriba atrás a 45°
      const tt = WT.tempTx();
      tt.position.set(0.35, R * 0.72, -R * 0.72);
      tt.rotation.x = -Math.PI / 4 - Math.PI / 2;
      tt.rotation.order = "YXZ";
      this.group.add(tt);
      this.anchors.tt = new THREE.Vector3(0.35, R * 0.82 + 0.08, -R * 0.82);
      // Cámara de nivel externa (TN + indicador magnético LG) en la cabeza derecha
      const cx = this.Ls / 2 + this.hd + 0.24;
      this.tnMat = new THREE.MeshStandardMaterial({ color: "#2F5B3B", roughness: 0.45, metalness: 0.25, emissive: new THREE.Color("#4CC3F0"), emissiveIntensity: 0 });
      const ch = WT.cyl(0.05, 0.05, 0.84, this.tnMat, 16);
      ch.position.set(cx, 0, 0);
      this.group.add(ch);
      [0.3, -0.32].forEach((y) => {
        const st = WT.cyl(0.03, 0.03, 0.34, M.pipeGreen, 12);
        st.rotation.z = Math.PI / 2;
        st.position.set(cx - 0.17, y, 0);
        this.group.add(st);
      });
      this.group.add(WT.at(WT.cyl(0.07, 0.07, 0.03, M.flange, 16), cx, 0.43, 0));
      this.group.add(WT.at(WT.cyl(0.07, 0.07, 0.03, M.flange, 16), cx, -0.43, 0));
      const tn = WT.pressureTx({ scale: 1.15 });
      tn.position.set(cx, 0.44, 0);
      this.group.add(tn);
      this.tnBody = ch;
      this.anchors.tn = new THREE.Vector3(cx, 0.78, 0);
      // Indicador magnético de banderas: rojo = líquido
      this.lgTex = WT.canvasTex(32, 256, () => {});
      const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.78), new THREE.MeshBasicMaterial({ map: this.lgTex, toneMapped: false }));
      lg.position.set(cx, 0, 0.052);
      this.group.add(lg);
      this.anchors.lg = new THREE.Vector3(cx + 0.03, -0.1, 0.06);
      this._drawLG();
    }
    _drawLG() {
      const g = this.lgTex.userData.ctx;
      const H = 256;
      const frac = U.clamp((this.h + 0.42) / 0.84, 0, 1);
      g.fillStyle = "#F4F4F4";
      g.fillRect(0, 0, 32, H);
      g.fillStyle = "#D7262B";
      g.fillRect(0, H * (1 - frac), 32, H * frac);
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = 0; y < H; y += 8) g.fillRect(0, y, 32, 1);
      this.lgTex.needsUpdate = true;
    }

    /* ------------------------------ Patín de medición ------------------------------ */
    _buildSkid() {
      const r = 0.05;
      const yL = -0.8;
      const zF = 0.6;
      const yG = 1.0;
      const xT = 4.2;
      // Líquido: salida → Coriolis → LCV → T
      this.liqPipe = WT.pipe(
        [
          [1.0, -0.68, 0],
          [1.0, yL, 0],
          [1.0, yL, zF],
          [xT, yL, zF],
        ],
        { r, mat: M.pipeGreen, flow: WT.flowColors.liquido[0], flow2: WT.flowColors.liquido[1], flowOpts: { speed: 1.0, spacing: 0.5 } },
      );
      this.group.add(this.liqPipe.group);
      this.coriolis = WT.coriolis(r);
      this.coriolis.position.set(2.2, yL, zF);
      this.group.add(this.coriolis);
      this.anchors.coriolis = new THREE.Vector3(2.2, yL + 0.36, zF);
      const actMat = () => new THREE.MeshStandardMaterial({ color: "#2E73B8", roughness: 0.4, metalness: 0.25, emissive: new THREE.Color("#FFC20E"), emissiveIntensity: 0 });
      this.lcvAct = actMat();
      this.pcvAct = actMat();
      this.lcv = WT.controlValve(r, { act: this.lcvAct });
      this.lcv.position.set(3.3, yL, zF);
      this.group.add(this.lcv);
      this.anchors.lcv = new THREE.Vector3(3.3, yL + 0.55, zF);
      // Gas: salida → placa de orificio (TDG) → PCV → T
      this.gasPipe = WT.pipe(
        [
          [1.15, 0.72, 0],
          [1.15, yG, 0],
          [xT, yG, 0],
          [xT, yG, zF],
          [xT, yL, zF],
        ],
        { r, mat: M.pipeGreen, flow: WT.flowColors.gas[0], flow2: WT.flowColors.gas[1], flowOpts: { speed: 2.0, spacing: 0.6 } },
      );
      this.group.add(this.gasPipe.group);
      this.orifice = WT.orifice(r);
      this.orifice.position.set(2.2, yG, 0);
      this.group.add(this.orifice);
      this.anchors.orifice = new THREE.Vector3(2.2, yG - 0.1, 0.12);
      const dp = WT.dpTx();
      dp.position.set(2.2, yG + 0.3, 0);
      this.group.add(dp);
      this.dp = dp;
      // Líneas de impulso
      [-1, 1].forEach((s) => {
        const p = WT.pipe(
          [
            [2.2 + s * 0.028, yG + 0.13, 0],
            [2.2 + s * 0.028, yG + 0.2, 0],
            [2.2 + s * 0.065, yG + 0.24, 0],
            [2.2 + s * 0.065, yG + 0.29, 0],
          ],
          { r: 0.008, mat: M.steel, bend: 0.02 },
        );
        this.group.add(p.group);
      });
      this.anchors.tdg = new THREE.Vector3(2.2, yG + 0.55, 0);
      this.pcv = WT.controlValve(r, { act: this.pcvAct });
      this.pcv.position.set(3.3, yG, 0);
      this.group.add(this.pcv);
      this.anchors.pcv = new THREE.Vector3(3.3, yG + 0.55, 0);
      // Salida a batería (mezcla reincorporada)
      this.outPipe = WT.pipe(
        [
          [xT, yL, zF],
          [xT + 0.6, yL, zF],
        ],
        { r: r * 1.15, mat: M.pipeGreen, flow: WT.flowColors.mezcla[0], flow2: WT.flowColors.mezcla[1], flowOpts: { speed: 1.4 } },
      );
      this.group.add(this.outPipe.group);
      this.group.add(WT.at(WT.cyl(r * 1.6, r * 1.6, 0.22, M.pipeGreen, 16), xT, yL, zF)); // cuerpo de la T
      const tdm = WT.pressureTx();
      tdm.position.set(xT + 0.38, yL + r * 1.1, zF);
      this.group.add(tdm);
      this.anchors.tdm = new THREE.Vector3(xT + 0.38, yL + 0.42, zF);
      this.anchors.tee = new THREE.Vector3(xT, yL, zF);
      this.ports = {
        inlet: new THREE.Vector3(-1.2, 0.74, 0),
        outlet: new THREE.Vector3(xT + 0.6, yL, zF),
        groundY: -(this.R + this.saddleH) - 0.78,
      };
    }

    /* ------------------------------ Apertura del corte ------------------------------ */
    setOpen(o) {
      this.open = o;
      const e = U.easeIO(U.clamp(o, 0, 1));
      this.front.position.set(0, 0.32 * e, 1.7 * e);
      this.front.rotation.x = -0.12 * e;
      const op = 1 - U.smooth(0.5, 0.95, o);
      this.frontMats.forEach((m) => {
        m.opacity = op;
        m.depthWrite = op > 0.98;
      });
      this.front.visible = op > 0.01;
      this.band.visible = o > 0.02;
      const inside = U.smooth(0.15, 0.6, o);
      this.oilSection.uniforms.uA.value = 0.93 * inside;
      this.oilTop.uniforms.uA.value = 0.72 * inside;
      this.oilFace.visible = this.oilSurf.visible = inside > 0.01;
      this.levelMarks.forEach((l) => {
        l.material.opacity = inside;
        l.visible = inside > 0.01;
      });
    }

    updatePlanes() {
      this.group.updateMatrixWorld(true);
      this.planes.back.copy(this._local.back).applyMatrix4(this.back.matrixWorld);
      this.planes.front.copy(this._local.front).applyMatrix4(this.front.matrixWorld);
    }

    /* ------------------------------ Partículas ------------------------------ */
    _buildParticles() {
      this.N = { inlet: 170, bubble: 210, drop: 130, gas: 110, liq: 80, flash: 14 };
      const total = Object.values(this.N).reduce((a, b) => a + b, 0);
      this.ps = new WT.Particles(total);
      this.back.add(this.ps.points);
    }

    /**
     * Estado visual en el tiempo t.
     * st: { inflow, splash, flash, settle, mist, gasOut, liqOut, liqPhase, level,
     *       hl: {deflector, mist, lcv, pcv, tn, level}, lcvOpen, pcvOpen, flowT }
     */
    update(t, st, camera, hPx) {
      const ps = this.ps;
      const R = this.Ri;
      if (st.level != null) this.setLevel(st.level);
      const h = this.h;
      ps.setScale(WT.pointScale(camera, hPx), this.pr || 1);
      const inside = U.smooth(0.15, 0.6, this.open);
      let k = 0;
      const tmp = new THREE.Color();
      const rnd = U.rand;

      // A) Corriente de entrada y salpicadura
      const P = 2.4;
      for (let i = 0; i < this.N.inlet; i++, k++) {
        const vis = (st.inflow || 0) * inside;
        if (vis <= 0 || rnd(i, 99) > vis) {
          ps.hide(k);
          continue;
        }
        const u = (t / P + rnd(i, 1)) % 1;
        const x0 = -1.2 + (rnd(i, 2) - 0.5) * 0.07;
        const z = -0.02 - rnd(i, 3) * 0.05;
        if (u < 0.22) {
          const s = u / 0.22;
          const y = U.lerp(0.74, 0.23, Math.pow(s, 1.25));
          ps.set(k, x0, y, z, 0.03, C.mix, 1, 0);
          continue;
        }
        const tau = (u - 0.22) * P;
        const isGas = rnd(i, 4) < 0.42;
        if (isGas) {
          const s = (u - 0.22) / 0.78;
          const yc = h + 0.06 + rnd(i, 6) * Math.max(0.05, 0.36 - h - 0.06);
          let x;
          let y;
          let zz = z - rnd(i, 7) * 0.2;
          if (s < 0.82) {
            const q = s / 0.82;
            x = U.lerp(-1.2, 1.12, q);
            y = U.lerp(0.25, yc, U.smooth(0, 0.25, q));
          } else {
            const q = (s - 0.82) / 0.18;
            x = U.lerp(1.12, 1.15, q);
            y = U.lerp(yc, 0.8, q);
            zz = U.lerp(zz, -0.02, q);
          }
          tmp.copy(x < 0.79 ? C.gasWet : C.gas);
          ps.set(k, x, y, zz, 0.034, tmp, 0.85 * (st.gasOut != null ? Math.max(0.35, st.gasOut) : 1), 2);
        } else {
          const sp = st.splash != null ? st.splash : 1;
          const vx = (rnd(i, 5) - 0.42) * 1.5;
          const vy = 0.35 + rnd(i, 8) * 0.55;
          const x = U.clamp(-1.2 + vx * tau, -1.55, 0.7);
          const y = 0.24 + vy * tau - 4.9 * tau * tau;
          if (y > h) ps.set(k, x, y, z - rnd(i, 9) * 0.25, 0.024, C.amber, sp, 0);
          else {
            const tf = tau - (vy + Math.sqrt(Math.max(0, vy * vy + 2 * 4.9 * (0.24 - h)))) / 9.8;
            const a = 1 - U.clamp(tf / 0.35, 0, 1);
            if (a <= 0) ps.hide(k);
            else ps.set(k, x, h - tf * 0.12, z - rnd(i, 9) * 0.25, 0.022, C.amberDeep, a * sp, 0);
          }
        }
      }

      // B) Burbujas: liberación de gas en el líquido
      const fl = (st.flash || 0) * inside;
      for (let i = 0; i < this.N.bubble; i++, k++) {
        if (fl <= 0 || rnd(i, 21) > fl) {
          ps.hide(k);
          continue;
        }
        const Pb = 2.2 + rnd(i, 22) * 2.2;
        const u = (t / Pb + rnd(i, 23)) % 1;
        const x0 = -1.45 + 2.35 * Math.pow(rnd(i, 24), 1.5);
        const z = -0.03 - rnd(i, 25) * 0.3;
        const yb = -Math.sqrt(Math.max(0, R * R - z * z)) + 0.035;
        const y0 = yb + rnd(i, 26) * (h - yb) * 0.55;
        const vb = 0.1 + rnd(i, 27) * 0.24;
        const tau = u * Pb;
        const y = y0 + vb * tau;
        const x = x0 + 0.05 * tau;
        const size = 0.016 + rnd(i, 28) * 0.03;
        if (y < h - 0.005) {
          tmp.copy(C.bubble).lerp(C.amber, 0.25);
          ps.set(k, x, y, z, size, tmp, 0.95, 1);
        } else {
          const tp = (y - h) / vb;
          const a = 1 - U.clamp(tp / 0.18, 0, 1);
          if (a <= 0) ps.hide(k);
          else ps.set(k, x, h + 0.01, z, size * (1 + (1 - a) * 1.5), C.gas, a * 0.9, 2);
        }
      }

      // C) Gotas arrastradas por el gas: asentamiento y captura en el extractor
      const se = (st.settle || 0) * inside;
      const padX = 0.79;
      const padBottom = 0.12;
      for (let i = 0; i < this.N.drop; i++, k++) {
        if (se <= 0 || rnd(i, 31) > se) {
          ps.hide(k);
          continue;
        }
        const Pd = 3.2;
        const u = (t / Pd + rnd(i, 32)) % 1;
        const tau = u * Pd;
        const x0 = -1.12 + rnd(i, 33) * 0.35;
        const y0 = 0.2 + rnd(i, 34) * 0.16;
        const z = -0.04 - rnd(i, 35) * 0.28;
        const d = 0.008 + Math.pow(rnd(i, 36), 2) * 0.03;
        const vs = 0.05 + d * 8;
        const vx = 0.5 + rnd(i, 37) * 0.3;
        const tc = (padX - x0) / vx;
        const tfall = (y0 - h) / vs;
        if (tfall < tc) {
          // Cae al líquido antes de llegar al extractor
          if (tau < tfall) ps.set(k, x0 + vx * tau, y0 - vs * tau, z, d * 1.4, C.amber, 1, 0);
          else {
            const a = 1 - U.clamp((tau - tfall) / 0.3, 0, 1);
            if (a <= 0) ps.hide(k);
            else ps.set(k, x0 + vx * tfall, h - (tau - tfall) * 0.08, z, d * 1.4, C.amberDeep, a, 0);
          }
        } else if (tau < tc) {
          ps.set(k, x0 + vx * tau, y0 - vs * tau, z, d * 1.4, C.amber, 1, 0);
        } else {
          // Capturada: coalesce y escurre por la malla
          const yc = y0 - vs * tc;
          const ts = tau - tc;
          const slide = 0.07 + d * 4;
          const y = yc - slide * ts;
          const grow = d * 1.4 * (1 + Math.min(1.6, ts * 0.9));
          const glow = (st.mist || 0) * 0.6;
          tmp.copy(C.amber).lerp(C.white, glow * 0.4);
          if (y > padBottom) ps.set(k, padX + 0.01, y, z, grow, tmp, 1, 0);
          else {
            const tdrop = (padBottom - y) / slide;
            const yy = padBottom - 4.9 * tdrop * tdrop;
            if (yy > h) ps.set(k, padX + 0.05, yy, z, grow, C.amber, 1, 0);
            else ps.hide(k);
          }
        }
      }

      // D) Gas: corrientes hacia el extractor y la salida superior
      const go = (st.gasOut || 0) * inside;
      for (let i = 0; i < this.N.gas; i++, k++) {
        if (go <= 0 || rnd(i, 41) > go) {
          ps.hide(k);
          continue;
        }
        const Pg = 2.6 + rnd(i, 42) * 0.8;
        const u = (t / Pg + rnd(i, 43)) % 1;
        const ytop = 0.36;
        const yc = h + 0.05 + rnd(i, 44) * Math.max(0.03, ytop - h - 0.05);
        const zmax = Math.sqrt(Math.max(0.0001, R * R - yc * yc)) - 0.03;
        let z = -0.04 - rnd(i, 45) * Math.max(0.01, zmax - 0.04);
        let x;
        let y;
        if (u < 0.84) {
          const q = u / 0.84;
          x = U.lerp(-1.45, 1.12, q);
          y = yc + Math.sin(q * 9 + i) * 0.008;
        } else {
          const q = (u - 0.84) / 0.16;
          x = U.lerp(1.12, 1.15 + (rnd(i, 46) - 0.5) * 0.04, q);
          y = U.lerp(yc, 0.86, q);
          z = U.lerp(z, -0.025, q);
        }
        tmp.copy(x < padX ? C.gasWet : C.gas);
        const a = (x < padX ? 0.42 : 0.7) * (0.6 + 0.4 * go);
        ps.set(k, x, y, z, x < padX ? 0.05 : 0.045, tmp, a, 2);
      }

      // E) Salida de líquido (depende de la apertura de la LCV)
      const lo = (st.liqOut || 0) * inside;
      const lph = st.liqPhase != null ? st.liqPhase : t * 0.5;
      for (let i = 0; i < this.N.liq; i++, k++) {
        if (lo <= 0 || rnd(i, 51) > lo) {
          ps.hide(k);
          continue;
        }
        const u = (lph * 0.55 + rnd(i, 52)) % 1;
        let x;
        let y;
        let z = -0.04 - rnd(i, 53) * 0.22;
        const yb = -Math.sqrt(Math.max(0, R * R - z * z)) + 0.03;
        if (u < 0.8) {
          const q = u / 0.8;
          x = U.lerp(-0.7, 1.0, q);
          y = yb + rnd(i, 54) * 0.07;
          z = U.lerp(z, -0.02, U.smooth(0.7, 1, q));
        } else {
          const q = (u - 0.8) / 0.2;
          x = 1.0 + (rnd(i, 55) - 0.5) * 0.03;
          y = U.lerp(-0.4, -0.68, q);
          z = -0.02;
        }
        ps.set(k, x, y, z, 0.022, C.oil, 0.85, 0);
      }

      // F) Destellos de impacto en el deflector
      for (let i = 0; i < this.N.flash; i++, k++) {
        const vis = (st.inflow || 0) * inside * (0.5 + (st.hl && st.hl.deflector ? st.hl.deflector : 0));
        if (vis <= 0.01) {
          ps.hide(k);
          continue;
        }
        const u = (t * 2.2 + rnd(i, 61)) % 1;
        const ang = Math.PI * (1.1 + rnd(i, 62) * 0.8);
        const rr = 0.05 + u * 0.12;
        tmp.copy(C.mix).lerp(C.gas, u);
        ps.set(k, -1.2 + Math.cos(ang) * rr, 0.24 + Math.abs(Math.sin(ang)) * rr * 0.6, -0.02 - rnd(i, 63) * 0.1, 0.05 * (1 - u) + 0.02, tmp, (1 - u) * vis, 2);
      }
      ps.commit();

      // Resaltados y materiales animados
      const hl = st.hl || {};
      const pulse = 0.55 + 0.45 * Math.sin(t * 6);
      this.deflMat.emissiveIntensity = (hl.deflector || 0) * pulse * 0.9;
      this.mistMat.emissiveIntensity = (hl.mist || 0) * pulse * 0.7;
      this.tnMat.emissiveIntensity = (hl.tn || 0) * pulse * 0.9;
      this.oilSection.uniforms.uT.value = t;
      this.oilTop.uniforms.uT.value = t;
      this.levelMarks[1].material.color.set(hl.level ? (pulse > 0.75 ? "#FFF3B0" : "#FFC20E") : "#FFC20E");
      if (this.lcv) {
        WT.setValveOpen(this.lcv, st.lcvOpen != null ? st.lcvOpen : 0.5);
        WT.setValveOpen(this.pcv, st.pcvOpen != null ? st.pcvOpen : 0.5);
        const ft = st.flowT != null ? st.flowT : t;
        this.liqPipe.flow.uniforms.uTime.value = st.liqPhase != null ? st.liqPhase : ft;
        this.gasPipe.flow.uniforms.uTime.value = ft;
        this.outPipe.flow.uniforms.uTime.value = ft;
        const fo = st.skidFlow != null ? st.skidFlow : 1;
        this.liqPipe.flow.uniforms.uOpacity.value = fo;
        this.gasPipe.flow.uniforms.uOpacity.value = fo;
        this.outPipe.flow.uniforms.uOpacity.value = fo;
        this.liqPipe.flow.uniforms.uProgress.value = st.liqProg != null ? st.liqProg : 1;
        this.gasPipe.flow.uniforms.uProgress.value = st.gasProg != null ? st.gasProg : 1;
        this.outPipe.flow.uniforms.uProgress.value = st.outProg != null ? st.outProg : 1;
        this.lcvAct.emissiveIntensity = (hl.lcv || 0) * pulse * 0.8;
        this.pcvAct.emissiveIntensity = (hl.pcv || 0) * pulse * 0.8;
      }
      this.updatePlanes();
    }
  }
  WT.Separator = Separator;
})();
