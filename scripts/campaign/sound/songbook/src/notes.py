"""THE NOTE DUMP: every note a piece plays, bar by bar, and the composition checks that need
only the notes (form.py), without rendering any audio (about a second for a 60 s film).

    render.sh --notes make-it-mine        # a film, a film file's key (e.g. mim) or a demo name
    render.sh --notes mim own tale

Writes out/notes/<name>.txt (the bar table, then PASS/FAIL with reasons) and prints it. WHY: a
score must be readable as notes before anyone renders or listens to it; that is how the
critics review it (nobody here can hear).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "engine"))
sys.path.insert(0, HERE)

import blocks  # noqa: E402
import films  # noqa: E402
import form  # noqa: E402
from demos import DEMOS  # noqa: E402
from score import Band, plan  # noqa: E402

OUT = os.path.join(HERE, "..", "out", "notes")


def dump(piece):
    plans = plan(piece)
    band = Band(piece, plans, dry=True)
    blocks.render(band, plans, piece)
    rows = form.bar_table(band, plans, piece)
    res = form.symbolic(band, plans, piece, rows)
    secs = [f"   {p.sec.label or p.sec.mood}: {p.t0:.2f}-{p.t1:.2f} s, {len(p.bars)} bars, {p.bpm:.1f} bpm "
            f"({100 * (p.bpm / p.nominal_bpm - 1):+.1f} %), {p.accomp}, into {p.into}" for p in plans[:-1]]
    L = form.table_text(rows, piece) + ["", "sections:"] + secs + [
        f"   ending: {plans[-1].t0:.2f} s, the name lands at {piece.land_time():.2f} s", ""]
    L += form.verdict_text(piece.name, res)
    L.append("   (audio checks - loudness range, payoff louder, near-copy bars - run on a full render)")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{piece.name}.txt"), "w") as f:
        f.write("\n".join(L) + "\n")
    return L


def main(names):
    pieces = {p.name: p for p in DEMOS}
    pieces.update({n: f.piece for n, f in films.FILMS.items()})
    want = []
    for n in names or list(pieces):
        got = films.resolve([n]) or ([n] if n in pieces else [])
        if not got:
            print(f"Unknown piece or film: {n}. Known: {', '.join(pieces)}", file=sys.stderr)
            sys.exit(2)
        want += got
    for n in want:
        print("\n".join(dump(pieces[n])))
        print()


if __name__ == "__main__":
    main(sys.argv[1:])
