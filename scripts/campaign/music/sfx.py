"""Tiny, soft UI sounds in the same key (C) as the score. Every function returns a mono float array at 48 kHz,
peak-normalised to 1.0 so mix.py can place it at an exact level. All are deterministic given the rng."""
import numpy as np
from dsp import SR, lp, hp, bp

def _t(sec): return np.arange(int(sec * SR)) / SR
def _norm(x): return x / (np.abs(x).max() + 1e-12)
def _fade(x, ms=3):
    n = int(ms * SR / 1000); x = x.copy(); x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n); return x

def key(rng):
    """Soft muted key tick: a short damped thump + a bright-ish noise click; pitch (+-2 semitones) and brightness vary per press.
    WHY: the old tick was 94% below 500 Hz, where the music masks it, and every press was nearly identical (machine-gun).
    Now the click carries energy at 2-4 kHz (where it cuts through at low level) and each press picks one of three
    brightness variants, so a burst of typing sounds like fingers, not a sample repeated."""
    t = _t(0.06)
    f = 190 * 2 ** (rng.uniform(-2.0, 2.0) / 12)
    bright = (0.8, 1.0, 1.3)[int(rng.integers(0, 3))]              # three brightness variants
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.010)
    lo, hi = 1800 * bright, min(7000, 5200 * bright)
    click = lp(bp(rng.standard_normal(len(t)), lo, hi), min(8000, rng.uniform(4200, 5400) * bright), 2) * np.exp(-t / 0.0035)
    return _fade(_norm(0.35 * body + 0.9 * _norm(click)), 2) * 10 ** (rng.uniform(-1.5, 0) / 20)

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
    """Very subtle ~0.4 s filtered-noise pass: band sweeps ~600 -> 4500 Hz, peaking 0.05 s after the cue.
    WHY: the old whoosh sat in 500-2k and peaked 0.2 s late, so it was masked and arrived after the picture moved.
    Now it has real 2-4 kHz air and a fast 50 ms rise, then a soft 0.35 s fall."""
    n = int(0.4 * SR); t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    # crossfade between three fixed band-passes to fake a sweep (cheap and click-free)
    a, b, c = bp(nz, 450, 1100), bp(nz, 1100, 2400), bp(nz, 2200, 5200)
    a, b, c = a / a.std(), b / b.std(), c / c.std()   # equal power per band so the loudness peak follows the envelope (peak at ~50 ms), not the wider top band
    u = np.clip(t / 0.3, 0, 1)
    # power-complementary (cos/sin) crossfade keeps the total loudness constant through the sweep
    ang = u * np.pi
    wa = np.where(u < 0.5, np.cos(ang), 0.0); wc = np.where(u > 0.5, -np.cos(ang), 0.0); wb = np.abs(np.sin(ang))
    x = a * wa + b * wb + c * wc
    env = np.where(t < 0.05, np.sin(0.5 * np.pi * t / 0.05) ** 2, np.cos(0.5 * np.pi * np.clip((t - 0.05) / 0.35, 0, 1)) ** 2)
    return _fade(_norm(lp(x, 6500, 2) * env), 5)

def pop(rng):
    """Soft rounded tick for something appearing: 520 Hz sine gliding down slightly."""
    t = _t(0.09)
    f = 560 - 90 * (t / 0.09)
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.004) ** 2 * np.exp(-t / 0.026)
    return _fade(_norm(lp(w, 3500)), 3)

def toggle(rng):
    """Soft switch: two tiny ticks 45 ms apart, the second a little lower and softer.
    WHY: was 98% in 500-2k; now each tick is a short 2.4-3.2 kHz 'tock' plus a band-limited 2-5.5 kHz click so it
    reads as a soft UI switch even 20+ dB under the music, while the top is rolled off (no hiss, nothing toy-like)."""
    out = np.zeros(int(0.14 * SR))
    for d, f, g in [(0.0, 3200, 1.0), (0.045, 2400, 0.7)]:
        t = _t(0.05)
        w = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) + 0.9 * lp(bp(rng.standard_normal(len(t)), 2000, 5500), 6000) * np.exp(-t / 0.003)) * g
        o = int(d * SR); out[o:o + len(w)] += w
    return _fade(_norm(lp(out, 6500)), 2)

KIT = dict(key=key, send=send, bloom=bloom, whoosh=whoosh, pop=pop, toggle=toggle)
# nominal level of each sound relative to the "SFX reference" (dB); keys are tiny so they sit lower
# WHY: whoosh and toggle raised by 6 dB (they were 22-30 dB under the music and inaudible)
TRIM = dict(key=-4.0, send=0.0, bloom=-2.0, whoosh=1.0, pop=-1.0, toggle=4.0)
