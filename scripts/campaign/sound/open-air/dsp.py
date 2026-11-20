"""Open air: signal-processing building blocks.

Everything here is synthesised from maths: no samples. WHY: the old music used a free
General MIDI soundfont and sounded cheap; owning every oscillator, filter and reverb lets
us control the exact quality (anti-aliasing, smooth filters, clean tails) and reproduce it.
"""
import numpy as np
import numba as nb
from scipy import signal

SR = 48000


def secs(n):
    return int(round(n * SR))


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def pan2(x, p):
    """Constant-power pan, p in [-1, 1] -> (n, 2)."""
    a = (p + 1.0) * np.pi / 4.0
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2.0)


# ---------------------------------------------------------------- oscillators
def _blep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt
    x = ph[m] / dt[m]
    out[m] = x + x - x * x - 1.0
    m = ph > 1.0 - dt
    x = (ph[m] - 1.0) / dt[m]
    out[m] = x * x + x + x + 1.0
    return out


def phase(freq, ph0=0.0):
    dt = np.asarray(freq, dtype=float) / SR
    if dt.ndim == 0:
        return None
    return (ph0 + np.cumsum(dt)) % 1.0, dt


def saw(freq, ph0=0.0):
    """Band-limited (PolyBLEP) sawtooth. WHY PolyBLEP: a naive saw aliases into
    harsh inharmonic whistles above ~2 kHz; this removes most of it cheaply."""
    ph, dt = phase(freq, ph0)
    return 2.0 * ph - 1.0 - _blep(ph, dt)


def square(freq, ph0=0.0, pw=0.5):
    ph, dt = phase(freq, ph0)
    a = 2.0 * ph - 1.0 - _blep(ph, dt)
    ph2 = (ph + pw) % 1.0
    b = 2.0 * ph2 - 1.0 - _blep(ph2, dt)
    return 0.5 * (a - b)


def sine(freq, ph0=0.0):
    ph, _ = phase(freq, ph0)
    return np.sin(2 * np.pi * ph)


# ---------------------------------------------------------------- envelopes
def adsr(n, a, d, s, r, gate):
    """n samples total; gate = seconds the key is held. Exponential curves."""
    t = np.arange(n) / SR
    env = np.empty(n)
    a = max(a, 1e-4)
    att = t < a
    env[att] = (1 - np.exp(-4.0 * t[att] / a)) / (1 - np.exp(-4.0))
    dec = ~att
    env[dec] = s + (1 - s) * np.exp(-(t[dec] - a) / max(d, 1e-4) * 4.0)
    g = min(gate, t[-1]) if n else 0
    gi = min(int(g * SR), n - 1)
    lvl = env[gi]
    rel = t >= g
    env[rel] = lvl * np.exp(-(t[rel] - g) / max(r, 1e-4) * 6.0)
    # final 5 ms forced to zero so nothing clicks at the note's end
    k = min(n, secs(0.005))
    env[n - k:] *= np.linspace(1, 0, k)
    return env


def fade(x, fin=0.002, fout=0.01):
    x = x.copy()
    a, b = secs(fin), secs(fout)
    if a:
        w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
        x[:a] = (x[:a].T * w).T
    if b:
        w = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b))
        x[-b:] = (x[-b:].T * w).T
    return x


# ---------------------------------------------------------------- filters
@nb.njit(cache=True)
def svf(x, fc, q, mode):
    """Zero-delay-feedback state-variable filter (Simper/Cytomic) with a per-sample
    cutoff, so filter envelopes sweep smoothly without zipper noise.
    mode 0 low-pass, 1 band-pass, 2 high-pass."""
    n = len(x)
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(n):
        f = fc[i]
        if f < 15.0:
            f = 15.0
        if f > 0.45 * 48000.0:
            f = 0.45 * 48000.0
        g = np.tan(np.pi * f / 48000.0)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = v1
        else:
            y[i] = x[i] - k * v1 - v2
    return y


def svf_env(x, fc, q=0.7, mode=0):
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape).copy()
    return svf(np.ascontiguousarray(x, dtype=float), fc, float(q), mode)


def _apply_sos(sos, x):
    return signal.sosfilt(sos, x, axis=0)


def hp(x, f, order=2):
    return _apply_sos(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return _apply_sos(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return _apply_sos(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def _biquad(kind, f0, gain_db, q):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    if kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == 'low':
        sA = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sA), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sA)]
        a = [(A + 1) + (A - 1) * c + sA, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sA]
    else:  # high shelf
        sA = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sA), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sA)]
        a = [(A + 1) - (A - 1) * c + sA, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sA]
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return np.concatenate([b, a])[None, :]


def eq(x, kind, f0, gain_db, q=0.707):
    return _apply_sos(_biquad(kind, f0, gain_db, q), x)


# ---------------------------------------------------------------- effects
@nb.njit(cache=True)
def _chorus(x, rate, depth, base, phase0):
    n = len(x)
    size = int(base + depth + 4)
    buf = np.zeros(size)
    y = np.empty(n)
    w = 0
    for i in range(n):
        buf[w] = x[i]
        d = base + depth * 0.5 * (1.0 + np.sin(2 * np.pi * rate * i / 48000.0 + phase0))
        rp = w - d
        while rp < 0:
            rp += size
        i0 = int(rp)
        fr = rp - i0
        i1 = (i0 + 1) % size
        y[i] = buf[i0] * (1 - fr) + buf[i1] * fr
        w = (w + 1) % size
    return y


def chorus(st, rate=0.45, depth_ms=3.0, base_ms=11.0, mix=0.35):
    """Two modulated delay lines per side, opposite LFO phases, for a lush wide sound."""
    d, b = depth_ms * SR / 1000, base_ms * SR / 1000
    out = st.copy()
    for ch, ph in ((0, 0.0), (1, np.pi / 2)):
        x = np.ascontiguousarray(st[:, ch])
        w = 0.5 * (_chorus(x, rate, d, b, ph) + _chorus(x, rate * 1.37, d * 0.7, b * 1.6, ph + 2.1))
        out[:, ch] = (1 - mix) * st[:, ch] + mix * w
    return out


@nb.njit(cache=True)
def _pingpong(x, dl, fb, lpc, hpc):
    n = len(x)
    bl = np.zeros(dl)
    br = np.zeros(dl)
    yl = np.empty(n)
    yr = np.empty(n)
    lpl = 0.0
    lpr = 0.0
    hpl = 0.0
    hpr = 0.0
    w = 0
    for i in range(n):
        ol = bl[w]
        orr = br[w]
        yl[i] = ol
        yr[i] = orr
        # damped feedback: each repeat gets a little darker and thinner, like tape
        lpl += lpc * (orr - lpl)
        lpr += lpc * (ol - lpr)
        hpl += hpc * (lpl - hpl)
        hpr += hpc * (lpr - hpr)
        bl[w] = x[i] + fb * (lpl - hpl)
        br[w] = fb * (lpr - hpr)
        w = (w + 1) % dl
    return yl, yr


def pingpong(st, delay_s, fb=0.42, lp_hz=4500, hp_hz=250):
    x = np.ascontiguousarray(st.mean(axis=1))
    lpc = 1 - np.exp(-2 * np.pi * lp_hz / SR)
    hpc = 1 - np.exp(-2 * np.pi * hp_hz / SR)
    yl, yr = _pingpong(x, secs(delay_s), fb, lpc, hpc)
    return np.stack([yl, yr], axis=1)


_IR_CACHE = {}


def make_ir(decay=3.2, predelay=0.02, seed=7, hp_hz=180, bright=1.0):
    """Synthetic stereo hall impulse response: decorrelated noise per side, split into
    bands that die away at different rates (highs faster, like real air), plus sparse
    early reflections. WHY convolution: a smooth dense tail with no metallic ringing,
    which cheap feedback reverbs struggle to give."""
    key = (decay, predelay, seed, hp_hz, bright)
    if key in _IR_CACHE:
        return _IR_CACHE[key]
    rng = np.random.default_rng(seed)
    n = secs(decay * 1.3 + predelay)
    t = np.arange(n) / SR
    edges = [(20, 300, 1.15), (300, 1500, 1.0), (1500, 5000, 0.8), (5000, 11000, 0.55 * bright), (11000, 20000, 0.35 * bright)]
    ir = np.zeros((n, 2))
    for ch in range(2):
        noise = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, m in edges:
            band = bp(noise, lo, hi, 2)
            acc += band * np.exp(-6.91 * t / (decay * m))
        # early reflections
        for _ in range(14):
            k = secs(rng.uniform(0.004, 0.07))
            acc[k] += rng.uniform(-1, 1) * 6.0 * np.exp(-k / SR / 0.05)
        acc = hp(acc, hp_hz)
        ir[:, ch] = acc
    pd = secs(predelay)
    ir = np.concatenate([np.zeros((pd, 2)), ir])[:n]
    k = secs(0.004)
    ir[pd:pd + k] *= np.linspace(0, 1, k)[:, None]
    m = secs(0.15)
    ir[-m:] *= np.linspace(1, 0, m)[:, None] ** 2
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
    _IR_CACHE[key] = ir
    return ir


def reverb(st, **kw):
    ir = make_ir(**kw)
    if st.ndim == 1:
        st = np.stack([st, st], axis=1)
    out = np.zeros((len(st) + len(ir) - 1, 2))
    for ch in range(2):
        out[:, ch] = signal.oaconvolve(st[:, ch], ir[:, ch])
    return out[:len(st)]


def sat(x, drive=1.5):
    """Soft tanh saturation, level-compensated: adds warm harmonics on peaks."""
    return np.tanh(x * drive) / np.tanh(drive)


# ---------------------------------------------------------------- dynamics
@nb.njit(cache=True)
def _comp_gain(det_db, thr, ratio, knee, att, rel):
    n = len(det_db)
    g = np.empty(n)
    env = 0.0
    for i in range(n):
        x = det_db[i]
        over = x - thr
        if over <= -knee / 2:
            red = 0.0
        elif over >= knee / 2:
            red = over * (1 - 1 / ratio)
        else:
            red = (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)
        c = att if red > env else rel
        env = env + c * (red - env)
        g[i] = -env
    return g


def compress(st, thr_db=-18, ratio=2.0, att_ms=30, rel_ms=250, knee=6.0):
    """Gentle stereo-linked glue compressor (RMS detector, soft knee)."""
    lvl = st[:, 0] ** 2 + st[:, 1] ** 2 if st.ndim == 2 else st ** 2
    rms = signal.lfilter([1 - np.exp(-1 / (0.01 * SR))], [1, -np.exp(-1 / (0.01 * SR))], lvl)
    det = 10 * np.log10(rms / (2 if st.ndim == 2 else 1) + 1e-12)
    att = 1 - np.exp(-1 / (att_ms / 1000 * SR))
    rel = 1 - np.exp(-1 / (rel_ms / 1000 * SR))
    g = 10 ** (_comp_gain(det, thr_db, ratio, knee, att, rel) / 20)
    return (st.T * g).T


def true_peak_db(st):
    up = signal.resample_poly(st, 4, 1, axis=0)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-12)


@nb.njit(cache=True)
def _release(g, rc):
    out = np.empty(len(g))
    prev = 1.0
    for i in range(len(g)):
        r = prev + (1.0 - prev) * rc
        v = g[i] if g[i] < r else r
        out[i] = v
        prev = v
    return out


def limit(st, ceiling_db=-1.3, look_ms=3.0, rel_ms=120.0):
    """Look-ahead true-peak limiter: peaks are found on a 4x oversampled copy so the
    inter-sample peaks a phone's converter would make are caught too."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    ceil = 10 ** (ceiling_db / 20)
    out = st
    for _ in range(4):
        up = np.abs(signal.resample_poly(out, 4, 1, axis=0)).max(axis=1)
        pk = up[: len(out) * 4].reshape(-1, 4).max(axis=1)
        need = np.minimum(1.0, ceil / (pk + 1e-12))
        if need.min() >= 0.9999:
            break
        L = max(1, secs(look_ms / 1000))
        g = minimum_filter1d(need, 2 * L + 1)
        g = uniform_filter1d(g, L)
        g = minimum_filter1d(g, 3)
        g = _release(g, 1 - np.exp(-1 / (rel_ms / 1000 * SR)))
        out = (out.T * g).T
        ceil *= 0.995
    return out
