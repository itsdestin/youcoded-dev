"""Render every deliverable and measure it.

Run (from anywhere):
    scripts/campaign/sound/felt-and-pulse/render.sh
which calls this file with the folder's own virtualenv. Output goes to ../out/.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # WHY: run with python -I (isolated); our modules are added explicitly

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import arrange  # noqa: E402
import sfx  # noqa: E402
from dsp import SR, true_peak, undb  # noqa: E402
from master import (finish, logo_identity, lufs, measure, motif_check, premaster,  # noqa: E402
                    timeline)

OUT = os.path.join(HERE, "..", "out")
LOGO_IN_DEMO_DB = 2.0   # the logo file is -16 LUFS; in -14 LUFS demos it plays 2 dB hotter


def write(name, x):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, np.asarray(x, dtype=np.float64), SR, subtype="PCM_24")
    # measure what was actually written (24-bit quantised)
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    return y


def motif_report(fn, raw, events):
    """Render the same piece without its motif notes and measure how the motif stands out."""
    arrange.MODE = "backing"
    try:
        backing = fn()[0]
    finally:
        arrange.MODE = "full"
    return motif_check(raw, backing, events)


def main():
    report = {}
    # ---------------- logo (rendered once, pasted everywhere)
    raw, lp = arrange.logo()
    # WHY ceiling -3.3: the logo plays 2 dB hotter inside the demos and must still stay under -1 dBTP
    logo = finish(premaster(raw), -16.0, ceiling=-3.3)
    logo = write("logo.wav", logo)
    report["logo"] = measure(logo, "logo.wav")
    report["logo"]["motif_vs_rest"] = motif_report(arrange.logo, raw, lp.melody)

    # ---------------- motif
    raw, mp = arrange.motif_piece()
    mot = write("motif.wav", finish(premaster(raw), -14.0))
    report["motif"] = measure(mot, "motif.wav")
    report["motif"]["motif_vs_rest"] = motif_report(arrange.motif_piece, raw, mp.melody)

    # ---------------- demos
    logo_hot = logo * undb(LOGO_IN_DEMO_DB)
    for name, fn, voice_dip in (("demo-hopeful", arrange.hopeful, 2.0),
                                ("demo-playful", arrange.playful, 0.0),
                                ("demo-stark", arrange.stark, 0.0)):
        raw, p, logo_at = fn()
        at = int(round(logo_at * SR))
        bed = premaster(raw, voice_dip_db=voice_dip)
        y = finish(bed, -14.0, add=logo_hot, add_at=at)
        y = write(f"{name}.wav", y)
        st = measure(y, f"{name}.wav")
        st["short_term_lufs_each_second"] = timeline(y)
        st["motif_vs_rest"] = motif_report(fn, raw, p.melody)
        st["logo_starts_at_s"] = logo_at
        st["logo_identity"] = logo_identity(y, logo, at)
        st["stem_lufs"] = {b: (round(lufs(s), 1) if np.abs(s).max() > 1e-6 else None)
                           for b, s in p.stems.items()}
        report[name] = st

    # ---------------- sfx
    for name, fn in sfx.ALL.items():
        x = fn()
        # WHY: interface sounds sit under music and speech, so they are matched by their
        # loudest 400 ms (padded) to -20 LUFS, with true peak kept at or below -3 dBTP
        pad = np.zeros((int(0.6 * SR), 2))
        loud = lufs(np.concatenate([x, pad]))
        x = x * undb(-20 - loud)
        tp = true_peak(x)
        if tp > -3:
            x = x * undb(-3 - tp)
        y = write(f"sfx/{name}.wav", x)
        st = measure(y, f"sfx/{name}.wav")
        st["lufs_padded_to_1s"] = round(lufs(np.concatenate([y, pad])), 1)
        report[f"sfx/{name}"] = st

    with open(os.path.join(OUT, "measurements.json"), "w") as f:
        json.dump(report, f, indent=1)
    lines = checks(report)
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


def checks(r):
    """The 'premium' rules from RULES.md, checked against the numbers. PASS/FAIL per line."""
    out = []

    def ck(name, ok, detail):
        out.append(f"{'PASS' if ok else 'FAIL'}  {name:<14} {detail}")

    for k, v in r.items():
        music = not k.startswith("sfx/")
        tgt = -16.0 if k == "logo" else -14.0
        if music:
            ck(k, abs(v["lufs_integrated"] - tgt) <= 0.1, f"loudness {v['lufs_integrated']} LUFS (target {tgt})")
            ck(k, v["true_peak_dbtp"] <= -1.0, f"true peak {v['true_peak_dbtp']} dBTP (<= -1)")
        else:
            ck(k, v["true_peak_dbtp"] <= -3.0, f"true peak {v['true_peak_dbtp']} dBTP (<= -3), loudness padded {v['lufs_padded_to_1s']} LUFS")
        ck(k, v["clipped_samples"] == 0, f"clipped samples {v['clipped_samples']}")
        ck(k, v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90,
           f"first/last sample {v['first_sample_dbfs']}/{v['last_sample_dbfs']} dBFS (<= -90, no click)")
        ck(k, v["dc_offset"] < 0.001, f"DC offset {v['dc_offset']}")
        if "mono_fold_loss_lu" in v:
            ck(k, v["mono_fold_loss_lu"] > -1.5, f"mono fold-down loss {v['mono_fold_loss_lu']} LU (> -1.5)")
        if music:
            b = v["bands_db_rel_total"]
            ck(k, -9 <= b["40-80"] <= -3, f"sub 40-80 Hz {b['40-80']} dB of total (-9..-3: present, not boomy)")
            ck(k, b["80-250"] <= -3, f"low-mid 80-250 Hz {b['80-250']} dB (<= -3: no mud)")
            ck(k, -32 <= b["8000-16000"] <= -18, f"air 8-16 kHz {b['8000-16000']} dB (-32..-18)")
            mv = v["motif_vs_rest"]
            ck(k, mv["above_0db"] == mv["notes"], f"motif notes standing out {mv['above_0db']}/{mv['notes']}, weakest {mv['min_db']} dB")
        if "logo_identity" in v:
            li = v["logo_identity"]
            ck(k, li["correlation"] >= 0.95 and abs(li["gain_db"] - LOGO_IN_DEMO_DB) < 0.3,
               f"logo = logo.wav x {li['gain_db']} dB, correlation {li['correlation']} (rest is the music's tail, {li['residual_db']} dB)")
    return out


if __name__ == "__main__":
    main()
