"""Render everything: `.venv/bin/python render.py` (from this folder, or with absolute path).

Writes out/*.wav, out/sfx/*.wav and out/score.json (motif note times + logo positions,
read by verify.py).
"""
import json
import os
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dsp import SR, secs, limit, true_peak_env, db, undb, fade_edges, attack_ramp  # noqa: E402
import compose as C  # noqa: E402

OUT = os.path.join(HERE, "out")
METER = pyln.Meter(SR)
TP_CEIL = -1.0
SFX_TARGET = -18.0


def lufs(x):
    return METER.integrated_loudness(x)


def tp_db(x):
    return float(db(true_peak_env(x).max()))


def master(x, target, ceiling=-1.3):
    """Gain to target loudness, true-peak limit, re-measure, repeat until both hold."""
    y = x.copy()
    for _ in range(8):
        y = y * undb(target - lufs(y))
        y = limit(y, ceiling)
        if abs(lufs(y) - target) < 0.05 and tp_db(y) <= TP_CEIL - 0.05:
            break
    return y


def master_with_logo(bed, logo_scaled, logo_t, target):
    """Find the bed gain that makes the whole piece hit target loudness. The logo itself is
    added afterwards at a FIXED gain, untouched by the limiter, so it stays identical."""
    ls = secs(logo_t)
    g = 1.0
    for _ in range(10):
        b = limit(bed * g, -1.3)
        full = b.copy()
        full[ls:ls + len(logo_scaled)] += logo_scaled[: len(full) - ls]
        err = target - lufs(full)
        if abs(err) < 0.05:
            break
        g *= undb(err)
    assert tp_db(full) <= TP_CEIL, tp_db(full)
    return fade_edges(full, 0.001, 0.005)


def write(name, x):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, x.astype(np.float32), SR, subtype="PCM_24")
    print(f"  {name:22s} {len(x)/SR:6.2f} s  {lufs(x) if len(x) > secs(0.45) else float('nan'):6.2f} LUFS  TP {tp_db(x):6.2f} dB")


def main():
    os.makedirs(os.path.join(OUT, "sfx"), exist_ok=True)
    print("logo")
    logo = master(C.render_logo(), -16.0, -2.3)
    write("logo.wav", logo)
    # In the demos the logo always plays at this one fixed gain (+1 dB over logo.wav).
    LOGO_GAIN_DB = 1.0
    logo_in = logo * undb(LOGO_GAIN_DB)
    assert tp_db(logo_in) <= TP_CEIL

    score = {"logo_gain_db_in_pieces": LOGO_GAIN_DB, "pieces": {}}

    print("motif")
    bed, _, lt = C.render_motif(logo)
    total = lt + C.LOGO_LEN
    bed = np.vstack([bed, np.zeros((secs(total) - len(bed), 2))])[: secs(total)]
    bed = C.finish_bed(bed, lt, total)
    x = master_with_logo(bed, logo_in, lt, -14.0)
    write("motif.wav", x)
    score["pieces"]["motif"] = {"logo_t": lt, "motif_notes": C.MOTIF_LOG.get("motif", [])}

    for name, fn in (("hopeful", C.render_hopeful), ("playful", C.render_playful), ("stark", C.render_stark)):
        print(name)
        bed, lt, total = fn()
        x = master_with_logo(bed, logo_in, lt, -14.0)
        write(f"demo-{name}.wav", x)
        score["pieces"][f"demo-{name}"] = {"logo_t": lt, "motif_notes": C.MOTIF_LOG.get(name, [])}

    print("sfx")
    # Interface sounds are matched to each other, not to -14 LUFS (see RULES.md):
    # each is set to a max momentary loudness of -18 LUFS, true peak <= -1 dB.
    # The key tick is deliberately 8 dB softer: it repeats many times a second while typing.
    for name, fn, tgt in (("type-tick", C.sfx_type_tick, SFX_TARGET - 8), ("change", C.sfx_change, SFX_TARGET),
                          ("arrive", C.sfx_arrive, SFX_TARGET), ("strike", C.sfx_strike, SFX_TARGET)):
        y = fn()
        lvl = sfx_level(y)
        y = y * undb(tgt - lvl)
        print(f"  ({name}: true peak before any limiting {tp_db(y):.2f} dB)")
        if tp_db(y) > -1.2:
            y = limit(y, -1.3)
        write(f"sfx/{name}.wav", y)
    score["logo_notes"] = C.LOGO_NOTES
    score["phrase_a"] = C.PHRASE_A
    score["phrase_b"] = C.PHRASE_B
    with open(os.path.join(OUT, "score.json"), "w") as f:
        json.dump(score, f, indent=1)


def sfx_level(y):
    """Max momentary loudness (EBU R128 'M': K-weighted, 400 ms sliding window, ungated).
    Short sounds cannot be measured as 'integrated' (that needs 400 ms gate blocks), and
    momentary loudness is what the ear judges a blip by."""
    m = pyln.Meter(SR)
    pad = np.zeros((secs(0.4), 2))
    xf = np.vstack([pad, y, pad])
    for _, flt in m._filters.items():
        xf = flt.apply_filter(xf)
    p = (xf ** 2).sum(axis=1)
    w = secs(0.4)
    c = np.concatenate([[0], np.cumsum(p)])
    ms = (c[w:] - c[:-w]) / w
    return float(-0.691 + 10 * np.log10(ms.max() + 1e-20))


if __name__ == "__main__":
    main()
