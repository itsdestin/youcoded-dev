"""Low-level signal processing for "the music-box machine".

Everything is synthesised here from maths: no samples, no soundfonts.
All buffers are float64 numpy arrays at SR. Stereo buffers are shape (N, 2).
"""
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 48000


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def secs(n):
    return int(round(n * SR))


# ---------------------------------------------------------------- envelopes
def exp_decay(n, t60):
    """Exponential decay reaching -60 dB after t60 seconds."""
    t = np.arange(n) / SR
    return np.exp(-6.907755 * t / max(t60, 1e-4))


def attack_ramp(n, a):
    """Raised-cosine attack of a seconds (no click), 1.0 afterwards."""
    env = np.ones(n)
    na = min(n, max(1, secs(a)))
    env[:na] = 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    return env


def release_tail(n, start, r):
    """1.0 until `start` seconds, then a raised-cosine fade over r seconds to exact 0."""
    env = np.ones(n)
    s = secs(start)
    nr = max(1, secs(r))
    if s >= n:
        return env
    seg = min(nr, n - s)
    env[s:s + seg] = 0.5 + 0.5 * np.cos(np.pi * np.arange(seg) / nr)
    env[s + seg:] = 0.0
    return env


def fade_edges(x, fin=0.002, fout=0.01):
    """Guarantee a file starts and ends on exact silence (no clicks)."""
    x = x.copy()
    n = len(x)
    a = min(n, secs(fin))
    b = min(n, secs(fout))
    if a > 0:
        w = 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
        x[:a] *= w[:, None] if x.ndim == 2 else w
    if b > 0:
        w = 0.5 + 0.5 * np.cos(np.pi * (np.arange(b) + 1) / b)
        x[n - b:] *= w[:, None] if x.ndim == 2 else w
    return x


# ---------------------------------------------------------------- oscillators
def _polyblep(t, dt):
    out = np.zeros_like(t)
    m1 = t < dt
    x = t[m1] / dt[m1]
    out[m1] = x + x - x * x - 1.0
    m2 = t > 1.0 - dt
    x = (t[m2] - 1.0) / dt[m2]
    out[m2] = x * x + x + x + 1.0
    return out


def phase_from_freq(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = (phase0 + np.cumsum(f) / SR) % 1.0
    # shift so the first sample is exactly phase0
    ph = np.concatenate(([phase0 % 1.0], ph[:-1]))
    return ph, f / SR


def saw(freq, n, phase0=0.0):
    """Band-limited (polyBLEP) sawtooth."""
    ph, dt = phase_from_freq(freq, n, phase0)
    return 2.0 * ph - 1.0 - _polyblep(ph, dt)


def square(freq, n, phase0=0.0, pw=0.5):
    """Band-limited (polyBLEP) pulse/square."""
    ph, dt = phase_from_freq(freq, n, phase0)
    y = np.where(ph < pw, 1.0, -1.0)
    y += _polyblep(ph, dt)
    y -= _polyblep((ph + 1.0 - pw) % 1.0, dt)
    return y


def sine(freq, n, phase0=0.0):
    ph, _ = phase_from_freq(freq, n, phase0)
    return np.sin(2 * np.pi * ph)


# ---------------------------------------------------------------- filters (RBJ biquads)
def _biquad(kind, f0, q=0.707, gain_db=0.0):
    f0 = min(f0, SR * 0.49)
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2 * q)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "bp":
        b = [alpha, 0, -alpha]; a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]; a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        sa = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sa), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sa)]
        a = [(A + 1) + (A - 1) * cw + sa, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sa]
    elif kind == "highshelf":
        sa = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sa)]
        a = [(A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sa]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def filt(x, kind, f0, q=0.707, gain_db=0.0):
    b, a = _biquad(kind, f0, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def butter(x, kind, f, order=4):
    sos = signal.butter(order, f, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def sweep_lp(x, cutoff, q=0.8, block=32):
    """Time-varying low-pass: cutoff is an array (Hz) per sample, applied in short blocks."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        fc = float(np.mean(cutoff[i:i + block]))
        b, a = _biquad("lp", max(20.0, fc), q)
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
    return y


# ---------------------------------------------------------------- stereo / mixing
def pan(x, p):
    """Equal-power pan, p in [-1, 1]. Mono in, stereo out."""
    th = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)], axis=1)


def add_at(buf, x, t):
    """Add x (mono or stereo) into stereo buf starting at t seconds (clipped to buf)."""
    s = secs(t)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1) * np.sqrt(0.5)
    if s < 0:
        x = x[-s:]
        s = 0
    e = min(len(buf), s + len(x))
    if e > s:
        buf[s:e] += x[: e - s]


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-12))


def undb(d):
    return 10 ** (d / 20)


def soft_sat(x, drive=1.0):
    """Smooth tanh saturation, level-compensated so small signals pass at unity."""
    return np.tanh(x * drive) / drive


# ---------------------------------------------------------------- reverb (synthetic stereo IR)
_IR_CACHE = {}


def make_ir(t60=2.2, predelay=0.018, bright=1.0, seed=7, er=True):
    """Stereo room impulse response built from band-split decaying noise.

    Lows decay slowest, highs fastest, like a real wooden hall. L and R use independent
    noise so the tail is wide but sums to mono without cancelling (it is uncorrelated).
    """
    key = (t60, predelay, bright, seed, er)
    if key in _IR_CACHE:
        return _IR_CACHE[key]
    rng = np.random.default_rng(seed)
    n = secs(t60 * 1.15 + predelay)
    out = np.zeros((n, 2))
    bands = [(None, 250, 1.05), (250, 1500, 1.0), (1500, 5000, 0.72 * bright), (5000, None, 0.42 * bright)]
    for ch in range(2):
        noise = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, k in bands:
            if lo is None:
                b = butter(noise, "lowpass", hi, 2)
            elif hi is None:
                b = butter(noise, "highpass", lo, 2)
            else:
                b = butter(noise, "bandpass", [lo, hi], 2)
            acc += b * exp_decay(n, t60 * k)
        acc *= attack_ramp(n, 0.012 + predelay)  # tail swells in, no hard onset
        if er:  # sparse early reflections
            for _ in range(10):
                d = secs(predelay + rng.uniform(0.004, 0.055))
                acc[d] += rng.uniform(-1, 1) * 2.2
        acc[: secs(predelay)] = 0
        out[:, ch] = acc
    out = fade_edges(out, 0.0, 0.2)
    out /= np.sqrt(np.sum(out ** 2) / 2)
    _IR_CACHE[key] = out
    return out


def reverb(x, ir, wet=0.25):
    """Convolution reverb on a stereo buffer. Returns the wet signal only (same length as x + tail)."""
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    mono = x.mean(axis=1)
    side = 0.5 * (x[:, 0] - x[:, 1])
    l = signal.fftconvolve(mono + 0.5 * side, ir[:, 0])
    r = signal.fftconvolve(mono - 0.5 * side, ir[:, 1])
    y = np.stack([l, r], axis=1) * wet
    return y[: len(x)]


def pingpong(x, t_delay, fb=0.35, n=6, lp=4500.0, wet=0.3):
    """Tempo delay bouncing left/right, each repeat darker than the last."""
    if x.ndim == 2:
        x = x.mean(axis=1)
    out = np.zeros((len(x), 2))
    rep = x.copy()
    for k in range(1, n + 1):
        rep = filt(rep, "lp", lp, 0.6)
        rep = filt(rep, "hp", 300.0, 0.6)
        d = secs(t_delay * k)
        if d >= len(x):
            break
        g = wet * fb ** (k - 1)
        ch = (k - 1) % 2
        out[d:, ch] += rep[: len(x) - d] * g
        out[d:, 1 - ch] += rep[: len(x) - d] * g * 0.25
    return out


# ---------------------------------------------------------------- dynamics
def envelope_follow(x, attack=0.005, release=0.12, block=64):
    """Peak-ish envelope (per block, then interpolated). x mono."""
    nb = int(np.ceil(len(x) / block))
    pad = np.zeros(nb * block)
    pad[: len(x)] = np.abs(x)
    pk = pad.reshape(nb, block).max(axis=1)
    ga = np.exp(-block / (attack * SR))
    gr = np.exp(-block / (release * SR))
    env = np.zeros(nb)
    e = 0.0
    for i, v in enumerate(pk):
        e = ga * e + (1 - ga) * v if v > e else gr * e + (1 - gr) * v
        env[i] = e
    t = (np.arange(nb) + 0.5) * block
    return np.interp(np.arange(len(x)), t, env)


def compress(x, thresh_db=-18, ratio=2.0, attack=0.01, release=0.15, makeup_db=0.0):
    """Gentle bus compressor (glue). x stereo."""
    det = np.max(np.abs(x), axis=1)
    env = envelope_follow(det, attack, release)
    lvl = db(env)
    over = np.maximum(0, lvl - thresh_db)
    gr = -over * (1 - 1 / ratio)
    g = undb(gr + makeup_db)
    return x * g[:, None]


def sidechain(x, key, depth_db=6.0, attack=0.002, release=0.18):
    """Duck x under the key signal (kick), the classic pumping-but-subtle 808 glue."""
    env = envelope_follow(key if key.ndim == 1 else key.mean(axis=1), attack, release)
    env = env / (env.max() + 1e-12)
    g = undb(-depth_db * env)
    return x * (g[:, None] if x.ndim == 2 else g)


def true_peak_env(x, os=4):
    """Per-sample true-peak estimate (max over 4x oversampled points)."""
    up = signal.resample_poly(x, os, 1, axis=0)
    a = np.abs(up).max(axis=1) if up.ndim == 2 else np.abs(up)
    n = len(x)
    a = a[: n * os]
    if len(a) < n * os:
        a = np.concatenate([a, np.zeros(n * os - len(a))])
    return a.reshape(n, os).max(axis=1)


def limit(x, ceiling_db=-1.2, lookahead=0.004, release=0.08):
    """Look-ahead true-peak limiter: the gain is already down when the peak arrives."""
    ceil = undb(ceiling_db)
    tp = true_peak_env(x)
    need = np.minimum(1.0, ceil / np.maximum(tp, 1e-12))
    w = max(1, secs(lookahead))
    g = minimum_filter1d(need, size=2 * w + 1, mode="nearest")
    g = uniform_filter1d(g, size=w, mode="nearest")
    # release smoothing (block-wise one-pole upward only)
    blk = 32
    nb = int(np.ceil(len(g) / blk))
    gb = np.ones(nb)
    gp = np.pad(g, (0, nb * blk - len(g)), constant_values=1.0).reshape(nb, blk).min(axis=1)
    rr = np.exp(-blk / (release * SR))
    cur = 1.0
    for i, v in enumerate(gp):
        cur = v if v < cur else rr * cur + (1 - rr) * v
        gb[i] = cur
    gs = np.repeat(gb, blk)[: len(g)]
    gs = np.minimum(gs, g)
    gs = uniform_filter1d(gs, size=16, mode="nearest")
    return x * gs[:, None]
