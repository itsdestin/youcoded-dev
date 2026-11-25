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
  * an onset is left out (not moved) when it falls in the same half-bar as a tune note, under
    the narrator's words, within one beat of the peak, or where it would sit a semitone from
    the pad below C5 - placed() returns what was left out and why;
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
    """Every cycle note to play, and every onset left out with its reason.
    guards = dict of functions of a global beat:
        tune_halfbar(beat) -> bool   a tune note starts in this half-bar
        speaking(beat)     -> bool   the narrator is speaking
        near_peak(beat)    -> bool   within one beat of the peak
        pad(beat)          -> [midi] the pad's notes sounding there
        gain(name, beat)   -> 0..1   the cycle's layer level (the change plan); 0 = out
    Returns (notes, dropped): notes = [dict(name, beat, m, dur, touch, round)],
    dropped = [dict(name, beat, m, why)]."""
    validate(cycles)
    notes, dropped = [], []
    for ci, c in enumerate(cycles):
        name = c.name or f"cycle{ci + 1}"
        P, b0 = c.period_beats(), start_beat + c.offset_beats()
        k = 0
        shift = 0
        while b0 + k * P < end_beat - 1e-6:
            base = b0 + k * P
            # WHY decided once per round: a choice repeated exactly is a pattern; a choice per note
            # is noise (the Strudel someCyclesBy / Sonic Pi seed idiom)
            play = _rng(seed, name, "chance", k) < c.chance
            if c.transpose_walk and k and k % 3 == 0:
                shift += 1 if _rng(seed, name, "walk", k) < 0.5 else -1
                shift = int(np.clip(shift, -2, 2))
            for off, m, d in c.notes():
                beat = base + off
                if beat >= end_beat - 1e-6:
                    continue
                mm = _pool_step(m, shift, c.pool or POOL) if shift else m
                why = None
                g = guards["gain"](name, beat)
                if not play:
                    why = "chance (this round skipped)"
                elif g <= 1e-3:
                    why = "layer out (change plan)"
                elif guards["tune_halfbar"](beat):
                    why = "tune in this half-bar"
                elif guards["speaking"](beat):
                    why = "under her words"
                elif guards["near_peak"](beat):
                    why = "within a beat of the peak"
                elif mm < note("C5") and any(abs(mm - q) in (1, 11, 13) for q in guards["pad"](beat) if q < note("C5")):
                    why = "a semitone from the pad"
                if why:
                    dropped.append(dict(name=name, beat=round(beat, 3), m=int(mm), why=why))
                    continue
                notes.append(dict(name=name, beat=beat, m=int(mm), dur=d, touch=c.touch * g, round=k,
                                  voice=c.voice))
            k += 1
    notes.sort(key=lambda n: n["beat"])
    return notes, dropped


def budget(length_s):
    """How many cycles a piece of this length may run (toolkit-plan c2): under 20 s one, 30-75 s
    two or three; and at most one cycle onset a second in all."""
    return (1, 1.0) if length_s < 20 else (3, 1.0)
