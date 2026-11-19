"""Shared DSP helpers: filters, reverb, loudness mastering. All audio is float64, shape (n,) or (n,2), 48 kHz."""
import numpy as np
from scipy import signal
import pyloudnorm as pyln

SR = 48000
BPM = 100
BEAT = 60.0 / BPM      # 0.6 s
BAR = 4 * BEAT         # 2.4 s


def lp(x, fc, order=2):
    sos = signal.butter(order, fc, 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def bp(x, f1, f2, order=2):
    sos = signal.butter(order, [f1, f2], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def _biquad(x, b, a):
    return signal.sosfilt(signal.tf2sos(b / a[0], a / a[0]), x, axis=0)


def peak_eq(x, f0, gain_db, q=0.8):
    """RBJ peaking EQ (bell). WHY: a gentle bell cut around 250-500 Hz removes the 'boxy' build-up without thinning the piano."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q); c = np.cos(w)
    b = np.array([1 + al * A, -2 * c, 1 - al * A]); a = np.array([1 + al / A, -2 * c, 1 - al / A])
    return _biquad(x, b, a)


def high_shelf(x, f0, gain_db, s=0.7):
    """RBJ high shelf. WHY: a soft presence/air lift (a few dB above ~3 kHz) opens up a muffled mix without a harsh peak."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; c = np.cos(w)
    al = np.sin(w) / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2); sq = 2 * np.sqrt(A) * al
    b = np.array([A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)])
    a = np.array([(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq])
    return _biquad(x, b, a)


def db(x):
    return 10 ** (x / 20.0)


def stereo(x):
    x = np.asarray(x)
    return np.stack([x, x], axis=-1) if x.ndim == 1 else x


def pan(x, p):
    """Equal-power pan of a mono signal, p in [-1,1]."""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=-1)


def make_ir(rt60=2.8, predelay=0.022, seed=7, damp_hz=6500):
    """Synthetic stereo plate-ish IR: decorrelated noise, exponential decay, highs decay faster."""
    rng = np.random.default_rng(seed)
    n = int((rt60 + predelay) * SR)
    t = np.arange(n) / SR
    env = np.where(t < predelay, 0.0, 10 ** (-3.0 * np.maximum(t - predelay, 0) / rt60))
    # soft build-up over 40 ms so it is diffuse rather than slappy
    env *= np.clip((t - predelay) / 0.04, 0, 1)
    chans = []
    for _ in range(2):
        nz = rng.standard_normal(n) * env
        # frequency dependent decay: blend a dark, longer-lived copy with a bright, quickly-dying copy
        bright = lp(nz, damp_hz) * np.exp(-(t - predelay).clip(0) / (rt60 * 0.22))
        dark = lp(nz, 1800)
        chans.append(0.55 * dark + 0.45 * bright)
    ir = np.stack(chans, axis=-1)
    ir /= np.sqrt((ir ** 2).sum())  # unit energy
    return ir


def reverb(send, ir, n_out):
    """Convolve a (n,2) send with a stereo IR; returns first n_out samples."""
    out = np.zeros((n_out, 2))
    for c in range(2):
        # mix both send channels into each IR channel for width
        sig = send.mean(axis=1)
        y = signal.fftconvolve(sig, ir[:, c])
        m = min(n_out, len(y))
        out[:m, c] = y[:m]
    return out


# ---------------------------------------------------------------- mastering
_meter = pyln.Meter(SR)


def lufs(x):
    return _meter.integrated_loudness(x)


def true_peak_db(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-12)


def limiter(x, ceiling_db=-1.3, lookahead_ms=5.0, release_ms=120.0):
    """Look-ahead peak limiter driven by a 4x oversampled detector (so true peaks stay under ceiling)."""
    ceil = db(ceiling_db)
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.max(np.abs(up), axis=1)
    pk = pk.reshape(-1, 4).max(axis=1) if len(pk) % 4 == 0 else np.pad(pk, (0, 4 - len(pk) % 4)).reshape(-1, 4).max(axis=1)
    pk = pk[:len(x)]
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    la = int(lookahead_ms * SR / 1000)
    # minimum over the lookahead window so gain is already down when the peak arrives
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    g = minimum_filter1d(need, size=la * 2 + 1, origin=0)
    g = uniform_filter1d(g, size=la * 2 + 1)          # smooth attack (still <= need thanks to min window)
    # release smoothing: instant down, slow up
    rel = np.exp(-1.0 / (release_ms * SR / 1000))
    out = np.empty_like(g)
    cur = 1.0
    # vectorised enough for our lengths via loop in numpy-free python is slow; use scipy lfilter trick
    # gain follows min(g, release-smoothed previous)
    # simple loop in chunks (n ~ 3M) -- use numba-free approach: iir on 1-g
    d = 1.0 - g
    # peak-hold release: y[n] = max(d[n], rel*y[n-1])
    out_d = np.empty_like(d)
    y = 0.0
    for i in range(len(d)):
        y = d[i] if d[i] > y * rel else y * rel
        out_d[i] = y
    gain = 1.0 - out_d
    return x * gain[:, None], float(1.0 - gain.min())


def master(x, target=-14.0, tp_ceiling=-1.3, passes=8):
    """Scale to target integrated LUFS, limit true peaks, iterate until both hold."""
    g = target - lufs(x)
    y = x
    for _ in range(passes):
        y = x * db(g)
        y, _ = limiter(y, tp_ceiling)
        cur = lufs(y)
        if abs(cur - target) < 0.08:
            break
        g += target - cur
    return y


def fit(x, n):
    """Exactly n samples."""
    if len(x) >= n:
        return x[:n]
    pad = np.zeros((n - len(x),) + x.shape[1:])
    return np.concatenate([x, pad])
