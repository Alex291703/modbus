/* =====================================================================
   Well Testing · R.B. Tec México — datos editables
   ---------------------------------------------------------------------
   Todo lo que cambia de un aforo a otro (equipo, pozo, tags, valores
   simulados, medidas de la macropera) vive aquí. Las piezas visuales
   (animación, corte, macropera, DTI) leen este objeto; no hace falta
   tocar el resto del código para adaptar el material a otro pozo.

   null  → se muestra como «Por confirmar» en la ficha técnica.
   ===================================================================== */
window.WT = window.WT || {};

WT.config = {
  empresa: {
    nombre: "R.B. Tec México",
    servicio: "Well Testing",
    servicioEs: "Aforo de pozos",
    lema: "Medición confiable en circuito cerrado",
    // Coloca el logo en well-testing/assets/logo.png (fondo transparente).
    // Si no existe se usa el logotipo tipográfico de respaldo.
    logo: "assets/logo.png",
  },

  colores: {
    marino: "#0A2240",
    marino2: "#13325C",
    amarillo: "#FFC20E",
    celeste: "#4CC3F0",
    // Corrientes de proceso (convención de este material)
    mezcla: "#8B5A2B", // café
    gas: "#FFD400", // amarillo
    liquido: "#1C1209", // negro
    liquidoAmbar: "#F29F05", // ámbar
    senal: "#4CC3F0", // señales de instrumentos
  },

  /* ---------------- Equipo de aforo ---------------- */
  equipo: {
    seleccionado: "FA-09",
    opciones: ["FA-06", "FA-08", "FA-09"],
    tipo: "Separador bifásico de circuito cerrado",
    orientacion: "Horizontal", // según foto del equipo
    montaje: "Remolque de doble eje (tándem)",
    // Datos de placa: llenar con la hoja de datos del equipo
    diametro: null, // p. ej. "36 in"
    largo: null, // p. ej. "10 ft S-S"
    presionDiseno: null, // p. ej. "1440 psig"
    temperaturaDiseno: null,
    capacidadLiquido: null,
    capacidadGas: null,
    internos: [
      "Deflector de entrada (placa de choque)",
      "Sección de asentamiento por gravedad",
      "Extractor de niebla",
      "Control de nivel (TN → válvula de líquido)",
      "Válvulas de control de líquido y gas",
    ],
  },

  /* ---------------- Pozo en aforo ---------------- */
  pozo: {
    nombre: "Puerto Ceiba 159",
    macropera: "Macropera Puerto Ceiba",
    cabezal: "CAB PTO. CEIBA 159",
    estrangulador: "1/2 in",
    aparejo: "TP", // TP o TR
    duracionPrueba: 24, // h
  },

  /* ---------------- Instrumentación ----------------
     tag      → nombre usado en campo / SCADA
     isa      → identificación ISA-5.1 equivalente en el DTI
     El significado de cada tag de campo es la interpretación usada en este
     material. Si en sus procedimientos alguno significa otra cosa, cámbielo
     aquí y todas las vistas se actualizan.                                */
  instrumentos: [
    {
      tag: "TDP",
      isa: "PIT-101",
      nombre: "Transmisor de presión en boca de pozo",
      variable: "Presión en boca de pozo",
      unidad: "kg/cm²",
      ubicacion: "Árbol de válvulas, aguas arriba del estrangulador",
      marca: "Endress+Hauser",
      tipo: "presion",
    },
    {
      tag: "TPL",
      isa: "PIT-102",
      nombre: "Transmisor de presión de línea de salida",
      variable: "Presión de línea de salida",
      unidad: "kg/cm²",
      ubicacion: "Línea de entrada al separador, aguas abajo del estrangulador",
      marca: "Endress+Hauser",
      tipo: "presion",
    },
    {
      tag: "TPS",
      isa: "PIT-103",
      nombre: "Transmisor de presión del separador",
      variable: "Presión del separador",
      unidad: "kg/cm²",
      ubicacion: "Cuerpo del separador (zona de gas)",
      marca: "Endress+Hauser",
      tipo: "presion",
      lazo: "PIC-103 → PCV-103 (válvula de control de gas)",
    },
    {
      tag: "TT",
      isa: "TIT-104",
      nombre: "Transmisor de temperatura del separador",
      variable: "Temperatura del separador",
      unidad: "°C",
      ubicacion: "Termopozo en el cuerpo del separador",
      marca: "Endress+Hauser",
      tipo: "temperatura",
    },
    {
      tag: "TN",
      isa: "LIT-105",
      nombre: "Transmisor de nivel del separador",
      variable: "Nivel de líquido",
      unidad: "%",
      ubicacion: "Cámara de nivel en el cabezal del separador",
      marca: "Endress+Hauser",
      tipo: "nivel",
      lazo: "LIC-105 → LCV-105 (válvula de control de líquido)",
    },
    {
      tag: "CORIOLIS",
      isa: "FIT-106",
      nombre: "Medidor másico Coriolis Promass 300",
      variable: "Flujo másico, densidad y % de agua del líquido",
      unidad: "kg/h · g/cm³ · %",
      ubicacion: "Salida de líquido (aceite + agua)",
      marca: "Endress+Hauser",
      tipo: "coriolis",
    },
    {
      tag: "TDG",
      isa: "PDIT-107",
      nombre: "Transmisor de presión diferencial de gas",
      variable: "ΔP en placa de orificio → gasto de gas",
      unidad: "mbar → MMpcd",
      ubicacion: "Salida de gas, tomas de la placa de orificio (FE-107)",
      marca: "Endress+Hauser",
      tipo: "dp",
    },
    {
      tag: "TDM",
      isa: "PIT-108",
      nombre: "Transmisor de presión de línea a batería",
      variable: "Presión de línea a batería",
      unidad: "kg/cm²",
      ubicacion: "Línea de salida hacia batería, después de reincorporar gas y líquido",
      marca: "Endress+Hauser",
      tipo: "presion",
    },
  ],

  sistema: {
    rtu: "Honeywell ControlEdge 2020",
    scada: "SAF-900",
    pc: "PC de medición en campo",
  },

  /* ---------------- Valores para la simulación ----------------
     Ilustrativos. Sirven para que el SCADA simulado muestre lecturas
     coherentes entre sí; no corresponden a un aforo real.              */
  simulacion: {
    presionPozo: 62.5, // kg/cm²
    presionLinea: 13.4,
    presionSeparador: 12.6,
    presionBateria: 11.8,
    temperatura: 52.0, // °C
    qLiquido: 1250, // bpd (aceite + agua)
    corteAgua: 8.5, // %
    qGas: 2.35, // MMpcd
    densidad: 0.842, // g/cm³ (líquido)
    nivel: 50, // %
    horasEstabilizacion: 2,
  },

  /* ---------------- Macropera ----------------
     Coordenadas en metros (x → este, z → sur) con origen en el centro de
     la pera. Estimadas a partir de la imagen satelital; verificar en campo. */
  macropera: {
    ancho: 66, // m (este-oeste)
    largo: 60, // m (norte-sur)
    pozos: [
      { id: "PC-157", nombre: "Puerto Ceiba 157", x: -23.3, z: -16.0 },
      { id: "PC-159", nombre: "Puerto Ceiba 159", x: 15.5, z: -16.4 },
      { id: "PC-103B", nombre: "Puerto Ceiba 103B", x: -17.0, z: 8.2 },
      { id: "P-A", nombre: "Pozo A", x: -18.8, z: -22.9 },
      { id: "P-B", nombre: "Pozo B", x: 6.7, z: -10.7 },
      { id: "P-C", nombre: "Pozo C", x: 18.6, z: -5.4 },
      { id: "P-D", nombre: "Pozo D", x: -18.6, z: -3.4 },
      { id: "P-E", nombre: "Pozo E", x: 4.7, z: 9.0 },
      { id: "P-F", nombre: "Pozo F", x: 12.9, z: 15.8 },
      { id: "P-G", nombre: "Pozo G", x: 20.3, z: 14.4 },
    ],
    pozoEnAforo: "PC-159",
    // Cabezal de recolección (CAB PTO. CEIBA 159), al noreste de la pera
    cabezal: { x: 33.8, z: -35.7, ancho: 15, largo: 12 },
    // Equipo de aforo y caseta: posición propuesta para este material
    separador: { x: 28, z: 0, rot: Math.PI / 2 },
    caseta: { x: 27, z: 23.5, rot: 0 },
    margenSeguridad: 7, // m alrededor de pozo, líneas y separador (aprox.)
  },
};
