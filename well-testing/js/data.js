/* =====================================================================
   Well Testing · R.B. Tec México — FUENTE ÚNICA DE DATOS
   ---------------------------------------------------------------------
   Todas las páginas interactivas, la infografía del DTI y el video leen
   de aquí. Para corregir un tag, un nombre o un dato del separador,
   cámbielo SOLO en este archivo.

   Valores marcados con `confirmar: true` son interpretaciones o
   aproximaciones que deben validarse con el área técnica (ver README).
   Un valor `null` se oculta en todas las vistas hasta que se capture.
   ===================================================================== */
(function () {
  'use strict';
  var WT = (window.WT = window.WT || {});

  WT.data = {
    empresa: {
      nombre: 'R.B. Tec México',
      corto: 'R.B. Tec',
      servicio: 'Well Testing',
      servicioEs: 'Aforo de pozos',
      lema: 'Medición de producción en sitio con separador bifásico de circuito cerrado',
      logo: 'assets/logo-rbtec.svg',
      logoBlanco: 'assets/logo-rbtec-blanco.svg'
    },

    /* Paleta corporativa + colores de corriente (respetar en todas las vistas) */
    colores: {
      marino: '#0b2545',      // azul marino corporativo
      marino900: '#061631',
      marino700: '#13315c',
      amarillo: '#ffc20e',    // amarillo corporativo
      celeste: '#4fb3e8',     // azul claro corporativo
      celeste200: '#a9dcf7',
      // Corrientes de proceso (convención pedida por el cliente)
      mezcla: '#8a5a2b',      // café: mezcla multifásica pozo → separador
      mezclaClaro: '#b9824a',
      gas: '#ffd23f',         // amarillo: gas
      liquido: '#1c140c',     // negro: líquido (aceite + agua)
      liquidoAmbar: '#e8971e',// ámbar: brillo / resalte del líquido
      salida: '#7a5233',      // corriente recombinada hacia batería
      senal: '#4fb3e8'        // líneas de señal / instrumento
    },

    /* Estados de la medición de 24 h (orden fijo) */
    estados: [
      { id: 'estabilizacion', nombre: 'Estabilización', desc: 'Se abre el pozo al separador y se espera a que presión, temperatura y gasto se estabilicen antes de iniciar el conteo.' },
      { id: 'en-curso', nombre: 'En curso', desc: 'Medición continua de 24 h: el SCADA integra los acumulados de mezcla, aceite, agua y gas.' },
      { id: 'finalizado', nombre: 'Finalizado', desc: 'Se cierra el periodo de 24 h, se congelan los acumulados y se emite el reporte de aforo.' }
    ],
    medicion: {
      horasMedicion: 24,
      horasEstabilizacion: 2,   // duración ilustrativa de la etapa de estabilización (confirmar)
      confirmarEstabilizacion: true
    },

    /* Separador bifásico (equipos tipo FA-06 / FA-08 / FA-09) */
    separador: {
      tags: ['FA-06', 'FA-08', 'FA-09'],
      tagDefault: 'FA-06',
      tipo: 'Separador bifásico (gas / líquido)',
      orientacion: 'Horizontal',               // según fotografías de campo
      montaje: 'Remolque (tráiler) de doble eje',
      servicio: 'Hidrocarburo amargo',
      circuito: 'Circuito cerrado: gas y líquido se reincorporan a la línea hacia batería (no se ventea)',
      // Datos de placa visibles en la foto del equipo FA-02 (referencia). Confirmar para FA-06/08/09.
      capacidad: { valor: '0.761 m³ (4.78 bls)', fuente: 'Placa del equipo FA-02 (fotografía)', confirmar: true },
      diametro: null,          // p. ej. '24 in DE'  — capturar
      longitud: null,          // p. ej. '2.6 m S-S' — capturar
      presionDiseno: null,     // p. ej. '1440 psi @ 100 °C' — capturar
      temperaturaDiseno: null,
      nfpa: { salud: 3, inflamabilidad: 2, reactividad: 1 }, // rombo visible en el equipo
      internos: [
        { id: 'deflector', nombre: 'Deflector de entrada', desc: 'Placa de choque frente a la boquilla de entrada: rompe el momento del chorro y produce la separación primaria gas–líquido.' },
        { id: 'asentamiento', nombre: 'Sección de asentamiento por gravedad', desc: 'Volumen donde las gotas de líquido caen y las burbujas de gas suben por diferencia de densidad durante el tiempo de residencia.' },
        { id: 'extractor', nombre: 'Extractor de niebla', desc: 'Malla (mesh pad) junto a la salida de gas: atrapa y coalesce las gotas finas arrastradas, que drenan de regreso al líquido.' },
        { id: 'nivel', nombre: 'Control de nivel', desc: 'El transmisor de nivel (TN) envía la señal al controlador; al subir el nivel abre la válvula de control de líquido.' },
        { id: 'valvulas', nombre: 'Válvulas de control', desc: 'LV en la salida de líquido (control de nivel) y PV en la salida de gas (contrapresión del separador).' }
      ],
      // Accesorios visibles en las fotos del equipo
      accesorios: [
        { id: 'psv', nombre: 'Válvula de seguridad (PSV)', desc: 'Protección por sobrepresión del recipiente (válvula roja en la parte superior).' },
        { id: 'manometro', nombre: 'Manómetro local (PI)', desc: 'Indicación local de presión.' },
        { id: 'registro', nombre: 'Registro hombre / tapa bridada', desc: 'Acceso para inspección en la tapa del recipiente.' }
      ]
    },

    /* Equipos del proceso, en el orden del recorrido del fluido */
    equipos: [
      { id: 'arbol', nombre: 'Árbol de válvulas', desc: 'Cabezal del pozo con válvulas maestras, cruz y válvulas laterales; de aquí sale la producción por TP (tubería de producción) o TR (tubería de revestimiento).' },
      { id: 'estrangulador', nombre: 'Estrangulador TP / TR', desc: 'Restricción calibrada que controla el gasto y la presión de flujo del pozo.' },
      { id: 'manifold', nombre: 'Cabezal / manifold', desc: 'Arreglo de válvulas que alinea la producción del pozo hacia el separador de prueba.' },
      { id: 'lineaEntrada', nombre: 'Línea de entrada', desc: 'Línea temporal que conduce la mezcla multifásica hasta la boquilla del separador.' },
      { id: 'separador', nombre: 'Separador bifásico', desc: 'Separa la mezcla en una corriente de gas y una de líquido (aceite + agua) para medirlas por separado.' },
      { id: 'coriolis', nombre: 'Medidor Coriolis E+H Promass 300', desc: 'En la salida de líquido: mide flujo másico, densidad y % de agua.' },
      { id: 'placa', nombre: 'Placa de orificio + transmisor de presión diferencial E+H', desc: 'En la salida de gas: el diferencial a través de la placa permite calcular el gasto de gas.' },
      { id: 'recombinacion', nombre: 'Reincorporación', desc: 'Gas y líquido medidos se unen de nuevo en la línea de salida (circuito cerrado, sin venteo).' },
      { id: 'lineaBateria', nombre: 'Línea a batería', desc: 'La producción continúa hacia la batería de separación.' },
      { id: 'rtu', nombre: 'RTU Honeywell ControlEdge 2020', desc: 'Concentra las señales de todos los transmisores y el Coriolis.' },
      { id: 'scada', nombre: 'SCADA SAF-900 (PC de campo)', desc: 'Visualiza variables, tendencias, estado de la medición y acumulados.' }
    ],

    /* Instrumentos. `isa` = letras de identificación funcional ISA-5.1
       `tag`  = tag de campo usado por R.B. Tec. La asignación tag ↔ variable
       es una interpretación a partir de las variables reportadas: confirmar. */
    instrumentos: [
      { tag: 'TDP', isa: 'PIT', variable: 'Presión en boca de pozo', punto: 'Árbol de válvulas, aguas arriba del estrangulador', unidad: 'kg/cm²', marca: 'Endress+Hauser', senal: '4–20 mA HART', confirmar: true },
      { tag: 'TPS', isa: 'PIT', variable: 'Presión del separador', punto: 'Domo del separador', unidad: 'kg/cm²', marca: 'Endress+Hauser', senal: '4–20 mA HART', confirmar: true },
      { tag: 'TT', isa: 'TIT', variable: 'Temperatura del separador', punto: 'Termopozo en el separador', unidad: '°C', marca: 'Endress+Hauser', senal: '4–20 mA HART', confirmar: false },
      { tag: 'TN', isa: 'LIT', variable: 'Nivel del separador', punto: 'Separador (control de nivel → LV)', unidad: '%', marca: 'Endress+Hauser', senal: '4–20 mA HART', confirmar: true },
      { tag: 'CORIOLIS', isa: 'FIT', variable: 'Flujo másico, densidad y % agua del líquido', punto: 'Salida de líquido', unidad: 'kg/h · kg/m³ · %', marca: 'Endress+Hauser Promass 300', senal: '4–20 mA HART / Modbus', confirmar: false },
      { tag: 'TDG', isa: 'PDIT', variable: 'Presión diferencial en placa de orificio (gasto de gas)', punto: 'Salida de gas', unidad: 'inH₂O', marca: 'Endress+Hauser', senal: '4–20 mA HART', confirmar: true },
      { tag: 'TDM', isa: 'PIT', variable: 'Presión de la línea de salida (mezcla reincorporada)', punto: 'Línea de salida, después de la reincorporación', unidad: 'kg/cm²', marca: 'Endress+Hauser', senal: '4–20 mA HART', confirmar: true },
      { tag: 'TPL', isa: 'PIT', variable: 'Presión de la línea a batería', punto: 'Línea a batería', unidad: 'kg/cm²', marca: 'Endress+Hauser', senal: '4–20 mA HART', confirmar: true }
    ],

    /* Variables que se reportan (orden del reporte) */
    variables: [
      { id: 'pPozo', nombre: 'Presión en boca de pozo', tag: 'TDP', unidad: 'kg/cm²' },
      { id: 'pSep', nombre: 'Presión del separador', tag: 'TPS', unidad: 'kg/cm²' },
      { id: 'pSalida', nombre: 'Presión línea de salida', tag: 'TDM', unidad: 'kg/cm²' },
      { id: 'pBateria', nombre: 'Presión línea a batería', tag: 'TPL', unidad: 'kg/cm²' },
      { id: 'tSep', nombre: 'Temperatura del separador', tag: 'TT', unidad: '°C' },
      { id: 'pctAgua', nombre: '% Agua', tag: 'CORIOLIS', unidad: '%' },
      { id: 'pctAceite', nombre: '% Aceite', tag: 'CORIOLIS', unidad: '%' },
      { id: 'qMezcla', nombre: 'Q mezcla (líquido)', tag: 'CORIOLIS', unidad: 'bpd' },
      { id: 'qAceite', nombre: 'Q aceite', tag: 'CORIOLIS', unidad: 'bpd' },
      { id: 'qAgua', nombre: 'Q agua', tag: 'CORIOLIS', unidad: 'bpd' },
      { id: 'qGas', nombre: 'Q gas', tag: 'TDG', unidad: 'MMpcd' }
    ],

    /* Valores de demostración para el SCADA simulado (NO son datos reales de un pozo) */
    demo: {
      aviso: 'Valores simulados con fines ilustrativos',
      pPozo: 42.5,     // kg/cm²
      pSep: 7.8,       // kg/cm²
      pSalida: 7.1,    // kg/cm²
      pBateria: 6.6,   // kg/cm²
      tSep: 46.0,      // °C
      pctAgua: 14.0,   // %
      qMezcla: 980,    // bpd de líquido (aceite + agua)
      qGas: 1.35,      // MMpcd
      densidad: 868    // kg/m³ del líquido
    },

    /* Macropera: medidas APROXIMADAS (sin croquis del cliente). Metros.
       Sistema: x = este, z = sur, origen = pozo en prueba. */
    macropera: {
      confirmar: true,
      nota: 'Distribución y medidas aproximadas con fines ilustrativos; ajustar con el croquis de la locación.',
      plataforma: { x0: -46, x1: 56, z0: -34, z1: 34 },       // 102 × 68 m
      pozos: [ { id: 'prueba', x: 0, z: 0, enPrueba: true }, { id: 'p2', x: -12, z: 0 }, { id: 'p3', x: -24, z: 0 }, { id: 'p4', x: -36, z: 0 } ],
      manifold: { x: 6, z: 7 },
      separador: { x: 20, z: 13, rot: 0 },       // centro del remolque; eje largo en x
      caseta: { x: 40, z: 25, rot: 0 },          // caseta de medición / PC SCADA
      rtu: { x: 35, z: 22 },
      lineaBateria: { desdeX: 34, z: -6, haciaX: 56 }, // sale por el lindero este
      zonaSeguridad: { x0: -7, x1: 31, z0: -7, z1: 21 }, // perímetro con cinta y conos
      acceso: { puntos: [[70, 30], [56, 30], [48, 30], [46, 24]] },
      puntoReunion: { x: 46, z: -24 },
      mangaViento: { x: -40, z: -28 },
      distancias: [
        { de: 'arbol', a: 'separador', m: 24, confirmar: true },
        { de: 'separador', a: 'caseta', m: 23, confirmar: true }
      ]
    },

    /* Pasos del corte interno del separador (entregable 2) */
    pasosSeparacion: [
      { n: 1, id: 'choque', titulo: 'Choque contra el deflector', texto: 'La mezcla entra a alta velocidad y golpea el deflector: pierde momento y ocurre la separación primaria del gas y el líquido.' },
      { n: 2, id: 'liberacion', titulo: 'Caída de presión y liberación de gas', texto: 'Al pasar del estrangulador y la línea al volumen del separador, la presión baja y el gas disuelto se libera en forma de burbujas.' },
      { n: 3, id: 'asentamiento', titulo: 'Asentamiento por gravedad', texto: 'Con baja velocidad y tiempo de residencia, las gotas de líquido caen y las burbujas suben por diferencia de densidad.' },
      { n: 4, id: 'niebla', titulo: 'Extractor de niebla', texto: 'Las gotas finas que arrastra el gas chocan con la malla, se unen (coalescen) y escurren de regreso al líquido.' },
      { n: 5, id: 'nivel', titulo: 'Control de nivel', texto: 'El TN detecta que el nivel sube; el controlador abre la válvula de líquido (LV) y el líquido sale hacia el medidor Coriolis.' },
      { n: 6, id: 'gas', titulo: 'Salida de gas por arriba', texto: 'El gas seco sale por la boquilla superior hacia la placa de orificio; la válvula de presión (PV) mantiene la presión del separador.' }
    ]
  };

  /* Utilidades compartidas */
  WT.util = {
    instrumento: function (tag) {
      for (var i = 0; i < WT.data.instrumentos.length; i++) if (WT.data.instrumentos[i].tag === tag) return WT.data.instrumentos[i];
      return null;
    },
    equipo: function (id) {
      for (var i = 0; i < WT.data.equipos.length; i++) if (WT.data.equipos[i].id === id) return WT.data.equipos[i];
      return null;
    },
    // PRNG determinista (mulberry32) para partículas y texturas reproducibles
    rng: function (seed) {
      var a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    smooth: function (t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
    fmt: function (v, dec) { return Number(v).toLocaleString('es-MX', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  };
})();
