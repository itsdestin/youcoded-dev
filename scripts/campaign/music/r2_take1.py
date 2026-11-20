#!/usr/bin/env python3
"""Round two, Film 1 "Once upon a time" (77.0 s): a fairytale told by a quick, mischievous British narrator.
The score is written in bars on a tempo map whose anchors are pinned to words in take1-words-lily.json, so
every turn of the story lands on its word while the music still moves in proper bars:
   0.0  A  sly storybook opening, A minor, pizzicato tiptoe (129 BPM); ominous low brass on "dictated" bar
  13.0  B  resigned (120 BPM, sustained); a deflating bassoon under "own nothing"
  21.0     hush ("However, recently...")
  22.8     harp glissando -> 23.55 "wonderful": the bloom (C major, strings, horns, celesta)
  24.9  C  wry and playful oom-pah (120 BPM); fanfare on "great treasure"; the wink at 37.4-37.65 s
  38.9  D  "But in their excitement": lift and momentum, string ostinato, building to
  50.9  E  "And so": the campaign theme in full, warm and proud (107 BPM)
  62.1  F  "It's time to free ourselves": rousing march
  66.1  G  "at long, long last": the build (114 BPM), timpani + cymbal swell
  70.32    "everything.": the final C major cadence, then a resolved piano tag, silent by 76.5 s
Outputs: out/take1-mix.wav (voice + score), out/take1-type-mix.wav (score only, fuller), out/take1-mix-alt.wav
(voice + alternative palette: celesta/music box, harp, pizzicato, warm brass band).
Usage: python r2_take1.py [primary|type|alt ...]"""
import json, os, sys
import numpy as np
import soundfile as sf
import r2_engine as E
from r2_engine import ms, m
import dsp
from dsp import SR, db, lp, hp

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.path.join(HERE, '..', 'film', 'public', 'audio', 'voice-take1-lily.wav')
WORDS = os.path.join(HERE, '..', 'film', 'src', 'round2', 'take1-words-lily.json')
LENGTH, END = 77.0, 76.5


def load_words():
    w = json.load(open(WORDS))
    return w if isinstance(w, list) else w['words']


def word_time(words, text, after=0.0, edge='start'):
    """Time of the first word containing `text` that starts after `after` s. WHY: hit points come from the
    narration file, not hand-typed numbers, so a re-recorded voice only needs a new words file."""
    for x in words:
        if text.lower() in x['w'].lower() and x['start'] >= after:
            return x[edge]
    raise KeyError(text)


def time_map(words):
    """Bars are pinned to words: each anchor = (beat, second)."""
    W = lambda t, a=0.0, e='start': word_time(words, t, a, e)
    t_we = round(W('And', 12.5) - 0.0, 2)            # 12.95 "And we all": resigned section (B) starts at 13.0
    t_how = 21.0                                      # hush, just before "However," 21.08
    t_blinded = round(W('Blinded') - 0.01, 2)         # 24.91 -> 24.9 playful section (C)
    t_but = round(W('But', 38.0) + 0.04, 2)           # 38.86 -> 38.9 lift (D)
    t_andso = round(W('And', 50.5) - 0.03, 2)         # 50.93 -> 50.9 theme (E)
    t_free = round(W("It's", 61.9) + 0.02, 2)         # 62.08 -> 62.1 rousing (F)
    t_last = round(W("It's", 65.9) + 0.02, 2)         # 66.08 -> 66.1 the build (G)
    t_every = W('everything.', 70.0)                  # 70.32 the final cadence
    return E.TimeMap([(0, 0.0), (28, round(t_we + 0.05, 2)), (44, t_how), (52, t_blinded), (80, t_but),
                      (104, t_andso), (124, t_free), (132, t_last), (140, t_every), (156, t_every + 16 * 0.6)]), \
        dict(we=t_we, how=t_how, blinded=t_blinded, but=t_but, andso=t_andso, free=t_free, last=t_last, every=t_every,
             wonderful=W('wonderful'), something=W('something', 22.0), treasure_end=W('treasure', 35.0, 'end'),
             shareholder=W('shareholder'))


# palette roles -> (program, options). WHY roles: the alternative is the same score re-orchestrated, so both
# versions hit exactly the same words and the owner compares palettes, not timings.
PRIMARY = dict(
    mel=(0, dict(gain_db=3.0, send=0.18, pan=0.1, lead_ms=3)),          # grand piano: the campaign voice
    comp=(0, dict(gain_db=-1.0, send=0.16, pan=-0.12, lead_ms=3)),
    pizz=(45, dict(gain_db=2.0, send=0.18, pan=-0.25, lead_ms=4)),
    strings=(49, dict(gain_db=0.0, send=0.3, lead_ms=30)),                # slow strings
    fstr=(48, dict(gain_db=-3.0, send=0.22, pan=0.25, lead_ms=20)),       # fast strings ostinato
    cello=(42, dict(gain_db=-1.0, send=0.2, pan=-0.2, lead_ms=20)),
    cb=(43, dict(gain_db=-2.0, send=0.15, lead_ms=15)),
    bsn=(70, dict(gain_db=3.0, send=0.18, pan=-0.2, lead_ms=8)),
    clar=(71, dict(gain_db=1.0, send=0.2, pan=0.25, lead_ms=8)),
    flute=(73, dict(gain_db=-2.0, send=0.25, pan=0.3, lead_ms=10)),
    horn=(60, dict(gain_db=-1.0, send=0.3, pan=-0.15, lead_ms=15)),
    tpt=(56, dict(gain_db=-3.0, send=0.25, pan=0.15, lead_ms=10)),
    tbn=(57, dict(gain_db=-2.0, send=0.25, pan=-0.1, lead_ms=12)),
    tuba=(58, dict(gain_db=-2.0, send=0.15, lead_ms=12)),
    cel=(8, dict(gain_db=0.0, send=0.3, pan=0.3, lead_ms=3)),
    glock=(9, dict(gain_db=-5.0, send=0.3, pan=0.35, lead_ms=3)),
    xylo=(13, dict(gain_db=-1.0, send=0.22, pan=0.2, lead_ms=6)),
    harp=(46, dict(gain_db=0.0, send=0.3, pan=-0.3, lead_ms=9)),
    timp=(47, dict(gain_db=0.0, send=0.25, lead_ms=3)),
    choir=(52, dict(gain_db=-5.0, send=0.35, lead_ms=40)),
    orch=(48, dict(drum=True, gain_db=-1.0, send=0.25, lead_ms=4)),
    kit=(0, dict(drum=True, gain_db=-6.0, send=0.15, lead_ms=3)),
)
ALT = dict(PRIMARY)
ALT.update(
    mel=(10, dict(gain_db=6.0, send=0.25, pan=0.1, lead_ms=3, transpose=12)),   # music box (an octave up)
    comp=(46, dict(gain_db=1.0, send=0.25, pan=-0.12, lead_ms=9)),               # harp chords
    strings=(60, dict(gain_db=-1.0, send=0.3, lead_ms=15)),                      # warm french horns instead of strings
    fstr=(45, dict(gain_db=1.0, send=0.2, pan=0.25, lead_ms=4)),                 # pizzicato ostinato
    cello=(57, dict(gain_db=-4.0, send=0.2, pan=-0.2, lead_ms=12)),              # trombone
    cb=(58, dict(gain_db=-3.0, send=0.15, lead_ms=12)),                          # tuba
    bsn=(58, dict(gain_db=0.0, send=0.15, pan=-0.2, lead_ms=12)),                # comic tuba
    clar=(59, dict(gain_db=-1.0, send=0.2, pan=0.25, lead_ms=10)),               # muted trumpet
    flute=(72, dict(gain_db=-4.0, send=0.25, pan=0.3, lead_ms=10)),              # piccolo
    horn=(61, dict(gain_db=-3.0, send=0.3, pan=-0.15, lead_ms=10)),              # brass section
    cel=(8, dict(gain_db=2.0, send=0.3, pan=0.3, lead_ms=3)),
    xylo=(12, dict(gain_db=1.0, send=0.22, pan=0.2, lead_ms=6)),                 # marimba
    choir=(53, dict(gain_db=-5.0, send=0.35, lead_ms=40)),                       # voice oohs
)

# harmony
LOW = {'Am': 'A1', 'Dm': 'D2', 'E': 'E2', 'F': 'F1', 'C': 'C2', 'G': 'G1', 'G7': 'G1', 'D7': 'D2'}
MID = {'Am': 'A3 C4 E4', 'Dm': 'A3 D4 F4', 'E': 'G#3 B3 E4', 'F': 'A3 C4 F4', 'C': 'G3 C4 E4', 'G7': 'G3 B3 F4',
       'D7': 'F#3 A3 C4', 'G': 'G3 B3 D4'}
PAD = {'C': 'C3 G3 E4 G4 D5', 'G': 'G2 D3 B3 D4 A4', 'Am': 'A2 E3 C4 E4 G4', 'F': 'F2 C3 A3 C4 G4'}
MOTIF = {'C': [(0, 'E5', 1.5), (1.5, 'G5', .5), (2, 'A5', 1), (3, 'G5', 1)],
         'G': [(0, 'D5', 1.5), (1.5, 'G5', .5), (2, 'B5', 1), (3, 'A5', 1)],
         'Am': [(0, 'E5', 1.5), (1.5, 'D5', .5), (2, 'C5', 1), (3, 'D5', 1)],
         'F': [(0, 'A5', 1.5), (1.5, 'G5', .5), (2, 'F5', 1), (3, 'G5', 1)]}


def compose(alt=False):
    words = load_words()
    tm, H = time_map(words)
    s = E.Song('take1' + ('-alt' if alt else ''), LENGTH, tm, seed=11 + alt)
    rng = np.random.default_rng(41)
    P = ALT if alt else PRIMARY
    T = {k: s.track(k, prog, **opt) for k, (prog, opt) in P.items()}
    mel, comp, pizz, strings, fstr, cello, cb = (T[k] for k in 'mel comp pizz strings fstr cello cb'.split())
    bsn, clar, flute, horn, tpt, tbn, tuba = (T[k] for k in 'bsn clar flute horn tpt tbn tuba'.split())
    cel, glock, xylo, harp, timp, choir, orch, kit = (T[k] for k in 'cel glock xylo harp timp choir orch kit'.split())
    BD, SN, CY1, CY2, TRI, WB1, WB2 = 36, 38, 49, 57, 81, 76, 77

    def line(trk, b0, notes, vel, stacc=1.0, octave=0):
        for bt, nn, d in notes:
            trk.n(b0 + bt, d * stacc, m(nn) + 12 * octave if isinstance(nn, str) else nn, vel)

    # ================================================================ A: sly opening (beats 0-27, 0-13 s)
    # bar 0: the storybook opening — a harp arpeggio and a celesta twinkle, then the pizzicato starts tiptoeing
    for k, nn in enumerate(ms('A3 C4 E4 A4 C5 E5 A5')):
        harp.n(k * 0.25, 3.0 - k * 0.25, nn, 78)
    kit.n(0, 1.0, TRI, 70)
    line(cel, 0, [(2, 'E6', .5), (2.5, 'C6', .5), (3, 'A5', 1)], 72)
    sly = ['Am', 'Am', ('F', 'E'), 'Am', 'Dm', 'E', 'Am']
    for bar, c in enumerate(sly):
        b0 = 4 * bar
        if bar == 0:
            pizz.n(2, 0.4, 'A2', 96); pizz.n(3, 0.4, 'E2', 90)
            continue
        for bt in range(4):
            cc = c if isinstance(c, str) else (c[0] if bt < 2 else c[1])
            if bt % 2 == 0:
                pizz.n(b0 + bt, 0.4, m(LOW[cc]) + 12 + (7 if bt == 2 and cc != 'E' else 0), 100)
            else:
                pizz.n(b0 + bt, 0.3, MID[cc], 82)
    # bassoon/clarinet tiptoe tunes (staccato 8ths with rests)
    line(bsn, 4, [(0, 'A3', .5), (0.5, 'C4', .5), (1, 'E4', .5), (2, 'D#4', .5), (2.5, 'E4', .5), (3.5, 'C4', .5)], 92, 0.7)
    # bar 2 ("corporations have dictated"): the slightly ominous turn — low brass F -> E, timpani, a sour twinkle
    tbn.n(8, 2, 'F2 A2 C3', 78); tbn.n(10, 2, 'E2 G#2 B2', 82)
    tuba.n(8, 2, 'F1', 80); tuba.n(10, 2, 'E1', 84)
    timp.n(8, 1, 'F2', 90); timp.n(10, 1, 'E2', 96)
    cel.n(9, 0.5, 'B5 C6', 50)
    cello.n(8, 2, 'F2', 72); cello.n(10, 2, 'E2', 76)
    line(bsn, 12, [(0, 'A3', .5), (0.5, 'C4', .5), (1, 'E4', .5), (1.5, 'F4', .5), (2, 'E4', .5), (3, 'A3', .5)], 92, 0.7)
    line(clar, 16, [(0, 'A4', .5), (0.5, 'C5', .5), (1, 'D5', .5), (2, 'F5', .5), (2.5, 'E5', .5), (3, 'D5', .5)], 90, 0.7)
    line(clar, 20, [(0, 'G#4', .5), (0.5, 'B4', .5), (1, 'D5', .5), (1.5, 'B4', .5), (2, 'G#4', .5), (3, 'E4', .9)], 88, 0.7)
    line(bsn, 20, [(0, 'G#3', .5), (0.5, 'B3', .5), (1, 'D4', .5), (1.5, 'B3', .5), (2, 'G#3', .5), (3, 'E3', .9)], 86, 0.7)
    for bar, c in [(3, 'Am'), (4, 'Dm'), (5, 'E'), (6, 'Am')]:
        for bt in (1.5, 3.5):
            comp.n(4 * bar + bt, 0.25, [x + 12 for x in ms(MID[c])], 62)
    for b in range(12, 24):
        kit.n(b, 0.1, WB1 if b % 2 == 0 else WB2, 58)      # tick-tock: "for more than a decade"
    cel.n(14.5, 0.5, 'E6', 66)                           # fills the little gap after "technology."
    pizz.n(27, 0.3, 'E2', 96); bsn.n(27, 0.3, 'E3', 90); bsn.n(27.5, 0.3, 'A2', 96)   # sly "dum-dum" cadence

    # ================================================================ B: resigned (beats 28-43, 13-21 s)
    resigned = [('A3 C4 E4', 'A2'), ('G3 C4 E4', 'G2'), ('F3 A3 C4', 'F2'), (None, 'E2')]
    for i, (ch, lo) in enumerate(resigned):
        b0 = 28 + 4 * i
        if ch:
            strings.n(b0, 4, ch, 80)
        else:
            strings.n(b0, 2, 'E3 A3 B3', 80); strings.n(b0 + 2, 2, 'E3 G#3 B3', 78)
        cello.n(b0, 4, lo, 74)
        comp.n(b0, 2, [m(lo) + 12], 60)
    strings.ramp(tm.t(28), tm.t(40), 85, 80); strings.ramp(tm.t(40), H['how'], 80, 22)
    line(mel, 28, [(0, 'E5', 1.5), (1.5, 'D5', .5), (2, 'C5', 2), (4, 'B4', 1.5), (5.5, 'A4', .5), (6, 'G4', 2),
                   (8, 'A4', 1), (9, 'G4', 1), (10, 'F4', 2), (12, 'E4', 3)], 70)
    # "own nothing": a deflating chromatic sigh
    line(bsn, 40, [(0.5, 'B3', .5), (1, 'A#3', .5), (1.5, 'A3', .5), (2, 'G#3', 1.6)], 84)

    # ================================================================ hush and bloom (21.0-24.9 s, absolute)
    strings.ns(H['how'] + 0.02, H['wonderful'] - H['how'] - 0.05, 'E4 B4', 70)
    strings.ramp(H['how'] + 0.02, 22.75, 22, 58)
    cel.ns(21.15, 1.0, 'E6', 46)
    harp.ns(22.0, 1.2, 'B5', 40)
    # the turn: harp glissando from "something" to "wonderful", then the bloom chord on "wonderful"
    gl = ms('C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6 D6 E6')
    t0, t1 = H['something'] - 0.01, H['wonderful'] - 0.02
    for k, nn in enumerate(gl):
        harp.ns(t0 + k * (t1 - t0) / len(gl), 1.6, nn, 70 + k)
    s.add_audio('swell', E.riser(t1 - t0 + 0.02, rng, f0=1500, f1=11000, shape=1.6), t0, gain_db=-30.0, send=0.4)
    tw = H['wonderful']
    strings.ns(tw, 24.85 - tw, 'C3 G3 E4 G4 D5', 96)
    strings.ramp(tw, tw + 0.5, 60, 118); strings.ramp(24.3, 24.85, 118, 70)
    horn.ns(tw, 1.25, 'C4 E4 G4', 92)
    mel.ns(tw, 1.3, 'C2', 80)
    for k, nn in enumerate(ms('G2 E3 C4 G4 E5')):
        mel.ns(tw + 0.012 * (k + 1), 1.3, nn, 84)
    for k, nn in enumerate(ms('G5 C6 E6 G6 C7')):
        cel.ns(tw + k * 0.07, 0.8, nn, 80)
    glock.ns(tw, 1.0, 'E6', 84)
    cb.ns(tw, 1.3, 'C2', 72)

    # ================================================================ C: wry, playful (beats 52-79, 24.9-38.9 s)
    play = ['C', 'G7', 'C', 'Am', 'F', 'D7', 'G7']
    for i, c in enumerate(play):
        b0 = 52 + 4 * i
        lo = m(LOW[c]) + 12
        if i < 6:
            pizz.n(b0, 0.4, lo, 102); pizz.n(b0 + 2, 0.4, lo + 7, 96)
            comp.n(b0 + 1, 0.25, [x + 12 for x in ms(MID[c])], 74); comp.n(b0 + 3, 0.25, [x + 12 for x in ms(MID[c])], 70)
    kit.n(52, 1.0, TRI, 76)
    comp.n(52, 0.3, 'C3 E3 G3 C4', 92)   # WHY: a crisp piano edge on 24.9 (pizzicato alone speaks ~10 ms late)
    line(clar, 52, [(0, 'G4', .5), (0.5, 'C5', .5), (1, 'E5', .5), (1.5, 'G5', .5), (2, 'E5', 1), (3, 'C5', .5)], 96, 0.75)
    line(clar, 56, [(0, 'F5', .5), (0.5, 'D5', .5), (1, 'B4', .5), (1.5, 'G4', .5), (2, 'D5', .5), (2.5, 'F5', .5), (3, 'D5', 1)], 94, 0.75)
    tbn.n(56, 0.6, 'G2 D3', 88); tuba.n(56, 0.6, 'G1', 88)          # the pompous "ahem" right after "hubris"
    line(clar, 60, [(0, 'E5', .5), (0.5, 'G5', .5), (1, 'C6', 1), (2, 'B5', .5), (2.5, 'A5', .5), (3, 'G5', 1)], 94, 0.75)
    line(bsn, 60, [(0, 'C4', .5), (0.5, 'E4', .5), (1, 'G4', 1), (2, 'F4', .5), (2.5, 'E4', .5), (3, 'D4', 1)], 84, 0.75)
    # "artificial intelligence": a little magic run
    for k, nn in enumerate(ms('A5 C6 E6 A6 C7')):
        cel.n(64 + k * 0.25, 1.0, nn, 82)
    glock.n(65, 1.0, 'A6', 72)
    strings.n(64, 4, 'A3 E4 C5', 70); strings.ramp(tm.t(64), tm.t(68), 60, 80)
    line(bsn, 68, [(0, 'F3', .5), (0.5, 'A3', .5), (1, 'C4', .5), (1.5, 'F4', .5), (2, 'E4', .5), (2.5, 'D4', .5), (3, 'C4', 1)], 90, 0.75)
    # "a great treasure": a pompous mini-fanfare and a sparkle on "treasure"
    for bt, d, v in [(0, 0.3, 96), (0.5, 0.3, 92), (1, 0.9, 104)]:
        tpt.n(72 + bt, d, 'D4 F#4 A4 D5', v); horn.n(72 + bt, d, 'F#3 A3 D4', v - 8)
    timp.n(72, 0.5, 'D3', 96); timp.n(73, 0.5, 'A2', 100)
    cel.n(74, 1.0, 'F#6 A6 D7', 78); glock.n(74, 1.0, 'D7', 80); kit.n(74, 1.0, TRI, 80)
    # the wink (bar 6 of C): in the narrator's pause before "shareholder value" — a xylophone "ta-ding"
    pizz.n(76, 0.4, 'G2', 100); comp.n(76, 0.3, [x + 12 for x in ms(MID['G7'])], 60)
    xylo.n(77, 0.2, 'D6', 104, exact=True); xylo.n(77.25, 0.2, 'G6', 110, exact=True)
    glock.n(77.5, 0.8, 'G6', 88, exact=True); kit.n(77.5, 0.6, TRI, 84, exact=True)
    pizz.n(79, 0.3, 'G2 D3', 104); pizz.n(79.5, 0.3, 'G2', 108, exact=True)            # "...value." two cheeky plucks

    # ================================================================ D: lift and momentum (beats 80-103, 38.9-50.9 s)
    lift = ['F', 'G', 'Am', 'F', 'Dm7', 'G']
    ost = {'F': 'A4 C5 F5 C5', 'G': 'B4 D5 G5 D5', 'Am': 'C5 E5 A5 E5', 'Dm7': 'D5 F5 A5 F5', 'Gs': 'C5 D5 G5 D5'}
    hornv = {'F': 'C4 F4 A4', 'G': 'D4 G4 B4', 'Am': 'E4 A4 C5', 'Dm7': 'F4 A4 D5'}
    root = {'F': 'F2', 'G': 'G2', 'Am': 'A2', 'Dm7': 'D2'}
    orch.n(80, 2.0, CY2, 70)
    for i, c in enumerate(lift):
        b0 = 80 + 4 * i
        pat = ms(ost['Gs' if (i == 5) else c])
        for k in range(8 if i < 5 else 5):   # the last bar's ostinato hands over to the run at beat 2.5
            if i == 5 and k >= 4:
                pat = ms(ost['G'])
            fstr.n(b0 + k / 2, 0.35, pat[k % 4], int(78 + 5 * i + (8 if k % 2 == 0 else 0)))
        cello.n(b0, 0.45, root[c], 92)
        for k in range(1, 8 if i >= 2 else 4):
            cello.n(b0 + (k / 2 if i >= 2 else k), 0.4, root[c], 80 if i >= 2 else 84)
        timp.n(b0, 1.0, root[c], 84 + 5 * i)
        if i < 5:
            horn.n(b0, 4, hornv[c], 70 + 6 * i)
        else:
            horn.n(b0, 2, 'G4 C5 D5', 104); horn.n(b0 + 2, 1.5, 'G4 B4 D5', 108)   # WHY 1.5: the music lifts off before "And so" (50.9)
        for bt in (0, 1.5, 3):
            comp.n(b0 + bt, 0.3, [x + 12 for x in ms(MID[c] if c != 'Dm7' else 'A3 D4 F4')], 76 + 5 * i)
        if i >= 3:
            for k in range(8):
                orch.n(b0 + k / 2, 0.1, SN, 50 + 6 * (i - 3) + (12 if k % 2 == 0 else 0))
    fstr.ramp(H['but'], H['andso'] - 0.05, 80, 124, curve=1.3)
    line(clar, 80, [(0, 'C5', .5), (0.5, 'F5', .5), (1, 'A5', 1.5)], 92)
    line(clar, 84, [(0, 'D5', .5), (0.5, 'G5', .5), (1, 'B5', 1.5)], 96)
    line(clar, 88, [(0, 'E5', .5), (0.5, 'A5', .5), (1, 'C6', 1.5)], 100)
    line(flute, 88, [(0, 'E6', .5), (0.5, 'A6', .5), (1, 'C7', 1.5)], 80)
    line(clar, 92, [(0, 'F5', .5), (0.5, 'A5', .5), (1, 'C6', 1.5)], 100)
    line(flute, 92, [(0, 'F6', .5), (0.5, 'A6', .5), (1, 'C7', 1.5)], 84)
    # the last bar: snare roll and timpani roll swell into "And so" (50.9)
    for k in range(14):   # WHY 14: the last 8th is a breath (after "asks.") so "And so" (50.9) lands cleanly
        orch.n(100 + k / 4, 0.1, SN, 60 + 4 * k)
        if k >= 8:
            timp.n(100 + k / 4, 0.25, 'G2', 70 + 4 * k)
    for k, nn in enumerate(ms('G4 A4 B4 C5 D5 E5 F5')):
        fstr.n(102.5 + k / 8, 0.1, nn, 100 + 3 * k)

    # ================================================================ E: the theme (beats 104-123, 50.9-62.1 s)
    theme = ['C', 'G', 'Am', 'F', 'G']
    lowr = {'C': 'C3', 'G': 'G2', 'Am': 'A2', 'F': 'F2'}
    hornc = {'C': [(0, 'E4', 2), (2, 'G4', 2)], 'G': [(0, 'D4', 2), (2, 'B3', 2)], 'Am': [(0, 'C4', 2), (2, 'E4', 2)],
             'F': [(0, 'C4', 2), (2, 'A3', 2)]}
    orch.n(104, 3.0, CY2, 92); orch.n(104, 1.0, BD, 90)
    s.add_audio('boom', E.boom(rng, f=45, dur=1.2), H['andso'], gain_db=-24.0, send=0.0)
    for i, c in enumerate(theme):
        b0 = 104 + 4 * i
        if i < 4:
            for bt, nn, d in MOTIF[c]:
                mel.n(b0 + bt, d, [m(nn), m(nn) - 12], 92)
            glock.n(b0, 1.0, m(MOTIF[c][0][1]) + 12, 70)
            line(horn, b0, hornc[c], 80)
        else:
            line(mel, b0, [(0, 'G5', 1.5), (1.5, 'F5', .5), (2, 'E5', 1), (3, 'D5', 1)], 92)
            line(mel, b0, [(0, 'G4', 1.5), (1.5, 'F4', .5), (2, 'E4', 1), (3, 'D4', 1)], 86)
            horn.n(b0, 4, 'B3 D4', 84)
        R = m(lowr[c])
        for k, iv in enumerate([0, 7, 12, 16 if c in ('C', 'F', 'G') else 15, 12, 7, 12, 7]):
            comp.n(b0 + k / 2, 0.5, R + iv, 70)
        strings.n(b0, 4, PAD[c], 90)
        cb.n(b0, 4, m(lowr[c]) - 12, 80)
        cello.n(b0, 4, lowr[c], 76)
        harp.roll(b0, 3.0, [m(lowr[c]) + 12 + x for x in (0, 7, 12, 16 if c != 'Am' else 15, 19)], 74, 0.045)
        timp.n(b0, 1.0, lowr[c] if c != 'C' else 'C3', 70)
    strings.ramp(H['andso'], H['free'] - 0.1, 104, 118)
    for k in range(14):   # WHY 14 of 16: a short breath before 62.1
        orch.n(122 + k / 8, 0.1, SN, 54 + 4 * k)
        timp.n(122 + k / 8, 0.12, 'G2', 60 + 3 * k)

    # ================================================================ F: rousing (beats 124-131, 62.1-66.1 s)
    for i, c in enumerate(['C', 'Am']):
        b0 = 124 + 4 * i
        for bt, nn, d in MOTIF[c]:
            d = min(d, 3.8 - bt)   # WHY: the last note stops just before the next bar so 66.1 has an edge
            tpt.n(b0 + bt, d, nn, 108); horn.n(b0 + bt, d, m(nn) - 12, 100)
        pc = ms('E5 G5 C6 G5') if c == 'C' else ms('E5 A5 C6 A5')
        for k in range(8):
            fstr.n(b0 + k / 2, 0.35, pc[k % 4], 104 if k % 2 == 0 else 92)
            cello.n(b0 + k / 2, 0.4, lowr[c], 92)
        orch.n(b0, 0.5, BD, 110); orch.n(b0 + 2, 0.5, BD, 100)
        for bt, v in [(0, 100), (0.5, 60), (1, 90), (1.75, 70), (2, 96), (3, 92), (3.5, 74)]:
            orch.n(b0 + bt, 0.1, SN, v)
        timp.n(b0, 0.8, lowr[c] if c != 'C' else 'C3', 110); timp.n(b0 + 2, 0.8, 'G2' if c == 'C' else 'E2', 100)
        comp.n(b0, 0.8, [m(lowr[c]) - 12, m(lowr[c])], 100); comp.n(b0 + 2, 0.8, [m(lowr[c]) - 12, m(lowr[c])], 94)
        comp.n(b0 + 1, 0.4, [x + 12 for x in ms(MID[c])], 86); comp.n(b0 + 3, 0.4, [x + 12 for x in ms(MID[c])], 86)
        strings.n(b0, 3.8, PAD[c], 100)
        tbn.n(b0, 3.8, MID[c].replace('4', '3'), 80)
    orch.n(124, 2.0, CY1, 108); orch.n(124, 2.0, CY2, 96)

    # ================================================================ G: the build (beats 132-139, 66.1-70.32 s)
    strings.n(132, 4, 'F2 C3 A3 C4 F4 A4', 100)
    orch.n(132, 0.5, BD, 108); orch.n(132, 2.0, CY2, 92); timp.n(132, 0.8, 'F2', 108)   # WHY: a felt downbeat on 66.1
    strings.n(136, 2, 'G2 D3 C4 D4 G4 C5', 104); strings.n(138, 1.7, 'G2 D3 B3 D4 G4 B4', 110)
    strings.ramp(H['last'], H['every'] - 0.06, 96, 127, curve=1.4)
    tbn.n(132, 4, 'F2 C3 A3', 92); tbn.n(136, 2, 'G2 D3 C4', 98); tbn.n(138, 1.7, 'G2 D3 B3', 104)
    tuba.n(132, 4, 'F1', 92); tuba.n(136, 3.9, 'G1', 100)
    line(horn, 132, [(0, 'A4', 2), (2, 'C5', 2), (4, 'D5', 2), (6, 'B4', 1.9)], 100)
    for b in (132, 134):
        comp.n(b, 1.5, 'F1 F2 C3 F3', 96)
    for b in (136, 138):
        comp.n(b, 1.5, 'G1 G2 D3 G3', 104)
    choir.n(136, 3.8, 'G3 D4 G4 B4', 90)
    choir.ramp(tm.t(136), H['every'] - 0.06, 60, 120)
    for k in range(30):   # WHY 30 of 32: the rolls stop a 16th early so the cadence on "everything" has an edge
        timp.n(136 + k * 0.125, 0.13, 'G2', int(55 + 60 * (k / 32) ** 1.3))
        orch.n(136 + k * 0.125, 0.1, SN, int(45 + 70 * (k / 32) ** 1.3))
    for k, nn in enumerate(ms('A4 B4 C5 D5 E5 F5 G5')):   # the run ends a 32nd early: a breath before "everything"
        fstr.n(139 + k / 8, 0.1, nn, 100 + 3 * k)
    fstr.ramp(H['last'], H['last'] + 0.1, 124, 124)
    s.add_audio('cymswell', E.riser(H['every'] - 0.09 - tm.t(136), rng, f0=2500, f1=12000, shape=2.0),
                tm.t(136), gain_db=-24.0, send=0.35)

    # ================================================================ "everything.": the cadence (beat 140 = 70.32 s)
    te = H['every']
    tpt.n(140, 3, 'C5 E5 G5', 112); horn.n(140, 3, 'E4 G4 C5', 108); tbn.n(140, 3, 'C3 G3 C4', 104); tuba.n(140, 3, 'C2', 104)
    strings.n(140, 9, 'C2 C3 G3 E4 G4 C5 E5', 112)
    strings.ramp(te + 0.02, te + 1.4, 127, 118); strings.ramp(te + 1.4, te + 5.0, 118, 50)
    cb.n(140, 6, 'C2', 96); cello.n(140, 6, 'C2 C3', 92)
    mel.n(140, 5, 'C1 C2', 108)
    comp.roll(140, 5, 'C3 G3 C4 E4 G4 C5', 104, 0.01)
    timp.n(140, 2, 'C3', 122); orch.n(140, 1, BD, 120); orch.n(140, 3, CY1, 118); orch.n(140, 3, CY2, 110)
    for k, nn in enumerate(ms('C6 E6 G6 C7')):
        glock.n(140 + k * 0.25, 1.5, nn, 92)
    choir.n(140, 4, 'C4 E4 G4 C5', 110); choir.ramp(te + 0.02, te + 3.0, 120, 50)
    s.add_audio('boom', E.boom(rng, f=40, dur=2.0), te, gain_db=-16.0, send=0.0)
    # the tail: the motif's last phrase, gently, then a final soft C with celesta, ringing out under the end card
    line(mel, 143, [(0, 'E5', 1), (1, 'G5', .5), (1.5, 'A5', .5), (2, 'G5', 1)], 74)
    mel.n(146, 4.5, 'C4 E4 G4 C5', 70)
    comp.n(146, 4.5, 'C2 G2', 62)
    for k, nn in enumerate(ms('C6 E6 G6 C7')):
        cel.n(146 + k * 0.25, 2.0, nn, 66)
    harp.roll(146, 4.5, 'C3 G3 E4 G4 C5', 62, 0.05)
    return s, H


def excite(x, amount_db=-16.0):
    """Gentle harmonic exciter: soft-saturate the 2.5 kHz+ band and add back only the NEW harmonics above 5 kHz.
    WHY: an EQ lift cannot add what the soundfont strings/brass never had; saturation creates real upper harmonics
    that follow the music (no hiss), giving the score-only cut its missing air."""
    band = hp(x, 2500, 2)
    k = 4.0 / (np.abs(band).max() + 1e-9)
    gen = hp(np.tanh(band * k) / k - band, 5000, 4)
    return x + gen * db(amount_db) * (np.sqrt((band ** 2).mean()) / (np.sqrt((gen ** 2).mean()) + 1e-12))


# ------------------------------------------------------------------------------------------- voice and ducking
def de_ess(v, f_lo=5500, thresh_db=-6.0, max_red_db=6.0):
    """Gentle de-esser: when the 5.5-10 kHz band rises within thresh_db of the whole voice, turn that band down.
    WHY: the narration has a bright 8-12 kHz shelf (sibilants), which reads as harsh once the music sits under it."""
    band = dsp.bp(v, f_lo, 10000, 2)
    eb = np.sqrt(lp(band ** 2, 60, 1).clip(0)) + 1e-9
    ev = np.sqrt(lp(v ** 2, 60, 1).clip(0)) + 1e-9
    over = 20 * np.log10(eb / ev) - thresh_db
    red = -np.clip(over, 0, max_red_db)
    g = db(red)
    return v - band + band * g


def compress(v, thresh_db=-26.0, ratio=2.5, att=0.008, rel=0.15):
    """Mild RMS compressor (feed-forward). WHY: evens out the storyteller's quick asides so no word drops under the music."""
    e = lp(v ** 2, 1 / (2 * np.pi * att), 1).clip(1e-12)
    ldb = 10 * np.log10(e)
    gr = np.minimum(0, (thresh_db - ldb) * (1 - 1 / ratio))
    # release smoothing: gain recovers at `rel` time constant
    from scipy.signal import lfilter
    a = np.exp(-1 / (rel * SR))
    sm = lfilter([1 - a], [1, -a], gr)
    gr = np.minimum(gr, sm)
    return v * db(gr)


def process_voice(n):
    v, sr = sf.read(VOICE, dtype='float64')
    assert sr == SR
    if v.ndim == 2:
        v = v.mean(axis=1)
    v = hp(v, 85, 2)                                  # WHY: rumble/plosive thumps, nothing of the voice below 85 Hz
    v = dsp.peak_eq(v, 250, -1.5, 0.9)                # WHY: a touch less chest boom so it stays crisp next to cellos
    v = dsp.peak_eq(v, 3200, 1.5, 1.0)                # presence for intelligibility (small, not harsh)
    v = de_ess(v)
    v = dsp.peak_eq(v, 9000, -2.0, 0.8)               # WHY: tame the bright 8-12 kHz shelf (de-harsh)
    v = compress(v)
    out = np.zeros(n)
    out[:min(n, len(v))] = v[:n]
    return out


def speech_mask(words, n, gap_merge=0.40, pre=0.06, post=0.10):
    """1 while she speaks (phrases merged across gaps < gap_merge), else 0; edges padded."""
    ph = []
    for w in words:
        if ph and w['start'] - ph[-1][1] < gap_merge:
            ph[-1][1] = w['end']
        else:
            ph.append([w['start'], w['end']])
    mk = np.zeros(n)
    for a, b in ph:
        mk[max(0, int((a - pre) * SR)):min(n, int((b + post) * SR))] = 1.0
    return mk, ph


def short_loudness(x, win=0.4, hop=0.05):
    """K-weighted short-term level (dB) every hop, interpolated to every sample."""
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    xk = x if x.ndim == 2 else np.stack([x, x], -1)
    # WHY: apply the meter's K-weighting filters once per channel ALONG TIME (pyloudnorm's filter works on 1-D
    # arrays; given (n, 2) it would filter across the two channels), then a fast sliding mean-square
    chans = []
    for c in range(xk.shape[1]):
        y = xk[:, c]
        for f in meter._filters.values():
            y = f.apply_filter(y)
        chans.append(y)
    pw = np.mean([y ** 2 for y in chans], axis=0)
    k = int(win * SR)
    cs = np.concatenate([[0], np.cumsum(pw)])
    centers = np.arange(0, len(pw), int(hop * SR))
    lo = np.clip(centers - k // 2, 0, len(pw)); hi = np.clip(centers + k // 2, 0, len(pw))
    ms_ = (cs[hi] - cs[lo]) / np.maximum(1, hi - lo)
    L = 10 * np.log10(ms_ + 1e-12) - 0.691
    return np.interp(np.arange(len(pw)), centers, L)


def duck(music, voice, words, below_db=16.0):
    """Sidechain-style ducking keyed to the narration: while she speaks, the music's short-term loudness is held
    `below_db` under the voice's phrase loudness; in gaps it rises back (attack 60 ms, release 350 ms). A gentle
    1-4 kHz dip is blended in only while she speaks, carving room for consonants.
    WHY adaptive (not a fixed dip): the score swings from a near-silent hush to a full orchestra, so a fixed
    number of dB would either bury the voice under the climax or over-duck the quiet storybook passages."""
    n = len(music)
    mk, ph = speech_mask(words, n)
    Lm = short_loudness(music)
    Lv = np.full(n, -70.0)
    import pyloudnorm as pyln
    meter = pyln.Meter(SR, block_size=0.2)
    for a, b in ph:
        i, j = int(a * SR), int(b * SR)
        if j - i > int(0.25 * SR):
            lv = meter.integrated_loudness(np.stack([voice[i:j]] * 2, -1))
        else:
            lv = -24.0
        Lv[max(0, i - int(0.06 * SR)):min(n, j + int(0.1 * SR))] = lv
    # WHY a little less ducking for the last two lines: the climax should feel bigger, but stay >= 14 dB under
    margin = np.where(np.arange(n) / SR > 62.0, below_db - 2.0, below_db)
    want = np.where(mk > 0, np.minimum(0.0, (Lv - margin) - Lm), 0.0)
    # smoothing: fast attack (gain goes down quickly), slow release
    from scipy.ndimage import minimum_filter1d
    want = minimum_filter1d(want, size=int(0.06 * SR))      # look-ahead so the dip is in place when the word starts
    a_att, a_rel = np.exp(-1 / (0.06 * SR)), np.exp(-1 / (0.35 * SR))
    g = np.empty(n)
    cur = 0.0
    for i in range(0, n, 48):                                # 1 ms control rate
        w = want[i]
        cur = a_att * cur + (1 - a_att) * w if w < cur else a_rel * cur + (1 - a_rel) * w
        g[i:i + 48] = cur
    # pass 2 — WHY: the curve above follows the music's short-term level, but plucks and hits make the music
    # peaky, so its power-based (LUFS) level per phrase came out ~4 dB hotter than intended. Measure each phrase
    # the way a loudness meter does and trim the music by the remaining difference, so every phrase sits at the
    # target (16 dB under the voice; 14 dB for the last two lines).
    pre = music * db(g)[:, None]
    corr = np.zeros(n)
    for a, b in ph:
        i, j = int(a * SR), int(b * SR)
        if j - i < int(0.45 * SR):
            continue
        lv = meter.integrated_loudness(np.stack([voice[i:j]] * 2, -1))
        lm = meter.integrated_loudness(pre[i:j])
        tgt = (below_db - 2.0) if a > 62.0 else below_db
        extra = min(0.0, (lv - tgt) - lm)
        if np.isfinite(extra):
            corr[max(0, i - int(0.08 * SR)):min(n, j + int(0.08 * SR))] = np.minimum(corr[max(0, i - int(0.08 * SR)):min(n, j + int(0.08 * SR))], extra)
    corr = minimum_filter1d(corr, size=int(0.1 * SR))
    corr = lp(corr, 4.0, 1)
    g = g + corr
    gl = db(g)
    carve_amt = lp(mk, 8, 1)
    carved = dsp.peak_eq(music, 2400, -4.0, 0.7)
    mus = music * (1 - carve_amt[:, None]) + carved * carve_amt[:, None]
    return mus * gl[:, None], g, mk


def build(which):
    alt = which == 'alt'
    s, H = compose(alt)
    stems = s.render_stems()
    # WHY air +6 dB from 3.2 kHz: soundfont strings/brass are dark; the score-only cut measured 0.6% above 4 kHz at +2.5/5k
    music = E.mixdown(s, stems, rt60=1.9, wet_db=-9.0, air_db=6.0, air_hz=3200, fade_end=END, fade_len=1.6)
    music = excite(music)
    name = {'primary': 'take1-mix', 'type': 'take1-type-mix', 'alt': 'take1-mix-alt'}[which]
    path = os.path.join(E.OUT, name + '.wav')
    if which == 'type':
        y = E.finish(music, path, s.n)
    else:
        words = load_words()
        voice = process_voice(s.n)
        # normalise the music bus to a fixed reference first so ducking targets are absolute
        music = music * db(-20.0 - dsp.lufs(music))
        mus_d, g, mk = duck(music, voice, words)
        vs = np.stack([voice, voice], -1)
        mix = vs + mus_d
        mix = E.fade_in_out(mix, END, 0.05)
        y = E.finish(mix, path, s.n)
        # stems at the same final gain, for the voice/music ratio report
        gain = np.sqrt((y ** 2).sum() / max(1e-12, (mix ** 2).sum()))
        sf.write(os.path.join(E.OUT, '.' + name + '.voice.wav'), dsp.fit(vs * gain, s.n), SR, subtype='FLOAT')
        sf.write(os.path.join(E.OUT, '.' + name + '.music.wav'), dsp.fit(mus_d * gain, s.n), SR, subtype='FLOAT')
    print(f'{path}: LUFS {dsp.lufs(y):.2f} TP {dsp.true_peak_db(y):.2f}')
    return path


if __name__ == '__main__':
    for w in sys.argv[1:] or ['primary', 'type', 'alt']:
        build(w)
