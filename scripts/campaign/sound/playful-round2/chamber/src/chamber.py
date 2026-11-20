"""Two chamber versions of the 20-second playful piece (120 BPM, E-flat major).

"A small chamber group having fun", written as ONE song from separable building blocks (the
owner's rulings, RULES.md): one TUNE, one CHORDS progression, one steady ACCOMPANIMENT figure
that keeps going from the first beat to the ending, a LIFT for the second phrase, and an ENDING
that hands over to the logo. The two versions share the tune and the chords; they differ in the
accompaniment block and in who sings the tune the second time.

No drums or drum-like sounds, no stops with a flourish, no runs, sweeps, risers or high jingles,
no pumping: levels change only slowly across a phrase.

Notation: (beat, note, length in beats). One beat = 0.5 s; bar k starts at beat 4(k-1).
Bar 10's downbeat (beat 36 = 18.0 s) is where the logo's third note lands; build.py pastes the
logo file at 17.5 s, exactly as in the existing playful demo.
"""
import hashlib

import numpy as np

import arrange
import instruments as ins
import strings as st
from dsp import SR, biquad, butter, compress, convolve, fade, note, pan, place, sat
from master import lufs

LEN = 20.0
BPM = 120
LOGO_AT = 17.5
BUSES = ["piano", "pizz", "sing", "bowed", "sub"]   # sing = the tune (and its doublings) bowed

# "full" renders everything; "backing" leaves out the tune's notes (and their octave or unison
# doublings) so build.py can measure how far the tune stands above everything else.
MODE = "full"


def t(beat):
    return beat * 60.0 / BPM


# ============================================================ BLOCK 1: the tune
# Two four-bar phrases on the same start: the first asks and stays open (ends on D, over B-flat),
# the second climbs and leans home. Bar 9 is the ENDING block. Every phrase grows out of the
# signature B-flat, G, F ("you-co-ded"): bar 1 is the signature, bar 2 is the same shape a step
# higher (E-flat, high C, B-flat), bar 3 falls back (A-flat, G, E-flat, C), bar 4 hangs on D.
PHRASE_A = [
    (0, "Bb4", 1), (1, "G5", 1), (2, "F5", 1.5), (3.5, "Eb5", 0.5),          # bar 1: the signature
    (4, "Eb5", 1), (5, "C6", 1), (6, "Bb5", 1.5), (7.5, "G5", 0.5),          # bar 2: same shape, higher
    (8, "Ab5", 1.5), (9.5, "G5", 0.5), (10, "Eb5", 1), (11, "C5", 1),        # bar 3: falls back
    (12, "Eb5", 1.5), (13.5, "D5", 2.5),                                     # bar 4: hangs open
]
PHRASE_B_END = [                                                             # bars 7-8 of the 2nd phrase
    (24, "C6", 1), (25, "Bb5", 1), (26, "Ab5", 1.5), (27.5, "G5", 0.5),      # bar 7: from the top
    (28, "F5", 1.5), (29.5, "G5", 0.5), (30, "Ab5", 1), (31, "Bb5", 1),      # bar 8: climbs back up
]
TUNE = PHRASE_A + [(b + 16, n, d) for b, n, d in PHRASE_A[:8]] + PHRASE_B_END

# ============================================================ BLOCK 2: the chords
# One progression, played twice (bars 1-4, 5-8), then the ending's A-flat to B-flat sus.
# Brand chords E-flat, C minor 7, A-flat major 7; bar 4 turns to B-flat so the phrase leans
# forward into its repeat instead of stopping.
PROG4 = [(0, 4, "Eb"), (4, 4, "Cm7"), (8, 4, "Abmaj7"), (12, 2, "Bbsus"), (14, 2, "Bb7")]
CHORDS = PROG4 + [(b + 16, d, c) for b, d, c in PROG4] + [(32, 2, "Ab"), (34, 2, "Bbsus")]

# WHY the voicings avoid the tune's own notes where they can (no E-flat or G above middle C in the E-flat
# chord's plucks and rocking, no F and
# no middle B-flat in the B-flat sus, whose overtones land on F): an accompaniment note at the tune's pitch, or an octave below it, blurs the
# tune; measured, this was what made the tune's G and F the weakest notes.
# For each chord: the bass root, a plucked two-note "off-beat" voicing, the piano's rocking
# figure (root, fifth, tenth, fifth) and three bowed voices that move as little as possible,
# kept low (violas) so their overtones stay under the tune.
VOX = {
    "Eb":     dict(root="Eb2", sub="Eb2", off=["G3", "Bb3"], rock=["Eb3", "Bb3", "G3", "Bb3"], bow=["Eb3", "G3", "Bb3"]),
    "Cm7":    dict(root="C2", sub="C2", off=["G3", "Eb4"], rock=["C3", "G3", "Eb4", "G3"], bow=["Eb3", "G3", "Bb3"]),
    "Abmaj7": dict(root="Ab2", sub="Ab1", off=["Ab3", "C4"], rock=["Ab2", "Eb3", "C4", "Eb3"], bow=["Eb3", "Ab3", "C4"]),
    "Bbsus":  dict(root="Bb2", sub="Bb1", off=["Ab3", "Eb4"], rock=["Bb1", "Eb3", "Ab3", "Eb3"], bow=["Eb3", "Ab3", "Bb3"]),
    "Bb7":    dict(root="Bb2", sub="Bb1", off=["Ab3", "D4"], rock=["Bb2", "F3", "D4", "F3"], bow=["D3", "Ab3", "Bb3"]),
    "Ab":     dict(root="Ab2", sub="Ab1", off=["Ab3", "C4"], rock=["Ab2", "Eb3", "C4", "Eb3"], bow=["Eb3", "Ab3", "C4"]),
}


def chord_at(beat):
    for b, d, c in CHORDS:
        if b <= beat < b + d:
            return c, b
    return CHORDS[-1][2], CHORDS[-1][0]


# ============================================================ BLOCK 5: the ending (bar 9)
# The tune says C, B-flat, then holds F over B-flat sus; the accompaniment keeps its pattern
# through beat 33.5 and then everyone holds the chord, which fades as the logo begins (no stop
# and no flourish: the held chord simply gives way).
ENDING_TUNE = [(32, "C6", 1), (33, "Bb5", 1), (34, "F5", 1.5)]
ACCOMP_END = 34.0      # the accompaniment figure keeps going up to here


# ------------------------------------------------------------ the players

def _h(*key):
    """Deterministic humanising noise in [-1, 1] keyed by the note itself, so leaving the tune
    out for the measurement never shifts any other note's timing or loudness."""
    d = hashlib.sha1(repr(key).encode()).digest()
    u = int.from_bytes(d[:4], "little") / 2 ** 32
    v = int.from_bytes(d[4:8], "little") / 2 ** 32
    return (u + v) - 1.0          # sum of two uniforms: a soft bell, rarely at the extremes


class Score:
    def __init__(self, dyn):
        self.n = int(round(LEN * SR))
        self.bus = {b: np.zeros((self.n, 2)) for b in BUSES}
        self.melody = []      # (seconds, midi) of tune notes, for the measurement
        self.onsets = []      # seconds of every note start, for the transient check
        self.dyn = dyn        # slow phrase dynamics: [(beat, multiplier)], smooth by design

    def level(self, beat):
        b, g = zip(*self.dyn)
        return float(np.interp(beat, b, g))

    def _place(self, busname, x, beat, jit_ms, key, role, early=0.0):
        s = t(beat) + _h("t", key) * jit_ms / 1000.0
        if role == "lead":
            self.melody.append((s, int(key[-1])))
        if role in ("lead", "double") and MODE == "backing":
            return
        place(self.bus[busname], x, s - early)
        self.onsets.append(s)

    def vel(self, beat, v, key, sd=0.03):
        return float(np.clip(v * self.level(beat) + sd * _h("v", key), 0.05, 0.95))

    def piano(self, beat, name, beats, v, role="", pedal=True, tone=0.15, p=0.0, jit=4.0):
        m = note(name) if isinstance(name, str) else int(name)
        key = ("pno", beat, m)
        x = ins.felt_piano(m, self.vel(beat, v, key), t(beats), pedal=pedal, tone=tone)
        if p:
            x = x * np.array([1 - max(p, 0), 1 + min(p, 0)])
        self._place("piano", x, beat, jit, key, role)

    def pizz(self, sec, beat, name, v, role="", p=0.0, jit=7.0):
        m = note(name) if isinstance(name, str) else int(name)
        key = (sec, "pizz", beat, m)
        x = st.note(sec, "pizz", m, self.vel(beat, v, key), rr=int(abs(_h("rr", key)) * 7))
        if p:
            x = 0.5 * x + 0.5 * pan(x.mean(axis=1), p)
        self._place("pizz", x, beat, jit, key, role, early=st.PRE)   # main attack on the beat

    def bow(self, sec, beat, name, beats, v0, v1, role="", p=0.0, attack=0.15, release=0.3, jit=8.0,
            bus="bowed"):
        """A bowed note whose level moves in a straight line from v0 to v1 (scaled by the
        phrase dynamics): smooth by construction, no swell-and-dip inside the note."""
        m = note(name) if isinstance(name, str) else int(name)
        key = (sec, "bow", beat, m)
        a, b = v0 * self.level(beat), v1 * self.level(beat + beats)
        x = st.bowed(sec, m, t(beats), a, b, attack=attack, release=release,
                     rr=int(abs(_h("rr", key)) * 5))
        if p:
            x = 0.6 * x + 0.4 * pan(x.mean(axis=1), p)
        self._place(bus, x, beat, jit, key, role)

    def sub(self, beat, name, beats, v=0.6):
        m = note(name)
        self._place("sub", ins.sub(m, t(beats), v), beat, 0.0, ("sub", beat, m), "")


# ============================================================ BLOCK 3: accompaniment figures
# Each figure is one bar of rhythm that repeats unchanged from bar 1 to the ending, reading its
# pitches from whichever chord is sounding (so it follows BLOCK 2 automatically).

def accomp_pizz_bounce(sc, start=0.0, end=ACCOMP_END, vla=True):
    """Figure A, "pizzicato bounce": cellos pluck the root on 1 and on the 'and' of 2, the root
    an octave up on the 'and' of 3; violas pluck the off-beat two-note chord on every 'and'.
    The two parts interlock: the cellos lean on the beat, the violas answer between beats."""
    for bar0 in range(int(start), int(end), 4):
        for off, kind, v in ((0, "root", 0.66), (1.5, "root", 0.56), (2.5, "oct", 0.58)):
            b = bar0 + off
            if not (start <= b < end):
                continue
            c, _ = chord_at(b)
            m = note(VOX[c]["root"]) + (12 if kind == "oct" else 0)
            sc.pizz("vc", b, m, v, p=0.05)
        if not vla:
            continue
        for off in (0.5, 1.5, 2.5, 3.5):
            b = bar0 + off
            if not (start <= b < end):
                continue
            c, _ = chord_at(b)
            v = 0.46 if off in (1.5, 3.5) else 0.40
            for i, nm in enumerate(VOX[c]["off"]):
                sc.pizz("vla", b + 0.008 * i, nm, v, p=0.3)


def accomp_piano_rock(sc, start=0.0, end=ACCOMP_END, soft_from=99.0):
    """Figure B, "rocking piano": the piano's left hand in steady eighths (root, fifth, tenth,
    fifth), accented 3+3+2 (on 1, the 'and' of 2, and 4) so it skips instead of marching; the
    cellos pluck the root on 1 and the 'and' of 3 under it."""
    accents = {0: 0.40, 1.5: 0.37, 3.0: 0.37}
    for bar0 in range(int(start), int(end), 4):
        for s in range(8):
            off = s * 0.5
            b = bar0 + off
            if not (start <= b < end):
                continue
            c, _ = chord_at(b)
            m = VOX[c]["rock"][s % 4]
            # WHY softer once the strings have the tune: the piano steps back to accompanist so
            # the singing line sits clearly on top (a change made over a whole phrase, not a dip)
            v = accents.get(off, 0.28) * (0.68 if b >= soft_from else 1.0)
            sc.piano(b, m, 0.55, v, pedal=False, tone=-0.15, p=-0.15, jit=5.0)
        for off, v in ((0, 0.64), (2.5, 0.52)):
            b = bar0 + off
            if start <= b < end:
                c, _ = chord_at(b)
                sc.pizz("vc", b, VOX[c]["root"], v, p=0.05)


def piano_lh_chords(sc, start=0.0, end=ACCOMP_END, v=0.3):
    """Soft held left-hand chords at each chord change (warmth under figure A)."""
    for b, d, c in CHORDS:
        if start <= b < end:
            for i, nm in enumerate(VOX[c]["rock"][:3]):
                sc.piano(b + 0.012 * i, nm, d - 0.1, v * (1.0 if i == 0 else 0.8), pedal=False, tone=-0.2, p=-0.1)


def sub_line(sc, start=0.0, end=36.0, v=0.55):
    """A soft held sub note on every chord's root: weight only, steady level, never pumping."""
    for b, d, c in CHORDS:
        if start <= b < end:
            sc.sub(b, VOX[c]["sub"], d - 0.05 if b < 34 else 1.4, v)


# ============================================================ BLOCK 4: the lift
def lift_bowed(sc, start=16.0, end=36.0, v_start=0.16, v_end=0.36, fade_end=0.18):
    """Long bowed strings under the second phrase: three voices that move as little as possible
    from chord to chord (a held note simply continues across a chord change, no re-bowing).
    Their level rises in one straight line across the whole phrase, then eases off in the
    ending. A lift by orchestration, never by a riser or a quick swell."""
    spans = [(b, d, c) for b, d, c in CHORDS if start <= b < end]
    for voice in range(3):
        notes = []
        for b, d, c in spans:
            nm = VOX[c]["bow"][voice]
            if notes and notes[-1][1] == nm:
                notes[-1][2] += d            # same note: keep the bow going
            else:
                notes.append([b, nm, d])
        for b, nm, d in notes:
            last = b + d >= 36
            lv = lambda x: v_start + (v_end - v_start) * np.clip((x - start) / (32 - start), 0, 1)  # noqa: E731
            v0, v1 = lv(b), (fade_end if last else lv(b + d))
            if b >= 32:
                v0 = lv(32)
            sec = "vla" if note(nm) < note("D4") else "vln"
            sc.bow(sec, b, nm, d + 0.15, v0, v1, p=(-0.35, 0.35, 0.0)[voice], attack=0.35, release=0.4)


# ------------------------------------------------------------ tune players
def tune_piano(sc, line, v=0.6, tone=0.25, role="lead"):
    for b, nm, d in line:
        sc.piano(b, nm, d, v, role=role, tone=tone)


def tune_bowed(sc, sec, line, v_line=0.6, octave=0, role="lead", p=0.0):
    """The tune sung legato: each note bowed a little past the next one's start, level steady."""
    for b, nm, d in line:
        m = note(nm) + 12 * octave
        # WHY dig in on short notes: a quick bowed note needs a firmer bow to speak as clearly
        # as a long one (measured: the eighth notes were the weakest of the sung tune)
        v = v_line * (1.15 if d <= 0.5 else 1.0)
        sc.bow(sec, b, m, d + 0.12, v * 0.95, v, role=role, p=p, attack=0.04 if d <= 0.5 else 0.08,
               release=0.22, bus="sing")


def tune_pizz(sc, sec, line, v=0.55, role="double", p=0.0):
    for b, nm, d in line:
        sc.pizz(sec, b, nm, v, role=role, p=p)


# ======================================================================= the versions

def v1():
    """chamber-1, "Pizzicato bounce" (lighter, more staccato): the piano plays the tune over a
    plucked cello-and-viola bounce that never stops; in the second phrase the plucked violins
    join the piano on the tune, note for note, and long bowed strings rise underneath."""
    sc = Score([(0, 0.93), (14, 0.95), (18, 1.0), (31, 1.05), (34, 0.97), (40, 0.95)])
    # WHY a brighter touch (tone 0.5) than chamber-2: this is the light, sparkling one, and with
    # no bowed tune it otherwise measured darker than the brand's "real air" range
    tune_piano(sc, PHRASE_A, tone=0.5)                            # phrase 1: piano
    tune_piano(sc, TUNE[len(PHRASE_A):] + ENDING_TUNE, v=0.62, tone=0.5)   # phrase 2 + ending: piano...
    tune_pizz(sc, "vln", TUNE[len(PHRASE_A):] + ENDING_TUNE[:2], v=0.5, p=-0.3)  # ...+ plucked violins
    accomp_pizz_bounce(sc)
    piano_lh_chords(sc, v=0.26)
    sub_line(sc, v=0.5)
    lift_bowed(sc, start=8.0, end=16.0, v_start=0.08, v_end=0.12)  # a breath of bowed strings from bar 3
    lift_bowed(sc, start=16.0, v_start=0.14, v_end=0.32)
    sc.piano(34, "Bb1", 1.5, 0.34, tone=-0.2)                     # ending: held B-flat sus chord
    # (no F in the held chord: the tune's held F on top is the only F, so it sings through)
    sc.piano(34.012, "Eb3", 1.5, 0.3, tone=-0.2)
    sc.piano(34.024, "Ab3", 1.5, 0.28, tone=-0.2)
    sc.pizz("vc", 34, "Bb2", 0.6)
    return sc, dict(pizz=-21.5, bowed=-25.0, sub=-25.5)


def v2():
    """chamber-2, "Rocking piano, singing strings" (warmer, more lyrical): the piano plays the
    tune over its own rocking left hand; in the second phrase the tune passes to the bowed
    violins with the cellos an octave below, while the piano keeps rocking underneath and the
    violas join with the off-beat plucks."""
    sc = Score([(0, 0.93), (14, 0.95), (18, 1.0), (31, 1.05), (34, 0.97), (40, 0.95)])
    tune_piano(sc, PHRASE_A)                                      # phrase 1: piano
    second = TUNE[len(PHRASE_A):] + ENDING_TUNE
    # phrase 2: a solo violin sings it (a single player speaks quicker and clearer than a
    # section, measured: the section's soft bow starts left short notes under the piano),
    # the violin section doubles it quietly for body, the cellos an octave below for warmth
    tune_bowed(sc, "solo", second, v_line=0.62, p=-0.1)
    tune_bowed(sc, "vln", second, v_line=0.42, role="double", p=-0.3)
    tune_bowed(sc, "vc", second, v_line=0.5, octave=-1, role="double", p=0.25)
    accomp_piano_rock(sc, soft_from=16.0)
    # ENDING block: the piano joins the strings on the last three tune notes (everyone together)
    tune_piano(sc, ENDING_TUNE, v=0.5, role="double")
    # the violas' off-beat plucks join for the second phrase (the arrangement grows)
    for bar0 in range(16, 34, 4):
        for off in (0.5, 1.5, 2.5, 3.5):
            b = bar0 + off
            if b < ACCOMP_END:
                c, _ = chord_at(b)
                for i, nm in enumerate(VOX[c]["off"]):
                    sc.pizz("vla", b + 0.008 * i, nm, 0.4 if off in (0.5, 2.5) else 0.45, p=0.35)
    sub_line(sc, v=0.5)
    # a quiet bowed bed from bar 3, then the full lift under phrase 2
    lift_bowed(sc, start=8.0, end=16.0, v_start=0.10, v_end=0.14)
    lift_bowed(sc, start=16.0, v_start=0.14, v_end=0.22)
    for i, nm in enumerate(["Bb1", "Eb3", "Ab3"]):                # ending: held B-flat sus, no F under the tune's F
        sc.piano(34 + 0.012 * i, nm, 1.5, 0.34 if i == 0 else 0.28, tone=-0.2)
    sc.pizz("vc", 34, "Bb2", 0.6)
    return sc, dict(pizz=-24.5, sing=-18.0, bowed=-28.0, sub=-28.0)


VERSIONS = {"chamber-1": v1, "chamber-2": v2}


# ======================================================================= mix

HALL = dict(piano=0.22, pizz=0.30, sing=0.28, bowed=0.32, sub=0.0)
ROOM = dict(piano=0.10, pizz=0.10, sing=0.06, bowed=0.04, sub=0.0)


def render(sc, targets, piano_target=-19.0, gains=None):
    """Bus levels are set by measured loudness (LUFS per bus), chosen on the FULL render and then
    reused unchanged for the backing render (`gains`), so the tune-margin measurement compares
    like with like. Gentle bus compression only (no sidechain, no pumping)."""
    stems = {}
    for b in BUSES:
        x = sc.bus[b].copy()
        if np.abs(x).max() > 0:
            if b == "piano":
                x = compress(x, -26, 1.6, 0.01, 0.2)
            elif b == "sub":
                x = sat(x * 1.2, 1.0)
            else:
                x = compress(x, -24, 1.4, 0.02, 0.25)
        stems[b] = x
    if gains is None:
        gains = {}
        for b in BUSES:
            tgt = piano_target if b == "piano" else targets.get(b)
            ok = tgt is not None and np.abs(stems[b]).max() > 0
            gains[b] = 10 ** ((tgt - lufs(stems[b])) / 20) if ok else 0.0
    for b in BUSES:
        stems[b] = stems[b] * gains[b]
    hall_in = sum(stems[b] * HALL[b] for b in BUSES)
    room_in = sum(stems[b] * ROOM[b] for b in BUSES)
    hall = convolve(butter(hall_in, "highpass", 180, 2), arrange.ir("hall"))
    hall = biquad(hall, "lp", 12000, 0.7) * 0.55
    room = convolve(room_in, arrange.ir("room")) * 0.4
    mix = (sum(stems.values()) + hall[: sc.n] + room[: sc.n])[: sc.n]
    # the music gives way as the logo begins: equal-power fade 17.25 -> 17.85 s (as in the
    # existing playful demo), so only a short tail sits under the logo's first note
    tt = np.arange(len(mix)) / SR
    g = np.clip((17.85 - tt) / 0.6, 0, 1)
    mix = mix * (np.sin(0.5 * np.pi * g) ** 2)[:, None]
    sc.stems = stems
    return fade(mix, fin=0.002), gains
