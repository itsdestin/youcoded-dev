"""FILM 1, "Own everything" (24.0 s, typography, picture final). 100 BPM, beat 0.6 s, bar 2.4 s.

Deadpan (the stark register) until the marker crosses out "nothing."; the music turns bright
while "everything." is written; then one statement per bar, each taking the next piece of the
motif, the last the biggest; the logo's third note on the name at 19.2 s.
"""
import numpy as np

from common import Grid, Score, arrive_notes, ins, note, pen_tap, place, scribble, sfx  # noqa: F401

LENGTH = 24.0
G = Grid(100)                       # G(bar, beat) -> seconds
HITS = {                            # picture times (seconds), from the brief
    "you'll own": 0.0, "nothing.": 1.8, "and you'll": 3.6, "be happy.": 4.2,
    "strike 1": (6.60, 6.83), "strike 2": (6.87, 7.06),
    "everything (written)": (7.28, 8.04), "full stop": 8.16,
    "own your data.": 9.6, "own your intelligence.": 12.0, "own your software.": 14.4,
    "own everything.": 16.8, "name (logo lands)": 19.2, "clean end": 23.6,
}
LOGO_AT = HITS["name (logo lands)"] - 0.5   # the logo's third note is 0.5 s into the file


def score():
    s = Score(LENGTH)
    bt = G.beat
    # ---- deadpan: one dry felt note on every beat, a touch firmer on each new line of text
    words = {HITS[k]: k for k in ("you'll own", "nothing.", "and you'll", "be happy.")}
    for k in range(10):                       # beats at 0.0 .. 5.4
        t = k * bt
        if round(t, 2) in words:
            s.piano_hit(words[round(t, 2)], t, "Bb3", 0.12, 0.44, pedal=False, tone=-0.3)
        else:
            s.piano(t, "Bb3", 0.12, 0.33, pedal=False, tone=-0.3)
    # "be happy." is deadpan-sarcastic: a dry low sub under it, no chord, nothing resolves
    s.bass(HITS["and you'll"], "Eb2", 2.3, 0.45)
    # 6.0-6.6: nothing. Then the marker.
    for i, k in enumerate(("strike 1", "strike 2")):
        a, b = HITS[k]
        s.hit(k, a, sfx.strike(b - a, seed=i + 1), kind="start", gain=0.36)
    a, b = HITS["everything (written)"]
    s.hit("everything (written)", a, scribble(b - a), kind="start", gain=0.42)
    s.hit("full stop", HITS["full stop"], pen_tap(), gain=1.1)
    # ---- turning bright while it is written (bar 4 = 7.2 s): the pad opens, the glass
    # answers the cell high and quiet, an air swell carries it into the first statement
    t4 = G(4)
    s.pad(t4, "Eb", 2.6, 0.30, cutoff=2600, attack=1.6, release=0.8, seed=41)
    for i, (b, nm, d) in enumerate(MOTIF_ECHO_SHIFTED):
        s.pluck(t4 + i * bt, nm, 0.30, decay=0.45, p=(0.3, -0.3, 0.0)[i])
    s.swell(G(5), 1.2, 0.18)
    s.bass(t4 + 2 * bt, "Eb2", 1.0, 0.35)
    # ---- one statement per bar
    chords = {5: "Eb", 6: "Cm7", 7: "Abmaj7", 8: "Eb"}
    for bar, ch in chords.items():
        t0 = G(bar)
        big = bar == 8
        s.pad(t0, ch, 4 * bt, 0.30 + 0.06 * (bar - 5), cutoff=2000 + 300 * (bar - 5), attack=0.25,
              release=1.0 if big else 0.6, seed=50 + bar)
        s.pulse(t0, ch, 4 * bt, 0.22 + 0.04 * (bar - 5), cutoff=2400, every=bt / 2, seed=bar)
        s.bass(t0, ch, 4 * bt - 0.1 if not big else 2.4, 0.6 + 0.08 * (bar - 5))
        s.lh(t0, ch, 4 * bt, 0.30 + 0.03 * (bar - 5), "block")
        s.kick(t0, 0.75 + 0.05 * (bar - 5))
        s.kick(t0 + 2 * bt, 0.65)
        if bar >= 6:
            s.snap(t0 + bt, 0.35 + 0.05 * (bar - 6))
            s.snap(t0 + 3 * bt, 0.35 + 0.05 * (bar - 6))
        if bar >= 7:
            for e in range(8):
                s.hat(t0 + e * bt / 2, 0.12 if e % 2 == 0 else 0.2)
    # bar 5 "own your data.": the person's cell on piano
    for i, (b, nm, d) in enumerate(MOTIF_A):
        name = "own your data." if i == 0 else None
        _melody(s, name, G(5) + b * bt, nm, d * bt, 0.62)
    # bar 6 "own your intelligence.": the machine's echo, glass, an octave up
    for i, (b, nm, d) in enumerate(MOTIF_ECHO):
        t = G(6) + (b - 5) * bt
        if i == 0:
            s.pluck_hit("own your intelligence.", t, nm, 0.55, 0.45, p=0.25)
        else:
            s.pluck(t, nm, 0.5, decay=0.45, p=(-0.3 if i == 1 else 0.0))
    s.piano(G(6), "C5", 4 * bt, 0.40)
    # bar 7 "own your software.": the reply rising
    for i, (b, nm, d) in enumerate(MOTIF_B[:4]):
        _melody(s, "own your software." if i == 0 else None, G(7) + (b - 8) * bt, nm, d * bt, 0.64)
    # bar 8 "own everything.": the reply lands, in octaves, the biggest moment
    s.piano_hit("own everything.", G(8), "G5", 4 * bt, 0.74, tone=0.2)
    s.piano(G(8), "G6", 4 * bt, 0.55, tone=0.2)
    s.piano(G(8), "Eb2", 4 * bt, 0.5)
    s.piano(G(8) + 0.02, "Bb2", 4 * bt, 0.42)
    s.swell(G(8), 1.0, 0.22)
    for i, nm in enumerate(["Eb6", "Bb5", "G6", "Eb6", "Bb6", "G6"]):
        s.pluck(G(8) + 0.6 + i * bt / 2, nm, 0.22, decay=0.3, p=(-0.5 if i % 2 else 0.5))
    mix = s.render(dict(delay_s=0.75 * bt, room=dict(piano=0.04), hall=dict(piano=0.18)), end_fade=0.0)
    # the music clears the way for the name: gone by the logo's landing
    mix = _fade_region(mix, LOGO_AT - 0.25, HITS["name (logo lands)"] - 0.1)
    # deadpan half nearly mono, opening to full width as the word is written
    t = np.arange(len(mix)) / 48000
    w = np.clip((t - 7.2) / 1.0, 0, 1) * 0.85 + 0.15
    m = mix.mean(axis=1, keepdims=True)
    mix = m + (mix - m) * w[:, None]
    return s, mix + s.sfx


# the glass echo while "everything" is written: the cell an octave up, on beats
MOTIF_ECHO_SHIFTED = [(0, "Bb5", 1), (1, "G6", 1), (2, "F6", 1)]
from common import MOTIF_A, MOTIF_B, MOTIF_ECHO  # noqa: E402


def _melody(s, name, t, nm, dur, vel):
    if name:
        s.piano_hit(name, t, nm, dur, vel)
    else:
        s.piano(t, nm, dur, vel)


def _fade_region(x, start, end):
    t = np.arange(len(x)) / 48000
    g = np.clip((end - t) / (end - start), 0, 1)
    return x * (np.sin(0.5 * np.pi * g) ** 2)[:, None]
