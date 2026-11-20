#!/usr/bin/env python3
"""Film 2, "Make it mine" (60.0 s, no narrator), round three: piano-led + electronic at 120 BPM (palette sketch 5's
feel). Beat 0.5 s, bar 2.0 s, bar b starts at 2*b s.
The picture is being rebuilt, so every picture time lives in the ONE table below (SECTIONS, HITS, POCKETS,
ACCENTS); re-fitting to the final beat list = edit the table and re-run. Sections that are not bar-aligned in a
new cut still work: each section is written from its own start time.
  0-14   a look: busy from the first frame, a build 2.6-4.0, a one-beat breath, THE BIG CHANGE at 4.5 (the drop)
  14-30  the motif in full over the groove
  30-46  second half; 43-46 a cute, light moment (an email): music box and plucks, drums thin to shaker + snaps
  46-50  46.0 an inhale (everything pulls back), 47.0 THE PEAK (everything they made is revealed), bloom to
         47.8, settle by 49.5, fade 49.5-50.0
  50-56  closing lines (50.1, 52.5): half-time, spacious, still moving
  56-60  logo: resolved C on 56.0, silent by 59.6
Typing ticks in the typing pockets, 8 dB quieter than round two (measured: round two sat 12.9 LU under the music
inside the pockets; this sits 20.9 LU under).
Usage: python bs_mine.py  -> out/take2-mix.wav"""
import os
import numpy as np
import bs_engine as B
from bs_engine import MOTIF, ROOT, PADV, PADH, m, notes
import dsp
from dsp import SR, db

LENGTH, BPM = 60.0, 120
BEAT = 60 / BPM
BAR = 4 * BEAT
# ----------------------------------------------------------------------------- the ONE table of picture times
SECTIONS = dict(look=0.0, part2=14.0, part3=30.0, peak_bar=46.0, close=50.0, logo=56.0)
HITS = dict(look_change=4.5,      # the look changes: the drop
            email=43.0,           # the cute moment starts
            email_end=46.0,
            inhale=46.0,          # music pulls back
            peak=47.0,            # everything made is revealed — the biggest moment
            settle=49.5, quiet=50.0,
            lines=(50.1, 52.5),   # closing lines
            logo=56.0, end=59.6)
# typing pockets (start, end) — from the round-two cut; replace with the rebuilt picture's typing
POCKETS = [(0.0, 0.35), (1.5, 2.6), (8.0, 8.7), (14.0, 15.2), (17.0, 18.8), (23.0, 24.5), (30.1, 31.4), (35.0, 36.5),
           (41.5, 42.9)]
# optional picture accents (time, weight 1 = small tick of colour, 2 = a real hit) — fill from the final beat list
ACCENTS = []
# overall level by time (dB, linear between points): WHY: the grooves sit a little under the two big moments, so
# the look change and the peak are measurably the loudest things in the film
LEVELS = [(0.0, -1.0), (HITS['look_change'] - 0.01, -1.0), (HITS['look_change'], 0.0), (6.5, -2.0),
          (HITS['peak'] - 0.01, -2.0), (HITS['peak'], 1.0), (HITS['settle'], 0.0), (SECTIONS['close'], -2.0),
          (HITS['logo'], -1.0), (LENGTH, -1.0)]
KEYS_UNDER_MUSIC = 20.9       # LU under the music inside the pockets (round two: 12.9; brief: 8 dB quieter)
END = HITS['end']


def bars(t0, t1):
    """Bar start times from t0 up to (not including) t1."""
    k = int(round((t1 - t0) / BAR))
    return [t0 + i * BAR for i in range(k)]


def compose():
    M = B.Mix(LENGTH, seed=22)
    rng = np.random.default_rng(222)
    hum = np.random.default_rng(322)
    jit = lambda: float(hum.uniform(-0.006, 0.006))
    for name, kw in dict(pno=dict(hall=0.25, room=0.25, pump=1.0, comp=(12, 2.5)), box=dict(hall=0.4, delay=0.4),
                         pad=dict(hall=0.35, pump=5.0), hi=dict(hall=0.55, pump=3.0), sub=dict(pump=2.0),
                         pluck=dict(hall=0.15, delay=0.3, pump=3.0), kick=dict(room=0.04), b808=dict(),
                         clap=dict(room=0.35, hall=0.1), hat=dict(room=0.08), shk=dict(room=0.2), fx=dict(hall=0.3),
                         crash=dict(hall=0.2)).items():
        M.stem(name, **kw)

    def in_pocket(t):
        return any(a <= t < b for a, b in POCKETS)

    def piano_bar(t0, c, vel=62, motif=True, off=True, octave=True, half=False, stacc=0.85):
        vo = notes(PADV[c])
        if off:   # short off-beat chords: the bounce
            for bt in (0.5, 1.5, 2.5, 3.5):
                if half and bt > 2:
                    break
                M.piano('pno', t0 + bt * BEAT + jit(), vo[1:], 44 + int(hum.integers(-3, 4)) - (6 if in_pocket(t0 + bt * BEAT) else 0), BEAT * 0.35, p=-0.1)
        if motif:
            for bt, nn, d in MOTIF[c]:
                if half and bt >= 2:
                    break
                v = vel + (6 if bt == 0 else 0) + int(hum.integers(-3, 4))
                ch = [m(nn), m(nn) - 12] if octave else [m(nn)]
                M.piano('pno', t0 + bt * BEAT, ch, v, BEAT * d * stacc, p=0.12)

    def groove(t0, c, level=0.0, hats=True, claps=True, four=True, shaker=True, plucks=False, bells=False, sub=True, upto=4.0):
        """One bar of the band; upto (beats) cuts it short when the picture interrupts mid-bar."""
        r = m(ROOT[c]) + 12
        ok = lambda bt: bt < upto - 1e-6
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
            for k in range(int(round(upto * 4))):
                M.put('shk', B.shaker(rng), t0 + k * BEAT / 4 + float(rng.uniform(-0.004, 0.004)), (0 if k % 2 else -6) + level + float(rng.uniform(-1.5, 1)), p=-0.3)
        if plucks:
            pool = notes(PADH[c])
            for k in range(8):
                M.put('pluck', B.pluck(pool[[3, 2, 1, 2, 0, 2, 1, 2][k]] + 12, rng, tau=0.12), t0 + k * BEAT / 2 + BEAT / 4, level + thin, p=0.4 if k % 2 else -0.4)
        if bells:
            for bt, nn, d in MOTIF[c]:
                M.put('box', B.bell(m(nn) + 12, 1.4), t0 + bt * BEAT, level - 2, p=0.3)
        M.put('pad', B.pad(PADH[c], upto * BEAT, rng, att=0.05, rel=0.3 if upto >= 4 else 0.15, lo=1700), t0, level)

    # ------------------------------------------------------------------ 0-14 a look
    look = [('C', 0), ('G', 1), ('C', 2), ('G', 3), ('Am', 4), ('F', 5), ('G', 6)]
    for c, k in look:
        t0 = SECTIONS['look'] + k * BAR
        if k < 2:
            # busy from the first frame, but not yet the full band: piano bounce + shaker + a soft four-on-the-floor
            piano_bar(t0, c, vel=56, motif=(k == 1), octave=False)
            groove(t0, c, level=-6, hats=False, claps=False, plucks=False, sub=(k == 1))
            continue
        if k == 2:
            # the breath (beat 1 of bar 2), then THE DROP on 4.5: on beat 2
            drop = HITS['look_change']
            M.put('crash', B.crash(rng, 2.4), drop, 0)
            M.put('b808', B.k808(m(ROOT[c]), decay=0.9), drop, 0)
            M.put('kick', B.kick(decay=0.2, f0=50, sweep=130, rng=rng), drop, 0)
            M.kick_at(drop)
            M.put('clap', B.clap(rng, tail=0.25), drop, 0)
            M.piano('pno', drop, 'C2 C3 G3 E4 G4 C5', 70, BAR - (drop - t0), roll=0.012)
            for bt, nn, d in MOTIF[c][2:]:
                M.piano('pno', t0 + bt * BEAT, [m(nn), m(nn) - 12], 70, BEAT * d * 0.85, p=0.12)
            M.put('pad', B.pad(PADH['C'] + ' C6', BAR - (drop - t0), rng, att=0.01, rel=0.4, lo=4500, hi=1700, curve=lambda u: u ** 0.5), drop, 2)
            for i, nn in enumerate(['C6', 'E6', 'G6', 'C7']):
                M.put('box', B.bell(nn, 1.6), drop + 0.06 + i * 0.07, -2 - 1.5 * i, p=-0.45 + 0.3 * i)
            for bt in (2, 3):
                M.put('kick', B.kick(decay=0.16, f0=52, sweep=120, rng=rng), t0 + bt * BEAT, 0)
                M.kick_at(t0 + bt * BEAT)
            M.put('clap', B.clap(rng, tail=0.1), t0 + 3 * BEAT, 0)
            continue
        piano_bar(t0, c, vel=62)
        groove(t0, c, plucks=(k >= 4))
    # the build into the drop: clap roll + swell 2.6-4.0, reverse piano breathing in to 4.5, silence on beat 1
    for k in range(6):
        M.put('clap', B.clap(rng, tail=0.035), 2.75 + k * BEAT / 2, -14 + 2 * k)
    M.put('fx', B.swell(4.0 - 2.6 - 0.02, rng, 400, 9000), 2.6, -2)
    ch = B.render_piano([dict(t=0.0, midi=mm, vel=74, dur=2.0) for mm in notes('C3 G3 E4 G4 C5')], int(2.5 * SR))
    M.put('fx', B.reverse_tail(ch, 0.5 - 0.02), HITS['look_change'] - 0.5, -4)
    # a lift into 14 (the end of bar 6)
    for k in range(4):
        M.put('clap', B.clap(rng, tail=0.035), SECTIONS['part2'] - BEAT * 2 + k * BEAT / 2, -10 + 2 * k)
    M.put('fx', B.swell(BAR - 0.03, rng, 500, 9000), SECTIONS['part2'] - BAR, -4)

    # ------------------------------------------------------------------ 14-30 the motif in full
    prog = ['C', 'G', 'Am', 'F']
    for i, t0 in enumerate(bars(SECTIONS['part2'], SECTIONS['part3'])):
        c = prog[i % 4]
        piano_bar(t0, c, vel=64)
        groove(t0, c, plucks=(i >= 4), bells=(i >= 4))
        if i == 0:
            M.put('crash', B.crash(rng, 2.0), t0, -3)
    for k in range(4):
        M.put('clap', B.clap(rng, tail=0.035), SECTIONS['part3'] - BEAT * 2 + k * BEAT / 2, -10 + 2 * k)

    # ------------------------------------------------------------------ 30-46 second half; 43-46 the email
    e0, e1 = HITS['email'], HITS['email_end']
    for i, t0 in enumerate(bars(SECTIONS['part3'], SECTIONS['peak_bar'])):
        c = prog[i % 4]
        if i == 0:
            M.put('crash', B.crash(rng, 2.0), t0, -3)
        if t0 + BAR <= e0:
            piano_bar(t0, c, vel=64)
            groove(t0, c, plucks=True, bells=(i % 2 == 1))
        elif t0 < e0:
            # the bar the email interrupts: half a bar of groove, then the email takes over at e0
            # WHY a half-beat of air before e0 and no motif note across it: measured, the email's entrance only
            # rose 6 dB over the tail of this bar; a small gap gives it a clean start
            piano_bar(t0, c, vel=60, half=True, motif=False)
            groove(t0, c, level=-2, hats=False, plucks=False, upto=(e0 - t0) / BEAT - 0.5)
    # the email (e0 - e1), written from its own start so it lands wherever the picture puts it: cute and light —
    # music box motif up high, a plucked bass, finger snaps, shaker; no kick. F for two bars' worth, then G.
    t, segs = e0, []
    for c, nb in (('F', 4), ('G', 4)):
        if t >= e1 - 1e-6:
            break
        segs.append((t, c, min(nb, (e1 - t) / BEAT)))
        t += nb * BEAT
    for t0, c, nb in segs:
        for bt, nn, d in MOTIF[c]:
            if bt >= nb:
                break
            M.put('box', B.bell(m(nn) + 12, 1.5), t0 + bt * BEAT, 0, p=0.25)
            M.piano('pno', t0 + bt * BEAT, m(nn), 50, BEAT * d * 0.5, p=0.15, felt=9500)
        r = m(ROOT[c]) + 12
        for bt in range(int(nb)):
            M.put('pluck', B.pluck(r + (7 if bt % 2 else 0), rng, dur=0.4, tau=0.12, bright=0.7), t0 + bt * BEAT, -1)
            if bt % 2 == 1:
                M.put('clap', B.clap(rng, tail=0.04, bright=1.3), t0 + bt * BEAT, -7)
        for k in range(int(nb * 4)):
            M.put('shk', B.shaker(rng), t0 + k * BEAT / 4, (0 if k % 2 else -6) - 3, p=-0.3)
        M.put('pad', B.pad(PADH[c], nb * BEAT, rng, att=0.3, rel=0.3, lo=2400), t0, -6)
    # the email's own sparkle as it appears
    for i, nn in enumerate(['G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 1.2), e0 + i * 0.06, -4 - 2 * i, p=-0.3 + 0.3 * i)

    # ------------------------------------------------------------------ 46-50 the inhale and THE PEAK
    pk = HITS['peak']
    inh = HITS['inhale']
    # the inhale: one second where the music pulls right back — a reverse piano and a swell breathe in
    chP = B.render_piano([dict(t=0.0, midi=mm, vel=80, dur=2.0) for mm in notes('C2 G2 C3 E3 G3 C4 E4 G4 C5')], int(2.5 * SR))
    # WHY they stop 60 ms short and a few dB down: ending on the peak masked its attack (measured +32 ms)
    M.put('fx', B.reverse_tail(chP, pk - inh - 0.06, rt60=2.6), inh, -3)
    M.put('fx', B.swell(pk - inh - 0.06, rng, 300, 10000, 2.2), inh, -6)
    M.piano('pno', inh, 'G2 D3 G3 B3', 46, pk - inh - 0.05, roll=0.02)
    # the peak: the biggest moment — rolled piano chord with the motif's top, 808, crash, wide-open pads, glass
    M.piano('pno', pk, 'C2 G2 C3', 66, 2.6, roll=0.008)
    M.piano('pno', pk + 0.025, 'E3 G3 C4 E4 G4', 62, 2.5, roll=0.012, p=0.05)
    for bt, nn, d in MOTIF['C']:
        M.piano('pno', pk + 0.06 + bt * BEAT, [m(nn), m(nn) + 12], 72, BEAT * d, p=0.12)
    M.put('b808', B.k808('C1', decay=1.2), pk, 2)
    M.put('kick', B.kick(decay=0.25, f0=48, sweep=140, rng=rng), pk, 0)
    M.kick_at(pk)
    M.put('clap', B.clap(rng, tail=0.4), pk, -1)
    M.put('crash', B.crash(rng, 3.0), pk, 1)
    M.put('fx', B.boom(rng, f=44, dur=1.8), pk, -6)
    settle = HITS['settle'] - pk
    M.put('pad', B.pad(PADV['C'] + ' C4', settle, rng, att=0.01, rel=0.5, lo=4500, hi=1500, curve=lambda u: np.clip((u - 0.3) / 0.7, 0, 1) ** 0.7), pk, 3)
    M.put('hi', B.pad('E5 G5 C6 D6', settle, rng, att=0.05, rel=0.5, lo=5000, voices=4, shimmer=0.3), pk, 2)
    M.put('sub', B.sub('C2', settle - 0.2, rel=0.5), pk, 2)
    for i, nn in enumerate(['C6', 'E6', 'G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 2.0), pk + 0.25 + i * 0.09, -2 - 1.3 * i, p=-0.5 + 0.25 * i)
    # a light pulse carries the bloom (hats and shaker only), gone by 49.5
    for k in range(int((HITS['settle'] - pk - 0.5) / (BEAT / 2))):
        tt = pk + 0.5 + k * BEAT / 2
        M.put('hat', B.hat(rng, decay=0.04), tt, -4 - 0.5 * k, p=0.25)

    # ------------------------------------------------------------------ 50-56 closing lines, half-time
    for i, (t0, c) in enumerate(zip(bars(SECTIONS['close'], SECTIONS['logo']), ['Am', 'F', 'G'])):
        r = m(ROOT[c]) + 12
        vo = notes(PADV[c])
        M.piano('pno', t0, [r - 12, r] + vo[1:], 52, BAR * 0.98, roll=0.015)
        for bt, nn, d in MOTIF[c][:2] if i < 2 else [(0, 'B5', 2.0), (2, 'D6', 2.0)]:
            M.piano('pno', t0 + bt * BEAT, [m(nn), m(nn) - 12], 58, BEAT * d, p=0.12)
        M.put('pad', B.pad(PADV[c], BAR, rng, att=0.2, rel=0.4, lo=1400, hi=2400 if i == 2 else None), t0, -2)
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

    # ------------------------------------------------------------------ 56 logo: resolved C, silent by 59.6
    lg = HITS['logo']
    ring = END - lg
    M.put('kick', B.kick(decay=0.25, f0=48, sweep=130, rng=rng), lg, 0)
    M.kick_at(lg)
    M.put('b808', B.k808('C1', decay=1.2), lg, 0)
    M.put('clap', B.clap(rng, tail=0.35), lg, -3)
    M.put('crash', B.crash(rng, 3.0), lg, -3)
    M.piano('pno', lg, 'C2 C3 G3 E4', 62, ring, roll=0.012)
    M.piano('pno', lg + 0.04, 'G4 C5 E5', 64, ring, roll=0.025, p=0.15)
    M.put('pad', B.pad(PADH['C'], ring - 0.4, rng, att=0.02, rel=0.35, lo=3000, hi=1200, curve=lambda u: u ** 0.6), lg, 0)
    M.put('sub', B.sub('C2', 2.0, rel=0.9), lg, 0)
    for i, nn in enumerate(['G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 2.0), lg + 0.25 + i * 0.125, -3 - 2 * i, p=-0.3 + 0.3 * i)
    # optional picture accents from the final beat list
    for t, wgt in ACCENTS:
        if wgt >= 2:
            M.put('crash', B.crash(rng, 1.6), t, -6)
            M.put('b808', B.k808('C1', decay=0.5), t, -4)
        else:
            M.put('box', B.bell('G6', 1.0), t, -6, p=0.3)
    return M


def typing(n):
    """Soft key ticks in the typing pockets (round-two recipe: humanised timing/level, three brightness variants)."""
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
    return ticks


def pocket_ratio(keys, music):
    import pyloudnorm as pyln
    mt = pyln.Meter(SR, block_size=0.2)
    r = [mt.integrated_loudness(keys[int(a * SR):int(b * SR)]) - mt.integrated_loudness(music[int(a * SR):int(b * SR)])
         for a, b in POCKETS if b - a >= 0.5]
    return float(np.mean(r))


def build():
    M = compose()
    x, stems = M.render(hall_rt=2.0, hall_db=-11.0, delay_t=0.375, piano_bright=58, piano_felt=8500, air_db=3.0,
                        balance=dict(pno=0, box=-8, pad=-11, hi=-14, sub=-6, pluck=-12, kick=-6, b808=-8, clap=-10,
                                     hat=-15, shk=-17, fx=-12, crash=-15))
    x = B.glue(x, thresh_db=-21, ratio=1.8)
    tt = np.arange(M.n) / SR
    x = x * db(np.interp(tt, [a for a, _ in LEVELS], [v for _, v in LEVELS]))[:, None]
    # typing: scaled by measurement so it sits KEYS_UNDER_MUSIC LU under the music inside the pockets
    keys = typing(M.n)
    keys *= db(-KEYS_UNDER_MUSIC - pocket_ratio(keys, x))
    x = x + keys
    x = B.ending(x, END, 1.6)
    from bs_verify import stem_levels
    print('  stems (LUFS at final gain):', stem_levels(stems, db(-14 - dsp.lufs(x))))
    print(f'  typing: {pocket_ratio(keys, x - keys):.1f} LU under the music inside the pockets (round two: -12.9)')
    return B.finish(x, os.path.join(B.OUT, 'take2-mix.wav'), M.n)


if __name__ == '__main__':
    build()
