#!/usr/bin/env python3
"""Round two, Film 2 "Make it mine" (60.0 s, no narrator, picture cuts on the beat). 120 BPM, beat 0.5 s, bar 2.0 s,
first downbeat at 0.000. Bar b starts at 2*b seconds.
  Times below are from the cut picture (2026-11-20).
  bars 0-6   0-14 s   a look: playful, curious; the look-change BLOOM at 8.0 s (bar 4), a smaller shift at 12.0 s
  bars 7-14  14-30 s  their home: groove; accents 20.0 (rooms build in), 21.0 (rearrange), 26.0/26.5/27.4/28.2 (sliders)
  bars 15-22 30-46 s  their money: fuller; 32.5 count-up, 39.5 eleven bills ripple, 44.0-46.0 the cute email
  typing pockets (band thins, soft key ticks): 0.5-2, 4.5-6, 10-10.7, 14.1-15.2, 17-18.8, 23-24.5, 30.1-31.4, 35-36.5, 41.5-42.9
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
CHORDS = ['C', 'G', 'Am', 'G', 'C', 'G', 'F',                    # look (bar 3 builds, 4 = bloom, 6 = shift)
          'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F',              # home
          'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F',              # money (22 = the cute email, 44-46 s)
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


POCKETS = [(0.5, 2.0), (4.5, 6.0), (10.0, 10.7), (14.1, 15.2), (17.0, 18.8), (23.0, 24.5), (30.1, 31.4), (35.0, 36.5),
           (41.5, 42.9)]


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
    # ============================================================ a look (bars 0-6)
    # bars 0-2: curious start: hook + pizzicato tiptoe + finger-click on 2 and 4; kick and bass from bar 1
    for bar in range(0, 3):
        c = CHORDS[bar]
        motif(bar, c, 88, octave_double=False, stacc=0.6)
        for bt in range(4):
            pizz.n(4 * bar + bt, 0.4, r(c, 1) if bt % 2 == 0 else r(c, 1) + 7, 100)
        kit.n(4 * bar + 1, 0.1, 37 if not alt else CL, 90); kit.n(4 * bar + 3, 0.1, 37 if not alt else CL, 95)
        if bar >= 1:
            kit.n(4 * bar, 0.2, K, 105); kit.n(4 * bar + 2, 0.2, K, 95)
            for k in range(8):
                kit.n(4 * bar + k / 2, 0.1, SHK, 70 if k % 2 else 50)
            bassline(bar, c, 92, busy=False)
        if bar % 2 == 1:
            glock.n(4 * bar + 3.5, 0.5, 'G6', 80)
    # bar 3 (6-8 s): the build into the bloom
    motif(3, 'G', 92, octave_double=False, stacc=0.6)
    for k in range(4):
        kit.n(12 + k, 0.2, K, 100 + 5 * k)
    for k in range(15):   # WHY 15: the last 16th is a breath so the bloom (8.0) has a clean edge
        kit.n(12 + k / 4, 0.1, SN, 45 + 4 * k)
    bassline(3, 'G', 96, busy=False)
    strg.n(12, 3.85, PAD['G'], 90); strg.ramp(6.0, 7.9, 20, 120, curve=1.5); strg.ramp(7.92, 7.95, 120, 127)
    s.add_audio('riser', E.riser(1.88, rng), 8.0 - 2.0, gain_db=-22.0, send=0.2)
    # bars 4-6: 8.0 s THE BLOOM (the app turns neon): crash, sub, full chord, sparkle, the groove switches on
    for bar in (4, 5, 6):
        c = CHORDS[bar]
        drums(bar, 1.0)
        bassline(bar, c, 104)
        motif(bar, c, 100)
        stabs(bar, c, 80)
        strg.n(4 * bar, 3.9, PAD[c], 105)
    kit.n(16, 2.0, CR, 120); kit.n(16, 2.0, CR2, 100)
    s.add_audio('boom', E.boom(rng), 8.0, gain_db=-17.0, send=0.0)
    s.add_audio('sparkle', E.sparkle(rng, ms('C6 E6 G6 C7 E7 G7')), 8.0, gain_db=-20.0, send=0.3)
    brass.n(16, 1.0, 'C4 E4 G4 C5', 112)
    # 12.0 s the smaller shift ("less pink"): splash + xylophone ping + brass stab on a new colour (Fadd9)
    kit.n(24, 1.0, SPL, 110)
    bell.n(24, 0.5, 'G6', 110); bell.n(24.5, 0.5, 'C7', 100)
    brass.n(24, 0.6, 'F4 A4 C5 G5', 105)
    kit.n(27, 0.1, SN, 90); kit.n(27.5, 0.1, SN, 100)

    # ============================================================ their home (bars 7-14)
    for i, bar in enumerate(range(7, 15)):
        c = CHORDS[bar]
        drums(bar, 0.95 + 0.01 * i, fill=(bar == 14), open_hats=(bar >= 11))
        bassline(bar, c, 104)
        if alt:
            clav(bar, c, 95)
        else:
            stabs(bar, c, 76 + i)
        motif(bar, c, 96, octave_double=(bar >= 11))
        brass.n(4 * bar, 0.35, MID[c], 90)
        if bar >= 11:
            kit.n(4 * bar + 0.25, 0.1, TAMB, 60); kit.n(4 * bar + 2.25, 0.1, TAMB, 60)
        # WHY strings from bar 7: the home section dipped ~4 LU below the bloom it follows
        strg.n(4 * bar, 3.9, PAD[c], 80 if bar >= 11 else 70)
    kit.n(28, 1.5, CR, 105)
    # 20.0 s the rooms build in: splash, rising glock chord, a bigger brass stab
    kit.n(40, 1.0, SPL, 112); brass.n(40, 0.5, 'F4 A4 C5 F5', 112)
    for k, nn in enumerate(ms('C6 F6 A6 C7')):
        glock.n(40 + k * 0.125, 0.8, nn, 96)
    # 21.0 s rearrange: a woodblock/tom "pop" and a two-note xylophone flip (things swapping places)
    kit.n(42, 0.2, T1, 105); kit.n(42, 0.2, 76, 100)
    bell.n(42, 0.25, 'C7', 108); bell.n(42.25, 0.3, 'G6', 104)
    # 26.0 / 26.5 / 27.4 / 28.2 s sliders get bigger, animations punchier: four playful ascending pops
    for t_, nn, tom in [(26.0, 'C6', T2), (26.5, 'E6', T2), (27.4, 'G6', T1), (28.2, 'C7', T1)]:
        bell.ns(t_, 0.3, nn, 120); pizz.ns(t_, 0.3, m(nn) - 24, 100); kit.ns(t_, 0.2, tom, 100)
        if t_ > 27:   # WHY: the off-beat pops sit under ringing open hats; a clap gives them a clean edge
            kit.ns(t_, 0.2, CL, 112)
    s.add_audio('sparkle', E.sparkle(rng, ms('C7 E7 G7')), 28.2, gain_db=-24.0, send=0.3)

    # ============================================================ their money (bars 15-21)
    for i, bar in enumerate(range(15, 22)):
        c = CHORDS[bar]
        drums(bar, 1.0 if bar < 21 else 0.9, open_hats=True, four=(2 <= i < 6), fill=(bar == 18))
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
        if bar < 21:
            brass.n(4 * bar, 0.4, MID[c], 108); brass.n(4 * bar + 1.5, 0.3, MID[c], 100); brass.n(4 * bar + 3.5, 0.3, MID[c], 104)
        strg.n(4 * bar, 3.9, PAD[c], 88)
        if bar == 19:
            choir.n(4 * bar, 7.9, 'C4 E4 G4 C5', 80)
    kit.n(60, 1.5, CR, 115)
    # 32.5 s balances appear and count up: a quick rising tick-run that lands on a "ding" at 33.0
    for k, nn in enumerate(ms('C6 D6 E6 F6 G6 A6 B6 C7')):
        bell.ns(32.5 + k * 0.0625, 0.1, nn, 80 + 3 * k)
    glock.n(66, 1.0, 'C7 E7', 104)
    # 39.5 s eleven bills ripple in: eleven quick notes, alternating xylophone and glockenspiel
    rip = ms('C6 E6 G6 A6 C7 A6 G6 E6 G6 A6 C7')
    kit.n(80, 0.2, CL, 105)   # WHY: the bar after the ripple (40.0) keeps a clear edge
    for k, nn in enumerate(rip):
        (bell if k % 2 == 0 else glock).ns(39.5 + k * 0.042, 0.15, nn, 96)   # WHY 42 ms: done before the 40.0 downbeat
    # bar 22 (44-46 s) the cute email springs up: drums drop to a shaker and claps, music box + celesta, pizzicato,
    # sparkle on 44.0; a quick fill in the last half-beat into the peak
    kit.n(88, 0.2, CL, 108)   # WHY: a clear edge on 44.0 when the email springs up
    for k in range(7):
        kit.n(88 + k / 2, 0.1, SHK, 72 if k % 2 else 55)
    kit.n(89, 0.1, CL, 85); kit.n(91, 0.1, CL, 90)
    for bt, nn, d in [(0, 'A6', .5), (0.5, 'C7', .5), (1, 'G6', .25), (1.25, 'A6', .25), (1.5, 'F6', .5), (2, 'E6', .5),
                      (2.5, 'G6', .5), (3, 'C7', .45)]:
        cute.n(88 + bt, d, nn, 100)
        cute2.n(88 + bt, d, m(nn) - 12, 80)
    for bt in range(3):
        pizz.n(88 + bt, 0.4, ms('F3 C4 A4')[bt], 90)
    bass.n(88, 1.0, r('F', 1), 80); bass.n(91.5, 0.4, r('G', 1), 96)
    s.add_audio('sparkle', E.sparkle(rng, ms('A6 C7 F7 A7')), 44.0, gain_db=-20.0, send=0.3)
    s.add_audio('sparkle', E.sparkle(rng, ms('G6 B6 D7')), 45.0, gain_db=-24.0, send=0.3)
    for k in range(3):    # WHY 3 of 4 sixteenths: the last one is a breath so 46.0 lands on a clean edge
        kit.n(91.5 + k / 8, 0.1, SN, 90 + 10 * k)
    kit.n(91.5, 0.2, K, 105)
    strg.n(90, 1.85, PAD['G'], 90); strg.ramp(45.0, 45.9, 30, 127, curve=1.5)
    s.add_audio('riser', E.riser(0.88, rng), 46.0 - 1.0, gain_db=-21.0, send=0.2)

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
        brass.n(4 * bar, 1.85, MID[c], 112); brass.n(4 * bar + 2, 1.8, MID[c], 108)   # re-struck on 47.0 / 49.0
        choir.n(4 * bar, 3.9, ms(PAD[c])[1:], 100)
        glock.n(4 * bar, 1.0, m(MOTIF[c][0][1]) + 12, 100)
    kit.n(92, 2.0, CR, 125); kit.n(92, 2.0, CR2, 115); kit.n(96, 2.0, CR, 110)
    # 47.0 s before/after side by side: a splash, a bright brass stab and a glockenspiel pair
    kit.n(94, 1.0, SPL, 112); kit.n(94, 1.5, CR2, 118); kit.n(94, 0.2, K, 118); kit.n(94, 0.2, CL, 115); kit.n(94, 0.2, SN, 100); brass.n(94, 0.5, 'G4 C5 E5', 110); glock.n(94, 0.8, 'E7', 96); glock.n(94.25, 0.8, 'G7', 92)
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
    kit.n(105, 1.5, SPL, 105); kit.n(105, 0.2, 37, 110); glock.n(105, 1.0, 'E7', 100)   # WHY: the second closing line lands at 52.5 s
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

    # WHY pockets: while someone types on screen the band steps back (hook, chords, riffs, brass, bells and the
    # bright cymbals ~20% softer) but the kick and bass keep the groove going
    thin = {'hook', 'comp', 'ost', 'brass', 'bell', 'glock'}
    soft_drums = {HH, OH, CL, SN, SHK, TAMB, 37}
    inp = lambda t: any(a_ <= t < b_ for a_, b_ in POCKETS)
    for name, tr in s.tracks.items():
        if name in thin or name == 'kit':
            tr.notes = [(t, d, mm, int(v * 0.8) if inp(t) and (name != 'kit' or mm in soft_drums) else v)
                        for t, d, mm, v in tr.notes]
    s.add_audio('boom', E.boom(rng, f=42), 56.0, gain_db=-17.0, send=0.0)
    return s


def build(alt=False):
    s = compose(alt)
    stems = s.render_stems()
    # soft key ticks in the typing pockets. WHY: mix.expand humanises timing (+-28%), level and the odd pause,
    # and sfx.key picks pitch and brightness per press, so it reads as fingers, not a machine gun.
    import mix as mixmod, sfx
    dry_peak = np.abs(sum(x_ for x_, _ in stems.values())).max()
    ref = dry_peak * dsp.db(-12.0)   # WHY -12: at -24 the ticks measured 21-28 LU under the music (inaudible)
    kr = np.random.default_rng(2002)
    ticks = np.zeros((s.n, 2))
    for t, typ, g, p in mixmod.expand([dict(t0=a_ + 0.05, t1=b_ - 0.05, type='typing', cps=8) for a_, b_ in POCKETS], 2002):
        w = sfx.key(kr) * ref * dsp.db(g)
        i = int(round(t * dsp.SR))
        if 0 <= i < s.n:
            st = dsp.pan(w, p) * np.sqrt(2)
            j = min(s.n, i + len(st)); ticks[i:j] += st[:j - i]
    stems['keys'] = (ticks, 0.05)
    x = E.mixdown(s, stems, rt60=1.6, wet_db=-11.0, air_db=4.0, fade_end=END, fade_len=1.8)
    name = 'take2-mix' + ('-alt' if alt else '')
    path = os.path.join(E.OUT, name + '.wav')
    y = E.finish(x, path, s.n)
    print(f'{path}: LUFS {dsp.lufs(y):.2f} TP {dsp.true_peak_db(y):.2f}')
    return path


if __name__ == '__main__':
    for w in sys.argv[1:] or ['primary', 'alt']:
        build(alt=(w == 'alt'))
