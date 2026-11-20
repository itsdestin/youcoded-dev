#!/usr/bin/env python3
"""Measurements for the round-three brand sound (nobody can listen, so everything is measured):
loudness (ffmpeg EBU R128: integrated, true peak, loudness range), length/format, spectrum balance by band,
low-end and air shares, stereo width and mono safety, where each hit's attack really lands, clean ending,
discontinuity (click) scan, and for the narrated fairytale the voice-over-music margin per phrase.
Usage: python bs_verify.py              (palette + the three film mixes)
       python bs_verify.py <path> ...   (any wav in out/)"""
import json, os, re, subprocess, sys
import numpy as np
import soundfile as sf
from scipy import signal
import dsp
from dsp import SR
from r2_verify import onset

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')


def ebur(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    txt = r.stderr.split('Summary:')[-1]
    g = lambda pat: float(re.search(pat, txt).group(1))
    return g(r'I:\s+(-?[\d.]+) LUFS'), g(r'Peak:\s+(-?[\d.]+) dBFS'), g(r'LRA:\s+([\d.]+) LU')


def momentary(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    rows = re.findall(r't:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+|-inf)', r.stderr) or re.findall(r't:\s*([\d.]+)\s+M:\s*(-?[\d.]+|-inf)', r.stderr)
    return [(float(a), float(b) if b != '-inf' else -120.0) for a, b in rows]


def bands(x):
    f, p = signal.welch(x.mean(axis=1), SR, nperseg=8192)
    B = [(20, 60), (60, 250), (250, 500), (500, 2000), (2000, 6000), (6000, 12000), (12000, 20000)]
    tot = p.sum()
    return [(a, b, 100 * p[(f >= a) & (f < b)].sum() / tot) for a, b in B]


def stereo_stats(x):
    mid, side = x.mean(axis=1), (x[:, 0] - x[:, 1]) / 2
    corr = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
    s_m = 20 * np.log10(np.sqrt((side ** 2).mean()) / (np.sqrt((mid ** 2).mean()) + 1e-12) + 1e-12)
    # low end should be mono: side energy below 120 Hz relative to mid below 120 Hz
    lo_side = 20 * np.log10(np.sqrt((dsp.lp(side, 120, 4) ** 2).mean()) / (np.sqrt((dsp.lp(mid, 120, 4) ** 2).mean()) + 1e-12) + 1e-12)
    return corr, s_m, lo_side


def clicks(x, floor_db=-50.0, ratio=10.0):
    """Digital clicks: a discontinuity is broadband up to 24 kHz, while every instrument here is rolled off by
    ~15 kHz. So look above 17 kHz for a spike that is both audible (> floor_db) and 10x the 20 ms RMS around it.
    WHY not a sample-jump test: a sharp (but clean) piano or drum attack after silence is a big jump too, and
    the first version of this check flagged hundreds of those."""
    from scipy import signal as sg
    sos = sg.butter(8, 17000, 'high', fs=SR, output='sos')
    h = np.abs(sg.sosfilt(sos, x, axis=0)).max(axis=1)
    k = int(0.02 * SR)
    rms = np.sqrt(np.convolve(h ** 2, np.ones(k) / k, mode='same')) + 1e-12
    bad = np.where((h > 10 ** (floor_db / 20)) & (h > ratio * rms))[0]
    out, last = [], -1
    for j in bad:
        if j - last > int(0.01 * SR):
            out.append(round(float(j) / SR, 3))
        last = j
    return out[:12]


def report(path, hits=(), end=None, name=None, music_stem=None):
    x, sr = sf.read(path, dtype='float64', always_2d=True)
    I, TP, LRA = ebur(path)
    L = len(x) / SR
    name = name or os.path.basename(path)
    pk = 20 * np.log10(np.abs(x).max() + 1e-12)
    rep = [f'=== {name}',
           f'  {I:.2f} LUFS | true peak {TP:.2f} dBTP | LRA {LRA:.1f} LU | PLR {TP - I:.1f} dB | {L:.3f} s @ {sr} x{x.shape[1]}'
           f"  {'PASS' if abs(I + 14) <= 0.5 and TP <= -1.0 and sr == SR else 'FAIL'}"]
    rep.append('  spectrum %: ' + '  '.join(f'{a}-{b}:{v:.1f}' for a, b, v in bands(x)))
    c, sm, ls = stereo_stats(x)
    rep.append(f'  stereo: L/R correlation {c:.2f}, side {sm:.1f} dB vs mid, low-end side {ls:.1f} dB (mono-safe < -20)')
    lvl = np.convolve(np.abs(x.mean(axis=1)), np.ones(480) / 480, mode='same')
    loud = np.where(lvl > 10 ** (-60 / 20))[0]
    last = loud[-1] / SR if len(loud) else 0
    rep.append(f'  ending: last sound above -60 dBFS at {last:.2f} s' + (f' (deadline {end})' + (' OK' if last <= end + 1e-3 else ' LATE') if end else '')
               + f'; last sample {x[-1].max():.1e}')
    cl = clicks(x)
    rep.append(f"  clicks: {'none' if not cl else cl}")
    if hits:
        xh = sf.read(music_stem, dtype='float64', always_2d=True)[0] if music_stem else x
        rows = [(t, *onset(xh, t)) for t in hits if t > 0.02]
        good = [r for r in rows if r[1] == r[1]]
        errs = [abs(r[1]) for r in good]
        rep.append(f"  hits: {len(good)}/{len(rows)} detected, max |error| {1000 * max(errs, default=0):.1f} ms"
                   + ('  OK' if errs and max(errs) <= 0.015 else ''))
        rep.append('   ' + ' '.join(f"{t:.2f}:{'%+.0fms' % (1000 * e) if e == e else 'n/a'}({r:.0f}dB)" for t, e, r in rows))
    M = momentary(path)
    step = 2 if L > 30 else 1
    rep.append(f'  momentary LUFS every {step} s: ' + ' '.join(f'{v:.0f}' for t, v in M if int(round(t * 10)) % (10 * step) == 0 and t > 0.05))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', path, '-lavfi', 'showspectrumpic=s=1600x560:legend=1:fscale=log:scale=log:stop=16000:color=intensity',
                    path[:-4] + '.spectrogram.png'])
    print('\n'.join(rep))
    return dict(I=I, TP=TP, LRA=LRA, last=last)


def voice_margins(voice_path, music_path, words, gap=0.35):
    """Per phrase: narrator loudness minus music loudness (LU), both measured on the final-gain stems."""
    import pyloudnorm as pyln
    v = sf.read(voice_path, dtype='float64', always_2d=True)[0]
    mu = sf.read(music_path, dtype='float64', always_2d=True)[0]
    ph = []
    for w in words:
        if ph and w['start'] - ph[-1][1] < gap:
            ph[-1][1] = w['end']; ph[-1][2] += ' ' + w['w']
        else:
            ph.append([w['start'], w['end'], w['w']])
    meter = pyln.Meter(SR, block_size=0.2)
    rows = []
    for a, b, txt in ph:
        if b - a < 0.45:
            continue
        i, j = int(a * SR), int(b * SR)
        lv, lm = meter.integrated_loudness(v[i:j]), meter.integrated_loudness(mu[i:j])
        rows.append((a, b, lv, lm, lv - lm, txt))
    return rows


def stem_levels(stems, gain=1.0):
    """Loudness of each processed stem (LUFS at the given final gain) — what is actually carrying the mix."""
    out = {}
    for k, x in stems.items():
        if np.any(x):
            v = dsp.lufs(x * gain)
            if np.isfinite(v):
                out[k] = round(float(v), 1)
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        args = sorted(os.path.join(OUT, 'palette', f) for f in os.listdir(os.path.join(OUT, 'palette')) if f.endswith('.wav'))
    for a in args:
        report(a if os.path.isabs(a) else os.path.join(OUT, a))
