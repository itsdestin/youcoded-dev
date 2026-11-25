"""Mastering and measurement.

Mastering chain (same for every piece): 25 Hz high-pass, sub kept mono below 140 Hz, an
optional 'air' shelf (0 dB by default since 2026-11-24; see options.py), glue compression (at
most 2 dB), soft saturation only if it barely changes the level, then a true-peak look-ahead
limiter while the gain is searched so integrated loudness lands on target.
"""
import numpy as np
import pyloudnorm as pyln
from scipy import signal

from dsp import SR, biquad, butter, compress, db, limit, ms_tidy, sat, to_stereo, true_peak, undb

METER = pyln.Meter(SR)


def lufs(x):
    return float(METER.integrated_loudness(to_stereo(x)))


LAST = {}      # what the last premaster did (glue gain reduction, saturation kept or not)


def premaster(x, air_db=2.5, voice_dip_db=0.0, glue="legacy"):
    """`glue`: "legacy" (the original chain, unchanged) or "gentle" (2026-11-24, plan b4):
    1.8:1 soft knee, 30 ms / 300 ms, gain reduction capped at 2 dB, and the tanh saturation kept
    only if it changes the level by 0.5 dB or less (otherwise it is shaping the sound, not
    gluing it, and is left out)."""
    x = butter(to_stereo(x), "highpass", 25, 2)
    x = ms_tidy(x, 140)
    if air_db:
        x = biquad(x, "highshelf", 9000, 0.7, air_db)
    if voice_dip_db:
        # WHY: a narrator's intelligibility lives around 1.5-3.5 kHz; a broad, shallow dip
        # leaves that space open without the music sounding hollow
        x = biquad(x, "peak", 2500, 0.8, -voice_dip_db)
    x = x * undb(-20 - lufs(x))          # normalise before the compressor so settings mean the same
    if glue == "legacy":
        x = compress(x, -22, 1.8, attack=0.03, release=0.3)
        return sat(x * 1.1, 0.9) / 1.1
    before = x
    x = compress(x, -22, 1.8, attack=0.03, release=0.3, max_gr=2.0)
    LAST["glue_level_drop_db"] = round(float(lufs(before) - lufs(x)), 2)   # integrated, i.e. typical reduction
    y = sat(x * 1.1, 0.9) / 1.1
    change = abs(lufs(y) - lufs(x))
    LAST["saturation_level_change_db"] = round(float(change), 2)
    LAST["saturation_kept"] = bool(change <= 0.5)
    return y if change <= 0.5 else x


def finish(x, target, ceiling=-1.3, add=None, add_at=0, iters=8, tp_max=-1.05):
    """Gain + limit until integrated loudness == target. `add` (already-mastered audio, e.g.
    the logo) is summed after the limiter at a FIXED level so it stays identical. `tp_max`: the
    true-peak maximum (dBTP); -1.05 for web and EU TV, -2.05 for US TV (2026-11-24, deliver)."""
    g = target - lufs(x)
    for _ in range(iters * 2):
        y = limit(x * undb(g), ceiling)
        if add is not None:
            y = y.copy()
            j = min(len(y), add_at + len(add))
            y[add_at:j] += add[: j - add_at]
        err = target - lufs(y)
        over = true_peak(y) - tp_max
        if over > 0:
            # WHY: where the bed overlaps the pasted logo the sum can poke above the limit;
            # lower the bed's ceiling rather than touch the logo
            ceiling -= over + 0.05
            continue
        if abs(err) < 0.02:
            break
        g += err
    return y


def timeline(x, win=3.0, hop=1.0):
    """Short-term loudness (3 s windows) every second: the shape of the piece."""
    out = []
    n, h = int(win * SR), int(hop * SR)
    for i in range(0, max(1, len(x) - n + 1), h):
        v = lufs(x[i:i + n])
        out.append(round(v, 1) if np.isfinite(v) else None)
    return out


# ------------------------------------------------------------------ measurement

BANDS = [(20, 40), (40, 80), (80, 250), (250, 2000), (2000, 8000), (8000, 16000), (16000, 24000)]


def spectrum_bands(x):
    m = to_stereo(x).mean(axis=1)
    f, p = signal.welch(m, SR, nperseg=8192)
    tot = p[(f >= 20)].sum()
    return {f"{lo}-{hi}": round(float(10 * np.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-20)), 1)
            for lo, hi in BANDS}


def tone_report(x):
    """The darkness of a mix, as instruments on a dashboard (2026-11-24, plan b and e1). NOT a
    target to write toward: thresholds are the composing checks' business.
      tilt_db_per_oct  slope of the octave bands 125 Hz-8 kHz (a fit, dB per octave). Pop records
                       sit near -5; the owner's chosen piano logo measures about -11; round 7
                       (heard as harsh) measured -2 to -3.
      octaves          each octave band's share of the total, dB (centres 63 Hz-16 kHz)
      presence_2_5k / air_5_16k / above_4k   those bands' share of the total, dB."""
    m = to_stereo(x).mean(axis=1)
    f, p = signal.welch(m, SR, nperseg=8192)
    tot = p[f >= 20].sum()

    def rel(lo, hi):
        return float(10 * np.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-20))
    octs = {c: rel(c / 2 ** 0.5, c * 2 ** 0.5) for c in (63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)}
    fit = [125, 250, 500, 1000, 2000, 4000, 8000]
    slope = float(np.polyfit(np.log2(fit), [octs[c] for c in fit], 1)[0])
    return dict(tilt_db_per_oct=round(slope, 2), octaves={k: round(v, 1) for k, v in octs.items()},
                presence_2_5k=round(rel(2000, 5000), 1), air_5_16k=round(rel(5000, 16000), 1),
                above_4k=round(rel(4000, 24000), 1))


def measure(x, name):
    x = to_stereo(x)
    st = {"file": name, "seconds": round(len(x) / SR, 3)}
    # integrated loudness needs at least one 400 ms block; very short sounds report None
    st["lufs_integrated"] = round(lufs(x), 2) if len(x) > 0.4 * SR else None
    st["true_peak_dbtp"] = round(true_peak(x), 2)
    st["sample_peak_dbfs"] = round(float(db(np.abs(x).max())), 2)
    st["clipped_samples"] = int((np.abs(x) >= 0.999).sum())
    st["first_sample_dbfs"] = round(float(db(np.abs(x[0]).max())), 1)
    st["last_sample_dbfs"] = round(float(db(np.abs(x[-1]).max())), 1)
    k = int(0.002 * SR)
    st["first_2ms_rms_dbfs"] = round(float(db(np.sqrt((x[:k] ** 2).mean()))), 1)
    st["last_2ms_rms_dbfs"] = round(float(db(np.sqrt((x[-k:] ** 2).mean()))), 1)
    st["dc_offset"] = round(float(np.abs(x.mean(axis=0)).max()), 6)
    st["bands_db_rel_total"] = spectrum_bands(x)
    st["tone"] = tone_report(x)
    L, R = x[:, 0], x[:, 1]
    st["lr_correlation"] = round(float(np.corrcoef(L, R)[0, 1]), 3)
    mid, side = (L + R) / 2, (L - R) / 2
    st["side_vs_mid_db"] = round(float(db(np.sqrt((side ** 2).mean()) / np.sqrt((mid ** 2).mean()))), 1)
    if len(x) / SR >= 0.5:
        mono = np.stack([mid, mid], axis=1)
        st["mono_fold_loss_lu"] = round(lufs(mono) - st["lufs_integrated"], 2)
    st["click_score"] = click_score(x)
    return st


def click_score(x):
    """Largest jump in a >12 kHz high-passed signal relative to its local 20 ms RMS, in dB.
    Real clicks (a sample-level discontinuity) show as very isolated spikes (> ~25 dB);
    hats and shakers stay well below because their highs are spread over time."""
    h = butter(to_stereo(x).mean(axis=1), "highpass", 12000, 4)
    a = np.abs(h)
    w = int(0.02 * SR)
    loc = np.sqrt(np.convolve(h ** 2, np.ones(w) / w, mode="same")) + 1e-6
    # ignore near-silence (below -70 dBFS locally) where ratios are meaningless
    ok = loc > undb(-70)
    if not ok.any():
        return None
    return round(float(db((a[ok] / loc[ok]).max())), 1)


def motif_check(full, backing, events, window=0.15):
    """How clearly does each motif note stand out in the mix?

    `full` and `backing` are the same piece rendered with and without the motif notes (pre-
    master, identical processing), so full - backing is exactly the motif as it sounds in the
    mix. For each note, compare the motif's energy with everything else in narrow bands around
    that note's first three harmonics, over 150 ms from its onset. Above 0 dB means the motif
    note is the strongest thing at its own pitch, i.e. it is heard as the melody.
    """
    full, backing = to_stereo(full).mean(axis=1), to_stereo(backing).mean(axis=1)
    mel = full - backing
    n = int(window * SR)
    nfft = 1 << 15
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    win = np.hanning(n)

    def spec(x, i0):
        seg = x[i0: i0 + n]
        seg = np.pad(seg, (0, n - len(seg)))
        return np.abs(np.fft.rfft(seg * win, nfft)) ** 2

    ratios = []
    for t, midi in events:
        i0 = int(t * SR)
        sm, sb = spec(mel, i0), spec(backing, i0)
        f0 = 440 * 2 ** ((midi - 69) / 12)
        em = eb = 0.0
        for h in (1, 2, 3):
            band = (freqs > f0 * h * 2 ** (-0.5 / 12)) & (freqs < f0 * h * 2 ** (0.5 / 12))
            em += sm[band].sum()
            eb += sb[band].sum()
        ratios.append(float(10 * np.log10((em + 1e-20) / (eb + 1e-20))))
    r = np.array(ratios)
    return dict(notes=len(r), above_0db=int((r > 0).sum()), min_db=round(float(r.min()), 1),
                median_db=round(float(np.median(r)), 1),
                weakest=[(round(events[k][0], 2), int(events[k][1]), round(ratios[k], 1))
                         for k in np.argsort(r)[:2]])


def logo_identity(demo, logo, at):
    seg = to_stereo(demo)[at: at + len(logo)]
    lg = to_stereo(logo)[: len(seg)]
    g = float((seg * lg).sum() / (lg * lg).sum())
    corr = float((seg * lg).sum() / np.sqrt((seg ** 2).sum() * (lg ** 2).sum()))
    resid = seg - g * lg
    resid_db = float(db(np.sqrt((resid ** 2).mean()) / np.sqrt(((g * lg) ** 2).mean())))
    return dict(gain_db=round(float(db(g)), 2), correlation=round(corr, 5), residual_db=round(resid_db, 1))
