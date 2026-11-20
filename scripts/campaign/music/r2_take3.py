#!/usr/bin/env python3
"""Round two, Film 3 "Own everything" (24.0 s, pure typography). 100 BPM, beat 0.6 s, bar 2.4 s, downbeat 1 at 0.000.
  0.0-6.5  stark, deadpan, ironic: a too-sweet jingle over a low minor drone; soft accents 0.6/1.8/3.6/4.2 s
  6.6-8.2  marker pen: strike 6.60-7.06, handwriting 7.28-8.04, tap 8.16; harmony turns bright with the writing
  9.6 / 12.0 / 14.4 / 16.8   four hits, one per bar (C, G, Am, F = the campaign progression), the last the biggest
  19.2-24  logo: C major, resolved, silent by 23.6
Usage: python r2_take3.py [primary|alt ...]   -> out/take3-mix.wav, out/take3-mix-alt.wav"""
import os, sys
import numpy as np
import r2_engine as E
from r2_engine import ms
import dsp
from dsp import SR

LENGTH, BPM = 24.0, 100
HITS = [9.6, 12.0, 14.4, 16.8]
LOGO = 19.2
END = 23.6
# hit chords: (bass root, piano/strings voicing, motif line for the bar (beat, midi, dur))
CH = [
    ('C2', 'C3 G3 E4 G4 D5', [(0, 'E5', 1.5), (1.5, 'G5', .5), (2, 'A5', 1), (3, 'G5', 1)]),
    ('G1', 'G2 D3 B3 D4 A4', [(0, 'D5', 1.5), (1.5, 'G5', .5), (2, 'B5', 1), (3, 'A5', 1)]),
    ('A1', 'A2 E3 C4 E4 G4', [(0, 'E5', 1.5), (1.5, 'D5', .5), (2, 'C5', 1), (3, 'D5', 1)]),
    ('F1', 'F2 C3 A3 C4 G4', [(0, 'A5', 3.0), (3, 'G5', .7)]),
]


def compose(alt=False):
    s = E.Song('take3' + ('-alt' if alt else ''), LENGTH, E.TimeMap.const(BPM), seed=31 + alt)
    rng = np.random.default_rng(7)
    # ---------------------------------------------------------------- palette
    if not alt:
        jing = s.track('jingle', 8, pan=0.15, gain_db=7.0, send=0.25)                    # celesta
        drone = s.track('drone', 42, pan=-0.1, gain_db=4.0, send=0.2, lead_ms=20)        # cello
        dong = s.track('dong', 0, gain_db=6.0, send=0.25)                                 # piano low
        tick = s.track('tick', 0, drum=True, gain_db=-2.0, send=0.1, pan=0.2)             # woodblock clock
        pno = s.track('piano', 0, lead_ms=4, gain_db=2.0, send=0.18, vel_jit=4)
        lead = s.track('lead', 0, gain_db=2.5, send=0.2, pan=0.1)                          # piano melody (family voice)
        stab = s.track('brass', 61, gain_db=-1.0, send=0.25, lead_ms=12)
        strg = s.track('strings', 48, gain_db=-1.0, send=0.3, lead_ms=25)
        trem = s.track('trem', 44, gain_db=-3.0, send=0.3, lead_ms=25)
        bass = s.track('bass', 43, gain_db=0.0, send=0.05, lead_ms=10)                    # contrabass
        timp = s.track('timp', 47, lead_ms=4, gain_db=0.0, send=0.25)
        kit = s.track('kit', 0, drum=True, lead_ms=4, gain_db=1.0, send=0.08)
        orch = s.track('orch', 48, drum=True, lead_ms=4, gain_db=0.0, send=0.25)
        choir = s.track('choir', 52, gain_db=-3.0, send=0.35, lead_ms=40)
        glock = s.track('glock', 9, gain_db=-4.0, send=0.3, pan=0.3)
    else:
        # WHY alt = electronic: same hits and harmony, but 808 drums, synth bass, synth brass and a saw lead, so the
        # owner can hear the campaign as a modern electronic piece instead of an orchestral one
        jing = s.track('jingle', 10, pan=0.15, gain_db=9.0, send=0.3)                     # music box
        drone = s.track('drone', 89, gain_db=4.0, send=0.2)                              # warm pad
        dong = s.track('dong', 38, gain_db=2.0, send=0.05)                               # synth bass
        tick = s.track('tick', 25, drum=True, gain_db=-2.0, send=0.1, pan=0.2)
        tick.program = 25
        pno = s.track('piano', 90, gain_db=-1.0, send=0.2, vel_jit=4)                     # polysynth
        lead = s.track('lead', 81, gain_db=-5.0, send=0.2, pan=0.05)                      # saw lead
        stab = s.track('brass', 62, gain_db=-1.0, send=0.2)                               # synth brass
        strg = s.track('strings', 50, gain_db=-3.0, send=0.3, lead_ms=10)                 # synth strings
        trem = s.track('trem', 95, gain_db=-4.0, send=0.3)                                # sweep pad
        bass = s.track('bass', 38, gain_db=-1.0, send=0.02)
        timp = s.track('timp', 118, gain_db=-6.0, send=0.2)                                # synth drum
        kit = s.track('kit', 25, drum=True, lead_ms=4, gain_db=1.0, send=0.08)                       # 808/909
        orch = s.track('orch', 26, drum=True, lead_ms=4, gain_db=-2.0, send=0.2)                     # dance kit (crash/clap)
        choir = s.track('choir', 54, gain_db=-4.0, send=0.35)                              # synth voice
        glock = s.track('glock', 98, gain_db=-5.0, send=0.3, pan=0.3)                     # crystal
    for t_ in (kit, orch, tick):
        t_.drum = True

    # ---------------------------------------------------------------- 0-6.6 deadpan
    # WHY irony: a sweet major jingle (C major) floating over a low A-minor drone and a slow piano "dong" — happy on
    # top, hollow underneath — so "and you'll be happy" lands as a joke, and the flip is a real release.
    # Text accents from the finished picture (2026-11-20): 0.6 "you'll own", 1.8 "nothing.", 3.6 "and you'll",
    # 4.2 "be happy." = beats 1, 3, 6, 7. The jingle's accented notes sit exactly there, plus a soft bell ping
    # (the 0.6 one subtlest). Everything stops by 6.5 s so the marker strike at 6.6 is alone.
    drone.n(0, 10.8, 'A1 E2', 52)
    drone.ramp(0.0, 6.0, 70, 100)
    drone.ramp(6.1, 6.5, 100, 0)
    dong.n(0, 3.5, 'A0 A1', 72 if not alt else 60)
    dong.n(4, 3.5, 'A0 A1', 72 if not alt else 60)
    dong.n(8, 2.6, 'A0 A1', 66 if not alt else 56)
    jingle = [(1, 'E5', .5, 74), (1.5, 'G5', .5, 62), (2, 'A5', .5, 62), (3, 'C6', .9, 82),
              (5, 'A5', .5, 62), (5.5, 'G5', .5, 62), (6, 'E5', .5, 80), (7, 'C6', .9, 84),
              (9, 'D5', .5, 62), (9.5, 'E5', .5, 62), (10, 'C5', .6, 66)]
    for b, nn, d, v in jingle:
        jing.n(b, d, nn, v)
    for t_, nn, v in [(0.6, 'E6', 50), (1.8, 'C7', 70), (3.6, 'E6', 66), (4.2, 'C7', 74)]:
        glock.ns(t_, 0.4, nn, v)
    for b in range(10):
        tick.n(b, 0.1, 76 if b % 2 == 0 else 77, 60)      # tick-tock (last at 5.4 s)

    # ---------------------------------------------------------------- 6.6-9.6 the marker, the flip, the breath in
    # Marker (from the picture): strike 6.60-6.83 and 6.87-7.06, handwriting 7.28-8.04, full-stop tap 8.16.
    # WHY: silence under the strike; the harmony turns bright WITH the handwriting (a high C-major shimmer from
    # 7.28), the full stop gets a tiny sparkle, then a dominant (G) swell pulls into the first hit at 9.6.
    trem.ns(7.26, 1.2, 'G4 C5 E5 G5', 80)
    trem.ramp(7.26, 8.2, 0, 72, curve=0.7)
    trem.ramp(8.25, 8.45, 72, 0)
    jing.ns(7.30, 0.4, 'C6', 50); jing.ns(7.62, 0.4, 'E6', 54); jing.ns(7.94, 0.5, 'G6', 58)
    glock.ns(8.16, 0.8, 'C7 E7', 58)
    strg.ns(8.3, 1.2, 'G3 D4 G4 B4', 90)
    strg.ramp(8.3, 9.50, 10, 120, curve=2.0)
    strg.ramp(9.51, 9.53, 120, 0)   # WHY: 70 ms breath before the hit makes it land harder and cleaner
    strg.ramp(9.58, 9.59, 0, 127)
    if not alt:
        for i in range(int((9.5 - 8.7) / 0.05)):
            timp.ns(8.7 + i * 0.05, 0.05, 'G2', int(30 + 70 * (i / 16) ** 1.5))
    kit.ns(9.0, 0.1, 38, 50); kit.ns(9.15, 0.1, 38, 60); kit.ns(9.3, 0.1, 38, 75); kit.ns(9.45, 0.1, 38, 90)
    s.add_audio('riser', E.riser(1.13, rng), 9.6 - 1.2, gain_db=-21.0, send=0.2)

    # ---------------------------------------------------------------- 9.6-19.2 four hits
    for i, (root, voic, mot) in enumerate(CH):
        b0 = 16 + 4 * i
        big = (i == 3)
        v = 112 if big else 104
        # the hit itself: everything on the downbeat
        kit.n(b0, 0.5, 36, 127); orch.n(b0, 0.5, 36, 110)
        orch.n(b0, 2.0, 49 if i % 2 == 0 else 57, 120 if big else 95)
        if big: orch.n(b0, 2.0, 57, 120); kit.n(b0, 2.0, 49, 115)
        timp.n(b0, 1.0, E.m(root) + 12 if E.m(root) + 12 >= 40 else E.m(root) + 24, 115)
        bass.n(b0, 3.8, E.m(root) + 12, 105)
        pno.n(b0, 1.5, [E.m(root), E.m(root) + 12] + ms(voic)[1:], v)
        stab.n(b0, 1.0 if not big else 3.5, ms(voic)[1:], 110 if not big else 120)
        # WHY 3.6 beats on the big bar: sustained voices must stop just before 19.2 so the logo downbeat has an edge
        strg.n(b0, 3.9 if not big else 3.6, [E.m(root) + 12] + ms(voic)[1:], 100 if not big else 115)
        if big:
            choir.n(b0, 3.6, 'F3 C4 F4 A4 C5 G5', 110)
            glock.n(b0, 1.0, 'C6 F6 A6', 100)
            stab.n(b0, 3.5, 'F4 A4 C5', 118)
        # the drive: 8th-note piano chords (3+3+2 accents), hats, kick on 1 and the "and" of 2, clap on 2 and 4
        acc = [1, 0, 0, 1, 0, 0, 1, 0]
        for k in range(1, 8):
            pno.n(b0 + k * 0.5, 0.35, ms(voic)[2:], 92 if acc[k] else 70)
        for k in range(8):
            kit.n(b0 + k * 0.5, 0.1, 42, 85 if k % 2 == 0 else 60)
        kit.n(b0 + 1.5, 0.3, 36, 100); kit.n(b0 + 2, 0.3, 36, 112)
        kit.n(b0 + 1, 0.3, 39 if not alt else 39, 105); kit.n(b0 + 3, 0.3, 39, 110)
        if not alt: kit.n(b0 + 1, 0.3, 38, 80); kit.n(b0 + 3, 0.3, 38, 90)
        for bt, nn, d in mot:
            lead.n(b0 + bt, d, [E.m(nn), E.m(nn) - 12], 100 if not big else 112)
        # pickup fill into the next hit
        if i == 2:
            for k in range(8):
                kit.n(b0 + 2 + k * 0.25, 0.1, 38, 70 + 6 * k)
            s.add_audio('riser', E.riser(0.85, rng), 16.8 - 0.9, gain_db=-22.0, send=0.2)
        else:
            kit.n(b0 + 3.5, 0.2, 38, 95)
    # the big bar keeps its weight: timpani roll swelling to the logo
    for k in range(9):   # WHY: stops one 16th short of 19.2 so the logo downbeat has a clean edge
        timp.n(28 + 2.0 + k * 0.2, 0.15, 'F2', 60 + 5 * k)
    s.add_audio('boom', E.boom(rng), 16.8, gain_db=-17.0, send=0.0)
    for h in HITS[:3]:
        s.add_audio('boom', E.boom(rng, f=50, dur=1.0), h, gain_db=-21.0, send=0.0)

    # ---------------------------------------------------------------- 19.2 logo: resolved C
    kit.n(32, 0.5, 36, 110); orch.n(32, 3.0, 49, 85)
    if alt: kit.n(32, 0.3, 39, 100)
    pno.roll(32, 6.0, 'C2 C3 G3 E4 G4 C5 E5', 100, 0.012)
    strg.n(32, 5.0, 'C3 G3 E4 G4 D5', 95)
    strg.ramp(LOGO, LOGO + 3.4, 127, 60)
    bass.n(32, 5.0, 'C2', 95)
    glock.n(32.5, 1.0, 'G6', 70); glock.n(33, 1.0, 'C7', 75)
    lead.n(33, 1.0, 'E5', 80); lead.n(34, 3.0, 'C5 E5 G5', 78)
    choir.n(32, 4.0, 'C4 E4 G4 C5', 70)
    return s


def build(alt=False):
    s = compose(alt)
    stems = s.render_stems()
    # the marker (times from the finished picture, relative to 6.6 s): strike 6.60-6.83 and 6.87-7.06,
    # handwriting 7.28-8.04 as short letter strokes, a tiny tap for the full stop at 8.16
    rng = np.random.default_rng(303)
    strokes = [(0.00, 0.23, 1.0, 1.0), (0.27, 0.19, 0.95, 1.12)]
    t = 0.68
    while t < 1.40:
        d = float(min(rng.uniform(0.06, 0.15), 1.44 - t))
        strokes.append((t, d, float(rng.uniform(0.8, 1.0)), float(rng.uniform(0.85, 1.25))))
        t += d + float(rng.uniform(0.02, 0.05))
    strokes.append((1.56, 0.025, 0.8, 0.9))
    mk = E.marker(rng, strokes, 2.4)
    s.extra = []
    s.add_audio('marker', dsp.pan(mk, 0.05) * np.sqrt(2), 6.6, gain_db=-12.0, send=0.06)
    stems['marker'] = s.extra[-1][1] * dsp.db(-12.0), 0.06
    x = E.mixdown(s, stems, rt60=1.7, wet_db=-10.0, air_db=2.0, fade_end=END, fade_len=1.6)
    name = 'take3-mix' + ('-alt' if alt else '')
    path = os.path.join(E.OUT, name + '.wav')
    y = E.finish(x, path, s.n)
    print(f'{path}: LUFS {dsp.lufs(y):.2f} TP {dsp.true_peak_db(y):.2f}')
    return path


if __name__ == '__main__':
    which = sys.argv[1:] or ['primary', 'alt']
    for w in which:
        build(alt=(w == 'alt'))
