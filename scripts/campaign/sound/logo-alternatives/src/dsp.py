"""Low-level signal processing for the "felt and pulse" sound.

Everything works on numpy float64 arrays at 48 kHz. Stereo signals are shaped (n, 2).
WHY hand-written: the previous campaign music came from a General MIDI soundfont and sounded
cheap; here every electronic sound is built from band-limited oscillators, real filters and
a proper convolution reverb so the result can be checked and re-rendered exactly.
"""
from fractions import Fraction

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 48000
_rng = np.random.default_rng(20261120)


def rng(seed=None):
    return np.random.default_rng(seed) if seed is not None else _rng


# ---------------------------------------------------------------- basics

def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


_NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name):
    """'Bb4' -> 70, 'F#3' -> 54 (C4 = 60)."""
    if isinstance(name, (int, np.integer)):
        return int(name)
    letter, rest = name[0].upper(), name[1:]
    acc = 0
    while rest and rest[0] in "b#":
        acc += -1 if rest[0] == "b" else 1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + _NOTE[letter] + acc


def db(x):
    return 20.0 * np.log10(np.maximum(np.abs(x), 1e-12))


def undb(d):
    return 10.0 ** (np.asarray(d) / 20.0)


def to_stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def pan(x, p):
    """Constant-power pan of a mono signal; p in [-1, 1]."""
    a = (p + 1.0) * np.pi / 4.0
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2.0)


def place(buf, sig, t, gain=1.0):
    """Mix sig into buf starting at time t (seconds); clips to the buffer."""
    sig = to_stereo(sig) * gain
    i = int(round(t * SR))
    if i < 0:
        sig, i = sig[-i:], 0
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def fade(x, fin=0.0, fout=0.0):
    """Raised-cosine fades (seconds) so nothing starts or ends with a click."""
    x = x.copy()
    n = len(x)
    for length, rev in ((fin, False), (fout, True)):
        k = min(n, int(length * SR))
        if k > 1:
            w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, k))
            if x.ndim == 2:
                w = w[:, None]
            if rev:
                x[n - k:] *= w[::-1]
            else:
                x[:k] *= w
    return x


def env_adsr(n, a, d, s, r, gate):
    """ADSR envelope, n samples, gate = seconds the key is held."""
    t = np.arange(n) / SR
    a = max(a, 1e-4)
    e = np.where(t < a, (t / a), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    # smooth attack curve (sine-ish) instead of a linear corner
    e = np.where(t < a, np.sin(0.5 * np.pi * np.clip(t / a, 0, 1)), e)
    g = int(gate * SR)
    if g < n:
        level = e[g] if g < n else e[-1]
        rel = level * np.exp(-(t[g:] - t[g]) / max(r, 1e-4))
        e[g:] = rel
    return e


# ---------------------------------------------------------------- oscillators

def _polyblep(t, dt):
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1.0
    m2 = t > 1.0 - dt
    x = (t[m2] - 1.0) / dt[m2]
    y[m2] = x * x + x + x + 1.0
    return y


def saw(freq, n, phase0=0.0):
    """Band-limited sawtooth (polyBLEP). freq may be scalar or per-sample array."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,)).copy()
    dt = f / SR
    ph = (phase0 + np.cumsum(dt) - dt[0]) % 1.0
    return (2.0 * ph - 1.0) - _polyblep(ph, dt)


def sine(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = phase0 + 2 * np.pi * (np.cumsum(f) - f[0]) / SR
    return np.sin(ph)


def noise(n, seed=None):
    return rng(seed).standard_normal(n)


# ---------------------------------------------------------------- filters

def _rbj(kind, fc, q, gain_db=0.0):
    w = 2 * np.pi * np.clip(fc, 10, SR * 0.49) / SR
    cw, sw = np.cos(w), np.sin(w)
    alpha = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "bp":
        b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == "highshelf":
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b, a = np.array(b, float), np.array(a, float)
    return b / a[0], a / a[0]


def biquad(x, kind, fc, q=0.707, gain_db=0.0):
    b, a = _rbj(kind, fc, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def tv_biquad(x, kind, fc, q=0.707, block=32):
    """Time-varying biquad: fc is a per-sample array; coefficients update every `block`.

    WHY blocks: a per-sample Python loop would take minutes; 32-sample (0.7 ms) steps are far
    below audible zipper rates for the slow sweeps used here.
    """
    fc = np.broadcast_to(np.asarray(fc, float), (len(x),))
    y = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        seg = x[i:i + block]
        b, a = _rbj(kind, fc[min(i + block // 2, len(x) - 1)], q)
        if zi is None:
            zi = np.zeros((2,) + seg.shape[1:])
        y[i:i + block], zi = signal.lfilter(b, a, seg, axis=0, zi=zi)
    return y


def lp4(x, fc, res=0.0):
    """4-pole low-pass (two cascaded biquads), a soft 'analog' slope. res 0..1."""
    q1 = 0.54 + 0.3 * res
    q2 = 1.31 + 2.5 * res
    if np.ndim(fc) == 0:
        return biquad(biquad(x, "lp", fc, q1), "lp", fc, q2)
    return tv_biquad(tv_biquad(x, "lp", fc, q1), "lp", fc, q2)


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    return signal.lfilter([1 - a], [1, -a], x, axis=0)


def butter(x, kind, fc, order=4):
    sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def sat(x, drive=1.0):
    """Soft saturation, unity gain for small signals."""
    return np.tanh(x * drive) / drive


# ---------------------------------------------------------------- resampling

def resample_ratio(x, ratio):
    """Change length by `ratio` (out_len ~= len * ratio) with polyphase filtering."""
    fr = Fraction(ratio).limit_denominator(4000)
    return signal.resample_poly(x, fr.numerator, fr.denominator, axis=0, window=("kaiser", 8.0))


# ---------------------------------------------------------------- space

def make_ir(length=3.0, rt=(2.4, 2.6, 1.7, 0.9), predelay=0.018, seed=1, er=True, width=1.0):
    """Synthetic stereo reverb impulse response.

    Exponentially decaying noise split into four bands with their own decay times (low,
    mid, high, air) so the tail darkens naturally like a real room, plus sparse early
    reflections. Left and right use independent noise for a wide, decorrelated tail;
    `width` < 1 blends them toward each other so the reverb survives a mono fold-down.
    """
    n = int(length * SR)
    t = np.arange(n) / SR
    r = rng(seed)
    out = np.zeros((n, 2))
    edges = [(None, 250), (250, 2000), (2000, 6500), (6500, None)]
    base = [r.standard_normal(n) for _ in range(2)]
    for ch in range(2):
        tail = np.zeros(n)
        for (lo, hi), rt60 in zip(edges, rt):
            nb = base[ch]
            if lo is None:
                nb = butter(nb, "lowpass", hi, 4)
            elif hi is None:
                nb = butter(nb, "highpass", lo, 4)
            else:
                nb = butter(nb, "bandpass", [lo, hi], 4)
            tail += nb * np.exp(-6.91 * t / rt60)
        tail *= 1 - np.exp(-t / 0.012)  # diffusion build-up
        out[:, ch] = tail
    if width < 1.0:
        m = out.mean(axis=1, keepdims=True)
        out = m + (out - m) * width
    if er:
        for ch in range(2):
            for k in range(14):
                d = r.uniform(0.004, 0.07)
                g = 0.55 * np.exp(-d / 0.03) * r.choice([-1, 1])
                out[int(d * SR), ch] += g * 3.0
    pd = int(predelay * SR)
    out = np.concatenate([np.zeros((pd, 2)), out])[:n]
    out /= np.sqrt((out ** 2).sum(axis=0, keepdims=True))
    return out


def convolve(x, ir):
    x = to_stereo(x)
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return y


def pingpong(x, delay, fb=0.4, n=6, lp=4500.0, hp=300.0):
    """Ping-pong echo: each repeat swaps side, gets quieter and darker (tape-like)."""
    x = to_stereo(x)
    mono = x.mean(axis=1)
    out = np.zeros_like(x)
    d = int(delay * SR)
    y = butter(mono, "highpass", hp, 2)
    for k in range(1, n + 1):
        y = onepole_lp(y, lp) * fb
        ch = (k + 1) % 2
        if k * d < len(x):
            out[k * d:, ch] += y[: len(x) - k * d]
    return out


# ---------------------------------------------------------------- dynamics

def env_follow(x, attack, release, frame=48):
    """Peak-ish RMS envelope computed on 1 ms frames (fast), returned per frame."""
    m = to_stereo(x)
    p = (m ** 2).mean(axis=1)
    nf = int(np.ceil(len(p) / frame))
    p = np.pad(p, (0, nf * frame - len(p)))
    rms = np.sqrt(p.reshape(nf, frame).mean(axis=1))
    a = np.exp(-frame / (attack * SR))
    r = np.exp(-frame / (release * SR))
    e = np.zeros(nf)
    v = 0.0
    for i in range(nf):
        c = a if rms[i] > v else r
        v = c * v + (1 - c) * rms[i]
        e[i] = v
    return e


def compress(x, thresh_db, ratio, attack=0.02, release=0.25, makeup_db=0.0, knee=6.0):
    frame = 48
    e = env_follow(x, attack, release, frame)
    lv = db(e)
    over = lv - thresh_db
    # soft knee
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    g = undb(-gr + makeup_db)
    gs = np.interp(np.arange(len(x)), np.arange(len(g)) * frame + frame / 2, g)
    return x * (gs[:, None] if x.ndim == 2 else gs)


def true_peak(x, os=4):
    up = signal.resample_poly(to_stereo(x), os, 1, axis=0)
    return float(db(np.max(np.abs(up))))


def limit(x, ceiling_db=-1.3, lookahead=0.0015, release=0.12):
    """Look-ahead brickwall limiter on 4x-oversampled peaks (true-peak aware).

    The gain curve is the minimum of the required gain over a window, then averaged over the
    same window, so it always reaches the needed reduction before a peak arrives (no
    overshoot) and moves smoothly (no distortion clicks). Release is a one-pole recovery.
    """
    x = to_stereo(x)
    ceil = undb(ceiling_db)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(axis=1)
    pk = up[: (len(up) // 4) * 4].reshape(-1, 4).max(axis=1)
    pk = np.pad(pk, (0, len(x) - len(pk)), mode="edge")
    req = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    L = max(1, int(lookahead * SR))
    m = minimum_filter1d(req, size=2 * L + 1, mode="nearest")
    g = uniform_filter1d(m, size=2 * L + 1, mode="nearest")
    g = np.minimum(g, m)  # guard
    # release: frame-wise recursion (fast) then per-sample interpolation, never above g
    frame = 16
    nf = int(np.ceil(len(g) / frame))
    gp = np.pad(g, (0, nf * frame - len(g)), mode="edge").reshape(nf, frame).min(axis=1)
    rc = np.exp(-frame / (release * SR))
    out = np.empty(nf)
    v = 1.0
    for i in range(nf):
        v = gp[i] if gp[i] < v else rc * v + (1 - rc) * gp[i]
        out[i] = v
    gr = np.interp(np.arange(len(g)), np.arange(nf) * frame + frame / 2, out)
    gr = np.minimum(gr, g)
    return x * gr[:, None]


def ms_tidy(x, side_hp=140.0, width=1.0):
    """Keep everything below side_hp in mono (sub stays centred, survives any speaker)."""
    m = (x[:, 0] + x[:, 1]) / 2
    s = (x[:, 0] - x[:, 1]) / 2
    s = butter(s, "highpass", side_hp, 2) * width
    return np.stack([m + s, m - s], axis=1)
