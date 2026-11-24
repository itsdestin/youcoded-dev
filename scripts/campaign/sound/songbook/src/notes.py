"""THE NOTE DUMP: every note a piece plays, bar by bar, and the composition checks that need
only the notes (form.py), without rendering any audio (about a second for a 60 s film).

    render.sh --notes make-it-mine        # a film, a film file's key (e.g. mim) or a demo name
    render.sh --notes mim own tale
    render.sh --notes --log own           # also print every note (always written to out/notes/<name>.log.txt)

Writes out/notes/<name>.txt (the bar table, then PASS/FAIL with reasons) and prints it. WHY: a
score must be readable as notes before anyone renders or listens to it; that is how the
critics review it (nobody here can hear).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "engine"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import blocks  # noqa: E402
import films  # noqa: E402
import form  # noqa: E402
from demos import DEMOS  # noqa: E402
from score import Band, plan  # noqa: E402

OUT = os.path.join(HERE, "..", "out", "notes")


def note_log(band, rows, piece):
    """EVERY note the score plays, in time order: seconds, bar.beat, instrument group and part,
    what it is to the checks, pitch, length in beats and seconds, touch.
    WHY (2026-11-23, own): critics and composers had to write their own scripts to see exact note
    times and touches; the bar table summarises, this is the score itself."""
    beats = [r["beat"] for r in rows]
    tm = band.tm
    L = [f"NOTE LOG: {piece.name} ({len(band.log)} notes)",
         "   time    bar.beat  group    part       is       note   beats   secs   touch"]
    for e in sorted(band.log, key=lambda e: (e["t"], e["m"])):
        k = max(0, sum(1 for b in beats if b <= e["beat"] + 1e-6) - 1)
        rel = e["beat"] - rows[k]["beat"]
        secs = tm.seconds(e["beat"] + e["dur"]) - tm.seconds(e["beat"])
        L.append(f"  {e['t']:7.3f}  {k + 1:>3}.{rel + 1:<5.3g} {e['bus']:<8} {e['part']:<10} {form._cls(e):<8} "
                 f"{form.nm(e['m']):<5} {e['dur']:6.2f}  {secs:5.2f}   {e['vel']:.3f}")
    return L


def pauses(piece, rows, tm, min_gap=0.2):
    """Her real breaths (word file gaps of min_gap s or more), with the bar and beat they fall on,
    so a fragment can be placed ON a breath instead of on the bar grid (tale, round 7)."""
    words = getattr(piece.speech, "words", None)
    if not words:
        return []
    L = ["", f"her breaths of {min_gap:g} s or more (piece seconds; the bar and beat where each starts and ends):"]
    beats = [r["beat"] for r in rows]

    def where(t):
        b = min(np.arange(0, rows[-1]["beat"] + rows[-1]["blen"], 0.0625), key=lambda b: abs(tm.seconds(b) - t))
        k = max(0, sum(1 for x in beats if x <= b + 1e-6) - 1)
        return f"{k + 1} beat {b - beats[k] + 1:.2f}"
    for (w0, a0, b0), (w1, a1, b1) in zip(words, words[1:]):
        if a1 - b0 >= min_gap and b0 < piece.length:
            L.append(f"   {b0:6.2f}-{a1:6.2f} s ({a1 - b0:.2f} s)  bar {where(b0)} to {where(a1)}   after '{w0}', before '{w1}'")
    # WHY her pace in the dump (round 8): the tempo under a narrator is chosen from it
    import films as F
    pace = F.speech_pace(piece.speech, 0.0, piece.land_time())
    if pace:
        L.insert(1, f"her pace: {pace['syl_per_s']} syllables a second while speaking ({pace['syllables']} in "
                    f"{pace['speaking_s']} s), {pace['syl_s']} s a syllable: the beat = two syllables = {pace['bpm']:g} bpm "
                    f"(eighths at her syllable rate)")
    if words[-1][2] < piece.length:
        L.append(f"   {words[-1][2]:6.2f} s on: she has stopped (after '{words[-1][0]}') at bar {where(words[-1][2])}")
    return L


def dump(piece, log=False):
    plans = plan(piece)
    band = Band(piece, plans, dry=True)
    blocks.render(band, plans, piece)
    rows = form.bar_table(band, plans, piece)
    res = form.symbolic(band, plans, piece, rows)
    secs = [f"   {p.sec.label or p.sec.mood}: {p.t0:.2f}-{p.t1:.2f} s, {len(p.bars)} bars, {p.bpm:.1f} bpm "
            f"({100 * (p.bpm / p.nominal_bpm - 1):+.1f} %), {p.accomp}, into {p.into}" for p in plans[:-1]]
    L = form.table_text(rows, piece) + ["", "sections:"] + secs + [
        f"   ending ({piece.ending}, logo {piece.logo}): {plans[-1].t0:.2f} s, the name lands at {piece.land_time():.2f} s"]
    L += pauses(piece, rows, plans[0].tm) + [""]
    L += form.verdict_text(piece.name, res)
    L.append("   (audio checks - loudness range, plateaus, payoff louder, near-copy bars - run on a full render)")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{piece.name}.txt"), "w") as f:
        f.write("\n".join(L) + "\n")
    lg = note_log(band, rows, piece)
    with open(os.path.join(OUT, f"{piece.name}.log.txt"), "w") as f:
        f.write("\n".join(lg) + "\n")
    return L + (["", *lg] if log else [f"   note log: out/notes/{piece.name}.log.txt"])


def main(names):
    log = "--log" in names
    names = [n for n in names if n != "--log"]
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
        print("\n".join(dump(pieces[n], log)))
        print()


if __name__ == "__main__":
    main(sys.argv[1:])
