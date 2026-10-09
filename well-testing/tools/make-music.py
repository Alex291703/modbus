#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Música de fondo (cama musical) del video explicativo de Well Testing — R.B. Tec México.

Sintetiza desde código (numpy + ffmpeg por subprocess; sin samples, sin red) y con
semilla fija, de modo que cada ejecución produce el mismo audio:

  well-testing/assets/audio/well-testing-bed.m4a   90.0 s, 48 kHz estéreo, AAC 160 kbps,
                                                   ~-20 LUFS integrado, true peak <= -2 dBTP
  well-testing/assets/audio/whoosh.m4a             ~1.2 s, transición suave de aire (opcional)

Los WAV intermedios se escriben en un directorio de trabajo fuera del repo
(--scratch DIR, o $MUSIC_SCRATCH, o el valor por defecto de abajo).

Uso:
  python3 well-testing/tools/make-music.py [--scratch DIR] [--verbose]

Estructura musical (cortes fijos del video, la música se sincroniza con ellos):
  0-6 logo | 6-15 dron | 15-24 cabezal | 24-31 línea de entrada | 31-52 separador |
  52-64 medición | 64-71 circuito cerrado | 71-83 SCADA | 83-90 cierre con logo
Tempo ~96 BPM con un mapa de tempo por escena (93-100 BPM, número entero de tiempos por
escena) para que cada corte caiga exactamente en un tiempo fuerte / cambio de acorde.
Tonalidad D mayor / B menor.

El script valida objetivamente el resultado (sin clipping, sin NaN/inf, sin clicks, sin DC,
RMS por escena siguiendo la curva de energía prevista, centroide espectral, correlación
estéreo, sonoridad EBU R128 y duración con ffmpeg/ffprobe) y sale con código != 0 si
alguna verificación falla.
"""

import argparse
import json
import math
import os
import re
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np

# ----------------------------------------------------------------------------------------
# Global settings
# ----------------------------------------------------------------------------------------
SR = 48000
DUR = 90.0
N = int(round(SR * DUR))
SEED = 9602026

CUTS = [0.0, 6.0, 15.0, 24.0, 31.0, 52.0, 64.0, 71.0, 83.0, 90.0]
SCENES = ["logo-open", "drone", "wellhead", "inlet-line", "separator",
          "measurement", "closed-circuit", "scada", "closing-logo"]
# Integer number of beats per scene -> local tempo 93-100 BPM, every cut is a downbeat.
SCENE_BEATS = [10, 14, 14, 11, 34, 19, 11, 19, 11]
# Intended per-scene RMS relative to the loudest scene (SCADA), in dB.
INTENDED_DB = [-9.0, -5.5, -4.0, -3.5, -4.5, -1.5, -2.5, 0.0, -3.5]

TARGET_LUFS = -20.0
TP_LIMIT = -2.0           # dBTP, measured on the final .m4a
TP_PRE = -3.0             # ceiling applied before AAC encoding (codec overshoot margin)
WHOOSH_LUFS = -24.0
WHOOSH_TP_MAX = -6.0

HERE = Path(__file__).resolve().parent
WT = HERE.parent                              # well-testing/
OUT_DIR = WT / "assets" / "audio"
DEFAULT_SCRATCH = "/tmp/claude-0/-home-user-modbus/6689c25e-a696-5492-b2dd-5872833bdc3c/scratchpad/audio"

VERBOSE = False


def log(*a):
    print(*a, flush=True)


def vlog(*a):
    if VERBOSE:
        print(*a, flush=True)


# ----------------------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------------------
def t2s(t):
    return int(round(t * SR))


def midi_hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def db(x):
    return 20.0 * np.log10(np.maximum(x, 1e-12))


def undb(d):
    return 10.0 ** (d / 20.0)


def rng_for(tag):
    """Independent deterministic generator per layer (robust to code reordering)."""
    return np.random.default_rng([SEED, sum(ord(c) * (i + 1) for i, c in enumerate(tag))])


def beat_len(scene):
    return (CUTS[scene + 1] - CUTS[scene]) / SCENE_BEATS[scene]


def beat_time(scene, beat):
    return CUTS[scene] + beat * beat_len(scene)


def ramp_up(n):
    """Raised-cosine 0 -> 1 over n samples (click-free)."""
    if n <= 0:
        return np.ones(0)
    return 0.5 - 0.5 * np.cos(np.pi * (np.arange(n) + 0.5) / n)


def apply_edges(sig, n_in, n_out):
    """Raised-cosine fade-in/out on the last axis, in place."""
    n = sig.shape[-1]
    n_in, n_out = min(n_in, n), min(n_out, n)
    if n_in > 0:
        sig[..., :n_in] *= ramp_up(n_in)
    if n_out > 0:
        sig[..., n - n_out:] *= ramp_up(n_out)[::-1]
    return sig


def add_into(buf, start, sig):
    n = sig.shape[-1]
    a, b = max(start, 0), min(start + n, buf.shape[-1])
    if b > a:
        buf[..., a:b] += sig[..., a - start:b - start]


def pan_gains(p):
    """Equal-power pan, p in [-1, 1]."""
    th = (np.clip(p, -1, 1) + 1.0) * np.pi / 4.0
    return np.cos(th), np.sin(th)


def automation(points, n=N, smooth_s=0.25):
    """Piecewise-linear automation (time, value) sampled at SR, then softened by a
    double boxcar so corners are smooth."""
    pts = np.array(points, dtype=float)
    t = np.arange(n) / SR
    y = np.interp(t, pts[:, 0], pts[:, 1])
    w = max(1, t2s(smooth_s / 2))
    for _ in range(2):
        c = np.cumsum(np.concatenate([[0.0], np.pad(y, (w, w), mode="edge")]))
        y = (c[2 * w + 1:] - c[:-2 * w - 1])[: n] / (2 * w + 1)
    return y


def fast_len(n):
    """Smallest 2^a 3^b 5^c >= n (fast FFT size)."""
    best = 1 << max(0, (n - 1).bit_length())
    p5 = 1
    while p5 < best:
        p35 = p5
        while p35 < best:
            p = p35
            while p < n:
                p *= 2
            best = min(best, p)
            p35 *= 3
        p5 *= 5
    return best


# ----------------------------------------------------------------------------------------
# Filters (zero-phase FFT filters and STFT time-varying filters; no scipy needed)
# ----------------------------------------------------------------------------------------
def lp_mag(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (np.asarray(f) / fc) ** (2 * order))


def hp_mag(f, fc, order=2):
    r = (np.maximum(np.asarray(f), 1e-9) / fc) ** (2 * order)
    return np.sqrt(r / (1.0 + r))


def bp_log(f, fc, width_oct):
    """Gaussian band-pass in log-frequency (width = std-dev in octaves)."""
    lf = np.log2(np.maximum(np.asarray(f), 1.0) / fc)
    return np.exp(-0.5 * (lf / width_oct) ** 2)


def fft_apply(x, respfn, pad=2 * SR):
    """Apply a frequency response (real or complex) to x along the last axis.
    Zero padding prevents circular wrap of the (two-sided) impulse response."""
    n = x.shape[-1]
    L = fast_len(n + pad)
    X = np.fft.rfft(x, L, axis=-1)
    X *= respfn(np.fft.rfftfreq(L, 1.0 / SR))
    return np.fft.irfft(X, L, axis=-1)[..., :n]


def fft_convolve(x, h):
    n = x.shape[-1] + h.shape[-1] - 1
    L = fast_len(n)
    return np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(h, L), L)[: x.shape[-1]]


def stft_shape(x, magfn, nfft=2048, hop=512):
    """Time-varying zero-phase filter: Hann analysis + Hann synthesis, 75 % overlap
    (weighted overlap-add, constant gain). magfn(times[nf], freqs[nb]) -> (nf, nb)."""
    x = np.asarray(x, dtype=float)
    if x.ndim == 2:
        return np.stack([stft_shape(c, magfn, nfft, hop) for c in x])
    n = x.shape[0]
    win = np.hanning(nfft + 1)[:-1]
    pad = nfft
    xp = np.concatenate([np.zeros(pad), x, np.zeros(pad + nfft)])
    frames = np.lib.stride_tricks.sliding_window_view(xp, nfft)[::hop]
    nfr = frames.shape[0]
    out = np.zeros(len(xp) + nfft)
    freqs = np.fft.rfftfreq(nfft, 1.0 / SR)
    times = (np.arange(nfr) * hop + nfft / 2 - pad) / SR
    chunk = 512
    for c0 in range(0, nfr, chunk):
        fr = frames[c0:c0 + chunk] * win
        S = np.fft.rfft(fr, axis=1)
        S *= magfn(times[c0:c0 + chunk], freqs)
        y = np.fft.irfft(S, nfft, axis=1) * win
        for i in range(y.shape[0]):
            s = (c0 + i) * hop
            out[s:s + nfft] += y[i]
    norm = np.sum(win ** 2) / hop
    return out[pad:pad + n] / norm


# ----------------------------------------------------------------------------------------
# Harmony / timeline
# ----------------------------------------------------------------------------------------
# Per scene: (beats, chord name, bass MIDI, pad voicing MIDI). Bass line:
# D | B | G | A | E F# G A | B E | F# | G A | D  (D major / B minor, cadence A -> D at 83 s)
PLAN = [
    [(10, "Dadd9", 38, (50, 57, 64, 66))],
    [(14, "Bm9", 35, (50, 54, 57, 61, 66))],
    [(14, "Gmaj9", 31, (50, 54, 57, 59, 66))],
    [(8, "A9sus4", 33, (50, 57, 59, 64)), (3, "Aadd9", 33, (49, 57, 59, 64))],
    [(8, "Em9", 40, (50, 55, 59, 66)), (8, "F#m7", 42, (52, 57, 61, 64)),
     (8, "Gmaj7#11", 43, (50, 54, 59, 61)), (10, "A7sus4", 45, (50, 55, 59, 64))],
    [(10, "Bm9", 35, (50, 54, 57, 61, 66)), (9, "Em9", 40, (50, 55, 59, 62, 66))],
    [(11, "Dmaj9/F#", 42, (50, 57, 61, 64, 66))],
    [(10, "Gmaj9", 31, (50, 54, 57, 59, 62)), (5, "A9sus4", 33, (50, 57, 59, 64)),
     (4, "A6/9", 33, (49, 57, 59, 64, 66))],
    [(11, "Dmaj9", 38, (50, 57, 61, 64, 66, 69))],
]


def build_chords():
    chords = []
    for s, items in enumerate(PLAN):
        assert sum(b for b, *_ in items) == SCENE_BEATS[s], f"beats mismatch in scene {s}"
        b0 = 0
        for beats, name, bass, pad in items:
            chords.append(dict(scene=s, t0=beat_time(s, b0), t1=beat_time(s, b0 + beats),
                               name=name, bass=bass, pad=tuple(pad)))
            b0 += beats
    return chords


CHORDS = build_chords()


def chord_at(t):
    for c in CHORDS:
        if c["t0"] - 1e-9 <= t < c["t1"] - 1e-9:
            return c
    return CHORDS[-1]


def arp_tones(chord):
    base = sorted(set(chord["pad"]))
    tones = sorted(set([m + 12 for m in base] + [m + 24 for m in base]))
    return [m for m in tones if 62 <= m <= 83]


# Per-scene level rides (dB) per layer: this is what shapes the energy curve.
#            logo  drone  well  inlet  sep   meas  circ  scada close
SCENE_DB = dict(
    pad=   [-3.5, -3.6, -2.7, -2.1, -2.0, -0.6, -1.3,  0.0, -2.5],
    bass=  [ 0.0, -3.4, -2.2, -2.0, -5.5,  1.1, -2.0,  3.6, -3.0],
    pluck= [ 0.0,  0.0,  0.0, -1.2,  2.1,  0.0,  0.0,  1.9,  1.5],
    perc=  [ 0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5,  0.5,  0.0],
    air=   [ 0.0,  2.0,  0.0,  0.0,  1.5, -1.0, -1.0, -1.0, -2.0],
)


def scene_of(t):
    for s in range(len(SCENES)):
        if t < CUTS[s + 1] - 1e-9:
            return s
    return len(SCENES) - 1


def sg(layer, t):
    """Linear scene gain of an event-based layer at event time t."""
    return undb(SCENE_DB[layer][scene_of(t + 1e-6)])


def scene_curve(layer, smooth_s=0.3):
    """Smooth per-scene gain curve for a continuous layer (transitions centred on the cuts)."""
    pts = []
    for s in range(len(SCENES)):
        v = undb(SCENE_DB[layer][s])
        pts += [(CUTS[s] + 0.05, v), (CUTS[s + 1] - 0.05, v)]
    pts[0] = (0.0, pts[0][1])
    pts[-1] = (DUR, pts[-1][1])
    return automation(pts, smooth_s=smooth_s)


# ----------------------------------------------------------------------------------------
# Oscillators (band-limited wavetables: harmonics stop below 11 kHz -> no aliasing)
# ----------------------------------------------------------------------------------------
TABLE_N = 4096
_TABLES = {}


def table(kind, f0, fmax=11000.0):
    K = max(1, int(fmax // (f0 * 1.02)))
    key = (kind, K)
    if key not in _TABLES:
        k = np.arange(1, K + 1)
        if kind == "saw":
            amp = 1.0 / k
        else:  # triangle: odd harmonics, 1/k^2, alternating sign
            amp = np.where(k % 2 == 1, ((-1.0) ** ((k - 1) // 2)) / k ** 2, 0.0)
        taper = np.where(k > 0.75 * K, 0.5 + 0.5 * np.cos(np.pi * (k - 0.75 * K) / (0.25 * K + 1)), 1.0)
        ph = 2 * np.pi * np.arange(TABLE_N) / TABLE_N
        tab = (amp * taper) @ np.sin(np.outer(k, ph))
        tab /= np.max(np.abs(tab))
        _TABLES[key] = np.append(tab, tab[0])
    return _TABLES[key]


def osc(tab, freq, phase0):
    ph = phase0 + np.cumsum(freq) / SR
    ph -= np.floor(ph)
    pos = ph * TABLE_N
    i0 = np.minimum(pos.astype(np.int64), TABLE_N - 1)
    fr = pos - i0
    return tab[i0] * (1.0 - fr) + tab[i0 + 1] * fr


# ----------------------------------------------------------------------------------------
# Layers
# ----------------------------------------------------------------------------------------
def pad_events():
    """Note events with voice-leading: common tones are held across chord changes;
    new notes fade in from 0.25 s before the cut, old ones release around the cut."""
    ev = []
    active = {}
    for i, c in enumerate(CHORDS):
        prev = set(CHORDS[i - 1]["pad"]) if i > 0 else set()
        nxt = set(CHORDS[i + 1]["pad"]) if i + 1 < len(CHORDS) else set()
        g = 0.62 / math.sqrt(len(c["pad"]))
        for m in c["pad"]:
            if m not in prev:
                if i == 0:
                    active[m] = dict(m=m, on=0.0, att=3.2, gain=g)
                else:
                    active[m] = dict(m=m, on=c["t0"] - 0.25, att=0.45, gain=g)
            if m not in nxt:
                e = active.pop(m)
                if i + 1 < len(CHORDS):
                    e.update(off=c["t1"] - 0.15, rel=0.6)
                else:
                    e.update(off=DUR, rel=0.0)
                ev.append(e)
    return ev


def render_pad():
    rng = rng_for("pad")
    out = np.zeros((2, N))
    for e in pad_events():
        f0 = midi_hz(e["m"])
        s0 = t2s(e["on"])
        s1 = min(N, t2s(e["off"] + e["rel"]))
        n = s1 - s0
        t = np.arange(n) / SR
        env = np.ones(n)
        na = t2s(e["att"])
        env[:na] *= ramp_up(na)[:n]
        if e["rel"] > 0:
            r0 = t2s(e["off"] - e["on"])
            nr = n - r0
            env[r0:] *= ramp_up(nr)[::-1]
        env *= 1.0 + 0.10 * np.sin(2 * np.pi * (0.05 + 0.06 * rng.random()) * t + 2 * np.pi * rng.random())
        # register balance: soften the lowest notes, keep the top airy but quiet
        reg = 1.0 - 0.012 * max(0, 54 - e["m"]) * 3 - 0.01 * max(0, e["m"] - 64)
        amp = env * e["gain"] * reg
        saw = table("saw", f0 * 1.01)
        tri = table("tri", f0)
        for det, pan, lvl in ((-9.0, -0.75, 0.30), (0.0, 0.0, 0.26), (8.0, 0.75, 0.30), (0.0, 0.1, 0.0)):
            drift = 2.5 * np.sin(2 * np.pi * (0.07 + 0.1 * rng.random()) * t + 2 * np.pi * rng.random())
            fr = f0 * 2.0 ** ((det + drift) / 1200.0)
            if lvl > 0:
                sig = osc(saw, fr, rng.random()) * lvl
            else:  # triangle body voice
                sig = osc(tri, fr, rng.random()) * 0.55
            gl, gr = pan_gains(pan)
            out[0, s0:s1] += sig * amp * gl
            out[1, s0:s1] += sig * amp * gr

    # Smooth low-pass with slow motion (per-scene brightness + swells into cuts 6/31/52/71).
    cut_pts = [(0, 420), (3.5, 650), (5.9, 1500), (6.4, 950), (14.5, 1050), (15.2, 1300),
               (23.8, 1400), (24.3, 1500), (28.0, 1550), (30.9, 2300), (31.4, 1050),
               (48.0, 1150), (51.9, 2000), (52.4, 1700), (63.8, 1700), (64.3, 1500),
               (68.0, 1550), (70.9, 2400), (71.4, 1900), (82.0, 2300), (83.3, 1600),
               (87.0, 1200), (90.0, 700)]
    fc_curve = automation(cut_pts, smooth_s=0.35)
    tt = np.arange(N) / SR
    fc_curve *= 1.0 + 0.16 * np.sin(2 * np.pi * tt / 9.3) + 0.06 * np.sin(2 * np.pi * tt / 3.7 + 1.0)
    hop = 512

    def mag(times, freqs):
        idx = np.clip((times * SR).astype(np.int64), 0, N - 1)
        fc = fc_curve[idx][:, None]
        q1, q2 = 0.62, 1.05   # 4-pole low-pass, slightly warm (gentle bump)
        r = freqs[None, :] / fc
        h1 = 1.0 / np.sqrt((1 - r ** 2) ** 2 + (r / q1) ** 2)
        h2 = 1.0 / np.sqrt((1 - r ** 2) ** 2 + (r / q2) ** 2)
        return h1 * h2 * hp_mag(freqs, 105.0, 2)[None, :]

    out = stft_shape(out, mag, nfft=2048, hop=hop)

    # Soft stereo chorus (two modulated delay lines, linear interpolation)
    idx = np.arange(N, dtype=float)
    ch = np.empty_like(out)
    for c, (base, depth, rate, ph) in enumerate(((0.0125, 0.0022, 0.21, 0.0), (0.0155, 0.0026, 0.27, 1.9))):
        d = (base + depth * np.sin(2 * np.pi * rate * tt + ph)) * SR
        wet = np.interp(idx - d, idx, out[c], left=0.0)
        other = np.interp(idx - d * 1.31, idx, out[1 - c], left=0.0)
        ch[c] = 0.82 * out[c] + 0.34 * wet + 0.12 * other
    return ch


def bass_events():
    ev = []  # (time, midi, amp, tau)
    def add(scene, beats, amps, tau):
        for b, a in zip(beats, amps):
            t = beat_time(scene, b)
            ev.append((t, chord_at(t + 1e-6)["bass"], a * sg("bass", t), tau))
    add(1, [0, 4, 8, 12], [0.75, 0.6, 0.68, 0.6], 1.5)
    add(2, [0, 3, 4, 7, 8, 11, 12], [0.85, 0.32, 0.8, 0.32, 0.8, 0.32, 0.78], 0.9)
    add(3, [0, 2, 4, 6, 8, 10], [0.85, 0.45, 0.8, 0.45, 0.85, 0.5], 0.75)
    add(4, list(range(0, 34, 4)) + [32], [0.78] * 9 + [0.0], 1.6)
    add(5, list(range(19)), [0.92 if b % 4 == 0 else 0.5 for b in range(19)], 0.42)
    add(6, list(range(0, 11, 2)), [0.88 if b % 4 == 0 else 0.58 for b in range(0, 11, 2)], 0.7)
    s7 = [x * 0.5 for x in range(38)]
    add(7, s7, [1.0 if b % 4 == 0 else (0.62 if b == int(b) else 0.4) for b in s7], 0.26)
    add(8, [0], [1.0], 2.8)
    ev = [e for e in ev if e[2] > 0]
    ev.sort()
    return ev


def render_bass():
    out = np.zeros(N)
    ev = bass_events()
    for i, (t0, m, a, tau) in enumerate(ev):
        t_next = ev[i + 1][0] if i + 1 < len(ev) else DUR
        length = min(t_next - t0 + 0.06, 6.0)
        n = t2s(length)
        t = np.arange(n) / SR
        f = midi_hz(m)
        ph = 2 * np.pi * f * t
        sig = np.sin(ph) + 0.24 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
        if f > 80.0:
            sig += 0.5 * np.sin(0.5 * ph)          # sub octave keeps the weight
        sig = np.tanh(1.2 * sig) / np.tanh(1.2)
        env = (0.18 + 0.82 * np.exp(-t / tau)) * a
        apply_edges(env, t2s(0.012), t2s(0.06))
        add_into(out, t2s(t0), sig * env)
    out = fft_apply(out, lambda f: lp_mag(f, 260.0, 2) * hp_mag(f, 30.0, 2))
    return np.stack([out, out])


def arp_events():
    rng = rng_for("arp")
    ev = []  # (time, midi, vel, pan)

    def put(t, step_idx, vel, pat_idx, octave_up=False):
        c = chord_at(t + 1e-6)
        tones = arp_tones(c)
        m = tones[pat_idx % len(tones)]
        if octave_up and m + 12 <= 86:
            m += 12
        jitter = rng.normal(0, 0.003)
        v = vel * (1.0 + rng.normal(0, 0.07))
        pan = (0.35 if step_idx % 2 else -0.35) * (0.6 + 0.4 * rng.random())
        ev.append((t + jitter, m, float(np.clip(v, 0.05, 0.9)), pan))

    # S2 wellhead (enters at 15 s) + S3 inlet line: flowing 8ths, entry fades in over 2 bars
    pat = [0, 2, 4, 1, 3, 5, 2, 4]
    for s, base in ((2, 0.34), (3, 0.36)):
        for k in range(SCENE_BEATS[s] * 2):
            t = beat_time(s, k * 0.5)
            ramp = min(1.0, 0.35 + 0.65 * k / 14.0) if s == 2 else 1.0
            acc = 1.12 if k % 4 == 0 else (0.85 if k % 2 else 1.0)
            put(t, k, base * ramp * acc, pat[k % 8])
    # S4 separator: sparse, "curious" syncopated phrase with wide leaps (16-eighth cycle)
    hits = [(0, 0, 1.0), (3, 4, 0.8), (6, 2, 0.85), (10, 5, 0.75), (12, 1, 0.8), (13, 3, 0.6)]
    for k in range(SCENE_BEATS[4] * 2):
        for (h, idx, a) in hits:
            if k % 16 == h:
                put(beat_time(4, k * 0.5), k, 0.36 * a, idx + (k // 16))
    # S5 measurement: continuous 8ths + 16th pickups at bar ends
    pat5 = [0, 2, 4, 2, 1, 3, 5, 3]
    for k in range(SCENE_BEATS[5] * 2):
        acc = 1.15 if k % 8 == 0 else (0.9 if k % 2 else 1.0)
        put(beat_time(5, k * 0.5), k, 0.36 * acc, pat5[k % 8])
        if k % 8 == 7:
            put(beat_time(5, k * 0.5 + 0.25), k + 1, 0.25, pat5[k % 8] + 1)
    # S6 closed circuit: a 3-note loop against the 4/4 grid (circular feeling)
    for k in range(SCENE_BEATS[6] * 2):
        put(beat_time(6, k * 0.5), k, 0.35 * (1.1 if k % 3 == 0 else 0.9), [0, 2, 4][k % 3])
    # S7 SCADA: steady 16ths (most energy), accented on the beat
    pat7 = [0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 1, 2, 3, 4]
    for k in range(SCENE_BEATS[7] * 4):
        acc = 1.3 if k % 4 == 0 else (1.0 if k % 2 == 0 else 0.78)
        put(beat_time(7, k * 0.25), k, 0.26 * acc, pat7[k % 16], octave_up=(k % 32) >= 24)
    # S8 closing: rising arpeggio that settles on the top of the final chord
    for k in range(7):
        put(beat_time(8, k * 0.5), k, 0.34 * (1.0 - 0.06 * k), k)
    put(beat_time(8, 4.0), 8, 0.26, 5)              # lands on F#5, the 3rd of Dmaj9
    ev.sort()
    return ev


def pluck_note(f, vel):
    tau = 0.55 * (330.0 / f) ** 0.35
    dur = min(2.4, 5.5 * tau)
    n = t2s(dur)
    t = np.arange(n) / SR
    ph = 2 * np.pi * f * t
    index = (0.45 + 1.0 * vel) * np.exp(-t / 0.07) + 0.10
    sig = np.sin(ph + index * np.sin(ph))
    sig += 0.14 * np.sin(2 * ph) * np.exp(-t / (0.4 * tau))
    env = np.exp(-t / tau)
    apply_edges(env, t2s(0.004), t2s(0.08))
    return sig * env * vel ** 1.3


def render_pluck():
    out = np.zeros((2, N))
    for (t, m, v, pan) in arp_events():
        sig = pluck_note(midi_hz(m), v) * sg("pluck", t)
        gl, gr = pan_gains(pan)
        add_into(out, t2s(t), np.stack([sig * gl, sig * gr]))
    out = fft_apply(out, lambda f: lp_mag(f, 4200.0, 2) * hp_mag(f, 180.0, 1))
    return out


def pingpong(x, delay_s=0.474, fb=0.42, taps=6):
    """Dotted-8th ping-pong delay; each repeat darker. Done in the frequency domain."""
    mono = x.mean(axis=0)
    d = t2s(delay_s)

    def resp(ch):
        def r(f):
            h = lp_mag(f, 3000.0, 1) * hp_mag(f, 300.0, 1)
            acc = np.zeros(f.shape, dtype=complex)
            for k in range(1, taps + 1):
                if (k % 2 == 1) == (ch == 1):     # first repeat right, then left ...
                    acc += fb ** (k - 1) * h ** k * np.exp(-2j * np.pi * f * k * d / SR)
            return acc
        return r
    return np.stack([fft_apply(mono, resp(0), pad=(taps + 2) * d),
                     fft_apply(mono, resp(1), pad=(taps + 2) * d)])


def render_perc():
    """Light percussion 52-83 s: soft ticks + shaker only (no drum kit)."""
    rng = rng_for("perc")
    out = np.zeros((2, N))
    shaker_src = fft_apply(rng.standard_normal(N), lambda f: bp_log(f, 3700.0, 0.55) * lp_mag(f, 7000.0, 4))
    tick_src = fft_apply(rng.standard_normal(N), lambda f: bp_log(f, 2900.0, 0.45) * lp_mag(f, 6500.0, 4))
    shaker_src *= 0.5 / np.std(shaker_src)       # soft, low-crest shaker
    tick_src *= 0.28 / np.std(tick_src)            # ticks: felt more than heard

    def hit(src, t, amp, attack, tau, length, pan):
        s0 = t2s(t)
        n = t2s(length)
        if s0 + n > t2s(83.0) - 1:
            return
        tt = np.arange(n) / SR
        env = np.exp(-tt / tau) * amp * sg("perc", t)
        apply_edges(env, max(2, t2s(attack)), t2s(min(0.02, length / 3)))
        seg = src[s0:s0 + n] * env
        gl, gr = pan_gains(pan + rng.normal(0, 0.05))
        add_into(out, s0, np.stack([seg * gl, seg * gr]))

    def j():
        return rng.normal(0, 0.003)

    def v(a):
        return a * (1.0 + rng.normal(0, 0.08))

    # S5 measurement: shaker 8ths (offbeat accent), tick on every beat
    for k in range(SCENE_BEATS[5] * 2):
        ramp = min(1.0, 0.3 + 0.7 * k / 4)
        hit(shaker_src, beat_time(5, k * 0.5) + j(), v(ramp * (1.0 if k % 2 else 0.55)), 0.018, 0.05, 0.2, -0.35)
        if k % 2 == 0:
            hit(tick_src, beat_time(5, k * 0.5) + j(), v(ramp * (0.9 if k % 8 == 0 else 0.6)), 0.0015, 0.007, 0.05, 0.3)
    # S6 closed circuit: lighter
    for k in range(SCENE_BEATS[6] * 2):
        hit(shaker_src, beat_time(6, k * 0.5) + j(), v(0.85 if k % 2 else 0.45), 0.018, 0.045, 0.18, -0.35)
        if k % 4 == 0:
            hit(tick_src, beat_time(6, k * 0.5) + j(), v(0.6), 0.0015, 0.007, 0.05, 0.3)
    # S7 SCADA: steady 16th shaker + 8th ticks
    for k in range(SCENE_BEATS[7] * 4):
        hit(shaker_src, beat_time(7, k * 0.25) + j(), v([0.5, 0.32, 1.0, 0.38][k % 4]), 0.015, 0.04, 0.16, -0.35)
        if k % 2 == 0:
            hit(tick_src, beat_time(7, k * 0.25) + j(), v(0.95 if k % 4 == 0 else 0.55), 0.0015, 0.007, 0.05, 0.3)
    return out


def render_air():
    """Subtle filtered-noise 'air' bed with slow spectral motion."""
    rng = rng_for("air")
    common = rng.standard_normal(N)
    x = np.stack([0.6 * common + 0.8 * rng.standard_normal(N),
                  0.6 * common + 0.8 * rng.standard_normal(N)])

    def mag(times, freqs):
        fc = 1700.0 * 2.0 ** (0.9 * np.sin(2 * np.pi * times / 17.0))[:, None]
        g = bp_log(freqs[None, :], fc, 1.1) * (1000.0 / np.maximum(freqs, 200.0)) ** 0.4
        return g * lp_mag(freqs, 7000.0, 3) * hp_mag(freqs, 300.0, 2)

    y = stft_shape(x, mag)
    y /= np.std(y)
    lvl = scene_curve("air", smooth_s=0.8) * automation([(0, 0.0), (2.0, 0.8), (5.0, 1.0), (90, 1.0)])
    t = np.arange(N) / SR
    lvl *= 1.0 + 0.25 * np.sin(2 * np.pi * t / 6.1 + 0.5)
    return y * lvl


def render_risers():
    """Swells into the cuts at 6, 31, 52 and 71 s: band-pass noise sweep + reversed
    shimmer of the incoming chord; both stop (with a 30 ms fade) exactly at the cut."""
    rng = rng_for("risers")
    out = np.zeros((2, N))
    for t_end, dur, amp in ((6.0, 2.6, 0.8), (31.0, 3.0, 0.85), (52.0, 3.0, 0.95), (71.0, 3.2, 1.0)):
        n = t2s(dur)
        x = np.stack([rng.standard_normal(n), rng.standard_normal(n)])
        x[1] = 0.5 * x[0] + 0.87 * x[1]

        def mag(times, freqs, dur=dur):
            p = np.clip(times / dur, 0, 1)[:, None]
            fc = 280.0 * 13.0 ** (p ** 1.4)
            return bp_log(freqs[None, :], fc, 0.8) * lp_mag(freqs, 6500.0, 4)

        y = stft_shape(x, mag, nfft=1024, hop=256)
        y /= np.std(y)
        t = np.arange(n) / SR
        env = (t / dur) ** 2.4
        apply_edges(env, 0, t2s(0.03))
        sig = y * env * 0.5 * amp
        # reversed shimmer: incoming chord tones two octaves up, rising into the cut
        c = chord_at(t_end + 1e-6)
        sh = np.zeros(n)
        tones = sorted(set(c["pad"]))[-3:]
        for m in tones:
            f = midi_hz(m + 24)
            sh += np.sin(2 * np.pi * f * t + 2 * np.pi * rng.random())
        sh *= (t / dur) ** 3.5 / len(tones)
        apply_edges(sh, 0, t2s(0.03))
        sig = sig + np.stack([sh, sh]) * 0.35 * amp
        add_into(out, t2s(t_end) - n, sig)
    return out


def render_impacts():
    """Soft impacts exactly at 6.0 s and 83.0 s: low boom (dry) + shimmer (to reverb)."""
    rng = rng_for("impacts")
    boom = np.zeros(N)
    shim = np.zeros((2, N))
    for t0, amp in ((6.0, 0.9), (83.0, 1.0)):
        n = t2s(3.2)
        t = np.arange(n) / SR
        f = 41.0 + 46.0 * np.exp(-t / 0.07)
        ph = 2 * np.pi * np.cumsum(f) / SR
        ph -= ph[0]                                   # starts at phase 0 at the onset
        b = np.sin(ph) + 0.2 * np.sin(2 * ph)
        env = np.exp(-t / 0.6)
        apply_edges(env, t2s(0.004), t2s(0.4))
        thump = fft_apply(rng.standard_normal(n), lambda fr: lp_mag(fr, 160.0, 3), pad=SR // 2)
        thump /= np.std(thump) * 3.0
        tenv = np.exp(-t / 0.035)
        apply_edges(tenv, t2s(0.002), t2s(0.05))
        add_into(boom, t2s(t0), amp * (b * env + thump * tenv))
        # shimmer: chord tones high up, detuned pairs, soft attack, long decay
        c = chord_at(t0 + 1e-6)
        tones = sorted(set(c["pad"]))
        s = np.zeros((2, n))
        for i, m in enumerate(tones):
            fr = midi_hz(m + 24 + (12 if i == len(tones) - 1 and m < 64 else 0))
            for ch, cents in ((0, -4.0), (1, 4.0)):
                s[ch] += np.sin(2 * np.pi * fr * 2 ** (cents / 1200) * t + 2 * np.pi * rng.random())
        s /= len(tones)
        senv = np.exp(-t / 1.5)
        apply_edges(senv, t2s(0.03), t2s(0.4))
        air = fft_apply(rng.standard_normal((2, n)), lambda fr: bp_log(fr, 4500.0, 0.6) * lp_mag(fr, 8000.0, 3), pad=SR // 2)
        air /= np.std(air)
        aenv = np.exp(-t / 0.35)
        apply_edges(aenv, t2s(0.008), t2s(0.3))
        add_into(shim, t2s(t0), amp * (s * senv * 0.5 + air * aenv * 0.08))
    # no bus filtering after placement: a zero-phase filter would pre-ring before the cut
    return np.stack([boom, boom]), shim


def make_ir(rng, length=3.4, predelay=0.02):
    """Synthetic stereo reverb IR: decorrelated noise with frequency-dependent
    exponential decay (RT60 2.6 s lows -> 0.9 s highs), band-limited to 7.5 kHz."""
    n = t2s(length)
    noise = rng.standard_normal((2, n))
    lf = np.log2([100.0, 500.0, 2000.0, 6000.0, 12000.0])
    rt = np.array([2.6, 2.4, 1.9, 1.2, 0.9])

    def mag(times, freqs):
        rt60 = np.interp(np.log2(np.maximum(freqs, 20.0)), lf, rt)
        tt = np.maximum(times, 0.0)[:, None]
        return np.exp(-6.91 * tt / rt60[None, :]) * lp_mag(freqs, 7500.0, 2) * hp_mag(freqs, 120.0, 1)

    ir = stft_shape(noise, mag, nfft=1024, hop=256)
    pd = t2s(predelay)
    ir = np.concatenate([np.zeros((2, pd)), ir[:, : n - pd]], axis=1)
    apply_edges(ir[:, pd:], t2s(0.006), t2s(0.25))
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    return ir


# ----------------------------------------------------------------------------------------
# Mix
# ----------------------------------------------------------------------------------------
GAINS = dict(pad=0.46, bass=0.15, pluck=0.42, perc=0.17, air=0.010, risers=0.045,
             boom=0.22, shimmer=0.030, delay=0.22, reverb=0.55)


def render_bed():
    log("  pad ...")
    pad = render_pad() * GAINS["pad"]
    swell = [(0, 1.0)]
    for c in (6.0, 31.0, 52.0, 71.0):            # small swells into these cuts
        swell += [(c - 1.6, 1.0), (c - 0.05, undb(1.8)), (c + 0.5, 1.0)]
    swell += [(DUR, 1.0)]
    pad *= scene_curve("pad", smooth_s=0.5) * automation(swell, smooth_s=0.2)
    log("  bass ...")
    bass = render_bass() * GAINS["bass"]
    log("  pluck arpeggio ...")
    pluck = render_pluck() * GAINS["pluck"]
    delay = pingpong(pluck) * GAINS["delay"]
    log("  percussion, air, risers, impacts ...")
    perc = render_perc() * GAINS["perc"]
    air = render_air() * GAINS["air"]
    risers = render_risers() * GAINS["risers"]
    boom, shim = render_impacts()
    boom *= GAINS["boom"]
    shim *= GAINS["shimmer"]
    log("  reverb ...")
    send = 0.30 * pad + 0.55 * pluck + 0.6 * delay + 0.20 * perc + 0.4 * air + 0.5 * risers + 1.0 * shim + 0.04 * boom
    ir = make_ir(rng_for("reverb"))
    rev = np.stack([fft_convolve(send[0], ir[0]) + 0.25 * fft_convolve(send[1], ir[0]),
                    fft_convolve(send[1], ir[1]) + 0.25 * fft_convolve(send[0], ir[1])]) / 1.25
    rev = fft_apply(rev, lambda f: hp_mag(f, 170.0, 2)) * GAINS["reverb"]
    layers = dict(pad=pad, bass=bass, pluck=pluck + delay, perc=perc, air=air, risers=risers,
                  impacts=boom + shim, reverb=rev)
    mix = sum(layers.values())
    mix = fft_apply(mix, lambda f: hp_mag(f, 22.0, 2))
    # master fades: tiny fade-in, last ~2 s to silence (cosine-squared)
    t = np.arange(N) / SR
    fade = np.where(t >= 88.0, np.cos(0.5 * np.pi * np.clip((t - 88.0) / 2.0, 0, 1)) ** 2, 1.0)
    fade[: t2s(0.02)] *= ramp_up(t2s(0.02))
    mix *= fade
    for k in layers:
        layers[k] = layers[k] * fade
    return mix, layers


# ----------------------------------------------------------------------------------------
# Loudness, true peak, limiter, IO
# ----------------------------------------------------------------------------------------
def true_peak_per_sample(x, os_=4):
    """4x oversampled (FFT interpolation) absolute peak per original sample, max over channels."""
    x = np.atleast_2d(x)
    n = x.shape[-1]
    pk = np.zeros(n)
    L = fast_len(n + 4096)
    for c in x:
        X = np.fft.rfft(c, L)
        Y = np.zeros(L * os_ // 2 + 1, dtype=complex)
        Y[: X.shape[0]] = X
        y = np.fft.irfft(Y, L * os_)[: n * os_] * os_
        pk = np.maximum(pk, np.abs(y).reshape(n, os_).max(axis=1))
    return pk


def tp_limit(x, ceiling, block=48, look=6, release_s=0.25):
    """Offline look-ahead peak limiter on the 4x true-peak envelope. Returns (y, max_gr_db)."""
    pk = true_peak_per_sample(x)
    if pk.max() <= ceiling:
        return x, 0.0
    n = x.shape[-1]
    nb = -(-n // block)
    pkb = np.pad(pk, (0, nb * block - n)).reshape(nb, block).max(axis=1)
    req = np.minimum(1.0, ceiling / np.maximum(pkb, 1e-12))
    padded = np.pad(req, (1, look), constant_values=1.0)
    g1 = np.lib.stride_tricks.sliding_window_view(padded, look + 2).min(axis=1)[:nb]
    coef = 1.0 - math.exp(-block / (release_s * SR))
    g = np.empty(nb)
    prev = 1.0
    for i in range(nb):
        prev = min(g1[i], prev + (1.0 - prev) * coef)
        g[i] = prev
    gp = np.concatenate([np.ones(look - 1), g])          # moving average over the past `look` blocks
    c = np.concatenate([[0.0], np.cumsum(gp)])
    g2 = (c[look:] - c[:-look]) / look
    centers = (np.arange(nb) + 0.5) * block
    gs = np.interp(np.arange(n), centers, g2)
    return x * gs, float(-db(g2.min()))


def write_wav_f32(path, x):
    x = np.atleast_2d(x)
    data = np.ascontiguousarray(x.T.astype("<f4")).tobytes()
    nch = x.shape[0]
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 4 + 24 + 12 + 8 + len(data)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 3, nch, SR, SR * nch * 4, nch * 4, 32))
        f.write(b"fact" + struct.pack("<II", 4, x.shape[1]))
        f.write(b"data" + struct.pack("<I", len(data)) + data)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(map(str, cmd))}\n{r.stderr[-2000:]}")
    return r


def ebur128(path):
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true",
             "-f", "null", "-"])
    s = r.stderr[r.stderr.rfind("Summary:"):]
    num = r"(-?inf|-?[\d.]+)"
    I = float(re.search(r"I:\s*" + num + r" LUFS", s).group(1))
    LRA = float(re.search(r"LRA:\s*" + num + r" LU", s).group(1))
    TP = float(re.search(r"Peak:\s*" + num + r" dBFS", s).group(1))
    return dict(I=I, LRA=LRA, TP=TP)


def ffprobe(path):
    r = run(["ffprobe", "-v", "error", "-show_entries",
             "format=duration,bit_rate:stream=codec_name,sample_rate,channels,duration,bit_rate",
             "-of", "json", str(path)])
    return json.loads(r.stdout)


def decode(path, nch=2):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
                        "-f", "f32le", "-ac", str(nch), "-ar", str(SR), "-"], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode()[-2000:])
    return np.frombuffer(r.stdout, dtype="<f4").reshape(-1, nch).T.astype(float)


def encode_aac(wav, out):
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
         "-c:a", "aac", "-b:a", "160k", "-ar", str(SR), "-ac", "2",
         "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
         "-movflags", "+faststart", str(out)])


def master(x, name, scratch, target, tp_pre, tp_final, max_iter=6):
    """Gain to target LUFS (measured with ffmpeg ebur128) + true-peak limiting, encode,
    re-measure the encoded file and iterate until both targets hold."""
    gain_db = 0.0
    ceiling_db = tp_pre
    wav = Path(scratch) / f"{name}.wav"
    out = OUT_DIR / f"{name}.m4a"
    for it in range(max_iter):
        for _ in range(4):
            y, gr = tp_limit(x * undb(gain_db), undb(ceiling_db))
            write_wav_f32(wav, y)
            m = ebur128(wav)
            err = target - m["I"]
            vlog(f"    [{name}] pre-encode iter: gain {gain_db:+.2f} dB, I {m['I']:.2f}, TP {m['TP']:.2f}, GR {gr:.2f} dB")
            if abs(err) < 0.05:
                break
            gain_db += err
        encode_aac(wav, out)
        mf = ebur128(out)
        log(f"    [{name}] encoded: I {mf['I']:.1f} LUFS, TP {mf['TP']:.1f} dBTP (ceiling {ceiling_db:.2f}, limiter GR {gr:.2f} dB)")
        ok_tp = mf["TP"] <= tp_final - 0.1
        ok_i = abs(mf["I"] - target) <= 0.3
        if ok_tp and ok_i:
            return y, out, wav, mf, gr
        if not ok_tp:
            ceiling_db -= (mf["TP"] - (tp_final - 0.3))
        if not ok_i:
            gain_db += target - mf["I"]
    raise RuntimeError(f"{name}: could not meet loudness/true-peak targets")


# ----------------------------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------------------------
def k_weight_mag(f):
    """|H(f)| of the BS.1770 K-weighting pre-filter (two biquads, 48 kHz coefficients)."""
    z = np.exp(-2j * np.pi * f / SR)
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    h = lambda b, a: (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return np.abs(h(b1, a1) * h(b2, a2))


def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])


def analyze(x, label, master_ref=None):
    """Objective checks + per-scene table. Returns (report_lines, failures)."""
    fails = []
    lines = []
    if not np.isfinite(x).all():
        fails.append("NaN/inf present")
        x = np.nan_to_num(x)
    n = x.shape[-1]
    peak = np.abs(x).max()
    tp = db(true_peak_per_sample(x).max())
    dc = np.abs(x.mean(axis=1)).max()
    dmax = np.abs(np.diff(x, axis=1)).max()
    lines.append(f"  [{label}] samples {n} ({n / SR:.4f} s), sample peak {db(peak):.2f} dBFS, "
                 f"true peak (4x) {tp:.2f} dBTP, |DC| max {dc:.2e}, max |dx| {dmax:.4f} ({db(dmax):.1f} dBFS)")
    if peak >= 1.0:
        fails.append(f"{label}: clipping (peak {peak:.3f})")
    if dc > 1e-4:
        fails.append(f"{label}: DC offset {dc:.2e}")
    # click score: |dx| relative to the local (100 ms) RMS of dx; band-limited noise/tones stay
    # around 4-7, an isolated discontinuity stands far above its surroundings
    d = np.diff(x, axis=1)
    w = SR // 10
    c = np.cumsum(np.pad(d ** 2, ((0, 0), (w // 2 + 1, w // 2))), axis=1)
    ref = np.sqrt(np.maximum((c[:, w:] - c[:, :-w])[:, : d.shape[1]] / w, 1e-8))
    score = float((np.abs(d) / ref).max())
    lines.append(f"  [{label}] click score (max |dx| / local RMS(dx)) {score:.1f}")
    if dmax > 0.2 or score > 12.0:
        fails.append(f"{label}: possible click (max |dx| {dmax:.3f}, click score {score:.1f})")
    if master_ref is not None:
        hf = fft_apply(x, lambda f: hp_mag(f, 15000.0, 8))
        hfp = db(np.abs(hf).max())
        lines.append(f"  [{label}] click detector: peak of >15 kHz residual {hfp:.1f} dBFS (content is band-limited below ~11 kHz)")
        if hfp > -60.0:
            fails.append(f"{label}: >15 kHz residual {hfp:.1f} dBFS (clicks/aliasing)")
    edge0 = np.abs(x[:, :48]).max()
    edge1 = np.abs(x[:, -480:]).max()
    lines.append(f"  [{label}] start (1 ms) max {db(edge0):.1f} dBFS, end (10 ms) max {db(edge1):.1f} dBFS")
    if edge1 > undb(-60):
        fails.append(f"{label}: does not fade to silence at the end")

    kw = fft_apply(x, k_weight_mag)
    rows = []
    for s in range(len(SCENES)):
        a, b = t2s(CUTS[s]), min(n, t2s(CUTS[s + 1]))
        seg = x[:, a:b]
        rms = db(np.sqrt(np.mean(seg ** 2)))
        lk = -0.691 + 10 * np.log10(np.sum(np.mean(kw[:, a:b] ** 2, axis=1)) + 1e-20)
        mid = seg.mean(axis=0)
        M = np.abs(np.fft.rfft(mid * np.hanning(len(mid))))
        P = M ** 2
        f = np.fft.rfftfreq(len(mid), 1.0 / SR)
        band = f >= 20
        cen = float(np.sum(f[band] * M[band]) / np.sum(M[band]))   # magnitude-weighted centroid
        cenp = float(np.sum(f[band] * P[band]) / np.sum(P[band]))  # power-weighted centroid
        hf6 = float(np.sum(P[f >= 6000]) / np.sum(P[band]) * 100)   # % of power above 6 kHz
        corr = float(np.corrcoef(seg[0], seg[1])[0, 1])
        rows.append(dict(scene=s, rms=rms, lk=lk, cen=cen, cenp=cenp, hf6=hf6, corr=corr, pk=db(np.abs(seg).max())))
    ref = rows[7]["rms"]
    meas_rel = np.array([r["rms"] - ref for r in rows])
    rho = spearman(meas_rel, np.array(INTENDED_DB))
    lines.append(f"  [{label}] per-scene table (RMS = stereo RMS dBFS; LK = K-weighted loudness, LUFS-like; rel = RMS vs SCADA scene)")
    lines.append("    scene            time        RMS     LK    peak   rel  intended  dev   centroid(mag/pow)  >6k%  L/R corr")
    for r, it in zip(rows, INTENDED_DB):
        s = r["scene"]
        dev = (r["rms"] - ref) - it
        lines.append(f"    {s} {SCENES[s]:<14} {CUTS[s]:4.0f}-{CUTS[s + 1]:<4.0f}  {r['rms']:6.1f} {r['lk']:6.1f} {r['pk']:6.1f} "
                     f"{r['rms'] - ref:+5.1f}  {it:+6.1f}  {dev:+5.1f}  {r['cen']:6.0f} /{r['cenp']:5.0f} Hz  {r['hf6']:5.2f}   {r['corr']:+.2f}")
        if abs(dev) > 2.5:
            fails.append(f"{label}: scene {s} RMS deviates {dev:+.1f} dB from intended curve")
        if not (250.0 <= r["cen"] <= 3500.0):
            fails.append(f"{label}: scene {s} spectral centroid {r['cen']:.0f} Hz out of range")
        if r["hf6"] > 3.0:
            fails.append(f"{label}: scene {s} too much energy above 6 kHz ({r['hf6']:.2f} %)")
        if r["corr"] <= 0.1:
            fails.append(f"{label}: scene {s} stereo correlation {r['corr']:.2f}")
    lines.append(f"  [{label}] energy curve rank correlation (Spearman) vs intended: {rho:.2f}; loudest scene: {SCENES[int(np.argmax([r['rms'] for r in rows]))]}")
    if rho < 0.8:
        fails.append(f"{label}: energy curve rank correlation {rho:.2f} < 0.8")
    if int(np.argmax([r["rms"] for r in rows])) != 7:
        fails.append(f"{label}: SCADA scene is not the loudest")
    return lines, fails, rows


def envelope_print(x, step=1.0):
    vals = []
    for k in range(int(DUR / step)):
        seg = x[:, t2s(k * step):t2s((k + 1) * step)]
        vals.append(db(np.sqrt(np.mean(seg ** 2))))
    out = []
    for k in range(0, len(vals), 10):
        out.append("    " + " ".join(f"{v:6.1f}" for v in vals[k:k + 10]) + f"   ({k * step:.0f}-{min(DUR, (k + 10) * step):.0f} s)")
    return out


def sync_check(layers):
    """Impacts must start exactly at 6.0 / 83.0 s; risers must end exactly at their cuts."""
    fails = []
    imp = np.abs(layers["impacts"]).max(axis=0)
    ris = np.abs(layers["risers"]).max(axis=0)
    msg = []
    for t in (6.0, 83.0):
        seg = imp[t2s(t - 0.5):t2s(t + 0.5)]
        on = t - 0.5 + np.argmax(seg > seg.max() * undb(-40)) / SR
        msg.append(f"impact {t:.0f}s onset {on:.4f}")
        if abs(on - t) > 0.003:
            fails.append(f"impact at {t} s starts at {on:.4f} s")
    for t in (6.0, 31.0, 52.0, 71.0):
        seg = ris[t2s(t - 4.0):t2s(t + 0.5)]
        end = t - 4.0 + (len(seg) - 1 - np.argmax(seg[::-1] > seg.max() * undb(-60))) / SR
        msg.append(f"riser->{t:.0f}s ends {end:.4f}")
        if abs(end - t) > 0.003:
            fails.append(f"riser into {t} s ends at {end:.4f} s")
    log("  sync: " + ", ".join(msg))
    return fails


# ----------------------------------------------------------------------------------------
# Whoosh
# ----------------------------------------------------------------------------------------
def render_whoosh():
    rng = rng_for("whoosh")
    dur = 1.2
    n = t2s(dur)
    t = np.arange(n) / SR
    common = rng.standard_normal(n)
    x = np.stack([0.55 * common + 0.83 * rng.standard_normal(n), 0.55 * common + 0.83 * rng.standard_normal(n)])
    lf = np.log2([380.0, 2300.0, 750.0])

    def fc_of(tt):
        p = np.clip(tt / dur, 0, 1)
        up = np.clip(p / 0.52, 0, 1)
        dn = np.clip((p - 0.52) / 0.48, 0, 1)
        l = np.where(p < 0.52, lf[0] + (lf[1] - lf[0]) * (0.5 - 0.5 * np.cos(np.pi * up)),
                     lf[1] + (lf[2] - lf[1]) * (0.5 - 0.5 * np.cos(np.pi * dn)))
        return 2.0 ** l

    def mag(times, freqs):
        fc = fc_of(times)[:, None]
        return (bp_log(freqs[None, :], fc, 0.85) * (1000.0 / np.maximum(freqs, 100.0)) ** 0.25
                * lp_mag(freqs, 8000.0, 3) * hp_mag(freqs, 150.0, 2))

    y = stft_shape(x, mag, nfft=1024, hop=256)
    y /= np.std(y)
    p = t / dur
    up = np.sin(0.5 * np.pi * np.clip(p / 0.55, 0, 1)) ** 2.2
    dn = np.cos(0.5 * np.pi * np.clip((p - 0.55) / 0.45, 0, 1)) ** 1.6
    env = np.where(p < 0.55, up, dn)
    y *= env
    pan = -0.5 + 1.0 * (0.5 - 0.5 * np.cos(np.pi * p))
    gl, gr = pan_gains(pan)
    y = np.stack([y[0] * gl, y[1] * gr])
    ir = make_ir(rng_for("whoosh-ir"), length=0.9, predelay=0.01)
    wet = np.stack([fft_convolve(y[0], ir[0]), fft_convolve(y[1], ir[1])])
    y = y + 0.22 * wet
    apply_edges(y, t2s(0.005), t2s(0.08))
    return y


def analyze_whoosh(x):
    fails = []
    lines = []
    if not np.isfinite(x).all():
        fails.append("whoosh: NaN/inf")
    tp = db(true_peak_per_sample(x).max())
    dmax = np.abs(np.diff(x, axis=1)).max()
    dc = np.abs(x.mean(axis=1)).max()
    M = np.abs(np.fft.rfft(x.mean(axis=0)))
    f = np.fft.rfftfreq(x.shape[1], 1.0 / SR)
    cen = float(np.sum(f * M) / np.sum(M))
    corr = float(np.corrcoef(x[0], x[1])[0, 1])
    hfp = db(np.abs(fft_apply(x, lambda f: hp_mag(f, 15000.0, 8), pad=SR // 2)).max())
    lines.append(f"  [whoosh] {x.shape[1]} samples ({x.shape[1] / SR:.3f} s), true peak {tp:.2f} dBTP, max |dx| {dmax:.4f}, "
                 f">15 kHz residual {hfp:.0f} dBFS, |DC| {dc:.1e}, centroid {cen:.0f} Hz, L/R corr {corr:+.2f}, "
                 f"edges {db(np.abs(x[:, :24]).max()):.0f}/{db(np.abs(x[:, -240:]).max()):.0f} dBFS")
    if hfp > -60.0:
        fails.append("whoosh: click / discontinuity")
    if np.abs(x[:, -240:]).max() > undb(-60):
        fails.append("whoosh: end not silent")
    if not 300 <= cen <= 3000:
        fails.append(f"whoosh: centroid {cen:.0f} Hz")
    return lines, fails


# ----------------------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------------------
def main():
    global VERBOSE
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scratch", default=os.environ.get("MUSIC_SCRATCH", DEFAULT_SCRATCH),
                    help="directory for intermediate WAVs (outside the repo)")
    ap.add_argument("--verbose", action="store_true", help="print per-layer stats and 1 s RMS envelope")
    args = ap.parse_args()
    VERBOSE = args.verbose
    scratch = Path(args.scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    log("Chord plan (time -> chord / bass):")
    for c in CHORDS:
        log(f"  {c['t0']:6.2f}-{c['t1']:6.2f}  {SCENES[c['scene']]:<14} {c['name']:<9} bass {c['bass']}")
    log("Rendering bed ...")
    mix, layers = render_bed()
    if VERBOSE:
        log("  per-layer RMS by scene (dBFS, pre-normalization):")
        log("    layer     " + " ".join(f"{s[:7]:>8}" for s in SCENES))
        for k, v in layers.items():
            vals = [db(np.sqrt(np.mean(v[:, t2s(CUTS[s]):t2s(CUTS[s + 1])] ** 2))) for s in range(len(SCENES))]
            log(f"    {k:<9} " + " ".join(f"{x:8.1f}" for x in vals))
    write_wav_f32(scratch / "well-testing-bed-raw.wav", mix)
    sync_fails = sync_check(layers)

    log("Mastering bed (ffmpeg ebur128 loop) ...")
    final, out, wav, meas, gr = master(mix, "well-testing-bed", scratch, TARGET_LUFS, TP_PRE, TP_LIMIT)

    log("Rendering whoosh ...")
    wh = render_whoosh()
    log("Mastering whoosh ...")
    wh_final, wh_out, wh_wav, wh_meas, _ = master(wh, "whoosh", scratch, WHOOSH_LUFS, -7.0, WHOOSH_TP_MAX)

    # ------------------------------------------------------------------ validation
    log("\nValidation")
    fails = list(sync_fails)
    lines, f1, _ = analyze(final, "master wav", master_ref=True)
    fails += f1
    dec = decode(out)
    lines2, f2, rows = analyze(dec[:, :N], "decoded m4a")
    fails += f2
    for l in lines + lines2:
        log(l)
    if VERBOSE:
        log("  1 s RMS envelope of decoded m4a (dBFS):")
        for l in envelope_print(dec[:, :N]):
            log(l)
    probe = ffprobe(out)
    dur = float(probe["format"]["duration"])
    st = probe["streams"][0]
    log(f"  [ffprobe bed] duration {dur:.6f} s, codec {st['codec_name']}, {st['sample_rate']} Hz, "
        f"{st['channels']} ch, stream bit_rate {int(st.get('bit_rate', 0)) / 1000:.0f} kb/s, decoded samples {dec.shape[1]}")
    if abs(dur - DUR) > 0.01:
        fails.append(f"bed duration {dur:.4f} s != 90.0 s")
    extra = dec[:, N:]
    log(f"  [decode bed] {dec.shape[1]} samples = {N} + {extra.shape[1]} AAC end-padding samples "
        f"(container duration trims them; padding max {db(np.abs(extra).max()) if extra.size else -240:.0f} dBFS)")
    if dec.shape[1] < N or extra.shape[1] > 1024 or (extra.size and np.abs(extra).max() > undb(-80)):
        fails.append(f"decoded bed has {dec.shape[1]} samples, expected {N} (+ silent AAC padding)")
    log(f"  [ebur128 bed m4a] integrated {meas['I']:.1f} LUFS, LRA {meas['LRA']:.1f} LU, true peak {meas['TP']:.1f} dBTP")
    if meas["TP"] > TP_LIMIT or abs(meas["I"] - TARGET_LUFS) > 0.5:
        fails.append("bed loudness/true peak out of spec")

    wl, wf = analyze_whoosh(wh_final)
    for l in wl:
        log(l)
    fails += wf
    wprobe = ffprobe(wh_out)
    wdur = float(wprobe["format"]["duration"])
    log(f"  [ffprobe whoosh] duration {wdur:.6f} s; [ebur128 whoosh m4a] I {wh_meas['I']:.1f} LUFS, TP {wh_meas['TP']:.1f} dBTP")
    if abs(wdur - 1.2) > 0.01:
        fails.append(f"whoosh duration {wdur:.4f}")

    log(f"\nOutputs:\n  {out}\n  {wh_out}\n  intermediates: {wav}, {wh_wav}")
    if fails:
        log("\nFAILED CHECKS:")
        for f in fails:
            log("  - " + f)
        sys.exit(1)
    log("\nAll checks passed.")


if __name__ == "__main__":
    main()
