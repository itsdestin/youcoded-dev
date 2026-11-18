"""Sound kit for the "you coded that." campaign music (pure numpy, 48 kHz).

WHY a fresh kit instead of reusing scripts/promo/music/synth.py: that module runs at 44.1 kHz and
carries an older draft's sound (chiptune/supersaw voices). This kit is written for the campaign's
sound: felt/electric-piano FM tines, round sub bass, soft drums, glassy plucks. No scipy needed:
all filtering is zero-phase FFT shaping, so it never shifts a hit in time.
"""
from __future__ import annotations

import numpy as np

SR = 48000


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def tt(n):
    return np.arange(n) / SR


# ---------------------------------------------------------------- filtering (zero-phase, FFT)
def fft_shape(x, gain_fn):
    """Apply a magnitude-only filter to x (last axis = time). Zero phase: no timing shift."""
    n = x.shape[-1]
    nf = 1 << int(np.ceil(np.log2(n + 8192)))
    X = np.fft.rfft(x, nf, axis=-1)
    f = np.fft.rfftfreq(nf, 1.0 / SR)
    X = X * gain_fn(f)
    return np.fft.irfft(X, nf, axis=-1)[..., :n]


def lp(fc, order=2):
    return lambda f: 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def hp(fc, order=2):
    return lambda f: 1.0 / np.sqrt(1.0 + (fc / np.maximum(f, 1e-6)) ** (2 * order))


def bp(lo, hi, order=2):
    a, b = lp(hi, order), hp(lo, order)
    return lambda f: a(f) * b(f)


def lowpass(x, fc, order=2):
    return fft_shape(x, lp(fc, order))


def highpass(x, fc, order=2):
    return fft_shape(x, hp(fc, order))


def bandpass(x, lo, hi, order=2):
    return fft_shape(x, bp(lo, hi, order))


# ---------------------------------------------------------------- reverb
def make_ir(rt60, seconds, seed, lp_hz=4200.0, hp_hz=180.0, predelay=0.018):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = tt(n)
    ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)])
    ir *= np.exp(-t * 6.9078 / rt60) * (1 - np.exp(-t / 0.025))
    ir = fft_shape(ir, lambda f: lp(lp_hz, 2)(f) * hp(hp_hz, 2)(f))
    pd = int(predelay * SR)
    ir = np.concatenate([np.zeros((2, pd)), ir], axis=1)
    ir /= np.sqrt(np.sum(ir ** 2) / 2) + 1e-9
    return ir


def convolve_ir(x, ir):
    """x: (2,n) or (n,); returns (2,n) wet signal, same length as x."""
    if x.ndim == 1:
        x = np.stack([x, x])
    n = x.shape[-1]
    nf = 1 << int(np.ceil(np.log2(n + ir.shape[-1])))
    X = np.fft.rfft(x, nf, axis=-1)
    # cross-feed so a mono source blooms in stereo: L in -> IR_L, R in -> IR_R (decorrelated)
    Y = X * np.fft.rfft(ir, nf, axis=-1)
    return np.fft.irfft(Y, nf, axis=-1)[:, :n]


# ---------------------------------------------------------------- buffer helpers
def add(buf, sig, t, gain=1.0, pan=0.0):
    """Mix sig (mono (n,) or stereo (2,n)) into buf (2,N) at time t seconds (sample rounded)."""
    i = int(round(t * SR))
    if i >= buf.shape[1] or i + sig.shape[-1] <= 0:
        return
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    s0 = max(0, -i)
    n = min(sig.shape[1] - s0, buf.shape[1] - max(i, 0))
    buf[:, max(i, 0):max(i, 0) + n] += gain * sig[:, s0:s0 + n]


def sidechain(n, times, depth, tau):
    env = np.ones(n)
    L = int(0.6 * SR)
    t = tt(L)
    d = 1 - depth * np.exp(-t / tau) * np.minimum(1.0, t / 0.004)
    for tm in times:
        i = int(round(tm * SR))
        if i >= n:
            continue
        m = min(L, n - i)
        env[i:i + m] = np.minimum(env[i:i + m], d[:m])
    return env


# ---------------------------------------------------------------- pitched voices
def ep_note(freq, dur, vel=1.0, tau=0.5, bright=1.0, cents=3.5):
    """Felt/electric-piano tine: soft FM (ratio 1) with a fast-fading bark. Returns (2,n)."""
    n = int(dur * SR)
    t = tt(n)
    out = np.zeros((2, n))
    for k, c in enumerate((-cents, cents)):
        f = freq * 2 ** (c / 1200)
        ph = 2 * np.pi * f * t
        idx = bright * (1.0 * np.exp(-t / 0.22) + 0.10)
        y = np.sin(ph + idx * np.sin(ph)) + 0.07 * np.sin(2 * ph) * np.exp(-t / 0.07)
        w = (0.8, 0.2) if k == 0 else (0.2, 0.8)
        out[0] += w[0] * y
        out[1] += w[1] * y
    env = np.minimum(1.0, t / 0.002) * np.exp(-t / tau)
    rel = min(int(0.05 * SR), n)
    env[-rel:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, rel)))
    return out * env * vel * 0.30


def pluck(freq, dur=1.2, vel=1.0, tau=0.22):
    """Round, glassy mallet-pluck (kalimba/marimba hybrid). mono (n,)."""
    n = int(dur * SR)
    t = tt(n)
    ph = 2 * np.pi * freq * t
    y = (np.sin(ph) + 0.35 * np.sin(2 * ph) * np.exp(-t / 0.12)
         + 0.10 * np.sin(3.01 * ph) * np.exp(-t / 0.05))
    env = np.minimum(1.0, t / 0.002) * np.exp(-t / tau)
    rel = min(int(0.03 * SR), n)
    env[-rel:] *= np.linspace(1, 0, rel)
    return y * env * vel * 0.32


def bass_note(midi_note, dur, vel=1.0):
    """Round sub: sine + a little 2nd harmonic for small speakers. mono."""
    n = int(dur * SR)
    t = tt(n)
    f = float(mtof(midi_note))
    y = np.sin(2 * np.pi * f * t) + 0.30 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.25)
    env = np.minimum(1.0, t / 0.006) * (0.6 + 0.4 * np.exp(-t / 0.3))
    rel = min(int(0.04 * SR), n)
    env[-rel:] *= np.linspace(1, 0, rel)
    return y * env * vel * 0.55


def pad_note(freqs, dur, g0=1.0, g1=1.0, att=0.35, rel=0.45):
    """Warm pad: detuned triangle/sine stack, softened later by a layer low-pass. (2,n)."""
    n = int(dur * SR)
    t = tt(n)
    out = np.zeros((2, n))
    for i, f in enumerate(freqs):
        for c, ch in ((-6, 0), (6, 1)):
            ff = f * 2 ** (c / 1200)
            ph = 2 * np.pi * ff * t + i * 1.3
            tri = (2 / np.pi) * np.arcsin(np.sin(ph))
            out[ch] += 0.7 * tri + 0.5 * np.sin(ph)
    a = np.minimum(1.0, t / att)
    a = 0.5 - 0.5 * np.cos(np.pi * a)
    r = np.clip((dur - t) / rel, 0, 1)
    r = 0.5 - 0.5 * np.cos(np.pi * r)
    g = g0 + (g1 - g0) * t / dur
    return out * a * r * g * 0.055


# ---------------------------------------------------------------- drums (cached one-shots)
_rng = np.random.default_rng(7)


def kick(length=0.5, punch=1.0):
    n = int(length * SR)
    t = tt(n)
    f = 46 + 120 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t / 0.20)
    click = lowpass(_rng.standard_normal(n), 2500) * np.exp(-t / 0.003) * 0.35 * punch
    y = np.tanh(1.5 * (y + click)) / 1.2
    rel = int(0.02 * SR)
    y[-rel:] *= np.linspace(1, 0, rel)
    return y * 0.95


def clap(length=0.35):
    n = int(length * SR)
    t = tt(n)
    nz = _rng.standard_normal(n)
    env = np.zeros(n)
    for off, a in ((0.0, 0.8), (0.011, 0.9), (0.022, 1.0)):
        i = int(off * SR)
        env[i:] += a * np.exp(-t[:n - i] / 0.007)
    env += 0.55 * np.exp(-np.maximum(t - 0.022, 0) / 0.07) * (t > 0.022)
    y = bandpass(nz, 900, 4200) * env
    y = lowpass(y, 5500)
    return y * 0.45


def snap(length=0.18):
    n = int(length * SR)
    t = tt(n)
    nz = bandpass(_rng.standard_normal(n), 1500, 4500, 3)
    y = nz * np.exp(-t / 0.022) * 1.4 + 0.5 * np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.012)
    return np.minimum(1, t / 0.0008) * y * 0.22


def hat(length=0.12):
    n = int(length * SR)
    t = tt(n)
    y = bandpass(_rng.standard_normal(n), 4200, 6500, 2) * np.exp(-t / 0.022)
    return np.minimum(1, t / 0.0006) * y * 0.55


def shaker(length=0.16):
    n = int(length * SR)
    t = tt(n)
    env = np.minimum(1, t / 0.012) * np.exp(-t / 0.035)
    y = bandpass(_rng.standard_normal(n), 2500, 6000, 2) * env
    return y * 0.8


def rim(length=0.12):
    n = int(length * SR)
    t = tt(n)
    y = (np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.012)
         + 0.4 * bandpass(_rng.standard_normal(n), 1200, 4000) * np.exp(-t / 0.006))
    return np.minimum(1, t / 0.0005) * y * 0.45


def boom(length=2.4, f0=36.7):
    """Sub boom for hits: a clean sine that dips a little in pitch then rings. mono."""
    n = int(length * SR)
    t = tt(n)
    f = f0 * (1 + 0.35 * np.exp(-t / 0.05))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t / 0.9) * np.minimum(1, t / 0.004)
    rel = int(0.05 * SR)
    y[-rel:] *= np.linspace(1, 0, rel)
    return y * 0.8


def air(length=1.6, tau=0.5):
    """Soft breathy noise tail for hits (band-limited well under 6 kHz). (2,n)"""
    n = int(length * SR)
    t = tt(n)
    out = np.stack([bandpass(_rng.standard_normal(n), 500, 5000, 2) for _ in range(2)])
    out *= np.minimum(1, t / 0.004) * np.exp(-t / tau)
    rel = int(0.04 * SR)
    out[:, -rel:] *= np.linspace(1, 0, rel)
    return out * 0.10


def riser(dur, level=1.0):
    """Rising filtered-noise swell + a gliding sine, ends on a 15 ms fade. (2,n)"""
    n = int(dur * SR)
    t = tt(n)
    x = t / dur
    out = np.zeros((2, n))
    edges = [300, 600, 1100, 1900, 3000, 4800]
    for k in range(len(edges) - 1):
        for ch in range(2):
            band = bandpass(_rng.standard_normal(n), edges[k], edges[k + 1], 2)
            gate = np.clip((x - 0.1 - 0.13 * k) / 0.35, 0, 1) ** 1.5
            out[ch] += band * gate
    out *= (x ** 2.2) * 0.30
    # pitch-glide sine D4 -> D5 for tonal direction
    f = 293.66 * 2 ** x
    ph = 2 * np.pi * np.cumsum(f) / SR
    g = np.sin(ph) * (x ** 3) * 0.05
    out += g
    rel = int(0.015 * SR)
    out[:, -rel:] *= np.linspace(1, 0, rel)
    return out * level
