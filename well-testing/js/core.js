/* =====================================================================
   Well Testing — utilidades compartidas por las tres escenas 3D
   (renderizador, cámara, controles orbitales, etiquetas, tuberías con
   flujo animado, partículas y texturas generadas).
   Todo lo animado es función pura del tiempo t para que el render de
   video cuadro por cuadro sea determinista.
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const THREE = window.THREE;
  THREE.ColorManagement.legacyMode = false;

  /* ----------------------------- Matemáticas ----------------------------- */
  const U = (WT.util = {
    clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
    lerp: (a, b, t) => a + (b - a) * t,
    inv: (a, b, x) => U.clamp((x - a) / (b - a), 0, 1),
    smooth: (a, b, x) => {
      const t = U.inv(a, b, x);
      return t * t * (3 - 2 * t);
    },
    easeIO: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeIn: (t) => t * t * t,
    sineIO: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    /** Ventana: 0 antes de a, sube en `f` s, 1 hasta b, baja en `f` s. */
    win: (t, a, b, f = 0.6) => Math.min(U.smooth(a, a + f, t), 1 - U.smooth(b - f, b, t)),
    /** Pseudoaleatorio determinista en [0,1). */
    rand: (i, s = 0) => {
      const x = Math.sin(i * 127.1 + s * 311.7 + 74.7) * 43758.5453123;
      return x - Math.floor(x);
    },
    /** Ruido suave 1D determinista (para lecturas que oscilan). */
    noise: (t, s = 0) => {
      const i = Math.floor(t);
      const f = t - i;
      const a = U.rand(i, s) * 2 - 1;
      const b = U.rand(i + 1, s) * 2 - 1;
      const u = f * f * (3 - 2 * f);
      return a + (b - a) * u;
    },
    fmt: (v, d = 1) =>
      Number(v).toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d }),
    get: (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj),
    el: (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    },
    v3: (a) => new THREE.Vector3(a[0], a[1], a[2]),
  });

  /* ----------------------------- Marca / logo ----------------------------- */
  WT.brand = {
    logoURL: null,
    wordmark() {
      return '<span class="wt-wordmark" role="img" aria-label="R.B. Tec México"><span class="a">R.B.</span><span class="b">TEC<small>MÉXICO</small></span></span>';
    },
    markup() {
      return WT.brand.logoURL
        ? `<img src="${WT.brand.logoURL}" alt="${WT.config.empresa.nombre}">`
        : WT.brand.wordmark();
    },
    paint(root = document) {
      root.querySelectorAll("[data-logo]").forEach((n) => {
        n.innerHTML = WT.brand.markup();
      });
    },
    load() {
      return new Promise((resolve) => {
        WT.brand.paint();
        const img = new Image();
        img.onload = () => {
          WT.brand.logoURL = WT.config.empresa.logo;
          WT.brand.paint();
          resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = WT.config.empresa.logo;
      });
    },
  };

  /* ----------------------------- Renderizador ----------------------------- */
  WT.capture = /[?&]capture=/.test(location.search);

  WT.createRenderer = function (canvas) {
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: WT.capture,
      powerPreference: "high-performance",
    });
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    return r;
  };

  /**
   * Escenario: canvas + renderizador + cámara + etiquetas, con ajuste de
   * tamaño automático. La escena concreta implementa frame(t, dt).
   */
  class Stage {
    constructor(el, opts = {}) {
      this.el = el;
      this.canvas = el.querySelector("canvas");
      this.renderer = WT.createRenderer(this.canvas);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(opts.fov || 40, 16 / 9, 0.1, 2000);
      this.labels = new Labels(el.querySelector(".wt-labels"));
      this.w = 1;
      this.h = 1;
      this.running = false;
      this.onResize = null;
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(el);
      this.resize();
    }
    get portrait() {
      return this.h > this.w;
    }
    resize() {
      const w = Math.max(1, this.el.clientWidth);
      const h = Math.max(1, this.el.clientHeight);
      if (w === this.w && h === this.h) return;
      this.w = w;
      this.h = h;
      const pr = WT.capture ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.onResize) this.onResize(w, h);
      this.dirty = true;
    }
    render(avoid) {
      this.renderer.render(this.scene, this.camera);
      this.labels.update(this.camera, this.w, this.h, avoid || this.avoid);
    }
    /** Rectángulos (px, relativos al escenario) de los elementos dados. */
    rectsOf(els) {
      const b = this.el.getBoundingClientRect();
      const sx = this.w / (b.width || 1);
      const sy = this.h / (b.height || 1);
      return els
        .filter((e) => e && e.offsetParent !== null && getComputedStyle(e).opacity > 0.05)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return [(r.left - b.left) * sx, (r.top - b.top) * sy, (r.right - b.left) * sx, (r.bottom - b.top) * sy];
        });
    }
    start(frame) {
      if (this.running) return;
      this.running = true;
      let last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        frame(dt);
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    stop() {
      this.running = false;
      cancelAnimationFrame(this._raf);
    }
  }
  WT.Stage = Stage;

  /* ----------------------------- Etiquetas HTML ----------------------------- */
  /**
   * Etiquetas ancladas a puntos 3D con línea guía. El desplazamiento de la
   * tarjeta (off) está en % del ancho del escenario, así la composición es
   * idéntica en pantalla y en el video. offP: desplazamiento en vertical (9:16).
   */
  class Labels {
    constructor(layer) {
      this.layer = layer;
      this.items = [];
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.svg.setAttribute("class", "wt-leaders");
      layer.appendChild(this.svg);
      this._v = new THREE.Vector3();
    }
    add(def) {
      const root = U.el("div", "wt-label " + (def.cls || "eq"));
      const pin = U.el("div", "pin");
      const card = U.el("div", "card", def.html || WT.labelHTML(def));
      root.append(pin, card);
      this.layer.appendChild(root);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      if ((def.cls || "").includes("inst")) line.setAttribute("class", "inst");
      this.svg.appendChild(line);
      const item = Object.assign(
        { root, pin, card, line, opacity: 0, _op: -1, off: [4, -4], anchor: new THREE.Vector3() },
        def,
      );
      if (Array.isArray(item.anchor)) item.anchor = U.v3(item.anchor);
      root.style.opacity = 0;
      line.style.opacity = 0;
      item._html = card.innerHTML;
      this.items.push(item);
      return item;
    }
    set(id, html) {
      const it = this.items.find((i) => i.id === id);
      if (it && it._html !== html) {
        it._html = html;
        it.card.innerHTML = html;
      }
    }
    clear() {
      this.items.forEach((i) => {
        i.root.remove();
        i.line.remove();
      });
      this.items = [];
    }
    /**
     * avoid: rectángulos [x0, y0, x1, y1] en px que las tarjetas no deben
     * tapar (paneles del overlay). Si la posición preferida choca, se prueba
     * el lado opuesto y luego arriba/abajo; la elección es estable.
     */
    update(camera, w, h, avoid = []) {
      const portrait = h > w;
      const key = w + "x" + h;
      if (key !== this._key) {
        this._key = key;
        this.items.forEach((i) => (i._cw = 0));
      }
      const placed = avoid.slice();
      const hit = (r) => r[0] < 4 || r[1] < 4 || r[2] > w - 4 || r[3] > h - 4 || placed.some((q) => r[0] < q[2] + 6 && r[2] > q[0] - 6 && r[1] < q[3] + 6 && r[3] > q[1] - 6);
      for (const it of this.items) {
        let op = it.opacity;
        const a = typeof it.anchor === "function" ? it.anchor() : it.anchor;
        const v = this._v.copy(a);
        if (it.object) it.object.localToWorld(v);
        v.project(camera);
        if (v.z > 1 || v.z < -1) op = 0;
        if (op !== it._op) {
          it._op = op;
          it.root.style.opacity = op;
          it.root.style.visibility = op < 0.01 ? "hidden" : "visible";
          it.line.style.opacity = op;
        }
        if (op < 0.01) {
          it._ci = undefined;
          continue;
        }
        if (!it._cw || it._html !== it._mhtml) {
          it._cw = it.card.offsetWidth;
          it._chh = it.card.offsetHeight;
          it._mhtml = it._html;
        }
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        const off = (portrait && it.offP) || it.off;
        const unit = w / 100;
        const cands = [
          [off[0], off[1]],
          [-off[0], off[1]],
          [off[0], -off[1]],
          [-off[0], -off[1]],
        ];
        const rectOf = (c) => {
          const ex = x + c[0] * unit;
          const ey = y + c[1] * unit;
          const l = c[0] < 0 ? ex - it._cw : ex;
          return [l, ey - it._chh / 2, l + it._cw, ey + it._chh / 2];
        };
        let ci = it._ci != null && !hit(rectOf(cands[it._ci])) ? it._ci : -1;
        if (ci < 0) ci = cands.findIndex((c) => !hit(rectOf(c)));
        if (ci < 0) ci = it._ci != null ? it._ci : 0;
        it._ci = ci;
        const c = cands[ci];
        if (op > 0.3) placed.push(rectOf(c));
        const ex = x + c[0] * unit;
        const ey = y + c[1] * unit;
        it.pin.style.transform = `translate3d(${x}px,${y}px,0)`;
        const left = c[0] < 0;
        it.card.style.transform = `translate3d(${ex}px,${ey}px,0) translate(${left ? "-100%" : "0"},-50%) scale(${0.85 + 0.15 * op})`;
        it.card.style.transformOrigin = left ? "100% 50%" : "0 50%";
        it.line.setAttribute("x1", x);
        it.line.setAttribute("y1", y);
        it.line.setAttribute("x2", ex);
        it.line.setAttribute("y2", ey);
      }
    }
  }
  WT.Labels = Labels;

  WT.labelHTML = function (d) {
    let h = "";
    h += `<span class="t">${d.tag ? `<span class="tag">${d.tag}</span>` : ""}${d.title || ""}</span>`;
    if (d.sub) h += `<span class="s">${d.sub}</span>`;
    if (d.val) h += `<span class="v">${d.val}</span>`;
    return h;
  };

  /* ----------------------------- Controles orbitales ----------------------------- */
  class Orbit {
    constructor(camera, dom, opts = {}) {
      this.camera = camera;
      this.dom = dom;
      this.target = new THREE.Vector3();
      this.sph = new THREE.Spherical(10, 1, 0);
      this.goal = { r: 10, phi: 1, theta: 0, target: new THREE.Vector3() };
      this.minR = opts.minR || 2;
      this.maxR = opts.maxR || 200;
      this.minPhi = opts.minPhi || 0.05;
      this.maxPhi = opts.maxPhi || Math.PI / 2 - 0.04;
      this.enabled = true;
      this.onUser = null;
      this._ptrs = new Map();
      this._bind();
    }
    setFrom(pos, target) {
      this.goal.target.copy(target);
      this.target.copy(target);
      const off = pos.clone().sub(target);
      this.sph.setFromVector3(off);
      this.goal.r = this.sph.radius;
      this.goal.phi = this.sph.phi;
      this.goal.theta = this.sph.theta;
      this.apply();
    }
    flyTo(pos, target) {
      const off = pos.clone().sub(target);
      const s = new THREE.Spherical().setFromVector3(off);
      // Toma el camino angular más corto
      let dt = s.theta - this.goal.theta;
      dt = Math.atan2(Math.sin(dt), Math.cos(dt));
      this.goal.theta += dt;
      this.goal.phi = s.phi;
      this.goal.r = s.radius;
      this.goal.target.copy(target);
    }
    _bind() {
      const d = this.dom;
      d.addEventListener("contextmenu", (e) => e.preventDefault());
      d.addEventListener("pointerdown", (e) => {
        if (!this.enabled) return;
        d.setPointerCapture(e.pointerId);
        this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
        this._pinch = null;
        if (this.onUser) this.onUser();
      });
      d.addEventListener("pointermove", (e) => {
        const p = this._ptrs.get(e.pointerId);
        if (!p || !this.enabled) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (this._ptrs.size === 2) {
          const [a, b] = [...this._ptrs.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (this._pinch) this.zoom(this._pinch / dist);
          this._pinch = dist;
          this.pan(dx / 2, dy / 2);
          return;
        }
        if (p.b === 2 || p.b === 1 || p.shift) this.pan(dx, dy);
        else {
          this.goal.theta -= dx * 0.006;
          this.goal.phi = U.clamp(this.goal.phi - dy * 0.006, this.minPhi, this.maxPhi);
        }
      });
      const up = (e) => {
        this._ptrs.delete(e.pointerId);
        this._pinch = null;
      };
      d.addEventListener("pointerup", up);
      d.addEventListener("pointercancel", up);
      d.addEventListener(
        "wheel",
        (e) => {
          if (!this.enabled) return;
          e.preventDefault();
          this.zoom(Math.exp(e.deltaY * 0.0012));
          if (this.onUser) this.onUser();
        },
        { passive: false },
      );
    }
    zoom(f) {
      this.goal.r = U.clamp(this.goal.r * f, this.minR, this.maxR);
    }
    pan(dx, dy) {
      const h = this.dom.clientHeight || 1;
      const s = (2 * this.goal.r * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
      const te = this.camera.matrix.elements;
      const right = new THREE.Vector3(te[0], te[1], te[2]);
      const fwd = new THREE.Vector3(-te[8], 0, -te[10]).normalize();
      const upv = this.goal.phi < 0.35 ? new THREE.Vector3(te[4], te[5], te[6]) : fwd;
      this.goal.target.addScaledVector(right, -dx * s).addScaledVector(upv, dy * s);
      if (this.bounds) {
        const b = this.bounds;
        this.goal.target.x = U.clamp(this.goal.target.x, b[0], b[1]);
        this.goal.target.z = U.clamp(this.goal.target.z, b[2], b[3]);
      }
    }
    update(dt = 1 / 60) {
      const k = 1 - Math.pow(0.0008, dt);
      this.sph.radius += (this.goal.r - this.sph.radius) * k;
      this.sph.phi += (this.goal.phi - this.sph.phi) * k;
      this.sph.theta += (this.goal.theta - this.sph.theta) * k;
      this.target.lerp(this.goal.target, k);
      this.apply();
    }
    apply() {
      const off = new THREE.Vector3().setFromSpherical(this.sph);
      this.camera.position.copy(this.target).add(off);
      this.camera.lookAt(this.target);
    }
  }
  WT.Orbit = Orbit;

  /* ----------------------------- Ruta de cámara ----------------------------- */
  /**
   * keys: [{t, p:[x,y,z], l:[x,y,z], fov?, e?}] — e: 'io' (por defecto),
   * 'lin', 'in', 'out' para el tramo que empieza en esa clave.
   * Interpola posición y objetivo con Catmull-Rom.
   */
  class CameraRig {
    constructor(keys) {
      this.keys = keys.map((k) => ({ ...k, P: U.v3(k.p), L: U.v3(k.l) }));
    }
    sample(t, out = {}) {
      const K = this.keys;
      let i = 0;
      while (i < K.length - 2 && t >= K[i + 1].t) i++;
      const a = K[i];
      const b = K[i + 1] || a;
      let u = b === a ? 0 : U.clamp((t - a.t) / (b.t - a.t), 0, 1);
      const e = a.e || "io";
      u = e === "lin" ? u : e === "in" ? U.easeIn(u) : e === "out" ? U.easeOut(u) : U.sineIO(u);
      const p0 = (K[i - 1] || a).P;
      const p3 = (K[i + 2] || b).P;
      const l0 = (K[i - 1] || a).L;
      const l3 = (K[i + 2] || b).L;
      out.p = cr(p0, a.P, b.P, p3, u, out.p || new THREE.Vector3());
      out.l = cr(l0, a.L, b.L, l3, u, out.l || new THREE.Vector3());
      out.fov = U.lerp(a.fov || 40, b.fov || 40, u);
      return out;
    }
  }
  function cr(p0, p1, p2, p3, t, out) {
    const t2 = t * t;
    const t3 = t2 * t;
    for (const k of ["x", "y", "z"]) {
      out[k] =
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    }
    return out;
  }
  WT.CameraRig = CameraRig;

  /* ----------------------------- Texturas generadas ----------------------------- */
  WT.canvasTex = function (w, h, draw, opts = {}) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (opts.repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    t.userData.canvas = c;
    t.userData.ctx = g;
    return t;
  };

  /** Textura de grava / terreno con ruido determinista. */
  WT.noiseTex = function (base, spread, size = 256, seed = 1, specks = 0) {
    return WT.canvasTex(
      size,
      size,
      (g, w, h) => {
        const c = new THREE.Color(base);
        const img = g.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          const n = (U.rand(i, seed) - 0.5) * spread;
          const n2 = (U.rand(Math.floor(i / 7), seed + 3) - 0.5) * spread * 0.6;
          img.data[i * 4] = U.clamp((c.r + n + n2) * 255, 0, 255);
          img.data[i * 4 + 1] = U.clamp((c.g + n + n2) * 255, 0, 255);
          img.data[i * 4 + 2] = U.clamp((c.b + n * 0.9 + n2) * 255, 0, 255);
          img.data[i * 4 + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        for (let i = 0; i < specks; i++) {
          g.fillStyle = `rgba(${U.rand(i, seed + 9) > 0.5 ? "255,255,255" : "0,0,0"},${0.05 + U.rand(i, seed + 4) * 0.08})`;
          const r = 1 + U.rand(i, seed + 5) * 3;
          g.beginPath();
          g.arc(U.rand(i, seed + 6) * w, U.rand(i, seed + 7) * h, r, 0, 6.283);
          g.fill();
        }
      },
      { repeat: [1, 1] },
    );
  };

  /** Texto plano como textura (rótulos pintados sobre equipos). */
  WT.textTex = function (lines, opts = {}) {
    const w = opts.w || 512;
    const h = opts.h || 128;
    return WT.canvasTex(w, h, (g) => {
      if (opts.bg) {
        g.fillStyle = opts.bg;
        g.fillRect(0, 0, w, h);
      } else g.clearRect(0, 0, w, h);
      g.textAlign = opts.align || "center";
      g.textBaseline = "middle";
      const lh = h / lines.length;
      lines.forEach((ln, i) => {
        const L = typeof ln === "string" ? { t: ln } : ln;
        g.font = `${L.weight || 800} ${L.size || lh * 0.62}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        g.fillStyle = L.color || opts.color || "#fff";
        const x = g.textAlign === "left" ? (opts.pad || 10) : w / 2;
        g.fillText(L.t, x, lh * (i + 0.5));
      });
    });
  };

  /* ----------------------------- Cielo ----------------------------- */
  WT.sky = function (top = "#5D93C9", horizon = "#DCE8F0", bottom = "#C9D8E2") {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(top) },
        uHor: { value: new THREE.Color(horizon) },
        uBot: { value: new THREE.Color(bottom) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; varying vec3 vP;
        void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(uHor, uTop, pow(smoothstep(0.0, 0.7, y), 0.8)) : mix(uHor, uBot, smoothstep(0.0, 0.15, -y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    return m;
  };

  /* ----------------------------- Material de flujo ----------------------------- */
  /**
   * Cheurones animados que recorren un tubo en el sentido del flujo.
   * uProgress (0–1) recorta el frente: sirve para "llenar" la línea cuando
   * el fluido llega por primera vez.
   */
  WT.flowMaterial = function (color, color2, opts = {}) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uColor2: { value: new THREE.Color(color2 || color) },
        uTime: { value: 0 },
        uLen: { value: 1 },
        uSpeed: { value: opts.speed || 1.6 },
        uSpacing: { value: opts.spacing || 0.55 },
        uProgress: { value: 1 },
        uOpacity: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix*normal; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uColor2; uniform float uTime; uniform float uLen; uniform float uSpeed;
        uniform float uSpacing; uniform float uProgress; uniform float uOpacity;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          float s = vUv.x * uLen;
          float front = uProgress * (uLen + 0.6);
          if (s > front) discard;
          // Forma de V calculada en espacio de vista: la punta siempre apunta
          // en el sentido del flujo, sin importar cómo gire el tubo.
          float d = abs(dot(normalize(vN), normalize(vV)));
          float w = sqrt(max(0.0, 1.0 - d * d));
          float ph = fract((s - uTime * uSpeed) / uSpacing + w * 0.45);
          float chev = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.2, 0.27, ph));
          float lit = 0.55 + 0.45 * d;
          float head = (1.0 - smoothstep(0.0, 1.0, front - s)) * step(uProgress, 0.999);
          vec3 c = mix(uColor2, uColor, chev) * (0.75 + 0.45 * lit) * (1.0 + head * 0.9);
          gl_FragColor = vec4(c, (0.86 + 0.14 * chev) * uOpacity);
          #include <encodings_fragment>
        }`,
    });
  };

  /* ----------------------------- Tuberías ----------------------------- */
  /**
   * Trayectoria ortogonal con codos redondeados a partir de puntos.
   * Devuelve una CurvePath parametrizable por longitud de arco.
   */
  WT.pipePath = function (pts, bend = 0.18) {
    const P = pts.map((p) => (p.isVector3 ? p.clone() : U.v3(p)));
    const path = new THREE.CurvePath();
    let cur = P[0].clone();
    for (let i = 1; i < P.length; i++) {
      const a = P[i];
      if (i < P.length - 1) {
        const dIn = a.clone().sub(P[i - 1]);
        const dOut = P[i + 1].clone().sub(a);
        const r = Math.min(bend, dIn.length() / 2.01, dOut.length() / 2.01);
        const p1 = a.clone().sub(dIn.normalize().multiplyScalar(r));
        const p2 = a.clone().add(dOut.normalize().multiplyScalar(r));
        if (cur.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(cur.clone(), p1));
        path.add(new THREE.QuadraticBezierCurve3(p1, a.clone(), p2));
        cur = p2;
      } else {
        path.add(new THREE.LineCurve3(cur.clone(), a.clone()));
      }
    }
    return path;
  };

  /**
   * Tubo sólido + funda de flujo animado.
   * Devuelve { group, path, length, flow (material) }.
   */
  WT.pipe = function (pts, o = {}) {
    const r = o.r || 0.05;
    const path = WT.pipePath(pts, o.bend != null ? o.bend : r * 3.2);
    const len = path.getLength();
    const seg = Math.max(8, Math.ceil(len * 10));
    const group = new THREE.Group();
    const geo = new THREE.TubeGeometry(path, seg, r, o.radial || 14, false);
    const mesh = new THREE.Mesh(geo, o.mat || WT.mats.pipe);
    mesh.castShadow = o.shadow !== false;
    mesh.receiveShadow = true;
    group.add(mesh);
    let flow = null;
    if (o.flow) {
      flow = WT.flowMaterial(o.flow, o.flow2, o.flowOpts);
      flow.uniforms.uLen.value = len;
      const fgeo = new THREE.TubeGeometry(path, seg, r * (o.flowScale || 1.14), 16, false);
      const fm = new THREE.Mesh(fgeo, flow);
      fm.renderOrder = 3;
      group.add(fm);
      group.userData.flowMesh = fm;
    }
    if (o.flanges) {
      // Bridas en extremos
      const fg = new THREE.CylinderGeometry(r * 2.1, r * 2.1, r * 0.9, 20);
      [0, 1].forEach((u) => {
        const p = path.getPointAt(u);
        const tng = path.getTangentAt(u);
        const f = new THREE.Mesh(fg, o.flangeMat || WT.mats.flange);
        f.position.copy(p);
        f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tng);
        f.castShadow = true;
        group.add(f);
      });
    }
    return { group, path, length: len, flow, mesh };
  };

  /* ----------------------------- Partículas ----------------------------- */
  /**
   * Sistema de puntos con tamaño, color y estilo por partícula.
   * style: 0 = gota sólida, 1 = burbuja (anillo brillante), 2 = destello suave.
   */
  WT.Particles = class {
    constructor(n, opts = {}) {
      this.n = n;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(n * 3);
      this.col = new Float32Array(n * 3);
      this.size = new Float32Array(n);
      this.style = new Float32Array(n);
      this.alpha = new Float32Array(n);
      g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aStyle", new THREE.BufferAttribute(this.style, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uScale: { value: 300 }, uPR: { value: 1 } },
        vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aStyle; attribute float aAlpha;
          uniform float uScale; uniform float uPR;
          varying vec3 vC; varying float vS; varying float vA;
          void main(){ vC = aColor; vS = aStyle; vA = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uScale * uPR / -mv.z;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vC; varying float vS; varying float vA;
          void main(){
            vec2 q = gl_PointCoord * 2.0 - 1.0; float d = length(q);
            if (d > 1.0 || vA < 0.01) discard;
            vec3 c = vC; float a;
            if (vS < 0.5) { // gota: esfera sombreada
              float l = clamp(dot(normalize(vec3(q.x, -q.y, sqrt(max(0.0, 1.0 - d*d)))), normalize(vec3(-0.4, 0.6, 0.7))), 0.0, 1.0);
              c = c * (0.55 + 0.6 * l) + pow(l, 18.0) * 0.8; a = smoothstep(1.0, 0.85, d);
            } else if (vS < 1.5) { // burbuja: borde brillante y centro transparente
              float rim = smoothstep(0.55, 0.92, d) * smoothstep(1.0, 0.9, d);
              float hl = smoothstep(0.35, 0.0, length(q - vec2(-0.35, -0.35)));
              c = mix(c, vec3(1.0), 0.35) ; a = rim * 0.95 + hl * 0.9 + 0.12;
            } else { // destello suave
              a = pow(1.0 - d, 2.0);
            }
            gl_FragColor = vec4(c, a * vA);
            #include <tonemapping_fragment>
            #include <encodings_fragment>
          }`,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = opts.renderOrder || 5;
    }
    setScale(viewH, pr = 1) {
      // Convierte tamaño en metros a píxeles para la altura de vista actual
      this.mat.uniforms.uScale.value = viewH;
      this.mat.uniforms.uPR.value = pr;
    }
    commit() {
      const a = this.geo.attributes;
      a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aStyle.needsUpdate = a.aAlpha.needsUpdate = true;
    }
    set(i, x, y, z, size, color, alpha = 1, style = 0) {
      const k = i * 3;
      this.pos[k] = x;
      this.pos[k + 1] = y;
      this.pos[k + 2] = z;
      this.col[k] = color.r;
      this.col[k + 1] = color.g;
      this.col[k + 2] = color.b;
      this.size[i] = size;
      this.alpha[i] = alpha;
      this.style[i] = style;
    }
    hide(i) {
      this.alpha[i] = 0;
    }
  };

  /** Escala de puntos: píxeles por metro a 1 m de distancia según FOV y altura. */
  WT.pointScale = function (camera, hPx) {
    return hPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };
})();
