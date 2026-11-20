#!/usr/bin/env python3
"""Film 3, "Own everything" (24.0 s, pure typography), round three: the electronic version the owner liked
(music box, 808s, synth bass, synth brass, saw lead), refined, with the campaign PIANO carrying the motif so the
film belongs to the family. 100 BPM, beat 0.6 s, bar 2.4 s.
  0.0-6.5   deadpan: a too-sweet music-box jingle over a low A-minor drone and a slow 808 'dong'; text accents
            0.6 / 1.8 / 3.6 / 4.2 s get a soft glass ping; everything (tails included) fades out 5.85-6.25 and the
            room is held near-silent until the marker's strike is done, so the strike is alone
  6.6-8.2   the marker (strike 6.60-6.83 and 6.87-7.06, handwriting 7.28-8.04, full-stop tap 8.16); the harmony
            turns bright WITH the writing; after the tap a G swell and a clap roll build to 8.85, then a held
            breath of silence until the first hit (round four: before, the build ran into the hit and the
            'breath' measured only -23 LUFS)
  9.6 / 12.0 / 14.4 / 16.8   four hits, one bar each (C, G, Am, F), each a step louder; the last the biggest
  19.2      logo: resolved C, silent by 23.6
Usage: python bs_own.py  -> out/take3-mix.wav"""
import os
import numpy as np
import bs_engine as B
from bs_engine import MOTIF, ROOT, PADV, PADH, m, notes
import dsp
from dsp import SR

LENGTH, BPM, END = 24.0, 100, 23.6
BEAT = 60 / BPM
# ----------------------------------------------------------------------------- the one table of picture times
HITS = [9.6, 12.0, 14.4, 16.8]           # one bar each: C, G, Am, F (the last the biggest)
LOGO = 19.2
ACCENTS = [0.6, 1.8, 3.6, 4.2]          # "you'll own" / "nothing." / "and you'll" / "be happy."
MARKER = dict(strike=[(6.60, 6.83), (6.87, 7.06)], write=(7.28, 8.04), tap=8.16)
QUIET_BY = 6.5
CLEAR = (5.85, 7.22)          # every sound but the marker fades out from 5.85 (gone by 6.25) and returns by 7.22
BREATH = (8.85, 9.58)         # the held breath before the first hit (the build stops on the last 16th before 9.0)
STEPS = [-2.0, -1.3, -0.6, 1.5]   # bus level (dB) of each of the four hit bars: four clear steps up
CH = ['C', 'G', 'Am', 'F']


def b(beat):
    return beat * BEAT


def compose():
    M = B.Mix(LENGTH, seed=33)
    rng = np.random.default_rng(303)
    # WHY the box's bell cut (round four): its notes (E6-C7, 1.3-2.1 kHz) stood 20 dB out of the spectrum, the
    # octave where ears and phone speakers are most sensitive: piercing and toy-like. -5 dB there, and 6 dB less
    # level overall (balance), keeps it a sparkle on top of the piano rather than the lead
    for name, kw in dict(pno=dict(hall=0.35, room=0.2, pump=1.0, comp=(12, 2.5)), box=dict(hall=0.4, delay=0.3, eq=((1750, -5.0, 0.8),)),
                         lead=dict(hall=0.25, delay=0.2, pump=2.0), brass=dict(hall=0.25, pump=2.0),
                         pad=dict(hall=0.4, pump=4.0), drone=dict(hall=0.3), pluck=dict(hall=0.15, delay=0.25, pump=3.0),
                         b808=dict(), kick=dict(room=0.04), clap=dict(room=0.3, hall=0.15), hat=dict(room=0.08),
                         crash=dict(hall=0.2), fx=dict(hall=0.3), marker=dict(room=0.15)).items():
        M.stem(name, **kw)

    # ------------------------------------------------------------------ 0-6.5 deadpan
    # WHY irony: a sweet major jingle (C) floating over a low A-minor drone — happy on top, hollow underneath — so
    # "and you'll be happy" lands as a joke, and the flip at the marker is a real release
    M.put('drone', B.pad('A1 E2 A2', QUIET_BY - 0.35, rng, att=1.0, rel=0.3, lo=380, hi=700, voices=5, detune=8), 0.0)
    for bt in (0, 4, 8):
        M.put('b808', B.k808('A1', decay=0.9, punch=0.6, drive=1.4), b(bt), -3 if bt < 8 else -5)
    jingle = [(1, 'E6', .5, 0), (1.5, 'G6', .5, -4), (2, 'A6', .5, -4), (3, 'C7', .9, 1),
              (5, 'A6', .5, -4), (5.5, 'G6', .5, -4), (6, 'E6', .5, 0), (7, 'C7', .9, 1),
              (9, 'D6', .5, -4), (9.5, 'E6', .5, -4), (10, 'C6', .6, -2)]
    for bt, nn, d, g in jingle:
        M.put('box', B.bell(nn, 1.3), b(bt), g - 7, p=0.15)   # WHY -7: the deadpan must sit well under the hits
    for t, nn, g in zip(ACCENTS, ['E7', 'C8', 'E7', 'C8'], [-12, -8, -9, -7]):
        M.put('box', B.bell(nn, 0.9, bright=0.6), t, g - 4, p=-0.25)
    for k in range(10):      # tick-tock on the beat (last at 5.4 s)
        M.put('hat', B.hat(rng, decay=0.015, tone=1.0 if k % 2 == 0 else 0.85), b(k), -10 if k % 2 else -8, p=0.25)

    # ------------------------------------------------------------------ 6.6-9.6 the marker, the flip, the breath in
    w0, w1 = MARKER['write']
    M.put('pad', B.pad('C5 E5 G5 C6', 1.0, rng, att=0.85, rel=0.35, lo=3500, voices=3, shimmer=0.2), w0 - 0.02, -6)
    for k, nn in enumerate(['C6', 'E6', 'G6']):
        M.put('box', B.bell(nn, 1.2), w0 + 0.02 + k * 0.32, -10 + k, p=-0.2 + 0.2 * k)
    M.put('box', B.bell('C7', 1.2), MARKER['tap'], -9, p=0.2)
    M.put('box', B.bell('E7', 1.2), MARKER['tap'] + 0.03, -12, p=-0.2)
    # the dominant swell: a G pad whose filter opens from the tap, a noise swell and a 16th clap roll, all ending on
    # the last 16th before beat 15 (8.85); then nothing until the hit. WHY: the silence is what makes 9.6 land
    sw0, sw1 = MARKER['tap'] + 0.04, BREATH[0]
    M.put('pad', B.pad('G2 D3 G3 B3 D4', sw1 - sw0, rng, att=0.4, rel=0.01, lo=500, hi=6000, curve=lambda u: u ** 1.6, sheen=0.3), sw0, 0)
    M.put('fx', B.swell(sw1 - sw0, rng, 400, 10000, 2.0), sw0, -2)
    for k in range(4):
        M.put('clap', B.clap(rng, tail=0.03 if k < 3 else 0.06), sw1 - (3 - k) * b(0.25), -12 + 3 * k)

    # ------------------------------------------------------------------ 9.6-19.2 four hits
    hum = np.random.default_rng(9)
    for i, c in enumerate(CH):
        t0 = HITS[i]
        big = (i == 3)
        r = m(ROOT[c]) + 12
        vo = notes(PADV[c])
        span = 4.0 if not big else 3.85         # WHY: sustains stop just before 19.2 so the logo downbeat has an edge
        # the hit itself
        M.put('b808', B.k808(r, decay=0.6 if not big else 1.4), t0, 0 if not big else 1)
        M.put('b808', B.k808(r, decay=0.25), t0 + b(2.5), -4)
        M.put('kick', B.kick(decay=0.13, f0=58, sweep=140, click=0.35, rng=rng), t0, 0)
        M.kick_at(t0)
        if i in (0, 3):
            M.put('crash', B.crash(rng, 2.2 if not big else 2.3), t0, -2 if not big else 0)
        M.put('brass', B.lead(vo[1:], b(0.9 if not big else span), rng, lo=900, hi=8000, env_t=0.09 if not big else 0.3,
                              rel=0.12 if not big else 0.08), t0, 0 if not big else 1)
        M.put('pad', B.pad(PADH[c], b(span), rng, att=0.01, rel=0.08, lo=2200 if not big else 3200), t0, -1 if not big else 1)
        # the piano: the campaign's voice. Chord on 1, then the motif in octaves on top of the electronics
        M.piano('pno', t0, [r - 12, r] + vo[1:], 66 if not big else 72, b(span), roll=0.01)
        if big:
            # the last step: the chord's top doubled an octave up (piano in octaves in both hands)
            M.piano('pno', t0 + 0.02, [n_ + 12 for n_ in vo[2:]], 60, b(span), roll=0.01, p=0.2)
        for bt, nn, d in MOTIF[c]:
            tt = t0 + b(bt)
            v = (72 if not big else 78) + (4 if bt == 0 else 0) + int(hum.integers(-3, 4))
            M.piano('pno', tt, [m(nn), m(nn) + 12], v, b(d) * 0.95, p=0.12)
            M.put('box', B.bell(m(nn) + 12, 1.4), tt, -4, p=0.3)
            M.put('lead', B.lead([m(nn)], b(d) * 0.9, rng, lo=1800, hi=5200), tt, 0)
        # the drive: 8th-note synth chords (3+3+2 accents), 8th hats, kick on 1 / "and" of 2 / 3, clap 2 & 4
        acc = [1, 0, 0, 1, 0, 0, 1, 0]
        for k in range(1, 8):
            for nn in vo[2:]:
                M.put('pluck', B.pluck(nn + 12, rng, tau=0.11), t0 + b(k * 0.5), 0 if acc[k] else -5, p=0.3 if k % 2 else -0.3)
        for k in range(8):
            M.put('hat', B.hat(rng, decay=0.028), t0 + b(k * 0.5), (-3 if k % 2 else -8) + float(rng.uniform(-1, 1)), p=0.25)
        for bt in (2.5, 2):
            M.put('kick', B.kick(decay=0.12, f0=58, sweep=140, click=0.3, rng=rng), t0 + b(bt), -2)
            M.kick_at(t0 + b(bt))
        for bt in (1, 3):
            M.put('clap', B.clap(rng, tail=0.14), t0 + b(bt), 0)
        # into the next hit
        if i == 2:
            for k in range(8):
                M.put('clap', B.clap(rng, tail=0.035), t0 + b(2 + k * 0.25), -12 + 1.4 * k)
            M.put('fx', B.swell(b(2) - 0.03, rng, 500, 9000), HITS[3] - b(2), -1)
        elif not big:
            M.put('clap', B.clap(rng, tail=0.05), t0 + b(3.5), -6)
    # the big bar's tail: a rising clap roll and a swell into the logo, stopping a 16th short
    # WHY the roll and swell stop ~0.1 s short: measured, ending them at the logo masked its downbeat (+20 ms)
    for k in range(5):
        M.put('clap', B.clap(rng, tail=0.03), HITS[3] + b(2.5 + k * 0.25), -14 + 1.6 * k)
    M.put('fx', B.swell(b(2) - 0.12, rng, 400, 9000), LOGO - b(2), -3)
    M.put('fx', B.boom(rng, f=44, dur=1.6), HITS[3], -6)

    # ------------------------------------------------------------------ 19.2 logo: resolved C
    ring = END - LOGO
    M.put('kick', B.kick(decay=0.2, f0=52, sweep=130, rng=rng), LOGO, 0)
    M.kick_at(LOGO)
    M.put('b808', B.k808('C2', decay=1.3), LOGO, 1)
    M.put('clap', B.clap(rng, tail=0.4), LOGO, -2)
    M.put('crash', B.crash(rng, 3.0), LOGO, -3)
    M.piano('pno', LOGO, 'C2 C3 G3 E4 G4 C5 E5', 66, ring, roll=0.014)
    M.put('pad', B.pad('C3 G3 E4 G4 D5', ring - 0.3, rng, att=0.02, rel=0.3, lo=3000, hi=1100, curve=lambda u: u ** 0.6), LOGO, 1)
    M.put('box', B.bell('G6', 1.8), LOGO + b(0.5), -4, p=-0.3)
    M.put('box', B.bell('C7', 2.0), LOGO + b(1), -5, p=0.3)
    M.piano('pno', LOGO + b(1), 'E5', 56, b(1))
    M.piano('pno', LOGO + b(2), 'C5 E5 G5', 54, ring - b(2), roll=0.02, p=0.15)
    return M


def marker_track(n):
    """The marker on paper (the round-two recipe, kept: owner did not object to it). Times relative to 6.6 s."""
    import r2_engine as E
    rng = np.random.default_rng(303)
    (a0, a1), (b0, b1) = MARKER['strike']
    w0, w1 = MARKER['write']
    t0 = a0
    strokes = [(0.00, a1 - a0, 1.0, 1.0), (b0 - t0, b1 - b0, 0.95, 1.12)]
    t = w0 - t0
    while t < w1 - t0 - 0.04:
        d = float(min(rng.uniform(0.06, 0.15), (w1 - t0) - t))
        strokes.append((t, d, float(rng.uniform(0.8, 1.0)), float(rng.uniform(0.85, 1.25))))
        t += d + float(rng.uniform(0.02, 0.05))
    strokes.append((MARKER['tap'] - t0, 0.025, 0.8, 0.9))
    mk = E.marker(rng, strokes, 2.4)
    return dsp.pan(mk, 0.05) * np.sqrt(2), t0


def build():
    M = compose()
    mk, t0 = marker_track(M.n)
    M.put('marker', mk, t0)
    # the cleared room before the marker: every stem but the marker (and the short room) goes, tails included
    gate = B.gap_curve(M.n, CLEAR[0], CLEAR[1], -70.0, fade_in=0.4, fade_out=0.04)
    x, stems = M.render(hall_rt=2.0, hall_db=-10.0, piano_bright=56, piano_felt=10500, air_db=2.0, presence_db=1.0,
                        air_layer=-26.0, gate=(gate, ('marker', 'room')),
                        balance=dict(pno=0, box=-9, lead=-12, brass=-8, pad=-9, drone=-10, pluck=-13, b808=-5.5,
                                     kick=-7, clap=-9, hat=-14, crash=-14, fx=-12, marker=-3))
    x = B.glue(x, thresh_db=-21, ratio=1.8)
    # the held breath before the first hit (everything, reverb included)
    x = B.gap(x, BREATH[0] + 0.01, BREATH[1], -70.0, fade_in=0.03, fade_out=0.02)
    # four steps up: each hit bar a little louder than the last (20 ms ramps on the hits)
    tt = np.arange(M.n) / SR
    lv = np.zeros(M.n)
    for k, t0 in enumerate(HITS):
        t1 = HITS[k + 1] if k + 1 < len(HITS) else LOGO
        lv += STEPS[k] * np.clip((tt - t0) / 0.02, 0, 1) * np.clip((t1 - tt) / 0.02, 0, 1)
    x = x * B.db(lv)[:, None]
    x = B.pre_hit_dip(x, LOGO, 6.0, 0.15)
    x = B.pre_hit_dip(x, HITS[3], 4.0, 0.12)
    x = B.ending(x, END, 1.6)
    from bs_verify import stem_levels
    print('  stems (LUFS at final gain):', stem_levels(stems, B.db(-14 - dsp.lufs(x))))
    return B.finish(x, os.path.join(B.OUT, 'take3-mix.wav'), M.n)


if __name__ == '__main__':
    build()
