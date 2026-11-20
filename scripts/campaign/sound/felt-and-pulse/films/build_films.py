"""Render the three films, measure them, copy the mixes to the film's audio folder.

Run:  scripts/campaign/sound/felt-and-pulse/films/render.sh   (or pass film names to render some)
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import common  # noqa: E402
from common import SR, attack_time, chain, film_master, load_logo, write  # noqa: E402
from master import lufs, measure, timeline  # noqa: E402

OUT = os.path.join(common.ROOT, "out", "films")
PUBLIC = os.path.normpath(os.path.join(common.ROOT, "..", "..", "film", "public", "audio"))
COPIES = {"own-everything": "fp-take3-mix.wav", "fairytale-mix": "fp-take1-mix.wav",
          "make-it-mine": "fp-take2-mix.wav"}   # the ONLY files written outside this folder


def onset_strength(y):
    """Positive spectral flux on 2.5 ms hops: how much new sound starts at each moment."""
    m = y.mean(axis=1)
    hop, n = 120, 512
    frames = 1 + (len(m) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    S = np.abs(np.fft.rfft(m[idx] * np.hanning(n), axis=1))
    S = np.log1p(S * 50)
    flux = np.maximum(S[1:] - S[:-1], 0).sum(axis=1)
    times = (np.arange(1, frames) * hop + n / 2) / SR
    return times, flux


_LAND = None


def logo_landing():
    """Where the logo's third note's attack is inside logo.wav (designed: 0.500 s).
    Measured on the logo rendered with and without its three notes: the difference is the
    notes alone, so the bloom around them cannot fool the measurement."""
    global _LAND
    if _LAND is None:
        import arrange
        full = arrange.logo()[0]
        arrange.MODE = "backing"
        try:
            back = arrange.logo()[0]
        finally:
            arrange.MODE = "full"
        notes = (full - back)[int(0.45 * SR):]
        _LAND = 0.45 + attack_time(notes)
    return _LAND


def hit_table(s, y, logo_at, logo_target):
    t, f = onset_strength(y)
    rows = []
    land = logo_landing()
    entries = list(s.hits) + [("name: logo lands", logo_target, logo_at, None, "logo")]
    for name, target, placed, sig, kind in entries:
        if kind == "logo":
            designed = logo_at + land
        else:
            designed = placed + attack_time(sig, kind)
        w = (t > target - 0.04) & (t < target + 0.04)
        in_mix = float(t[w][np.argmax(f[w])]) if w.any() else None
        rows.append(dict(hit=name, target_s=round(target, 3), sound_lands_s=round(designed, 4),
                         error_ms=round((designed - target) * 1000, 1),
                         mix_onset_error_ms=None if in_mix is None else round((in_mix - target) * 1000, 1)))
    return rows


def report_common(name, y, extra=None):
    st = measure(y, f"films/{name}.wav")
    st["short_term_lufs_each_second"] = timeline(y)
    if extra:
        st.update(extra)
    return st


def main(which):
    os.makedirs(OUT, exist_ok=True)
    report = {}
    path = os.path.join(OUT, "report.json")
    if os.path.exists(path):
        report = json.load(open(path))
    if "own-everything" in which:
        import own_everything as F
        s, bed = F.score()
        x = chain(bed)
        y = write(os.path.join(OUT, "own-everything.wav"), film_master(x, F.LOGO_AT))
        st = report_common("own-everything", y)
        st["hits"] = hit_table(s, y, F.LOGO_AT, F.HITS["name (logo lands)"])
        st["silent_after_s"] = _silent_after(y)
        report["own-everything"] = st
    if "fairytale" in which:
        import fairytale as F
        res = F.render()
        y = write(os.path.join(OUT, "fairytale-mix.wav"), res["mix"])
        write(os.path.join(OUT, "fairytale-score.wav"), res["score"])
        st = report_common("fairytale-mix", y)
        st["hits"] = hit_table(res["s"], y, F.LOGO_AT, res["logo_target"])
        st["words_used"] = res["words"]
        st["voice_over_music_per_phrase"] = res["phrases"]
        st["score_stem"] = dict(lufs=round(lufs(res["score"]), 2),
                                short_term_lufs_each_second=timeline(res["score"]))
        st["silent_after_s"] = _silent_after(y)
        report["fairytale-mix"] = st
    if "make-it-mine" in which:
        import make_it_mine as F
        s, bed, typing_db = F.score()
        x = chain(bed)
        y = write(os.path.join(OUT, "make-it-mine.wav"), film_master(x, F.LOGO_AT))
        st = report_common("make-it-mine", y)
        st["hits"] = hit_table(s, y, F.LOGO_AT, F.HITS["name (logo lands)"])
        st["typing_under_music_db"] = typing_db
        st["silent_after_s"] = _silent_after(y)
        report["make-it-mine"] = st
    with open(path, "w") as f:
        json.dump(report, f, indent=1)
    for key, dst in COPIES.items():
        if any(key.startswith(w) for w in which):
            shutil.copyfile(os.path.join(OUT, f"{key}.wav"), os.path.join(PUBLIC, dst))
    for k in which:
        for rk, v in report.items():
            if rk.startswith(k):
                print(summary(rk, v))


def _silent_after(y, thr_db=-70):
    """Time after which the file stays below thr_db (dBFS, 10 ms RMS)."""
    m = np.abs(y).max(axis=1)
    w = int(0.01 * SR)
    e = np.sqrt(np.convolve(m ** 2, np.ones(w) / w, mode="same"))
    loud = np.where(e > 10 ** (thr_db / 20))[0]
    return round(float(loud[-1] / SR), 3) if len(loud) else 0.0


def summary(name, v):
    lines = [f"== {name}: {v['lufs_integrated']} LUFS, true peak {v['true_peak_dbtp']} dBTP, "
             f"clipped {v['clipped_samples']}, mono loss {v.get('mono_fold_loss_lu')} LU, "
             f"silent after {v.get('silent_after_s')} s",
             f"   loudness each second: {v['short_term_lufs_each_second']}"]
    worst = max(abs(h["error_ms"]) for h in v["hits"])
    lines.append(f"   hits: {len(v['hits'])}, worst designed error {worst} ms")
    for h in v["hits"]:
        lines.append(f"     {h['hit']:<28} target {h['target_s']:>7}  lands {h['sound_lands_s']:>8}  "
                     f"err {h['error_ms']:>6} ms  (mix onset {h['mix_onset_error_ms']} ms)")
    if "voice_over_music_per_phrase" in v:
        lines.append("   voice over music, per phrase:")
        for p in v["voice_over_music_per_phrase"]:
            lines.append(f"     {p['from']:>6}-{p['to']:<6} {p['text'][:42]:<42} voice {p['voice_lufs']:>6} "
                         f"music {p['music_lufs']:>6}  gap {p['gap_db']:>5} dB (target {p['target_db']})")
    if "typing_under_music_db" in v:
        lines.append(f"   typing under music: {v['typing_under_music_db']}")
    return "\n".join(lines)


if __name__ == "__main__":
    main(sys.argv[1:] or ["own-everything", "fairytale", "make-it-mine"])
