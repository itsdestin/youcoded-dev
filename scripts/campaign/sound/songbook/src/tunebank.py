"""THE TUNE, PLACED RARELY (the rebuild, 2026-11-24; toolkit-plan c6).

The tune is stored as short phrases (tune.PHRASES: 12 phrases of 1-2 bars cut from the tune and
the developments composers already used). A score places 2-4 of them where the picture allows,
each followed by at least two bars of bed alone; the recipes do the placing:

    tunebank.pick(seed, n)                 -> n phrase names chosen by seed, never the same twice
                                              in a row, the peak phrases only if asked
    tunebank.phrase("cell")                -> a motif.Phrase
    tunebank.lay(placements, chords, seed) -> one Phrase for the whole piece (bar 1 = beat 0),
                                              with at most a few small seeded mutations

A mutation (a new last note one step along the chord, or a new last rhythm) is allowed only on a
phrase whose last bar is the last bar of a 4-bar group, at a rate of at most one in four such
bars (Strudel's lastOf(4)). WHY: a phrase said twice the same way is identity; the same phrase
said a little differently the second time is what keeps a theme alive without new material.
"""
import hashlib
from dataclasses import replace

import tune as T
from dsp import note
from motif import Phrase, write


def _u(*key):
    d = hashlib.sha1(repr(key).encode()).digest()
    return int.from_bytes(d[:8], "little") / 2 ** 64


def phrase(name):
    if isinstance(name, Phrase):
        return name
    if name not in T.PHRASES:
        raise KeyError(f"no phrase {name!r}; the bank has: {', '.join(T.PHRASES)}")
    return write(T.PHRASES[name]["text"], label=name)


def pick(seed, n, peak=False, bars=None):
    """n phrase names by seed: never the same twice in a row; peak phrases (reaching C6) only when
    peak=True, and then only as the last one; bars=1 keeps to one-bar phrases."""
    ok = lambda k: bars is None or phrase(k).nbars == bars
    plain = [k for k, v in T.PHRASES.items() if not v["peak"] and ok(k)]
    tops = [k for k, v in T.PHRASES.items() if v["peak"] and ok(k)]
    out = []
    for i in range(n):
        src = tops if (peak and i == n - 1) else plain
        cands = [k for k in src if not out or k != out[-1]]
        out.append(cands[int(_u(seed, "pick", i) * len(cands))])
    return out


def _chord_at(chords, beat):
    """chords = one list per bar (1-based bar k covers beats 4(k-1)..4k)."""
    k = int(beat // 4)
    if not chords:
        return None
    bar = chords[min(k, len(chords) - 1)]
    return bar[0] if (len(bar) == 1 or beat - 4 * k < 2) else bar[1]


def mutate(ph, chord, seed, key):
    """One small change to the phrase's LAST note: one step to the nearest other chord tone, or
    its rhythm split into two (the second a step toward a chord tone)."""
    if not ph.notes:
        return ph, None
    last = ph.notes[-1]
    tones = T.CHORD_TONES.get(chord, {3, 7, 10})
    kind = "note" if _u(seed, key, "kind") < 0.6 or last.dur < 1.0 else "rhythm"
    if kind == "note":
        for k in (1, -1, 2, -2):
            m2 = T.scale_step(last.m, k) if last.m % 12 in T._SCALE else last.m
            if m2 % 12 in tones and m2 != last.m and m2 < note("C6"):
                return Phrase(ph.notes[:-1] + [replace(last, m=m2).tag("mut-note")], ph.nbars, ph.label), \
                    f"last note -> {m2}"
        return ph, None
    h = last.dur / 2
    step = 1 if _u(seed, key, "dir") < 0.5 else -1
    m2 = T.scale_step(last.m, step) if last.m % 12 in T._SCALE else last.m
    if m2 % 12 not in tones or m2 >= note("C6"):
        return ph, None
    return Phrase(ph.notes[:-1] + [replace(last, dur=h).tag("mut-rhy"),
                                   replace(last, beat=last.beat + h, dur=h, m=m2, vel=last.vel * 0.9).tag("mut-rhy")],
                  ph.nbars, ph.label), "last note split"


def lay(placements, chords, seed, mutate_rate=0.25, shown_offset=0):
    """placements = [(bar, phrase name or Phrase)] (bar counted from 1). Returns (Phrase over
    the whole piece, report lines). Phrases may not overlap."""
    notes, report, end = [], [], -1.0
    for i, (bar, ph) in enumerate(sorted(placements, key=lambda x: x[0])):
        P = phrase(ph)
        b0 = 4.0 * (bar - 1)
        if b0 < end - 1e-6:
            raise ValueError(f"tune phrase at bar {bar} starts before the previous one ends")
        last_bar = bar + P.nbars - 1
        tag = None
        if last_bar % 4 == 0 and _u(seed, "mut", bar) < mutate_rate * P.nbars:
            P, tag = mutate(P, _chord_at(chords, b0 + P.notes[-1].beat) if P.notes else None, seed, bar)
        notes += [replace(n, beat=n.beat + b0) for n in P.notes]
        end = b0 + 4 * P.nbars
        shown = shown_offset(bar) if callable(shown_offset) else bar + shown_offset
        report.append(f"bar {shown}: {P.label or 'written'} ({P.nbars} bar{'s' if P.nbars > 1 else ''})"
                      + (f", mutated: {tag}" if tag else ""))
    return Phrase(notes, max(1, int(end // 4)) if notes else 1, "tune"), report


def slice_bars(whole, b0, nbars):
    """The part of the whole-piece Phrase that falls in bars b0+1 .. b0+nbars (beats re-based)."""
    lo, hi = 4.0 * b0, 4.0 * (b0 + nbars)
    out = [replace(n, beat=n.beat - lo, dur=min(n.dur, hi - n.beat)) for n in whole.notes if lo - 1e-6 <= n.beat < hi]
    return Phrase(out, nbars)
