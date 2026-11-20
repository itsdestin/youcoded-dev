#!/usr/bin/env python3
"""Round two, Film 2 "Make it mine" (60.0 s, no narrator, picture cuts on the beat). 120 BPM, beat 0.5 s, bar 2.0 s,
first downbeat at 0.000. Bar b starts at 2*b seconds.
  bars 0-6   0-14 s   a look: playful, curious; the look-change BLOOM at 10.0 s (bar 5), a smaller shift at 12.0 s
  bars 7-14  14-30 s  their home: the groove arrives; a small accent every bar (rising xylophone note + stab)
  bars 15-22 30-46 s  their money: fuller; 42-44 s a light, cute moment (kawaii email); 44-46 s build
  bars 23-24 46-50 s  pull-back: the widest moment lands on 46.0 s
  bars 25-27 50-56 s  two closing lines: half-time, spacious, still moving
  bars 28-29 56-60 s  logo: resolved button on 56.0 s, silent by 59.6 s
Primary: pop with the campaign piano carrying the motif, strings, brass stabs, live-ish drums.
Alt: disco-funk at the same tempo/map: four-on-the-floor, octave bass, clavinet, electric piano, horn section.
Usage: python r2_take2.py [primary|alt ...]"""
import os, sys
import numpy as np
import r2_engine as E
from r2_engine import ms, m
import dsp

LENGTH, BPM = 60.0, 120
END = 59.6
CHORDS = ['C', 'G', 'Am', 'F', 'G', 'C', 'F',                    # look (bar 4 builds, 5 = bloom, 6 = shift)
          'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F',              # home
          'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'G',              # money (21 = kawaii, 22 = build)
          'C', 'F',                                              # pull-back peak
          'Am', 'F', 'G',                                        # closing lines
          'C', 'C']                                              # logo
ROOT = {'C': 'C2', 'G': 'G1', 'Am': 'A1', 'F': 'F1'}
# mid voicings (piano right hand / stabs) and full string voicings
MID = {'C': 'E4 G4 C5', 'G': 'D4 G4 B4', 'Am': 'E4 A4 C5', 'F': 'F4 A4 C5'}
PAD = {'C': 'C3 G3 E4 G4 D5', 'G': 'G2 D3 B3 D4 A4', 'Am': 'A2 E3 C4 E4 G4', 'F': 'F2 C3 A3 C4 G4'}
# the campaign motif, one bar per chord (beat, note, beats)
MOTIF = {'C': [(0, 'E5', 1.5), (1.5, 'G5', .5), (2, 'A5', 1), (3, 'G5', 1)],
         'G': [(0, 'D5', 1.5), (1.5, 'G5', .5), (2, 'B5', 1), (3, 'A5', 1)],
         'Am': [(0, 'E5', 1.5), (1.5, 'D5', .5), (2, 'C5', 1), (3, 'D5', 1)],
         'F': [(0, 'A5', 1.5), (1.5, 'G5', .5), (2, 'F5', 1), (3, 'G5', 1)]}


def r(c, octv=0):
    return m(ROOT[c]) + 12 * octv


def compose(alt=False):
    s = E.Song('take2' + ('-alt' if alt else ''), LENGTH, E.TimeMap.const(BPM), seed=22 + alt)
    rng = np.random.default_rng(5)
    if not alt:
        hook = s.track('hook', 0, gain_db=5.5, send=0.16, pan=0.1, lead_ms=3, vel_jit=3)          # grand piano
        comp = s.track('comp', 0, gain_db=0.0, send=0.14, pan=-0.15, lead_ms=3, vel_jit=4)       # piano chords
        bass = s.track('bass', 33, gain_db=1.0, send=0.0, lead_ms=6)                             # finger bass
        pizz = s.track('pizz', 45, gain_db=3.0, send=0.2, pan=-0.3)
        strg = s.track('strings', 48, gain_db=-3.0, send=0.3, lead_ms=25)
        ost = s.track('ost', 48, gain_db=-6.0, send=0.2, pan=0.3, lead_ms=20)
        brass = s.track('brass', 61, gain_db=-3.0, send=0.22, lead_ms=10)
        bell = s.track('bell', 13, gain_db=-4.0, send=0.25, pan=0.35, lead_ms=5)                  # xylophone accents
        glock = s.track('glock', 9, gain_db=-6.0, send=0.3, pan=-0.3)
        cute = s.track('cute', 10, gain_db=2.0, send=0.3, pan=0.2)                               # music box
        cute2 = s.track('cute2', 8, gain_db=0.0, send=0.3, pan=-0.2)                             # celesta
        choir = s.track('choir', 52, gain_db=-5.0, send=0.35, lead_ms=40)
        kit = s.track('kit', 0, drum=True, gain_db=0.0, send=0.07, lead_ms=4)
    else:
        hook = s.track('hook', 4, gain_db=0.5, send=0.15, pan=0.1, lead_ms=4, vel_jit=3)          # tine electric piano
        comp = s.track('comp', 7, gain_db=-4.0, send=0.08, pan=-0.25, lead_ms=4, vel_jit=6)       # clavinet
        bass = s.track('bass', 36, gain_db=-1.0, send=0.0, lead_ms=3)                            # slap bass
        pizz = s.track('pizz', 108, gain_db=0.0, send=0.2, pan=-0.3)                             # kalimba
        strg = s.track('strings', 48, gain_db=-4.0, send=0.3, lead_ms=25)
        ost = s.track('ost', 61, gain_db=-5.0, send=0.2, pan=0.3, lead_ms=10)                    # horn section riffs
        brass = s.track('brass', 61, gain_db=-2.0, send=0.22, lead_ms=10)
        bell = s.track('bell', 11, gain_db=-3.0, send=0.25, pan=0.35, lead_ms=5)                  # vibraphone accents
        glock = s.track('glock', 9, gain_db=-6.0, send=0.3, pan=-0.3)
        cute = s.track('cute', 108, gain_db=2.0, send=0.3, pan=0.2)                              # kalimba
        cute2 = s.track('cute2', 10, gain_db=0.0, send=0.3, pan=-0.2)                            # music box
        choir = s.track('choir', 53, gain_db=-5.0, send=0.35, lead_ms=40)                        # voice oohs
        # WHY 808/909 kit: the dance kit's crash speaks ~30 ms late and smeared the 46/50 s cuts; the 909 is tight
        kit = s.track('kit', 25, drum=True, gain_db=0.0, send=0.07, lead_ms=4)                   # 808/909 kit
    K, SN, CL, HH, OH, CR, CR2, SPL, TAMB, SHK, T1, T2 = 36, 38, 39, 42, 46, 49, 57, 55, 54, 70, 50, 45

    def motif(bar, c, vel, octave_double=True, stacc=1.0, trk=None):
        trk = trk or hook
        for bt, nn, d in MOTIF[c]:
            notes = [m(nn), m(nn) - 12] if octave_double else [m(nn)]
            trk.n(4 * bar + bt, d * stacc, notes, vel)

    def drums_pop(bar, level=1.0, fill=False, open_hats=False, four=False):
        b0 = 4 * bar
        v = lambda x: int(min(127, x * level))
        kicks = [0, 1, 2, 3] if four else [0, 1.5, 2, 2.75]
        for k in kicks:
            kit.n(b0 + k, 0.2, K, v(118 if k == 0 else 100))
        kit.n(b0 + 1, 0.2, CL, v(108)); kit.n(b0 + 3, 0.2, CL, v(112))
        kit.n(b0 + 1, 0.2, SN, v(80)); kit.n(b0 + 3, 0.2, SN, v(88))
        for k in range(8):
            if open_hats and k % 2 == 1:
                kit.n(b0 + k / 2, 0.2, OH, v(70))
            else:
                kit.n(b0 + k / 2, 0.1, HH, v(78 if k % 2 == 0 else 58))
        if fill:
            for k in range(8):
                kit.n(b0 + 2 + k / 4, 0.1, SN if k < 4 else (T1 if k < 6 else T2), v(70 + 7 * k))

    def drums_disco(bar, level=1.0, fill=False, open_hats=True, four=True):
        b0 = 4 * bar
        v = lambda x: int(min(127, x * level))
        for k in range(4):
            kit.n(b0 + k, 0.2, K, v(118 if k == 0 else 108))
            kit.n(b0 + k + 0.5, 0.2, OH if open_hats else HH, v(76))
            kit.n(b0 + k + 0.25, 0.1, HH, v(45)); kit.n(b0 + k + 0.75, 0.1, HH, v(50))
        kit.n(b0 + 1, 0.2, CL, v(110)); kit.n(b0 + 3, 0.2, CL, v(114))
        kit.n(b0 + 1, 0.2, SN, v(85)); kit.n(b0 + 3, 0.2, SN, v(90))
        if fill:
            for k in range(8):
                kit.n(b0 + 2 + k / 4, 0.1, SN if k < 4 else (T1 if k < 6 else T2), v(70 + 7 * k))

    drums = drums_disco if alt else drums_pop

    def bassline(bar, c, vel=100, busy=True):
        b0 = 4 * bar
        R = r(c, 1)
        if alt:
            # WHY octave bass: the disco signature, root/octave on every 8th
            for k in range(8):
                bass.n(b0 + k / 2, 0.35, R + (12 if k % 2 else 0), vel - (8 if k % 2 else 0))
        elif busy:
            for bt, iv, d in [(0, 0, .45), (0.5, 0, .3), (1.5, 12, .4), (2, 0, .45), (2.75, 7, .3), (3.5, 12, .4)]:
                bass.n(b0 + bt, d, R + iv, vel)
        else:
            bass.n(b0, 1.8, R, vel); bass.n(b0 + 2, 1.8, R, vel - 8)

    def stabs(bar, c, vel, pattern=(0.5, 1.5, 2.5, 3.5), dur=0.3):
        for bt in pattern:
            comp.n(4 * bar + bt, dur, MID[c], vel)

    def clav(bar, c, vel):
        # 16th-note funk chops on the clavinet (alt only): ghosted, accented on the "e" and "a"
        v = [vel, vel - 40, vel - 20, vel - 35] * 4
        for k in range(16):
            if k in (0, 3, 6, 10, 11, 14):
                comp.n(4 * bar + k / 4, 0.15, MID[c], max(20, v[k]))

    # ============================================================ a look (bars 0-6)
    # bars 0-1: curious start: hook + pizzicato tiptoe + finger-click on 2 and 4
    for bar in range(0, 4):
        c = CHORDS[bar]
        motif(bar, c, 88, octave_double=False, stacc=0.6)
        for bt in range(4):
            pizz.n(4 * bar + bt, 0.4, r(c, 1) if bt % 2 == 0 else r(c, 1) + 7, 100)
        kit.n(4 * bar + 1, 0.1, 37 if not alt else CL, 90); kit.n(4 * bar + 3, 0.1, 37 if not alt else CL, 95)
        if bar >= 2:
            kit.n(4 * bar, 0.2, K, 105); kit.n(4 * bar + 2, 0.2, K, 95)
            for k in range(8):
                kit.n(4 * bar + k / 2, 0.1, SHK, 70 if k % 2 else 50)
            bassline(bar, c, 92, busy=False)
        if bar % 2 == 1:
            glock.n(4 * bar + 3.5, 0.5, 'G6', 80)
    # bar 4 (8-10 s): the build into the bloom
    motif(4, 'G', 92, octave_double=False, stacc=0.6)
    for k in range(4):
        kit.n(16 + k, 0.2, K, 100 + 5 * k)
    for k in range(16):
        kit.n(16 + k / 4, 0.1, SN, 45 + 4 * k)
    bassline(4, 'G', 96, busy=False)
    strg.n(16, 3.9, PAD['G'], 90); strg.ramp(8.0, 9.9, 20, 120, curve=1.5); strg.ramp(9.92, 9.95, 120, 127)
    s.add_audio('riser', E.riser(1.95, rng), 10.0 - 2.0, gain_db=-22.0, send=0.2)
    # bar 5 (10.0 s) THE BLOOM: crash, sub, full chord, sparkle, the groove switches on
    for bar in (5, 6):
        c = CHORDS[bar]
        drums(bar, 1.0)
        bassline(bar, c, 104)
        motif(bar, c, 100)
        stabs(bar, c, 80)
        strg.n(4 * bar, 3.9, PAD[c], 105)
    kit.n(20, 2.0, CR, 120); kit.n(20, 2.0, CR2, 100)
    s.add_audio('boom', E.boom(rng), 10.0, gain_db=-17.0, send=0.0)
    s.add_audio('sparkle', E.sparkle(rng, ms('C6 E6 G6 C7 E7 G7')), 10.0, gain_db=-20.0, send=0.3)
    brass.n(20, 1.0, 'C4 E4 G4 C5', 112)
    # bar 6 (12.0 s) the smaller shift ("less pink"): splash + xylophone ping + brass stab on a new colour (Fadd9)
    kit.n(24, 1.0, SPL, 110)
    bell.n(24, 0.5, 'G6', 110); bell.n(24.5, 0.5, 'C7', 100)
    brass.n(24, 0.6, 'F4 A4 C5 G5', 105)
    kit.n(27, 0.1, SN, 90); kit.n(27.5, 0.1, SN, 100)

    # ============================================================ their home (bars 7-14)
    scale = ms('C6 D6 E6 F6 G6 A6 B6 C7')
    for i, bar in enumerate(range(7, 15)):
        c = CHORDS[bar]
        drums(bar, 0.95 + 0.01 * i, fill=(bar == 14), open_hats=(bar >= 11))
        bassline(bar, c, 104)
        if alt:
            clav(bar, c, 95)
        else:
            stabs(bar, c, 76 + i)
        motif(bar, c, 96, octave_double=(bar >= 11))
        # WHY: a small accent on every downbeat, pitched one step higher each bar, reads as "it keeps growing"
        bell.n(4 * bar, 0.5, scale[i], 112)
        brass.n(4 * bar, 0.35, MID[c], 96)
        if bar >= 11:
            kit.n(4 * bar + 0.25, 0.1, TAMB, 60); kit.n(4 * bar + 2.25, 0.1, TAMB, 60)
        # WHY strings from bar 7 (were from bar 11): the home section dipped ~4 LU below the bloom it follows
        strg.n(4 * bar, 3.9, PAD[c], 80 if bar >= 11 else 70)
    kit.n(28, 1.5, CR, 105)

    # ============================================================ their money (bars 15-22)
    for i, bar in enumerate(range(15, 21)):
        c = CHORDS[bar]
        drums(bar, 1.0, open_hats=True, four=(i >= 2), fill=(bar == 18))
        bassline(bar, c, 108)
        motif(bar, c, 104)
        if alt:
            clav(bar, c, 100)
        else:
            stabs(bar, c, 84)
        # strings 8th ostinato (or horn riff in the alt) drives the build
        pc = ms(MID[c])
        for k in range(8):
            ost.n(4 * bar + k / 2, 0.3, pc[k % 3] + 12, 92 if k % 2 == 0 else 78)
        brass.n(4 * bar, 0.4, MID[c], 108); brass.n(4 * bar + 1.5, 0.3, MID[c], 100); brass.n(4 * bar + 3.5, 0.3, MID[c], 104)
        strg.n(4 * bar, 3.9, PAD[c], 88)
        if bar == 19:
            choir.n(4 * bar, 7.9, 'C4 E4 G4 C5', 80)
    kit.n(60, 1.5, CR, 115)
    # bar 21 (42-44 s) the kawaii moment: drums drop to a shaker and claps, music box + celesta, pizzicato, sparkle
    c = 'Am'
    for k in range(8):
        kit.n(84 + k / 2, 0.1, SHK, 72 if k % 2 else 55)
    kit.n(85, 0.1, CL, 85); kit.n(87, 0.1, CL, 90)
    for bt, nn, d in [(0, 'E6', .5), (0.5, 'A6', .5), (1, 'G6', .25), (1.25, 'A6', .25), (1.5, 'C7', .5), (2, 'B6', .5),
                      (2.5, 'A6', .5), (3, 'E6', .5), (3.5, 'G6', .5)]:
        cute.n(84 + bt, d, nn, 100)
        cute2.n(84 + bt, d, m(nn) - 12, 80)
    for bt in range(4):
        pizz.n(84 + bt, 0.4, ms('A3 E4 A4 C5')[bt], 90)
    bass.n(84, 1.0, r('Am', 1), 80)
    s.add_audio('sparkle', E.sparkle(rng, ms('E6 A6 C7 E7')), 42.0, gain_db=-21.0, send=0.3)
    s.add_audio('sparkle', E.sparkle(rng, ms('G6 B6 D7')), 43.5, gain_db=-24.0, send=0.3)
    # bar 22 (44-46 s) the build: snare 16ths swelling, kick quarters, strings rising, riser
    kit.n(88, 0.2, CL, 110)   # WHY: a clear edge on 44.0 after the soft kawaii bar
    for k in range(15):   # WHY 15 not 16: the last 16th is left empty so 46.0 lands on a clean edge
        kit.n(88 + k / 4, 0.1, SN, 50 + 4 * k)
    for k in range(4):
        kit.n(88 + k, 0.2, K, 100 + 6 * k)
    bassline(22, 'G', 100, busy=False)
    strg.n(88, 3.85, PAD['G'], 100); strg.ramp(44.0, 45.9, 30, 127, curve=1.5)
    # WHY the run stops a 16th early: a breath before 46.0 so the widest moment has a clean, cuttable edge
    for k, nn in enumerate(ms('G4 A4 B4 C5 D5 E5 F5')):
        hook.n(88 + 2 + k / 4, 0.2, [nn, nn + 12], 80 + 4 * k)
    s.add_audio('riser', E.riser(1.88, rng), 46.0 - 2.0, gain_db=-20.0, send=0.2)

    # ============================================================ pull-back peak (bars 23-24, 46-50 s)
    for i, bar in enumerate((23, 24)):
        c = CHORDS[bar]
        drums(bar, 1.05, open_hats=True, four=True)
        bassline(bar, c, 112)
        motif(bar, c, 112)
        stabs(bar, c, 92) if not alt else clav(bar, c, 104)
        strg.n(4 * bar, 3.95, PAD[c], 118)
        for bt, nn, d in MOTIF[c]:       # strings take the motif in octaves too: the widest moment
            strg.n(4 * bar + bt, d, [m(nn), m(nn) - 12], 112)
        brass.n(4 * bar, 3.8, MID[c], 112)
        choir.n(4 * bar, 3.9, ms(PAD[c])[1:], 100)
        glock.n(4 * bar, 1.0, m(MOTIF[c][0][1]) + 12, 100)
    kit.n(92, 2.0, CR, 125); kit.n(92, 2.0, CR2, 115); kit.n(96, 2.0, CR, 110)
    for b_ in (92, 96, 100):
        kit.n(b_, 0.2, CL, 115); kit.n(b_, 0.2, SN, 100)
    s.add_audio('boom', E.boom(rng), 46.0, gain_db=-15.0, send=0.0)
    s.add_audio('sparkle', E.sparkle(rng, ms('G6 C7 E7 G7')), 46.0, gain_db=-20.0, send=0.3)

    # ============================================================ closing lines (bars 25-27, 50-56 s): half-time
    for bar in (25, 26, 27):
        c = CHORDS[bar]
        b0 = 4 * bar
        kit.n(b0, 0.2, K, 112); kit.n(b0 + 2.5, 0.2, K, 90)
        kit.n(b0 + 2, 0.3, SN, 105); kit.n(b0 + 2, 0.3, CL, 100)
        for k in range(8):
            kit.n(b0 + k / 2, 0.1, HH, 70 if k % 2 == 0 else 50)
        bass.n(b0, 1.9, r(c, 1), 104); bass.n(b0 + 2.5, 1.4, r(c, 1), 92)
        motif(bar, c, 104, octave_double=True)
        comp.n(b0, 3.8, [r(c, 2)] + ms(MID[c]), 82) if not alt else comp.n(b0, 3.8, ms(MID[c]), 60)
        strg.n(b0, 3.9, PAD[c], 92)
    kit.n(100, 2.0, CR, 105)
    kit.n(104, 1.5, SPL, 105)   # WHY: the second closing line (52 s) gets its own edge to cut on
    for k in range(4):
        kit.n(108 + 2 + k / 2, 0.2, T1 if k < 2 else T2, 95 + 5 * k)

    # ============================================================ logo button (bar 28, 56.0 s)
    kit.n(112, 0.3, K, 125); kit.n(112, 3.0, CR, 110); kit.n(112, 0.3, CL, 110)
    comp.roll(112, 6.0, 'C2 C3 G3 E4 G4 C5', 100, 0.008)
    hook.n(112, 6.0, 'C5 E5 G5 C6', 104)
    brass.n(112, 0.9, 'C4 E4 G4 C5', 118)
    strg.n(112, 5.0, PAD['C'], 105); strg.ramp(56.0, 59.0, 127, 40)
    bass.n(112, 3.5, 'C2', 110)
    glock.n(113, 1.5, 'G6', 90); glock.n(113.5, 2.0, 'C7', 95)
    s.add_audio('boom', E.boom(rng, f=42), 56.0, gain_db=-17.0, send=0.0)
    return s


def build(alt=False):
    s = compose(alt)
    stems = s.render_stems()
    x = E.mixdown(s, stems, rt60=1.6, wet_db=-11.0, air_db=4.0, fade_end=END, fade_len=1.8)
    name = 'take2-mix' + ('-alt' if alt else '')
    path = os.path.join(E.OUT, name + '.wav')
    y = E.finish(x, path, s.n)
    print(f'{path}: LUFS {dsp.lufs(y):.2f} TP {dsp.true_peak_db(y):.2f}')
    return path


if __name__ == '__main__':
    for w in sys.argv[1:] or ['primary', 'alt']:
        build(alt=(w == 'alt'))
