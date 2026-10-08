/* =====================================================================
   Well Testing — SCADA simulado (lecturas ilustrativas)
   Modelo de la prueba en función de las horas transcurridas desde que el
   pozo se alinea al separador:  Estabilización → En curso (24 h) →
   Finalizado. Todo es determinista para poder renderizar video.
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const U = WT.util;
  const S = WT.config.simulacion;
  const T = (tag) => WT.config.instrumentos.find((i) => i.tag === tag) || { tag };

  const STATES = ["Estabilización", "En curso", "Finalizado"];

  /** Lecturas a th horas de iniciada la prueba (th < 0: pozo aún no alineado). */
  function compute(th) {
    const stab = S.horasEstabilizacion;
    const dur = WT.config.pozo.duracionPrueba;
    const flowing = th >= 0;
    const st = !flowing ? -1 : th < stab ? 0 : th < stab + dur ? 1 : 2;
    const x = Math.max(0, th);
    // Respuesta de estabilización: oscilación amortiguada hacia el valor de prueba
    const settle = (amp, tau = 0.45, w = 5.2) => 1 + amp * Math.exp(-x / tau) * Math.cos(x * w);
    const n = (s, a) => (flowing ? U.noise(x * 7, s) * a : 0);
    const ramp = flowing ? U.smooth(0, 0.25, x) : 0;
    const pBat = S.presionBateria + n(1, 0.05);
    const pSep = flowing ? S.presionSeparador * settle(0.09) + n(2, 0.06) : pBat + 0.15;
    const pLin = flowing ? S.presionLinea * settle(0.1) + n(3, 0.07) : pBat + 0.2;
    const pPozo = flowing ? S.presionPozo * settle(-0.05, 0.6) + n(4, 0.15) : S.presionPozo * 1.06;
    const temp = flowing ? S.temperatura - 6 * Math.exp(-x / 0.8) + n(5, 0.15) : 31;
    const wc = Math.max(0, S.corteAgua * settle(0.25, 0.5, 3.4) + n(6, 0.25));
    const qLiq = flowing ? S.qLiquido * ramp * settle(0.16) + n(7, 14) : 0;
    const qGas = flowing ? S.qGas * ramp * settle(0.14, 0.5, 4.6) + n(8, 0.025) : 0;
    const dens = S.densidad * settle(0.012) + n(9, 0.0015);
    const qOil = qLiq * (1 - wc / 100);
    const qWat = qLiq - qOil;
    // Totalización solo durante la medición
    const m = U.clamp(th - stab, 0, dur);
    const qo = S.qLiquido * (1 - S.corteAgua / 100);
    const qw = S.qLiquido - qo;
    const accOil = (qo * m) / 24;
    const accWat = (qw * m) / 24;
    const accGas = (S.qGas * m) / 24;
    const mass = (qLiq * 0.158987 * dens * 1000) / 24; // kg/h
    const level = flowing ? S.nivel + Math.sin(x * 9) * 3 * Math.exp(-x / 1.5) + n(10, 0.8) : 40;
    return {
      th, st, stab, dur, m, flowing,
      pPozo, pLin, pSep, pBat, temp, wc, oil: 100 - wc, dens, qLiq, qOil, qWat, qGas,
      accOil, accWat, accLiq: accOil + accWat, accGas, mass, level,
    };
  }

  const fmtH = (h) => {
    const hh = Math.floor(Math.max(0, h));
    const mm = Math.floor((Math.max(0, h) - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  /* ----------------------------- Panel HTML ----------------------------- */
  class Panel {
    constructor(parent, mode = "mini") {
      this.mode = mode;
      this.el = U.el("div", "scada " + mode);
      const cfg = WT.config;
      const rows =
        mode === "mini"
          ? [
              ["pPozo", "TDP", "P. boca de pozo", "kg/cm²", 1],
              ["pSep", "TPS", "P. separador", "kg/cm²", 1],
              ["pLin", "TPL", "P. línea salida", "kg/cm²", 1],
              ["pBat", "TDM", "P. línea a batería", "kg/cm²", 1],
              ["temp", "TT", "Temp. separador", "°C", 1],
              ["wc", "", "% agua / aceite", "%", 1, "wc"],
              ["qLiq", "", "Q mezcla", "bpd", 0, "hl"],
              ["qGas", "", "Q gas", "MMpcd", 2, "hl"],
            ]
          : [
              ["pPozo", "TDP", "Presión boca de pozo", "kg/cm²", 1],
              ["pSep", "TPS", "Presión del separador", "kg/cm²", 1],
              ["pLin", "TPL", "Presión línea de salida", "kg/cm²", 1],
              ["pBat", "TDM", "Presión línea a batería", "kg/cm²", 1],
              ["temp", "TT", "Temperatura separador", "°C", 1],
              ["dens", "CORIOLIS", "Densidad líquido", "g/cm³", 3],
              ["wc", "", "% agua / % aceite", "%", 1, "wc"],
              ["mass", "CORIOLIS", "Flujo másico", "kg/h", 0],
              ["qLiq", "", "Q mezcla", "bpd", 0, "hl"],
              ["qGas", "TDG", "Q gas", "MMpcd", 2, "hl"],
              ["qOil", "", "Q aceite", "bpd", 0],
              ["qWat", "", "Q agua", "bpd", 0],
              ["accLiq", "", "Acum. mezcla", "bbl", 1],
              ["accOil", "", "Acum. aceite", "bbl", 1],
              ["accWat", "", "Acum. agua", "bbl", 1],
              ["accGas", "", "Acum. gas", "MMpc", 3],
            ];
      this.rows = rows;
      const cells = rows
        .map(([k, tag, name, unit, , cls]) => {
          const wcBar = cls === "wc" ? '<div class="wc"><i class="o"></i><i class="w"></i></div>' : "";
          return `<div class="cell ${cls === "hl" ? "hl" : ""}" data-k="${k}"><span class="k">${tag ? `<em>${tag}</em>` : ""}${name}</span><span class="val"><b>—</b><small>${unit}</small></span>${wcBar}</div>`;
        })
        .join("");
      const rtu = mode === "full" ? `<span class="clk">RTU ${cfg.sistema.rtu.replace("Honeywell ", "")}</span>` : "";
      const head = `<div class="hd"><span class="sys">${cfg.sistema.scada}</span><span class="well">${cfg.pozo.nombre} · ${cfg.equipo.seleccionado}</span>${rtu}</div>
        <div class="st">${STATES.map((s, i) => `<span class="s${i + 1}">${s}</span>`).join("")}</div>
        <div class="tm"><span class="lbl">Tiempo de prueba</span><b class="clock">00:00 h</b></div>
        <div class="bar24"><i style="width:0%"></i></div>`;
      if (mode === "full") {
        this.el.innerHTML = `${head}<div class="body"><div class="grid">${cells}</div>
          <div class="trend"><h4>Tendencia · presiones</h4><canvas data-c="p"></canvas>
          <div class="lg"><span><i style="--c:#4CC3F0"></i>P. separador</span><span><i style="--c:#D9955A"></i>P. línea de salida</span><span><i style="--c:#9AA9BA"></i>P. línea a batería</span></div>
          <h4>Tendencia · gastos</h4><canvas data-c="q"></canvas>
          <div class="lg"><span><i style="--c:#F29F05"></i>Q mezcla</span><span><i style="--c:#FFD400"></i>Q gas</span></div>
          <div class="summary"></div></div></div>`;
        this.canvas = this.el.querySelector('canvas[data-c="p"]');
        this.canvas2 = this.el.querySelector('canvas[data-c="q"]');
        this.summary = this.el.querySelector(".summary");
      } else {
        this.el.innerHTML = `${head}<div class="grid">${cells}</div>`;
      }
      this.cells = {};
      this.el.querySelectorAll(".cell").forEach((c) => {
        this.cells[c.dataset.k] = { b: c.querySelector("b"), o: c.querySelector(".wc .o"), w: c.querySelector(".wc .w"), last: "" };
      });
      this.stEls = [...this.el.querySelectorAll(".st span")];
      this.clock = this.el.querySelector(".clock");
      this.lbl = this.el.querySelector(".tm .lbl");
      this.bar = this.el.querySelector(".bar24 i");
      parent.appendChild(this.el);
    }
    update(v) {
      for (const [k, , , , d, cls] of this.rows) {
        const c = this.cells[k];
        let txt;
        if (!v.flowing && /^(q|mass)/.test(k)) txt = U.fmt(0, d);
        else if (cls === "wc") txt = `${U.fmt(v.wc, 1)} / ${U.fmt(v.oil, 1)}`;
        else txt = U.fmt(v[k], d);
        if (txt !== c.last) {
          c.b.textContent = txt;
          c.last = txt;
        }
        if (cls === "wc") {
          c.o.style.width = `${v.oil}%`;
          c.w.style.width = `${v.wc}%`;
        }
      }
      this.stEls.forEach((e, i) => {
        e.classList.toggle("on", v.st === i);
        e.classList.toggle("done", v.st > i);
      });
      if (v.st <= 0) {
        this.lbl.textContent = v.st < 0 ? "Pozo por alinear" : "Estabilizando";
        this.clock.textContent = `${fmtH(v.th)} h`;
        this.bar.style.width = "0%";
      } else {
        this.lbl.textContent = v.st === 1 ? "Medición (24 h)" : "Medición concluida";
        this.clock.textContent = `${fmtH(v.m)} / ${fmtH(v.dur)} h`;
        this.bar.style.width = `${(v.m / v.dur) * 100}%`;
      }
      if (this.canvas) {
        this._trend(v, this.canvas, [
          ["pSep", "#4CC3F0", 6, 18],
          ["pLin", "#D9955A", 6, 18],
          ["pBat", "#9AA9BA", 6, 18],
        ]);
        this._trend(v, this.canvas2, [
          ["qLiq", "#F29F05", 0, S.qLiquido * 1.45],
          ["qGas", "#FFD400", 0, S.qGas * 2.1],
        ]);
      }
      if (this.summary) {
        const s = WT.config.simulacion;
        const qo = s.qLiquido * (1 - s.corteAgua / 100);
        const rga = (s.qGas * 1e6 * 0.0283168) / (qo * 0.158987);
        this.summary.innerHTML =
          v.st === 2
            ? `Reporte 24 h · Q aceite <b>${U.fmt(qo, 0)} bpd</b> · Q agua <b>${U.fmt(s.qLiquido - qo, 0)} bpd</b> · Q gas <b>${U.fmt(s.qGas, 2)} MMpcd</b> · RGA calc. <b>${U.fmt(rga, 0)} m³/m³</b>`
            : v.st === 1
              ? "Medición en curso: gas y líquido se totalizan en el RTU y regresan a la línea a batería."
              : "Estabilización: el pozo fluye por el separador hasta que presión, temperatura y gasto se asientan.";
      }
    }
    _trend(v, c, series) {
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (!W || !H) return;
      const pr = WT.capture ? 1 : Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(W * pr)) {
        c.width = Math.round(W * pr);
        c.height = Math.round(H * pr);
      }
      const g = c.getContext("2d");
      g.setTransform(pr, 0, 0, pr, 0, 0);
      g.clearRect(0, 0, W, H);
      const span = v.stab + v.dur + 1;
      g.strokeStyle = "rgba(255,255,255,0.07)";
      g.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        g.beginPath();
        g.moveTo(0, (H * i) / 6);
        g.lineTo(W, (H * i) / 6);
        g.stroke();
      }
      // Bandas de estado
      const xs = (h) => (h / span) * W;
      g.fillStyle = "rgba(255,176,32,0.08)";
      g.fillRect(0, 0, xs(v.stab), H);
      g.fillStyle = "rgba(61,220,151,0.06)";
      g.fillRect(xs(v.stab), 0, xs(v.dur), H);
      const tEnd = Math.max(0, Math.min(v.th, span));
      const N = 140;
      series.forEach(([k, col, lo, hi]) => {
        g.strokeStyle = col;
        g.lineWidth = 1.6;
        g.beginPath();
        for (let i = 0; i <= N; i++) {
          const h = (i / N) * tEnd;
          const val = U.clamp(compute(h)[k], lo, hi);
          const y = H - 4 - ((val - lo) / (hi - lo)) * (H - 8);
          if (i === 0) g.moveTo(xs(h), y);
          else g.lineTo(xs(h), y);
        }
        g.stroke();
      });
      g.fillStyle = "#fff";
      g.fillRect(xs(tEnd) - 1, 0, 2, H);
    }
    set visible(b) {
      this.el.style.display = b ? "" : "none";
    }
  }

  /* ----------------------------- Pantalla de la PC (textura 3D) ----------------------------- */
  function drawScreen(g, W, H, v) {
    g.fillStyle = "#07152A";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#13325C";
    g.fillRect(0, 0, W, 64);
    g.fillStyle = "#FFC20E";
    g.font = '700 34px "JetBrains Mono", monospace';
    g.textBaseline = "middle";
    g.fillText(WT.config.sistema.scada, 24, 33);
    g.fillStyle = "#EAF2FA";
    g.font = '600 30px "Barlow Condensed", sans-serif';
    g.fillText(`${WT.config.pozo.nombre.toUpperCase()} · ${WT.config.equipo.seleccionado}`, 220, 33);
    const stC = ["#FFB020", "#3DDC97", "#4CC3F0"];
    STATES.forEach((s, i) => {
      const x = 24 + i * 330;
      g.fillStyle = v.st === i ? stC[i] : "rgba(255,255,255,0.08)";
      g.fillRect(x, 84, 310, 44);
      g.fillStyle = v.st === i ? "#0A2240" : "#7590AE";
      g.font = '700 26px "Barlow Condensed", sans-serif';
      g.fillText(s.toUpperCase(), x + 16, 107);
    });
    const items = [
      ["P. POZO", U.fmt(v.pPozo, 1), "kg/cm²"],
      ["P. SEPARADOR", U.fmt(v.pSep, 1), "kg/cm²"],
      ["P. LÍNEA", U.fmt(v.pLin, 1), "kg/cm²"],
      ["P. BATERÍA", U.fmt(v.pBat, 1), "kg/cm²"],
      ["TEMP.", U.fmt(v.temp, 1), "°C"],
      ["% AGUA", U.fmt(v.wc, 1), "%"],
      ["Q MEZCLA", U.fmt(v.flowing ? v.qLiq : 0, 0), "bpd"],
      ["Q GAS", U.fmt(v.flowing ? v.qGas : 0, 2), "MMpcd"],
    ];
    items.forEach(([k, val, u], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 24 + col * 500;
      const y = 150 + row * 108;
      g.fillStyle = "rgba(76,195,240,0.08)";
      g.fillRect(x, y, 476, 96);
      g.fillStyle = "#AFC3D8";
      g.font = '600 24px "Barlow Condensed", sans-serif';
      g.fillText(k, x + 16, y + 24);
      g.fillStyle = i >= 6 ? "#FFC20E" : "#FFFFFF";
      g.font = '700 46px "JetBrains Mono", monospace';
      g.fillText(val, x + 16, y + 64);
      g.fillStyle = "#AFC3D8";
      g.font = '400 22px "Barlow", sans-serif';
      g.fillText(u, x + 330, y + 66);
    });
  }

  WT.scada = { compute, Panel, drawScreen, STATES, fmtH, T };
})();
