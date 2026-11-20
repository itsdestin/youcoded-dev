"""Render chamber-1 and chamber-2 into ../out/ and measure them (run via ../render.sh).

Engine: an unmodified copy of felt-and-pulse/src (dsp, instruments, master, arrange) in base/,
pointed at that folder's CC0 piano samples, read-only. The logo is felt-and-pulse/out/logo.wav,
pasted unchanged at 17.5 s, 2 dB above its own level, after the limiter (as in every demo).
"""
import json
import os
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "base"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402

import instruments as ins  # noqa: E402

# WHY: the copied engine looks for the piano next to itself; point it at the chosen sound's
# downloaded samples instead of copying 100+ MB
FP = os.path.normpath(os.path.join(HERE, "..", "..", "..", "felt-and-pulse"))
ins.KIT = os.path.join(FP, "samples", "upright-kw", "UprightPianoKW-SFZ+FLAC-20220221")

import chamber  # noqa: E402
from dsp import SR, butter, db, undb  # noqa: E402
from master import finish, logo_identity, lufs, measure, motif_check, premaster  # noqa: E402

OUT = os.path.join(HERE, "..", "out")
LOGO = os.path.join(FP, "out", "logo.wav")
LOGO_IN_DEMO_DB = 2.0
AIR_DB = 6.0


def read(path):
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    return y


def stray_attacks(y, onsets, until=17.2, tol=0.04):
    # (the last 50 ms of the analysed span is skipped: the cut edge itself reads as an attack)
    """Every sharp attack above 1 kHz (spectral-flux peak) before the logo, and how many of them
    do NOT coincide with a scheduled note start: a stray one would be a click or a percussive
    noise that no note explains."""
    m = y[: int(until * SR)].mean(axis=1)
    f, tt, S = signal.stft(m, SR, nperseg=1024, noverlap=768)
    S = np.abs(S[f > 1000])
    flux = np.maximum(np.diff(np.log(S + 1e-6), axis=1), 0).sum(axis=0)
    thr = np.median(flux) + 2.5 * np.std(flux)
    pk, _ = signal.find_peaks(flux, height=thr, distance=int(0.06 * SR / 256))
    times = tt[1:][pk]
    times = times[times < until - 0.05]
    ons = np.array(sorted(onsets))
    stray = [round(float(x), 3) for x in times if np.min(np.abs(ons - x)) > tol + 1024 / SR]
    return dict(attacks=len(times), per_second=round(len(times) / until, 1), not_on_a_note=stray)


def level_steadiness(y, until=17.0):
    """Volume bounce: momentary loudness (400 ms windows, every 100 ms). Reports the largest rise
    or fall within any 1 s, and the spread (90th minus 10th percentile) inside each phrase."""
    hop, win = int(0.1 * SR), int(0.4 * SR)
    vals = []
    for i in range(0, int(until * SR) - win, hop):
        seg = y[i:i + win]
        ms = (butter(seg, "highpass", 100, 2) ** 2).mean()
        vals.append(-0.691 + 10 * np.log10(ms + 1e-12))
    v = np.array(vals)
    tsec = np.arange(len(v)) * 0.1
    # from 0.5 s: the first window would otherwise count the music starting from silence
    js = [(abs(v[i + 10] - v[i]), tsec[i]) for i in range(5, len(v) - 10)]
    jump, at = max(js)
    p1 = v[(tsec > 0.5) & (tsec < 7.5)]
    p2 = v[(tsec > 8.5) & (tsec < 16.0)]
    return dict(max_change_within_1s_db=round(float(jump), 1), max_change_at_s=round(float(at), 1),
                phrase1_spread_db=round(float(np.percentile(p1, 90) - np.percentile(p1, 10)), 1),
                phrase2_spread_db=round(float(np.percentile(p2, 90) - np.percentile(p2, 10)), 1),
                phrase2_minus_phrase1_db=round(float(np.median(p2) - np.median(p1)), 1))


def one(name):
    logo = read(LOGO)
    chamber.MODE = "full"
    sc, targets = chamber.VERSIONS[name]()
    raw, gains = chamber.render(sc, targets)
    stems = sc.stems
    at = int(round(chamber.LOGO_AT * SR))
    # WHY more air than the default 2.5 dB shelf: felt piano and real strings with no hats or
    # glass are darker than the original demo; RULES.md wants 8-16 kHz 18-32 dB below the total
    y = finish(premaster(raw, air_db=AIR_DB), -14.0, add=logo * undb(LOGO_IN_DEMO_DB), add_at=at)
    y = y[: int(round(chamber.LEN * SR))]
    path = os.path.join(OUT, f"{name}.wav")
    sf.write(path, y, SR, subtype="PCM_24")
    y = read(path)
    m = measure(y, f"{name}.wav")
    m["logo_identity"] = logo_identity(y, logo, at)
    chamber.MODE = "backing"
    try:
        sb, _ = chamber.VERSIONS[name]()
        raw_b, _ = chamber.render(sb, targets, gains=gains)
    finally:
        chamber.MODE = "full"
    m["tune_vs_rest"] = motif_check(raw, raw_b, sc.melody)
    # every note's margin, for diagnosis (motif_check reports only the two weakest)
    m["tune_each"] = [(round(s, 2), mm, motif_check(raw, raw_b, [(s, mm)])["min_db"]) for s, mm in sc.melody]
    m["tune_notes"] = len(sc.melody)
    m["stem_lufs"] = {b: (round(lufs(s), 1) if np.abs(s).max() > 1e-6 else None) for b, s in stems.items()}
    m["stray_attacks"] = stray_attacks(y, sc.onsets)
    m["level"] = level_steadiness(y)
    ioi = np.diff(sorted(s for s, _ in sc.melody))
    m["tune_shortest_gap_s"] = round(float(ioi.min()), 3)
    return name, m


def main():
    os.makedirs(OUT, exist_ok=True)
    with Pool(2) as pool:
        res = dict(pool.map(one, list(chamber.VERSIONS)))
    with open(os.path.join(OUT, "measurements.json"), "w") as f:
        json.dump(res, f, indent=1)
    lines = []
    for k, v in res.items():
        tv, li, lv, sa = v["tune_vs_rest"], v["logo_identity"], v["level"], v["stray_attacks"]
        checks = [
            ("length 20.000 s", abs(v["seconds"] - 20.0) < 1e-3),
            ("loudness -14 +-0.1 LUFS", abs(v["lufs_integrated"] + 14) <= 0.1),
            ("true peak <= -1 dBTP", v["true_peak_dbtp"] <= -1.0),
            ("no clipped samples", v["clipped_samples"] == 0),
            ("silent first/last sample", v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90),
            ("mono loss < 1.5 LU", v["mono_fold_loss_lu"] > -1.5),
            ("air: 8-16 kHz 18-32 dB below total", -32 <= v["bands_db_rel_total"]["8000-16000"] <= -18),
            ("low end: 40-80 Hz 3-9 dB below, 80-250 at least 3 dB below", -9 <= v["bands_db_rel_total"]["40-80"] <= -3 and v["bands_db_rel_total"]["80-250"] <= -3),
            ("every tune note on top at its pitch", tv["above_0db"] == tv["notes"]),
            ("logo identical", li["correlation"] >= 0.95 and abs(li["gain_db"] - LOGO_IN_DEMO_DB) < 0.3),
            ("no attack without a note", len(sa["not_on_a_note"]) == 0),
            ("no run (tune notes >= an eighth apart)", v["tune_shortest_gap_s"] >= 0.2),
            # WHY 4.8: the steadiest of the sixteen earlier versions (13-strings-swell) measures 4.8 dB on
            # this meter, the pumping original 7.5; these must be steadier than all of them
            ("volume steadier than every earlier version (< 4.8 dB within 1 s)", lv["max_change_within_1s_db"] < 4.8),
        ]
        bad = [n for n, ok in checks if not ok]
        lines.append(f"{'PASS' if not bad else 'FAIL'}  {k}: " + ("all checks" if not bad else "failed: " + ", ".join(bad)))
        b = v["bands_db_rel_total"]
        lines.append(f"   LUFS {v['lufs_integrated']}  true peak {v['true_peak_dbtp']} dBTP  clipped {v['clipped_samples']}  "
                     f"first/last sample {v['first_sample_dbfs']}/{v['last_sample_dbfs']} dBFS  DC {v['dc_offset']}")
        lines.append(f"   mono fold loss {v['mono_fold_loss_lu']} LU  L/R correlation {v['lr_correlation']}  "
                     f"bands 40-80 {b['40-80']} / 80-250 {b['80-250']} / 8-16k {b['8000-16000']} dB")
        lines.append(f"   tune: {tv['notes']} notes, all above the rest: {tv['above_0db']}/{tv['notes']}, weakest {tv['min_db']} dB, "
                     f"median {tv['median_db']} dB; weakest notes {tv['weakest']}")
        lines.append(f"   logo: correlation {li['correlation']}, level {li['gain_db']} dB (target +2.0), residual {li['residual_db']} dB")
        lines.append(f"   attacks above 1 kHz: {sa['attacks']} ({sa['per_second']}/s), not on a note: {sa['not_on_a_note']}")
        lines.append(f"   volume: biggest change within 1 s {lv['max_change_within_1s_db']} dB (at {lv['max_change_at_s']} s); spread phrase 1 "
                     f"{lv['phrase1_spread_db']} dB, phrase 2 {lv['phrase2_spread_db']} dB; phrase 2 is "
                     f"{lv['phrase2_minus_phrase1_db']} dB louder")
        lines.append(f"   bus loudness (LUFS): {v['stem_lufs']}   click score {v['click_score']}")
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
