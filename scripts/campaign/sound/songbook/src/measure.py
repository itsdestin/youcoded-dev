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
            if bus in ("bowed", "air", "sing", "double", "counter") and any(s0 <= d <= s1 for s0, s1 in held):
                inside.setdefault(bus, []).append(round(float(d), 2))
                continue
            bad.append(round(float(d), 2))
        res[bus] = bad
    det = flux_onsets(y, until)
    fl = flatness_at(y, det)
    # WHY (2026-11-23, mim): the noisiest attack in the mix could only be fixed by guessing which
    # instrument made it. Name its time and the instrument that STRIKES there: of the tracks loud
    # in 2-10 kHz at that moment (within 20 dB of the loudest), the one whose energy rises most from
    # the 35 ms before to the 25 ms after (a held line is loud there but does not strike).
    worst = None
    if fl.size:
        t_w = float(det[int(np.argmax(fl))]) if len(det) == len(fl) else None
        if t_w is not None:
            i, n, pre = int(t_w * SR), int(0.025 * SR), int(0.035 * SR)
            lv, rise = {}, {}
            for bus, x in stems.items():
                hb2 = butter(x.mean(axis=1), "bandpass", [2000, 10000], 4)
                a1 = hb2[max(0, i - n // 5): i - n // 5 + n]
                a0 = hb2[max(0, i - n // 5 - pre): max(1, i - n // 5)]
                if len(a1) and len(a0):
                    lv[bus] = float(np.sqrt(np.mean(a1 ** 2)) + 1e-12)
                    rise[bus] = float(db(lv[bus] / (np.sqrt(np.mean(a0 ** 2)) + 1e-12)))
            if lv:
                top = max(lv.values())
                cand = {k: rise[k] for k in lv if lv[k] >= top * 0.1}
                who = max(cand, key=cand.get)
                worst = dict(t=round(t_w, 2), loudest_part=who,
                             rise_db={k: round(v, 1) for k, v in sorted(cand.items(), key=lambda kv: -kv[1])[:4]})
    return dict(per_instrument_not_on_a_note=res, inside_held_notes=inside, mix_attacks=len(det),
                noisiness_median=round(float(np.median(fl)), 3) if fl.size else None,
                noisiness_max=round(float(fl.max()), 3) if fl.size else None, noisiest=worst)


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
    if piece.logo == "none":
        # the hand-on ending has no logo: nothing lands
        return dict(notes=[], pickup_gap_s=[], requested_s=round(piece.land_time(), 3), scheduled_s=None,
                    heard_s=None, error_ms=0.0)
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
    out.append(join_report(y, plans, piece, piece.land_time(), "the logo lands", ep.beat0 + ep.blen))
    return out


# ------------------------------------------------------------------ the rebuild's audio instruments
# (2026-11-24, toolkit-plan e1). WHY: "harsh" and "choppy" were the owner's words for rounds 7-8;
# these turn them into numbers a composer can read. They feed the dashboard (dashboard.py), which
# never fails a render on them: they are instruments, not goals.

def _power_spectrum(x, lo=None, hi=None):
    m = x.mean(axis=1) if x.ndim > 1 else x
    f, p = signal.welch(m, SR, nperseg=8192)
    return f, p


def tilt(y, until=None):
    """The spectral slope in dB per octave from 125 Hz to 8 kHz (octave-band energies, a straight
    line fitted). Professional mixes sit near -5 dB/oct (Pestana 2013); our harsh round 7 measured
    -2 to -3, the owner's chosen piano logo -11."""
    x = y[: int(until * SR)] if until else y
    f, p = _power_spectrum(x)
    centres = [125 * 2 ** k for k in range(7)]          # 125 .. 8000
    e = []
    for c in centres:
        sel = (f >= c / np.sqrt(2)) & (f < c * np.sqrt(2))
        e.append(10 * np.log10(np.sum(p[sel]) + 1e-20))
    k = np.arange(len(centres))
    slope = np.polyfit(k, e, 1)[0]
    return round(float(slope), 2), [round(v - e[0], 1) for v in e]


def presence(y, until=None):
    """Energy 2-5 kHz and 5-16 kHz in dB relative to the whole (the 'presence' and 'air' bands)."""
    x = y[: int(until * SR)] if until else y
    f, p = _power_spectrum(x)
    tot = np.sum(p[(f >= 20) & (f < 20000)]) + 1e-20
    b1 = np.sum(p[(f >= 2000) & (f < 5000)])
    b2 = np.sum(p[(f >= 5000) & (f < 16000)])
    return round(float(10 * np.log10(b1 / tot + 1e-20)), 1), round(float(10 * np.log10(b2 / tot + 1e-20)), 1)


def novelty_peaks(y, until=None, hop=0.1, kernel_s=4.0):
    """'Choppy' made measurable (Foote 2000): a self-similarity matrix of 100 ms log-mel frames,
    a checkerboard kernel of 4 s slid along its diagonal; each clear peak is a moment where the
    music turns into something different. Returns (peaks per 10 s, peak times)."""
    x = y[: int(until * SR)] if until else y
    m = x.mean(axis=1)
    n = int(hop * SR)
    frames = len(m) // n
    if frames < 2 * int(kernel_s / hop) + 2:
        return 0.0, []
    win = np.hanning(2 * n)
    spec = []
    for i in range(frames - 1):
        seg = m[i * n: i * n + 2 * n]
        if len(seg) < 2 * n:
            break
        mag = np.abs(np.fft.rfft(seg * win))
        spec.append(mag)
    S = np.array(spec)
    f = np.fft.rfftfreq(2 * n, 1 / SR)
    edges = np.geomspace(60, 12000, 33)
    mel = np.stack([S[:, (f >= a) & (f < b)].sum(axis=1) for a, b in zip(edges[:-1], edges[1:])], axis=1)
    F = np.log(mel + 1e-9)
    F = F - F.mean(axis=1, keepdims=True)
    F = F / (np.linalg.norm(F, axis=1, keepdims=True) + 1e-9)
    sim = F @ F.T
    L = int(kernel_s / hop / 2)
    g = np.outer(np.hanning(2 * L), np.hanning(2 * L))
    sign = np.ones((2 * L, 2 * L))
    sign[:L, L:] = -1
    sign[L:, :L] = -1
    K = g * sign
    nov = np.zeros(len(F))
    for i in range(L, len(F) - L):
        nov[i] = np.sum(sim[i - L:i + L, i - L:i + L] * K)
    nov = np.maximum(nov, 0)
    if nov.max() <= 0:
        return 0.0, []
    nov /= nov.max()
    pk, _ = signal.find_peaks(nov, height=0.35, distance=int(2.0 / hop))
    times = [round(float(i * hop), 1) for i in pk]
    return round(len(pk) / (len(m) / SR) * 10, 2), times


def _vass(f1, f2, a1, a2):
    fmin, fmax = np.minimum(f1, f2), np.maximum(f1, f2)
    amin, amax = np.minimum(a1, a2), np.maximum(a1, a2)
    s = 0.24 / (0.0207 * fmin + 18.96)
    x = (amin * amax) ** 0.1 * 0.5 * (2 * amin / (amin + amax + 1e-12)) ** 3.11
    return x * (np.exp(-3.5 * s * (fmax - fmin)) - np.exp(-5.75 * s * (fmax - fmin)))


def _frame_roughness(seg, npk=14):
    win = np.hanning(len(seg))
    mag = np.abs(np.fft.rfft(seg * win))
    f = np.fft.rfftfreq(len(seg), 1 / SR)
    sel = (f > 50) & (f < 5000)
    mag, f = mag[sel], f[sel]
    pk, _ = signal.find_peaks(mag)
    if len(pk) < 2:
        return 0.0
    pk = pk[np.argsort(mag[pk])[-npk:]]
    a = mag[pk] / (np.sqrt(np.sum(mag[pk] ** 2)) + 1e-12)       # level-normalised
    fr = f[pk]
    i, j = np.triu_indices(len(pk), 1)
    return float(np.sum(_vass(fr[i], fr[j], a[i], a[j])))


_REF = None


def roughness(y, until=None, hop=0.1):
    """Vassilakis roughness per 100 ms frame, level-normalised, as a ratio to a plain E-flat major
    triad (Eb4 G4 Bb4, each with 8 harmonics at 1/k) measured the same way. Returns (95th percentile ratio, worst
    time). Uncalibrated until the owner's harsh/fine ratings set it (toolkit-plan f6)."""
    global _REF
    n = int(0.2 * SR)
    if _REF is None:
        t = np.arange(n) / SR
        from dsp import midi_hz
        # WHY harmonics (8, at 1/k): our instruments have overtones, which beat among themselves;
        # a reference of pure sines made every piece look 10x rougher than a plain chord
        tri = sum(np.sin(2 * np.pi * k * midi_hz(m) * t) / k for m in (63, 67, 70) for k in range(1, 9))
        _REF = _frame_roughness(tri) or 1e-6
    x = (y[: int(until * SR)] if until else y).mean(axis=1)
    h = int(hop * SR)
    vals = []
    for i in range(0, len(x) - n, h):
        seg = x[i:i + n]
        if np.sqrt(np.mean(seg ** 2)) < 1e-4:
            continue
        vals.append((_frame_roughness(seg) / _REF, i / SR))
    if not vals:
        return 0.0, None
    r = np.array([v for v, _ in vals])
    w = max(vals)
    return round(float(np.percentile(r, 95)), 2), round(w[1], 1)


def gap_fill(y, t0=1.0, until=None, win=0.2, hop=0.05, block=0.5):
    """How far the level dips between the pulse's notes: K-weighted loudness in 200 ms windows
    every 50 ms; in each half-second the swing (max - min); the median over the piece, dB, and
    the worst half-second. WHY (audit 2026-11-25, defect 2): the sustain was meant to stop a pulse
    of separate notes sounding choppy, but its effect was not measured; measured this way the
    recipe beds read 4.6-4.8 dB, round 8's mim-r5 1.9, tale-r4 3.0, v1 mim 4.9 and round 7's
    "choppy" mim-r3 4.3. Uncalibrated until the owner rates choppy/fine."""
    t, v = momentary(y, hop=hop, win=win)
    t1 = until if until else t[-1]
    sel = (t >= t0) & (t <= t1)
    t, v = t[sel], v[sel]
    if len(t) < 4:
        return 0.0, None
    out = []
    k = int(round(block / hop))
    for i in range(0, len(v) - k + 1, k):
        seg = v[i:i + k]
        seg = seg[seg > -70]
        if len(seg) >= 2:
            out.append((float(seg.max() - seg.min()), float(t[i])))
    if not out:
        return 0.0, None
    sw = np.array([a for a, _ in out])
    w = max(out)
    return round(float(np.median(sw)), 1), (round(w[0], 1), round(w[1], 1))


def silences(y, t0, t1, thresh=-50.0):
    """Stretches between t0 and t1 where the music's momentary loudness is below `thresh` LUFS
    (no sound where music should be): [(start, end)]."""
    t, v = momentary(y)
    out, cur = [], None
    for a, b in zip(t, v):
        if t0 <= a <= t1 and b < thresh:
            cur = [a, a] if cur is None else [cur[0], a]
        elif cur is not None:
            out.append((round(cur[0], 2), round(cur[1], 2)))
            cur = None
    if cur is not None:
        out.append((round(cur[0], 2), round(cur[1], 2)))
    return [s for s in out if s[1] - s[0] >= 0.3]


def voice_margin(music, voice_path, speech_words, start_at=0.0, t_from=0.0, music_db=0.0, win=1.67):
    """How far a narrator stands above the music in the phone band (300 Hz-8 kHz) over her words,
    in windows of `win` s: (median dB, worst dB, worst time). `music_db` = the gain the film's mux
    puts on the music (e.g. -10). WHY: "the voice always wins"; under 6 dB she is masked."""
    import soundfile as sf
    v, sr = sf.read(voice_path, dtype="float64", always_2d=True)
    if sr != SR:
        from math import gcd
        g = gcd(SR, sr)
        v = signal.resample_poly(v, SR // g, sr // g, axis=0)
    a = int(t_from * SR)
    v = v[a:]
    off = int(start_at * SR)
    vv = np.zeros_like(music[:, :1].repeat(2, axis=1))
    k = min(len(vv) - off, len(v))
    if k <= 0:
        return None
    vv[off:off + k] = v[:k, :2] if v.shape[1] >= 2 else np.repeat(v[:k], 2, axis=1)
    mm = music * 10 ** (music_db / 20)
    band = lambda x: butter(butter(x.mean(axis=1), "highpass", 300, 4), "lowpass", 8000, 4)
    vb, mb = band(vv), band(mm)
    words = [(a_, b_) for _, a_, b_ in speech_words]
    res = []
    t = 0.0
    L = len(music) / SR
    while t + win <= L:
        spoken = sum(max(0.0, min(t + win, b_) - max(t, a_)) for a_, b_ in words)
        if spoken >= 0.5 * win:
            i, j = int(t * SR), int((t + win) * SR)
            dv = 10 * np.log10(np.mean(vb[i:j] ** 2) + 1e-20)
            dm = 10 * np.log10(np.mean(mb[i:j] ** 2) + 1e-20)
            res.append((dv - dm, t))
        t += win / 2
    if not res:
        return None
    d = np.array([x for x, _ in res])
    w = min(res)
    return round(float(np.median(d)), 1), round(w[0], 1), round(w[1], 2)
