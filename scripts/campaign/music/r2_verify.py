#!/usr/bin/env python3
"""Objective checks for the round-two mixes (nobody can listen): ffmpeg loudness + true peak, length, clipping,
spectrum balance (is anything above 4 kHz?), where each hit's attack actually lands, clean ending, spectrogram.
Usage: python r2_verify.py            (all round-two mixes in out/)
       python r2_verify.py <name> ... (e.g. take2-mix)"""
import json, os, re, subprocess, sys
import numpy as np
import soundfile as sf
from scipy import signal
import dsp
from dsp import SR

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
WORDS1 = os.path.join(HERE, '..', 'film', 'src', 'round2', 'take1-words-lily.json')

# expected lengths, clean-end deadlines and hit times per mix
B2 = 2.0
SPEC = {
    'take1-mix':      dict(L=77.0, end=76.5, hits=[3.71, 23.55, 24.9, 37.4, 38.9, 50.9, 62.1, 66.1, 70.32]),
    'take1-type-mix': dict(L=77.0, end=76.5, hits=[3.71, 23.55, 24.9, 37.4, 38.9, 50.9, 62.1, 66.1, 70.32]),
    'take1-mix-alt':  dict(L=77.0, end=76.5, hits=[3.71, 23.55, 24.9, 37.4, 38.9, 50.9, 62.1, 66.1, 70.32]),
    'take2-mix':      dict(L=60.0, end=59.6, hits=[i * B2 for i in range(29)]),
    'take2-mix-alt':  dict(L=60.0, end=59.6, hits=[i * B2 for i in range(29)]),
    'take3-mix':      dict(L=24.0, end=23.6, hits=[0.0, 9.6, 12.0, 14.4, 16.8, 19.2]),
    'take3-mix-alt':  dict(L=24.0, end=23.6, hits=[0.0, 9.6, 12.0, 14.4, 16.8, 19.2]),
}


def ebur(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    txt = r.stderr.split('Summary:')[-1]
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', txt).group(1)), float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', txt).group(1))


def momentary(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    rows = re.findall(r't:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+|-inf)', r.stderr) or re.findall(r't:\s*([\d.]+)\s+M:\s*(-?[\d.]+|-inf)', r.stderr)
    return [(float(a), float(b) if b != '-inf' else -120.0) for a, b in rows]


def onset(x, t):
    """Where the attack near t really starts. WHY this method: the envelope (high-passed 80 Hz, 1 ms smoothing)
    is compared with what was already sounding 30-12 ms before t; the onset is the first sample in [t-12, t+40] ms
    that rises above 2x that baseline AND 25% of the local peak. Returns (onset error s, rise dB) or (nan, rise)."""
    xm = x.mean(axis=1)
    # WHY 1.2 kHz high-pass: the click of a kick/snare/piano hammer is what the ear locks a cut to; low notes
    # ringing from the bar before would otherwise mask the rise and smear the measurement
    e = np.convolve(np.abs(dsp.hp(xm, 1200, 4)), np.ones(24) / 24, mode='same')
    a = lambda s: int(round((t + s) * SR))
    lo = max(0, a(-0.030))
    base = e[lo:max(lo + 1, a(-0.012))].max() if t > 0.03 else 1e-6
    seg = e[max(0, a(-0.012)):a(0.040)]
    pk = seg.max()
    rise = 20 * np.log10((pk + 1e-9) / (base + 1e-9))
    hit = seg > max(2.0 * base, 0.25 * pk)
    if not hit.any() or rise < 3:
        return float('nan'), rise
    return (max(0, a(-0.012)) + int(np.argmax(hit))) / SR - t, rise


def bands(x):
    f, p = signal.welch(x.mean(axis=1), SR, nperseg=8192)
    B = [(20, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 16000)]
    e = [p[(f >= a) & (f < b)].sum() for a, b in B]
    rel = [10 * np.log10(v / e[2] + 1e-12) for v in e]
    share4k = 100 * p[f >= 4000].sum() / p.sum()
    return rel, share4k


def check(name, quiet=False):
    sp = SPEC[name]
    path = os.path.join(OUT, name + '.wav')
    x, sr = sf.read(path, dtype='float64')
    I, TP = ebur(path)
    L = len(x) / SR
    rep = [f'=== {name}']
    ok = abs(I + 14) <= 0.5 and TP <= -1.0 and abs(L - sp['L']) < 1e-6 and sr == 48000 and x.shape[1] == 2
    rep.append(f"  loudness {I:.2f} LUFS | true peak {TP:.2f} dBTP | {L:.3f} s @ {sr} Hz x{x.shape[1]} | sample peak {20*np.log10(np.abs(x).max()):.2f} dBFS  {'PASS' if ok else 'FAIL'}")
    rel, s4 = bands(x)
    rep.append('  bands dB vs 500-1k: ' + ' '.join(f'{v:+.1f}' for v in rel) + f'  (20-250,250-500,500-1k,1-2k,2-4k,4-8k,8-16k); energy above 4 kHz {s4:.1f}%')
    # ending: last moment louder than -60 dBFS
    lvl = np.convolve(np.abs(x.mean(axis=1)), np.ones(480) / 480, mode='same')
    loud = np.where(lvl > 10 ** (-60 / 20))[0]
    last = loud[-1] / SR if len(loud) else 0
    tail_db = 20 * np.log10(np.sqrt((x[int((sp['end'] - 1.0) * SR):int((sp['end'] - 0.5) * SR)] ** 2).mean()) + 1e-12)
    rep.append(f"  ending: last sound above -60 dBFS at {last:.2f} s (deadline {sp['end']}); level 1.0-0.5 s before deadline {tail_db:.1f} dBFS (still ringing, not cut)")
    rows = []
    # WHY: in the narrated mixes the voice sits on top of most hits, so hits are measured on the (ducked) music stem
    # written beside the mix at the same final gain
    stem = os.path.join(OUT, '.' + name + '.music.wav')
    xh = sf.read(stem, dtype='float64')[0] if os.path.exists(stem) else x
    for t in sp['hits']:
        if t < 0.02:
            continue
        err, rise = onset(xh, t)
        rows.append((t, err, rise))
    good = [r for r in rows if r[1] == r[1]]
    errs = [abs(r[1]) for r in good]
    rep.append(f"  hit onsets: {len(good)}/{len(rows)} detected, max |error| {1000*max(errs, default=0):.1f} ms, mean {1000*np.mean(errs) if errs else 0:.1f} ms")
    rep.append('   ' + ' '.join(f"{t:.2f}:{'%+.0fms' % (1000*e) if e == e else 'n/a'}({r:.0f}dB)" for t, e, r in rows))
    M = momentary(path)
    step = 2 if sp['L'] > 40 else 1
    rep.append(f'  momentary LUFS every {step} s from 0: ' + ' '.join(f'{m:.0f}' for t, m in M if int(round(t * 10)) % (10 * step) == 0 and t > 0.05))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', path, '-lavfi', 'showspectrumpic=s=1800x640:legend=1:fscale=log:scale=log:stop=16000:color=intensity',
                    os.path.join(OUT, name + '.spectrogram.png')])
    if not quiet:
        print('\n'.join(rep))
    return dict(I=I, TP=TP, L=L, hits=rows, last=last)


def voice_ratio(voice_path, music_path, words_path=WORDS1):
    """Voice-to-music level while the narrator speaks: K-weighted-ish (pyloudnorm) loudness of each stem over every
    phrase (words merged across gaps < 0.35 s). Returns list of (t0, t1, voice LUFS, music LUFS, ratio dB)."""
    import pyloudnorm as pyln
    v, _ = sf.read(voice_path, dtype='float64', always_2d=True)
    mu, _ = sf.read(music_path, dtype='float64', always_2d=True)
    words = json.load(open(words_path))
    words = words if isinstance(words, list) else words['words']
    ph = []
    for w in words:
        if ph and w['start'] - ph[-1][1] < 0.35:
            ph[-1][1] = w['end']
        else:
            ph.append([w['start'], w['end']])
    meter = pyln.Meter(SR, block_size=0.2)
    out = []
    for a, b in ph:
        if b - a < 0.45:
            continue
        i, j = int(a * SR), int(b * SR)
        lv, lm = meter.integrated_loudness(v[i:j]), meter.integrated_loudness(mu[i:j])
        out.append((a, b, lv, lm, lv - lm))
    return out


if __name__ == '__main__':
    names = sys.argv[1:] or [n for n in SPEC if os.path.exists(os.path.join(OUT, n + '.wav'))]
    for n in names:
        check(n)
