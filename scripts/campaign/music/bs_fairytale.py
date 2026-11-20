#!/usr/bin/env python3
"""Film 1, the fairytale ("For more than a decade..."), 75.0 s: the campaign piano + electronic score under the
narration (voice-take1-lily.wav), every hit read from the narrator's words file BY WORD.
Arc (brief, 2026-11-20):
  0       quiet, sly: the motif's Am bar as a low staccato piano figure, a soft tick, air
  11.5    "And we all... just accepted it": resigned, falling two-note sighs, no rhythm
  21.4    "However, recently...": near-silence (one glass note, air), a reverse-piano breath in
  23.2    "something truly wonderful happened": the music OPENS for the first time (C, motif, pads open)
  25.8    hubris / "shareholder value": wry and light (staccato off-beats, bounce, finger snaps); one small piano
          wink in the gap before "shareholder value", then deadpan silence under it
  39.4    "But in their excitement": the lift (arpeggios, beat enters bar by bar, filter opening, swell)
  49.0    "for ANYone who asks": a clear arrival
  51.3    "And so...": warm and proud (motif in full, soft beat)
  62.0    "It's time to free ourselves": rousing (full beat, motif in octaves)
  65.9    "...at long, long last... to open source": the held breath, then THE biggest moment
  70.75   "everything.": final C chord on the word; it rings and decays steadily; silent by 74.6
(times are the narrator's REAL onsets, snapped from the recording; round five)
Outputs: out/take1-mix.wav (voice + score), out/take1-score.wav (score alone, also used as take1-type-mix.wav for
the captions-only cut), hidden stems out/.take1-mix.voice.wav / .music.wav for measurement.
Usage: python bs_fairytale.py"""
import os
import numpy as np
import bs_engine as B
import bs_voice as V
from bs_engine import MOTIF, ROOT, PADV, PADH, m, notes
import dsp
from dsp import SR, db

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.path.join(HERE, '..', 'film', 'public', 'audio', 'voice-take1-lily.wav')
WORDS = os.path.join(HERE, '..', 'film', 'src', 'round2', 'take1-words-lily.json')
LENGTH, END = 75.0, 74.6
# WHY snapped (round five review): the words file put "shareholder" 0.43 s late and "everything." 0.33 s early, so
# the wink played over the punchline and the final chord landed in the breath before the last word. Every word that
# follows a real pause now starts where the recording says it does (bs_voice.snap_words); the corrected table is
# also written to out/take1-words-lily.snapped.json for the picture (the film reads the uncorrected file).
W_FILE = V.load_words(WORDS)
W = V.snap_words(W_FILE, VOICE)
w = lambda text, after=0.0, edge='start': V.word(W, text, after, edge)

# ----------------------------------------------------------------------------- the one table of story times
# WHY one table: every musical event below is placed relative to these words; a new recording = a new words file.
T = dict(
    start=w('For'),
    they=w('They'),
    andwe=w('And', 10.0),
    weacc=w('We', 14.0),
    convenience_end=w('convenience', edge='end'),
    however=w('However'),
    something=w('something', 20.0),
    wonderful=w('wonderful'),
    blinded=w('Blinded'),
    a_tech=w('A', 33.0),
    treasure_end=w('treasure', edge='end'),
    shareholder=w('shareholder'),
    value_end=w('value', edge='end'),
    but=w('But'),
    anyone=w('anyone'),
    andso=w('And', 51.0),
    itstime1=w("It's", 61.0),
    itstime2=w("It's", 65.0),
    open=w('open'),
    everything=w('everything', 69.0),
    last_end=W[-1]['end'],
)


class Sec:
    """A stretch of the score between two story times, written in beats: the tempo is whatever makes the bars fit.
    chords: [(chord, beats), ...]. bars: [(start s, chord, beats)]."""

    def __init__(self, t0, t1, chords):
        self.t0, self.t1 = t0, t1
        self.beat = (t1 - t0) / sum(b for _, b in chords)
        self.bpm = 60 / self.beat
        self.bars, t = [], t0
        for c, b in chords:
            self.bars.append((t, c, b))
            t += b * self.beat

    def at(self, bar, beat=0.0):
        return self.bars[bar][0] + beat * self.beat


S0 = Sec(T['start'], T['andwe'], [('Am', 4), ('F', 4), ('Am', 4), ('Gs', 4)])            # sly
S1 = Sec(T['andwe'], T['however'], [('F', 4), ('C/E', 4), ('Dm', 4), ('Am', 4)])          # resigned
S3 = Sec(T['something'], T['blinded'], [('C', 4)])                                       # it opens
S4 = Sec(T['blinded'], T['shareholder'], [('G', 4), ('Am', 4), ('F', 4), ('C', 4), ('G', 4)])   # wry
S5 = Sec(T['but'], T['anyone'], [('Am', 4), ('F', 4), ('C', 4), ('G', 4)])                # the lift
S6 = Sec(T['anyone'], T['andso'], [('C', 4)])                                            # arrival
S7 = Sec(T['andso'], T['itstime1'], [('C', 4), ('G', 4), ('Am', 4), ('F', 4)])            # warm, proud
S8 = Sec(T['itstime1'], T['itstime2'], [('C', 4), ('G', 2)])                             # rousing
S9 = Sec(T['itstime2'], T['everything'], [('Am', 2), ('F', 2), ('G', 3)])                # the held breath
WINK = (T['treasure_end'] + 0.04, T['treasure_end'] + 0.17)                              # the two wink notes
PROTECT = [(T['treasure_end'] + 0.02, T['shareholder'] - 0.03)]

# overall score level by time (dB, linear between points): the arc on top of the notes' own dynamics
LEVELS = [(0.0, -3.0), (T['andwe'], -4.0), (T['however'] - 0.4, -7.0), (T['something'] - 0.05, -6.0),
          (T['something'], 0.0), (T['blinded'], -1.5), (T['treasure_end'], -1.5), (T['but'], -3.0),
          (T['anyone'], 0.0), (T['itstime1'], 0.5), (T['everything'], 1.5), (LENGTH, 1.5)]
# how far (LU) the music sits under the narrator while she speaks. WHY these numbers: they ARE the arc while she
# speaks: the opening sits well under her (sly, quiet), the hush further still, and the distance closes step by step
# to the climax. The 1-4 kHz carve keeps her words clear throughout.
# Round five: the margins are spread wider, because ducking had flattened the story's rise to 3.5 LU over 70 s
# (the score alone rises 19 LU). Opening 16, the hush 20, "something" 11 (the door opening: at least 4 LU up on
# the hush), the lift 11 to 10, the last two lines 9 (brand rule: 10 LU under a narrator, 9 on the closing lines).
MARGINS = [(0.0, 16.0), (T['andwe'] - 0.1, 16.5), (T['however'] - 0.1, 20.0), (T['something'] - 0.03, 11.0),
           (T['blinded'] - 0.1, 12.0), (T['but'] - 0.1, 11.0), (T['anyone'] - 0.1, 10.5), (T['andso'] - 0.1, 10.7),
           (T['itstime1'] - 0.1, 9.0), (T['itstime2'] - 0.1, 9.0), (T['open'] - 0.1, 9.2), (T['everything'] - 0.1, 9.6)]
TAIL_RAMP = 0.6      # s: after "everything." the music rises to its full bloom over this long
# WHY a decay from DECAY_AT (round five review: the music swelled -25 -> -13 then fell to -54 in 1.5 s, which
# reads as a swell cut away): from here the whole score falls at a steady DECAY_DB_S, like a chord left to ring
# in a hall, and only the last FADE s are a fade to true silence.
DECAY_AT, DECAY_DB_S, FADE = T['last_end'] + 0.40, 11.5, 0.6
TAIL_OVER_VOICE = -1.0  # LU: the bloom's loudest momentary level, relative to the narration's average
SPLITS = [a for a, _ in MARGINS[1:]]
HITS = [T['something'], WINK[0], T['but'], T['anyone'], T['andso'], T['itstime1'], T['everything']]


MARGIN_HEADROOM = 0.6   # LU: the ducker aims this far past each rule, so a meter grouping words differently still passes


def margin_at(t):
    v = MARGINS[0][1]
    for a, b in MARGINS:
        if t >= a:
            v = b
    return v + MARGIN_HEADROOM


def compose():
    M = B.Mix(LENGTH, seed=71)
    rng = np.random.default_rng(171)
    hum = np.random.default_rng(271)
    jit = lambda: float(hum.uniform(-0.010, 0.010))
    # WHY the piano's 100 Hz dip and no pump (round five): the sampled grand carries far more real bass than the
    # old soundfont (the stem measured 46% below 160 Hz, the rule is 30-40); and nothing pumps under a narrator
    for name, kw in dict(pno=dict(hall=0.45, room=0.15, comp=(12, 2.5), eq=((100, -4.0, 0.7),)), pad=dict(hall=0.45, pump=2.0), hi=dict(hall=0.65, pump=2.0),
                         sub=dict(pump=2.0), pluck=dict(hall=0.25, delay=0.45, pump=2.0), box=dict(hall=0.5, delay=0.3),
                         kick=dict(room=0.05), b808=dict(), clap=dict(room=0.35, hall=0.15), hat=dict(room=0.1),
                         shk=dict(room=0.2), fx=dict(hall=0.3), crash=dict(hall=0.2), air=dict()).items():
        M.stem(name, **kw)

    def P(t, chord, vel, dur, **k):
        M.piano('pno', t, chord, vel, dur, **k)

    def motif(sec, i, c, vel, octave=0, stacc=1.0, double=0, half=False, p=0.15):
        """The campaign motif for bar i of sec (optionally only its first half, an octave off, doubled below)."""
        for bt, nn, d in MOTIF[c]:
            if half and bt >= 2:
                break
            ex = abs(bt - round(bt)) < 1e-9
            tt = sec.at(i, bt) + (0 if ex else jit())
            v = vel + (5 if bt == 0 else 0) + int(hum.integers(-3, 4))
            P(tt, m(nn) + 12 * octave, v, sec.beat * d * stacc * 1.05, p=p)
            if double:
                P(tt, m(nn) + 12 * octave - 12, v - double, sec.beat * d * stacc, p=p - 0.1)

    # ------------------------------------------------------------------ S0 sly opening (0 - "And we all")
    # WHY the motif's own Am bar, low and detached: the brand tune, heard sideways — it sounds like someone
    # tiptoeing, which is the narrator's tone ("they decided...") without any cartoon
    low = {'Am': [(0, 'E4', 1.5), (1.5, 'D4', .5), (2, 'C4', 1), (3, 'D4', 1)],
           'F': [(0, 'A4', 1.5), (1.5, 'G4', .5), (2, 'F4', 1), (3, 'G4', 1)],
           'Gs': [(0, 'D4', 1.5), (1.5, 'C4', .5), (2, 'D4', 2.0)]}
    for i, (t0, c, nb) in enumerate(S0.bars):
        P(t0, m(ROOT[c]) + 12, 36 + 2 * i, S0.beat * 3.6, p=0.0)
        for bt, nn, d in low[c]:
            P(S0.at(i, bt) + (0 if bt == int(bt) else jit()), nn, 38 + 2 * i + int(hum.integers(-3, 4)), S0.beat * d * 0.5, p=0.15)
        if i >= 1:
            M.put('sub', B.sub(m(ROOT[c]) + 12, S0.beat * 3.8, att=0.3, rel=0.4), t0, -6 + 2 * i)
        # the 'tick': a very soft closed hat on the off-beats, like a clock in another room
        for k in range(4):
            M.put('hat', B.hat(rng, decay=0.018, tone=1.2), S0.at(i, k + 0.5), -10 + float(rng.uniform(-1.5, 1.0)), p=0.35)
    M.put('air', B.air(T['something'] - 0.3, rng, 4500, 12000), 0.0)
    # "They decided" (bar 3): a soft low pad enters under the figure
    M.put('pad', B.pad(PADV['Am'], S0.beat * 4, rng, att=1.2, rel=0.6, lo=500), S0.at(2), -6)
    M.put('pad', B.pad('G2 D3 C4 D4', S0.beat * 4, rng, att=0.4, rel=0.8, lo=550), S0.at(3), -6)

    # ------------------------------------------------------------------ S1 resigned ("And we all... convenience")
    sighs = {0: [(0, 'A4', 2), (2, 'G4', 2)], 1: [(0, 'G4', 2), (2, 'E4', 2)], 2: [(0, 'F4', 2), (2, 'D4', 2)],
             3: [(0, 'E4', 3.5)]}
    for i, (t0, c, nb) in enumerate(S1.bars):
        v = 44 - 3 * i
        P(t0, notes(PADV[c]), v - 6, S1.beat * 3.9, roll=0.05, p=0.0)
        for bt, nn, d in sighs[i]:
            P(S1.at(i, bt), nn, v, S1.beat * d, p=0.15)
        M.put('pad', B.pad(PADV[c], S1.beat * 4, rng, att=0.6 if i else 0.3, rel=0.7, lo=480 - 30 * i), t0, -4 - i)
        M.put('sub', B.sub(m(ROOT[c]) + 12, S1.beat * 3.8, att=0.2, rel=0.5), t0, -4 - i)

    # ------------------------------------------------------------------ S2 near-silence ("However, recently...")
    M.put('box', B.bell('E6', 2.6), T['however'] + 0.02, -10, p=0.25)
    # a reverse-piano breath IN to the opening (the coming C chord's own reverb, backwards)
    chordC = B.render_piano([dict(t=0.0, midi=mm, vel=64, dur=2.0) for mm in notes('C3 G3 E4 G4 C5')], int(2.5 * SR))
    br = T['something'] - (T['however'] + 0.6)
    M.put('fx', B.reverse_tail(chordC, br, rt60=3.2), T['something'] - br, 0)

    # ------------------------------------------------------------------ S3 it opens ("something truly wonderful")
    t0 = S3.at(0)
    P(t0, 'C2 C3 G3', 54, S3.beat * 4.3, roll=0.02, p=0.0)
    P(t0 + 0.04, 'E4 G4 D5', 48, S3.beat * 4.0, roll=0.03, p=0.1)
    motif(S3, 0, 'C', 60, double=14)
    M.put('pad', B.pad(PADV['C'], S3.beat * 4 + 0.2, rng, att=0.25, rel=0.6, lo=600, hi=3600, curve=lambda u: np.sin(np.pi / 2 * u) ** 2), t0)
    M.put('hi', B.pad(PADH['C'], S3.beat * 4 + 0.2, rng, att=1.0, rel=0.8, lo=3000, voices=3, shimmer=0.25), t0)
    M.put('sub', B.sub('C2', S3.beat * 4, att=0.05, rel=0.4), t0)
    M.put('b808', B.k808('C1', decay=0.9, punch=1.2, drive=1.4), t0, -6)
    # glass sparkle on "wonderful"
    for k, nn in enumerate(['C6', 'E6', 'G6', 'D7']):
        M.put('box', B.bell(nn, 1.8), T['wonderful'] + 0.05 + k * 0.07, -8 - k, p=-0.4 + 0.27 * k)

    # ------------------------------------------------------------------ S4 wry and light (hubris, "shareholder value")
    # WHY: light, detached piano off-beats, a bouncing low pluck and finger-snap 2 & 4 — the music smiles at the
    # corporations' pride without becoming a cartoon. Everything stops when "treasure:" ends.
    stop = T['treasure_end']
    for i, (t0, c, nb) in enumerate(S4.bars):
        vo = notes(PADV[c])
        mid = sorted(notes(PADH[c]))[:3]
        for bt in (0.5, 1.5, 2.5, 3.5):
            tt = S4.at(i, bt) + jit()
            if tt + 0.2 < stop:
                P(tt, mid, 40 + int(hum.integers(-3, 4)), S4.beat * 0.35, p=0.1)
        r = m(ROOT[c]) + 12
        for bt, nn in ((0, r), (2, r + 7)):
            tt = S4.at(i, bt)
            if tt + 0.3 < stop:
                M.put('pluck', B.pluck(nn, rng, dur=0.5, tau=0.16, bright=0.7), tt, 0 if bt == 0 else -2)
                P(tt, nn, 40, S4.beat * 0.9, p=0.0)
        for bt in (1, 3):
            tt = S4.at(i, bt)
            if tt + 0.1 < stop:
                M.put('clap', B.clap(rng, tail=0.045, bright=1.25), tt, -6 + float(rng.uniform(-1, 1)), p=0.15)
        for k in range(8):
            tt = S4.at(i, k * 0.5)
            if tt + 0.05 < stop:
                M.put('hat', B.hat(rng, decay=0.02), tt, (-4 if k % 2 else -9) + float(rng.uniform(-1.5, 1)), p=0.3)
        # the motif, small and high on the music box, in alternate bars: light, a little knowing
        if i in (1, 3):
            for bt, nn, d in MOTIF[c]:
                tt = S4.at(i, bt)
                if tt + 0.2 < stop:
                    M.put('box', B.bell(m(nn) + 12, 1.2), tt, -8, p=0.3)
        M.put('pad', B.pad(PADV[c], min(S4.beat * 4, stop - t0 - 0.05), rng, att=0.3, rel=0.12, lo=900), t0, -8)
        M.put('sub', B.sub(r, min(S4.beat * 3.6, stop - t0 - 0.1), rel=0.08), t0, -4)
    # the wink: a dry, quiet descending fourth on the piano in the gap before "shareholder value", nothing under it
    P(WINK[0], 'E6', 50, 0.5, p=0.2, felt=9000)
    P(WINK[1], 'B5', 44, 0.6, p=0.2, felt=9000)
    # deadpan under "shareholder value": just a low, soft held note so it is not dead air
    M.put('sub', B.sub('G1', T['value_end'] - T['shareholder'] + 0.3, att=0.3, rel=0.4), T['shareholder'], -10)

    # ------------------------------------------------------------------ S5 the lift ("But in their excitement")
    for i, (t0, c, nb) in enumerate(S5.bars):
        pool = sorted(notes(PADH[c]))
        P(t0, m(ROOT[c]) + 12, 46 + 3 * i, S5.beat * 3.9, p=0.0)
        P(t0, notes(PADV[c])[1:], 38 + 3 * i, S5.beat * 1.9, roll=0.03, p=0.0)
        order = [0, 1, 2, 3, 2, 1, 3, 2]
        for k in range(8):
            P(S5.at(i, k * 0.5) + (0 if k % 2 == 0 else jit()), pool[order[k]], 36 + 4 * i + (4 if k % 2 == 0 else 0), S5.beat * 0.7, p=0.25 if k % 2 else -0.05)
        M.put('pad', B.pad(PADV[c], S5.beat * 4 + 0.1, rng, att=0.3 if i else 0.8, rel=0.3, lo=600 + 250 * i, hi=900 + 700 * i), t0, -3 + i)
        r = m(ROOT[c]) + 12
        if i < 2:
            M.put('sub', B.sub(r, S5.beat * 3.8, att=0.04, rel=0.2), t0, -2)
        else:
            for k in range(8):
                M.put('sub', B.sub(r + (12 if k % 2 else 0), S5.beat * 0.45, rel=0.04), S5.at(i, k * 0.5), 0 if k % 2 == 0 else -5)
        if i >= 1:
            for bt in ((0, 2) if i == 1 else (0, 1, 2, 3)):
                M.put('kick', B.kick(decay=0.2, f0=48, sweep=110, rng=rng), S5.at(i, bt), -4 + 2 * i)
                M.kick_at(S5.at(i, bt))
        if i >= 2:
            for k in range(8):
                M.put('hat', B.hat(rng, decay=0.03), S5.at(i, k * 0.5), (-4 if k % 2 else -9) + float(rng.uniform(-1, 1)), p=0.3)
            for bt in (1, 3):
                M.put('clap', B.clap(rng, tail=0.11), S5.at(i, bt), -4 + 2 * (i - 2))
        if i >= 2:
            motif(S5, i, c, 52 + 4 * (i - 2))
    # the last two beats: a clap roll and a swell lift into "ANYone"
    for k in range(8):
        M.put('clap', B.clap(rng, tail=0.04), S5.at(3, 2 + k * 0.25), -12 + 1.3 * k)
    M.put('fx', B.swell(S5.beat * 4, rng, 400, 9000, 2.4), T['anyone'] - S5.beat * 4, -2)
    chordC2 = B.render_piano([dict(t=0.0, midi=mm, vel=74, dur=2.0) for mm in notes('C2 C3 G3 E4 G4 C5 E5')], int(2.5 * SR))
    M.put('fx', B.reverse_tail(chordC2, S5.beat * 3, rt60=2.6), T['anyone'] - S5.beat * 3, -1)

    # ------------------------------------------------------------------ S6 the arrival ("for ANYone who asks")
    t0 = S6.at(0)
    P(t0, 'C1 C2 G2', 66, S6.beat * 4.4, p=0.0)
    P(t0 + 0.02, 'C3 G3 E4', 62, S6.beat * 4.2, roll=0.02, p=0.05)
    motif(S6, 0, 'C', 66, double=12)
    M.put('b808', B.k808('C1', decay=1.1), t0, 0)
    M.put('kick', B.kick(decay=0.25, f0=48, sweep=130, rng=rng), t0, 0)
    M.kick_at(t0)
    M.put('clap', B.clap(rng, tail=0.3), t0, -1)
    M.put('crash', B.crash(rng, 2.6), t0, 0)
    M.put('pad', B.pad(PADV['C'], S6.beat * 4 + 0.2, rng, att=0.02, rel=0.5, lo=3200, hi=1400, curve=lambda u: u ** 0.6), t0, 2)
    M.put('hi', B.pad(PADH['C'], S6.beat * 4 + 0.2, rng, att=0.05, rel=0.7, lo=4000, voices=3, shimmer=0.2), t0, 0)
    M.put('sub', B.sub('C2', S6.beat * 3.8, rel=0.3), t0, 2)
    for k in range(4, 8):
        M.put('hat', B.hat(rng, decay=0.03), S6.at(0, k * 0.5), -8 + float(rng.uniform(-1, 1)), p=0.3)
    for k, nn in enumerate(['G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 1.8), t0 + 0.12 + k * 0.09, -6 - 2 * k, p=-0.3 + 0.3 * k)

    # ------------------------------------------------------------------ S7 warm and proud ("And so... our data.")
    for i, (t0, c, nb) in enumerate(S7.bars):
        vo = notes(PADV[c])
        P(t0, m(ROOT[c]) + 12, 50, S7.beat * 3.9, p=0.0)
        for k, (bt, nn) in enumerate([(1.0, vo[1]), (2.0, vo[2]), (3.0, vo[3])]):
            P(S7.at(i, bt) + jit(), nn, 40 + int(hum.integers(-3, 4)), S7.beat * (3.0 - k * 0.8), p=0.2)
        motif(S7, i, c, 58 + 2 * i, double=16)
        M.put('pad', B.pad(PADV[c], S7.beat * 4 + 0.1, rng, att=0.2, rel=0.3, lo=1300, hi=2200), t0, -1)
        if i >= 2:
            M.put('hi', B.pad(PADH[c], S7.beat * 4 + 0.1, rng, att=0.5, rel=0.4, lo=3200, voices=3, shimmer=0.15), t0, -3)
        r = m(ROOT[c]) + 12
        M.put('sub', B.sub(r, S7.beat * 2.3, rel=0.08), t0)
        M.put('sub', B.sub(r, S7.beat * 1.3, rel=0.08), S7.at(i, 2.5), -3)
        for bt in (0, 2.5) if i < 3 else (0, 1, 2, 3):
            M.put('kick', B.kick(decay=0.2, f0=48, sweep=110, rng=rng), S7.at(i, bt), -2)
            M.kick_at(S7.at(i, bt))
        for bt in (1, 3):
            M.put('clap', B.clap(rng, tail=0.1), S7.at(i, bt), -3)
        for k in range(8):
            M.put('hat', B.hat(rng, decay=0.03), S7.at(i, k * 0.5), (-4 if k % 2 else -9) + float(rng.uniform(-1, 1)), p=0.3)
        for k in range(16):
            M.put('shk', B.shaker(rng), S7.at(i, k * 0.25) + float(rng.uniform(-0.004, 0.004)), (0 if k % 2 else -6) - 4, p=-0.3)
        if i >= 2:
            pool = sorted(notes(PADH[c]))
            for k in range(8):
                M.put('pluck', B.pluck(pool[[0, 2, 1, 3, 2, 1, 3, 2][k]] + 12, rng, tau=0.14), S7.at(i, k * 0.5), -2, p=0.4 if k % 2 else -0.4)
    for k in range(4):
        M.put('clap', B.clap(rng, tail=0.05), S7.at(3, 3 + k * 0.25), -10 + 2 * k)
    M.put('fx', B.swell(S7.beat * 2, rng, 500, 9000), T['itstime1'] - S7.beat * 2, -3)

    # ------------------------------------------------------------------ S8 + S9 rousing, then the held breath
    def groove(sec, i, c, lvl=0.0, octv=True, half=False):
        t0 = sec.at(i)
        nb = sec.bars[i][2]
        r = m(ROOT[c]) + 12
        vo = notes(PADV[c])
        P(t0, [r - 12, r], 60, sec.beat * nb * 0.97, p=0.0)
        P(t0 + 0.02, vo[1:], 52, sec.beat * nb * 0.95, roll=0.02, p=0.05)
        motif(sec, i, c, 68, double=10, half=half)
        for bt, nn, d in MOTIF[c]:
            if half and bt >= 2:
                break
            M.put('box', B.bell(m(nn) + 12, 1.4), sec.at(i, bt), -4, p=0.3)
        M.put('pad', B.pad(PADV[c], sec.beat * nb + 0.05, rng, att=0.04, rel=0.2, lo=2600), t0, 1 + lvl)
        M.put('hi', B.pad(PADH[c], sec.beat * nb + 0.05, rng, att=0.1, rel=0.3, lo=4500, voices=3, shimmer=0.2), t0, lvl)
        for k in range(nb * 2):
            M.put('sub', B.sub(r + (12 if k % 2 else 0), sec.beat * 0.45, rel=0.04), sec.at(i, k * 0.5), 2 + lvl if k % 2 == 0 else -3 + lvl)
        for bt in range(nb):
            M.put('kick', B.kick(decay=0.2, f0=48, sweep=120, rng=rng), sec.at(i, bt), 0 + lvl)
            M.kick_at(sec.at(i, bt))
            if bt % 2 == 1:
                M.put('clap', B.clap(rng, tail=0.13), sec.at(i, bt), 0 + lvl)
            M.put('hat', B.hat(rng, decay=0.03), sec.at(i, bt), -9 + lvl, p=0.3)
            M.put('hat', B.hat(rng, decay=0.09), sec.at(i, bt + 0.5), -3 + lvl, p=0.3)
        for k in range(nb * 4):
            M.put('shk', B.shaker(rng), sec.at(i, k * 0.25), (0 if k % 2 else -6) + lvl - 2, p=-0.3)
        pool = sorted(notes(PADH[c]))
        for k in range(nb * 2):
            M.put('pluck', B.pluck(pool[[0, 2, 1, 3, 2, 1, 3, 2][k % 8]] + 12, rng, tau=0.14), sec.at(i, k * 0.5), lvl, p=0.4 if k % 2 else -0.4)

    t0 = S8.at(0)
    M.put('crash', B.crash(rng, 2.4), t0, -2)
    M.put('b808', B.k808('C1', decay=0.8), t0, -2)
    groove(S8, 0, 'C')
    groove(S8, 1, 'G', half=True)
    groove(S9, 0, 'Am', lvl=1.0, half=True)
    groove(S9, 1, 'F', lvl=1.5, half=True)
    # the held breath (G, 3 beats): the beat drops out; a clap roll, a swell and a reverse piano breathe in
    t0 = S9.at(2)
    P(t0, 'G1 G2 D3', 56, S9.beat * 3, p=0.0)
    P(t0 + 0.03, 'G3 B3 D4', 50, S9.beat * 3, roll=0.03, p=0.05)
    P(t0, 'B5', 64, S9.beat * 1.5, p=0.15)
    P(S9.at(2, 1.5), 'D6', 62, S9.beat * 1.5, p=0.15)
    M.put('pad', B.pad('G2 D3 A3 B3 D4', S9.beat * 3, rng, att=0.05, rel=0.05, lo=900, hi=5000, curve=lambda u: u ** 2), t0, 2)
    for k in range(12):
        M.put('clap', B.clap(rng, tail=0.035), S9.at(2, k * 0.25), -14 + 1.1 * k)
    # WHY the swells end 25 ms before the word: a breath-in that stops just short makes the hit land with an edge
    # (measured: ending exactly on it masked the attack, a 5 dB rise)
    M.put('fx', B.swell(S9.beat * 3 - 0.025, rng, 300, 10000, 2.6), T['everything'] - S9.beat * 3, -2)
    chordF = B.render_piano([dict(t=0.0, midi=mm, vel=80, dur=2.0) for mm in notes('C2 G2 C3 E3 G3 C4 E4 G4 C5')], int(2.5 * SR))
    M.put('fx', B.reverse_tail(chordF, S9.beat * 3 - 0.025, rt60=3.0), T['everything'] - S9.beat * 3, -2)

    # ------------------------------------------------------------------ S10 "everything." — the biggest moment
    tE = T['everything']
    ring = END - tE
    # WHY rolled upward over ~110 ms and mid velocities: eleven notes struck at once at full force were the single
    # loudest transient of the film; spread like a pianist's grand final chord it sounds bigger and stays clean
    P(tE, 'C2 G2', 60, ring, roll=0.008, p=0.0)
    P(tE + 0.025, 'C3 G3 E4 G4', 62, ring, roll=0.012, p=0.05)
    P(tE + 0.075, 'C5 E5 G5', 64, ring, roll=0.015, p=0.15)
    P(tE + 0.11, 'E6', 62, ring, p=0.25)
    # WHY not louder transients: the size comes from the chord, the sub and the bloom; a taller stack of hits here
    # only made the master limiter pull 6.7 dB and flatten the moment
    M.put('b808', B.k808('C1', decay=1.6), tE, 1)
    M.put('kick', B.kick(decay=0.3, f0=46, sweep=140, rng=rng), tE, -1)
    M.kick_at(tE)
    M.put('clap', B.clap(rng, tail=0.5), tE, -2)
    M.put('crash', B.crash(rng, 3.6), tE, 1)
    M.put('fx', B.boom(rng, f=42, dur=2.5), tE, -2)
    # WHY the pads swell AFTER the word: the chord lands on "everything" under her voice and blooms to full the
    # moment she finishes, so the last word and the music's peak never fight
    bloom = lambda u: np.clip((u * ring - (T['last_end'] - tE)) / 0.6, 0, 1) ** 0.8
    M.put('pad', B.pad(PADV['C'] + ' C4', ring - 0.2, rng, att=0.02, rel=0.2, lo=1600, hi=4200, curve=bloom), tE, 3)
    M.put('hi', B.pad(PADH['C'] + ' G5', ring - 0.2, rng, att=0.3, rel=0.2, lo=4500, voices=4, shimmer=0.3), tE, 3)
    M.put('sub', B.sub('C2', ring - 0.6, att=0.01, rel=0.6), tE, 3)
    for k, nn in enumerate(['C6', 'E6', 'G6', 'C7', 'E7']):
        M.put('box', B.bell(nn, 2.6), T['last_end'] + 0.05 + k * 0.11, -3 - 1.5 * k, p=-0.5 + 0.25 * k)
    # the resolved tail: the motif's falling shape (E D C), now landing home on C
    tt = T['last_end'] + 0.25
    # WHY every note held to the end (round five), as with the sustain pedal down: a note let go mid-ring made the
    # level step down 2.3 dB in 100 ms at 73.2 s, a small 'cut' in what should be one long, even decay
    # and the last note (home, C) a touch softer than the two before it: a sampled grand's high note falls
    # 2-3 dB per 100 ms just after it is struck, which on top of the score's own decay read as a step
    for dt, nn, v, g in ((0.0, 'E5', 50, 0.0), (0.95, 'D5', 44, -1.0), (1.28, 'C5', 42, -3.0)):
        P(tt + dt, nn, v, END - tt - dt, p=0.15, gdb=g)
    return M


def level_curve(n):
    t = np.arange(n) / SR
    return np.interp(t, [a for a, _ in LEVELS], [b for _, b in LEVELS])


def tail_bloom(music, g, lv_voice):
    """After the last word, let the ducked music rise to its bloom over TAIL_RAMP s (not the duck's 0.22 s
    release), and cap the bloom's loudest momentary level at TAIL_OVER_VOICE LU over the narration's average.
    WHY: round three's music went from -26 to -9 LUFS momentary in half a second right after "everything." and
    ended 4-5 LU louder than the narrator had been: it read as someone turning the volume up, not a climax."""
    n = len(music)
    i0 = int(T['last_end'] * SR)
    k = int(TAIL_RAMP * SR)
    u = np.zeros(n)
    u[i0:i0 + k] = np.sin(np.linspace(0, np.pi / 2, k)) ** 2
    u[i0 + k:] = 1.0
    g_end = g[i0]
    # the cap: how much the un-ducked bloom must come down to sit TAIL_OVER_VOICE LU over the voice
    loud = V.short_loudness(music, win=0.4, hop=0.02)[i0:].max()
    cap = min(0.0, (lv_voice + TAIL_OVER_VOICE) - loud)
    gg = g.copy()
    gg[i0:] = g_end * (1 - u[i0:]) + cap * u[i0:]
    return music * db(gg)[:, None], cap


def build():
    M = compose()
    # WHY these balances (LU vs the piano): the piano is the voice of the brand; the sub and beat support it from
    # underneath; glass and plucks are seasoning
    # WHY (round four): the music bus is high-passed at 32 Hz (24 dB/oct) and the sub / 808 sit 4.5 dB lower
    # than before: 54% of the score's energy was below 160 Hz and 12% below 40 Hz, which a phone does not play at
    # all. The piano's felt opens to 10.5 kHz and the pads carry a little of their own top (sheen) plus an air
    # layer and a 10 kHz shelf, for 1.5-3% of the energy above 8 kHz instead of 0.2%.
    x, stems = M.render(hall_rt=2.8, hall_db=-8.0, piano_bright=54, piano_felt=10500, delay_t=0.45, air_db=3.0,
                        presence_db=1.5, air_layer=-17.0, low_cut=34,
                        balance=dict(pno=0, pad=-7, hi=-12, sub=-12.5, pluck=-15, box=-12, kick=-8, b808=-14.5, clap=-13,
                                     hat=-17, shk=-20, fx=-12, crash=-16, air=-30))
    x = B.glue(x, thresh_db=-22, ratio=1.6)
    x = x * db(level_curve(M.n))[:, None]
    x = B.pre_hit_dip(x, T['everything'], 6.0, 0.15)
    tt = np.arange(M.n) / SR
    x = x * db(-DECAY_DB_S * np.clip(tt - DECAY_AT, 0, None))[:, None]
    x = B.ending(x, END, FADE)
    # score alone (the captions cut)
    y_score = B.finish(x, os.path.join(B.OUT, 'take1-score.wav'), M.n)
    # with the narrator
    voice = V.process_voice(VOICE, M.n)
    lv = dsp.lufs(np.stack([voice, voice], -1))
    from bs_verify import stem_levels
    # WHY: the score's loudest 3 s (the bloom after "everything.") sits 4 LU above the narration's average:
    # clearly the biggest moment, and every quieter section keeps its composed distance below it
    music = x * db(lv + 4.0 - V.short_loudness(x, win=3.0, hop=0.1).max())
    mus_d, g, mk = V.duck(music, voice, W, margin_at, protect=PROTECT, splits=SPLITS)
    mus_d, tail_db = tail_bloom(music, g, lv)
    vs = np.stack([voice, voice], -1)
    mix = B.ending(vs + mus_d, END, 0.05)
    import json
    json.dump(W, open(os.path.join(B.OUT, 'take1-words-lily.snapped.json'), 'w'), indent=1)
    path = os.path.join(B.OUT, 'take1-mix.wav')
    y = B.finish(mix, path, M.n)
    gain = np.sqrt((y ** 2).sum() / max(1e-12, (mix ** 2).sum()))
    B.write_float(os.path.join(B.OUT, '.take1-mix.voice.wav'), dsp.fit(vs * gain, M.n))
    B.write_float(os.path.join(B.OUT, '.take1-mix.music.wav'), dsp.fit(mus_d * gain, M.n))
    print('  sections (BPM):', ' '.join(f'{n}:{s.bpm:.0f}' for n, s in zip(('S0', 'S1', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'),
                                                                      (S0, S1, S3, S4, S5, S6, S7, S8, S9))))
    print('  stems (LUFS, score alone):', stem_levels(stems, db(-14 - dsp.lufs(x))))
    print('  hits:', ' '.join(f'{h:.2f}' for h in HITS))
    print(f'  tail: bloom capped by {tail_db:.1f} dB, rising over {TAIL_RAMP} s after the last word')
    return path


if __name__ == '__main__':
    build()
