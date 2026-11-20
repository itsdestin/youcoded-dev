#!/usr/bin/env python3
"""Brand sound palette: five 20-second sketches of the SAME piano motif, for the owner to choose a direction by ear.
  1-piano-alone              round-one feel: intimate felt piano, nothing else (100 BPM)
  2-piano-electronic         the piano motif + modern electronic production, mid energy (100 BPM)
  3-electronic-forward       the take-3 "electronic" feel he liked: motif on music box + soft saw lead, 808s (100 BPM)
  4-piano-warm-pads          cinematic and hopeful: piano, slow-opening pads, sub, no drums (100 BPM)
  5-piano-electronic-uptempo playful product-film energy at 120 BPM
Same form in all five: 1 intro bar, the motif over C-G-Am-F, an answer that walks Am-F-G, a resolved C chord that
rings out; silent by 19.85 s. Round four: every sketch now builds from quiet to full (SHAPE, about 6-8 LU of
loudness range) so the owner hears how each palette grows, and all carry real top end (felt piano to 10 kHz, an
air layer, a 10 kHz shelf). 2 and 5 are ONE sound at two speeds (5 = 2 at product-film speed).
Usage: python bs_palette.py [1 2 3 4 5]  -> out/palette/<n>-<name>.wav"""
import os, sys
import numpy as np
import bs_engine as B
from bs_engine import MOTIF, ROOT, PADV, PADH, m, notes

LENGTH = 20.0
END = 19.85
OUTDIR = os.path.join(B.OUT, 'palette')
NAMES = {1: '1-piano-alone', 2: '2-piano-electronic', 3: '3-electronic-forward', 4: '4-piano-warm-pads',
         5: '5-piano-electronic-uptempo'}
# the form (bar -> chord). WHY one form for all: the owner compares production, not composition.
FORM = ['C', 'C', 'G', 'Am', 'F', 'F', 'G']               # bar 0 intro, 1-4 motif, 5-6 answer (F held, G); final C at bar 7
FORM_UP = ['C', 'C', 'G', 'Am', 'F', 'C', 'G', 'F']        # 120 BPM: one more motif pair; final C at bar 8 (16.0 s)


class Grid:
    def __init__(self, bpm):
        self.beat = 60.0 / bpm
        self.bar = 4 * self.beat

    def t(self, bar, beat=0.0):
        return bar * self.bar + beat * self.beat


def motif_line(c, answer=False):
    """The motif for one bar; in the answer the F bar holds its top note (a 'stance', as in round one)."""
    if answer and c == 'F':
        return [(0, 'A5', 2.5), (2.5, 'G5', 1.5)]
    if answer and c == 'G':
        return [(0, 'B5', 2.0), (2, 'D6', 2.0)]
    return MOTIF[c]


def piano_part(M, G, form, st='pno', vel=58, lh_vel=44, octave_top=False, lh='broken', final_bar=None, hum=None):
    """Felt-piano part: left hand + the motif in the right hand. WHY seeded humanising: off-beats wander +-10 ms
    and +-4 velocity, downbeats stay exact so arrivals lock to picture."""
    hum = hum or np.random.default_rng(5)
    j = lambda: float(hum.uniform(-0.010, 0.010))
    for b, c in enumerate(form):
        t0 = G.t(b)
        root = m(ROOT[c]) + 12
        vo = notes(PADV[c])
        if lh == 'broken':
            # bass on 1, then a slow broken chord (beats 1.5, 2, 3) — the round-one left hand
            M.piano(st, t0, [root - 12, root] if b in (1, 5) else root, lh_vel + 4, G.bar * 0.98)
            for k, (bt, nn) in enumerate([(1.0, vo[1]), (2.0, vo[2]), (3.0, vo[3])]):
                M.piano(st, t0 + G.t(0, bt) + j(), nn, lh_vel - 4 + int(hum.integers(-3, 4)), G.beat * (3.0 - k * 0.8), p=0.2)
        elif lh == 'block':
            M.piano(st, t0, [root] + vo[1:], lh_vel, G.bar * 0.95, roll=0.012)
        if b == 0:
            continue
        line = motif_line(c, answer=(b >= 5))
        for bt, nn, d in line:
            ex = abs(bt - round(bt)) < 1e-9
            tt = t0 + G.t(0, bt) + (0 if ex else j())
            v = vel + (6 if bt == 0 else 0) + int(hum.integers(-4, 5))
            M.piano(st, tt, nn, v, G.beat * d * 1.05, p=0.15)
            if octave_top:
                M.piano(st, tt, m(nn) + 12, v - 14, G.beat * d, p=0.25)
    # final chord: rolled C, low to high, rings to the end
    fb = final_bar if final_bar is not None else len(form)
    tf = G.t(fb)
    # WHY rolled and a little softer than the motif's peak: an arrival, not a slam (a 7-note block chord made the
    # limiter pull 5 dB here)
    M.piano(st, tf, 'C2 C3 G3 E4', lh_vel + 4, LENGTH - tf, roll=0.018)
    M.piano(st, tf + 0.07, 'G4 C5 E5', vel - 4, LENGTH - tf, roll=0.035, p=0.15)
    return tf


# ----------------------------------------------------------------------------- 1
def sketch1():
    G = Grid(100)
    M = B.Mix(LENGTH, seed=1)
    M.stem('pno', hall=0.55, room=0.25, comp=(12, 2.5))
    tf = piano_part(M, G, FORM, vel=54, lh_vel=40)
    # WHY nothing else: this is the reference for "the earlier piano music" — the motif on its own, close and soft
    x, _ = M.render(hall_rt=3.0, hall_db=-7.0, piano_bright=52, air_db=3.0, air_layer=-20.0)
    # WHY a slow, gentle compressor: a solo piano at -14 LUFS otherwise needs ~4 dB of fast limiting on its
    # attacks; this evens the phrase instead so the limiter only shaves stray peaks
    x = B.glue(x, thresh_db=-26, ratio=2.2, att=0.012, rel=0.3)
    return x, M, [G.t(b) for b in range(1, 8)]


# ----------------------------------------------------------------------------- 2
def drums_mid(M, G, bars, rng, full_from, level=0.0, kick_only=()):
    for b in bars:
        t0 = G.t(b)
        for bt in (0, 2.5) if b not in kick_only else (0, 2):
            M.put('kick', B.kick(decay=0.2, f0=48, sweep=110, rng=rng), t0 + G.t(0, bt), level)
            M.kick_at(t0 + G.t(0, bt))
        if b >= full_from:
            for bt in (1, 3):
                M.put('clap', B.clap(rng, tail=0.12), t0 + G.t(0, bt), level - 3, p=0.0)
            for k in range(8):
                acc = (k % 2 == 1)
                M.put('hat', B.hat(rng, decay=0.03 if not acc else 0.05), t0 + G.t(0, k * 0.5) + float(rng.uniform(-0.004, 0.004)),
                      level - (6 if acc else 12) + float(rng.uniform(-1.5, 1.5)), p=0.25)


def sketch2():
    G = Grid(100)
    M = B.Mix(LENGTH, seed=2)
    rng = np.random.default_rng(22)
    M.stem('pno', hall=0.35, room=0.2, gain_db=1.0, pump=1.0, comp=(12, 2.5))
    M.stem('pad', hall=0.4, pump=4.0, gain_db=-17)
    M.stem('sub', gain_db=-10, pump=3.0)
    M.stem('pluck', hall=0.2, delay=0.5, gain_db=-20, pump=2.0)
    M.stem('kick', gain_db=-6, room=0.05)
    M.stem('clap', gain_db=-15, room=0.35, hall=0.15)
    M.stem('hat', gain_db=-13, room=0.1)
    M.stem('fx', gain_db=-19, hall=0.3)
    tf = piano_part(M, G, FORM, vel=60, lh_vel=40)
    for b, c in enumerate(FORM):
        t0 = G.t(b)
        M.put('pad', B.pad(PADV[c], G.bar, rng, att=0.4 if b else 1.6, rel=0.6, lo=700 if b < 3 else 1100, hi=2200 if b >= 3 else None), t0)
        if b >= 1:
            # sub: root on 1, a pushed note on the "and" of 2 (the electronic lilt under the piano)
            r = m(ROOT[c])
            M.put('sub', B.sub(r + 12, G.beat * 2.2), t0)
            M.put('sub', B.sub(r + 12, G.beat * 1.4), t0 + G.t(0, 2.5))
        if b >= 3:
            # quiet 8th-note pluck arpeggio, doubled by a dotted-8th ping-pong delay
            pool = notes(PADH[c])
            for k in range(8):
                M.put('pluck', B.pluck(pool[[0, 2, 1, 3, 2, 1, 3, 2][k]], rng, tau=0.18), t0 + G.t(0, k * 0.5), -2 if k % 2 else 0,
                      p=(-0.35 if k % 2 else 0.35))
    drums_mid(M, G, range(1, 7), rng, full_from=3, kick_only=(1, 2))
    # into the final chord: noise swell + the last hat bar thinned, then one deep 808 under the chord
    M.put('fx', B.swell(G.bar * 0.95, rng, 400, 9000), tf - G.bar * 0.95)
    M.put('kick', B.k808('C1', decay=0.9), tf, -2)
    M.put('sub', B.sub('C2', 2.6, rel=1.0), tf, -2)
    M.put('pad', B.pad(PADV['C'] + ' ' + PADH['C'], LENGTH - tf - 0.3, rng, att=0.05, rel=0.25, lo=2600, hi=1200, curve=lambda u: u ** 0.7), tf, -2)
    # WHY these levels (LU vs the piano): the piano carries the motif; sub and kick sit under it, never over it
    x, _ = M.render(hall_rt=2.4, hall_db=-9.0, piano_bright=56, air_layer=-20.0, low_cut=38,
                    balance=dict(pno=0, sub=-6, kick=-7, pad=-9, pluck=-13, clap=-12, hat=-15, fx=-14))
    x = B.glue(x, thresh_db=-22)
    return x, M, [G.t(b) for b in range(1, 8)]


# ----------------------------------------------------------------------------- 3
def sketch3():
    G = Grid(100)
    M = B.Mix(LENGTH, seed=3)
    rng = np.random.default_rng(33)
    # WHY the bell cut: the music box's notes sit in 1.3-2.1 kHz, where ears and phones are most sensitive; with
    # the box carrying the tune that octave held 45% of the sketch's energy (piercing). -6 dB there, box 7 LU down
    M.stem('box', hall=0.45, delay=0.35, gain_db=-12, eq=((1750, -6.0, 0.8),))
    M.stem('lead', hall=0.3, delay=0.25, gain_db=-24, pump=3.0)
    M.stem('brass', hall=0.3, gain_db=-21, pump=3.0)
    M.stem('pad', hall=0.4, gain_db=-21, pump=5.0)
    M.stem('b808', gain_db=-6)
    M.stem('kick', gain_db=-8)
    M.stem('clap', gain_db=-13, room=0.3, hall=0.15)
    M.stem('hat', gain_db=-14, room=0.08)
    M.stem('fx', gain_db=-19, hall=0.3)
    for b, c in enumerate(FORM):
        t0 = G.t(b)
        M.put('pad', B.pad(PADH[c], G.bar, rng, att=0.3 if b else 1.4, rel=0.5, lo=1500, hi=3500 if b >= 5 else None), t0)
        if b == 0:
            # the music-box intro: the motif's first notes, alone, high
            for bt, nn in [(2, 'E6'), (2.5, 'G6'), (3, 'A6')]:
                M.put('box', B.bell(nn, 1.6), t0 + G.t(0, bt), -4)
            continue
        line = motif_line(c, answer=(b >= 5))
        for bt, nn, d in line:
            M.put('box', B.bell(m(nn) + 12, 2.0), t0 + G.t(0, bt))
            if b >= 3:
                M.put('lead', B.lead([m(nn)], G.beat * d * 0.9, rng, lo=1800, hi=5000), t0 + G.t(0, bt))
        # synth brass stabs on 1 and the "and" of 2 (the hits the take-3 alt had)
        if b >= 3:
            vo = notes(PADV[c])[1:]
            for bt, d in ((0, 0.6), (1.5, 0.4)):
                M.put('brass', B.lead(vo, G.beat * d, rng, lo=900, hi=4200, env_t=0.08, rel=0.15), t0 + G.t(0, bt))
        # 808 on the root, sliding style: long note on 1, a short one on the "and" of 2
        r = m(ROOT[c])
        M.put('b808', B.k808(r + 12, decay=0.55), t0)
        M.put('b808', B.k808(r + 12, decay=0.25), t0 + G.t(0, 2.5), -3)
        M.kick_at(t0); M.kick_at(t0 + G.t(0, 2.5))
        M.put('kick', B.kick(decay=0.12, f0=60, sweep=140, click=0.4, rng=rng), t0)
        if b >= 2:
            M.put('kick', B.kick(decay=0.12, f0=60, sweep=140, click=0.4, rng=rng), t0 + G.t(0, 2.5), -2)
            for bt in (1, 3):
                M.put('clap', B.clap(rng, tail=0.16), t0 + G.t(0, bt))
            # trap-ish hats: 8ths with a 16th roll at the end of the bar
            hs = [k * 0.5 for k in range(8)] + ([3.25, 3.75] if b % 2 == 0 else [])
            for h in hs:
                M.put('hat', B.hat(rng, decay=0.025), t0 + G.t(0, h), -4 * (h % 1 != 0) + float(rng.uniform(-1, 1)), p=0.2)
    tf = G.t(7)
    M.put('fx', B.swell(G.bar * 0.9, rng, 500, 10000), tf - G.bar * 0.9)
    M.put('b808', B.k808('C2', decay=1.2), tf, 1)
    M.put('kick', B.kick(decay=0.14, f0=60, sweep=140, rng=rng), tf)
    M.put('clap', B.clap(rng, tail=0.4), tf, -2)
    M.put('brass', B.lead('C4 E4 G4 C5', 1.2, rng, lo=900, hi=5000, env_t=0.25, rel=1.2), tf, 0)
    M.put('pad', B.pad('C4 G4 C5 E5', LENGTH - tf - 0.4, rng, att=0.02, rel=0.3, lo=3000, hi=1200, curve=lambda u: u ** 0.6), tf)
    for k, nn in enumerate(['C6', 'E6', 'G6', 'C7']):
        M.put('box', B.bell(nn, 2.5), tf + G.t(0, 1 + k * 0.5), -2 - k)
    x, _ = M.render(hall_rt=2.2, hall_db=-10.0, air_layer=-24.0,
                    balance=dict(box=-7, b808=-5, kick=-9, clap=-10, pad=-9, lead=-8, brass=-9, hat=-13, fx=-14))
    x = B.glue(x, thresh_db=-21, ratio=2.0)
    return x, M, [G.t(b) for b in range(1, 8)]


# ----------------------------------------------------------------------------- 4
def sketch4():
    G = Grid(100)
    M = B.Mix(LENGTH, seed=4)
    rng = np.random.default_rng(44)
    M.stem('pno', hall=0.5, room=0.15, gain_db=0.5, comp=(12, 2.5))
    M.stem('pad', hall=0.5, gain_db=-17)
    M.stem('hi', hall=0.7, gain_db=-24)
    M.stem('sub', gain_db=-12)
    M.stem('pulse', gain_db=-16, room=0.3)
    M.stem('fx', gain_db=-22, hall=0.4)
    M.stem('air', gain_db=-38)
    tf = piano_part(M, G, FORM, vel=58, lh_vel=40, octave_top=False)
    # one continuous pad that opens slowly across the whole phrase (cinematic) — chord by chord, overlapping
    for b, c in enumerate(FORM):
        t0 = G.t(b)
        lo, hi = 500 + 120 * b, 900 + 300 * b
        M.put('pad', B.pad(PADV[c], G.bar + 0.3, rng, att=1.2 if b == 0 else 0.35, rel=0.9, lo=lo, hi=hi, voices=5, detune=9), t0 - (0 if b == 0 else 0.15))
        if b >= 3:
            M.put('hi', B.pad(PADH[c], G.bar + 0.3, rng, att=0.6, rel=1.0, lo=2500, voices=3, detune=7, shimmer=0.15), t0 - 0.15)
        if b >= 1:
            M.put('sub', B.sub(m(ROOT[c]) + 12, G.bar * 0.95, att=0.08, rel=0.4), t0)
        # a felt heartbeat on 1 (and softer on 3) from bar 5: the hopeful lift without drums
        if b >= 5:
            M.put('pulse', B.k808(m(ROOT[c]) + 12, decay=0.35, punch=0.8, drive=1.2), t0)
            M.put('pulse', B.k808(m(ROOT[c]) + 12, decay=0.25, punch=0.8, drive=1.2), t0 + G.t(0, 2), -5)
    M.put('air', B.air(LENGTH - 1.0, rng), 0.5)
    # the arrival: a reverse-piano breath into the final chord, then the chord with pads wide open
    chord = B.render_piano([dict(t=0.0, midi=mm, vel=70, dur=2.0) for mm in notes('C3 G3 E4 G4 C5')], int(2.5 * B.SR))
    M.put('fx', B.reverse_tail(chord, G.bar * 0.9), tf - G.bar * 0.9, 4)
    M.put('pad', B.pad(PADV['C'], LENGTH - tf - 0.6, rng, att=0.05, rel=0.5, lo=2200, hi=900, curve=lambda u: u ** 0.5), tf, 1)
    M.put('hi', B.pad('E5 G5 C6 D6', LENGTH - tf - 0.6, rng, att=0.3, rel=0.5, lo=3500, voices=3, shimmer=0.2), tf)
    M.put('sub', B.sub('C2', 3.0, att=0.02, rel=1.2), tf, 1)
    M.put('pulse', B.k808('C2', decay=1.0, punch=0.8, drive=1.2), tf, 2)
    x, _ = M.render(hall_rt=3.2, hall_db=-7.5, piano_bright=54, air_db=3.0, air_layer=-19.0,
                    balance=dict(pno=0, pad=-6, hi=-12, sub=-8, pulse=-10, fx=-10, air=-30))
    x = B.glue(x, thresh_db=-24, ratio=1.5)
    return x, M, [G.t(b) for b in range(1, 8)]


# ----------------------------------------------------------------------------- 5
def sketch5():
    G = Grid(120)
    M = B.Mix(LENGTH, seed=5)
    rng = np.random.default_rng(55)
    M.stem('pno', hall=0.25, room=0.25, gain_db=1.0, pump=1.0, comp=(12, 2.5))
    M.stem('box', hall=0.4, delay=0.4, gain_db=-16)
    M.stem('pad', hall=0.35, gain_db=-20, pump=5.0)
    M.stem('sub', gain_db=-10, pump=2.0)
    M.stem('pluck', hall=0.15, delay=0.3, gain_db=-19, pump=3.0)
    M.stem('kick', gain_db=-6, room=0.04)
    M.stem('clap', gain_db=-14, room=0.35, hall=0.1)
    M.stem('hat', gain_db=-15, room=0.08)
    M.stem('shk', gain_db=-21, room=0.2)
    M.stem('fx', gain_db=-19, hall=0.3)
    hum = np.random.default_rng(9)
    # piano: staccato-ish motif in octaves (playful), left hand as short offbeat chords
    for b, c in enumerate(FORM_UP):
        t0 = G.t(b)
        vo = notes(PADV[c])
        for bt in (0.5, 1.5, 2.5, 3.5):
            M.piano('pno', t0 + G.t(0, bt) + float(hum.uniform(-0.006, 0.006)), vo[1:], 46 + int(hum.integers(-3, 4)), G.beat * 0.35, p=-0.1)
        if b == 0:
            continue
        line = motif_line(c, answer=(b >= 7))
        for bt, nn, d in line:
            v = 64 + (6 if bt == 0 else 0) + int(hum.integers(-3, 4))
            M.piano('pno', t0 + G.t(0, bt), [m(nn), m(nn) - 12], v, G.beat * d * 0.85, p=0.12)
            if b >= 5:
                M.put('box', B.bell(m(nn) + 12, 1.4), t0 + G.t(0, bt), -2, p=0.3)
        M.put('pad', B.pad(PADH[c], G.bar, rng, att=0.05, rel=0.3, lo=1600), t0)
        # bouncy sub: 8th-note pattern with rests (1, "and" of 1, "and" of 2, 4)
        r = m(ROOT[c]) + 12
        for bt, d, o in ((0, 0.45, 0), (0.5, 0.3, 12), (1.5, 0.45, 0), (2.5, 0.3, 12), (3, 0.45, 0)):
            M.put('sub', B.sub(r + o, G.beat * d, rel=0.05), t0 + G.t(0, bt), -3 if o else 0)
        # drums: four-on-the-floor kick, claps 2 & 4, offbeat open-ish hats, 16th shaker
        for bt in range(4):
            M.put('kick', B.kick(decay=0.16, f0=52, sweep=120, rng=rng), t0 + G.t(0, bt))
            M.kick_at(t0 + G.t(0, bt))
        if b >= 3:
            for bt in (1, 3):
                M.put('clap', B.clap(rng, tail=0.1), t0 + G.t(0, bt))
            for bt in (0.5, 1.5, 2.5, 3.5):
                M.put('hat', B.hat(rng, decay=0.06), t0 + G.t(0, bt), float(rng.uniform(-1, 1)), p=0.25)
        for k in range(16):
            M.put('shk', B.shaker(rng), t0 + G.t(0, k * 0.25) + float(rng.uniform(-0.004, 0.004)), (0 if k % 2 else -6) + float(rng.uniform(-1.5, 1)), p=-0.3)
        if b >= 5:
            pool = notes(PADH[c])
            for k in range(8):
                M.put('pluck', B.pluck(pool[[3, 2, 1, 2, 0, 2, 1, 2][k]] + 12, rng, tau=0.12), t0 + G.t(0, k * 0.5) + G.beat * 0.25, 0, p=0.4 if k % 2 else -0.4)
    tf = G.t(8)
    # last bar: a snare-style clap roll lifts into the final chord
    for k in range(8):
        M.put('clap', B.clap(rng, tail=0.05), G.t(7, 2 + k * 0.25), -14 + 2 * k)
    M.put('fx', B.swell(G.bar * 0.9, rng, 500, 9000), tf - G.bar * 0.9)
    M.put('kick', B.k808('C1', decay=0.9), tf, -1)
    M.kick_at(tf)
    M.put('clap', B.clap(rng, tail=0.35), tf, -3)
    M.piano('pno', tf, 'C2 C3 G3 E4', 66, LENGTH - tf)
    M.piano('pno', tf + 0.03, 'G4 C5 E5 G5', 70, LENGTH - tf, roll=0.025, p=0.15)
    M.put('sub', B.sub('C2', 2.4, rel=1.0), tf)
    M.put('pad', B.pad(PADH['C'], LENGTH - tf - 0.5, rng, att=0.02, rel=0.4, lo=2800, hi=1200, curve=lambda u: u ** 0.6), tf, 2)
    for k, nn in enumerate(['G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 2.0), tf + 0.25 + k * 0.125, -3 - 2 * k, p=-0.3 + 0.3 * k)
    x, _ = M.render(hall_rt=2.0, hall_db=-11.0, delay_t=0.375, piano_bright=58, air_layer=-22.0, low_cut=38,
                    balance=dict(pno=0, box=-13, pad=-11, sub=-6, pluck=-12, kick=-6, clap=-10, hat=-14, shk=-16, fx=-14))
    x = B.glue(x, thresh_db=-21, ratio=2.0)
    return x, M, [G.t(b) for b in range(1, 9)]


SKETCH = {1: sketch1, 2: sketch2, 3: sketch3, 4: sketch4, 5: sketch5}
# the quiet-to-loud shape every sketch gets (bus dB at bar starts; the final chord's bar is 0 dB). WHY: round three's
# sketches were flat (4.5-7.8 dB spread over 20 s); a palette is judged by how it builds as much as how it sounds
SHAPE = [(0, -12.0), (1, -10.0), (3, -6.0), (5, -2.0), ('final', 0.0)]


def build(k):
    os.makedirs(OUTDIR, exist_ok=True)
    x, M, downbeats = SKETCH[k]()
    bar = downbeats[1] - downbeats[0]
    final = downbeats[-1] + bar if k != 5 else 16.0
    # WHY sketch 3 gets two-thirds of the shape: it already opens on a lone music box, so the full shape over-did it
    # (10.4 LU of range against the 6-8 asked for)
    sc = 0.65 if k == 3 else 1.0
    pts = [((final if b_ == 'final' else b_ * bar), g * sc) for b_, g in SHAPE]
    tt = np.arange(M.n) / B.SR
    x = x * B.db(np.interp(tt, [a for a, _ in pts], [g for _, g in pts]))[:, None]
    x = B.ending(x, END, 1.4)
    from bs_verify import stem_levels
    print('  stems (LUFS at final gain):', stem_levels(M.out, B.db(-14 - B.dsp.lufs(x))))
    return B.finish(x, os.path.join(OUTDIR, NAMES[k] + '.wav'), M.n)


if __name__ == '__main__':
    for a in sys.argv[1:] or ['1', '2', '3', '4', '5']:
        build(int(a))
