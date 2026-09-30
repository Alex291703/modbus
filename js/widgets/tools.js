/*!
 * Academia Modbus — herramientas: analizador, diagnóstico, examen y glosario.
 */
(function (global) {
  'use strict';
  const MB = global.MB;
  const { h, icon, frameView, segmented, store, copyText, confetti, esc } = MB.ui;
  const W = MB.widgets;

  /* ------------------------------------------------------------------
   * Analizador de tramas
   * ------------------------------------------------------------------ */
  W.analyzer = function (body) {
    const samples = [
      ['Lectura 03 · RTU', 'rtu', '11 03 00 6B 00 03 76 87'],
      ['Respuesta 03 · RTU', 'rtu', MB.toHex(MB.rtuADU(0x11, [0x03, 0x06, 0x02, 0x2b, 0x00, 0x00, 0x00, 0x64]))],
      ['Escritura 16 · TCP', 'tcp', MB.toHex(MB.tcpADU(0x0015, 1, MB.Req.writeRegisters(1, [0x000a, 0x0102])))],
      ['Lectura · ASCII', 'ascii', ':010300000002FA\\r\\n'],
      ['Excepción 02 · RTU', 'rtu', MB.toHex(MB.rtuADU(1, [0x83, 0x02]))],
      ['CRC erróneo · RTU', 'rtu', '01 03 00 00 00 02 C4 0C'],
      ['Identificación · TCP', 'tcp', MB.toHex(MB.tcpADU(3, 255, MB.demoResponse(MB.Req.readDeviceId(1, 0)).pdu))],
    ];
    const st = { mode: 'auto', dir: 'auto' };
    const ta = h('textarea', { id: 'an-input', rows: 3, spellcheck: 'false', autocomplete: 'off', placeholder: 'Pega aquí una trama: 01 03 00 00 00 02 C4 0B' });
    const out = h('div');
    const modeSeg = segmented(
      [
        { value: 'auto', label: 'Detectar' },
        { value: 'rtu', label: 'RTU' },
        { value: 'ascii', label: 'ASCII' },
        { value: 'tcp', label: 'TCP' },
      ],
      'auto',
      (v) => ((st.mode = v), draw()),
      { small: true, label: 'Variante' }
    );
    const dirSeg = segmented(
      [
        { value: 'auto', label: 'Detectar' },
        { value: 'req', label: 'Petición' },
        { value: 'resp', label: 'Respuesta' },
      ],
      'auto',
      (v) => ((st.dir = v), draw()),
      { small: true, label: 'Sentido' }
    );

    function draw() {
      const text = ta.value.trim();
      if (!text) {
        out.replaceChildren(h('p', { class: 'fig-note' }, 'Pega una trama o elige un ejemplo. Acepta hexadecimal con o sin espacios, prefijos 0x y tramas ASCII que empiecen por «:».'));
        return;
      }
      const mode = st.mode === 'auto' ? MB.detectMode(text) : st.mode;
      const res = MB.describeADU(mode, text, st.dir);
      if (res.error) {
        out.replaceChildren(frameView(res));
        return;
      }
      const checks = res.checks.map((c) => h('span', { class: `tag ${c.ok ? 'ok' : 'err'}` }, c.ok ? '✓ ' : '✗ ', c.detail));
      const extras = [];
      if (res.crc && res.crc.rx !== res.crc.calc) {
        const fixed = MB.parseHex(text).slice(0, -2);
        const good = [...fixed, res.crc.calc & 0xff, res.crc.calc >> 8];
        extras.push(
          h(
            'div',
            { class: 'callout warn' },
            h('span', { class: 'callout-tag' }, icon('alert'), 'CRC incorrecto'),
            'Un esclavo descartaría esta trama sin responder. Con el CRC bien calculado sería:',
            h('div', { class: 'btn-row', 'data-copy-root': '' }, h('code', { style: { whiteSpace: 'normal' } }, MB.toHex(good)), h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => copyText(MB.toHex(good), e.currentTarget) }, icon('copy'), 'Copiar'))
          )
        );
      }
      out.replaceChildren(
        h(
          'div',
          { class: 'btn-row', style: { gap: '8px' } },
          h('span', { class: 'tag rw' }, `Modbus ${mode.toUpperCase()}${st.mode === 'auto' ? ' · detectado' : ''}`),
          h('span', { class: 'tag' }, res.dir === 'req' ? 'Petición' : 'Respuesta', st.dir === 'auto' ? ' · deducido' : ''),
          ...checks
        ),
        h('div', { class: 'sumline', style: { display: 'flex', gap: '10px', color: 'var(--fg)', fontSize: '1.05rem' } }, icon(res.ok ? 'check' : 'alert'), MB.summarize(res.unit, res.pdu, res.dir)),
        frameView(res, { animate: true }),
        ...extras
      );
    }
    ta.addEventListener('input', draw);
    body.append(
      MB.ui.field('Trama', ta),
      h('div', { class: 'toolbar' }, h('div', { class: 'field' }, h('label', null, 'Variante'), modeSeg), h('div', { class: 'field' }, h('label', null, 'Sentido'), dirSeg)),
      h(
        'div',
        { class: 'btn-row', style: { gap: '6px' } },
        h('span', { class: 'fig-note', style: { marginRight: '4px' } }, 'Ejemplos:'),
        samples.map(([label, mode, text]) =>
          h(
            'button',
            {
              class: 'btn btn-sm',
              type: 'button',
              onclick: () => {
                ta.value = text;
                st.mode = 'auto';
                modeSeg.setValue('auto');
                draw();
              },
            },
            label
          )
        )
      ),
      out
    );
    const pending = MB.state.analyzerInput;
    if (pending) {
      ta.value = pending.text;
      MB.state.analyzerInput = null;
    } else ta.value = samples[0][2];
    draw();
  };

  /* ------------------------------------------------------------------
   * Diagnóstico guiado
   * ------------------------------------------------------------------ */
  const SYMPTOMS = [
    {
      id: 'timeout',
      icon: 'clock',
      title: 'No responde (timeout)',
      sub: 'El maestro envía y no vuelve nada',
      causes: [
        ['Parámetros serie distintos', 'Velocidad, paridad, bits de datos y de stop deben ser idénticos en todos. 9600 8N1 frente a 19200 8E1 es el clásico.'],
        ['Dirección de esclavo incorrecta', 'Comprueba el ID configurado en el equipo (menú o microinterruptores). Prueba a leer con la función 08 subfunción 00 para confirmar.'],
        ['A y B invertidos', 'Los fabricantes no se ponen de acuerdo en qué es A y qué es B. Intercambiar los dos hilos no daña nada: pruébalo.'],
        ['Convertidor USB-RS485 sin control de dirección', 'Si el adaptador no conmuta solo entre transmitir y recibir, se «pisa» la respuesta. Usa uno con control automático.'],
        ['Timeout demasiado corto', 'Algunos equipos tardan 50–200 ms en contestar. Empieza con 1 s y ajusta.'],
        ['Dos maestros en el mismo bus', 'Un bus serie Modbus admite un único maestro. Dos maestros colisionan.'],
      ],
    },
    {
      id: 'crc',
      icon: 'wave',
      title: 'Errores de CRC',
      sub: 'Llegan respuestas, pero corruptas',
      causes: [
        ['Falta la terminación', '120 Ω en los dos extremos físicos del bus, y solo ahí.'],
        ['Ruido eléctrico', 'Cable de par trenzado apantallado, lejos de cables de potencia y variadores. Pantalla a tierra en un único punto.'],
        ['Sin polarización', 'Sin resistencias de bias, el reposo flota y aparecen bytes fantasma. Actívalas en un solo punto (a menudo, el maestro).'],
        ['Trama partida por el PC', 'Windows o un adaptador USB pueden meter pausas mayores que t1,5 dentro de la trama. Reduce la latencia del puerto COM.'],
        ['Topología en estrella o derivaciones largas', 'RS-485 quiere un bus lineal. Las derivaciones largas generan reflexiones.'],
      ],
    },
    {
      id: 'exc02',
      icon: 'alert',
      title: 'Excepción 02',
      sub: 'Dirección de datos ilegal',
      causes: [
        ['Desfase de uno', 'El manual dice 40001 y hay que pedir la dirección 0. O el manual ya da direcciones de protocolo y estás restando uno de más.'],
        ['Has enviado el prefijo', '40001 no es una dirección de protocolo. En la trama solo va el desplazamiento (0), y la tabla la elige la función.'],
        ['Tabla equivocada', 'El dato está en registros de entrada (04) y lo pides como de retención (03), o al revés.'],
        ['Bloque que atraviesa un hueco', 'Leer 20 registros seguidos falla si en medio hay direcciones no definidas. Divide la lectura.'],
      ],
    },
    {
      id: 'garbage',
      icon: 'table',
      title: 'Valores absurdos',
      sub: 'Llegan datos, pero no cuadran',
      causes: [
        ['Orden de palabras', 'Un float de 32 bits en orden CDAB leído como ABCD da números enormes o minúsculos. Prueba las cuatro combinaciones.'],
        ['Escalado', 'Un 2304 puede ser 230,4 V (×0,1). El manual indica la escala de cada registro.'],
        ['Signo', '65535 sin signo es −1 con signo. Revisa si el registro es int16 o uint16.'],
        ['Registro desplazado', 'Si lees un registro por encima o por debajo, obtienes el dato vecino: suele verse como «casi tiene sentido».'],
      ],
    },
    {
      id: 'exc01',
      icon: 'x',
      title: 'Excepción 01',
      sub: 'Función ilegal',
      causes: [
        ['El equipo no implementa esa función', 'Muchos equipos solo admiten 03, 06 y 16. Consulta la tabla de funciones del manual.'],
        ['Usas 04 en un equipo que lo publica todo en 03', 'Es muy habitual: todo el mapa está en registros de retención.'],
        ['Función de diagnóstico sobre TCP', 'Las funciones 07, 08, 11 y 17 decimal son solo para línea serie.'],
      ],
    },
    {
      id: 'tcp',
      icon: 'network',
      title: 'Fallos en Modbus TCP',
      sub: 'Conexiones rechazadas o cortes',
      causes: [
        ['Unit ID incorrecto en una pasarela', 'Detrás de una pasarela TCP→RTU, el Unit ID es la dirección del esclavo serie. Con 255 no llegará a ninguno.'],
        ['Límite de conexiones', 'Muchos equipos aceptan pocas conexiones TCP simultáneas. Cierra las que no uses o reutiliza una.'],
        ['Cortafuegos', 'El puerto 502 debe estar abierto entre cliente y servidor.'],
        ['RTU sobre TCP frente a Modbus TCP', 'Algunos convertidores envían la trama RTU con CRC dentro de TCP. No es Modbus TCP: los dos extremos deben usar lo mismo.'],
      ],
    },
  ];

  W.troubleshoot = function (body) {
    const out = h('div');
    const btns = {};
    const pick = (id) => {
      const s = SYMPTOMS.find((x) => x.id === id);
      Object.entries(btns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === id)));
      out.replaceChildren(
        h('div', { class: 'panel-title' }, icon('wrench'), `Causas probables, de más a menos frecuente`),
        h(
          'div',
          { class: 'causes' },
          s.causes.map(([t, d], i) => h('div', { class: 'cause', style: { animationDelay: `${i * 60}ms` } }, h('div', null, h('b', null, t), h('p', null, d))))
        )
      );
    };
    body.append(
      h(
        'div',
        { class: 'symptoms' },
        SYMPTOMS.map((s) => {
          const b = h('button', { class: 'tcard', type: 'button', onclick: () => pick(s.id) }, icon(s.icon), h('b', null, s.title), h('small', null, s.sub));
          btns[s.id] = b;
          return b;
        })
      ),
      out
    );
    pick('timeout');
  };

  const PRACTICES = [
    'Documenta el mapa de registros de cada equipo: dirección, tipo, escala, unidades y orden de bytes.',
    'Decide una convención de direcciones (de protocolo o de manual) y úsala en todo el proyecto.',
    'Bus RS-485 lineal, con 120 Ω en los dos extremos y polarización en un único punto.',
    'Cable de par trenzado apantallado; conecta también el común (0 V) entre equipos.',
    'Misma velocidad, paridad y bits de stop en todos los equipos del bus.',
    'Agrupa las lecturas: una petición de 20 registros es mucho más rápida que 20 peticiones de uno.',
    'Ajusta el timeout y los reintentos al equipo más lento del bus.',
    'Escribe valores de 32 bits con la función 16 para que las dos mitades se actualicen a la vez.',
    'Separa la red Modbus TCP de la red de oficina y filtra el puerto 502 en el cortafuegos.',
    'Ten a mano un analizador: un adaptador USB-RS485 y un programa que muestre las tramas en hexadecimal.',
  ];
  W.checklist = function (body) {
    const state = store.get('checklist', {});
    const count = h('b');
    const upd = () => (count.textContent = `${Object.values(state).filter(Boolean).length} de ${PRACTICES.length}`);
    body.append(
      h('div', { class: 'stat-line' }, h('span', null, h('small', null, 'Revisado'), count)),
      h(
        'div',
        { class: 'checklist' },
        PRACTICES.map((p, i) =>
          h(
            'label',
            { for: `chk-${i}` },
            h('input', {
              type: 'checkbox',
              id: `chk-${i}`,
              checked: !!state[i],
              onchange: (e) => {
                state[i] = e.target.checked;
                store.set('checklist', state);
                upd();
              },
            }),
            h('span', null, p)
          )
        )
      )
    );
    upd();
  };

  /* ------------------------------------------------------------------
   * Preguntas: comprobación por lección y examen final
   * ------------------------------------------------------------------ */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const LETTERS = 'ABCD';

  /** Pinta una pregunta. onAnswer(correcta) se llama una sola vez. */
  function question(q, onAnswer, opts = {}) {
    const order = opts.shuffle ? shuffle(q.options.map((_, i) => i)) : q.options.map((_, i) => i);
    const box = h('div', { class: 'q' });
    const optsEl = h('div', { class: 'q-opts' });
    box.append(h('div', { class: 'q-text', html: q.q }), optsEl);
    order.forEach((oi, k) => {
      const b = h(
        'button',
        {
          type: 'button',
          class: 'q-opt',
          onclick: () => {
            const right = oi === q.answer;
            Array.from(optsEl.children).forEach((el) => {
              el.disabled = true;
              if (+el.dataset.oi === q.answer) el.classList.add('right');
            });
            if (!right) b.classList.add('wrong');
            box.append(h('div', { class: 'q-explain', html: `<b>${right ? 'Correcto.' : 'No exactamente.'}</b> ${q.explain}` }));
            onAnswer && onAnswer(right);
          },
          'data-oi': oi,
        },
        h('span', { class: 'q-letter' }, LETTERS[k]),
        h('span', { html: q.options[oi] })
      );
      optsEl.append(b);
    });
    return box;
  }
  MB.ui.question = question;

  /** Bloque «Comprueba lo aprendido» al final de cada lección. */
  MB.ui.checkBlock = function (tag) {
    const qs = (MB.QUIZ || []).filter((q) => q.tag === tag).slice(0, 3);
    if (!qs.length) return null;
    return h('section', { class: 'check-block' }, h('h3', null, icon('target'), 'Comprueba lo aprendido'), qs.map((q) => question(q, null)));
  };

  W.exam = function (body) {
    const N = 15;
    let qs = [];
    let i = 0;
    let score = 0;
    let marks = [];
    const bar = h('div', { class: 'exam-bar' });
    const stage = h('div');
    const best = () => store.get('examBest', null);

    function start() {
      qs = shuffle(MB.QUIZ).slice(0, N);
      i = 0;
      score = 0;
      marks = [];
      next();
    }
    function drawBar() {
      bar.replaceChildren(...qs.map((_, k) => h('span', { class: k < marks.length ? (marks[k] ? 'right' : 'wrong') : k === i ? 'cur' : '' })));
    }
    function next() {
      drawBar();
      if (i >= qs.length) return finish();
      const q = qs[i];
      const nextBtn = h('button', { class: 'btn btn-primary', type: 'button', hidden: true, onclick: () => (i++, next()) }, i === qs.length - 1 ? 'Ver resultado' : 'Siguiente pregunta', icon('right'));
      stage.replaceChildren(
        h('div', { class: 'eyebrow', style: { marginBottom: '12px' } }, `Pregunta ${i + 1} de ${qs.length}`),
        question(
          q,
          (ok) => {
            marks.push(ok);
            if (ok) score++;
            drawBar();
            nextBtn.hidden = false;
            nextBtn.focus({ preventScroll: true });
          },
          { shuffle: true }
        ),
        h('div', { class: 'btn-row', style: { marginTop: '16px', justifyContent: 'flex-end' } }, nextBtn)
      );
    }
    function finish() {
      const pct = Math.round((score / qs.length) * 100);
      const prev = best();
      if (prev == null || pct > prev) store.set('examBest', pct);
      const pass = pct >= 80;
      if (pass) confetti();
      const ring = h('div', { class: 'ring', style: { '--p': pct, '--ring-c': pass ? 'var(--ok)' : pct >= 50 ? 'var(--accent)' : 'var(--err)' } }, h('div', null, h('div', null, h('b', null, `${pct}%`), h('small', null, `${score}/${qs.length}`))));
      const msg = pass
        ? 'Dominas los fundamentos de Modbus. Ya puedes leer un manual de registros, construir tramas y diagnosticar un bus con criterio.'
        : pct >= 50
          ? 'Vas bien. Repasa las lecciones donde fallaste y vuelve a intentarlo: cada intento saca preguntas distintas.'
          : 'Toca repasar. Vuelve a las lecciones de tramas y modelo de datos y prueba otra vez en el laboratorio.';
      stage.replaceChildren(
        h(
          'div',
          { class: 'exam-head' },
          ring,
          h(
            'div',
            null,
            h('h3', { style: { fontSize: '1.5rem' } }, pass ? 'Aprobado' : 'Sigue practicando'),
            h('p', { style: { marginTop: '8px', color: 'var(--fg-2)' } }, msg),
            h('p', { class: 'fig-note', style: { marginTop: '8px' } }, `Mejor resultado: ${Math.max(prev || 0, pct)}%`),
            h('div', { class: 'btn-row', style: { marginTop: '16px' } }, h('button', { class: 'btn btn-primary', type: 'button', onclick: start }, icon('reset'), 'Repetir con otras preguntas'), h('a', { class: 'btn', href: '#laboratorio' }, icon('lab'), 'Ir al laboratorio'))
          )
        )
      );
    }
    const intro = h(
      'div',
      { class: 'exam-head' },
      h('div', { class: 'ring', style: { '--p': best() || 0, '--ring-c': 'var(--ok)' } }, h('div', null, h('div', null, h('b', null, best() != null ? `${best()}%` : '—'), h('small', null, 'MEJOR')))),
      h(
        'div',
        null,
        h('h3', { style: { fontSize: '1.4rem' } }, `${N} preguntas al azar`),
        h('p', { style: { marginTop: '8px', color: 'var(--fg-2)' } }, `Salen de un banco de ${(MB.QUIZ || []).length} preguntas que cubren todo el curso. Cada respuesta se explica al momento. Se aprueba con el 80 %.`),
        h('div', { class: 'btn-row', style: { marginTop: '16px' } }, h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: start }, icon('play'), 'Empezar el examen'))
      )
    );
    stage.append(intro);
    body.append(bar, stage);
  };

  /* ------------------------------------------------------------------
   * Glosario
   * ------------------------------------------------------------------ */
  W.glossary = function (body) {
    const input = h('input', { type: 'search', id: 'gl-q', placeholder: 'Buscar: CRC, MBAP, holding, t3,5…', autocomplete: 'off' });
    const list = h('div', { class: 'gloss-list' });
    const count = h('span', { class: 'fig-note' });
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const mark = (text, q) => {
      if (!q) return esc(text);
      const n = norm(text);
      const i = n.indexOf(q);
      if (i < 0) return esc(text);
      return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    };
    const draw = () => {
      const q = norm(input.value.trim());
      const items = MB.GLOSSARY.filter((g) => !q || norm(`${g.term} ${g.aka || ''} ${g.def}`).includes(q));
      count.textContent = `${items.length} término${items.length === 1 ? '' : 's'}`;
      list.replaceChildren(
        ...(items.length
          ? items.map((g) => h('div', { class: 'gloss', id: `g-${norm(g.term).replace(/[^a-z0-9]+/g, '-')}` }, h('b', { html: mark(g.term, q) }), g.aka ? h('span', { class: 'aka' }, g.aka) : null, h('p', { html: mark(g.def, q) })))
          : [h('p', { class: 'fig-note' }, 'Ningún término coincide. Prueba con otra palabra.')])
      );
    };
    input.addEventListener('input', draw);
    body.append(h('div', { class: 'toolbar' }, h('div', { class: 'field grow' }, h('label', { for: 'gl-q' }, 'Buscar en el glosario'), input), count), list);
    if (MB.state.glossaryQuery) {
      input.value = MB.state.glossaryQuery;
      MB.state.glossaryQuery = null;
    }
    draw();
  };

})(typeof window !== 'undefined' ? window : globalThis);
