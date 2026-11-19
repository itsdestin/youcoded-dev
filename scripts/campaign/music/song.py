#!/usr/bin/env python3
"""Parametric generator for the youcoded campaign underscore.

Key C major, 100 BPM, 4/4 (1 beat = 0.6 s, 1 bar = 2.4 s).
Lit-section progression (one chord per bar):  Cadd9 - Gadd9 - Am7(add11) - Fadd9
Dark-section chords:                          Am7 - Fsus2 - Am7 - Gsus4   (last N bars of this list)
A "form" is a list of (kind, bars); the final `end` section runs to the file length.
Usage:  python song.py [name ...]     (no names = all forms)      output -> out/<name>.wav + .map.json
"""
import json, os, sys
import numpy as np
import soundfile as sf
from scipy import signal
import dsp
from dsp import SR, BEAT, BAR, db, lp, hp, bp, stereo, pan
import piano as pianomod

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

# ----------------------------------------------------------------------------- forms (edit here for new cuts)
FORMS = {
    'hero60':   (60.0, [('rent', 4), ('breath', 1), ('ask', 1), ('bloom', 3), ('pulse', 6), ('peak', 5), ('stance', 2)]),
    'hero30':   (30.0, [('rent', 2), ('ask', 1), ('bloom', 1), ('pulse', 4), ('peak', 2)]),
    'short15a': (15.0, [('ask', 1), ('bloom', 1), ('pulse', 3)]),
    'short15b': (15.0, [('pulse', 2), ('peak', 3)]),
    'short15c': (15.0, [('rent', 2), ('bloom', 1), ('pulse', 2)]),
    'short20':  (20.0, [('rent', 1), ('ask', 1), ('bloom', 1), ('pulse', 3), ('stance', 1)]),
}

# ----------------------------------------------------------------------------- harmony
# sub: sub-bass midi; bass: piano LH root; lh2: piano LH upper tone (beat 3); pad: pad voicing; pool: pluck arpeggio notes
CH = {
    'C':     dict(sub=36, bass=(48, 55), lh2=64, pad=[48, 55, 62, 64], pool=[60, 64, 67, 74], name='Cadd9'),
    'G':     dict(sub=43, bass=(43, 50), lh2=59, pad=[55, 59, 62, 69], pool=[59, 62, 67, 69], name='Gadd9'),
    'Am':    dict(sub=33, bass=(45, 52), lh2=60, pad=[57, 64, 67, 72], pool=[60, 64, 67, 72], name='Am7'),
    'F':     dict(sub=41, bass=(41, 48), lh2=57, pad=[53, 60, 67, 69], pool=[57, 60, 65, 67], name='Fadd9'),
    'Am_r':  dict(sub=33, bass=(45, 52), lh2=60, pad=[45, 52, 60, 67], tones=[64, 67, 72, 76], name='Am7 (rent)'),
    'Fs2':   dict(sub=29, bass=(41, 48), lh2=60, pad=[41, 48, 55, 67], tones=[65, 67, 72, 79], name='Fsus2 (rent)'),
    'Gs4':   dict(sub=31, bass=(43, 50), lh2=60, pad=[43, 50, 55, 60], tones=[67, 72, 74, 79], name='Gsus4 (rent)'),
}
LIT = ['C', 'G', 'Am', 'F']
RENT = ['Am_r', 'Fs2', 'Am_r', 'Gs4']
# motif: (beat, midi, dur_beats) per chord of the 4-bar phrase
MOTIF = {
    'C':  [(0, 76, 1.5), (1.5, 79, .5), (2, 81, 1), (3, 79, 1)],
    'G':  [(0, 74, 1.5), (1.5, 79, .5), (2, 83, 1), (3, 81, 1)],
    'Am': [(0, 76, 1.5), (1.5, 74, .5), (2, 72, 1), (3, 74, 1)],
    'F':  [(0, 81, 1.5), (1.5, 79, .5), (2, 77, 1), (3, 79, 1)],
}
STRING_LINE = {'C': 67, 'G': 71, 'Am': 69, 'F': 72}   # slow pad line, one note per bar
STANCE = {'F': [(0, 81, 3.0), (2.5, 79, 1.5)], 'G': [(0, 83, 2.0), (2, 79, 2.0)]}
STANCE_CH = ['F', 'G']
BLOOM_CH = ['C', 'G', 'F']


def sections_from_form(length, form):
    secs, t = [], 0.0
    for kind, bars in form:
        secs.append(dict(kind=kind, start=round(t, 6), end=round(t + bars * BAR, 6), bars=bars))
        t += bars * BAR
    secs.append(dict(kind='end', start=round(t, 6), end=length, bars=round((length - t) / BAR, 3)))
    return secs


class Score:
    """Collects note events; render() turns them into audio."""
    def __init__(self):
        self.piano, self.pad, self.sub, self.pluck, self.kick, self.rim, self.strg = [], [], [], [], [], [], []
        self.bars = []       # per-bar log for harmony check: dict(t, kind, chord, notes=[...])


def build_score(length, secs):
    sc = Score()
    prev_chord = None
    for si, s in enumerate(secs):
        k, t0, nb = s['kind'], s['start'], s['bars']
        first_in_file = (si == 0)
        n_bars = int(np.ceil(nb)) if k != 'end' else 1
        if k == 'rent':
            chords = RENT[-nb:] if nb <= 4 else [RENT[i % 4] for i in range(nb)]
        elif k == 'bloom':
            chords = BLOOM_CH[:nb] if nb <= 3 else [BLOOM_CH[i % 3] for i in range(nb)]
            if nb == 1: chords = ['C']
            if nb == 2: chords = ['C', 'G']
        elif k in ('pulse', 'peak'):
            chords = [LIT[i % 4] for i in range(nb)]
        elif k == 'stance':
            chords = STANCE_CH[-nb:]
        elif k == 'ask':
            chords = ['F'] * nb
        elif k == 'breath':
            chords = [prev_chord or 'Gs4'] * nb
        else:
            chords = ['C']
        for b in range(n_bars):
            tb = t0 + b * BAR
            c = chords[b]
            ch = CH[c]
            log = dict(t=round(tb, 3), kind=k, chord=ch['name'], pcs=set(), notes=[])

            def P(beat, midi, vel, dur, gdb=0.0, p=0.0):
                sc.piano.append(dict(t=tb + beat * BEAT, midi=midi, vel=vel, dur=dur, gdb=gdb, pan=p))
                log['notes'].append(('piano', midi))

            def PAD(gd, gb, att, rel, t1=None, notes=None):
                sc.pad.append(dict(t0=tb, t1=(tb + BAR) if t1 is None else t1, notes=notes or ch['pad'], gd=gd, gb=gb, att=att, rel=rel))
                for n_ in (notes or ch['pad']): log['notes'].append(('pad', n_))

            def SUB(gain, hold=BAR * 0.92, att=0.07, rel=0.35, midi=None):
                sc.sub.append(dict(t=tb, midi=midi or ch['sub'], hold=hold, att=att, rel=rel, g=gain))
                log['notes'].append(('sub', (midi or ch['sub'])))

            if k == 'rent':
                att = 0.25 if (first_in_file and b == 0 and False) else 1.2
                PAD(0.55, 0.0, att, 1.6, notes=ch['pad'][:3])
                log['notes'] = [x for x in log['notes']]
                tones = ch['tones']
                if b % 2 == 0:
                    P(1.0 if b else 1.5, tones[2], 32, 1.8, p=-0.15)
                    P(3.0, tones[0], 28, 1.8, p=0.1)
                else:
                    P(2.0, tones[1], 31, 1.8, p=0.1)
            elif k == 'breath':
                PAD(0.14, 0.0, 0.5, 2.0, notes=CH[chords[b]]['pad'][:3])
                P(0, 86, 30, 2.4, p=0.1)
            elif k == 'ask':
                PAD(0.5, 0.35, 1.4, 1.2)
                for i, m in enumerate([65, 69, 72, 74]):
                    P(i, m, 30 + 4 * i, 1.0 if i < 3 else 1.6, p=-0.1 + 0.07 * i)
            elif k == 'bloom':
                if b == 0:
                    # the exhale: warm major chord on the downbeat, pad opens, soft sub lands
                    for m, v in [(48, 46), (55, 44), (64, 46), (67, 44)]:
                        P(0, m, v, 3.5, p=(m - 60) / 60)
                    P(2, 79, 36, 2.6, p=0.2)
                    sc.pad.append(dict(t0=tb, t1=tb + BAR, notes=ch["pad"], gd=0.45, gb=0.0, att=0.3, rel=1.4))
                    sc.pad.append(dict(t0=tb, t1=tb + BAR, notes=ch['pad'], gd=0.0, gb=1.0, att=1.1, rel=1.4))
                    for n_ in ch['pad']: log['notes'].append(('pad', n_))
                    SUB(0.9, hold=BAR * 1.5, att=0.12, rel=0.6)
                else:
                    PAD(0.3, 0.8, 0.5, 1.2)
                    SUB(0.7)
                    for beat, m, d in MOTIF[c]:
                        P(beat, m, 42, d * BEAT + 0.3, p=0.12)
                    P(0, ch['bass'][0], 38, 1.8); P(0, ch['bass'][1], 34, 1.8)
            elif k in ('pulse', 'peak'):
                pk = (k == 'peak')
                PAD(0.30, 0.62 if not pk else 0.85, 0.45, 1.2)
                SUB(0.8 if not pk else 0.9)
                for beat, m, d in MOTIF[c]:
                    P(beat, m, 46 if not pk else 52, d * BEAT + 0.25, p=0.12)
                    if pk: P(beat, m - 12, 40, d * BEAT + 0.25, p=-0.12)
                P(0, ch['bass'][0], 46, 2.0); P(0, ch['bass'][1], 40, 2.0)
                P(2, ch['lh2'], 36, 1.4)
                if pk:
                    P(0, ch['bass'][0] - 12 if ch['bass'][0] - 12 >= 28 else ch['bass'][0], 42, 2.0)
                    sc.strg.append(dict(t0=tb, t1=tb + BAR, midi=STRING_LINE[c], g=1.0))
                    log['notes'].append(('pad', STRING_LINE[c]))
                    # the string line is doubled an octave down for a fuller "peak" without adding rhythm
                    sc.strg.append(dict(t0=tb, t1=tb + BAR, midi=STRING_LINE[c] - 12, g=0.7))
                # soft eighth pulse (marimba-like pluck), up and back through the chord pool
                pool = ch['pool']
                pat = [0, 1, 2, 3, 2, 1, 2, 3] if not pk else [0, 1, 2, 3, 2, 3, 2, 1]
                for i, idx in enumerate(pat):
                    sc.pluck.append(dict(t=tb + i * BEAT / 2, midi=pool[idx], g=(1.0 if i % 2 == 0 else 0.75) * (1.0 if not pk else 1.1), pan=(-0.3 if i % 2 == 0 else 0.3)))
                    log['notes'].append(('pluck', pool[idx]))
                sc.kick += [dict(t=tb, g=1.0), dict(t=tb + 2 * BEAT, g=0.85)]
                sc.rim += [dict(t=tb + BEAT, g=1.0, pan=-0.3), dict(t=tb + 3 * BEAT, g=0.8, pan=0.3)]
            elif k == 'stance':
                PAD(0.18, 0.55, 0.6, 1.4)
                for beat, m, d in STANCE[c]:
                    P(beat, m, 48, d * BEAT + 0.4, p=0.1)
                P(0, ch['bass'][0], 46, 3.0); P(0, ch['bass'][1], 42, 3.0)
                P(0, ch['lh2'] + 12 if c == 'G' else ch['lh2'] + 12, 34, 2.0, p=-0.1)
            elif k == 'end':
                tb = t0
                for m, v in [(36, 58), (43, 52), (48, 52), (55, 50), (64, 50), (74, 46), (79, 44)]:
                    sc.piano.append(dict(t=tb, midi=m, vel=v, dur=8.0, gdb=0.0, pan=(m - 60) / 70))
                    log['notes'].append(('piano', m))
                sc.pad.append(dict(t0=tb, t1=length, notes=ch['pad'], gd=0.4, gb=0.95, att=0.4, rel=3.0))
                for n_ in ch['pad']: log['notes'].append(('pad', n_))
                sc.sub.append(dict(t=tb, midi=36, hold=length - tb, att=0.1, rel=2.0, g=1.0))
                log['notes'].append(('sub', 36))
            sc.bars.append(log)
            prev_chord = c
    return sc


# ----------------------------------------------------------------------------- synthesis
def _table(kind):
    n = 4096
    ph = np.arange(n) / n
    y = np.zeros(n)
    for h in range(1, 28):
        a = 1.0 / h if kind == 'saw' else (1.0 / h if h % 2 else 0.0)
        y += a * np.sin(2 * np.pi * h * ph)
    return y / np.abs(y).max()


TAB_SAW, TAB_SQ = _table('saw'), _table('sq')


def osc(freq, n, rng, tab=TAB_SAW, detune_c=0.0):
    f = freq * 2 ** (detune_c / 1200)
    ph0 = rng.random()
    ph = (ph0 + np.arange(n) * f / SR) % 1.0
    x = ph * len(tab)
    i = x.astype(int)
    fr = x - i
    return tab[i] * (1 - fr) + tab[(i + 1) % len(tab)] * fr


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_ar(n_hold, n_att, n_rel):
    n = n_att + n_hold + n_rel
    e = np.ones(n)
    e[:n_att] = np.sin(np.linspace(0, np.pi / 2, n_att, endpoint=False)) ** 2 if n_att else e[:0]
    e[n_att + n_hold:] = np.cos(np.linspace(0, np.pi / 2, n_rel)) ** 2 if n_rel else e[:0]
    return e


def add_at(buf, seg, t):
    i = int(round(t * SR))
    if i >= len(buf): return
    j = min(len(buf), i + len(seg))
    buf[i:j] += seg[: j - i]


def render_pad(events, n, rng, voices=(-8.0, 0.0, 8.0), tab=TAB_SAW, amp=1.0):
    """Returns (dark, bright) stereo buffers, unfiltered; caller filters."""
    dark, bright = np.zeros((n, 2)), np.zeros((n, 2))
    pans = [-0.55, 0.0, 0.55]
    for ev in events:
        n_att, n_hold, n_rel = int(ev['att'] * SR), int((ev['t1'] - ev['t0']) * SR), int(ev['rel'] * SR)
        e = env_ar(n_hold, n_att, n_rel)
        L = len(e)
        for m in ev['notes']:
            for v, dc in enumerate(voices):
                w = osc(mtof(m), L, rng, tab, dc) * e * (amp / (len(ev['notes']) * len(voices)) ** 0.5)
                st = pan(w, pans[v % 3])
                if ev['gd'] > 0: add_at(dark, st * ev['gd'], ev['t0'])
                if ev['gb'] > 0: add_at(bright, st * ev['gb'], ev['t0'])
    return dark, bright


def render_sub(events, n):
    out = np.zeros(n)
    for ev in events:
        n_att, n_hold, n_rel = int(ev['att'] * SR), int(ev['hold'] * SR), int(ev['rel'] * SR)
        L = n_att + n_hold + n_rel
        t = np.arange(L) / SR
        f = mtof(ev['midi'])
        w = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * 2 * f * t)
        # gentle decay across the bar so the low end never builds up
        w *= env_ar(n_hold, n_att, n_rel) * np.exp(-t / 2.2)
        add_at(out, w * ev['g'], ev['t'])
    return out


def kick_wave(g):
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = 46 + 62 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    a = np.minimum(1, t / 0.0025) ** 2 * np.exp(-t / 0.13)     # 2.5 ms soft attack: felt, never clicky
    return lp(np.sin(ph) * a, 160) * g


def pluck_wave(midi, g):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = mtof(midi)
    w = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.05) + 0.25 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.03)
    w *= np.minimum(1, t / 0.003) * np.exp(-t / 0.16)
    return lp(w, 3200) * g


def rim_wave(g, rng):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    # WHY: 4 ms attack + steep 4.5 kHz roll-off, otherwise the noise burst shows as broadband ticks above 8 kHz
    w = lp(bp(rng.standard_normal(n), 1800, 4200), 4500, 4) * np.minimum(1, t / 0.004) ** 2 * np.exp(-t / 0.018)
    return w * g


def delay_fx(x, taps=((0.45, 0.35), (0.9, 0.16)), cutoff=2500):
    """Quiet dotted-eighth echo (0.45 s = 3/4 beat), alternating channels, filtered so it stays soft."""
    out = np.zeros_like(x)
    for i, (d, g) in enumerate(taps):
        sh = int(d * SR)
        y = lp(hp(x, 250), cutoff)
        y = y[:, ::-1] if i % 2 == 0 else y
        out[sh:] += y[:len(x) - sh] * g
    return out


# gains (linear) per layer into the dry mix; reference: piano raw samples
G = dict(pad=0.02, pad_dark_lp=650, pad_bright_lp=3000, sub=0.008, pluck=0.0135, kick=0.034, rim=0.06, strg=0.011,
         send_piano=0.55, send_pad=0.25, send_pluck=0.35, send_rim=0.3, wet=1.0)


def render_audio(length, secs, sc, seed=11):
    rng = np.random.default_rng(seed)
    n = int(round(length * SR))
    # --- piano
    reqs = set()
    for p in sc.piano:
        d = round(max(0.5, p['dur']) / 0.1) * 0.1
        p['d'] = d
        reqs.add((p['midi'], p['vel'], round(d, 3)))
    cache = pianomod.render(reqs)
    felt = {}
    pn = np.zeros((n, 2))
    for p in sc.piano:
        key = (p['midi'], p['vel'], round(p['d'], 3))
        if key not in felt:
            x = cache[key]
            # "felt": soften the hammer — one-pole + gentle 2nd-order roll-off, lower notes darker
            fc = 2600 + 40 * max(0, p['midi'] - 60)
            felt[key] = lp(lp(x, fc, 2), 6500, 1)
        seg = felt[key] * db(p['gdb'])
        a = (p['pan'] + 1) * np.pi / 4
        seg = seg * np.array([np.cos(a), np.sin(a)]) * np.sqrt(2)
        add_at(pn, seg, p['t'])
    # --- pad
    dk, br = render_pad(sc.pad, n, rng)
    pad = (lp(dk, G['pad_dark_lp']) + lp(br, G['pad_bright_lp'])) * G['pad']
    # --- strings
    sev = [dict(t0=e['t0'], t1=e['t1'], notes=[e['midi']], gd=0.0, gb=e['g'], att=0.9, rel=1.2) for e in sc.strg]
    _, sb = render_pad(sev, n, rng, voices=(-9.0, 9.0), tab=TAB_SQ, amp=1.0)
    strg = lp(sb, 2200) * G['strg']
    # --- sub, kick, pluck, rim
    sub = render_sub(sc.sub, n) * G['sub']
    kick = np.zeros(n)
    for k in sc.kick: add_at(kick, kick_wave(k['g']), k['t'])
    kick *= G['kick']
    pl = np.zeros((n, 2))
    for p in sc.pluck: add_at(pl, pan(pluck_wave(p['midi'], p['g']), p['pan']), p['t'])
    pl = (pl + delay_fx(pl)) * G['pluck']
    rim = np.zeros((n, 2))
    for r in sc.rim: add_at(rim, pan(rim_wave(r['g'], rng), r['pan']), r['t'])
    rim *= G['rim']
    # --- gentle sidechain from the kick: pad / strings / pluck dip ~1.5 dB and breathe back
    duck = np.ones(n)
    for k in sc.kick:
        i = int(round(k['t'] * SR))
        m = min(n, i + int(0.5 * SR))
        duck[i:m] = np.minimum(duck[i:m], 1 - 0.18 * np.exp(-np.arange(m - i) / (0.16 * SR)))
    duck = lp(duck, 40, 1)
    pad, strg, pl = pad * duck[:, None], strg * duck[:, None], pl * duck[:, None]
    # --- reverb (send high-passed at 200 Hz, darkened) : carries tails across sections
    send = hp(pn * G['send_piano'] + pad * G['send_pad'] + (strg) * G['send_pad'] + pl * G['send_pluck'] + rim * G['send_rim'], 200)
    ir = dsp.make_ir()
    wet = dsp.reverb(lp(send, 6500), ir, n) * G['wet'] * 0.35
    stems = dict(piano=pn, pad=pad + strg, sub=stereo(sub), kick=stereo(kick), pluck=pl, rim=rim, wet=wet)
    return stems


def mix_down(length, secs, stems):
    n = int(round(length * SR))
    x = sum(stems.values())
    x = dsp.hp(x, 32, 4)                              # WHY: remove DC and inaudible sub-rumble that only eats headroom
    # start from silence (3 ms), end at silence: tail fades smoothly to zero 0.4 s before the end
    fi = int(0.003 * SR)
    x[:fi] *= np.linspace(0, 1, fi)[:, None]
    end_start = secs[-1]['start']
    f0, f1 = end_start + 0.9, length - 0.4
    i0, i1 = int(f0 * SR), int(f1 * SR)
    curve = np.cos(np.linspace(0, np.pi / 2, i1 - i0)) ** 2
    x[i0:i1] *= curve[:, None]
    x[i1:] = 0
    return x


def build(name, outdir=OUT, verbose=True):
    length, form = FORMS[name]
    secs = sections_from_form(length, form)
    sc = build_score(length, secs)
    stems = render_audio(length, secs, sc)
    x = mix_down(length, secs, stems)
    y = dsp.master(x)
    y = dsp.fit(y, int(round(length * SR)))
    os.makedirs(outdir, exist_ok=True)
    sf.write(os.path.join(outdir, name + '.wav'), y, SR, subtype='PCM_24')
    nb = int(np.ceil(length / BAR))
    mp = dict(name=name, bpm=dsp.BPM, sample_rate=SR, length=length,
              sections=[dict(kind=s['kind'], start=s['start'], end=s['end'], bars=s['bars']) for s in secs],
              beats=[round(i * BEAT, 6) for i in range(int(length / BEAT) + 1) if i * BEAT < length],
              bar_downbeats=[round(i * BAR, 6) for i in range(nb) if i * BAR < length],
              chords=[dict(t=b['t'], kind=b['kind'], chord=b['chord']) for b in sc.bars])
    json.dump(mp, open(os.path.join(outdir, name + '.map.json'), 'w'), indent=1)
    if verbose:
        print(f"{name}: {length}s LUFS={dsp.lufs(y):.2f} TP={dsp.true_peak_db(y):.2f}")
    return y, sc, secs, stems


def harmony_table(name):
    length, form = FORMS[name]
    secs = sections_from_form(length, form)
    sc = build_score(length, secs)
    bad = 0
    names = 'C C# D D# E F F# G G# A A# B'.split()
    print(f"-- harmony: {name}")
    for b in sc.bars:
        notes = b['notes']
        pcs = sorted({m % 12 for _, m in notes})
        clash = [(names[a], names[c]) for i, a in enumerate(pcs) for c in pcs[i + 1:] if (c - a) in (1, 11)]
        piano = sorted({m for who, m in notes if who == 'piano'})
        print(f"  {b['t']:6.1f}s {b['kind']:7s} {b['chord']:14s} pcs={[names[p] for p in pcs]} piano={piano} {'CLASH ' + str(clash) if clash else ''}")
        bad += len(clash)
    print(f"  minor-second clashes: {bad}")
    return bad


if __name__ == '__main__':
    names = sys.argv[1:] or list(FORMS)
    for nm in names:
        build(nm)
