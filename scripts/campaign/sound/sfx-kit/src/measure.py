"""Measurements for the sound-effects kit: loudness, clicks, clack, pitch sweep, mono.

Each number here backs a plain-language claim in KIT.md, so the definitions are spelled out.
"""
import numpy as np
from scipy.signal import butter, sosfilt, sosfiltfilt, lfilter, resample_poly

SR = 48000


def k_weight(x):
    """ITU-R BS.1770 K-weighting at 48 kHz (the 'how loud does it feel' filter)."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x))


def short_loudness(st):
    """Loudest 100 ms of the sound, K-weighted, in LUFS-like units.

    WHY 100 ms and not integrated LUFS: these effects are 0.05-2 s long, shorter than the
    400 ms blocks integrated loudness needs; the loudest 100 ms is how loud a short effect
    'feels' and is what we match within each trio.
    """
    st = np.atleast_2d(st.T).T if st.ndim == 1 else st
    k = np.stack([k_weight(st[:, c]) for c in range(st.shape[1])], 1)
    w = int(0.1 * SR)
    ms = sum(np.convolve(k[:, c] ** 2, np.ones(w) / w, "same") for c in range(k.shape[1]))
    return -0.691 + 10 * np.log10(ms.max() + 1e-20)


def true_peak_db(st):
    up = resample_poly(st, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-20)


def edge_db(st):
    """Level of the very first and last samples (dBFS); below -90 means a click-free edge."""
    a = np.abs(st[0]).max()
    b = np.abs(st[-1]).max()
    return 20 * np.log10(a + 1e-20), 20 * np.log10(b + 1e-20)


def max_step_db(st):
    """Largest sample-to-sample jump relative to the peak, over the first and last 5 ms.
    A fade that ends abruptly shows up here as a jump."""
    n = int(0.005 * SR)
    pk = np.abs(st).max() + 1e-20
    d = np.abs(np.diff(st, axis=0))
    return 20 * np.log10(max(d[:n].max(), d[-n:].max()) / pk + 1e-20)


def clack(mono, rise_thresh=18.0):
    """How 'clacky' a sound is, measured in the 2-6 kHz band where clacks and snaps live.

    A clack is a SUDDEN and LOUD burst in that band. For every millisecond we compare the
    band's level with its level over the 20 ms just before (3 ms earlier); where it jumps by
    more than `rise_thresh` dB within those few milliseconds we call it a sudden onset (soft
    touches, fabric and paper swells rise more slowly than that). Anything 30 dB under the
    band's own peak counts as silence, so a sound coming out of silence is judged fairly.

    Returns clack_db: the level of the loudest sudden 2-6 kHz onset relative to the whole
    sound's peak (-60 if there is none). Measured on reference sounds: hard UI clicks,
    switches, latches and casino chips score -1 to -10; the kit's limit is -18.
    """
    sos = butter(4, [2000, 6000], "bandpass", fs=SR, output="sos")
    b = sosfiltfilt(sos, mono)
    w1 = int(0.001 * SR)
    fast = np.sqrt(np.convolve(b * b, np.ones(w1) / w1, "full")[: len(b)] + 1e-20)
    w2 = int(0.020 * SR)
    slow = np.sqrt(np.convolve(b * b, np.ones(w2) / w2, "full")[: len(b)] + 1e-20)
    lag = int(0.003 * SR)
    prev = np.concatenate([np.full(lag, slow[0]), slow[:-lag]])
    fd = 20 * np.log10(fast)
    floor = fd.max() - 30
    rise = fd - np.maximum(20 * np.log10(prev), floor)
    peak = 20 * np.log10(np.abs(mono).max() + 1e-20)
    # fast is an RMS over 1 ms; +3 dB turns it into a peak-like level comparable with `peak`
    sudden = rise > rise_thresh
    if not sudden.any():
        return -60.0
    return float((fd[sudden] + 3.0).max() - peak)


def centroid_track(mono, hop_ms=10, win_ms=40, floor_db=-30):
    """Spectral centroid (the 'brightness' point) over time, only where the sound is within
    `floor_db` of its loudest frame. Returns times, centroids (Hz), levels (dB)."""
    win = int(win_ms * SR / 1000)
    hop = int(hop_ms * SR / 1000)
    w = np.hanning(win)
    fr = np.fft.rfftfreq(win, 1 / SR)
    ts, cs, ls = [], [], []
    for i in range(0, len(mono) - win, hop):
        seg = mono[i : i + win] * w
        S = np.abs(np.fft.rfft(seg)) ** 2
        e = S.sum()
        ts.append((i + win / 2) / SR)
        cs.append((S * fr).sum() / (e + 1e-20))
        ls.append(10 * np.log10(e + 1e-20))
    ts, cs, ls = map(np.array, (ts, cs, ls))
    keep = ls > ls.max() + floor_db
    return ts[keep], cs[keep], ls[keep]


def sweep_report(mono):
    """Summarise the centroid track: does the brightness glide upward (a sweep/riser)?

    Uses octaves (log2) so a move from 1 to 2 kHz counts the same as 2 to 4 kHz.
      start/end   - median centroid over the first and last 20% of the audible part (Hz)
      net_oct     - end vs start in octaves (+ means it got brighter)
      max_rise_oct- the largest upward move of the smoothed track from any earlier point
                    (catches a glide that goes up and comes back)
      slope       - least-squares slope in octaves per second, weighted by level
    """
    t, c, l = centroid_track(mono)
    if len(c) < 5:
        return dict(start=float(np.median(c)), end=float(np.median(c)), net_oct=0.0, max_rise_oct=0.0, slope=0.0)
    lc = np.log2(c)
    k = 8  # 80 ms of smoothing: a sweep is a sustained glide, not the grain of a texture
    if len(lc) <= k:
        k = max(2, len(lc) // 2)
    sm = np.convolve(lc, np.ones(k) / k, "valid")
    n5 = max(1, len(lc) // 5)
    start, end = np.median(lc[:n5]), np.median(lc[-n5:])
    run_min = np.minimum.accumulate(sm)
    max_rise = float((sm - run_min).max())
    wts = 10 ** (l / 10)
    A = np.vstack([t, np.ones_like(t)]).T * np.sqrt(wts)[:, None]
    slope = float(np.linalg.lstsq(A, lc * np.sqrt(wts), rcond=None)[0][0])
    return dict(start=float(2 ** start), end=float(2 ** end), net_oct=float(end - start), max_rise_oct=max_rise, slope=slope)


def mono_loss(st):
    """Loudness lost when left and right are summed to mono (LU). Under 1 LU is safe."""
    mono = st.mean(1)
    stereo_l = short_loudness(st)
    mono_l = short_loudness(np.stack([mono, mono], 1))
    corr = float(np.corrcoef(st[:, 0], st[:, 1])[0, 1])
    return float(stereo_l - mono_l), corr


def report(st):
    mono = st.mean(1)
    ck = clack(mono)
    e0, e1 = edge_db(st)
    ml, corr = mono_loss(st)
    return dict(
        dur=len(st) / SR,
        peak_db=float(20 * np.log10(np.abs(st).max() + 1e-20)),
        true_peak_db=float(true_peak_db(st)),
        loud=float(short_loudness(st)),
        first_db=float(e0),
        last_db=float(e1),
        edge_step_db=float(max_step_db(st)),
        clack_db=ck,
        mono_loss_lu=ml,
        lr_corr=corr,
        sweep=sweep_report(mono),
    )
