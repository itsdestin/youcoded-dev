"""Render pianos-1 and pianos-2 into ../out/ and measure them (run via ../render.sh).

Mastering is the brand's own chain (base/master.py, an unmodified copy): premaster, then gain +
true-peak limit to -14 LUFS with the logo pasted AFTER the limiter at +2 dB, so it stays the
exact logo.wav. Everything is seeded: two renders in a row give identical files.
"""
import json
import os
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "base"))   # copy of felt-and-pulse/src (only the piano path changed)
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402

import score  # noqa: E402
from dsp import SR, butter, db, undb  # noqa: E402
from master import finish, logo_identity, lufs, measure, motif_check, premaster  # noqa: E402

OUT = os.path.join(HERE, "..", "out")
LOGO = os.path.join(HERE, "..", "..", "..", "felt-and-pulse", "out", "logo.wav")   # read only
LOGO_IN_DEMO_DB = 2.0


def read(path):
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    return y


def stray_hits(y, onsets, end=17.2, tol=0.035):
    """Sharp attacks above 1 kHz (spectral-flux peaks, the same detector the first round used)
    that do NOT line up with any written note start. A drum, click or clack would show up here;
    a piano or synth note attack would not."""
    # WHY analyse past `end` and then drop late peaks: cutting the signal exactly at `end`
    # makes the transform's edge look like an attack
    m = y[: int((end + 0.3) * SR)].mean(axis=1)
    f, t, S = signal.stft(m, SR, nperseg=1024, noverlap=768)
    S = np.abs(S[f > 1000])
    flux = np.maximum(np.diff(np.log(S + 1e-6), axis=1), 0).sum(axis=0)
    thr = np.median(flux) + 2.5 * np.std(flux)
    peaks, _ = signal.find_peaks(flux, height=thr, distance=int(0.06 * SR / 256))
    times = t[1:][peaks] - 1024 / SR / 2          # frame centre -> frame start
    times = times[times < end]
    on = np.array(sorted(onsets))
    stray = [round(float(x), 3) for x in times if np.min(np.abs(on - x)) > tol]
    return dict(attacks=int(len(times)), attacks_per_second=round(len(times) / end, 1), stray=stray)


def steadiness(y, start=0.5, end=17.0):
    """Does the volume bounce? Momentary loudness (400 ms windows, every 100 ms) between start
    and end: the spread (90th minus 10th percentile, LU) and the biggest change from one
    second to the next (1 s windows)."""
    mom = []
    for i in np.arange(start, end - 0.4, 0.1):
        # WHY 0.41 s: the meter needs slightly more than one 400 ms block
        mom.append(lufs(y[int(i * SR): int((i + 0.41) * SR)]))
    mom = np.array(mom)
    sec = np.array([lufs(y[int(i * SR): int((i + 1) * SR)]) for i in np.arange(start, end - 1, 1.0)])
    # one bar (2 s) at a time: the phrase-level level the owner hears as "bouncing" or steady
    bars = np.array([lufs(y[int(i * SR): int((i + 2) * SR)]) for i in np.arange(0, 16.0, 2.0)])
    return dict(momentary_spread_lu=round(float(np.percentile(mom, 90) - np.percentile(mom, 10)), 1),
                max_second_to_second_lu=round(float(np.abs(np.diff(sec)).max()), 1),
                per_second_lufs=[round(float(v), 1) for v in sec],
                per_bar_lufs=[round(float(v), 1) for v in bars],
                max_bar_to_bar_lu=round(float(np.abs(np.diff(bars)).max()), 1))


def one(name):
    logo = read(LOGO)
    score.MODE = "full"
    raw, s, cfg = score.build(name)
    at = int(round(score.LOGO_AT * SR))
    y = finish(premaster(raw), -14.0, add=logo * undb(LOGO_IN_DEMO_DB), add_at=at)
    path = os.path.join(OUT, f"{name}.wav")
    sf.write(path, y, SR, subtype="PCM_24")
    y = read(path)
    st = measure(y, f"{name}.wav")
    st["logo_identity"] = logo_identity(y, logo, at)
    score.MODE = "backing"
    try:
        raw_b, _, _ = score.build(name, cfg)
    finally:
        score.MODE = "full"
    st["tune_vs_rest"] = motif_check(raw, raw_b, s.melody)
    st["stem_lufs"] = {b: (round(lufs(x), 1) if np.abs(x).max() > 1e-6 else None) for b, x in s.stems.items()}
    st["stray_hits"] = stray_hits(y, s.onsets)
    st["steadiness"] = steadiness(y)
    m = y.mean(axis=1)
    lo = butter(m[: int(17 * SR)], "bandpass", [40, 150], 4)
    w = int(0.01 * SR)
    env = db(np.sqrt(np.convolve(lo ** 2, np.ones(w) / w, mode="same")) + 1e-9)
    env = env[env > env.max() - 40]
    st["low_end_jumpiness_db"] = round(float(np.percentile(env, 95) - np.percentile(env, 50)), 1)
    st["seconds_exact"] = len(y) / SR
    st["sample_rate"] = SR
    return name, st


def main():
    os.makedirs(OUT, exist_ok=True)
    with Pool(2) as pool:
        res = dict(pool.map(one, list(score.VERSIONS)))
    with open(os.path.join(OUT, "measurements.json"), "w") as f:
        json.dump(res, f, indent=1)
    lines = []
    for k, v in res.items():
        tv, li, sh, sd = v["tune_vs_rest"], v["logo_identity"], v["stray_hits"], v["steadiness"]
        checks = [
            ("20.0 s, 48 kHz", v["seconds_exact"] == 20.0 and v["sample_rate"] == 48000),
            ("loudness -14 +-0.1 LUFS", abs(v["lufs_integrated"] + 14) <= 0.1),
            ("true peak <= -1 dBTP", v["true_peak_dbtp"] <= -1.0),
            ("no clipped samples", v["clipped_samples"] == 0),
            ("silent first/last sample", v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90),
            ("mono fold loses < 1.5 LU", v["mono_fold_loss_lu"] > -1.5),
            ("every tune note on top at its pitch", tv["above_0db"] == tv["notes"]),
            ("logo identical", li["correlation"] >= 0.95 and abs(li["gain_db"] - LOGO_IN_DEMO_DB) < 0.3),
            ("no attacks without a written note", len(sh["stray"]) == 0),
        ]
        bad = [n for n, ok in checks if not ok]
        lines.append(f"{'PASS' if not bad else 'FAIL'}  {k}: " + ("all checks" if not bad else "failed: " + ", ".join(bad)))
        lines.append(f"      LUFS {v['lufs_integrated']}  true peak {v['true_peak_dbtp']} dBTP  clipped {v['clipped_samples']}"
                     f"  first/last sample {v['first_sample_dbfs']}/{v['last_sample_dbfs']} dBFS  DC {v['dc_offset']}")
        lines.append(f"      mono loss {v['mono_fold_loss_lu']} LU  L/R correlation {v['lr_correlation']}"
                     f"  click score {v['click_score']} dB")
        lines.append(f"      tune: {tv['notes']} notes, weakest {tv['min_db']} dB above the rest, median {tv['median_db']} dB"
                     f"  (weakest at {tv['weakest']})")
        lines.append(f"      logo: correlation {li['correlation']}, level {li['gain_db']} dB, residual {li['residual_db']} dB")
        lines.append(f"      attacks {sh['attacks']} ({sh['attacks_per_second']}/s), stray {sh['stray']}")
        lines.append(f"      steadiness: momentary spread {sd['momentary_spread_lu']} LU, biggest 1 s step"
                     f" {sd['max_second_to_second_lu']} LU, biggest bar-to-bar step {sd['max_bar_to_bar_lu']} LU"
                     f" (bars 1-8: {sd['per_bar_lufs']}); low-end jumpiness {v['low_end_jumpiness_db']} dB")
        lines.append(f"      bands vs total: {v['bands_db_rel_total']}")
        lines.append(f"      stems (LUFS): {v['stem_lufs']}")
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
