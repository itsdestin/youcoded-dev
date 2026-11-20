""""Two pianos and a little electricity": two 20-second playful pieces (120 BPM, E-flat major).

ONE song in each: one tune (eight bars, two phrases), one chord progression, one bouncing
accompaniment figure that never stops, a bass, and an ending into the sound logo. These are the
named building blocks below (BLOCK 1-5), so the winner can be lifted into the brand's songbook.

No drums of any kind. Rhythm comes only from the playing: an accompaniment figure grouped 3+3+2
with a silent eighth in each group, short damped notes, and two pianos interlocking. Growth
comes from the arrangement (who plays what, how low, how many voices), never from new ideas.

Beats are quarter notes; bar k starts at beat 4*(k-1); one beat = 0.5 s.
"""
import numpy as np

import instruments as ins
from arrange import VOICES, _fade_region, ir
from dsp import (SR, biquad, butter, compress, convolve, fade, lp4, midi_hz, note, onepole_lp,
                 pan, pingpong, place, rng, sat, saw, sine)
from master import lufs

BPM = 120
LENGTH = 20.0
LOGO_AT = 17.5          # logo.wav starts here, so its third note lands at 18.0 s
BUSES = ["piano1", "piano2", "synth", "bass"]

# "full" renders everything; "backing" leaves out the tune's notes, so build.py can measure how
# far the tune stands above everything else at its own pitches (full minus backing = the tune).
MODE = "full"

# A gentle rise and one breath: each bar's loudness multiplier (velocity is ~2.2 dB per 0.1)
SHAPE = {1: 0.93, 2: 0.95, 3: 0.98, 4: 1.0, 5: 1.0, 6: 1.02, 7: 1.02, 8: 1.08, 9: 0.9}


def bar(k):
    return 4 * (k - 1)


def _rise(t, a):
    return np.where(t < a, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / a, 0, 1)), 1.0)


# ================================================================ the two pianos

def piano_note(m, vel, dur_s, pedal=False, tone=0.0, cents=0.0):
    """One note on the CC0 upright, felted (same recipe as felt-and-pulse's felt_piano) with two
    extra knobs that make the SECOND piano a different instrument rather than a copy:
    `cents` (a slightly different tuning, like a second piano in the same room) and `tone`."""
    m = int(m)
    r = ins._region(m, "H" if vel >= 0.7 else "L")
    # WHY fractional semitones through the cached resampler: detuning by a few cents is what
    # makes two pianos sound like two pianos, and caching keeps it as fast as plain notes
    x = ins._pitched(r["sample"], m - r["key"] + cents / 100.0).copy()
    tail = 1.4 if pedal else 0.16
    n_keep = min(len(x), int((dur_s + tail * 5) * SR))
    x = x[:n_keep]
    t = np.arange(n_keep) / SR
    x *= np.where(t < dur_s, 1.0, np.exp(-(t - dur_s) / tail))[:, None]
    fc = 900.0 * 2 ** (vel * 2.4 + tone)
    x = biquad(x, "lp", fc, 0.6)
    x = onepole_lp(x, min(fc * 2.5, 16000))
    x = fade(x, fin=0.004)
    # the felt hammer's tiny low "thump" at the attack (part of the note, as in felt_piano)
    k = int(0.05 * SR)
    th = ins.noise(k, seed=m) * np.exp(-np.arange(k) / (0.009 * SR))
    x[:k] += (butter(th, "lowpass", 220, 2) * 0.35 * vel)[:, None]
    x *= 10 ** ((vel - 0.8) * 22 / 20) * 1.6
    return fade(x, fout=0.02)


# piano 1: the felt piano (warm, a little left, more room around it)
# piano 2: brighter, tuned 7 cents sharp, a little right, drier (a second player at a second piano)
VOICE = {"piano1": dict(tone=0.3, cents=0.0, pan=-0.32),
         "piano2": dict(tone=0.7, cents=7.0, pan=0.36)}


# ================================================================ a little electricity

def arp_voice(m, vel=0.5, cutoff=900.0, gate=0.09, seed=0, res=0.3):
    """Warm analog-style arpeggio note: two detuned saws and a soft square through a resonant
    4-pole low-pass that opens briefly on each note; rounded 3 ms attack (no click)."""
    f = float(midi_hz(m))
    n = int((gate + 0.35) * SR)
    t = np.arange(n) / SR
    r = rng(seed)
    x = (saw(f * 2 ** (-6 / 1200), n, r.uniform()) + saw(f * 2 ** (6 / 1200), n, r.uniform())) / 2
    ph = r.uniform()
    x += 0.35 * 0.5 * (saw(f, n, ph) - saw(f, n, (ph + 0.5) % 1.0))
    fc = np.minimum(cutoff * (1 + 2.2 * np.exp(-t / 0.05)), 12000)
    x = lp4(sat(x, 1.2), fc, res=res)
    env = _rise(t, 0.003) * np.exp(-t / 0.18) * np.where(t < gate, 1.0, np.exp(-(t - gate) / 0.05))
    return fade(x * env * vel, fout=0.01)


# ================================================================ the score object

class Score:
    def __init__(self, seed):
        self.n = int(round(LENGTH * SR))
        self.bus = {b: np.zeros((self.n, 2)) for b in BUSES}
        self.r = rng(seed)          # humanising, seeded: identical on every render
        self.melody = []            # (seconds, midi) of tune notes, for the measurement
        self.onsets = []            # every note start (seconds), for the "no stray hits" check

    def t(self, beat):
        return beat * 60.0 / BPM

    def when(self, beat, sd, late=0.0):
        """Humanised time: a little random spread, offbeat eighths a touch late (a light lilt)."""
        frac = beat % 1.0
        swing = 0.012 if abs(frac - 0.5) < 1e-6 else (0.006 if abs(frac - 0.25) < 1e-6 or abs(frac - 0.75) < 1e-6 else 0.0)
        return max(0.003, self.t(beat) + swing + late + self.r.normal(0, sd))

    def piano(self, who, beat, name, beats, vel, pedal=False, role="part", sd=0.006, late=0.0, k=None, tone=None):
        """role: 'tune' (logged + muted in backing), 'double' (muted in backing, not logged:
        an octave doubling of the tune), 'part' (everything else)."""
        m = note(name) if isinstance(name, str) else int(name)
        kb = k if k is not None else int(beat // 4) + 1
        v = float(np.clip(vel * SHAPE.get(kb, 1.0) + self.r.normal(0, 0.025), 0.12, 0.9))
        tt = self.when(beat, sd, late)
        vc = VOICE[who]
        x = piano_note(m, v, self.t(beats), pedal=pedal, tone=vc["tone"] if tone is None else tone, cents=vc["cents"])
        x = x * np.array([1 - max(vc["pan"], 0), 1 + min(vc["pan"], 0)])
        if not (role in ("tune", "double") and MODE == "backing"):
            place(self.bus[who], x, tt)
        if role == "tune":
            self.melody.append((tt, m))
        self.onsets.append(tt)

    def line(self, who, at, notes, vel, role="tune", octave=0, pedal=False, late=0.0):
        for b, nm, d in notes:
            self.piano(who, at + b, note(nm) + 12 * octave, d, vel, pedal=pedal, role=role, late=late)

    def arp(self, beat, name, vel, cutoff, gate=0.09, p=0.0, role="part", sd=0.003):
        m = note(name) if isinstance(name, str) else int(name)
        tt = self.when(beat, sd)
        x = pan(arp_voice(m, vel * (1 + self.r.normal(0, 0.05)), cutoff, gate, seed=int(beat * 8) + m), p)
        if not (role in ("tune", "double") and MODE == "backing"):
            place(self.bus["synth"], x, tt)
        if role == "tune":
            self.melody.append((tt, m))
        self.onsets.append(tt)

    def sub(self, beat, name, beats, vel=0.8):
        tt = self.when(beat, 0.004)
        place(self.bus["bass"], ins.sub(note(name), self.t(beats), vel), tt)
        self.onsets.append(tt)


# ================================================================ BLOCK 1: the chords

# Two four-bar phrases on one progression, then a two-chord ending into the logo.
# Bar 4 is B-flat sus for two beats, then plain B-flat (the "question" that wants to go home);
# bar 8 lands home on E-flat (with G in the bass).
PROG = {1: "Eb", 2: "Cm7", 3: "Abmaj7", 4: "Bbsus", 5: "Eb", 6: "Cm7", 7: "Abmaj7", 8: "Eb/G", 9: "Ab"}


def chord_at(k, b):
    ch = PROG[k]
    if ch == "Bbsus" and b >= 2:
        return "Bb"
    if k == 9 and b >= 2:
        return "Bb"
    return ch


# ================================================================ BLOCK 2: the tune

# One eight-bar tune: phrase A asks (bars 1-4, ends on a question), phrase A' starts the same
# and answers it (bars 5-8, ends home on E-flat). (beat in bar, note, length in beats)
TUNE_A = {
    1: [(0, "Bb4", .5), (.5, "G5", .5), (1, "F5", 1.25)],                      # you-co-ded
    2: [(0, "Bb4", .5), (.5, "G5", .5), (1, "Bb5", 1.25)],                     # ...reaching higher
    3: [(0, "C6", .5), (.5, "Bb5", .5), (1, "Ab5", .5), (1.5, "G5", .5), (2, "Eb5", 1.0)],
    4: [(0, "F5", .5), (.5, "Eb5", .5), (1, "F5", .5), (1.5, "G5", .5), (2, "Ab5", 1.4)],
}
TUNE_A2 = {
    5: TUNE_A[1],
    6: TUNE_A[2],
    7: [(0, "C6", .5), (.5, "Bb5", .5), (1, "Ab5", .5), (1.5, "G5", .5), (2, "Ab5", .5), (2.5, "Bb5", 1.0),
        (3.5, "Ab5", .5)],
    8: [(0, "G5", 1.5), (1.5, "F5", .5), (2, "Eb5", 1.6)],                    # home
}
TUNE = {**TUNE_A, **TUNE_A2}

# The tune's own reply: in the gap after each of the first two "asks", the other piano answers
# with three notes (rising, then the signature upside down). Always the same two replies, in
# the same places in both phrases, so they are part of the tune, not decoration.
ANSWER = {
    1: [(2.5, "Eb5", .5), (3, "F5", .5), (3.5, "G5", .45)],
    2: [(2.5, "G5", .5), (3, "Bb4", .5), (3.5, "C5", .45)],
}
ANSWER[5], ANSWER[6] = ANSWER[1], ANSWER[2]

# Bar 9 (the ending block): a soft line under the last two chords, rising into the logo's chord
ENDING_LINE = [(0, "C5", 1.9), (2, "D5", 1.4)]


# ================================================================ BLOCK 3: the accompaniment

# One figure that never stops: eighth notes grouped 3+3+2 ("ONE-and . TWO-and . THREE-and"):
# the first note of each group accented and stepping through the chord, the second a lighter
# repeated note above it, the third left silent. The silences make it bounce; no drums needed.
FIGURE = {   # chord: (three stepping accent notes, the repeated upper note)
    "Eb": (["Eb3", "G3", "Bb3"], "Eb4"), "Cm7": (["C3", "Eb3", "G3"], "Bb3"),
    "Abmaj7": (["Ab2", "C3", "Eb3"], "G3"), "Bbsus": (["Bb2", "F3", "Eb3"], "Bb3"),
    "Bb": (["Bb2", "D3", "F3"], "Bb3"), "Eb/G": (["G2", "Bb2", "Eb3"], "G3"),
    "Ab": (["Ab2", "C3", "Eb3"], "Ab3"),
}


def figure(s, who, k, octave=0, vel=0.42, upto=4.0, accent_len=0.42, ghost_len=0.3):
    b0 = bar(k)
    # WHY darker when low: the low register is the bass; filtering its top keeps the recorded
    # key noise of low strings from poking out as a tick (measured at 13.1 s before this)
    tone = -0.6 if octave < 0 else None
    for g, start in enumerate((0.0, 1.5, 3.0)):
        if start >= upto - 1e-9:
            break
        acc, rep = FIGURE[chord_at(k, start)]
        s.piano(who, b0 + start, note(acc[g]) + 12 * octave, accent_len, vel, sd=0.005, tone=tone)
        if start + 0.5 < upto - 1e-9:
            s.piano(who, b0 + start + 0.5, note(rep) + 12 * octave, ghost_len, vel * 0.72, sd=0.005, tone=tone)


# Version 2's form of the same figure for the synth: sixteenths, still grouped 3+3+2 per half
# bar, walking four chord tones. None = silent step.
ARP = {
    "Eb": ["Eb3", "G3", "Bb3", "Eb4"], "Cm7": ["C3", "G3", "Bb3", "Eb4"],
    "Abmaj7": ["Ab2", "Eb3", "G3", "C4"], "Bbsus": ["Bb2", "F3", "Bb3", "Eb4"],
    "Bb": ["Bb2", "F3", "Bb3", "D4"], "Eb/G": ["G2", "Eb3", "G3", "Bb3"], "Ab": ["Ab2", "Eb3", "Ab3", "C4"],
}
ARP_STEPS = [0, 2, 1, 3, 2, 1, 3, None, 0, 2, 1, 3, 2, 1, 3, None]
ARP_ACC = {0, 3, 6, 8, 11, 14}


def arp_figure(s, k, level, upto=4.0):
    for st, idx in enumerate(ARP_STEPS):
        b = st * 0.25
        if idx is None or b >= upto - 1e-9:
            continue
        # the filter opens slowly over the whole piece (smooth growth, no swells)
        frac = min(1.0, (k - 1 + b / 4) / 8.0)
        cutoff = 600 * (2200 / 600) ** frac
        v = (0.5 if st in ARP_ACC else 0.36) * level
        s.arp(bar(k) + b, ARP[chord_at(k, b)][idx], v, cutoff, p=(-0.22 if st % 2 else 0.22))


# ================================================================ BLOCK 4: the bass

def bass_roots(s, who, k, vel=0.5):
    """A piano's lowest notes: the root on beat 1, held with the pedal (and the B-flat when a
    sus chord resolves). Version 1's only bass."""
    s.piano(who, bar(k), note(VOICES[PROG[k]]["bass"]), 1.6, vel, pedal=True, sd=0.003)
    if PROG[k] == "Bbsus":
        s.piano(who, bar(k) + 2, "Bb1", 1.6, vel * 0.95, pedal=True, sd=0.003)


def sub_line(s, k, vel=0.7):
    """Version 2: a round sub bass, the root on beat 1 and again pushed onto the 'and' of 3."""
    r = VOICES[PROG[k]]["bass"]
    r2 = "Bb1" if PROG[k] == "Bbsus" else r
    s.sub(bar(k), r, 2.3, vel)
    s.sub(bar(k) + 2.5, r2, 1.3, vel * 0.92)


# ================================================================ BLOCK 5: the ending

def ending(s, lead, low):
    """Bar 9: the figure keeps going, quieter, over A-flat then B-flat; the lead's soft line
    rises C to D; everything thins as the logo begins at 17.5 s (a breath, not a stop)."""
    b0 = bar(9)
    s.line(lead, b0, ENDING_LINE, 0.42, role="part", pedal=True)
    for i, nm in enumerate(["Ab2", "Eb3", "C4"]):
        s.piano(low, b0 + 0.03 * i, nm, 1.9, 0.32, pedal=True, sd=0.003)
    for i, nm in enumerate(["Bb2", "F3", "D4"]):
        s.piano(low, b0 + 2 + 0.03 * i, nm, 1.4, 0.28, pedal=True, sd=0.003)


# ================================================================ version 1: two pianos only

def version1():
    """Purely two pianos. Phrase A: piano 1 sings, piano 2 plays the bouncing figure in the
    middle and answers. Phrase A': they swap; piano 2 sings, piano 1 plays the same figure an
    octave lower (fuller, heavier) and answers. Bar 8 ends the tune with both in octaves."""
    s = Score(seed=11)
    for k in range(1, 5):
        s.line("piano1", bar(k), TUNE[k], 0.64)
        figure(s, "piano2", k, vel=0.40)
        bass_roots(s, "piano1", k)
        for b, nm, d in ANSWER.get(k, []):
            s.piano("piano2", bar(k) + b, nm, d, 0.46, sd=0.007)
    for k in range(5, 9):
        s.line("piano2", bar(k), TUNE[k], 0.62, late=0.004)
        # the same figure an octave down (fuller). WHY longer low accents: short damped low notes
        # read as thuds; letting each ring into the next keeps the bounce without a "kick" feel
        figure(s, "piano1", k, octave=-1, vel=0.46, accent_len=1.0)
        for b, nm, d in ANSWER.get(k, []):
            s.piano("piano1", bar(k) + b, nm, d, 0.44, sd=0.007)
    s.line("piano1", bar(8), TUNE[8], 0.5, role="double", octave=-1, late=0.006)
    figure(s, "piano1", 9, octave=-1, vel=0.34, upto=3.0, accent_len=1.0)
    ending(s, "piano2", "piano1")
    return s, dict(gains=dict(piano1=1.0, piano2=1.0), sends=dict(piano1=(0.24, 0.10), piano2=(0.16, 0.12)))


# ================================================================ version 2: + the arpeggio

def version2():
    """Three voices of equal weight. The synth plays the figure (as sixteenths) all the way
    through, a sub bass under it. Phrase A: piano 1 sings, piano 2 answers. Phrase A': the two
    pianos sing the tune as a round, piano 2 one beat behind and an octave lower, so each moves
    while the other holds. Bar 8 ends the tune with both pianos in octaves."""
    s = Score(seed=23)
    for k in range(1, 10):
        arp_figure(s, k, level=(0.8 if k == 1 else 1.0) * (0.8 if k == 9 else 1.0), upto=2.75 if k == 9 else 4.0)
    for k in range(1, 9):
        sub_line(s, k, vel=0.62 if k == 1 else 0.7)
    s.sub(bar(9), "Ab1", 1.9, 0.62)
    s.sub(bar(9) + 2, "Bb1", 1.4, 0.55)
    for k in range(1, 5):
        s.line("piano1", bar(k), TUNE[k], 0.64)
        bass_roots(s, "piano1", k, vel=0.30)
        for b, nm, d in ANSWER.get(k, []):
            s.piano("piano2", bar(k) + b, nm, d, 0.46, sd=0.007)
    # phrase A': the round. Its last note is cut at bar 8 so the ending bar is clean
    for k in range(5, 8):
        s.line("piano1", bar(k), TUNE[k], 0.64)
        for b, nm, d in TUNE[k]:
            start = bar(k) + b + 1
            d = min(d, bar(8) - start)
            if d > 0.1:
                s.piano("piano2", start, note(nm) - 12, d, 0.48, late=0.006)
    s.line("piano1", bar(8), TUNE[8], 0.66)
    s.line("piano2", bar(8), TUNE[8], 0.48, role="double", octave=-1, late=0.005)
    ending(s, "piano1", "piano2")
    return s, dict(gains=dict(piano1=1.0, piano2=1.0), sends=dict(piano1=(0.22, 0.10), piano2=(0.16, 0.12)),
                   synth=-7.0, bass=-10.0)


VERSIONS = {"pianos-1": version1, "pianos-2": version2}


# ================================================================ mix

def render(s, cfg):
    """Each bus: gentle glue compression, then level. Pianos at fixed gains (balance is in the
    playing); synth and bass set by loudness relative to the two pianos together, so the
    numbers in cfg mean "this many dB under the pianos". Shared hall + small room reverbs, and
    a quiet dotted-eighth echo on the synth only."""
    stems = {}
    for b in BUSES:
        x = s.bus[b].copy()
        if not np.abs(x).max() > 0:
            stems[b] = x
            continue
        if b.startswith("piano"):
            x = compress(x, -26, 1.6, 0.01, 0.2)
            x *= cfg["gains"][b]
        elif b == "synth":
            x = compress(x, -24, 1.5, 0.01, 0.15)
        else:
            x = sat(x * 1.2, 1.0)
        stems[b] = x
    pianos = stems["piano1"] + stems["piano2"]
    for b in ("synth", "bass"):
        if b in cfg and np.abs(stems[b]).max() > 0:
            # WHY a stored gain: the backing render (tune removed) must reuse the full render's
            # gains, or the tune measurement would compare two different mixes
            key = "_g_" + b
            if key not in cfg:
                cfg[key] = 10 ** ((lufs(pianos) + cfg[b] - lufs(stems[b])) / 20)
            stems[b] = stems[b] * cfg[key]
    hall_in = np.zeros((s.n, 2))
    room_in = np.zeros((s.n, 2))
    for b, (h, r) in cfg["sends"].items():
        hall_in += stems[b] * h
        room_in += stems[b] * r
    if "synth" in cfg:
        hall_in += stems["synth"] * 0.22
    dly = pingpong(stems["synth"], s.t(0.75), fb=0.3, n=4) * 0.08
    hall = convolve(butter(hall_in + dly * 0.5, "highpass", 180, 2), ir("hall"))
    hall = biquad(hall, "lp", 12000, 0.7) * 0.55
    room = convolve(room_in, ir("room")) * 0.4
    mix = sum(stems.values()) + hall + room + dly
    s.stems = stems
    # the music softens and clears as the logo begins (only a reverb tail under its first note)
    mix = _fade_region(mix, 17.25, 17.85)
    return fade(mix, fin=0.002, fout=0.0)


def build(name, cfg=None):
    """Render one version. Pass the cfg returned by the full render when rendering the backing."""
    s, c = VERSIONS[name]()
    if cfg is not None:
        c.update({k: v for k, v in cfg.items() if k.startswith("_g_")})
    return render(s, c), s, c
