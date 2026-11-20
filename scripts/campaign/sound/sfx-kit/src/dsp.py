"""Signal tools for the youcoded sound-effects kit.

Everything works on mono float64 arrays at 48 kHz until the very end, where `to_stereo`
adds the kit's shared small "close room" and makes a mono-compatible stereo pair.
"""
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, sosfiltfilt, resample_poly, lfilter
from math import gcd

SR = 48000


# ---------------------------------------------------------------- loading
def load(path, start=None, end=None, channel=None):
    """Read a file as mono at 48 kHz, optionally cutting [start, end) seconds."""
    x, sr = sf.read(str(path), always_2d=True)
    m = x[:, channel] if channel is not None else x.mean(1)
    if start is not None or end is not None:
        a = int((start or 0) * sr)
        b = int(end * sr) if end is not None else len(m)
        m = m[a:b]
    if sr != SR:
        g = gcd(SR, sr)
        m = resample_poly(m, SR // g, sr // g)
    m = m - np.mean(m)  # WHY: some sources carry a DC offset, which would make the fades click
    return m.astype(np.float64)


def secs(n):
    return int(round(n * SR))


# ---------------------------------------------------------------- filters
def hp(x, f, order=2, zero_phase=True):
    sos = butter(order, f, "highpass", fs=SR, output="sos")
    return sosfiltfilt(sos, x) if zero_phase else sosfilt(sos, x)


def lp(x, f, order=2, zero_phase=True):
    sos = butter(order, f, "lowpass", fs=SR, output="sos")
    return sosfiltfilt(sos, x) if zero_phase else sosfilt(sos, x)


def bp(x, lo, hi, order=2, zero_phase=True):
    sos = butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    return sosfiltfilt(sos, x) if zero_phase else sosfilt(sos, x)


def _biquad(kind, f0, gain_db, q):
    """RBJ cookbook biquads (peak, low shelf, high shelf)."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    cw, sw = np.cos(w), np.sin(w)
    alpha = sw / (2 * q)
    if kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        s = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
        a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
    elif kind == "highshelf":
        s = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
        a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    b, a = np.array(b), np.array(a)
    return b / a[0], a / a[0]


def eq(x, kind, f0, gain_db, q=0.7):
    b, a = _biquad(kind, f0, gain_db, q)
    return lfilter(b, a, x)


# ---------------------------------------------------------------- envelopes
def env_follow(x, ms):
    """RMS envelope over a centred window of `ms` milliseconds."""
    w = max(1, int(SR * ms / 1000))
    return np.sqrt(np.convolve(x * x, np.ones(w) / w, "same") + 1e-20)


def soften_transients(x, amount=0.6, fast_ms=0.7, slow_ms=10.0):
    """Turn hard 'clack' attacks into soft touches.

    WHY: the owner hates clacks. A clack is a spike whose energy arrives in well under a
    millisecond. We compare a very fast envelope with a slower one and pull the gain down
    wherever the fast one jumps above the slow one, so a key or a latch keeps its body but
    loses the hard edge. `amount` 0..1 is how much of the spike is removed.
    """
    fast = env_follow(x, fast_ms)
    slow = env_follow(x, slow_ms)
    ratio = np.maximum(fast / (slow + 1e-12), 1.0)
    g = ratio ** (-amount)
    g = lp(g, 400.0, 1)  # smooth the gain so the softener itself cannot click
    return x * g


def split(x, f=1800.0, order=2):
    """Split into low and high bands that add back to exactly the original (zero-phase)."""
    lo = lp(x, f, order)
    return lo, x - lo


def round_attacks(x, max_rise_db=10.0, f=1400.0, block_ms=1.0, hist_ms=20.0, floor_db=-34.0):
    """Limit how fast the treble (above `f`) is allowed to get louder.

    WHY: a clack, snap or tick is treble that appears from nothing in under a millisecond.
    A real soft touch (felt, a fingertip, paper settling) lets its treble arrive over a few
    milliseconds. We walk through the sound in 1 ms steps and never let the treble jump more
    than `max_rise_db` above its own level over the previous 20 ms; the body of the sound
    (below `f`) is untouched, so a key still sounds like a key, just a soft one.
    """
    # WHY a steep split: with a gentle one, much of a click's 2-4 kHz energy stays in the
    # "low" half and slips past untouched
    lo, hi = split(x, f, 5)
    B = max(1, int(SR * block_ms / 1000))
    nb = len(x) // B + 1
    padn = nb * B - len(x)
    h = np.concatenate([hi, np.zeros(padn)]).reshape(nb, B)
    rms = np.sqrt((h ** 2).mean(1) + 1e-20)
    floor = rms.max() * 10 ** (floor_db / 20)
    H = max(1, int(hist_ms / block_ms))
    lag = max(1, int(3 / block_ms))
    out = np.zeros(nb)
    g = np.ones(nb)
    lim = 10 ** (max_rise_db / 20)
    for i in range(nb):
        j0, j1 = max(0, i - lag - H), max(0, i - lag)
        # divide by the full window: before the sound began counts as silence
        prev = np.sqrt((out[j0:j1] ** 2).sum() / H) if j1 > j0 else 0.0
        allowed = max(prev, floor) * lim
        if rms[i] > allowed:
            g[i] = allowed / rms[i]
        out[i] = rms[i] * g[i]
    # smooth gain: never let the gain jump faster than the blocks themselves
    gs = np.repeat(g, B)[: len(x)]
    gs = np.minimum(gs, lp(gs, 1500, 1))
    gs = np.clip(gs, 0, 1)
    return lo + hi * gs


def settle_brightness(x, f=1500.0, frame_ms=10.0, smooth_ms=40.0, start_db=-24.0, attack_ms=25.0):
    """Make sure the sound's brightness never rises once it has started: it may only stay
    level or settle a little darker, like a real object coming to rest.

    WHY: the owner hates sweeps and risers. Natural fabric gestures often get brighter as the
    hand speeds up, which reads as a small 'swoosh'. We measure treble-to-body balance every
    10 ms and turn the treble down whenever that balance would exceed the darkest balance
    reached so far (from the first moment the sound is within 24 dB of its loudest)."""
    lo, hi = split(x, f)
    el = env_follow(lo, smooth_ms)
    eh = env_follow(hi, smooth_ms)
    lvl = 20 * np.log10(env_follow(x, smooth_ms) + 1e-12)
    start = np.flatnonzero(lvl > lvl.max() + start_db)[0]
    r = eh / (el + 1e-9)
    hop = int(SR * frame_ms / 1000)
    cap = np.empty_like(r)
    # The first `attack_ms` after the sound starts is its touch, which is naturally the
    # brightest moment; the cap starts at that brightness and may then only come down.
    a_end = start + int(SR * attack_ms / 1000)
    cur = r[start:a_end].max()
    for i in range(0, len(r), hop):
        seg = slice(i, i + hop)
        # only frames that are clearly audible may lower the cap, so a brief quiet gap
        # cannot lock the treble down for the rest of the sound
        if i >= a_end and lvl[seg].mean() > lvl.max() - 20:
            cur = min(cur, r[seg].mean())
        cap[seg] = cur
    g = np.minimum(1.0, cap / (r + 1e-12))
    g = lp(g, 30.0, 1)
    g = np.clip(g, 0, 1)
    return lo + hi * g


def expander(x, thresh_db, ratio=3.0, ms=8.0):
    """Push the recording's noise floor down between and after the sounds."""
    e = 20 * np.log10(env_follow(x, ms) + 1e-12)
    peak = e.max()
    below = np.minimum(e - (peak + thresh_db), 0.0)
    g = 10 ** (below * (ratio - 1) / 20)
    g = lp(g, 60.0, 1)
    return x * g


def fade(x, fin_ms=2.0, fout_ms=20.0):
    """Raised-cosine fades so every file starts and ends on true silence."""
    y = x.copy()
    a = max(2, int(SR * fin_ms / 1000))
    b = max(2, int(SR * fout_ms / 1000))
    a, b = min(a, len(y) // 2), min(b, len(y) // 2)
    y[:a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    y[-b:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b))
    y[0] = 0.0
    y[-1] = 0.0
    return y


def trim(x, thresh_db=-60, pre_ms=3, post_ms=40):
    """Cut leading/trailing parts quieter than thresh (relative to the peak)."""
    e = 20 * np.log10(env_follow(x, 3) + 1e-12)
    on = np.flatnonzero(e > e.max() + thresh_db)
    a = max(0, on[0] - int(SR * pre_ms / 1000))
    b = min(len(x), on[-1] + int(SR * post_ms / 1000))
    return x[a:b]


def shape(n, points):
    """Piecewise-linear (in dB) envelope of length n from [(t_seconds, dB), ...]."""
    t = np.arange(n) / SR
    ts, ds = zip(*points)
    return 10 ** (np.interp(t, ts, ds) / 20)


def place(total, items):
    """Mix (offset_seconds, signal, gain) items into one buffer of `total` seconds."""
    out = np.zeros(secs(total))
    for off, sig, g in items:
        a = secs(off)
        b = min(len(out), a + len(sig))
        out[a:b] += g * sig[: b - a]
    return out


def pad(x, before=0.0, after=0.0):
    return np.concatenate([np.zeros(secs(before)), x, np.zeros(secs(after))])


def xfade_join(a, b, ms=20):
    """Equal-power crossfade of a into b."""
    n = int(SR * ms / 1000)
    n = min(n, len(a), len(b))
    t = np.linspace(0, np.pi / 2, n)
    mid = a[-n:] * np.cos(t) + b[:n] * np.sin(t)
    return np.concatenate([a[:-n], mid, b[n:]])


def fit_stroke(seg, length, head=0.06, tail=0.09, xf_ms=25):
    """Make a real stroke recording exactly `length` seconds long, keeping its real
    pen-down start and lift-off end.

    WHY: the films need strokes of different lengths, but stretching a recording makes it
    sound wrong. Instead we keep the real first `head` seconds and last `tail` seconds and
    take (or loop, with crossfades) the steady middle of the same stroke to fill the gap.
    """
    L = secs(length)
    h, t = secs(head), secs(tail)
    if len(seg) <= L:
        body = seg[h:-t]
        need = L - h - t
        mid = body.copy()
        while len(mid) < need + secs(xf_ms / 1000) * 2:
            mid = xfade_join(mid, body[::-1] if len(mid) // max(1, len(body)) % 2 else body, xf_ms)
        mid = mid[:need + 2 * secs(xf_ms / 1000)]
    else:
        need = L - h - t
        body = seg[h:-t]
        c = (len(body) - need) // 2
        mid = body[max(0, c - secs(xf_ms / 1000)): c + need + secs(xf_ms / 1000)]
    y = xfade_join(xfade_join(seg[:h + secs(xf_ms / 1000)], mid, xf_ms), seg[-t - secs(xf_ms / 1000):], xf_ms)
    return y[:L] if len(y) >= L else np.concatenate([y, np.zeros(L - len(y))])


# ---------------------------------------------------------------- synthesis
def rng(seed):
    return np.random.default_rng(seed)


def noise(n, seed=0):
    return rng(seed).standard_normal(n)


def pink(n, seed=0):
    """Pink-ish noise (Voss-McCartney approximation by filtering)."""
    w = noise(n, seed)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return lfilter(b, a, w) * 8


def felt_mallet(ms=4.0):
    """A soft excitation pulse: what a felt-covered fingertip or hammer delivers.
    A raised cosine of a few ms has almost nothing above 1-2 kHz, so it cannot clack."""
    n = max(4, int(SR * ms / 1000))
    return 0.5 - 0.5 * np.cos(np.linspace(0, 2 * np.pi, n))


def modal(modes, dur, excite, seed=0):
    """Sum of damped resonances (freq Hz, decay seconds, amp) driven by `excite`.

    Decays are kept very short by the callers (under ~80 ms) so the result reads as a
    material (wood, card, rubber) being touched, never as a musical note.
    """
    n = secs(dur)
    t = np.arange(n) / SR
    ir = np.zeros(n)
    r = rng(seed)
    for f, d, a in modes:
        ph = r.uniform(0, 2 * np.pi)
        ir += a * np.exp(-t / d) * np.sin(2 * np.pi * f * t + ph)
    # WHY: fade the last 30 % so a resonance cut off by `dur` can never end in a click
    k = max(2, int(n * 0.3))
    ir[-k:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k))
    y = np.convolve(excite, ir)[:n]
    return y


def friction(dur, lo, hi, grain_rate=60.0, grain_depth=0.6, seed=0, pink_noise=True):
    """Rubbing noise with the stick-slip 'grain' of a real surface, in a FIXED band.

    WHY fixed: the band never moves, so the sound cannot sweep or whoosh."""
    n = secs(dur)
    src = pink(n, seed) if pink_noise else noise(n, seed)
    y = bp(src, lo, hi, 2)
    r = rng(seed + 7)
    g = r.standard_normal(n)
    g = lp(g, grain_rate, 2)
    g = 1 + grain_depth * g / (np.abs(g).max() + 1e-12)
    return y * np.clip(g, 0.05, None)


# ---------------------------------------------------------------- the shared space
def to_stereo(x, room=0.10, width=0.10, seed=11):
    """Make the kit's shared 'dry and close' space and a gentle, mono-safe stereo image.

    The direct sound is identical in both channels (dead centre). A tiny desk-sized set of
    early reflections (3-23 ms, no long tail) is added with slightly different timings per
    side; that is the only difference between left and right, and it is quiet, so summing
    to mono changes almost nothing.
    """
    r = rng(seed)
    taps = [(0.0031, 1.0), (0.0067, 0.7), (0.0109, 0.55), (0.0157, 0.4), (0.0228, 0.28)]
    out = []
    for side in (0, 1):
        ir = np.zeros(secs(0.03))
        for t, a in taps:
            jitter = r.uniform(-0.0012, 0.0012)
            ir[secs(t + jitter)] += a * (1 if (side + int(t * 1000)) % 2 else -1) * 0.5 + a * 0.5
        refl = np.convolve(x, ir)[: len(x)]
        refl = lp(hp(refl, 200), 6000)
        out.append(refl)
    mid = x + room * (out[0] + out[1]) / 2
    side = width * room * (out[0] - out[1])
    L, R = mid + side, mid - side
    return np.stack([L, R], 1)
