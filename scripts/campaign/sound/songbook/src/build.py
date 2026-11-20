"""Render every demonstration into ../out/ and measure it (run via ../render.sh).

For each piece: plan the timing, play the blocks, mix, master with the logo, write a 48 kHz
24-bit stereo WAV, then render it again WITHOUT the tune to measure how far each tune note
stands above everything else at its pitch. Results: ../out/checks.txt (plain) and
../out/measurements.json (every number). Two runs give identical files.
"""
import json
import os
import shutil
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "engine"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import blocks  # noqa: E402
import measure as M  # noqa: E402
import mix as X  # noqa: E402
from demos import DEMOS  # noqa: E402
from dsp import SR, db  # noqa: E402
from master import logo_identity, lufs, measure, motif_check  # noqa: E402
from score import Band, LOGO_LAND, plan  # noqa: E402

OUT = os.path.join(HERE, "..", "out")


def render(piece, backing=False, gains=None):
    plans = plan(piece)
    band = Band(piece, plans, backing=backing)
    blocks.render(band, plans, piece)
    raw, gains = X.mix(band, plans, piece, gains)
    return raw, band, plans, gains


def one(piece):
    raw, band, plans, gains = render(piece)
    y, logo, at = X.master(raw, plans, piece)
    path = os.path.join(OUT, f"{piece.name}.wav")
    sf.write(path, y, SR, subtype="PCM_24")
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    st = measure(y, os.path.basename(path))
    st["logo"] = dict(file=os.path.basename(X.LOGO_FILES[piece.logo]), **logo_identity(y, logo, at),
                      lands_at_s=round(at / SR + LOGO_LAND, 3))
    raw_b, _, _, _ = render(piece, backing=True, gains=gains)
    tv = motif_check(raw, raw_b, band.melody)
    each = [motif_check(raw, raw_b, [e])["min_db"] for e in band.melody]
    st["tune_on_top"] = dict(tv, each=[(round(t, 2), m, e) for (t, m), e in zip(band.melody, each)])
    st["tune_identity"] = M.tune_identity(band)
    logo_start = at / SR
    st["attacks"] = M.attacks(y, band.stems, band.onsets, band.held_spans, until=logo_start - 0.3)
    st["steadiness"] = M.steadiness(y, plans, logo_start)
    st["stem_lufs"] = {k: (round(lufs(s), 1) if np.abs(s).max() > 1e-9 else None) for k, s in band.stems.items()}
    st["last_100ms_rms_dbfs"] = round(float(db(np.sqrt((y[-int(0.1 * SR):] ** 2).mean()) + 1e-12)), 1)
    st["sections"] = [dict(label=("ending" if p.ending else p.sec.label), mood=p.sec.mood if not p.ending else "ending",
                           start_s=round(p.t0, 3), end_s=round(p.t1, 3), bars=len(p.bars), hold_beats=p.hold,
                           bpm=round(p.bpm, 1), usual_bpm=p.nominal_bpm,
                           tempo_moved_pct=round(100 * (p.bpm / p.nominal_bpm - 1), 1),
                           chords=[b.chords for b in p.bars], accomp=p.accomp, voice=p.voice,
                           layers=sorted(p.layers), into=p.sec.into)
                      for p in plans]
    st["notes"] = piece.notes
    return piece.name, st


def checks(name, v):
    tv, li, at, sd = v["tune_on_top"], v["logo"], v["attacks"], v["steadiness"]
    b = v["bands_db_rel_total"]
    tests = [
        ("loudness -14 +-0.1 LUFS", abs(v["lufs_integrated"] + 14) <= 0.1),
        ("true peak <= -1 dBTP", v["true_peak_dbtp"] <= -1.0),
        ("no clipped samples", v["clipped_samples"] == 0),
        ("silent first/last sample", v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90),
        ("mono fold loss < 1.5 LU", v["mono_fold_loss_lu"] > -1.5),
        ("every tune note on top at its pitch", tv["above_0db"] == tv["notes"]),
        ("tune notes = canonical tune", not v["tune_identity"]["mismatches"]),
        ("logo identical (corr >= 0.95, +2 dB)", li["correlation"] >= 0.95 and abs(li["gain_db"] - X.LOGO_GAIN_DB) < 0.3),
        ("every attack in every instrument is a note", not any(at["per_instrument_not_on_a_note"].values())),
        ("no noise-like (drum-like) attack", at["noisiness_max"] is None or at["noisiness_max"] < 0.1),
        ("air: 8-16 kHz 18-32 dB below total", -32 <= b["8000-16000"] <= -18),
        ("low end: 40-80 Hz 3-9 dB below, 80-250 >= 3 dB below", -9 <= b["40-80"] <= -3 and b["80-250"] <= -3),
    ]
    bad = [n for n, ok in tests if not ok]
    L = [f"{'PASS' if not bad else 'FAIL'}  {name} ({v['seconds']} s): " + ("all checks" if not bad else "failed: " + "; ".join(bad))]
    L.append(f"   LUFS {v['lufs_integrated']}  true peak {v['true_peak_dbtp']} dBTP  clipped {v['clipped_samples']}  "
             f"first/last sample {v['first_sample_dbfs']}/{v['last_sample_dbfs']} dBFS  last 100 ms {v['last_100ms_rms_dbfs']} dBFS  "
             f"DC {v['dc_offset']}  mono loss {v['mono_fold_loss_lu']} LU")
    L.append(f"   bands (dB below total): 40-80 {b['40-80']}  80-250 {b['80-250']}  250-2k {b['250-2000']}  "
             f"2-8k {b['2000-8000']}  8-16k {b['8000-16000']}  16-24k {b['16000-24000']}")
    L.append(f"   tune: {tv['notes']} notes, on top {tv['above_0db']}/{tv['notes']}, weakest {tv['min_db']} dB, median "
             f"{tv['median_db']} dB, weakest at {tv['weakest']}")
    ti = v["tune_identity"]
    L.append(f"   tune identity: {ti['notes']} notes by segment {ti['by_segment']}, mismatches {len(ti['mismatches'])}")
    L.append(f"   logo {li['file']}: correlation {li['correlation']}, level {li['gain_db']} dB, residual {li['residual_db']} dB, "
             f"name lands {li['lands_at_s']} s")
    L.append(f"   attacks: per instrument not on a note {at['per_instrument_not_on_a_note']}; inside held notes "
             f"{ {k: len(x) for k, x in at['inside_held_notes'].items()} }; noisiness median {at['noisiness_median']} max {at['noisiness_max']}")
    L.append(f"   steadiness: biggest change within any 1 s {sd['whole_max_change_1s']} dB (at {sd['at']} s); "
             f"before the ending's last chord {sd['before_ending_max_change_1s']} dB (at {sd['before_ending_at']} s)")
    for r in sd["sections"]:
        L.append(f"      {r['section']:<40} {r['t0']:>6}-{r['t1']:<6} s  median {r['median']} LUFS  spread {r['spread']} dB  "
                 f"max 1 s change {r['max_change_1s']} dB")
    L.append("   sections: " + " | ".join(f"{s['label']} {s['start_s']}s {s['bpm']} bpm ({s['tempo_moved_pct']:+}%)"
                                         + (" WARNING: tempo moved more than 8 %, change a bar count or add a hold"
                                            if abs(s['tempo_moved_pct']) > 8 else "")
                                         for s in v["sections"]))
    L.append(f"   bus loudness: {v['stem_lufs']}")
    return L


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    todo = [p for p in DEMOS if not only or p.name in only]
    with Pool(len(todo)) as pool:
        res = dict(pool.map(one, todo))
    # the piano-only logo, unchanged, for reference (a byte copy)
    shutil.copyfile(X.LOGO_FILES["piano"], os.path.join(OUT, "logo-alone.wav"))
    path = os.path.join(OUT, "measurements.json")
    old = {}
    if only and os.path.exists(path):
        old = json.load(open(path))
    old.update(res)
    with open(path, "w") as f:
        json.dump(old, f, indent=1)
    lines = []
    for k in [p.name for p in DEMOS if p.name in old]:
        lines += checks(k, old[k])
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
