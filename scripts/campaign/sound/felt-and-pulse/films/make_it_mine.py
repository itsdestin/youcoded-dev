"""FILM 3, "Make it mine" (60.0 s, no narrator, cut on the beat). 120 BPM, beat 0.5 s, bar 2 s,
first downbeat 0.000. Playful register, piano leading.

THE PICTURE IS BEING REBUILT: every hit is in HITS below. To re-fit, change the times there and
re-run films/render.sh make-it-mine; the music around each hit follows its entry.
"""
import numpy as np

from common import (MOTIF_A, MOTIF_B, MOTIF_ECHO, SR, VOICES, Grid, Score, arrive_notes, ins,  # noqa: F401
                    note, pan, place, sfx, undb)
from master import lufs

LENGTH = 60.0
G = Grid(120)              # G(bar, beat) -> seconds; bar k starts at 2*(k-1)

# ------------------------------------------------------------------ every hit, in seconds
HITS = {
    "typing: message 1":         (0.00, 0.30),
    "message sent":               0.35,
    "reply lands 1":              0.90,
    "typing 2":                  (1.50, 2.60),
    "build":                     (2.60, 4.50),
    "BIG CHANGE (sweep)":        (4.50, 5.30),
    "hold new look":             (5.30, 8.00),
    "typing 3":                  (8.00, 8.70),
    "small sweep":               (10.00, 10.60),
    "section: their home":        14.00,
    "reply lands 2":              16.60,
    "typing 4":                  (17.00, 18.80),
    "six rooms build in":         20.00,
    "rearrange":                  21.00,
    "typing 5":                  (23.00, 24.50),
    "cut":                        25.50,
    "sliders grow":               26.00,
    "lamp wiggles":               26.55,
    "switch pops":                27.35,
    "thermostat bounces":         28.20,
    "section: their money":       30.00,
    "balances count up":         (32.50, 33.00),
    "typing 6":                  (35.00, 36.50),
    "reply 'Yes. Found eleven.'": 37.90,
    "eleven bills ripple in":     39.50,
    "typing 7":                  (41.50, 42.90),
    "email springs up":          (43.00, 46.00),
    "cut back to plain app":      46.00,
    "PEAK: the sweep reveals":   (47.00, 47.80),
    "settle":                    (47.80, 49.50),
    "closing line 1":             50.10,
    "closing line 2":             52.50,
    "name (logo lands)":          56.00,
    "clean end":                  59.60,
}
LOGO_AT = HITS["name (logo lands)"] - 0.5
TYPING_UNDER_MUSIC_DB = 19.0     # the owner asked for quieter typing: 18-20 dB under the music


def h(k):
    v = HITS[k]
    return v[0] if isinstance(v, tuple) else v


def score():
    s = Score(LENGTH)
    bt = G.beat

    # ---------------- harmony and grooves, bar by bar (bar k = 2(k-1) s)
    chords = {1: "Eb", 2: "Cm7", 3: "Abmaj7", 4: "Eb", 5: "Eb", 6: "Cm7", 7: "Abmaj7",
              8: "Ab", 9: "Eb/G", 10: "Cm7", 11: "Bbsus", 12: "Ab", 13: "Eb/G", 14: "Cm7", 15: "Bb",
              16: "Eb", 17: "Cm7", 18: "Abmaj7", 19: "Eb", 20: "Eb", 21: "Cm7", 22: "Ab", 23: "Bbsus",
              25: "Eb", 26: "Cm7", 27: "Abmaj7", 28: "Eb/G", 29: "Bbsus"}
    # groove level per bar: 0 none, 1 light (hats, shaker), 2 medium (+kick on 1 and 3), 3 full
    level = {1: 1, 2: 1, 3: 3, 4: 2, 5: 3, 6: 2, 7: 3, 8: 2, 9: 2, 10: 3, 11: 3, 12: 2, 13: 3,
             14: 2, 15: 3, 16: 2, 17: 3, 18: 3, 19: 3, 20: 2, 21: 3, 22: 1, 23: 0, 24: 0,
             25: 3, 26: 2, 27: 0, 28: 0, 29: 0}
    t_bloom = h("BIG CHANGE (sweep)")
    t_cut_back, t_peak = h("cut back to plain app"), h("PEAK: the sweep reveals")
    for bar, ch in chords.items():
        t0 = G(bar)
        lv = level.get(bar, 0)
        dur = 4 * bt
        if bar == 3:                                   # the bloom starts on the sweep, not the bar
            t0, dur = t_bloom, G(4) - t_bloom
        if bar == 23:
            dur = t_cut_back - t0
        pad_v = {0: 0.22, 1: 0.24, 2: 0.28, 3: 0.32}[lv]
        s.pad(t0, ch, dur, pad_v, cutoff=1500 + 400 * lv, attack=0.08 if bar in (3, 25) else 0.4,
              release=0.6, seed=bar)
        if lv >= 1 or bar in (27, 28):
            s.pulse(t0, ch, dur, 0.18 + 0.05 * lv, cutoff=1800 + 400 * lv, every=bt / 2, seed=bar)
        if lv >= 2:
            _bassline(s, t0, dur, ch, busy=lv == 3)
        elif bar in (25, 26, 27, 28, 29, 22, 23):
            s.bass(t0, ch, dur - 0.05, 0.5)
        _groove(s, t0, dur, lv, bar)
        if bar not in (22, 23, 27, 28, 29):            # left-hand chop on the "and" of 2: bounce
            s.lh(t0 + 1.5 * bt, ch, 0.4 * bt, 0.24, "block")
    # ---------------- 0-4.5: the ask, the echo, the build
    s.hit("message sent", h("message sent"), pan(ins.pluck(note("Bb5"), 0.35, 0.12), 0.2), bus="pluck")
    s.hit("reply lands 1", h("reply lands 1"), sfx.arrive(), gain=0.8)
    _phrase(s, MOTIF_A, 0.0, bt, 0.62, name="music starts (the ask)")
    for i, (b, nm, d) in enumerate(MOTIF_ECHO):        # the machine echoes, after the typing
        s.pluck(G(2, 2) + (b - 5) * bt, nm, 0.4, decay=0.35, p=(0.35, -0.35, 0)[i])
    a, z = HITS["build"]
    s.swell(t_bloom - 0.25, (t_bloom - 0.25) - a, 0.22)
    for k in range(int((t_bloom - 0.25 - a) / (bt / 4))):      # sixteenth hats gathering
        s.hat(a + k * bt / 4, 0.05 + 0.18 * k / 16, p=0.35)
    # the eighth before the bloom is silent on purpose: everything holds its breath
    # ---------------- 4.5: THE BIG CHANGE
    s.hit("BIG CHANGE (sweep)", t_bloom, sfx.change(), kind="start", gain=1.6)
    place(s.bus["bass"], ins.thump(note("Eb2"), 0.9), t_bloom)
    s.kick(t_bloom, 0.9)
    s.hat(t_bloom, 0.25, open_=True)
    _phrase(s, MOTIF_B, G(3, 3) - 8 * bt, bt, 0.66, name=None)   # the reply lands across the hold
    # ---------------- 8-14
    s.hit("small sweep", h("small sweep"), sfx.change(), kind="start", gain=0.5)
    for k in (5, 6, 7):
        _arp(s, G(k), chords[k], 0.15)
    _phrase(s, MOTIF_A, G(6), bt, 0.55, octave=1, name=None)
    # ---------------- 14: their home
    _phrase(s, MOTIF_A, h("section: their home"), bt, 0.64, name="section: their home")
    s.hit("reply lands 2", h("reply lands 2"), sfx.arrive(), gain=0.8)
    _phrase(s, MOTIF_B[:4], G(10) - 8 * bt, bt, 0.6, name=None)
    rooms = [("Eb5", "G5", "Bb5"), ("F5", "Ab5", "C6"), ("G5", "Bb5", "Eb6"),
             ("Ab5", "C6", "F6"), ("Bb5", "Eb6", "G6"), ("C6", "Eb6", "Ab6")]
    for k, notes in enumerate(rooms):                  # six rooms build in, stepping up
        s.hit(f"room {k + 1}" if k else "six rooms build in", h("six rooms build in") + k * bt / 4,
              arrive_notes(notes, sub=(k == 0)), gain=0.45)
    for i, nm in enumerate(["G6", "Eb6", "Bb5", "G5"]):   # rearrange: a little glass shuffle down
        tt = h("rearrange") + i * bt / 4
        if i == 0:
            s.pluck_hit("rearrange", tt, nm, 0.3, 0.15, p=0.4)
        else:
            s.pluck(tt, nm, 0.3, decay=0.15, p=(-0.4 if i % 2 else 0.4))
    _phrase(s, [(12, "G5", 2.0)], G(12) - 12 * bt, bt, 0.6, name=None)
    # 25.5 the cut: a stab; then four playful accents, each a step higher
    s.hit("cut", h("cut"), ins.kick(0.9), bus="kick")
    s.kicks.append(h("cut"))
    s.snap(h("cut"), 0.5)
    acc = [("sliders grow", "Bb4"), ("lamp wiggles", "Eb5"), ("switch pops", "G5"), ("thermostat bounces", "Bb5")]
    for k, (name, nm) in enumerate(acc):
        t = h(name)
        s.piano_hit(name, t, nm, 0.18, 0.62, pedal=False, tone=0.3)
        s.pluck(t, note(nm) + 12, 0.32, decay=0.18, p=(-0.3, 0.3, -0.2, 0.2)[k])
    s.swell(h("sliders grow") + 0.35, 0.35, 0.12)                            # sliders: a short rise
    for i, d in enumerate((0.05, 0.10)):                                     # the lamp wiggles
        s.pluck(h("lamp wiggles") + d, ["F6", "Eb6"][i], 0.18, decay=0.08, p=(0.4, -0.4)[i])
    place(s.sfx, sfx.type_tick() * 0.5, h("switch pops") - 0.004)          # the switch's click
    for i, d in enumerate((0.16, 0.27)):                                     # the thermostat bounces
        s.pluck(h("thermostat bounces") + d, "Bb6", 0.2 / (i + 1), decay=0.1, p=0.2)
    # ---------------- 30: their money
    _phrase(s, MOTIF_A, h("section: their money"), bt, 0.64, name="section: their money")
    a, z = HITS["balances count up"]
    n_count = 8
    for k in range(n_count):                           # counting up, landing on the total
        nm = ["Eb5", "F5", "G5", "Ab5", "Bb5", "C6", "D6", "Eb6"][k]
        s.pluck(a + k * (z - a) / n_count, nm, 0.14 + 0.02 * k, decay=0.08, p=(-0.3 if k % 2 else 0.3))
    s.hit("balances land", z, arrive_notes(("G5", "Bb5", "Eb6")), gain=0.6)
    _phrase(s, MOTIF_B, G(18) - 8 * bt, bt, 0.62, name=None)
    s.hit("reply 'Yes. Found eleven.'", h("reply 'Yes. Found eleven.'"), sfx.arrive(), gain=0.8)
    bills = ["Eb6", "C6", "Bb5", "G5", "F5", "Eb5", "G5", "Bb5", "C6", "Eb6", "G6"]
    for k, nm in enumerate(bills):                     # eleven bills ripple in
        t = h("eleven bills ripple in") + k * 0.065
        if k == 0:
            s.pluck_hit("eleven bills ripple in", t, nm, 0.26, 0.12, p=0.4)
        else:
            s.pluck(t, nm, 0.2, decay=0.12, p=-0.5 + k / 10)
    # 43-46: the email springs up: sweet, light; drums out, piano and glass only
    a, z = HITS["email springs up"]
    s.hit("email springs up", a, arrive_notes(("Bb5", "Eb6", "G6")), gain=0.6)
    for i, nm in enumerate(["G5", "Bb5", "Eb6"]):     # the spring
        s.pluck(a + 0.06 + i * 0.07, nm, 0.2, decay=0.12, p=(-0.3, 0.3, 0)[i])
    for i, (b, nm, d) in enumerate(MOTIF_ECHO):        # the motif, sweet and high
        s.piano(a + 0.5 + (b - 5) * bt * 1.5, note(nm), d * bt * 1.5, 0.42)
    # ---------------- 46: cut back. One inhale of near-silence, then THE PEAK at 47
    s.hit("PEAK: the sweep reveals", t_peak, sfx.change(), kind="start", gain=1.8)
    place(s.bus["bass"], ins.thump(note("Eb2"), 1.0), t_peak)
    s.kick(t_peak, 1.0)
    s.hat(t_peak, 0.3, open_=True)
    s.snap(t_peak, 0.6)
    for b in (0.5, 1.0, 1.5, 2.0):                     # the peak drives harder than anything before it
        s.kick(t_peak + b, 0.95 if b in (1.0, 2.0) else 0.8)
        if b in (0.5, 1.5):
            s.snap(t_peak + b + 0.25, 0.4)
    s.pad(t_peak, "Eb", G(25) - t_peak, 0.36, cutoff=3400, attack=0.05, release=0.4, seed=240)
    s.pulse(t_peak, "Eb", G(25) - t_peak, 0.32, cutoff=3200, every=bt / 2, seed=240)
    for b, nm, d in MOTIF_A:                           # the ask, in octaves, as big as it gets
        t = t_peak + b * bt
        if b == 0:
            s.piano_hit("peak: the ask, in octaves", t, nm, d * bt, 0.76, tone=0.3)
        else:
            s.piano(t, nm, d * bt + (1.0 if b == 2 else 0), 0.74, tone=0.3)
        s.piano(t, note(nm) + 12, d * bt, 0.58, tone=0.3)
    for i, (b, nm, d) in enumerate(MOTIF_ECHO):        # settle: the machine answers
        s.pluck(h("settle") + 0.7 + (b - 5) * bt, nm, 0.38, decay=0.45, p=(0.35, -0.35, 0)[i])
    # ---------------- closing lines: confident, spacious
    s.piano_hit("closing line 1", h("closing line 1"), "C5", 1.8, 0.58)
    s.piano(h("closing line 1"), "Ab2", 2.2, 0.44)
    s.piano_hit("closing line 2", h("closing line 2"), "G5", 2.0, 0.62)
    s.piano(h("closing line 2"), "Eb3", 2.2, 0.44)
    s.piano(h("closing line 2") + 0.02, "G2", 2.2, 0.4)
    mix = s.render(dict(delay_s=0.375, gain=dict(pulse=0.24, kick=0.42, perc=0.55, pluck=0.3)), end_fade=0.0)
    t = np.arange(len(mix)) / SR
    # the breath before the bloom (an eighth of silence) and the inhale after the cut back
    mix *= _dip(t, t_bloom - 0.25, t_bloom, -18)[:, None]
    mix *= _dip(t, t_cut_back, t_peak, -16)[:, None]
    mix += _inhale(s, t_cut_back, t_peak)
    # the bed clears for the logo
    g = np.clip((h("name (logo lands)") - 0.1 - t) / 0.7, 0, 1)
    mix *= (np.sin(0.5 * np.pi * g) ** 2)[:, None]
    # typing: levelled to sit TYPING_UNDER_MUSIC_DB under the music around it, span by span
    typing_db = _type_all(s, mix)
    return s, mix + s.sfx + s.typing, typing_db


def _phrase(s, notes, at, bt, vel, octave=0, name=None):
    for i, (b, nm, d) in enumerate(notes):
        t = at + b * bt
        m = note(nm) + 12 * octave
        if i == 0 and name:
            s.piano_hit(name, t, m, d * bt, vel)
        else:
            s.piano(t, m, d * bt, vel)


def _bassline(s, t0, dur, ch, busy=True):
    root = note(VOICES[ch]["bass"])
    pat = [(0, 0, 0.35), (0.75, 0, 0.2), (1.5, 12, 0.2), (2.5, 0, 0.35), (3.25, 0, 0.12), (3.5, 12, 0.2)] if busy \
        else [(0, 0, 0.9), (2, 0, 0.9)]
    for b, iv, d in pat:
        if b * 0.5 < dur - 0.05:
            place(s.bus["bass"], ins.sub(root + iv, d * 2 if busy else d, 0.8), t0 + b * 0.5)


def _groove(s, t0, dur, lv, bar):
    bt = 0.5
    for k in range(16):
        tt = t0 + k * bt / 4
        if tt >= t0 + dur - 1e-6:
            break
        if lv >= 1 and k % 2 == 0:
            s.hat(tt, 0.26 if k % 4 == 2 else 0.12, p=0.3)
        if lv >= 1 and k % 4 == 3:
            s.shaker(tt, 0.14)
        if lv == 3 and k % 2 == 1:
            s.hat(tt, 0.06, p=0.3)
    if lv >= 2:
        for b in ((0, 1.5, 2.5) if lv == 3 else (0, 2)):
            if b * bt < dur:
                s.kick(t0 + b * bt, 0.9 if b == 0 else 0.75)
    if lv == 3:
        for b in (1, 3):
            if b * bt < dur:
                s.snap(t0 + b * bt, 0.5)


def _arp(s, t0, ch, vel):
    arp = {"Eb": ["Eb5", "Bb5", "F5", "G5"], "Cm7": ["C5", "G5", "Eb5", "Bb5"],
           "Abmaj7": ["Ab4", "Eb5", "C5", "G5"]}[ch]
    for k in range(16):
        s.pluck(t0 + k * 0.125, arp[k % 4], vel + 0.05 * (k % 4 == 0), decay=0.12, p=(-0.5 if k % 2 else 0.5))


def _dip(t, a, z, depth_db):
    """Pull the music right down between a and z (20 ms ramps): deliberate silence."""
    d = undb(depth_db)
    return np.interp(t, [a - 0.02, a, z - 0.02, z], [1.0, d, d, 1.0])


def _inhale(s, a, z):
    """The inhale after the cut back: only a soft rising air swell, alone in the silence."""
    x = np.zeros((s.n, 2))
    place(x, ins.swell(z - a, 300, 9000, 0.16, seed=46), a)
    return x * 0.35


def _type_all(s, music):
    """Typing runs, each scaled so the ticks sit TYPING_UNDER_MUSIC_DB under the music there."""
    out = {}
    for k, v in HITS.items():
        if not k.startswith("typing"):
            continue
        a, z = v
        tmp = Score(LENGTH)
        tmp.type_run(a, z, seed=int(a * 10) + 1)
        i0, i1 = int(a * SR), int((max(z, a + 0.4) + 0.1) * SR)
        ml = lufs(music[i0:i1])
        tl = lufs(tmp.typing[i0:i1])
        g = undb((ml - TYPING_UNDER_MUSIC_DB) - tl)
        s.typing += tmp.typing * g
        s.hits.append((k, a, a, tmp.hits[0][3] * g, "attack"))
        out[k] = dict(music_lufs=round(ml, 1), typing_lufs=round(tl + 20 * np.log10(g), 1),
                      under_db=round(ml - (tl + 20 * np.log10(g)), 1))
    return out
