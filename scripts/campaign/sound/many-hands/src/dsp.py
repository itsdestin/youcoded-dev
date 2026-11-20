"""Signal-processing toolkit for "Many hands": filters, reverb, dynamics, loudness.

Everything works on float64 stereo arrays shaped (n, 2) at 48 kHz.
"""
import functools
import math
import os
from fractions import Fraction

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.join(HERE, "..", "samples")


def silence(sec):
    return np.zeros((int(round(sec * SR)), 2))


def stereo(x):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        return np.stack([x, x], axis=1)
    return x


# ---------------------------------------------------------------- samples
@functools.lru_cache(maxsize=None)
def load(rel, max_sec=None):
    """Load a sample, resample to 48 kHz and trim to its onset.

    WHY trim: the sources start with 2-70 ms of room silence; leaving it in
    would make every hit late and smear the groove.
    """
    x, sr = sf.read(os.path.join(SAMPLES, rel), always_2d=True)
    # WHY one channel: many of the library's stereo recordings are spaced-mic
    # pairs whose channels partly cancel when summed to mono (measured L/R
    # correlation down to -0.7). We keep the stronger mic and create width
    # ourselves with panning and reverb, so every mix survives a mono speaker.
    ch = int(np.argmax((x ** 2).sum(axis=0)))
    x = stereo(x[:, ch])
    if sr != SR:
        f = Fraction(SR, sr)
        x = signal.resample_poly(x, f.numerator, f.denominator, axis=0)
    env = np.abs(x).max(axis=1)
    on = int(np.argmax(env > env.max() * 0.02))
    on = max(0, on - int(0.0015 * SR))
    x = x[on:]
    if max_sec:
        x = x[: int(max_sec * SR)]
    # WHY a long fade when truncated: a ringing string cut in 10 ms clicks
    x = fade(x, 0.0008, 0.3 if max_sec else 0.01)
    return x / (np.abs(x).max() + 1e-12)


@functools.lru_cache(maxsize=None)
def pitched(rel, semis, max_sec=None):
    """Return a sample shifted by `semis` semitones (varispeed, like tape)."""
    x = load(rel, max_sec)
    if abs(semis) < 1e-4:
        return x
    r = Fraction(2 ** (-semis / 12)).limit_denominator(400)
    return signal.resample_poly(x, r.numerator, r.denominator, axis=0)


# ---------------------------------------------------------------- basics
def fade(x, fin=0.002, fout=0.01):
    x = x.copy()
    n = len(x)
    a = min(n, int(fin * SR))
    b = min(n, int(fout * SR))
    if a > 0:
        x[:a] *= (np.sin(np.linspace(0, np.pi / 2, a)) ** 2)[:, None]
    if b > 0:
        x[n - b:] *= (np.cos(np.linspace(0, np.pi / 2, b)) ** 2)[:, None]
    return x


def pan(x, p):
    """Constant-power pan, p in [-1, 1]. Mono-safe: no time offsets."""
    m = stereo(x)
    a =(p + 1) * np.pi / 4
    g = np.array([math.cos(a), math.sin(a)]) * math.sqrt(2)
    # WHY narrow stereo samples before panning: keeps a panned hit where it is placed
    mid = m.mean(axis=1, keepdims=True)
    side = (m[:, :1] - m[:, 1:]) / 2
    out = np.concatenate([mid + 0.5 * side, mid - 0.5 * side], axis=1)
    return out * g


def add(buf, x, t, gain=1.0):
    """Mix x into buf at time t (seconds), growing buf if needed."""
    i = int(round(t * SR))
    if i < 0:
        x = x[-i:]
        i = 0
    end = i + len(x)
    if end > len(buf):
        buf = np.concatenate([buf, np.zeros((end - len(buf), 2))])
    buf[i:end] += x * gain
    return buf


def fit(x, n):
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros((n - len(x), 2))])


def db(g):
    return 20 * math.log10(max(g, 1e-12))


def undb(d):
    return 10 ** (d / 20)


# ---------------------------------------------------------------- filters (RBJ cookbook)
def _biquad(kind, f, q=0.707, gain_db=0.0):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == "bp":
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == "peak":
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == "ls":
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
        a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
    elif kind == "hs":
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
        a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return np.concatenate([b, a])[None, :]


def eq(x, *bands):
    """bands: tuples like ("hp", 40), ("peak", 2500, 1.0, -2), ("hs", 9000, 0.7, 2)."""
    sos = []
    for bd in bands:
        kind, f = bd[0], bd[1]
        q = bd[2] if len(bd) > 2 else 0.707
        g = bd[3] if len(bd) > 3 else 0.0
        sos.append(_biquad(kind, f, q, g))
    return signal.sosfilt(np.concatenate(sos), x, axis=0)


# ---------------------------------------------------------------- saturation
def saturate(x, drive=1.5, mix=1.0):
    """Tape-like soft clip, 4x oversampled so it adds warmth without aliasing."""
    up = signal.resample_poly(x, 4, 1, axis=0)
    y = np.tanh(up * drive) / np.tanh(drive)
    y = signal.resample_poly(y, 1, 4, axis=0)[: len(x)]
    return x * (1 - mix) + y * mix


# ---------------------------------------------------------------- reverb / delay
@functools.lru_cache(maxsize=None)
def make_ir(length=2.4, rt_low=2.2, rt_mid=1.8, rt_high=0.9, predelay=0.018,
            early=0.6, seed=7, width=1.0):
    """Synthetic stereo hall/room impulse response.

    WHY band-split decay: real rooms lose highs faster than lows; a single
    exponential sounds metallic and cheap.
    """
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for ch in range(2):
        noise = rng.standard_normal(n)
        lo = eq(noise[:, None], ("lp", 400))[:, 0]
        hi = eq(noise[:, None], ("hp", 4000))[:, 0]
        mid = noise - lo - hi
        tail = (lo * np.exp(-6.91 * t / rt_low) + mid * np.exp(-6.91 * t / rt_mid)
                + hi * np.exp(-6.91 * t / rt_high))
        # soft build-up so the tail blooms rather than snapping on
        tail *= 1 - np.exp(-t / 0.025)
        out[:, ch] = tail
    # early reflections: sparse taps in the first 80 ms
    for _ in range(14):
        d = rng.uniform(0.004, 0.08)
        i = int(d * SR)
        g = early * rng.uniform(0.3, 1.0) * math.exp(-d / 0.05)
        out[i, rng.integers(0, 2)] += g * 8
    pd = int(predelay * SR)
    out = np.concatenate([np.zeros((pd, 2)), out])[:n]
    # width control and decorrelation sanity: blend toward mid if width < 1
    mid = out.mean(axis=1, keepdims=True)
    out = mid + (out - mid) * width
    out = fade(out, 0, 0.3)
    return out / np.sqrt((out ** 2).sum() / 2)


def reverb(x, ir_kwargs=None, wet=0.25, hp=180, lp=9000):
    ir = make_ir(**(ir_kwargs or {}))
    src = eq(x, ("hp", hp), ("lp", lp))
    n = len(x) + len(ir) - 1
    y = np.stack([signal.fftconvolve(src[:, 0], ir[:, 0])[:n],
                  signal.fftconvolve(src[:, 1], ir[:, 1])[:n]], axis=1)
    y *= wet
    return y  # wet only; caller adds dry


def delay(x, time, feedback=0.35, taps=5, lp=4500, pingpong=True):
    """Tempo delay; each repeat darker than the last (like tape)."""
    n = len(x) + int(time * SR * taps)
    out = np.zeros((n, 2))
    cur = x
    for k in range(1, taps + 1):
        cur = eq(cur, ("lp", lp), ("hp", 250))
        g = feedback ** k
        tap = cur * g
        if pingpong:
            m = tap.mean(axis=1)
            tap = np.stack([m, np.zeros_like(m)], 1) if k % 2 else np.stack([np.zeros_like(m), m], 1)
            tap *= math.sqrt(2) * 0.8
        out = add(out, tap, time * k)
    return out


# ---------------------------------------------------------------- dynamics
def _smooth_env(level, att, rel):
    a_a = math.exp(-1 / (att * SR))
    a_r = math.exp(-1 / (rel * SR))
    out = np.empty_like(level)
    e = 0.0
    for i, v in enumerate(level):  # plain loop: runs ~1 s per minute of audio
        c = a_a if v > e else a_r
        e = c * e + (1 - c) * v
        out[i] = e
    return out


def compress(x, thr_db=-18, ratio=2.0, att=0.01, rel=0.15, makeup_db=0.0, knee=6.0):
    lvl = np.sqrt(eq((x ** 2).mean(axis=1)[:, None], ("lp", 30))[:, 0].clip(1e-12))
    env_db = 20 * np.log10(_smooth_env(lvl, att, rel) + 1e-9)
    over = env_db - thr_db
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    return x * undb(makeup_db) * (10 ** (-gr / 20))[:, None]


def duck(n, times, depth_db=-6, att=0.004, hold=0.03, rel=0.18):
    """Sidechain-style ducking curve from a list of kick times."""
    g = np.zeros(n)
    for t in times:
        i = int(t * SR)
        seg = np.arange(int((att + hold + rel) * SR))
        tt = seg / SR
        shape = np.where(tt < att, tt / att, np.where(tt < att + hold, 1.0,
                                                    np.exp(-(tt - att - hold) / (rel / 3))))
        j = min(n, i + len(seg))
        if i < n:
            g[i:j] = np.maximum(g[i:j], shape[: j - i])
    return (10 ** (depth_db * g / 20))[:, None]


def true_peak(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    return db(np.abs(up).max())


def limit(x, ceiling_db=-1.2, lookahead=0.002, release=0.08):
    """Look-ahead brickwall limiter driven by 4x-oversampled (true) peaks."""
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.abs(up).max(axis=1).reshape(-1, 4).max(axis=1)[: len(x)]
    if len(pk) < len(x):
        pk = np.concatenate([pk, np.zeros(len(x) - len(pk))])
    c = undb(ceiling_db)
    graw = np.minimum(1.0, c / (pk + 1e-12))
    L = max(1, int(lookahead * SR))
    g = minimum_filter1d(graw, size=2 * L + 1, origin=0)
    g = np.convolve(g, np.ones(L) / L, mode="same")
    # release: let gain rise slowly
    a = math.exp(-1 / (release * SR))
    out = np.empty_like(g)
    e = 1.0
    for i, v in enumerate(g):
        e = v if v < e else a * e + (1 - a) * v
        out[i] = e
    return x * out[:, None]


def lufs(x):
    return pyln.Meter(SR).integrated_loudness(x)


def master(x, target=-14.0, tp=-1.0):
    """Normalise to target LUFS with true peak below tp."""
    y = x
    for _ in range(4):
        y = y * undb(target - lufs(y))
        if true_peak(y) > tp - 0.15:
            y = limit(y, tp - 0.35)
        if abs(lufs(y) - target) < 0.05 and true_peak(y) <= tp - 0.05:
            break
    return y


def write(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, x.astype(np.float32), SR, subtype="PCM_24")
