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
# required section starts per cut (picture edit 2026-11-18); kind, seconds
EXPECTED_STARTS = {
    'hero60': [('rent', 0.0), ('breath', 9.6), ('ask', 12.0), ('bloom', 14.4), ('pulse', 21.6), ('peak', 36.0), ('stance', 48.0), ('end', 55.2)],
    'hero30': [('rent', 0.0), ('ask', 4.8), ('bloom', 7.2), ('pulse', 12.0), ('peak', 16.8), ('stance', 21.6), ('end', 26.4)],
    'short15a': [('ask', 0.0), ('bloom', 2.4), ('stance', 7.2), ('stance', 9.6), ('end', 12.0)],
    'short15b': [('pulse', 0.0), ('peak', 4.8), ('stance', 7.2), ('end', 12.0)],
    'short15c': [('rent', 0.0), ('bloom', 4.8), ('pulse', 7.2), ('end', 12.0)],
    'short20': [('rent', 0.0), ('bloom', 4.8), ('pulse', 7.2), ('stance', 12.0), ('end', 16.8)],
}


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
    # WHY: the ending now rings naturally and only fades in the last ~0.15 s, so only the final 10 ms must be silent;
    # and the opening ramps over 15 ms, so sample 0 is silent and the first 15 ms stay well below full level.
    first, last = np.abs(x[:3]).max(), np.abs(x[-int(0.01 * SR):]).max()
    lines.append(flag(first < 1e-3 and last < 2e-3 and x[-1].max() == 0, f"starts at {first:.1e}, last 10 ms peak {last:.1e}, last sample {np.abs(x[-1]).max():.1e}"))
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
    # WHY: the piano is now played brighter (real upper harmonics), so a normal hammer attack has a larger raw
    # sample-to-sample jump than the old dull one. A raw jump over 0.05 is therefore only a click if it is ALSO a
    # sharp spike against the local level (the same 2nd-difference metric used above, limit 12 here).
    rb = []
    for s_ in mp['sections']:
        i_ = int(round(s_['start'] * SR))
        if 0 < i_ < len(x) - 5: rb.append(float(ratio[max(0, i_ - 48):i_ + 48].max()))
    lines.append("     boundary spike ratios: " + ', '.join(f"{r:.1f}" for r in rb))
    lines.append(flag(all(j < 0.05 or r < 12 for (_, j), r in zip(bj, rb)), "no boundary click (raw jump <0.05, or spike ratio <12)"))
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
            # WHY: interior notes are deliberately humanised (+-12 ms), so measure against each note's intended time
            # (tj); section starts are exact (tj == t) so those are held to the same 5 ms as before.
            shift = min((p['tj'] - t for p in evs), default=0.0)
            cache = pianomod.render({(p['midi'], p['veff'], round(p['d'], 3)) for p in evs})
            iso = np.zeros((int(0.3 * SR), 2))
            for p in evs:
                sg = cache[(p['midi'], p['veff'], round(p['d'], 3))][:int(0.15 * SR)]
                o_ = int((0.1 + p['tj'] - t) * SR)
                iso[o_:o_ + len(sg)] += sg
            e_p = onset_near(iso, 0.1 + shift) - 0.1 - shift if evs else float('nan')
            e_k = (onset_near(stems['kick'], t) - t) if s['kind'] in ('pulse', 'peak') else float('nan')
            e_m = onset_near(x, t) - t - shift
            rows.append((s['kind'], t, e_p, e_k, e_m))
    def mx(i): return max((abs(r[i]) for r in rows if r[i] == r[i]), default=0.0)
    lines.append(flag(mx(2) <= 0.005 and mx(3) <= 0.005,
                      f"downbeat onset error vs map: piano max {mx(2)*1000:.1f} ms, kick max {mx(3)*1000:.1f} ms over {len(rows)} bar starts (<=5 ms)"))
    lines.append(f"     (full mix, informational — loud overlaps can mask the first ms: max {mx(4)*1000:.1f} ms)")
    # --- picture-edit checks: section starts, end chord on its bar line, tone, balance, ending
    want = EXPECTED_STARTS.get(name)
    if want:
        got = [(s_['kind'], round(s_['start'], 3)) for s_ in mp['sections']]
        lines.append(flag(got == want, f"section starts in map {got} == required {want}"))
    rel, cen = band_table(x)
    lines.append(flag(rel[4] > -12.5 and rel[5] > -21.5 and rel[1] < 3.0,
                      f"tone vs 500-1k: 250-500 {rel[1]:+.1f} dB (<3), 2-4k {rel[4]:+.1f} (>-12.5), 4-8k {rel[5]:+.1f} (>-21.5); was about +4 / -18 / -29"))
    bal = 20 * np.log10(np.sqrt((x[:, 0] ** 2).mean()) / np.sqrt((x[:, 1] ** 2).mean()))
    lines.append(flag(abs(bal) <= 0.3, f"L/R balance {bal:+.2f} dB (within 0.3)"))
    e0 = mp['sections'][-1]['start']
    xm = x.mean(axis=1)
    def rms_at(t_):
        i_ = int(t_ * SR)
        w_ = xm[max(0, i_ - int(0.05 * SR)):i_ + int(0.05 * SR)]
        return 20 * np.log10(np.sqrt((w_ ** 2).mean()) + 1e-12)
    pk0 = max(rms_at(e0 + d_) for d_ in (0.0, 0.1, 0.2))
    t_end = L - 0.5
    lines.append(flag(rms_at(t_end) - pk0 > -30, f"end chord still ringing 0.5 s before the end: {rms_at(t_end) - pk0:+.1f} dB vs the chord (> -30)"))
    ok_ = ok
    if not quiet:
        print('\n'.join(lines))
    return ok_, dict(I=I, TP=TP, dur=dur, lines=lines)


# ----------------------------------------------------------------------------- tone / level report
# WHY: nobody can listen, so tone, level steps, endings and L/R balance are reported as numbers.
BANDS = [(20, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 20000)]


def band_table(x):
    """Energy per band in dB relative to the 500-1k band, plus spectral centroid (Hz)."""
    xm = x.mean(axis=1) if x.ndim == 2 else x
    f, pxx = signal.welch(xm, SR, nperseg=8192)
    e = [pxx[(f >= a) & (f < b)].sum() for a, b in BANDS]
    ref = e[2]
    rel = [10 * np.log10(v / ref + 1e-12) for v in e]
    cen = float((f * pxx).sum() / pxx.sum())
    return rel, cen


def momentary(path):
    """[(t, M LUFS)] every 0.1 s from ffmpeg ebur128."""
    r = sh(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'])
    rows = re.findall(r't:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+|-inf)', r.stderr)
    if not rows:
        rows = re.findall(r't:\s*([\d.]+)\s+M:\s*(-?[\d.]+|-inf)', r.stderr)
    return [(float(a), float(b) if b != '-inf' else -120.0) for a, b in rows]


def level_report(name, path, mp):
    x, _ = sf.read(path, dtype='float64')
    rel, cen = band_table(x)
    M = momentary(path)
    def avg(a, b):
        v = [m for t, m in M if a <= t < b]
        return float(10 * np.log10(np.mean([10 ** (m / 10) for m in v]))) if v else float('nan')
    secs = mp['sections']
    out = [f"--- {name}  L={mp['length']}s"]
    out.append("   sections: " + ' | '.join(f"{s['kind']} {s['start']:.1f}" for s in secs))
    out.append("   bands dB vs 500-1k: " + ' '.join(f"{a}-{b}:{v:+.1f}" for (a, b), v in zip(BANDS, rel)) + f"  centroid {cen:.0f} Hz")
    rmsL, rmsR = np.sqrt((x[:, 0] ** 2).mean()), np.sqrt((x[:, 1] ** 2).mean())
    out.append(f"   L/R balance: {20*np.log10(rmsL/rmsR):+.2f} dB (L minus R)")
    # intro vs body: mean momentary loudness of the opening bed vs the body sections
    first = secs[0]
    if first['kind'] == 'rent':
        bl = next((s for s in secs if s['kind'] == 'bloom'), None)
        body = [s for s in secs if s['kind'] in ('pulse', 'peak')]
        rent = avg(1.0, first['end'])
        bodyL = avg(body[0]['start'] + 1, body[-1]['end']) if body else float('nan')
        pre = avg(bl['start'] - 1.2, bl['start'] - 0.2) if bl else float('nan')
        post = avg(bl['start'] + 0.6, bl['start'] + 2.2) if bl else float('nan')
        out.append(f"   intro(rent) {rent:.1f} LUFS-M | body {bodyL:.1f} | rent->body step {bodyL-rent:.1f} dB | bloom jump (1 s before -> 0.6-2.2 s after) {post-pre:+.1f} dB")
    e0 = secs[-1]['start']
    xm = x.mean(axis=1)
    def rms_at(t):
        i = int(t * SR)
        w = xm[max(0, i - int(0.05 * SR)):i + int(0.05 * SR)]
        return 20 * np.log10(np.sqrt((w ** 2).mean()) + 1e-12) if len(w) else float('nan')
    pk0 = max(rms_at(e0 + d) for d in (0.0, 0.1, 0.2))
    tail = ' '.join(f"+{d:.0f}s:{rms_at(e0 + d) - pk0:+.1f}dB" if e0 + d < mp['length'] - 0.001 else f"+{d:.0f}s:n/a" for d in (1, 2, 3))
    out.append(f"   end chord at {e0:.1f}s (rms dBFS {pk0:.1f}); level relative to chord: {tail}; last 0.25 s peak {np.abs(x[-int(0.25*SR):]).max():.1e}, last 10 ms {np.abs(x[-int(0.01*SR):]).max():.1e}")
    out.append(f"   first sample {np.abs(x[0]).max():.1e}, max in first 15 ms {np.abs(x[:int(0.015*SR)]).max():.3f}")
    return '\n'.join(out)


def spectrogram(name):
    p = os.path.join(OUT, name + '.wav')
    sh(['ffmpeg', '-y', '-v', 'error', '-i', p, '-lavfi', 'showspectrumpic=s=1800x640:legend=1:fscale=log:scale=log:stop=16000:color=intensity', os.path.join(OUT, name + '.spectrogram.png')])


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--report':
        # python verify.py --report <dir> [names]: tone/level report for every <name>.wav + <name>.map.json in <dir>
        for n in sys.argv[3:] or list(song.FORMS):
            print(level_report(n, os.path.join(sys.argv[2], n + '.wav'), json.load(open(os.path.join(sys.argv[2], n + '.map.json')))))
        sys.exit(0)
    names = sys.argv[1:] or list(song.FORMS)
    allok = True
    for n in names:
        ok, _ = check(n)
        spectrogram(n)
        allok &= ok
    print('\nALL PASS' if allok else '\nSOME CHECKS FAILED')
    sys.exit(0 if allok else 1)
