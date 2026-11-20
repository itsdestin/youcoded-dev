"""The playful demo (20 s, 120 BPM) with interchangeable backings.

`foreground()` lays down everything that is the SAME in every version: the piano (tune, left
hand, bar 8-9 lines), the glass echo of the motif, the pads, the pulse pad's notes and the air
swell. Each version then adds its own backing (drums, bass, synths, strings or a second piano)
and its own mix settings. The original backing is `orig_groove` + `orig_bass`, copied note for
note from the chosen candidate's arrange.playful(), so version 0 can be rebuilt and compared.
"""
import numpy as np

import arrange
import instruments as ins
import kit
from arrange import MOTIF_A, MOTIF_B, MOTIF_ECHO, VOICES, Piece, _fade_region, ir
from dsp import (SR, biquad, butter, compress, convolve, fade, note, pan, pingpong, place, rng,
                 sat)
from master import lufs

PROG = ["Eb", "Cm7", "Abmaj7", "Eb", "Eb", "Cm7", "Abmaj7", "Eb/G", "Ab"]
STOP = {7: 2.0, 9: 3.5}          # bar 7: the mischievous stop; bar 9: the logo pickup
EXTRA_BUSES = ["piano2", "synth", "strings"]
BUSES = arrange.BUSES + EXTRA_BUSES
LOGO_AT = 17.5


def bar(k):
    return 4 * (k - 1)


class Play(Piece):
    def __init__(self, seed=0):
        super().__init__(120, 20.0)
        for b in EXTRA_BUSES:
            self.bus[b] = np.zeros((self.n, 2))
        self.side = []           # extra sidechain trigger times (s), besides self.kicks
        self.r = rng(seed)       # humanising, seeded: identical on every render

    def put(self, bus, x, beat, p=0.0, gain=1.0, jitter=0.0):
        """Place a sound on a bus at a beat; mono sounds are panned; `jitter` (s) humanises."""
        if x.ndim == 1:
            x = pan(x, p)
        dt = self.r.normal(0, jitter) if jitter else 0.0
        place(self.bus[bus], x, self.t(beat) + dt, gain)

    def ok(self, k, b):
        s = STOP.get(k)
        return s is None or b < s - 1e-9


# ================================================================ shared foreground

ARP_GLASS = {"Eb": ["Eb5", "Bb5", "F5", "G5"], "Cm7": ["C5", "G5", "Eb5", "Bb5"],
             "Abmaj7": ["Ab4", "Eb5", "C5", "G5"], "Eb/G": ["G4", "Eb5", "Bb4", "F5"],
             "Ab": ["Ab4", "Eb5", "C5", "Bb4"]}


def foreground(p, glass_arps=True):
    """Everything in front of (and around) the backing; identical in every version."""
    for k, ch in enumerate(PROG, start=1):
        b0 = bar(k)
        p.pulse(b0, ch, 4, 0.30 if k > 2 else 0.2, cutoff=1500 + 250 * min(k, 6), every=0.5, seed=k)
        p.lh(b0, ch, 0.9, 0.3, "block")
        p.lh(b0 + 1.5, ch, 0.4, 0.22, "block")
    p.pad(bar(1), "Eb", 8, 0.18, cutoff=900, attack=3.0)
    p.phrase(MOTIF_A, bar(1), vel=0.62, tone=0.3)
    for b, nm, d in MOTIF_ECHO:
        p.pluck(b, nm, 0.5, decay=0.3, motif=True, p=(-0.3 if nm == "G6" else 0.3))
    p.phrase(MOTIF_B, 0, vel=0.65, tone=0.3)
    p.phrase(MOTIF_A, bar(5), octave=1, vel=0.68, tone=0.2, double=-1)
    if glass_arps:
        for k in (5, 6, 8):
            ch = PROG[k - 1]
            for s in range(16):
                p.pluck(bar(k) + s * 0.25, ARP_GLASS[ch][s % 4], 0.15 + 0.06 * (s % 4 == 0), decay=0.14,
                        p=(-0.5 if s % 2 else 0.5))
    p.phrase([(b - 8, nm, d) for b, nm, d in MOTIF_B[:2]], bar(7), vel=0.62)
    for i, nm in enumerate(["Bb5", "Ab5"]):
        p.pluck(bar(7) + 2.5 + i * 0.75, nm, 0.55, decay=0.25, motif=True, p=(0.4, -0.4)[i])
    p.swell(bar(8), 1.0, 0.25)
    p.phrase([(0, "G5", 4.0)], bar(8), vel=0.72, tone=0.3)
    p.piano(bar(8) + 2, "Bb5", 1.0, 0.5)
    p.piano(bar(8) + 3, "Ab5", 1.0, 0.5)
    p.phrase([(0, "C6", 1.0), (1, "Bb5", 1.0), (2, "Ab5", 1.0)], bar(9), vel=0.58, motif=False)


def root(k):
    return note(VOICES[PROG[k - 1]]["bass"])


# ================================================================ the original backing

def orig_groove(p):
    """Copied from arrange.playful(): hats, shaker, kick (0, 1.5, 2.5), snap (1, 3), fill."""
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

    groove(1, full=False)
    for k in range(2, 10):
        groove(k, True, stop_at=STOP.get(k))
    for s in (2.75, 3.0, 3.25):
        p.snap(bar(9) + s, 0.35 + 0.1 * (s - 2.75))


def orig_bass(p):
    """The bouncing octave sub line (bars 2-9, silent in bar 7) and the Bb under bar 9."""
    for k in range(2, 10):
        if k == 7:
            continue
        b0 = bar(k)
        r = VOICES[PROG[k - 1]]["bass"]
        up = note(r) + 12
        for b, nm, d in [(0, r, 0.7), (0.75, r, 0.4), (1.5, up, 0.4), (2.5, r, 0.7), (3.25, r, 0.25), (3.5, up, 0.4)]:
            place(p.bus["bass"], ins.sub(note(nm) if isinstance(nm, str) else nm, p.t(d), 0.8), p.t(b0 + b))
    place(p.bus["bass"], ins.sub(note("Bb1"), p.t(1.4), 0.8), p.t(bar(9) + 2))


def calm_bass(p, pickups=False, long=False, vel=0.8):
    """A steadier sub: the bar's root on beat 1 (and again on the 'and' of 3), no octave
    bouncing. `long` holds one note per bar. Same silence in bar 7, same Bb under bar 9."""
    for k in range(2, 10):
        if k == 7:
            continue
        b0 = bar(k)
        r = root(k)
        notes = [(0, r, 3.85)] if long else [(0, r, 2.3), (2.5, r, 0.9)]
        if pickups and not long and k % 2 == 0:
            notes.append((3.5, r + 12, 0.4))
        if k == 9:
            notes = [(0, r, 1.9)]
        for b, m, d in notes:
            place(p.bus["bass"], ins.sub(m, p.t(d), vel), p.t(b0 + b))
    place(p.bus["bass"], ins.sub(note("Bb1"), p.t(1.4), vel), p.t(bar(9) + 2))


# ================================================================ backings: softer drums

def soft_thump(p):
    """4: same rhythm as the original kick, but a felt thump; brushes for the snap; a shaker."""
    for k in range(1, 10):
        b0 = bar(k)
        for s in range(0, 16, 2):            # eighth-note shaker, the only "hat"
            if p.ok(k, s * 0.25):
                v = (0.09 if k == 1 else 0.13) + (0.05 if s % 4 == 2 else 0)
                p.put("perc", ins.shaker(v, seed=k * 16 + s), b0 + s * 0.25, p=-0.3, jitter=0.003)
        if k == 1:
            continue
        for b in (0, 1.5, 2.5):
            if p.ok(k, b):
                p.put("kick", kit.felt_thump(0.95 if b == 0 else 0.75, seed=k * 4 + int(b * 2)), b0 + b)
                p.side.append(p.t(b0 + b))
        for b in (1, 3):
            if p.ok(k, b):
                p.put("perc", kit.brush(0.35, seed=k * 4 + int(b)), b0 + b, p=0.15, jitter=0.004)
    for s in (2.75, 3.0, 3.25):
        p.put("perc", kit.brush(0.22 + 0.1 * (s - 2.75) * 4, seed=int(s * 8)), bar(9) + s, p=0.15)


def piano_drum(p):
    """5: no drums at all. Kick = a palm-muted low piano note + a knock on the piano's case;
    backbeat = a muted mid chord with the key noise; hats = key noise and tiny damped high notes."""
    for k in range(1, 10):
        b0 = bar(k)
        ch = PROG[k - 1]
        for s in range(16):
            b = s * 0.25
            if not p.ok(k, b) or (k == 1 and s % 2):
                continue
            v = 0.32 if s % 4 == 2 else (0.2 if s % 2 == 0 else 0.13)
            p.put("piano2", ins.tick(v * (0.7 if k == 1 else 1.0), seed=k * 16 + s), b0 + b,
                  p=(0.35 if s % 2 else 0.15), jitter=0.003)
            if s % 4 == 2 and k > 1:
                p.put("piano2", kit.damped_high(root(k) % 12 + 84, 0.22), b0 + b, p=0.3)
        if k == 1:
            continue
        for b in (0, 1.5, 2.5):
            if p.ok(k, b):
                v = 0.62 if b == 0 else 0.5
                p.put("piano2", kit.muted_piano(root(k) + 12, v, tau=0.07, lp=650), b0 + b, p=0.0)
                p.put("piano2", kit.body_knock(v * 0.9, seed=k * 4 + int(b * 2)), b0 + b, p=0.0)
                p.side.append(p.t(b0 + b))
        for b in (1, 3):
            if p.ok(k, b):
                lh = VOICES[ch]["lh"]
                for i, nm in enumerate(lh[1:]):
                    p.put("piano2", kit.muted_piano(note(nm), 0.5, tau=0.045, lp=3000), b0 + b + 0.005 * i, p=-0.15)
                p.put("piano2", ins.tick(0.5, seed=k * 3 + int(b)), b0 + b, p=-0.1)
    for i, s in enumerate((2.75, 3.0, 3.25)):
        p.put("piano2", kit.body_knock(0.35 + 0.1 * i, seed=40 + i), bar(9) + s)
        p.put("piano2", ins.tick(0.4 + 0.1 * i, seed=50 + i), bar(9) + s, p=-0.1)


def deep_sub(p):
    """6: no kick at all. A long, soft 808-style sub note leads each bar (it IS the bass);
    tiny crisp ticks on top; the snap on 2 and 4 kept, quieter."""
    for k in range(2, 10):
        b0 = bar(k)
        r = root(k)
        if k == 7:
            notes = [(0, r, 1.8)]
        elif k == 9:
            notes = [(0, r, 1.9), (2, note("Bb1"), 1.4)]
        else:
            notes = [(0, r, 2.3), (2.5, r, 1.3)]
        for b, m, d in notes:
            place(p.bus["bass"], kit.sub808(m, p.t(d), 0.9 if b == 0 else 0.7), p.t(b0 + b))
            if b == 0:
                p.side.append(p.t(b0 + b))
    for k in range(1, 10):
        b0 = bar(k)
        for s in range(16):
            b = s * 0.25
            if not p.ok(k, b) or (k == 1 and s % 2):
                continue
            v = 0.34 if s % 4 == 2 else (0.2 if s % 2 == 0 else 0.11)
            p.put("perc", kit.micro_tick(v, seed=k * 16 + s), b0 + b, p=(0.35 if s % 2 else -0.2), jitter=0.002)
        if k > 1:
            for b in (1, 3):
                if p.ok(k, b):
                    p.snap(b0 + b, 0.38)
    for s in (2.75, 3.0, 3.25):
        p.snap(bar(9) + s, 0.25 + 0.1 * (s - 2.75))


EB5, EB6 = 622.25, 1244.5   # WHY E-flats: in key, and clear of the tune's notes and overtones


def clockwork(p):
    """7: the app's typing tick grown into a groove. A lower woodblock 'tock' plays the old
    kick rhythm, a higher 'tick' block the backbeat, key ticks run the sixteenths, a little
    winding ratchet leads into bar 5. No low drum at all."""
    for k in range(1, 10):
        b0 = bar(k)
        for s in range(16):
            b = s * 0.25
            if not p.ok(k, b) or (k == 1 and s % 2):
                continue
            v = 0.3 if s % 4 == 2 else (0.2 if s % 2 == 0 else 0.12)
            p.put("perc", ins.tick(v, seed=k * 16 + s), b0 + b, p=(0.3 if s % 2 else -0.3), jitter=0.0015)
        if k == 1:
            continue
        for b in (0, 1.5, 2.5):
            if p.ok(k, b):
                p.put("perc", kit.woodblock(EB5, 0.55 if b == 0 else 0.42, decay=0.035, seed=k + b), b0 + b, p=-0.1)
        for b in (1, 3):
            if p.ok(k, b):
                p.put("perc", kit.woodblock(EB6, 0.42, decay=0.022, seed=k * 2 + b), b0 + b, p=0.2)
    for i in range(8):   # the winding ratchet: 32nds rising into bar 5
        p.put("perc", ins.tick(0.08 + 0.03 * i, seed=90 + i), bar(4) + 3 + i * 0.125, p=0.4)
    for i, s in enumerate((2.75, 3.0, 3.25)):
        p.put("perc", kit.woodblock((EB6, EB5, EB6)[i], 0.35 + 0.08 * i, decay=0.03, seed=60 + i), bar(9) + s)


def half_time(p):
    """8: same tempo, half the hits. A deep soft thump on beat 1, one soft snap on beat 3 with
    a big room, a shaker breathing on the off-beats, an open hat once a bar."""
    for k in range(1, 10):
        b0 = bar(k)
        for s in range(2, 16, 4):
            if p.ok(k, s * 0.25):
                p.put("perc", ins.shaker(0.07 if k == 1 else 0.1, seed=k * 16 + s), b0 + s * 0.25, p=-0.35, jitter=0.004)
        if k == 1:
            continue
        p.put("kick", kit.felt_thump(0.95, f0=52, decay=0.17, seed=k), b0)
        p.side.append(p.t(b0))
        if k in (4, 8):
            p.put("kick", kit.felt_thump(0.45, f0=52, decay=0.12, seed=k + 20), b0 + 3.5)
            p.side.append(p.t(b0 + 3.5))
        if p.ok(k, 2):
            p.snap(b0 + 2, 0.55)
        if p.ok(k, 3.5):
            p.put("perc", ins.hat(0.13, open_=True, seed=k % 7), b0 + 3.5, p=0.3)
    for s in (2.75, 3.0, 3.25):
        p.snap(bar(9) + s, 0.22 + 0.1 * (s - 2.75))


# ================================================================ backings: synths

ARP_LOW = {"Eb": ["Eb3", "G3", "Bb3", "Eb4"], "Cm7": ["C3", "G3", "Bb3", "Eb4"],
           "Abmaj7": ["Ab2", "Eb3", "G3", "C4"], "Eb/G": ["G2", "Eb3", "G3", "Bb3"],
           "Ab": ["Ab2", "Eb3", "Ab3", "C4"]}
ARP_STEPS = [0, 1, 2, 3, 2, 1, 2, 3]


def _arp(p, level=1.0, first_bar=1, cut0=450.0, cut1=2600.0, every=0.25):
    """A warm 16th-note arpeggio under the tune whose filter opens bar by bar."""
    for k in range(first_bar, 10):
        b0 = bar(k)
        tones = [note(n) for n in ARP_LOW[PROG[k - 1]]]
        steps = int(round(4 / every))
        for s in range(steps):
            b = s * every
            if not p.ok(k, b):
                continue
            # the filter opens with the piece: exponential from cut0 (bar 1) to cut1 (bar 8)
            frac = min(1.0, (k - 1 + b / 4) / 7.5)
            cutoff = cut0 * (cut1 / cut0) ** frac
            acc = b in (0, 1.5, 2.5)           # accents echo the original kick's rhythm
            v = (0.55 if acc else 0.36) * (0.7 if k == 1 else 1.0) * level
            m = tones[ARP_STEPS[int(round(b / 0.25)) % 8]]
            p.put("synth", kit.arp_voice(m, v, cutoff=cutoff, gate=0.09, seed=k * 31 + s),
                  b0 + b, p=(-0.3 if s % 2 else 0.3))


def synth_arp(p):
    """9: a bubbling analog-style arpeggio drives it; calm sub under; the softest thump."""
    _arp(p)
    for k in range(2, 10):
        p.put("kick", kit.felt_thump(0.5, f0=58, decay=0.09, seed=k), bar(k))
        p.side.append(p.t(bar(k)))


def synth_bass_drive(p):
    """10: a plucky, rounded, slightly gritty synth bass line is the engine; tiny off-beat ticks."""
    pat = [(0, 0, 0.45, 0.95), (0.75, 0, 0.2, 0.6), (1.0, 12, 0.2, 0.7), (1.5, 0, 0.4, 0.85),
           (2.25, 0, 0.2, 0.55), (2.5, 7, 0.4, 0.8), (3.0, 12, 0.2, 0.65), (3.5, 0, 0.2, 0.7), (3.75, 12, 0.2, 0.55)]
    for k in range(2, 10):
        b0 = bar(k)
        r = root(k)
        frac = (k - 2) / 7
        for b, iv, d, v in pat:
            if not p.ok(k, b):
                continue
            m = r + iv
            if k == 9 and b >= 2:
                m = note("Bb1") + iv
            p.put("synth", kit.synth_bass(m, p.t(d), v, cutoff=200 + 160 * frac, seed=k * 9 + int(b * 4)), b0 + b)
    for k in range(1, 10):
        for s in range(2, 16, 4):
            if p.ok(k, s * 0.25):
                p.put("perc", kit.micro_tick(0.28 if k > 1 else 0.18, seed=k * 16 + s), bar(k) + s * 0.25, p=0.3, jitter=0.002)


# ================================================================ backings: strings

def _h(p, sd=0.06):
    """Humanised velocity offset."""
    return float(p.r.normal(0, sd))


def strings_staccato(p):
    """11: energetic chamber strings. Violins drive sixteenths on one held-in-common tone,
    violas the eighths, cellos the old kick rhythm on the root; all spiccato, humanised."""
    vln_tone = {"Eb": "G4", "Cm7": "G4", "Abmaj7": "G4", "Eb/G": "G4", "Ab": "Ab4"}
    vla = {"Eb": ["Bb3", "Eb4"], "Cm7": ["C4", "Eb4"], "Abmaj7": ["C4", "Eb4"], "Eb/G": ["Bb3", "Eb4"],
           "Ab": ["C4", "Eb4"]}
    rr = 0
    for k in range(1, 10):
        b0 = bar(k)
        ch = PROG[k - 1]
        lift = 0.0 if k < 5 else 0.06
        for s in range(8):                       # violas: eighths, alternating two tones
            b = s * 0.5
            if p.ok(k, b):
                v = (0.42 if k == 1 else 0.5) + (0.08 if s % 2 == 0 else 0) + lift + _h(p)
                p.put("strings", kit.string_note("vla", "spic", note(vla[ch][s % 2]), v, rr=rr), b0 + b,
                      p=0.25, jitter=0.006)
                rr += 1
        if k == 1:
            continue
        for s in range(16):                      # violins: sixteenths, accented 3+3+2
            b = s * 0.25
            if p.ok(k, b):
                acc = b in (0, 0.75, 1.5, 2.5, 3.25)
                v = (0.6 if acc else 0.4) + lift + _h(p)
                p.put("strings", kit.string_note("vln", "spic", note(vln_tone[ch]), v, rr=rr), b0 + b,
                      p=-0.3, jitter=0.005)
                rr += 1
        for b in (0, 1.5, 2.5):                  # cellos: the old kick rhythm, on the root
            if p.ok(k, b):
                p.put("strings", kit.string_note("vc", "spic", root(k) + 12, 0.65 + _h(p), rr=rr), b0 + b,
                      p=0.05, jitter=0.005)
                rr += 1
    for i, s in enumerate((2.75, 3.0, 3.25)):    # the fill: violins climb into the logo
        p.put("strings", kit.string_note("vln", "spic", note(("Eb4", "F4", "G4")[i]), 0.55 + 0.08 * i, rr=i),
              bar(9) + s, p=-0.3)


def strings_pizzicato(p):
    """12: light and witty plucked strings. Cello pizz on the root (beat 1, the 'and' of 2,
    the 'and' of 3), violas pluck the off-beat chords, violins add little answering pizz
    figures in the gaps of the tune."""
    vla = {"Eb": ["G3", "Bb3"], "Cm7": ["G3", "Eb4"], "Abmaj7": ["Ab3", "C4"], "Eb/G": ["G3", "Bb3"],
           "Ab": ["Ab3", "C4"]}
    figs = {2: [(3.0, "Eb4"), (3.5, "G4")], 4: [(2.5, "Bb3"), (3.0, "Eb4"), (3.5, "G4")],
            6: [(2.5, "G4"), (3.0, "Eb4"), (3.5, "C4")], 8: [(2.0, "Eb4"), (2.5, "G4"), (3.0, "Bb4"), (3.5, "G4")]}
    rr = 0
    for k in range(1, 10):
        b0 = bar(k)
        ch = PROG[k - 1]
        for b in (0.5, 1.5, 2.5, 3.5):
            if p.ok(k, b) and not (k == 1 and b in (0.5, 2.5)):
                for i, nm in enumerate(vla[ch]):
                    v = 0.5 + (0.06 if b in (1.5, 3.5) else 0) + _h(p)
                    p.put("strings", kit.string_note("vla", "pizz", note(nm), v, rr=rr + i), b0 + b + 0.008 * i,
                          p=0.3, jitter=0.006)
                rr += 1
        if k == 1:
            continue
        for b, iv in ((0, 0), (1.5, 0), (2.5, 12)):
            if p.ok(k, b):
                p.put("strings", kit.string_note("vc", "pizz", root(k) + 12 + iv, 0.7 + _h(p), rr=rr), b0 + b,
                      p=0.0, jitter=0.005)
                rr += 1
        for b, nm in figs.get(k, []):
            if p.ok(k, b):
                p.put("strings", kit.string_note("vln", "pizz", note(nm), 0.5 + _h(p), rr=rr), b0 + b,
                      p=-0.35, jitter=0.006)
                rr += 1
    for i, s in enumerate((2.75, 3.0, 3.25)):
        p.put("strings", kit.string_note("vln", "pizz", note(("Bb3", "Eb4", "G4")[i]), 0.5 + 0.08 * i, rr=i),
              bar(9) + s, p=-0.3)


def _swell(sec, m, dur_s, v0, v1, attack, seed):
    """A sustained string note that grows: the soft and loud recordings crossfade as it swells,
    so the tone gets richer, not just louder."""
    soft = kit.string_note(sec, "sus", m, 0.3, dur=dur_s, rr=seed, release=0.35)
    loud = kit.string_note(sec, "sus", m, 0.8, dur=dur_s, rr=seed, release=0.35)
    n = min(len(soft), len(loud))
    t = np.arange(n) / SR
    c = np.clip(t / max(dur_s, 0.1), 0, 1) ** 1.5
    lvl = (v0 + (v1 - v0) * np.clip(t / attack, 0, 1) ** 0.8)
    soft_g, loud_g = 10 ** ((0.3 - 0.7) * 18 / 20), 10 ** ((0.8 - 0.7) * 18 / 20)
    # WHY divide by layer gains: crossfade timbre only; loudness follows `lvl`
    x = soft[:n] / soft_g * (1 - c)[:, None] + loud[:n] / loud_g * c[:, None]
    x *= lvl[:, None]
    return fade(x, fin=0.01, fout=0.05)


def strings_swell(p):
    """13: no rhythm section. Violins and violas hold long lines that swell bar by bar and lift
    into the second half; sub holds each root. Momentum from harmony and dynamics, not beats."""
    vln = ["G4", "G4", "Ab4", "G4", "G4", "G4", "G4", "G4", "Ab4"]
    vla = ["Bb3", "C4", "C4", "Bb3", "Bb3", "C4", "C4", "Bb3", "C4"]
    hi = {5: "Bb4", 6: "Bb4"}           # the lift: violins divide while the tune is up high
    for k in range(1, 10):
        b0 = bar(k)
        beats = STOP.get(k, 4.0)
        if k == 9:
            beats = 2.0
        d = p.t(beats) + 0.05
        grow = min(1.0, (k - 1) / 7)
        v0, v1 = 0.12 + 0.18 * grow, 0.3 + 0.45 * grow
        if k in (4, 8):
            v1 += 0.12                  # each four-bar phrase swells into its end
        p.put("strings", _swell("vln", note(vln[k - 1]), d, v0, v1, 1.6, k), b0, p=-0.3)
        p.put("strings", _swell("vla", note(vla[k - 1]), d, v0 * 0.9, v1 * 0.9, 1.6, k + 9), b0, p=0.3)
        if k in hi:
            p.put("strings", _swell("vln", note(hi[k]), d, v0 * 0.7, v1 * 0.8, 1.8, k + 20), b0, p=-0.5)
    # bar 9 beat 3: the strings move to B-flat as the sub does, then release for the logo
    p.put("strings", _swell("vln", note("Bb4"), p.t(1.4), 0.5, 0.6, 0.5, 40), bar(9) + 2, p=-0.3)
    p.put("strings", _swell("vla", note("D4"), p.t(1.4), 0.45, 0.55, 0.5, 41), bar(9) + 2, p=0.3)


# ================================================================ backings: pianos

def _ostinato(p, level=1.0, first_bar=1):
    """A second piano, low and palm-muted, playing an eighth-note ostinato on the root and
    fifth, accented on the old kick rhythm, plus short muted chord chops on beats 2 and 4."""
    for k in range(first_bar, 10):
        b0 = bar(k)
        r = root(k) + 12
        if r < note("Ab2"):
            r += 12
        shape = [r, r + 7, r + 12, r + 7, r, r + 7, r + 12, r + 7]
        for s in range(8):
            b = s * 0.5
            if not p.ok(k, b):
                continue
            acc = b in (0, 1.5, 2.5)
            v = (0.5 if acc else 0.36) * (0.75 if k == 1 else 1.0) * level + _h(p, 0.03)
            p.put("piano2", kit.muted_piano(shape[s], v, tau=0.13, lp=1400), b0 + b, p=-0.2, jitter=0.004)
        if k == 1:
            continue
        for b in (1, 3):
            if p.ok(k, b):
                for i, nm in enumerate(VOICES[PROG[k - 1]]["lh"][1:]):
                    p.put("piano2", kit.muted_piano(note(nm), 0.42 * level, tau=0.06, lp=2600),
                          b0 + b + 0.006 * i, p=0.25, jitter=0.003)


def two_pianos(p):
    """14: a second piano is the rhythm section."""
    _ostinato(p)
    for i, s in enumerate((2.75, 3.0, 3.25)):
        p.put("piano2", kit.muted_piano(note(("Bb2", "D3", "F3")[i]), 0.45 + 0.06 * i, tau=0.1, lp=1600), bar(9) + s)


def hybrid(p):
    """15: second-piano ostinato + a lighter, eighth-note synth arp that opens over the piece +
    a soft thump on beat 1 and the 'and' of 3."""
    _ostinato(p, level=0.85)
    _arp(p, level=0.8, first_bar=3, cut0=700, cut1=2400, every=0.5)
    for k in range(2, 10):
        for b in (0, 2.5):
            if p.ok(k, b):
                p.put("kick", kit.felt_thump(0.75 if b == 0 else 0.55, f0=60, decay=0.1, seed=k * 2 + int(b)), bar(k) + b)
                p.side.append(p.t(bar(k) + b))


# ================================================================ versions

GENTLE = (0.5, 0.09, 0.5)      # pulse pad: a gentler breath than the original (0.8 deep)

VERSIONS = {
    "0-original": dict(backing=[orig_groove, orig_bass], cfg={}),
    "1-no-kick": dict(backing=[orig_groove, orig_bass], cfg=dict(mute={"kick"})),
    "2-no-drums": dict(backing=[orig_groove, orig_bass], cfg=dict(mute={"kick", "perc"})),
    "3-no-pulse": dict(backing=[orig_groove, orig_bass],
                       cfg=dict(pump=None, duck=dict(pad=0.0, bass=0.0), match={"pulse", "bass"})),
    "4-soft-thump": dict(backing=[soft_thump, orig_bass],
                         cfg=dict(pump=GENTLE, duck=dict(pad=0.2, bass=0.3), target=dict(kick=-22.5, perc=-31.0))),
    "5-piano-is-the-drum": dict(backing=[piano_drum, orig_bass],
                                cfg=dict(pump=GENTLE, duck=dict(pad=0.15, bass=0.25), target=dict(piano2=-23.0))),
    "6-deep-sub": dict(backing=[deep_sub],
                       cfg=dict(pump=GENTLE, duck=dict(pad=0.2, bass=0.0), target=dict(bass=-21.0, perc=-28.0))),
    "7-clockwork": dict(backing=[clockwork, orig_bass],
                        cfg=dict(pump=GENTLE, duck=dict(pad=0.0, bass=0.0), target=dict(perc=-27.0),
                                 room=dict(perc=0.15), hall=dict(perc=0.05))),
    "8-half-time": dict(backing=[half_time, lambda p: calm_bass(p, pickups=True)],
                        cfg=dict(pump=(0.6, 0.16, 1.0), duck=dict(pad=0.3, bass=0.35), side_recover=0.2,
                                 target=dict(kick=-22.0, perc=-28.0), hall=dict(perc=0.35))),
    "9-synth-arp": dict(backing=[synth_arp, calm_bass], glass_arps=False,
                        cfg=dict(pump=GENTLE, duck=dict(pad=0.1, bass=0.2), target=dict(synth=-24.0, kick=-27.0),
                                 delay=dict(synth=0.18), hall=dict(synth=0.2))),
    "10-synth-bass-drive": dict(backing=[synth_bass_drive],
                                cfg=dict(pump=GENTLE, duck=dict(pad=0.0, bass=0.0), target=dict(synth=-20.5, perc=-30.0))),
    "11-strings-staccato": dict(backing=[strings_staccato, lambda p: calm_bass(p, vel=0.7)], glass_arps=False,
                                cfg=dict(pump=GENTLE, duck=dict(pad=0.0, bass=0.0), target=dict(strings=-21.5),
                                         hall=dict(strings=0.25), room=dict(strings=0.1))),
    "12-strings-pizzicato": dict(backing=[strings_pizzicato, lambda p: calm_bass(p, vel=0.6)], glass_arps=False,
                                 cfg=dict(pump=GENTLE, duck=dict(pad=0.0, bass=0.0), target=dict(strings=-22.0),
                                          hall=dict(strings=0.3), room=dict(strings=0.1))),
    "13-strings-swell": dict(backing=[strings_swell, lambda p: calm_bass(p, long=True, vel=0.7)], glass_arps=False,
                             cfg=dict(mute={"pulse"}, duck=dict(pad=0.0, bass=0.0), target=dict(strings=-21.0),
                                      hall=dict(strings=0.35))),
    "14-two-pianos": dict(backing=[two_pianos, calm_bass],
                          cfg=dict(pump=GENTLE, duck=dict(pad=0.0, bass=0.0), target=dict(piano2=-22.0),
                                   hall=dict(piano2=0.15), room=dict(piano2=0.08))),
    "15-piano-and-synth-hybrid": dict(backing=[hybrid, calm_bass], glass_arps=False,
                                      cfg=dict(pump=GENTLE, duck=dict(pad=0.15, bass=0.25),
                                               target=dict(piano2=-23.5, synth=-27.0, kick=-25.5),
                                               delay=dict(synth=0.18), hall=dict(synth=0.2, piano2=0.15))),
}

EXTRA = dict(gain=dict(piano2=1.0, synth=1.0, strings=1.0),
             hall=dict(piano2=0.15, synth=0.15, strings=0.3),
             room=dict(piano2=0.08, synth=0.0, strings=0.05))


def build(name):
    """Return (raw mix, piece, stems) for one version. Respects arrange.MODE ("backing" mode
    leaves out the motif notes, for the melody-margin measurement)."""
    v = VERSIONS[name]
    p = Play(seed=7)
    foreground(p, glass_arps=v.get("glass_arps", True))
    for fn in v["backing"]:
        fn(p)
    mix = render(p, v["cfg"])
    mix = _fade_region(mix, 17.25, 17.85)
    return mix, p


def _merge(cfg):
    c = {k: (dict(val) if isinstance(val, dict) else val) for k, val in arrange.DEFAULT.items()}
    for k, val in EXTRA.items():
        c[k].update(val)
    # WHY: the original playful demo's own mix levels (arrange.playful's render call)
    c["gain"].update(pulse=0.26, kick=0.46, perc=0.6, pluck=0.3)
    for k in ("gain", "hall", "room", "delay", "duck"):
        c[k].update(cfg.get(k, {}))
    return c


def render(p, cfg):
    """Mirror of arrange.Piece.render (same sends, same reverbs) with switches for the tests:
    `mute` silences buses (their sidechain still pumps), `pump` sets the pulse pad's breathing
    (None = steady), `match` keeps a de-pumped bus at the same average level, `target` sets a
    backing bus to a stem loudness (LUFS) so levels are chosen by number, not by guess."""
    c = _merge(cfg)
    n = p.n
    side = sorted(p.kicks + p.side)
    duck = ins.duck_env(n, side, depth=1.0, recover=cfg.get("side_recover", 0.12)) if side else np.ones(n)
    pump = cfg.get("pump", (0.8, 0.09, 0.5))
    mute = cfg.get("mute", set())
    stems = {}
    for b in BUSES:
        x = p.bus[b].copy()
        ref = None
        if b == "pulse" and p.pulse_hits:
            ref = x * ins.duck_env(n, p.pulse_hits, depth=0.8, recover=0.09)[:, None]   # the original
            if pump is None:
                pass
            elif pump == (0.8, 0.09, 0.5):
                x = ref
            else:
                depth, rec, every = pump
                hits = [p.t(k) for k in np.arange(0, 36, every)]
                x *= ins.duck_env(n, hits, depth=depth, recover=rec)[:, None]
        dk = c["duck"].get(b, 0.0)
        if b == "bass":
            ref = x * (1 - 0.45 * (1 - duck))[:, None] if side else x
        if dk:
            x *= (1 - dk * (1 - duck))[:, None]
        if b in cfg.get("match", ()) and ref is not None and np.abs(x).max() > 0:
            # WHY: removing the pump/duck raises a bus's average level; match it back so the test
            # changes only the movement, not the balance
            x *= np.sqrt((ref ** 2).mean() / (x ** 2).mean())
        if b == "piano":
            x = compress(x, -26, 1.6, 0.01, 0.2)
        if b == "bass":
            x = sat(x * 1.2, 1.0)
        if b in ("strings", "piano2", "synth") and np.abs(x).max() > 0:
            x = compress(x, -24, 1.5, 0.01, 0.15)   # gentle glue, like the piano bus
        g = c["gain"][b]
        tgt = cfg.get("target", {}).get(b)
        if tgt is not None and np.abs(x).max() > 0:
            g = 10 ** ((tgt - lufs(x)) / 20)
        stems[b] = np.zeros_like(x) if b in mute else x * g
    hall_in = sum(stems[b] * c["hall"].get(b, 0) for b in BUSES)
    room_in = sum(stems[b] * c["room"].get(b, 0) for b in BUSES)
    dly = np.zeros((n, 2))
    for b, amt in c["delay"].items():
        if amt:
            dly += pingpong(stems[b], p.t(0.75), fb=0.42, n=6) * amt
    hall_in = hall_in + dly * 0.5
    hall = convolve(butter(hall_in, "highpass", 180, 2), ir("hall"))
    hall = biquad(hall, "lp", 12000, 0.7) * c["hall_return"]
    room = convolve(room_in, ir("room")) * c["room_return"]
    mix = sum(stems.values()) + hall + room + dly
    p.stems = stems
    return fade(mix, fin=0.002, fout=0.0)
