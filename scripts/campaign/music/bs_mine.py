#!/usr/bin/env python3
"""Film 2, "Make it mine" (60.0 s, no narrator), round four: piano-led + electronic at 120 BPM (palette sketch 2's
sound at product-film speed). Beat 0.5 s, bar 2.0 s.
EVERY PICTURE TIME IS READ FROM THE FILM (bs_picture.py reads film/src/round2/take2.tsx): the look changes
(T_LOOK1, T_LOOK2), where each part starts, the email (T_EMAIL), the inhale (T_BEFORE), the peak (T_AFTER), and the
typing pockets (every stretch of footage where a message is typed at true speed). WHY: the round-three score was
fitted by hand to an older cut and its drop came 500 ms before the look changed. Re-cut the picture, re-run this,
and the score refits itself. The owner has said he dislikes the looks (themes) in the window, so this WILL be
re-run on a new cut.
Form (times shown for the 2026-11-20 cut):
  look   0-14   light intro under the first question; a build; one beat of breath; THE DROP on the frame the new
                look appears (T_LOOK1 5.0); a smaller breath + accent on the second look (T_LOOK2 10.5)
  home   14-30  the motif in full, drums thinned to kick + shaker (quieter: about -16 LUFS short-term), claps and
                hats return halfway; the arc climbs to about -14 by 30
  money  30-46  full groove, climbing to about -13 by 42; T_EMAIL (43) a light, cute moment (music box, plucks,
                snaps, no kick)
  46-50  T_BEFORE an inhale: real near-silence on the cut back to the app as it started; T_AFTER THE PEAK (everything
         they made is revealed), about 4-5 LU above the body; settle by 49.5, fade by 50.0
  50-56  closing lines, half-time; 56 logo: resolved C, silent by 59.6
Typing ticks only in the picture's typing pockets, 16.5 LU under the music (round two: 12.9; owner: "quieter").
Usage: python bs_mine.py  -> out/take2-mix.wav"""
import os
import numpy as np
import bs_engine as B
import bs_picture
from bs_engine import MOTIF, ROOT, PADV, PADH, m, notes
import dsp
from dsp import SR, db

LENGTH, BPM = 60.0, 120
BEAT = 60 / BPM
BAR = 4 * BEAT
# ----------------------------------------------------------------------------- the picture, read from the film
PIC = bs_picture.timeline()
C_ = PIC['consts']
G_ = PIC['groups']
SECTIONS = dict(look=G_.get('look', 0.0), part2=G_['home'], part3=G_['money'], peak_bar=C_['T_BEFORE'], close=50.0, logo=56.0)
HITS = dict(look_change=C_['T_LOOK1'],      # the first new look appears: THE DROP
            look2=C_['T_LOOK2'],            # the second look: a smaller accent
            email=C_['T_EMAIL'], email_end=C_['T_BEFORE'],
            inhale=C_['T_BEFORE'],          # cut back to the app as it started: near-silence
            peak=C_['T_AFTER'],             # everything made is revealed: the biggest moment
            settle=49.5, quiet=50.0, lines=(50.1, 52.5), logo=56.0, end=59.6)
# typing pockets: (start, end) of every typed stretch on screen, padded 40 ms each side for the first/last key
POCKETS = [(max(0.0, a - 0.04), b + 0.04) for a, b in PIC['typing']]
# picture accents (time, weight 2 = a real hit): the second look change
ACCENTS = [(HITS['look2'], 2)]
# the one-beat breaths: nothing from the band in the beat before each look change (the reverse piano breathes in)
BREATHS = [(HITS['look_change'] - BEAT, HITS['look_change']), (HITS['look2'] - BEAT, HITS['look2'])]
# the arc, as short-term loudness targets (LUFS, 3 s window) at times; fit_arc() turns the bus to meet them.
# WHY targets rather than dB offsets: round three's sections all measured -13.2 to -14.2 (stock-music flatness)
# because nobody measured the result of hand-set offsets.
ARC = [(SECTIONS['look'] + 1.5, -18.0), (HITS['look_change'] + 1.5, -13.5), (SECTIONS['part2'] - 0.5, -14.0),
       (SECTIONS['part2'] + 2.0, -16.5), (SECTIONS['part3'] - 1.0, -14.0), (SECTIONS['part3'] + 2.0, -14.0),
       ((SECTIONS['part3'] + HITS['email']) / 2, -13.6), (HITS['email'] - 1.0, -13.0), (HITS['email'] + 1.5, -15.0),
       (HITS['peak'] + 1.5, -9.5), (HITS['settle'], -13.0),
       (SECTIONS['close'] + 1.5, -15.5), (HITS['logo'] - 0.5, -15.0), (HITS['logo'] + 1.2, -13.5)]
KEYS_UNDER_MUSIC = 16.5       # LU under the music inside the pockets (round two 12.9, round three 20.9: too quiet)
END = HITS['end']


def bars(t0, t1):
    """Bar start times from t0 up to (not including) t1."""
    k = int(round((t1 - t0) / BAR))
    return [t0 + i * BAR for i in range(k)]


def in_breath(t):
    return any(a - 1e-6 <= t < b - 1e-6 for a, b in BREATHS)


def compose():
    M = B.Mix(LENGTH, seed=22)
    rng = np.random.default_rng(222)
    hum = np.random.default_rng(322)
    jit = lambda: float(hum.uniform(-0.006, 0.006))
    for name, kw in dict(pno=dict(hall=0.25, room=0.25, pump=1.0, comp=(12, 2.5)),
                         # WHY the box bell cut: music-box notes are pure tones in the 1.3-2.1 kHz octave, where
                         # ears and phone speakers are most sensitive; a static -4.5 dB there keeps them sweet, not piercing
                         box=dict(hall=0.4, delay=0.4, eq=((1750, -4.5, 0.8),)),
                         pad=dict(hall=0.35, pump=5.0), hi=dict(hall=0.55, pump=3.0), sub=dict(pump=2.0),
                         pluck=dict(hall=0.15, delay=0.3, pump=3.0), kick=dict(room=0.04), b808=dict(),
                         clap=dict(room=0.35, hall=0.1), hat=dict(room=0.08), shk=dict(room=0.2), fx=dict(hall=0.3),
                         crash=dict(hall=0.2)).items():
        M.stem(name, **kw)

    def in_pocket(t):
        return any(a <= t < b for a, b in POCKETS)

    def piano_bar(t0, c, vel=62, motif=True, off=True, octave=True, keep=lambda t: True, stacc=0.85):
        vo = notes(PADV[c])
        if off:   # short off-beat chords: the bounce
            for bt in (0.5, 1.5, 2.5, 3.5):
                tt = t0 + bt * BEAT
                if keep(tt):
                    M.piano('pno', tt + jit(), vo[1:], 44 + int(hum.integers(-3, 4)) - (6 if in_pocket(tt) else 0), BEAT * 0.35, p=-0.1)
        if motif:
            for bt, nn, d in MOTIF[c]:
                if not keep(t0 + bt * BEAT):
                    continue
                v = vel + (6 if bt == 0 else 0) + int(hum.integers(-3, 4))
                ch = [m(nn), m(nn) - 12] if octave else [m(nn)]
                M.piano('pno', t0 + bt * BEAT, ch, v, BEAT * d * stacc, p=0.12)

    def groove(t0, c, level=0.0, hats=True, claps=True, four=True, shaker=True, plucks=False, bells=False, sub=True,
               keep=lambda t: True, pad=True):
        """One bar of the band. keep(t) drops any event the picture needs silent (a breath, an interruption)."""
        r = m(ROOT[c]) + 12
        ok = lambda bt: keep(t0 + bt * BEAT)
        thin = -3.0 if in_pocket(t0) or in_pocket(t0 + BAR * 0.5) else 0.0   # WHY: the band thins a little under typing
        if sub:
            for bt, d, o in ((0, 0.45, 0), (0.5, 0.3, 12), (1.5, 0.45, 0), (2.5, 0.3, 12), (3, 0.45, 0)):
                if ok(bt): M.put('sub', B.sub(r + o, BEAT * d, rel=0.05), t0 + bt * BEAT, (-3 if o else 0) + level)
        for bt in [b_ for b_ in (range(4) if four else (0, 2)) if ok(b_)]:
            M.put('kick', B.kick(decay=0.16, f0=52, sweep=120, rng=rng), t0 + bt * BEAT, level + thin)
            M.kick_at(t0 + bt * BEAT)
        if claps:
            for bt in [b_ for b_ in (1, 3) if ok(b_)]:
                M.put('clap', B.clap(rng, tail=0.1), t0 + bt * BEAT, level + thin)
        if hats:
            for bt in [b_ for b_ in (0.5, 1.5, 2.5, 3.5) if ok(b_)]:
                M.put('hat', B.hat(rng, decay=0.06), t0 + bt * BEAT, level + thin + float(rng.uniform(-1, 1)), p=0.25)
        if shaker:
            for k in range(16):
                if ok(k / 4):
                    M.put('shk', B.shaker(rng), t0 + k * BEAT / 4 + float(rng.uniform(-0.004, 0.004)), (0 if k % 2 else -6) + level + float(rng.uniform(-1.5, 1)), p=-0.3)
        if plucks:
            pool = notes(PADH[c])
            for k in range(8):
                if ok(k / 2 + 0.25):
                    M.put('pluck', B.pluck(pool[[3, 2, 1, 2, 0, 2, 1, 2][k]] + 12, rng, tau=0.12), t0 + k * BEAT / 2 + BEAT / 4, level + thin, p=0.4 if k % 2 else -0.4)
        if bells:
            for bt, nn, d in MOTIF[c]:
                if ok(bt):
                    M.put('box', B.bell(m(nn) + 12, 1.4), t0 + bt * BEAT, level - 2, p=0.3)
        if pad:
            # the pad plays from the first kept beat to the end of the bar
            first = next((k / 4 for k in range(16) if ok(k / 4)), None)
            if first is not None:
                M.put('pad', B.pad(PADH[c], (4 - first) * BEAT, rng, att=0.05, rel=0.3, lo=1700, sheen=0.25), t0 + first * BEAT, level)

    def arrive(t, c, big=True):
        """A look change landing exactly on t: 808, kick, clap, crash, the rolled chord, glass."""
        g = 0 if big else -4
        M.put('crash', B.crash(rng, 2.4 if big else 1.8), t, g)
        M.put('b808', B.k808(m(ROOT[c]), decay=0.9 if big else 0.6), t, g)
        M.put('kick', B.kick(decay=0.2, f0=50, sweep=130, rng=rng), t, 0)
        M.kick_at(t)
        M.put('clap', B.clap(rng, tail=0.25 if big else 0.15), t, g)
        M.piano('pno', t, ('C2 C3 G3 E4 G4 C5' if c == 'C' else [m(ROOT[c]), m(ROOT[c]) + 12] + notes(PADV[c])[1:]),
                70 if big else 64, BAR * 0.75, roll=0.012)
        if big:
            M.put('pad', B.pad(PADH[c] + ' C6', BAR * 0.75, rng, att=0.01, rel=0.4, lo=4500, hi=1700, curve=lambda u: u ** 0.5, sheen=0.3), t, 2)
        for i, nn in enumerate(['C6', 'E6', 'G6', 'C7'] if big else ['G6', 'C7']):
            M.put('box', B.bell(nn, 1.6), t + 0.06 + i * 0.07, -4 - 1.5 * i, p=-0.45 + 0.3 * i)
        # the reverse piano breathing in through the beat before (the band is silent there: BREATHS)
        ch = B.render_piano([dict(t=0.0, midi=mm, vel=74, dur=2.0) for mm in notes('C3 G3 E4 G4 C5')], int(2.5 * SR))
        M.put('fx', B.reverse_tail(ch, BEAT - 0.03), t - BEAT, -4 if big else -7)

    # ------------------------------------------------------------------ look (light intro, drop, second look)
    L1, L2 = HITS['look_change'], HITS['look2']
    prog_look = ['C', 'G', 'C', 'G', 'Am', 'F', 'G']
    look_bars = bars(SECTIONS['look'], SECTIONS['part2'])
    for k, t0 in enumerate(look_bars):
        c = prog_look[k % len(prog_look)]
        # the bar containing the drop changes to C on the drop (the motif's home chord lands with the new look)
        if t0 <= L1 < t0 + BAR:
            c = 'C'
        before = lambda t: t < L1 - BEAT - 1e-6                     # the light intro
        after = lambda t: t >= L1 - 1e-6 and not in_breath(t)       # the full band
        if t0 < L1:
            # light intro: piano bounce + shaker + soft four-on-the-floor, motif from bar 1
            piano_bar(t0, c, vel=56, motif=(k >= 1), octave=False, keep=before)
            groove(t0, c, level=-6, hats=False, claps=False, plucks=False, sub=(k >= 1), keep=before, pad=(k >= 1))
        if t0 + BAR > L1:
            keep = (lambda t: after(t) and abs(t - L1) > 1e-6 and abs(t - L2) > 1e-6)
            piano_bar(t0, c, vel=62, keep=keep)
            groove(t0, c, plucks=(t0 >= L1 + BAR), keep=keep)
    arrive(L1, 'C', big=True)
    for t, wgt in ACCENTS:
        # WHY the smaller arrival: the second look is the same gesture as the first, so it gets the same shape
        # (breath, then a hit on the frame) at a lower weight; the drop stays the film's first big moment
        c = prog_look[int((t - SECTIONS['look']) // BAR) % len(prog_look)]
        arrive(t, c, big=False)
    # the build into the drop: a soft clap roll and a swell over the bar before the breath
    for k in range(6):
        M.put('clap', B.clap(rng, tail=0.035), L1 - BEAT - 1.5 + k * BEAT / 2, -16 + 2 * k)
    M.put('fx', B.swell(1.5 - 0.03, rng, 400, 9000), L1 - BEAT - 1.5, -4)
    # a lift into home
    for k in range(4):
        M.put('clap', B.clap(rng, tail=0.035), SECTIONS['part2'] - BEAT * 2 + k * BEAT / 2, -12 + 2 * k)
    M.put('fx', B.swell(BAR - 0.03, rng, 500, 9000), SECTIONS['part2'] - BAR, -6)

    # ------------------------------------------------------------------ home: the motif in full, drums thinned
    prog = ['C', 'G', 'Am', 'F']
    home = bars(SECTIONS['part2'], SECTIONS['part3'])
    for i, t0 in enumerate(home):
        c = prog[i % 4]
        piano_bar(t0, c, vel=64)
        # WHY thinned to kick + shaker for the first half: the film's middle needs somewhere lower to climb from
        full = i >= len(home) // 2
        groove(t0, c, hats=full, claps=full, plucks=full, bells=False)
    for k in range(4):
        M.put('clap', B.clap(rng, tail=0.035), SECTIONS['part3'] - BEAT * 2 + k * BEAT / 2, -10 + 2 * k)

    # ------------------------------------------------------------------ money; the email
    e0, e1 = HITS['email'], HITS['email_end']
    for i, t0 in enumerate(bars(SECTIONS['part3'], SECTIONS['peak_bar'])):
        c = prog[i % 4]
        if i == 0:
            M.put('crash', B.crash(rng, 2.0), t0, -3)
        if t0 + BAR <= e0:
            piano_bar(t0, c, vel=64)
            groove(t0, c, plucks=True, bells=(i % 4 == 3))
        elif t0 < e0:
            # the bar the email interrupts: groove up to half a beat before it, a clean entrance
            kp = lambda t: t < e0 - BEAT / 2 - 1e-6
            piano_bar(t0, c, vel=60, motif=False, keep=kp)
            groove(t0, c, level=-2, hats=False, plucks=False, keep=kp)
    # the email (e0 - e1), written from its own start: music box motif up high, plucked bass, snaps, shaker
    t, segs = e0, []
    for c, nb in (('F', 4), ('G', 4)):
        if t >= e1 - 1e-6:
            break
        segs.append((t, c, min(nb, (e1 - t) / BEAT)))
        t += nb * BEAT
    for t0, c, nb in segs:
        for bt, nn, d in MOTIF[c]:
            if bt >= nb - 0.6:
                break
            M.put('box', B.bell(m(nn) + 12, 1.1), t0 + bt * BEAT, -2, p=0.25)
            M.piano('pno', t0 + bt * BEAT, m(nn), 50, BEAT * d * 0.5, p=0.15, felt=11000)
        r = m(ROOT[c]) + 12
        for bt in range(int(nb)):
            if t0 + bt * BEAT > e1 - 0.4:
                break
            M.put('pluck', B.pluck(r + (7 if bt % 2 else 0), rng, dur=0.4, tau=0.12, bright=0.7), t0 + bt * BEAT, -1)
            if bt % 2 == 1:
                M.put('clap', B.clap(rng, tail=0.04, bright=1.3), t0 + bt * BEAT, -7)
        for k in range(int(nb * 4)):
            if t0 + k * BEAT / 4 > e1 - 0.3:
                break
            M.put('shk', B.shaker(rng), t0 + k * BEAT / 4, (0 if k % 2 else -6) - 3, p=-0.3)
        M.put('pad', B.pad(PADH[c], max(0.3, min(nb * BEAT, e1 - 0.15 - t0)), rng, att=0.3, rel=0.15, lo=2400, sheen=0.25), t0, -6)
    for i, nn in enumerate(['G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 1.2), e0 + i * 0.06, -6 - 2 * i, p=-0.3 + 0.3 * i)

    # ------------------------------------------------------------------ the inhale and THE PEAK
    pk, inh = HITS['peak'], HITS['inhale']
    # WHY the breath-in starts 0.55 s after the cut: the first half of the inhale is near-silence (the picture cuts
    # back to the app as it started), then a reverse piano and a swell breathe in, stopping 60 ms short of the peak
    # so its attack lands clean
    b0 = inh + 0.55
    chP = B.render_piano([dict(t=0.0, midi=mm, vel=80, dur=2.0) for mm in notes('C2 G2 C3 E3 G3 C4 E4 G4 C5')], int(2.5 * SR))
    M.put('fx', B.reverse_tail(chP, pk - b0 - 0.06, rt60=2.6), b0, -2)
    M.put('fx', B.swell(pk - b0 - 0.06, rng, 300, 10000, 2.2), b0, -6)
    # the peak: rolled piano chord with the motif on top in octaves, 808, crash, wide-open pads, glass
    M.piano('pno', pk, 'C2 G2 C3', 66, 2.6, roll=0.008)
    M.piano('pno', pk + 0.025, 'E3 G3 C4 E4 G4', 62, 2.5, roll=0.012, p=0.05)
    for bt, nn, d in MOTIF['C']:
        M.piano('pno', pk + 0.06 + bt * BEAT, [m(nn), m(nn) + 12], 64, BEAT * d, p=0.12)
    # WHY the hits are held back and the sustained bloom pushed (round four): the peak must be 4-5 LU above the
    # body as LOUDNESS, and a stack of transients only made the limiter pull 4.5 dB without sounding bigger
    M.put('b808', B.k808('C1', decay=1.2), pk, -4)
    M.put('kick', B.kick(decay=0.25, f0=48, sweep=140, rng=rng), pk, -3)
    M.kick_at(pk)
    M.put('clap', B.clap(rng, tail=0.4), pk, -4)
    M.put('crash', B.crash(rng, 3.0), pk, 1)
    M.put('fx', B.boom(rng, f=44, dur=1.8), pk, -10)
    settle = HITS['settle'] - pk
    M.put('pad', B.pad(PADV['C'] + ' C4', settle, rng, att=0.01, rel=0.5, lo=4500, hi=1500, curve=lambda u: np.clip((u - 0.3) / 0.7, 0, 1) ** 0.7, sheen=0.3), pk, 6)
    M.put('hi', B.pad('E5 G5 C6 D6', settle, rng, att=0.05, rel=0.5, lo=5000, voices=4, shimmer=0.3, sheen=0.4), pk, 5)
    M.put('sub', B.sub('C2', settle - 0.2, rel=0.5), pk, 3)
    for i, nn in enumerate(['C6', 'E6', 'G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 2.0), pk + 0.25 + i * 0.09, -4 - 1.3 * i, p=-0.5 + 0.25 * i)
    # a light pulse carries the bloom (hats and shaker only), gone by the settle
    for k in range(int((HITS['settle'] - pk - 0.5) / (BEAT / 2))):
        tt = pk + 0.5 + k * BEAT / 2
        M.put('hat', B.hat(rng, decay=0.04), tt, -4 - 0.5 * k, p=0.25)
        M.put('shk', B.shaker(rng), tt + BEAT / 4, -6 - 0.5 * k, p=-0.3)

    # ------------------------------------------------------------------ closing lines, half-time
    for i, (t0, c) in enumerate(zip(bars(SECTIONS['close'], SECTIONS['logo']), ['Am', 'F', 'G'])):
        r = m(ROOT[c]) + 12
        vo = notes(PADV[c])
        M.piano('pno', t0, [r - 12, r] + vo[1:], 52, BAR * 0.98, roll=0.015)
        for bt, nn, d in MOTIF[c][:2] if i < 2 else [(0, 'B5', 2.0), (2, 'D6', 2.0)]:
            M.piano('pno', t0 + bt * BEAT, [m(nn), m(nn) - 12], 58, BEAT * d, p=0.12)
        M.put('pad', B.pad(PADV[c], BAR, rng, att=0.2, rel=0.4, lo=1400, hi=2400 if i == 2 else None, sheen=0.2), t0, -2)
        M.put('sub', B.sub(r, BAR * 0.9, rel=0.2), t0, -2)
        M.put('kick', B.kick(decay=0.2, f0=50, sweep=110, rng=rng), t0, -3)
        M.kick_at(t0)
        M.put('clap', B.clap(rng, tail=0.18), t0 + 2 * BEAT, -3)
        for bt in (0.5, 1, 1.5, 2.5, 3, 3.5):
            M.put('hat', B.hat(rng, decay=0.04), t0 + bt * BEAT, -8 + float(rng.uniform(-1, 1)), p=0.25)
        pool = sorted(notes(PADH[c]))
        for k in range(4):
            M.put('pluck', B.pluck(pool[[0, 2, 1, 3][k]] + 12, rng, tau=0.2), t0 + k * BEAT, -4, p=0.4 if k % 2 else -0.4)
    M.put('fx', B.swell(BAR * 0.75 - 0.03, rng, 400, 9000), HITS['logo'] - BAR * 0.75, -5)

    # ------------------------------------------------------------------ logo: resolved C, silent by 59.6
    lg = HITS['logo']
    ring = END - lg
    M.put('kick', B.kick(decay=0.25, f0=48, sweep=130, rng=rng), lg, 0)
    M.kick_at(lg)
    M.put('b808', B.k808('C1', decay=1.2), lg, 0)
    M.put('clap', B.clap(rng, tail=0.35), lg, -3)
    M.put('crash', B.crash(rng, 3.0), lg, -3)
    M.piano('pno', lg, 'C2 C3 G3 E4', 62, ring, roll=0.012)
    M.piano('pno', lg + 0.04, 'G4 C5 E5', 64, ring, roll=0.025, p=0.15)
    M.put('pad', B.pad(PADH['C'], ring - 0.4, rng, att=0.02, rel=0.35, lo=3000, hi=1200, curve=lambda u: u ** 0.6, sheen=0.3), lg, 0)
    M.put('sub', B.sub('C2', 2.0, rel=0.9), lg, 0)
    for i, nn in enumerate(['G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 2.0), lg + 0.25 + i * 0.125, -5 - 2 * i, p=-0.3 + 0.3 * i)
    return M


def typing(n):
    """Soft key ticks in the typing pockets (humanised timing/level, three brightness variants), high-passed at
    2 kHz. WHY the high-pass (round four): the tick's low thump is what fought the music; its 2-4 kHz click is
    what the ear hears, so it reads clearly at a lower level."""
    import mix as mixmod, sfx
    kr = np.random.default_rng(2002)
    ticks = np.zeros((n, 2))
    for t, typ, g, p in mixmod.expand([dict(t0=a + 0.05, t1=b - 0.05, type='typing', cps=8) for a, b in POCKETS], 2002):
        w = sfx.key(kr) * db(g)
        i = int(round(t * SR))
        if 0 <= i < n:
            st = dsp.pan(w, p) * np.sqrt(2)
            j = min(n, i + len(st))
            ticks[i:j] += st[:j - i]
    return dsp.hp(ticks, 2000, 2)


def pocket_ratio(keys, music):
    import pyloudnorm as pyln
    mt = pyln.Meter(SR, block_size=0.2)
    r = [mt.integrated_loudness(keys[int(a * SR):int(b * SR)]) - mt.integrated_loudness(music[int(a * SR):int(b * SR)])
         for a, b in POCKETS if b - a >= 0.5]
    return float(np.mean(r))


def build():
    M = compose()
    x, stems = M.render(hall_rt=2.0, hall_db=-11.0, delay_t=0.375, piano_bright=58, piano_felt=10500, air_db=2.0,
                        presence_db=1.0, air_layer=-26.0, low_cut=38,
                        balance=dict(pno=0, box=-16, pad=-11, hi=-14, sub=-6, pluck=-12, kick=-6, b808=-8, clap=-10,
                                     hat=-14, shk=-16, fx=-12, crash=-14))
    x = B.glue(x, thresh_db=-21, ratio=1.8)
    # the inhale: near-silence on the cut back to the app as it started (the breath-in rises out of it)
    x = B.gap(x, HITS['inhale'] - 0.12, HITS['inhale'] + 0.5, depth_db=-45.0, fade_in=0.12, fade_out=0.06)
    x = B.fit_arc(x, ARC, skip=[(HITS['email'] + 1.6, HITS['peak'] + 1.4), (HITS['look_change'] - 2.0, HITS['look_change'] + 1.4)])
    x = B.pre_hit_dip(x, HITS['look_change'], 4.0, 0.12)
    # typing: scaled by measurement so it sits KEYS_UNDER_MUSIC LU under the music inside the pockets
    keys = typing(M.n)
    keys *= db(-KEYS_UNDER_MUSIC - pocket_ratio(keys, x))
    x = x + keys
    x = B.ending(x, END, 1.6)
    from bs_verify import stem_levels
    print('  picture: looks', HITS['look_change'], HITS['look2'], '| parts', SECTIONS['part2'], SECTIONS['part3'],
          '| email', HITS['email'], '| inhale', HITS['inhale'], '| peak', HITS['peak'])
    print('  typing pockets:', ' '.join(f'{a:.2f}-{b:.2f}' for a, b in POCKETS))
    print('  stems (LUFS at final gain):', stem_levels(stems, db(-14 - dsp.lufs(x))))
    print(f'  typing: {pocket_ratio(keys, x - keys):.1f} LU under the music inside the pockets (round two: -12.9)')
    return B.finish(x, os.path.join(B.OUT, 'take2-mix.wav'), M.n)


HIT_TIMES = lambda: [HITS['look_change'], HITS['look2'], HITS['peak'], HITS['logo']]

if __name__ == '__main__':
    build()
