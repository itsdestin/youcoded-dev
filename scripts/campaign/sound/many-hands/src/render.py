"""Render every "Many hands" deliverable into out/ and measure it.

Run from anywhere:  scripts/campaign/sound/many-hands/render.sh
(or .venv/bin/python -I src/render.py [logo motif hopeful playful stark sfx])
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import compose as C  # noqa: E402
import sfx as X  # noqa: E402
from dsp import SR, limit, master, undb, write, true_peak, db  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")


def sfx_master(x, tp=-3.0):
    """Short sounds can't carry an integrated LUFS reading (< 0.4 s), so they are
    set by true peak instead: -3 dBTP leaves headroom for an editor."""
    x = x * undb(tp - true_peak(x))
    return x


def main(which):
    t0 = time.time()
    logo_raw = C.logo_mix()
    # WHY one logo buffer: the exact same audio is mixed into every demo, so the
    # name always sounds identical; demos are then only gain-matched/limited.
    logo_gain = undb(-16 - __import__("dsp").lufs(logo_raw))
    logo = logo_raw * logo_gain
    np.save(os.path.join(OUT, ".logo_ref.npy"), logo)
    if "logo" in which:
        write(os.path.join(OUT, "logo.wav"), master(logo, -16.0))
    if "motif" in which:
        write(os.path.join(OUT, "motif.wav"), master(C.motif_mix(), -14.0))
    for name in ("hopeful", "playful", "stark"):
        if name in which:
            mix, stems = getattr(C, name)(logo)
            write(os.path.join(OUT, f"demo-{name}.wav"), master(mix, -14.0))
            np.save(os.path.join(OUT, f".{name}_pluck.npy"),
                    (stems.get("pluck", 0) + stems.get("dry", 0) + stems.get("mallet", 0)).mean(axis=1)
                    .astype(np.float32))
    if "sfx" in which:
        for nm, fn in [("type-tick", X.type_tick), ("change", X.change), ("arrive", X.arrive),
                       ("strike", X.strike)]:
            write(os.path.join(OUT, "sfx", f"{nm}.wav"), sfx_master(fn()))
    print(f"rendered {', '.join(which)} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    os.makedirs(os.path.join(OUT, "sfx"), exist_ok=True)
    args = sys.argv[1:] or ["logo", "motif", "hopeful", "playful", "stark", "sfx"]
    main(args)
