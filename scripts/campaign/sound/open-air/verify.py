"""Measure every file in out/ (we cannot listen, so we measure). Prints a table and
writes out/measurements.txt.  Run: .venv/bin/python verify.py"""
import json
import os
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
SR = 48000
lines = []


def say(s=''):
    print(s)
    lines.append(s)


def tp_db(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-12)


def lufs(x):
    if len(x) < 0.4 * SR:
        return float('nan')
    return pyln.Meter(SR).integrated_loudness(x)


def bands(x):
    mono = x.mean(axis=1)
    f, p = signal.welch(mono, SR, nperseg=8192)
    tot = p[(f >= 20) & (f <= 20000)].sum()
    out = {}
    for name, lo, hi in (('sub 40-80', 40, 80), ('low 80-250', 80, 250), ('lowmid 250-1k', 250, 1000),
                         ('mid 1-4k', 1000, 4000), ('pres 4-8k', 4000, 8000), ('air 8-16k', 8000, 16000)):
        out[name] = 10 * np.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-15)
    return out


def stereo(x):
    L, R = x[:, 0], x[:, 1]
    corr = np.corrcoef(L, R)[0, 1]
    mid, side = (L + R) / 2, (L - R) / 2
    sm = 10 * np.log10((side ** 2).sum() / ((mid ** 2).sum() + 1e-15) + 1e-15)
    mono = np.stack([mid, mid], axis=1)
    loss = lufs(mono) - lufs(x) if len(x) >= 0.4 * SR else float('nan')
    return corr, sm, loss


def clicks(x):
    """Edges + a crude discontinuity detector: a sample-to-sample jump far larger than the
    local high-frequency activity around it."""
    first = np.abs(x[0]).max()
    last = np.abs(x[-1]).max()
    d = np.abs(np.diff(x, axis=0)).max(axis=1)
    loc = signal.medfilt(d, 101) + 1e-4
    spikes = int(((d > 0.05) & (d > 25 * loc)).sum())
    return first, last, spikes


def salience(mono, t, f0, win=0.3):
    """How much the expected note stands out from its semitone neighbours (dB), at
    that exact octave (fundamental + 2nd harmonic), in a window after the onset."""
    a = int((t + 0.02) * SR)
    b = a + int(win * SR)
    seg = mono[a:b] * np.hanning(b - a)
    spec = np.abs(np.fft.rfft(seg, 1 << 17)) ** 2
    fr = np.fft.rfftfreq(1 << 17, 1 / SR)

    def e(f):
        s = 0
        for h in (1, 2):
            m = (fr > f * h * 2 ** (-0.3 / 12)) & (fr < f * h * 2 ** (0.3 / 12))
            s += spec[m].sum()
        return s
    nb = 0.5 * (e(f0 * 2 ** (-1 / 12)) + e(f0 * 2 ** (1 / 12)))
    return 10 * np.log10(e(f0) / (nb + 1e-20) + 1e-20)


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


def main():
    meta = json.load(open(os.path.join(OUT, 'timing.json')))
    MOTIF = meta['MOTIF']
    logo, _ = sf.read(os.path.join(OUT, 'logo.wav'))
    files = ['logo.wav', 'motif.wav', 'demo-hopeful.wav', 'demo-playful.wav', 'demo-stark.wav',
             'sfx/type-tick.wav', 'sfx/change.wav', 'sfx/arrive.wav', 'sfx/strike.wav']
    say('FILE                 len s   LUFS   dBTP  clip  first/last sample   spikes  L/R corr  side/mid dB  mono loss dB')
    for fn in files:
        x, sr = sf.read(os.path.join(OUT, fn))
        assert sr == SR and x.ndim == 2
        clip = int((np.abs(x) >= 0.9999).sum())
        fi, la, sp = clicks(x)
        c, sm, ml = stereo(x)
        say(f'{fn:20s} {len(x) / SR:5.2f} {lufs(x):7.2f} {tp_db(x):6.2f} {clip:5d}   {fi:.1e}/{la:.1e}    {sp:5d}   {c:6.2f}   {sm:8.1f}   {ml:8.2f}')
    say()
    say('SPECTRUM (share of total energy, dB; mono sum)')
    for fn in files[:5]:
        x, _ = sf.read(os.path.join(OUT, fn))
        say(f'{fn:20s} ' + '  '.join(f'{k} {v:6.1f}' for k, v in bands(x).items()))
    # reference: pink noise (equal energy per octave) and a 'typical modern mix' slope
    rng = np.random.default_rng(0)
    w = np.fft.rfft(rng.standard_normal(SR * 10))
    fr = np.fft.rfftfreq(SR * 10, 1 / SR)
    pink = np.fft.irfft(w / np.sqrt(np.maximum(fr, 20)))
    say(f'{"(pink noise ref)":20s} ' + '  '.join(f'{k} {v:6.1f}' for k, v in bands(np.stack([pink, pink], 1)).items()))
    say()
    say('LOUDNESS OVER TIME (short-term LUFS, 3 s windows): narration space should sit lower than the payoff')
    meter = pyln.Meter(SR)
    for fn in ('demo-hopeful.wav', 'demo-playful.wav', 'demo-stark.wav'):
        x, _ = sf.read(os.path.join(OUT, fn))
        vals = []
        for a in np.arange(0, len(x) / SR - 2.99, 3.0):
            seg = x[int(a * SR):int((a + 3) * SR)]
            vals.append(f'{a:4.0f}s {meter.integrated_loudness(seg):6.1f}')
        say(f'  {fn:18s} ' + ' | '.join(vals))
    x, _ = sf.read(os.path.join(OUT, 'demo-hopeful.wav'))
    for lab, a, b in (('narration bars 1-6 (0-16.5 s)', 0, 16.5), ('payoff bars 7-10 (16.5-27.5 s)', 16.5, 27.5)):
        bd = bands(x[int(a * SR):int(b * SR)])
        say(f'  hopeful {lab}: voice band 1-4k share {bd["mid 1-4k"]:6.1f} dB')
    say()
    say('MOTIF PRESENCE: each motif note\'s pitch salience vs its semitone neighbours (dB, >0 = the note is there)')
    for fn, key in (('motif.wav', 'motif'), ('demo-hopeful.wav', 'demo-hopeful'),
                    ('demo-playful.wav', 'demo-playful'), ('demo-stark.wav', 'demo-stark')):
        x, _ = sf.read(os.path.join(OUT, fn))
        mono = x.mean(axis=1)
        m = meta[key]
        for t0 in m['motif_at']:
            sal = [salience(mono, t0 + s * m['beat'], mtof(n), min(0.3, l * m['beat'] - 0.03)) for n, s, l in MOTIF]
            say(f'  {fn:18s} motif at {t0:6.2f}s: ' + ' '.join(f'{v:5.1f}' for v in sal) + f'   min {min(sal):.1f}')
        if 'logo_at' in m:
            T = m['logo_at']
            sal = [salience(mono, T + dt, mtof(n), 0.09 if i < 3 else 0.3)
                   for i, (n, dt) in enumerate(zip([69, 74, 76, 81], [0, .11, .22, .36]))]
            say(f'  {fn:18s} logo head at {T:5.2f}s: ' + ' '.join(f'{v:5.1f}' for v in sal))
    x = logo.mean(axis=1)
    sal = [salience(x, dt, mtof(n), 0.09 if i < 3 else 0.3) for i, (n, dt) in enumerate(zip([69, 74, 76, 81], [0, .11, .22, .36]))]
    say(f'  {"logo.wav":18s} logo head at  0.00s: ' + ' '.join(f'{v:5.1f}' for v in sal))
    say()
    say('LOGO IDENTITY: logo.wav fitted into each demo at its slot (gain 1.000 = same level; residual = the decaying band underneath)')
    for key in ('demo-hopeful', 'demo-playful', 'demo-stark'):
        x, _ = sf.read(os.path.join(OUT, key + '.wav'))
        a = int(round(meta[key]['logo_at'] * SR))
        seg = x[a:a + len(logo)]
        lg = logo[:len(seg)]
        g = (seg * lg).sum() / (lg * lg).sum()
        res = seg - lg
        rr = 10 * np.log10((res ** 2).sum() / (lg ** 2).sum())
        corr = np.corrcoef(seg.ravel(), lg.ravel())[0, 1]
        # residual over the logo's last second only: should be near silence
        k = int(1.0 * SR)
        rr2 = 20 * np.log10(np.abs(res[-k:]).max() + 1e-12)
        say(f'  {key:14s} gain {g:.4f}  corr {corr:.4f}  residual {rr:6.1f} dB vs logo; residual peak in last 1 s {rr2:6.1f} dBFS')
    say()
    x, _ = sf.read(os.path.join(OUT, 'demo-stark.wav'))
    TB = meta['demo-stark']['bright_at']
    for lab, a, b in (('deadpan 1.0-6.8 s', 1.0, 6.8), ('bright 7.0-9.3 s', 7.0, 9.3)):
        seg = x[int(a * SR):int(b * SR)]
        c, sm, _ = stereo(seg)
        bd = bands(seg)
        say(f'STARK {lab}: side/mid {sm:6.1f} dB, L/R corr {c:.2f}, air 8-16k {bd["air 8-16k"]:6.1f} dB, sub {bd["sub 40-80"]:6.1f} dB')
    with open(os.path.join(OUT, 'measurements.txt'), 'w') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
