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
import films  # noqa: E402
from demos import DEMOS  # noqa: E402
from dsp import SR, db  # noqa: E402
from master import lufs, measure, motif_check  # noqa: E402
from score import Band, plan  # noqa: E402

OUT = os.path.join(HERE, "..", "out")


def render(piece, backing=False, gains=None):
    plans = plan(piece)
    band = Band(piece, plans, backing=backing)
    blocks.render(band, plans, piece)
    raw, gains = X.mix(band, plans, piece, gains)
    return raw, band, plans, gains


def one(piece, extra_fn=None, path=None):
    """Render, master, write and measure one piece. `extra_fn(x_premaster, plans)` may return
    extra audio (a film's sound effects) to add before the final limiter."""
    raw, band, plans, gains = render(piece)
    xm = X.premaster_music(raw, plans)
    extra = extra_fn(xm, plans) if extra_fn else None
    y = X.finish_piece(xm, piece, extra)
    path = path or os.path.join(OUT, f"{piece.name}.wav")
    sf.write(path, y, SR, subtype="PCM_24")
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    st = measure(y, os.path.basename(path))
    st["logo"] = dict(kind=piece.logo, **M.landing(band, plans, piece))
    raw_b, _, _, _ = render(piece, backing=True, gains=gains)
    tv = motif_check(raw, raw_b, band.melody)
    each = [motif_check(raw, raw_b, [e])["min_db"] for e in band.melody]
    st["tune_on_top"] = dict(tv, each=[(round(t, 2), m, e) for (t, m), e in zip(band.melody, each)])
    st["tune_identity"] = M.tune_identity(band)
    land = piece.land_time()
    st["attacks"] = M.attacks(y, band.stems, band.onsets, band.held_spans, until=piece.length - 1.2)
    st["steadiness"] = M.steadiness(y, plans, min(land + 1.9, piece.length - 0.7))
    st["joins"] = M.joins(y, plans, piece)
    st["stem_lufs"] = {k: (round(lufs(s), 1) if np.abs(s).max() > 1e-9 else None) for k, s in band.stems.items()}
    st["last_100ms_rms_dbfs"] = round(float(db(np.sqrt((y[-int(0.1 * SR):] ** 2).mean()) + 1e-12)), 1)
    st["sections"] = [dict(label=("ending" if p.ending else p.sec.label), mood=p.sec.mood if not p.ending else "ending",
                           start_s=round(p.t0, 3), end_s=round(p.t1, 3), bars=len(p.bars), hold_beats=p.hold,
                           bpm=round(p.bpm, 1), usual_bpm=p.nominal_bpm,
                           tempo_moved_pct=round(100 * (p.bpm / p.nominal_bpm - 1), 1),
                           chords=[b.chords for b in p.bars], accomp=p.accomp, voice=p.voice,
                           layers=sorted(p.layers), into=p.into)
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
        ("logo played: B-flat G F, the name lands within 10 ms", li["notes"] == ["Bb4", "G5", "F5"] and abs(li["error_ms"]) <= 10),
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
    L.append(f"   logo ({li['kind']}, played live): notes {li['notes']}, pick-up gaps {li['pickup_gap_s']} s, "
             f"name requested {li['requested_s']} s, heard {li['heard_s']} s ({li['error_ms']:+} ms)")
    L.append(f"   attacks: per instrument not on a note {at['per_instrument_not_on_a_note']}; inside held notes "
             f"{ {k: len(x) for k, x in at['inside_held_notes'].items()} }; noisiness median {at['noisiness_median']} max {at['noisiness_max']}")
    L.append(f"   steadiness: biggest change within any 1 s {sd['whole_max_change_1s']} dB (at {sd['at']} s, "
             f"measured to 1.5 s after the landing)")
    for r in sd["sections"]:
        L.append(f"      {r['section']:<40} {r['t0']:>6}-{r['t1']:<6} s  median {r['median']} LUFS  spread {r['spread']} dB  "
                 f"max 1 s change {r['max_change_1s']} dB")
    L.append("   sections: " + " | ".join(f"{s['label']} {s['start_s']}s {s['bpm']} bpm ({s['tempo_moved_pct']:+}%)"
                                         + (" WARNING: tempo moved more than 8 %, change a bar count or add a hold"
                                            if abs(s['tempo_moved_pct']) > 8 else "")
                                         for s in v["sections"]))
    for j in v.get("joins", []):
        L.append(f"   JOIN {j['join']} at {j['t']} s: level {j['level_before']} -> {j['level_after']} LUFS; "
                 f"2-8k {j['bright_before']['2-8k']} -> {j['bright_after']['2-8k']}, 8-16k {j['bright_before']['8-16k']} -> "
                 f"{j['bright_after']['8-16k']} dB; biggest 1 s change nearby {j['max_change_1s']} dB (at {j['max_change_at']} s); "
                 f"tempo per beat {j['tempo_per_beat']}")
    L.append(f"   bus loudness: {v['stem_lufs']}")
    return L


JOIN_FILES = {   # quick re-listening: ~10 s centred on each reworked join
    "join-journey-29.wav": ("demo-journey", "hopeful -> playful"),
    "join-journey-45.wav": ("demo-journey", "playful -> triumphant"),
    "join-journey-57.wav": ("demo-journey", "the logo lands"),
    "join-playful-ending.wav": ("demo-playful", "the logo lands"),
}


def write_joins(res):
    for fn, (piece, label) in JOIN_FILES.items():
        if piece not in res:
            continue
        j = [x for x in res[piece]["joins"] if x["join"] == label][0]
        y, _ = sf.read(os.path.join(OUT, piece + ".wav"), dtype="float64", always_2d=True)
        n = len(y) / SR
        a = min(max(0.0, j["t"] - 5.0), n - 10.0)
        seg = y[int(a * SR): int((a + 10.0) * SR)].copy()
        w = int(0.05 * SR)
        r = 0.5 - 0.5 * np.cos(np.pi * np.arange(w) / w)
        if a > 0:
            seg[:w] *= r[:, None]
        if a + 10.0 < n - 1e-6:
            seg[-w:] *= r[::-1, None]
        seg[-1] = 0.0
        sf.write(os.path.join(OUT, fn), seg, SR, subtype="PCM_24")


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    todo = [p for p in DEMOS if not only or p.name in only]
    res = {}
    if todo:
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
    write_joins(old)
    print("\n".join(lines))
    if not only or any(f in only for f in films.FILMS):
        films.main([f for f in only if f in films.FILMS] or None)


if __name__ == "__main__":
    main()
