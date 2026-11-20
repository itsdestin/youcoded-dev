"""The instruments of "the music-box machine". Every one is modelled, not sampled.

Small, handmade tones on top:   music_box, kalimba, glass, ratchet, tick
Big, clean modern power below:  kick, bass808, hat, snap, lead, pad
"""
import numpy as np
from dsp import (SR, secs, mtof, exp_decay, attack_ramp, release_tail, saw, square, sine,
                 filt, butter, sweep_lp, soft_sat, pan)

_rng = np.random.default_rng(1234)


def _modal(f0, partials, dur, rng_detune=0.0, seed=None):
    """Sum of decaying sine modes. partials: (ratio, amp, t60). Drops modes above 20 kHz."""
    n = secs(dur)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    y = np.zeros(n)
    for ratio, amp, t60 in partials:
        f = f0 * ratio
        if f > 19500:
            continue
        ph = rng.uniform(0, 2 * np.pi) if seed is not None else 0.0
        y += amp * np.sin(2 * np.pi * f * t + ph) * exp_decay(n, t60)
    return y


# ---------------------------------------------------------------- music box
def music_box(midi, vel=1.0, dur=None, seed=0):
    """A steel comb tine plucked by a pin, in a small wooden box.

    Tine modes follow a clamped bar (1 : 6.27 : 17.55, inharmonic, which is what makes a
    music box sound like a music box rather than a sine), with a faint 2nd/3rd harmonic from
    the box, a second slightly-detuned mode for the slow shimmer, and the pin's scrape.
    """
    f0 = float(mtof(midi))
    k = (880.0 / f0) ** 0.5
    if dur is None:
        dur = min(3.2, 2.6 * k + 0.3)
    partials = [
        (1.0, 1.00, 2.4 * k),
        (1.0016, 0.30, 2.0 * k),   # beating twin: the slow "wobble" of a real comb
        (2.0, 0.06, 0.6 * k),
        (3.0, 0.025, 0.3 * k),
        (6.27, 0.34 * vel, 0.38 * k),
        (6.29, 0.11 * vel, 0.30 * k),
        (17.55, 0.12 * vel, 0.12 * k),
        (34.39, 0.05 * vel, 0.05),
    ]
    y = _modal(f0, partials, dur, seed=seed)
    n = len(y)
    # pin scrape: a 4 ms burst of bright noise
    rng = np.random.default_rng(seed + 99)
    sc = rng.standard_normal(secs(0.006)) * exp_decay(secs(0.006), 0.004)
    sc = butter(sc, "highpass", 5000, 2) * 0.16 * vel
    y[: len(sc)] += sc
    y *= attack_ramp(n, 0.0012)
    y *= release_tail(n, dur - 0.08, 0.08)
    # the wooden box: two soft body resonances, gentle top roll-off
    y = filt(y, "peak", 520, 1.2, 2.5)
    y = filt(y, "peak", 1250, 1.5, 1.5)
    y = filt(y, "lp", 15000, 0.6)
    return y * 0.45 * vel


# ---------------------------------------------------------------- kalimba
def kalimba(midi, vel=1.0, dur=None, seed=0):
    """Thumb piano: warm, fundamental-heavy tine on a hollow box, with a soft knock."""
    f0 = float(mtof(midi))
    k = (440.0 / f0) ** 0.4
    if dur is None:
        dur = 1.8 * k + 0.2
    partials = [
        (1.0, 1.0, 1.5 * k),
        (1.0021, 0.18, 1.2 * k),
        (2.0, 0.04, 0.4),
        (5.82, 0.16 * vel, 0.14),
        (11.6, 0.03 * vel, 0.05),
    ]
    y = _modal(f0, partials, dur, seed=seed)
    n = len(y)
    knock = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * exp_decay(n, 0.05) * 0.35
    rng = np.random.default_rng(seed + 7)
    thumb = butter(rng.standard_normal(secs(0.012)), "lowpass", 2500, 2) * exp_decay(secs(0.012), 0.008) * 0.12
    y += knock
    y[: len(thumb)] += thumb
    y *= attack_ramp(n, 0.002)
    y *= release_tail(n, dur - 0.06, 0.06)
    y = filt(y, "peak", 330, 1.0, 2.0)
    return y * 0.38 * vel


# ---------------------------------------------------------------- glass / bell pluck
def glass(midi, vel=1.0, dur=None, seed=0):
    """A small struck glass bar / bell: free-bar modes 1 : 2.756 : 5.404 : 8.933. Sparkle and air."""
    f0 = float(mtof(midi))
    if dur is None:
        dur = 2.2
    partials = [
        (1.0, 1.0, 1.9),
        (2.756, 0.42, 0.9),
        (5.404, 0.20, 0.45),
        (8.933, 0.14, 0.25),
        (13.34, 0.08, 0.14),
        (18.6, 0.04, 0.08),
    ]
    y = _modal(f0, partials, dur, seed=seed)
    n = len(y)
    y *= attack_ramp(n, 0.0015)
    y *= release_tail(n, dur - 0.1, 0.1)
    return y * 0.22 * vel


# ---------------------------------------------------------------- mechanism
def _click(f_res=(2300, 4100), decay=0.018, bright=1.0, seed=0, amp=1.0):
    """One tooth of a clockwork ratchet: a noise tick exciting two tiny metal modes and a wood knock."""
    n = secs(0.06)
    rng = np.random.default_rng(seed)
    burst = rng.standard_normal(secs(0.0025)) * np.hanning(secs(0.0025))
    exc = np.zeros(n)
    exc[: len(burst)] = burst
    y = np.zeros(n)
    t = np.arange(n) / SR
    for i, f in enumerate(f_res):
        y += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * exp_decay(n, decay * (1.0 - 0.3 * i)) * 0.5
    y = y * attack_ramp(n, 0.0004)
    y += butter(exc, "bandpass", [1500, 9000 * bright], 2) * 0.9
    y += np.sin(2 * np.pi * 950 * t) * exp_decay(n, 0.012) * 0.35  # wood
    y *= release_tail(n, 0.05, 0.01)
    return y * amp


def ratchet(n_clicks=4, span=0.18, accel=0.8, rise=1.0, seed=3, amp=0.22):
    """Winding the key: a run of clicks, speeding up and rising slightly in pitch."""
    gaps = np.array([accel ** i for i in range(n_clicks)])
    gaps = gaps / gaps.sum() * span
    times = np.concatenate([[0], np.cumsum(gaps)[:-1]])
    out = np.zeros(secs(span + 0.08))
    for i, t0 in enumerate(times):
        r = rise ** i
        c = _click((2300 * r, 4100 * r), seed=seed + i, amp=amp * (0.8 + 0.2 * i / max(1, n_clicks - 1)))
        s = secs(t0)
        out[s:s + len(c)] += c[: len(out) - s]
    return out


def tick(high=True, seed=0, amp=0.18):
    """A clock tick / tock for the deadpan sections."""
    if high:
        return _click((3100, 5200), decay=0.012, seed=seed, amp=amp)
    return _click((1900, 3300), decay=0.015, seed=seed, amp=amp * 0.85)


# ---------------------------------------------------------------- drums
def kick(vel=1.0, dur=0.55, seed=0):
    """808-style kick: a sine whose pitch drops 170 -> 48 Hz, with a tiny click on top."""
    n = secs(dur)
    t = np.arange(n) / SR
    f = 48 + 122 * np.exp(-t / 0.028)
    y = sine(f, n) * exp_decay(n, 0.55) * attack_ramp(n, 0.0008)
    rng = np.random.default_rng(seed)
    cl = butter(rng.standard_normal(secs(0.003)), "highpass", 3000, 2) * np.hanning(secs(0.003)) * 0.25
    y[: len(cl)] += cl
    y = soft_sat(y * 1.4, 1.2) / 1.4
    y *= release_tail(n, dur - 0.05, 0.05)
    return y * 0.9 * vel


def bass808(midi, dur, vel=1.0, glide_from=None, floor=0.35, t60=1.6):
    """Long 808 bass: sine sub with a short downward pitch 'boing', warmed by saturation so it
    is audible on phone speakers (harmonics at 2x/3x), then low-passed to stay round."""
    n = secs(dur + 0.12)
    t = np.arange(n) / SR
    f0 = float(mtof(midi))
    f = f0 * (1 + 0.45 * np.exp(-t / 0.035))
    if glide_from is not None:
        fg = float(mtof(glide_from))
        f = f0 + (fg - f0) * np.exp(-t / 0.06)
    y = sine(f, n)
    env = attack_ramp(n, 0.003) * (floor + (1 - floor) * exp_decay(n, t60)) * release_tail(n, dur, 0.1)
    y = y * env
    y = 0.75 * y + 0.25 * soft_sat(y * 3.0, 1.0)
    y = filt(y, "lp", 900, 0.7)
    return y * 0.45 * vel


def hat(vel=1.0, open_=False, seed=0):
    """808 hi-hat: six detuned square oscillators (metallic cluster) band-passed high, plus air noise."""
    dur = 0.32 if open_ else 0.07
    n = secs(dur)
    rng = np.random.default_rng(seed)
    y = np.zeros(n)
    for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
        y += square(f * 1.7, n, rng.uniform())
    y = butter(y, "bandpass", [7000, 12500], 2)
    nz = butter(rng.standard_normal(n), "highpass", 9000, 2)
    y = 0.7 * y / 6 + 0.35 * nz
    y *= exp_decay(n, 0.22 if open_ else 0.035) * attack_ramp(n, 0.0005)
    y *= release_tail(n, dur - 0.01, 0.01)
    return y * 0.45 * vel


def snap(vel=1.0, seed=0):
    """A soft clap/snap: three quick noise flutters into a short room tail."""
    n = secs(0.25)
    rng = np.random.default_rng(seed)
    nz = butter(rng.standard_normal(n), "bandpass", [900, 3800], 2)
    env = np.zeros(n)
    for d in (0.0, 0.009, 0.017):
        s = secs(d)
        env[s:] += exp_decay(n - s, 0.012)
    env += exp_decay(n, 0.11) * 0.45
    y = nz * env * attack_ramp(n, 0.0006) * release_tail(n, 0.23, 0.02)
    return y * 0.45 * vel


# ---------------------------------------------------------------- synths
def lead(midi, dur, vel=1.0, bright=1.0, kind="saw", seed=0):
    """Warm unison lead (stereo): 5 detuned band-limited saws (or squares) through a
    low-pass whose cutoff blooms on each note, plus a quiet sub-octave for body."""
    n = secs(dur + 0.25)
    rng = np.random.default_rng(seed)
    f0 = float(mtof(midi))
    t = np.arange(n) / SR
    vib = 1 + 0.0025 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    detunes = [-14, -6, 0, 7, 15]
    pans = [-0.7, -0.3, 0.0, 0.35, 0.7]
    osc = square if kind == "square" else saw
    out = np.zeros((n, 2))
    env = attack_ramp(n, 0.006) * (0.75 + 0.25 * exp_decay(n, 0.5)) * release_tail(n, dur, 0.22)
    fc = (1400 + 4200 * bright * exp_decay(n, 0.35) + 900 * bright)
    for d, p in zip(detunes, pans):
        v = osc(f0 * 2 ** (d / 1200) * vib, n, rng.uniform())
        v = sweep_lp(v, fc, 0.9)
        out += pan(v * env, p) * (0.28 if d == 0 else 0.2)
    sub = sine(f0 / 2, n) * env * 0.18
    out += pan(sub, 0.0)
    out = soft_sat(out * 1.3, 1.0) / 1.3
    return out * 0.5 * vel


def pad(midis, dur, vel=1.0, attack=0.7, release=1.2, cutoff=1800, seed=0):
    """Soft chord pad (stereo): detuned saws per note, darkened, slow swell."""
    n = secs(dur + release)
    rng = np.random.default_rng(seed)
    out = np.zeros((n, 2))
    env = attack_ramp(n, attack) * release_tail(n, dur, release)
    for i, m in enumerate(midis):
        f = float(mtof(m))
        for d, p in ((-9, -0.95), (0, 0.0), (9, 0.95)):
            v = saw(f * 2 ** (d / 1200), n, rng.uniform())
            out += pan(v, p * (0.6 + 0.4 * (i % 2))) * 0.12
    out[:, 0] = butter(out[:, 0], "lowpass", cutoff, 2)
    out[:, 1] = butter(out[:, 1], "lowpass", cutoff, 2)
    out = filt(out, "hp", 110, 0.7)
    return out * env[:, None] * 0.55 * vel / max(1, len(midis)) ** 0.5
