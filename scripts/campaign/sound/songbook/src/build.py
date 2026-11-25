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
import form  # noqa: E402
import measure as M  # noqa: E402
import mix as X  # noqa: E402
import options as O  # noqa: E402
import dashboard as D  # noqa: E402
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
    xm = X.premaster_music(raw, plans, piece)
    extra = extra_fn(xm, plans) if extra_fn else None
    y = X.finish_piece(xm, piece, extra)
    path = path or os.path.join(OUT, f"{piece.name}.wav")
    sf.write(path, y, SR, subtype="PCM_24")
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    st = measure(y, os.path.basename(path))
    st["logo"] = dict(kind=piece.logo, **M.landing(band, plans, piece))
    st["loudness_target"] = getattr(piece, "loudness", -14.0)
    # WHY: the air-band gauge (mix_tests) depends on which master the piece went through
    st["air_db"] = X.air_for(piece)
    st["style"] = getattr(piece, "style", "")
    # every sound switch this render used (engine/options.py), so an A/B's two files say how they differ
    st["sound"] = {k: (v if isinstance(v, (int, float, bool, str)) else str(v)) for k, v in O.summary(piece).items()}
    raw_b, _, _, _ = render(piece, backing=True, gains=gains)
    tv = motif_check(raw, raw_b, band.melody)
    if getattr(piece, "style", "") == "v3":
        # THE NO-MELODY ALT MIX (toolkit-plan a4): the bed alone (tune, cycles, answers out), mastered
        # with the same gains, for every render; the editor can cut to it, and the owner can hear
        # whether the bed stands on its own
        raw_bed, _, _, _ = render(piece, backing="bed", gains=gains)
        yb = X.finish_piece(X.premaster_music(raw_bed, plans, piece), piece)
        sf.write(path[:-4] + "-bed.wav", yb, SR, subtype="PCM_24")
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
    st["explain"] = dict(getattr(piece, "explain", None) or {})
    # THE COMPOSITION CHECKS (form.py): the notes, then the audio; the bar table goes to out/notes/
    rows = form.bar_table(band, plans, piece)
    st["composition"] = form.symbolic(band, plans, piece, rows) + form.audio(y, band, plans, piece, rows)
    # THE HARD CHECKS AND THE DASHBOARD (the rebuild): only genuine faults can fail
    st["hard"] = D.hard(band, plans, piece, st["composition"], y=y, st=st)
    st["dashboard"] = D.dashboard(band, plans, piece, rows, st["composition"], y=y, st=st,
                                  mix_tests=mix_tests(st, loudness=st["loudness_target"]))
    st["bed"] = getattr(band, "bed_info", None)
    st["recipe"] = getattr(piece, "recipe_report", None)
    os.makedirs(os.path.join(OUT, "notes"), exist_ok=True)
    with open(os.path.join(OUT, "notes", f"{piece.name}.txt"), "w") as f:
        f.write("\n".join(form.table_text(rows, piece) + [""] + (st["recipe"] or [])
                           + D.text(piece.name, st["hard"], st["dashboard"], piece)) + "\n")
    # WHY (first-shot d): a full render rewrote the bar table but left an older note log beside it,
    # so a composer read a stale ending; the log is now written with every render
    import notes as NT
    with open(os.path.join(OUT, "notes", f"{piece.name}.log.txt"), "w") as f:
        f.write("\n".join(NT.note_log(band, rows, piece)) + "\n")
    return piece.name, st


def mix_tests(v, mo=None, loudness=-14.0):
    """The mix checks as (name, ok) pairs. `v` = the measured file; `mo` = the music-alone
    measurements when the file also carries a film's effects (the tune, attack and logo checks are
    about the music); `loudness` = the piece's own target (Piece.loudness).
    WHY a function of its own (2026-11-23, mim): films printed only the composition checks, so a
    film could fail "every attack is a note" or "no drum-like attack" without anyone seeing it."""
    mo = mo or v
    tv, li, at = mo["tune_on_top"], mo["logo"], mo["attacks"]
    b = v["bands_db_rel_total"]
    logo_ok = (li["notes"] == [] if li.get("kind") == "none" else
               li["notes"] == ["Bb4", "G5", "F5"] and abs(li["error_ms"]) <= 10)
    return [
        (f"loudness {loudness:g} +-0.1 LUFS", abs(v["lufs_integrated"] - loudness) <= 0.1),
        ("true peak <= -1 dBTP", v["true_peak_dbtp"] <= -1.0),
        ("no clipped samples", v["clipped_samples"] == 0),
        ("silent first/last sample", v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90),
        ("mono fold loss < 1.5 LU", v["mono_fold_loss_lu"] > -1.5),
        ("every tune note on top at its pitch", tv["above_0db"] == tv["notes"]),
        ("tune notes = canonical tune", not mo["tune_identity"]["mismatches"]),
        ("logo played: B-flat G F, the name lands within 10 ms" if li.get("kind") != "none" else "no logo (hand-on ending)", logo_ok),
        ("every attack in every instrument is a note", not any(at["per_instrument_not_on_a_note"].values())),
        ("no noise-like (drum-like) attack" + (f" (noisiest {at['noisiness_max']} at {at['noisiest']['t']} s, "
                                               f"struck there by: {at['noisiest']['loudest_part']})" if at.get("noisiest") else ""),
         at["noisiness_max"] is None or at["noisiness_max"] < 0.1),
        # WHY 38 (was 32, round 8): a piece may now be darker on purpose (Piece.tone, Piece.air,
        # Piece.touch) after "busy/harsh"; the floor still catches a mix with no top at all
        # WHY the floor only on the old master (integration, 2026-11-25): the -38 dB floor was set
        # against the 11 dB air shelf; on the new master (air 0, at most +1.5) a felt piano measures
        # -55 to -65 here BY DESIGN, and the plan's `tilt` and `presence` gauges now judge the tone.
        # Keeping the floor made every new piece explain it away (a gauge nobody should chase).
        (("air: 8-16 kHz 18-38 dB below total", -38 <= b["8000-16000"] <= -18) if v.get("air_db", 11.0) >= 6.0 else
         ("air: 8-16 kHz at least 18 dB below total (no floor on the darker master)", b["8000-16000"] <= -18)),
        # WHY -12 for quiet pieces (2026-11-23): own (-17 LUFS) and tale (-16) measured -9.9 and
        # -10.3 here: a subtle film is lighter in the sub band and plays better on a phone for it.
        # The floor exists against a thin mix at full loudness, so it stays -9 there.
        # WHY a ceiling only for the recipes (audit 2026-11-25, defect 8): a floor on the lowest band
        # made a 12 s card or a bed under a narrator (no sub, by the recipe) read out of range, the
        # same pattern as the old air floor that produced round 8's added violin
        (("low end: 40-80 Hz and 80-250 Hz at least 3 dB below total (no floor in a recipe)",
          b["40-80"] <= -3 and b["80-250"] <= -3) if mo.get("style") == "v3" else
         ("low end: 40-80 Hz 3-%d dB below, 80-250 >= 3 dB below" % (12 if loudness <= -16 else 9),
          -(12 if loudness <= -16 else 9) <= b["40-80"] <= -3 and b["80-250"] <= -3)),
    ]


def checks(name, v):
    tv, li, at, sd = v["tune_on_top"], v["logo"], v["attacks"], v["steadiness"]
    b = v["bands_db_rel_total"]
    tests = mix_tests(v, loudness=v.get("loudness_target", -14.0))
    bad = [n for n, ok in tests if not ok]
    if "hard" in v:
        # WHY: only the hard checks fail; every other mix number is a gauge on the dashboard
        hb = [r["id"] for r in v["hard"] if not r["ok"]]
        L = [f"{'PASS' if not hb else 'FAIL'}  {name} ({v['seconds']} s): " + ("no fault" if not hb else "faults: " + ", ".join(hb))
             + (f"; mix gauges out of range: {'; '.join(bad)}" if bad else "")]
    else:
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
    if "hard" in v:
        L += ["   " + x for x in D.text(name, v["hard"], v["dashboard"], _Explain(v))]
    elif "composition" in v:
        L += ["   " + x for x in form.verdict_text(name, v["composition"])]
    return L


class _Explain:
    """The piece's explanations, carried in the measurements (a piece object is not kept)."""
    def __init__(self, v):
        self.explain = v.get("explain") or {}


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
    film_names = films.resolve(only)
    unknown = [n for n in only if n not in [p.name for p in DEMOS] and not films.resolve([n])]
    if unknown:
        print(f"Unknown piece or film: {', '.join(unknown)}. Demos: {', '.join(p.name for p in DEMOS)}. "
              f"Films: {', '.join(films.FILMS)}. Film files: {', '.join(films.ALIASES) or 'none'}.", file=sys.stderr)
        sys.exit(2)
    todo = [p for p in DEMOS if not only or p.name in only]
    if only and not todo:
        # WHY: films only. Leave the demonstrations' files alone (another composer may be
        # rendering at the same time; rewriting shared files here would race with them)
        films.main(film_names)
        return
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
    if not only or film_names:
        films.main(film_names or None)


if __name__ == "__main__":
    main()
