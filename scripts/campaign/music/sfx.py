"""Tiny, soft UI sounds in the same key (C) as the score. Every function returns a mono float array at 48 kHz,
peak-normalised to 1.0 so mix.py can place it at an exact level. All are deterministic given the rng."""
import numpy as np
from dsp import SR, lp, hp, bp

def _t(sec): return np.arange(int(sec * SR)) / SR
def _norm(x): return x / (np.abs(x).max() + 1e-12)
def _fade(x, ms=3):
    n = int(ms * SR / 1000); x = x.copy(); x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n); return x

def key(rng):
    """Soft muted key tick: a short damped thump + a dull noise click; pitch/brightness vary a little per press."""
    t = _t(0.06)
    f = 170 * 2 ** (rng.uniform(-0.9, 0.9) / 12)
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012)
    click = lp(bp(rng.standard_normal(len(t)), 900, 3200), rng.uniform(2200, 3000), 2) * np.exp(-t / 0.004)
    return _fade(_norm(0.8 * body + 0.5 * _norm(click)), 2) * 10 ** (rng.uniform(-1.5, 0) / 20)

def send(rng):
    """Soft upward two-note blip (G5 -> D6, both in the C add9 world)."""
    out = np.zeros(int(0.5 * SR))
    for i, (f, d) in enumerate([(784.0, 0.0), (1174.7, 0.095)]):
        t = _t(0.35)
        w = (np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)) * np.minimum(1, t / 0.006) ** 2 * np.exp(-t / 0.09)
        o = int(d * SR); out[o:o + len(w)] += w * (0.8 if i == 0 else 1.0)
    return _fade(_norm(lp(out, 5000)), 3)

def bloom(rng):
    """Airy ~1.2 s swell: filtered noise + a soft C-add9 shimmer (C6 E6 G6 D7), then a gentle fall."""
    t = _t(1.2)
    env = np.sin(np.pi * np.clip(t / 1.2, 0, 1) ** 0.8) ** 2
    nz = lp(hp(rng.standard_normal(len(t)), 1500), 6500, 2) * env * 0.5
    tones = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * a for f, a in [(1046.5, 1), (1318.5, .7), (1568.0, .6), (2349.3, .25)]) * env
    return _fade(_norm(lp(0.9 * _norm(tones) + nz / (np.abs(nz).max() + 1e-9) * 0.5, 7000, 2)), 12)

def whoosh(rng):
    """Very subtle ~0.4 s filtered-noise pass: band sweeps 500 -> 2800 Hz."""
    n = int(0.4 * SR); t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    # crossfade between three fixed band-passes to fake a sweep (cheap and click-free)
    a, b, c = bp(nz, 350, 800), bp(nz, 800, 1700), bp(nz, 1700, 3200)
    u = t / 0.4
    wa, wb, wc = np.clip(1 - u * 2, 0, 1), 1 - np.abs(u * 2 - 1), np.clip(u * 2 - 1, 0, 1)
    x = a * wa + b * wb + c * wc
    return _fade(_norm(x * np.sin(np.pi * u) ** 2), 5)

def pop(rng):
    """Soft rounded tick for something appearing: 520 Hz sine gliding down slightly."""
    t = _t(0.09)
    f = 560 - 90 * (t / 0.09)
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.004) ** 2 * np.exp(-t / 0.026)
    return _fade(_norm(lp(w, 3500)), 3)

def toggle(rng):
    """Soft switch: two tiny ticks 45 ms apart, the second a little lower and softer."""
    out = np.zeros(int(0.14 * SR))
    for d, f, g in [(0.0, 1500, 1.0), (0.045, 950, 0.7)]:
        t = _t(0.05)
        w = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008) + 0.4 * lp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.003)) * g
        o = int(d * SR); out[o:o + len(w)] += w
    return _fade(_norm(lp(out, 4200)), 2)

KIT = dict(key=key, send=send, bloom=bloom, whoosh=whoosh, pop=pop, toggle=toggle)
# nominal level of each sound relative to the "SFX reference" (dB); keys are tiny so they sit lower
TRIM = dict(key=-4.0, send=0.0, bloom=-2.0, whoosh=-5.0, pop=-1.0, toggle=-2.0)
