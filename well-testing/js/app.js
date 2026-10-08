/* =====================================================================
   Well Testing — navegación entre vistas, carga diferida de escenas y
   modo captura (?capture=proceso|separador|macropera|dti) para exportar
   video e imágenes con tools/render.mjs.
   ===================================================================== */
(function () {
  "use strict";
  const WT = window.WT;
  const U = WT.util;
  const params = new URLSearchParams(location.search);
  const capture = params.get("capture");
  const views = ["inicio", "proceso", "separador", "macropera", "dti"];
  const scenes = {};
  let current = null;

  function fillConfig() {
    document.querySelectorAll("[data-cfg]").forEach((n) => {
      n.textContent = U.get(WT.config, n.dataset.cfg) || "";
    });
  }

  function makeScene(id) {
    if (scenes[id]) return scenes[id];
    const opts = { paused: !!capture };
    if (id === "proceso") {
      scenes[id] = new WT.ProcesoScene(
        document.getElementById("proc-stage"),
        document.getElementById("proc-overlay"),
        capture ? null : document.getElementById("proc-transport"),
        opts,
      );
    } else if (id === "separador" && WT.SeparadorScene) {
      scenes[id] = new WT.SeparadorScene(
        document.getElementById("sep-stage"),
        document.getElementById("sep-overlay"),
        capture ? null : document.getElementById("sep-transport"),
        document.getElementById("sep-side"),
        opts,
      );
    } else if (id === "macropera" && WT.MacroperaScene) {
      scenes[id] = new WT.MacroperaScene(document.getElementById("mac-stage"), document.getElementById("mac-overlay"), document.getElementById("mac-side"), opts);
    } else if (id === "dti" && WT.dti) {
      WT.dti.mount(document.getElementById("dti-root"), { layout: params.get("layout") || "h", capture: !!capture });
      scenes[id] = { activate() {}, deactivate() {} };
    }
    return scenes[id];
  }

  function show(id) {
    if (!views.includes(id)) id = "inicio";
    if (current === id) return;
    if (current && scenes[current]) scenes[current].deactivate();
    current = id;
    document.querySelectorAll(".wt-view").forEach((v) => v.classList.toggle("active", v.dataset.view === id));
    document.querySelectorAll(".wt-tabs a").forEach((a) => {
      if (a.dataset.tab === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (id !== "inicio") {
      // Espera a que la vista tenga tamaño antes de crear el renderizador
      requestAnimationFrame(() => {
        const s = makeScene(id);
        if (s && !capture) s.activate();
      });
    }
    if (!capture) window.scrollTo(0, 0);
  }

  async function boot() {
    fillConfig();
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('700 20px "Barlow Condensed"'),
          document.fonts.load('800 20px "Barlow Condensed"'),
          document.fonts.load('600 20px "Barlow Condensed"'),
          document.fonts.load('400 20px "Barlow"'),
          document.fonts.load('700 20px "JetBrains Mono"'),
        ]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch (e) {
      /* sin fuentes: se usan las del sistema */
    }
    await WT.brand.load();

    if (capture) {
      document.body.classList.add("capture");
      const fmt = params.get("fmt");
      const stage = document.querySelector(`#view-${capture} .wt-stage`);
      if (stage && fmt) stage.dataset.fmt = fmt;
      show(capture);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = makeScene(capture);
      window.__wt = {
        scene: s,
        duration: s && s.constructor && s.constructor.DURATION,
        seek(t) {
          s.renderAt(t);
        },
      };
      document.documentElement.dataset.ready = "1";
      return;
    }

    // En teléfonos en vertical se arranca con el formato 9:16
    if (window.innerWidth < 820 && window.innerHeight > window.innerWidth) {
      document.querySelectorAll("#proc-stage, #sep-stage").forEach((st) => (st.dataset.fmt = "9x16"));
    }
    window.addEventListener("hashchange", () => show(location.hash.slice(1)));
    show(location.hash.slice(1) || "inicio");

    document.getElementById("wt-fullscreen").onclick = toggleFS;
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea")) return;
      if (e.key === "f" || e.key === "F") toggleFS();
      if (e.key === " " && scenes[current] && scenes[current].toggle) {
        e.preventDefault();
        scenes[current].toggle();
      }
    });
  }

  function toggleFS() {
    const el = document.querySelector(`#view-${current} .wt-stage-wrap`) || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
