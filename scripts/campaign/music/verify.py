#!/usr/bin/env python3
"""Objective checks (nobody can listen): loudness, peaks, length, clicks, DC, spectrum, stereo, onsets, harmony.
Usage: python verify.py [name ...]   (uses out/<name>.wav + out/<name>.map.json; also accepts a path to any wav)"""
import json, os, re, subprocess, sys
import numpy as np
import soundfile as sf
from scipy import signal
import dsp, song
from dsp import SR, BEAT, BAR

OUT = song.OUT


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def ebur(path):
    r = sh(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    txt = r.stderr.split('Summary:')[-1]
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', txt).group(1))
    TP = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', txt).group(1))
    return I, TP


def probe(path):
    r = sh(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,channels,bits_per_raw_sample,codec_name,duration', '-of', 'json', path])
    return json.loads(r.stdout)['streams'][0]


def onset_near(x, t, rel=0.10):
    """Onset time near t on a signal. env = |x| (30 Hz+) smoothed 0.5 ms. baseline = loudest value in
    [t-25ms, t-10ms] (ring/pad already sounding). Onset = first moment in [t-10ms, t+30ms] where env exceeds BOTH
    2.5x baseline and `rel` of the peak reached in [t, t+30ms]. NaN if nothing stands out."""
    xm = x.mean(axis=1) if x.ndim == 2 else x
    m = hp(xm, 30)
    env = np.convolve(np.abs(m), np.ones(24) / 24, mode='same')
    a = lambda s: int(round((t + s) * SR))
    base = env[a(-0.025):a(-0.010)].max()
    pk = env[a(0):a(0.030)].max()
    seg = env[a(-0.010):a(0.030)]
    hit = seg > max(2.5 * base, rel * pk)
    if not hit.any(): return float('nan')
    return (a(-0.010) + int(np.argmax(hit))) / SR


def hp(x, fc):
    return dsp.hp(x, fc)


def check(name, path=None, mp=None, quiet=False):
    path = path or os.path.join(OUT, name + '.wav')
    mp = mp or json.load(open(os.path.join(OUT, name + '.map.json')))
    x, sr = sf.read(path, dtype='float64')
    pr = probe(path)
    I, TP = ebur(path)
    L = mp['length']
    ok = True
    def flag(c, msg):
        nonlocal ok
        if not c: ok = False
        return ('PASS ' if c else 'FAIL ') + msg
    lines = [f"=== {name}"]
    lines.append(flag(abs(I + 14) <= 0.5, f"integrated {I:.2f} LUFS (target -14 +-0.5)"))
    lines.append(flag(TP <= -1.0, f"true peak {TP:.2f} dBTP (<= -1.0)  [ffmpeg ebur128]"))
    dur = float(pr['duration'])
    lines.append(flag(len(x) == round(L * SR) and abs(dur - L) < 1e-4 and int(pr['sample_rate']) == 48000 and pr['channels'] == 2,
                      f"length {len(x)} samples = {len(x)/SR:.4f}s (want {L}), {pr['sample_rate']} Hz, {pr['channels']} ch, {pr.get('bits_per_raw_sample')} bit {pr['codec_name']}"))
    lines.append(flag(np.abs(x).max() < 0.999, f"sample peak {20*np.log10(np.abs(x).max()):.2f} dBFS (no clipping)"))
    lines.append(flag(np.abs(x.mean(axis=0)).max() < 1e-4, f"DC offset {np.abs(x.mean(axis=0)).max():.2e}"))
    # silence at both ends
    first, last = np.abs(x[:3]).max(), np.abs(x[-int(0.35 * SR):]).max()
    lines.append(flag(first < 1e-3 and last < 1e-5, f"starts at {first:.1e}, last 0.35 s peak {last:.1e}"))
    # clicks: biggest sample-to-sample jump overall vs typical, and around section boundaries
    dif = np.abs(np.diff(x, axis=0)).max(axis=1)
    typ = np.percentile(dif, 99.9)
    jmax = dif.max()
    # click = a spike in the 2nd difference far above the local level (smooth loud tones are not clicks)
    d2 = np.abs(np.diff(x.mean(axis=1), 2))
    from scipy.ndimage import uniform_filter1d
    loc = np.sqrt(uniform_filter1d(d2 ** 2, 2401)) + 1e-5
    ratio = d2 / loc
    # note attacks legitimately start from near-silence; ignore the first 5 ms of the file
    ratio[:240] = 0
    ri = int(np.argmax(ratio))
    lines.append(flag(ratio.max() < 30, f"click metric (2nd-diff spike / local level) max {ratio.max():.1f} at {ri/SR:.3f}s; raw max jump {jmax:.3f} (smooth loud tone, not a click)"))
    bj = []  # boundary jumps
    for s in mp['sections']:
        i = int(round(s['start'] * SR))
        if 0 < i < len(x) - 5:
            bj.append((s['kind'], float(dif[max(0, i - 48):i + 48].max())))
    lines.append("     boundary max jumps: " + ', '.join(f"{k}@{j:.4f}" for k, j in bj))
    lines.append(flag(all(j < 0.05 for _, j in bj), "no boundary click (<0.05)"))
    # spectrum: band energy share
    sp = np.abs(np.fft.rfft(x.mean(axis=1) * np.hanning(len(x)))) ** 2
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    tot = sp.sum()
    def band(a, b): return 100 * sp[(fr >= a) & (fr < b)].sum() / tot
    b = dict(sub=band(0, 60), low=band(60, 100), core=band(100, 4000), hi=band(4000, 8000), air=band(8000, 24000))
    lines.append(flag(b['sub'] < 12 and b['core'] > 70 and b['air'] < 1.0,
                      "energy %: <60Hz {sub:.1f} | 60-100 {low:.1f} | 100-4k {core:.1f} | 4-8k {hi:.2f} | >8k {air:.3f}".format(**b)))
    # stereo correlation
    c = np.corrcoef(x[:, 0], x[:, 1])[0, 1]
    cs = []
    for s in mp['sections']:
        a, e = int(s['start'] * SR), int(s['end'] * SR)
        if e - a > SR: cs.append(float(np.corrcoef(x[a:e, 0], x[a:e, 1])[0, 1]))
    lines.append(flag(c > 0.3 and min(cs) > 0.1, f"stereo correlation overall {c:.2f}, per-section min {min(cs):.2f} (positive = mono-safe)"))
    # onsets at bar downbeats. Measured on the re-rendered stems (the build is deterministic): the piano/kick
    # stems carry the rhythmic attacks; the pad swells slowly by design and is excluded.
    length_, form = song.FORMS[name]
    secs = song.sections_from_form(length_, form)
    _, sc_, _, stems = song.build(name, outdir=os.path.join(OUT, '.verify_tmp'), verbose=False)
    import piano as pianomod
    rows = []
    for s in secs:
        if s['kind'] in ('pulse', 'peak'):
            ts = [s['start'] + i * BAR for i in range(int(s['bars']))]
        elif s['kind'] in ('bloom', 'end'):
            ts = [s['start']]
        else:
            ts = []
        for t in ts:
            if t < 0.05: continue    # file start: nothing precedes it to measure a rise against
            # piano: sum ONLY the notes the score starts on this downbeat, laid into silence, so ring from the
            # previous bar cannot hide the attack
            evs = [p for p in sc_.piano if abs(p['t'] - t) < 1e-6]
            cache = pianomod.render({(p['midi'], p['vel'], round(p['d'], 3)) for p in evs})
            iso = np.zeros((int(0.3 * SR), 2))
            for p in evs:
                sg = cache[(p['midi'], p['vel'], round(p['d'], 3))][:int(0.15 * SR)]
                iso[int(0.1 * SR):int(0.1 * SR) + len(sg)] += sg
            e_p = onset_near(iso, 0.1) - 0.1 if evs else float('nan')
            e_k = (onset_near(stems['kick'], t) - t) if s['kind'] in ('pulse', 'peak') else float('nan')
            e_m = onset_near(x, t) - t
            rows.append((s['kind'], t, e_p, e_k, e_m))
    def mx(i): return max((abs(r[i]) for r in rows if r[i] == r[i]), default=0.0)
    lines.append(flag(mx(2) <= 0.005 and mx(3) <= 0.005,
                      f"downbeat onset error vs map: piano max {mx(2)*1000:.1f} ms, kick max {mx(3)*1000:.1f} ms over {len(rows)} bar starts (<=5 ms)"))
    lines.append(f"     (full mix, informational — loud overlaps can mask the first ms: max {mx(4)*1000:.1f} ms)")
    ok_ = ok
    if not quiet:
        print('\n'.join(lines))
    return ok_, dict(I=I, TP=TP, dur=dur, lines=lines)


def spectrogram(name):
    p = os.path.join(OUT, name + '.wav')
    sh(['ffmpeg', '-y', '-v', 'error', '-i', p, '-lavfi', 'showspectrumpic=s=1800x640:legend=1:fscale=log:scale=log:stop=16000:color=intensity', os.path.join(OUT, name + '.spectrogram.png')])


if __name__ == '__main__':
    names = sys.argv[1:] or list(song.FORMS)
    allok = True
    for n in names:
        ok, _ = check(n)
        spectrogram(n)
        allok &= ok
    print('\nALL PASS' if allok else '\nSOME CHECKS FAILED')
    sys.exit(0 if allok else 1)
