"""Checks for every rendered piece (I cannot listen, so every claim is a number).

Reuses master.py's measurements (loudness, true peak, clipping, bands, mono) and adds:
  - tune_identity: every tune note placed is the canonical tune's note at that position
  - attacks: every sharp attack in every instrument's own track belongs to a note it played,
    and how noise-like (drum-like) the attacks in the mix are
  - steadiness: momentary loudness inside each section, and the largest change in any 1 s
"""
import numpy as np
import pyloudnorm as pyln
from scipy import signal

import tune as T
from dsp import SR, butter, db, note

# ------------------------------------------------------------------ the same tune everywhere


def canonical(canon):
    seg, b = canon[0], canon[1]
    if seg == "ending":
        return {x[0]: note(x[1]) for x in T.ENDING}[b]
    if seg == "logo":
        return {x[0]: note(x[1]) for x in T.LOGO_CELL}[b]
    notes = T.SEGMENTS[seg][0]
    return {x[0]: note(x[1]) for x in notes}[b]


def tune_identity(band):
    """Every tune note that sounded vs. the canonical tune. Returns counts and mismatches.
    WHY derived notes are counted, not compared (2026-11-23): a note a composer developed from
    the tune (motif.py: moved, inverted, re-ended...) or wrote by hand carries its origin and its
    changes in `canon`; demanding it equal the original note is what used to forbid any
    development. The plain tune, the ending and the logo are still compared note for note."""
    seen, bad = {}, []
    for t, m, canon, bus in band.tune_log:
        if canon is None:
            continue
        if canon[0] == "written" or (len(canon) > 2 and canon[2]):
            key = "written" if canon[0] == "written" else "developed"
            seen[key] = seen.get(key, 0) + 1
            continue
        want = canonical(canon)
        seen[canon[0]] = seen.get(canon[0], 0) + 1
        if m != want:
            bad.append((round(t, 2), canon, m, want))
    return dict(notes=sum(seen.values()), by_segment=seen, mismatches=bad)


# ------------------------------------------------------------------ attacks


def flux_onsets(x, end):
    m = x[: int(end * SR)].mean(axis=1)
    f, t, S = signal.stft(m, SR, nperseg=1024, noverlap=768)
    S = np.abs(S[f > 1000])
    flux = np.maximum(np.diff(np.log(S + 1e-6), axis=1), 0).sum(axis=0)
    thr = np.median(flux) + 2.5 * np.std(flux)
    peaks, _ = signal.find_peaks(flux, height=thr, distance=int(0.06 * SR / 256))
    return t[1:][peaks] + 512 / SR


def flatness_at(y, times, lo=2000, hi=10000):
    """Spectral flatness of 2-10 kHz in the 25 ms after each attack: drums (noise) read high
    (the old snap/hat mix 0.47), struck or plucked strings read low."""
    m = y.mean(axis=1)
    n = int(0.025 * SR)
    f = np.fft.rfftfreq(n, 1 / SR)
    band = (f >= lo) & (f < hi)
    out = []
    for t in times:
        seg = m[int(t * SR) - n // 5: int(t * SR) - n // 5 + n]
        if len(seg) < n:
            continue
        p = np.abs(np.fft.rfft(seg * np.hanning(n)))[band] ** 2 + 1e-20
        out.append(float(np.exp(np.mean(np.log(p))) / np.mean(p)))
    return np.array(out)


def attacks(y, stems, onsets, held, until):
    """Per instrument: every attack (1-8 kHz energy rising 3 dB+ in 20 ms, at a spectral-flux
    peak) must fall from 40 ms before to 200 ms after a note that instrument started (a real
    pluck blooms 70-150 ms in). Attacks inside a held bowed note are listed separately (bow
    and vibrato movement), not hidden."""
    res, inside = {}, {}
    for bus, x in stems.items():
        if np.abs(x).max() < 1e-6 or bus == "sub":
            continue
        det = flux_onsets(x, until)
        det = det[det < until - 0.1]
        hb = butter(x.mean(axis=1), "bandpass", [1000, 8000], 4)
        w = int(0.02 * SR)

        def rise(d):
            i = int(d * SR)
            a0 = np.sqrt(np.mean(hb[max(0, i - 2 * w): max(1, i - w // 2)] ** 2)) + 1e-12
            a1 = np.sqrt(np.mean(hb[max(0, i - w // 2): i + w] ** 2)) + 1e-12
            return db(a1 / a0)
        det = [d for d in det if rise(d) >= 3.0]
        mine = np.array(sorted(t for t, b in onsets if b == bus)) if any(b == bus for _, b in onsets) else np.array([-9.0])
        bad = []
        for d in det:
            rel = d - mine
            if np.any((rel > -0.04) & (rel < 0.2)):
                continue
            if bus in ("bowed", "air", "sing", "double") and any(s0 <= d <= s1 for s0, s1 in held):
                inside.setdefault(bus, []).append(round(float(d), 2))
                continue
            bad.append(round(float(d), 2))
        res[bus] = bad
    det = flux_onsets(y, until)
    fl = flatness_at(y, det)
    return dict(per_instrument_not_on_a_note=res, inside_held_notes=inside, mix_attacks=len(det),
                noisiness_median=round(float(np.median(fl)), 3) if fl.size else None,
                noisiness_max=round(float(fl.max()), 3) if fl.size else None)


# ------------------------------------------------------------------ steadiness

_KW = None


def _kw(seg):
    global _KW
    if _KW is None:
        m = pyln.Meter(SR)
        _KW = [(f.b, f.a) for f in m._filters.values()]
    x = seg.mean(axis=1)
    for bb, aa in _KW:
        x = signal.lfilter(bb, aa, x)
    return x


def momentary(y, hop=0.1, win=0.4):
    """Momentary loudness (400 ms, K-weighted, mono fold) every 100 ms: (times, values)."""
    k = _kw(y) ** 2
    c = np.concatenate([[0], np.cumsum(k)])
    n, h = int(win * SR), int(hop * SR)
    starts = np.arange(0, len(k) - n, h)
    ms = (c[starts + n] - c[starts]) / n
    return starts / SR + win / 2, -0.691 + 10 * np.log10(ms * 2 + 1e-12)


def steadiness(y, plans, logo_start, piece=None):
    """Inside each section (0.5 s in from each edge): spread (90th - 10th percentile) and the
    largest change within 1 s. Over the whole piece (0.5 s to just before the logo): the
    largest change within any 1 s, and where."""
    t, v = momentary(y)

    def max1s(lo, hi):
        sel = np.where((t >= lo) & (t <= hi))[0]
        best, at = 0.0, lo
        for i in sel:
            j = sel[(t[sel] > t[i]) & (t[sel] <= t[i] + 1.0)]
            if len(j):
                d = float(np.max(np.abs(v[j] - v[i])))
                if d > best:
                    best, at = d, float(t[i])
        return round(best, 1), round(at, 1)

    rows = []
    for p in plans:
        lo, hi = p.t0 + 0.5, min(p.t1, logo_start - 0.4) - 0.5
        if hi - lo < 1.0:
            continue
        sel = (t >= lo) & (t <= hi)
        rows.append(dict(section=p.sec.label if not p.ending else "ending", t0=round(p.t0, 2),
                         t1=round(p.t1, 2), median=round(float(np.median(v[sel])), 1),
                         spread=round(float(np.percentile(v[sel], 90) - np.percentile(v[sel], 10)), 1),
                         max_change_1s=max1s(lo, hi)[0]))
    g, at = max1s(0.5, logo_start - 0.4)
    return dict(sections=rows, whole_max_change_1s=g, at=at)


# ------------------------------------------------------------------ the logo, played


def landing(band, plans, piece):
    """The logo played live: are its three notes the logo's (B-flat, G, F), and does the third
    land on the requested time? Measured from the lead piano's own track: the moment its
    energy above 200 Hz first reaches half of the landing note's peak."""
    cell = sorted((t, m) for t, m, canon, bus in band.tune_log if canon and canon[0] == "logo")
    x = butter(band.stems["lead"].mean(axis=1), "highpass", 200, 2)
    want = piece.land_time()
    i0, i1 = int((want - 0.08) * SR), int((want + 0.25) * SR)
    w = int(0.002 * SR)
    env = np.sqrt(np.convolve(x[i0:i1] ** 2, np.ones(w) / w, mode="same"))
    # the previous note is still ringing: find the landing's own rise (the steepest 5 ms climb)
    lag = int(0.005 * SR)
    rise = env[lag:] - env[:-lag]
    j = int(np.argmax(rise))
    seg = env[max(0, j - lag): j + 4 * lag]
    pk = seg.max()
    k = max(0, j - lag) + int(np.argmax(seg > env[max(0, j - lag)] + 0.5 * (pk - env[max(0, j - lag)])))
    heard = (i0 + k) / SR
    names = "C Db D Eb E F Gb G Ab A Bb B".split()
    return dict(notes=[names[m % 12] + str(m // 12 - 1) for _, m in cell],
                pickup_gap_s=[round(cell[i + 1][0] - cell[i][0], 3) for i in range(len(cell) - 1)],
                requested_s=round(want, 3), scheduled_s=round(cell[-1][0], 4) if cell else None,
                heard_s=round(heard, 4), error_ms=round((heard - want) * 1000, 1))


# ------------------------------------------------------------------ joins


def _bands(seg):
    m = seg.mean(axis=1)
    f, p = signal.welch(m, SR, nperseg=4096)
    tot = p[f >= 20].sum() + 1e-30
    return {k: round(float(10 * np.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-20)), 1)
            for k, (lo, hi) in {"2-8k": (2000, 8000), "8-16k": (8000, 16000)}.items()}


def join_report(y, plans, piece, t, label, beat=None):
    """Level and brightness 1.3 s either side of a join, the tempo curve around it (one value
    per beat from 8 beats before to 4 after) and the largest level change within 1 s, 3 s
    either side."""
    tt, v = momentary(y)
    tm = plans[0].tm

    def med(a, b):
        sel = (tt >= a) & (tt <= b)
        return round(float(np.median(v[sel])), 1)

    def br(a, b):
        return _bands(y[int(a * SR): int(b * SR)])

    lo, hi = max(0.5, t - 3.0), min(piece.length - 1.1, t + 3.0)
    sel = np.where((tt >= lo) & (tt <= hi))[0]
    big, at = 0.0, t
    for i in sel:
        jj = sel[(tt[sel] > tt[i]) & (tt[sel] <= tt[i] + 1.0)]
        if len(jj):
            d = float(np.max(np.abs(v[jj] - v[i])))
            if d > big:
                big, at = d, float(tt[i])
    curve = None
    if beat is not None:
        curve = [round(float(tm.bpm_at(beat + k)), 1) for k in range(-8, 5)]
    return dict(join=label, t=round(t, 2), level_before=med(t - 1.5, t - 0.2), level_after=med(t + 0.2, min(t + 1.5, piece.length - 1.1)),
                bright_before=br(t - 1.5, t - 0.2), bright_after=br(t + 0.2, min(t + 1.5, piece.length - 1.1)),
                max_change_1s=round(big, 1), max_change_at=round(at, 1), tempo_per_beat=curve)


def joins(y, plans, piece):
    out = []
    for k in range(1, len(plans)):
        p = plans[k]
        name = ("into the ending" if p.ending else f"{plans[k - 1].sec.label} -> {p.sec.label}")
        out.append(join_report(y, plans, piece, p.t0, name, p.beat0))
    ep = plans[-1]
    out.append(join_report(y, plans, piece, piece.land_time(), "the logo lands", ep.beat0 + 4))
    return out
