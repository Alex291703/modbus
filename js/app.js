/*!
 * Academia Modbus — aplicación: estructura, navegación, progreso y búsqueda.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const { h, icon, store, toast, $, $$ } = MB.ui;

  const LESSONS = MB.LESSONS;
  LESSONS.forEach((l, i) => (l.num = i + 1));
  const byId = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
  const moduleOf = {};
  MB.MODULES.forEach((m) => m.lessons.forEach((id) => (moduleOf[id] = m)));
  const COUNTED = LESSONS.filter((l) => !l.noProgress);
  const root = document.documentElement;
  const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 15.5h3v-7h4.5v7h4v-7h4.5v7h3"/></svg>';

  let cleanups = [];

  /* ---------------- Tema ---------------- */
  const mqLight = global.matchMedia ? global.matchMedia('(prefers-color-scheme: light)') : null;
  const effectiveDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : !(mqLight && mqLight.matches));
  function applyTheme() {
    root.classList.toggle('is-dark', effectiveDark());
    const b = $('.theme-btn');
    if (b) b.title = effectiveDark() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  }
  function toggleTheme() {
    const next = effectiveDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    store.set('theme', next);
    applyTheme();
  }
  const savedTheme = store.get('theme', null);
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;
  if (mqLight && mqLight.addEventListener) mqLight.addEventListener('change', applyTheme);

  /* ---------------- Progreso ---------------- */
  const doneMap = () => store.get('done', {});
  function setDone(id, v) {
    const d = doneMap();
    if (v) d[id] = true;
    else delete d[id];
    store.set('done', d);
    renderProgress();
  }

  /* ---------------- Estructura ---------------- */
  const progressNum = h('b');
  const progressBar = h('span');
  const nav = h('nav', { class: 'nav', 'aria-label': 'Lecciones' });
  let resetArmed = false;
  const resetBtn = h(
    'button',
    {
      class: 'btn btn-sm btn-ghost',
      type: 'button',
      onclick: () => {
        if (!resetArmed) {
          resetArmed = true;
          resetBtn.textContent = 'Pulsa otra vez para borrar';
          setTimeout(() => {
            resetArmed = false;
            resetBtn.textContent = 'Reiniciar progreso';
          }, 3000);
          return;
        }
        store.set('done', {});
        store.set('challenges', {});
        store.set('examBest', null);
        store.set('checklist', {});
        resetArmed = false;
        resetBtn.textContent = 'Reiniciar progreso';
        toast('Progreso borrado', 'ok');
        route();
      },
    },
    'Reiniciar progreso'
  );
  const sidebar = h(
    'aside',
    { class: 'sidebar', id: 'sidebar', 'aria-label': 'Índice del curso' },
    h('a', { class: 'brand', href: '#inicio' }, h('span', { class: 'brand-mark', html: LOGO }), h('span', { class: 'brand-txt' }, h('b', null, 'Academia Modbus'), h('small', null, 'RTU · ASCII · TCP/IP'))),
    h('div', { class: 'progress-card' }, h('div', { class: 'progress-row' }, h('span', null, 'Tu progreso'), progressNum), h('div', { class: 'meter-bar' }, progressBar)),
    nav,
    h('div', { class: 'sidebar-foot' }, h('span', null, 'Especificación v1.1b3'), resetBtn)
  );

  function buildNav() {
    const d = doneMap();
    nav.replaceChildren(
      h('a', { href: '#inicio', 'data-id': 'inicio' }, h('span', { class: 'nav-num' }, icon('home')), h('span', null, 'Inicio'), h('span')),
      ...MB.MODULES.map((m) =>
        h(
          'div',
          { class: 'nav-group' },
          h('div', { class: 'nav-group-title' }, m.title),
          m.lessons.map((id) => {
            const l = byId[id];
            return h(
              'a',
              { href: `#${id}`, 'data-id': id, class: d[id] ? 'done' : '' },
              h('span', { class: 'nav-num' }, String(l.num).padStart(2, '0')),
              h('span', null, l.short || l.title),
              icon('check', 'nav-done')
            );
          })
        )
      )
    );
  }
  function renderProgress() {
    const d = doneMap();
    const n = COUNTED.filter((l) => d[l.id]).length;
    progressNum.textContent = `${n} / ${COUNTED.length}`;
    progressBar.parentElement.style.setProperty('--p', `${(n / COUNTED.length) * 100}%`);
    $$('a[data-id]', nav).forEach((a) => a.classList.toggle('done', !!d[a.dataset.id]));
  }

  const crumbs = h('div', { class: 'crumbs' });
  const themeBtn = h('button', { class: 'icon-btn theme-btn', type: 'button', 'aria-label': 'Cambiar tema', onclick: toggleTheme }, icon('sun', 'ic-sun'), icon('moon', 'ic-moon'));
  const topbar = h(
    'header',
    { class: 'topbar' },
    h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'Abrir el índice', 'aria-controls': 'sidebar', onclick: () => document.body.classList.toggle('nav-open') }, icon('menu')),
    crumbs,
    h('span', { class: 'spacer' }),
    h('button', { class: 'search-btn', type: 'button', onclick: openPalette, 'aria-label': 'Buscar' }, icon('search'), h('span', { class: 'label' }, 'Buscar lecciones y términos'), h('kbd', null, 'Ctrl K')),
    themeBtn
  );
  const view = h('main', { class: 'view', id: 'view', tabindex: '-1' });
  const appEl = h('div', { class: 'app' }, sidebar, h('div', { class: 'main' }, topbar, view));
  const scrim = h('div', { class: 'scrim', onclick: () => document.body.classList.remove('nav-open') });

  /* ---------------- Figuras ---------------- */
  function mountWidgets(scope, num) {
    let k = 0;
    $$('[data-widget]', scope).forEach((el) => {
      const name = el.dataset.widget;
      const fn = MB.widgets[name];
      let body;
      if (el.hasAttribute('data-plain')) {
        body = h('div', { class: 'plain-widget' });
        el.replaceWith(body);
      } else {
        k++;
        body = h('div', { class: 'fig-body' });
        el.replaceWith(
          h(
            'figure',
            { class: 'fig' },
            h(
              'figcaption',
              { class: 'fig-head' },
              h('span', { class: 'fig-num' }, `Fig. ${num}.${k}`),
              h('span', { class: 'fig-title' }, el.dataset.title || ''),
              el.hasAttribute('data-static') ? null : h('span', { class: 'fig-live' }, 'Interactivo')
            ),
            body
          )
        );
      }
      try {
        const cleanup = fn ? fn(body, el.dataset) : null;
        if (typeof cleanup === 'function') cleanups.push(cleanup);
        if (!fn) throw new Error(`Figura desconocida: ${name}`);
      } catch (e) {
        console.error(e);
        body.append(h('div', { class: 'frame-error' }, icon('alert'), 'No se pudo cargar esta figura.'));
      }
    });
  }

  /* ---------------- Portada ---------------- */
  function renderHome() {
    const d = doneMap();
    const next = COUNTED.find((l) => !d[l.id]) || LESSONS[0];
    const started = COUNTED.some((l) => d[l.id]);
    const liveBody = h('div', { class: 'fig-body' });
    const page = h(
      'div',
      { class: 'home view-anim' },
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          { class: 'hero-copy' },
          h('div', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Curso interactivo · RTU · ASCII · TCP/IP'),
          h('h1', { class: 'hero-title' }, 'Modbus, desde el ', h('span', { class: 'nowrap' }, h('span', { class: 'wave' }, 'primer bit'), '.')),
          h(
            'p',
            { class: 'hero-lead' },
            'Aprende cómo se comunican PLCs, variadores y medidores: tramas, registros, CRC y diagnóstico. Cada concepto trae una figura que puedes manipular, y un laboratorio donde tú eres el maestro del bus.'
          ),
          h(
            'div',
            { class: 'btn-row hero-cta' },
            h('a', { class: 'btn btn-primary btn-lg', href: `#${next.id}` }, started ? `Continuar: ${next.short || next.title}` : 'Empezar la lección 1', icon('right')),
            h('a', { class: 'btn btn-lg', href: '#laboratorio' }, icon('lab'), 'Abrir el laboratorio')
          )
        ),
        h(
          'figure',
          { class: 'fig hero-live', style: { margin: 0 } },
          h('figcaption', { class: 'fig-head' }, h('span', { class: 'fig-num' }, 'En vivo'), h('span', { class: 'fig-title' }, 'Bus RS-485 · Modbus RTU'), h('span', { class: 'fig-live' }, 'Transmitiendo')),
          liveBody
        )
      ),
      h(
        'div',
        { class: 'facts' },
        [
          ['1979', 'Año en que Modicon publicó Modbus'],
          ['247', 'Esclavos direccionables en un bus serie'],
          ['256', 'Bytes como máximo en una trama RTU'],
          ['502', 'Puerto TCP de Modbus TCP'],
        ].map(([b, s]) => h('div', { class: 'fact' }, h('b', null, b), h('span', null, s)))
      ),
      h(
        'div',
        { class: 'section-head' },
        h('div', null, h('h2', null, 'Ruta de aprendizaje'), h('p', null, `${LESSONS.length} lecciones en ${MB.MODULES.length} módulos, de los fundamentos al diagnóstico. Tu progreso se guarda en este navegador.`))
      ),
      h(
        'div',
        { class: 'roadmap' },
        MB.MODULES.map((m) => {
          const mins = m.lessons.reduce((a, id) => a + byId[id].minutes, 0);
          return h(
            'div',
            { class: 'module' },
            h('div', { class: 'module-head' }, h('span', { class: 'module-ic' }, icon(m.icon)), h('div', null, h('b', null, m.title), h('small', null, `${m.lessons.length} ${m.lessons.length === 1 ? 'lección' : 'lecciones'} · ${mins} min`))),
            m.lessons.map((id) => {
              const l = byId[id];
              return h(
                'a',
                { href: `#${id}`, class: d[id] ? 'done' : '' },
                h('span', { class: 'num' }, d[id] ? '✓' : String(l.num).padStart(2, '0')),
                h('span', null, l.short || l.title),
                icon('right', 'go')
              );
            })
          );
        })
      ),
      h('div', { class: 'section-head' }, h('div', null, h('h2', null, 'Herramientas de trabajo'), h('p', null, 'Úsalas también fuera del curso, cuando tengas un equipo delante.'))),
      h(
        'div',
        { class: 'cards-4' },
        [
          ['lab', 'Laboratorio', 'Tres esclavos simulados, RTU, ASCII y TCP, fallos y ruido.', 'laboratorio', 'var(--f-fc)'],
          ['scan', 'Analizador de tramas', 'Pega una trama y obtén cada campo y su CRC.', 'analizador', 'var(--f-addr)'],
          ['chip', 'Calculadora de CRC', 'El CRC-16 calculado bit a bit, con animación.', 'crc', 'var(--f-crc)'],
          ['layers', 'Conversor de tipos', 'float32, int32 y los cuatro órdenes de bytes.', 'tipos', 'var(--f-reg)'],
        ].map(([ic, t, s, id, c]) => h('a', { class: 'tcard', href: `#${id}`, style: { '--c': c, textDecoration: 'none' } }, h('span', { style: { color: c } }, icon(ic)), h('b', null, t), h('small', null, s)))
      )
    );
    view.replaceChildren(page);
    const c = MB.widgets.heroLive(liveBody);
    if (c) cleanups.push(c);
    setCrumbs(null);
    document.title = 'Academia Modbus';
  }

  /* ---------------- Lección ---------------- */
  function renderLesson(l) {
    const m = moduleOf[l.id];
    const d = doneMap();
    const idx = LESSONS.indexOf(l);
    const prev = LESSONS[idx - 1];
    const next = LESSONS[idx + 1];
    const art = h('article', { class: `lesson${l.wide ? ' lesson-wide' : ''} view-anim` });
    const figs = (l.html.match(/data-widget=/g) || []).length;
    art.append(
      h(
        'header',
        { class: 'lesson-head' },
        h('div', { class: 'eyebrow' }, h('span', { class: 'dot' }), `${m.title} · Lección ${l.num} de ${LESSONS.length}`),
        h('h1', null, l.title),
        h('p', { class: 'lesson-lead' }, l.lead),
        h(
          'div',
          { class: 'lesson-meta' },
          h('span', null, icon('clock'), `${l.minutes} min`),
          figs && !l.noCheck ? h('span', null, icon('bolt'), `${figs} ${figs === 1 ? 'figura interactiva' : 'figuras interactivas'}`) : null,
          d[l.id] ? h('span', { style: { color: 'var(--ok)' } }, icon('check'), 'Completada') : null
        )
      )
    );
    const prose = h('div', { class: 'prose', html: l.html });
    let k = 0;
    $$('h2', prose).forEach((h2) => {
      k++;
      h2.id = `s${k}`;
      h2.prepend(h('span', { class: 'sec' }, `${l.num}.${k}`));
    });
    const CALLOUT_ICON = { key: 'bolt', warn: 'alert', info: 'wrench', ok: 'check' };
    $$('.callout', prose).forEach((c) => {
      const kind = Object.keys(CALLOUT_ICON).find((x) => c.classList.contains(x));
      const tag = $('.callout-tag', c);
      if (tag) tag.prepend(icon(CALLOUT_ICON[kind] || 'bolt'));
    });
    art.append(prose);

    if (l.summary && l.summary.length) {
      art.append(h('section', { class: 'summary' }, h('h3', null, icon('book'), 'Lo esencial'), h('ul', null, l.summary.map((s) => h('li', null, icon('check'), h('span', null, s))))));
    }
    if (!l.noCheck) {
      const cb = MB.ui.checkBlock(l.id);
      if (cb) art.append(cb);
    }
    const footItems = [];
    footItems.push(prev ? h('a', { class: 'nav-card', href: `#${prev.id}` }, h('small', null, '← Anterior'), h('b', null, prev.short || prev.title)) : h('a', { class: 'nav-card', href: '#inicio' }, h('small', null, '← Volver'), h('b', null, 'Inicio')));
    if (!l.noProgress) {
      const btn = h('button', { class: `btn ${d[l.id] ? '' : 'btn-primary'}`, type: 'button' });
      const paint = () => {
        const isDone = !!doneMap()[l.id];
        btn.className = `btn ${isDone ? '' : 'btn-primary'}`;
        btn.replaceChildren(icon('check'), isDone ? 'Completada' : 'Marcar como completada');
      };
      btn.addEventListener('click', () => {
        const isDone = !!doneMap()[l.id];
        setDone(l.id, !isDone);
        paint();
        if (!isDone) toast(next ? `Lección completada. Siguiente: ${next.short || next.title}` : '¡Curso completado!', 'ok');
      });
      paint();
      footItems.push(btn);
    }
    if (next) footItems.push(h('a', { class: 'nav-card next', href: `#${next.id}` }, h('small', null, 'Siguiente →'), h('b', null, next.short || next.title)));
    art.append(h('nav', { class: 'lesson-foot', 'aria-label': 'Navegación entre lecciones' }, footItems));

    view.replaceChildren(art);
    mountWidgets(prose, l.num);
    setCrumbs(l);
    document.title = `${l.title} · Academia Modbus`;
  }

  function setCrumbs(l) {
    if (!l) {
      crumbs.replaceChildren(h('b', null, 'Inicio'));
      return;
    }
    crumbs.replaceChildren(h('span', null, moduleOf[l.id].title), h('span', { class: 'sep' }, '›'), h('b', null, l.short || l.title));
  }

  /* ---------------- Enrutado ---------------- */
  function route() {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        /* ignorar */
      }
    });
    cleanups = [];
    const id = decodeURIComponent(location.hash.slice(1)) || 'inicio';
    const l = byId[id];
    if (l) renderLesson(l);
    else renderHome();
    $$('a[data-id]', nav).forEach((a) => {
      if (a.dataset.id === (l ? l.id : 'inicio')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const cur = $('a[aria-current="page"]', nav);
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    document.body.classList.remove('nav-open');
    global.scrollTo({ top: 0, behavior: 'instant' });
  }

  /* ---------------- Paleta de búsqueda ---------------- */
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function paletteItems() {
    const items = [];
    items.push({ kind: 'Página', icon: 'home', title: 'Inicio', sub: 'Portada y ruta de aprendizaje', go: () => (location.hash = '#inicio') });
    LESSONS.forEach((l) =>
      items.push({ kind: `Lección ${l.num}`, icon: moduleOf[l.id].icon, title: l.title, sub: l.lead, go: () => (location.hash = `#${l.id}`) })
    );
    Object.entries(MB.FUNCTIONS).forEach(([k, f]) => {
      if (!MB.FC_DOC || !MB.FC_DOC[k]) return;
      items.push({ kind: 'Función', icon: 'chip', title: `0x${MB.hex2(+k)} · ${f.name}`, sub: f.es, go: () => (location.hash = '#funciones') });
    });
    Object.entries(MB.EXCEPTIONS).forEach(([k, e]) => items.push({ kind: 'Excepción', icon: 'alert', title: `${MB.hex2(+k)} · ${e.name}`, sub: e.es, go: () => (location.hash = '#excepciones') }));
    (MB.GLOSSARY || []).forEach((g) =>
      items.push({
        kind: 'Glosario',
        icon: 'book',
        title: g.term,
        sub: g.def,
        go: () => {
          MB.state.glossaryQuery = g.term;
          if (location.hash === '#glosario') route();
          else location.hash = '#glosario';
        },
      })
    );
    items.push({ kind: 'Acción', icon: 'sun', title: 'Cambiar tema claro/oscuro', sub: 'Alterna la paleta de colores', go: toggleTheme });
    return items;
  }
  function openPalette() {
    if ($('.palette-back')) return;
    const all = paletteItems();
    let sel = 0;
    let shown = [];
    const input = h('input', { type: 'text', id: 'palette-q', placeholder: 'Busca una lección, función, excepción o término…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Buscar' });
    const list = h('div', { class: 'palette-list', role: 'listbox' });
    const close = () => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const choose = (it) => {
      close();
      it.go();
    };
    const draw = () => {
      const q = norm(input.value.trim());
      shown = (q ? all.filter((it) => norm(`${it.title} ${it.sub} ${it.kind}`).includes(q)) : all.filter((it) => it.kind !== 'Glosario' && it.kind !== 'Excepción')).slice(0, 40);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.replaceChildren(
        ...(shown.length
          ? shown.map((it, i) =>
              h(
                'div',
                { class: `palette-item${i === sel ? ' sel' : ''}`, role: 'option', 'aria-selected': String(i === sel), onclick: () => choose(it), onmousemove: () => i !== sel && ((sel = i), draw()) },
                icon(it.icon),
                h('div', null, h('b', null, it.title), h('small', null, it.sub)),
                h('span', { class: 'kind' }, it.kind)
              )
            )
          : [h('div', { class: 'palette-empty' }, 'Sin resultados. Prueba con «CRC», «MBAP» o «40001».')])
      );
      const cur = list.children[sel];
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sel = Math.min(shown.length - 1, sel + 1);
        draw();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        sel = Math.max(0, sel - 1);
        draw();
      } else if (e.key === 'Enter' && shown[sel]) {
        e.preventDefault();
        choose(shown[sel]);
      }
    };
    const back = h(
      'div',
      { class: 'palette-back', onclick: (e) => e.target === back && close() },
      h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Búsqueda' }, h('div', { class: 'palette-input' }, icon('search'), input, h('kbd', null, 'Esc')), list)
    );
    input.addEventListener('input', () => {
      sel = 0;
      draw();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    draw();
    input.focus();
  }

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape') {
      document.body.classList.remove('nav-open');
    }
  });

  /* ---------------- Arranque ---------------- */
  function start() {
    const host = document.getElementById('app') || document.body;
    host.replaceChildren(appEl, scrim);
    buildNav();
    renderProgress();
    applyTheme();
    global.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
