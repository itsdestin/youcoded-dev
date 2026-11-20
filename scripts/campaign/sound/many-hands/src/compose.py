"""The music: motif, logo and the three demos, written as code.

Key: D major. The motif is five notes a child could hum, answered by two claps.
  call:    A  D  E  F#   (clap clap)
  answer:  A  D  E  B  A (clap clap)
The answering claps are the identity: one person's tune, everyone's hands.
"""
import math

import numpy as np

import instruments as I
from dsp import SR, add, lufs, undb, compress, delay, duck, eq, fade, fit, pan, reverb, saturate, stereo

# (beat, midi, velocity, length in beats)
CALL = [(0.0, 69, 0.82, 0.5), (0.5, 74, 0.78, 0.5), (1.0, 76, 0.86, 0.75), (1.75, 78, 0.95, 1.25)]
ANSWER = [(4.0, 69, 0.82, 0.5), (4.5, 74, 0.78, 0.5), (5.0, 76, 0.86, 0.75),
          (5.75, 83, 0.97, 0.75), (6.5, 81, 0.88, 1.0)]
HOOK_CLAPS = [3.0, 3.5, 7.0, 7.5]
MOTIF_NOTES = [n[1] for n in CALL + ANSWER]

CHORDS = {  # voicings for the hummed chords: kept above D3 so voices never muddy the bass
    "D": [57, 62, 66, 69, 74], "G": [59, 62, 67, 71, 74], "Bm": [59, 62, 66, 71, 74],
    "A": [57, 61, 64, 69, 73], "Asus": [57, 62, 64, 69, 74], "Dadd9": [57, 62, 66, 69, 76],
}
ROOT = {"D": 38, "G": 31, "Bm": 35, "A": 33, "Asus": 33, "Dadd9": 38}

ROOM = dict(length=0.9, rt_low=0.55, rt_mid=0.5, rt_high=0.3, predelay=0.006, early=0.9, seed=3)
HALL = dict(length=3.2, rt_low=2.6, rt_mid=2.1, rt_high=1.0, predelay=0.024, early=0.5, seed=7)

# per bus: dry EQ, room send, hall send, delay send
BUSES = {
    "pluck":  dict(eq=[("hp", 110), ("peak", 280, 1.0, -2), ("hs", 9500, 0.7, 2.5)], room=0.10, hall=0.24, dly=0.10),
    "mallet": dict(eq=[("hp", 140), ("peak", 400, 1.0, -1.5), ("hs", 10000, 0.7, 1.5)], room=0.10, hall=0.20, dly=0.0),
    "claps":  dict(eq=[("hp", 250), ("peak", 3200, 1.0, -1.0), ("hs", 10000, 0.7, 1.5)], room=0.42, hall=0.14, dly=0.0),
    "snaps":  dict(eq=[("hp", 450)], room=0.30, hall=0.10, dly=0.0),
    "drums":  dict(eq=[("hp", 70), ("peak", 350, 1.0, -2)], room=0.25, hall=0.08, dly=0.0),
    "shaker": dict(eq=[("hp", 2500)], room=0.25, hall=0.06, dly=0.0),
    "voices": dict(eq=[("hp", 110), ("peak", 320, 0.8, -2.5), ("hs", 9000, 0.7, 2)], room=0.08, hall=0.38, dly=0.0),
    "low":    dict(eq=[("hp", 28), ("lp", 6000)], room=0.0, hall=0.0, dly=0.0, mono=True),
    "dry":    dict(eq=[("hp", 60)], room=0.05, hall=0.0, dly=0.0),
    "dryhands": dict(eq=[("hp", 250)], room=0.06, hall=0.0, dly=0.0),
}


# WHY these trims: first measured mixes had ~50% of their energy below 80 Hz
# (boom risk) and too little above 2 kHz (dull); these bring the balance in
# line with commercial masters (see RULES.md, "premium in checkable terms").
BUS_GAIN_DB = {"low": -6.0, "claps": 2.0, "shaker": 2.5, "snaps": 1.0}


class Song:
    """A timeline of buses plus humanising helpers.

    WHY a seeded random generator per song: the human feel (late hands, soft
    and hard hits) is random but identical on every re-render.
    """

    def __init__(self, bpm, seed=0, swing=0.0, length=None):
        self.bpm = bpm
        self.swing = swing
        self.rng = np.random.default_rng(seed)
        self.salt = seed * 100000
        self.bus = {k: np.zeros((int((length or 4) * SR), 2)) for k in BUSES}
        self.kicks = []
        self.length = length

    def t(self, beat):
        q = 60.0 / self.bpm
        s = beat * q
        sixteenth = round(beat * 4, 6)
        if self.swing and abs(sixteenth - round(sixteenth)) < 1e-6 and int(round(sixteenth)) % 2 == 1:
            s += self.swing * q / 4
        return s

    def put(self, bus, x, t, gain=1.0):
        self.bus[bus] = add(self.bus[bus], x, max(0.0, t), gain)

    def h(self, sd=0.006):
        return float(self.rng.normal(0, sd))

    def v(self, base, spread=0.1):
        return float(np.clip(base * (1 + self.rng.normal(0, spread)), 0.05, 1.0))

    # ---- musical building blocks
    def motif(self, start, parts=("harp",), vel=1.0, octave=0, damp=None, notes=None):
        for b, m, v, L in (notes or CALL + ANSWER):
            t = self.t(start + b)
            dur = L * 60 / self.bpm
            for p in parts:
                if p == "harp":
                    self.put("pluck", pan(I.harp(m + octave, self.v(v * vel, 0.06), dur=dur if damp else None,
                                                 damp=damp or 0.15), -0.18), t + self.h(0.004))
                elif p == "harp_low":
                    self.put("pluck", pan(I.harp(m + octave - 12, self.v(v * vel * 0.55, 0.06)), -0.4),
                             t + self.h(0.005))
                elif p == "marimba":
                    self.put("mallet", pan(I.marimba(m + octave, self.v(v * vel * 0.7, 0.08)), 0.35),
                             t + self.h(0.006))
                elif p == "muted":
                    self.put("dry", I.harp(m + octave, self.v(v * vel, 0.04), dur=min(dur, 0.16), damp=0.05,
                                           bright=-0.4), t + self.h(0.003))

    def sung_motif(self, start, voices=4, vel=0.5, octave=-12, vowels=("oo", "ah"), seed=0):
        """The crowd sings the tune back: same notes, everyone's voice."""
        for i, (b, m, v, L) in enumerate(CALL + ANSWER):
            dur = L * 60 / self.bpm * 0.95
            x = I.choir([m + octave], dur, n_each=voices, vowels=vowels, seed=seed + i, vel=vel * v,
                        attack=0.05, release=0.25, stagger=0.02)
            self.put("voices", x, self.t(start + b) - 0.02)

    def hook(self, start, people=6, vel=0.9, which=HOOK_CLAPS, seed=11):
        """The answering double clap."""
        crowd = I.crowd(people, seed)
        for k, b in enumerate(which):
            accent = 1.0 if k % 2 else 0.88
            key = int(round((start + b) * 1000)) + self.salt
            for c in crowd:
                self.put("claps", c.clap(self.v(vel * accent, 0.12), key), c.when(self.t(start + b), key))

    def claps(self, beats, people=4, vel=0.7, seed=21, bus="claps"):
        crowd = I.crowd(people, seed)
        for b in beats:
            key = int(round(b * 1000)) + self.salt + 7
            for c in crowd:
                self.put(bus, c.clap(self.v(vel, 0.15), key), c.when(self.t(b), key))

    def snaps(self, beats, people=2, vel=0.6, seed=0, bus="snaps"):
        for b in beats:
            for j in range(people):
                p = [-0.45, 0.45, -0.15, 0.2][j % 4]
                x = I.snap(self.v(vel, 0.15), which=j + seed, semis=[0, 0.7, -0.6, 0.3][j % 4], p=p)
                self.put(bus, x, self.t(b) + 0.006 * j + self.h(0.007))

    def stomps(self, beats, vel=0.8, sub=True):
        for i, b in enumerate(beats):
            t = self.t(b) + self.h(0.004)
            self.put("drums", I.stomp(self.v(vel, 0.08), p=0.0, sub=False, seed=i), t)
            if sub:
                n = int(0.32 * SR)
                tt = np.arange(n) / SR
                f = 47 + 38 * np.exp(-tt / 0.025)
                s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.11) * (1 - np.exp(-tt / 0.001))
                self.put("low", fade(stereo(s), 0.0, 0.06) * vel * 0.75, t)
            self.kicks.append(t)

    def kick808(self, beats, vel=0.85):
        for b in beats:
            t = self.t(b)
            self.put("low", I.kick(self.v(vel, 0.05)), t)
            self.kicks.append(t)

    def chord(self, name, start, beats, vowels=("mm", "oo"), n_each=3, vel=0.5, seed=0, attack=0.25):
        dur = beats * 60 / self.bpm
        self.put("voices", I.choir(CHORDS[name], dur, n_each=n_each, vowels=vowels, seed=seed, vel=vel,
                                   attack=attack), self.t(start) - 0.03)

    def bassline(self, name, start, pattern, vel=0.75):
        for b, L, off in pattern:
            self.put("low", I.bass(ROOT[name] + off, L * 60 / self.bpm, self.v(vel, 0.06)),
                     self.t(start + b) + self.h(0.002))

    def shaker(self, start, beats, vel=0.35):
        for i in range(int(beats * 4)):
            acc = 1.0 if i % 2 == 0 else 0.65
            self.put("shaker", I.shaker(self.v(vel * acc, 0.15), i=int(self.rng.integers(0, 8)),
                                        p=0.35), self.t(start + i / 4) + self.h(0.004))

    def perc(self, start, bars, pattern, vel=0.6):
        for bar in range(bars):
            for b, kind, idx, p in pattern:
                self.put("drums", I.handdrum(kind, self.v(vel, 0.12), idx, p),
                         self.t(start + bar * 4 + b) + self.h(0.006))

    # ---- mixdown
    def mix(self, pocket=False, duck_db=0.0, extra=None):
        n = max(len(b) for b in self.bus.values()) + int(3.2 * SR)
        out = np.zeros((n, 2))
        room_in = np.zeros((n, 2))
        hall_in = np.zeros((n, 2))
        dly_in = np.zeros((n, 2))
        stems = {}
        for name, cfg in BUSES.items():
            x = fit(self.bus[name], n)
            if not np.any(x):
                continue
            x = eq(x, *cfg["eq"]) * 10 ** (BUS_GAIN_DB.get(name, 0.0) / 20)
            if cfg.get("mono"):
                # WHY: low end in mono survives phones, club PAs and mono speakers
                x = stereo(x.mean(axis=1))
            if name in ("voices", "low") and duck_db and self.kicks:
                x = x * duck(n, self.kicks, duck_db)
            stems[name] = x
            out += x
            room_in += x * cfg["room"]
            hall_in += x * cfg["hall"]
            dly_in += x * cfg["dly"]
        out += fit(reverb(room_in, ROOM, wet=1.0, hp=200, lp=11000), n)
        out += fit(reverb(hall_in, HALL, wet=1.0, hp=250, lp=8500), n)
        if np.any(dly_in):
            out += fit(delay(dly_in, 0.75 * 60 / self.bpm, feedback=0.38, taps=4), n)
        if pocket:
            # narration pocket: a gentle dip where a speaking voice is understood
            out = eq(out, ("peak", 2800, 0.8, -2.5), ("peak", 1200, 1.0, -1.0))
        out = compress(out, thr_db=-20, ratio=1.8, att=0.015, rel=0.2)
        out = saturate(out, 1.2, mix=0.35)
        out = eq(out, ("hp", 25), ("hs", 5000, 0.6, 2.0), ("hs", 12000, 0.7, 1.5))
        return out, stems


# ---------------------------------------------------------------- the logo
def logo_mix():
    """'da-da-da-DAAA (clap clap)': the motif's call, squeezed into one breath."""
    s = Song(120, seed=101, length=3.2)
    notes = [(0.0, 69, 0.85, 0.25), (0.25, 74, 0.82, 0.25), (0.5, 76, 0.9, 0.375), (0.875, 78, 1.0, 2.5)]
    s.motif(0, ("harp", "marimba"), vel=1.0, notes=notes)
    s.put("pluck", I.harp(62, 0.55), s.t(0.875))
    s.put("pluck", I.harp(57, 0.45), s.t(0.875) + 0.012)
    s.chord("Dadd9", 0.85, 3.2, vowels=("oo", "ah"), n_each=3, vel=0.55, seed=5, attack=0.05)
    s.stomps([0.875], vel=0.65)
    s.put("low", I.bass(38, 1.4, 0.35, cutoff=300, env_amt=1.0), s.t(0.875))
    s.hook(0, people=10, vel=0.95, which=[1.5, 1.75], seed=13)
    s.put("mallet", I.marimba(90, 0.35), s.t(1.75) + 0.01)
    out, stems = s.mix()
    L = int(2.9 * SR)
    out = fade(out[:L], 0.0, 0.45)
    return out


# ---------------------------------------------------------------- the motif alone
def motif_mix():
    s = Song(120, seed=202, length=9)
    # first time: one person, one instrument, one pair of hands
    s.motif(0, ("harp",), vel=0.9)
    s.hook(0, people=1, vel=0.85, seed=41)
    # second time: a second player and a few more hands join, same notes
    s.motif(8, ("harp", "marimba"), vel=0.95)
    s.hook(8, people=5, vel=0.9, seed=42)
    s.put("pluck", pan(I.harp(74, 0.75), -0.18), s.t(16.0))
    s.put("pluck", pan(I.harp(62, 0.5), -0.3), s.t(16.0) + 0.015)
    s.put("mallet", pan(I.marimba(74, 0.45), 0.35), s.t(16.0))
    out, _ = s.mix()
    L = int(round(s.t(16.0) * SR + 1.3 * SR))
    return fade(out[:L], 0.0, 0.9)


# ---------------------------------------------------------------- demos
def _place_logo(bed, logo, t, offset_lu=0.0):
    """Put the logo at t, level-matched to the music just before it.

    WHY match by loudness: the logo audio is the same everywhere; only its gain
    changes so it lands at the same perceived level as the film's music.
    """
    ref = bed[int((t - 4) * SR):int(t * SR)]
    g = undb(lufs(ref) + offset_lu - lufs(logo[: int(1.5 * SR)]))
    logo = logo * g
    n = int(t * SR) + len(logo)
    bed = fit(bed, n)
    # let the bed's tail clear within 0.8 s so the name sounds the same everywhere
    i, k = int(t * SR), int(0.8 * SR)
    bed[i:i + k] *= (np.cos(np.linspace(0, np.pi / 2, k)) ** 2)[:, None]
    bed[i + k:] = 0
    return add(bed, logo, t)[:n]


def hopeful(logo):
    bpm = 96
    s = Song(bpm, seed=303, length=30)
    prog = ["D", "G", "Bm", "A", "D", "G", "Bm", "A", "G", "A"]
    # P1 0-5 s: one person, one idea
    s.motif(0, ("harp",), vel=0.75)
    s.hook(0, people=1, vel=0.6, seed=51)
    s.put("voices", pan(I.voice(50, 4.6, ("mm", "mm"), seed=9, vel=0.25), 0.2), 0.1)
    # P2 5-10 s: a friend hums along, someone snaps
    s.motif(8, ("harp",), vel=0.8)
    s.hook(8, people=3, vel=0.7, seed=52)
    s.snaps([9, 11, 13, 15], people=1, vel=0.45)
    s.chord("Bm", 8, 4, ("mm", "mm"), n_each=2, vel=0.35, seed=21)
    s.chord("A", 12, 4, ("mm", "mm"), n_each=2, vel=0.35, seed=22)
    s.bassline("Bm", 8, [(0, 3.8, 0)], vel=0.4)
    s.bassline("A", 12, [(0, 3.8, 0)], vel=0.4)
    # P3 10-15 s: more hands: marimba, feet, hand drum
    s.motif(16, ("harp", "marimba"), vel=0.85)
    s.hook(16, people=6, vel=0.8, seed=53)
    s.snaps([17, 19, 21, 23], people=2, vel=0.45)
    s.stomps([16, 18, 20, 22], vel=0.55)
    s.perc(16, 2, [(1.5, "hand", 0, -0.3), (2.75, "hand", 4, 0.3), (3.5, "hand", 1, -0.2)], vel=0.4)
    s.chord("D", 16, 4, ("mm", "oo"), n_each=3, vel=0.4, seed=23)
    s.chord("G", 20, 4, ("mm", "oo"), n_each=3, vel=0.4, seed=24)
    s.bassline("D", 16, [(0, 3.8, 0)], vel=0.55)
    s.bassline("G", 20, [(0, 3.8, 0)], vel=0.55)
    # P4 15-20 s: the crowd starts singing the tune back
    s.motif(24, ("harp", "marimba"), vel=0.9)
    s.sung_motif(24, voices=3, vel=0.45, seed=60)
    s.hook(24, people=9, vel=0.85, seed=54)
    s.claps([25, 27, 29, 31], people=4, vel=0.45, seed=61)
    s.stomps([24, 26, 28, 30], vel=0.7)
    s.shaker(24, 8, vel=0.25)
    s.perc(24, 2, [(1.5, "hand", 0, -0.3), (2.75, "hand", 4, 0.3), (3.5, "hand", 1, -0.2)], vel=0.45)
    s.chord("Bm", 24, 4, ("oo", "oo"), n_each=3, vel=0.42, seed=25)
    s.chord("A", 28, 4, ("oo", "oo"), n_each=3, vel=0.42, seed=26)
    s.bassline("Bm", 24, [(0, 1.8, 0), (2, 1.8, 0)], vel=0.65)
    s.bassline("A", 28, [(0, 1.8, 0), (2, 1.8, 0)], vel=0.65)
    # P5 20-25 s: everyone (grand, not pompous: no cymbals, no brass, no timpani)
    s.motif(32, ("harp", "marimba", "harp_low"), vel=0.95)
    s.sung_motif(32, voices=5, vel=0.55, seed=70)
    s.sung_motif(32, voices=3, vel=0.3, octave=0, vowels=("oo", "oo"), seed=80)
    s.hook(32, people=14, vel=0.95, seed=55)
    s.claps([33, 35, 37, 39], people=6, vel=0.55, seed=62)
    s.stomps([32, 34, 35.5, 36, 38, 39.5], vel=0.85)
    s.shaker(32, 8, vel=0.32)
    s.perc(32, 2, [(0.75, "conga", 1, 0.4), (1.5, "hand", 0, -0.3), (2.75, "hand", 4, 0.3),
                   (3.25, "conga", 0, 0.4), (3.5, "hand", 1, -0.2)], vel=0.5)
    s.chord("G", 32, 4, ("oo", "ah"), n_each=4, vel=0.5, seed=27)
    s.chord("A", 36, 4, ("oo", "ah"), n_each=4, vel=0.5, seed=28)
    s.bassline("G", 32, [(0, 1.8, 0), (2, 0.9, 0), (3, 0.9, 12)], vel=0.75)
    s.bassline("A", 36, [(0, 1.8, 0), (2, 0.9, 0), (3, 0.9, 12)], vel=0.75)
    # 25-27 s: a held breath on A-sus before the name arrives
    s.chord("Asus", 40, 2.6, ("oo", "ah"), n_each=4, vel=0.5, seed=29, attack=0.4)
    s.put("pluck", I.harp(64, 0.6), s.t(40))
    s.put("pluck", I.harp(69, 0.55), s.t(40.25))
    s.put("pluck", I.harp(74, 0.5), s.t(40.5))
    s.bassline("Asus", 40, [(0, 2.6, 0)], vel=0.6)
    bed, stems = s.mix(pocket=True, duck_db=-2.0)
    # WHY a level curve: the story is one person joined by more and more hands,
    # so the start must be audibly smaller than the end (about 8 LU apart)
    tt = np.arange(len(bed)) / SR
    bed = bed * undb(np.interp(tt, [0, 5, 10, 15, 20, 25], [-7, -5.5, -4, -2, 0, 0]))[:, None]
    out = _place_logo(bed, logo, 27.05, 0.0)
    return fade(fit(out, 30 * SR), 0.0, 0.05), stems


GROOVE_KICK = [0, 1.5, 2, 3.25]
GROOVE_PERC = [(0.75, "conga", 1, 0.45), (1.75, "bongo", 2, -0.4), (2.5, "conga", 0, 0.45),
               (2.75, "conga", 1, 0.45), (3.75, "bongo", 0, -0.4)]
BASS_PAT = [(0, 0.45, 0), (0.75, 0.2, 0), (1.5, 0.3, 12), (2, 0.45, 0), (2.75, 0.2, 7), (3.5, 0.4, 0)]


def playful(logo):
    s = Song(120, seed=404, swing=0.12, length=20)
    for ph in range(4):
        b0 = ph * 8
        names = ["D", "G"] if ph % 2 == 0 else ["Bm", "A"]
        parts = ("harp",) if ph == 0 else ("harp", "marimba")
        s.motif(b0, parts, vel=0.95, damp=0.06)
        s.hook(b0, people=[3, 7, 10, 14][ph], vel=0.95, seed=60 + ph)
        s.snaps([b0 + 1, b0 + 3, b0 + 5, b0 + 7], people=2 if ph < 2 else 3, vel=0.55, seed=ph)
        s.shaker(b0, 8, vel=0.22 if ph == 0 else 0.3)
        if ph == 0:
            s.stomps([0, 2, 4, 6], vel=0.6, sub=False)
            continue
        for bar in range(2):
            s.kick808([b0 + bar * 4 + k for k in GROOVE_KICK], vel=0.9)
            s.stomps([b0 + bar * 4 + 1, b0 + bar * 4 + 3], vel=0.5, sub=False)
            s.bassline(names[bar], b0 + bar * 4, BASS_PAT, vel=0.75)
        s.claps([b0 + 1, b0 + 3, b0 + 5], people=4, vel=0.55, seed=70 + ph)
        s.perc(b0, 2, GROOVE_PERC, vel=0.5)
        if ph >= 2:
            # voices: short 'ooh' stabs on the off-beats, then the crowd sings the tune
            for bar in range(2):
                for off in (0.5, 2.5):
                    s.chord(names[bar], b0 + bar * 4 + off, 0.45, ("oo", "ah"), n_each=2, vel=0.4,
                            seed=ph * 10 + bar * 2 + int(off), attack=0.02)
        if ph == 3:
            s.sung_motif(b0, voices=5, vel=0.5, seed=90)
    # 16-17 s: the band drops out and the whole room claps a roll into the name
    roll = [32, 32.5, 33, 33.25, 33.5, 33.75]
    for k, b in enumerate(roll):
        s.claps([b], people=10, vel=0.55 + 0.07 * k, seed=99 + k)
    s.stomps([32], vel=0.8)
    s.put("pluck", pan(I.harp(69, 0.7, dur=0.4), -0.18), s.t(32))
    s.put("mallet", pan(I.marimba(81, 0.4), 0.35), s.t(32))
    bed, stems = s.mix(duck_db=-4.0)
    out = _place_logo(bed, logo, 17.0, 0.5)
    return fade(fit(out, 20 * SR), 0.0, 0.05), stems


def stark(logo):
    s = Song(120, seed=505, length=12)
    # 0-7 s: deadpan. One muted string, one person who claps once, no reverb.
    s.motif(0, ("muted",), vel=0.6)
    s.claps([3.0], people=1, vel=0.6, seed=31, bus="dryhands")
    s.claps([7.0], people=1, vel=0.6, seed=31, bus="dryhands")
    s.snaps([8, 9, 10, 11, 12, 13], people=1, vel=0.5, bus="dryhands")
    s.put("dry", I.harp(69, 0.5, dur=0.12, damp=0.05, bright=-0.4), s.t(10))
    s.put("dry", I.harp(69, 0.5, dur=0.12, damp=0.05, bright=-0.4), s.t(12))
    # 7 s: bright. Everyone at once.
    s.chord("Dadd9", 14, 4, ("oo", "ah"), n_each=4, vel=0.55, seed=33, attack=0.03)
    s.motif(14, ("harp", "marimba", "harp_low"), vel=1.0, notes=CALL)
    s.hook(14, people=12, vel=0.95, which=[3.0, 3.5], seed=34)
    s.stomps([14, 16], vel=0.85)
    s.kick808([14], vel=0.8)
    s.bassline("D", 14, [(0, 3.8, 0)], vel=0.7)
    s.shaker(14, 4, vel=0.3)
    s.snaps([15, 17], people=3, vel=0.55)
    s.claps([15, 17], people=4, vel=0.5, seed=35)
    bed, stems = s.mix()
    # the deadpan half stays dry: strip the hall from before 7 s (rooms only)
    out = _place_logo(bed, logo, 9.0, 0.0)
    return fade(fit(out, 12 * SR), 0.0, 0.05), stems
