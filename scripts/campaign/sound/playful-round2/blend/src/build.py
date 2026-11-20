"""Render blend-1 and blend-2 into ../out/, master them, paste the logo, and measure.

Run via ../render.sh. Mastering is the chosen candidate's own chain (base/master.py, an
unmodified copy). The logo is felt-and-pulse/out/logo.wav, pasted after the limiter at +2 dB
(as in every existing demo) so it stays bit-for-bit the same sound.
"""
import json
import os
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "base"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import pyloudnorm as pyln  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402

import blend  # noqa: E402
from dsp import SR, butter, db, undb  # noqa: E402
from master import finish, logo_identity, lufs, measure, motif_check, premaster  # noqa: E402

ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "out")
LOGO = os.path.join(ROOT, "..", "..", "felt-and-pulse", "out", "logo.wav")
LOGO_DB = 2.0


def read(path):
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    return y


def flux_onsets(y, end=17.0):
    """Attacks above 1 kHz in the master (spectral-flux peaks), same detector as round 1."""
    m = y[: int(end * SR)].mean(axis=1)
    f, t, S = signal.stft(m, SR, nperseg=1024, noverlap=768)
    S = np.abs(S[f > 1000])
    flux = np.maximum(np.diff(np.log(S + 1e-6), axis=1), 0).sum(axis=0)
    thr = np.median(flux) + 2.5 * np.std(flux)
    peaks, _ = signal.find_peaks(flux, height=thr, distance=int(0.06 * SR / 256))
    return t[1:][peaks] + 512 / SR      # frame centre


def flatness_at(y, times, lo=2000, hi=10000):
    """Spectral flatness (0 = pure tones, 1 = white noise) of the 2-10 kHz band in the 25 ms
    after each attack. Drum sounds (snaps, hats, ticks, shakers) are noise and read high;
    a struck or plucked string reads low."""
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


def stem_attacks_on_notes(stems, onsets, held):
    """Per instrument: every attack found in that instrument's own track belongs to a note it
    played: from 40 ms before its start to 200 ms after (a real plucked string has a second
    bloom 70-150 ms into the note, measured on single VSCO pizz notes). For held strings an
    attack may also fall inside a held note (bow and vibrato movement); those are listed
    separately so nothing is hidden. Sharper than the full mix, where attacks blur together."""
    res, inside = {}, {}
    for bus, x in stems.items():
        if np.abs(x).max() < 1e-6 or bus == "bass":
            continue
        det = flux_onsets(x, end=17.4)
        det = det[det < 16.85]   # WHY: the music fades from 16.9 s; the window edge itself reads as an attack
        # WHY: on one instrument alone the detector also fires on tiny (<1 dB) beating between
        # held notes; only count a real attack: 1-8 kHz energy rising 3 dB or more in 20 ms
        hb = butter(x.mean(axis=1), "bandpass", [1000, 8000], 4)
        w = int(0.02 * SR)

        def rise(d):
            i = int(d * SR)
            a0 = np.sqrt(np.mean(hb[max(0, i - 2 * w): i - w // 2] ** 2)) + 1e-12
            a1 = np.sqrt(np.mean(hb[i - w // 2: i + w] ** 2)) + 1e-12
            return db(a1 / a0)
        det = np.array([d for d in det if rise(d) >= 3.0])
        mine = np.array(sorted(t for t, b in onsets if b == bus))
        bad = []
        for d in det:
            rel = d - mine
            if np.any((rel > -0.04) & (rel < 0.2)):
                continue
            if bus == "strings" and any(s0 <= d <= s1 for s0, s1 in held):
                inside.setdefault(bus, []).append(round(float(d), 3))
                continue
            bad.append(round(float(d), 3))
        res[bus] = bad
    return res, inside


def transient_check(y, onsets):
    """Every sharp attack in the mix must sit on a played note (within 35 ms), i.e. nothing
    percussive happens that isn't a note being struck or plucked. Also report how 'hit-like'
    the attacks are: the jump of >2 kHz energy in 5 ms windows."""
    det = flux_onsets(y)
    notes = np.array(sorted(t for t, _ in onsets))
    unmatched = [round(float(d), 3) for d in det if np.min(np.abs(notes - d)) > 0.035]
    hp = butter(y.mean(axis=1), "highpass", 2000, 4)
    w = int(0.005 * SR)
    e = np.sqrt(np.convolve(hp ** 2, np.ones(w) / w, mode="same"))[: int(17 * SR)] + 1e-9
    jump = db(e[w * 2:] / e[:-w * 2])
    fl = flatness_at(y, det)
    return dict(attacks=len(det), attacks_per_second=round(len(det) / 17.0, 1),
                attacks_not_on_a_note_in_mix=unmatched,
                noisiness_median=round(float(np.median(fl)), 3) if fl.size else None,
                noisiness_max=round(float(fl.max()), 3) if fl.size else None,
                sharpest_attack_db=round(float(np.percentile(jump, 99.99)), 1))


def steadiness(y, a=4.0, b=16.5):
    """Does the volume bounce? Momentary loudness (400 ms) every 100 ms; report the spread
    (90th minus 10th percentile) and the largest change within any 1 s, between a and b."""
    vals, times = [], []
    for s in np.arange(a, b - 0.4, 0.1):
        seg = y[int(s * SR): int((s + 0.4) * SR)]
        # momentary loudness of the mono fold (K-weighted mean square, both channels)
        vals.append(-0.691 + 10 * np.log10(np.mean(_kw(seg) ** 2) * 2 + 1e-12))
        times.append(s)
    v = np.array(vals)
    swing1s = max(float(np.ptp(v[i:i + 10])) for i in range(len(v) - 10))
    return dict(spread_db=round(float(np.percentile(v, 90) - np.percentile(v, 10)), 1),
                biggest_change_in_1s_db=round(swing1s, 1),
                per_bar=[round(float(np.mean(v[(np.array(times) >= k * 2) & (np.array(times) < k * 2 + 2)])), 1)
                         for k in range(2, 8)])


_KW = None


def _kw(seg):
    """K-weighting (the loudness standard's ear filter), mono."""
    global _KW
    if _KW is None:
        m = pyln.Meter(SR)
        _KW = [(f.b, f.a) for f in m._filters.values()]
    x = seg.mean(axis=1)
    for bb, aa in _KW:
        x = signal.lfilter(bb, aa, x)
    return x


def low_end(y):
    m = y.mean(axis=1)
    lo = butter(m, "bandpass", [40, 150], 4)
    w = int(0.01 * SR)
    env = np.sqrt(np.convolve(lo ** 2, np.ones(w) / w, mode="same"))[: int(17.0 * SR)]
    env_db = db(env + 1e-9)
    loud = env_db[env_db > env_db.max() - 40]
    return round(float(np.percentile(loud, 95) - np.percentile(loud, 50)), 1)


def one(name):
    logo = read(LOGO)
    raw, b = blend.render_version(name)
    at = int(round(blend.LOGO_AT * SR))
    y = finish(premaster(raw), -14.0, add=logo * undb(LOGO_DB), add_at=at)
    path = os.path.join(OUT, f"{name}.wav")
    sf.write(path, y, SR, subtype="PCM_24")
    y = read(path)
    st = measure(y, f"{name}.wav")
    st["logo_identity"] = logo_identity(y, logo, at)
    st["logo_third_note_s"] = round(at / SR + 0.5, 3)
    raw_b, _ = blend.render_version(name, backing=True)
    st["tune_vs_rest"] = motif_check(raw, raw_b, b.melody)
    st["stem_lufs"] = {k: (round(lufs(s), 1) if np.abs(s).max() > 1e-6 else None) for k, s in b.stems.items()}
    pianos = b.stems["p1"] + b.stems["p2"]
    back = sum(s for k, s in b.stems.items() if k not in ("p1", "p2"))
    st["pianos_over_everything_else_lu"] = round(lufs(pianos) - lufs(back), 1)
    st["transients"] = transient_check(y, b.onsets)
    bad, inside = stem_attacks_on_notes(b.stems, b.onsets, b.held_spans)
    st["transients"]["per_instrument_attacks_not_on_a_note"] = bad
    st["transients"]["string_movements_inside_held_notes"] = inside
    st["steadiness"] = steadiness(y)
    st["low_end_jumpiness_db"] = low_end(y)
    st["tail_last_100ms_rms_dbfs"] = round(float(db(np.sqrt((y[-int(0.1 * SR):] ** 2).mean()))), 1)
    return name, st


def main():
    os.makedirs(OUT, exist_ok=True)
    with Pool(2) as pool:
        res = dict(pool.map(one, list(blend.VERSIONS)))
    with open(os.path.join(OUT, "measurements.json"), "w") as f:
        json.dump(res, f, indent=1)
    lines = []
    for k, v in res.items():
        tv, tr, sd, li = v["tune_vs_rest"], v["transients"], v["steadiness"], v["logo_identity"]
        checks = [
            ("length 20.000 s", abs(v["seconds"] - 20.0) < 1e-6),
            ("loudness -14 +-0.1 LUFS", abs(v["lufs_integrated"] + 14) <= 0.1),
            ("true peak <= -1 dBTP", v["true_peak_dbtp"] <= -1.0),
            ("no clipped samples", v["clipped_samples"] == 0),
            ("silent first/last sample", v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90),
            ("mono fold loss < 1.5 LU", v["mono_fold_loss_lu"] > -1.5),
            ("every tune note on top", tv["above_0db"] == tv["notes"]),
            ("logo identical", li["correlation"] >= 0.95 and abs(li["gain_db"] - LOGO_DB) < 0.3),
            ("every attack in every instrument is a note",
             not any(tr["per_instrument_attacks_not_on_a_note"].values())),
            ("no noise-like (drum-like) attack", tr["noisiness_max"] is not None and tr["noisiness_max"] < 0.1),
        ]
        bad = [n for n, ok in checks if not ok]
        lines.append(f"{'PASS' if not bad else 'FAIL'}  {k}: " + ("all checks" if not bad else "failed " + ", ".join(bad)))
        lines.append(f"   LUFS {v['lufs_integrated']}  true peak {v['true_peak_dbtp']}  clipped {v['clipped_samples']}  "
                     f"first/last sample {v['first_sample_dbfs']}/{v['last_sample_dbfs']} dBFS  mono loss {v['mono_fold_loss_lu']} LU  "
                     f"click score {v['click_score']}")
        lines.append(f"   tune: {tv['notes']} notes, {tv['above_0db']} on top, weakest {tv['min_db']} dB, median {tv['median_db']} dB, "
                     f"weakest at {tv['weakest']};  pianos over the rest {v['pianos_over_everything_else_lu']} LU")
        lines.append(f"   logo: correlation {li['correlation']}, gain {li['gain_db']} dB, residual {li['residual_db']} dB; third note at {v['logo_third_note_s']} s")
        lines.append(f"   attacks {tr['attacks']} ({tr['attacks_per_second']}/s); per instrument not on a note: "
                     f"{tr['per_instrument_attacks_not_on_a_note']}; string movements inside held notes "
                     f"{tr['string_movements_inside_held_notes']}; in the full mix >35 ms from a note: "
                     f"{len(tr['attacks_not_on_a_note_in_mix'])}; noisiness of attacks median {tr['noisiness_median']} "
                     f"max {tr['noisiness_max']}; low-end jumpiness {v['low_end_jumpiness_db']} dB")
        lines.append(f"   steadiness 4-16.5 s: spread {sd['spread_db']} dB, biggest change in 1 s {sd['biggest_change_in_1s_db']} dB, "
                     f"bar means (bars 3-8) {sd['per_bar']}")
        lines.append(f"   bands {v['bands_db_rel_total']}  stems {v['stem_lufs']}")
    lines.append("")
    lines.append("reference, same measures on round-1 files (read-only):")
    for ref in ("0-original", "2-no-drums", "7-clockwork", "12-strings-pizzicato", "13-strings-swell", "14-two-pianos"):
        path = os.path.join(ROOT, "..", "..", "felt-and-pulse-playful", "out", f"{ref}.wav")
        if not os.path.exists(path):
            continue
        y = read(path)
        det = flux_onsets(y)
        fl = flatness_at(y, det)
        sd = steadiness(y)
        lines.append(f"   {ref:<22} attacks/s {len(det) / 17:.1f}  noisiness median {np.median(fl):.3f} max {fl.max():.3f}  "
                     f"spread {sd['spread_db']} dB  biggest 1 s change {sd['biggest_change_in_1s_db']} dB")
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
