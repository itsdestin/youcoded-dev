"""The "Many hands" instrument set: recorded hands (CC0 samples) plus voices,
claps and low end synthesised here.

Every function returns a dry stereo buffer starting at the note's onset.
"""
import functools
import math

import numpy as np

from dsp import SR, eq, fade, load, pan, pitched, saturate, stereo

# ---------------------------------------------------------------- tuning tables
# Harp: file name -> MIDI note, plus measured tuning error in cents (the
# library is ~10 cents flat; correcting it keeps harp, marimba and synths in tune).
HARP = {"G1_mp": (31, -25), "B1_mf": (35, -16), "D2_mf": (38, -2), "F2_mf": (41, -5),
        "A2_mf": (45, -8), "C3_mf": (48, -1), "E3_mf": (52, -7), "G3_mf": (55, -11),
        "B3_mf": (59, -13), "D4_mf": (62, -13), "F4_mf": (65, -1), "A4_mf": (69, -9),
        "C5_mf": (72, -12), "E5_mf": (76, -11), "G5_mf": (79, -5), "B5_mf": (83, -9),
        "D6_mf": (86, -8), "F6_mf": (89, -6), "A6_mf": (93, -19)}
# Marimba: the library names notes one octave low (its C4 measures as C5).
MARIMBA = {"C2": 48, "G2": 55, "B2": 59, "F3": 65, "C4": 72, "G4": 79, "B4": 83, "F5": 89, "C6": 96}


def _nearest(table, midi):
    best = min(table.items(), key=lambda kv: abs((kv[1][0] if isinstance(kv[1], tuple) else kv[1]) - midi))
    return best


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- plucked and struck
def harp(midi, vel=0.8, dur=None, damp=0.15, bright=0.0):
    """Plucked string. `dur` (s) damps it like a finger on a nylon string."""
    name, (base, cents) = _nearest(HARP, midi)
    semis = round(midi - base - cents / 100, 3)
    keep = (dur + damp + 0.05) if dur else 4.0
    x = pitched(f"harp/{name}.wav", semis, 4.0)[: int(keep * SR)]
    if dur:
        x = fade(x, 0.0005, damp)
    # WHY velocity also darkens: soft plucks are duller on a real string
    cut = 2500 + 7000 * vel ** 1.5 + 3000 * bright
    x = eq(x, ("lp", min(cut, 18000)), ("hp", 60))
    return x * (vel ** 1.4)


def marimba(midi, vel=0.8, dur=None):
    name, base = _nearest(MARIMBA, midi)
    x = pitched(f"marimba/{name}.wav", round(midi - base, 3), 3.0)
    if dur:
        x = fade(x[: int((dur + 0.25) * SR)], 0.0005, 0.25)
    x = eq(x, ("lp", 3000 + 9000 * vel), ("hp", 90))
    return x * vel ** 1.5


# ---------------------------------------------------------------- hands
class Clapper:
    """One person who claps: their hands have a fixed sound, place and habit."""

    def __init__(self, seed, pan_pos=0.0, lag=0.0, sd=0.006):
        r = np.random.default_rng(seed)
        self.seed = seed
        self.fc = r.uniform(950, 2100)      # where the clap's crack sits
        self.cup = r.uniform(420, 820)      # cupped-palm body resonance
        self.q = r.uniform(0.9, 1.8)
        self.decay = r.uniform(0.006, 0.013)
        self.pan = pan_pos
        self.lag = lag                       # some people are always a bit late
        self.sd = sd
        self.loud = r.uniform(0.7, 1.0)

    def clap(self, vel=0.9, key=0):
        # WHY a per-hit seed: every clap differs (no machine-gun repeats), yet a
        # re-render is bit-identical whatever order the pieces are rendered in
        r = np.random.default_rng([self.seed, key, 1])
        n = int(0.16 * SR)
        t = np.arange(n) / SR
        x = np.zeros(n)
        # WHY several micro-bursts: palms meet at more than one point; a single
        # noise burst sounds like a drum machine, three or four sound like hands
        pos = 0.0
        for b in range(r.integers(2, 5)):
            i = int(pos * SR)
            m = n - i
            tau = 0.0012 if b < 2 else self.decay
            x[i:] += r.standard_normal(m) * np.exp(-t[:m] / tau) * r.uniform(0.5, 1.0)
            pos += r.uniform(0.0025, 0.0085)
        x[i:] += r.standard_normal(n - i) * np.exp(-t[: n - i] / self.decay) * 0.6
        y = eq(x[:, None], ("hp", 280), ("bp", self.fc * r.uniform(0.95, 1.05), self.q),
               )[:, 0] * 3.0 + eq(x[:, None], ("peak", self.cup, 4, 8), ("lp", 9000), ("hp", 300))[:, 0] * 0.35
        y = eq(y[:, None], ("hs", 7000, 0.7, 4))[:, 0]
        y = fade(stereo(y), 0.0002, 0.03)
        return pan(y, self.pan) * vel * self.loud / (np.abs(y).max() + 1e-9)

    def when(self, t, key=0):
        return t + self.lag + np.random.default_rng([self.seed, key, 2]).normal(0, self.sd)


@functools.lru_cache(maxsize=None)
def crowd(n, seed=1, spread=0.9):
    """n clappers spread across the stereo field, each with their own timing habit."""
    rng = np.random.default_rng(seed)
    ps = np.linspace(-spread, spread, n) if n > 1 else [0.0]
    return [Clapper(seed * 100 + i, float(p), float(rng.normal(0.004, 0.006)),
                    0.004 + 0.003 * rng.random()) for i, p in enumerate(rng.permutation(ps))]


def snap(vel=0.8, which=0, semis=0.0, p=0.0):
    x = pitched(["spi/perc_snap.flac", "spi/perc_snap2.flac"][which % 2], semis)
    x = eq(x, ("hp", 500), ("peak", 2800, 1.0, 2.0))
    return pan(x, p) * vel


def stomp(vel=0.8, p=0.0, sub=True, seed=0):
    """A foot on a wooden floor: felt-muted bass drum + a synthesised sub thump."""
    names = ["bdrum_muted_mp_1", "bdrum_muted_mp_2", "bdrum_muted_mf_1", "bdrum_muted_ff_1"]
    x = load(f"stomp/{names[seed % 4]}.wav")[: int(0.5 * SR)]
    x = fade(eq(x, ("hp", 45), ("lp", 4000), ("peak", 110, 1.0, 3)), 0.0003, 0.2)
    out = pan(x, p) * 0.8
    if sub:
        n = int(0.32 * SR)
        t = np.arange(n) / SR
        f = 47 + 38 * np.exp(-t / 0.025)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.11) * (1 - np.exp(-t / 0.001))
        out[:n] += fade(stereo(s), 0.0, 0.06) * 0.9
    return out * vel


def kick(vel=0.9, tune=43.65, decay=0.32):
    """Modern 808-style low end, tuned to F1/G1-ish so it sits under the key."""
    n = int((decay * 2.5) * SR)
    t = np.arange(n) / SR
    f = tune + 110 * np.exp(-t / 0.018) + 20 * np.exp(-t / 0.09)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay) * (1 - np.exp(-t / 0.0007))
    s = np.tanh(s * 1.6) / np.tanh(1.6)
    click = np.random.default_rng(3).standard_normal(n) * np.exp(-t / 0.002) * 0.08
    s = s + eq(click[:, None], ("hp", 2000))[:, 0]
    return fade(stereo(s), 0, 0.05) * vel


def handdrum(kind="hand", vel=0.8, i=0, p=0.0, semis=0.0):
    files = {
        "hand": ["EthnicLargeHand_hit_mp_1", "EthnicLargeHand_hit_mp_2", "EthnicLargeHand_hit_mp_3",
                 "EthnicLargeHand_hit_f_1", "EthnicLargeHand_hit_p_1", "EthnicLargeHand_hit_pp_1"],
        "conga": ["ethnicHigh_hit_f_1", "ethnicHigh_hit_mp_1", "ethnicLow_hit_f_1", "ethnicLow_hit_mp_1"],
        "bongo": ["HighBongo1", "HighBongo2", "LowBongo1", "LowBongo2"],
    }[kind]
    folder = {"hand": "handdrum", "conga": "conga", "bongo": "bongo"}[kind]
    x = pitched(f"{folder}/{files[i % len(files)]}.wav", semis, 0.6)
    x = fade(eq(x, ("hp", 70)), 0.0003, 0.15)
    return pan(x, p) * vel


def shaker(vel=0.5, i=0, p=0.0):
    x = load(f"shaker/shake{i % 8 + 1}.wav")
    return pan(eq(x, ("hp", 2500), ("hs", 9000, 0.7, 2)), p) * vel


# ---------------------------------------------------------------- additive engine
BLK = 64


def additive(f0, amp, spectrum, seed=0, fmax=16000):
    """Band-limited additive oscillator.

    f0: per-sample fundamental (Hz); amp: per-sample amplitude;
    spectrum(freqs[K,B], tb[B]) -> gains[K,B] evaluated every BLK samples.
    WHY additive: every partial is below Nyquist by construction, so no aliasing
    (the cheap-synth fizz), and filters/formants are exact per partial.
    """
    n = len(f0)
    rng = np.random.default_rng(seed)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    bi = np.arange(0, n, BLK)
    f0b = f0[bi]
    K = int(fmax / max(f0.min(), 20))
    K = max(1, min(K, 200))
    k = np.arange(1, K + 1)[:, None]
    freqs = k * f0b[None, :]
    g = spectrum(freqs, bi / SR) * (freqs < min(fmax, 0.45 * SR))
    out = np.zeros(n)
    idx = np.arange(n)
    for kk in range(K):
        if g[kk].max() < 1e-5:
            continue
        a = np.interp(idx, bi, g[kk])
        out += a * np.sin((kk + 1) * ph + rng.uniform(0, 2 * np.pi))
    return out * amp


def _reson(f, F, B):
    """Magnitude of a two-pole resonance normalised to 1 at DC (formant filter)."""
    return F * F / np.sqrt((F * F - f * f) ** 2 + (B * f) ** 2)


VOWELS = {  # (F, B) for four formants; a blend of adult voices
    "mm": [(260, 60), (1000, 300), (2300, 250), (3200, 300)],
    "oo": [(320, 60), (820, 90), (2300, 140), (3200, 220)],
    "oh": [(470, 70), (860, 90), (2600, 140), (3300, 220)],
    "ah": [(720, 90), (1150, 110), (2550, 150), (3500, 220)],
}


def voice(midi, dur, vowels=("mm", "oo"), seed=0, vel=0.7, attack=0.18, release=0.35,
          tilt=1.25, breath=0.035):
    """One wordless human voice: hum opening into an 'ooh' (or any vowel path)."""
    rng = np.random.default_rng(seed)
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    # human pitch: small scoop into the note, slow drift, gentle late vibrato
    drift = np.interp(t, np.linspace(0, t[-1] + 1e-9, 12), rng.normal(0, 4, 12))
    vib_on = np.clip((t - 0.35) / 0.6, 0, 1)
    vib = 14 * vib_on * np.sin(2 * np.pi * rng.uniform(4.6, 5.6) * t + rng.uniform(0, 6.28))
    scoop = -35 * np.exp(-t / 0.06)
    cents = drift + vib + scoop + rng.normal(0, 3)
    f0 = mtof(midi) * 2 ** (cents / 1200)
    env = np.minimum(1, t / attack) ** 1.5
    env *= np.where(t < dur, 1.0, np.exp(-(t - dur) / (release / 3)))
    env *= 1 + 0.04 * np.sin(2 * np.pi * rng.uniform(0.2, 0.5) * t)
    path = [VOWELS[v] for v in vowels]
    hum = vowels[0] == "mm"

    def spec(freqs, tb):
        pos = np.clip(tb / max(dur * 0.6, 0.15), 0, 1) * (len(path) - 1)
        lo = np.floor(pos).astype(int)
        hi = np.minimum(lo + 1, len(path) - 1)
        fr = pos - lo
        g = (freqs / freqs[0:1]) ** -tilt
        for j in range(4):
            F = np.array([path[a][j][0] for a in lo]) * (1 - fr) + np.array([path[b][j][0] for b in hi]) * fr
            B = np.array([path[a][j][1] for a in lo]) * (1 - fr) + np.array([path[b][j][1] for b in hi]) * fr
            g = g * _reson(freqs, F[None, :], B[None, :])
        if hum:  # closed lips: highs fall away until the mouth opens
            openness = np.clip(pos, 0, 1)[None, :]
            g = g / (1 + (freqs / (500 + 2500 * openness)) ** 2)
        return g

    y = additive(f0, env, spec, seed=seed, fmax=9000)
    y /= np.abs(y).max() + 1e-9
    # breath: air through the same mouth, mostly heard above 2 kHz
    noise = rng.standard_normal(n)
    air = eq(noise[:, None], ("bp", 2600, 0.7), ("hs", 8000, 0.7, 4))[:, 0] * env
    y = y + air * breath * 6
    return fade(stereo(y), 0.0, 0.06) * vel


def choir(notes, dur, n_each=3, vowels=("mm", "oo"), seed=0, vel=0.6, spread=0.8,
          attack=0.2, release=0.4, stagger=0.06):
    """A group humming together: several voices per note, each a different person."""
    rng = np.random.default_rng(seed)
    total = int((dur + release + stagger * 3 + 0.1) * SR)
    out = np.zeros((total, 2))
    count = len(notes) * n_each
    pans = rng.permutation(np.linspace(-spread, spread, count))
    c = 0
    for m in notes:
        for j in range(n_each):
            off = abs(rng.normal(0, stagger))
            v = voice(m + rng.normal(0, 0.06), dur - off, vowels, seed=seed * 50 + c,
                      vel=vel * rng.uniform(0.75, 1.0), attack=attack * rng.uniform(0.8, 1.3),
                      release=release, tilt=rng.uniform(1.1, 1.45))
            v = pan(v, float(pans[c]))
            i = int(off * SR)
            L = min(len(v), total - i)
            out[i:i + L] += v[:L]
            c += 1
    return out / math.sqrt(count)


# ---------------------------------------------------------------- low end
def bass(midi, dur, vel=0.8, cutoff=700, env_amt=2.5, reso=1.4, sub_mix=0.85, seed=0):
    """Clean modern bass: pure sine sub for weight + a filtered saw for phone speakers."""
    # WHY: short notes stop tight for groove; long held notes let go gently
    rel = 0.02 if dur < 0.6 else 0.15
    n = int((dur + rel * 4) * SR)
    t = np.arange(n) / SR
    f = mtof(midi)
    env = np.minimum(1, t / 0.004) * np.where(t < dur, 1.0, np.exp(-(t - dur) / rel))
    sub = np.sin(2 * np.pi * f * t) * env
    f0 = np.full(n, f)

    def spec(freqs, tb):
        fc = cutoff * (1 + env_amt * np.exp(-tb / 0.09))[None, :]
        lp = 1 / np.sqrt((1 - (freqs / fc) ** 2) ** 2 + (freqs / (fc * reso)) ** 2)
        g = (freqs / freqs[0:1]) ** -1.0 * lp
        g[0] *= 0.3  # the sine carries the fundamental
        return g

    saw = additive(f0, env, spec, seed=seed, fmax=6000)
    y = sub * sub_mix + saw * 0.55
    y = saturate(stereo(y), 1.3)
    return fade(y, 0.001, 0.015 if dur < 0.6 else rel * 2.5) * vel
