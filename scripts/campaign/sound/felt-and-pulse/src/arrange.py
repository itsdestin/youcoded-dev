"""The score: the motif, the logo and the three demo arrangements.

Everything is in E-flat major. The motif is one shared constant; every piece reads its notes
from here, so the melody is the same notes everywhere by construction (and build.py measures
that it is audible in every file).
"""
import numpy as np

import instruments as ins
from dsp import (SR, biquad, butter, compress, convolve, fade, make_ir, note, pan, pingpong,
                 place, sat, to_stereo)

# ------------------------------------------------------------------ the idea
# Beats are quarter notes. "A" is the ask (the piano, a person); "ECHO" is the machine
# repeating it back an octave up on the glass pluck; "B" is the reply that lifts and lands.
MOTIF_A = [(0.0, "Bb4", 1.0), (1.0, "G5", 1.0), (2.0, "F5", 2.0)]
MOTIF_ECHO = [(5.0, "Bb5", 0.5), (5.5, "G6", 0.5), (6.0, "F6", 1.5)]
MOTIF_B = [(8.0, "Bb4", 1.0), (9.0, "G5", 1.0), (10.0, "Bb5", 1.5), (11.5, "Ab5", 0.5), (12.0, "G5", 4.0)]
MOTIF_CHORDS = [(0, "Eb"), (4, "Cm7"), (8, "Abmaj7"), (12, "Eb")]

# The sonic logo is the "A" cell said quickly (eighths at 120 BPM): you - co - ded.
LOGO_CELL = [(0.0, "Bb4"), (0.25, "G5"), (0.5, "F5")]
LOGO_LEN = 2.5        # seconds
LOGO_LAND = 0.5       # the third note lands here; place logos so this hits a downbeat

VOICES = {
    "Eb":     dict(bass="Eb2", lh=["Eb3", "Bb3", "G4"], pad=["Eb3", "Bb3", "F4", "G4"]),
    "Eb/G":   dict(bass="G1", lh=["G2", "Eb3", "Bb3"], pad=["G3", "Bb3", "Eb4", "Bb4"]),
    "Cm7":    dict(bass="C2", lh=["C3", "G3", "Eb4"], pad=["C3", "G3", "Bb3", "Eb4"]),
    "Abmaj7": dict(bass="Ab1", lh=["Ab2", "Eb3", "C4"], pad=["Ab2", "Eb3", "G3", "C4"]),
    "Ab":     dict(bass="Ab1", lh=["Ab2", "Eb3", "C4"], pad=["Ab2", "Eb3", "Bb3", "C4"]),
    "Bbsus":  dict(bass="Bb1", lh=["Bb2", "F3", "Eb4"], pad=["Bb2", "F3", "Bb3", "Eb4"]),
    # logo bloom: no F and no B-flat in the pad, so the piano's landing F is the add-9 on top
    "Eb open": dict(bass="Eb2", lh=["Eb2", "Bb2", "G3"], pad=["Eb3", "G3", "Eb4", "G4"]),
    "Bb":     dict(bass="Bb1", lh=["Bb2", "F3", "D4"], pad=["Bb2", "F3", "Bb3", "D4"]),
}

_IRS = {}

# "full" renders normally. "backing" leaves out the motif notes only, so build.py can measure
# how clearly the motif stands out (full minus backing = the motif as heard in the mix).
MODE = "full"


def ir(name):
    if name not in _IRS:
        if name == "hall":
            # WHY width 0.75: a fully decorrelated tail loses too much in mono; 0.75 keeps
            # it wide on headphones while a phone speaker still hears the room
            _IRS[name] = make_ir(3.4, rt=(2.2, 2.7, 1.8, 1.0), predelay=0.022, seed=3, width=0.75)
        else:
            _IRS[name] = make_ir(0.8, rt=(0.4, 0.5, 0.35, 0.25), predelay=0.004, seed=5, width=0.6)
    return _IRS[name]


# ------------------------------------------------------------------ mixer

BUSES = ["piano", "pluck", "pad", "pulse", "bass", "kick", "perc", "fx"]

DEFAULT = dict(
    gain=dict(piano=1.0, pluck=0.32, pad=0.30, pulse=0.20, bass=0.30, kick=0.40, perc=0.55, fx=0.6),
    hall=dict(piano=0.22, pluck=0.40, pad=0.30, pulse=0.18, bass=0.0, kick=0.0, perc=0.10, fx=0.35),
    room=dict(piano=0.10, pluck=0.0, pad=0.0, pulse=0.0, bass=0.0, kick=0.10, perc=0.25, fx=0.0),
    delay=dict(pluck=0.45, piano=0.0),
    duck=dict(pad=0.35, pulse=0.0, bass=0.45, piano=0.0),
    hall_return=0.55, room_return=0.4,
)


class Piece:
    def __init__(self, bpm, length):
        self.bpm = bpm
        self.length = length
        self.n = int(round(length * SR))
        self.bus = {b: np.zeros((self.n, 2)) for b in BUSES}
        self.melody = []       # (seconds, midi) of motif notes, for the measurement check
        self.kicks = []
        self.pulse_hits = []

    def t(self, beat):
        return beat * 60.0 / self.bpm

    # --- players
    def piano(self, beat, name, beats, vel=0.6, pedal=True, motif=False, tone=0.0, pan_=0.0):
        m = note(name)
        x = ins.felt_piano(m, vel, self.t(beats), pedal=pedal, tone=tone)
        if pan_:
            x = x * np.array([1 - max(pan_, 0), 1 + min(pan_, 0)])
        if not (motif and MODE == "backing"):
            place(self.bus["piano"], x, self.t(beat))
        if motif is True:  # "double" = an octave doubling of the motif: muted in backing, not logged
            self.melody.append((self.t(beat), m))

    def phrase(self, notes, at, octave=0, vel=0.6, motif=True, double=None, tone=0.0, stretch=1.0):
        for b, name, d in notes:
            m = note(name) + 12 * octave
            self.piano(at + b * stretch, m, d * stretch, vel, motif=motif, tone=tone)
            if double is not None:
                self.piano(at + b * stretch, m + 12 * double, d * stretch, vel * 0.7, tone=tone,
                           motif="double" if motif else False)

    def lh(self, beat, chord, beats, vel=0.35, style="block"):
        v = VOICES[chord]["lh"]
        if style == "block":
            for i, nm in enumerate(v):
                self.piano(beat + 0.02 * i, nm, beats, vel * (0.9 if i else 1.0))
        elif style == "broken":
            for i, nm in enumerate(v):
                self.piano(beat + i * 0.5, nm, beats - i * 0.5, vel * (1.0 if i == 0 else 0.8))

    def pluck(self, beat, name, vel=0.5, decay=0.35, motif=False, octave=0, p=0.0):
        m = note(name) + 12 * octave
        x = ins.pluck(m, vel, decay)
        if not (motif and MODE == "backing"):
            place(self.bus["pluck"], pan(x, p), self.t(beat))
        if motif:
            self.melody.append((self.t(beat), m))

    def pad(self, beat, chord, beats, vel=0.5, cutoff=1800, attack=0.9, release=1.6, bus="pad", seed=0,
            air=True):
        x = ins.pad([note(nm) for nm in VOICES[chord]["pad"]], self.t(beats), vel, cutoff,
                    attack, release, seed=seed, air=air)
        place(self.bus[bus], x, self.t(beat))

    def pulse(self, beat, chord, beats, vel=0.5, cutoff=2600, every=0.5, seed=0):
        """The pulse: a brighter pad cut into soft eighth-note breaths by a sidechain."""
        self.pad(beat, chord, beats, vel, cutoff, attack=0.05, release=0.4, bus="pulse", seed=seed + 50)
        k = beat
        while k < beat + beats - 1e-6:
            self.pulse_hits.append(self.t(k))
            k += every

    def bass(self, beat, chord_or_note, beats, vel=0.8):
        nm = VOICES[chord_or_note]["bass"] if chord_or_note in VOICES else chord_or_note
        place(self.bus["bass"], ins.sub(note(nm), self.t(beats), vel), self.t(beat))

    def kick(self, beat, vel=0.9):
        place(self.bus["kick"], ins.kick(vel), self.t(beat))
        self.kicks.append(self.t(beat))

    def snap(self, beat, vel=0.6):
        place(self.bus["perc"], ins.snap(vel, seed=int(beat * 4)), self.t(beat))

    def hat(self, beat, vel=0.4, open_=False, p=0.25):
        place(self.bus["perc"], pan(ins.hat(vel, open_, seed=int(beat * 4) % 7), p), self.t(beat))

    def shaker(self, beat, vel=0.3, p=-0.3):
        place(self.bus["perc"], pan(ins.shaker(vel, seed=int(beat * 8) % 13), p), self.t(beat))

    def swell(self, end_beat, beats, vel=0.3):
        d = self.t(beats)
        place(self.bus["fx"], ins.swell(d, vel=vel, seed=int(end_beat)), self.t(end_beat) - d)

    # --- mix
    def render(self, cfg=None, end_fade=0.05):
        c = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULT.items()}
        for k, v in (cfg or {}).items():
            if isinstance(v, dict):
                c[k].update(v)
            else:
                c[k] = v
        n = self.n
        duck = ins.duck_env(n, self.kicks, depth=1.0, recover=0.12) if self.kicks else np.ones(n)
        stems = {}
        for b in BUSES:
            x = self.bus[b].copy()
            if b == "pulse" and self.pulse_hits:
                x *= ins.duck_env(n, self.pulse_hits, depth=0.8, recover=0.09)[:, None]
            dk = c["duck"].get(b, 0.0)
            if dk:
                x *= (1 - dk * (1 - duck))[:, None]
            if b == "piano":
                x = compress(x, -26, 1.6, 0.01, 0.2)
            if b == "bass":
                x = sat(x * 1.2, 1.0)
            stems[b] = x * c["gain"][b]
        hall_in = sum(stems[b] * c["hall"].get(b, 0) for b in BUSES)
        room_in = sum(stems[b] * c["room"].get(b, 0) for b in BUSES)
        dly = np.zeros((n, 2))
        for b, amt in c["delay"].items():
            if amt:
                dly += pingpong(stems[b], self.t(0.75), fb=0.42, n=6) * amt
        hall_in = hall_in + dly * 0.5
        hall = convolve(butter(hall_in, "highpass", 180, 2), ir("hall"))
        hall = biquad(hall, "lp", 12000, 0.7) * c["hall_return"]
        room = convolve(room_in, ir("room")) * c["room_return"]
        mix = sum(stems.values()) + hall + room + dly
        self.stems = stems
        return fade(mix, fin=0.002, fout=end_fade)


# ------------------------------------------------------------------ logo

def logo():
    """you - co - ded: the A cell on felt piano, landing on an open E-flat (add 9) bloom with a
    soft sub, while the glass pluck answers the cell an octave up: the person asks, the
    machine does it. Fixed audio; every demo pastes this exact file."""
    p = Piece(120, LOGO_LEN)
    for i, (t, nm) in enumerate(LOGO_CELL):
        v = (0.5, 0.56, 0.72)[i]
        # WHY 0.5 beats: each note is damped as the next arrives, so the landing F rings alone
        p.piano(t * 2, nm, 0.5 if i < 2 else 3.0, v, motif=True)
    land = LOGO_LAND * 2  # in beats
    # low and open under the landing note so the F on top is the thing you hear
    p.piano(land, "Eb2", 3.0, 0.40)
    p.piano(land + 0.03, "Eb3", 3.0, 0.32)
    p.pad(land - 0.15, "Eb open", 3.0, 0.55, cutoff=2400, attack=0.12, release=0.8)
    place(p.bus["bass"], ins.thump(note("Eb2"), 0.9), p.t(land))
    # the machine's answer: the same three notes, an octave up, quick and glassy
    for k, (t, nm) in enumerate(LOGO_CELL):
        p.pluck(land + 0.5 + k * 0.25, nm, 0.42 - 0.06 * k, decay=0.5, octave=1, p=(-0.35, 0.35, 0.0)[k])
    p.swell(land, 0.9, vel=0.18)
    mix = p.render(dict(gain=dict(piano=1.0, pluck=0.45, pad=0.32, bass=0.42, fx=0.5),
                        hall=dict(piano=0.30, pluck=0.5, pad=0.35)),
                   end_fade=0.0)
    # end cleanly: the bloom fades on an equal-power curve over the last 0.9 s
    t = np.arange(len(mix)) / SR
    tail = np.clip((LOGO_LEN - t) / 0.9, 0, 1)
    mix *= (np.sin(0.5 * np.pi * tail) ** 2)[:, None]
    return mix, p


# ------------------------------------------------------------------ motif

def motif_piece():
    """About 8 s: the idea alone (4 bars at 120). Piano asks, pluck echoes, piano answers."""
    p = Piece(120, 8.6)
    p.phrase(MOTIF_A, 0, vel=0.6, tone=0.3)
    p.phrase(MOTIF_B, 0, vel=0.6, tone=0.3)
    for b, nm, d in MOTIF_ECHO:
        p.pluck(b, nm, 0.45, decay=0.4, motif=True, p=(-0.3 if nm == "G6" else 0.3))
    for b, ch in MOTIF_CHORDS:
        p.lh(b, ch, 4 if b < 12 else 5, 0.3, style="block")
        # WHY extra air: the motif has no hats, so the pad's breath is what carries the top end
        p.pad(b, ch, 4 if b < 12 else 4.5, 0.32, cutoff=1500, attack=0.6, seed=b, air=0.06)
        p.bass(b, ch, 3.5 if b < 12 else 4.2, 0.55)
    return p.render(dict(gain=dict(pad=0.34, bass=0.26)), end_fade=1.0), p


# ------------------------------------------------------------------ demos

def hopeful():
    """30 s, 80 BPM, narrated film. Solo felt piano opens with plenty of room for a voice; the
    machine joins (sub, pulse, heartbeat kick) and lifts it; one breath; the logo resolves."""
    bpm = 80
    p = Piece(bpm, 30.0)
    bar = lambda k: 4 * (k - 1)  # noqa: E731
    # bars 1-4: the motif, sparse (voice sits here)
    p.phrase(MOTIF_A, bar(1), vel=0.55)
    p.lh(bar(1), "Eb", 4, 0.28, "broken")
    p.pad(bar(1) + 1, "Eb", 7, 0.22, cutoff=1100, attack=2.5)
    for b, nm, d in MOTIF_ECHO:
        p.pluck(b, nm, 0.38, decay=0.45, motif=True, p=(-0.3 if nm == "G6" else 0.3))
    p.lh(bar(2), "Cm7", 4, 0.26, "broken")
    p.phrase(MOTIF_B, 0, vel=0.58)
    p.lh(bar(3), "Abmaj7", 4, 0.28, "broken")
    p.pad(bar(3), "Abmaj7", 4, 0.26, cutoff=1300, attack=1.5, seed=3)
    p.bass(bar(3), "Abmaj7", 3.8, 0.55)
    p.lh(bar(4), "Eb/G", 4, 0.28, "broken")
    p.pad(bar(4), "Eb/G", 4, 0.28, cutoff=1500, attack=1.0, seed=4)
    p.bass(bar(4), "Eb/G", 3.8, 0.6)
    p.pulse(bar(4) + 2, "Eb/G", 2, 0.25, cutoff=1800)
    p.swell(bar(5), 2.5, 0.16)
    # bars 5-8: lift. The machine carries it: heartbeat kick, pulse, sub, pluck lines.
    prog = [(5, "Ab"), (6, "Bbsus"), (7, "Cm7"), (8, "Abmaj7")]
    for k, ch in prog:
        b0 = bar(k)
        p.pad(b0, ch, 4, 0.34, cutoff=2000 + 300 * (k - 5), attack=0.6, seed=k)
        p.pulse(b0, ch, 4, 0.30 + 0.04 * (k - 5), cutoff=2600)
        p.bass(b0, ch, 3.85, 0.75)
        p.lh(b0, ch, 4, 0.30, "block")
        p.kick(b0, 0.8)
        p.kick(b0 + 2, 0.7)
        for s in range(16):
            p.shaker(b0 + s * 0.25, 0.10 + (0.06 if s % 2 else 0), p=-0.35)
        if k >= 7:
            p.snap(b0 + 1, 0.35)
            p.snap(b0 + 3, 0.35)
            for e in range(8):
                p.hat(b0 + e * 0.5 + 0.5 * (e % 2 == 0) * 0, 0.12 if e % 2 == 0 else 0.2)
    # bar 6: Bb sus -> Bb release on beat 3
    p.pad(bar(6) + 2, "Bb", 2, 0.22, cutoff=2300, attack=0.3, seed=60)
    # the motif again, an octave up with the low octave doubled (warmth, not pomp)
    p.phrase(MOTIF_A, bar(5), octave=0, vel=0.66, double=1)
    for i, nm in enumerate(["Eb5", "F5", "Bb5", "Eb6", "F6", "Bb5", "F5", "Eb5"]):
        p.pluck(bar(6) + i * 0.5, nm, 0.32, decay=0.3, p=(-0.4 if i % 2 else 0.4))
    p.phrase([(b - 8, nm, d) for b, nm, d in MOTIF_B], bar(7), vel=0.7, double=1)
    p.swell(bar(7), 2, 0.2)
    # bar 9: breathe on B-flat sus, everything thins out, then silence before the logo
    p.pad(bar(9), "Bbsus", 3.0, 0.3, cutoff=1600, attack=0.3, release=0.9, seed=9)
    p.lh(bar(9), "Bbsus", 3.0, 0.3, "block")
    p.piano(bar(9), "F5", 3.0, 0.45)
    p.piano(bar(9) + 1, "Bb5", 2.0, 0.4)
    p.bass(bar(9), "Bbsus", 2.6, 0.55)
    mix = p.render(dict(gain=dict(pad=0.28, pulse=0.22, kick=0.28, bass=0.19)), end_fade=0.0)
    # WHY a volume ride: the opening sits ~4 dB under the lift so the build is felt and a
    # narrator has room; it rises over bars 3-5
    t = np.arange(len(mix)) / SR
    ride = np.interp(t, [0, p.t(bar(3)), p.t(bar(5)), 99], [-4.0, -3.0, 0.0, 0.0])
    mix *= (10 ** (ride / 20))[:, None]
    # deliberate silence: bed fades out ahead of the logo pickup (27.5 s)
    mix = _fade_region(mix, 26.4, 27.6)
    return mix, p, 27.5


def playful():
    """20 s, 120 BPM, cut on the beat. Same motif, bouncing: kick, snap, 16th hats, octave sub,
    the pluck running arpeggios. A mischievous stop in bar 7. Logo lands on bar 10's downbeat."""
    p = Piece(120, 20.0)
    bar = lambda k: 4 * (k - 1)  # noqa: E731
    prog = ["Eb", "Cm7", "Abmaj7", "Eb", "Eb", "Cm7", "Abmaj7", "Eb/G", "Ab"]

    def groove(k, full=True, stop_at=None):
        b0 = bar(k)
        for s in range(16):
            beat = b0 + s * 0.25
            if stop_at is not None and beat >= b0 + stop_at:
                break
            if s % 2 == 0 or full:
                acc = 0.3 if s % 4 == 2 else (0.16 if s % 2 == 0 else 0.1)
                p.hat(beat, acc, p=0.3)
            if full and s % 4 == 3:
                p.shaker(beat, 0.18)
        if not full:
            return
        for b in (0, 1.5, 2.5):
            if stop_at is None or b < stop_at:
                p.kick(b0 + b, 0.95 if b == 0 else 0.8)
        for b in (1, 3):
            if stop_at is None or b < stop_at:
                p.snap(b0 + b, 0.6)

    def bassline(k, ch):
        b0 = bar(k)
        root = VOICES[ch]["bass"]
        up = note(root) + 12
        for b, nm, d in [(0, root, 0.7), (0.75, root, 0.4), (1.5, up, 0.4), (2.5, root, 0.7), (3.25, root, 0.25), (3.5, up, 0.4)]:
            place(p.bus["bass"], ins.sub(note(nm) if isinstance(nm, str) else nm, p.t(d), 0.8), p.t(b0 + b))

    for k, ch in enumerate(prog, start=1):
        b0 = bar(k)
        p.pulse(b0, ch, 4, 0.30 if k > 2 else 0.2, cutoff=1500 + 250 * min(k, 6), every=0.5, seed=k)
        if k >= 2:
            bassline(k, ch) if k != 7 else None
        p.lh(b0, ch, 0.9, 0.3, "block")
        p.lh(b0 + 1.5, ch, 0.4, 0.22, "block")
    p.pad(bar(1), "Eb", 8, 0.18, cutoff=900, attack=3.0)
    groove(1, full=False)
    for k in range(2, 10):
        if k == 7:
            groove(k, True, stop_at=2)
        elif k == 9:
            groove(k, True, stop_at=3.5)
        else:
            groove(k, True)
    # motif 1st time (bars 1-4), 2nd time an octave up with pluck running underneath (5-8)
    p.phrase(MOTIF_A, bar(1), vel=0.62, tone=0.3)
    for b, nm, d in MOTIF_ECHO:
        p.pluck(b, nm, 0.5, decay=0.3, motif=True, p=(-0.3 if nm == "G6" else 0.3))
    p.phrase(MOTIF_B, 0, vel=0.65, tone=0.3)
    p.phrase(MOTIF_A, bar(5), octave=1, vel=0.68, tone=0.2, double=-1)
    arp = {"Eb": ["Eb5", "Bb5", "F5", "G5"], "Cm7": ["C5", "G5", "Eb5", "Bb5"],
           "Abmaj7": ["Ab4", "Eb5", "C5", "G5"], "Eb/G": ["G4", "Eb5", "Bb4", "F5"], "Ab": ["Ab4", "Eb5", "C5", "Bb4"]}
    for k in (5, 6, 8):
        ch = prog[k - 1]
        for s in range(16):
            p.pluck(bar(k) + s * 0.25, arp[ch][s % 4], 0.15 + 0.06 * (s % 4 == 0), decay=0.14,
                    p=(-0.5 if s % 2 else 0.5))
    # bar 7: the mischief. Two beats of groove, then a dead stop; the pluck answers alone.
    p.phrase([(b - 8, nm, d) for b, nm, d in MOTIF_B[:2]], bar(7), vel=0.62)
    for i, nm in enumerate(["Bb5", "Ab5"]):
        p.pluck(bar(7) + 2.5 + i * 0.75, nm, 0.55, decay=0.25, motif=True, p=(0.4, -0.4)[i])
    p.swell(bar(8), 1.0, 0.25)
    p.phrase([(0, "G5", 4.0)], bar(8), vel=0.72, tone=0.3)
    p.piano(bar(8) + 2, "Bb5", 1.0, 0.5)
    p.piano(bar(8) + 3, "Ab5", 1.0, 0.5)
    # bar 9: turnaround on Ab -> Bb, final snap fill, then the logo pickup at beat 4
    p.phrase([(0, "C6", 1.0), (1, "Bb5", 1.0), (2, "Ab5", 1.0)], bar(9), vel=0.58, motif=False)
    for s in (2.75, 3.0, 3.25):
        p.snap(bar(9) + s, 0.35 + 0.1 * (s - 2.75))
    place(p.bus["bass"], ins.sub(note("Bb1"), p.t(1.4), 0.8), p.t(bar(9) + 2))
    mix = p.render(dict(gain=dict(pulse=0.26, kick=0.46, perc=0.6, pluck=0.3)), end_fade=0.0)
    mix = _fade_region(mix, 17.25, 17.85)
    return mix, p, 17.5


def stark():
    """12 s. Deadpan: one dry felt note ticking on the beat, nearly mono, nothing else. At 7 s
    it turns bright: the motif's reply opens in full colour, then the logo."""
    p = Piece(120, 12.0)
    for b in range(14):  # 0 .. 6.5 s
        dry_v = 0.42 if b % 4 == 0 else 0.34
        p.piano(b, "Bb3", 0.25, dry_v, pedal=False, tone=-0.3)
    for b in (2.75, 5.5, 6.25, 9.75, 10.5, 11.25, 12.5):
        place(p.bus["perc"], ins.tick(0.35, seed=int(b * 4)), p.t(b))
    place(p.bus["bass"], ins.sub(note("Eb2"), 2.0, 0.5), p.t(8))
    # 7.0 s = beat 14: bright
    t0 = 14
    p.swell(t0, 1.5, 0.22)
    p.phrase([(b - 8, nm, d) for b, nm, d in MOTIF_B], t0, vel=0.66, tone=0.4)
    p.pad(t0, "Abmaj7", 2, 0.4, cutoff=3200, attack=0.05, release=1.0, seed=14)
    p.pad(t0 + 2, "Eb", 3, 0.4, cutoff=3200, attack=0.3, release=0.8, seed=15)
    p.pulse(t0, "Abmaj7", 2, 0.32, cutoff=3000)
    p.pulse(t0 + 2, "Eb", 2.5, 0.3, cutoff=3000)
    p.bass(t0, "Abmaj7", 1.9, 0.75)
    p.bass(t0 + 2, "Eb", 2.6, 0.7)
    p.kick(t0, 0.8)
    p.kick(t0 + 2, 0.7)
    p.lh(t0, "Abmaj7", 2, 0.34)
    p.lh(t0 + 2, "Eb", 2.5, 0.32)
    for i, nm in enumerate(["Eb6", "C6", "Eb6", "C6", "G6", "Eb6", "G6", "F6"]):
        p.pluck(t0 + i * 0.5, nm, 0.28, decay=0.25, p=(-0.5 if i % 2 else 0.5))
    for s in range(10):
        p.hat(t0 + s * 0.5 + 0.5, 0.14)
    mix = p.render(dict(hall=dict(piano=0.05), room=dict(piano=0.04)), end_fade=0.0)
    # the deadpan half is nearly mono and dry: narrow the image before 7 s
    t = np.arange(len(mix)) / SR
    w = np.clip((t - 6.9) / 0.15, 0, 1) * 0.85 + 0.15
    m = mix.mean(axis=1, keepdims=True)
    mix = m + (mix - m) * w[:, None]
    mix = _fade_region(mix, 9.3, 10.2)
    return mix, p, 9.5


def _fade_region(x, start, end):
    """Equal-power fade to silence between start and end (seconds), silence after."""
    t = np.arange(len(x)) / SR
    g = np.clip((end - t) / (end - start), 0, 1)
    return x * (np.sin(0.5 * np.pi * g) ** 2)[:, None]
