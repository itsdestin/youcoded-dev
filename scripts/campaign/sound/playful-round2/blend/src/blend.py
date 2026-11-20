"""The playful piece, "the full blend": two versions (20.0 s, 120 BPM, E-flat major).

Written as BUILDING BLOCKS (the owner's ruling: the winner becomes the brand's songbook):

    TUNE       the melody, in two voices: piano 1 calls, piano 2 answers. Phrase A (bars 1-4)
               is played twice; the second time (bars 5-8) only its last bar changes.
    CHORDS     one 4-bar progression, played twice, then one ending bar into the logo.
    FIGURE     one accompaniment pattern that never stops from bar 1 to the logo.
    LAYERS     who doubles the figure or holds the chords, and from which bar (the build).
    ENDING     bar 9: everyone holds the last chords and fades as the logo begins.

Each version is just a dict of these blocks (V1, V2 at the bottom); `render_version` turns any
such dict into audio, so a new piece can be assembled by swapping blocks.

Owner's rules honoured by construction: no drum or noise sound exists in this file (every
sound is a piano note, a real string note, a sine sub or a soft synth note); no stops; no
runs, sweeps or risers; no glass plucks or high decoration; no sidechain or pumping; string
lines hold a steady level (they only fade in once, slowly, when they enter).
"""
import numpy as np

import instruments as ins
import kit
from arrange import ir
from dsp import SR, biquad, butter, compress, convolve, fade, note, pan, pingpong, place, rng
from master import lufs

BPM = 120
LENGTH = 20.0
LOGO_AT = 17.5              # logo file starts here; its third note lands on 18.0 s (bar 10)
FADE = (16.9, 17.8)         # the music fades out under the logo's first notes
BUSES = ["p1", "p2", "pizz", "strings", "synth", "bass"]

# ------------------------------------------------------------------ chord voicings
# root: the bass note (sub). lh: piano left-hand voicing. cello: pizz bass note.
# dy: two middle notes (plucked violas / held violas). arp: four notes for the figure.
CH = {
    "Eb":     dict(root="Eb2", cello="Eb2", lh=["Eb3", "Bb3", "G4"], dy=["G3", "Bb3"],
                   fig=["Eb2", "Bb2", "G3", "Bb2"], arp=["Eb3", "G3", "Bb3", "Eb4"]),
    # WHY no E-flat on top of the C minor left hand: its overtone sat on the tune's E-flat
    "Cm7":    dict(root="C2", cello="C2", lh=["C3", "G3", "Bb3"], dy=["G3", "Eb4"],
                   fig=["C2", "G2", "Eb3", "G2"], arp=["C3", "G3", "Bb3", "Eb4"]),
    "Abmaj7": dict(root="Ab1", cello="Ab2", lh=["Ab2", "Eb3", "C4"], dy=["Ab3", "C4"],
                   fig=["Ab1", "Eb2", "C3", "Eb2"], arp=["Ab2", "Eb3", "G3", "C4"]),
    # WHY no E-flat in this left hand: its overtones sat on the mirror's E-flat in bar 2 and 6
    "Ab":     dict(root="Ab1", cello="Ab2", lh=["Ab2", "Ab3", "C4"], dy=["Ab3", "C4"],
                   fig=["Ab1", "Eb2", "C3", "Eb2"], arp=["Ab2", "Eb3", "Ab3", "C4"]),
    "Bb":     dict(root="Bb1", cello="Bb2", lh=["Bb2", "F3", "D4"], dy=["F3", "D4"],
                   fig=["Bb1", "F2", "D3", "F2"], arp=["Bb2", "F3", "Bb3", "D4"]),
    "Bb7":    dict(root="Bb1", cello="Bb2", lh=["Bb2", "Ab3", "D4"], dy=["Ab3", "D4"],
                   fig=["Bb1", "F2", "Ab2", "F2"], arp=["Bb2", "F3", "Ab3", "D4"]),
    "Bbsus":  dict(root="Bb1", cello="Bb2", lh=["Bb2", "F3", "Eb4"], dy=["F3", "Eb4"],
                   fig=["Bb1", "F2", "Eb3", "F2"], arp=["Bb2", "F3", "Bb3", "Eb4"]),
}


def chord_at(chords, beat):
    """The chord sounding at an absolute beat. `chords` = list of (start_beat, name)."""
    cur = chords[0][1]
    for b, nm in chords:
        if beat + 1e-9 >= b:
            cur = nm
    return cur


# ------------------------------------------------------------------ the player

class Band:
    """Places notes on buses with humanised timing and dynamics (seeded: identical every run).
    `backing=True` leaves out the tune's notes only (for the 'is the tune on top' check)."""

    def __init__(self, swing_s, seed, backing=False):
        self.n = int(round(LENGTH * SR))
        self.bus = {b: np.zeros((self.n, 2)) for b in BUSES}
        self.swing = swing_s
        self.r = rng(seed)
        self.backing = backing
        self.melody = []      # (seconds, midi) of tune notes
        self.onsets = []      # (seconds, bus) of every note placed: for the transient check
        self.held_spans = []  # (start, end) seconds of held string notes

    def when(self, beat, jitter):
        # WHY draw the random numbers before anything is skipped: the backing render must place
        # every other note at exactly the same time as the full render
        dt = float(self.r.normal(0, jitter))
        frac = beat % 1.0
        sw = self.swing if abs(frac - 0.5) < 1e-6 else 0.0   # off-beat eighths lean late
        return beat * 60.0 / BPM + sw + dt

    def hv(self, v, sd=0.035):
        return float(np.clip(v + self.r.normal(0, sd), 0.08, 0.95))

    def put(self, bus, x, t, p=0.0):
        if x.ndim == 1:
            x = pan(x, p)
        elif p:
            x = x * np.array([1 - max(p, 0), 1 + min(p, 0)])
        place(self.bus[bus], x, t)
        self.onsets.append((t, bus))

    def piano(self, bus, beat, name, beats, vel, p=0.0, tone=0.0, tune=False, pedal=False, jitter=0.006):
        """tune=True: a melody note (logged, left out of the backing render). Octave or third
        doublings under the melody are played with tune=False, so the check counts them as
        competition, not as melody: stricter."""
        t = self.when(beat, jitter)
        v = self.hv(vel)
        m = note(name)
        if tune:
            self.melody.append((t, m))
            if self.backing:
                return
        x = ins.felt_piano(m, v, beats * 60.0 / BPM * 0.96, pedal=pedal, tone=tone)
        self.put(bus, x, t, p)

    def string(self, bus, sec, art, beat, name, vel, beats=None, p=0.0, rr=0, jitter=0.007, release=0.25):
        t = self.when(beat, jitter)
        v = self.hv(vel, 0.03)
        dur = None if beats is None else beats * 60.0 / BPM
        x = kit.string_note(sec, art, note(name), v, dur=dur, rr=rr, release=release)
        self.put(bus, x, t, p)

    def held(self, sec, beat, name, beats, level, p, rr, fin=0.09):
        """A long bowed note at a STEADY level (no swell): soft attack, gentle release, so
        consecutive notes join legato. Level comes from `level`, not from the take."""
        t = self.when(beat, 0.004)
        d = beats * 60.0 / BPM + 0.12            # overlap the next note a little: legato
        self.held_spans.append((t, t + d))
        x = kit.string_note(sec, "sus", note(name), 0.55, dur=d, rr=rr, release=0.3)
        x = fade(x * level, fin=fin)
        self.put("strings", x, t, p)

    def synth(self, beat, name, vel, cutoff, p=0.0, seed=0):
        t = self.when(beat, 0.003)
        v = self.hv(vel, 0.02)
        self.put("synth", kit.arp_voice(note(name), v, cutoff=cutoff, gate=0.16, seed=seed, res=0.2), t, p)

    def sub(self, beat, name, beats, vel):
        t = beat * 60.0 / BPM
        place(self.bus["bass"], ins.sub(note(name), beats * 60.0 / BPM, vel), t)


# ------------------------------------------------------------------ blocks: renderers

def play_tune(b, tune):
    """TUNE block. Each entry: (beat, note or [notes], beats, voice, vel)."""
    for beat, nm, d, voice, vel in tune:
        names = nm if isinstance(nm, list) else [nm]
        for i, x in enumerate(names):
            top = i == len(names) - 1
            if voice == "p1":
                b.piano("p1", beat, x, d, vel * (1.0 if top else 0.8), p=-0.15, tone=0.3, tune=top)
            elif voice == "p2c":
                # piano 2 comping a chord under the tune (not part of the melody)
                b.piano("p2", beat, x, d, vel, p=0.35, tone=0.05)
            else:
                # piano 2: same instrument, a touch darker, on the other side of the stage
                b.piano("p2", beat, x, d, vel * (1.0 if top else 0.8), p=0.35, tone=0.05, tune=top)


def play_figure(b, fig, chords, bars, layers):
    """FIGURE block: one accompaniment pattern, repeated every bar of `bars`, following the
    chords. fig = list of (beat_in_bar, role, beats, vel); role names a voicing slot.
    Instruments that double it (layers) play the same rhythm, so it is one figure, not many."""
    for k in bars:
        b0 = 4 * (k - 1)
        for bb, role, d, vel in fig:
            beat = b0 + bb
            if beat >= 34.5:          # nothing new starts once the logo is coming
                continue
            ch = CH[chord_at(chords, beat)]
            lift = layers["lift"](k)
            if role.startswith("fig"):
                i = int(role[3:])
                b.piano(layers["fig_bus"], beat, ch["fig"][i], d, vel * lift, p=layers["fig_pan"],
                        tone=-0.2, pedal=False)
            elif role == "lh":
                for j, nm in enumerate(ch["lh"]):
                    b.piano(layers["fig_bus"], beat + 0.01 * j, nm, d, vel * lift * (1.0 if j == 0 else 0.85),
                            p=layers["fig_pan"], tone=-0.1)
            # plucked strings double the figure's rhythm from their entry bar
            if k >= layers.get("pizz_from", 99):
                if role == "fig0":
                    b.string("pizz", "vc", "pizz", beat, ch["cello"], 0.62 * vel / 0.5, rr=k + int(bb * 2), p=0.05)
                if role in layers.get("viola_roles", ()):
                    for j, nm in enumerate(ch["dy"]):
                        b.string("pizz", "vla", "pizz", beat + 0.01 * j, nm, 0.5, rr=k + j + int(bb * 2), p=0.3)
            # the warm synth doubles the figure an octave up, quietly, from its entry bar
            if k >= layers.get("synth_from", 99) and role.startswith("fig"):
                i = int(role[3:])
                frac = min(1.0, (beat - 4 * (layers["synth_from"] - 1)) / 16.0)
                cut = 650 * (1600 / 650) ** frac        # slowly opens; never a sweep
                b.synth(beat, note(ch["fig"][i]) + 12, 0.42, cut, p=(-0.25 if i % 2 else 0.25), seed=k * 8 + i)


def play_strings(b, lines, start_bar, level, p, sec, fade_in_beats):
    """Held string line: one note per chord change, steady level. Only the group's first note
    fades in slowly (`fade_in` seconds); after that the level never moves."""
    first = True
    for i, (beat, nm, d) in enumerate(lines):
        if beat < 4 * (start_bar - 1):
            continue
        b.held(sec, beat, nm, d, level, p, rr=i, fin=fade_in_beats if first else 0.09)
        first = False


def play_bass(b, chords, from_bar, vel):
    """Soft sine sub on each chord's root, held until the next chord (no rhythm of its own)."""
    edges = [c for c in chords if c[0] >= 4 * (from_bar - 1)] + [(34.6, None)]
    for (beat, ch), (nxt, _) in zip(edges[:-1], edges[1:]):
        b.sub(beat, CH[ch]["root"], nxt - beat - 0.1, vel)


# ------------------------------------------------------------------ the mix

def mix(b, cfg, fades):
    """Steady mix: fixed gains chosen by stem loudness, gentle glue, one hall, no pumping."""
    stems = {}
    for name in BUSES:
        x = b.bus[name]
        if np.abs(x).max() == 0:
            stems[name] = x
            continue
        if name in ("p1", "p2"):
            x = compress(x, -26, 1.6, 0.01, 0.2)
        elif name in ("pizz", "synth"):
            x = compress(x, -24, 1.5, 0.01, 0.15)
        tgt = cfg["target"].get(name)
        g = cfg["gain"].get(name, 1.0) if tgt is None else 10 ** ((tgt - lufs(x)) / 20)
        stems[name] = x * g
    hall_in = sum(stems[k] * cfg["hall"].get(k, 0.0) for k in BUSES)
    room_in = sum(stems[k] * cfg["room"].get(k, 0.0) for k in BUSES)
    dly = pingpong(stems["synth"], 0.375, fb=0.3, n=4) * cfg.get("synth_delay", 0.0)
    hall = convolve(butter(hall_in + dly * 0.5, "highpass", 180, 2), ir("hall"))
    hall = biquad(hall, "lp", 11000, 0.7) * 0.55
    room = convolve(room_in, ir("room")) * 0.4
    out = sum(stems.values()) + hall + room + dly
    t = np.arange(len(out)) / SR
    g = np.clip((FADE[1] - t) / (FADE[1] - FADE[0]), 0, 1)
    out = out * (np.sin(0.5 * np.pi * g) ** 2)[:, None]
    b.stems = stems
    return fade(out, fin=0.002)


# ================================================================== VERSION 1
# "One becomes many" (the intimate one). One person at a piano; a second piano answers her
# in the first bar; plucked strings join at bar 3; held violas and a soft synth at bar 5;
# violins at bar 7. The tune climbs: three times the "you-co-ded" cell, each a step higher,
# each answered by piano 2 with a little three-note ladder that also climbs.

V1_CHORDS = [(0, "Eb"), (4, "Cm7"), (8, "Abmaj7"), (12, "Bb"),
             (16, "Eb"), (20, "Cm7"), (24, "Abmaj7"), (28, "Bb"),
             (32, "Ab"), (34, "Bbsus")]

_A_CALL = [  # phrase A, piano 1: the cell, then the cell up a step, then up again, then a fall to F
    (0.0, "Bb4", 0.5), (0.5, "G5", 1.0), (1.5, "F5", 1.5),
    (4.5, "C5", 0.5), (5.0, "Ab5", 1.0), (6.0, "G5", 1.5),
    (8.5, "Eb5", 0.5), (9.0, "C6", 1.0), (10.0, "Bb5", 1.5),
    (12.5, "Ab5", 0.5), (13.0, "G5", 0.5), (13.5, "F5", 2.5),
]
_A_ANSWER = [  # phrase A, piano 2: a climbing ladder that lands on each next downbeat
    (3.0, "G4", 0.5), (3.5, "Ab4", 0.5), (4.0, "Bb4", 1.0),
    (7.0, "Ab4", 0.5), (7.5, "Bb4", 0.5), (8.0, "C5", 1.0),
    (11.0, "Bb4", 0.5), (11.5, "C5", 0.5), (12.0, "D5", 1.0),
    (15.0, "C5", 0.5), (15.5, "D5", 0.5), (16.0, "Eb5", 1.0),   # the top rung lands home (E-flat)
]


def _v1_tune():
    t = []
    for beat, nm, d in _A_CALL:
        t.append((beat, nm, d, "p1", 0.62))
    for beat, nm, d in _A_ANSWER:
        t.append((beat, nm, d, "p2", 0.56))
    # phrase A again, same notes; piano 2 now answers in thirds (two voices, one ladder)
    third_below = {"Bb4": "G4", "C5": "Ab4", "D5": "Bb4", "Ab4": "F4", "G4": "Eb4", "Eb5": "C5"}
    for beat, nm, d in _A_CALL[:9]:
        t.append((beat + 16, nm, d, "p1", 0.66))
    for beat, nm, d in _A_ANSWER[:9]:
        t.append((beat + 16, [third_below[nm], nm], d, "p2", 0.58))
    # the changed last bar (bar 8): instead of falling to F, it turns and rises to high B-flat
    t += [(28.5, "Ab5", 0.5, "p1", 0.66), (29.0, "G5", 0.5, "p1", 0.64), (29.5, "Bb5", 2.5, "p1", 0.72)]
    # piano 2's last rung, leading into the ending
    t += [(31.0, ["Ab4", "C5"], 0.5, "p2", 0.58), (31.5, ["Bb4", "D5"], 0.5, "p2", 0.6)]
    # ENDING (bar 9): high C sighing to B-flat over A-flat then B-flat sus; then the logo
    t += [(32.0, "C6", 1.5, "p1", 0.66), (33.5, "Bb5", 1.5, "p1", 0.58)]
    return t


# FIGURE (v1): the left hand's broken chord in steady eighths: low root, fifth, tenth, fifth,
# with the weight on beat 1 and the "and" of 2 (a lilt, not a march). It never stops.
V1_FIGURE = [(0.0, "fig0", 0.9, 0.5), (0.5, "fig1", 0.4, 0.3), (1.0, "fig2", 0.4, 0.34),
             (1.5, "fig1", 0.9, 0.42), (2.0, "fig2", 0.4, 0.3), (2.5, "fig0", 0.9, 0.44),
             (3.0, "fig2", 0.4, 0.32), (3.5, "fig1", 0.4, 0.3)]

V1_VIOLAS = [(16, "G3", 4), (20, "Bb3", 4), (24, "C4", 4), (28, "Bb3", 4),
             (32, "C4", 2), (34, "Eb4", 1.4)]
V1_VIOLINS = [(24, "G4", 2), (26, "Ab4", 2), (28, "F4", 2), (30, "Ab4", 2), (32, "Ab4", 2), (34, "F4", 1.4)]

V1 = dict(
    chords=V1_CHORDS, tune=_v1_tune, figure=V1_FIGURE, swing=0.010, seed=11,
    layers=dict(fig_bus="p1", fig_pan=-0.1, pizz_from=3, viola_roles=("fig2",), synth_from=5,
                lift=lambda k: 0.9 if k <= 2 else 1.0),
    strings=[dict(lines=V1_VIOLAS, start_bar=5, sec="vla", p=0.3, fade_in=3.0),
             dict(lines=V1_VIOLINS, start_bar=7, sec="vln", p=-0.3, fade_in=1.6)],
    bass_from=3,
    mix=dict(target=dict(pizz=-24.5, strings=-23.0, synth=-29.0, bass=-25.0),
             gain=dict(p1=1.0, p2=1.0),
             hall=dict(p1=0.22, p2=0.24, pizz=0.3, strings=0.35, synth=0.25),
             room=dict(p1=0.1, p2=0.1, pizz=0.1), synth_delay=0.12),
)
# WHY violas take the 3rd note of the figure (beat 1 and 3 of each bar): the plucked viola
# chord then falls where the left hand plays its middle note, so it thickens the figure
# instead of adding a new rhythm.
V1["layers"]["viola_roles"] = ("fig2",)


# ================================================================== VERSION 2
# "Mirror" (the exuberant one). Both pianos from the first bar: piano 1 says the cell in a
# bouncing 3+3+2 rhythm, piano 2 answers each time with the cell upside down (it falls where
# the cell rises). Long strings hold the chords from bar 1, quietly; plucked cellos and
# violas join at bar 3; the synth at bar 5; in the second half piano 2 joins the tune in
# octaves and the violins add a high held line. More swing, stronger playing.

V2_CHORDS = [(0, "Eb"), (4, "Ab"), (8, "Cm7"), (12, "Bbsus"), (14, "Bb7"),
             (16, "Eb"), (20, "Ab"), (24, "Cm7"), (28, "Bbsus"), (30, "Bb7"),
             (32, "Ab"), (34, "Bbsus")]

_M_CALL = [(0.0, "Bb4", 1.5), (1.5, "G5", 1.5), (3.0, "F5", 1.0),          # bar 1: the cell, 3+3+2
           (8.0, "Eb5", 1.5), (9.5, "C6", 1.5), (11.0, "Bb5", 1.0)]         # bar 3: the cell from E-flat
_M_MIRROR = [(4.0, "Eb5", 1.5), (5.5, "G4", 1.5), (7.0, "Ab4", 1.0),       # bar 2: the cell upside down
             (12.0, "F5", 1.5), (13.5, "Ab4", 1.5), (15.0, "Bb4", 1.0)]     # bar 4: again, from F


def _v2_tune():
    t = []
    for beat, nm, d in _M_CALL:
        t.append((beat, nm, d, "p1", 0.64))
    for beat, nm, d in _M_MIRROR:
        t.append((beat, nm, d, "p2", 0.62))
    # second time: piano 1 sings the tune in thirds (two hands), piano 2 does the same with
    # the mirror; the last bar (bar 8) changes: instead of the upside-down cell, both pianos
    # play the rising signature answer B-flat, G, high B-flat, A-flat together
    for beat, nm, d in _M_CALL:
        t.append((beat + 16, [_third(nm), nm], d, "p1", 0.68))
    for beat, nm, d in _M_MIRROR[:3]:
        t.append((beat + 16, [_third(nm), nm], d, "p2", 0.68))
    t += [(28.0, "Bb4", 0.5, "p1", 0.68), (28.5, "G5", 1.0, "p1", 0.7),
          (29.5, "Bb5", 1.5, "p1", 0.74), (31.0, "Ab5", 1.0, "p1", 0.66)]
    t += [(28.0, "Bb3", 0.5, "p2", 0.55), (28.5, "Eb4", 1.0, "p2", 0.55),
          (29.5, "G4", 1.5, "p2", 0.58), (31.0, "F4", 1.0, "p2", 0.55)]
    # ENDING (bar 9): lands on G (home) over A-flat, then B-flat sus; then the logo
    t += [(32.0, [_third("C6"), "C6"], 1.5, "p1", 0.68), (33.5, "Bb5", 1.5, "p1", 0.6)]
    t += [(32.0, ["Eb4", "Ab4"], 1.5, "p2c", 0.5)]
    return t


def _oct(nm, k):
    return note(nm) + 12 * k


_SCALE = [0, 2, 4, 5, 7, 9, 11]   # E-flat major, as semitones above E-flat


def _third(nm):
    """The note a diatonic third below `nm` in E-flat major (two scale steps down)."""
    m = note(nm)
    deg = _SCALE.index((m - 3) % 12)
    return m - (_SCALE[deg] - _SCALE[(deg - 2) % 7]) % 12


# FIGURE (v2): block chords in 3+3+2 (beat 1, the "and" of 2, beat 4), with a light
# off-beat chord on the "and" of 3 filling the gap: bouncy, the same every bar.
V2_FIGURE = [(0.0, "fig0", 0.7, 0.5), (0.0, "lh", 0.7, 0.36), (1.5, "lh", 0.7, 0.4),
             (1.5, "fig0", 0.7, 0.4), (2.5, "lh", 0.3, 0.26), (3.0, "fig0", 0.5, 0.44),
             (3.0, "lh", 0.5, 0.36)]

V2_VIOLAS = [(0, "G3", 4), (4, "C4", 4), (8, "G3", 4), (12, "F3", 4),
             (16, "G3", 4), (20, "C4", 4), (24, "G3", 4), (28, "F3", 4), (32, "Ab3", 2), (34, "F3", 1.4)]
V2_VIOLINS_LOW = [(0, "Eb4", 4), (4, "Bb3", 4), (8, "G4", 4), (12, "Eb4", 2), (14, "D4", 2),
                  (16, "Eb4", 4), (20, "Bb3", 4), (24, "G4", 4), (28, "Eb4", 2), (30, "D4", 2),
                  (32, "C4", 2), (34, "Eb4", 1.4)]
V2_VIOLINS_HIGH = [(16, "G4", 4), (20, "Ab4", 4), (24, "G4", 4), (28, "F4", 4), (32, "Ab4", 2), (34, "F4", 1.4)]

V2 = dict(
    chords=V2_CHORDS, tune=_v2_tune, figure=V2_FIGURE, swing=0.022, seed=23,
    layers=dict(fig_bus="p1", fig_pan=-0.05, pizz_from=3, viola_roles=(), synth_from=5,
                lift=lambda k: 0.92 if k <= 4 else 1.0),
    strings=[dict(lines=V2_VIOLAS, start_bar=1, sec="vla", p=0.3, fade_in=2.0),
             dict(lines=V2_VIOLINS_LOW, start_bar=1, sec="vln", p=-0.3, fade_in=2.0),
             dict(lines=V2_VIOLINS_HIGH, start_bar=5, sec="vln", p=-0.45, fade_in=2.5)],
    bass_from=3,
    mix=dict(target=dict(pizz=-24.0, strings=-22.5, synth=-29.5, bass=-25.0),
             gain=dict(p1=1.0, p2=1.0),
             hall=dict(p1=0.2, p2=0.22, pizz=0.3, strings=0.35, synth=0.25),
             room=dict(p1=0.1, p2=0.1, pizz=0.1), synth_delay=0.1),
)
V2["layers"]["viola_roles"] = ()

VERSIONS = {"blend-1": V1, "blend-2": V2}


def render_version(name, backing=False):
    v = VERSIONS[name]
    b = Band(v["swing"], v["seed"], backing=backing)
    # order matters only for the seeded humanising; keep it fixed
    play_tune(b, v["tune"]())
    play_figure(b, v["figure"], v["chords"], range(1, 10), v["layers"])
    fades = {}
    for s in v["strings"]:
        play_strings(b, s["lines"], s["start_bar"], 1.0 if s["sec"] == "vla" else 0.8, s["p"], s["sec"], s["fade_in"])
    play_bass(b, v["chords"], v["bass_from"], 0.6)
    out = mix(b, v["mix"], fades)
    return out, b
