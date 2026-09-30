/*!
 * Academia Modbus — planta simulada para el laboratorio.
 * Tres esclavos con mapas de registros realistas y un poco de física
 * para que los valores cambien con el tiempo.
 */
(function (global) {
  'use strict';
  const MB = global.MB;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const noise = (amp) => (Math.random() * 2 - 1) * amp;

  function writeFloat(server, addr, value) {
    const [hi, lo] = MB.encodeValue(value, 'float32', 'ABCD');
    server.input[addr] = hi;
    server.input[addr + 1] = lo;
  }

  function createPlant() {
    /* ---------------- Esclavo 1: PLC ---------------- */
    const plc = new MB.Server({
      sizes: { coils: 16, discrete: 16, input: 16, holding: 16 },
      supports: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x08, 0x0f, 0x10, 0x16, 0x17, 0x2b],
      info: { vendor: 'Academia Modbus', product: 'PLC-24 E/S', revision: 'v2.1' },
      validate: (t, a, v) => (a === 4 && v > 1 ? 0x03 : 0),
    });
    plc.holding.set([250, 500, 1500, 120, 1]);
    plc.input.set([231, 245, 620, 0, 0]);
    plc.discrete.set([0, 0, 0, 1, 0, 0, 1]);
    const plcState = { temp: 23.1, level: 62, speed: 0, pieces: 0, acc: 0 };

    /* ---------------- Esclavo 2: variador ---------------- */
    const vfd = new MB.Server({
      sizes: { holding: 8, input: 8 },
      supports: [0x03, 0x04, 0x06, 0x08, 0x10, 0x16, 0x17, 0x2b],
      info: { vendor: 'Academia Modbus', product: 'VF-7 Variador', revision: 'v1.4' },
      validate: (t, a, v) => {
        if (a === 1 && v > 6000) return 0x03; // máx. 60,00 Hz
        if ((a === 2 || a === 3) && (v < 5 || v > 600)) return 0x03; // rampas 0,5–60 s
        return 0;
      },
    });
    vfd.holding.set([0, 5000, 50, 50]);
    vfd.input.set([0, 0, 540, 31, 0, 0]);
    const vfdState = { f: 0, temp: 31 };

    /* ---------------- Esclavo 3: medidor de energía ---------------- */
    const meter = new MB.Server({
      sizes: { holding: 4, input: 16 },
      supports: [0x03, 0x04, 0x06, 0x08, 0x2b],
      info: { vendor: 'Academia Modbus', product: 'EM-3 Medidor', revision: 'v3.0' },
      validate: (t, a, v) => (a === 2 ? 0x03 : a === 0 && (v < 5 || v > 5000) ? 0x03 : 0),
    });
    meter.holding.set([100, 15, 3, 0]);
    const meterState = { v: 230.4, i: 12.5, pf: 0.92, hz: 50.0, kwh: 1834.2 };

    const devices = [
      {
        id: 1,
        name: 'PLC de línea',
        model: 'PLC-24 E/S',
        kind: 'plc',
        ip: '192.168.1.11',
        server: plc,
        online: true,
        labels: {
          coils: {
            0: { name: 'Motor de la cinta' },
            1: { name: 'Válvula de llenado' },
            2: { name: 'Piloto verde' },
            3: { name: 'Piloto rojo' },
            4: { name: 'Sirena' },
            5: { name: 'Extractor' },
          },
          discrete: {
            0: { name: 'Sensor de presencia' },
            1: { name: 'Pulsador de marcha' },
            2: { name: 'Pulsador de paro' },
            3: { name: 'Seta de emergencia OK' },
            4: { name: 'Nivel alto del depósito' },
            5: { name: 'Nivel bajo del depósito' },
            6: { name: 'Puerta cerrada' },
          },
          input: {
            0: { name: 'Temperatura del producto', scale: 0.1, unit: '°C' },
            1: { name: 'Presión de línea', scale: 0.01, unit: 'bar' },
            2: { name: 'Nivel del depósito', scale: 0.1, unit: '%' },
            3: { name: 'Piezas producidas', unit: 'uds' },
            4: { name: 'Velocidad de la cinta', scale: 0.1, unit: 'm/min' },
          },
          holding: {
            0: { name: 'Consigna de temperatura', scale: 0.1, unit: '°C' },
            1: { name: 'Objetivo de producción', unit: 'uds' },
            2: { name: 'Tiempo de llenado', unit: 'ms' },
            3: { name: 'Consigna de velocidad', scale: 0.1, unit: 'm/min' },
            4: { name: 'Modo (0 manual · 1 auto)' },
          },
        },
        tick(dt) {
          const s = plcState;
          const motor = plc.coils[0], valve = plc.coils[1];
          const target = motor ? plc.holding[3] / 10 : 0;
          s.speed += clamp(target - s.speed, -4 * dt, 4 * dt);
          s.acc += (s.speed / 60) * dt * 3;
          if (s.acc >= 1) {
            s.acc -= 1;
            s.pieces = (s.pieces + 1) & 0xffff;
            plc.discrete[0] = 1;
          } else if (s.acc > 0.4) plc.discrete[0] = 0;
          s.level = clamp(s.level + (valve ? 3.2 : 0) * dt - (motor ? 1.1 : 0.15) * dt, 0, 100);
          s.temp += ((plc.holding[0] / 10 - s.temp) * 0.05 + noise(0.08)) * dt * 2;
          plc.input[0] = Math.round(clamp(s.temp, -50, 150) * 10) & 0xffff;
          plc.input[1] = Math.round((2.45 + (motor ? 0.4 : 0) + noise(0.03)) * 100);
          plc.input[2] = Math.round(s.level * 10);
          plc.input[3] = s.pieces;
          plc.input[4] = Math.round(s.speed * 10);
          plc.discrete[4] = s.level > 90 ? 1 : 0;
          plc.discrete[5] = s.level < 10 ? 1 : 0;
        },
      },
      {
        id: 2,
        name: 'Variador',
        model: 'VF-7 · 7,5 kW',
        kind: 'vfd',
        ip: '192.168.1.12',
        server: vfd,
        online: true,
        labels: {
          holding: {
            0: { name: 'Palabra de control (bit 0 marcha)', bits: true },
            1: { name: 'Frecuencia de referencia', scale: 0.01, unit: 'Hz' },
            2: { name: 'Rampa de aceleración', scale: 0.1, unit: 's' },
            3: { name: 'Rampa de deceleración', scale: 0.1, unit: 's' },
          },
          input: {
            0: { name: 'Frecuencia de salida', scale: 0.01, unit: 'Hz' },
            1: { name: 'Corriente del motor', scale: 0.1, unit: 'A' },
            2: { name: 'Tensión del bus CC', unit: 'V' },
            3: { name: 'Temperatura del radiador', unit: '°C' },
            4: { name: 'Estado', enum: ['Parado', 'Acelerando', 'En marcha', 'Decelerando'] },
            5: { name: 'Velocidad del motor', unit: 'rpm' },
          },
        },
        tick(dt) {
          const s = vfdState;
          const run = vfd.holding[0] & 1;
          const ref = run ? vfd.holding[1] / 100 : 0;
          const up = 50 / Math.max(0.5, vfd.holding[2] / 10);
          const down = 50 / Math.max(0.5, vfd.holding[3] / 10);
          const diff = ref - s.f;
          s.f += diff > 0 ? Math.min(diff, up * dt) : Math.max(diff, -down * dt);
          const state = Math.abs(diff) < 0.01 ? (s.f > 0.01 ? 2 : 0) : diff > 0 ? 1 : 3;
          const amps = s.f > 0.01 ? 3.2 + s.f * 0.18 + (state === 1 ? 2.5 : 0) + noise(0.1) : 0;
          s.temp += ((31 + amps * 1.2 - s.temp) * 0.02) * dt * 4;
          vfd.input[0] = Math.round(s.f * 100);
          vfd.input[1] = Math.round(Math.max(0, amps) * 10);
          vfd.input[2] = Math.round(540 + noise(3));
          vfd.input[3] = Math.round(s.temp);
          vfd.input[4] = state;
          vfd.input[5] = Math.round(s.f * 29.4);
        },
      },
      {
        id: 3,
        name: 'Medidor',
        model: 'EM-3 · trifásico',
        kind: 'meter',
        ip: '192.168.1.13',
        server: meter,
        online: true,
        labels: {
          input: {
            0: { name: 'Tensión L-N', unit: 'V', f32: true },
            2: { name: 'Corriente', unit: 'A', f32: true },
            4: { name: 'Potencia activa', unit: 'kW', f32: true },
            6: { name: 'Factor de potencia', unit: '', f32: true },
            8: { name: 'Frecuencia de red', unit: 'Hz', f32: true },
            10: { name: 'Energía activa', unit: 'kWh', f32: true },
          },
          holding: {
            0: { name: 'Relación del TC (primario)', unit: 'A' },
            1: { name: 'Periodo de integración', unit: 'min' },
            2: { name: 'Dirección Modbus (solo lectura)' },
          },
        },
        tick(dt) {
          const s = meterState;
          const load = 9 + vfd.input[1] / 10 * 0.6 + (plc.coils[0] ? 2.2 : 0);
          s.v = clamp(s.v + noise(0.35) + (230 - s.v) * 0.05, 218, 242);
          s.i += (load - s.i) * 0.2 * dt * 4 + noise(0.05);
          s.pf = clamp(s.pf + noise(0.004) + (0.92 - s.pf) * 0.05, 0.8, 0.99);
          s.hz = clamp(s.hz + noise(0.01) + (50 - s.hz) * 0.1, 49.8, 50.2);
          const kw = (s.v * s.i * s.pf) / 1000;
          s.kwh += kw * dt * 0.05;
          writeFloat(meter, 0, s.v);
          writeFloat(meter, 2, s.i);
          writeFloat(meter, 4, kw);
          writeFloat(meter, 6, s.pf);
          writeFloat(meter, 8, s.hz);
          writeFloat(meter, 10, s.kwh);
        },
      },
    ];
    devices.forEach((d) => d.tick(0.1));

    return {
      devices,
      byId: (id) => devices.find((d) => d.id === id),
      tick(dt) {
        devices.forEach((d) => d.tick(dt));
      },
    };
  }

  /** Valor de ingeniería legible para una celda del mapa. */
  function engValue(device, table, addr) {
    const srv = device.server;
    const lab = device.labels[table] && device.labels[table][addr];
    if (table === 'coils' || table === 'discrete') {
      const v = srv[table][addr];
      return v ? 'ON' : 'OFF';
    }
    const raw = srv[table][addr];
    if (!lab) {
      const prev = device.labels[table] && device.labels[table][addr - 1];
      if (prev && prev.f32) return '↳ palabra baja';
      return '';
    }
    if (lab.f32) {
      const f = MB.decodeRegs([srv[table][addr], srv[table][addr + 1]], 'float32', 'ABCD');
      return `${MB.fmtNum(f, Math.abs(f) < 10 ? 3 : 2)} ${lab.unit}`.trim();
    }
    if (lab.enum) return lab.enum[raw] || String(raw);
    if (lab.bits) return raw.toString(2).padStart(8, '0').replace(/(\d{4})(?=\d)/g, '$1 ');
    const v = lab.scale ? raw * lab.scale : raw;
    const dec = lab.scale ? Math.max(0, -Math.floor(Math.log10(lab.scale))) : 0;
    return `${MB.fmtNum(v, dec)} ${lab.unit || ''}`.trim();
  }

  MB.sim = { createPlant, engValue };
})(typeof window !== 'undefined' ? window : globalThis);
