"""PHRASES: writing and DEVELOPING music note by note (added 2026-11-23).

WHY this exists: until now a section could only play fixed pieces of the tune ("phrase1",
"full"...) end to end, and a check failed any tune note that differed from the songbook's. So
the only way to make music change was to switch instruments on, and "Make it mine" heard the
same opening bar seven times in 54 s. A Phrase lets a composer take the tune's material and
DEVELOP it (the way every real film score treats its theme) or write a new line by hand, while
every note still says where it came from, so the checks can trace it back to the tune.

A Phrase is a list of notes N(beat, midi, beats, vel, src): `beat` from the phrase's start (bar
k starts at 4k), `vel` a touch multiplier (1.0 = the section's normal touch), `src` where it came
from: ("phrase1", 13.5, "") is the tune's own note; a third field lists the changes made to it
("up2 aug2" ...); ("written", ...) is a note written by hand.

Get material:
    motif("bar1")                 the tune's bar 1 (also "bar2".."bar8", "phrase1", "phrase2",
                                  "full", "signature" = the three notes, "cell" = the same, "ending")
    write("Bb4/1 G5/1 F5/2 | r/2 Eb5/1 D5/1")   by hand: NOTE/BEATS, r = rest, | = bar line
                                  (checked: each bar must add up to 4 beats), @0.8 = softer touch,
                                  ~/2 = tie (the note before lasts 2 beats longer, also across |)
    write("F5/1 | Bb5/2 ...", pickup=1)  the first bar is a 1-beat pick-up before the bar line
    .shift(-0.5)                  any phrase may start before its bar line (a pick-up)
Develop it (each returns a new Phrase; chain them):
    .up(k) / .down(k)             move along the E-flat major scale (k steps; stays in key)
    .octave(k)                    k octaves up (negative = down)
    .aug(f=2) / .dim(f=2)         every note f times longer / shorter (rhythm in proportion)
    .shift(beats)                 start later (a delayed entry; the tune "breathes in")
    .take(b0, b1)                 only the notes starting in [b0, b1), moved to start at 0
    .seq(step, times, every=4)    the phrase, then again `step` scale steps higher, `times` times
    .invert()                     upside down around its first note (rising becomes falling)
    .end_on(note, beats=None)     change the last note (a different phrase ending)
    .rhythm([beats...])           same pitches, new note lengths (a new rhythm)
    .fill()                       a passing note between notes a third apart (an ornament)
    .touch(*vels)                 touch per note (cycled), e.g. .touch(1.1, 0.8, 0.9)
    .bars(n)                      pad (rest) or trim to n bars
    a + b                         one after the other (b starts on the bar after a ends)
    a & b                         both at once (e.g. a line and its echo)
"""
import math
import re
from dataclasses import dataclass, replace

import tune as T
from dsp import note

NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def name(m):
    return f"{NAMES[int(m) % 12]}{int(m) // 12 - 1}"


@dataclass(frozen=True)
class N:
    beat: float
    m: int
    dur: float
    vel: float = 1.0
    src: tuple = ("written", 0.0, "")

    def tag(self, t):
        s = self.src
        return replace(self, src=(s[0], s[1], (s[2] + " " + t).strip()))


class Phrase:
    def __init__(self, notes, bars=None, label=""):
        self.notes = sorted(notes, key=lambda n: (n.beat, n.m))
        end = max((n.beat + n.dur for n in self.notes), default=0.0)
        self.nbars = bars if bars is not None else max(1, math.ceil(end / 4 - 1e-6))
        self.label = label

    # -- plumbing
    def _new(self, notes, bars=None, t=""):
        notes = [n.tag(t) for n in notes] if t else notes
        return Phrase(notes, bars, self.label)

    def __repr__(self):
        return f"Phrase({self.nbars} bars: " + " ".join(f"{name(n.m)}@{n.beat:g}/{n.dur:g}" for n in self.notes) + ")"

    def __add__(self, other):
        off = 4 * self.nbars
        return Phrase(self.notes + [replace(n, beat=n.beat + off) for n in other.notes], self.nbars + other.nbars)

    def __and__(self, other):
        return Phrase(self.notes + other.notes, max(self.nbars, other.nbars))

    # -- development
    def up(self, k=1):
        return self._new([replace(n, m=T.scale_step(n.m, k)) if n.m % 12 in T._SCALE else replace(n, m=n.m + 2 * k)
                          for n in self.notes], self.nbars, f"up{k}" if k >= 0 else f"down{-k}")

    def down(self, k=1):
        return self.up(-k)

    def octave(self, k=1):
        if k == 0:
            return self
        return self._new([replace(n, m=n.m + 12 * k) for n in self.notes], self.nbars, f"oct{k:+d}")

    def aug(self, f=2.0):
        return self._new([replace(n, beat=n.beat * f, dur=n.dur * f) for n in self.notes],
                         max(1, math.ceil(self.nbars * f - 1e-6)), f"aug{f:g}")

    def dim(self, f=2.0):
        return self._new([replace(n, beat=n.beat / f, dur=n.dur / f) for n in self.notes],
                         max(1, math.ceil(self.nbars / f - 1e-6)), f"dim{f:g}")

    def shift(self, beats):
        out = [replace(n, beat=n.beat + beats) for n in self.notes]
        end = max((n.beat + n.dur for n in out), default=0.0)
        # WHY no tag: a delay keeps every pitch; the tune is still the tune
        return self._new(out, max(self.nbars, math.ceil(end / 4 - 1e-6)))

    def take(self, b0, b1):
        out = [replace(n, beat=n.beat - b0, dur=min(n.dur, b1 - n.beat)) for n in self.notes if b0 <= n.beat < b1]
        return self._new(out, None, "frag" if (b0, b1) != (0, 4 * self.nbars) else "")

    def seq(self, step, times=2, every=None):
        every = every or 4 * self.nbars
        out = []
        for k in range(times):
            out += [replace(n, beat=n.beat + k * every, m=T.scale_step(n.m, k * step)).tag(f"seq{k * step:+d}") if k else n
                    for n in self.notes]
        return Phrase(out, math.ceil((every * (times - 1) + 4 * self.nbars) / 4 - 1e-6))

    def invert(self):
        if not self.notes:
            return self
        axis = self.notes[0].m
        steps = lambda m: _steps_between(axis, m)
        return self._new([replace(n, m=T.scale_step(axis, -steps(n.m))) for n in self.notes], self.nbars, "inv")

    def end_on(self, nm, beats=None):
        if not self.notes:
            return self
        last = self.notes[-1]
        out = self.notes[:-1] + [replace(last, m=note(nm), dur=beats or last.dur).tag("end")]
        return Phrase(out, self.nbars)

    def rhythm(self, durs):
        out, b = [], self.notes[0].beat if self.notes else 0.0
        for n, d in zip(self.notes, durs):
            out.append(replace(n, beat=b, dur=d).tag("rhy"))
            b += d
        return Phrase(out, None)

    def fill(self):
        out = []
        for a, b in zip(self.notes, self.notes[1:] + [None]):
            if b is not None and a.dur >= 1.0 and abs(_steps_between(a.m, b.m)) == 2:
                mid = T.scale_step(a.m, 1 if b.m > a.m else -1)
                h = a.dur / 2
                out += [replace(a, dur=h), replace(a, beat=a.beat + h, dur=h, m=mid, vel=a.vel * 0.85).tag("pass")]
            else:
                out.append(a)
        return Phrase(out, self.nbars)

    def touch(self, *vels):
        return Phrase([replace(n, vel=n.vel * vels[i % len(vels)]) for i, n in enumerate(self.notes)], self.nbars)

    def bars(self, n):
        out = [replace(x, dur=min(x.dur, 4 * n - x.beat)) for x in self.notes if x.beat < 4 * n]
        return Phrase(out, n)


def _steps_between(a, b):
    """Scale steps from midi a to midi b (b above a = positive); chromatic notes round down."""
    def idx(m):
        o, pc = divmod(m, 12)
        i = max(k for k, s in enumerate(T._SCALE) if s <= pc)
        return 7 * o + i
    return idx(b) - idx(a)


# ------------------------------------------------------------------ material


def motif(which):
    """The tune's own material as a Phrase (every note tagged with where it is in the tune)."""
    if which in ("signature", "cell"):
        return Phrase([N(b, note(nm), d, 1.0, ("signature", b, "")) for b, nm, d in T.SIGNATURE], 1)
    if which == "ending":
        return Phrase([N(b, note(nm), d, 1.0, ("ending", b, "")) for b, nm, d in T.ENDING], 1)
    if which.startswith("bar"):
        k = int(which[3:])
        seg, base = ("phrase1", 4 * (k - 1)) if k <= 4 else ("phrase2", 4 * (k - 5))
        return Phrase([N(b, note(nm), d, 1.0, (seg, base + b, "")) for b, nm, d in T.BAR_NOTES[k]], 1)
    notes, nbars, _ = T.SEGMENTS[which]
    return Phrase([N(b, note(nm), d, 1.0, (which, b, "")) for b, nm, d in notes], nbars)


_TOK = re.compile(r"^(r|~|[A-Ga-g](?:b|#)?-?\d)/([\d.]+)(?:@([\d.]+))?$")


def write(text, label="", pickup=0.0):
    """A line written by hand: 'Bb4/1 G5/1 F5/2 | r/1 Eb5/3'. Each bar between bar lines must add
    up to 4 beats (a typo otherwise silently shifts everything after it).

    `~/2` TIES: it lengthens the note before it by 2 beats, across a bar line if it starts the
    next bar ('Ab5/2 | ~/2 G5/2'). `pickup=1` makes the text's FIRST bar a pick-up of that many
    beats, played before the phrase's bar line (it sounds at the end of the previous bar).
    WHY both (2026-11-23, round-7 critics): every phrase the three test scores wrote started on a
    downbeat and no note was ever tied over a bar line, because write() could not say either. A
    melody that always lands on beat 1 is the stiffest thing a score can do."""
    notes, beat = [], -float(pickup)
    bars = [b.split() for b in text.split("|")]
    for k, toks in enumerate(bars):
        start = beat
        for t in toks:
            g = _TOK.match(t)
            if not g:
                raise ValueError(f"write(): cannot read '{t}' (use NOTE/BEATS like Bb4/1, r/2, G5/0.5@0.8, ~/1)")
            nm, d, v = g.group(1), float(g.group(2)), float(g.group(3) or 1.0)
            if nm == "~":
                if not notes:
                    raise ValueError(f"write(): '~' (a tie) needs a note before it in '{label or text[:30]}'")
                notes[-1] = replace(notes[-1], dur=notes[-1].dur + d)
            elif nm != "r":
                notes.append(N(beat, note(nm[0].upper() + nm[1:]), d, v, ("written", beat, "")))
            beat += d
        want = pickup if (k == 0 and pickup) else 4
        if len(bars) > 1 and k < len(bars) - 1 and abs(beat - start - want) > 1e-6:
            raise ValueError(f"write(): bar {k + 1} of '{label or text[:30]}' adds up to {beat - start:g} beats, not {want:g}")
    return Phrase(notes, max(1, math.ceil(beat / 4 - 1e-6)), label)


def rest(bars=1):
    return Phrase([], bars)
