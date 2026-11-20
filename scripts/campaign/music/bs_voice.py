"""Narration handling for the scored films: word timings, voice clean-up, and ducking the music under the voice.

WHY its own module: the fairytale score is keyed to the narrator's words (every hit time is read from the words
file by word, never typed in seconds), and the ducking rules are part of the brand's audio rules (music never
competes with a narrator), so they live in one place any narrated piece can reuse."""
import json
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy.signal import lfilter
from scipy.ndimage import minimum_filter1d
import dsp
from dsp import SR, lp, hp, db


# ----------------------------------------------------------------------------- words
def load_words(path):
    w = json.load(open(path))
    return w if isinstance(w, list) else w['words']


def _clean(s):
    return ''.join(ch for ch in s.lower() if ch.isalnum() or ch == "'")


def word(words, text, after=0.0, edge='start'):
    """Time of the first word matching `text` (case/punctuation-insensitive) that starts at or after `after`.
    WHY by word: a re-recorded narration only needs a new words file; nothing in the score moves by hand."""
    key = _clean(text)
    for w_ in words:
        if w_['start'] >= after - 1e-6 and _clean(w_['w']) == key:
            return float(w_[edge])
    raise KeyError(f'word {text!r} after {after}')


# ----------------------------------------------------------------------------- voice clean-up
def de_ess(v, f_lo=5500, thresh_db=-6.0, max_red_db=6.0):
    """Turn the 5.5-10 kHz band down only while it rises close to the whole voice (sibilants)."""
    band = dsp.bp(v, f_lo, 10000, 2)
    eb = np.sqrt(lp(band ** 2, 60, 1).clip(0)) + 1e-9
    ev = np.sqrt(lp(v ** 2, 60, 1).clip(0)) + 1e-9
    red = -np.clip(20 * np.log10(eb / ev) - thresh_db, 0, max_red_db)
    return v - band + band * db(red)


def compress(v, thresh_db=-26.0, ratio=2.5, att=0.008, rel=0.15):
    """Mild RMS compressor so no word of the narration drops under the music."""
    e = lp(v ** 2, 1 / (2 * np.pi * att), 1).clip(1e-12)
    gr = np.minimum(0, (thresh_db - 10 * np.log10(e)) * (1 - 1 / ratio))
    a = np.exp(-1 / (rel * SR))
    return v * db(np.minimum(gr, lfilter([1 - a], [1, -a], gr)))


def process_voice(path, n):
    """Mono narration, cleaned: rumble cut, a touch less chest, a little presence, de-essed, evened. DRY: no
    reverb on the voice (brand audio rule: the narrator is close and clear)."""
    v, sr = sf.read(path, dtype='float64')
    assert sr == SR
    if v.ndim == 2:
        v = v.mean(axis=1)
    v = hp(v, 85, 2)
    v = dsp.peak_eq(v, 250, -1.5, 0.9)
    v = dsp.peak_eq(v, 3200, 1.5, 1.0)
    v = de_ess(v)
    v = dsp.peak_eq(v, 9000, -2.0, 0.8)
    v = compress(v)
    out = np.zeros(n)
    out[:min(n, len(v))] = v[:n]
    return out


# ----------------------------------------------------------------------------- ducking
def phrases(words, gap_merge=0.30, splits=()):
    """Words merged into phrases across gaps < gap_merge, but never across a `splits` time (a section boundary).
    WHY splits: "recently... something" runs on with a 0.07 s gap, yet the music must be near-silent before
    "something" and open up on it, so each side is measured and ducked on its own."""
    ph = []
    for w in words:
        cut = any(ph and ph[-1][1] <= s_ + 0.02 and w['start'] >= s_ - 0.02 for s_ in splits)
        if ph and w['start'] - ph[-1][1] < gap_merge and not cut:
            ph[-1][1] = w['end']
        else:
            ph.append([w['start'], w['end']])
    return ph


def duck(music, voice, words, margin_at, protect=(), att=0.035, rel=0.22, breath_db=6.0, long_gap=1.0,
         carve_db=-4.0, gap_merge=0.30, splits=()):
    """Hold the music at least margin_at(t) LU under the narrator while she speaks; let it breathe between phrases.
      - only ever turns the music DOWN: quiet passages keep their composed quietness (the arc survives);
      - fast attack (35 ms, with 60 ms look-ahead so the dip is in place when a word starts) and a fast release
        (220 ms) so the music breathes between phrases instead of pumping slowly;
      - in a short gap (< long_gap s) the music rises at most breath_db above its ducked level (a breath, not a
        surge); in a long gap it returns fully;
      - a gentle 1-4 kHz carve while she speaks makes room for consonants;
      - protect: (t0, t1) windows where the music is never ducked (a composed wink between two words).
    Returns (ducked music, gain dB per sample, speech mask)."""
    n = len(music)
    ph = phrases(words, gap_merge, splits)
    mk = np.zeros(n)
    for a, b in ph:
        mk[max(0, int((a - 0.06) * SR)):min(n, int((b + 0.08) * SR))] = 1.0
    for a, b in protect:
        mk[int(a * SR):int(b * SR)] = 0.0
    carve = lp(mk, 8, 1)
    music = music * (1 - carve[:, None]) + dsp.peak_eq(music, 2400, carve_db, 0.7) * carve[:, None]
    meter = pyln.Meter(SR, block_size=0.2)
    # per phrase: how much the music must come down so it sits margin under the voice (measured like a meter)
    need = np.zeros(n)
    for a, b in ph:
        i, j = int(a * SR), int(b * SR)
        if j - i < int(0.2 * SR):
            continue
        lv = meter.integrated_loudness(np.stack([voice[i:j]] * 2, -1)) if j - i >= int(0.45 * SR) else \
            meter.integrated_loudness(np.stack([voice[max(0, i - int(0.15 * SR)):j + int(0.15 * SR)]] * 2, -1))
        lm = meter.integrated_loudness(music[i:j])
        d = min(0.0, (lv - margin_at(a)) - lm) if np.isfinite(lm) and np.isfinite(lv) else 0.0
        need[max(0, i - int(0.06 * SR)):min(n, j + int(0.08 * SR))] = np.minimum(
            need[max(0, i - int(0.06 * SR)):min(n, j + int(0.08 * SR))], d)
    # gaps: short ones only breathe; long ones release fully
    want = need.copy()
    for (a0, b0), (a1, b1) in zip(ph, ph[1:]):
        g0, g1 = int((b0 + 0.08) * SR), int((a1 - 0.06) * SR)
        if g1 > g0 and (a1 - b0) < long_gap:
            lvl = min(need[max(0, g0 - 1)], need[min(n - 1, g1 + 1)])
            want[g0:g1] = min(0.0, lvl + breath_db)
    for a, b in protect:
        want[int(a * SR):int(b * SR)] = 0.0
    # look-ahead: each moment takes the deepest dip of the next 60 ms, so the duck is in place as a word starts
    L = int(0.06 * SR)
    mf = minimum_filter1d(want, size=L, mode='nearest')
    want = np.concatenate([mf[L // 2:], np.full(L // 2, mf[-1])])
    a_att, a_rel = np.exp(-1 / (att * 1000)), np.exp(-1 / (rel * 1000))            # per 1 ms step
    g = np.empty(n)
    cur = 0.0
    for i in range(0, n, 48):
        w = want[i]
        cur = a_att * cur + (1 - a_att) * w if w < cur else a_rel * cur + (1 - a_rel) * w
        g[i:i + 48] = cur
    # second pass: re-measure each phrase on the ducked result and correct DOWN only where still too loud
    for _ in range(2):
        pre = music * db(g)[:, None]
        corr = np.zeros(n)
        for a, b in ph:
            i, j = int(a * SR), int(b * SR)
            if j - i < int(0.45 * SR):
                continue
            lv = meter.integrated_loudness(np.stack([voice[i:j]] * 2, -1))
            lm = meter.integrated_loudness(pre[i:j])
            extra = (lv - margin_at(a)) - lm
            if np.isfinite(extra) and extra < 0:
                corr[max(0, i - int(0.06 * SR)):min(n, j + int(0.08 * SR))] = extra
        corr = minimum_filter1d(corr, size=int(0.05 * SR))
        corr = lp(corr, 12.0, 1)
        g = np.minimum(0.0, g + np.minimum(0.0, corr))
    # protected windows: gain forced to 0 dB with 10 ms ramps (WHY: the smoothing above would still be climbing out
    # of the previous word's dip when a composed wink plays in a 0.3 s gap)
    for a, b in protect:
        i, j, r = int(a * SR), int(b * SR), int(0.01 * SR)
        w = np.zeros(n)
        w[i:j] = 1.0
        w[max(0, i - r):i] = np.linspace(0, 1, i - max(0, i - r))
        w[j:j + r] = np.linspace(1, 0, len(w[j:j + r]))
        g = g * (1 - w)
    return music * db(g)[:, None], g, mk


def short_loudness(x, win=0.4, hop=0.05):
    """K-weighted short-term level (dB) every hop, interpolated to every sample (filters run along time per channel)."""
    meter = pyln.Meter(SR)
    xk = x if x.ndim == 2 else np.stack([x, x], -1)
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
    L = 10 * np.log10((cs[hi] - cs[lo]) / np.maximum(1, hi - lo) + 1e-12) - 0.691
    return np.interp(np.arange(len(pw)), centers, L)
