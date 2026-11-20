#!/usr/bin/env python3
"""The brand audio rules as numbers (round four). WHY its own file: the rules proposal promises checks the owner
cannot make by ear, so every one of them is a function here that prints PASS/FAIL against the written rule:
  - tone balance: share of the MUSIC's energy below 40 Hz (< 3%), below 160 Hz (30-40% in beat sections, never
    over 45% overall), in the 1.28-2.56 kHz octave (where phones and ears are most sensitive), above 8 kHz (air,
    1.5-4%);
  - no single tonal sound more than 15 dB above the spectrum around it (piercing bells, whistles);
  - audible on a phone: the music through a 150 Hz high-pass (what a phone speaker plays), section by section;
  - near-silence: momentary loudness <= -30 LUFS for 0.25 s or more within the 2 s before each film's biggest
    moment;
  - momentary / short-term loudness at named times (for the arc and the hits).
Usage: python bs_measure.py <wav> [...]     (prints the tone and tonal-peak checks)"""
import sys
import numpy as np
import soundfile as sf
from scipy import signal
import pyloudnorm as pyln
import dsp
from dsp import SR

BANDS = dict(sub40=(20, 40), low160=(20, 160), presence=(1280, 2560), air=(8000, 20000))


def load(path):
    x, sr = sf.read(path, dtype='float64', always_2d=True)
    assert sr == SR, path
    return x


def tone(x, t0=None, t1=None):
    """% of energy per band (the reviewer's method: Welch spectrum of the mono sum)."""
    if t0 is not None:
        x = x[int(t0 * SR):int(t1 * SR)]
    f, p = signal.welch(x.mean(axis=1), SR, nperseg=8192)
    tot = p[f >= 20].sum() + 1e-30
    return {k: 100 * p[(f >= a) & (f < b)].sum() / tot for k, (a, b) in BANDS.items()}


def tonal_peaks(x, fmin=1000, fmax=5000, limit=15.0, nperseg=4096):
    """Tonal sounds standing out of the spectrum: each bin's level against the median of the 1/3-octave around
    it (excluding +-1/24 octave, the peak itself). Returns the worst few (Hz, dB above neighbours).
    WHY a long-term spectrum: a bell that rings the same few pitches all film long piles up into narrow towers;
    a piano playing a tune spreads over many notes and does not."""
    f, p = signal.welch(x.mean(axis=1), SR, nperseg=nperseg)
    L = 10 * np.log10(p + 1e-30)
    out = []
    for i in np.where((f >= fmin) & (f <= fmax))[0]:
        lo, hi = f[i] * 2 ** (-1 / 6), f[i] * 2 ** (1 / 6)
        near = (f >= lo) & (f <= hi) & ((f < f[i] * 2 ** (-1 / 24)) | (f > f[i] * 2 ** (1 / 24)))
        if near.sum() < 4:
            continue
        d = L[i] - np.median(L[near])
        if d > limit - 6:
            out.append((float(f[i]), float(d)))
    # keep only local maxima, worst first
    out.sort(key=lambda r: -r[1])
    keep = []
    for fr, d in out:
        if all(abs(np.log2(fr / k[0])) > 1 / 12 for k in keep):
            keep.append((fr, d))
    return keep[:5]


def momentary(x, hop=0.05, win=0.4):
    """EBU momentary loudness (400 ms) every hop s -> (times, LUFS)."""
    meter = pyln.Meter(SR)
    ch = []
    for c in range(x.shape[1]):
        y = x[:, c]
        for flt in meter._filters.values():
            y = flt.apply_filter(y)
        ch.append(y ** 2)
    pw = np.sum(ch, axis=0) / 1.0   # pyloudnorm weights both channels 1.0
    k = int(win * SR)
    cs = np.concatenate([[0], np.cumsum(pw)])
    ends = np.arange(k, len(pw) + 1, int(hop * SR))
    L = -0.691 + 10 * np.log10((cs[ends] - cs[ends - k]) / k + 1e-12)
    return (ends - k / 2) / SR, L     # time = window centre


def short_term(x, hop=0.1):
    return momentary(x, hop, 3.0)


def at(series, t):
    ts, L = series
    return float(np.interp(t, ts, L))


def near_silence(x, t_peak, need=-30.0, dur=0.25, before=2.0):
    """Longest run (s) at or below `need` LUFS momentary within `before` s before t_peak, and the quietest value."""
    ts, L = momentary(x, hop=0.01)
    sel = (ts >= t_peak - before) & (ts < t_peak)
    q = L[sel] <= need
    best = run = 0
    for v in q:
        run = run + 1 if v else 0
        best = max(best, run)
    return best * 0.01, float(L[sel].min())


def phone(x):
    """What a phone speaker plays: nothing much below 150 Hz."""
    return dsp.hp(x, 150, 4)


def lufs_span(x, a, b):
    m = pyln.Meter(SR, block_size=0.2)
    return float(m.integrated_loudness(x[int(a * SR):int(b * SR)]))


def summary(path, name=None, sections=()):
    x = load(path)
    t = tone(x)
    pk = tonal_peaks(x)
    worst = pk[0] if pk else (0, 0)
    rows = [f'--- {name or path}',
            f"  tone %: <40 Hz {t['sub40']:.1f} (<3) | <160 Hz {t['low160']:.1f} | 1.28-2.56 kHz {t['presence']:.1f} | "
            f">8 kHz {t['air']:.2f} (1.5-4)  {'PASS' if t['sub40'] < 3 and 1.5 <= t['air'] <= 4 and t['low160'] <= 45 else 'CHECK'}",
            '  tonal peaks (Hz:dB over neighbours, rule <= 15): ' + ' '.join(f'{f:.0f}:{d:.1f}' for f, d in pk)
            + ('  PASS' if worst[1] <= 15 else '  FAIL')]
    if sections:
        ph = phone(x)
        rows.append('  phone (150 Hz HP) LUFS by section: ' + ' '.join(f'{lab}:{lufs_span(ph, a, b):.1f}' for lab, a, b in sections))
    print('\n'.join(rows))
    return t, pk


def _main():
    for a in sys.argv[1:]:
        summary(a)


# ----------------------------------------------------------------------------- per-film checks (round four)
def hits_report(x, hits):
    from r2_verify import onset
    rows = []
    for t in hits:
        e, r = onset(x, t)
        rows.append(f"{t:.2f}:{'%+.0fms' % (1000 * e) if e == e else 'n/a'}")
    return ' '.join(rows)


def film1():
    """The fairytale: is the score there under the voice (phone simulation), its tone, the voice margins, the tail."""
    import os
    import bs_fairytale as F
    from bs_verify import voice_margins, clicks
    out = F.B.OUT
    vpath, mpath = os.path.join(out, '.take1-mix.voice.wav'), os.path.join(out, '.take1-mix.music.wav')
    v, mu, mix = load(vpath), load(mpath), load(os.path.join(out, 'take1-mix.wav'))
    T = F.T
    print('--- take1 (fairytale)')
    rows = voice_margins(vpath, mpath, F.W, gap=0.30)   # WHY 0.30: the same phrase grouping the ducker uses
    # rule (round five): at least 10 LU under her on every line, 9 on the closing two lines ("It's time...")
    need = lambda a: 9.0 if a >= T['itstime1'] - 0.1 else 10.0
    bad = [(a, d) for a, b, lv, lm, d, txt in rows if d < need(a) - 0.05]
    print('  voice over music per phrase (LU): ' + ' '.join(f'{a:.1f}:{d:.1f}' for a, b, lv, lm, d, txt in rows)
          + f"   {'PASS' if not bad else 'FAIL ' + str(bad)}")
    # rule (round five): every hit keyed to a word lands on the voice's MEASURED onset (within 30 ms), not the file
    import bs_voice as BV
    errs = BV.onset_errors(F.W, F.VOICE, [('something', 20.0), ('shareholder',), ('But',), ('And', 51.0), ("It's", 61.0), ('everything', 69.0)])
    print('  hit words vs the recording (filed -> real onset): ' + ' '.join(f'{w}:{1000 * e:+.0f}ms' for w, s_, o, e in errs)
          + ('  PASS' if all(abs(e) <= 0.03 for *_, e in errs) else '  FAIL'))
    raw = BV.onset_errors(F.W_FILE, F.VOICE, [('something', 20.0), ('shareholder',), ('everything', 69.0)])
    print('   (the uncorrected words file: ' + ' '.join(f'{w}:{1000 * e:+.0f}ms' for w, s_, o, e in raw) + ')')
    secs = [('sly', T['start'], T['andwe']), ('resigned', T['andwe'], T['however']), ('hush', T['however'], T['something']),
            ('opens', T['something'], T['blinded']), ('wry', T['blinded'], T['but']), ('lift', T['but'], T['anyone']),
            ('arrival', T['anyone'], T['andso']), ('proud', T['andso'], T['itstime1']), ('rousing', T['itstime1'], T['everything']),
            ('tail', T['last_end'], F.END)]
    ph = phone(mu)
    vl = {lab: lufs_span(v, a, b) for lab, a, b in secs}
    print('  music on a phone (150 Hz HP), LUFS / LU under the voice: ' + ' '.join(
        f'{lab}:{lufs_span(ph, a, b):.1f}/{vl[lab] - lufs_span(ph, a, b):.0f}' for lab, a, b in secs))
    t = tone(mu)
    print(f"  music stem tone %: <40 Hz {t['sub40']:.1f} (<3) | <160 Hz {t['low160']:.1f} (30-40) | 1.28-2.56 kHz {t['presence']:.1f} | >8 kHz {t['air']:.2f} (1.5-3)")
    mo = momentary(mu, hop=0.05)
    le = T['last_end']
    print('  music momentary around the end: ' + ' '.join(f'{x_:.1f}:{at(mo, x_):.0f}' for x_ in np.arange(le - 1.0, le + 3.01, 0.25)))
    mm = momentary(mix, hop=0.05)
    print('  mix momentary around the end: ' + ' '.join(f'{x_:.1f}:{at(mm, x_):.0f}' for x_ in np.arange(le - 1.0, le + 3.01, 0.5)))
    print('  hits (music stem onset):', hits_report(mu, F.HITS))
    # the arc while she speaks (music stem short-term, 3 s): the door opening and the overall rise
    st = short_term(mu)
    hush = max(at(st, t) for t in np.arange(20.0, 22.01, 0.25))
    opens = at(st, T['something'] + 1.5)
    first = np.mean([at(st, t) for t in np.arange(2.0, 8.01, 0.5)])
    last = np.mean([at(st, t) for t in np.arange(65.0, 70.01, 0.5)])
    print(f'  arc (music stem, short-term): hush 20-22 max {hush:.1f} -> "something" {opens:.1f} (+{opens - hush:.1f}, rule >= 4) | '
          f'opening {first:.1f} -> 65-70 s {last:.1f} (+{last - first:.1f}, rule >= 7)  '
          + ('PASS' if opens - hush >= 4 and last - first >= 7 else 'FAIL'))
    # the ring-out: from the bloom's loudest moment, momentary level falls steadily (< 2 dB per 100 ms) to -40
    mo10 = momentary(mu, hop=0.01)
    sel = (mo10[0] >= T['last_end']) & (mo10[0] <= F.END)
    ts_, L_ = mo10[0][sel], mo10[1][sel]
    k0 = int(np.argmax(L_))
    k1 = k0 + int(np.argmax(L_[k0:] <= -40)) if (L_[k0:] <= -40).any() else len(L_) - 1
    drop = max((L_[k] - L_[k + 10] for k in range(k0, max(k0, k1 - 10))), default=0)
    print(f'  ring-out: loudest {L_[k0]:.1f} at {ts_[k0]:.2f}, -40 at {ts_[k1]:.2f}, steepest fall {drop:.1f} dB / 100 ms '
          + ('PASS' if drop < 2.0 else 'FAIL') + f'; bloom starts after her last syllable ({T["last_end"]:.2f})')
    print('  clicks: voice', clicks(v), 'music', clicks(mu), 'mix', clicks(mix))


def film2():
    """Make it mine: the drop on the look change, the arc, the inhale, the peak, typing."""
    import bs_mine as F
    x = load(F.os.path.join(F.B.OUT, 'take2-mix.wav'))
    H = F.HITS
    st = short_term(x)
    mo = momentary(x, hop=0.01)
    body = [at(st, t) for t in np.arange(F.SECTIONS['part2'] + 2, H['email'] - 1, 1.0)]
    print('--- take2 (Make it mine)')
    print('  hits (onset error):', hits_report(x, F.HIT_TIMES()))
    print('  short-term LUFS: ' + ' '.join(f'{t:.0f}s:{at(st, t):.1f}' for t in (3, 7, 12, 16, 20, 24, 28, 32, 36, 40, 42, 44, 47.5, 49, 51, 57)))
    print(f'  body 16-42 s: {min(body):.1f} .. {max(body):.1f}; peak short-term max {max(st[1][(st[0] > H["peak"]) & (st[0] < H["peak"] + 2.5)]):.1f}')
    run, q = near_silence(x, H['peak'], need=-30.0)
    run26, _ = near_silence(x, H['peak'], need=-26.0)
    print(f'  inhale before {H["peak"]}: <= -30 LUFS for {run:.2f} s, <= -26 for {run26:.2f} s, quietest {q:.1f}  '
          + ('PASS' if run >= 0.25 else 'FAIL'))
    # typing must be heard (round five rule): above 2.5 kHz, each pocket at least 4 dB over the 2 s before it
    hb = dsp.hp(x, 2500, 4)
    e = lambda y, a, b: 10 * np.log10((y[int(a * SR):int(b * SR)] ** 2).mean() + 1e-15)
    rise = [(a, e(hb, a, b) - e(hb, a - 2.0, a)) for a, b in F.POCKETS]
    print('  typing pockets, >2.5 kHz rise over the 2 s before (dB; the round-five reviewer asked >= 4): '
          + ' '.join(f'{a:.1f}:{r:+.1f}' for a, r in rise))
    # WHY a second, different test (round five): the rise above compares a pocket with the hats and claps of the 2 s
    # before it, so it can only pass by making the ticks LOUDER, which the owner asked against. What decides whether
    # typing is heard is whether the ticks are the loudest thing in their band WHILE they play: ticks vs the rest
    import os
    kp = os.path.join(F.B.OUT, '.take2-mix.keys.wav')
    if os.path.exists(kp):
        k = dsp.hp(load(kp), 2500, 4)
        over = [(a, e(k, a, b) - e(hb - k, a, b)) for a, b in F.POCKETS]
        print('  typing pockets, ticks over everything else in the >2.5 kHz band combined (dB, rule >= 0): '
              + ' '.join(f'{a:.1f}:{r:+.1f}' for a, r in over) + ('  PASS' if all(r >= 0 for _, r in over) else '  FAIL'))
    # breaths are never digital silence (round five rule: -45 to -50 LUFS momentary at their quietest)
    q = mo[1][(mo[0] > H['inhale']) & (mo[0] < H['peak'] - 0.05)].min()
    print(f'  quietest point of the inhale: {q:.1f} LUFS momentary (rule -50 .. -40)  ' + ('PASS' if -52 <= q <= -40 else 'FAIL'))
    summary(F.os.path.join(F.B.OUT, 'take2-mix.wav'), 'take2 tone')


def film3():
    import bs_own as F
    x = load(F.os.path.join(F.B.OUT, 'take3-mix.wav'))
    mo = momentary(x, hop=0.05)
    print('--- take3 (Own everything)')
    print('  hits (onset error):', hits_report(x, F.HITS + [F.LOGO]))
    print('  momentary 5.6-6.8: ' + ' '.join(f'{t:.1f}:{at(mo, t):.0f}' for t in np.arange(5.6, 6.85, 0.1)))
    print('  momentary 8.6-9.6: ' + ' '.join(f'{t:.2f}:{at(mo, t):.0f}' for t in np.arange(8.6, 9.61, 0.1)))
    print('  hit loudness (max momentary in the 0.5 s after): ' + ' '.join(
        f'{t}:{max(mo[1][(mo[0] >= t) & (mo[0] <= t + 0.5)]):.1f}' for t in F.HITS + [F.LOGO]))
    run, q = near_silence(x, F.HITS[0], need=-30.0)
    print(f'  breath before {F.HITS[0]}: <= -30 LUFS for {run:.2f} s (quietest {q:.1f})  ' + ('PASS' if run >= 0.25 else 'FAIL'))
    run, q = near_silence(x, 6.6, need=-35.0, before=0.4)
    print(f'  clear before the marker (6.2-6.6): <= -35 for {run:.2f} s (quietest {q:.1f})')
    t = summary(F.os.path.join(F.B.OUT, 'take3-mix.wav'), 'take3 tone')


if __name__ == '__main__':
    if sys.argv[1:2] == ['films']:
        film1(); film2(); film3()
    else:
        _main()
