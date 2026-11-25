"""THE CYCLES ENGINE (the rebuild, 2026-11-24; toolkit-plan c2): variety by machine.

A Cycle is a short cell (1-4 notes) that repeats every `period` half-beats. Give two or three
cycles periods that share no factor (7, 9 and 11 half-beats; or 5, 7 and 9 bars for slow ones)
and they line up a different way every time round, for as long as the music lasts, while each
one on its own is simple and steady.

WHY: Brian Eno's "Music for Airports" loops a few phrases of lengths 23.5, 25.9 and 29.9 s; the
research found this the closest documented match to the owner's gold standard ("easy to listen
to indefinitely without it becoming annoying, but still varied and interesting"). Rounds 6-7
wrote variety by hand, note by note, and were heard as "extremely repetitive" (the tune looped)
and then "odd/choppy" (newness forced everywhere). Cycles put the repetition in the background,
where it is welcome, and let their alignment supply the change.

Rules built in (not checks to pass, but how the engine plays):
  * a cell's pitches come from a pool with no semitones (default E-flat major pentatonic + D:
    Eb F G Bb C D), so two cycles can never rub;
  * `chance` is decided once per time round (never per note): a round that is skipped is
    skipped whole, and the same seed always skips the same rounds;
  * a whole ROUND is left out (never moved, never cut to a fragment) when any of its notes
    sounds in a tune phrase's half-bars, under the narrator's words, within one beat of the
    peak, a semitone from the pad below C5, or on the pulse's own key - placed() returns what
    was left out and why;
  * `transpose_walk`: on return the cell may move one step along the pool, at most every third
    round (Chilvers' "Reflection" idiom).
"""
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

from dsp import note

POOL = ["Eb", "F", "G", "Bb", "C", "D"]          # E-flat major pentatonic + D: no semitones
_PC = {"C": 0, "D": 2, "Eb": 3, "E": 4, "F": 5, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


@dataclass
class Cycle:
    cell: str                         # "Bb5/0.5 G5/1" (NOTE/BEATS, as motif.write; r/0.5 = a rest)
    period: float                     # half-beats between starts (e.g. 7, 9, 11), or bars with unit="bar"
    offset: float = 0.0               # half-beats (or bars) before the first start
    name: str = ""                    # the layer name used by the change plan ("in"/"out"); default cycle1..
    voice: str = "piano"              # "piano" (soft, on the cycle bus) | "bell" (high muted piano double)
    touch: float = 0.30
    chance: float = 1.0               # per round, 0.7-1.0
    transpose_walk: bool = False
    unit: str = "half"                # "half" (half-beats) | "bar"
    pool: Optional[list] = None       # pitch classes allowed (names); default POOL
    at_least: int = 0                 # rounds guaranteed to sound (chance-skipped rounds used first)

    def notes(self):
        """[(beat offset in the cell, midi, beats)]"""
        out, b = [], 0.0
        for tok in self.cell.split():
            nm, d = tok.split("/")
            d = float(d)
            if nm != "r":
                out.append((b, note(nm), d))
            b += d
        return out

    def period_beats(self):
        return self.period * (4.0 if self.unit == "bar" else 0.5)

    def offset_beats(self):
        return self.offset * (4.0 if self.unit == "bar" else 0.5)

    def duty(self):
        """sounding / period: Eno's silence at least twice the sound (<= 0.33)."""
        ns = self.notes()
        return sum(d for _, _, d in ns) / self.period_beats() if ns else 0.0


def validate(cycles):
    """Raise on a cell that cannot work: a pitch outside its pool (a semitone could appear), or a
    cell longer than its period. WHY raise, not warn: these are spelling mistakes, not taste."""
    for i, c in enumerate(cycles):
        pool = {_PC[p] for p in (c.pool or POOL)}
        for _, m, _ in c.notes():
            if m % 12 not in pool:
                raise ValueError(f"cycle {c.name or i + 1}: {c.cell!r} has a note outside its pool {c.pool or POOL}")
        span = max((b + d for b, _, d in c.notes()), default=0.0)
        if span > c.period_beats() + 1e-6:
            raise ValueError(f"cycle {c.name or i + 1}: the cell lasts {span:g} beats, longer than its period "
                             f"({c.period_beats():g} beats)")


def coprime(cycles):
    """Are the periods pairwise co-prime (counted in their own unit)? WHY: periods that share a
    factor line up again quickly, and the variety stops."""
    # WHY in the cycles' own unit when they share one: bar cycles (5, 7, 9 bars) would all share
    # the factor 8 if counted in half-beats
    if len({c.unit for c in cycles}) == 1:
        ps = [int(round(c.period)) for c in cycles]
    else:
        ps = [int(round(c.period_beats() * 2)) for c in cycles]
    bad = [(a, b) for i, a in enumerate(ps) for b in ps[i + 1:] if math.gcd(a, b) > 1]
    return not bad, bad


def _rng(seed, *key):
    import hashlib
    d = hashlib.sha1(repr((seed,) + key).encode()).digest()
    return int.from_bytes(d[:8], "little") / 2 ** 64


def _pool_step(m, k, pool):
    """Move midi m by k steps along the pool (pitch-class names)."""
    pcs = sorted(_PC[p] for p in pool)
    o, pc = divmod(m, 12)
    if pc not in pcs:
        return m
    i = pcs.index(pc) + k
    return 12 * (o + i // len(pcs)) + pcs[i % len(pcs)]


def placed(cycles, end_beat, seed, guards, start_beat=0.0):
    """Every cycle note to play, and every round left out with its reason.
    guards = dict of functions of a global beat:
        tune_halfbar(beat) -> bool   a tune phrase (with a beat around it) covers this half-bar
        speaking(beat)     -> bool   the narrator is speaking
        near_peak(beat)    -> bool   within one beat of the peak
        pad(beat)          -> [midi] the pad's notes sounding there
        gain(name, beat)   -> 0..1   the cycle's layer level (the change plan); 0 = out
        pulse(beat)        -> [midi] (optional) the pulse's pool there
    Returns (notes, dropped): notes = [dict(name, beat, m, dur, touch, round)],
    dropped = [dict(name, beat, m, why)] (one entry per note of a dropped round).
    WHY whole rounds (audit 2026-11-25, defect 5): guards used to drop single notes, so a 3-note
    cell came out as 2 notes (G5 Bb5 with the F5 gone), a fragment that is neither the cell nor
    silence. A round now plays whole or not at all; the reason is the first guard any of its
    notes meets. A note SOUNDING into a tune phrase counts, not only one starting there (a cycle
    B-flat 5 rang over the tune's first note)."""
    validate(cycles)
    notes, dropped = [], []
    pulse = guards.get("pulse") or (lambda b: [])
    for ci, c in enumerate(cycles):
        name = c.name or f"cycle{ci + 1}"
        P, b0 = c.period_beats(), start_beat + c.offset_beats()
        k = 0
        shift = 0
        rounds = []                              # (k, [(beat, mm, d)], why or None, chance_only)
        while b0 + k * P < end_beat - 1e-6:
            base = b0 + k * P
            # WHY decided once per round: a choice repeated exactly is a pattern; a choice per note
            # is noise (the Strudel someCyclesBy / Sonic Pi seed idiom)
            play = _rng(seed, name, "chance", k) < c.chance
            if c.transpose_walk and k and k % 3 == 0:
                shift += 1 if _rng(seed, name, "walk", k) < 0.5 else -1
                shift = int(np.clip(shift, -2, 2))
            rn = []
            for off, m, d in c.notes():
                beat = base + off
                if beat >= end_beat - 1e-6:
                    continue
                mm = _pool_step(m, shift, c.pool or POOL) if shift else m
                rn.append((beat, mm, d))
            why = None
            for beat, mm, d in rn:
                sounds = mm + (12 if c.voice == "bell" else 0)
                g = guards["gain"](name, beat)
                if g <= 1e-3:
                    why = "layer out (change plan)"
                elif any(guards["tune_halfbar"](x) for x in np.arange(beat, beat + d + 1e-6, 0.5)):
                    why = "tune in this half-bar"
                elif guards["speaking"](beat) or guards["speaking"](beat + d):
                    why = "under her words"
                elif guards["near_peak"](beat):
                    why = "within a beat of the peak"
                elif mm < note("C5") and any(abs(mm - q) in (1, 11, 13) for q in guards["pad"](beat) if q < note("C5")):
                    why = "a semitone from the pad"
                elif sounds in pulse(beat):
                    # WHY (audit defect 5): a cycle on the pulse's own key (both B-flat 5 at 1.49 s
                    # in recipe C) is a doubling, a flam, not a second part
                    why = "doubles a pulse note"
                if why:
                    break
            if rn and not play and why is None:
                rounds.append((k, rn, "chance (this round skipped)", True))
            elif rn:
                rounds.append((k, rn, why, False))
            k += 1
        # WHY at_least (audit defect 5: whimsy=True placed 0 bell notes): a colour the composer
        # asked for is heard at least `at_least` times; rounds skipped only by chance are
        # played instead, earliest first
        played = sum(1 for r in rounds if r[2] is None)
        need = int(getattr(c, "at_least", 0) or 0)
        out_rounds = []
        for r in rounds:
            if r[2] is not None and r[3] and played < need:
                r = (r[0], r[1], None, False)
                played += 1
            out_rounds.append(r)
        for kk, rn, why, _ in out_rounds:
            for beat, mm, d in rn:
                if why:
                    dropped.append(dict(name=name, beat=round(beat, 3), m=int(mm), why=why))
                else:
                    g = guards["gain"](name, beat)
                    notes.append(dict(name=name, beat=beat, m=int(mm), dur=d, touch=c.touch * g, round=kk,
                                      voice=c.voice))
    notes.sort(key=lambda n: n["beat"])
    return notes, dropped


def budget(length_s):
    """How many cycles a piece of this length may run (toolkit-plan c2): under 20 s one, 30-75 s
    two or three; and at most one cycle onset a second in all."""
    return (1, 1.0) if length_s < 20 else (3, 1.0)
