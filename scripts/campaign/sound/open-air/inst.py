"""Open air: the instruments. Each returns a stereo (n, 2) float array starting at the
note's onset. All synthesised; see RULES.md for which instruments the sound allows."""
import numpy as np
from dsp import (SR, secs, mtof, pan2, saw, square, sine, adsr, svf_env, hp, lp, bp,
                 sat, eq)

RNG = np.random.default_rng(2026)


def _rng(seed):
    return np.random.default_rng(seed)


# ------------------------------------------------------------------ glass bell
def glass(m, dur=2.5, vel=1.0, seed=0, bright=1.0):
    """The signature 'glass' tone (a nod to the glass-faced mascot): a few slightly
    inharmonic sine partials that die at different rates, plus a tiny strike transient.
    Left and right are detuned by 1.5 cents so it shimmers without phasing in mono."""
    n = secs(dur)
    t = np.arange(n) / SR
    f = float(mtof(m))
    partials = [(1.0, 1.0, dur * 0.55), (2.0, 0.32, dur * 0.3), (3.003, 0.14 * bright, 0.35),
                (4.17, 0.09 * bright, 0.18), (5.43, 0.05 * bright, 0.09), (0.5, 0.06, dur * 0.4)]
    out = np.zeros((n, 2))
    for ch, cents in ((0, -1.5), (1, 1.5)):
        fc = f * 2 ** (cents / 1200)
        acc = np.zeros(n)
        for r, a, d in partials:
            if fc * r > 18000:
                continue
            acc += a * np.sin(2 * np.pi * fc * r * t + r) * np.exp(-t / d)
        out[:, ch] = acc
    k = secs(0.004)
    tr = _rng(seed + int(m)).standard_normal(k) * np.exp(-np.arange(k) / (0.0008 * SR))
    tr = bp(tr, 2500, 9000)
    out[:k] += 0.25 * bright * tr[:, None]
    att = secs(0.0015)
    out[:att] *= np.linspace(0, 1, att)[:, None]
    rel = secs(0.03)
    out[-rel:] *= np.linspace(1, 0, rel)[:, None]
    return out * vel * 0.5


# ------------------------------------------------------------------ supersaw pad
def pad(notes, dur, attack=1.2, release=1.5, cut0=500, cut1=3200, cut_t=2.0, vel=1.0,
        voices=7, spread=18, seed=1, q=0.8):
    """Wide 'supersaw' pad: 7 detuned band-limited saws per note, spread across the
    stereo field, through a resonant low-pass whose cutoff slowly opens (the
    'sunrise'). Centre voice is shared by both sides so the chord survives mono."""
    rng = _rng(seed)
    n = secs(dur + release)
    t = np.arange(n) / SR
    L = np.zeros(n)
    R = np.zeros(n)
    det = np.linspace(-1, 1, voices)
    for m in notes:
        f = float(mtof(m))
        drift = 1 + 0.0007 * np.sin(2 * np.pi * rng.uniform(0.07, 0.2) * t + rng.uniform(0, 6))
        for i, d in enumerate(det):
            fr = f * 2 ** (d * spread / 1200) * drift
            s = saw(np.full(n, fr) if np.isscalar(fr) else fr, rng.uniform())
            a = 1.0 if i == voices // 2 else 0.7
            if i == voices // 2:
                L += a * s
                R += a * s
            elif i % 2:
                L += a * s * 0.85
                R += a * s * 0.35
            else:
                L += a * s * 0.35
                R += a * s * 0.85
    cut = cut0 + (cut1 - cut0) * (1 - np.exp(-t / max(cut_t, 1e-3) * 3))
    cut *= 1 + 0.08 * np.sin(2 * np.pi * 0.13 * t)
    env = adsr(n, attack, 1.0, 1.0, release, dur)
    out = np.stack([svf_env(L, cut, q), svf_env(R, cut, q)], axis=1)
    out = hp(out, 140)
    norm = 0.08 / (len(notes) * voices) ** 0.5
    return (out.T * env).T * norm * vel


# ------------------------------------------------------------------ arp pluck
def pluck(m, gate=0.12, vel=1.0, bright=1.0, pan=0.0, seed=0, dur=0.6):
    """Short bright pluck for shimmering arpeggios: saw + narrow pulse, filter snaps
    shut after the attack."""
    n = secs(dur)
    f = float(mtof(m))
    fr = np.full(n, f)
    rng = _rng(seed)
    x = 0.6 * saw(fr * 2 ** (4 / 1200), rng.uniform()) + 0.6 * saw(fr * 2 ** (-4 / 1200), rng.uniform()) \
        + 0.35 * square(fr * 2, rng.uniform(), 0.3)
    t = np.arange(n) / SR
    cut = 300 + (2200 + 4500 * bright) * np.exp(-t / 0.07) + 900 * bright
    y = svf_env(x, cut, 1.1)
    env = adsr(n, 0.002, 0.18, 0.15, 0.12, gate)
    return pan2(y * env * vel * 0.22, pan)


# ------------------------------------------------------------------ singing lead
def lead(phrase, tempo_beat, vel=1.0, glide=0.025, bright=1.0, octave=0):
    """Singing lead: two detuned saws + a sine, legato glide between notes, vibrato that
    blooms on held notes, and two vowel ('ah') formant peaks so it sounds sung, not
    buzzed. phrase = [(midi, start_beat, len_beats)]."""
    end = max(s + l for _, s, l in phrase) * tempo_beat + 1.2
    n = secs(end)
    t = np.arange(n) / SR
    pitch = np.zeros(n)
    amp = np.zeros(n)
    vibd = np.zeros(n)
    for j, (m, s, l) in enumerate(phrase):
        a, b = secs(s * tempo_beat), secs((s + l) * tempo_beat)
        pitch[a:] = m + 12 * octave
        seg = np.arange(b - a) / SR
        vibd[a:b] = np.clip((seg - 0.22) / 0.5, 0, 1)
        e = 1 - 0.25 * np.exp(-seg / 0.05)          # small re-articulation per note
        amp[a:b] = np.maximum(amp[a:b], e)
    first = secs(phrase[0][1] * tempo_beat)
    last = secs((phrase[-1][1] + phrase[-1][2]) * tempo_beat)
    pitch[:first] = phrase[0][0] + 12 * octave
    # glide: one-pole smoothing of the pitch curve
    from scipy.signal import lfilter
    c = np.exp(-1 / (glide * SR))
    pitch = lfilter([1 - c], [1, -c], pitch - pitch[0]) + pitch[0]
    vib = 0.16 * vibd * np.sin(2 * np.pi * 5.1 * t)
    f = mtof(pitch + vib)
    x = 0.5 * saw(f * 2 ** (5 / 1200)) + 0.5 * saw(f * 2 ** (-5 / 1200), 0.4) + 0.5 * sine(f)
    # amplitude: attack at first note, sustain, release after last
    env = np.zeros(n)
    env[first:last] = 1
    env = lfilter([1 - np.exp(-1 / (0.025 * SR))], [1, -np.exp(-1 / (0.025 * SR))], env)
    tail = np.arange(n - last) / SR
    env[last:] = env[last - 1] * np.exp(-tail / 0.18)
    env *= np.where(amp > 0, amp, 1)
    body = svf_env(x, 1800 + 1600 * bright + 400 * vibd, 0.75)
    form = 0.9 * svf_env(x, np.full(n, 750.0), 4.0, 1) + 0.6 * svf_env(x, np.full(n, 1180.0), 5.0, 1)
    y = sat((0.7 * body + form) * env * 0.5, 1.6) * 0.3 * vel
    y = hp(y, 180)
    k = secs(0.02)
    y[-k:] *= np.linspace(1, 0, k)
    return pan2(y, 0.0)


# ------------------------------------------------------------------ sub bass
def sub(m, gate, vel=1.0, dur=None):
    """Clean sub: a sine plus a touch of its 2nd harmonic so phones can 'hear' it.
    Always mono (centre) so it never cancels."""
    dur = dur or gate + 0.3
    n = secs(dur)
    f = np.full(n, float(mtof(m)))
    x = sine(f) + 0.12 * sine(2 * f, 0.25)
    env = adsr(n, 0.012, 0.3, 0.9, 0.12, gate)
    y = sat(x * env * vel * 0.5, 1.2) * 0.6
    return pan2(y, 0.0)


# ------------------------------------------------------------------ drums
def kick(vel=1.0, tune=50.0, decay=0.42, click=1.0, seed=0):
    """Deep clean kick: sine with a fast pitch drop, a short noise click, light saturation."""
    n = secs(decay * 2.2)
    t = np.arange(n) / SR
    f = tune + (tune * 3.4) * np.exp(-t / 0.028)
    ph = np.cumsum(f) / SR
    body = np.sin(2 * np.pi * ph) * np.exp(-t / decay)
    k = secs(0.006)
    cl = np.zeros(n)
    cl[:k] = hp(_rng(seed).standard_normal(k), 2500) * np.exp(-np.arange(k) / (0.0012 * SR))
    y = sat(body * 1.2 + 0.25 * click * cl, 1.8) * 0.75 * vel
    a = secs(0.001)
    y[:a] *= np.linspace(0, 1, a)
    y[-secs(0.02):] *= np.linspace(1, 0, secs(0.02))
    return pan2(y, 0.0)


def clap(vel=1.0, seed=0, tone=1.0):
    """Layered clap/snare: three micro-bursts of band-passed noise + a short tonal body."""
    rng = _rng(seed)
    n = secs(0.5)
    t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    env = np.zeros(n)
    for k, off in enumerate((0.0, 0.009, 0.019)):
        a = secs(off)
        env[a:] += np.exp(-(t[a:] - off) / (0.006 if k < 2 else 0.16)) * (0.8 if k < 2 else 1.0)
    x = bp(nz, 900, 5500) * env
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.5 * tone
    y = (x + body) * 0.45 * vel
    y[-secs(0.02):] *= np.linspace(1, 0, secs(0.02))
    st = np.stack([y, y], axis=1)
    return st


HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(vel=1.0, open_=False, pan=0.15, seed=0):
    """Metallic hat: six band-limited square waves at inharmonic ratios (the classic
    analogue recipe), band-passed high, plus a little noise for air."""
    n = secs(0.45 if open_ else 0.12)
    t = np.arange(n) / SR
    x = np.zeros(n)
    rng = _rng(seed)
    for f in HAT_F:
        x += square(np.full(n, f * 1.7), rng.uniform())
    x = 0.6 * x / 6 + 0.5 * rng.standard_normal(n)
    x = hp(bp(x, 6500, 16000), 7000)
    d = 0.16 if open_ else 0.028
    y = x * np.exp(-t / d) * 0.35 * vel
    y[-secs(0.005):] *= np.linspace(1, 0, secs(0.005))
    return pan2(y, pan)


def riser(dur, vel=1.0, seed=0, lo=400, hi=9000):
    """Breath of air rising into a downbeat: noise through a band-pass whose centre
    sweeps up, swelling in level. Ends abruptly *at* the downbeat by design (the hit
    lands on top), with a 4 ms fade so it does not click."""
    rng = _rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    u = t / dur
    nz = np.stack([rng.standard_normal(n), rng.standard_normal(n)], axis=1)
    fc = lo * (hi / lo) ** (u ** 1.5)
    out = np.stack([svf_env(nz[:, c], fc, 1.6, 1) for c in range(2)], axis=1)
    out = (out.T * (u ** 2.2)).T * 0.25 * vel
    k = secs(0.004)
    out[-k:] *= np.linspace(1, 0, k)[:, None]
    out[:k] *= np.linspace(0, 1, k)[:, None]
    return out


def air(dur, vel=1.0, seed=3):
    """Barely-there 'open air' layer: soft noise in the 8-15 kHz band, slowly breathing."""
    rng = _rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    nz = np.stack([rng.standard_normal(n), rng.standard_normal(n)], axis=1)
    x = bp(nz, 8000, 15000)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t)[:, None]
    env = np.minimum(1, t / 1.5)[:, None] * np.minimum(1, (dur - t) / 0.5)[:, None]
    return x * lfo * env * 0.035 * vel


def tick(vel=1.0, seed=0, f=3200.0):
    """Soft key tick: a tiny glass ping (same partial recipe as the glass bell, very
    short) on top of a felt-like click. The same object as the brand's glass, made small."""
    n = secs(0.06)
    t = np.arange(n) / SR
    rng = _rng(seed)
    ping = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.005)
    k = secs(0.003)
    cl = np.zeros(n)
    cl[:k] = bp(rng.standard_normal(k), 1500, 6000) * np.exp(-np.arange(k) / (0.0006 * SR))
    y = (0.35 * ping + 0.6 * cl) * vel * 0.5
    a = secs(0.0007)
    y[:a] *= np.linspace(0, 1, a)
    y[-secs(0.01):] *= np.linspace(1, 0, secs(0.01))
    return pan2(y, 0.0)
