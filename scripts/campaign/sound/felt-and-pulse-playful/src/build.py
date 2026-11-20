"""Render every playful-backing version into ../out/ and measure it.

Run via ../render.sh. Versions render in parallel. 0-original.wav is the chosen candidate's
demo-playful.wav copied unchanged (ref/), and this code's own rebuild of it is compared against
that file to prove the shared parts here are the same as the original's.
"""
import hashlib
import json
import os
import shutil
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "base"))   # snapshot of felt-and-pulse/src (unmodified copy)
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402

import arrange  # noqa: E402
import playful  # noqa: E402
from dsp import SR, butter, db, undb  # noqa: E402
from master import finish, logo_identity, lufs, measure, motif_check, premaster  # noqa: E402

ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "out")
REF = os.path.join(ROOT, "ref")
LOGO_IN_DEMO_DB = 2.0


def read(path):
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    return y


def low_end(y):
    """Kick/pump fingerprint of the 40-150 Hz band: its level against the whole mix, and how
    much it jumps (95th minus 50th percentile of a 10 ms loudness envelope; a thumping kick
    or a pumping sub reads high, a steady bass reads low)."""
    m = y.mean(axis=1)
    lo = butter(m, "bandpass", [40, 150], 4)
    w = int(0.01 * SR)
    env = np.sqrt(np.convolve(lo ** 2, np.ones(w) / w, mode="same"))[: int(17.0 * SR)]  # before the logo
    env_db = db(env + 1e-9)
    loud = env_db[env_db > env_db.max() - 40]
    return dict(level_db=round(float(db(np.sqrt((lo ** 2).mean()) / np.sqrt((m ** 2).mean()))), 1),
                jumpiness_db=round(float(np.percentile(loud, 95) - np.percentile(loud, 50)), 1))


def onsets_per_second(y):
    """How busy the backing is: count of attacks per second in the master before the logo
    (spectral-flux peaks above 1 kHz)."""
    m = y[: int(17.0 * SR)].mean(axis=1)
    f, t, S = signal.stft(m, SR, nperseg=1024, noverlap=768)
    S = np.abs(S[f > 1000])
    flux = np.maximum(np.diff(np.log(S + 1e-6), axis=1), 0).sum(axis=0)
    thr = np.median(flux) + 2.5 * np.std(flux)
    peaks, _ = signal.find_peaks(flux, height=thr, distance=int(0.06 * SR / 256))
    return round(len(peaks) / 17.0, 1)


def one(name):
    logo = read(os.path.join(REF, "logo.wav"))
    arrange.MODE = "full"
    raw, p = playful.build(name)
    stems = p.stems
    at = int(round(playful.LOGO_AT * SR))
    y = finish(premaster(raw), -14.0, add=logo * undb(LOGO_IN_DEMO_DB), add_at=at)
    path = os.path.join(OUT, f"{name}.wav")
    if name == "0-original":
        # the reference file goes out unchanged; our rebuild is only compared with it
        ref = read(os.path.join(REF, "demo-playful.wav"))
        rebuild_err = float(np.abs(y - ref).max())
        shutil.copyfile(os.path.join(REF, "demo-playful.wav"), path)
    else:
        sf.write(path, y, SR, subtype="PCM_24")
        rebuild_err = None
    y = read(path)
    st = measure(y, f"{name}.wav")
    st["logo_identity"] = logo_identity(y, logo, at)
    arrange.MODE = "backing"
    try:
        raw_b, _ = playful.build(name)
    finally:
        arrange.MODE = "full"
    st["motif_vs_rest"] = motif_check(raw, raw_b, p.melody)
    st["stem_lufs"] = {b: (round(lufs(s), 1) if np.abs(s).max() > 1e-6 else None) for b, s in stems.items()}
    back = sum(s for b, s in stems.items() if b != "piano")
    st["piano_over_everything_else_lu"] = round(lufs(stems["piano"]) - lufs(back), 1)
    st["low_end_40_150hz"] = low_end(y)
    st["attacks_per_second"] = onsets_per_second(y)
    st["stem_hash"] = {b: hashlib.sha1(np.ascontiguousarray(stems[b]).tobytes()).hexdigest()[:12]
                       for b in ("piano", "pluck", "pad", "fx")}
    if rebuild_err is not None:
        st["rebuild_vs_reference_max_diff_dbfs"] = round(float(db(rebuild_err)), 1)
    return name, st


def main():
    os.makedirs(OUT, exist_ok=True)
    names = list(playful.VERSIONS)
    only = sys.argv[1:]
    if only:
        names = [n for n in names if any(n.startswith(o) for o in only)]
    with Pool(min(len(names), os.cpu_count() or 4)) as pool:
        res = dict(pool.map(one, names))
    mpath = os.path.join(OUT, "measurements.json")
    old = json.load(open(mpath)) if (only and os.path.exists(mpath)) else {}
    old.update(res)
    res = {k: old[k] for k in playful.VERSIONS if k in old}
    with open(mpath, "w") as f:
        json.dump(res, f, indent=1)
    lines = report(res)
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


def report(r):
    out = []
    hdr = (f"{'version':<27}{'LUFS':>7}{'TP':>7}{'clip':>5}{'ends':>6}{'mono':>6}"
           f"{'40-80':>7}{'80-250':>7}{'8-16k':>7}{'low lvl':>8}{'low jump':>9}{'att/s':>6}"
           f"{'tune min':>9}{'tune med':>9}{'pno-rest':>9}{'logo':>7}")
    out.append(hdr)
    base_hash = r.get("0-original", {}).get("stem_hash", {}).get("piano")
    for k, v in r.items():
        b = v["bands_db_rel_total"]
        ends = "ok" if v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90 else "CLICK"
        mv = v["motif_vs_rest"]
        out.append(f"{k:<27}{v['lufs_integrated']:>7}{v['true_peak_dbtp']:>7}{v['clipped_samples']:>5}{ends:>6}"
                   f"{v['mono_fold_loss_lu']:>6}{b['40-80']:>7}{b['80-250']:>7}{b['8000-16000']:>7}"
                   f"{v['low_end_40_150hz']['level_db']:>8}{v['low_end_40_150hz']['jumpiness_db']:>9}"
                   f"{v['attacks_per_second']:>6}{mv['min_db']:>9}{mv['median_db']:>9}"
                   f"{v['piano_over_everything_else_lu']:>9}{v['logo_identity']['correlation']:>7.3f}")
    out.append("")
    out.append("checks (PASS/FAIL):")
    for k, v in r.items():
        mv = v["motif_vs_rest"]
        li = v["logo_identity"]
        checks = [
            ("loudness -14 +-0.1", abs(v["lufs_integrated"] + 14) <= 0.1),
            ("true peak <= -1", v["true_peak_dbtp"] <= -1.0),
            ("no clipping", v["clipped_samples"] == 0),
            ("silent first/last sample", v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90),
            ("mono loss < 1.5 LU", v["mono_fold_loss_lu"] > -1.5),
            ("every tune note on top", mv["above_0db"] == mv["notes"]),
            ("logo identical", li["correlation"] >= 0.95 and abs(li["gain_db"] - LOGO_IN_DEMO_DB) < 0.3),
            ("piano part identical to 0", v["stem_hash"]["piano"] == base_hash),
        ]
        bad = [n for n, ok in checks if not ok]
        out.append(f"{'PASS' if not bad else 'FAIL'}  {k:<27} " + ("all 8 checks" if not bad else "failed: " + ", ".join(bad)))
    o = r.get("0-original", {})
    if "rebuild_vs_reference_max_diff_dbfs" in o:
        out.append(f"\nrebuild of 0-original vs the chosen candidate's demo-playful.wav: max sample difference "
                   f"{o['rebuild_vs_reference_max_diff_dbfs']} dBFS (24-bit rounding is about -138)")
    return out


if __name__ == "__main__":
    main()
