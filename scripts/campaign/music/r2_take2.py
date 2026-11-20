#!/usr/bin/env python3
"""Round two, Film 2 "Make it mine" (60.0 s, no narrator, picture cuts on the beat). 120 BPM, beat 0.5 s, bar 2.0 s,
first downbeat at 0.000. Bar b starts at 2*b seconds.
  Times below are from the re-paced picture (2026-11-20, second cut).
  bars 0-6   0-14 s   a look: busy from the first frame; build 2.6-4.5; THE BIG CHANGE (neon wash) hits 4.5 and blooms
                      to 5.3; hold; "less pink" sweep at 10.0; hold and build into 14.0
  bars 7-14  14-30 s  their home: accents 20.0, 21.0, 25.5 (cut to controls), 26.0, 26.55 (lamp wiggle), 27.35 (toggle),
                      28.2 (thermostat bounce)
  bars 15-22 30-46 s  their money: 32.5 count-up (ding 33.0), 39.5 eleven bills ripple, 43.0-46.0 the cute email + fill
  bars 23-24 46-50 s  46.0 an inhale (music pulls right back); 47.0 THE PEAK (the neon wash reveals everything they made),
                      blooming to 47.8, settling to 49.5, fading 49.5-50.0
  bars 25-27 50-56 s  two closing lines (50.1, 52.5): half-time, spacious, still moving
  bars 28-29 56-60 s  logo: resolved button on 56.0 s, silent by 59.6 s
  typing pockets (band thins ~20%, soft key ticks): 0-0.35, 1.5-2.6, 8.0-8.7, 14.0-15.2, 17-18.8, 23-24.5, 30.1-31.4,
                      35-36.5, 41.5-42.9
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
CHORDS = ['C', 'G', 'C', 'G', 'Am', 'F', 'G',                    # look (bar 2 = the big change on beat 2 = 4.5 s)
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


POCKETS = [(0.0, 0.35), (1.5, 2.6), (8.0, 8.7), (14.0, 15.2), (17.0, 18.8), (23.0, 24.5), (30.1, 31.4), (35.0, 36.5),
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
        # WHY marimba (was vibraphone): its short decay keeps the accents from ringing over the next downbeat
        bell = s.track('bell', 12, gain_db=0.0, send=0.25, pan=0.35, lead_ms=5)                   # marimba accents
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
        kit.n(b0, 0.1, 37, v(90))   # WHY: a light rim click marks each bar line so picture cuts lock to it
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

    def clear(names, t0, t1):
        """Remove notes that START in [t0, t1) on the named tracks (used to cut holes for hits and breaths)."""
        for nm in names:
            tr = s.tracks[nm]
            # WHY -45 ms: tracks play up to 40 ms early (lead_ms) so their attacks land on the beat; a note meant
            # for t0 therefore starts just before it, and one meant for t1 must survive
            tr.notes = [x for x in tr.notes if not (t0 - 0.045 <= x[0] < t1 - 0.045)]
    BAND = ['hook', 'comp', 'bass', 'pizz', 'strings', 'ost', 'brass', 'bell', 'glock', 'choir', 'kit']

    # ============================================================ a look (bars 0-6)
    # WHY busy from frame one: the picture opens mid-conversation; a quiet intro read as a weak start (-27 LUFS)
    for bar in (0, 1):
        c = CHORDS[bar]
        drums(bar, 0.95)
        bassline(bar, c, 100)
        motif(bar, c, 96)
        stabs(bar, c, 78) if not alt else clav(bar, c, 92)
        strg.n(4 * bar, 3.9, PAD[c], 72)
    kit.n(0, 1.0, SPL, 96)
    # bars 2-6: the band (its first half-bar is cut out below for the build)
    for bar in (2, 3, 4, 5, 6):
        c = CHORDS[bar]
        drums(bar, 1.0, open_hats=(bar >= 3), fill=(bar == 6))
        bassline(bar, c, 104)
        motif(bar, c, 100)
        stabs(bar, c, 82) if not alt else clav(bar, c, 96)
        strg.n(4 * bar, 3.9, PAD[c], 100)
    # 2.6-4.5 the build: groove gives way to a snare roll, quarter kicks, a string swell and a riser; a breath, then
    # WHY the bass keeps going until 4.0: the build must climb from where the groove is, not drop out first
    clear(['kit', 'comp', 'hook', 'strings'], 2.6, 4.5)
    clear(['bass'], 4.0, 4.5)
    for k in range(int((4.4375 - 2.625) / 0.125) + 1):
        kit.ns(2.625 + k * 0.125, 0.06, SN, int(78 + 2.8 * k))
    for t_ in (3.0, 3.5, 4.0):
        kit.ns(t_, 0.2, K, 105)
    hook.n(6, 0.5, 'D5 D4', 92); hook.n(7, 0.5, 'G5 G4', 96); hook.n(8, 0.4, 'A5 A4', 100)
    strg.n(6, 2.85, PAD['G'], 92); strg.ramp(2.6, 4.42, 70, 124, curve=1.2); strg.ramp(4.43, 4.45, 120, 127)
    s.add_audio('riser', E.riser(1.82, rng), 2.62, gain_db=-21.0, send=0.2)
    bass.ns(4.0, 0.4, r('G', 1), 100)
    # 4.5 THE BIG CHANGE (neon wash sweeps down, to 5.3): crash, sub, the full chord, sparkle — the groove opens up
    kit.n(9, 2.0, CR, 122); kit.n(9, 2.0, CR2, 104); kit.n(9, 0.2, K, 124); kit.n(9, 0.2, CL, 112)
    s.add_audio('boom', E.boom(rng), 4.5, gain_db=-17.0, send=0.0)
    s.add_audio('sparkle', E.sparkle(rng, ms('C6 E6 G6 C7 E7 G7'), start_gap=0.12), 4.5, gain_db=-19.0, send=0.35)
    brass.n(9, 1.6, 'C4 E4 G4 C5', 114)
    strg.n(9, 2.9, PAD['C'], 110); strg.ramp(4.5, 5.3, 90, 127)
    hook.n(9, 1.0, 'E5 E4', 108)   # the motif re-enters on the change; the rest of bar 2's motif is already in place
    bass.n(9, 0.45, r('C', 1), 110)
    # 10.0 the "less pink" sweep: a smaller accent — splash, a bell flourish, a bright Fadd9 brass stab
    kit.n(20, 1.0, SPL, 112); kit.n(20, 0.2, CL, 108)
    bell.n(20, 0.5, 'C7', 110); bell.n(20.25, 0.5, 'A6', 100); bell.n(20.5, 0.5, 'G6', 96)
    brass.n(20, 0.6, 'F4 A4 C5 G5', 108)
    s.add_audio('sparkle', E.sparkle(rng, ms('A6 C7 F7')), 10.0, gain_db=-24.0, send=0.3)
    # 13-14 build into the home section
    s.add_audio('riser', E.riser(0.92, rng), 13.0, gain_db=-22.0, send=0.2)

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
    # 25.5 cut to the controls: a splash and a glockenspiel ping
    kit.ns(25.5, 1.0, SPL, 100); glock.ns(25.5, 0.6, 'G6', 92)
    # 26.0 sliders grow / 26.55 lamp wiggle / 27.35 toggle pop / 28.2 thermostat bounce: four playful, ascending pops
    for t_, nn, tom in [(26.0, 'C6', T2), (26.55, 'E6', T2), (27.35, 'G6', T1), (28.2, 'C7', T1)]:
        bell.ns(t_, 0.3, nn, 120); pizz.ns(t_, 0.3, m(nn) - 24, 100); kit.ns(t_, 0.2, tom, 100)
        if t_ > 26.3:   # WHY: the off-beat pops sit under ringing open hats; a clap gives them a clean edge
            kit.ns(t_, 0.2, CL, 112)
            if alt:       # and a closed hat chokes the open one (GM hi-hat group), so the pop starts from quiet
                kit.ns(t_ - 0.07, 0.05, HH, 30)
    bell.ns(26.62, 0.15, 'F6', 96); bell.ns(26.69, 0.15, 'E6', 90)   # the lamp's wiggle: a quick turn after the pop
    if alt:   # WHY: the slap bass's click on the 8th just before (26.5) hid the lamp-wiggle pop
        clear(['bass', 'comp'], 26.45, 26.6)
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
        bell.ns(32.5 + k * 0.05, 0.08, nn, 80 + 3 * k)   # WHY 50 ms steps: the run clears before the 33.0 ding
    glock.n(66, 1.0, 'C7 E7', 104)
    if alt:
        kit.ns(32.90, 0.05, HH, 30); kit.n(66, 0.2, CL, 105)   # the ding gets an edge over the open hats
    # 39.5 s eleven bills ripple in: eleven quick notes, alternating xylophone and glockenspiel
    rip = ms('C6 E6 G6 A6 C7 A6 G6 E6 G6 A6 C7')
    kit.n(80, 0.2, CL, 105)   # WHY: the bar after the ripple (40.0) keeps a clear edge
    for k, nn in enumerate(rip):
        (bell if k % 2 == 0 else glock).ns(39.5 + k * 0.042, 0.15, nn, 96)   # WHY 42 ms: done before the 40.0 downbeat
    # 43.0-46.0 the cute email springs up and stays: drums drop to a shaker and claps, music box + celesta,
    # pizzicato, sparkles; a quick fill in the last half-beat into 46.0
    clear(BAND, 43.0, 46.0)
    kit.n(86, 0.2, CL, 110); kit.n(86, 0.2, K, 100)   # WHY: a clear edge on 43.0 when the email springs up
    for k in range(11):
        kit.n(86 + k / 2, 0.1, SHK, 72 if k % 2 else 55)
    kit.n(87, 0.1, CL, 85); kit.n(88, 0.1, CL, 80); kit.n(89, 0.1, CL, 88); kit.n(91, 0.1, CL, 92)
    for bt, nn, d in [(0, 'A6', .5), (0.5, 'C7', .5), (1, 'G6', .25), (1.25, 'A6', .25), (1.5, 'F6', .5), (2, 'E6', .5),
                      (2.5, 'G6', .5), (3, 'C7', .5), (3.5, 'A6', .5), (4, 'G6', .25), (4.25, 'A6', .25), (4.5, 'E6', .5),
                      (5, 'C7', .45)]:
        cute.n(86 + bt, d, nn, 100)
        cute2.n(86 + bt, d, m(nn) - 12, 80)
    for bt in range(5):
        pizz.n(86 + bt, 0.4, ms('F3 C4 A4 C4 F4')[bt], 90)
    bass.n(86, 1.0, r('F', 1), 80); bass.n(88, 1.0, r('F', 1), 80); bass.n(91.5, 0.4, r('G', 1), 96)
    s.add_audio('sparkle', E.sparkle(rng, ms('A6 C7 F7 A7')), 43.0, gain_db=-20.0, send=0.3)
    s.add_audio('sparkle', E.sparkle(rng, ms('G6 B6 D7')), 44.5, gain_db=-24.0, send=0.3)
    for k in range(3):    # WHY 3 of 4 sixteenths: the last one is a breath before 46.0
        kit.n(91.5 + k / 8, 0.1, SN, 90 + 10 * k)
    kit.n(91.5, 0.2, K, 105)
    strg.n(90, 1.85, PAD['G'], 90); strg.ramp(45.0, 45.9, 30, 110, curve=1.5)

    # ============================================================ the inhale (46.0) and THE PEAK (47.0)
    for i, bar in enumerate((23, 24)):
        c = CHORDS[bar]
        drums(bar, 1.05, open_hats=True, four=True)
        bassline(bar, c, 112)
        motif(bar, c, 112)
        stabs(bar, c, 92) if not alt else clav(bar, c, 104)
        strg.n(4 * bar, 3.95, PAD[c], 118)
        for bt, nn, d in MOTIF[c]:       # strings take the motif in octaves too: the widest moment
            strg.n(4 * bar + bt, d, [m(nn), m(nn) - 12], 112)
        brass.n(4 * bar, 1.85, MID[c], 112); brass.n(4 * bar + 2, 1.8, MID[c], 108)
        choir.n(4 * bar, 3.9, ms(PAD[c])[1:], 100)
    # WHY the holes: 46.0 is the plain starting app — the band pulls right back for an inhale; 49.5-50.0 fades
    clear(BAND, 46.0, 47.0)
    clear(BAND, 49.5, 50.0)
    hook.n(92, 1.9, 'C4 E4 G4', 58); strg.n(92, 1.9, 'C3 G3', 70); strg.ramp(46.0, 46.95, 30, 90, curve=2.0)
    s.add_audio('riser', E.riser(0.9, rng, f0=600, f1=9000), 46.05, gain_db=-21.0, send=0.25)
    # 47.0 THE PEAK: the neon wash reveals everything they made — the biggest hit of the film, blooming to 47.8
    kit.n(94, 2.5, CR, 127); kit.n(94, 2.5, CR2, 120); kit.n(94, 0.2, K, 127); kit.n(94, 0.2, CL, 118); kit.n(94, 0.2, SN, 104)
    s.add_audio('boom', E.boom(rng), 47.0, gain_db=-14.0, send=0.0)
    s.add_audio('sparkle', E.sparkle(rng, ms('G6 C7 E7 G7 C8'), start_gap=0.15), 47.0, gain_db=-18.0, send=0.35)
    strg.n(94, 2.0, PAD['C'], 122); strg.ramp(47.0, 47.8, 100, 127)
    choir.n(94, 2.0, ms(PAD['C'])[1:], 108)
    brass.n(94, 1.9, 'C4 E4 G4 C5', 118)
    glock.n(94, 1.0, 'E7', 104); glock.n(94.25, 1.0, 'G7', 98); glock.n(94.5, 1.0, 'C8', 92)
    hook.n(94, 1.0, 'C6 C5', 112)
    kit.n(96, 2.0, CR, 108); kit.n(96, 0.2, CL, 110)
    strg.ramp(49.3, 49.95, 127, 60); choir.ramp(49.3, 49.95, 127, 50)   # the fade into the closing lines
    kit.n(100, 0.2, CL, 115); kit.n(100, 0.2, SN, 100)

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
    soft_drums = {HH, OH, CL, SN, SHK, TAMB}   # (not the bar-line rim click: it is what cuts lock to)
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
